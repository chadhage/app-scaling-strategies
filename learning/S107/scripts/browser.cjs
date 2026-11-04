'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { startFixture } = require('../serve.cjs');
const { openNative, bounded } = require('./native.cjs');
const { root, hash, canonical, save, json } = require('./capture.cjs');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const time = () => new Date().toISOString();
const id = `${time().replace(/[:.]/g, '-')}-${randomUUID().substring(0, 8)}`;
function tree(directory = root) {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(tree(file))
      : [[path.relative(root, file), hash(fs.readFileSync(file))]];
  }).sort(([a], [b]) => a.localeCompare(b)));
}
const before = tree();
const inputs = Object.keys(before).filter(file => !file.startsWith(`evidence${path.sep}`)).map(file => ({
  path: file, bytes: fs.readFileSync(path.join(root, file)),
}));
const report = { schemaVersion: 1, cardId: 'A-S107', parentId: 'D-S107', packet: 'SC-S107', kano: 'S',
  owner: 'worker-A-S107', mode: 'local-real-browser-native-http-fictional-fixture', startedAtUtc: time(),
  steps: [], failures: [], nativeBrowserCORSMeasured: false, nativeAzureCertified: false,
  broaderLifecycleQualified: false, noRoutingInterception: true, deniedPayloadBypassed: false };

async function dom(page, label) {
  const snapshot = await page.evaluate(() => ({
    url: location.href, origin: location.origin, title: document.title,
    banner: document.querySelector('.banner').textContent,
    mode: document.getElementById('mode').textContent,
    status: document.getElementById('status').textContent,
    cors: document.getElementById('status').dataset.cors,
    userImpact: document.getElementById('status').dataset.impact,
    verifier: document.getElementById('status').dataset.verifier,
    metrics: document.getElementById('metrics').textContent,
    trace: document.getElementById('trace').textContent,
    csp: document.getElementById('csp-summary').textContent,
    error: { hidden: document.getElementById('error').hidden, text: document.getElementById('error').textContent },
    resetIsNativeFunction: typeof document.getElementById('rehearsal-form').reset === 'function',
    focus: document.activeElement.id || document.activeElement.className,
    journal: Array.from(document.querySelectorAll('#history li')).map(item => ({
      id: item.dataset.attempt, cors: item.dataset.cors, userImpact: item.dataset.impact,
      verifier: item.dataset.verifier, text: item.textContent,
    })),
    controls: Array.from(document.getElementById('rehearsal-form').elements).map(control => ({
      id: control.id, value: control.value, disabled: control.disabled,
    })),
  }));
  report.steps.push({ label, observedAtUtc: time(), dom: snapshot });
  return snapshot;
}
async function complete(page, expectedID) {
  await page.waitForFunction(id => {
    const entries = document.querySelectorAll('#history li');
    return entries.length === id && entries[id - 1].dataset.verifier !== 'pending';
  }, expectedID);
}
async function activate(page, id) {
  await page.locator(`#${id}`).focus();
  await page.keyboard.press('Enter');
}
async function run(page, policy, prediction, measurement = 'request') {
  const expectedID = await page.locator('#history li').count() + 1;
  await page.locator('#policy').selectOption(policy);
  await page.locator('#prediction').selectOption(prediction);
  await page.locator('#measurement').selectOption(measurement);
  await activate(page, 'run-attempt');
  await complete(page, expectedID);
  return dom(page, `${new URL(page.url()).origin}: ${policy}, ${prediction}, ${measurement}, attempt ${expectedID}`);
}
function measured(snapshot, cors, impact, verifier = 'pass') {
  assert.equal(snapshot.cors, cors);
  assert.equal(snapshot.userImpact, impact);
  assert.equal(snapshot.verifier, verifier);
  const trace = JSON.parse(snapshot.trace);
  assert.equal(trace.actualBrowserCORS, false, 'model never has certification authority');
  if (cors !== 'unknown') {
    assert.equal(trace.observation.receipt.origin, snapshot.origin);
    assert.equal(trace.observation.receipt.status, 200);
    assert.equal(trace.observation.receipt.finished, true);
    assert.equal(trace.observation.cspBlocked, false, 'API CSP denial must not masquerade as CORS');
  }
  return trace;
}

async function verify() {
  let fixture;
  let session;
  let failure;
  try {
    fixture = await startFixture({ ttlMs: 120000 });
    report.origins = { ...fixture.origins };
    session = await openNative(fixture);
    report.tooling = session.pins;
    report.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion, '156.0.4314.50');
    const staticPage = await session.openStatic();
    const initial = await dom(staticPage, 'truthful static entry, no HTTP-origin measurement');
    assert.equal(initial.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(initial.mode, /Static entry/);
    assert.equal(initial.resetIsNativeFunction, true);
    await staticPage.keyboard.press('Tab');
    assert.equal(await staticPage.evaluate(() => document.activeElement.className), 'skip');
    await staticPage.keyboard.press('Tab');
    assert.equal(await staticPage.evaluate(() => document.activeElement.id), 'origin');
    await staticPage.keyboard.press('ArrowDown');
    await staticPage.keyboard.press('Tab');
    await staticPage.keyboard.press('ArrowDown');
    await staticPage.keyboard.press('ArrowDown');
    await staticPage.keyboard.press('Tab');
    await staticPage.keyboard.press('ArrowDown');
    await staticPage.keyboard.press('Tab');
    await staticPage.keyboard.press('Tab');
    assert.equal(await staticPage.evaluate(() => document.activeElement.id), 'run-attempt');
    await staticPage.keyboard.press('Enter');
    await complete(staticPage, 1);
    const staticResult = await dom(staticPage, 'real keyboard static prediction: education passes but CORS/user impact unknown');
    measured(staticResult, 'unknown', 'unknown');
    assert.equal(JSON.parse(staticResult.trace).observation.receipt, null);
    assert.equal(fixture.metrics().apiGETs, 0, 'static teaching never secretly contacts the fixture');
    await staticPage.locator('#reset-controls').focus();
    await staticPage.keyboard.press('Enter');
    assert.equal(await staticPage.locator('#history li').count(), 1);
    assert.equal(await staticPage.locator('#policy').inputValue(), 'baseline');
    await dom(staticPage, 'keyboard reset retains static unknown attempt');
    await bounded(staticPage.close(), 5000, 'Owned static page close before origin proof');

    const a = await session.openFrontend('A');
    const b = await session.openFrontend('B');
    await dom(a, 'actual owned frontend A initial DOM');
    await dom(b, 'actual owned frontend B initial DOM');
    await a.keyboard.press('Tab');
    await a.keyboard.press('Tab');
    assert.equal(await a.evaluate(() => document.activeElement.id), 'policy');
    await a.keyboard.press('Tab');
    await a.keyboard.press('Tab');
    await a.keyboard.press('Tab');
    assert.equal(await a.evaluate(() => document.activeElement.id), 'run-attempt');
    await a.keyboard.press('Enter');
    await complete(a, 1);
    measured(await dom(a, 'native cross-origin A baseline via keyboard'), 'browser-readable', 'preserved');
    measured(await run(b, 'baseline', 'readable'), 'browser-readable', 'preserved');
    measured(await run(a, 'compatible', 'readable'), 'browser-readable', 'preserved');
    measured(await run(b, 'compatible', 'readable'), 'browser-readable', 'preserved');
    measured(await run(a, 'incompatible', 'readable'), 'browser-readable', 'preserved');
    const deniedDOM = await run(b, 'incompatible', 'cors-denied');
    const denied = measured(deniedDOM, 'cors-denied', 'interrupted');
    assert.equal(denied.observation.browser, 'blocked');
    assert.equal(denied.observation.payloadVerified, false);
    assert.equal(denied.observation.receipt.allowOrigin, null);
    assert.doesNotMatch(JSON.stringify(denied.observation.receipt), /Cedar learner|fictional-profile|displayName/);
    const deniedTarget = `/profile?policy=incompatible&attempt=3&run=${denied.runId}`;
    assert.ok(session.events.console.some(event => event.page === `${fixture.origins.B}/`
      && /blocked by CORS policy/i.test(event.text)
      && event.text.includes(`${fixture.origins.api}${deniedTarget}`)
      && event.text.includes(fixture.origins.B)), 'Chromium itself must report CORS enforcement on the exact denied request');
    assert.ok(session.events.requestFailures.some(event =>
      event.url === `${fixture.origins.api}${deniedTarget}` && /ERR_FAILED/.test(event.error)));
    const deniedWire = fixture.wireSnapshot().find(entry => entry.request.origin === fixture.origins.B
      && entry.request.target === deniedTarget);
    assert.equal(deniedWire.request.remoteAddress, '127.0.0.1');
    assert.equal(deniedWire.response.status, 200);
    assert.equal(deniedWire.response.finished, true);
    assert.equal(deniedWire.response.headers['access-control-allow-origin'], undefined);
    assert.equal(deniedWire.response.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(deniedWire.response.headers.vary, 'Origin');
    report.nativeBrowserCORSMeasured = true;
    report.nativeCORS = { compatibleExistingOrigins: ['A', 'B'], deniedOrigin: 'B',
      allowedIncompatibleOrigin: 'A', deniedRequest: deniedWire, deniedBrowserDOM: deniedDOM,
      basis: 'Native browser fetch/Chromium CORS error AND exact finished API Origin/status/header receipt, not CSP/network/Node/model evidence.' };

    await activate(b, 'reset-controls');
    assert.equal(await b.locator('#history li').count(), 3);
    assert.equal(await b.locator('#history li').nth(2).getAttribute('data-impact'), 'interrupted');
    assert.equal(await b.locator('#origin').inputValue(), 'B');
    measured(await run(b, 'compatible', 'readable'), 'browser-readable', 'preserved');
    assert.equal(await b.locator('#history li').nth(2).getAttribute('data-cors'), 'cors-denied');
    await dom(b, 'B compatible recovery retains original interrupted attempt 3');

    const retained = await a.locator('#history li').count();
    await a.locator('#policy').evaluate(element => { element.options[element.selectedIndex].value = 'invalid-policy'; });
    await activate(a, 'run-attempt');
    assert.equal(await a.locator('#error').isVisible(), true);
    assert.match(await a.locator('#error').textContent(), /CONDITION/);
    assert.equal(await a.locator('#history li').count(), retained);
    assert.equal(await a.evaluate(() => document.activeElement.id), 'error');
    await dom(a, 'actual DOM malformed select condition: accessible error, no history mutation');
    await a.locator('#policy').evaluate(element => { element.options[element.selectedIndex].value = 'incompatible'; });
    await activate(a, 'reset-controls');
    assert.equal(await a.locator('#error').isVisible(), false);
    assert.equal(await a.locator('#policy').inputValue(), 'baseline');
    assert.equal(await a.evaluate(() => document.activeElement.id), 'policy');
    assert.equal(await a.locator('#history li').count(), retained);
    measured(await run(a, 'compatible', 'cors-denied'), 'browser-readable', 'preserved', 'fail');
    measured(await run(a, 'compatible', 'readable', 'not-measured'), 'unknown', 'unknown');
    measured(await run(b, 'baseline', 'readable', 'not-measured'), 'unknown', 'unknown');
    measured(await run(b, 'compatible', 'readable', 'not-measured'), 'unknown', 'unknown');
    assert.equal(await b.locator('#run-attempt').isDisabled(), true);
    await activate(b, 'reset-controls');
    assert.equal(await b.locator('#run-attempt').isDisabled(), true);
    assert.equal(await b.locator('#history li').count(), 6);
    assert.equal(await b.locator('#history li').nth(2).getAttribute('data-impact'), 'interrupted');
    await dom(b, 'six-attempt hard bound and reset do not evict denial or unknowns');

    const beforeCsp = fixture.metrics().frontendGETs;
    const cspFetch = await a.evaluate(async other => {
      try {
        await fetch(`${other}/favicon.ico`, { mode: 'cors', credentials: 'omit' });
        return 'unexpectedly-readable';
      } catch (error) { return error.name; }
    }, fixture.origins.B);
    assert.equal(cspFetch, 'TypeError');
    assert.equal(fixture.metrics().frontendGETs, beforeCsp, 'CSP-denied owned connection never reached the server');
    await a.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__s107InlineExecuted = true;';
      document.body.append(script);
    });
    assert.equal(await a.evaluate(() => window.__s107InlineExecuted === true), false);
    await a.waitForFunction(() => !document.getElementById('csp-summary').textContent.endsWith(': 0'));
    await dom(a, 'actual CSP rejects inline code and another owned frontend connection; NOT CORS proof');
    report.cspProbe = { connectResult: cspFetch, otherOwnedRequestReachedServer: false, inlineExecuted: false };

    const apiServer = fixture.servers[2];
    await bounded(new Promise((resolve, reject) => {
      apiServer.close(error => error ? reject(error) : resolve());
      apiServer.closeAllConnections();
    }), 3000, 'Exact owned API shutdown for network-failure probe');
    report.apiStoppedForNetworkFailure = !apiServer.listening;
    const networkFailure = await run(a, 'compatible', 'readable');
    const missing = measured(networkFailure, 'unknown', 'unknown');
    assert.equal(missing.observation.receipt, null);
    assert.equal(missing.observation.cspBlocked, false);
    assert.ok(session.events.requestFailures.some(event =>
      event.url === `${fixture.origins.api}/profile?policy=compatible&attempt=6&run=${missing.runId}`
      && /ERR_CONNECTION_REFUSED/.test(event.error)), 'Actual network failure remains unknown, never CORS denial');
    assert.equal(await a.locator('#history li').nth(3).getAttribute('data-verifier'), 'fail');
    assert.equal(await a.locator('#history li').nth(4).getAttribute('data-impact'), 'unknown');
    assert.equal(await a.locator('#history li').count(), 6);
    assert.equal(await a.locator('#run-attempt').isDisabled(), true);
    await dom(a, 'real transport refusal is unknown; original failed prediction and unknown attempt retained');
    await b.reload({ waitUntil: 'load' });
    await dom(b, 'new B document after API stop; original six-attempt document remains retained in prior raw observations');
    measured(await run(b, 'baseline', 'readable'), 'unknown', 'unknown');
    measured(await run(b, 'compatible', 'readable'), 'unknown', 'unknown');
    const freshBlockedDOM = await run(b, 'incompatible', 'cors-denied');
    const freshBlocked = measured(freshBlockedDOM, 'unknown', 'unknown');
    assert.notEqual(freshBlocked.runId, denied.runId);
    assert.equal(freshBlocked.observation.receipt, null);
    assert.equal(freshBlocked.observation.cspBlocked, false);
    assert.ok(fixture.wireSnapshot().some(entry => entry.receipt.runId === denied.runId
      && entry.request.target === deniedTarget && entry.response.status === 200));
    assert.ok(session.events.requestFailures.some(event =>
      event.url === `${fixture.origins.api}/profile?policy=incompatible&attempt=3&run=${freshBlocked.runId}`
      && /ERR_CONNECTION_REFUSED/.test(event.error)));
    report.freshnessProbe = { previousRunId: denied.runId, currentRunId: freshBlocked.runId,
      previousDeniedReceiptRetained: true, currentReceipt: null, currentCORS: 'unknown',
      currentUserImpact: 'unknown', currentBrowserNetworkFailure: 'ERR_CONNECTION_REFUSED' };
    assert.deepEqual(session.events.pageErrors, []);
    assert.deepEqual(session.violations, []);
    report.wireReceipts = fixture.wireSnapshot();
    report.serverMetrics = fixture.metrics();
    report.status = 'passed';
  } catch (error) {
    failure = error;
    report.status = 'failed';
    report.failures.push({ message: error.message, stack: error.stack });
  } finally {
    if (session) {
      report.events = session.events;
      report.requests = session.requests;
      report.allowlistViolations = session.violations;
      try { await session.close(); }
      catch (error) {
        failure ||= error;
        report.status = 'failed';
        report.failures.push({ stage: 'browser cleanup', message: error.message });
      }
      report.browserCleanup = session.cleanup;
    }
    if (fixture) {
      report.wireReceipts = fixture.wireSnapshot();
      try { await fixture.close(); }
      catch (error) {
        failure ||= error;
        report.status = 'failed';
        report.failures.push({ stage: 'fixture cleanup', message: error.message });
      }
      report.fixtureCleanup = fixture.cleanup();
    }
    report.finishedAtUtc = time();
    report.capture = capture;
    if (capture) {
      const snapshots = inputs.map(input => ({ path: input.path, canonicalSHA256: hash(canonical(input.bytes)),
        raw: save(`raw\\native-${id}\\inputs\\${input.path}.snapshot`, input.bytes) }));
      const raw = save(`raw\\native-${id}.snapshot`, Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
      const edgeStdout = session ? save(`raw\\native-${id}.edge.stdout.snapshot`, Buffer.from(session.pins.edgeStdout, 'base64')) : null;
      json(`browser-native-${id}.json`, { cardId: 'A-S107', status: report.status, startedAtUtc: report.startedAtUtc,
        finishedAtUtc: report.finishedAtUtc, nativeBrowserCORSMeasured: report.nativeBrowserCORSMeasured,
        nativeAzureCertified: false, broaderLifecycleQualified: false,
        nativeCORS: report.nativeCORS || null, raw, edgeStdout, snapshots,
        browserCleanup: report.browserCleanup || null, fixtureCleanup: report.fixtureCleanup || null,
        failures: report.failures });
    } else {
      try {
        assert.deepEqual(tree(), before, 'Ordinary verification must preserve every bundle/evidence byte');
        report.readOnlyBytesPreserved = true;
      } catch (error) { failure ||= error; report.status = 'failed'; report.readOnlyBytesPreserved = false; }
    }
  }
  if (failure) {
    console.error(JSON.stringify({ cardId: 'A-S107', status: 'failed', failure: failure.message,
      nativeBrowserCORSMeasured: report.nativeBrowserCORSMeasured, capture,
      readOnlyBytesPreserved: report.readOnlyBytesPreserved,
      browserCleanup: report.browserCleanup, fixtureCleanup: report.fixtureCleanup }));
    throw failure;
  }
  assert.equal(report.browserCleanup.processExited, true);
  assert.equal(report.browserCleanup.scratchRemoved, true);
  assert.equal(report.fixtureCleanup.listenersClosed, true);
  console.log(JSON.stringify({ cardId: 'A-S107', status: report.status, browserVersion: report.browserVersion,
    nativeBrowserCORSMeasured: report.nativeBrowserCORSMeasured, steps: report.steps.length,
    receipts: report.wireReceipts.length, capture, readOnly: !capture,
    cleanup: { processExited: true, scratchRemoved: true, listenersClosed: true },
    nativeAzureCertified: false, broaderLifecycleQualified: false }));
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
