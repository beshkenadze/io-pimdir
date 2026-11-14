// bun bench/binding-lookups/verify.mjs /path/to/playwright/index.mjs [chrome-executable]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { snapshots } from './snapshots.mjs';
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Pass an installed Playwright module path (install with bun)');
const { chromium } = await import(pathToFileURL(resolve(modulePath)));
const htmlURL = new URL('index.html', import.meta.url);
const html = readFileSync(htmlURL, 'utf8');
assert.ok(html.includes('LICENSE for the sqlite3 WebAssembly/JavaScript APIs.'), 'Runtime license missing');
const embedded = JSON.parse(html.match(/<script id="snapshots" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.deepEqual(embedded, snapshots(), 'Rebuild the page: embedded SQL differs from source');
for (const [file, original] of [['schema.sql','spec/migrations/storage/0001_init.sql'],
  ['init.sql','spec/queries/storage/owner/init_store_meta.sql'],
  ['origin.sql','spec/queries/storage/owner/origin_for_link.sql'],
  ['destination.sql','spec/queries/storage/owner/destination_for_link.sql']]) {
  const p = Bun.spawnSync(['git','show','8907303:' + original], {cwd:fileURLToPath(new URL('../../', import.meta.url))});
  assert.equal(p.exitCode, 0);
  assert.equal(readFileSync(new URL('fixtures/old/' + file, import.meta.url), 'utf8'), p.stdout.toString());
}
const browser = await chromium.launch({headless:true,
  ...(process.argv[3] ? {executablePath:resolve(process.argv[3])} : {})});
try {
  const context = await browser.newContext({offline:true});
  const page = await context.newPage();
  const requests = [], errors = [];
  context.on('request', r => requests.push(r.url()));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(htmlURL.href);
  assert.equal(await page.evaluate(() => window.benchState), 'ready');
  async function run(sizes, collections, pending) {
    for (const [id,value] of Object.entries({size1:sizes[0],size2:sizes[1],size3:sizes[2],collections,pending}))
      await page.locator('#' + id).fill(String(value));
    await page.click('#run');
    await page.waitForFunction(() => ['done','error'].includes(window.benchState), null, {timeout:180000});
    assert.equal(await page.evaluate(() => window.benchState), 'done', await page.locator('#status').textContent());
    const results = await page.evaluate(() => window.benchResults);
    assert.equal(results.length, 12);
    assert.equal(await page.locator('#results tr').count(), 12);
    for (const r of results) {
      assert.equal(r.collections, collections); assert.equal(r.pending, pending);
      assert.ok(Number.isFinite(r.ms) && r.ms >= 0);
      assert.ok(Number.isFinite(r.batchMs) && r.batchMs >= 0);
      if (r.version === 'current') {
        assert.ok(r.steps < 250, `${r.query}: ${r.steps} VM steps`);
        assert.equal(r.scans, 0);
        assert.ok(r.plan.some(p => p.includes('items_by_link')));
        assert.ok(r.plan.some(p => p.includes('item=? AND source=?')));
      } else {
        assert.equal(r.scans, r.size + 2 * pending - 1);
        assert.ok(r.plan.includes('SCAN bindings'));
      }
    }
    for (const query of ['origin','destination']) {
      const rows = results.filter(r => r.version === 'old' && r.query === query);
      assert.equal(rows[2].steps - rows[0].steps, (query === 'origin' ? 11 : 6) * (sizes[2] - sizes[0]));
    }
    return results;
  }
  const results = await run([1000,10000,200000], 8, 32);
  await run([101,1001,10001], 3, 7);
  // A new run must remain cancellable and leave the controls reusable.
  await page.click('#run'); await page.click('#cancel');
  assert.equal(await page.evaluate(() => window.benchState), 'cancelled');
  assert.equal(await page.locator('#run').isEnabled(), true);
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith('file:') || url.startsWith('blob:')), 'External request attempted');
  console.log(JSON.stringify({browser:browser.version(), offline:true, externalRequests:0,
    passed:['embedded SQL matches real migrations and queries','old fixtures match 8907303',
      'three sizes including 200k','old linear VM growth','current bounded VM steps and no scans',
      'custom collections and pending identities','cancel and restart'], results}, null, 2));
} finally { await browser.close(); }
