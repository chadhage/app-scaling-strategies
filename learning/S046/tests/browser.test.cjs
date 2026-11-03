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
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('isolated real DOM: SSE cursors, keyboard, errors, locked state, outcomes, history, reset and CSP', { timeout: 240000 }, async () => {
  const proof = {
    schemaVersion: 1, cardId: 'A-S046', workerId: 'worker-A-S046', mode: 'synthetic',
    startedAtUtc: new Date().toISOString(), runtime: process.version, playwrightVersion,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    entry: 'learning\\S046\\index.html', captureExplicitlyEnabled: capture,
    outcome: 'FAIL', browserVersion: null, observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], failedProbeRequests: [], cspViolations: [], cleanup: {},
    testedSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'model.js', 'app.js', 'manifest.json', 'sse.feature', 'tests\\browser.test.cjs',
    ].map((file) => [file, sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')))])),
  };
  let session;
  let failure;
  let stage = 'exercise';
  try {
    assert.equal(playwrightVersion, '1.56.1');
    session = await openIsolatedLesson('learning\\S046\\index.html');
    const page = session.page;
    proof.browserVersion = session.browserVersion;
    assert.match(proof.browserVersion, /^156\./);
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
    page.on('requestfailed', (request) => {
      if (stage === 'csp-probes') proof.failedProbeRequests.push({ url: request.url(), failure: request.failure() });
    });
    const count = () => page.locator('#history tr[data-attempt]').count();
    const status = (id) => page.locator(`#checks tr[data-check="${id}"]`).getAttribute('data-status');
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        impact: await page.locator('#impact').innerText(), metrics: await page.locator('#metrics').innerText(),
        visibleIds: await page.locator('#visible-events').innerText(),
        checks: await page.locator('#checks tr').evaluateAll((rows) =>
          rows.map((row) => ({ id: row.dataset.check, status: row.dataset.status, cells: [...row.cells].map((cell) => cell.textContent) }))),
        totals: await page.locator('#totals').innerText(),
        history: await page.locator('#history tr').evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
        trace: await page.locator('#trace').innerText(), alert: await page.locator('#input-error').textContent(),
        prediction: await page.locator('#prediction-result').innerText(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const completeByKeyboard = async () => {
      await page.locator('#start-stream').focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#phase').innerText(), /Phase: streaming/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cut-over');
      assert.equal(await page.locator('#configuration').evaluate((element) => element.disabled), true);
      assert.equal(await page.locator('#cursor').isDisabled(), true);
      assert.equal(await page.locator('#reconnect-ms').isDisabled(), true);
      assert.equal(await page.locator('#resume-stream').isDisabled(), true);
      await page.keyboard.press('Space');
      assert.match(await page.locator('#phase').innerText(), /Phase: disconnected/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'resume-stream');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.match(await page.locator('#phase').innerText(), /Phase: complete/);
    };
    const next = async () => {
      const previous = await count();
      await page.locator('#new-attempt').click();
      assert.equal(await count(), previous);
      assert.match(await page.locator('#impact').innerText(), /^Not evaluated/);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start-stream');
    };
    const prediction = async (value, expected = 'PASS') => {
      const impact = await page.locator('#impact').innerText();
      const previous = await count();
      await page.locator('#prediction').selectOption(value);
      await page.locator('#prediction').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
      await page.keyboard.press('Space');
      assert.match(await page.locator('#prediction-result').innerText(), new RegExp(`Prediction verifier: ${expected}`));
      assert.equal(await page.locator('#impact').innerText(), impact);
      assert.equal(await count(), previous);
    };
    const exactReset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start-stream');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.match(await page.locator('#impact').innerText(), /^Not evaluated/);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#checks tr').count(), 0);
      assert.equal(await page.locator('#metrics').textContent(), '');
      assert.equal(await page.locator('#visible-events').textContent(), '');
      assert.equal(await count(), 0);
      assert.equal(await page.locator('#history').innerText(), 'No completed attempts.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#resume-stream').isDisabled(), true);
      assert.equal(await page.locator('#check-prediction').isDisabled(), true);
      assert.equal(await page.locator('#rehearsal-form').evaluate((form) => typeof form.reset), 'function');
      assert.deepEqual(await page.locator('#rehearsal-form').evaluate((form) =>
        Object.fromEntries(new FormData(form).entries())), {
        cursor: 'saved', scenario: 'complete', replayPolicy: 'deduplicate', reconnectMs: '40', budgetMs: '100',
      });
      assert.equal(await page.locator('#totals').innerText(), 'Attempted: 0 · success: 0 · failure: 0 · unknown: 0');
    };

    assert.match(await page.title(), /S046.*Server-sent events/);
    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.evaluate(() => typeof globalThis.S046.assess), 'function');
    for (const [id, message] of [
      ['resume-stream', /requires disconnected/], ['cut-over', /requires streaming/], ['new-attempt', /requires complete/],
    ]) {
      await page.locator(`#${id}`).evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await page.locator('#input-error').innerText(), message);
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await count(), 0);
    }
    await observe('invalid phase actions do not advance or record attempts');
    for (const invalid of ['', '-1', '+1', '00', '1.5', '1e2', ' 40', '40 ', '2001', '<svg>']) {
      await page.locator('#reconnect-ms').fill(invalid);
      await page.locator('#start-stream').click();
      assert.match(await page.locator('#input-error').innerText(), /Reconnect delay: enter a whole number/);
      assert.equal(await page.locator('#reconnect-ms').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'reconnect-ms');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await count(), 0);
    }
    await observe('strict malformed reconnect input rejected without DOM injection');
    await page.locator('#reconnect-ms').fill('40');
    await page.locator('#budget-ms').fill('0');
    await page.locator('#start-stream').click();
    assert.match(await page.locator('#input-error').innerText(), /Original budget: enter a whole number 1-2000/);
    assert.equal(await page.locator('#budget-ms').getAttribute('aria-invalid'), 'true');
    await page.locator('#budget-ms').fill('100');
    await page.locator('#cursor').evaluate((select) => {
      const option = document.createElement('option');
      option.value = 'unregistered';
      option.textContent = 'Unregistered test-only value';
      select.append(option);
      select.value = option.value;
    });
    await page.locator('#start-stream').click();
    assert.match(await page.locator('#input-error').innerText(), /Resume cursor: choose a declared option/);
    assert.equal(await count(), 0);
    await page.locator('#cursor option[value="unregistered"]').evaluate((option) => option.remove());
    await exactReset();
    await observe('invalid enum and budget guarded; reset restores all defaults and clears errors');

    await page.locator('#start-stream').click();
    await page.locator('#scenario').evaluate((select) => { select.value = 'expired'; });
    await page.locator('#cut-over').click();
    assert.match(await page.locator('#input-error').innerText(), /Configuration is locked/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: streaming');
    assert.equal(await count(), 0);
    await page.locator('#scenario').evaluate((select) => { select.value = 'complete'; });
    await page.locator('#cut-over').focus();
    await page.keyboard.press('Enter');
    await page.locator('#budget-ms').evaluate((input) => { input.value = '101'; });
    await page.locator('#resume-stream').click();
    assert.match(await page.locator('#input-error').innerText(), /Configuration is locked/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: disconnected');
    assert.equal(await count(), 0);
    await page.locator('#budget-ms').evaluate((input) => { input.value = '100'; });
    await page.locator('#resume-stream').focus();
    await page.keyboard.press('Space');
    assert.match(await page.locator('#impact').innerText(), /Uninterrupted synthetic transition/);
    assert.equal(await count(), 1);
    await observe('active configuration tampering rejected in both phases; restoring snapshot completes safely');
    await exactReset();

    await completeByKeyboard();
    assert.match(await page.locator('#impact').innerText(), /Uninterrupted synthetic transition — success/);
    assert.match(await page.locator('#metrics').innerText(), /first visible gap: 60 ms · recovery: 100 ms · original budget: 100 ms/);
    assert.equal(await page.locator('#checks tr[data-status="PASS"]').count(), 6);
    await page.locator('#check-prediction').click();
    assert.match(await page.locator('#input-error').innerText(), /Choose a declared prediction/);
    assert.equal(await count(), 1);
    await prediction('failure', 'FAIL');
    await prediction('success');
    await page.locator('#resume-stream').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires disconnected/);
    assert.equal(await count(), 1);
    await observe('default ordered saved-cursor success at exact original budget; duplicate completion guarded');

    await next();
    await page.locator('#scenario').selectOption('expired');
    await completeByKeyboard();
    assert.equal(await status('stream-open'), 'PASS');
    assert.equal(await status('completeness'), 'FAIL');
    assert.match(await page.locator('#checks tr[data-check="completeness"]').innerText(), /evt-delta/);
    assert.match(await page.locator('#impact').innerText(), /Interrupted synthetic transition — failure/);
    await prediction('failure');
    await observe('open stream with expired replay window still fails missing evt-delta; correct prediction does not relabel impact');

    await next();
    await page.locator('#scenario').selectOption('complete');
    await page.locator('#cursor').selectOption('tail');
    await completeByKeyboard();
    assert.equal(await status('stream-open'), 'PASS');
    assert.match(await page.locator('#checks tr[data-check="completeness"]').innerText(), /evt-delta, evt-elm/);
    await observe('no Last-Event-ID and tail-only stream hides two missing IDs');

    await next();
    await page.locator('#cursor').selectOption('saved');
    await page.locator('#scenario').selectOption('reordered');
    await completeByKeyboard();
    assert.equal(await status('completeness'), 'PASS');
    assert.equal(await status('order'), 'FAIL');
    await observe('complete ID set but out-of-order visible delivery fails');

    await next();
    await page.locator('#scenario').selectOption('complete');
    await page.locator('#cursor').selectOption('stale');
    await page.locator('#budget-ms').fill('120');
    await completeByKeyboard();
    assert.match(await page.locator('#impact').innerText(), /— success/);
    assert.match(await page.locator('#metrics').innerText(), /wire replays: 1 · suppressed: 1/);
    assert.match(await page.locator('#trace').innerText(), /replay-suppressed.*evt-cedar/);
    await observe('stale cursor replay suppressed without duplicate visible effect, consuming the original 120 ms');

    await next();
    await page.locator('#replay-policy').selectOption('render-all');
    await completeByKeyboard();
    assert.equal(await status('duplicates'), 'FAIL');
    assert.match(await page.locator('#checks tr[data-check="duplicates"]').innerText(), /1 duplicate visible/);
    await observe('same stale cursor rendered without deduplication interrupts');

    await next();
    await page.locator('#cursor').selectOption('saved');
    await page.locator('#replay-policy').selectOption('deduplicate');
    await page.locator('#scenario').selectOption('partial');
    await page.locator('#budget-ms').fill('100');
    await completeByKeyboard();
    assert.match(await page.locator('#impact').innerText(), /Unverified synthetic transition — unknown/);
    assert.equal(await status('completeness'), 'UNKNOWN');
    assert.equal(await status('original-budget'), 'UNKNOWN');
    assert.match(await page.locator('#metrics').innerText(), /recovery: unverified ms/);
    await prediction('unknown');
    await observe('withheld final event remains unknown and retains attempted denominator');

    await next();
    await page.locator('#budget-ms').fill('79');
    await completeByKeyboard();
    assert.equal(await status('observation'), 'UNKNOWN');
    assert.equal(await status('original-budget'), 'FAIL');
    assert.match(await page.locator('#impact').innerText(), /Interrupted synthetic transition — failure/);
    assert.equal(await count(), 8);
    assert.equal(await page.locator('#totals').innerText(), 'Attempted: 8 · success: 2 · failure: 5 · unknown: 1');
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.equal(await page.locator('#start-stream').isDisabled(), true);
    await page.locator('#new-attempt').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /explicit reset is required.*No history was removed/);
    assert.equal(await count(), 8);
    await observe('known budget breach dominates uncertainty; eight attributed results retained and ninth blocked');
    await exactReset();
    await observe('explicit keyboard reset clears cap, history, current result, predictions, errors and exact defaults');

    await page.locator('#scenario').selectOption('duplicate');
    await page.locator('#budget-ms').fill('120');
    await completeByKeyboard();
    assert.match(await page.locator('#impact').innerText(), /— success/);
    assert.match(await page.locator('#checks tr[data-check="duplicates"]').innerText(), /1 wire replay\(s\), 1 suppressed/);
    await observe('duplicate wire evt-delta is suppressed and measured separately from visible effects');
    await next();
    await page.locator('#replay-policy').selectOption('render-all');
    await completeByKeyboard();
    assert.equal(await status('duplicates'), 'FAIL');
    await observe('rendering duplicate wire evt-delta twice fails');
    await next();
    await page.locator('#scenario').selectOption('rejected');
    await page.locator('#replay-policy').selectOption('deduplicate');
    await page.locator('#budget-ms').fill('100');
    await completeByKeyboard();
    assert.equal(await status('stream-open'), 'FAIL');
    assert.match(await page.locator('#metrics').innerText(), /first visible gap: unverified ms · recovery: unverified ms/);
    await observe('rejected stream is explicit failure without invented recovery');
    await next();
    await page.locator('#scenario').selectOption('complete');
    await page.locator('#reconnect-ms').fill('41');
    await completeByKeyboard();
    assert.equal(await status('original-budget'), 'FAIL');
    assert.match(await page.locator('#metrics').innerText(), /recovery: 101 ms · original budget: 100 ms/);
    await observe('opening at 41 ms does not restart original budget; recovery at 101 ms fails');
    await next();
    await page.locator('#reconnect-ms').fill('81');
    await completeByKeyboard();
    assert.match(await page.locator('#metrics').innerText(), /first visible gap: 101 ms/);
    assert.equal(await status('original-budget'), 'FAIL');
    await observe('first new visible event itself exceeds original silence budget');
    await next();
    await page.locator('#start-stream').click();
    await page.locator('#cut-over').click();
    await exactReset();
    await observe('reset during disconnected active attempt clears retained prior failures and locked configuration');

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#start-stream').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-rehearsal');
    assert.equal(await page.locator('#reset-rehearsal').evaluate((element) => getComputedStyle(element).outlineWidth), '3px');
    await observe('narrow viewport fits and keyboard focus remains visible');
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);

    stage = 'csp-probes';
    const originalURL = page.url();
    await page.evaluate(() => {
      globalThis.__s046CspViolations = [];
      globalThis.__s046InlineExecuted = false;
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s046CspViolations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      const inline = document.createElement('script');
      inline.textContent = 'globalThis.__s046InlineExecuted = true;';
      document.body.append(inline);
      const external = document.createElement('script');
      external.src = 'http://127.0.0.1:9/s046-blocked-script.js';
      document.body.append(external);
      const style = document.createElement('style');
      style.textContent = 'body { color: rgb(1, 2, 3); }';
      document.head.append(style);
      fetch('http://127.0.0.1:9/s046-blocked-connect').catch(() => {});
      const frame = document.createElement('iframe');
      frame.name = 's046-csp-target';
      frame.src = 'data:text/html,blocked-frame';
      document.body.append(frame);
      const object = document.createElement('object');
      object.data = 'data:text/plain,blocked-object';
      document.body.append(object);
      const form = document.createElement('form');
      form.action = 'http://127.0.0.1:9/s046-blocked-form';
      form.method = 'post';
      form.target = frame.name;
      document.body.append(form);
      form.submit();
      const base = document.createElement('base');
      base.href = 'http://127.0.0.1:9/';
      document.head.append(base);
    });
    await page.waitForFunction(() => [
      'script-src-elem', 'style-src-elem', 'connect-src', 'frame-src', 'object-src', 'form-action', 'base-uri',
    ].every((directive) => globalThis.__s046CspViolations.some((event) => event.effectiveDirective === directive)));
    proof.cspViolations = await page.evaluate(() => globalThis.__s046CspViolations);
    assert.equal(await page.evaluate(() => globalThis.__s046InlineExecuted), false);
    assert.equal(page.url(), originalURL);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
    assert.equal(await count(), 0);
    assert.equal(proof.cspViolations.every((violation) => violation.disposition === 'enforce'), true);
    assert.deepEqual(proof.pageErrors, []);
    await observe('real CSP blocks inline and external scripts, inline styles, fetch, frames, objects, forms and base changes');
    proof.outcome = 'PASS';
  } catch (error) {
    failure = error;
    proof.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      if (session) await session.close();
      proof.cleanup = { closed: true, sessionStarted: Boolean(session), awaitedFinallyClose: true };
    } catch (error) {
      proof.cleanup = { closed: false, error: error.message };
      proof.outcome = 'FAIL';
      failure = failure ? new AggregateError([failure, error], 'Browser check and cleanup failed') : error;
    }
    proof.completedAtUtc = new Date().toISOString();
    if (capture) fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  }
  console.log(JSON.stringify({
    cardId: proof.cardId, outcome: proof.outcome, browser: proof.browserVersion,
    observations: proof.observations.length, cspViolations: proof.cspViolations.length, cleanup: proof.cleanup,
    captureExplicitlyEnabled: capture,
  }));
  if (failure) throw failure;
});
