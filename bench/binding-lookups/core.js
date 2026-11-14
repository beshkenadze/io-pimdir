/* Shared by the local page and the measurement runner. Synthetic data only. */
globalThis.BindingBench = (() => {
  const hash = 'a'.repeat(52);
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const minted = key => 'dup:' + key + '#\x01' + key;

  // A pair per pending identity: one real origin and one pending destination.
  // Noise has unrelated identities, the same source, and alternating base gates.
  function seedSQL(snapshot, bindings, collections, pending) {
    const current = snapshot.name === 'current';
    const itemColumn = current ? 'item' : 'link_id';
    const itemValue = current ? 'i.id' : 'i.link_id';
    return `
      PRAGMA foreign_keys = ON;
      BEGIN;
      WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x+1<${collections})
      INSERT INTO collections(id,kind,name) SELECT 'c'||x,'message/rfc822','Synthetic '||x FROM n;
      INSERT INTO sources(collection,source) SELECT id,'source' FROM collections;
      INSERT INTO objects(hash,size,refcount) VALUES('${hash}',0,0);
      WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<${bindings})
      INSERT INTO items(collection,link_id,seq,level)
        SELECT 'c'||(x%${collections}), 'noise-'||x, x, 1 FROM n;
      INSERT INTO bindings(${itemColumn},collection,source,handle,base_present,base_object)
        SELECT ${itemValue},i.collection,'source','h-'||i.seq,i.seq%2,
               CASE WHEN i.seq%2=1 THEN '${hash}' END FROM items i;
      WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x+1<${pending})
      INSERT INTO items(collection,link_id,seq,level,object_hash,deleted)
        SELECT 'c0','key-'||x,${bindings}+x+1,2,'${hash}',1 FROM n;
      INSERT INTO bindings(${itemColumn},collection,source,handle,base_present,base_object)
        SELECT ${itemValue},'c0','source','real-'||i.seq,1,'${hash}' FROM items i WHERE i.collection='c0' AND i.link_id LIKE 'key-%';
      WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x+1<${pending})
      INSERT INTO items(collection,link_id,seq,level,object_hash)
        SELECT 'c1','key-'||x,${bindings}+x+1,2,'${hash}' FROM n;
      INSERT INTO bindings(${itemColumn},collection,source,handle,base_present)
        SELECT ${itemValue},'c1','source',char(1)||i.link_id,0 FROM items i WHERE i.collection='c1' AND i.link_id LIKE 'key-%';
      UPDATE objects SET refcount = (SELECT count(*) FROM items WHERE object_hash = objects.hash)
                                 + (SELECT count(*) FROM bindings WHERE base_object = objects.hash);
      UPDATE store_meta SET next_seq = ${bindings}+${pending}+1;
      COMMIT;
    `;
  }

  function store(sqlite, snapshot, bindings, collections, pending) {
    const db = new sqlite.oo1.DB(':memory:');
    try {
      db.exec(snapshot.schema);
      db.exec({sql: snapshot.init, bind: snapshot.name === 'old'
        ? {':version': 1, ':hash_algo': 'blake3'}
        : {':version': 1, ':derivation': 1}});
      db.exec(seedSQL(snapshot, bindings, collections, pending));
      if (db.selectValue('SELECT count(*) FROM bindings') !== bindings + 2 * pending)
        throw new Error('Unexpected synthetic binding count');
      if (db.selectArrays('PRAGMA foreign_key_check').length)
        throw new Error('Synthetic foreign key violation');
      return db;
    } catch (error) { db.close(); throw error; }
  }

  function parameters(snapshot, query, key = 'key-0') {
    const p = { ':link_id': key, ':source': 'source', ':collection': query === 'origin' ? 'c1' : 'c0' };
    if (query === 'origin') p[snapshot.name === 'old' ? ':object' : ':hash'] = hash;
    return p;
  }

  function measure(sqlite, db, sql, params, repetitions = 31) {
    const capi = sqlite.capi;
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      // Warm up outside the timer; preparation and binding are excluded.
      while (stmt.step()) {}
      stmt.reset();
      const times = [];
      let steps, scans, result;
      for (let r = 0; r < repetitions; r++) {
        capi.sqlite3_stmt_status(stmt.pointer, capi.SQLITE_STMTSTATUS_VM_STEP, 1);
        capi.sqlite3_stmt_status(stmt.pointer, capi.SQLITE_STMTSTATUS_FULLSCAN_STEP, 1);
        const rows = [];
        const start = performance.now();
        while (stmt.step()) rows.push(stmt.get([]));
        times.push(performance.now() - start);
        steps = capi.sqlite3_stmt_status(stmt.pointer, capi.SQLITE_STMTSTATUS_VM_STEP, 0);
        scans = capi.sqlite3_stmt_status(stmt.pointer, capi.SQLITE_STMTSTATUS_FULLSCAN_STEP, 0);
        result = rows;
        stmt.reset();
      }
      times.sort((a,b) => a-b);
      const plan = db.selectArrays('EXPLAIN QUERY PLAN ' + sql, params).map(row => row[3]);
      return { ms: times[Math.floor(times.length / 2)], steps, scans, result, plan };
    } finally { stmt.finalize(); }
  }

  function run(sqlite, snapshot, size, collections, pending, repetitions = 31) {
    const db = store(sqlite, snapshot, size, collections, pending);
    try {
      return ['origin', 'destination'].map(query => {
        const measured = measure(sqlite, db, snapshot[query], parameters(snapshot, query), repetitions);
        const expected = query === 'origin' ? [['c0', 'real-' + (size+1)]] : [['c1', '\x01key-0']];
        if (JSON.stringify(measured.result) !== JSON.stringify(expected))
          throw new Error(`${snapshot.name}/${query}: wrong result ${JSON.stringify(measured.result)}`);
        const stmt = db.prepare(snapshot[query]);
        let batchMs;
        try {
          const start = performance.now();
          for (let n = 0; n < pending; n++) {
            stmt.bind(parameters(snapshot, query, 'key-' + n));
            let count = 0;
            while (stmt.step()) count++;
            if (count !== 1) throw new Error('Pending lookup did not resolve');
            stmt.reset();
          }
          batchMs = performance.now() - start;
        } finally { stmt.finalize(); }
        return { version: snapshot.name, query, size, collections, pending, batchMs, ...measured };
      });
    } finally { db.close(); }
  }
  return { hash, quote, minted, seedSQL, store, parameters, measure, run };
})();
