-- Origin matching includes the assigned key and, for a minted copy, the
-- exact identity it was minted over. Invert the minted form on the parameter,
-- never on every binding row. Halving its length also handles a bare identity
-- containing the separator; validate the entire reconstruction before use.
WITH request(hint) AS (
    -- Byte lengths preserve opaque identities containing NUL as well as UTF-8.
    SELECT CAST(substr(CAST(:link_id AS BLOB), 5,
                       (length(CAST(:link_id AS BLOB)) - 6) / 2) AS TEXT)
), hints(link_id) AS (
    SELECT :link_id
    UNION
    SELECT hint FROM request
    WHERE :link_id = 'dup:' || hint || '#' || char(1) || hint
)
SELECT b.collection, b.handle
FROM hints h
JOIN items i INDEXED BY items_by_link ON i.link_id = h.link_id
JOIN bindings b ON b.collection = i.collection AND b.link_id = i.link_id
WHERE b.source = :source AND b.collection != :collection AND b.base_present = 1
  AND (:object IS NULL OR b.base_object = :object)
ORDER BY b.link_id != :link_id, b.collection LIMIT 1;
