'use strict';

// Test tooling, not production code: observes the real page in a real isolated headless Edge through the shared loopback helper. The helper
// permits only GET and HEAD to the exact origin, so the page's GET inspection is observed live; every POST, PATCH and DELETE outcome is proved over
// real loopback sockets by the Node suites (the world below is seeded through such sockets). Usage (heavy slot, CAPTURE_BROWSER_EVIDENCE unset,
// nothing is written): node capability\C010\tests\browser.cjs
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const { qualifyEdge } = require(path.join(repositoryRoot, 'testing', 'browser', 'qualify', 'qualify.cjs'));
const { startLocal } = require('../server.cjs');
const { call } = require('./helpers.cjs');

const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const OUTCOMES = ['allowed', 'forbidden', 'violation', 'no answer'];
const TIMEOUTS = ['SIGNATURE_TIMEOUT', 'VERSION_TIMEOUT', 'SHA256_TIMEOUT'];
const checked = (name, observed) => console.log(`PASS ${name}: ${JSON.stringify(observed)}`);

// qualifyEdge asks PowerShell for the signature and the version: on a loaded machine those queries time out. Only a typed timeout is retried, once.
async function qualified() {
  const first = await qualifyEdge();
  if (first.ok || first.reasons.length === 0 || !first.reasons.every((reason) => TIMEOUTS.some((code) => String(reason).startsWith(`${code}:`)))) return { edge: first, attempts: 1 };
  console.log(`qualifyEdge timed out (${Math.round(os.freemem() / 1048576)} MB free): retrying once`);
  return { edge: await qualifyEdge(), attempts: 2 };
}

async function seedWorld(local) {
  for (const [name, key] of [['conductor-a', 'a'], ['conductor-b', 'b']]) {
    const lease = (await call(local, local.tokens[name], 'POST', '/v1/leases', { name: `lease-${key}`, ttlMs: 600000 })).json.lease.id;
    const run = (await call(local, local.tokens[name], 'POST', `/v1/leases/${lease}/runs`, { name: `run-${key}`, units: 5 })).json.resource.id;
    await call(local, local.tokens[name], 'POST', `/v1/leases/${lease}/scratches`, { name: `scratch-${key}` });
    await call(local, local.tokens[name], 'POST', `/v1/leases/${lease}/exports`, { name: `export-${key}`, runId: run });
  }
}

const row = (identity, action, target, http, code, outcome) => [identity, action, target, http, code, outcome];
function expectedRows() {
  const own = ['read lease', 'list runs', 'read run', 'read scratch', 'read export'];
  const rows = IDENTITIES.map((identity) => row(identity, 'who am I', 'itself', '200', 'ok', 'allowed'));
  for (const identity of ['conductor-a', 'conductor-b']) for (const action of own) rows.push(row(identity, action, `own ${action.replace('read ', '').replace('list ', '')}`, '200', 'ok', 'allowed'));
  for (const [attacker] of [['conductor-a'], ['conductor-b']]) for (const action of own) rows.push(row(attacker, action, `foreign ${action.replace('read ', '').replace('list ', '')}`, '404', 'TARGET_NOT_FOUND', 'forbidden'));
  for (const identity of ['visitor', 'operator']) for (const action of own.slice(0, 2)) rows.push(row(identity, action, `conductor-a ${action.replace('read ', '').replace('list ', '')}`, '403', 'ROLE_FORBIDDEN', 'forbidden'));
  rows.push(row('anonymous', 'read lease', 'conductor-a lease', '401', 'AUTHENTICATION_REQUIRED', 'forbidden'), row('operator', 'read lease metadata', 'operator route', '200', 'ok', 'allowed'));
  return rows;
}

async function run(page, tokens) {
  for (const identity of IDENTITIES) await page.fill(`#token-${identity}`, tokens[identity]);
  await page.click('#run');
  await page.waitForFunction(() => !/^(Inspecting|Not inspected)/.test(document.getElementById('status').textContent));
  return { rows: await page.$$eval('#rows tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent))), status: await page.textContent('#status'),
    outcomes: await page.$$eval('#rows tr td:last-child', (tds) => tds.map((td) => td.getAttribute('data-outcome'))) };
}

async function main() {
  const { edge, attempts } = await qualified();
  assert.equal(edge.ok, true, `${edge.reasons.join(' | ')} (${attempts} attempt(s); C010 browser verification needs a quiet slot)`);
  checked('the installed Edge is Microsoft-signed and its major is qualified', { version: edge.version, major: edge.major, signature: edge.signature.status, publisher: edge.signature.publisher, sha256: edge.sha256, attempts });
  const local = await startLocal({ tokenMs: 600000 });
  let session;
  try {
    await seedWorld(local);
    session = await openIsolatedLoopback(path.join('capability', 'C010', 'index.html'), local.app.server);
    const { page } = session;
    console.log(`Edge ${session.browserVersion}, page ${local.origin}/ (synthetic, loopback, isolated headless)`);
    assert.equal(Number(String(session.browserVersion).split('.')[0]), edge.major, 'the launched browser has the qualified major');
    const pageErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).origin}${new URL(request.url()).pathname}`));
    const response = await page.reload({ waitUntil: 'load' });
    assert.match(response.headers()['content-security-policy'], /^default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'/);
    assert.equal(/unsafe-inline|unsafe-eval/.test(response.headers()['content-security-policy']), false);
    assert.equal(await page.$$eval('script:not([src])', (scripts) => scripts.length), 0, 'no inline script');
    assert.match(await page.textContent('#status'), /^Not inspected yet\. Nothing is shown as allowed until the server says so\.$/);
    assert.equal(await page.$$eval('#rows tr', (trs) => trs.length), 0);
    checked('initial state: nothing is shown as allowed, a strict CSP, no inline script', await page.textContent('#status'));

    const real = await run(page, local.tokens);
    assert.deepEqual(real.rows, expectedRows());
    assert.equal(real.status, 'Checked 30 rows: every owner reached its own resources and no foreign resource was reachable by anyone else.');
    assert.deepEqual(real.outcomes.reduce((count, outcome) => ({ ...count, [outcome]: (count[outcome] ?? 0) + 1 }), {}), { allowed: 15, forbidden: 15 });
    checked('the real tokens: 30 rows derived from status, code and shape; every owner reaches its own, nobody reaches a foreign one', real.status);

    const invariants = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
      const cells = [...document.querySelectorAll('#rows tr')].map((tr) => tr.children.length);
      return { unique: new Set(ids).size === ids.length, cells, regions: document.querySelectorAll('[role="status"]').length };
    });
    assert.deepEqual(invariants, { unique: true, cells: Array(30).fill(6), regions: 1 });
    for (const outcome of real.outcomes) assert.ok(OUTCOMES.includes(outcome));
    checked('rendered DOM invariants in real Edge: unique ids, 30 rows of 6 cells, one polite live region', invariants.cells.length);

    await page.fill('#token-visitor', 'garbage');
    await page.focus('#token-operator');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle, width: getComputedStyle(document.activeElement).outlineWidth }));
    assert.deepEqual([focus.id, focus.outline === 'none', focus.width], ['run', false, '3px']);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /violation\(s\)\. Do not trust this server\.$/.test(document.getElementById('status').textContent));
    checked('the button is reached with Tab, shows a visible focus ring, and Enter runs the inspection (a garbage visitor token is a violation on screen)', focus);

    const swapped = await run(page, { ...local.tokens, 'conductor-a': local.tokens['conductor-b'] });
    assert.match(swapped.status, /^Checked 30 rows: [1-9][0-9]* violation\(s\)\. Do not trust this server\.$/);
    assert.ok(swapped.outcomes.includes('violation'));
    const forged = await run(page, { ...local.tokens, visitor: `c009_${'A'.repeat(43)}` });
    assert.deepEqual(forged.rows[0], row('visitor', 'who am I', 'itself', '401', 'TOKEN_UNKNOWN', 'violation'));
    assert.match(forged.status, /violation\(s\)\. Do not trust this server\.$/);
    checked('two conductors with the same token and a forged visitor token are shown as violations, never as fine', [swapped.status, forged.rows[0]]);

    assert.deepEqual(pageErrors, []);
    assert.ok(requests.length > 100 && requests.every((line) => line.startsWith(`GET ${local.origin}/`)), 'only same-origin GET requests were made');
    checked('no page error; same-origin GET requests only', { requests: requests.length });
  } finally {
    try { if (session) await session.close(); } finally { await local.close(); }
  }
  console.log('C010 BROWSER OK');
}

main().catch((error) => {
  console.error(`C010 BROWSER FAILED: ${error.stack || error.message}`);
  process.exitCode = 1;
});
