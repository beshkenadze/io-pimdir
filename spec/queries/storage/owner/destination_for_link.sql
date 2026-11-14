-- Seek a pending create of the identity or the minted copy in other
-- collections, bare first. items_by_link finds the candidate placements;
-- the binding primary key then seeks only this source's binding there.
WITH hints(link_id) AS (
    SELECT :link_id
    UNION
    SELECT 'dup:' || :link_id || '#' || char(1) || :link_id
)
SELECT b.collection, b.handle
FROM hints h
JOIN items i INDEXED BY items_by_link ON i.link_id = h.link_id
JOIN bindings b ON b.collection = i.collection AND b.link_id = i.link_id
WHERE b.source = :source AND b.collection != :collection AND b.base_present = 0
ORDER BY b.link_id != :link_id, b.collection LIMIT 1;
