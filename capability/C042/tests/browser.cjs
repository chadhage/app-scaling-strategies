'use strict';

// Test tooling, not production code: a real isolated headless Edge observation of the C042 page. The helper allows
// only GET and aborts every other method, so the browser cannot submit the step: the observation shows the page
// reporting that as UNKNOWN, the keyboard-operable read-only controls, and the server-produced transcript. Nothing is
// written unless CAPTURE_BROWSER_EVIDENCE=1.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { produceTranscript } = require('../transcript.cjs');
const { call, gate, inFlight, startService, valid } = require('./support.cjs');
const journal = require('../journal.cjs');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const QUALIFIED_MAJOR = '156';
const K1 = 'demo-key-0001';
const K2 = 'demo-key-0002';
const record = {
  schemaVersion: 1, cardId: 'C042', kind: 'isolated-headless-edge-observation', startedAtUtc: new Date().toISOString(),
  outcome: 'not-run', testRuntime: process.version, businessData: 'synthetic', journalRecordsAtEnd: null,
  limits: ['The isolated helper allows only GET and aborts writes: the browser could not POST; the page reported UNKNOWN and the server saw no write.'],
  integratedForegroundBrowserUsed: false, checks: [], cleanup: { serverClosed: false, browserClosed: false },
};

function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}

function signedEdge() {
  const script = "$ErrorActionPreference='Stop';$edge=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft\\Edge\\Application\\msedge.exe'))|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1;$s=Get-AuthenticodeSignature -LiteralPath $edge;[ordered]@{path=$edge;status=[string]$s.Status;signer=$s.SignerCertificate.Subject;fileVersion=(Get-Item -LiteralPath $edge).VersionInfo.FileVersion;sha256=(Get-FileHash -LiteralPath $edge -Algorithm SHA256).Hash.ToLower()}|ConvertTo-Json -Compress";
  return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true }));
}

async function main() {
  let service;
  let session;
  let failure;
  const held = gate();
  let pending;
  try {
    const edge = signedEdge();
    assert.equal(edge.status, 'Valid');
    assert.match(edge.signer, /Microsoft Corporation/);
    assert.equal(edge.fileVersion.split('.')[0], QUALIFIED_MAJOR, 'the installed Edge must stay within the qualified major version');
    record.signedEdge = edge;
    checked('the installed Edge is Microsoft-signed and within the qualified major version', { version: edge.fileVersion, sha256: edge.sha256 });

    service = await startService({ io: journal.createMemoryIo(), executor: held.executor, transcript: produceTranscript });
    held.release(K1);
    assert.equal((await call(service.port, 'POST', '/v1/steps', valid({ idempotencyKey: K1 }))).status, 201);
    pending = call(service.port, 'POST', '/v1/steps', valid({ idempotencyKey: K2, units: 3 }));
    pending.catch(() => {});
    await inFlight(held, K2, [pending]);
    record.server = { pid: process.pid, address: service.server.address(), ownership: 'this process, exact returned http.Server handle' };
    session = await openIsolatedLoopback(path.join('capability', 'C042', 'index.html'), service.server);
    record.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion.split('.')[0], QUALIFIED_MAJOR);
    record.playwrightVersion = require(path.join(repositoryRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    const { page } = session;
    const pageErrors = [];
    const consoleErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('load').disabled);
    const text = (selector) => page.locator(selector).textContent();
    const active = () => page.evaluate(() => document.activeElement.id);
    // After EVERY action the rendered page must stay coherent: no repeated id anywhere, an ordered trail, a gap-free table.
    const snapshot = () => page.evaluate(() => {
      const texts = (selector) => [...document.querySelectorAll(selector)].map((element) => element.textContent);
      return {
        elementIds: [...document.querySelectorAll('[id]')].map((element) => element.id),
        trailSeqs: texts('#trail li').map((line) => Number(/^#(\d+)/.exec(line)?.[1])),
        eventNumbers: texts('#events tr td:first-child').map(Number),
        controlLabels: texts('#recovery button'), didNotCodes: texts('#did-not li').map((line) => line.split(':')[0]), resultLabels: texts('#result dt'),
        submitRows: [...document.querySelectorAll('#events tr')].map((row) => [row.children[2].textContent, row.children[3].textContent]).filter(([request]) => /^POST \/v1\/steps( |$)/.test(request)).map(([, status]) => status),
      };
    });
    const coherent = async (label) => {
      const dom = await snapshot();
      for (const name of ['elementIds', 'trailSeqs', 'eventNumbers', 'controlLabels', 'didNotCodes', 'resultLabels']) assert.equal(new Set(dom[name]).size, dom[name].length, `${label}: ${name} repeats ${dom[name]}`);
      assert.deepEqual(dom.trailSeqs, [...dom.trailSeqs].sort((a, b) => a - b), `${label}: the trail is in order`);
      assert.deepEqual(dom.eventNumbers, dom.eventNumbers.map((_, index) => index + 1), `${label}: the event table has no gap`);
      return dom;
    };
    assert.match(await text('#status'), /^Not run/);
    assert.match(await text('main'), /Synthetic business data · Loopback only/);
    assert.match(await text('#limit'), /allows only GET and blocks writes/);
    assert.equal(JSON.parse(await page.locator('#request').inputValue()).idempotencyKey, K1);
    checked('initial state: synthetic banner, the GET-only limit stated, no result shown, a valid example loaded', await text('#status'));

    const order = [];
    for (let press = 0; press < 6; press += 1) { await page.keyboard.press('Tab'); order.push(await active()); }
    assert.deepEqual(order, ['preset', 'request', 'submit', 'key', 'inspect', 'load']);
    checked('the whole page is reachable with Tab in a sensible order', order);

    await page.focus('#submit');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('UNKNOWN'));
    const unknown = await text('#status');
    assert.match(unknown, /Nothing is shown as success/);
    assert.equal(await page.locator('#result dt').count(), 0);
    assert.deepEqual(await page.locator('#recovery button').allTextContents(), ['Retry with the same key', 'Inspect the step']);
    assert.equal(/SUCCEEDED/.test(await text('main')), false);
    assert.equal(requests.includes('POST /v1/steps'), true, 'the browser did try to POST');
    assert.equal((await call(service.port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 5, 'the blocked POST changed nothing');
    await coherent('after the blocked submit');
    checked('Enter on Submit: the helper blocks the POST, the page says UNKNOWN, offers Retry and Inspect, shows no success, the server saw no write', { unknown, requests: requests.filter((item) => item.startsWith('POST')) });

    await page.focus('#key');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'inspect');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('SUCCEEDED'));
    assert.equal(JSON.parse(await text('#inputs')).idempotencyKey, K1);
    const rows = await page.locator('#result dd').allTextContents();
    assert.equal(rows.includes('committed') && rows.includes('succeeded (COMPLETED)'), true);
    assert.equal((await text('#did-not')).includes('NO_UNDO'), true);
    assert.equal(await text('#trail'), '#1 begin#2 commit');
    await coherent('after inspecting the recorded step');
    checked('keyboard Inspect (a GET) shows the validated inputs, the explicit result, what did not happen and the journal trail of the recorded step', rows);

    await page.fill('#key', K2);
    await page.focus('#inspect');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('UNKNOWN — The step is in flight'));
    assert.deepEqual(await page.locator('#recovery button').allTextContents(), ['Cancel the step', 'Retry with the same key', 'Inspect the step']);
    assert.equal((await page.locator('#result dd').allTextContents()).includes('in-flight'), true);
    await page.locator('#recovery button', { hasText: 'Cancel the step' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('UNKNOWN — no valid response'));
    const lease = (await call(service.port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'];
    assert.deepEqual([lease.committed, lease.held], [5, 3], 'the blocked cancel changed nothing: the step is still in flight');
    assert.equal(/CANCELLED/.test(await text('#status')), false);
    await coherent('after the blocked cancel');
    checked('an in-flight step shows UNKNOWN with Cancel, Retry and Inspect; the blocked Cancel is reported as unknown and nothing was cancelled', { lease });

    await page.fill('#key', 'demo-key-0404');
    await page.focus('#inspect');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED — No step was admitted'));
    assert.deepEqual(await page.locator('#recovery button').allTextContents(), ['Correct and resubmit']);
    await page.locator('#recovery button').focus();
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'request');
    await page.fill('#key', 'short');
    await page.focus('#inspect');
    await page.keyboard.press('Enter');
    assert.match(await text('#status'), /^Enter a valid idempotency key/);
    await coherent('after the typed rejection and the local refusal');
    checked('an unknown key is a typed rejection with only Correct and resubmit, which moves focus to the editor; an invalid key is refused locally', await text('#status'));

    await page.focus('#load');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED SERVER TRANSCRIPT'));
    const status = await text('#status');
    assert.match(status, /5 effects/);
    assert.match(status, /not by this browser\.$/);
    const summary = JSON.parse(await text('#summary'));
    assert.deepEqual(Object.keys(summary.outcomes).sort(), ['cancelled', 'interrupted', 'rejected', 'succeeded', 'unknown', 'unsupported']);
    assert.equal(await page.locator('#events tr').count() > 24, true);
    const table = await text('#events');
    for (const needle of ['__proto__', 'DUPLICATE_FIELD', 'IDEMPOTENCY_KEY_CONFLICT', 'UNSUPPORTED_ACTION', 'ACTION_NOT_ALLOWED', 'STEP_INTERRUPTED', 'JOURNAL_UNCERTAIN', 'CAPACITY_EXHAUSTED', 'The client destroys its socket', 'The service stops while the step is in flight']) {
      assert.equal(table.includes(needle), true, needle);
    }
    assert.equal(await page.locator('#events tr.kind-abort').count(), 2);
    const loaded = await coherent('after loading the transcript');
    const original = await page.evaluate(() => fetch('/transcript.json', { cache: 'no-store' }).then((response) => response.json()));
    const submits = original.events.filter((event) => event.kind === 'exchange' && event.request.method === 'POST' && event.request.path === '/v1/steps');
    assert.equal(loaded.eventNumbers.length, original.events.length, 'one row per event');
    assert.equal(loaded.submitRows.length, submits.length, 'every delivered submit is shown once');
    assert.equal(loaded.submitRows.filter((status) => status === '201').length, submits.filter((event) => event.response.body.effect.appliedByThisRequest).length, 'the 201 rows are exactly the submits that applied an effect');
    assert.equal(loaded.submitRows.filter((status) => status === '200').length + loaded.submitRows.filter((status) => status === '201').length + loaded.submitRows.filter((status) => !['200', '201'].includes(status)).length, submits.length, 'applied + replayed + refused equals what was delivered');
    record.domSnapshot = { elementIds: loaded.elementIds, eventNumbers: loaded.eventNumbers, submitStatuses: loaded.submitRows };
    checked('Enter on Load: the page verified the server-produced transcript and shows every case, including hostile inputs, abort and restart', { status, summary });
    if (capture) record.pendingScreenshot = await page.screenshot({ fullPage: true });

    const tampered = structuredClone(original);
    tampered.events.splice(3, 1);
    const respond = (code, body) => (route) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/transcript.json', respond(200, tampered));
    await page.locator('#load').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED'));
    assert.match(await text('#status'), /^REJECTED — SEQUENCE_GAP: /);
    assert.equal(await page.locator('#events tr').count(), 0);
    await page.unroute('**/transcript.json');
    await page.route('**/transcript.json', respond(500, {}));
    await page.locator('#load').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED — HTTP_500'));
    await page.unroute('**/transcript.json');
    checked('a tampered or missing transcript is REJECTED in the real browser and the earlier display is cleared', await text('#status'));

    const csp = await page.evaluate(async () => {
      const script = document.createElement('script');
      script.textContent = 'window.__inline = 1';
      document.head.appendChild(script);
      const outside = await fetch('http://example.invalid/').then(() => 'reached', () => 'blocked');
      const form = document.createElement('form');
      Object.assign(form, { method: 'post', action: '/v1/steps' });
      document.body.appendChild(form);
      form.submit();
      return { inline: window.__inline ?? 'blocked', outside, location: location.pathname };
    });
    assert.deepEqual(csp, { inline: 'blocked', outside: 'blocked', location: '/' });
    checked('CSP blocks inline script, outside connections and native form navigation', csp);
    assert.deepEqual(pageErrors, []);
    record.consoleErrors = consoleErrors;
    record.journalRecordsAtEnd = service.engine.snapshot().journalRecords;
    assert.equal(record.journalRecordsAtEnd, 3, 'only the Node-side submissions wrote: K1 begin and commit, K2 begin');
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = String(error.stack ?? error);
  } finally {
    if (held) { held.release(K2); }
    try { await pending; } catch { /* the pending request ends with its socket */ }
    if (session) {
      try { await session.close(); record.cleanup.browserClosed = true; } catch (error) { failure ??= error; }
    }
    if (service) {
      await service.stop();
      record.cleanup.serverClosed = true;
    }
    record.completedAtUtc = new Date().toISOString();
  }
  if (capture && record.outcome === 'passed') {
    const directory = path.join(__dirname, '..', 'evidence', 'raw', `browser-${randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    const { pendingScreenshot, ...rest } = record;
    fs.writeFileSync(path.join(directory, 'browser-observation.json'), `${JSON.stringify(rest, null, 2)}\n`, { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'browser-transcript.png'), pendingScreenshot, { flag: 'wx' });
    console.log(`evidence written: ${path.relative(repositoryRoot, directory)}`);
  }
  if (failure) throw failure;
  console.log(`C042 browser: ${record.checks.length} checks passed in Edge ${record.browserVersion}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
