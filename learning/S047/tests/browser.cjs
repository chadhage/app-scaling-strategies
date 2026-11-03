'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const owned = path.resolve(__dirname, '..');
const repo = path.resolve(owned, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);

async function main() {
  const report = {
    schemaVersion: 1, cardId: 'A-S047', workerId: 'worker-A-S047', packet: 'SC-S047',
    mode: 'actual isolated DOM over a synthetic lesson', nativeProof: 'not performed',
    startedAtUtc: new Date().toISOString(), node: process.version, helperSha256,
    checks: [], verifier: 'RUNNING', cleanup: { awaitedFinally: false },
    lifecycleScope: 'Published helper only; no abandoned recovery prototype or unattended lifecycle certification.',
  };
  const session = await openIsolatedLesson(path.join('learning', 'S047', 'index.html'));
  const page = session.page;
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
  const receipt = async () => JSON.parse(await page.locator('#receipt').textContent());
  const history = async () => (await page.locator('#history > li pre').allTextContents()).map((value) => JSON.parse(value));
  const reset = async () => page.locator('#reset-lesson').click();
  const configure = async (config) => {
    const ids = { acknowledged: 'acknowledged', continuation: 'continuation', nativeEvidence: 'native-evidence', proxyEvidence: 'proxy-evidence', resumeDelayMs: 'resume-delay', budgetMs: 'budget' };
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number') await page.locator(`#${ids[key]}`).fill(String(value));
      else await page.locator(`#${ids[key]}`).selectOption(value);
    }
  };
  const complete = async () => {
    for (const id of ['start-stream', 'cutover-stream', 'resume-stream', 'check-result']) await page.locator(`#${id}`).click();
    return receipt();
  };
  const conduct = async (config) => { await reset(); await configure(config); return complete(); };
  async function check(name, action) {
    try {
      const observed = await action();
      report.checks.push({ name, status: 'PASS', observed: observed || null });
    } catch (error) {
      report.checks.push({ name, status: 'FAIL', error: error.message });
      throw error;
    }
  }
  let failure;
  try {
    await page.reload({ waitUntil: 'load' });
    report.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion, '156.0.4314.50');
    await check('local page, exact training banner, labeled controls and disabled phase guards', async () => {
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(await page.title(), /S047.*gRPC/);
      assert.match(await page.locator('#phase').textContent(), /ready/);
      for (const id of ['acknowledged', 'continuation', 'native-evidence', 'proxy-evidence', 'resume-delay', 'budget']) {
        assert.ok(await page.locator(`label[for="${id}"]`).textContent());
      }
      for (const id of ['cutover-stream', 'resume-stream', 'check-result']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.locator('#history > li').count(), 0);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      return { initialHistory: 0, fileScheme: new URL(page.url()).protocol };
    });

    await check('keyboard-only checkpoint continuation, immutable admission, original clock and reset focus', async () => {
      await page.locator('#acknowledged').focus();
      for (let count = 0; count < 6; count += 1) await page.keyboard.press('Tab');
      assert.equal(await page.locator('#start-stream').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#acknowledged').isDisabled(), true);
      assert.equal(await page.locator('#cutover-stream').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#resume-stream').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#check-result').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      const result = await receipt();
      assert.equal(result.verdict, 'PASS');
      assert.equal(result.native.resumeFrom, 4);
      assert.deepEqual(result.native.streamIds, ['synthetic-native-v1-1', 'synthetic-native-v2-1']);
      assert.equal(result.native.originalStreamSurvived, false);
      assert.deepEqual(result.native.records, [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.deepEqual(result.proxy.records, result.native.records);
      assert.equal(result.native.grpcStatus, 0);
      assert.equal(result.elapsedMs, 120);
      assert.match(await page.locator('#deadline-result').textContent(), /120 ms \/ 200 ms/);
      assert.equal(await page.locator('#reset-lesson').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#acknowledged').evaluate((node) => node === document.activeElement), true);
      assert.equal((await history())[0].verdict, 'PASS');
      return { requestedFrom: 4, originalStreamSurvived: false, elapsedMs: result.elapsedMs, keyboardResetFocus: 'acknowledged' };
    });

    await check('ordinary HTTP 200 remains UNSUPPORTED despite successful proxy sequences', async () => {
      const result = await conduct({ nativeEvidence: 'ordinary-http' });
      assert.equal(result.native.httpStatus, 200);
      assert.equal(result.native.verdict, 'UNSUPPORTED');
      assert.equal(result.proxy.verdict, 'PASS');
      assert.equal(result.verdict, 'UNSUPPORTED');
      assert.match(await page.locator('#native-result').textContent(), /HTTP\/1\.1.*application\/json/);
      assert.match(await page.locator('#overall-result').textContent(), /^UNSUPPORTED/);
      return { native: result.native.verdict, proxy: result.proxy.verdict, overall: result.verdict };
    });

    await check('nonzero gRPC trailer is FAIL even with HTTP 200 and a passing proxy', async () => {
      const result = await conduct({ nativeEvidence: 'grpc-error' });
      assert.equal(result.native.httpStatus, 200);
      assert.equal(result.native.grpcStatus, 14);
      assert.equal(result.verdict, 'FAIL');
      assert.equal(result.proxy.verdict, 'PASS');
      assert.match(await page.locator('#native-result').textContent(), /grpc-status 14/);
      return { httpStatus: 200, grpcStatus: 14, overall: result.verdict };
    });

    for (const [name, config, unknownLane] of [
      ['missing native receipts do not borrow proxy proof', { nativeEvidence: 'missing' }, 'native'],
      ['missing gRPC trailers do not inherit HTTP success', { nativeEvidence: 'missing-trailers' }, 'native'],
      ['missing proxy receipts do not erase native observations', { proxyEvidence: 'missing' }, 'proxy'],
    ]) {
      await check(name, async () => {
        const result = await conduct(config);
        assert.equal(result.verdict, 'UNKNOWN');
        assert.equal(result[unknownLane].verdict, 'UNKNOWN');
        if (config.nativeEvidence === 'missing-trailers') {
          assert.equal(result.native.grpcStatus, null);
          assert.equal(result.native.metrics.complete, true);
        } else {
          assert.equal(result[unknownLane].metrics.unknown, 8);
          assert.equal(result[unknownLane].metrics.missingCount, null);
          assert.match(await page.locator(`#${unknownLane}-metrics`).textContent(), /dropped unknown.*unknown outcomes 8/);
        }
        assert.match(await page.locator('#overall-result').textContent(), /^UNKNOWN/);
        return { native: result.native.verdict, proxy: result.proxy.verdict, overall: result.verdict };
      });
    }

    await check('proxy gaps and duplicates are explicit independent failures', async () => {
      const dropped = await conduct({ proxyEvidence: 'drop' });
      assert.equal(dropped.native.verdict, 'PASS');
      assert.equal(dropped.verdict, 'FAIL');
      assert.deepEqual(dropped.proxy.metrics.missingSequences, [8]);
      assert.match(await page.locator('#proxy-metrics').textContent(), /dropped 1 \[8\]/);
      const duplicated = await conduct({ proxyEvidence: 'duplicate' });
      assert.equal(duplicated.native.verdict, 'PASS');
      assert.equal(duplicated.verdict, 'FAIL');
      assert.deepEqual(duplicated.proxy.metrics.duplicateSequences, [4]);
      assert.match(await page.locator('#proxy-metrics').textContent(), /duplicate count 1 \[4\]/);
      return { missing: [8], duplicated: [4], nativeVerdict: 'PASS', overall: 'FAIL' };
    });

    await check('restart, skip and absent continuation expose exact application defects', async () => {
      const replay = await conduct({ continuation: 'restart' });
      assert.equal(replay.verdict, 'FAIL');
      assert.deepEqual(replay.native.metrics.duplicateSequences, [1, 2, 3]);
      const skipped = await conduct({ continuation: 'skip' });
      assert.equal(skipped.verdict, 'FAIL');
      assert.deepEqual(skipped.native.metrics.missingSequences, [4]);
      const absent = await conduct({ continuation: 'none' });
      assert.equal(absent.verdict, 'FAIL');
      assert.deepEqual(absent.native.metrics.missingSequences, [4, 5, 6, 7, 8]);
      assert.equal(absent.native.streamIds.length, 1);
      return { replayDuplicates: [1, 2, 3], skipped: [4], absent: [4, 5, 6, 7, 8] };
    });

    await check('known proxy failure wins while missing native evidence remains UNKNOWN', async () => {
      const result = await conduct({ nativeEvidence: 'missing', proxyEvidence: 'duplicate' });
      assert.equal(result.native.verdict, 'UNKNOWN');
      assert.equal(result.proxy.verdict, 'FAIL');
      assert.equal(result.verdict, 'FAIL');
      return { native: 'UNKNOWN', proxy: 'FAIL', overall: 'FAIL' };
    });

    await check('inclusive original deadline passes at 120 and fails at 119 milliseconds', async () => {
      const exact = await conduct({ budgetMs: 120 });
      assert.equal(exact.elapsedMs, 120);
      assert.equal(exact.verdict, 'PASS');
      const late = await conduct({ budgetMs: 119 });
      assert.equal(late.elapsedMs, 120);
      assert.equal(late.verdict, 'FAIL');
      assert.match(await page.locator('#deadline-result').textContent(), /120 ms \/ 119 ms.*FAIL/);
      return { elapsedMs: 120, inclusiveBudgetPass: 120, budgetFail: 119 };
    });

    await check('actual DOM input errors do not admit attempts or change history', async () => {
      await reset();
      const priorHistory = await history();
      for (const [id, value] of [
        ['acknowledged', ''], ['acknowledged', '1.5'], ['acknowledged', '7'], ['acknowledged', '-1'],
        ['resume-delay', '1001'], ['budget', '0'], ['budget', '1e2'], ['budget', 'Infinity'],
      ]) {
        await reset();
        await page.locator(`#${id}`).evaluate((node, next) => { node.value = next; }, value);
        await page.locator('#start-stream').click();
        assert.match(await page.locator('#error-message').textContent(), /INVALID_INPUT/);
        assert.match(await page.locator('#phase').textContent(), /ready/);
        assert.equal(await page.locator('#error-message').evaluate((node) => node === document.activeElement), true);
        assert.equal(await page.locator('#start-stream').isEnabled(), true);
        assert.deepEqual(await history(), priorHistory);
      }
      await reset();
      await page.locator('#native-evidence').evaluate((node) => { node.value = 'unlisted'; });
      await page.locator('#start-stream').click();
      assert.match(await page.locator('#error-message').textContent(), /INVALID_INPUT.*nativeEvidence/);
      assert.deepEqual(await history(), priorHistory);
      await reset();
      assert.equal(await page.locator('#error-message').textContent(), '');
      return { rejectedDOMInputs: 9, admittedAttempts: 0 };
    });

    await check('DOM-tampered disabled actions still hit state guards and retain the prior failure', async () => {
      await reset();
      const before = await history();
      await page.locator('#resume-stream').evaluate((node) => { node.disabled = false; });
      await page.locator('#resume-stream').click();
      assert.match(await page.locator('#error-message').textContent(), /INVALID_PHASE/);
      assert.equal(await page.locator('#resume-stream').isDisabled(), true);
      assert.deepEqual(await history(), before);
      const failed = await conduct({ continuation: 'skip' });
      const checkedHistory = await history();
      await page.locator('#check-result').evaluate((node) => { node.disabled = false; });
      await page.locator('#check-result').click();
      assert.match(await page.locator('#error-message').textContent(), /INVALID_PHASE/);
      assert.deepEqual(await receipt(), failed);
      assert.deepEqual(await history(), checkedHistory);
      return { invalidPhaseGuards: 2, priorFailurePreserved: true };
    });

    await check('keyboard reset restores every default, records unfinished UNKNOWN, and bounds full history', async () => {
      await reset();
      await configure({ acknowledged: 6, continuation: 'restart', nativeEvidence: 'grpc-error', proxyEvidence: 'duplicate', resumeDelayMs: 999, budgetMs: 1 });
      await page.locator('#start-stream').click();
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#acknowledged').evaluate((node) => node === document.activeElement), true);
      for (const [id, value] of Object.entries({ acknowledged: '3', continuation: 'checkpoint', 'native-evidence': 'grpc', 'proxy-evidence': 'complete', 'resume-delay': '40', budget: '200' })) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
        assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      }
      const retained = await history();
      assert.equal(retained[0].verdict, 'UNKNOWN');
      assert.equal(retained[0].reason, 'RESET_INCOMPLETE');
      assert.equal(retained[0].configuration.acknowledged, 6);
      assert.equal(retained[1].verdict, 'FAIL');
      assert.ok(retained[1].native.metrics.missingSequences.includes(4));
      await reset();
      assert.deepEqual(await history(), retained);
      for (let count = 0; count < 9; count += 1) {
        await page.locator('#start-stream').click();
        await reset();
      }
      const bounded = await history();
      assert.equal(bounded.length, 8);
      assert.equal(await page.locator('#history > li details pre').count(), 8);
      const newest = bounded[0].runId;
      assert.deepEqual(bounded.map((entry) => entry.runId), Array.from({ length: 8 }, (_, index) => newest - index));
      assert.ok(bounded.every((entry) => entry.reason === 'RESET_INCOMPLETE' && entry.trace.at(-1).action === 'reset-incomplete'));
      return { retainedOutcomes: 8, unfinishedVerdict: 'UNKNOWN', exactDefaultReset: true, keyboardFocus: 'acknowledged' };
    });

    await check('enforced CSP blocks inline code, dynamic evaluation and even data-scheme connections', async () => {
      assert.deepEqual(consoleErrors, []);
      await page.evaluate(() => {
        let debuggerEvaluation;
        try { debuggerEvaluation = new Function('return 47')(); } catch (error) { debuggerEvaluation = error.name; }
        globalThis.__s047CspTest = { inlineRan: false, evalBlocked: false, connectBlocked: false, complete: false, debuggerEvaluation, violations: [] };
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s047CspTest.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
        });
        const probe = document.createElement('script');
        probe.src = new URL('tests/csp-probe.js', location.href).href;
        document.body.append(probe);
      });
      await page.waitForFunction(() => globalThis.__s047CspTest.complete
        && globalThis.__s047CspTest.violations.some((event) => event.directive === 'connect-src')
        && globalThis.__s047CspTest.violations.filter((event) => event.directive.startsWith('script-src')).length >= 2);
      const csp = await page.evaluate(() => globalThis.__s047CspTest);
      assert.equal(csp.inlineRan, false);
      assert.equal(csp.evalBlocked, true);
      assert.equal(csp.connectBlocked, true);
      assert.ok(csp.violations.every((event) => event.disposition === 'enforce'));
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(pageErrors, []);
      report.expectedCspConsoleErrors = consoleErrors;
      return csp;
    });
    report.verifier = 'PASS';
    report.userImpact = 'Expected synthetic successes, failures, unsupported evidence and unknowns observed; no live user or native claim.';
    report.externalRequests = externalRequests;
    report.pageErrors = pageErrors;
  } catch (error) {
    failure = error;
    report.verifier = 'FAIL';
    report.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      await session.close();
      report.cleanup = { awaitedFinally: true, status: 'PASS', scope: 'This isolated session closed; no shared foreground or profile used.' };
    } catch (error) {
      report.cleanup = { awaitedFinally: true, status: 'FAIL', error: error.message };
      report.verifier = 'FAIL';
      failure = failure ? new AggregateError([failure, error], 'Browser checks and cleanup failed') : error;
    }
    report.finishedAtUtc = new Date().toISOString();
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
      const directory = path.join(owned, 'evidence');
      fs.mkdirSync(directory, { recursive: true });
      for (let number = 1; ; number += 1) {
        const name = number === 1 ? 'browser.json' : `browser-${String(number).padStart(3, '0')}.json`;
        try {
          fs.writeFileSync(path.join(directory, name), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
          break;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
    }
    console.log(JSON.stringify(report, null, 2));
  }
  if (failure) throw failure;
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
