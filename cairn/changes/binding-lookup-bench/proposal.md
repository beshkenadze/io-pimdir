---
cairn: change
id: binding-lookup-bench
status: landed
created: 2026-11-14
---

# Measure binding location lookups

## Why

The old binding location queries scanned unrelated bindings per pending link.
The latest schema and queries need measurement before deciding whether a fix remains necessary.

## What

Measure both location queries on the real old and current storage migrations,
including plans, SQLite VM steps and elapsed time. Inspect the full load callers.
Add a small, synthetic-only, offline browser benchmark with inline SQLite WASM,
both SQL snapshots, selectable store sizes and a reproducible measurement runner.
Change current queries only if measurements show growth in unrelated bindings;
then preserve their results and add a VM-step regression bound.
No query change is planned if latest already uses bounded indexed lookups.
