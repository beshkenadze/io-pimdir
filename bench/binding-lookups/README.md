# Binding lookup benchmark

The whole-table binding scan is **gone at latest**, measured at upstream
`73e2aea` (v0.12.0). No production query change is needed or included.

Double-click `index.html`, or open it from the browser's file menu. It is a
single self-contained page: SQLite WASM, its JavaScript runtime, both complete
storage migrations and initialization statements, and both pairs of queries
are inline. Opening it needs no server, network, Bun, or installed SQLite.
Choose three unrelated-binding sizes, collection count, and pending identity
count, then press **Run three sizes**. **Cancel** terminates its worker and
releases the in-memory stores.

## Measurement

`measurements.json` records the full results and `EXPLAIN QUERY PLAN` output.
The runner used SQLite WASM 3.54.1 under Bun 1.4.0. This is the same SQLite
version and source id as the amalgamation bundled in the locked
`libsqlite3-sys` 0.39.1 (its WASM and native build configurations differ).
Times below are median wall milliseconds over 31 warm executions, excluding
preparation, parameter binding, data creation and migration. They include row
conversion across the JavaScript/WASM boundary. They are a synthetic lookup
microbenchmark, not a native full-placement-read timing.

There are eight collections and 32 synthetic pending identities. Each adds a
tombstone with a settled source binding in c0 and a pending create in c1, so
**total bindings = unrelated bindings + 64**. Noise has unique unrelated
identities, shares the queried source, spreads across the collections, and
alternates base-present and base-absent. Each query resolves `key-0`; the page
also times one lookup for every pending identity. Foreign keys, constraints,
indexes and triggers remain enabled; no `ANALYZE`, hints, or schema changes
are applied. Results and foreign keys are checked, and the object refcount
matches the synthetic references.

| Unrelated bindings | Old origin steps / ms | Current origin steps / ms | Old destination steps / ms | Current destination steps / ms |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 11,733 / 0.2968 | 92 / 0.0090 | 6,425 / 0.1142 | 82 / 0.0072 |
| 10,000 | 110,733 / 1.2900 | 92 / 0.0068 | 60,425 / 0.6507 | 82 / 0.0067 |
| 50,000 | 550,733 / 6.8855 | 92 / 0.0059 | 300,425 / 3.5097 | 82 / 0.0065 |
| 200,000 | 2,200,733 / 27.5330 | 92 / 0.0063 | 1,200,425 / 13.6670 | 82 / 0.0089 |

Old plans, all four sizes and both statements:

```text
SCAN bindings
USE TEMP B-TREE FOR ORDER BY
```

Current plans, all four sizes and both statements:

```text
SEARCH i USING COVERING INDEX items_by_link (link_id=?)
SEARCH b USING INDEX sqlite_autoindex_bindings_1 (item=? AND source=?)
USE TEMP B-TREE FOR ORDER BY
```

Current origin stays at **92 VM steps**, destination at **82**, and both at
**zero full-scan steps**. The old queries walk every synthetic binding:
1,063 / 10,063 / 50,063 / 200,063 full-scan steps. Current's small ordering
sort is over the identity candidates, not unrelated bindings. More placements
of the *same* identity can still increase the work; this experiment holds
those fixed while unrelated bindings grow. A browser may display zero time
when a lookup is below its clock precision; the counters remain exact.

## Full placement read callers

At `73e2aea`, `PimdirSourceStore::load` in `src/client/write.rs` calls
`read_hub` once, then `PimdirHub::project_with` in `src/hub.rs`. Projection calls
`origin_for` once per Created **or Tombstone** placement. The subsequent loop
calls `destination_for` once per Tombstone and replaces that placement's
origin. Thus C Created and T Tombstone placements still cost C+T origin
lookups and T destination lookups. Their unrelated-table scan is gone, even
though the per-link calls remain.

No other per-link SQL executes in the full (`All`) load path: `read_hub` reads
items, bindings, summaries, addresses and kind-specific lists in batches;
checkpoint, round, superseded pending and superseded binding reads run once
per load. Decoding and summary attachment do not query the database.
`load_bindings` has a correlated base-flag subquery per returned binding, but
it seeks `binding_base_flag`'s `(item, source, flag)` primary key. The full
load may read collection-wide data and supersessions; those are not repeated
once per pending link. The handle-resolution loop belongs to scoped loads,
not `All`. This inspection makes no claim about unrelated load costs.

## Sources and rebuilding

`fixtures/old/` holds unmodified SQL from `8907303`. `snapshots.mjs` reads the
current SQL directly from `spec/` when building or measuring. The generated
page intentionally holds both schemas. `verify.mjs` checks both the embedded
current SQL and the old fixtures against their sources. `core.js` contains
the shared synthetic store builder, timings and counters; `page.html` is the
readable page template. `index.html` is generated and committed.

The runtime is pinned to `@sqlite.org/sqlite-wasm` **3.54.1-build1**, downloaded
from the public registry. Its tarball SHA-256 is
`06aaad2dd0b58a46631000a31a4469afff4abeffbc383f37372b6590396d9bbd`.
`build.mjs` also verifies SHA-256 of the runtime and WASM before bundling.
Rebuilding needs a network only to obtain that distribution; opening the
result never does. No framework or application dependency is added.
The generated page is excluded from the published Cargo package with `bench/`.

From the repository root:

```sh
bench_tools=$(mktemp -d)
curl -fsSL https://registry.npmjs.org/@sqlite.org/sqlite-wasm/-/sqlite-wasm-3.54.1-build1.tgz -o "$bench_tools/sqlite-wasm.tgz"
# Check the tarball digest above before extracting.
shasum -a 256 "$bench_tools/sqlite-wasm.tgz"
tar -xzf "$bench_tools/sqlite-wasm.tgz" -C "$bench_tools"
bun bench/binding-lookups/build.mjs "$bench_tools/package/dist"
bun bench/binding-lookups/measure.mjs "$bench_tools/package/dist" > measurements.txt
```

Bun's bundler version affects generated runtime formatting; the checked-in
page was built with Bun 1.4.0. The dependency's own license notices are
preserved inline; SQLite is public domain and the Emscripten glue is covered
by the MIT and University of Illinois/NCSA licenses named in those notices.
See [the SQLite JavaScript license notice](https://sqlite.org/wasm/doc/trunk/jswasm/sqlite3.js).

## Verification

The committed page was opened as `file://` in headless Chrome 157 with
Playwright 1.58.2 and the browser context offline. It passed:

- Embedded SQL equals source; old fixtures equal `8907303` byte for byte.
- Three sizes including 200k, with correct lookup results.
- Old VM-step growth is exactly 11 per unrelated binding for origin and 6 for destination.
- Current lookups stay below 250 VM steps with zero full-scan steps and indexed plans.
- Custom collection and pending counts, repeat runs, and cancellation work.
- No external network request or page error occurs.

To repeat, install tooling outside the repository with Bun. Use a downloaded
Playwright browser or pass an existing Chrome executable as the last argument:

```sh
bun add --cwd "$bench_tools" playwright@1.58.2
bun "$bench_tools/node_modules/playwright/cli.js" install chromium
bun bench/binding-lookups/verify.mjs "$bench_tools/node_modules/playwright/index.mjs"
# Optional final argument: an existing Chrome executable.
trash "$bench_tools"
```

The crate's existing `item_bindings` (3 tests) and `roundtrip` (16 tests)
suites passed using `cargo test --locked --test roundtrip --test item_bindings`
on the designated remote Cargo host after the required load and disk check.
No Cargo command ran locally. No Rust or production SQL was changed.
