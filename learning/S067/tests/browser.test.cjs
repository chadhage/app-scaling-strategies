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
const proofPath = path.join(root, 'evidence', 'browser-acceptance.json');

test('isolated actual DOM: controlled lag, freshness routing, keyboard, errors, history, reset, failure, unknown and CSP', { timeout: 180000 }, async () => {
  const proof = {
    schemaVersion: 1, cardId: 'A-S067', workerId: 'worker-A-S067', mode: 'synthetic',
    entry: 'learning\\S067\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', publication: '53c0c0d', sha256: helperHash },
    outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], probeResponses: [], cspViolations: [],
    cleanup: { awaitedFinallyClose: false },
    sourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixture.js', 'model.js', 'app.js',
      'tests\\browser.test.cjs', 'tests\\csp-probe.js',
    ].map((file) => [file, canonicalHash(file)])),
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) assert.equal(fs.existsSync(proofPath), false, 'Deliberate capture cannot overwrite retained proof');
    session = await openIsolatedLesson('learning\\S067\\index.html');
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
      if (/^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
    });
    await page.reload({ waitUntil: 'load' });
    const rows = (selector) => page.locator(selector).evaluateAll((entries) =>
      entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        lag: await page.locator('#lag-observation').innerText(),
        freshness: await page.locator('#freshness-declaration').innerText(),
        gate: await page.locator('#gate').innerText(), impact: await page.locator('#impact').innerText(),
        metrics: await page.locator('#metrics').innerText(),
        selectedRead: await rows('#read-results tr'), history: await rows('#history tr'),
        prediction: await page.locator('#prediction-result').innerText(),
        trace: await page.locator('#trace').innerText(),
        error: await page.locator('#input-error').textContent(),
        focus: await page.evaluate(() => document.activeElement.id),
      });
    };
    const defaults = { lag: 'five', freshness: 'current', routing: 'reader-only', coverage: 'complete' };
    const verifyEmpty = async (historyCount) => {
      assert.equal(await page.locator('#phase').innerText(), 'Phase: configuring');
      assert.equal(await page.locator('#gate').innerText(), 'Read freshness: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'Synthetic impact: not evaluated');
      assert.equal(await page.locator('#metrics').innerText(), 'No returned read evaluated.');
      assert.equal(await page.locator('#lag-observation').innerText(), 'Reader watermark and lag: not introduced.');
      assert.equal(await page.locator('#freshness-declaration').innerText(), 'Declared freshness: not frozen.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#read-results tr').count(), 0);
      assert.equal(await page.locator('#route-reason').textContent(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#history tr').count(), historyCount);
      assert.equal(await page.locator('#history-count').innerText(), `Retained attempts: ${historyCount} / 6`);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#read-once').isDisabled(), true);
      assert.equal(await page.locator('#introduce-lag').isEnabled(), true);
      for (const [id, value] of Object.entries(defaults)) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
        assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      }
      assert.equal(await page.locator('#lag-controls').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#prediction-controls').evaluate((form) => typeof form.reset), 'function');
    };
    const reset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      await verifyEmpty(0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'introduce-lag');
      assert.equal(await page.locator('#attempt-count').innerText(), 'Attempt: 1 / 6');
    };
    const next = async (settings = {}) => {
      const count = await page.locator('#history tr').count();
      const history = await rows('#history tr');
      await page.locator('#new-attempt').focus();
      await page.keyboard.press('Enter');
      await verifyEmpty(count);
      assert.deepEqual(await rows('#history tr'), history, 'New attempt does not rewrite previous results');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'introduce-lag');
      for (const [id, value] of Object.entries(settings)) await page.locator(`#${id}`).selectOption(value);
    };
    const introduce = async () => {
      await page.locator('#introduce-lag').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: lagged');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'read-once');
      for (const id of Object.keys(defaults)) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
    };
    const read = async (gate, selected, returned, minimum, lag, budget) => {
      await page.locator('#read-once').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: observed');
      assert.equal(await page.locator('#gate').innerText(), `Read freshness: ${gate}`);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.deepEqual(await rows('#read-results tr'), [[selected, String(minimum), String(returned), String(lag), String(budget), gate]]);
      assert.equal(await page.locator('#read-once').isDisabled(), true);
    };
    const check = async (prediction, actual, matched = true) => {
      const count = await page.locator('#history tr').count();
      await page.locator('#prediction').selectOption(prediction);
      await page.locator('#check-prediction').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: checked');
      assert.equal(await page.locator('#history tr').count(), count + 1);
      assert.match(await page.locator('#prediction-result').innerText(), new RegExp(`Learning check: ${matched ? 'MATCH' : 'MISMATCH'}`));
      assert.equal(await page.locator('#gate').innerText(), `Read freshness: ${actual}`);
      assert.equal(await page.locator('#prediction').isDisabled(), true);
    };

    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    await verifyEmpty(0);
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors, []);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.locator('#lag').focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#lag').inputValue(), 'two');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#lag').inputValue(), 'five');
    await page.locator('#introduce-lag').focus();
    const focusStyle = await page.locator('#introduce-lag').evaluate((node) => {
      const style = getComputedStyle(node);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    assert.equal(focusStyle.style, 'solid');
    assert.equal(focusStyle.width, '3px');
    await observe('initial-keyboard-and-focus');

    await page.locator('#read-once').evaluate((node) => { node.disabled = false; node.click(); });
    assert.match(await page.locator('#input-error').innerText(), /requires phase lagged/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: configuring');
    assert.equal(await page.locator('#read-results tr').count(), 0);
    await observe('guard-read-before-lag');
    await reset();
    await page.locator('#lag').evaluate((node) => {
      const option = new Option('unlisted fixture', '<img src=x onerror=alert(1)>');
      node.add(option);
      node.value = option.value;
    });
    await page.locator('#introduce-lag').press('Enter');
    assert.equal(await page.locator('#lag').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: configuring');
    assert.equal(await page.locator('img').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lag');
    await observe('guard-invalid-fixture-no-html-sink');
    await reset();

    await introduce();
    assert.match(await page.locator('#lag-observation').innerText(), /watermark: 7.*observed lag: 5/);
    await page.locator('#lag').evaluate((node) => { node.value = 'none'; });
    await page.locator('#read-once').press('Enter');
    assert.match(await page.locator('#input-error').innerText(), /Frozen inputs changed/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: lagged');
    assert.equal(await page.locator('#gate').innerText(), 'Read freshness: not evaluated');
    await observe('guard-frozen-config');
    await reset();

    await introduce();
    await read('FAIL', 'reader-1', 7, 12, 5, 0);
    assert.equal(await page.locator('#impact').innerText(), 'Synthetic impact: INTERRUPTED');
    assert.equal(await page.locator('#metrics').innerText(), 'One read: 0 correct · 1 failed · 0 unknown.');
    await page.locator('#check-prediction').press('Enter');
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: observed');
    assert.equal(await page.locator('#history tr').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
    await observe('stale-failure-and-invalid-prediction');
    await check('FAIL', 'FAIL');
    assert.equal(await page.locator('#input-error').isHidden(), true);
    assert.match((await rows('#history tr'))[0][6], /FAIL \/ INTERRUPTED/);
    await observe('correct-failure-prediction-still-interrupted');

    await next({ routing: 'gated' });
    await introduce();
    await read('PASS', 'primary', 12, 12, 0, 0);
    assert.match(await page.locator('#lag-observation').innerText(), /watermark: 7.*observed lag: 5/);
    await check('FAIL', 'PASS', false);
    await observe('gated-primary-pass-no-reader-catchup-wrong-prediction');

    await next({ lag: 'two', freshness: 'two-ticks' });
    await introduce();
    await read('PASS', 'reader-1', 10, 10, 2, 2);
    await check('PASS', 'PASS');
    await observe('inclusive-two-tick-boundary');

    await next({ lag: 'two' });
    await introduce();
    await read('FAIL', 'reader-1', 10, 12, 2, 0);
    await check('FAIL', 'FAIL');
    await observe('same-reader-strict-budget-failure');

    await next({ lag: 'unknown' });
    await introduce();
    await read('UNKNOWN', 'reader-1', 'unknown', 12, 'unknown', 0);
    assert.equal(await page.locator('#impact').innerText(), 'Synthetic impact: UNVERIFIED');
    await check('UNKNOWN', 'UNKNOWN');
    await observe('unknown-reader-lag-no-certification');

    await next({ lag: 'unknown', routing: 'gated' });
    await introduce();
    await read('PASS', 'primary', 12, 12, 0, 0);
    assert.match(await page.locator('#lag-observation').innerText(), /watermark: unknown.*observed lag: unknown/);
    await check('PASS', 'PASS');
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-rehearsal');
    await page.locator('#new-attempt').evaluate((node) => { node.disabled = false; node.click(); });
    assert.match(await page.locator('#input-error').innerText(), /Six retained attempts/);
    assert.equal(await page.locator('#history tr').count(), 6);
    await observe('six-history-limit-and-unknown-reader-primary-fallback');
    await reset();
    await observe('reset-clears-six-attempts-and-error');

    await page.locator('#routing').selectOption('gated');
    await page.locator('#coverage').selectOption('missing');
    await introduce();
    await read('UNKNOWN', 'primary', 'unknown', 12, 'unknown', 0);
    assert.match(await page.locator('#route-reason').innerText(), /READ_OBSERVATION_MISSING/);
    await observe('missing-returned-read-even-selected-primary-unknown');
    await reset();
    await page.locator('#lag').selectOption('none');
    await page.locator('#routing').selectOption('gated');
    await introduce();
    await read('PASS', 'reader-1', 12, 12, 0, 0);
    await check('PASS', 'PASS');
    await observe('known-current-reader-selected-with-gate');
    await reset();
    await observe('final-keyboard-reset');

    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    stage = 'csp-probes';
    const originalURL = page.url();
    await page.evaluate(() => {
      window.__S067_CSP = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__S067_CSP.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
          disposition: event.disposition,
        });
      });
    });
    // CDP evaluation can bypass the eval restriction; execute this probe as a normal page script.
    await page.evaluate(() => new Promise((resolve, reject) => {
      const probe = document.createElement('script');
      probe.src = 'tests/csp-probe.js';
      probe.onload = () => resolve();
      probe.onerror = () => reject(new Error('Owned CSP probe did not load'));
      document.head.append(probe);
    }));
    const probes = await page.evaluate(async () => {
      const inline = document.createElement('script');
      inline.textContent = 'window.__S067_INLINE_EXECUTED = true;';
      document.body.append(inline);
      const external = document.createElement('script');
      external.src = 'https://s067.invalid/script';
      document.body.append(external);
      const style = document.createElement('style');
      style.textContent = 'body { color: rgb(1, 2, 3); }';
      document.head.append(style);
      const frame = document.createElement('iframe');
      frame.src = 'https://s067.invalid/frame';
      document.body.append(frame);
      const base = document.createElement('base');
      base.href = 'https://s067.invalid/base/';
      document.head.append(base);
      const form = document.createElement('form');
      form.action = 'https://s067.invalid/form';
      form.method = 'post';
      document.body.append(form);
      form.submit();
      let connection = 'allowed';
      try { await fetch('https://s067.invalid/connect'); } catch { connection = 'blocked'; }
      return {
        inlineExecuted: window.__S067_INLINE_EXECUTED === true,
        dynamicEvaluation: window.__S067_DYNAMIC_EVALUATION,
        connection, bodyColor: getComputedStyle(document.body).color,
      };
    });
    await page.waitForFunction(() =>
      ['script-src-elem', 'script-src', 'style-src-elem', 'connect-src', 'frame-src', 'form-action', 'base-uri']
        .every((directive) => window.__S067_CSP.some((event) => event.effectiveDirective === directive)))
      .catch(async (error) => {
        error.message += `; observed CSP violations: ${JSON.stringify(await page.evaluate(() => window.__S067_CSP))}`;
        throw error;
      });
    proof.cspViolations = await page.evaluate(() => window.__S067_CSP);
    proof.cspProbes = probes;
    assert.equal(probes.inlineExecuted, false);
    assert.equal(probes.dynamicEvaluation, 'blocked');
    assert.equal(probes.connection, 'blocked');
    assert.notEqual(probes.bodyColor, 'rgb(1, 2, 3)');
    assert.equal(page.url(), originalURL);
    assert.equal(proof.cspViolations.every((event) => event.disposition === 'enforce'), true);
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.pageErrors, []);
    proof.outcome = 'PASS';
  } catch (error) {
    proof.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        proof.cleanup.awaitedFinallyClose = true;
      }
    } finally {
      proof.completedAtUtc = new Date().toISOString();
      if (capture) fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
    }
  }
});
