'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, lf, inventory } = require('./provenance.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const testedFiles = [
  '.gitattributes', 'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js', 'manifest.json',
  'README.md', 'duplicate-commands.feature', 'tests\\model.test.cjs', 'tests\\surface.test.cjs',
  'tests\\integrity.test.cjs', 'tests\\browser.test.cjs', 'tests\\provenance.cjs', 'tests\\capture.cjs',
];
const hashes = () => Object.fromEntries(inventory().map((file) => [file, sha(read(file))]));

test('actual isolated browser: retry effects, unknowns, audit history, keyboard, input/state errors, reset and CSP',
  { timeout: 180000 }, async () => {
    const before = capture ? null : hashes();
    const proof = {
      cardId: 'A-S084', workerId: 'worker-A-S084', mode: 'synthetic', outcome: 'FAIL',
      entry: 'learning\\S084\\index.html', runtime: process.version, playwrightVersion,
      startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
      helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
      testedSourceHashes: Object.fromEntries(testedFiles.map((file) => [file, sha(lf(read(file)))])),
      observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
      probeRequests: [], probeResponses: [], screenshots: [], cleanup: {},
    };
    const screenshots = [];
    let session;
    let stage = 'exercise';
    try {
      assert.equal(process.version, 'v22.23.4');
      assert.equal(playwrightVersion, '1.56.1');
      if (capture) for (const file of ['browser-final.json', 'browser-final-failure.png', 'browser-final-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Capture must never overwrite historical proof.');
      }
      session = await openIsolatedLesson('learning\\S084\\index.html');
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
          inventory: await value('inventory'), route: await value('routing'), metrics: await value('metrics'),
          retries: await value('retry-metrics'), deliveryOutcomes: await value('delivery-totals'),
          evidence: await value('evidence-note'), prediction: await value('prediction-result'),
          totals: await value('totals'), audit: await rows('audit-rows'), history: await rows('history-rows'),
          trace: await value('trace'), alert: await page.locator('#input-error').textContent(),
          activeElement: await page.evaluate(() => document.activeElement.id),
        });
      };
      const defaults = async (retained = 0) => {
        assert.equal(await page.locator('#lesson').getAttribute('data-ready'), 'true');
        assert.equal(await value('phase'), 'Phase: idle');
        assert.equal(await value('outcome'), 'Result: not verified');
        assert.equal(await value('trace'), 'No attempt started.');
        assert.equal(await page.locator('#retry-policy').inputValue(), 'remembered');
        assert.equal(await page.locator('#evidence').inputValue(), 'complete');
        assert.equal(await page.locator('#prediction').inputValue(), '');
        assert.equal(await value('prediction-result'), 'Prediction not checked.');
        assert.equal(await value('history-count'), `Retained completed attempts: ${retained} / 4`);
        assert.equal((await rows('history-rows')).length, retained);
        assert.deepEqual(await rows('audit-rows'), []);
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), false);
        assert.equal(await page.locator('#deliver').isEnabled(), true);
        for (const id of ['retry-commands', 'verify-run', 'prediction', 'check-prediction', 'new-attempt']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
        }
        assert.equal(await page.locator('#input-error').isHidden(), true);
        assert.equal(await page.locator('#input-error').textContent(), '');
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
        assert.equal(await page.locator('#history-detail').evaluate((node) => node.open), false);
        assert.equal(await page.locator('#history-proof').textContent(), '');
        for (const id of ['settings-form', 'prediction-form']) {
          assert.equal(await page.locator(`#${id}`).evaluate((node) => typeof node.reset), 'function');
        }
      };
      const reset = async () => {
        await press('reset-all', 'Space');
        await defaults();
        await focused('deliver');
      };
      const run = async () => {
        await press('deliver');
        await focused('retry-commands');
        assert.equal((await rows('audit-rows')).length, 3);
        assert.equal(await value('retry-metrics'), 'Original effects: 3 · retry outcomes: not inspected');
        await press('retry-commands', 'Space');
        await focused('verify-run');
        assert.equal((await rows('audit-rows')).length, 6);
        await press('verify-run');
        await focused('prediction');
      };
      const retain = async (prediction) => {
        await page.locator('#prediction').selectOption(prediction);
        await press('check-prediction', 'Space');
      };
      await defaults();
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      await page.locator('.skip').focus(); await page.keyboard.press('Enter'); await focused('lesson');
      await page.keyboard.press('Tab'); await focused('retry-policy');
      await page.locator('#retry-commands').dispatchEvent('click');
      assert.match(await value('input-error'), /INVALID_STATE/);
      await focused('input-error');
      assert.deepEqual(await rows('audit-rows'), []);
      await observe('out-of-order retry rejected without observations');
      await reset();
      await page.locator('#retry-policy').evaluate((node) => {
        node.add(new Option('Injected invalid option', 'not-a-policy', false, true));
      });
      await page.locator('#settings-form').dispatchEvent('submit');
      assert.match(await value('input-error'), /INVALID_INPUT/);
      assert.equal(await page.locator('#retry-policy').getAttribute('aria-invalid'), 'true');
      await focused('retry-policy');
      assert.equal(await value('phase'), 'Phase: idle');
      await observe('invalid injected enum focused and rejected');
      await page.locator('#retry-policy option[value="not-a-policy"]').evaluate((node) => node.remove());
      await reset();

      await page.locator('#retry-policy').focus(); await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#retry-policy').inputValue(), 'blind');
      await press('deliver');
      const originals = await rows('audit-rows');
      await page.locator('#settings-form').dispatchEvent('submit');
      assert.match(await value('input-error'), /INVALID_STATE/);
      assert.deepEqual(await rows('audit-rows'), originals);
      await observe('repeated originals rejected without duplicate audit');
      await press('retry-commands', 'Space');
      const retries = await rows('audit-rows');
      assert.deepEqual(retries.slice(0, 3), originals);
      for (let i = 0; i < 3; i++) {
        assert.equal(retries[i][1], retries[i + 3][1]);
        assert.equal(retries[i][3], retries[i + 3][3]);
      }
      await page.locator('#retry-commands').dispatchEvent('click');
      assert.match(await value('input-error'), /INVALID_STATE/);
      assert.deepEqual(await rows('audit-rows'), retries);
      await press('verify-run');
      assert.equal(await value('outcome'), 'Result: FAIL');
      assert.match(await value('inventory'), /2 \(candidate-v2, candidate-v2-copy\)/);
      assert.match(await value('routing'), /retained-v1 \(target MISSING\)/);
      assert.match(await value('metrics'), /swaps: 2 · extra swaps: 1/);
      assert.match(await value('retry-metrics'), /Duplicate resources: 1.*cleanup retry errors: 1/);
      assert.equal(await value('delivery-totals'), 'Delivery outcomes: 6 attempted · 6 known · 0 unknown');
      await press('check-prediction');
      assert.match(await value('input-error'), /INVALID_INPUT/);
      await focused('prediction');
      assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
      assert.equal((await rows('history-rows')).length, 0);
      await observe('blank prediction rejected without retaining');
      await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#prediction').inputValue(), 'PASS');
      await press('check-prediction', 'Space');
      assert.match(await value('prediction-result'), /incorrect.*FAIL/);
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      await focused('new-attempt');
      await pressHistory(1);
      assert.equal(JSON.parse(await page.locator('#history-proof').textContent()).observation.audit.length, 6);
      await focused('history-summary');
      if (capture) screenshots.push(['evidence\\browser-final-failure.png', await page.screenshot({ fullPage: true })]);
      await observe('blind duplicate resource, second swap and cleanup error FAIL retained despite PASS prediction');

      await press('new-attempt', 'Space'); await defaults(1); await focused('deliver');
      await run();
      assert.equal(await value('outcome'), 'Result: PASS');
      assert.match(await value('inventory'), /1 \(candidate-v2\)/);
      assert.match(await value('metrics'), /swaps: 1 · extra swaps: 0 · intended removals: 1/);
      assert.match(await value('retry-metrics'), /Duplicate resources: 0.*known effects: 3.*replayed receipts: 3.*errors: 0/);
      assert.deepEqual((await rows('audit-rows')).slice(3).map((entry) => entry[4]), ['REPLAYED', 'REPLAYED', 'REPLAYED']);
      await retain('PASS');
      assert.match(await value('prediction-result'), /correct.*PASS/);
      await observe('remembered same-key retries PASS with no additional effects');

      await press('new-attempt'); await defaults(2);
      await page.locator('#evidence').focus(); await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#evidence').inputValue(), 'cleanup-unobserved');
      await run();
      assert.equal(await value('outcome'), 'Result: UNKNOWN');
      assert.equal(await value('delivery-totals'), 'Delivery outcomes: 6 attempted · 5 known · 1 unknown');
      assert.match(await value('gates'), /cleanup: UNKNOWN · audit: UNKNOWN/);
      assert.match(await value('evidence-note'), /final state are unverified/);
      assert.equal((await rows('audit-rows'))[5][4], 'UNKNOWN');
      await retain('UNKNOWN');
      if (capture) screenshots.push(['evidence\\browser-final-unknown.png', await page.screenshot({ fullPage: true })]);
      await observe('missing cleanup retry receipt UNKNOWN retained, not final-state success');

      await press('new-attempt'); await defaults(3);
      await page.locator('#retry-policy').selectOption('blind');
      await page.locator('#evidence').selectOption('cleanup-unobserved');
      await run();
      assert.equal(await value('outcome'), 'Result: FAIL');
      assert.equal(await value('delivery-totals'), 'Delivery outcomes: 6 attempted · 5 known · 1 unknown');
      assert.match(await value('gates'), /Resources: FAIL · swaps: FAIL · state: FAIL · cleanup: UNKNOWN/);
      await retain('FAIL');
      await focused('reset-all');
      const historyRows = await rows('history-rows');
      assert.deepEqual(historyRows.map((entry) => entry[2]), ['FAIL', 'PASS', 'UNKNOWN', 'FAIL']);
      assert.equal(await value('totals'), 'Attempt results: 1 PASS · 2 FAIL · 1 UNKNOWN');
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      proof.retainedAttemptsAtCapacity = [];
      for (let i = 1; i <= 4; i++) {
        await pressHistory(i);
        proof.retainedAttemptsAtCapacity.push(JSON.parse(await page.locator('#history-proof').textContent()));
      }
      await page.locator('#new-attempt').dispatchEvent('click');
      assert.match(await value('input-error'), /ATTEMPT_LIMIT/);
      assert.deepEqual(await rows('history-rows'), historyRows);
      await focused('input-error');
      await observe('known failure plus unknown retained; fifth attempt rejected without eviction');
      await reset();
      assert.equal(await value('totals'), 'Attempt results: 0 PASS · 0 FAIL · 0 UNKNOWN');
      await observe('explicit reset clears errors, details, settings, trace, prediction and history');

      await page.setViewportSize({ width: 360, height: 800 });
      await page.locator('#retry-policy').focus();
      await page.keyboard.press('Tab'); await focused('evidence');
      await page.keyboard.press('Tab'); await focused('deliver');
      proof.narrowViewport = await page.evaluate(() => {
        const element = document.activeElement;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          bodyOverflow: document.documentElement.scrollWidth > innerWidth,
          visibleKeyboardFocus: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 3,
          focusedControlInsideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          scrollableTableRegions: [...document.querySelectorAll('.table-region')].every((node) =>
            node.tabIndex === 0 && node.scrollWidth > node.clientWidth),
        };
      });
      assert.deepEqual(proof.narrowViewport, {
        bodyOverflow: false, visibleKeyboardFocus: true, focusedControlInsideViewport: true, scrollableTableRegions: true,
      });
      await press('deliver');
      await reset();
      await observe('mid-attempt reset clears originals with keyboard focus restored');
      await run(); await retain('PASS');
      assert.equal((await rows('history-rows')).length, 1);
      await page.reload({ waitUntil: 'load' }); await defaults();
      await observe('reload clears all in-memory data');

      assert.deepEqual(proof.pageErrors, []);
      assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
      assert.deepEqual(proof.exerciseNetworkRequests, []);
      stage = 'csp-probes';
      proof.csp = await page.evaluate(async () => {
        window.__s084Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s084Violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'window.__s084Inline = true;';
        document.head.append(script);
        let connection;
        try { await fetch('https://s084.invalid/probe'); connection = 'UNEXPECTED_SUCCESS'; }
        catch (error) { connection = error.name; }
        return { inlineRan: window.__s084Inline === true, connection };
      });
      await page.waitForFunction(() => window.__s084Violations.length >= 2);
      proof.csp.violations = await page.evaluate(() => window.__s084Violations);
      assert.equal(proof.csp.inlineRan, false);
      assert.equal(proof.csp.connection, 'TypeError');
      assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
      assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
      assert.deepEqual(proof.probeResponses, []);
      assert.deepEqual(proof.probeRequests, []);
      proof.outcome = 'PASS';
      async function pressHistory(index) {
        const button = page.getByRole('button', { name: `Inspect attempt ${index}`, exact: true });
        await button.focus(); await page.keyboard.press('Enter');
      }
    } finally {
      proof.cleanup.closeAwaited = true;
      if (session) {
        await session.close();
        proof.cleanup.closed = true;
      }
      proof.completedAtUtc = new Date().toISOString();
    }
    assert.equal(proof.cleanup.closed, true);
    if (capture) {
      for (const [file, bytes] of screenshots) {
        fs.writeFileSync(path.join(root, file), bytes, { flag: 'wx' });
        proof.screenshots.push(file);
      }
      fs.writeFileSync(path.join(root, 'evidence', 'browser-final.json'), `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
    } else assert.deepEqual(hashes(), before, 'Ordinary browser verification must leave all owned files byte-for-byte unchanged.');
  });
