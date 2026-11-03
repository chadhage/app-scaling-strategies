'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lessonRoot = path.resolve(__dirname, '..');
const helper = path.resolve(lessonRoot, '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperHash = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperHash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);

test('actual isolated DOM, keyboard, outcomes, errors, history, reset and enforced CSP', { timeout: 120000 }, async (t) => {
  let session;
  const observations = [];
  const pageErrors = [];
  const requests = [];
  const evidence = {
    cardId: 'A-S068', workerId: 'worker-A-S068', mode: 'synthetic-file-browser',
    startedAtUtc: new Date().toISOString(), helperRawSha256: helperHash,
    helper: 'testing\\browser\\isolated.cjs', helperCommit: '53c0c0d',
    entry: 'learning\\S068\\index.html', banner: 'Training rehearsal - synthetic data - not a live Azure result',
  };
  try {
    session = await openIsolatedLesson('learning\\S068\\index.html');
    evidence.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    const text = (selector) => page.locator(selector).textContent();
    const equals = async (selector, value) => assert.equal(await text(selector), value);
    const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
    const check = async (verdict) => {
      await page.locator('#prediction').selectOption(verdict);
      await page.locator('#check-outcome').click();
    };
    const fresh = async () => { await page.locator('#new-attempt').click(); };
    const reset = async () => { await page.locator('#reset-rehearsal').click(); };
    const observe = async () => {
      await page.locator('#assess-build').click();
      await page.locator('#run-load').click();
    };

    await t.test('portable load, exact banner, labelled controls and actual Tab/arrows', async () => {
      await equals('.banner', evidence.banner);
      assert.equal(await page.title(), 'S068 — Index creation under load');
      assert.equal(await page.locator('#configuration select').count(), 5);
      await equals('#result', 'No result yet.');
      assert.equal(await page.locator('#run-load').isDisabled(), true);
      assert.equal(await page.evaluate(() => typeof document.getElementById('build-form').reset), 'function');
      assert.equal(await page.locator('[name="reset"], [id="reset"]').count(), 0);
      for (const id of ['operation', 'capability', 'budget-ms', 'guard-policy', 'coverage', 'prediction']) {
        assert.equal(await page.locator(`label[for="${id}"]`).count(), 1);
      }
      await page.locator('#operation').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#operation').inputValue(), 'online');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#operation').inputValue(), 'blocking');
      for (const id of ['capability', 'budget-ms', 'guard-policy', 'coverage', 'assess-build']) {
        await page.keyboard.press('Tab');
        await focused(id);
      }
      evidence.loadedResources = await page.evaluate(() =>
        [...document.querySelectorAll('script[src], link[rel="stylesheet"]')]
          .map((element) => element.src || element.href));
      assert.equal(evidence.loadedResources.length, 4);
      assert.ok(evidence.loadedResources.every((url) => url.startsWith('file:') && url.includes('/learning/S068/')));
      assert.deepEqual(await page.evaluate(() => ({
        model: typeof globalThis.IndexBuildLesson.assessBuild,
        fixture: globalThis.IndexBuildFixture.id,
        bodyColor: getComputedStyle(document.body).backgroundColor,
      })), { model: 'function', fixture: 'S068-four-requests-v1', bodyColor: 'rgb(16, 25, 39)' });
      evidence.assetObservation = 'Resolved local DOM URLs, live fixture/model and computed stylesheet; file: ResourceTiming is not a request audit.';
      observations.push({ check: 'portable-keyboard', result: 'passed', nativeFormReset: true });
    });

    await t.test('blocking failure, keyboard actions, blank prediction error and honest mismatch', async () => {
      await page.keyboard.press('Enter');
      await focused('run-load');
      await page.keyboard.press('Space');
      await focused('prediction');
      await equals('#result', 'FAIL / INTERRUPTED');
      await equals('#attempted', '4');
      await equals('#observed', '4');
      await equals('#failed', '3');
      await equals('#unknown', '0');
      await equals('#max-latency', '14');
      await equals('#max-lock', '12');
      assert.equal(await page.locator('#receipts tr').count(), 4);
      assert.equal(await page.locator('#configuration select:disabled').count(), 5);
      await page.keyboard.press('Tab');
      await focused('check-outcome');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await text('#error'), /prediction/i);
      assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
      await focused('prediction');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#prediction').inputValue(), 'PASS');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await focused('new-attempt');
      assert.match(await text('#feedback'), /Prediction mismatch.*actual FAIL/);
      await equals('#result', 'FAIL / INTERRUPTED');
      assert.equal(await page.locator('#history li').count(), 1);
      observations.push({ check: 'blocking-failure-and-mismatch', verdict: await text('#result'),
        attempted: 4, observed: 4, failed: 3, maxLatencyMs: 14, maxLockWaitMs: 12 });
    });

    await t.test('online comparison keeps boundary locks and the earlier interrupted history', async () => {
      await page.keyboard.press('Space');
      await focused('assess-build');
      assert.equal(await page.locator('#operation').inputValue(), 'blocking');
      assert.equal(await page.locator('#history li').count(), 1);
      assert.equal(await page.locator('#receipts tr').count(), 0);
      await page.locator('#operation').focus();
      await page.keyboard.press('ArrowDown');
      await page.locator('#assess-build').focus();
      await page.keyboard.press('Space');
      await focused('run-load');
      await page.keyboard.press('Enter');
      await equals('#result', 'PASS / BUDGET_MET');
      await equals('#observed', '4');
      await equals('#failed', '0');
      await equals('#max-latency', '3');
      await equals('#max-lock', '1');
      const locks = await page.locator('#receipts tr td:nth-child(2)').allTextContents();
      assert.deepEqual(locks, ['1', '0', '0', '1']);
      await check('PASS');
      assert.match(await text('#feedback'), /Prediction matches/);
      assert.equal(await page.locator('#history li').count(), 2);
      assert.match(await page.locator('#history li').first().textContent(), /FAIL \/ INTERRUPTED/);
      observations.push({ check: 'permitted-online-comparison', verdict: await text('#result'),
        observed: 4, failed: 0, maxLatencyMs: 3, lockWaitsMs: [1, 0, 0, 1], retainedFailure: true });
    });

    await t.test('budget rejection, unsupported capability and unknown capability are not successful load', async () => {
      await fresh();
      await page.locator('#guard-policy').selectOption('enforce');
      await page.locator('#assess-build').click();
      await equals('#result', 'REJECTED / NOT_EXERCISED');
      await equals('#attempted', '0');
      await equals('#max-latency', 'Not observed');
      assert.match(await text('#plan'), /14 synthetic ms \(not measured\)/);
      assert.equal(await page.locator('#run-load').isDisabled(), true);
      await check('REJECTED');
      await fresh();
      await page.locator('#operation').selectOption('online');
      await page.locator('#capability').selectOption('unsupported');
      await page.locator('#assess-build').click();
      await equals('#result', 'REJECTED / NOT_EXERCISED');
      assert.match(await text('#reason'), /No blocking fallback/);
      assert.equal(await page.locator('#operation').inputValue(), 'online');
      await check('REJECTED');
      await fresh();
      await page.locator('#operation').selectOption('online');
      await page.locator('#capability').selectOption('unknown');
      await page.locator('#assess-build').click();
      await equals('#result', 'UNKNOWN / UNVERIFIED');
      await equals('#observed', '0');
      assert.equal(await page.locator('#run-load').isDisabled(), true);
      await check('UNKNOWN');
      observations.push({ check: 'rejection-and-capability', guard: 'REJECTED',
        unsupported: 'REJECTED', unverified: 'UNKNOWN', attempted: 0, silentFallback: false });
    });

    await t.test('missing receipt remains unknown, six-attempt guard blocks a seventh, reset clears history', async () => {
      await fresh();
      await page.locator('#operation').selectOption('online');
      await page.locator('#coverage').selectOption('missing');
      await observe();
      await equals('#result', 'UNKNOWN / UNVERIFIED');
      await equals('#attempted', '4');
      await equals('#observed', '3');
      await equals('#unknown', '1');
      assert.match(await page.locator('#receipts tr').last().textContent(), /Unknown.*Unknown.*UNKNOWN/);
      await check('UNKNOWN');
      assert.equal(await page.locator('#history li').count(), 6);
      await fresh();
      await page.locator('#assess-build').click();
      assert.match(await text('#error'), /six attempts/i);
      await focused('reset-rehearsal');
      assert.equal(await page.locator('#history li').count(), 6);
      await reset();
      await focused('assess-build');
      await equals('#result', 'No result yet.');
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#error').isVisible(), false);
      observations.push({ check: 'missing-receipt-and-history-bound', observed: 3, unknown: 1,
        verdict: 'UNKNOWN', historyLimit: 6, seventhBlocked: true, resetCleared: true });
    });

    await t.test('invalid inputs and disabled-control/state tampering are accessible and non-mutating', async () => {
      await page.locator('#coverage').evaluate((select) => { select.value = 'unlisted'; });
      await page.locator('#assess-build').click();
      assert.match(await text('#error'), /Invalid configuration/);
      assert.equal(await page.locator('#coverage').getAttribute('aria-invalid'), 'true');
      await focused('coverage');
      await equals('#result', 'No result yet.');
      await reset();
      await page.locator('#assess-build').click();
      await page.locator('#budget-ms').evaluate((select) => { select.value = '15'; });
      await page.locator('#run-load').click();
      assert.match(await text('#error'), /Configuration changed after assessment/);
      await focused('reset-rehearsal');
      await equals('#result', 'No result yet.');
      assert.equal(await page.locator('#receipts tr').count(), 0);
      await reset();
      await page.locator('#assess-build').click();
      await page.locator('#build-form').evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await text('#error'), /phase ready/);
      await equals('#result', 'No result yet.');
      assert.equal(await page.locator('#run-load').isDisabled(), false);
      assert.equal(await page.locator('#history li').count(), 0);
      await reset();
      observations.push({ check: 'input-and-state-errors', invalidFocused: true,
        frozenConfigTamperRejected: true, replayRejected: true, resultUnchanged: true });
    });

    await t.test('loose blocking budget and missing-failure comparison; complete keyboard reset', async () => {
      await page.locator('#budget-ms').selectOption('15');
      await page.locator('#guard-policy').selectOption('enforce');
      await observe();
      await equals('#result', 'PASS / BUDGET_MET');
      await equals('#max-latency', '14');
      await equals('#max-lock', '12');
      await check('PASS');
      await fresh();
      await page.locator('#coverage').selectOption('missing');
      await observe();
      await equals('#result', 'FAIL / INTERRUPTED');
      await equals('#failed', '3');
      await equals('#unknown', '1');
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      await focused('assess-build');
      assert.deepEqual(await page.locator('#configuration select').evaluateAll((selects) =>
        selects.map((select) => select.value)), ['blocking', 'permitted', '5', 'observe', 'complete']);
      await equals('#result', 'No result yet.');
      await equals('#attempted', '0');
      await equals('#max-lock', 'Not observed');
      assert.equal(await page.locator('#history li, #receipts tr, #trace li, [aria-invalid]').count(), 0);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.match(await text('#feedback'), /Prediction does not change/);
      observations.push({ check: 'declared-budget-and-full-reset', looseBlocking: 'PASS',
        lockStillVisible: 12, missingBlocking: 'FAIL', failed: 3, unknown: 1, allReset: true });
    });

    await t.test('browser actually enforces inline/eval/style/connect/form/frame CSP', async () => {
      const before = page.url();
      const probes = await page.evaluate(async () => {
        globalThis.__s068Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s068Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s068InlineRan = true';
        document.body.append(script);
        script.remove();
        // DevTools evaluation bypasses string-compilation CSP. Use a real local script.
        const evalBlocked = await new Promise((resolve, reject) => {
          const probe = document.createElement('script');
          probe.src = 'tests/csp-eval-probe.js';
          probe.onload = () => {
            probe.remove();
            resolve(globalThis.__s068EvalProbe?.blocked === true);
          };
          probe.onerror = () => reject(new Error('Owned CSP evaluation probe did not load.'));
          document.body.append(probe);
        });
        let connectionBlocked = false;
        try { await fetch('data:text/plain,synthetic-no-network-probe'); }
        catch { connectionBlocked = true; }
        const style = document.createElement('style');
        style.textContent = '#result { display: none !important; }';
        document.head.append(style);
        const styleBlocked = getComputedStyle(document.getElementById('result')).display !== 'none';
        style.remove();
        const form = document.createElement('form');
        form.action = location.href;
        document.body.append(form);
        form.submit();
        form.remove();
        const frame = document.createElement('iframe');
        frame.id = 'csp-frame-probe';
        frame.src = 'data:text/html,synthetic-frame-probe';
        document.body.append(frame);
        return { inlineBlocked: globalThis.__s068InlineRan !== true, evalBlocked,
          connectionBlocked, styleBlocked };
      });
      assert.deepEqual(probes, { inlineBlocked: true, evalBlocked: true,
        connectionBlocked: true, styleBlocked: true });
      await page.waitForFunction(() => {
        const directives = globalThis.__s068Violations.map((event) => event.directive);
        return ['script-src-elem', 'script-src', 'style-src-elem', 'connect-src', 'form-action', 'frame-src']
          .every((directive) => directives.includes(directive));
      });
      evidence.cspViolations = await page.evaluate(() => globalThis.__s068Violations);
      await page.evaluate(() => document.getElementById('csp-frame-probe').remove());
      assert.equal(page.url(), before);
      await equals('#result', 'No result yet.');
      observations.push({ check: 'enforced-csp', ...probes, formNavigationBlocked: true,
        frameBlocked: true, probeNetwork: 'data: and own file only; no remote request' });
    });
    assert.equal(observations.length, 8, 'Every browser subcheck must complete before recording success.');
    assert.deepEqual(pageErrors, []);
    assert.ok(requests.every((url) => !/^https?:|^wss?:/i.test(url)));
    evidence.observations = observations;
    evidence.pageErrors = pageErrors;
    evidence.postLoadRequests = requests;
  } finally {
    if (session) await session.close();
  }
  evidence.completedAtUtc = new Date().toISOString();
  evidence.cleanup = 'awaited session.close() in finally; helper-owned context/browser/scratch closed';
  evidence.outcome = 'passed';
  evidence.nativeCertification = false;
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    fs.writeFileSync(path.join(lessonRoot, 'evidence', 'browser-observation.json'),
      `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  }
});
