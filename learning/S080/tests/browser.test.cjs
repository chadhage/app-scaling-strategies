'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, lf } = require('./provenance.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function inventory(directory = root, files = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inventory(file, files);
    else files[path.relative(root, file)] = sha(fs.readFileSync(file));
  }
  return files;
}

test('actual isolated DOM: checkpoint false-positive, effects, probes, unknowns, keyboard, errors, history, reset and CSP',
  { timeout: 210000 }, async () => {
    const before = capture ? null : inventory();
    const proof = {
      cardId: 'A-S080', workerId: 'worker-A-S080', mode: 'synthetic', outcome: 'FAIL',
      entry: 'learning\\S080\\index.html', runtime: process.version, playwrightVersion,
      startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
      helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
      testedSourceHashes: Object.fromEntries(['index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js',
        'manifest.json', 'README.md', 'partition-reassignment.feature', 'tests\\model.test.cjs',
        'tests\\surface.test.cjs', 'tests\\integrity.test.cjs', 'tests\\browser.test.cjs', 'tests\\provenance.cjs', 'tests\\capture.cjs']
        .map((file) => [file, sha(lf(read(file)))])),
      observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
      probeRequests: [], probeResponses: [], screenshots: [], cleanup: {},
    };
    let session;
    let failure;
    let stage = 'exercise';
    try {
      assert.equal(process.version, 'v22.23.4');
      assert.equal(playwrightVersion, '1.56.1');
      if (capture) for (const file of ['browser.json', 'browser-missing.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Deliberate capture cannot overwrite prior evidence.');
      }
      session = await openIsolatedLesson('learning\\S080\\index.html');
      proof.browserVersion = session.browserVersion;
      assert.match(session.browserVersion, /^156\./);
      const page = session.page;
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
        if (/^https?:/.test(response.url()) && stage === 'csp-probes') proof.probeResponses.push(response.url());
      });
      await page.route(/^https?:/, (route) => route.abort('blockedbyclient'));
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#lesson').getAttribute('data-ready'), 'true');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      const value = (id) => page.locator(`#${id}`).innerText();
      const rows = (id) => page.locator(`#${id} tr`).evaluateAll((entries) =>
        entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
      const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
      const press = async (id, key = 'Enter') => {
        await page.locator(`#${id}`).focus();
        await page.keyboard.press(key);
      };
      const observe = async (name) => {
        proof.observations.push({
          name, phase: await value('phase'), outcome: await value('outcome'), gates: await value('gates'),
          acquisition: await value('acquisition'), checkpoint: await value('checkpoint-observation'),
          probe: await value('probe-observation'), deliveries: await value('delivery-metrics'),
          effects: await value('effect-metrics'), missing: await value('missing-events'),
          eventTotals: await value('event-totals'), totals: await value('totals'),
          learning: await value('prediction-result'), alert: await page.locator('#input-error').textContent(),
          deliveryRows: await rows('delivery-rows'), events: await rows('event-rows'),
          history: await rows('history-rows'), trace: await value('trace'),
          activeElement: await page.evaluate(() => document.activeElement.id),
        });
      };
      const defaults = async (retained = 0) => {
        assert.equal(await value('phase'), 'Phase: idle');
        for (const [id, expected] of Object.entries({ checkpoint: 'transfer', 'old-probe': 'fenced', delivery: 'complete', effects: 'idempotent', prediction: '' })) {
          assert.equal(await page.locator(`#${id}`).inputValue(), expected, id);
        }
        assert.equal(await value('outcome'), 'Result: not verified');
        assert.equal(await value('acquisition'), 'New ownership: not acquired');
        assert.equal(await value('checkpoint-observation'), 'Required checkpoint: 3 · transferred: not observed · resume: not observed');
        assert.equal(await value('probe-observation'), 'Old epoch probe: not observed');
        assert.equal(await value('trace'), 'No attempt started.');
        assert.equal(await value('gates'), 'Ownership: not verified · checkpoint: not verified · effects: not verified');
        assert.equal(await value('event-totals'), 'Final effect outcomes: six declared · not verified');
        assert.equal(await value('delivery-metrics'), 'Deliveries: not observed · repeated deliveries: not checked');
        assert.equal(await value('effect-metrics'), 'Final effects: not observed · duplicate effects: not checked · suppressed: not checked');
        assert.equal(await value('missing-events'), 'Missing events: not checked');
        assert.equal(await value('prediction-result'), 'Learning prediction not checked.');
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), false);
        assert.equal(await page.locator('#reassign').isEnabled(), true);
        for (const id of ['consume', 'verify-run', 'prediction', 'check-prediction', 'new-attempt']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
        }
        assert.equal(await page.locator('#input-error').isHidden(), true);
        assert.equal(await page.locator('#input-error').textContent(), '');
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
        for (const form of ['settings-form', 'prediction-form']) {
          assert.equal(await page.locator(`#${form}`).evaluate((node) => typeof node.reset), 'function');
        }
        assert.equal(await value('history-count'), `Retained completed attempts: ${retained} / 6`);
        assert.equal((await rows('history-rows')).length, retained);
        assert.equal((await rows('event-rows')).length, 6);
        assert.ok((await rows('event-rows')).every((row) => row[4] === 'not verified'));
        assert.deepEqual(await rows('delivery-rows'), []);
        assert.equal(await page.locator('#history-detail').evaluate((node) => node.open), false);
        if (!retained) assert.equal(await page.locator('#history-proof').textContent(), '');
      };
      const reset = async () => {
        await press('reset-lesson', 'Space');
        await focused('reassign');
        await defaults();
        assert.equal(await value('totals'), 'Decided attempts: success 0 · failure 0 · unknown 0');
      };
      const next = async () => {
        const history = await rows('history-rows');
        const totals = await value('totals');
        const detail = await page.locator('#history-proof').textContent();
        await press('new-attempt');
        await focused('reassign');
        await defaults(history.length);
        assert.deepEqual(await rows('history-rows'), history);
        assert.equal(await value('totals'), totals);
        assert.equal(await page.locator('#history-proof').textContent(), detail);
      };
      const conduct = async (input = {}, expected = 'PASS') => {
        for (const [id, choice] of Object.entries(input)) await page.locator(`#${id}`).selectOption(choice);
        await press('reassign');
        await focused('consume');
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), true);
        await press('consume', 'Space');
        await focused('verify-run');
        await press('verify-run');
        await focused('prediction');
        assert.equal(await value('outcome'), `Result: ${expected}`);
      };
      const retain = async (prediction, expected = prediction) => {
        await page.locator('#prediction').selectOption(prediction);
        await press('check-prediction');
        assert.equal(await value('outcome'), `Result: ${expected}`);
        assert.match(await value('prediction-result'), new RegExp(`prediction ${prediction === expected ? 'correct' : 'incorrect'}`));
        await focused((await rows('history-rows')).length === 6 ? 'reset-lesson' : 'new-attempt');
      };
      const screenshot = async (file) => {
        if (!capture) return;
        await page.locator('#outcome').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(root, file), fullPage: false });
        proof.screenshots.push(file);
      };

      await defaults();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      await focused('lesson');
      await page.locator('#checkpoint').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#checkpoint').inputValue(), 'missing');
      await conduct({}, 'FAIL');
      assert.equal(await value('gates'), 'Ownership: PASS · checkpoint: FAIL · effects: PASS');
      assert.equal(await value('acquisition'), 'New ownership: acquired by consumer-b · epoch 8');
      assert.equal(await value('delivery-metrics'), 'Deliveries: 6 · repeated deliveries: 3');
      assert.equal(await value('effect-metrics'), 'Final effects: 6 · duplicate effects: 0 · suppressed: 3');
      assert.equal(await value('event-totals'), 'Final effect outcomes: success 6 · failure 0 · unknown 0 / 6');
      const beforeInvalidAnswer = await rows('event-rows');
      await press('check-prediction');
      await focused('prediction');
      assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
      assert.equal(await value('phase'), 'Phase: verified');
      assert.deepEqual(await rows('event-rows'), beforeInvalidAnswer);
      await observe('empty prediction rejected without outcome mutation');
      await retain('PASS', 'FAIL');
      await page.locator('#history-detail summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history-detail').evaluate((node) => node.open), true);
      assert.equal(JSON.parse(await page.locator('#history-proof').textContent())[0].transfer.checkpoint, null);
      await observe('missing checkpoint FAIL despite successful ownership and six effects; wrong prediction retained');
      await screenshot('evidence\\browser-missing.png');

      await next();
      await conduct({ delivery: 'repeat' });
      assert.equal(await value('effect-metrics'), 'Final effects: 6 · duplicate effects: 0 · suppressed: 1');
      assert.equal(await value('delivery-metrics'), 'Deliveries: 4 · repeated deliveries: 1');
      await retain('PASS');
      await observe('transferred checkpoint repeat delivery PASS with idempotent ledger');

      await next();
      await conduct({ delivery: 'repeat', effects: 'unchecked' }, 'FAIL');
      assert.equal(await value('effect-metrics'), 'Final effects: 7 · duplicate effects: 1 · suppressed: 0');
      assert.equal(await value('event-totals'), 'Final effect outcomes: success 5 · failure 1 · unknown 0 / 6');
      await retain('FAIL');
      await observe('duplicate business effect FAIL; repeated delivery is not suppressed');

      await next();
      await conduct({ 'old-probe': 'accepted' }, 'FAIL');
      assert.equal(await value('gates'), 'Ownership: FAIL · checkpoint: PASS · effects: PASS');
      assert.equal((await rows('delivery-rows'))[0][2], 'consumer-a / 7');
      assert.equal((await rows('delivery-rows'))[1][2], 'consumer-b / 8');
      assert.equal(await value('effect-metrics'), 'Final effects: 6 · duplicate effects: 0 · suppressed: 1');
      await retain('FAIL');
      await observe('concurrent old epoch accepted FAIL even with complete effects');

      await next();
      await conduct({ checkpoint: 'ahead' }, 'FAIL');
      assert.equal(await value('missing-events'), 'Missing events: E04, E05');
      assert.equal(await value('event-totals'), 'Final effect outcomes: success 4 · failure 2 · unknown 0 / 6');
      await retain('FAIL');
      await observe('ahead checkpoint FAIL with missing E04 and E05');

      await next();
      await conduct({ checkpoint: 'unavailable' }, 'UNKNOWN');
      assert.equal(await value('gates'), 'Ownership: PASS · checkpoint: UNKNOWN · effects: UNKNOWN');
      assert.equal(await value('event-totals'), 'Final effect outcomes: success 0 · failure 0 · unknown 6 / 6');
      await retain('UNKNOWN');
      assert.equal(await value('totals'), 'Decided attempts: success 1 · failure 4 · unknown 1');
      proof.retainedAttemptsAtCapacity = JSON.parse(await page.locator('#history-proof').textContent());
      await observe('checkpoint UNKNOWN; six attempts retain failures and unknowns');
      await screenshot('evidence\\browser-unknown.png');
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      await page.locator('#new-attempt').evaluate((node) => node.dispatchEvent(new Event('click', { bubbles: true })));
      await focused('input-error');
      assert.match(await page.locator('#input-error').textContent(), /Six attempts are retained/);
      assert.equal((await rows('history-rows')).length, 6);
      assert.equal(await value('totals'), 'Decided attempts: success 1 · failure 4 · unknown 1');
      await observe('seventh attempt rejected without history eviction');
      await reset();
      await observe('explicit reset clears inputs errors traces predictions history totals and details');

      for (const item of [
        { name: 'dropped E05 FAIL', input: { delivery: 'drop' }, outcome: 'FAIL', totals: [5, 1, 0] },
        { name: 'delivery UNKNOWN', input: { delivery: 'unavailable' }, outcome: 'UNKNOWN', totals: [0, 0, 6] },
        { name: 'old probe UNKNOWN with known effect counts', input: { 'old-probe': 'unavailable' }, outcome: 'UNKNOWN', totals: [6, 0, 0] },
        { name: 'known missing checkpoint FAIL dominates unavailable deliveries', input: { checkpoint: 'missing', delivery: 'unavailable' }, outcome: 'FAIL', totals: [0, 0, 6] },
        { name: 'known old epoch FAIL dominates unavailable deliveries', input: { 'old-probe': 'accepted', delivery: 'unavailable' }, outcome: 'FAIL', totals: [0, 0, 6] },
      ]) {
        await conduct(item.input, item.outcome);
        assert.equal(await value('event-totals'), `Final effect outcomes: success ${item.totals[0]} · failure ${item.totals[1]} · unknown ${item.totals[2]} / 6`);
        if (item.input.delivery === 'drop') assert.equal(await value('missing-events'), 'Missing events: E05');
        await retain(item.outcome);
        await observe(item.name);
        await next();
      }
      await reset();
      await page.locator('#checkpoint').evaluate((node) => {
        const option = document.createElement('option');
        option.value = 'injected';
        option.textContent = 'Undeclared enum';
        node.append(option);
        node.value = option.value;
      });
      await press('reassign');
      await focused('checkpoint');
      assert.equal(await page.locator('#checkpoint').getAttribute('aria-invalid'), 'true');
      assert.equal(await value('phase'), 'Phase: idle');
      assert.equal((await rows('history-rows')).length, 0);
      await observe('invalid injected enum rejected without starting');
      await page.locator('#checkpoint option[value="injected"]').evaluate((node) => node.remove());
      await reset();
      await page.locator('#consume').evaluate((node) => node.dispatchEvent(new Event('click', { bubbles: true })));
      await focused('input-error');
      assert.match(await page.locator('#input-error').textContent(), /requires phase reassigned/);
      assert.equal(await value('phase'), 'Phase: idle');
      await observe('out-of-order consume rejected without mutation');
      await reset();
      await press('reassign');
      const checkpointBeforeRepeat = await value('checkpoint-observation');
      await page.locator('#settings-form').evaluate((node) => node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await page.locator('#input-error').textContent(), /requires phase idle/);
      assert.equal(await value('phase'), 'Phase: reassigned');
      assert.equal(await value('checkpoint-observation'), checkpointBeforeRepeat);
      await observe('repeated reassignment rejected without altering checkpoint');
      await reset();

      await page.setViewportSize({ width: 320, height: 850 });
      await page.locator('#checkpoint').focus();
      await page.keyboard.press('Tab');
      await focused('old-probe');
      proof.narrowViewport = await page.evaluate(() => {
        const active = document.activeElement;
        const style = getComputedStyle(active);
        const box = active.getBoundingClientRect();
        return {
          width: innerWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth,
          visibleKeyboardFocus: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 3,
          focusedControlInsideViewport: box.left >= 0 && box.right <= innerWidth,
          scrollableTableRegions: [...document.querySelectorAll('.table-wrap')].every((node) => node.tabIndex === 0 && getComputedStyle(node).overflowX === 'auto'),
        };
      });
      assert.equal(proof.narrowViewport.bodyOverflow, false);
      assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
      assert.equal(proof.narrowViewport.focusedControlInsideViewport, true);
      assert.equal(proof.narrowViewport.scrollableTableRegions, true);
      await conduct();
      await retain('PASS');
      await page.reload({ waitUntil: 'load' });
      await defaults();
      assert.equal(await value('totals'), 'Decided attempts: success 0 · failure 0 · unknown 0');
      await observe('reload clears all memory; native reset remains callable');
      assert.deepEqual(proof.pageErrors, []);
      assert.deepEqual(proof.consoleErrors, []);
      assert.deepEqual(proof.exerciseNetworkRequests, []);

      stage = 'csp-probes';
      proof.csp = await page.evaluate(async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (event) => violations.push({
          directive: event.effectiveDirective, blockedURI: event.blockedURI,
        }));
        const script = document.createElement('script');
        script.textContent = 'globalThis.s080InlineRan = true';
        document.body.append(script);
        let connection;
        try { await fetch('https://example.invalid/s080-csp-probe'); connection = 'unexpected response'; }
        catch (error) { connection = error.name; }
        await new Promise((resolve) => setTimeout(resolve, 75));
        script.remove();
        return { inlineRan: globalThis.s080InlineRan === true, connection, violations };
      });
      assert.equal(proof.csp.inlineRan, false);
      assert.equal(proof.csp.connection, 'TypeError');
      assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
      assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
      assert.deepEqual(proof.probeResponses, []);
      assert.deepEqual(proof.pageErrors, []);
      proof.outcome = 'PASS';
    } catch (error) {
      failure = error;
      proof.error = { name: error.name, message: error.message, stack: error.stack };
    } finally {
      if (session) {
        proof.cleanup.closeAwaited = true;
        try { await session.close(); proof.cleanup.closed = true; }
        catch (error) {
          proof.cleanup.closed = false;
          proof.cleanup.error = error.message;
          failure = failure ? new AggregateError([failure, error], 'Browser checks and cleanup failed') : error;
          proof.outcome = 'FAIL';
        }
      }
      if (!capture) {
        try { assert.deepEqual(inventory(), before, 'Ordinary browser verification must not modify owned source/proof.'); }
        catch (error) { failure = failure || error; proof.outcome = 'FAIL'; }
      }
      proof.completedAtUtc = new Date().toISOString();
      if (capture) fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
    }
    if (failure) throw failure;
  });
