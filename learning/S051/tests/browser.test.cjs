'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
assert.equal(sha(fs.readFileSync(helper)), helperSha256);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM, keyboard, input/state errors, compatible/breaking/unknown results, history, reset and CSP', { timeout: 240000 }, async () => {
  const proof = {
    schemaVersion: 1, cardId: 'A-S051', workerId: 'worker-A-S051', mode: 'synthetic',
    entry: 'learning\\S051\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperSha256, publication: '53c0c0d' },
    browserVersion: null, outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], probeResponses: [], cleanup: {},
    testedSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js', path.join('tests', 'browser.test.cjs'),
    ].map((file) => [file, sourceHash(file)])),
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    session = await openIsolatedLesson('learning\\S051\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(proof.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests)
          .push({ url: request.url(), method: request.method() });
      }
    });
    page.on('response', (response) => {
      if (stage === 'csp-probes' && /^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
    });
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        gate: await page.locator('#gate').innerText(), impact: await page.locator('#impact').innerText(),
        metrics: await page.locator('#metrics').innerText(), preview: await page.locator('#old-preview').innerText(),
        journeys: await page.locator('#journeys tr').evaluateAll((rows) =>
          rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
        history: await page.locator('#history tr').evaluateAll((rows) =>
          rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
        prediction: await page.locator('#prediction-result').innerText(),
        trace: await page.locator('#trace').innerText(), alert: await page.locator('#input-error').textContent(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const runByKeyboard = async () => {
      await page.locator('#open-old-page').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'run-candidate');
      assert.equal(await page.locator('#configuration').evaluate((fieldset) => fieldset.disabled), true);
      assert.equal(await page.locator('#response').isDisabled(), true);
      assert.equal(await page.locator('#observation').isDisabled(), true);
      assert.equal(await page.locator('#old-preview').innerText(), 'Synthetic learner — 1 unread');
      assert.match(await page.locator('#gate').innerText(), /^Not evaluated/);
      await page.keyboard.press('Space');
      assert.match(await page.locator('#phase').innerText(), /^Phase: complete/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.equal(await page.locator('#journeys tr').count(), 3);
    };
    const predict = async (value, verdict = 'PASS') => {
      await page.locator('#prediction').selectOption(value);
      await page.locator('#prediction').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
      await page.keyboard.press('Space');
      assert.match(await page.locator('#prediction-result').innerText(), new RegExp(`^Prediction verifier: ${verdict}`));
      assert.equal(await page.locator('#prediction').isDisabled(), true);
    };
    const next = async (response = 'compatible', observation = 'complete') => {
      const priorHistory = await page.locator('#history').innerText();
      await page.locator('#new-attempt').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'open-old-page');
      assert.match(await page.locator('#phase').innerText(), /^Phase: idle/);
      assert.match(await page.locator('#gate').innerText(), /^Not evaluated/);
      assert.match(await page.locator('#impact').innerText(), /^Not evaluated/);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#journeys tr').count(), 0);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#old-preview').innerText(), 'Old page not opened.');
      assert.equal(await page.locator('#history').innerText(), priorHistory);
      await page.locator('#response').selectOption(response);
      await page.locator('#observation').selectOption(observation);
    };
    const exactReset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'open-old-page');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle · old frontend v1');
      assert.equal(await page.locator('#response').inputValue(), 'compatible');
      assert.equal(await page.locator('#observation').inputValue(), 'complete');
      assert.equal(await page.locator('#configuration').evaluate((fieldset) => fieldset.disabled), false);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.match(await page.locator('#gate').innerText(), /^Not evaluated/);
      assert.match(await page.locator('#impact').innerText(), /^Not evaluated/);
      assert.equal(await page.locator('#metrics').textContent(), 'No candidate measurements.');
      assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
      assert.equal(await page.locator('#history').innerText(), 'No completed attempts.');
      assert.equal(await page.locator('#history-limit').isHidden(), true);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#old-preview').innerText(), 'Old page not opened.');
      assert.equal(await page.locator('#rehearsal-form').evaluate((form) => typeof form.reset), 'function');
      for (const id of ['run-candidate', 'new-attempt', 'prediction', 'check-prediction']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
      }
    };

    assert.match(await page.title(), /S051.*Old frontend to new API/);
    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#input-error').getAttribute('role'), 'alert');
    await page.locator('#run-candidate').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires opened/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
    await observe('state guard: run before opening rejected');

    await page.locator('#response').evaluate((select) => { select.value = 'unlisted-response'; });
    await page.locator('#open-old-page').click();
    assert.match(await page.locator('#input-error').innerText(), /^Response:/);
    assert.equal(await page.locator('#response').getAttribute('aria-invalid'), 'true');
    assert.match(await page.locator('#gate').innerText(), /^Not evaluated/);
    await page.locator('#response').selectOption('compatible');
    await page.locator('#observation').evaluate((select) => { select.value = 'unlisted-observation'; });
    await page.locator('#open-old-page').click();
    assert.match(await page.locator('#input-error').innerText(), /^Observation:/);
    assert.equal(await page.locator('#observation').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
    await observe('input guard: invalid select values rejected without candidate proof');
    await exactReset();

    await page.locator('#open-old-page').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'run-candidate');
    proof.keyboardFocusStyle = await page.locator('#run-candidate').evaluate((button) => ({
      style: getComputedStyle(button).outlineStyle, width: getComputedStyle(button).outlineWidth,
    }));
    assert.equal(proof.keyboardFocusStyle.style, 'solid');
    assert.equal(proof.keyboardFocusStyle.width, '3px');
    assert.equal(await page.locator('#response').isDisabled(), true);
    await page.locator('#response').evaluate((select) => { select.value = 'breaking'; });
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#response').inputValue(), 'compatible');
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: PASS');
    assert.equal(await page.locator('#old-preview').innerText(), 'Synthetic learner — 4 unread');
    assert.match(await page.locator('#metrics').innerText(), /3 HTTP 200; 3 rendered correctly; 0 failed; 0 unobserved/);
    assert.match(await page.locator('#journeys').innerText(), /"theme"/);
    await predict('uninterrupted');
    await observe('compatible additive response: three correct old-frontend renders; assumptions locked');

    await next('breaking');
    await runByKeyboard();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    assert.equal(await page.locator('#impact').innerText(), 'Synthetic user impact: INTERRUPTED');
    assert.match(await page.locator('#metrics').innerText(), /3 HTTP 200; 0 rendered correctly; 3 failed; 0 unobserved/);
    assert.match(await page.locator('#journeys').innerText(), /displayName must be an own non-empty string/);
    assert.match(await page.locator('#journeys').innerText(), /"profile"/);
    await predict('interrupted');
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    await observe('breaking renamed response: HTTP 200 fails visibly; correct failure prediction passes separately');

    await next('compatible', 'partial');
    await runByKeyboard();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: UNKNOWN');
    assert.equal(await page.locator('#impact').innerText(), 'Synthetic user impact: UNKNOWN');
    assert.match(await page.locator('#metrics').innerText(), /1 observed; 1 HTTP 200; 1 rendered correctly; 0 failed; 2 unobserved/);
    assert.equal(await page.locator('#journeys tr').nth(1).locator('td').nth(1).innerText(), 'UNKNOWN — not observed');
    await predict('unknown');
    await observe('partial compatible response: missing observations remain unknown');

    await next('breaking', 'partial');
    await runByKeyboard();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    assert.match(await page.locator('#metrics').innerText(), /1 HTTP 200; 0 rendered correctly; 1 failed; 2 unobserved/);
    await predict('uninterrupted', 'FAIL');
    assert.equal(await page.locator('#impact').innerText(), 'Synthetic user impact: INTERRUPTED');
    await observe('known breaking result dominates partial uncertainty; wrong prediction does not waive interruption');

    await next('breaking', 'none');
    await runByKeyboard();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: UNKNOWN');
    assert.equal(await page.locator('#old-preview').innerText(), 'No candidate response observed.');
    assert.match(await page.locator('#metrics').innerText(), /0 observed; 0 HTTP 200; 0 rendered correctly; 0 failed; 3 unobserved/);
    assert.doesNotMatch(await page.locator('#journeys').innerText(), /"profile"/);
    await predict('unknown');
    await observe('absent observations: even a selected breaking fixture is not unobserved failure evidence');

    await next();
    await runByKeyboard();
    await page.locator('#check-prediction').click();
    assert.match(await page.locator('#input-error').innerText(), /^Prediction:/);
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: PASS');
    await observe('prediction guard: empty prediction rejected without altering gate or verifier');
    await predict('uninterrupted');

    for (let attempt = 7; attempt <= 8; attempt++) {
      await next('breaking');
      await runByKeyboard();
      await predict('interrupted');
    }
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 8);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.equal(await page.locator('#history-limit').isVisible(), true);
    const historyAtLimit = await page.locator('#history').innerText();
    await page.locator('#new-attempt').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /History full/);
    assert.equal(await page.locator('#history').innerText(), historyAtLimit);
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    await observe('history cap: eight retained assumptions/results/verifiers; no eviction');

    await page.setViewportSize({ width: 320, height: 800 });
    proof.smallViewport = await page.evaluate(() => ({
      width: innerWidth, pageWidth: document.documentElement.scrollWidth,
      noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    }));
    assert.equal(proof.smallViewport.noPageHorizontalOverflow, true);
    await exactReset();
    await observe('exact keyboard reset from completed failure and full history');
    await page.locator('#response').selectOption('breaking');
    await page.locator('#open-old-page').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#phase').innerText(), /^Phase: opened/);
    await exactReset();
    await observe('exact keyboard reset from opened work');

    stage = 'csp-probes';
    const cspResult = await page.evaluate(async () => {
      window.__s051InlineExecuted = false;
      window.__s051Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s051Violations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      const script = document.createElement('script');
      script.textContent = 'window.__s051InlineExecuted = true;';
      document.head.append(script);
      let fetchRejected = false;
      try { await fetch('https://csp-probe.invalid/S051'); } catch { fetchRejected = true; }
      script.remove();
      return { fetchRejected };
    });
    await page.waitForFunction(() => window.__s051Violations.some((entry) => entry.effectiveDirective === 'connect-src')
      && window.__s051Violations.some((entry) => entry.effectiveDirective.startsWith('script-src')), undefined, { timeout: 5000 });
    proof.csp = await page.evaluate((result) => ({
      ...result, inlineExecuted: window.__s051InlineExecuted, violations: window.__s051Violations,
    }), cspResult);
    assert.equal(proof.csp.fetchRejected, true);
    assert.equal(proof.csp.inlineExecuted, false);
    assert.ok(proof.csp.violations.every((entry) => entry.disposition === 'enforce'));
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.pageErrors, []);
    assert.ok(proof.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
    proof.outcome = 'PASS';
  } catch (error) {
    proof.failure = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) await session.close();
      proof.cleanup = { sessionCloseAwaited: Boolean(session), serversStarted: 0, foregroundLeaseUsed: false };
    } catch (error) {
      proof.outcome = 'FAIL';
      proof.cleanup = { sessionCloseAwaited: false, error: error.message };
      throw error;
    } finally {
      proof.completedAtUtc = new Date().toISOString();
      if (capture) fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
    }
  }
});
