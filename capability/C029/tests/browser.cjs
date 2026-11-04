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
const source = require('..\\source.cjs');
const evaluator = require('..\\evaluator.js');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const started = performance.now();
const record = {
  cardId: 'C029', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  interpretation: 'Actual offline DOM/keyboard evaluator verification; browser verifier PASS is NOT user journey success.',
  testRuntime: process.version, productionRuntimeValidated: false, nativeTransportQualified: false,
  fullJourneyQualified: false, userJourneySuccess: false, actualClientMutation: false,
  actualExternalEffects: false, reliabilityCertified: false, actualRunCorrelation: false,
  integratedForegroundLeaseUsed: false, helperPatched: false, nativeLauncherBypass: false,
  unsafeFlagsUsed: false, liveAzureRuns: 0, authorizedCloudSpend: 0, checks: [],
  cleanup: { browserClosed: false, exactHelperSessionRemoved: false, exactOwnedProfileRemoved: false, exactOwnedEdgeGone: false }
};
let directory;
if (capture) {
  const raw = path.join(root, 'evidence', 'raw');
  directory = process.env.C029_CAPTURE_DIR ? path.resolve(process.env.C029_CAPTURE_DIR) : path.join(raw, `browser-${randomUUID()}`);
  assert.equal(path.dirname(directory), raw);
  assert.match(path.basename(directory), /^browser-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  assert.equal(fs.realpathSync(directory), directory);
  assert.deepEqual(fs.readdirSync(directory), []);
}
function write(name, bytes) {
  if (!capture) return;
  assert.ok(['summary.json', 'initial.html', 'historical-fail.html', 'partial-unknown.html',
    'retry-comparison.html', 'unknown-retry.html', 'model-reconcile.html', 'rejected-copy.html', 'reset.html'].includes(name));
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
  const result = await execute('pwsh.exe', args, { timeout: 15000, windowsHide: true, maxBuffer: 32768 });
  return JSON.parse(result.stdout);
}
async function ownedBrowser(pid, action = 'profile') {
  const result = await execute('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'owned-browser.ps1'), '-CallerNodePid', String(process.pid),
    '-BrowserPid', String(pid), '-Action', action], { timeout: 15000, windowsHide: true, maxBuffer: 32768 });
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
    assert.equal(source.hash(fs.readFileSync(helper)), source.pins.browserHelperRawSha256);
    record.helperRawSha256 = source.pins.browserHelperRawSha256;
    record.installedSignedEdge = await signature();
    const historical = source.checkHistorical();
    const gates = source.readGates();
    record.separateNodePreflight = {
      pinnedSourceFiles: historical.imports.length, actualReaderPid: gates.readerPid,
      literalLocalConsent: gates.literalLocalConsent,
      interpretation: 'Node read-only source/gates, not browser disk/network access or a live client/effect run.'
    };
    const { openIsolatedLesson } = require(helper);
    const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    const before = new Set(fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name)));
    session = await openIsolatedLesson(path.join('capability', 'C029', 'index.html'));
    const created = fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name) && !before.has(name));
    assert.equal(created.length, 1, 'Only one unambiguously observed newly created helper session can be attributed; never select sibling runtime.');
    record.actualHelperSession = path.join(runtime, created[0]);
    record.browserVersion = session.browserVersion;
    record.actualSignedEdge = await signature(process.pid);
    assert.equal(record.actualSignedEdge.fileVersion, record.browserVersion);
    assert.match(record.browserVersion, /^156\./);
    profile = await ownedBrowser(record.actualSignedEdge.actualOwnedBrowserPid);
    profile.actualHelperSession = record.actualHelperSession;
    record.actualProfile = profile;
    checked('actual signed owned Edge 156, Node 22, offline Playwright 1.56.1 and unchanged helper', {
      browserVersion: record.browserVersion, actualBrowserPid: profile.actualBrowserPid,
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
    assert.match(await page.locator('#mode').textContent(), /bundled saved actual C033.*not a live client, network or disk read/);
    assert.match(await page.locator('#status').textContent(), /Not evaluated/);
    assert.equal(await page.locator('#originals > li').count(), 0);
    checked('actual static DOM exact training banner and explicit saved-actual/not-live source boundary', await page.locator('#mode').textContent());
    write('initial.html', await page.content());
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press(key);
    };
    const status = (decision) => page.waitForFunction((value) =>
      document.getElementById('status').dataset.decision === value && !document.getElementById('inspect').disabled,
    decision);
    await press('inspect');
    await status('HOLD');
    assert.equal(await page.locator('#error').textContent(), 'UNKNOWN_SAVED_ID');
    checked('actual keyboard no-selection rejection is HOLD, never default success', 'UNKNOWN_SAVED_ID');
    await page.locator('#source-id').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#source-id').inputValue(), 'closed-history');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inspect');
    await page.keyboard.press('Enter');
    await status('FAIL');
    assert.equal(await page.locator('#status').getAttribute('data-valid'), 'true');
    assert.match(await page.locator('#counts').textContent(), /7 originals: 2 PASS \/ 2 FAIL \/ 3 UNKNOWN/);
    assert.equal(await page.locator('#originals > li').count(), 7);
    const slow = page.locator('#originals [data-original="synthetic-C033-attempt-3"]');
    assert.equal(await slow.getAttribute('data-verdict'), 'FAIL');
    assert.equal(await slow.getAttribute('data-latency'), 'FAIL');
    assert.match(await slow.textContent(), /1118\.9000000953674/);
    assert.match(await slow.textContent(), /1077\.9000000953674/);
    assert.match(await slow.textContent(), /3310\.2000000476837/);
    assert.equal(await page.locator('#originals [data-verdict="UNKNOWN"]').count(), 3);
    const seventh = page.locator('#originals [data-original="synthetic-C033-attempt-7"]');
    assert.match(await seventh.textContent(), /summary-only-unverified/);
    assert.match(await seventh.textContent(), /NOT SAVED - UNKNOWN/);
    assert.match(await page.locator('#source-banner').textContent(), /^HISTORICAL SOURCE/);
    const observedRows = await page.locator('#events tr').evaluateAll((elements) =>
      elements.map((row) => [...row.cells].map((cell) => cell.textContent)));
    const report = evaluator.evaluateSaved('closed-history');
    assert.equal(observedRows.length, 43);
    for (const [index, cells] of observedRows.entries()) {
      const event = report.events[index];
      assert.deepEqual(cells.slice(0, 3), [event.attemptId, event.code, `${event.at} / ${event.elapsedMs}`]);
      if (event.code === 'ACTUAL_READ_STARTED') assert.equal(cells[3], 'NOT OBSERVED (action/request only)');
    }
    checked('actual keyboard historical FAIL, exact original budget/state/order/versions and all failed/unknown denominators', {
      counts: report.counts, originalSlow: report.originals[2], savedActions: observedRows.length,
      interpretation: 'Source observations historical; new DOM evaluation proof is not a fresh user journey.'
    });
    write('historical-fail.html', await page.content());

    await page.locator('#source-id').selectOption('held-snapshot');
    await press('inspect', 'Space');
    await status('HOLD');
    const partial = page.locator('#originals [data-original="synthetic-C033-attempt-2"]');
    assert.equal(await partial.getAttribute('data-verdict'), 'UNKNOWN');
    assert.equal(await partial.getAttribute('data-terminal'), 'UNKNOWN');
    assert.match(await partial.textContent(), /end NOT SAVED - UNKNOWN/);
    assert.match(await partial.textContent(), /1 requests \/ 1 responses/);
    assert.equal(await page.locator('#events [data-original="synthetic-C033-attempt-2"][data-action="ACTUAL_READ_ACKNOWLEDGED"]').count(), 1);
    assert.equal((await page.locator('#events [data-original="synthetic-C033-attempt-2"]').allTextContents()).join(' ').includes('2.0.0'), false);
    checked('actual saved partial UNKNOWN/HOLD retains only v1 acknowledgment and no invented terminal/end/v2', { originals: 2, partialId: 'synthetic-C033-attempt-2' });
    write('partial-unknown.html', await page.content());

    await press('compare');
    await status('FAIL');
    assert.equal(await page.locator('#originals [data-original="synthetic-C033-attempt-1"]').getAttribute('data-verdict'), 'FAIL');
    assert.equal(await page.locator('#originals [data-original="synthetic-C033-attempt-2"]').getAttribute('data-verdict'), 'PASS');
    assert.match(await page.locator('#comparison').textContent(), /Before retry: FAIL, 1 original; after retry: FAIL, 2 originals/);
    assert.match(await page.locator('#source-banner').textContent(), /^SYNTHETIC CONTROL ONLY/);
    checked('actual keyboard retry comparison retains original FAIL after positive retry; explicit synthetic provenance', await page.locator('#comparison').textContent());
    write('retry-comparison.html', await page.content());

    await page.locator('#source-id').selectOption('control-unknown-retry');
    await press('inspect');
    await status('HOLD');
    assert.equal(await page.locator('#originals [data-verdict="UNKNOWN"]').count(), 1);
    assert.equal(await page.locator('#originals [data-verdict="PASS"]').count(), 1);
    assert.match(await page.locator('#counts').textContent(), /2 originals/);
    checked('actual DOM synthetic positive retry cannot remove the started unknown original or denominator', await page.locator('#counts').textContent());
    write('unknown-retry.html', await page.content());

    for (const [id, expected, elapsed] of [
      ['control-below', 'PASS', '999.75'], ['control-at', 'FAIL', '1000'], ['control-above', 'FAIL', '1000.25']
    ]) {
      await page.locator('#source-id').selectOption(id);
      await press('inspect');
      await status(expected);
      assert.match(await page.locator('#originals').textContent(), new RegExp(`elapsed ${elapsed.replace('.', '\\.')} ms`));
      assert.match(await page.locator('#source-banner').textContent(), /^SYNTHETIC CONTROL ONLY/);
    }
    checked('actual DOM below/at/above the unchanged 1000 ms budget; synthetic clock is never called measured HTTP', { elapsedMs: [999.75, 1000, 1000.25], verdicts: ['PASS', 'FAIL', 'FAIL'] });

    await page.locator('#source-id').selectOption('model-reconcile');
    await press('inspect');
    await status('HOLD');
    assert.equal(await page.locator('#originals [data-verdict="UNKNOWN"]').count(), 2);
    assert.equal(await page.locator('#originals [data-state="PASS"]').count(), 1);
    assert.match(await page.locator('#source-banner').textContent(), /^PURE MODEL ONLY/);
    assert.match(await page.locator('#model-banner').textContent(), /PURE event-log MODEL.*ASSUMPTION.*hypothetical/);
    assert.match(await page.locator('#model').textContent(), /synthetic-reconciliation/);
    checked('actual DOM hypothetical C023 model reconciliation retains original UNKNOWN and denies latency/durable/external effects', await page.locator('#source-banner').textContent());
    write('model-reconcile.html', await page.content());

    await page.locator('#source-id').selectOption('closed-history');
    await press('load-copy');
    const candidate = JSON.parse(await page.locator('#candidate').inputValue());
    candidate.snapshot.history[2].deadline += 1000;
    await page.locator('#candidate').fill(JSON.stringify(candidate));
    assert.match(await page.locator('#status').textContent(), /previous result invalidated/);
    assert.equal(await page.locator('#originals > li').count(), 0);
    await press('inspect-copy');
    await status('HOLD');
    assert.equal(await page.locator('#status').getAttribute('data-valid'), 'false');
    assert.match(await page.locator('#error').textContent(), /ORIGINAL_BUDGET_OR_TIMING_MISMATCH/);
    assert.equal(await page.locator('#originals [data-verdict="PASS"]').count(), 0);
    assert.equal(await page.locator('#originals [data-verdict="UNKNOWN"]').count(), 7);
    checked('actual edited retry deadline rejects with no stale PASS or authority; original denominator retained', await page.locator('#error').textContent());
    write('rejected-copy.html', await page.content());
    await page.locator('#candidate').fill('{"id":"closed-history","id":"healthy"}');
    await press('inspect-copy');
    await status('HOLD');
    assert.equal(await page.locator('#error').textContent(), 'DUPLICATE_FIELD');
    checked('actual duplicate JSON input rejects, not a supplied healthy verdict', 'DUPLICATE_FIELD');
    const retained = await page.locator('#inspection-history li').count();
    await press('reset', 'Space');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'source-id');
    assert.equal(await page.locator('#source-id').inputValue(), '');
    assert.equal(await page.locator('#candidate').inputValue(), '');
    assert.equal(await page.locator('#originals > li').count(), 0);
    assert.equal(await page.locator('#events tr').count(), 0);
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal(await page.locator('#inspection-history li').count(), retained);
    assert.match(await page.locator('#inspection-history').textContent(), /ORIGINAL_BUDGET_OR_TIMING_MISMATCH.*DUPLICATE_FIELD/s);
    await page.locator('#source-id').selectOption('closed-history');
    await press('inspect');
    await status('FAIL');
    assert.equal(await page.locator('#originals [data-verdict="UNKNOWN"]').count(), 3);
    assert.equal(await page.locator('#originals [data-original="synthetic-C033-attempt-3"]').getAttribute('data-verdict'), 'FAIL');
    checked('actual keyboard reset returns focus, retains errors and does not repair saved original failures/unknowns', { retainedOperations: retained, recheckedOriginals: 7 });
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
      script.textContent = 'globalThis.__C029InlineRan = true;';
      const inline = await violation(async () => document.head.appendChild(script));
      script.remove();
      let connectionReturned = false;
      const connection = await violation(async () => {
        try { await fetch(location.href, { method: 'GET', credentials: 'omit' }); connectionReturned = true; } catch {}
      });
      return { inline, connection, inlineRan: Boolean(globalThis.__C029InlineRan), connectionReturned };
    });
    assert.match(csp.inline.effectiveDirective, /^script-src/);
    assert.equal(csp.inline.blockedURI, 'inline');
    assert.equal(csp.inlineRan, false);
    assert.equal(csp.connection.effectiveDirective, 'connect-src');
    assert.equal(csp.connectionReturned, false);
    checked('actual enforced CSP denies inline script and connection; no live transport qualification', csp);
    while (await page.locator('#inspection-history li').count() < 16) {
      await press('inspect');
      await page.waitForFunction(() => !document.getElementById('source-id').disabled);
    }
    for (const id of ['inspect', 'compare', 'load-copy', 'inspect-copy']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
    assert.match(await page.locator('#history-limit').textContent(), /refused, not dropped/);
    assert.equal(await page.locator('#originals [data-verdict="UNKNOWN"]').count(), 3);
    checked('actual 16-operation guard refuses overflow without deleting errors, failures or unknown originals', 16);
    assert.deepEqual(errors, []);
    assert.ok(requests.length > 0);
    assert.ok(requests.every((request) => request.method === 'GET' && request.url.startsWith('file:')));
    record.actualBrowserResourceRequests = requests;
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
    if (!Object.values(record.cleanup).every((value) => value === true)) failures.push(new Error('Exact owned helper/browser cleanup incomplete or unobserved.'));
    record.completedAtUtc = new Date().toISOString();
    record.measuredNodeMonotonicMs = performance.now() - started;
    record.captureMode = capture ? 'deliberate exact CAPTURE_BROWSER_EVIDENCE=1, unique own append' : 'normal source/evidence READONLY; unchanged helper owns transient cleanup';
    if (failures.length) record.outcome = 'failed';
    write('summary.json', `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({ cardId: 'C029', outcome: record.outcome, browserVersion: record.browserVersion, checks: record.checks.length, cleanup: record.cleanup, capture: capture ? path.relative(repository, directory) : false }));
  }
  if (failures.length) throw new AggregateError(failures, 'C029 offline DOM verification failed; never reinterpret UI verification as journey success.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
