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
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonicalHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM: commit fault, honest reconciliation, duplicate failure, keyboard/errors/history/reset and enforced CSP', { timeout: 240000 }, async () => {
  const proof = {
    cardId: 'A-S066', workerId: 'worker-A-S066', mode: 'synthetic', outcome: 'FAIL',
    entry: 'learning\\S066\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
    probeRequests: [], probeResponses: [], screenshots: [], cleanup: {},
    testedSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js', 'manifest.json',
      'commit-outcomes.feature', 'tests\\browser.test.cjs',
    ].map((file) => [file, canonicalHash(file)])),
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) {
      for (const file of ['browser.json', 'browser-failure.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Deliberate capture cannot overwrite earlier proof.');
      }
    }
    session = await openIsolatedLesson('learning\\S066\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    await page.setViewportSize({ width: 1100, height: 900 });
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests).push(request.url());
      }
    });
    page.on('response', (response) => {
      if (stage === 'csp-probes' && /^https?:/.test(response.url())) proof.probeResponses.push(response.url());
    });
    await page.reload({ waitUntil: 'load' });
    const rows = (selector) => page.locator(selector).evaluateAll((entries) =>
      entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        gate: await page.locator('#gate').innerText(), impact: await page.locator('#impact').innerText(),
        originalCounts: await page.locator('#original-counts').innerText(),
        recoveredCounts: await page.locator('#recovered-counts').innerText(),
        effects: await page.locator('#effects').innerText(), duplicates: await page.locator('#duplicates').innerText(),
        originalRows: await rows('#original-rows tr'), recoveredRows: await rows('#result-rows tr'),
        history: await rows('#history-rows tr'), prediction: await page.locator('#prediction-result').innerText(),
        trace: await page.locator('#trace').innerText(), alert: await page.locator('#input-error').textContent(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const defaults = async () => {
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator('#receipt').inputValue(), 'unavailable');
      assert.equal(await page.locator('#recovery').inputValue(), 'same-key');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'Fault impact: not injected');
      assert.equal(await page.locator('#effects').innerText(), 'Effects: not observed · intended: 3');
      assert.equal(await page.locator('#duplicates').innerText(), 'Duplicates: not evaluated');
      assert.equal(await page.locator('#original-counts').innerText(), 'Original commit outcomes: not observed');
      assert.equal(await page.locator('#recovered-counts').innerText(), 'Recovered outcomes: not evaluated');
      assert.equal(await page.locator('#original-rows tr').count(), 0);
      assert.equal(await page.locator('#result-rows tr').count(), 0);
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Learning prediction not checked.');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#assumptions').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#begin-commit').isEnabled(), true);
      for (const id of ['inject-fault', 'reconcile', 'apply-recovery', 'prediction', 'check-prediction', 'new-attempt']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
      }
      assert.equal(await page.locator('#lesson-controls').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#prediction-controls').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#recovery-detail').isHidden(), true);
      assert.equal(await page.locator('#retained-detail').isHidden(), true);
      assert.equal(await page.locator('#retained-proof').textContent(), '');
    };
    const reset = async () => {
      await press('reset-rehearsal', 'Space');
      await focused('begin-commit');
      await defaults();
      assert.equal(await page.locator('#history-count').innerText(), 'Retained attempts: 0 / 6');
      assert.equal(await page.locator('#history-rows tr').count(), 0);
    };
    const next = async (settings = {}) => {
      const retained = await rows('#history-rows tr');
      await press('new-attempt');
      await focused('begin-commit');
      await defaults();
      assert.deepEqual(await rows('#history-rows tr'), retained);
      for (const [id, value] of Object.entries(settings)) await page.locator(`#${id}`).selectOption(value);
    };
    const run = async (inspectFault = false) => {
      await press('begin-commit');
      await focused('inject-fault');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: committing');
      assert.equal(await page.locator('#assumptions').evaluate((node) => node.disabled), true);
      assert.equal(await page.locator('#original-rows tr').count(), 0);
      await page.keyboard.press('Space');
      await focused('reconcile');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: uncertain');
      assert.match(await page.locator('#original-counts').innerText(), /0 committed \/ 0 failed \/ 3 unresolved/);
      assert.match(await page.locator('#impact').innerText(), /3 interrupted commit responses/);
      if (inspectFault) await observe('lost acknowledgements before reconciliation');
      await page.keyboard.press('Enter');
      await focused('apply-recovery');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: reconciled');
      assert.match((await rows('#original-rows tr'))[1][3], /terminal abort/);
      if (inspectFault) await observe('authoritative reconciliation separates commit, abort and unresolved');
      await page.keyboard.press('Enter');
      await focused('prediction');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: complete');
      assert.equal(await page.locator('#original-rows tr').count(), 3);
      assert.equal(await page.locator('#result-rows tr').count(), 3);
      assert.match(await page.locator('#impact').innerText(), /3 interrupted commit responses.*no uninterrupted migration proven/);
    };
    const predict = async (guess, correct = true) => {
      await page.locator('#prediction').selectOption(guess);
      await press('check-prediction');
      assert.match(await page.locator('#prediction-result').innerText(), new RegExp(`Learning verifier: ${correct ? 'PASS' : 'FAIL'}`));
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      assert.equal(await page.locator('#check-prediction').isDisabled(), true);
    };
    const screenshot = async (file) => {
      if (!capture) return;
      const bytes = await page.screenshot({ fullPage: true });
      fs.writeFileSync(path.join(root, 'evidence', file), bytes, { flag: 'wx' });
      proof.screenshots.push({ file, sha256: sha(bytes), bytes: bytes.length });
    };

    await defaults();
    assert.equal(await page.locator('.training').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip').evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    await focused('controls');
    await observe('initial empty sample is not success');

    await page.locator('#receipt').evaluate((select) => {
      select.add(new Option('<img src=x onerror=alert(1)>', 'invalid-receipt'));
      select.value = 'invalid-receipt';
    });
    await press('begin-commit');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
    assert.match(await page.locator('#input-error').innerText(), /Configuration/);
    assert.equal(await page.locator('#receipt').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#receipt').getAttribute('aria-errormessage'), 'input-error');
    assert.equal(await page.locator('img').count(), 0);
    await focused('receipt');
    await observe('invalid injected select rejected without a commit');
    await page.locator('#receipt option[value="invalid-receipt"]').evaluate((option) => option.remove());
    await reset();

    await run(true);
    assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: UNKNOWN');
    assert.match(await page.locator('#recovered-counts').innerText(), /2 committed \/ 0 failed \/ 1 unresolved/);
    assert.equal(await page.locator('#effects').innerText(), 'Effects: 2..3 · intended: 3');
    assert.equal(await page.locator('#duplicates').innerText(), 'Duplicates: 0');
    assert.match(await page.locator('#original-counts').innerText(), /1 committed \/ 1 failed \/ 1 unresolved/);
    const unknownProof = await rows('#result-rows tr');
    assert.match(unknownProof[0][2], /Reuse committed receipt/);
    assert.equal(unknownProof[1][3], 'SYN-KEY-662');
    assert.match(unknownProof[2][2], /Hold unresolved/);
    await press('check-prediction');
    assert.match(await page.locator('#input-error').innerText(), /Prediction/);
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    await focused('prediction');
    assert.deepEqual(await rows('#result-rows tr'), unknownProof);
    await predict('UNKNOWN');
    await focused('new-attempt');
    assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: UNKNOWN');
    await observe('safe recovery remains UNKNOWN; correct prediction is separate');
    await screenshot('browser-unknown.png');

    await next({ recovery: 'new-key' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: FAIL');
    assert.equal(await page.locator('#effects').innerText(), 'Effects: 4..5 · intended: 3');
    assert.equal(await page.locator('#duplicates').innerText(), 'Duplicates: 1..2');
    assert.match(await page.locator('#recovered-counts').innerText(), /1 committed \/ 1 failed \/ 1 unresolved/);
    const failedProof = await rows('#result-rows tr');
    await page.locator('#apply-recovery').evaluate((button) => { button.disabled = false; });
    await press('apply-recovery');
    assert.match(await page.locator('#input-error').innerText(), /phase/);
    assert.deepEqual(await rows('#result-rows tr'), failedProof);
    assert.equal(await page.locator('#apply-recovery').isDisabled(), true);
    await observe('repeat recovery rejected; known duplicate dominates unresolved risk');
    await predict('PASS', false);
    assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: FAIL');
    await observe('blind fresh-key retry duplicates committed effects; wrong prediction cannot repair it');
    await screenshot('browser-failure.png');
    await page.getByRole('button', { name: 'Inspect attempt 1', exact: true }).focus();
    await page.keyboard.press('Enter');
    await focused('retained-title');
    const retained = JSON.parse(await page.locator('#retained-proof').innerText());
    assert.equal(retained.result.gate, 'UNKNOWN');
    assert.equal(retained.result.interruptedResponses, 3);
    assert.equal(retained.original[1].outcome, 'failed');
    assert.equal(retained.prediction.correct, true);
    await observe('full previous unknown proof and original failure are inspectable');

    await next();
    await page.locator('#receipt').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#receipt').inputValue(), 'committed');
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: PASS');
    assert.equal(await page.locator('#effects').innerText(), 'Effects: 3 · intended: 3');
    assert.equal(await page.locator('#duplicates').innerText(), 'Duplicates: 0');
    assert.match(await page.locator('#original-counts').innerText(), /2 committed \/ 1 failed \/ 0 unresolved/);
    await predict('PASS');
    await observe('authoritative committed evidence recovers exactly once but retains three interrupted responses');

    await next({ receipt: 'aborted' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: PASS');
    assert.match(await page.locator('#original-counts').innerText(), /1 committed \/ 2 failed \/ 0 unresolved/);
    assert.deepEqual((await rows('#result-rows tr')).map((entry) => entry[4]), ['0', '1', '1']);
    await observe('two confirmed aborts retried with original keys and unchanged payloads');

    await next({ recovery: 'hold' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Effect reconciliation gate: FAIL');
    assert.match(await page.locator('#recovered-counts').innerText(), /1 committed \/ 1 failed \/ 1 unresolved/);
    assert.equal(await page.locator('#duplicates').innerText(), 'Duplicates: 0');
    await observe('no duplicate alone is insufficient; held terminal abort is missing its intended effect');

    await next({ receipt: 'committed', recovery: 'new-key' });
    await run();
    assert.equal(await page.locator('#effects').innerText(), 'Effects: 5 · intended: 3');
    assert.equal(await page.locator('#duplicates').innerText(), 'Duplicates: 2');
    await predict('FAIL');
    await focused('reset-rehearsal');
    assert.equal(await page.locator('#history-count').innerText(), 'Retained attempts: 6 / 6');
    assert.equal(await page.locator('#history-rows tr').count(), 6);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.match(await page.locator('#capacity').innerText(), /Capacity reached/);
    const atCapacity = await rows('#history-rows tr');
    await page.locator('#new-attempt').evaluate((button) => { button.disabled = false; });
    await press('new-attempt');
    assert.match(await page.locator('#input-error').innerText(), /capacity/);
    assert.deepEqual(await rows('#history-rows tr'), atCapacity);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    await observe('six attempts retained without eviction; bypassed disabled control still rejects overflow');
    await reset();
    await observe('explicit reset clears completed proof, errors, history, locks and predictions');

    for (const phase of ['committing', 'uncertain', 'reconciled']) {
      await press('begin-commit');
      if (phase !== 'committing') await page.keyboard.press('Enter');
      if (phase === 'reconciled') await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), `Phase: ${phase}`);
      await reset();
      await observe(`reset from ${phase} restores exact defaults and keyboard focus`);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await run();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#reset-rehearsal').focus();
    await page.keyboard.press('Tab');
    await press('reset-rehearsal', 'Space');
    await focused('begin-commit');
    assert.equal(await page.locator('#begin-commit').evaluate((button) => getComputedStyle(button).outlineStyle), 'solid');
    proof.narrowViewport = { width: 360, bodyOverflow: false, visibleKeyboardFocus: true };
    await defaults();
    await observe('narrow viewport contains tables and keyboard reset remains usable');

    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    stage = 'csp-probes';
    proof.csp = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s066InlineRan = true;';
      document.head.append(script);
      let connection;
      try {
        await fetch('http://127.0.0.1:1/s066-csp-probe');
        connection = 'UNEXPECTED_SUCCESS';
      } catch (error) {
        connection = error.name;
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { inlineRan: globalThis.__s066InlineRan === true, connection, violations };
    });
    assert.equal(proof.csp.inlineRan, false);
    assert.equal(proof.csp.connection, 'TypeError');
    assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src') && entry.blockedURI === 'inline'));
    assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.pageErrors, []);
    proof.outcome = 'PASS';
  } catch (error) {
    proof.failure = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        proof.cleanup = { closeAwaited: true, closed: true, ownedHeadlessSessionOnly: true };
      }
    } catch (error) {
      proof.outcome = 'FAIL';
      proof.cleanup = { closeAwaited: true, closed: false, error: error.message };
      throw error;
    } finally {
      proof.completedAtUtc = new Date().toISOString();
      if (capture) {
        const name = proof.outcome === 'PASS' ? 'browser.json' : `browser.failed.${Date.now()}.json`;
        fs.writeFileSync(path.join(root, 'evidence', name), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
      }
    }
  }
});
