'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const trace = require('..\\trace.js');
const historical = require('..\\historical.cjs');
const { pins, hash } = require('..\\pins.cjs');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const started = performance.now();
const record = {
  cardId: 'C034', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  interpretation: 'new actual offline DOM inspection of historical source observations; NOT a new live trace run',
  testRuntime: process.version, productionRuntimeValidated: false, nativeTransportQualified: false,
  fullJourneyQualified: false, identityVerified: false, actualRunCorrelation: false,
  integratedForegroundLeaseUsed: false, helperPatched: false, unsafeFlagsUsed: false,
  liveAzureRuns: 0, authorizedCloudSpend: 0, checks: [],
  cleanup: { browserClosed: false, exactHelperSessionRemoved: false, exactOwnedProfileRemoved: false, exactOwnedEdgeGone: false }
};
let directory;
if (capture) {
  const raw = path.join(root, 'evidence', 'raw');
  directory = process.env.C034_CAPTURE_DIR ? path.resolve(process.env.C034_CAPTURE_DIR) : path.join(raw, `browser-${randomUUID()}`);
  assert.equal(path.dirname(directory), raw);
  assert.match(path.basename(directory), /^browser-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  assert.equal(fs.realpathSync(directory), directory);
  assert.deepEqual(fs.readdirSync(directory), []);
}
function write(name, bytes) {
  if (!capture) return;
  assert.ok(['summary.json', 'initial.html', 'ordered.html', 'wrong-order.html',
    'wrong-order.input.json', 'partial-unknown.html', 'reset.html'].includes(name));
  fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
}
function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}
async function signature(caller) {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(root, '..', 'C033', 'tests', 'signed-edge.ps1')];
  if (caller) args.push('-CallerNodePid', String(caller));
  const result = await execute('pwsh.exe', args, { timeout: 10000, windowsHide: true, maxBuffer: 32768 });
  return JSON.parse(result.stdout);
}
async function ownedBrowser(pid, action = 'profile') {
  const result = await execute('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'owned-browser.ps1'), '-CallerNodePid', String(process.pid),
    '-BrowserPid', String(pid), '-Action', action], { timeout: 10000, windowsHide: true, maxBuffer: 32768 });
  return JSON.parse(result.stdout);
}
async function main() {
  let session;
  let profile;
  const failures = [];
  try {
    assert.match(process.version, /^v22\./);
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
    assert.equal(hash(fs.readFileSync(helper)), pins.browserHelperRawSha256);
    record.helperRawSha256 = pins.browserHelperRawSha256;
    record.installedSignedEdge = await signature();
    const context = await historical.readContext();
    record.separateNodePreflightContext = {
      pid: context.receipt.pid, runId: context.receipt.state.runId, epoch: context.receipt.state.epoch,
      writesPerformed: context.receipt.writesPerformed, association: context.association,
      interpretation: 'Node public restore preflight, not browser disk or historical-run correlation'
    };
    const { openIsolatedLesson } = require(helper);
    const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    const beforeSessions = new Set(fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name)));
    session = await openIsolatedLesson(path.join('capability', 'C034', 'index.html'));
    const createdSessions = fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name) && !beforeSessions.has(name));
    assert.equal(createdSessions.length, 1, 'Only an unambiguously observed newly created helper session may be attributed to this call; never choose another worker directory.');
    const actualHelperSession = path.join(runtime, createdSessions[0]);
    record.browserVersion = session.browserVersion;
    assert.match(record.browserVersion, /^156\./);
    record.actualSignedEdge = await signature(process.pid);
    assert.equal(record.actualSignedEdge.fileVersion, record.browserVersion);
    profile = await ownedBrowser(record.actualSignedEdge.actualOwnedBrowserPid);
    profile.actualHelperSession = actualHelperSession;
    assert.equal(fs.existsSync(profile.actualHelperSession), true);
    record.actualProfile = profile;
    checked('actual caller-owned signed Edge 156, offline Playwright 1.56.1 and exact published helper', {
      browserVersion: record.browserVersion, actualBrowserPid: record.actualSignedEdge.actualOwnedBrowserPid,
      signature: record.actualSignedEdge.authenticodeStatus, actualNodePid: process.pid
    });
    const { page } = session;
    page.setDefaultTimeout(5000);
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.reload({ waitUntil: 'load', timeout: 10000 });
    assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.locator('#mode').textContent(), /^OFFLINE: bundled historical/);
    assert.match(await page.locator('#status').textContent(), /Not inspected/);
    assert.equal(await page.locator('#originals li').count(), 0);
    checked('actual initial static DOM makes no live disk, network, run, identity or migration claim', await page.locator('#mode').textContent());
    write('initial.html', await page.content());
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press(key);
    };
    const status = (value) => page.waitForFunction((result) => document.getElementById('status').dataset.result === result, value);
    await press('inspect');
    await status('rejected');
    assert.equal(await page.locator('#error').textContent(), 'UNKNOWN_TRACE_ID');
    checked('actual keyboard inspection without explicit saved selection rejects, not a default success', 'UNKNOWN_TRACE_ID');

    await page.locator('#trace').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#trace').inputValue(), 'closed-history');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inspect');
    await page.keyboard.press('Enter');
    await status('historical');
    assert.equal(await page.locator('#originals li').count(), 6);
    assert.equal(await page.locator('#events tr').count(), 43);
    const rows = await page.locator('#events tr').evaluateAll((elements) =>
      elements.map((row) => ({ attempt: row.dataset.attempt, action: row.dataset.action, cells: [...row.cells].map((cell) => cell.textContent) })));
    const saved = trace.getSavedTrace('closed-history');
    assert.deepEqual(rows.map((row) => [row.attempt, row.action]),
      saved.snapshot.events.map((event) => [event.attemptId, event.code]));
    for (const [index, row] of rows.entries()) {
      assert.equal(row.cells[2], `${saved.snapshot.events[index].at} / ${saved.snapshot.events[index].elapsedMs}`);
      if (row.action === 'ACTUAL_READ_ACKNOWLEDGED') assert.match(row.cells[3], /(?:1|2)\.0\.0; getProfile\/1; C020-loopback-v(?:1|2)-r1/);
      else assert.equal(row.cells[3], 'Not observed at this action');
    }
    assert.equal(await page.locator('[data-classification="original-budget-exceeded"]').count(), 1);
    assert.equal(await page.locator('[data-classification="unknown"]').count(), 2);
    assert.match(await page.locator('#replacement').textContent(), /Replacement summary only.*NOT SAVED/);
    const renderedContext = JSON.parse(await page.locator('#context').textContent());
    assert.deepEqual(renderedContext.receipt.state, saved.context.receipt.state);
    assert.match(renderedContext.association, /not-client-run-correlation/);
    checked('actual Tab/Enter renders exactly saved order/times/observed versions, original budget miss and two retained unknown originals', {
      rows: rows.length, originals: 6, budgetMisses: 1, unknowns: 2, C015RunId: renderedContext.receipt.state.runId,
      C015Epoch: renderedContext.receipt.state.epoch, association: renderedContext.association
    });
    write('ordered.html', await page.content());
    if (capture) await page.screenshot({ path: path.join(directory, 'ordered.png'), fullPage: true, timeout: 10000 });

    await press('load-copy');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'candidate');
    await page.evaluate(() => {
      const input = document.getElementById('candidate');
      const value = JSON.parse(input.value);
      const index = value.snapshot.events.findIndex((event) => event.code === 'ACTUAL_READ_STARTED');
      [value.snapshot.events[index], value.snapshot.events[index + 1]] = [value.snapshot.events[index + 1], value.snapshot.events[index]];
      input.value = JSON.stringify(value);
    });
    write('wrong-order.input.json', await page.locator('#candidate').inputValue());
    await press('inspect-copy', 'Space');
    await status('rejected');
    assert.equal(await page.locator('#error').textContent(), 'REQUEST_RESPONSE_ORDER');
    assert.equal(await page.locator('#events tr').count(), 0);
    assert.equal(await page.locator('#originals li').count(), 0);
    assert.equal(await page.locator('#context').textContent(), '');
    checked('actual keyboard wrong-ordered saved JSON is rejected with canonical error and stale results cleared', 'REQUEST_RESPONSE_ORDER');
    write('wrong-order.html', await page.content());

    await page.locator('#candidate').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('{"a":1,"a":2}');
    await press('inspect-copy');
    assert.equal(await page.locator('#error').textContent(), 'DUPLICATE_FIELD');
    checked('actual typed duplicate JSON rejects before any imported verdict or data is adopted', 'DUPLICATE_FIELD');
    await press('load-copy');
    await page.evaluate(() => {
      const input = document.getElementById('candidate');
      const value = JSON.parse(input.value);
      value.context.receipt.state.epoch = 2;
      input.value = JSON.stringify(value);
    });
    await press('inspect-copy');
    assert.equal(await page.locator('#error').textContent(), 'CONTEXT_MISMATCH_OR_STALE');
    checked('actual imported stale C015 epoch cannot become current run context or approval', 'CONTEXT_MISMATCH_OR_STALE');

    await page.locator('#trace').selectOption('held-snapshot');
    await press('inspect');
    await status('historical');
    const partial = page.locator('#originals [data-attempt="synthetic-C033-attempt-2"]');
    assert.equal(await partial.getAttribute('data-classification'), 'partial-unknown');
    assert.match(await partial.textContent(), /end NOT SAVED - unknown.*1 requests \/ 1 responses/);
    const partialRows = await page.locator('#events [data-attempt="synthetic-C033-attempt-2"]').evaluateAll((elements) =>
      elements.map((row) => [...row.cells].map((cell) => cell.textContent)));
    assert.equal(partialRows.filter((cells) => cells[1].startsWith('ACTUAL_READ_ACKNOWLEDGED')).length, 1);
    assert.equal(partialRows.some((cells) => cells[3].startsWith('2.0.0')), false);
    checked('actual saved partial DOM retains unknown terminal/timing and never invents the missing v2 reply', { originals: 2, partialAttempt: 'synthetic-C033-attempt-2', acknowledgedVersions: ['1.0.0'] });
    write('partial-unknown.html', await page.content());

    const historyBefore = await page.locator('#inspection-history li').count();
    await press('reset', 'Space');
    await status('reset');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'trace');
    assert.equal(await page.locator('#trace').inputValue(), '');
    assert.equal(await page.locator('#candidate').inputValue(), '');
    assert.equal(await page.locator('#events tr').count(), 0);
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal(await page.locator('#inspection-history li').count(), historyBefore);
    assert.match(await page.locator('#inspection-history').textContent(), /REQUEST_RESPONSE_ORDER.*DUPLICATE_FIELD.*CONTEXT_MISMATCH_OR_STALE/s);
    await page.locator('#trace').selectOption('closed-history');
    await press('inspect');
    assert.equal(await page.locator('#originals [data-classification="unknown"]').count(), 2);
    checked('actual keyboard reset returns focus, preserves error history and leaves saved unknown originals unchanged', { retainedInspections: historyBefore, originalUnknownsAfterReinspect: 2 });
    write('reset.html', await page.content());

    const csp = await page.evaluate(async () => {
      async function violation(operation) {
        const pending = new Promise((resolve) => {
          const timer = setTimeout(() => { document.removeEventListener('securitypolicyviolation', listener); resolve({ effectiveDirective: null }); }, 1500);
          const listener = (event) => {
            clearTimeout(timer);
            document.removeEventListener('securitypolicyviolation', listener);
            resolve({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
          };
          document.addEventListener('securitypolicyviolation', listener);
        });
        await operation();
        return pending;
      }
      const script = document.createElement('script');
      script.textContent = 'globalThis.__C034InlineRan = true;';
      const inline = await violation(async () => document.head.appendChild(script));
      script.remove();
      let connectionReturned = false;
      const connection = await violation(async () => {
        try { await fetch(location.href, { method: 'GET', credentials: 'omit' }); connectionReturned = true; } catch {}
      });
      return { inline, connection, inlineRan: Boolean(globalThis.__C034InlineRan), connectionReturned };
    });
    assert.match(csp.inline.effectiveDirective, /^script-src/);
    assert.equal(csp.inline.blockedURI, 'inline');
    assert.equal(csp.inlineRan, false);
    assert.equal(csp.connection.effectiveDirective, 'connect-src');
    assert.equal(csp.connectionReturned, false);
    checked('actual enforced CSP blocks inline execution and connection to the page itself; not native transport proof', csp);

    while (await page.locator('#inspection-history li').count() < 16) await press('inspect');
    assert.equal(await page.locator('#inspect').isDisabled(), true);
    assert.equal(await page.locator('#inspect-copy').isDisabled(), true);
    assert.equal(await page.locator('#load-copy').isDisabled(), true);
    assert.match(await page.locator('#history-limit').textContent(), /refused, not dropped/);
    assert.equal(await page.locator('#originals [data-classification="unknown"]').count(), 2);
    checked('actual bounded inspection history refuses overflow without dropping earlier errors or repairing originals', 16);
    assert.equal(errors.length, 0);
    assert.ok(requests.length > 0);
    assert.ok(requests.every((request) => request.method === 'GET' && request.url.startsWith('file:')));
    record.actualBrowserRequests = requests;
    record.pageErrors = errors;
    record.outcome = 'passed';
  } catch (error) {
    failures.push(error);
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try { await session.close(); record.cleanup.browserClosed = true; }
      catch (error) { failures.push(error); }
    }
    if (profile) {
      record.cleanup.exactHelperSessionRemoved = !fs.existsSync(profile.actualHelperSession);
      record.cleanup.exactOwnedProfileRemoved = !fs.existsSync(profile.actualIsolatedProfile);
      try { record.cleanup.exactOwnedEdgeGone = (await ownedBrowser(profile.actualBrowserPid, 'closed')).processGone; }
      catch (error) { failures.push(error); }
    }
    if (!Object.values(record.cleanup).every((value) => value === true)) failures.push(new Error('Exact browser/helper cleanup is incomplete or unobserved.'));
    record.completedAtUtc = new Date().toISOString();
    record.measuredNodeMonotonicMs = performance.now() - started;
    record.captureMode = capture ? 'deliberate exact CAPTURE_BROWSER_EVIDENCE=1, unique own evidence only' : 'read-only source/evidence; helper owns transient session cleanup';
    if (failures.length) record.outcome = 'failed';
    write('summary.json', `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({ cardId: 'C034', outcome: record.outcome, browserVersion: record.browserVersion, checks: record.checks.length, cleanup: record.cleanup, capture: capture ? path.relative(repository, directory) : false }));
  }
  if (failures.length) throw new AggregateError(failures, 'C034 actual offline browser inspection failed; exact cleanup and raw failures are retained.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
