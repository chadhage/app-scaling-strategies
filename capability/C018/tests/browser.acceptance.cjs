'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { repo, sha, checkDependencies } = require('./provenance.cjs');
const { startInspection, csp } = require('..\\server.cjs');
const { newFixture } = require('./fixture.cjs');
const { request } = require('./http-client.cjs');

checkDependencies();
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha(fs.readFileSync(helperPath)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLoopback, openIsolatedLesson } = require(helperPath);

function signedTooling() {
  const script = "$e=Get-Item -LiteralPath 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';" +
    "$s=Get-AuthenticodeSignature -LiteralPath $e.FullName;" +
    "[ordered]@{path=$e.FullName;version=$e.VersionInfo.ProductVersion;status=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress";
  const observed = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 65536, windowsHide: true });
  assert.equal(observed.status, 0, observed.stderr);
  const edge = JSON.parse(observed.stdout);
  assert.equal(edge.status, 'Valid');
  assert.match(edge.signer, /CN=Microsoft Corporation/);
  assert.match(edge.version, /^156\./);
  const playwright = JSON.parse(fs.readFileSync(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'), 'utf8')).version;
  assert.equal(playwright, '1.56.1');
  assert.match(process.version, /^v22\./);
  return { node: process.version, playwright, edge };
}

async function keyboardReach(page, id, visited) {
  for (let index = 0; index < 10; index++) {
    const active = await page.evaluate(() => document.activeElement.id);
    visited.push(active || '(body)');
    if (active === id) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`Keyboard could not reach ${id}; visited ${visited.join(', ')}`);
}

async function keyboardRead(page, runId, expected, visited) {
  await keyboardReach(page, 'run-id', visited);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(runId);
  await keyboardReach(page, 'reopen', visited);
  await page.keyboard.press('Enter');
  await page.waitForFunction((status) => document.getElementById('status').dataset.outcome === status, expected, { timeout: 20000 });
}

async function domObservation(page) {
  return page.evaluate(() => ({
    status: document.getElementById('status').textContent,
    outcome: document.getElementById('status').dataset.outcome,
    namespace: document.getElementById('namespace').textContent,
    runId: document.getElementById('observed-id').textContent,
    epoch: document.getElementById('epoch').textContent,
    runStatus: document.getElementById('run-status').textContent,
    completedStep: document.getElementById('completed').textContent,
    pendingStep: document.getElementById('pending').textContent,
    readerPid: document.getElementById('reader-pid').textContent,
    digest: document.getElementById('digest').textContent,
    receiptText: document.getElementById('receipt').value,
    receiptReadOnly: document.getElementById('receipt').readOnly,
    journal: [...document.querySelectorAll('#journal li')].map((item) => item.textContent),
    activeElement: document.activeElement.id,
  }));
}

function exactDiskObservation(observed, fixture, runId, epoch) {
  const bytes = fs.readFileSync(path.join(fixture.location.root, runId, `epoch-00${epoch}.json`));
  const disk = JSON.parse(bytes);
  const receipt = JSON.parse(observed.receiptText);
  assert.deepEqual(receipt.state, disk.state);
  assert.deepEqual(receipt.acknowledgment, disk.acknowledgment);
  assert.equal(receipt.stateSha256, disk.stateSha256);
  assert.equal(receipt.writesPerformed, 0);
  assert.equal(observed.namespace, fixture.namespace);
  assert.equal(observed.runId, runId);
  assert.equal(observed.epoch, String(epoch));
  assert.equal(observed.runStatus, disk.state.record.status);
  assert.equal(observed.completedStep, disk.state.record.completedStep);
  assert.equal(observed.pendingStep, disk.state.record.pendingStep);
  assert.equal(observed.receiptReadOnly, true);
  assert.notEqual(receipt.pid, process.pid);
  return receipt;
}

test('signed isolated Edge observes real C015 pending/completed progress, reconnects with fresh readers, and retains explicit errors without writes', async (t) => {
  const tooling = signedTooling();
  const fixture = newFixture();
  const emptyFixture = newFixture();
  const hosts = [];
  const sessions = new Set();
  const cleanup = [];
  const observations = { tooling, transport: 'Guarded buffered real HTTP forwarding through approved openIsolatedLoopback; not native Chromium TCP certification.',
    keyboardVisited: [], fixtures: [fixture.namespace, emptyFixture.namespace], live: {}, errors: [], cleanup };

  async function open(host) {
    const session = await openIsolatedLoopback('capability\\C018\\index.html', host.server);
    sessions.add(session);
    assert.match(session.browserVersion, /^156\./);
    return session;
  }
  async function closeSession(session) {
    const browser = session.page.context().browser();
    await session.close();
    assert.equal(browser.isConnected(), false);
    sessions.delete(session);
    cleanup.push({ kind: 'exact-owned-isolated-browser', awaitedClose: true, isConnected: browser.isConnected() });
  }
  async function hostFor(namespace) {
    const host = await startInspection(namespace);
    hosts.push(host);
    assert.equal(host.probe.allowed, true);
    assert.equal(host.probe.executed, false);
    return host;
  }
  try {
    for (const [runId, epoch] of [
      ['synthetic-run-001', 1], ['synthetic-run-001', 2],
      ['synthetic-run-002', 1], ['synthetic-run-002', 2], ['synthetic-run-002', 3],
    ]) {
      const written = fixture.write(runId, epoch);
      assert.equal(written.exitCode, 0, written.stderr);
    }
    const originalBytes = new Map();
    for (const runId of ['synthetic-run-001', 'synthetic-run-002']) {
      for (const name of fs.readdirSync(path.join(fixture.location.root, runId))) {
        const file = path.join(fixture.location.root, runId, name);
        originalBytes.set(file, fs.readFileSync(file));
      }
    }
    const host = await hostFor(fixture.namespace);
    const session = await open(host);
    const page = session.page;
    const consoleErrors = [];
    page.on('console', (event) => { if (event.type() === 'error') consoleErrors.push(event.text()); });
    assert.equal(await page.title(), 'C018 — Reopen actual synthetic run progress');
    assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#pending').textContent(), 'UNKNOWN');
    assert.equal(await page.locator('#receipt').inputValue(), '');
    assert.equal(await page.locator('#reconnect').isDisabled(), true);
    assert.equal(await page.locator('#banner').evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop) > 0), true);
    const initialResponse = await request(host.url, '/');
    assert.equal(initialResponse.headers['content-security-policy'], csp);
    assert.deepEqual(initialResponse.bytes, fs.readFileSync(path.resolve(__dirname, '..', 'index.html')));

    await keyboardRead(page, 'synthetic-run-001', 'OBSERVED', observations.keyboardVisited);
    observations.live.first = await domObservation(page);
    const first = exactDiskObservation(observations.live.first, fixture, 'synthetic-run-001', 2);
    assert.equal(first.state.record.pendingStep, 'finish');

    await keyboardReach(page, 'reconnect', observations.keyboardVisited);
    await page.keyboard.press('Enter');
    await page.waitForFunction((pid) => document.getElementById('status').dataset.outcome === 'OBSERVED' &&
      document.getElementById('reader-pid').textContent !== pid, String(first.pid), { timeout: 20000 });
    observations.live.reconnect = await domObservation(page);
    const reconnected = exactDiskObservation(observations.live.reconnect, fixture, 'synthetic-run-001', 2);
    assert.notEqual(reconnected.pid, first.pid);
    assert.deepEqual(reconnected.state, first.state);
    assert.deepEqual(reconnected.acknowledgment, first.acknowledgment);

    await keyboardRead(page, 'synthetic-run-002', 'OBSERVED', observations.keyboardVisited);
    observations.live.completed = await domObservation(page);
    const completed = exactDiskObservation(observations.live.completed, fixture, 'synthetic-run-002', 3);
    assert.equal(completed.state.record.pendingStep, 'none');
    assert.equal(completed.state.record.completedStep, 'finish');

    await keyboardRead(page, 'synthetic-run-003', 'UNKNOWN', observations.keyboardVisited);
    const unknown = await domObservation(page);
    assert.match(unknown.status, /UNKNOWN_RUN_ID/);
    assert.equal(unknown.pendingStep, 'UNKNOWN');
    assert.equal(unknown.receiptText, '');
    observations.errors.push({ kind: 'actual-browser-local-exact-ID-denial', observation: unknown });
    const unknownHttp = await request(host.url, '/api/runs/synthetic-run-003');
    assert.equal(unknownHttp.status, 400);
    observations.errors.push({ kind: 'actual-Node-HTTP-exact-ID-denial', status: unknownHttp.status, error: JSON.parse(unknownHttp.bytes) });

    await keyboardReach(page, 'reset', observations.keyboardVisited);
    await page.keyboard.press('Enter');
    const reset = await domObservation(page);
    assert.equal(reset.activeElement, 'run-id');
    assert.equal(reset.receiptText, '');
    assert.equal(reset.journal.some((entry) => entry.includes('UNKNOWN_RUN_ID')), true);
    observations.live.reset = reset;
    await keyboardRead(page, 'synthetic-run-001', 'OBSERVED', observations.keyboardVisited);
    assert.equal((await domObservation(page)).journal.some((entry) => entry.includes('UNKNOWN_RUN_ID')), true);

    const cspObserved = await page.evaluate(async () => {
      const violations = [];
      addEventListener('securitypolicyviolation', (event) => violations.push({
        directive: event.effectiveDirective, blockedURI: event.blockedURI,
      }));
      globalThis.c018InlineExecuted = false;
      const script = document.createElement('script');
      script.textContent = 'globalThis.c018InlineExecuted = true;';
      document.body.append(script);
      const style = document.createElement('style');
      style.textContent = '#banner { display: none; }';
      document.head.append(style);
      let foreignDenied = false;
      try { await fetch('http://127.0.0.1:1/foreign'); } catch { foreignDenied = true; }
      let writeDenied = false;
      try { await fetch('/api/runs/synthetic-run-001', { method: 'POST' }); } catch { writeDenied = true; }
      const form = document.createElement('form');
      form.action = `${location.origin}/api/runs/synthetic-run-001`;
      document.body.append(form);
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { inlineExecuted: globalThis.c018InlineExecuted, bannerDisplay: getComputedStyle(document.getElementById('banner')).display,
        foreignDenied, writeDenied, violations, pageURL: location.href };
    });
    assert.equal(cspObserved.inlineExecuted, false);
    assert.notEqual(cspObserved.bannerDisplay, 'none');
    assert.equal(cspObserved.foreignDenied, true);
    assert.equal(cspObserved.writeDenied, true);
    assert.equal(cspObserved.violations.some((item) => item.directive.startsWith('script-src')), true);
    assert.equal(cspObserved.violations.some((item) => item.directive.startsWith('style-src')), true);
    assert.equal(cspObserved.violations.some((item) => item.directive === 'connect-src'), true);
    assert.equal(cspObserved.violations.some((item) => item.directive === 'form-action'), true);
    assert.equal(cspObserved.pageURL, `${host.url}/`);
    assert.equal(host.requests.some((item) => item.method === 'POST'), false);
    observations.live.csp = cspObserved;

    await host.close();
    assert.equal(host.server.listening, false);
    await assert.rejects(request(host.url, '/'));
    await keyboardReach(page, 'reconnect', observations.keyboardVisited);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').dataset.outcome === 'UNKNOWN', null, { timeout: 20000 });
    const connectionError = await domObservation(page);
    assert.match(connectionError.status, /READER_UNAVAILABLE/);
    assert.equal(connectionError.pendingStep, 'UNKNOWN');
    assert.equal(connectionError.receiptText, '');
    assert.equal(connectionError.journal.some((entry) => entry.includes('UNKNOWN_RUN_ID')), true);
    observations.errors.push({ kind: 'actual-closed-own-listener-and-browser-handle-guard-failure', observation: connectionError,
      uninterruptedResult: false, rawConsoleErrors: consoleErrors });
    await closeSession(session);

    const freshHost = await hostFor(fixture.namespace);
    const freshSession = await open(freshHost);
    await keyboardRead(freshSession.page, 'synthetic-run-001', 'OBSERVED', observations.keyboardVisited);
    observations.live.freshClient = await domObservation(freshSession.page);
    const freshClient = exactDiskObservation(observations.live.freshClient, fixture, 'synthetic-run-001', 2);
    assert.deepEqual(freshClient.state, first.state);
    assert.deepEqual(freshClient.acknowledgment, first.acknowledgment);
    assert.notEqual(freshClient.pid, first.pid);
    assert.notEqual(freshClient.pid, reconnected.pid);
    assert.equal(await freshSession.page.getByText("A fresh client cannot recover another client's journal:", { exact: false }).count(), 1);
    await closeSession(freshSession);
    await freshHost.close();

    const emptyHost = await hostFor(emptyFixture.namespace);
    const emptySession = await open(emptyHost);
    await keyboardRead(emptySession.page, 'synthetic-run-001', 'UNKNOWN', observations.keyboardVisited);
    const missing = await domObservation(emptySession.page);
    assert.match(missing.status, /STATE_MISSING/);
    assert.equal(missing.receiptText, '');
    assert.equal(missing.pendingStep, 'UNKNOWN');
    assert.equal(fs.existsSync(emptyFixture.location.root), false);
    observations.errors.push({ kind: 'actual-browser-C015-missing-disk-state', observation: missing });
    await keyboardReach(emptySession.page, 'reset', observations.keyboardVisited);
    await emptySession.page.keyboard.press('Enter');
    assert.equal((await domObservation(emptySession.page)).journal.some((entry) => entry.includes('STATE_MISSING')), true);
    await closeSession(emptySession);
    await emptyHost.close();

    const staticSession = await openIsolatedLesson('capability\\C018\\index.html');
    sessions.add(staticSession);
    const staticPage = staticSession.page;
    assert.match(await staticPage.locator('#transport').textContent(), /UNKNOWN: Static file, not a live disk read or reconnect/);
    assert.equal(await staticPage.locator('#reopen').isDisabled(), true);
    assert.equal(await staticPage.locator('#reconnect').isDisabled(), true);
    assert.equal(await staticPage.locator('#pending').textContent(), 'UNKNOWN');
    assert.equal(await staticPage.locator('#receipt').inputValue(), '');
    observations.live.static = await domObservation(staticPage);
    await closeSession(staticSession);
    for (const [file, bytes] of originalBytes) assert.deepEqual(fs.readFileSync(file), bytes);
    observations.live.diskUnchangedAcrossBrowserControls = true;
    observations.live.writers = fixture.observations;
    observations.live.listeners = hosts.map((owned) => ({ url: owned.url, currentC001LocalProbe: owned.probe, requests: owned.requests }));
  } finally {
    const errors = [];
    for (const session of sessions) {
      try { await closeSession(session); } catch (error) { errors.push(error); }
    }
    for (const host of hosts) {
      try {
        await host.close();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(host.server.listening, false);
        assert.equal(host.server.address(), null);
        assert.equal(host.socketCount(), 0);
        assert.equal(host.server.listenerCount('request'), 0);
        assert.equal(host.server.listenerCount('connection'), 0);
        cleanup.push({ kind: 'exact-owned-node-listener', url: host.url, listening: false, socketCount: host.socketCount(),
          requestListeners: host.server.listenerCount('request'), connectionListeners: host.server.listenerCount('connection') });
      } catch (error) { errors.push(error); }
    }
    for (const own of [fixture, emptyFixture]) {
      try {
        await own.cleanup();
        cleanup.push({ kind: 'explicit-C015-public-setup-files-only', namespace: own.namespace,
          removed: own.removed, namespaceAbsent: !fs.existsSync(own.location.root), categoryRootNotDeleted: true });
      } catch (error) { errors.push(error); }
    }
    t.diagnostic(JSON.stringify(observations));
    if (errors.length) throw new AggregateError(errors, 'Exact owned browser/listener/fixture cleanup failed.');
  }
});
