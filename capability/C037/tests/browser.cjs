'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { hash, imports, checkImports } = require('..\\pins.cjs');
const { scripts, inventory } = require('./support.cjs');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const started = performance.now();
const record = {
  cardId: 'C037', workerId: 'worker-C037', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  testRuntime: process.version, checks: [], actualCurrentAttributedRequests: 0,
  interpretation: 'Actual signed Edge DOM observations of historical actual HTTP source and declared fictional routing controls; NOT new traffic or authenticated/lease/native/journey proof.',
  nativeTransportQualified: false, authenticatedIdentityVerified: false, leaseAuthority: false,
  fullJourneyQualified: false, productionRuntimeValidated: false, helperPatched: false,
  unsafeFlagsUsed: false, foregroundLeaseUsed: false, broaderLifecycleQualified: false,
  liveAzureRuns: 0, cloudSpend: 0,
  cleanup: { browserClosed: false, exactOwnedProfileRemoved: false, exactOwnedEdgeGone: false, exactHelperSessionRemoved: false }
};
let directory;
if (capture) {
  const raw = path.join(root, 'evidence', 'raw');
  directory = process.env.C037_CAPTURE_DIR ? path.resolve(process.env.C037_CAPTURE_DIR) : path.join(raw, `browser-${randomUUID()}`);
  assert.equal(path.dirname(directory), raw);
  assert.match(path.basename(directory), /^browser-[0-9a-f-]{36}$/);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  assert.equal(fs.realpathSync(directory), directory);
  assert.deepEqual(fs.readdirSync(directory), []);
}
function write(name, bytes) {
  if (!capture) return;
  assert.match(name, /^(?:summary\.json|[a-z0-9-]+\.html)$/);
  fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
}
function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}
async function signature(caller) {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, '..', 'C033', 'tests', 'signed-edge.ps1')];
  if (caller) args.push('-CallerNodePid', String(caller));
  const result = await execute('pwsh.exe', args, { timeout: 20000, maxBuffer: 32768, windowsHide: true });
  return JSON.parse(result.stdout);
}
async function owned(pid, action = 'profile') {
  const result = await execute('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(root, '..', 'C036', 'tests', 'owned-browser.ps1'), '-CallerNodePid', String(process.pid),
    '-BrowserPid', String(pid), '-Action', action], { timeout: 20000, maxBuffer: 32768, windowsHide: true });
  return JSON.parse(result.stdout);
}
async function main() {
  let session;
  let profile;
  let helperSession;
  let before;
  const failures = [];
  try {
    assert.match(process.version, /^v22\./);
    checkImports();
    before = inventory(root, true);
    const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
    assert.equal(hash(fs.readFileSync(helper)), imports().browserHelperRawSha256);
    record.helperRawSha256 = hash(fs.readFileSync(helper));
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    record.installedSignedEdge = await signature();
    const actualNode = await require('..\\..\\C036\\current.cjs').readCurrent();
    record.separateCurrentNodeContext = { origin: actualNode.contextOrigin, epoch: actualNode.receipt.state.epoch,
      runId: actualNode.receipt.state.runId, stateSha256: actualNode.receipt.stateSha256,
      readerPid: actualNode.receipt.pid, writesPerformed: actualNode.receipt.writesPerformed };
    const { openIsolatedLesson } = require(helper);
    const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    const sessionsBefore = new Set(fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name)));
    session = await openIsolatedLesson(path.join('capability', 'C037', 'index.html'));
    record.browserVersion = session.browserVersion;
    record.actualSignedEdge = await signature(process.pid);
    assert.equal(record.actualSignedEdge.fileVersion, session.browserVersion);
    assert.equal(record.actualSignedEdge.authenticodeStatus, 'Valid');
    profile = await owned(record.actualSignedEdge.actualOwnedBrowserPid);
    const created = fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name) && !sessionsBefore.has(name));
    assert.equal(created.length, 1, 'Only an unambiguous newly observed helper session may be attributed.');
    helperSession = path.join(runtime, created[0]);
    record.actualProfile = profile;
    record.actualHelperSession = helperSession;
    checked('actual Microsoft-signed Edge 156, Node 22, Playwright 1.56.1 and unchanged sandbox helper', {
      version: session.browserVersion, authenticode: record.actualSignedEdge.authenticodeStatus, browserPid: profile.actualBrowserPid
    });
    const page = session.page;
    page.setDefaultTimeout(5000);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    const ready = () => page.waitForFunction(() => !document.getElementById('load').disabled);
    const press = async (id) => {
      await page.locator(`#${id}`).focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press('Enter');
    };
    const outcome = (value) => page.waitForFunction((expected) =>
      document.getElementById('status').dataset.outcome === expected && !document.getElementById('reset').disabled, value);
    const fresh = async () => { await page.reload({ waitUntil: 'load', timeout: 10000 }); await ready(); };
    const load = async (id) => { await page.locator('#sample').selectOption(id); await press('load'); await outcome('loaded'); };
    const result = async () => JSON.parse(await page.locator('#result-json').textContent());
    await fresh();
    assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.locator('#mode').textContent(), /bundled historical C015 context/);
    assert.equal((JSON.parse(await page.locator('#context').textContent())).contextOrigin, 'bundled-historical-C015-observation-only');
    assert.equal(await page.locator('#actual-current').textContent(), '0');
    assert.match(await page.locator('#qualification').textContent(), /do not establish migration or journey success/);
    checked('initial actual DOM distinguishes historical browser context, separate current Node read and UNOBSERVED policy', record.separateCurrentNodeContext);
    write('initial.html', await page.content());

    await press('load'); await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'UNKNOWN_SAMPLE_ID');
    assert.equal(await page.locator('#current-started').textContent(), '0');
    checked('unknown keyboard selection has no default policy or observed result', 'UNKNOWN_SAMPLE_ID');
    await page.locator('#sample').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#sample').inputValue(), 'historical-closed');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'load');
    await page.keyboard.press('Enter'); await outcome('loaded');
    await press('inspect'); await outcome('held');
    let observed = await result();
    assert.equal(observed.observed.started, 8);
    assert.equal(observed.observed.known, 7);
    assert.deepEqual(observed.observed.destinations.map((item) => item.count), [4, 3]);
    assert.deepEqual(observed.observed.destinations.map((item) => item.share), [0.5, 0.375]);
    assert.equal(observed.requested, null);
    assert.equal(observed.currentMetrics.started, 0);
    assert.equal(observed.originals.length, 6);
    assert.match(await page.locator('#classification').textContent(), /actual-historical-local-HTTP/);
    assert.match(await page.locator('#policy').textContent(), /UNOBSERVED \/ HOLD/);
    checked('actual pinned historical closed HTTP counts retain missing destination and have no inferred policy/current attribution', observed.observed);
    write('historical-closed.html', await page.content());
    await press('json'); await outcome('json');
    assert.equal(await page.locator('#result-details').getAttribute('open'), '');
    assert.equal((await result()).actualCurrentAttributedRequests, 0);
    checked('keyboard result JSON route is conductable and does not change metrics', 'json');
    await load('historical-held'); await press('compare'); await outcome('held');
    observed = await result();
    assert.equal(observed.observed.started, 3);
    assert.equal(observed.observed.complete, false);
    assert.equal(observed.currentMetrics.started, 0);
    checked('actual historical held source remains partial/unlinked HOLD, not a repaired original', observed.originals);
    write('historical-held.html', await page.content());

    await fresh();
    await load('fictional-zero'); await press('compare'); await outcome('held');
    observed = await result();
    assert.equal(observed.observed.started, 0);
    assert.equal(observed.observed.known, 0);
    assert.ok(observed.differences.every((item) => item.observedShare === null));
    checked('actual zero-denominator DOM never turns requested weights into observed counts', observed.observed);
    await load('fictional-match'); await press('inspect'); await outcome('matched-control');
    assert.equal(await page.locator('#current-started').textContent(), '0');
    await press('compare'); await outcome('matched-control');
    assert.equal(await page.locator('#current-started').textContent(), '4');
    assert.equal(await page.locator('#actual-current').textContent(), '0');
    assert.match(await page.locator('#policy').textContent(), /DECLARED fictional policy/);
    assert.match(await page.locator('#association').textContent(), /FICTIONAL controls/);
    checked('actual inspect-versus-compare DOM commits only explicit guarded fictional originals', (await result()).guard);
    write('fictional-match.html', await page.content());
    await press('compare'); await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'REPLAYED_ORIGINAL_REQUEST');
    const retained = await page.locator('#history li').allTextContents();
    await press('reset'); await outcome('reset');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sample');
    assert.equal(await page.locator('#current-started').textContent(), '4');
    assert.deepEqual(await page.locator('#history li').allTextContents(), retained);
    assert.match(await page.locator('#session').textContent(), /FAILURE_RETAINED/);
    checked('actual reset restores picker focus and retains replay, originals, metrics and failure history', retained);
    write('reset.html', await page.content());
    await load('fictional-skew'); await press('compare'); await outcome('mismatched');
    assert.equal((await result()).sampleDisposition, 'MISMATCH');
    await load('fictional-threshold'); await press('compare'); await outcome('matched-control');
    observed = await result();
    assert.equal(observed.sampleDisposition, 'MATCH_CONTROL');
    assert.equal(observed.disposition, 'FAILURE_RETAINED');
    assert.equal(observed.currentMetrics.started, 12);
    checked('actual healthy threshold sample cannot hide retained mismatch/replay via aggregate', observed.sessionDisposition);
    write('failure-retained.html', await page.content());

    for (const [id, field] of [
      ['fictional-unknown', 'interrupted'], ['fictional-in-flight', 'inFlight'],
      ['fictional-missing-destination', 'missingDestination']
    ]) {
      await fresh(); await load(id); await press('compare'); await outcome('held');
      observed = await result();
      assert.equal(observed.observed.started, 4);
      assert.equal(observed.observed.known, 3);
      assert.equal(observed.observed.unknown, 1);
      assert.equal(observed.observed[field], 1);
      assert.deepEqual(observed.observed.destinations.map((item) => item.share), [0.5, 0.25]);
      assert.equal(await page.locator('#current-unknown').textContent(), '1');
      await press('reset'); await outcome('reset');
      assert.equal(await page.locator('#current-started').textContent(), '4');
      assert.equal(await page.locator('#current-unknown').textContent(), '1');
      checked(`actual ${id} DOM retains unknown denominator and exact classification across reset`, observed.observed);
      write(`${id}.html`, await page.content());
    }
    for (const [id, expected, code] of [
      ['fictional-duplicates', 'matched-control', 'FICTIONAL_MEASURED_CONTROL_MATCH'],
      ['fictional-no-policy', 'held', 'REQUESTED_POLICY_UNOBSERVED'],
      ['fictional-errors', 'matched-control', 'FICTIONAL_MEASURED_CONTROL_MATCH'],
      ['wrong-run', 'rejected', 'RUN_MISMATCH'], ['wrong-user', 'rejected', 'USER_MISMATCH'],
      ['wrong-lease', 'rejected', 'LEASE_MISMATCH'], ['wrong-context', 'rejected', 'CONTEXT_MISMATCH'],
      ['old-epoch', 'rejected', 'EPOCH_MISMATCH_OR_STALE'], ['stale', 'rejected', 'STALE_OBSERVATION'],
      ['wrong-tier', 'rejected', 'TIER_MISMATCH'], ['wrong-stamp', 'rejected', 'TIER_STAMP_MISMATCH'],
      ['missing-attribution', 'held', 'COMPLETE_ATTRIBUTION_UNOBSERVED']
    ]) {
      await fresh(); await load(id); await press('compare'); await outcome(expected);
      observed = await result();
      assert.equal(observed.code, code);
      assert.equal(observed.actualCurrentAttributedRequests, 0);
      if (expected === 'rejected' || id === 'missing-attribution') assert.equal(observed.currentMetrics.started, 0);
      if (id === 'fictional-duplicates') {
        assert.equal(observed.observed.started, 4);
        assert.equal(observed.observed.duplicateDeliveries, 1);
      }
      if (id === 'fictional-errors') {
        assert.equal(observed.observed.failedResponses, 4);
        assert.equal(observed.fullJourneyQualified, false);
      }
      checked(`actual closed UI route ${id}`, { code, observed: observed.observed, metrics: observed.currentMetrics.started });
      write(`${id}.html`, await page.content());
    }
    await fresh(); await load('fictional-unknown');
    const loose = JSON.parse(await page.locator('#candidate').inputValue());
    loose.requested.toleranceBps = 10000;
    await page.locator('#candidate').fill(JSON.stringify(loose));
    await press('compare'); await outcome('held');
    await press('reset'); await outcome('reset');
    await load('fictional-match'); await press('compare'); await outcome('matched-control');
    observed = await result();
    assert.equal(observed.disposition, 'HOLD_RETAINED');
    assert.equal(observed.currentMetrics.unknown, 1);
    assert.equal(observed.currentMetrics.started, 8);
    assert.match(await page.locator('#status').textContent(), /HOLD_RETAINED/);
    checked('actual loose threshold plus healthy aggregate cannot erase an original unknown/HOLD after reset', observed.currentMetrics);
    write('unknown-hold-retained.html', await page.content());
    await fresh(); await load('fictional-match');
    const original = JSON.parse(await page.locator('#candidate').inputValue());
    await page.locator('#candidate').fill(JSON.stringify(original).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'));
    await press('compare'); await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'DUPLICATE_FIELD');
    const typed = structuredClone(original);
    typed.requested.targets[0].weightBps = '5000';
    await page.locator('#candidate').fill(JSON.stringify(typed));
    await press('inspect'); await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'FINITE_CLOSED_TARGETS');
    await page.locator('#candidate').fill('{"injection":"</textarea><script>globalThis.c037Injected=true</script>"}');
    await press('compare'); await outcome('rejected');
    assert.equal(await page.evaluate(() => globalThis.c037Injected), undefined);
    assert.equal(await page.locator('#current-started').textContent(), '0');
    checked('actual editable JSON duplicate/typed/injection errors are text-only and cannot enter metrics', await page.locator('#history li').allTextContents());
    write('json-errors.html', await page.content());

    const csp = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective));
      const script = document.createElement('script');
      script.textContent = 'globalThis.c037InlineExecuted = true';
      document.body.append(script);
      let connectionBlocked = false;
      try { await fetch('http://127.0.0.1:9/C037-csp-denied-not-transport'); } catch { connectionBlocked = true; }
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { violations, connectionBlocked, inlineExecuted: globalThis.c037InlineExecuted === true };
    });
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.connectionBlocked, true);
    assert.ok(csp.violations.some((value) => value.startsWith('script-src')));
    assert.ok(csp.violations.includes('connect-src'));
    checked('actual enforced CSP denies inline script and connection, not native transport certification', csp);
    await fresh();
    for (let index = 0; index < 16; index++) {
      await page.locator('#candidate').fill('{');
      await press('inspect'); await outcome('rejected');
    }
    const fullHistory = await page.locator('#history li').allTextContents();
    assert.equal(fullHistory.length, 16);
    await load('fictional-match'); await press('compare'); await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'HISTORY_LIMIT');
    assert.deepEqual(await page.locator('#history li').allTextContents(), fullHistory);
    assert.equal(await page.locator('#current-started').textContent(), '0');
    checked('actual bounded history refuses further comparison without dropping 16 failures', 16);
    write('bounded-history.html', await page.content());
    const assets = [path.join(root, 'index.html'), path.join(root, 'style.css'), path.join(root, 'page.js'),
      ...scripts.map((pieces) => path.join(repository, 'capability', ...pieces))];
    const urls = new Set(assets.map((file) => pathToFileURL(file).href));
    assert.ok(requests.length > 0 && requests.every((request) => request.method === 'GET' && urls.has(request.url)));
    assert.deepEqual(errors, []);
    record.actualRequests = requests;
    record.pageErrors = errors;
    checked('actual page requests only exact read-only file assets, with zero page errors', { requests: requests.length, allowedAssets: urls.size });
    assert.deepEqual(inventory(root, true), before);
    checkImports();
    checked('actual browser check leaves own source, existing proof, dependencies and helper bytes unchanged', { sources: before.length, dependencies: 23 });
    record.outcome = 'passed';
  } catch (error) {
    failures.push(error);
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try { await session.close(); record.cleanup.browserClosed = true; } catch (error) { failures.push(error); }
    }
    if (profile) {
      record.cleanup.exactOwnedProfileRemoved = !fs.existsSync(profile.actualIsolatedProfile);
      try { record.cleanup.exactOwnedEdgeGone = (await owned(profile.actualBrowserPid, 'closed')).processGone; } catch (error) { failures.push(error); }
    }
    if (helperSession) record.cleanup.exactHelperSessionRemoved = !fs.existsSync(helperSession);
    if (!Object.values(record.cleanup).every((value) => value === true)) failures.push(new Error('Actual exact owned cleanup is incomplete or unobserved.'));
    else checked('actual awaited finally closes exactly owned browser/profile/helper session', record.cleanup);
    if (failures.length) record.outcome = 'failed';
    record.completedAtUtc = new Date().toISOString();
    record.measuredMonotonicMs = performance.now() - started;
    record.capture = capture ? 'exact CAPTURE_BROWSER_EVIDENCE=1; unique append only' : 'normal source/evidence read-only';
    write('summary.json', `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({ cardId: 'C037', outcome: record.outcome, checks: record.checks.length,
      browserVersion: record.browserVersion, cleanup: record.cleanup, capture: capture ? path.relative(repository, directory) : false }));
  }
  if (failures.length) throw new AggregateError(failures, 'C037 actual signed Edge checks failed; raw failure retained.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
