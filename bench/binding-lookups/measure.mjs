// bun bench/binding-lookups/measure.mjs /path/to/extracted/package/dist
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { snapshots } from './snapshots.mjs';
import './core.js';
const dir = process.argv[2];
if (!dir) throw new Error('Pass the extracted @sqlite.org/sqlite-wasm package dist directory');
const { default: init } = await import(pathToFileURL(resolve(dir, 'node.mjs')));
const sqlite = await init();
const results = [];
for (const size of [1000, 10000, 50000, 200000]) {
  for (const snapshot of snapshots()) {
    results.push(...BindingBench.run(sqlite, snapshot, size, 8, 32));
  }
}
console.log(JSON.stringify({ sqlite: sqlite.capi.sqlite3_libversion(), repetitions: 31,
  timing: 'median warm in-memory milliseconds, excluding prepare and bind', results }, null, 2));
