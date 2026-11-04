'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const execute = promisify(execFile);
const { readCurrent } = require('..\\current.cjs');
const { hash, imports, checkImports } = require('..\\pins.cjs');
const { captured } = require('./support.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const started = performance.now();
const record = {
  cardId: 'C036', workerId: 'worker-C036', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  testRuntime: process.version, interpretation: 'actual new DOM inspection of explicitly fictional attribution and historical unlinked source; NOT native/authenticated correlation',
  nativeCorrelationVerified: false, authenticatedIdentityVerified: false, leaseAuthority: false,
  productionRuntimeValidated: false, nativeTransportQualified: false, broaderLifecycleQualified: false,
  helperPatched: false, unsafeFlagsUsed: false, integratedForegroundLeaseUsed: false,
  liveAzureRuns: 0, cloudSpend: 0, checks: [],
  cleanup: { browserClosed: false, exactOwnedProfileRemoved: false, exactOwnedEdgeGone: false, exactHelperSessionRemoved: false }
};
let directory;
if (capture) {
  const raw = path.join(root, 'evidence', 'raw');
  directory = process.env.C036_CAPTURE_DIR ? path.resolve(process.env.C036_CAPTURE_DIR) : path.join(raw, `browser-${randomUUID()}`);
  assert.equal(path.dirname(directory), raw);
  assert.match(path.basename(directory), /^browser-[0-9a-f-]{36}$/);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  assert.equal(fs.realpathSync(directory), directory);
  assert.deepEqual(fs.readdirSync(directory), []);
}
function write(name, bytes) {
  if (!capture) return;
  assert.ok(['summary.json', 'initial.html', 'wrong-run.html', 'unlinked-unknown.html',
    'partial.html', 'wrong-lease-after-inspection.html', 'attached-fictional.html', 'replay.html',
    'forged.html', 'stale.html', 'reset.html'].includes(name));
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
  const result = await execute('pwsh.exe', args, { timeout: 15000, maxBuffer: 32768, windowsHide: true });
  return JSON.parse(result.stdout);
}
async function owned(pid, action = 'profile') {
  const result = await execute('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(__dirname, 'owned-browser.ps1'), '-CallerNodePid', String(process.pid),
    '-BrowserPid', String(pid), '-Action', action], { timeout: 15000, maxBuffer: 32768, windowsHide: true });
  return JSON.parse(result.stdout);
}
async function main() {
  let session;
  let profile;
  let helperSession;
  const failures = [];
  try {
    assert.match(process.version, /^v22\./);
    checkImports();
    const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
    assert.equal(hash(fs.readFileSync(helper)), imports().browserHelperRawSha256);
    record.helperRawSha256 = imports().browserHelperRawSha256;
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    record.installedSignedEdge = await signature();
    const current = await readCurrent();
    record.separateCurrentNodeRead = {
      readerPid: current.receipt.pid, epoch: current.receipt.state.epoch, record: current.receipt.state.record,
      runId: current.receipt.state.runId, writesPerformed: current.receipt.writesPerformed,
      interpretation: 'actual separate Node C015 public restore; browser remains historical'
    };
    const { openIsolatedLesson } = require(helper);
    const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    const before = new Set(fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name)));
    session = await openIsolatedLesson(path.join('capability', 'C036', 'index.html'));
    record.browserVersion = session.browserVersion;
    record.actualSignedEdge = await signature(process.pid);
    assert.equal(record.actualSignedEdge.fileVersion, session.browserVersion);
    assert.equal(record.actualSignedEdge.authenticodeStatus, 'Valid');
    profile = await owned(record.actualSignedEdge.actualOwnedBrowserPid);
    const created = fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name) && !before.has(name));
    assert.equal(created.length, 1, 'Only an unambiguously newly observed helper session may be attributed; never choose another worker directory.');
    helperSession = path.join(runtime, created[0]);
    record.actualProfile = profile;
    record.actualHelperSession = helperSession;
    checked('actual owned signed Edge 156 and approved offline helper/tooling', {
      edgeVersion: session.browserVersion, browserPid: profile.actualBrowserPid, nodePid: process.pid,
      authenticode: record.actualSignedEdge.authenticodeStatus, playwrightVersion: record.playwrightVersion
    });
    const page = session.page;
    page.setDefaultTimeout(5000);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    await page.reload({ waitUntil: 'load', timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('load').disabled);
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press(key);
    };
    const outcome = (expected) => page.waitForFunction((value) =>
      document.getElementById('status').dataset.outcome === value && !document.getElementById('reset').disabled, expected);
    const load = async (id) => {
      await page.locator('#evidence').selectOption(id);
      await press('load');
      await outcome('loaded');
    };
    assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.locator('#mode').textContent(), /bundled historical actual C015 observation/);
    assert.equal(await page.locator('#metric').textContent(), '0');
    const displayedContext = JSON.parse(await page.locator('#context').textContent());
    assert.equal(displayedContext.contextOrigin, 'bundled-historical-C015-observation-only');
    assert.equal(displayedContext.epoch, captured.context.receipt.state.epoch);
    assert.deepEqual(displayedContext.record, captured.context.receipt.state.record);
    assert.match(await page.locator('#native-status').textContent(), /UNVERIFIED/);
    checked('actual initial DOM separates historical browser data from current Node read and native identity', displayedContext);
    write('initial.html', await page.content());

    await press('load');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'UNKNOWN_EVIDENCE_ID');
    assert.equal(await page.locator('#metric').textContent(), '0');
    checked('actual keyboard unknown selection errors without a default eligible fixture', 'UNKNOWN_EVIDENCE_ID');

    await page.locator('#evidence').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#evidence').inputValue(), 'wrong-run');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'load');
    await page.keyboard.press('Enter');
    await outcome('loaded');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'candidate');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inspect');
    await page.keyboard.press('Enter');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'RUN_MISMATCH');
    await press('attach', 'Space');
    await outcome('rejected');
    assert.equal(await page.locator('#metric').textContent(), '0');
    checked('actual Tab/Enter/Space wrong-run correlation and attachment block private records/metrics', { code: 'RUN_MISMATCH', metric: 0 });
    write('wrong-run.html', await page.content());

    await load('saved-closed-unlinked');
    await press('inspect');
    await outcome('held');
    assert.equal(await page.locator('#originals li').count(), 6);
    assert.equal(await page.locator('#originals [data-classification="unknown"]').count(), 2);
    assert.equal(await page.locator('#originals [data-classification="original-budget-exceeded"]').count(), 1);
    assert.match(await page.locator('#missing').textContent(), /leaseId.*userId.*client runId.*client epoch/);
    assert.match(await page.locator('#source').textContent(), /declared-fixture-association-only/);
    assert.match(await page.locator('#replacement').textContent(), /summary-only replacement 7/);
    await press('attach');
    await outcome('held');
    assert.equal(await page.locator('#metric').textContent(), '0');
    checked('actual C034 closed saved originals and unknown/replacement history remain unlinked HOLD, not current attribution', { originals: 6, unknowns: 2, attributed: 0 });
    write('unlinked-unknown.html', await page.content());

    await load('saved-held-unlinked');
    await press('inspect');
    await outcome('held');
    assert.equal(await page.locator('#originals li').count(), 2);
    assert.equal(await page.locator('#originals [data-classification="partial-unknown"]').count(), 1);
    assert.match(await page.locator('#originals [data-classification="partial-unknown"]').textContent(), /saved replies 1/);
    assert.equal(await page.locator('#metric').textContent(), '0');
    checked('actual saved partial missing observation stays unknown with no invented second reply', { originals: 2, partialReplies: 1 });
    write('partial.html', await page.content());

    await load('fictional-complete');
    await press('inspect');
    await outcome('fixture-verified');
    assert.equal(await page.locator('#metric').textContent(), '0');
    const altered = JSON.parse(await page.locator('#candidate').inputValue());
    altered.observations[0].leaseId = 'fictional-C036-lease-002';
    await page.locator('#candidate').fill(JSON.stringify(altered));
    await press('attach', 'Space');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'LEASE_MISMATCH');
    assert.equal(await page.locator('#metric').textContent(), '0');
    checked('actual inspected-positive then edited wrong lease rejects before the private attachment transition', { code: 'LEASE_MISMATCH', attributed: 0 });
    write('wrong-lease-after-inspection.html', await page.content());

    await load('fictional-complete');
    await press('attach');
    await outcome('attached');
    assert.equal(await page.locator('#metric').textContent(), '3');
    assert.equal(await page.locator('#native-metric').textContent(), '0');
    assert.match(await page.locator('#fixture-status').textContent(), /explicit fictional scope only/);
    assert.match(await page.locator('#native-status').textContent(), /UNVERIFIED/);
    checked('actual positive control attaches exactly three fictional tier records while native/authenticated status remains unverified', { fictionalRecords: 3, nativeRecords: 0 });
    write('attached-fictional.html', await page.content());

    await press('attach');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'REPLAYED_EVIDENCE');
    assert.equal(await page.locator('#metric').textContent(), '3');
    checked('actual replay cannot add another metric or record', { code: 'REPLAYED_EVIDENCE', currentRecords: 3 });
    write('replay.html', await page.content());

    await load('fictional-complete');
    const forged = JSON.parse(await page.locator('#candidate').inputValue());
    forged.eligibleVerdict = { eligible: true, epoch: 3 };
    await page.locator('#candidate').fill(JSON.stringify(forged));
    await press('attach');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'CLOSED_EVIDENCE_SCHEMA');
    assert.equal(await page.locator('#metric').textContent(), '3');
    checked('actual JSON caller eligible verdict never authorizes private attachment', 'CLOSED_EVIDENCE_SCHEMA');
    write('forged.html', await page.content());

    await load('stale');
    await press('attach');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'STALE_OBSERVATION');
    assert.equal(await page.locator('#metric').textContent(), '3');
    checked('actual stale observation rejects before attribution without counting it as current', 'STALE_OBSERVATION');
    write('stale.html', await page.content());

    await page.locator('#candidate').fill('{');
    await press('inspect');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'INVALID_JSON');
    assert.match(await page.locator('#fixture-status').textContent(), /NOT VERIFIED/);
    checked('actual malformed JSON clears success-shaped candidate status and displays an error', 'INVALID_JSON');

    const historyBefore = await page.locator('#history li').count();
    await press('reset', 'Space');
    await outcome('reset');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'evidence');
    assert.equal(await page.locator('#evidence').inputValue(), '');
    assert.equal(await page.locator('#candidate').inputValue(), '');
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal(await page.locator('#originals li').count(), 0);
    assert.equal(await page.locator('#metric').textContent(), '3');
    assert.equal(await page.locator('#history li').count(), historyBefore);
    assert.match(await page.locator('#history').textContent(), /RUN_MISMATCH.*held.*LEASE_MISMATCH.*REPLAYED_EVIDENCE.*INVALID_JSON/s);
    await load('fictional-complete');
    await press('attach');
    await outcome('rejected');
    assert.equal(await page.locator('#error').textContent(), 'REPLAYED_EVIDENCE');
    assert.equal(await page.locator('#metric').textContent(), '3');
    checked('actual Space reset restores keyboard focus but preserves private attribution/replay and negative/unknown history', { retainedHistory: historyBefore, currentRecords: 3, replayCode: 'REPLAYED_EVIDENCE' });
    write('reset.html', await page.content());

    const csp = await page.evaluate(async () => {
      async function violation(operation) {
        const pending = new Promise((resolve) => {
          const listener = (event) => {
            clearTimeout(timer);
            document.removeEventListener('securitypolicyviolation', listener);
            resolve({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
          };
          const timer = setTimeout(() => {
            document.removeEventListener('securitypolicyviolation', listener);
            resolve({ effectiveDirective: null });
          }, 1500);
          document.addEventListener('securitypolicyviolation', listener);
        });
        await operation();
        return pending;
      }
      const script = document.createElement('script');
      script.textContent = 'globalThis.__C036InlineRan = true;';
      const inline = await violation(async () => document.head.appendChild(script));
      script.remove();
      let connectionReturned = false;
      const connection = await violation(async () => {
        try { await fetch(location.href, { method: 'GET', credentials: 'omit' }); connectionReturned = true; } catch {}
      });
      return { inline, connection, inlineRan: Boolean(globalThis.__C036InlineRan), connectionReturned };
    });
    assert.match(csp.inline.effectiveDirective, /^script-src/);
    assert.equal(csp.inline.blockedURI, 'inline');
    assert.equal(csp.inlineRan, false);
    assert.equal(csp.connection.effectiveDirective, 'connect-src');
    assert.equal(csp.connectionReturned, false);
    checked('actual enforced CSP blocks inline script and connection, not native transport proof', csp);

    while (await page.locator('#history li').count() < 16) {
      await press('inspect');
      await outcome('rejected');
    }
    assert.equal(await page.locator('#load').isDisabled(), true);
    assert.equal(await page.locator('#inspect').isDisabled(), true);
    assert.equal(await page.locator('#attach').isDisabled(), true);
    assert.match(await page.locator('#history-limit').textContent(), /refused, not dropped/);
    assert.equal(await page.locator('#history li').count(), 16);
    assert.equal(await page.locator('#metric').textContent(), '3');
    checked('actual history limit refuses new work and retains every negative/unknown result', 16);

    assert.deepEqual(errors, []);
    const assets = [
      path.join(root, 'index.html'), path.join(root, 'style.css'), path.join(root, 'captured.js'),
      path.join(root, 'attribution.js'), path.join(root, 'page.js'), path.join(root, '..', 'C020', 'contract.js'),
      path.join(root, '..', 'C020', 'inspector.js'), path.join(root, '..', 'C033', 'journey.js'),
      path.join(root, '..', 'C034', 'trace.js'),
      path.join(root, '..', 'C034', 'evidence', 'raw', 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116', 'bundle.js')
    ];
    const { pathToFileURL } = require('node:url');
    const urls = new Set(assets.map((file) => pathToFileURL(file).href));
    assert.ok(requests.length > 0 && requests.every((request) => request.method === 'GET' && urls.has(request.url)));
    record.actualRequests = requests;
    record.pageErrors = errors;
    checked('actual page requests only the exact closed read-only file assets with no page errors', { requests: requests.length, allowedAssets: urls.size });
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
      record.cleanup.exactOwnedProfileRemoved = !fs.existsSync(profile.actualIsolatedProfile);
      try { record.cleanup.exactOwnedEdgeGone = (await owned(profile.actualBrowserPid, 'closed')).processGone; }
      catch (error) { failures.push(error); }
    }
    if (helperSession) record.cleanup.exactHelperSessionRemoved = !fs.existsSync(helperSession);
    if (!Object.values(record.cleanup).every((value) => value === true)) failures.push(new Error('Actual exact helper/profile/browser cleanup incomplete or unobserved.'));
    else checked('actual awaited finally closed exactly this helper, owned profile and Edge process', record.cleanup);
    if (failures.length) record.outcome = 'failed';
    record.completedAtUtc = new Date().toISOString();
    record.measuredMonotonicMs = performance.now() - started;
    record.capture = capture ? 'exact CAPTURE_BROWSER_EVIDENCE=1; unique own append only' : 'normal source/evidence read-only';
    write('summary.json', `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({
      cardId: 'C036', outcome: record.outcome, browserVersion: record.browserVersion,
      checks: record.checks.length, cleanup: record.cleanup, capture: capture ? path.relative(repository, directory) : false
    }));
  }
  if (failures.length) throw new AggregateError(failures, 'C036 actual signed-browser checks failed; genuine raw failure retained.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
