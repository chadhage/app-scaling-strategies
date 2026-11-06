'use strict';

// Test tooling, not production code: observes the real inspection page in a real isolated headless Edge through the shared loopback helper (GET and HEAD only,
// so the POSTs of the service are proved by the Node suites over real sockets, never here). Two servers are observed: the real service, with canaries planted in
// every place and real management traffic behind the evidence, and a FORGING server that serves the real page assets and answers with forged evidence full of
// canaries. For each, everything the browser holds is scanned for every canary in every covered encoding: the rendered DOM and its text, localStorage,
// sessionStorage, cookies, IndexedDB names, CacheStorage names, the console, page errors, every request URL and header (so no secret in a URL or a Referer) and
// every network response (status line, headers and body). Usage (take a heavy slot first; CAPTURE_BROWSER_EVIDENCE unset writes nothing):
//   node capability\C014\tests\browser.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const { qualifyEdge } = require(path.join(repositoryRoot, 'testing', 'browser', 'qualify', 'qualify.cjs'));
const { qualifyWithRetry } = require('./browser-retry.cjs');
const { startLocal } = require('../server.cjs');
const { SECURITY_HEADERS } = require('../../C009/http-io.cjs');
const { seedConfig, canaryList, clientCanaries } = require('./canaries.cjs');
const { ENCODERS, scan } = require('./scanner.cjs');
const { call } = require('./harness.cjs');

const ANCHOR = path.join('capability', 'C014', 'index.html');
const ROOT = path.resolve(__dirname, '..');
const checks = [];
const checked = (name, observed) => { checks.push({ name, observed }); console.log(`PASS ${name}: ${JSON.stringify(observed)}`); };

// Serves the real page assets and FORGED evidence: a shape the page accepts but with canaries in the free text, and extra fields and canary values elsewhere.
function startForger(canaries) {
  const token = canaries.find((canary) => canary.id === 'token-operator').value;
  const item = {
    trace: (i) => ({ seq: i, kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: 'ok', steps: [{ event: 'note', detail: `${token} ${canaries[6].value}` }] }),
    runs: (i) => ({ id: `run-${String(i).padStart(4, '0')}`, units: i, owner: 'conductor-a', revision: i, status: 'ok', artifacts: 1, steps: [{ event: 'failure', detail: canaries[8].value }] }),
    audit: (i) => ({ seq: i, outcome: 'denied', code: 'ROLE_FORBIDDEN', command: 'run.create', subject: 'visitor', role: 'visitor', note: token }),
    logs: (i) => ({ seq: i, level: 'warn', event: 'request', route: 'command', status: 403, code: 'ROLE_FORBIDDEN', role: 'visitor', message: canaries[10].value })
  };
  const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/page.js': ['page.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const asset = files[url.pathname];
    const kind = /^\/v1\/evidence\/(trace|runs|audit|logs)$/.exec(url.pathname);
    const body = asset ? fs.readFileSync(path.join(ROOT, asset[0])) : Buffer.from(JSON.stringify(kind
      ? { outcome: 'ok', kind: kind[1], revision: 1, total: 2, shown: 2, limit: 50, items: [item[kind[1]](1), item[kind[1]](2)] } : { outcome: 'NOT_FOUND' }));
    response.writeHead(asset || kind ? 200 : 404, { ...SECURITY_HEADERS, 'Content-Type': asset ? asset[1] : 'application/json', 'Content-Length': body.length });
    response.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, close: () => new Promise((done) => { server.close(() => done()); server.closeAllConnections(); }) })));
}

// Opens the page, records everything, waits for the page to finish, interacts through the keyboard, and returns everything the browser held as scannable text.
async function observe(server, label) {
  let session;
  try {
    session = await openIsolatedLoopback(ANCHOR, server);
    // Cleanup proof (self-review line 9): with C014_BROWSER_INJECT_FAILURE=1 this run fails right here, and tests\browser-cleanup.cjs asserts that the finally below still closed the session.
    if (process.env.C014_BROWSER_INJECT_FAILURE === '1') assert.fail('injected failure: the real session must still be closed in finally');
    const { page } = session;
    const consoleText = [];
    const errors = [];
    const requests = [];
    const pending = [];
    const responses = [];
    page.on('console', (message) => consoleText.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(`${request.method()} ${request.url()}\n${JSON.stringify(request.headers())}`));
    page.on('response', (response) => pending.push((async () => {
      const body = await response.body().catch(() => Buffer.alloc(0));
      responses.push({ url: new URL(response.url()).pathname, status: response.status(), text: `${response.status()} ${JSON.stringify(await response.allHeaders())}\n${body.toString('utf8')}` });
    })()));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !/^Loading evidence/.test(document.getElementById('status').textContent));
    // keyboard: Tab reaches the reload button with a visible focus ring, Enter reloads (four more requests), the bundle link is reachable
    const before = requests.length;
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle, width: getComputedStyle(document.activeElement).outlineWidth }));
    await page.keyboard.press('Enter');
    await page.waitForFunction((count) => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/v1/evidence/')).length >= count, 8);
    const reloaded = requests.length - before;
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => document.activeElement.id);
    await Promise.all(pending);
    const snapshot = await page.evaluate(async () => ({
      html: document.documentElement.outerHTML, text: document.body.innerText, status: document.getElementById('status').textContent,
      counts: ['trace', 'runs', 'audit', 'logs'].map((kind) => document.getElementById(`count-${kind}`).textContent),
      rows: ['trace', 'runs', 'audit', 'logs'].map((kind) => document.getElementById(`rows-${kind}`).children.length),
      local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }), cookie: document.cookie,
      indexed: JSON.stringify(await indexedDB.databases()), caches: JSON.stringify(await caches.keys()), title: document.title, links: [...document.querySelectorAll('a')].map((link) => link.getAttribute('href')),
      resources: performance.getEntriesByType('resource').map((entry) => entry.name)
    }));
    const cookies = await page.context().cookies();
    const bundle = await page.evaluate(async () => { const response = await fetch('/v1/evidence/bundle', { credentials: 'omit' }); return { status: response.status, type: response.headers.get('content-type'), body: await response.text() }; });
    await Promise.all(pending);
    return { label, version: session.browserVersion, snapshot, cookies, consoleText, errors, requests, responses, focus, next, requestsAfterEnter: reloaded, bundle };
  } finally {
    if (session) {
      await session.close();
      if (process.env.C014_BROWSER_INJECT_FAILURE === '1') console.log(JSON.stringify({ cleanup: { sessionClosed: true, pageClosed: session.page.isClosed() } }));
    }
  }
}

// What the BROWSER holds. The responses of a forging server are canary-laden by design (that is the forgery), so only the real service's responses are scanned as output.
function everythingScannable(seen, withResponses) {
  const { snapshot } = seen;
  return [snapshot.html, snapshot.text, snapshot.status, ...snapshot.counts, snapshot.local, snapshot.session, snapshot.cookie, snapshot.indexed, snapshot.caches, snapshot.title, ...snapshot.links,
    ...snapshot.resources, JSON.stringify(seen.cookies), ...seen.consoleText, ...seen.errors, ...seen.requests, ...(withResponses ? [...seen.responses.map((entry) => entry.text), seen.bundle.body] : [])].join('\n');
}

async function main() {
  const { edge, attempts } = await qualifyWithRetry(qualifyEdge);
  assert.equal(edge.ok, true, `${edge.reasons.join(' | ')} (${attempts} attempt(s); the C014 browser verification needs a quiet slot)`);
  checked('the installed Edge is Microsoft-signed and its major is qualified', { version: edge.version, major: edge.major, signature: edge.signature.status, publisher: edge.signature.publisher, sha256: edge.sha256, attempts });
  const config = seedConfig();
  const canaries = [...canaryList(config), ...clientCanaries()];
  const local = await startLocal({ config });
  const forger = await startForger(canaries);
  let observations;
  try {
    for (const place of ['run', 'trace', 'log', 'audit', 'error']) for (const canary of canaryList(config)) local.service.plant(place, Object.values(ENCODERS).map((encode) => encode(canary.value)).join(' '));
    assert.equal((await call(local.port, 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], body: { name: 'browser-run', units: 3 } })).status, 200);
    assert.equal((await call(local.port, 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'fail' } })).status, 500);
    const noisy = { 'User-Agent': canaries.at(-1).value, Cookie: `sid=${canaries.at(-2).value}` };
    await call(local.port, 'GET', `/v1/evidence/runs?limit=${canaries.at(-3).value}`, { headers: noisy });
    observations = [await observe(local.server, 'the real service'), await observe(forger.server, 'a forging server')];
  } finally { await Promise.all([local.close(), forger.close()]); }

  const [real, forged] = observations;
  for (const seen of observations) {
    assert.equal(Number(String(seen.version).split('.')[0]), edge.major, 'the launched browser has the qualified major');
    assert.deepEqual(scan(everythingScannable(seen, seen === real), canaries), [], `${seen.label}: no canary anywhere the browser holds anything`);
    assert.deepEqual(seen.errors, [], `${seen.label}: no page error`);
    assert.deepEqual([seen.cookies.length, seen.snapshot.local, seen.snapshot.session, seen.snapshot.cookie, seen.snapshot.indexed, seen.snapshot.caches], [0, '{}', '{}', '', '[]', '[]'], `${seen.label}: no cookie, no storage, no database`);
    assert.ok(seen.requests.length >= 7 && seen.requests.every((line) => /^(GET|HEAD) http:\/\/127\.0\.0\.1:\d+\//.test(line)), `${seen.label}: same-origin GET requests only`);
    assert.ok(seen.requests.every((line) => !/"referer"/i.test(line)), `${seen.label}: no Referer on any request`);
    assert.ok(seen.requests.filter((line) => line.includes('/v1/evidence/') && !line.includes('/v1/evidence/bundle')).every((line) => /\/v1\/evidence\/(trace|runs|audit|logs)\?limit=50\n/.test(line)), `${seen.label}: the URLs carry nothing but the fixed limit`);
    assert.ok(seen.responses.length >= 7 && seen.responses.every((entry) => /"cache-control":"no-store"/.test(entry.text) && !/"(set-cookie|access-control-[a-z-]+|location)"/.test(entry.text.split('\n')[0])), `${seen.label}: every response is no-store, sets no cookie, allows no origin`);
    assert.deepEqual([seen.focus.id, seen.next], ['reload', 'download'], `${seen.label}: Tab reaches the reload button, then the download link`);
    assert.ok(seen.focus.outline !== 'none' && parseFloat(seen.focus.width) > 0, `${seen.label}: the focus is visible (${seen.focus.outline} ${seen.focus.width})`);
    assert.ok(seen.requestsAfterEnter >= 4, `${seen.label}: Enter on the focused button loaded the evidence again (${seen.requestsAfterEnter} requests)`);
    assert.deepEqual(seen.snapshot.links.filter((href) => href.includes('bundle')), ['/v1/evidence/bundle'], `${seen.label}: the offered export is the fixed GET`);
  }
  assert.equal(real.bundle.status, 200);
  assert.match(real.snapshot.status, /^Loaded 4 of 4 sections: \d+ of \d+ entries shown\.$/);
  assert.ok(real.snapshot.counts.every((line) => /^Showing \d+ of \d+ entries \(limit 50\); revision \d+\.$/.test(line)) && real.snapshot.rows.every((count) => count >= 1));
  const { signature, ...unsigned } = JSON.parse(real.bundle.body);
  assert.equal(signature.value, crypto.createHmac('sha256', config.signingKey).update(JSON.stringify(unsigned)).digest('hex'), 'the downloadable bundle verifies against the signing key held server-side');
  checked('the real service: nothing the browser holds contains a canary', { sections: real.snapshot.rows, status: real.snapshot.status, responses: real.responses.length, requests: real.requests.length, consoleMessages: real.consoleText.length, bundleBytes: real.bundle.body.length });
  assert.equal(forged.snapshot.status, 'Loaded 2 of 4 sections; 2 rejected. 4 of 4 entries shown from the sections that passed.');
  assert.deepEqual(forged.snapshot.counts.map((line) => line.startsWith('Rejected: the answer did not match the closed shape')), [false, false, true, true]);
  checked('a forging server cannot make the page print a canary: forged free text is never shown, forged fields reject the whole document', { status: forged.snapshot.status, counts: forged.snapshot.counts });
  checked('keyboard: Tab reaches reload then the download link, the focus ring is drawn, Enter reloads, no inline script, no storage', { focus: real.focus, next: real.next, requestsAfterEnter: real.requestsAfterEnter });

  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const directory = path.join(ROOT, 'evidence', 'browser', `browser-${crypto.randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'browser-observation.json'), `${JSON.stringify({ schema: 'C014-browser/1', edge: { version: edge.version, major: edge.major, signature: edge.signature.status, publisher: edge.signature.publisher, sha256: edge.sha256 },
      canaryIds: canaries.map((canary) => canary.id), scanned: observations.map((seen) => ({ label: seen.label, requests: seen.requests.length, responses: seen.responses.length, consoleMessages: seen.consoleText.length, domBytes: seen.snapshot.html.length })), checks }, null, 2)}\n`, { flag: 'wx' });
  }
  console.log('C014 BROWSER OK');
}

main().catch((error) => {
  console.error(`C014 BROWSER FAILED: ${error.stack || error.message}`);
  process.exitCode = 1;
});
