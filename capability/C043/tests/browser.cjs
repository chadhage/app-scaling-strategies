'use strict';

// Test tooling, not production code: a real isolated headless Edge observation of the C043 page. The helper allows only
// GET and aborts every other method, so the browser cannot run a preset: the observation shows the page reporting that
// as UNKNOWN, the keyboard-operable read-only controls, the inspection of a completed and of a running preset that the
// test started from Node, and the server-produced transcript. The browser signature and the qualified major version are
// asserted; no equality pin on the browser version or hash. Nothing is written unless CAPTURE_BROWSER_EVIDENCE=1.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { produceTranscript } = require('../transcript.cjs');
const contract = require('../contract.js');
const {
  call, doc, gate, inFlight, startService, step,
} = require('./support.cjs');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const QUALIFIED_MAJOR = '156';
const DONE = 'demo-preset-0001';
const LIVE = 'browser-run-0002';
const record = {
  schemaVersion: 1, cardId: 'C043', kind: 'isolated-headless-edge-observation', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  testRuntime: process.version, businessData: 'synthetic', integratedForegroundBrowserUsed: false, checks: [], cleanup: { serverClosed: false, browserClosed: false },
  limits: ['The isolated helper allows only GET and aborts writes: the browser could not POST; the page reported UNKNOWN and the server saw no write.'],
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
  let pending;
  const held = gate();
  try {
    const edge = signedEdge();
    assert.equal(edge.status, 'Valid');
    assert.match(edge.signer, /Microsoft Corporation/);
    assert.equal(edge.fileVersion.split('.')[0], QUALIFIED_MAJOR, 'the installed Edge must stay within the qualified major version');
    record.signedEdge = edge;
    checked('the installed Edge is Microsoft-signed and within the qualified major version', { version: edge.fileVersion, sha256: edge.sha256 });

    service = await startService({ executor: held.executor, transcript: produceTranscript });
    const hold = (key) => held.release(key);
    for (const n of [1, 2, 3]) hold(`demo-p1-step-${n}`);
    const demo = (await call(service.port, 'GET', '/v1/presets')).json.presets[0];
    assert.equal((await call(service.port, 'POST', '/v1/presets', demo)).status, 201);
    pending = call(service.port, 'POST', '/v1/presets', doc({ idempotencyKey: LIVE, steps: [step(1, { idempotencyKey: 'browser-step-0001' }), step(2, { idempotencyKey: 'browser-step-0002' }), step(3, { idempotencyKey: 'browser-step-0003' })] }));
    pending.catch(() => {});
    await inFlight(held, 'browser-step-0001', [pending]);
    hold('browser-step-0001');
    await inFlight(held, 'browser-step-0002', [pending]);
    record.server = { pid: process.pid, address: service.server.address(), ownership: 'this process, exact returned http.Server handle' };
    session = await openIsolatedLoopback(path.join('capability', 'C043', 'index.html'), service.server);
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
    await page.waitForFunction(() => /declared presets loaded/.test(document.getElementById('catalog-status').textContent));
    const text = (selector) => page.locator(selector).textContent();
    const active = () => page.evaluate(() => document.activeElement.id);
    // After EVERY action the rendered page must stay coherent: unique ids, a progress list that reconciles with the listings.
    const coherent = async (label) => {
      const dom = await page.evaluate(() => {
        const texts = (selector) => [...document.querySelectorAll(selector)].map((element) => element.textContent);
        const progress = [...document.querySelectorAll('#progress li')];
        return {
          elementIds: [...document.querySelectorAll('[id]')].map((element) => element.id), stepKeys: texts('#progress li').map((line) => /Step \d+ · (\S+) ·/.exec(line)?.[1]),
          trailSeqs: texts('#trail li').map((line) => Number(/^#(\d+)/.exec(line)?.[1])), eventNumbers: texts('#events tr td:first-child').map(Number),
          controls: texts('#recovery button'), didNot: texts('#did-not li').map((line) => line.split(':')[0]), labels: texts('#result dt'),
          ran: document.querySelectorAll('#listing-ran li').length, notRun: document.querySelectorAll('#listing-notrun li').length, rows: progress.length,
          notRunRows: progress.filter((row) => row.className === 'status-not-run').length, effects: document.querySelectorAll('#listing-effects li').length,
          successRows: progress.filter((row) => /status-(succeeded|replayed)/.test(row.className)).length,
        };
      });
      for (const name of ['elementIds', 'stepKeys', 'trailSeqs', 'eventNumbers', 'controls', 'didNot', 'labels']) assert.equal(new Set(dom[name]).size, dom[name].length, `${label}: ${name} repeats ${dom[name]}`);
      assert.deepEqual(dom.trailSeqs, [...dom.trailSeqs].sort((a, b) => a - b), `${label}: the trail is in order`);
      assert.deepEqual(dom.eventNumbers, dom.eventNumbers.map((_, index) => index + 1), `${label}: the event table has no gap`);
      if (dom.labels.length) {
        assert.equal(dom.ran + dom.notRun, dom.rows, `${label}: ran + not run equals the steps shown`);
        assert.equal(dom.rows - dom.notRunRows, dom.ran, `${label}: the ran listing equals the rows that ran`);
        assert.equal(dom.effects, dom.successRows, `${label}: effects equal the succeeded and replayed rows`);
      }
      return dom;
    };
    assert.match(await text('#status'), /^Not run/);
    assert.match(await text('main'), /Synthetic business data · Loopback only/);
    assert.match(await text('#limit'), /allows only GET and blocks writes/);
    assert.equal(await page.locator('#preset option').count(), 13);
    checked('initial state: synthetic banner, the GET-only limit stated, the declared presets loaded and validated', await text('#catalog-status'));

    const order = [];
    for (let press = 0; press < 6; press += 1) { await page.keyboard.press('Tab'); order.push(await active()); }
    assert.deepEqual(order, ['preset', 'request', 'submit', 'key', 'inspect', 'load']);
    checked('the whole page is reachable with Tab in a sensible order', order);

    await page.focus('#submit');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('UNKNOWN'));
    assert.match(await text('#status'), /Nothing is shown as success/);
    assert.equal(await page.locator('#result dt').count(), 0);
    assert.deepEqual(await page.locator('#recovery button').allTextContents(), ['Retry with the same key', 'Inspect the preset']);
    assert.equal(requests.includes('POST /v1/presets'), true, 'the browser did try to POST');
    await coherent('after the blocked run');
    checked('Enter on Run: the helper blocks the POST, the page says UNKNOWN, offers Retry and Inspect, shows no success', { requests: requests.filter((item) => item.startsWith('POST')) });

    await page.locator('#recovery button', { hasText: 'Inspect the preset' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('COMPLETED'));
    assert.deepEqual(await page.locator('#progress li').allTextContents().then((rows) => rows.map((row) => /(succeeded)$/.test(row))), [true, true, true]);
    assert.equal(await page.locator('#listing-effects li').count(), 3);
    assert.deepEqual(await page.locator('#recovery button').allTextContents(), ['Retry with the same key', 'Inspect the preset']);
    const completed = await coherent('after inspecting the completed preset');
    checked('Inspect (a GET) of the preset that Node completed: validated progress, effects and the controls that work', { status: await text('#status'), controls: completed.controls });

    await page.fill('#key', LIVE);
    await page.focus('#inspect');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('RUNNING'));
    assert.deepEqual(await page.locator('#progress li').evaluateAll((rows) => rows.map((row) => row.className)), ['status-succeeded', 'status-running', 'status-not-run']);
    assert.deepEqual(await page.locator('#recovery button').allTextContents(), ['Cancel the preset', 'Retry with the same key', 'Inspect the preset']);
    await coherent('after inspecting the running preset');
    checked('Inspect of the preset still running: step 1 succeeded, step 2 in flight, step 3 not run; cancel, retry and inspect offered', await text('#status'));

    await page.fill('#key', 'no-such-preset-01');
    await page.focus('#inspect');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED — RUN_NOT_FOUND'));
    assert.deepEqual(await page.locator('#recovery button').allTextContents(), ['Correct and resubmit']);
    await coherent('after inspecting an unknown preset');
    checked('an unknown key is a typed rejection with only the control that works', await text('#status'));

    await page.focus('#load');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('summary').textContent.startsWith('VERIFIED'));
    assert.equal(await page.locator('#events tr').count() >= 25, true);
    assert.match(await text('#status'), /^VERIFIED — \d+ exchanges, one effect per step, ledger totals reconciled/);
    await coherent('after loading the transcript');
    record.transcriptSummary = await text('#summary');
    checked('the server-produced transcript is verified again by the page in a real browser', { rows: await page.locator('#events tr').count() });

    await page.route('**/transcript.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"kind":"C043-server-transcript","schemaVersion":1,"scope":"synthetic-loopback-only","events":[{"n":2}]}' }));
    await page.focus('#load');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED'));
    await page.unroute('**/transcript.json');
    assert.equal(await page.locator('#events tr').count(), 0);
    checked('a forged transcript is REJECTED in the real browser and the earlier display is cleared', await text('#status'));

    // C043 F4: every tamper pattern of an answer is REJECTED (never UNKNOWN, never a throw) in the real browser, and no
    // tampered word reaches the page. The GET answer of an inspect is rewritten on its way to the page (the helper still
    // allows only GET: the route handler passes every other method on to the helper's own guard).
    const PROSE = 'Success: every step ran fine.';
    const UNKNOWN = 'tamper-unknown-0001';
    let unknownInspections = 0;
    let tamper = null;
    const rewrite = async (route) => {
      if (tamper === null || route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch({ maxRedirects: 0 });
      const forged = JSON.parse(await response.text());
      tamper(forged);
      const forgedText = JSON.stringify(forged);
      return route.fulfill({ response, body: forgedText, headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(forgedText)) } });
    };
    await page.route('**/v1/presets/*', rewrite);
    const TAMPERS = [
      ['a null step', DONE, (answer) => { answer.steps[1] = null; }],
      ['a step status of __proto__', DONE, (answer) => { answer.steps[0].status = '__proto__'; }],
      ['a step status of constructor', DONE, (answer) => { answer.steps[0].status = 'constructor'; }],
      ['a null usage', DONE, (answer) => { answer.usage = null; }],
      ['a deceptive sentence as a detail path', UNKNOWN, (answer) => { answer.error.details = [{ path: PROSE, code: 'INVALID_FORMAT', message: contract.ERRORS.INVALID_FORMAT.message }]; }],
      ['a single deceptive word as a detail path', UNKNOWN, (answer) => { answer.error.details = [{ path: 'Success', code: 'INVALID_FORMAT', message: contract.ERRORS.INVALID_FORMAT.message }]; }],
    ];
    const rejected = [];
    for (const [name, key, change] of TAMPERS) {
      tamper = change;
      unknownInspections += key === UNKNOWN ? 1 : 0;
      await page.fill('#key', key);
      await page.focus('#inspect');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.getElementById('status').textContent.startsWith('Waiting'));
      const status = await text('#status');
      assert.match(status, /^REJECTED — the response is not a valid C043 result/, `${name}: ${status}`);
      assert.equal(await page.evaluate((sentence) => document.body.textContent.includes(sentence), PROSE), false, `${name}: no tampered sentence reaches the page`);
      assert.equal(await page.locator('#result dt').count(), 0, `${name}: nothing is shown`);
      await coherent(`after the tamper: ${name}`);
      rejected.push(name);
    }
    tamper = null;
    await page.unroute('**/v1/presets/*', rewrite);
    checked('every tamper pattern (null step, inherited status names, null usage, a deceptive detail path) is REJECTED, never UNKNOWN, and prints none of the tampered text', rejected);

    // The console must hold no CSP violation and no missing resource before the deliberate CSP probe below (C042 F7);
    // the one 404 is the typed RUN_NOT_FOUND answer of the unknown-key inspection above.
    assert.deepEqual(consoleErrors.filter((entry) => /Content Security Policy|favicon/.test(entry)), [], 'the console holds no CSP violation (C042 F7)');
    assert.equal(consoleErrors.filter((entry) => /404/.test(entry)).length, 1 + unknownInspections, 'the only missing resources are the deliberate unknown-key inspections');
    assert.equal(requests.filter((entry) => /favicon/.test(entry)).length, 0, 'no favicon request');
    const csp = await page.evaluate(async () => {
      const script = document.createElement('script');
      script.textContent = 'window.__inline = 1';
      document.head.appendChild(script);
      const outside = await fetch('http://example.invalid/').then(() => 'reached', () => 'blocked');
      return { inline: window.__inline ?? 'blocked', outside, location: location.pathname };
    });
    assert.deepEqual(csp, { inline: 'blocked', outside: 'blocked', location: '/' });
    checked('CSP blocks inline script and outside connections', csp);
    assert.deepEqual(pageErrors, []);
    record.consoleErrors = consoleErrors;
    const written = await call(service.port, 'GET', '/v1/leases');
    assert.equal(written.json.leases['synthetic-lease-001'].committed, 20, 'only the Node-side runs wrote: 15 units of the completed preset and 5 of the running one');
    record.domSnapshot = await page.evaluate(() => ({ title: document.title, status: document.getElementById('status').textContent, ids: [...document.querySelectorAll('[id]')].map((element) => element.id), events: document.querySelectorAll('#events tr').length }));
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = String(error.stack ?? error);
  } finally {
    for (const key of ['browser-step-0002', 'browser-step-0003']) held.release(key);
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
    const directory = path.join(__dirname, '..', 'evidence', 'browser', `browser-${randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'browser-observation.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    console.log(`evidence written: ${path.relative(repositoryRoot, directory)}`);
  }
  if (failure) throw failure;
  console.log(`C043 browser: ${record.checks.length} checks passed in Edge ${record.browserVersion}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
