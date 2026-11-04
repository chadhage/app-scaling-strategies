'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const execute = promisify(execFile);
const sources = require('../sources.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const started = performance.now();
const record = {
  cardId: 'C038', workerId: 'worker-C038', outcome: 'not-run', startedAtUtc: new Date().toISOString(),
  nodeVersion: process.version, checks: [],
  interpretation: 'Actual new signed Edge DOM inspection of explicitly fictional inventory/freshness and unchanged historical unlinked records; not an actual pool.',
  ...require('../readiness.js').flags,
  nativeTransportQualified: false, broaderHelperLifecycleQualified: false,
  unsafeFlagsUsed: false, helperPatched: false, integratedForegroundLeaseUsed: false,
  packagesDownloaded: 0, liveHealthScans: 0, cloudSpend: 0,
  cleanup: { browserClosed: false, exactOwnedProfileRemoved: false,
    exactOwnedEdgeGone: false, exactUnambiguousHelperSessionRemoved: false }
};
let directory;
if (capture) {
  const raw = path.join(root, 'evidence', 'raw');
  directory = process.env.C038_CAPTURE_DIR ? path.resolve(process.env.C038_CAPTURE_DIR) : path.join(raw, `browser-${randomUUID()}`);
  assert.equal(path.dirname(directory), raw);
  assert.match(path.basename(directory), /^browser-[0-9a-f-]{36}$/);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  assert.equal(fs.realpathSync(directory), directory);
  assert.deepEqual(fs.readdirSync(directory), []);
}
function write(name, value) {
  if (!capture) return;
  assert.ok(['summary.json', 'initial.html', 'single-probe.html', 'failed-node.html',
    'stale-node.html', 'partial.html', 'unlinked.html', 'complete.html', 'reset.html',
    'replay.html', 'limit.html'].includes(name));
  fs.writeFileSync(path.join(directory, name), value, { flag: 'wx' });
}
function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}
async function browserInfo(action, pid) {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'browser-info.ps1'), '-Action', action, '-CallerNodePid', String(process.pid)];
  if (pid) args.push('-BrowserPid', String(pid));
  const result = await execute('pwsh.exe', args, { timeout: 20000, maxBuffer: 65536, windowsHide: true });
  return JSON.parse(result.stdout);
}
async function main() {
  const failures = [];
  let session;
  let observed;
  let helperSession;
  try {
    assert.match(process.version, /^v22\./);
    record.sourceVerification = sources.checkImports();
    const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
    assert.equal(sources.hash(fs.readFileSync(helper)), sources.imports().browserHelperRawSha256);
    record.helperRawSha256 = sources.imports().browserHelperRawSha256;
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    record.installedSignedEdge = await browserInfo('installed');
    const current = await require('..\\..\\C036\\current.cjs').readCurrent();
    record.separateCurrentNodeRead = {
      origin: current.contextOrigin, readStartedAtUtc: current.readStartedAtUtc,
      readCompletedAtUtc: current.readCompletedAtUtc, readerPid: current.receipt.pid,
      namespace: current.receipt.namespace, runId: current.receipt.state.runId,
      epoch: current.receipt.state.epoch, record: current.receipt.state.record,
      stateSha256: current.receipt.stateSha256, writesPerformed: current.receipt.writesPerformed,
      actualPoolInventoryAttested: false, nativeFreshnessAttested: false
    };
    const { openIsolatedLesson } = require(helper);
    const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    const before = new Set(fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name)));
    session = await openIsolatedLesson(path.join('capability', 'C038', 'index.html'));
    record.browserVersion = session.browserVersion;
    observed = await browserInfo('profile');
    assert.equal(observed.authenticodeStatus, 'Valid');
    assert.equal(observed.fileVersion, session.browserVersion);
    record.actualSignedOwnedEdge = observed;
    const created = fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name) && !before.has(name));
    assert.equal(created.length, 1, 'Only one unambiguously new helper session may be attributed; never guess another worker directory.');
    helperSession = path.join(runtime, created[0]);
    record.actualUnambiguousHelperSession = helperSession;
    checked('actual Microsoft-signed Edge 156 / approved offline PW 1.56.1 / Node 22 / unchanged helper', {
      browserPid: observed.actualOwnedBrowserPid, browserVersion: session.browserVersion,
      authenticodeStatus: observed.authenticodeStatus, helperRawSha256: record.helperRawSha256
    });
    const page = session.page;
    page.setDefaultTimeout(6000);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    await page.reload({ waitUntil: 'load', timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('load').disabled);
    const press = async (id) => {
      await page.locator(`#${id}`).focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press('Enter');
    };
    const outcome = async (decision) => {
      await page.waitForFunction((expected) => document.getElementById('status').dataset.decision === expected &&
        !document.getElementById('reset').disabled, decision);
    };
    const load = async (id) => {
      await page.locator('#fixture').selectOption(id);
      await press('load');
      await outcome('LOADED');
    };
    const inspect = async (id, decision) => {
      await load(id);
      await press('inspect');
      await outcome(decision);
    };
    assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.locator('#mode').textContent(), /bundled historical actual C015 observation/);
    assert.match(await page.locator('#context').textContent(), /bundled-historical-C015-observation-only/);
    const native = JSON.parse(await page.locator('#native-flags').textContent());
    assert.ok(Object.values(native).every((value) => value === false));
    const inventory = JSON.parse(await page.locator('#inventory').textContent());
    assert.equal(inventory.complete, true);
    assert.equal(inventory.instances.length, 2);
    assert.equal(inventory.dependencies.length, 2);
    assert.match(inventory.scope, /CLOSED_SYNTHETIC/);
    checked('actual initial DOM separates explicit fictional inventory, historical browser context and all native flags false', { inventory, flags: native });
    write('initial.html', await page.content());

    await press('load');
    assert.equal(await page.locator('#error').textContent(), 'UNKNOWN_FIXTURE_ID');
    assert.equal(await page.locator('#history li').count(), 0);
    checked('actual unknown picker errors without an implicit positive fixture', 'UNKNOWN_FIXTURE_ID');

    await page.locator('#fixture').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#fixture').inputValue(), 'single-probe');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'load');
    await page.keyboard.press('Enter');
    await outcome('LOADED');
    await press('copy');
    const selected = await page.locator('#candidate').evaluate((node) =>
      ({ start: node.selectionStart, end: node.selectionEnd, length: node.value.length, focused: document.activeElement === node }));
    assert.deepEqual(selected, { start: 0, end: selected.length, length: selected.length, focused: true });
    await press('inspect');
    await outcome('UNKNOWN');
    assert.equal(await page.locator('#coverage-count').textContent(), '1 / 6');
    assert.equal(await page.locator('#coverage tr').count(), 6);
    assert.match(await page.locator('#status').textContent(), /HOLD/);
    checked('actual keyboard/select-copy single HTTP 200 remains UNKNOWN/HOLD with five missing probes', selected);
    write('single-probe.html', await page.content());

    await inspect('failed-node', 'FAILED');
    assert.equal(await page.locator('#coverage-count').textContent(), '5 / 6');
    assert.match(await page.locator('#coverage').textContent(), /FAILED/);
    checked('actual failed required dependency blocks the model although five other probes pass', 'FAILED / HOLD');
    write('failed-node.html', await page.content());

    await inspect('stale-node', 'STALE');
    assert.equal(await page.locator('#coverage-count').textContent(), '5 / 6');
    assert.match(await page.locator('#coverage').textContent(), /STALE/);
    checked('actual age-at-TTL stale node blocks the model although five other probes pass', { now: 100, observed: 90, ttl: 10 });
    write('stale-node.html', await page.content());

    await inspect('partial', 'UNKNOWN');
    assert.equal(await page.locator('#coverage-count').textContent(), '5 / 6');
    assert.match(await page.locator('#missing').textContent(), /complete/);
    checked('actual partial observation is UNKNOWN/HOLD, not completed by a status code', 'response.complete missing');
    write('partial.html', await page.content());

    await inspect('unknown-clock', 'UNKNOWN');
    assert.equal(await page.locator('#coverage-count').textContent(), '0 / 6');
    checked('actual unknown clock cannot be adopted as current freshness', 'UNKNOWN / HOLD');

    await inspect('saved-closed-unlinked', 'UNKNOWN');
    const historical = JSON.parse(await page.locator('#historical').textContent());
    assert.equal(historical.actualHistoryJoinedToCurrentLease, false);
    const classes = historical.observations.attempts.map((item) => item.classification);
    assert.ok(classes.includes('failed') && classes.includes('unknown') && classes.includes('original-budget-exceeded'));
    checked('actual saved C034 failures/unknown/budget originals remain UNLINKED with honest saved source', historical);
    write('unlinked.html', await page.content());

    const originals = await page.locator('#history li').allTextContents();
    await inspect('complete', 'CLOSED_SYNTHETIC_READY');
    assert.equal(await page.locator('#coverage-count').textContent(), '6 / 6');
    assert.match(await page.locator('#actual-status').textContent(), /Actual pool: UNKNOWN \/ HOLD/);
    assert.deepEqual((await page.locator('#history li').allTextContents()).slice(0, 6), originals);
    await press('compare');
    const compared = JSON.parse(await page.locator('#comparison').textContent());
    assert.equal(compared.previousOriginalUnchanged, true);
    assert.equal(compared.actualPoolReady, false);
    assert.equal(compared.comparisonDoesNotProveScaling, true);
    checked('actual complete CLOSED SYNTHETIC positive and comparison do not repair earlier originals or attest actual capacity', {
      syntheticFreshProbes: 6, actualPoolReady: false, previousOriginalsRetained: originals.length
    });
    write('complete.html', await page.content());
    if (capture) {
      const file = path.join(directory, 'complete.png');
      assert.equal(fs.existsSync(file), false);
      await page.screenshot({ path: file, fullPage: true });
    }

    const retained = await page.locator('#history li').allTextContents();
    await press('reset');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    assert.equal(await page.locator('#candidate').inputValue(), '');
    assert.equal(await page.locator('#coverage-count').textContent(), '0 / 6');
    assert.deepEqual(await page.locator('#history li').allTextContents(), retained);
    checked('actual reset clears only presentation, retains every original, and restores picker keyboard focus', { history: retained.length, focus: 'fixture' });
    write('reset.html', await page.content());

    await inspect('complete', 'UNKNOWN');
    assert.equal(await page.locator('#error').textContent(), 'REPLAYED_ORIGINAL_ROUND');
    assert.equal(await page.locator('#history li').count(), 8);
    checked('actual replay after reset cannot overwrite or reuse the original positive', 'REPLAYED_ORIGINAL_ROUND');
    write('replay.html', await page.content());

    await page.locator('#candidate').fill('{"schemaVersion":1,"schemaVersion":1}');
    await press('inspect');
    await outcome('UNKNOWN');
    assert.equal(await page.locator('#error').textContent(), 'DUPLICATE_FIELD');
    checked('actual edited duplicate JSON errors through the guarded UI', 'DUPLICATE_FIELD');
    await inspect('missing-probe', 'UNKNOWN');
    assert.equal(await page.locator('#history li').count(), 10);
    assert.equal(await page.locator('#inspect').isDisabled(), true);
    assert.equal(await page.locator('#load').isDisabled(), true);
    await press('reset');
    assert.equal(await page.locator('#inspect').isDisabled(), true);
    assert.equal(await page.locator('#history li').count(), 10);
    assert.match(await page.locator('#history-limit').textContent(), /refused, not dropped/);
    checked('actual bounded history refuses work rather than silently dropping originals or allowing reset override', 10);
    write('limit.html', await page.content());

    const csp = await page.evaluate(async () => {
      async function violation(operation) {
        const pending = new Promise((resolve) => document.addEventListener('securitypolicyviolation',
          (event) => resolve({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI }), { once: true }));
        await operation();
        return pending;
      }
      const script = document.createElement('script');
      script.textContent = 'globalThis.__C038InlineRan = true;';
      const inline = await violation(() => document.head.appendChild(script));
      script.remove();
      let connectionReturned = false;
      const connection = await violation(async () => {
        try { await fetch(location.href, { method: 'GET', credentials: 'omit' }); connectionReturned = true; } catch {}
      });
      return { inline, connection, inlineRan: Boolean(globalThis.__C038InlineRan), connectionReturned };
    });
    assert.match(csp.inline.effectiveDirective, /^script-src/);
    assert.equal(csp.inline.blockedURI, 'inline');
    assert.equal(csp.inlineRan, false);
    assert.equal(csp.connection.effectiveDirective, 'connect-src');
    assert.equal(csp.connectionReturned, false);
    checked('actual enforced CSP denies inline script and attempted self-file connection', csp);
    assert.deepEqual(errors, []);
    const assets = ['index.html', 'style.css', 'model.js', 'readiness.js', 'page.js'].map((file) => path.join(root, file));
    assets.push(...[
      ['C020', 'contract.js'], ['C020', 'inspector.js'], ['C033', 'journey.js'],
      ['C034', 'trace.js'], ['C036', 'captured.js'], ['C036', 'attribution.js'],
      ['C034', 'evidence', 'raw', 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116', 'bundle.js']
    ].map((parts) => path.join(root, '..', ...parts)));
    const allowed = new Set(assets.map((file) => pathToFileURL(file).href));
    assert.ok(requests.length > 0 && requests.every((request) => request.method === 'GET' && allowed.has(request.url)));
    record.actualRequests = requests;
    record.pageErrors = errors;
    checked('actual closed file-only asset requests and zero page errors', { observedRequests: requests.length, allowedAssets: allowed.size });
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
    if (observed) {
      record.cleanup.exactOwnedProfileRemoved = !fs.existsSync(observed.actualIsolatedProfile);
      try { record.cleanup.exactOwnedEdgeGone = (await browserInfo('closed', observed.actualOwnedBrowserPid)).processGone; }
      catch (error) { failures.push(error); }
    }
    if (helperSession) record.cleanup.exactUnambiguousHelperSessionRemoved = !fs.existsSync(helperSession);
    if (!Object.values(record.cleanup).every((value) => value === true)) failures.push(new Error('Exact actual helper/profile/browser cleanup incomplete or unobserved.'));
    else checked('actual awaited finally closes this browser and removes its exact observed profile/helper session', record.cleanup);
    if (failures.length) record.outcome = 'failed';
    record.completedAtUtc = new Date().toISOString();
    record.measuredMonotonicMs = performance.now() - started;
    record.capture = capture ? 'exact CAPTURE_BROWSER_EVIDENCE=1; unique own append' : 'ordinary source/evidence read-only';
    write('summary.json', `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({ cardId: 'C038', outcome: record.outcome,
      checks: record.checks.length, browserVersion: record.browserVersion,
      cleanup: record.cleanup, capture: capture ? path.relative(repository, directory) : false }));
  }
  if (failures.length) throw new AggregateError(failures, 'Actual C038 browser assertions failed; original raw failures retained.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
