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
const sourceHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated browser: DOM, keyboard, errors, payload failure/translation/namespaces/unknowns, history, reset and CSP', { timeout: 240000 }, async () => {
  const proof = {
    schemaVersion: 1, cardId: 'A-S055', workerId: 'worker-A-S055', mode: 'synthetic',
    entry: 'learning\\S055\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
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
    session = await openIsolatedLesson('learning\\S055\\index.html');
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
    const rows = (selector) => page.locator(selector).evaluateAll((entries) =>
      entries.map((row) => [...row.cells].map((cell) => cell.textContent)));
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        gate: await page.locator('#gate').innerText(), impact: await page.locator('#impact').innerText(),
        metrics: await page.locator('#metrics').innerText(), reads: await rows('#reads tr'),
        history: await rows('#history tr'), prediction: await page.locator('#prediction-result').innerText(),
        trace: await page.locator('#trace').innerText(), alert: await page.locator('#input-error').textContent(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const run = async (checkLockedState = false) => {
      await page.locator('#prepare').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: prepared · two synthetic readers');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'read-cache');
      assert.equal(await page.locator('#configuration').evaluate((element) => element.disabled), true);
      for (const id of ['layout', 'translation', 'payload', 'observation']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      if (checkLockedState) {
        await page.locator('#cache-controls').evaluate((form) =>
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        assert.match(await page.locator('#input-error').innerText(), /requires idle/);
        assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
      }
      await page.locator('#read-cache').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: complete · two synthetic readers');
      assert.equal(await page.locator('#reads tr[data-read]').count(), 4);
      assert.equal(await page.locator('#input-error').isHidden(), true);
    };
    const predict = async (selected, verdict = 'PASS') => {
      await page.locator('#prediction').selectOption(selected);
      await page.locator('#prediction').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
      await page.keyboard.press('Space');
      assert.match(await page.locator('#prediction-result').innerText(), new RegExp(`^Prediction verifier: ${verdict}`));
      assert.equal(await page.locator('#prediction').isDisabled(), true);
    };
    const next = async (settings = {}) => {
      const previous = await page.locator('#history').innerText();
      await page.locator('#new-attempt').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle · two synthetic readers');
      assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'Synthetic read impact: not evaluated');
      assert.equal(await page.locator('#metrics').innerText(), 'No reads observed.');
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#reads tr').count(), 0);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#cache-plan').innerText(), 'No cache prepared.');
      assert.equal(await page.locator('#history').innerText(), previous);
      for (const [id, value] of Object.entries({
        layout: 'shared', translation: 'none', payload: 'equivalent', observation: 'complete', ...settings,
      })) await page.locator(`#${id}`).selectOption(value);
    };
    const reset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle · two synthetic readers');
      for (const [id, value] of Object.entries({
        layout: 'shared', translation: 'none', payload: 'equivalent', observation: 'complete',
      })) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
        assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      }
      assert.equal(await page.locator('#configuration').evaluate((element) => element.disabled), false);
      assert.equal(await page.locator('#cache-controls').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#reads tr').count(), 0);
      assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'Synthetic read impact: not evaluated');
      assert.equal(await page.locator('#metrics').innerText(), 'No reads observed.');
      assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
      assert.equal(await page.locator('#history').innerText(), 'No completed attempts.');
      assert.equal(await page.locator('#history-limit').isHidden(), true);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#cache-plan').innerText(), 'No cache prepared.');
      assert.equal(await page.locator('#prepare').isEnabled(), true);
      assert.equal(await page.locator('#read-cache').isDisabled(), true);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    };
    assert.equal(await page.title(), 'S055 · Cache payload evolution');
    assert.equal(await page.locator('#training-label').innerText(),
      'Training rehearsal - synthetic data - not a live Azure result');
    await page.locator('#layout').focus();
    await page.keyboard.press('End');
    assert.equal(await page.locator('#layout').inputValue(), 'versioned');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#layout').inputValue(), 'shared');
    proof.keyboardFocusStyle = await page.locator('#layout').evaluate((element) => ({
      width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle,
    }));
    assert.equal(proof.keyboardFocusStyle.width, '3px');
    await page.locator('#read-cache').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires prepared/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
    await observe('state guard: reading before preparation is refused');
    await page.locator('#payload').evaluate((select) => { select.value = 'unlisted'; });
    await page.locator('#prepare').click();
    assert.match(await page.locator('#input-error').innerText(), /^Payload:/);
    assert.equal(await page.locator('#payload').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: not evaluated');
    await observe('input guard: forged payload choice is refused without a result');
    await reset();
    await observe('exact keyboard reset from input error');

    await run(true);
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    assert.match(await page.locator('#metrics').innerText(), /correct 2 · failed 2 · unknown 0 · translated 0/);
    assert.equal((await rows('#reads tr')).filter((row) => row[4] === 'FAILURE').length, 2);
    assert.match(await page.locator('#reads').innerText(), /SCHEMA_MISMATCH/);
    await page.locator('#check-prediction').click();
    assert.match(await page.locator('#input-error').innerText(), /^Prediction:/);
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    await predict('FAIL');
    assert.equal(await page.locator('#impact').innerText(), 'Synthetic read impact: INTERRUPTED');
    await observe('shared unsafe overlap: explicit incompatible reads; correct failure prediction is not continuity');

    await next({ translation: 'lossless' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: PASS');
    assert.match(await page.locator('#metrics').innerText(), /correct 4 · failed 0 · unknown 0 · translated 2/);
    assert.ok((await rows('#reads tr')).every((row) =>
      row[4] === 'SUCCESS' && row[5].includes('USD · 1250 minor units')));
    await predict('PASS');
    await observe('lossless translation in both directions preserves all four consumed values');

    await next({ layout: 'versioned' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: PASS');
    assert.match(await page.locator('#metrics').innerText(), /correct 4 · failed 0 · unknown 0 · translated 0/);
    assert.deepEqual((await rows('#reads tr')).map((row) => row[2]), [
      'v1:cart:SYN-CART-055', 'v2:cart:SYN-CART-055', 'v1:cart:SYN-CART-055', 'v2:cart:SYN-CART-055',
    ]);
    await predict('PASS');
    await observe('versioned namespaces isolate schemas with zero translations');

    await next({ layout: 'versioned', payload: 'malformed' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    assert.match(await page.locator('#metrics').innerText(), /correct 2 · failed 2 · unknown 0/);
    assert.match(await page.locator('#reads').innerText(), /"minor":"1250"/);
    assert.match(await page.locator('#reads').innerText(), /INVALID_PAYLOAD/);
    await predict('FAIL');
    await observe('malformed own-version objects fail explicitly despite namespaces');

    await next({ translation: 'lossless', payload: 'wrong-total' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    assert.match(await page.locator('#reads').innerText(), /USD · 1200 minor units/);
    assert.match(await page.locator('#reads').innerText(), /VALUE_MISMATCH/);
    await predict('PASS', 'FAIL');
    await observe('wrong business value fails after valid translation; wrong prediction fails independently');

    await next({ translation: 'lossless', observation: 'partial' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: UNKNOWN');
    assert.match(await page.locator('#metrics').innerText(), /observed 2 · correct 2 · failed 0 · unknown 2/);
    assert.ok((await rows('#reads tr')).slice(2).every((row) => row[3].startsWith('UNKNOWN') && row[4] === 'UNKNOWN'));
    await predict('UNKNOWN');
    await observe('partial compatible observations remain unknown, not success');
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 6);
    assert.equal(await page.locator('#history-limit').isVisible(), true);
    const retained = await page.locator('#history').innerText();
    await next();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-rehearsal');
    assert.equal(await page.locator('#prepare').isDisabled(), true);
    await page.locator('#cache-controls').evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /History full/);
    assert.equal(await page.locator('#history').innerText(), retained);
    await observe('six-attempt history cap refuses preparation and never evicts failures or unknowns');
    await reset();
    await observe('exact keyboard reset from full history and limit error');

    await page.locator('#observation').selectOption('partial');
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: FAIL');
    assert.match(await page.locator('#metrics').innerText(), /correct 1 · failed 1 · unknown 2/);
    await predict('FAIL');
    await observe('known failure dominates incomplete proof while other reads stay unknown');
    await next({ payload: 'malformed', observation: 'none' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Compatibility gate: UNKNOWN');
    assert.match(await page.locator('#metrics').innerText(), /observed 0 · correct 0 · failed 0 · unknown 4/);
    assert.ok((await rows('#reads tr')).every((row) => row[3].startsWith('UNKNOWN')));
    await predict('UNKNOWN');
    await observe('absent observations do not infer failure from a malformed selected fixture');

    await page.setViewportSize({ width: 320, height: 800 });
    proof.smallViewport = await page.evaluate(() => ({
      width: innerWidth, pageWidth: document.documentElement.scrollWidth,
      noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    }));
    assert.equal(proof.smallViewport.noPageHorizontalOverflow, true);
    await reset();
    await page.locator('#layout').selectOption('versioned');
    await page.locator('#prepare').click();
    assert.equal(await page.locator('#phase').innerText(), 'Phase: prepared · two synthetic readers');
    await reset();
    await observe('exact keyboard reset from prepared locked assumptions');

    stage = 'csp-probes';
    const probe = await page.evaluate(async () => {
      window.__s055InlineExecuted = false;
      window.__s055Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s055Violations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      const script = document.createElement('script');
      script.textContent = 'window.__s055InlineExecuted = true;';
      document.head.append(script);
      let fetchRejected = false;
      try { await fetch('https://synthetic.invalid/S055-csp-probe'); } catch { fetchRejected = true; }
      script.remove();
      return { fetchRejected };
    });
    await page.waitForFunction(() => window.__s055Violations.some((entry) => entry.effectiveDirective === 'connect-src')
      && window.__s055Violations.some((entry) => entry.effectiveDirective.startsWith('script-src')),
    undefined, { timeout: 5000 });
    proof.csp = await page.evaluate((result) => ({
      ...result, inlineExecuted: window.__s055InlineExecuted, violations: window.__s055Violations,
    }), probe);
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
      if (capture) {
        const file = proof.outcome === 'PASS' ? 'browser.json'
          : `browser-failure-${Date.now()}.json`;
        fs.writeFileSync(path.join(root, 'evidence', file), JSON.stringify(proof, null, 2) + '\n');
      }
    }
  }
});
