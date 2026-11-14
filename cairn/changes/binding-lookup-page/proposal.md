---
cairn: change
id: binding-lookup-page
status: landed
created: 2026-11-14
---

# Make the binding lookup page explain the bug

A first-time reader of `bench/binding-lookups/index.html` saw tables of numbers
and query plans with no statement of the bug, no obvious action and no picture.
Keep the measurement and change what the reader sees: the bug in plain words,
one Run button with default sizes, a chart of work per lookup against store
size, a verdict computed from the numbers, a folder read-time estimate, and the
raw tables, plans and SQL folded into Details.
