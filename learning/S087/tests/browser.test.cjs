'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, lf } = require('./provenance.cjs');
const fixtures = require('..\\fixtures.js');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
function hashes() {
  const entries = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else entries[path.relative(root, file)] = sha(fs.readFileSync(file));
    }
  }
  walk(root);
  return entries;
}

test('actual isolated DOM: observed cohorts, valid destinations, retention guard, keyboard, errors, history/reset and CSP',
  { timeout: 210000 }, async () => {
    const before = capture ? null : hashes();
    const proof = {
      cardId: 'A-S087', workerId: 'worker-A-S087', mode: 'synthetic', outcome: 'FAIL',
      entry: 'learning\\S087\\index.html', runtime: process.version, playwrightVersion,
      startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
      helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
      testedSourceHashes: Object.fromEntries(['.gitattributes', 'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js',
        'manifest.json', 'README.md', 'routing.feature', 'tests\\model.test.cjs', 'tests\\surface.test.cjs',
        'tests\\browser.test.cjs', 'tests\\integrity.test.cjs', 'tests\\capture.cjs', 'tests\\provenance.cjs']
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
      if (capture) for (const file of ['browser.json', 'browser-failure.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Capture may not overwrite proof.');
      }
      session = await openIsolatedLesson('learning\\S087\\index.html');
      proof.browserVersion = session.browserVersion;
      assert.match(session.browserVersion, /^156\./);
      const page = session.page;
      page.on('pageerror', (error) => proof.pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
      });
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests).push(request.url());
      });
      page.on('response', (response) => {
        if (/^https?:/.test(response.url()) && stage === 'csp-probes') proof.probeResponses.push(response.url());
      });
      await page.route(/^https?:/, (route) => route.abort('blockedbyclient'));
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.reload({ waitUntil: 'load' });
      const text = (id) => page.locator(`#${id}`).innerText();
      const rows = (id) => page.locator(`#${id} tr`).evaluateAll((entries) =>
        entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
      const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
      const press = async (id, key = 'Enter') => {
        await page.locator(`#${id}`).focus();
        await page.keyboard.press(key);
      };
      const observe = async (name) => {
        proof.observations.push({
          name, phase: await text('phase'), desired: await text('desired'), effective: await text('effective'),
          convergence: await text('convergence'), result: await text('outcome'), journeys: await text('journeys'),
          migrations: await text('migration'), retention: await text('retention'), old: await text('old-status'),
          reason: await text('gate-reason'), totals: await text('totals'), learning: await text('prediction-result'),
          clients: await rows('client-rows'), trace: await rows('trace-rows'), history: await rows('history-rows'),
          error: await page.locator('#input-error').textContent(), activeElement: await page.evaluate(() => document.activeElement.id),
        });
      };
      const defaults = async (retained = 0) => {
        assert.equal(await text('phase'), 'Phase: idle');
        assert.equal(await text('desired'), 'Desired new-v2: not requested');
        assert.equal(await text('effective'), 'Effective new-v2: not observed');
        assert.equal(await text('outcome'), 'Result: NOT_DECIDED');
        assert.equal(await text('convergence'), 'Convergence: NOT_DECIDED');
        assert.equal(await text('retention'), 'Old release: NOT_CHECKED');
        assert.equal(await text('old-status'), 'Old capacity: not evaluated');
        assert.equal(await text('journeys'), 'Journeys: success 0 · failure 0 · unknown 0');
        assert.equal(await text('migration'), 'Intended migrations observed: 0 / 0');
        assert.equal(await text('prediction-result'), 'Learning prediction not checked.');
        assert.equal(await text('history-count'), `Retained complete traces: ${retained} / 6`);
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), false);
        assert.equal(await page.locator('#request-change').isEnabled(), true);
        for (const [id, value] of Object.entries({ ...fixtures.defaults, prediction: '' })) {
          assert.equal(await page.locator(`#${id}`).inputValue(), value, id);
        }
        for (const id of ['observe-routes', 'release-old', 'prediction', 'check-prediction', 'new-attempt']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
        }
        assert.equal(await page.locator('#input-error').isHidden(), true);
        assert.equal(await page.locator('#input-error').textContent(), '');
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
        assert.deepEqual(await rows('client-rows'), []);
        assert.deepEqual(await rows('trace-rows'), []);
        assert.equal((await rows('history-rows')).length, retained);
        assert.equal(await page.locator('#current-proof').textContent(), 'No attempt started.');
        for (const id of ['current-detail', 'history-detail']) {
          assert.equal(await page.locator(`#${id}`).evaluate((node) => node.open), false);
        }
        for (const id of ['settings-form', 'prediction-form']) {
          assert.equal(await page.locator(`#${id}`).evaluate((node) => typeof node.reset), 'function');
        }
        if (!retained) assert.equal(await page.locator('#history-proof').textContent(), '');
      };
      const reset = async () => {
        await press('reset-lesson', 'Space');
        await focused('request-change');
        await defaults();
        assert.equal(await text('totals'), 'Attempted: 0 · completed 0 · active 0 · success 0 · failure 0 · unknown 0');
      };
      const settings = async (values) => {
        for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).selectOption(value);
      };
      const execute = async (expected) => {
        await press('request-change');
        await focused('observe-routes');
        assert.equal(await text('effective'), 'Effective new-v2: not observed');
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), true);
        assert.match(await text('totals'), /active 1/);
        await press('observe-routes', 'Space');
        await focused('release-old');
        assert.equal((await rows('client-rows')).length, 8);
        assert.equal(await text('retention'), 'Old release: NOT_CHECKED');
        await press('release-old');
        await focused('prediction');
        assert.equal(await text('phase'), 'Phase: complete');
        assert.equal(await text('outcome'), `Result: ${expected}`);
        assert.equal((await rows('trace-rows')).length, 3);
      };
      const prediction = async (choice, expected) => {
        await page.locator('#prediction').selectOption(choice);
        await press('check-prediction', 'Space');
        assert.match(await text('prediction-result'), new RegExp(`Learning prediction: ${expected}\\.`));
      };
      const next = async (retained) => {
        await press('new-attempt', 'Space');
        await focused('request-change');
        await defaults(retained);
      };
      const shot = async (name) => {
        if (capture) {
          await page.screenshot({ path: path.join(root, 'evidence', name), fullPage: true });
          proof.screenshots.push(name);
        }
      };

      assert.equal(await page.locator('#main').getAttribute('data-ready'), 'true');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      await defaults();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      await focused('main');
      await observe('Tab skip link and initial defaults');

      await press('request-change');
      assert.equal(await text('desired'), 'Desired new-v2: 100%');
      assert.equal(await text('effective'), 'Effective new-v2: not observed');
      assert.equal(await text('outcome'), 'Result: NOT_DECIDED');
      assert.equal((await rows('trace-rows')).length, 1);
      assert.equal(await text('totals'), 'Attempted: 1 · completed 0 · active 1 · success 0 · failure 0 · unknown 0');
      await observe('request is not observed convergence; active attempt counted');
      await press('observe-routes', 'Space');
      assert.equal(await text('effective'), 'Effective new-v2: 50%');
      assert.equal(await text('retention'), 'Old release: NOT_CHECKED');
      await press('release-old');
      assert.equal(await text('outcome'), 'Result: FAILURE');
      assert.equal(await text('journeys'), 'Journeys: success 8 · failure 0 · unknown 0');
      assert.equal(await text('retention'), 'Old release: RETAIN_REQUIRED');
      assert.equal((await rows('client-rows')).filter((row) => row[2] === 'old').length, 4);
      assert.ok((await rows('client-rows')).every((row) => row[3].startsWith('/synthetic/') && row[4] === 'SUCCESS'));
      await press('check-prediction');
      await focused('prediction');
      assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
      assert.match(await text('input-error'), /prediction/i);
      await observe('empty prediction focused error without changing FAILURE');
      await prediction('FAILURE', 'CORRECT');
      assert.equal(await text('outcome'), 'Result: FAILURE');
      await observe('partial retained old: eight valid destinations but convergence FAILURE');

      await next(1);
      await settings({ old: 'loss' });
      await execute('FAILURE');
      assert.equal(await text('journeys'), 'Journeys: success 4 · failure 4 · unknown 0');
      assert.equal(await text('old-status'), 'Old capacity: unavailable (synthetic)');
      assert.match(await text('gate-reason'), /does not repair/);
      assert.equal((await rows('client-rows')).filter((row) => row[4] === 'FAILURE').length, 4);
      await observe('partial old-loss FAILURE preserves four interrupted clients');
      await shot('browser-failure.png');

      await next(2);
      await settings({ propagation: 'converged' });
      await execute('SUCCESS');
      assert.equal(await text('effective'), 'Effective new-v2: 100%');
      assert.equal(await text('retention'), 'Old release: RELEASE_ALLOWED');
      assert.equal(await text('migration'), 'Intended migrations observed: 8 / 8');
      assert.ok((await rows('client-rows')).every((row) => row[2] === 'next' && row[4] === 'SUCCESS'));
      await prediction('FAILURE', 'INCORRECT');
      await observe('converged 100: observed complete cohort permits route-only release');

      await next(3);
      await settings({ target: '50', propagation: 'converged' });
      await execute('SUCCESS');
      assert.equal(await text('effective'), 'Effective new-v2: 50%');
      assert.equal(await text('retention'), 'Old release: RETAIN_REQUIRED');
      assert.equal(await text('old-status'), 'Old capacity: available (synthetic)');
      assert.equal(await text('migration'), 'Intended migrations observed: 4 / 4');
      await observe('converged 50 still retains old for four remaining clients');

      await next(4);
      await settings({ target: '50', propagation: 'missing' });
      await execute('UNKNOWN');
      assert.equal(await text('effective'), 'Effective new-v2: UNKNOWN (0 known new / 8; 4 unresolved)');
      assert.equal(await text('journeys'), 'Journeys: success 4 · failure 0 · unknown 4');
      assert.equal(await text('convergence'), 'Convergence: UNKNOWN');
      assert.equal(await text('retention'), 'Old release: RETAIN_REQUIRED');
      assert.equal((await rows('client-rows')).filter((row) => row[3] === 'UNKNOWN').length, 4);
      await prediction('UNKNOWN', 'CORRECT');
      await observe('missing cohort UNKNOWN never invents a destination or percentage');
      await shot('browser-unknown.png');

      await next(5);
      await settings({ propagation: 'delayed' });
      await execute('FAILURE');
      assert.equal(await text('effective'), 'Effective new-v2: 0%');
      assert.equal(await text('migration'), 'Intended migrations observed: 0 / 8');
      assert.equal(await text('journeys'), 'Journeys: success 8 · failure 0 · unknown 0');
      await prediction('FAILURE', 'CORRECT');
      await focused('reset-lesson');
      assert.equal(await text('totals'), 'Attempted: 6 · completed 6 · active 0 · success 2 · failure 3 · unknown 1');
      assert.equal((await rows('history-rows')).length, 6);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      await observe('delayed routing is FAILURE despite successful old journeys');
      const retained = await text('history-proof');
      await page.locator('#new-attempt').dispatchEvent('click');
      await focused('input-error');
      assert.match(await text('input-error'), /limit/i);
      assert.equal(await text('history-proof'), retained);
      await page.locator('#settings-form').dispatchEvent('submit');
      assert.match(await text('input-error'), /phase|limit/i);
      assert.equal(await text('history-proof'), retained);
      await observe('seventh attempt rejected without eviction; six full traces retained');
      await page.locator('#current-detail').evaluate((node) => { node.open = true; });
      await page.locator('#history-detail').evaluate((node) => { node.open = true; });
      await reset();
      await observe('explicit reset clears native forms, errors, details, evidence and counters');

      await page.locator('#observe-routes').dispatchEvent('click');
      await focused('input-error');
      assert.match(await text('input-error'), /phase/);
      assert.deepEqual(await rows('trace-rows'), []);
      await observe('out-of-order action focuses alert without mutation');
      await reset();
      await page.locator('#target').evaluate((node) => {
        const option = document.createElement('option');
        option.value = '999';
        option.textContent = 'Invalid injected enum';
        node.append(option);
        node.value = '999';
      });
      await press('request-change');
      await focused('target');
      assert.equal(await page.locator('#target').getAttribute('aria-invalid'), 'true');
      assert.match(await text('input-error'), /target/);
      assert.equal(await text('phase'), 'Phase: idle');
      assert.match(await text('totals'), /Attempted: 0/);
      await observe('invalid injected enum focused field and was rejected atomically');
      await page.locator('#target option[value="999"]').evaluate((node) => node.remove());
      await reset();
      await press('request-change');
      await page.locator('#settings-form').dispatchEvent('submit');
      await focused('input-error');
      assert.match(await text('input-error'), /phase/);
      assert.equal((await rows('trace-rows')).length, 1);
      assert.match(await text('totals'), /Attempted: 1/);
      await press('observe-routes');
      await page.locator('#observe-routes').dispatchEvent('click');
      assert.match(await text('input-error'), /phase/);
      assert.equal((await rows('trace-rows')).length, 2);
      await observe('repeated request and observation do not duplicate evidence');
      await reset();

      await settings({ target: '50', propagation: 'missing', old: 'loss' });
      await execute('FAILURE');
      assert.equal(await text('convergence'), 'Convergence: UNKNOWN');
      assert.equal(await text('journeys'), 'Journeys: success 0 · failure 4 · unknown 4');
      await observe('known FAILURE dominates UNKNOWN while both journey counts remain visible');
      await reset();
      await settings({ propagation: 'missing' });
      await execute('FAILURE');
      assert.equal(await text('convergence'), 'Convergence: FAILURE');
      assert.equal(await text('journeys'), 'Journeys: success 4 · failure 0 · unknown 4');
      await observe('known target mismatches dominate missing cohort evidence');
      await prediction('FAILURE', 'CORRECT');
      await page.locator('#release-old').dispatchEvent('click');
      assert.equal(await page.locator('#input-error').isVisible(), true);
      await page.reload({ waitUntil: 'load' });
      await defaults();
      assert.match(await text('totals'), /Attempted: 0/);
      await observe('reload clears all memory-only evidence, predictions and errors');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#request-change').focus();
      proof.narrowViewport = await page.evaluate(() => ({
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        visibleKeyboardFocus: getComputedStyle(document.activeElement).outlineStyle !== 'none'
          && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3,
      }));
      assert.equal(proof.narrowViewport.bodyOverflow, false);
      assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
      assert.deepEqual(proof.pageErrors, []);
      assert.deepEqual(proof.consoleErrors, []);
      assert.deepEqual(proof.exerciseNetworkRequests, []);
      stage = 'csp-probes';
      proof.csp = await page.evaluate(async () => {
        globalThis.__s087Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s087Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s087InlineRan = true';
        document.body.append(script);
        let connection;
        try { await fetch('http://127.0.0.1:9/s087-csp-probe'); connection = 'unexpected response'; }
        catch (error) { connection = error.name; }
        return { inlineRan: globalThis.__s087InlineRan === true, connection };
      });
      await page.waitForFunction(() => globalThis.__s087Violations.length >= 2);
      proof.csp.violations = await page.evaluate(() => globalThis.__s087Violations);
      assert.equal(proof.csp.inlineRan, false);
      assert.equal(proof.csp.connection, 'TypeError');
      assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
      assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
      assert.deepEqual(proof.probeResponses, []);
      assert.deepEqual(proof.pageErrors, []);
      proof.outcome = 'PASS';
    } catch (error) {
      failure = error;
      proof.error = { name: error.name, message: error.message, stack: error.stack };
    } finally {
      if (session) {
        try {
          await session.close();
          proof.cleanup.closeAwaited = true;
          proof.cleanup.closed = session.page.isClosed();
        } catch (error) {
          failure = failure || error;
          proof.outcome = 'FAIL';
          proof.cleanup.error = error.message;
        }
      }
      proof.completedAtUtc = new Date().toISOString();
      if (capture) fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
    }
    if (!capture) assert.deepEqual(hashes(), before, 'Ordinary browser verification must be read-only.');
    if (failure) throw failure;
    assert.equal(proof.cleanup.closeAwaited, true);
    assert.equal(proof.cleanup.closed, true);
  });
