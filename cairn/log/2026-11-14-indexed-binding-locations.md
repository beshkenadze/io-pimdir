---
cairn: log
change: indexed-binding-locations
date: 2026-11-14
---

# Seek binding locations by identity

Origin lookup previously compared each binding's key and a concatenation of
that key against the requested identity. Destination lookup likewise lacked a
leading binding-key index. Repeated placement projection therefore scanned
unrelated bindings for every pending create or removal.

The queries now derive at most two candidate keys from the request, seek the
existing items_by_link index, then seek each source binding by its primary key.
No schema migration or additional index is needed. Origin reconstruction uses
byte lengths and validates the complete minted form, preserving opaque keys,
Unicode, embedded separators and NULs. Source/collection/base/body filters,
exact/bare preference and retained-origin eligibility are unchanged.

A deterministic regression queries canonical stores with 1,000, 10,000 and
50,000 unrelated bindings and bounds SQLite VM steps. The former origin query
used 11,049 / 110,049 / 550,049 steps; destination used 6,053 / 60,053 / 300,053.
The new queries use a constant number of steps, below the 5,000-step bound.
Additional tests cover minted-key ordering, body matching, current-collection
exclusion, source filtering and retained origins. Existing tests are unchanged.

Validation: the default crate suite completed with 606 passed and zero failed.
After making minted-key reconstruction byte-safe for embedded NULs, the two
focused lookup tests passed again. Final VM steps are 141 for origin and 127
for destination at each of the three sizes. No existing test was changed.
