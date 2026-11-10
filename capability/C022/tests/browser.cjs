'use strict';

// Test tooling, not production code: observes the real page in a real isolated headless Edge through the shared loopback helper. The helper
// permits only GET and HEAD to the exact origin, so every probe of the page (all GET) is observed live; every POST, PUT and DELETE is proven
// with real loopback sockets in the Node suites. Take a heavy slot first (RUN\scripts\heavy-slot.ps1); CAPTURE_BROWSER_EVIDENCE stays unset
// and nothing is written. Usage: node capability\C022\tests\browser.cjs
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openOwnedLoopback } = require('./browser-owned.cjs');
const { qualifyEdge } = require(path.join(repositoryRoot, 'testing', 'browser', 'qualify', 'qualify.cjs'));
const { startApp } = require('./helpers.cjs');

const TIMEOUT_CODES = ['SIGNATURE_TIMEOUT', 'VERSION_TIMEOUT', 'SHA256_TIMEOUT'];
const checked = (name, observed) => console.log(`PASS ${name}: ${JSON.stringify(observed)}`);

// The shared qualifyEdge() asks PowerShell for the signature and the version; on a busy machine those queries time out. A typed timeout
// is retried ONCE, nothing else is (a bad signature or an unqualified major is final).
async function qualified() {
  let edge = await qualifyEdge();
  let attempts = 1;
  if (!edge.ok && edge.reasons.length > 0 && edge.reasons.every((reason) => TIMEOUT_CODES.some((code) => String(reason).startsWith(`${code}:`)))) {
    console.log(`qualifyEdge timed out (${Math.round(os.freemem() / 1048576)} MB free); retrying once`);
    edge = await qualifyEdge();
    attempts = 2;
  }
  return { edge, attempts };
}

async function observe(page) {
  await page.waitForFunction(() => /^(Isolation holds|Not verified|Paste a well-formed)/.test(document.getElementById('status').textContent));
  return {
    status: await page.textContent('#status'), facts: await page.textContent('#facts'),
    rows: await page.$$eval('#rows tr', (trs) => trs.map((tr) => [...tr.children].map((td) => ({ text: td.textContent, className: td.className }))))
  };
}

async function main() {
  const { edge, attempts } = await qualified();
  assert.equal(edge.ok, true, `${edge.reasons.join(' | ')} (${attempts} attempt(s); take a quiet heavy slot)`);
  checked('the installed Edge is Microsoft-signed and its major is qualified', { version: edge.version, major: edge.major, signature: edge.signature.status, publisher: edge.signature.publisher, sha256: edge.sha256, attempts });
  const ctx = await startApp();
  let session;
  const failures = [];
  try {
    const ada = await ctx.session('ada');
    const bea = await ctx.session('bea');
    const ana = await ctx.session('ana');
    session = await openOwnedLoopback(path.join('capability', 'C022', 'index.html'), ctx.app.server);
    const { page } = session;
    assert.equal(Number(String(session.browserVersion).split('.')[0]), edge.major, 'the launched browser has the qualified major');
    console.log(`Edge ${session.browserVersion}, page ${ctx.origin}/ (synthetic, loopback, isolated headless)`);
    const pageErrors = [];
    const consoleErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).origin} ${new URL(request.url()).pathname}`));
    await page.reload({ waitUntil: 'load' });
    assert.match(await page.textContent('#status'), /^Not run yet\. Nothing is shown as isolated/);
    assert.equal(await page.$$eval('script:not([src])', (scripts) => scripts.length), 0, 'no inline script');
    checked('initial state shows nothing as isolated', await page.textContent('#status'));

    await page.fill('#token-a', ada.token);
    await page.fill('#token-b', bea.token);
    await page.click('#run');
    const first = await observe(page);
    assert.match(first.status, /^Isolation holds between tenant-alder and tenant-birch: (\d+) of \1 checks as specified\.$/);
    assert.equal(first.rows.length, Number(/Observed (\d+) checks/.exec(first.facts)[1]), 'rows and the facts line reconcile');
    assert.ok(first.rows.every((row) => row.length === 5 && row[4].className === 'ok'), 'every verdict is ok');
    const text = (probe, caller) => first.rows.filter((row) => row[0].text === probe && row[1].text.startsWith(caller)).map((row) => [row[2].text, row[3].text]);
    assert.deepEqual(text('foreign project id', 'bea'), [['404', 'refused RESOURCE_NOT_FOUND']]);
    assert.deepEqual(text('control: id that exists nowhere', 'bea'), [['404', 'refused RESOURCE_NOT_FOUND']]);
    assert.deepEqual(text('tenant claimed in a header', 'ada'), [['400', 'refused TENANT_CLAIM_REJECTED']]);
    assert.deepEqual(text('tenant claimed in the query', 'bea'), [['400', 'refused TENANT_CLAIM_REJECTED']]);
    assert.deepEqual(text('ETag of the other tenant', 'ada'), [['200', 'allowed']]);
    assert.deepEqual(text('foreign profile id', 'ada'), [['404', 'refused RESOURCE_NOT_FOUND']]);
    checked('two users of two tenants: allowed and refused outcomes, derived from facts', { status: first.status, rows: first.rows.length });

    // Keyboard only: Tab from the first field to the button, a visible focus ring, Enter runs the probes again.
    await page.focus('#token-a');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'run');
    const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
    assert.ok(ring.style !== 'none' && ring.width >= 2, `a visible focus ring (${JSON.stringify(ring)})`);
    await page.keyboard.press('Enter');
    const again = await observe(page);
    assert.equal(again.rows.length, first.rows.length);
    assert.equal(await page.$$eval('#status', (nodes) => nodes.filter((node) => node.getAttribute('role') === 'status').length), 1, 'one polite live region');
    checked('keyboard operable with a visible focus', ring);

    await page.fill('#token-b', ana.token);
    await page.click('#run');
    const same = await observe(page);
    assert.match(same.status, /^Not verified or NOT isolated: 1 of \d+ checks failed\.$/);
    assert.ok(same.rows.some((row) => row[4].text === 'not run: both tokens belong to the same tenant' && row[4].className === 'bad'));
    await page.fill('#token-b', 'garbage');
    const before = requests.length;
    await page.click('#run');
    const garbage = await observe(page);
    assert.match(garbage.status, /^Paste a well-formed session token for each user/);
    assert.equal(requests.length, before, 'nothing was sent for a malformed token');
    checked('two tokens of one tenant cannot be compared, a malformed token sends nothing', { same: same.status, garbage: garbage.status });

    assert.deepEqual(pageErrors, []);
    // The browser logs every REFUSED fetch (the probes that are meant to be refused: 400 and 404) as a console error. Those lines are
    // expected and counted; anything else (a CSP violation, a script error) is a failure.
    const refusedFetch = /^Failed to load resource: the server responded with a status of (400|404) \((Bad Request|Not Found)\)$/;
    assert.deepEqual(consoleErrors.filter((line) => !refusedFetch.test(line)), [], 'no console error but the refused probes');
    assert.ok(consoleErrors.length > 0, 'the refused probes were logged by the browser');
    assert.ok(requests.every((line) => line.startsWith('GET ') && line.includes(ctx.origin)), 'only same-origin GET requests');
    assert.ok(requests.filter((line) => line.includes('/v1/')).length >= 20);
    // The page keeps nothing in the browser: no cookie (the context also sees the HttpOnly ones) and no local or session storage entry.
    const kept = await page.evaluate(() => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length }));
    assert.deepEqual(kept, { cookie: '', local: 0, session: 0 }, 'nothing is stored by the page');
    assert.deepEqual(await page.context().cookies(), [], 'the browser context holds no cookie');
    checked('no cookie and no storage entry after the whole run', { ...kept, contextCookies: 0 });
    checked('no page error, no CSP violation, same-origin GET requests only', { requests: requests.length, refusedProbesLoggedByTheBrowser: consoleErrors.length });
  } catch (error) {
    failures.push(error);
  } finally {
    try { if (session) await session.close(); } catch (error) { failures.push(error); }
    try { await ctx.close(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'C022 browser observation or own cleanup failed');
  console.log('C022 BROWSER OK');
}

main().catch((error) => {
  console.error(`C022 BROWSER FAILED: ${error.stack || error.message}`);
  process.exitCode = 1;
});
