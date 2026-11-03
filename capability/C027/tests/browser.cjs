'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { startLocal, closeLocal, createConductor, listenerOrigin, inspectLocal } = require('../server.cjs');
const { eventId } = require('../protocol.js');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const HELPER_SHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helper)), HELPER_SHA256, 'Only the unchanged published helper is authorized.');
const { openIsolatedLesson } = require(helper);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const proofInventory = () => fs.readdirSync(path.join(root, 'evidence'), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const file = path.join(entry.parentPath, entry.name);
    return { path: path.relative(root, file), sha256: hash(fs.readFileSync(file)) };
  }).sort((a, b) => a.path.localeCompare(b.path));
const beforeProof = proofInventory();
const attemptId = randomUUID();
const record = {
  label: '[C027][S]', cardId: 'C027', attemptId, outcome: 'not-run', runtime: process.version,
  captureRequested: capture, proofWrites: capture, startedAtUtc: new Date().toISOString(),
  mode: 'trusted file page, actual native EventSource, no route interception',
  tooling: {
    helper: 'testing\\browser\\isolated.cjs',
    verifiedPublishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60', sha256: HELPER_SHA256,
    api: 'openIsolatedLesson', loopbackFetchFulfillUsed: false,
    playwrightVersion: require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version
  },
  scope: {
    synthetic: true, nativeAzure: false, durableStorage: false, exactlyOnce: false,
    productionRuntimeValidated: false, liveAzureRuns: 0, authorizedCloudSpend: 0, foregroundLeaseUsed: false
  },
  sourceHashes: ['server.cjs', 'fixture.cjs', 'protocol.js', 'index.html', 'page.js', 'styles.css', path.join('tests', 'browser.cjs')]
    .map((file) => ({ path: file, sha256: hash(fs.readFileSync(path.join(root, file))) })),
  checks: [], requests: [], responses: [], consoleErrors: [],
  cleanup: { eventSourceClosed: false, browserClosed: false, serverClosed: false, connectionsClosed: false, conductingFileRemoved: false }
};
const checked = (name, observed) => { record.checks.push({ name, passed: true, observed }); };
const state = (page) => page.evaluate(() => globalThis.C027Conductor.snapshot());
const waitState = (page, expression) => page.waitForFunction(expression, undefined, { timeout: 12000 });

async function main() {
  let server;
  let conductor;
  let session;
  let failure;
  try {
    server = await startLocal({ lifetimeMs: 180000 });
    const origin = listenerOrigin(server);
    assert.equal(origin, `http://127.0.0.1:${server.address().port}`);
    conductor = createConductor(server);
    assert.equal(conductor.origin, origin);
    record.listener = { address: server.address(), pid: process.pid, lease: inspectLocal(server).lease, ownership: 'exact returned owned http.Server handle; no foreign ports' };
    session = await openIsolatedLesson(conductor.relativePath);
    record.browserVersion = session.browserVersion;
    const { page } = session;
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') record.consoleErrors.push(message.text()); });
    page.on('request', (request) => {
      record.requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType() });
    });
    page.on('response', (response) => {
      record.responses.push({ url: response.url(), status: response.status(), contentType: response.headers()['content-type'] || null });
    });
    await page.reload({ waitUntil: 'load' });
    await waitState(page, () => !document.getElementById('connect').disabled);
    assert.equal(new URL(page.url()).protocol, 'file:');
    const native = await page.evaluate(() => ({
      constructor: Function.prototype.toString.call(EventSource),
      close: Function.prototype.toString.call(EventSource.prototype.close),
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      endpoint: document.querySelector('meta[name="c027-origin"]').content
    }));
    assert.match(native.constructor, /\[native code\]/);
    assert.match(native.close, /\[native code\]/);
    assert.equal(native.endpoint, origin);
    assert.ok(native.csp.includes(`connect-src ${conductor.endpoint};`));
    assert.doesNotMatch(native.csp, /\*/);
    assert.match(await page.locator('#status').textContent(), /^NOT STARTED/);
    assert.equal((await state(page)).outcome, 'unknown');
    assert.equal(await page.locator('#error').getAttribute('role'), 'alert');
    assert.equal(await page.locator('#status').getAttribute('role'), 'status');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'conductor');
    checked('trusted file origin, native unmodified EventSource, exact owned SSE-path CSP and accessible initial unknown state', native);

    await page.getByLabel('Synthetic profile', { exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'mode');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'connect');
    await page.keyboard.press('Enter');
    await waitState(page, () => globalThis.C027Conductor.snapshot().receivedSequence >= 3);
    let observed = await state(page);
    assert.equal(observed.acceptedSequence, 0);
    assert.ok(observed.receipts.length >= 3);
    assert.equal(await page.evaluate(() => globalThis.C027Conductor.nativeState()), 1);
    let live = inspectLocal(server);
    assert.equal(live.activeStreams, 1);
    assert.equal(live.responseEnds, 0);
    assert.ok(live.sends.length >= 3);
    checked('multiple actual browser profile events arrived while native EventSource and the same HTTP response remain open', {
      received: observed.receipts.map(({ receivedCursor, acceptedCursorBefore }) => ({ receivedCursor, acceptedCursorBefore })),
      nativeReadyState: 1, activeStreams: live.activeStreams, responseEnds: live.responseEnds, sends: live.sends
    });
    await page.getByRole('button', { name: 'Accept next event', exact: true }).focus();
    await page.keyboard.press('Enter');
    observed = await state(page);
    assert.equal(observed.acceptedSequence, 1);
    assert.equal(observed.acceptedCursor, eventId('synthetic-001', 1));
    assert.notEqual(observed.receivedCursor, observed.acceptedCursor);
    await page.getByRole('button', { name: 'Disconnect stream', exact: true }).focus();
    await page.keyboard.press('Enter');
    observed = await state(page);
    assert.equal(observed.phase, 'disconnected');
    assert.equal(observed.acceptedSequence, 1);
    assert.equal(observed.pendingSequences.length, 0);
    assert.equal(await page.evaluate(() => globalThis.C027Conductor.nativeState()), 2);
    record.beforeResume = observed;
    checked('real keyboard acceptance and disconnect retain event one, not the later received cursor', observed);

    await page.getByRole('button', { name: 'Connect / resume accepted', exact: true }).focus();
    await page.keyboard.press('Enter');
    await waitState(page, () => globalThis.C027Conductor.snapshot().tailSeen);
    observed = await state(page);
    assert.deepEqual(observed.receipts.filter((receipt) => receipt.attempt === 2).map((receipt) => JSON.parse(receipt.data).sequence), [2, 3, 4, 5, 6]);
    assert.equal(observed.acceptedSequence, 1);
    for (let sequence = 2; sequence <= 6; sequence++) {
      await page.getByRole('button', { name: 'Accept next event', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal((await state(page)).acceptedSequence, sequence);
    }
    observed = await state(page);
    assert.equal(observed.phase, 'verified-local');
    assert.deepEqual(observed.acceptedEvents.map((event) => event.sequence), [1, 2, 3, 4, 5, 6]);
    live = inspectLocal(server);
    assert.deepEqual(live.streamRequests.map((request) => request.acceptedAfter), ['START', eventId('synthetic-001', 1)]);
    assert.equal(live.streamRequests.every((request) => request.lastEventIdHeader === null), true);
    assert.equal(live.activeStreams, 1);
    assert.equal(live.responseEnds, 0);
    assert.equal(await page.evaluate(() => globalThis.C027Conductor.nativeState()), 1);
    record.acceptedResume = observed;
    checked('native accepted-cursor resume replays the ordered suffix including previously received but unaccepted events; no receipt-header skipping', {
      requests: live.streamRequests, acceptedSequences: observed.acceptedEvents.map((event) => event.sequence),
      currentNativeState: 1, activeStreams: live.activeStreams, responseEnds: live.responseEnds
    });
    if (capture) {
      const screenshot = `browser-${attemptId}.png`;
      assert.equal(fs.existsSync(path.join(root, 'evidence', screenshot)), false, 'Retained screenshots cannot be overwritten.');
      await page.screenshot({ path: path.join(root, 'evidence', screenshot), fullPage: true });
      record.screenshot = path.join('capability', 'C027', 'evidence', screenshot);
    }

    for (const [mode, phase, code] of [
      ['gap', 'error', 'EVENT_GAP'],
      ['duplicate', 'error', 'DUPLICATE_EVENT'],
      ['invalid', 'error', 'INVALID_JSON'],
      ['drop', 'unknown', 'TRANSPORT_INTERRUPTED']
    ]) {
      await page.getByRole('button', { name: 'Reset conductor', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal((await state(page)).acceptedCursor, 'START');
      assert.equal((await state(page)).outcome, 'unknown');
      await page.getByLabel('Declared stream mode', { exact: true }).selectOption(mode);
      await page.getByRole('button', { name: 'Connect / resume accepted', exact: true }).click();
      await waitState(page, () => ['error', 'unknown'].includes(globalThis.C027Conductor.snapshot().phase));
      observed = await state(page);
      assert.equal(observed.phase, phase);
      assert.equal(observed.error.code, code);
      assert.equal(observed.acceptedCursor, 'START');
      assert.equal(observed.acceptedSequence, 0);
      assert.ok(observed.receipts.length >= 1);
      assert.equal(await page.evaluate(() => globalThis.C027Conductor.nativeState()), 2);
      assert.equal(await page.getByRole('button', { name: 'Accept next event', exact: true }).isDisabled(), true);
      assert.match(await page.locator('#error').textContent(), new RegExp(code));
      checked(`actual native ${mode} is ${phase}/${code}, closes EventSource and never advances acceptance`, observed);
    }

    await page.getByRole('button', { name: 'Reset conductor', exact: true }).click();
    assert.equal((await state(page)).acceptedSequence, 0);
    await page.getByLabel('Synthetic profile', { exact: true }).selectOption('synthetic-002');
    await page.getByLabel('Declared stream mode', { exact: true }).selectOption('normal');
    await page.getByRole('button', { name: 'Connect / resume accepted', exact: true }).click();
    await waitState(page, () => globalThis.C027Conductor.snapshot().tailSeen);
    for (let index = 0; index < 6; index++) await page.getByRole('button', { name: 'Accept next event', exact: true }).click();
    observed = await state(page);
    assert.equal(observed.phase, 'verified-local');
    assert.equal(observed.acceptedEvents.every((event) => event.payload.profile.id === 'synthetic-002'), true);
    assert.deepEqual([...new Set(observed.acceptedEvents.map((event) => event.payload.stamp.implementationVersion))], ['1.0.0', '2.0.0']);
    checked('reset clears cursors, unlocks profile selection and a second real C020 profile retains v1/v2 lineage', observed);
    await page.getByRole('button', { name: 'Disconnect stream', exact: true }).click();

    const acceptedBeforeProbes = await state(page);
    for (const [cursor, expectedCode, expectedStatus] of [
      ['not-a-cursor', 'INVALID_CURSOR', 400],
      ['C027:r1:synthetic-002:000007', 'FUTURE_CURSOR', 416],
      [eventId('synthetic-001', 1), 'CURSOR_STREAM_MISMATCH', 409]
    ]) {
      const probe = await page.evaluate(async ({ endpoint, cursor }) => {
        const url = new URL(endpoint);
        url.search = new URLSearchParams({ profileId: 'synthetic-002', version: 'r1', mode: 'normal', after: cursor });
        const native = new EventSource(url.href, { withCredentials: false });
        let messages = 0;
        let timer;
        let outcome;
        try {
          outcome = await new Promise((resolve) => {
            native.addEventListener('profile', () => { messages++; });
            native.onopen = () => resolve({ outcome: 'unexpected-open' });
            native.onerror = (event) => resolve({ outcome: 'unknown', eventType: event.type, httpStatusExposed: 'status' in event });
            timer = setTimeout(() => resolve({ outcome: 'timed-out' }), 5000);
          });
        } finally {
          clearTimeout(timer);
          native.close();
        }
        return { ...outcome, readyStateAfterClose: native.readyState, messages };
      }, { endpoint: conductor.endpoint, cursor });
      assert.equal(probe.outcome, 'unknown');
      assert.equal(probe.httpStatusExposed, false);
      assert.equal(probe.messages, 0);
      assert.equal(probe.readyStateAfterClose, 2);
      const actualFailure = inspectLocal(server).failures.at(-1);
      assert.equal(actualFailure.code, expectedCode);
      assert.equal(actualFailure.status, expectedStatus);
      checked(`actual native cursor probe ${expectedCode} receives no success event and is honestly unknown to EventSource`, { cursor, nativeObservation: probe, serverObservation: actualFailure });
    }
    assert.deepEqual(await state(page), acceptedBeforeProbes, 'Negative native probes must not mutate accepted conductor evidence.');
    const requestCount = inspectLocal(server).httpRequests.length;
    const csp = await page.evaluate(async (blockedUrl) => {
      const violations = [];
      const listener = (event) => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      document.addEventListener('securitypolicyviolation', listener);
      const script = document.createElement('script');
      script.textContent = 'globalThis.__c027InlineShouldNotRun = true;';
      document.body.append(script);
      let blocked = false;
      try { await fetch(blockedUrl); } catch { blocked = true; }
      await new Promise((resolve) => setTimeout(resolve, 100));
      script.remove();
      document.removeEventListener('securitypolicyviolation', listener);
      return { violations, fetchBlocked: blocked, inlineRan: globalThis.__c027InlineShouldNotRun === true };
    }, `${origin}/c027/forbidden-same-owned-listener`);
    assert.equal(csp.fetchBlocked, true);
    assert.equal(csp.inlineRan, false);
    assert.ok(csp.violations.some((violation) => violation.directive === 'connect-src'));
    assert.ok(csp.violations.some((violation) => violation.directive === 'script-src-elem'));
    assert.equal(inspectLocal(server).httpRequests.length, requestCount, 'A blocked CSP request must not reach the listener at all.');
    checked('effective browser CSP blocks inline code and a forbidden path on this same owned listener; no foreign-port probe', csp);
    assert.deepEqual(pageErrors, []);
    const requests = record.requests.filter((request) => request.url.startsWith('http:'));
    assert.ok(requests.length >= 7);
    for (const request of requests) {
      const url = new URL(request.url);
      assert.equal(url.origin, origin);
      assert.equal(request.method, 'GET');
      if (request.url === `${origin}/c027/forbidden-same-owned-listener`) continue;
      assert.equal(url.pathname, new URL(conductor.endpoint).pathname);
      assert.equal(request.resourceType, 'eventsource');
    }
    assert.ok(record.responses.filter((response) => response.contentType?.startsWith('text/event-stream')).length >= 7);
    record.finalListenerObservation = inspectLocal(server);
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try {
        record.sourceCleanup = await session.page.evaluate(() => globalThis.C027Conductor.cleanup());
        record.cleanup.eventSourceClosed = record.sourceCleanup.closed && record.sourceCleanup.readyState === 2;
      } catch (error) {
        record.cleanup.sourceError = error.message;
      }
      try { await session.close(); record.cleanup.browserClosed = true; }
      catch (error) { record.cleanup.browserError = error.message; failure ||= error; }
    }
    if (server) {
      try {
        await closeLocal(server);
        await new Promise((resolve) => setImmediate(resolve));
        const stopped = inspectLocal(server);
        record.cleanup.serverClosed = !server.listening && stopped.stopped;
        record.cleanup.connectionsClosed = stopped.activeStreams === 0 && stopped.activeSockets === 0 && stopped.activeTimers === 0;
        record.cleanup.conductingFileRemoved = stopped.generatedFiles.length === 0 &&
          (!conductor || !fs.existsSync(path.join(repo, conductor.relativePath)));
        record.finalCleanupObservation = stopped;
      } catch (error) { record.cleanup.serverError = error.message; failure ||= error; }
    }
    record.finishedAtUtc = new Date().toISOString();
    if (record.outcome === 'passed' && !Object.values(record.cleanup).every((value) => value === true)) {
      record.outcome = 'failed';
      failure ||= new Error('Exact owned lifecycle cleanup did not pass.');
    }
    if (capture) {
      fs.writeFileSync(path.join(root, 'evidence', `browser-${attemptId}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    } else {
      assert.deepEqual(proofInventory(), beforeProof, 'Normal verification must not write or rewrite retained proof.');
    }
    console.log(JSON.stringify(record));
    if (failure) throw failure;
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
