'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const api = require(path.join(root, 'server.cjs'));
const pins = require(path.join(root, 'imports.json'));
const contract = require(path.join(root, '..', 'C020', 'contract.js'));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const record = {
  cardId: 'C033', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  mode: 'isolated-headless, guarded buffered actual loopback HTTP and actual DOM',
  testRuntime: process.version, productionRuntimeValidated: false,
  integratedForegroundLeaseUsed: false, helperPatched: false, nativeLauncherBypass: false,
  businessData: 'synthetic', fullJourneyQualified: false, nativeTransportQualified: false,
  liveAzureRuns: 0, authorizedCloudSpend: 0, checks: [],
  cleanup: { browserClosed: false, staticBrowserClosed: false, serverClosed: false, listenerRefusedAfterClose: false }
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let directory;
if (capture) {
  const rawRoot = path.join(root, 'evidence', 'raw');
  fs.mkdirSync(rawRoot, { recursive: true });
  directory = process.env.C033_CAPTURE_DIR || path.join(rawRoot, `browser-${randomUUID()}`);
  assert.equal(path.dirname(path.resolve(directory)), rawRoot, 'Capture must stay inside the own closed evidence/raw root.');
  assert.match(path.basename(directory), /^browser-[0-9a-f-]{36}$/);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  assert.equal(fs.realpathSync(directory), path.resolve(directory), 'No capture symlinks.');
  assert.deepEqual(fs.readdirSync(directory), [], 'A capture directory must be new and empty; never overwrite a previous run.');
}
function write(name, bytes) {
  if (!capture) return;
  assert.ok(['summary.json', 'before-first-read.html', 'between-reads.html', 'budget-miss.html',
    'failed-reply.html', 'stop-unknown.html', 'reset-history.html', 'static-unavailable.html'].includes(name));
  fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
}
function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function signature(callerNodePid = null) {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'signed-edge.ps1')];
  if (callerNodePid !== null) args.push('-CallerNodePid', String(callerNodePid));
  const result = await execute('pwsh.exe', args, { timeout: 10000, windowsHide: true, maxBuffer: 128 * 1024 });
  return JSON.parse(result.stdout);
}
async function refused(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/', headers: { Connection: 'close' } }, (response) => {
      response.resume();
      reject(new Error('Exact owned listener still responded after awaited close.'));
    });
    request.on('error', (error) => error.code === 'ECONNREFUSED' ? resolve(true) : reject(error));
    request.setTimeout(1500, () => request.destroy(new Error('Post-close own-port probe did not settle.')));
  });
}

async function main() {
  let server;
  let session;
  let staticSession;
  let port;
  const failures = [];
  const nodeStart = performance.now();
  try {
    assert.match(process.version, /^v22\./, 'Only approved Node 22 test tooling is admitted; not production Node 24 validation.');
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    const current = await api.assertCurrentConsent();
    record.consent = { observedAtUtc: current.observedAtUtc, ledgerRevision: current.ledgerRevision, action: current.permission.action, allowed: current.permission.allowed };
    record.installedSignedEdge = await signature();
    const helperFile = path.join(repository, 'testing', 'browser', 'isolated.cjs');
    assert.equal(hash(fs.readFileSync(helperFile)), pins.browserHelperRawSha256, 'Published shared helper raw bytes must match exactly.');
    record.helperRawSha256 = pins.browserHelperRawSha256;
    server = await api.startLocal();
    port = server.address().port;
    const origin = api.observations(server).origin;
    record.server = { actualCallerPid: process.pid, origin, address: server.address(), serverTtlMs: 120000 };
    const { openIsolatedLoopback, openIsolatedLesson } = require(helperFile);
    assert.equal(typeof openIsolatedLoopback, 'function');
    session = await openIsolatedLoopback(path.join('capability', 'C033', 'index.html'), server);
    record.browserVersion = session.browserVersion;
    assert.match(record.browserVersion, /^156\./);
    record.actualSignedEdge = await signature(process.pid);
    assert.equal(record.actualSignedEdge.fileVersion, record.browserVersion);
    assert.ok(record.actualSignedEdge.actualOwnedBrowserPid > 0);
    checked('actual caller-owned signed Edge 156 / offline Playwright 1.56.1 / Node 22, pinned helper and strict current consent', {
      browserVersion: record.browserVersion, browserPid: record.actualSignedEdge.actualOwnedBrowserPid,
      nodePid: process.pid, signature: record.actualSignedEdge.authenticodeStatus
    });
    const { page } = session;
    page.setDefaultTimeout(5000);
    const pageErrors = [];
    const browserRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => browserRequests.push({ url: request.url(), method: request.method() }));
    const documentResponse = await page.reload({ waitUntil: 'load', timeout: 10000 });
    record.documentHeaders = await documentResponse.allHeaders();
    assert.equal(record.documentHeaders['content-security-policy'], api.CSP);
    assert.equal(record.documentHeaders['access-control-allow-origin'], undefined);
    await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 5000 });
    assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.locator('#mode').textContent(), /^READY - actual own read-only/);
    assert.match(await page.locator('#status').textContent(), /^Not run/);
    assert.equal(api.observations(server).providerRequests.length, 0);
    checked('actual loaded DOM starts without provider requests or any successful pause/timing claim', await page.locator('#status').textContent());

    const readState = () => page.locator('#state').textContent().then(JSON.parse);
    const observed = () => page.evaluate(() => ({
      monotonicNow: performance.now(), state: JSON.parse(document.getElementById('state').textContent),
      inputs: Object.fromEntries(['profile', 'draft', 'boundary', 'budget'].map((id) => [id, {
        value: document.getElementById(id).value, disabled: document.getElementById(id).disabled
      }]))
    }));
    const phase = (expected) => page.waitForFunction((value) => document.getElementById('status').dataset.phase === value, expected, { timeout: 5000 });
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press(key);
    };
    const start = async ({ boundary = 'before-first-read', profileId = 'synthetic-001', draft = 'synthetic-draft-A', budgetMs = 6000 } = {}) => {
      for (const [id, value] of [['profile', profileId], ['draft', draft], ['boundary', boundary], ['budget', String(budgetMs)]]) {
        await page.locator(`#${id}`).selectOption(value);
      }
      await page.locator('#budget').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start');
      await page.keyboard.press('Enter');
      await phase('paused');
      return readState();
    };
    const providerCount = () => api.observations(server).providerRequests.length;
    const held = async (boundary, expectedRequests, base) => {
      const before = await observed();
      assert.equal(before.state.phase, 'paused');
      assert.equal(before.state.original.boundary, boundary);
      assert.equal(before.state.requests, expectedRequests);
      assert.equal(providerCount() - base, expectedRequests, 'Actual server request count, not just painted DOM.');
      assert.ok(Object.values(before.inputs).every((field) => field.disabled));
      await wait(300);
      await page.waitForFunction((startedAt) => {
        const state = JSON.parse(document.getElementById('state').textContent);
        return state.phase === 'paused' && state.elapsedMs > startedAt && performance.now() - state.sampledAt < 125;
      }, before.state.elapsedMs, { timeout: 3000 });
      const after = await observed();
      assert.equal(providerCount() - base, expectedRequests, 'No next provider action was released during the actual hold.');
      assert.equal(after.state.requests, expectedRequests);
      assert.equal(after.state.attemptId, before.state.attemptId);
      assert.equal(after.state.startedAt, before.state.startedAt);
      assert.equal(after.state.deadline, before.state.deadline);
      assert.deepEqual(after.state.original, before.state.original);
      assert.deepEqual(after.state.acknowledgements, before.state.acknowledgements);
      assert.deepEqual(after.inputs, before.inputs);
      const actualClockDelta = after.monotonicNow - before.monotonicNow;
      const actualElapsedDelta = after.state.elapsedMs - before.state.elapsedMs;
      const actualPausedDelta = after.state.pausedMs - before.state.pausedMs;
      assert.ok(actualClockDelta > 0 && actualElapsedDelta > 0 && actualPausedDelta > 0);
      assert.ok(Math.abs(actualElapsedDelta - actualClockDelta) <= 150, 'DOM elapsed tracks the independent actual performance.now samples.');
      assert.ok(Math.abs(actualPausedDelta - actualClockDelta) <= 150, 'Actual paused duration remains measurable, not a fixed value.');
      return { before, after, actualClockDelta, actualElapsedDelta, actualPausedDelta, actualServerRequestsHeld: expectedRequests };
    };
    const resumed = async (base, original, expectedPhase = 'complete') => {
      await press('resume', 'Space');
      await phase(expectedPhase);
      const state = await readState();
      assert.equal(state.attemptId, original.attemptId);
      assert.deepEqual(state.original, original.original);
      assert.equal(state.startedAt, original.startedAt);
      assert.equal(state.deadline, original.deadline);
      if (expectedPhase === 'complete') {
        assert.equal(providerCount() - base, 2);
        assert.equal(state.requests, 2);
        assert.equal(state.responses, 2);
        assert.equal(state.acknowledgements.length, 2);
        const expected = contract.profiles.find((profile) => profile.id === state.original.profileId);
        for (const [index, implementation] of ['v1', 'v2'].entries()) {
          assert.deepEqual(state.acknowledgements[index].profile, expected);
          assert.deepEqual(state.acknowledgements[index].stamp, contract.stamps[implementation]);
        }
        assert.ok(state.elapsedMs >= state.pausedMs);
        assert.equal(state.fullJourneyQualified, false);
      }
      return state;
    };
    let base = providerCount();
    let original = await start();
    const beforeHold = await held('before-first-read', 0, base);
    write('before-first-read.html', await page.content());
    if (capture) {
      const file = path.join(directory, 'before-first-read.png');
      assert.equal(fs.existsSync(file), false);
      await page.screenshot({ path: file, fullPage: true, timeout: 5000 });
    }
    const first = await resumed(base, original);
    checked('actual Tab/Enter start, zero-request boundary hold, increasing actual monotonic time and Space Resume preserve original identity/draft/profile', {
      ...beforeHold, finalElapsedMs: first.elapsedMs, finalPausedMs: first.pausedMs, actualRequestsAfterResume: providerCount() - base
    });

    await press('reset-view', 'Space');
    await phase('idle');
    base = providerCount();
    original = await start({ boundary: 'between-reads', draft: 'synthetic-draft-B' });
    assert.equal(original.acknowledgements.length, 1);
    assert.deepEqual(original.acknowledgements[0].profile, contract.profiles[0]);
    const betweenHold = await held('between-reads', 1, base);
    write('between-reads.html', await page.content());
    if (capture) {
      const file = path.join(directory, 'between-reads.png');
      assert.equal(fs.existsSync(file), false);
      await page.screenshot({ path: file, fullPage: true, timeout: 5000 });
    }
    const between = await resumed(base, original);
    checked('actual acknowledged v1 is held before v2, with unchanged synthetic state and two actual differing implementation replies after keyboard Resume', {
      ...betweenHold, finalElapsedMs: between.elapsedMs, finalPausedMs: between.pausedMs,
      observedStamps: between.acknowledgements.map((value) => value.stamp), actualRequestsAfterResume: providerCount() - base
    });

    await press('reset-view');
    base = providerCount();
    original = await start({ budgetMs: 1000 });
    await page.waitForFunction(() => document.getElementById('budget-status').dataset.budget === 'exceeded', null, { timeout: 4000 });
    const budgetPaused = await observed();
    assert.equal(providerCount() - base, 0);
    assert.equal(budgetPaused.state.phase, 'paused');
    assert.ok(budgetPaused.state.elapsedMs >= original.original.budgetMs);
    assert.equal(budgetPaused.state.deadline, original.deadline);
    write('budget-miss.html', await page.content());
    const missed = await resumed(base, original);
    assert.equal(missed.budgetExceeded, true);
    assert.equal(missed.history.at(-1).budgetExceeded, true);
    assert.match(await page.locator('#status').textContent(), /ORIGINAL BUDGET EXCEEDED/);
    checked('original budget empirically expires WHILE requests remain held; Resume cannot restart it', {
      held: budgetPaused, finalElapsedMs: missed.elapsedMs, finalPausedMs: missed.pausedMs,
      originalBudgetMs: original.original.budgetMs, originalStartedAt: original.startedAt,
      originalDeadline: original.deadline, actualRequestsAfterResume: providerCount() - base
    });

    await press('reset-view');
    base = providerCount();
    original = await start({ profileId: 'synthetic-999' });
    const failed = await resumed(base, original, 'failed');
    await wait(100);
    assert.equal(providerCount() - base, 1);
    assert.equal(failed.requests, 1);
    assert.equal(failed.responses, 1);
    assert.equal(failed.acknowledgements.length, 0);
    assert.equal(failed.history.at(-1).replyCode, 'UNKNOWN_PROFILE');
    assert.equal(api.observations(server).providerRequests.at(-1).status, 404);
    write('failed-reply.html', await page.content());
    checked('actual HTTP 404 is a retained FAILED REPLY, not an implicit v2 or successful journey', failed.history.at(-1));

    await press('reset-view');
    base = providerCount();
    original = await start();
    await press('stop', 'Space');
    await phase('unknown');
    const stopped = await readState();
    assert.equal(stopped.code, 'INTERRUPTED_BY_STOP');
    assert.equal(stopped.attemptId, original.attemptId);
    assert.equal(providerCount() - base, 0);
    assert.equal(await page.locator('#resume').isDisabled(), true);
    write('stop-unknown.html', await page.content());
    await press('reset-view', 'Space');
    const reset = await readState();
    assert.equal(reset.phase, 'idle');
    assert.ok(reset.history.some((attempt) => attempt.attemptId === failed.attemptId && attempt.outcome === 'failed'));
    assert.ok(reset.history.some((attempt) => attempt.attemptId === stopped.attemptId && attempt.outcome === 'unknown'));
    checked('actual keyboard Stop/Reset preserves failed and interrupted unknown attempts without releasing the next request', reset.history);

    base = providerCount();
    original = await start({ boundary: 'between-reads' });
    assert.equal(providerCount() - base, 1);
    await press('reset-view', 'Space');
    await phase('idle');
    await wait(150);
    assert.equal(providerCount() - base, 1);
    const interruptedReset = await readState();
    assert.equal(interruptedReset.history.at(-1).code, 'INTERRUPTED_BY_RESET');
    assert.equal(interruptedReset.history.at(-1).acknowledgements.length, 1);
    write('reset-history.html', await page.content());
    checked('actual Reset at acknowledged boundary does not release v2 and retains original profile/draft/attempt as unknown', interruptedReset.history.at(-1));
    base = providerCount();
    const replacement = await start({ profileId: 'synthetic-002', draft: 'synthetic-draft-B' });
    assert.notEqual(replacement.attemptId, original.attemptId);
    const replacementDone = await resumed(base, replacement);
    assert.ok(replacementDone.history.some((attempt) => attempt.attemptId === original.attemptId && attempt.code === 'INTERRUPTED_BY_RESET'));
    assert.ok(replacementDone.history.some((attempt) => attempt.attemptId === missed.attemptId && attempt.budgetExceeded));
    checked('a distinct replacement attempt reads the other immutable synthetic profile and keeps prior errors/unknown/budget-miss history', {
      originalInterruptedId: original.attemptId, replacementId: replacementDone.attemptId,
      profile: replacementDone.acknowledgements[0].profile, retainedAttempts: replacementDone.history.length
    });

    const csp = await page.evaluate(async () => {
      const violation = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ effectiveDirective: null }), 1500);
        document.addEventListener('securitypolicyviolation', (event) => {
          clearTimeout(timeout);
          resolve({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
        }, { once: true });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__C033InlineRan = true;';
      document.head.appendChild(script);
      const result = await violation;
      script.remove();
      return { ...result, inlineRan: Boolean(globalThis.__C033InlineRan) };
    });
    assert.equal(csp.inlineRan, false);
    assert.match(csp.effectiveDirective, /^script-src/);
    assert.deepEqual(pageErrors, []);
    assert.ok(browserRequests.every((request) => request.url.startsWith(`${origin}/`) && request.method === 'GET'));
    checked('actual enforced CSP blocks inline script; actual browser traffic remains own read-only HTTP, without native transport/CORS claims', csp);
    record.actualProviderRequests = api.observations(server).providerRequests;
    record.actualBrowserRequests = browserRequests;
    record.pageErrors = pageErrors;
    assert.equal(api.observations(server).runtimeErrors.length, 0);

    await api.assertCurrentConsent();
    staticSession = await openIsolatedLesson(path.join('capability', 'C033', 'index.html'));
    const staticPage = staticSession.page;
    await staticPage.waitForFunction(() => document.getElementById('mode').textContent.includes('static files are not an owned HTTP listener'), null, { timeout: 5000 });
    assert.equal(await staticPage.locator('#start').isDisabled(), true);
    assert.equal(await staticPage.locator('#resume').isDisabled(), true);
    assert.equal(await staticPage.locator('#elapsed').textContent(), 'Not measured');
    assert.equal(await staticPage.locator('#state').textContent(), '{}');
    write('static-unavailable.html', await staticPage.content());
    checked('actual static-file DOM explicitly cannot pause or measure HTTP without the actual owned server', await staticPage.locator('#mode').textContent());
    record.outcome = 'passed';
  } catch (error) {
    failures.push(error);
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    for (const [handle, key] of [[staticSession, 'staticBrowserClosed'], [session, 'browserClosed']]) {
      if (handle) {
        try { await handle.close(); record.cleanup[key] = true; }
        catch (error) { failures.push(error); }
      }
    }
    if (server) {
      try {
        await api.closeOwned(server);
        record.cleanup.serverClosed = !server.listening && api.observations(server).closed;
        record.cleanup.listenerRefusedAfterClose = await refused(port);
      } catch (error) { failures.push(error); }
    }
    record.completedAtUtc = new Date().toISOString();
    record.totalMeasuredNodeMonotonicMs = performance.now() - nodeStart;
    record.captureMode = capture ? 'deliberate exact CAPTURE_BROWSER_EVIDENCE=1, unique own directory, no overwrite' : 'strict read-only, no evidence writes';
    if (failures.length) record.outcome = 'failed';
    write('summary.json', `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({
      cardId: 'C033', outcome: record.outcome, browserVersion: record.browserVersion,
      checks: record.checks.length, actualProviderRequests: record.actualProviderRequests?.length ?? null,
      cleanup: record.cleanup, capture: capture ? path.relative(repository, directory) : false
    }));
  }
  if (failures.length) throw new AggregateError(failures, 'C033 actual browser proof failed; raw failures and cleanup status are retained.');
  assert.equal(record.cleanup.browserClosed, true);
  assert.equal(record.cleanup.staticBrowserClosed, true);
  assert.equal(record.cleanup.serverClosed, true);
  assert.equal(record.cleanup.listenerRefusedAfterClose, true);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
