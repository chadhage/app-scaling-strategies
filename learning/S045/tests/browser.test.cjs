'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const expectedHelperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(helper)), expectedHelperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('real isolated DOM: keyboard handoff, failures, unknowns, history, guards, exact reset and CSP', { timeout: 240000 }, async () => {
  const proof = {
    schemaVersion: 1, cardId: 'A-S045', workerId: 'worker-A-S045', mode: 'synthetic',
    startedAtUtc: new Date().toISOString(), runtime: process.version, playwrightVersion,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: expectedHelperHash, publication: '53c0c0d' },
    entry: 'learning\\S045\\index.html', captureExplicitlyEnabled: capture,
    browserVersion: null, outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], cspProbeRequests: [], failedProbeRequests: [], cleanup: {},
    testedSourceHashes: Object.fromEntries(['index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js']
      .map((file) => [file, sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')))])),
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(playwrightVersion, '1.56.1');
    session = await openIsolatedLesson('learning\\S045\\index.html');
    const page = session.page;
    proof.browserVersion = session.browserVersion;
    assert.match(proof.browserVersion, /^156\./);
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.cspProbeRequests)
          .push({ url: request.url(), method: request.method() });
      }
    });
    page.on('requestfailed', (request) => {
      if (stage === 'csp-probes') proof.failedProbeRequests.push({ url: request.url(), failure: request.failure() });
    });

    const observe = async (name) => {
      proof.observations.push({
        name,
        phase: await page.locator('#phase').innerText(),
        impact: await page.locator('#impact').innerText(),
        metrics: await page.locator('#metrics').innerText(),
        checks: await page.locator('#checks tr').evaluateAll((rows) =>
          rows.map((row) => ({ id: row.dataset.check, cells: [...row.cells].map((cell) => cell.textContent) }))),
        history: await page.locator('#history tr').evaluateAll((rows) =>
          rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
        trace: await page.locator('#trace').innerText(),
        prediction: await page.locator('#prediction-result').innerText(),
        alert: await page.locator('#input-error').textContent(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const completeByKeyboard = async () => {
      await page.locator('#start-session').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cut-over');
      assert.equal(await page.locator('#configuration').evaluate((fieldset) => fieldset.disabled), true);
      assert.equal(await page.locator('#cursor').isDisabled(), true);
      assert.equal(await page.locator('#gap-ms').isDisabled(), true);
      assert.equal(await page.locator('#reconnect').isDisabled(), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'reconnect');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.match(await page.locator('#phase').innerText(), /Phase: complete/);
    };
    const next = async () => {
      const retained = await page.locator('#history tr[data-attempt]').count();
      await page.locator('#new-attempt').click();
      assert.match(await page.locator('#impact').innerText(), /^Not evaluated/);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#history tr[data-attempt]').count(), retained);
      assert.equal(await page.locator('#prediction').inputValue(), '');
    };
    const checkPrediction = async (value) => {
      await page.locator('#prediction').selectOption(value);
      await page.locator('#prediction').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
      await page.keyboard.press('Space');
      assert.match(await page.locator('#prediction-result').innerText(), /Prediction verifier: PASS/);
    };
    const exactReset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start-session');
      assert.match(await page.locator('#phase').innerText(), /Phase: idle/);
      assert.match(await page.locator('#impact').innerText(), /^Not evaluated/);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
      assert.equal(await page.locator('#history').innerText(), 'No completed attempts.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      const values = await page.locator('#rehearsal-form').evaluate((form) =>
        Object.fromEntries(new FormData(form).entries()));
      assert.deepEqual(values, {
        cursor: 'last-ack', replayProtection: 'deduplicate', delivery: 'ordered',
        decoder: 'both', stateRetention: 'retained', observation: 'complete', gapMs: '80', budgetMs: '100',
      });
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#rehearsal-form').evaluate((form) => typeof form.reset), 'function');
    };

    assert.match(await page.title(), /S045.*WebSocket/);
    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.locator('#phase').innerText(), /Phase: idle/);
    await page.locator('#reconnect').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires disconnected/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
    await observe('guard rejects reconnect before start');

    for (const invalid of ['', '-1', '1.5', '1e2', ' 80', '2001', '<svg']) {
      await page.locator('#gap-ms').fill(invalid);
      await page.locator('#start-session').click();
      assert.match(await page.locator('#input-error').innerText(), /Recovery gap: enter a whole number/);
      assert.equal(await page.locator('#gap-ms').getAttribute('aria-invalid'), 'true');
      assert.match(await page.locator('#phase').innerText(), /Phase: idle/);
      assert.match(await page.locator('#impact').innerText(), /^Not evaluated/);
      assert.equal(await page.locator('#input-error svg').count(), 0);
    }
    await page.locator('#gap-ms').fill('80');
    await page.locator('#budget-ms').fill('0');
    await page.locator('#start-session').click();
    assert.match(await page.locator('#input-error').innerText(), /Original UX budget: enter a whole number/);
    await observe('numeric and untrusted input rejected without stale success');
    await exactReset();

    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'uninterrupted');
    assert.match(await page.locator('#metrics').innerText(), /6[\s\S]*60/);
    assert.equal(await page.locator('#checks tr').count(), 8);
    assert.deepEqual(await page.locator('#checks tr td:nth-child(2)').allTextContents(), Array(8).fill('PASS'));
    await checkPrediction('uninterrupted');
    await observe('safe ordered resume and keyboard prediction');

    await next();
    await page.locator('#cursor').selectOption('rewind');
    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'uninterrupted');
    assert.match(await page.locator('#checks tr[data-check="duplicates"]').innerText(), /3 wire replays; 0 duplicate effects/);
    await observe('rewound acknowledgements suppressed, no duplicate effects');

    await next();
    await page.locator('#replay-protection').selectOption('apply-all');
    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'interrupted');
    assert.match(await page.locator('#checks tr[data-check="duplicates"]').innerText(), /3 wire replays; 3 duplicate effects/);
    assert.match(await page.locator('#checks tr[data-check="state"]').innerText(), /Observed state 90/);
    await checkPrediction('interrupted');
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'interrupted');
    await observe('blind acknowledged replay interrupts despite passing prediction');

    await next();
    await page.locator('#cursor').selectOption('last-ack');
    await page.locator('#replay-protection').selectOption('deduplicate');
    await page.locator('#delivery').selectOption('drop-5');
    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'interrupted');
    assert.match(await page.locator('#checks tr[data-check="complete"]').innerText(), /5, 6; final ACK 4/);
    await observe('missing sequence blocks later acknowledgements');

    await next();
    await page.locator('#delivery').selectOption('ordered');
    await page.locator('#cursor').selectOption('absent');
    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'unknown');
    assert.match(await page.locator('#checks tr[data-check="state"]').innerText(), /UNKNOWN/);
    await checkPrediction('unknown');
    await observe('missing cursor remains unknown');

    await next();
    await page.locator('#cursor').selectOption('last-ack');
    await page.locator('#observation').selectOption('missing');
    await page.locator('#gap-ms').fill('101');
    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'interrupted');
    assert.match(await page.locator('#checks tr[data-check="state"]').innerText(), /UNKNOWN/);
    assert.match(await page.locator('#checks tr[data-check="budget"]').innerText(), /FAIL[\s\S]*101 ms[\s\S]*100 ms/);
    await observe('known budget failure dominates partial unknown proof');

    await next();
    await page.locator('#observation').selectOption('complete');
    await page.locator('#gap-ms').fill('80');
    await page.locator('#state-retention').selectOption('lost');
    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'interrupted');
    assert.match(await page.locator('#checks tr[data-check="retention"]').innerText(), /FAIL/);
    assert.match(await page.locator('#checks tr[data-check="state"]').innerText(), /Observed state 30/);
    await observe('acknowledged state loss is not repaired by merely resuming messages');

    await next();
    await page.locator('#state-retention').selectOption('retained');
    await page.locator('#decoder').selectOption('v1-only');
    await completeByKeyboard();
    assert.equal(await page.locator('#impact').getAttribute('data-impact'), 'interrupted');
    assert.match(await page.locator('#checks tr[data-check="versions"]').innerText(), /3 schema rejections/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 8);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    await page.locator('#new-attempt').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /Eight attempts retained/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 8);
    assert.match(await page.locator('#history tr[data-attempt="1"]').innerText(), /UNINTERRUPTED[\s\S]*PASS/);
    await observe('version mismatch and full retained history with no eviction');

    await exactReset();
    await observe('exact keyboard reset restores defaults, idle, focus and empty history');
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    proof.smallViewport = { width: 375, height: 812, noPageHorizontalOverflow: true };
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors, []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);

    stage = 'csp-probes';
    proof.csp = await page.evaluate(async () => {
      globalThis.__s045CspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s045CspViolations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      globalThis.__s045InlineRan = false;
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s045InlineRan = true;';
      document.head.append(script);
      let fetchRejected = false;
      let fetchErrorName = null;
      try { await fetch('https://s045.invalid/csp-probe'); }
      catch (error) { fetchRejected = true; fetchErrorName = error.name; }
      return {
        policy: document.querySelector('[http-equiv="Content-Security-Policy"]').content,
        inlineExecuted: globalThis.__s045InlineRan, fetchRejected, fetchErrorName,
      };
    });
    await page.waitForFunction(() =>
      globalThis.__s045CspViolations.some((entry) => entry.effectiveDirective.startsWith('script-src'))
      && globalThis.__s045CspViolations.some((entry) => entry.effectiveDirective === 'connect-src'));
    proof.csp.violations = await page.evaluate(() => globalThis.__s045CspViolations);
    assert.equal(proof.csp.inlineExecuted, false);
    assert.equal(proof.csp.fetchRejected, true);
    assert.equal(proof.csp.fetchErrorName, 'TypeError');
    assert.ok(proof.csp.violations.every((entry) => entry.disposition === 'enforce'));
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    proof.outcome = 'PASS';
  } catch (error) {
    proof.failure = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        proof.cleanup.sessionCloseAwaited = true;
      }
    } catch (error) {
      proof.outcome = 'FAIL';
      proof.cleanup.failure = error.message;
      throw error;
    } finally {
      proof.finishedAtUtc = new Date().toISOString();
      proof.cleanup.serversStarted = 0;
      proof.cleanup.cloudResourcesCreated = 0;
      proof.cleanup.foregroundLeaseUsed = false;
      if (capture) {
        fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
      }
    }
  }
});
