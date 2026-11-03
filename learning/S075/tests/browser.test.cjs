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

test('actual isolated DOM: scale-out, duplicates, unknowns, keyboard, errors, retained history, reset and enforced CSP',
  { timeout: 210000 }, async () => {
    const proof = {
      cardId: 'A-S075', workerId: 'worker-A-S075', mode: 'synthetic', outcome: 'FAIL',
      entry: 'learning\\S075\\index.html', runtime: process.version, playwrightVersion,
      startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
      helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
      testedSourceHashes: Object.fromEntries(['index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js',
        'manifest.json', 'README.md', 'consumer-scale-out.feature', 'tests\\browser.test.cjs']
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
      if (capture) for (const file of ['browser.json', 'browser-duplicates.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Capture cannot overwrite prior evidence.');
      }
      session = await openIsolatedLesson('learning\\S075\\index.html');
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
      assert.equal(await page.locator('#main').getAttribute('data-ready'), 'true');
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
          name, phase: await value('phase'), outcome: await value('outcome'), ownership: await value('ownership-result'),
          ownerCounts: await value('ownership-metrics'), deliveries: await value('delivery-metrics'),
          effects: await value('effect-metrics'), coverage: await value('coverage-metrics'),
          eventTotals: await value('event-totals'), attemptTotals: await value('totals'),
          learning: await value('prediction-result'), alert: await page.locator('#input-error').textContent(),
          assignments: await rows('assignment-rows'), events: await rows('event-rows'), history: await rows('history-rows'),
          trace: await value('trace'), activeElement: await page.evaluate(() => document.activeElement.id),
        });
      };
      const defaults = async (retained = 0) => {
        assert.equal(await value('phase'), 'Phase: idle');
        for (const [id, expected] of Object.entries({ additions: 'one', ownership: 'exclusive', delivery: 'complete', dedup: 'ledger', prediction: '' })) {
          assert.equal(await page.locator(`#${id}`).inputValue(), expected, id);
        }
        assert.equal(await value('outcome'), 'Result: not verified');
        assert.equal(await value('ownership-result'), 'Ownership: not verified');
        assert.equal(await value('trace'), 'No attempt started.');
        assert.equal(await value('event-totals'), 'Events: six declared · not verified');
        assert.equal(await value('consumer-metrics'), 'Consumers: 1 (not expanded)');
        assert.equal(await value('ownership-metrics'), 'Duplicate owner partitions: not checked · invalid lock claims: not checked');
        assert.equal(await value('delivery-metrics'), 'Deliveries: not observed · repeated deliveries: not checked');
        assert.equal(await value('effect-metrics'), 'Effects: not observed · duplicate business effects: not checked · suppressed deliveries: not checked');
        assert.equal(await value('coverage-metrics'), 'Missing events: not checked · new-consumer event coverage: not checked');
        assert.equal(await value('prediction-result'), 'Learning prediction not checked.');
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), false);
        assert.equal(await page.locator('#add-consumers').isEnabled(), true);
        for (const id of ['process-batch', 'verify-run', 'prediction', 'check-prediction', 'new-attempt']) {
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
        assert.ok((await rows('event-rows')).every((row) => row[4] === 'not verified'));
        assert.equal(await page.locator('#retained-detail').evaluate((node) => node.open), false);
        if (!retained) assert.equal(await page.locator('#retained-proof').textContent(), '');
      };
      const reset = async () => {
        await press('reset-lesson', 'Space');
        await focused('add-consumers');
        await defaults();
        assert.equal(await value('totals'), 'Decided attempts: success 0 · failure 0 · unknown 0');
      };
      const next = async (settings = {}) => {
        const history = await rows('history-rows');
        const totals = await value('totals');
        const detail = await page.locator('#retained-proof').textContent();
        await press('new-attempt');
        await focused('add-consumers');
        await defaults(history.length);
        assert.deepEqual(await rows('history-rows'), history);
        assert.equal(await value('totals'), totals);
        assert.equal(await page.locator('#retained-proof').textContent(), detail);
        for (const [id, choice] of Object.entries(settings)) await page.locator(`#${id}`).selectOption(choice);
      };
      const execute = async (expected) => {
        await press('add-consumers');
        await focused('process-batch');
        assert.equal(await value('phase'), 'Phase: expanded');
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), true);
        assert.equal(await page.locator('#verify-run').isDisabled(), true);
        assert.equal(await value('outcome'), 'Result: not verified');
        await press('process-batch', 'Space');
        await focused('verify-run');
        assert.equal(await value('phase'), 'Phase: processed');
        await press('verify-run');
        await focused('prediction');
        assert.equal(await value('phase'), 'Phase: verified');
        assert.equal(await value('outcome'), `Result: ${expected}`);
        assert.equal(await page.locator('#process-batch').isDisabled(), true);
        assert.equal(await page.locator('#verify-run').isDisabled(), true);
      };
      const retain = async (prediction, correct = true) => {
        const measured = await value('outcome');
        await page.locator('#prediction').selectOption(prediction);
        await press('check-prediction');
        assert.equal(await value('phase'), 'Phase: checked');
        assert.equal(await value('outcome'), measured);
        assert.match(await value('prediction-result'), new RegExp(`Learning check: ${correct ? 'correct' : 'incorrect'}`));
        const count = (await rows('history-rows')).length;
        await focused(count === 6 ? 'reset-lesson' : 'new-attempt');
      };
      await defaults();
      await page.locator('.skip').focus();
      await page.keyboard.press('Enter');
      await focused('main');
      await page.locator('#additions').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#additions').inputValue(), 'two');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#additions').inputValue(), 'one');
      await page.locator('#delivery').selectOption('redelivery');
      await execute('PASS');
      assert.equal(await value('delivery-metrics'), 'Deliveries: 7 · repeated deliveries: 1');
      assert.equal(await value('effect-metrics'), 'Effects: 6 · duplicate business effects: 0 · suppressed deliveries: 1');
      assert.equal(await value('coverage-metrics'), 'Missing events: 0 · new-consumer event coverage: 2');
      assert.ok((await rows('event-rows')).every((row) => row[4].startsWith('PASS')));
      await observe('exclusive expansion with new-consumer progress; redelivery not duplicate effects; keyboard');
      await press('check-prediction');
      assert.match(await value('input-error'), /Invalid prediction/);
      await focused('prediction');
      assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
      assert.equal(await value('phase'), 'Phase: verified');
      assert.equal((await rows('history-rows')).length, 0);
      await observe('empty prediction rejected without outcome mutation');
      await retain('FAIL', false);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      await next({ delivery: 'redelivery', dedup: 'off' });
      await execute('FAIL');
      assert.equal(await value('effect-metrics'), 'Effects: 7 · duplicate business effects: 1 · suppressed deliveries: 0');
      assert.equal(await value('event-totals'), 'Events: attempted 6 · success 5 · failure 1 · unknown 0');
      assert.equal((await rows('event-rows')).find((row) => row[0] === 'E03')[3], '2');
      await observe('duplicate business effect FAIL retained, not an uninterrupted retry');
      if (capture) {
        await page.locator('#result-title').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(root, 'evidence', 'browser-duplicates.png'), fullPage: true });
        proof.screenshots.push('evidence\\browser-duplicates.png');
      }
      await retain('FAIL');
      await next({ additions: 'two', ownership: 'overlap' });
      await execute('FAIL');
      assert.equal(await value('ownership-metrics'), 'Duplicate owner partitions: 2 · invalid lock claims: 2');
      assert.match(await value('effect-metrics'), /^Effects: 6 · duplicate business effects: 0/);
      await observe('duplicate owners FAIL despite deduplicated effects; two added consumers');
      await retain('FAIL');
      await next({ ownership: 'stale-lock' });
      await execute('FAIL');
      assert.equal(await value('ownership-metrics'), 'Duplicate owner partitions: 0 · invalid lock claims: 1');
      await observe('expired stale lock FAIL even with complete effects');
      await retain('FAIL');
      await next({ delivery: 'missing' });
      await execute('FAIL');
      assert.match(await value('coverage-metrics'), /^Missing events: 1/);
      assert.equal((await rows('event-rows')).find((row) => row[0] === 'E04')[3], '0');
      await observe('missing E04 FAIL stays in denominator');
      await retain('FAIL');
      await next({ ownership: 'unobserved' });
      await execute('UNKNOWN');
      assert.equal(await value('event-totals'), 'Events: attempted 6 · success 0 · failure 0 · unknown 6');
      assert.match(await value('coverage-metrics'), /new-consumer event coverage: unknown/);
      await observe('unobserved ownership UNKNOWN held, not a successful scale-out');
      if (capture) {
        await page.screenshot({ path: path.join(root, 'evidence', 'browser-unknown.png'), fullPage: true });
        proof.screenshots.push('evidence\\browser-unknown.png');
      }
      await retain('UNKNOWN');
      assert.equal(await value('history-count'), 'Retained completed attempts: 6 / 6');
      assert.equal(await value('totals'), 'Decided attempts: success 1 · failure 4 · unknown 1');
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#add-consumers').isDisabled(), true);
      const retained = await rows('history-rows');
      await page.locator('#new-attempt').evaluate((node) => node.dispatchEvent(new Event('click', { bubbles: true })));
      assert.match(await value('input-error'), /History full/);
      await focused('input-error');
      assert.deepEqual(await rows('history-rows'), retained);
      assert.equal(await value('phase'), 'Phase: checked');
      await page.locator('#retained-detail').evaluate((node) => { node.open = true; });
      const detail = JSON.parse(await page.locator('#retained-proof').textContent());
      assert.equal(detail.length, 6);
      assert.equal(detail[1].effects.filter((effect) => effect.eventId === 'E03').length, 2);
      assert.equal(detail[5].result.verdict, 'UNKNOWN');
      await observe('seventh attempt rejected without eviction; full retained raw detail');
      await reset();
      await observe('explicit reset clears failure, unknown, errors, inputs, prediction, details and history');
      await page.locator('#ownership').evaluate((select) => {
        select.add(new Option('Injected invalid choice', 'not-an-owner'));
        select.value = 'not-an-owner';
      });
      await press('add-consumers');
      assert.match(await value('input-error'), /Invalid input/);
      await focused('ownership');
      assert.equal(await page.locator('#ownership').getAttribute('aria-invalid'), 'true');
      assert.equal(await value('phase'), 'Phase: idle');
      assert.equal(await value('outcome'), 'Result: not verified');
      await observe('invalid injected enum rejected with announced field error');
      await reset();
      await page.locator('#verify-run').evaluate((node) => node.dispatchEvent(new Event('click', { bubbles: true })));
      assert.match(await value('input-error'), /Phase idle/);
      assert.equal(await value('phase'), 'Phase: idle');
      await observe('out-of-order action rejected without state mutation');
      await reset();
      await page.locator('#delivery').selectOption('unobserved');
      await execute('UNKNOWN');
      assert.equal(await value('delivery-metrics'), 'Deliveries: unknown · repeated deliveries: unknown');
      assert.match(await value('effect-metrics'), /duplicate business effects: unknown/);
      await observe('unobserved delivery UNKNOWN; missing and duplicate counts not fabricated');
      await retain('UNKNOWN');
      await next({ ownership: 'overlap', delivery: 'unobserved' });
      await execute('FAIL');
      assert.equal(await value('event-totals'), 'Events: attempted 6 · success 0 · failure 0 · unknown 6');
      await observe('known ownership FAIL dominates unavailable delivery; unknown events retained');
      await retain('FAIL');
      await reset();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#add-consumers').focus();
      proof.narrowViewport = await page.evaluate(() => ({
        width: innerWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth,
        visibleKeyboardFocus: getComputedStyle(document.activeElement).outlineStyle !== 'none',
      }));
      assert.equal(proof.narrowViewport.bodyOverflow, false);
      assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
      await page.locator('#delivery').selectOption('redelivery');
      await execute('PASS');
      await retain('PASS');
      await page.reload({ waitUntil: 'load' });
      await defaults();
      assert.equal(await value('totals'), 'Decided attempts: success 0 · failure 0 · unknown 0');
      await observe('narrow viewport visible keyboard focus and reload clears memory');
      stage = 'csp-probes';
      proof.csp = await page.evaluate(async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        globalThis.__s075InlineProbe = false;
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s075InlineProbe = true;';
        document.head.append(script);
        let connection;
        try { await fetch('http://127.0.0.1:1/s075-csp-probe'); connection = 'unexpected success'; }
        catch (error) { connection = error.name; }
        await new Promise((resolve) => setTimeout(resolve, 100));
        script.remove();
        return { inlineRan: globalThis.__s075InlineProbe, connection, violations };
      });
      assert.equal(proof.csp.inlineRan, false);
      assert.equal(proof.csp.connection, 'TypeError');
      assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
      assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
      assert.deepEqual(proof.pageErrors, []);
      assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
      assert.deepEqual(proof.exerciseNetworkRequests, []);
      assert.deepEqual(proof.probeResponses, []);
      proof.outcome = 'PASS';
    } catch (error) {
      failure = error;
      proof.error = { name: error.name, message: error.message, stack: error.stack };
    } finally {
      proof.cleanup.closeAwaited = true;
      if (session) {
        try { await session.close(); proof.cleanup.closed = true; }
        catch (error) { proof.cleanup.error = error.message; failure = failure || error; proof.outcome = 'FAIL'; }
      }
      proof.completedAtUtc = new Date().toISOString();
      if (capture) {
        const name = failure ? `browser-failed-${Date.now()}.json` : 'browser.json';
        fs.writeFileSync(path.join(root, 'evidence', name), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
      }
    }
    if (failure) throw failure;
  });
