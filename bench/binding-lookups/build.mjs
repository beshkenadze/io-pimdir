// bun bench/binding-lookups/build.mjs /path/to/extracted/package/dist
// Rebuilding needs Bun and the pinned distribution; opening index.html needs neither.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshots } from './snapshots.mjs';
const dir = process.argv[2];
if (!dir) throw new Error('Pass the extracted @sqlite.org/sqlite-wasm package dist directory');
const base = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(dir, 'index.mjs');
const runtimeSource = readFileSync(runtime, 'utf8');
const wasm = readFileSync(resolve(dir, 'sqlite3.wasm'));
const expected = {
  runtime: '0dcdd860e6ec672623b13b8b8e41bb6c78be7a5df80ec553fc4f69160161c8af',
  wasm: 'b8a92a19f441a90ff2339fe988fbe317c4adf3ed844096f12aee04aa72d58257',
};
for (const [name, bytes] of [['runtime', readFileSync(runtime)], ['wasm', wasm]]) {
  if (createHash('sha256').update(bytes).digest('hex') !== expected[name])
    throw new Error(`Unexpected ${name}: use @sqlite.org/sqlite-wasm 3.54.1-build1`);
}
// A classic Blob worker opens from file://. Its WASM is supplied as bytes;
// the distribution's module-relative fallback URL is never fetched.
const bundle = await Bun.build({entrypoints:['inline-sqlite'], target:'browser', format:'iife',
  define:{'import.meta.url':JSON.stringify('file:///inline-sqlite.mjs')},
  minify:true, write:false, plugins:[{name:'inline-sqlite', setup(build) {
    build.onResolve({filter:/^inline-sqlite$/}, () => ({path:'entry', namespace:'inline'}));
    build.onLoad({filter:/.*/, namespace:'inline'}, () => ({
      contents:`import init from ${JSON.stringify(runtime)}; globalThis.BindingSQLite = {default:init};`,
      loader:'js', resolveDir:dirname(runtime),
    }));
  }}]});
if (!bundle.success) throw new AggregateError(bundle.logs, 'SQLite bundle failed');
const replacements = {
  SNAPSHOTS: JSON.stringify(snapshots()).replaceAll('<', '\\u003c'),
  // Keep the distribution's license and build-provenance notices explicitly;
  // bundler minification may remove comments even when marked @preserve.
  RUNTIME: (runtimeSource.match(/\/\* @preserve[\s\S]*?\*\//g).slice(0,2).join('\n')
    + '\n' + await bundle.outputs[0].text()).replaceAll('</script', '<\\/script'),
  CORE: readFileSync(resolve(base, 'core.js'), 'utf8'),
  WASM: wasm.toString('base64'),
};
let page = readFileSync(resolve(base, 'page.html'), 'utf8');
for (const [key, value] of Object.entries(replacements)) page = page.replace(`@@${key}@@`, () => value);
await Bun.write(resolve(base, 'index.html'), page);
console.log('Built bench/binding-lookups/index.html (' + Buffer.byteLength(page) + ' bytes)');
