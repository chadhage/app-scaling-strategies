'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const execute = promisify(execFile);
const source = require('..\\source.cjs');
const { readCurrent } = require('..\\current.cjs');
const root = path.resolve(__dirname, '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
if (process.argv.length !== 2) throw new Error('No browser, source, capture-directory or identity overrides.');
const record = {
  schema: 'C035-actual-Edge-DOM/1', cardId: 'C035', workerId: 'worker-C035',
  startedAtUtc: new Date().toISOString(), outcome: 'not-run', runtime: process.version,
  interpretation: 'Actual new signed Edge DOM classification of HISTORICAL source and MODELED controls, not actual cancellation or user mutation.',
  helperPatched: false, unsafeFlagsUsed: false, foregroundLeaseUsed: false,
  actualCancellationPerformed: false, actualUserMutationSuccess: false,
  nativeAuthority: false, productionNode24Validated: false, liveAzureRuns: 0, cloudSpend: 0,
  checks: [], cleanup: { browserClosed: false, exactOwnedProfileRemoved: false,
    exactOwnedEdgeGone: false, exactOwnedHelperSessionRemoved: false }
};
let directory;
if (capture) {
  directory = path.join(root, 'evidence', 'raw', `edge-${randomUUID()}`);
  fs.mkdirSync(directory);
}
function write(name, bytes) {
  if (!capture) return;
  assert.match(name, /^[a-z-]+\.html$/);
  fs.writeFileSync(path.join(directory, `${name}.gz`), gzipSync(Buffer.from(bytes)), { flag: 'wx' });
}
function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}
async function signature(caller) {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(root, '..', 'C033', 'tests', 'signed-edge.ps1')];
  if (caller) args.push('-CallerNodePid', String(caller));
  return JSON.parse((await execute('pwsh.exe', args, { timeout: 20000, maxBuffer: 32768, windowsHide: true })).stdout);
}
async function owned(pid, action = 'profile') {
  return JSON.parse((await execute('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(root, '..', 'C036', 'tests', 'owned-browser.ps1'),
    '-CallerNodePid', String(process.pid), '-BrowserPid', String(pid), '-Action', action], {
    timeout: 20000, maxBuffer: 32768, windowsHide: true
  })).stdout);
}
async function main() {
  let session;
  let profile;
  let helperSession;
  const failures = [];
  try {
    assert.match(process.version, /^v22\./);
    const before = source.checkImports();
    const tools = JSON.parse(fs.readFileSync(path.join(root, 'browser-tools.json'), 'utf8'));
    for (const pin of tools.dependencies) {
      const bytes = source.readRegular(pin.path);
      assert.equal(source.hash(bytes), pin.rawSha256);
      const git = (await execute('git', ['--no-pager', 'show',
        `${tools.accepted[pin.card].commit}:${pin.path.replaceAll('\\', '/')}`], {
        cwd: source.repository, timeout: 15000, encoding: 'buffer', maxBuffer: 262144, windowsHide: true
      })).stdout;
      assert.equal(source.hash(git), pin.acceptedGitSha256);
    }
    const helper = path.join(source.repository, 'testing', 'browser', 'isolated.cjs');
    record.helperRawSha256 = source.hash(fs.readFileSync(helper));
    assert.equal(record.helperRawSha256, tools.helperRawSha256);
    record.playwrightVersion = require(path.join(source.repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    record.installedSignedEdge = await signature();
    const current = await readCurrent();
    record.separateNodeCurrentRead = {
      origin: current.origin, pid: current.receipt.pid, readCompletedAtUtc: current.readCompletedAtUtc,
      runId: current.receipt.state.runId, epoch: current.receipt.state.epoch,
      record: current.receipt.state.record, writesPerformed: current.receipt.writesPerformed,
      interpretation: 'Node public restore only, never a browser disk read or authenticated historical association'
    };
    const runtime = path.join(source.repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    const beforeSessions = new Set(fs.readdirSync(runtime));
    const { openIsolatedLesson } = require(helper);
    session = await openIsolatedLesson(path.join('capability', 'C035', 'index.html'));
    record.browserVersion = session.browserVersion;
    record.actualSignedEdge = await signature(process.pid);
    assert.equal(record.actualSignedEdge.fileVersion, session.browserVersion);
    assert.equal(record.actualSignedEdge.authenticodeStatus, 'Valid');
    profile = await owned(record.actualSignedEdge.actualOwnedBrowserPid);
    record.actualProfile = profile;
    const created = fs.readdirSync(runtime).filter((name) =>
      /^session-[0-9a-f-]{36}$/.test(name) && !beforeSessions.has(name));
    assert.equal(created.length, 1, 'Only one unambiguously new published-helper session may be attributed; never select or clean a peer directory.');
    helperSession = path.join(runtime, created[0]);
    assert.equal(fs.lstatSync(helperSession).isDirectory(), true);
    assert.equal(fs.lstatSync(helperSession).isSymbolicLink(), false);
    record.actualHelperSession = helperSession;
    checked('actual caller-owned Microsoft-signed Edge 156, sandboxed approved helper and offline Playwright', {
      nodePid: process.pid, browserPid: profile.actualBrowserPid, version: session.browserVersion,
      authenticode: record.actualSignedEdge.authenticodeStatus, playwright: record.playwrightVersion,
      exactOwnProfile: profile.actualIsolatedProfile, helperSession
    });
    const page = session.page;
    page.setDefaultTimeout(5000);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    await page.reload({ waitUntil: 'load', timeout: 10000 });
    const state = async () => JSON.parse(await page.locator('#state').textContent());
    const result = async () => JSON.parse(await page.locator('#result').textContent());
    const press = async (id, key = 'Enter') => {
      await page.waitForFunction(() => !document.getElementById('inspect').disabled);
      await page.locator(`#${id}`).focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press(key);
    };
    const settled = async (outcome) => page.waitForFunction((expected) =>
      document.getElementById('status').dataset.outcome === expected &&
      !document.getElementById('inspect').disabled, outcome);
    const inspect = async (id) => {
      await page.locator('#source-id').selectOption(id);
      await press('inspect');
      await settled('classified');
      return result();
    };
    const copy = async (id) => {
      await page.locator('#source-id').selectOption(id);
      await press('load-copy');
      await page.waitForFunction((expected) => {
        try { return JSON.parse(document.getElementById('candidate').value).sourceId === expected; }
        catch { return false; }
      }, id);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'candidate');
    };
    assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.locator('#mode').textContent(), /bundled HISTORICAL/);
    assert.equal(await page.locator('#source-id').inputValue(), '');
    const context = JSON.parse(await page.locator('#context').textContent());
    assert.equal(context.origin, 'BUNDLED_HISTORICAL_C015_PUBLIC_RESTORE_OBSERVATION_ONLY');
    assert.deepEqual(context.runs.map((run) => run.state.record.status), ['completed', 'running']);
    assert.equal(context.actualBrowserDiskRead, false);
    checked('actual initial DOM separates historical C015 closed records/envelope from current Node context', context);
    write('initial.html', await page.content());

    await press('inspect');
    await settled('rejected');
    assert.equal(await page.locator('#error').textContent(), 'UNKNOWN_SOURCE_ID');
    assert.equal((await state()).history.length, 1);
    checked('actual unknown selection is a visible typed error with no default source', 'UNKNOWN_SOURCE_ID');
    write('unknown.html', await page.content());

    await page.locator('#source-id').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#source-id').inputValue(), 'closed-history');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inspect');
    await page.keyboard.press('Enter');
    await settled('classified');
    let observed = await result();
    assert.deepEqual([observed.counts.originals, observed.counts.pass, observed.counts.fail, observed.counts.hold], [7, 2, 2, 3]);
    assert.equal(observed.dimensionCounts.required, 42);
    assert.equal(observed.originals[2].decision, 'FAIL');
    assert.equal(observed.originals[4].classification, 'INTERRUPTED');
    assert.equal(observed.originals[6].classification, 'UNKNOWN');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'result-heading');
    checked('actual keyboard inspect retains seven originals, original budget FAIL, explicit interruptions and summary UNKNOWN', observed.counts);
    write('originals.html', await page.content());

    observed = await inspect('held-snapshot');
    assert.equal(observed.decision, 'HOLD');
    assert.equal(observed.originals[1].dimensions.terminal, 'UNKNOWN');
    assert.equal(observed.originals[1].endedAt, null);
    checked('actual partial original DOM cannot obtain a missing end, state or terminal', observed.originals[1]);
    write('partial.html', await page.content());

    observed = await inspect('modeled-unsupported');
    assert.equal(observed.originals[0].classification, 'UNSUPPORTED');
    assert.equal(observed.counts.pass, 0);
    assert.equal(observed.decision, 'HOLD');
    checked('actual unsupported result is explicit HOLD and not mutation success', observed.originals[0]);
    write('unsupported.html', await page.content());

    observed = await inspect('modeled-cancel-request');
    assert.equal(observed.originals[0].classification, 'UNKNOWN');
    assert.equal(observed.originals[0].terminalEvidence, null);
    assert.equal(observed.originals[0].cancellationEvidence, 'UNKNOWN_REQUIRED_CANCEL_TERMINAL_ACK_ABSENT');
    checked('actual cancellation-request DOM stays UNKNOWN/HOLD without terminal ack or inferred no-effects', observed.originals[0]);
    write('cancel-request.html', await page.content());

    observed = await inspect('modeled-cancelled');
    assert.equal(observed.originals[0].classification, 'CANCELLED');
    assert.equal(observed.originals[0].cancelledWork, 'MODELED_ONLY');
    assert.equal(observed.originals[0].noEffectsEvidence, 'UNKNOWN');
    assert.equal(observed.actualC015Cancellation, false);
    assert.equal(observed.externalUndoVerified, false);
    assert.equal(observed.decision, 'HOLD');
    checked('actual positive cancel control DOM is MODELED fiction only, not C015/native cancellation, no effect or external undo', observed.originals[0]);
    write('cancelled.html', await page.content());

    observed = await inspect('modeled-cancelled-no-effect');
    assert.equal(observed.originals[0].noEffectsEvidence, 'MODELED_ZERO_EFFECT_RECEIPT_ONLY');
    assert.equal(observed.actualNoEffectsVerified, false);
    assert.equal(observed.externalUndoVerified, false);
    checked('actual separate modeled zero-effect receipt still denies real no-effects, undo and cleanup claims', observed.originals[0]);
    write('no-effect.html', await page.content());

    observed = await inspect('modeled-interrupted');
    assert.equal(observed.originals[0].classification, 'INTERRUPTED');
    assert.equal(observed.originals[0].cancelledWork, 'NOT_VERIFIED');
    checked('actual interrupted result is not renamed cancelled or completed', observed.originals[0]);
    write('interrupted.html', await page.content());

    await page.locator('#comparison-id').selectOption('retry');
    await press('compare', 'Space');
    await settled('classified');
    observed = await result();
    assert.equal(observed.before.originals[0].decision, 'FAIL');
    assert.equal(observed.after.originals[0].decision, 'FAIL');
    assert.deepEqual([observed.counts.originals, observed.counts.pass, observed.counts.fail], [2, 1, 1]);
    assert.equal(observed.decision, 'FAIL');
    checked('actual Space comparison keeps first original FAIL after a positive new attempt without doubling denominator', observed.counts);
    write('compare.html', await page.content());

    await copy('closed-history');
    await page.locator('#candidate').fill('{"schema":1,"schema":2}');
    await press('inspect-copy');
    await settled('rejected');
    observed = await result();
    assert.equal(observed.code, 'DUPLICATE_FIELD');
    assert.equal(observed.counts.fail, 2);
    assert.equal(observed.decision, 'FAIL');
    checked('actual duplicated JSON rejects visibly while preserving immutable known source failures', { code: observed.code, counts: observed.counts });
    write('duplicate.html', await page.content());

    await copy('closed-history');
    const forged = JSON.parse(await page.locator('#candidate').inputValue());
    forged.eligibleForLiveRun = true;
    forged.currentContext = { runId: 'synthetic-run-001', epoch: 3 };
    await page.locator('#candidate').fill(JSON.stringify(forged));
    await press('inspect-copy');
    await settled('rejected');
    observed = await result();
    assert.equal(observed.code, 'TAMPERED_OR_FORGED_SOURCE_COPY');
    assert.equal(observed.counts.fail, 2);
    assert.equal(observed.candidateAdopted, false);
    checked('actual forged eligibility/current context rejects without authority adoption or FAIL-to-UNKNOWN laundering', observed.code);
    write('forged.html', await page.content());

    await copy('closed-history');
    await press('inspect-copy');
    await settled('classified');
    observed = await result();
    assert.equal(observed.copyAccepted, true);
    assert.equal(observed.candidateAdopted, false);
    assert.equal(observed.counts.fail, 2);
    checked('actual exact-copy inspection confirms data agreement only, not work mutation or current authority', observed.counts);
    write('exact-copy.html', await page.content());

    const beforeReset = await state();
    await press('reset', 'Space');
    await page.waitForFunction(() => document.activeElement.id === 'source-id');
    const afterReset = await state();
    assert.equal(afterReset.latest, null);
    assert.deepEqual(afterReset.history, beforeReset.history);
    assert.equal(afterReset.history.length, 12);
    assert.equal(afterReset.retainedDecision, 'FAIL');
    assert.equal(await page.locator('#candidate').inputValue(), '');
    assert.equal(await page.locator('#result').textContent(), '');
    checked('actual presentation reset returns focus and preserves all twelve classification/error records, UNKNOWNs and failures', {
      retained: afterReset.history.length, retainedDecision: afterReset.retainedDecision, focus: 'source-id'
    });
    write('reset.html', await page.content());

    const csp = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push(event.effectiveDirective));
      const script = document.createElement('script');
      script.textContent = 'globalThis.C035UnexpectedInline = true';
      document.head.append(script);
      let blocked = false;
      try { await fetch('http://127.0.0.1:9/C035-CSP-probe'); } catch { blocked = true; }
      await new Promise((resolve) => setTimeout(resolve, 30));
      script.remove();
      return { inlineExecuted: globalThis.C035UnexpectedInline === true, fetchBlocked: blocked, violations };
    });
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.fetchBlocked, true);
    assert.ok(csp.violations.some((value) => value.startsWith('script-src')));
    assert.ok(csp.violations.includes('connect-src'));
    assert.equal(requests.some((request) => /^https?:/.test(request.url)), false);
    checked('actual CSP blocks inline code and connection without network requests or unsafe flags', csp);
    write('csp.html', await page.content());

    for (let index = afterReset.history.length; index < 16; index++) await inspect('modeled-cancel-request');
    const beforeOverflow = await state();
    await page.locator('#source-id').selectOption('modeled-complete');
    await press('inspect');
    await settled('rejected');
    const afterOverflow = await state();
    assert.equal(await page.locator('#error').textContent(), 'HISTORY_LIMIT_RETAINED');
    assert.deepEqual(afterOverflow.history, beforeOverflow.history);
    assert.equal(afterOverflow.retainedEntries, 16);
    assert.equal(afterOverflow.retainedDecision, 'FAIL');
    checked('actual bounded history refuses a success-shaped overflow without dropping any original or error', {
      retained: afterOverflow.retainedEntries, overflowRefused: afterOverflow.overflowRefused
    });
    write('overflow.html', await page.content());
    assert.deepEqual(errors, []);
    assert.deepEqual(source.checkImports(), before);
    checked('actual DOM has no page errors and all source/evidence dependencies remain byte-identical', { pageErrors: errors, sourcesUnchanged: true });
    record.outcome = 'passed';
  } catch (error) {
    record.outcome = 'failed';
    record.failure = { name: error.name, message: error.message, code: error.code || null, stack: error.stack };
    failures.push(error);
  } finally {
    if (session) {
      try { await session.close(); record.cleanup.browserClosed = true; }
      catch (error) { failures.push(error); record.cleanup.closeError = error.message; }
    }
    if (profile) {
      record.cleanup.exactOwnedProfileRemoved = !fs.existsSync(profile.actualIsolatedProfile);
      try { record.cleanup.exactOwnedEdgeGone = (await owned(profile.actualBrowserPid, 'closed')).processGone === true; }
      catch (error) { failures.push(error); record.cleanup.ownershipCheckError = error.message; }
    }
    if (helperSession) record.cleanup.exactOwnedHelperSessionRemoved = !fs.existsSync(helperSession);
    if (!Object.values(record.cleanup).every((value) => value === true)) failures.push(new Error('Exact owned browser cleanup not fully verified.'));
    record.completedAtUtc = new Date().toISOString();
    if (failures.length) record.outcome = 'failed';
    record.actualDomChecksPassed = record.checks.length;
    if (capture) fs.writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(record));
  }
  if (failures.length) throw new AggregateError(failures, 'Actual C035 browser verification failed; original failure and cleanup evidence retained.');
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
