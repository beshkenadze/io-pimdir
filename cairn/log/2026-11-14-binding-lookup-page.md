---
cairn: log
change: binding-lookup-page
landed: 2026-11-14
---

# Make the binding lookup page explain the bug

The page now opens with the bug in plain words and a single Run button that
measures 1k / 10k / 50k / 200k bindings by default; other sizes are folded
away. The main result is a chart of SQLite steps per lookup against store
size, old rising in a straight line and current flat, followed by a verdict
sentence computed from the results and a calculator that estimates a folder's
lookup time from pending messages and store size. A progress bar and status
line track the run. Tables, plans and SQL moved into Details. The measuring
code in core.js is unchanged. verify.mjs runs the defaults with one click,
then custom sizes, and checks the chart, verdict and estimate.
Capability moved: store (binding lookup benchmark requirement).
