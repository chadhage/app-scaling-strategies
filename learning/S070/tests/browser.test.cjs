'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, lf } = require('./provenance.cjs');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM: promotion/data/ownership gates, unknowns, keyboard/errors/history/reset and enforced CSP', { timeout: 210000 }, async () => {
  const proof = {
    cardId: 'A-S070', workerId: 'worker-A-S070', mode: 'synthetic', outcome: 'FAIL',
    entry: 'learning\\S070\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
    probeRequests: [], probeResponses: [], screenshots: [], cleanup: {},
    testedSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js', 'manifest.json',
      'restored-promotion.feature', 'tests\\browser.test.cjs',
    ].map((file) => [file, sha(lf(read(file)))])),
  };
  let session;
  let failure;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) {
      for (const file of ['browser.json', 'browser-gap.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Deliberate capture cannot overwrite provenance.');
      }
    }
    session = await openIsolatedLesson('learning\\S070\\index.html');
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
        name, phase: await value('phase'), outcome: await value('promotion-outcome'),
        synchronization: await value('sync-outcome'), ownership: await value('ownership-outcome'),
        declaration: await value('declared-boundary'), receipts: await value('receipt-metrics'),
        missing: await value('missing-metrics'), grant: await value('ownership-metrics'),
        promotion: await value('promotion-metrics'), impact: await value('impact'),
        prediction: await value('prediction-result'), totals: await value('totals'),
        receiptRows: await rows('receipt-rows'), history: await rows('history-rows'),
        trace: await value('trace'), alert: await page.locator('#input-error').textContent(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const defaults = async (retained = 0) => {
      assert.equal(await value('phase'), 'Phase: idle');
      assert.equal(await page.locator('#boundary').inputValue(), 'current');
      assert.equal(await page.locator('#restoration').inputValue(), 'complete');
      assert.equal(await page.locator('#ownership').inputValue(), 'exclusive');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await value('promotion-outcome'), 'Promotion outcome: not requested');
      assert.equal(await value('sync-outcome'), 'Synchronization: not checked');
      assert.equal(await value('ownership-outcome'), 'Ownership: not checked');
      assert.equal(await value('declared-boundary'), 'Declared boundary: not staged · required: 6');
      assert.equal(await value('receipt-metrics'), 'Restored receipts: not staged · expected: 6');
      assert.equal(await value('missing-metrics'), 'Missing committed receipts: not checked');
      assert.equal(await value('ownership-metrics'), 'Candidate grant: not checked');
      assert.equal(await value('promotion-metrics'), 'Restored writer activated: no · preserved effects: not checked');
      assert.equal(await value('impact'), 'User-impact model: no promotion requested.');
      assert.equal(await value('trace'), 'No attempt staged.');
      assert.equal(await value('prediction-result'), 'Learning prediction not checked.');
      assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#stage-replica').isEnabled(), retained < 6);
      for (const id of ['verify-replica', 'promote-replica', 'prediction', 'check-prediction', 'new-attempt']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
      }
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#settings-form').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#prediction-form').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await value('history-count'), `Retained completed attempts: ${retained} / 6`);
      assert.equal((await rows('history-rows')).length, retained);
      assert.ok((await rows('receipt-rows')).every((row) => row[3] === 'not staged'));
      assert.equal(await page.locator('#retained-detail').evaluate((node) => node.open), false);
      if (!retained) assert.equal(await page.locator('#retained-proof').textContent(), '');
    };
    const reset = async () => {
      await press('reset-rehearsal', 'Space');
      await focused('stage-replica');
      await defaults();
      assert.equal(await value('totals'), 'Decided attempts: success 0 · failure 0 · unknown 0');
    };
    const next = async (settings = {}) => {
      const retained = await rows('history-rows');
      const totals = await value('totals');
      await press('new-attempt');
      await focused('stage-replica');
      await defaults(retained.length);
      assert.deepEqual(await rows('history-rows'), retained);
      assert.equal(await value('totals'), totals);
      for (const [id, choice] of Object.entries(settings)) await page.locator(`#${id}`).selectOption(choice);
    };
    const execute = async (expected) => {
      await press('stage-replica');
      await focused('verify-replica');
      assert.equal(await value('phase'), 'Phase: staged');
      assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), true);
      await page.keyboard.press('Space');
      await focused('promote-replica');
      assert.equal(await value('phase'), 'Phase: verified');
      assert.equal(await value('promotion-outcome'), 'Promotion outcome: not requested');
      await page.keyboard.press('Enter');
      await focused('prediction');
      assert.equal(await value('phase'), 'Phase: decided');
      assert.equal(await value('promotion-outcome'), `Promotion outcome: ${expected}`);
      assert.equal(await page.locator('#promotion-outcome').getAttribute('data-status'), expected);
    };
    const check = async (prediction, expected, retained) => {
      await page.locator('#prediction').selectOption(prediction);
      await press('check-prediction');
      assert.equal(await value('phase'), 'Phase: checked');
      assert.match(await value('prediction-result'), new RegExp(`Learning check: ${expected}`));
      assert.equal((await rows('history-rows')).length, retained);
      await focused(retained < 6 ? 'new-attempt' : 'reset-rehearsal');
    };
    await defaults();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Enter');
    await focused('controls');

    await page.locator('#verify-replica').evaluate((button) => { button.disabled = false; button.click(); });
    assert.match(await value('input-error'), /Invalid phase: idle/);
    assert.equal(await value('phase'), 'Phase: idle');
    assert.equal((await rows('history-rows')).length, 0);
    await focused('input-error');
    await observe('out-of-order action rejected without state mutation');
    await reset();
    await page.locator('#boundary').evaluate((select) => select.add(new Option('Injected invalid choice', 'invalid', false, true)));
    await press('stage-replica');
    assert.match(await value('input-error'), /Invalid configuration/);
    assert.equal(await page.locator('#boundary').getAttribute('aria-invalid'), 'true');
    await focused('boundary');
    assert.equal(await value('phase'), 'Phase: idle');
    await observe('invalid injected input is rejected and announced');
    await page.locator('#boundary option[value="invalid"]').evaluate((option) => option.remove());
    await reset();

    await execute('PASS');
    assert.match(await value('promotion-metrics'), /activated: yes.*preserved effects: 6.*writers: 1/);
    assert.match(await value('missing-metrics'), /none/);
    await press('check-prediction');
    assert.match(await value('input-error'), /Invalid prediction/);
    assert.equal(await value('phase'), 'Phase: decided');
    assert.equal((await rows('history-rows')).length, 0);
    assert.equal(await value('promotion-outcome'), 'Promotion outcome: PASS');
    await focused('prediction');
    await check('FAIL', 'FAIL', 1);
    assert.equal(await value('promotion-outcome'), 'Promotion outcome: PASS');
    await observe('complete restoration promotes; wrong learning prediction does not rewrite PASS');

    await next({ restoration: 'gap' });
    await execute('FAIL');
    assert.match(await value('receipt-metrics'), /5 \/ 6.*contiguous through: 3.*maximum: 6/);
    assert.equal(await value('missing-metrics'), 'Missing committed receipts: 4');
    assert.equal((await rows('receipt-rows'))[3][3], 'MISSING');
    assert.match(await value('promotion-metrics'), /activated: no/);
    await check('FAIL', 'PASS', 2);
    await observe('interior committed gap fails despite maximum receipt 6');
    if (capture) {
      await page.screenshot({ path: path.join(root, 'evidence', 'browser-gap.png'), fullPage: true });
      proof.screenshots.push('evidence\\browser-gap.png');
    }
    await next({ restoration: 'behind', ownership: 'unverified' });
    await execute('FAIL');
    assert.equal(await value('missing-metrics'), 'Missing committed receipts: 5, 6');
    assert.match(await value('ownership-outcome'), /UNKNOWN/);
    await check('FAIL', 'PASS', 3);
    await observe('missing boundaries 5 and 6 remain FAIL alongside unknown ownership');

    await next({ boundary: 'missing' });
    await execute('FAIL');
    assert.match(await value('sync-outcome'), /No declared committed boundary/);
    await check('FAIL', 'PASS', 4);
    await observe('missing declaration rejects even a complete replica');

    await next({ ownership: 'old-active' });
    await execute('FAIL');
    assert.match(await value('ownership-metrics'), /previous fenced: false.*potential writers: 2/);
    assert.match(await value('promotion-metrics'), /activated: no/);
    await check('FAIL', 'PASS', 5);
    await observe('unfenced previous writer rejects promotion; no restored activation');

    await next({ restoration: 'unverified' });
    await execute('UNKNOWN');
    assert.equal(await value('missing-metrics'), 'Missing committed receipts: unknown');
    assert.match(await value('promotion-metrics'), /preserved effects: unknown/);
    await check('UNKNOWN', 'PASS', 6);
    assert.equal(await value('totals'), 'Decided attempts: success 1 · failure 4 · unknown 1');
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    const retainedProof = JSON.parse(await page.locator('#retained-proof').textContent());
    assert.equal(retainedProof.length, 6);
    assert.equal(retainedProof[1].outcome, 'FAIL');
    assert.deepEqual(retainedProof[1].verification.synchronization.missing, [4]);
    assert.equal(retainedProof[0].trace.length, 4);
    await observe('unverified restoration held UNKNOWN; six immutable completed attempts retained');
    if (capture) {
      await page.screenshot({ path: path.join(root, 'evidence', 'browser-unknown.png'), fullPage: true });
      proof.screenshots.push('evidence\\browser-unknown.png');
    }
    await page.locator('#new-attempt').evaluate((button) => { button.disabled = false; button.click(); });
    await defaults(6);
    await page.locator('#stage-replica').evaluate((button) => { button.disabled = false; button.click(); });
    assert.match(await value('input-error'), /History limit/);
    assert.equal((await rows('history-rows')).length, 6);
    await observe('seventh attempt rejected without silent history eviction');
    await reset();

    const further = [
      [{ ownership: 'stale-grant' }, 'FAIL', 'stale epoch-7 grant rejected'],
      [{ ownership: 'wrong-target' }, 'FAIL', 'grant for a different candidate rejected'],
      [{ boundary: 'stale' }, 'FAIL', 'stale declaration cannot hide committed effects 5 and 6'],
      [{ ownership: 'unverified' }, 'UNKNOWN', 'unknown ownership cannot authorize restored capacity'],
    ];
    for (let index = 0; index < further.length; index++) {
      const [settings, expected, name] = further[index];
      if (index) await next(settings);
      else for (const [id, choice] of Object.entries(settings)) await page.locator(`#${id}`).selectOption(choice);
      await execute(expected);
      await check(expected, 'PASS', index + 1);
      await observe(name);
    }
    await reset();
    await press('stage-replica');
    await page.keyboard.press('Enter');
    assert.equal(await value('phase'), 'Phase: verified');
    await reset();
    await observe('explicit reset clears active work, controls, errors, measurements and all retained history');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.keyboard.press('Shift+Tab');
    await focused('ownership');
    proof.narrowViewport = await page.evaluate(() => ({
      width: innerWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth,
      visibleKeyboardFocus: getComputedStyle(document.activeElement).outlineStyle !== 'none'
        && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3,
    }));
    assert.equal(proof.narrowViewport.bodyOverflow, false);
    assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);

    stage = 'csp-probes';
    const connection = await page.evaluate(async () => {
      window.__s070InlineRan = false;
      window.__s070Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s070Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'window.__s070InlineRan = true;';
      document.head.append(script);
      script.remove();
      try {
        await fetch('http://127.0.0.1:43571/s070-csp-probe');
        return 'unexpectedly allowed';
      } catch (error) {
        return error.name;
      }
    });
    await page.waitForFunction(() => window.__s070Violations.length >= 2);
    proof.csp = await page.evaluate(() => ({
      inlineRan: window.__s070InlineRan, violations: window.__s070Violations,
    }));
    proof.csp.connection = connection;
    assert.equal(proof.csp.inlineRan, false);
    assert.equal(connection, 'TypeError');
    assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
    assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.pageErrors, []);
    proof.outcome = 'PASS';
  } catch (error) {
    failure = error;
    proof.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      if (session) {
        proof.cleanup.closeAwaited = true;
        await session.close();
        proof.cleanup.closed = session.page.isClosed();
      }
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'Browser check and cleanup failed') : error;
      proof.outcome = 'FAIL';
      proof.cleanup.failure = error.message;
    }
    proof.completedAtUtc = new Date().toISOString();
    if (capture) {
      const file = proof.outcome === 'PASS' ? 'browser.json' : `browser-failed-${Date.now()}.json`;
      fs.writeFileSync(path.join(root, 'evidence', file), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
    }
  }
  if (failure) throw failure;
  assert.equal(proof.cleanup.closed, true);
});
