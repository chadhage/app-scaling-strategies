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

test('isolated actual DOM, redelivery, effects, uncertainty, keyboard, errors, all reset phases and CSP', { timeout: 180000 }, async () => {
  const proofPath = path.join(root, 'evidence', 'browser-acceptance.json');
  const proof = {
    schemaVersion: 1, cardId: 'A-S077', workerId: 'worker-A-S077', mode: 'synthetic',
    entry: 'learning\\S077\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture, outcome: 'FAIL',
    helper: { path: 'testing\\browser\\isolated.cjs', publication: '53c0c0d', sha256: helperHash },
    observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
    probeRequests: [], probeResponses: [], cspViolations: [],
    cleanup: { awaitedFinallyClose: false },
    sourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'model.js', 'app.js', 'tests\\browser.test.cjs', 'tests\\csp-probe.js',
    ].map((file) => [file, canonicalHash(file)])),
  };
  let session;
  let failure;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) assert.equal(fs.existsSync(proofPath), false, 'Deliberate capture cannot overwrite historical proof');
    session = await openIsolatedLesson('learning\\S077\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion, '156.0.4314.50');
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
    const rows = (id) => page.locator(`#${id} tr`).evaluateAll((entries) =>
      entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
    const retainedLedgers = () => page.locator('#history-ledgers pre').allTextContents();
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        verdict: await page.locator('#verdict').innerText(), impact: await page.locator('#impact').innerText(),
        metrics: await page.locator('#metrics').innerText(), uncertainty: await page.locator('#uncertainty').innerText(),
        deliveries: await rows('delivery-ledger'), effects: await rows('business-ledger'), history: await rows('history'),
        retainedLedgers: await retainedLedgers(), interpretation: await page.locator('#prediction-result').innerText(),
        trace: await page.locator('#trace').innerText(), error: await page.locator('#input-error').textContent(),
        focus: await page.evaluate(() => document.activeElement.id),
      });
    };
    const empty = async (historyCount) => {
      assert.equal(await page.locator('#phase').innerText(), 'Phase: ready');
      assert.equal(await page.locator('#verdict').innerText(), 'Synthetic business result: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'Business impact: not evaluated');
      assert.equal(await page.locator('#metrics').innerText(), 'No synthetic deliveries observed.');
      assert.equal(await page.locator('#uncertainty').innerText(), 'No business-effect conclusion yet.');
      assert.equal(await page.locator('#reason').textContent(), '');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.deepEqual(await rows('delivery-ledger'), []);
      assert.deepEqual(await rows('business-ledger'), []);
      assert.equal((await rows('history')).length, historyCount);
      assert.equal((await retainedLedgers()).length, historyCount);
      assert.equal(await page.locator('#history-count').innerText(), `Retained attempts: ${historyCount} / 6`);
      assert.equal(await page.locator('#prediction-result').innerText(), 'Interpretation not checked.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      assert.equal(await page.locator('#check-prediction').isDisabled(), true);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#expire-lock').isDisabled(), true);
      assert.equal(await page.locator('#redeliver-message').isDisabled(), true);
      assert.equal(await page.locator('#deliver-message').isEnabled(), true);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      for (const [id, value] of [['handler', 'ledger'], ['first-outcome', 'committed']]) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
        assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      }
      for (const id of ['configuration', 'interpretation']) {
        assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function');
      }
    };
    const reset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      await empty(0);
      assert.equal(await page.locator('#attempt-count').innerText(), 'Attempt: 1 / 6');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'deliver-message');
    };
    const start = async () => {
      await page.locator('#deliver-message').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: locked');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'expire-lock');
      assert.equal(await page.locator('#handler').isDisabled(), true);
      assert.equal(await page.locator('#first-outcome').isDisabled(), true);
      assert.equal((await rows('delivery-ledger')).length, 1);
      assert.equal((await rows('delivery-ledger'))[0][3], 'held');
    };
    const expire = async () => {
      const effects = await rows('business-ledger');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: expired');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'redeliver-message');
      assert.equal((await rows('delivery-ledger'))[0][3], 'expired');
      assert.deepEqual(await rows('business-ledger'), effects);
      assert.equal(await page.locator('#verdict').innerText(), 'Synthetic business result: not evaluated');
    };
    const finish = async (verdict, known, unresolved, secondOutcome) => {
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: complete');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.equal(await page.locator('#verdict').innerText(), `Synthetic business result: ${verdict}`);
      const deliveries = await rows('delivery-ledger');
      assert.equal(deliveries.length, 2);
      assert.deepEqual(deliveries.map((row) => row.slice(1, 3)),
        [['MSG-077', 'ORDER-077:credit'], ['MSG-077', 'ORDER-077:credit']]);
      assert.equal(deliveries[1][4], secondOutcome);
      assert.equal((await rows('business-ledger')).length, known);
      assert.equal(await page.locator('#metrics').innerText(),
        `Deliveries: 2; repeated deliveries: 1; known effects: ${known}; duplicate effects: ${Math.max(0, known - 1)}; unresolved effects: ${unresolved}; known credit: ${known * 10} synthetic units.`);
      assert.equal(await page.locator('#uncertainty').innerText(),
        `Possible business-effect count: ${known} through ${known + unresolved}. Unresolved outcomes are not assumed absent.`);
    };
    const next = async (handler, outcome) => {
      const history = await rows('history');
      const ledgers = await retainedLedgers();
      await page.locator('#new-attempt').focus();
      await page.keyboard.press('Enter');
      await empty(history.length);
      assert.deepEqual(await rows('history'), history);
      assert.deepEqual(await retainedLedgers(), ledgers);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'deliver-message');
      await page.locator('#handler').selectOption(handler);
      await page.locator('#first-outcome').selectOption(outcome);
      await start();
      await expire();
    };

    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    await empty(0);
    await reset();
    await start();
    await observe('locked first delivery records only one effect');
    await reset();
    await start();
    await expire();
    await observe('expired lock adds no effect and is not yet a business result');
    await reset();

    await page.locator('#redeliver-message').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires phase expired/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: ready');
    assert.deepEqual(await rows('history'), []);
    await observe('out-of-order redelivery rejected without progress');
    await reset();

    await page.locator('#handler').evaluate((select) => {
      select.append(new Option('Invalid probe', 'invalid'));
      select.value = 'invalid';
    });
    await page.locator('#configuration').evaluate((form) => form.requestSubmit());
    assert.match(await page.locator('#input-error').innerText(), /listed handler/);
    assert.equal(await page.locator('#handler').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: ready');
    await observe('tampered handler rejected and focused');
    await reset();
    await page.locator('#handler option[value="invalid"]').evaluate((option) => option.remove());
    await page.locator('#first-outcome').evaluate((select) => { select.selectedIndex = -1; });
    await page.locator('#configuration').evaluate((form) => form.requestSubmit());
    assert.match(await page.locator('#input-error').innerText(), /listed first business outcome/);
    assert.equal(await page.locator('#first-outcome').getAttribute('aria-invalid'), 'true');
    await observe('missing first-outcome selection rejected');
    await reset();

    await page.locator('#handler').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#handler').inputValue(), 'blind');
    await start();
    await expire();
    await finish('FAIL', 2, 0, 'applied');
    await observe('blind reapplication repeats the business effect');
    await page.locator('#history-ledgers summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#history-ledgers pre').isVisible(), true);
    await page.locator('#prediction').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#input-error').innerText(), /Choose PASS, FAIL or UNKNOWN/);
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    await observe('empty interpretation is an error, not success');
    await page.locator('#prediction').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#prediction').inputValue(), 'PASS');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#prediction-result').innerText(), /^Not correct; evidence supports FAIL/);
    const failedHistory = await rows('history');
    await page.locator('#prediction').selectOption('FAIL');
    await page.locator('#check-prediction').focus();
    await page.keyboard.press('Space');
    assert.match(await page.locator('#prediction-result').innerText(), /^Correct; evidence supports FAIL/);
    assert.equal(await page.locator('#verdict').innerText(), 'Synthetic business result: FAIL');
    assert.deepEqual(await rows('history'), failedHistory);
    assert.equal(await page.locator('#input-error').isHidden(), true);
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
    await observe('correctly identifying FAIL does not rewrite duplicate effects');

    await next('ledger', 'committed');
    await finish('PASS', 1, 0, 'duplicate-suppressed');
    await observe('same redelivery with protection has one intended effect and retained failure');
    await next('ledger', 'unresolved');
    await finish('UNKNOWN', 0, 1, 'held-unresolved');
    await observe('unresolved protected effect is held, not absent or passed');
    await next('blind', 'unresolved');
    await finish('UNKNOWN', 1, 1, 'applied');
    await observe('blind reapplication cannot settle earlier uncertainty');
    await next('ledger', 'not-committed');
    await finish('PASS', 1, 0, 'applied');
    await observe('protected redelivery recovers observed failure before commit');
    await next('blind', 'not-committed');
    await finish('PASS', 1, 0, 'applied');
    await observe('blind redelivery after known noncommit has one effect');
    const history = await rows('history');
    assert.deepEqual(history.map((row) => row[3]), ['FAIL', 'PASS', 'UNKNOWN', 'UNKNOWN', 'PASS', 'PASS']);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.equal(await page.locator('#attempt-count').innerText(), 'Attempt: 6 / 6');
    await page.locator('#new-attempt').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /Six attempts/);
    assert.deepEqual(await rows('history'), history);
    await observe('seventh attempt refused with all six histories retained');
    await reset();
    await observe('complete full reset clears errors, ledgers, interpretation and history');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#deliver-message').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'deliver-message');
    assert.equal(await page.locator('#deliver-message').evaluate((button) => getComputedStyle(button).outlineWidth), '3px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    proof.keyboard = {
      enterAndSpaceActions: true, arrowSelect: true, tabToInterpretationCheck: true,
      resetFocus: 'deliver-message', visibleFocusOutlinePx: 3, narrowViewportWidth: 390,
      resetPhases: ['ready', 'locked', 'expired', 'complete'],
    };
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.consoleErrors, []);
    assert.deepEqual(proof.pageErrors, []);

    stage = 'csp';
    const pageURL = page.url();
    await page.evaluate(async () => {
      globalThis.__S077_VIOLATIONS = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__S077_VIOLATIONS.push({
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
      inline.textContent = 'globalThis.__S077_INLINE_EXECUTED = true';
      document.head.append(inline);
      const external = document.createElement('script');
      external.src = 'https://example.invalid/s077-csp-probe.js';
      document.head.append(external);
      try { await fetch('https://example.invalid/s077-csp-connect'); } catch { globalThis.__S077_FETCH_REJECTED = true; }
      const base = document.createElement('base');
      base.href = 'https://example.invalid/';
      document.head.append(base);
      const style = document.createElement('style');
      style.textContent = 'body { color: rgb(255, 0, 0) !important; }';
      document.head.append(style);
      const form = document.createElement('form');
      form.action = 'https://example.invalid/s077-csp-form';
      document.body.append(form);
      form.requestSubmit();
      try {
        const worker = new Worker(new URL('tests/csp-probe.js', location.href).href);
        worker.onerror = (event) => { event.preventDefault(); worker.terminate(); };
        worker.onmessage = () => worker.terminate();
      } catch { globalThis.__S077_WORKER_REJECTED = true; }
    });
    await page.waitForFunction(() => [
      'script-src', 'script-src-elem', 'connect-src', 'base-uri', 'form-action', 'style-src-elem',
    ].every((directive) => globalThis.__S077_VIOLATIONS.some((entry) => entry.directive === directive)));
    proof.cspViolations = await page.evaluate(() => globalThis.__S077_VIOLATIONS);
    for (const [directive, blockedURI] of [
      ['script-src', 'eval'], ['script-src-elem', 'inline'],
      ['script-src-elem', 'https://example.invalid/s077-csp-probe.js'],
      ['connect-src', 'https://example.invalid/s077-csp-connect'],
      ['base-uri', 'https://example.invalid/'], ['style-src-elem', 'inline'],
    ]) assert.ok(proof.cspViolations.some((entry) => entry.directive === directive
      && entry.blockedURI === blockedURI && entry.disposition === 'enforce'), `${directive}: ${blockedURI}`);
    assert.ok(proof.cspViolations.some((entry) => entry.directive === 'form-action'
      && entry.blockedURI.startsWith('https://example.invalid/s077-csp-form') && entry.disposition === 'enforce'));
    assert.equal(await page.evaluate(() => globalThis.__S077_DYNAMIC_EVALUATION), 'blocked');
    assert.equal(await page.evaluate(() => globalThis.__S077_INLINE_EXECUTED), undefined);
    assert.equal(await page.evaluate(() => globalThis.__S077_FETCH_REJECTED), true);
    assert.equal(await page.evaluate(() => globalThis.__S077_WORKER_REJECTED), true);
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
