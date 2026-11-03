'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonicalHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('isolated actual DOM, keyboard, resize, payload, budget, history, errors, reset and CSP', { timeout: 180000 }, async () => {
  const proofPath = path.join(root, 'evidence', 'browser-acceptance.json');
  const proof = {
    schemaVersion: 1, cardId: 'A-S071', workerId: 'worker-A-S071', mode: 'synthetic',
    entry: 'learning\\S071\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture, outcome: 'FAIL',
    helper: { path: 'testing\\browser\\isolated.cjs', publication: '53c0c0d', sha256: helperHash },
    observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
    probeRequests: [], probeResponses: [], cspViolations: [],
    cleanup: { awaitedFinallyClose: false },
    sourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixture.js', 'model.js', 'app.js',
      'tests\\browser.test.cjs', 'tests\\csp-probe.js',
    ].map((file) => [file, canonicalHash(file)])),
  };
  let session;
  let failure;
  let stage = 'exercise';
  try {
    assert.match(process.version, /^v22\./);
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) assert.equal(fs.existsSync(proofPath), false, 'Deliberate capture cannot overwrite historical proof');
    session = await openIsolatedLesson('learning\\S071\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
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
      if (/^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
    });
    await page.reload({ waitUntil: 'load' });
    const rows = (selector) => page.locator(selector).evaluateAll((entries) =>
      entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        resize: await page.locator('#resize-observation').innerText(),
        gate: await page.locator('#gate').innerText(), impact: await page.locator('#impact').innerText(),
        comparison: await page.locator('#comparison').innerText(), metrics: await page.locator('#metrics').innerText(),
        probes: await rows('#probe-results tr'), history: await rows('#history tr'),
        prediction: await page.locator('#prediction-result').innerText(),
        trace: await page.locator('#trace').innerText(), error: await page.locator('#input-error').textContent(),
        focus: await page.evaluate(() => document.activeElement.id),
      });
    };
    const defaults = {
      'target-capacity': '8', 'payload-mode': 'breaking', 'resize-mode': 'continuous',
      coverage: 'all', 'budget-ms': '100',
    };
    const empty = async (historyCount) => {
      assert.equal(await page.locator('#phase').innerText(), 'Phase: configuring');
      assert.equal(await page.locator('#gate').innerText(), 'Synthetic journey result: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'User impact: not evaluated');
      assert.equal(await page.locator('#comparison').innerText(), 'Capacity and payload comparison: not observed.');
      assert.equal(await page.locator('#metrics').innerText(), 'No synthetic operations observed.');
      assert.equal(await page.locator('#resize-observation').innerText(), 'No resize requested.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#probe-results tr').count(), 0);
      assert.equal(await page.locator('#reasons li').count(), 0);
      assert.equal(await page.locator('#history tr').count(), historyCount);
      assert.equal(await page.locator('#history-count').innerText(), `Retained attempts: ${historyCount} / 6`);
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      assert.equal(await page.locator('#check-prediction').isDisabled(), true);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#probe-mixed').isDisabled(), true);
      assert.equal(await page.locator('#resize-cache').isEnabled(), true);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      for (const [id, value] of Object.entries(defaults)) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
        assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      }
      for (const id of ['cache-controls', 'prediction-controls']) {
        assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function');
      }
    };
    const reset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      await empty(0);
      assert.equal(await page.locator('#attempt-count').innerText(), 'Attempt: 1 / 6');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'resize-cache');
    };
    const next = async (settings = {}) => {
      const history = await rows('#history tr');
      await page.locator('#new-attempt').focus();
      await page.keyboard.press('Enter');
      await empty(history.length);
      assert.deepEqual(await rows('#history tr'), history, 'Earlier failures are not rewritten');
      assert.equal(await page.locator('#attempt-count').innerText(), `Attempt: ${history.length + 1} / 6`);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'resize-cache');
      for (const [id, value] of Object.entries(settings)) {
        if (id === 'budget-ms') await page.locator(`#${id}`).fill(value);
        else await page.locator(`#${id}`).selectOption(value);
      }
    };
    const resize = async () => {
      await page.locator('#resize-cache').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: resized');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'probe-mixed');
      for (const id of Object.keys(defaults)) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.locator('#history tr').count() < 7, true);
    };
    const probe = async (gate, expectedRows, metrics) => {
      await page.locator('#probe-mixed').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: observed');
      assert.equal(await page.locator('#gate').innerText(), `Synthetic journey result: ${gate}`);
      assert.equal(await page.locator('#probe-results tr').count(), expectedRows);
      assert.match(await page.locator('#metrics').innerText(), metrics);
      assert.equal(await page.locator('#result-detail').isVisible(), true);
      assert.equal(await page.locator('#probe-mixed').isDisabled(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
    };
    const predict = async (value, correct) => {
      await page.locator('#prediction').selectOption(value);
      await page.locator('#prediction').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#prediction-result').innerText(), correct ? /^Correct:/ : /^Not yet:/);
    };

    await empty(0);
    assert.equal(await page.locator('#training-banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    for (const id of [...Object.keys(defaults), 'prediction']) {
      assert.equal(await page.locator(`#${id}`).evaluate((element) => element.labels.length), 1);
    }
    await observe('initial-declared-envelope');
    await page.locator('#budget-ms').fill('25');
    await page.locator('#resize-cache').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#input-error').innerText(), /integer from 20 to 120 ms in steps of 10/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'budget-ms');
    assert.equal(await page.locator('#budget-ms').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#history tr').count(), 0);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: configuring');
    await observe('invalid-budget-rejected-without-state-change');
    await page.locator('#budget-ms').fill('100');
    await page.locator('#target-capacity').evaluate((select) => {
      select.add(new Option('Invalid synthetic test option', '99'));
      select.value = '99';
    });
    await page.locator('#resize-cache').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#input-error').innerText(), /Invalid targetCapacity/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'target-capacity');
    await observe('tampered-option-rejected');
    await page.locator('#target-capacity').evaluate((select) => select.querySelector('[value="99"]').remove());
    await reset();
    await resize();
    await page.locator('#prediction-controls').evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /Probe mixed traffic before/);
    assert.equal(await page.locator('#history tr').count(), 0);
    await observe('out-of-order-interpretation-rejected');
    await reset();
    await observe('pending-resize-reset-clears-errors-and-view');

    await page.locator('#target-capacity').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#target-capacity').inputValue(), '12');
    await resize();
    await probe('FAIL', 18, /failed 3; missing 0.*Payload failures 3; access failures 0; original-budget failures 0/);
    assert.match(await page.locator('#comparison').innerText(), /80 ms before → 20 ms after.*1 before \/ 1 after/);
    assert.equal((await rows('#probe-results tr')).filter((row) => row[6] === 'FAIL').length, 3);
    await predict('PASS', false);
    await page.locator('#prediction').selectOption('');
    await page.locator('#check-prediction').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#input-error').innerText(), /Choose PASS, FAIL or UNKNOWN/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
    assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
    await predict('FAIL', true);
    await observe('extra-capacity-does-not-mask-incompatible-payload');
    const retainedFailure = await rows('#probe-results tr');
    await page.locator('#cache-controls').evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires phase configuring.*observed/);
    assert.deepEqual(await rows('#probe-results tr'), retainedFailure);
    assert.equal(await page.locator('#history tr').count(), 1);
    await observe('repeated-resize-guard-retains-result');

    await next({ 'payload-mode': 'compatible' });
    await resize();
    await probe('PASS', 18, /passed 18; failed 0; missing 0/);
    await predict('PASS', true);
    await observe('compatible-overlap-pass-is-synthetic-only');

    await next({ 'payload-mode': 'compatible', 'resize-mode': 'gap' });
    await resize();
    await probe('FAIL', 18, /failed 6; missing 0.*access failures 6/);
    assert.equal((await rows('#probe-results tr')).filter((row) => row[0] === 'after' && row[6] === 'PASS').length, 6);
    await observe('resize-access-gap-remains-counted-after-recovery');

    await next({ 'payload-mode': 'compatible', 'budget-ms': '30' });
    await resize();
    await probe('FAIL', 18, /failed 6; missing 0.*original-budget failures 6/);
    assert.match(await page.locator('#comparison').innerText(), /80 ms before → 20 ms after/);
    await observe('original-budget-failures-survive-capacity-improvement');

    await next({ coverage: 'new-only' });
    await resize();
    await probe('UNKNOWN', 9, /passed 9; failed 0; missing 9/);
    assert.equal((await rows('#probe-results tr')).every((row) => row[2].startsWith('v2 /')), true);
    await predict('UNKNOWN', true);
    await observe('missing-old-cohort-is-unknown-not-pass');

    await next({ 'payload-mode': 'compatible', 'resize-mode': 'unverified' });
    await resize();
    await probe('UNKNOWN', 6, /passed 6; failed 0; missing 12/);
    assert.match(await page.locator('#resize-observation').innerText(), /Resize: UNKNOWN.*applied target: not observed/);
    assert.match(await page.locator('#comparison').innerText(), /after.*Missing reads/);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    await page.locator('#new-attempt').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /Six attempts retained/);
    assert.equal(await page.locator('#history tr').count(), 6);
    await observe('unverified-capability-and-six-attempt-history-bound');
    await reset();
    await observe('full-reset-clears-history-prediction-errors-and-results');

    await page.locator('#payload-mode').selectOption('compatible');
    await page.locator('#resize-mode').selectOption('unsupported');
    await resize();
    await probe('FAIL', 6, /failed 0; missing 12/);
    assert.match(await page.locator('#resize-observation').innerText(), /REJECTED.*applied target: not observed/);
    assert.equal((await rows('#probe-results tr')).every((row) => row[0] === 'before'), true);
    await observe('unsupported-operation-is-fail-without-fabricated-capacity');
    await next({ coverage: 'none' });
    await resize();
    await probe('UNKNOWN', 0, /Observed 0\/18; passed 0; failed 0; missing 18/);
    await observe('empty-observations-are-unknown');
    await next({ 'resize-mode': 'unverified' });
    await resize();
    await probe('FAIL', 6, /failed 1; missing 12.*Payload failures 1/);
    await observe('known-payload-failure-outranks-unknown-capability');
    await next({ 'payload-mode': 'compatible', 'budget-ms': '80' });
    await resize();
    await probe('PASS', 18, /passed 18; failed 0; missing 0/);
    await observe('original-budget-boundary-is-inclusive');
    await reset();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#resize-cache').evaluate((button) => getComputedStyle(button).outlineWidth), '3px');
    proof.keyboard = { enterAndSpaceActions: true, arrowSelect: true, tabToPredictionCheck: true, resetFocus: 'resize-cache', visibleFocusOutlinePx: 3, narrowViewportWidth: 390 };
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.consoleErrors, []);
    assert.deepEqual(proof.pageErrors, []);

    stage = 'csp';
    const pageURL = page.url();
    await page.evaluate(async () => {
      globalThis.__S071_VIOLATIONS = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__S071_VIOLATIONS.push({
          directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      await new Promise((resolve, reject) => {
        const probe = document.createElement('script');
        probe.src = new URL('tests/csp-probe.js', location.href).href;
        probe.onload = resolve;
        probe.onerror = reject;
        document.head.append(probe);
      });
      const inline = document.createElement('script');
      inline.textContent = 'globalThis.__S071_INLINE_EXECUTED = true';
      document.head.append(inline);
      const external = document.createElement('script');
      external.src = 'https://example.invalid/s071-csp-probe.js';
      document.head.append(external);
      try { await fetch('https://example.invalid/s071-csp-connect'); } catch { globalThis.__S071_FETCH_REJECTED = true; }
      const base = document.createElement('base');
      base.href = 'https://example.invalid/';
      document.head.append(base);
      const style = document.createElement('style');
      style.textContent = 'body { color: rgb(255, 0, 0) !important; }';
      document.head.append(style);
      const form = document.createElement('form');
      form.action = 'https://example.invalid/s071-csp-form';
      document.body.append(form);
      form.requestSubmit();
      try {
        const worker = new Worker(new URL('tests/csp-probe.js', location.href).href);
        worker.onerror = (event) => { event.preventDefault(); worker.terminate(); };
        worker.onmessage = () => worker.terminate();
      } catch { globalThis.__S071_WORKER_REJECTED = true; }
    });
    try {
      await page.waitForFunction(() => [
        'script-src', 'script-src-elem', 'connect-src', 'base-uri', 'form-action', 'style-src-elem',
      ].every((directive) => globalThis.__S071_VIOLATIONS.some((entry) => entry.directive === directive)));
    } catch (error) {
      const observed = await page.evaluate(() => ({
        violations: globalThis.__S071_VIOLATIONS, workerRejected: globalThis.__S071_WORKER_REJECTED,
      }));
      throw new Error(`CSP probe did not observe every declared directive: ${JSON.stringify(observed)}`, { cause: error });
    }
    proof.cspViolations = await page.evaluate(() => globalThis.__S071_VIOLATIONS);
    for (const [directive, blockedURI] of [
      ['script-src', 'eval'], ['script-src-elem', 'inline'],
      ['script-src-elem', 'https://example.invalid/s071-csp-probe.js'],
      ['connect-src', 'https://example.invalid/s071-csp-connect'],
      ['base-uri', 'https://example.invalid/'], ['style-src-elem', 'inline'],
    ]) assert.ok(proof.cspViolations.some((entry) => entry.directive === directive
      && entry.blockedURI === blockedURI && entry.disposition === 'enforce'), `${directive}: ${blockedURI}`);
    assert.ok(proof.cspViolations.some((entry) => entry.directive === 'form-action'
      && entry.blockedURI.startsWith('https://example.invalid/s071-csp-form') && entry.disposition === 'enforce'));
    assert.equal(await page.evaluate(() => globalThis.__S071_DYNAMIC_EVALUATION), 'blocked');
    assert.equal(await page.evaluate(() => globalThis.__S071_INLINE_EXECUTED), undefined);
    assert.equal(await page.evaluate(() => globalThis.__S071_FETCH_REJECTED), true);
    assert.equal(await page.evaluate(() => globalThis.__S071_WORKER_REJECTED), true);
    assert.equal(await page.evaluate(() => document.baseURI), pageURL);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).color), 'rgb(255, 0, 0)');
    assert.equal(page.url(), pageURL);
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.pageErrors, []);
    proof.cspChecks = {
      dynamicEvaluationBlocked: true, inlineScriptBlocked: true, externalScriptBlocked: true,
      connectBlocked: true, baseBlocked: true, inlineStyleBlocked: true, formBlocked: true,
      noRemoteResponse: true, bypassCSP: false,
    };
    proof.workerBoundary = 'File-origin Worker creation was rejected before a worker-src CSP event; worker-src is declared but its enforcement is not independently qualified.';
    proof.outcome = 'PASS';
  } catch (error) {
    proof.failure = { name: error.name, message: error.message };
    failure = error;
  } finally {
    try {
      if (session) {
        await session.close();
        proof.cleanup.awaitedFinallyClose = true;
      }
    } catch (error) {
      proof.outcome = 'FAIL';
      proof.cleanup.error = error.message;
      failure = failure ? new AggregateError([failure, error], 'Verification and cleanup failed') : error;
    }
    proof.completedAtUtc = new Date().toISOString();
    if (capture) fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  }
  if (failure) throw failure;
});
