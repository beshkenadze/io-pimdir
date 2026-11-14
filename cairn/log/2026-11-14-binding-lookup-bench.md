---
cairn: log
change: binding-lookup-bench
landed: 2026-11-14
---

# Measure binding location lookups

The intent was approved before implementation. Measured the old `8907303`
and current upstream `73e2aea` statements against their complete migrations
and initialization SQL, using SQLite WASM 3.54.1, the version bundled by the
locked libsqlite3-sys 0.39.1. At 1k / 10k / 50k / 200k unrelated bindings,
current origin costs 92 VM steps and destination 82, with no full-scan steps.
Both seek items_by_link and then the binding primary key. The old origin
costs 11,733 / 110,733 / 550,733 / 2,200,733 steps; old destination costs
6,425 / 60,425 / 300,425 / 1,200,425. Measurements use eight synthetic
collections and 32 synthetic pending identity pairs, 64 extra bindings.
The table, wall times, methodology and full plans are in
bench/binding-lookups/README.md and measurements.json.

No production query or schema changes were needed. The full load still
looks up origin per Created/Tombstone and destination per Tombstone;
inspection found no other per-pending-link SQL scan in that path.

Added a single offline HTML stand with inline WASM and both SQL snapshots,
a readable template, shared data builder, build and measurement runners,
and headless verification. The Cargo package excludes bench/ so this
artifact does not enlarge the distributed crate.

Verification: the page ran from file:// in offline headless Chrome, including
200k bindings, custom collection/pending counts, result and VM-step checks,
source fixture checks, cancellation and zero external requests. The existing
item_bindings (3) and roundtrip (16) tests passed on the designated remote
Cargo host, after its load/disk gate. No Cargo ran locally.

Moved: store (ADDED: "Binding lookup performance is reproducible offline").
