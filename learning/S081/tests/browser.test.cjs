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

test('actual isolated DOM: lifecycle gates, keyboard, failure/unknown, errors, retained history, reset and enforced CSP',
  { timeout: 210000 }, async () => {
    const proof = {
      cardId: 'A-S081', workerId: 'worker-A-S081', mode: 'synthetic', outcome: 'FAIL',
      entry: 'learning\\S081\\index.html', runtime: process.version, playwrightVersion,
      startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
      helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
      testedSourceHashes: Object.fromEntries(['.gitattributes', 'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js',
        'manifest.json', 'README.md', 'lifecycle.feature', 'tests\\model.test.cjs', 'tests\\surface.test.cjs',
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
      if (capture) for (const file of ['browser.json', 'browser-routing-failure.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Capture cannot overwrite prior evidence.');
      }
      session = await openIsolatedLesson('learning\\S081\\index.html');
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
          name, phase: await text('phase'), desired: await text('desired-state'), observed: await text('observed-state'),
          outcome: await text('outcome'), gateCounts: await text('gate-counts'), routing: await text('routing-metrics'),
          totals: await text('attempt-totals'), learning: await text('prediction-result'),
          error: await page.locator('#input-error').textContent(), gates: await rows('gate-rows'),
          timeline: await rows('trace-rows'), history: await rows('history-rows'),
          currentEvidence: await page.locator('#current-proof').textContent(),
          activeElement: await page.evaluate(() => document.activeElement.id),
        });
      };
      const defaults = async (retained = 0) => {
        assert.equal(await text('phase'), 'Phase: idle');
        assert.equal(await text('desired-state'), 'Desired: NOT_STARTED');
        assert.equal(await text('observed-state'), 'Observed: NOT_STARTED');
        assert.equal(await text('outcome'), 'Result: NOT_DECIDED');
        assert.equal(await text('gate-counts'), 'Current gate checks: success 0 · failure 0 · unknown 0');
        assert.equal(await page.locator('#current-proof').textContent(), 'No attempt started.');
        assert.equal(await text('prediction-result'), 'Learning prediction not checked.');
        assert.equal(await text('routing-metrics'), 'Routing: not evaluated at current gate');
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), false);
        assert.equal(await page.locator('#start-candidate').isEnabled(), true);
        for (const [id, expected] of Object.entries({ ...fixtures.defaults, prediction: '' })) {
          assert.equal(await page.locator(`#${id}`).inputValue(), expected, id);
        }
        for (const id of ['observe-state', 'request-next', 'prediction', 'check-prediction', 'new-attempt']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
        }
        assert.equal(await page.locator('#input-error').isHidden(), true);
        assert.equal(await page.locator('#input-error').textContent(), '');
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
        assert.deepEqual(await rows('gate-rows'), []);
        assert.deepEqual(await rows('trace-rows'), []);
        for (const form of ['settings-form', 'prediction-form']) {
          assert.equal(await page.locator(`#${form}`).evaluate((node) => typeof node.reset), 'function');
        }
        assert.equal(await text('history-count'), `Retained complete traces: ${retained} / 6`);
        assert.equal((await rows('history-rows')).length, retained);
        for (const id of ['current-detail', 'retained-detail']) {
          assert.equal(await page.locator(`#${id}`).evaluate((node) => node.open), false);
        }
        if (!retained) assert.equal(await page.locator('#retained-proof').textContent(), '');
      };
      const reset = async () => {
        await press('reset-lesson', 'Space');
        await focused('start-candidate');
        await defaults();
        assert.equal(await text('attempt-totals'), 'Retained attempts: 0 · success 0 · failure 0 · unknown 0');
      };
      const settings = async (values = {}) => {
        for (const [id, choice] of Object.entries(values)) await page.locator(`#${id}`).selectOption(choice);
      };
      const execute = async (expected) => {
        await press('start-candidate');
        await focused('observe-state');
        assert.equal(await text('desired-state'), 'Desired: CREATED');
        assert.equal(await text('observed-state'), 'Observed: UNOBSERVED');
        assert.equal(await text('outcome'), 'Result: NOT_DECIDED');
        assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), true);
        const transitions = [];
        for (let count = 0; count < 16; count++) {
          const phase = await text('phase');
          if (phase === 'Phase: awaiting') {
            const before = await text('observed-state');
            const desired = await text('desired-state');
            await press('observe-state', 'Space');
            transitions.push({ desired, before, after: await text('observed-state'), outcome: await text('outcome') });
          } else if (phase === 'Phase: advanced') {
            const before = await text('observed-state');
            await focused('request-next');
            await press('request-next');
            await focused('observe-state');
            assert.equal(await text('observed-state'), before, 'Request must not advance observed state.');
            assert.equal(await text('outcome'), 'Result: NOT_DECIDED');
          } else break;
        }
        assert.equal(await text('phase'), 'Phase: decided');
        assert.equal(await text('outcome'), `Result: ${expected}`);
        await focused('prediction');
        assert.equal(await page.locator('#observe-state').isDisabled(), true);
        assert.equal(await page.locator('#request-next').isDisabled(), true);
        return transitions;
      };
      const retain = async (prediction) => {
        const previous = (await rows('history-rows')).length;
        await page.locator('#prediction').selectOption(prediction);
        await press('check-prediction');
        assert.equal(await text('phase'), 'Phase: checked');
        assert.equal((await rows('history-rows')).length, previous + 1);
        await focused(previous < 5 ? 'new-attempt' : 'reset-lesson');
      };
      const next = async (values = {}) => {
        const history = await rows('history-rows');
        const totals = await text('attempt-totals');
        const retained = await page.locator('#retained-proof').textContent();
        await press('new-attempt');
        await focused('start-candidate');
        await defaults(history.length);
        assert.deepEqual(await rows('history-rows'), history);
        assert.equal(await text('attempt-totals'), totals);
        assert.equal(await page.locator('#retained-proof').textContent(), retained);
        await settings(values);
      };
      const screenshot = async (file) => {
        if (capture) {
          const relative = `evidence\\${file}`;
          await page.screenshot({ path: path.join(root, relative), fullPage: true });
          proof.screenshots.push(relative);
        }
      };

      await defaults();
      await page.keyboard.press('Tab');
      await focused('skip-main');
      await page.keyboard.press('Enter');
      await focused('main');
      await observe('Tab skip link and Enter focus the lesson');
      const transitions = await execute('SUCCESS');
      assert.equal(transitions.length, 8);
      assert.deepEqual(transitions.map((entry) => entry.after.replace('Observed: ', '')), fixtures.states);
      assert.equal(await text('desired-state'), 'Desired: RETIRED');
      assert.equal(await text('observed-state'), 'Observed: RETIRED');
      assert.equal((await rows('trace-rows')).length, 16);
      await observe('eight observed gates; request intent alone never advances state');
      await press('check-prediction');
      assert.match(await text('input-error'), /choose SUCCESS, FAILURE or UNKNOWN/);
      assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
      await focused('prediction');
      assert.equal((await rows('history-rows')).length, 0);
      await observe('empty prediction rejected atomically with focused field error');
      await retain('SUCCESS');

      await next({ routing: 'partial' });
      await execute('FAILURE');
      assert.equal(await text('desired-state'), 'Desired: ACTIVE');
      assert.equal(await text('observed-state'), 'Observed: CANARY');
      assert.equal(await text('routing-metrics'), 'Routing percent: desired 100 · effective 60');
      assert.equal(await text('legacy-warm'), 'Legacy warm: true — never a gate');
      await observe('warm true cannot bypass partial routing FAILURE 100/60');
      await screenshot('browser-routing-failure.png');
      await retain('SUCCESS');
      assert.equal(await text('prediction-result'), 'Prediction SUCCESS: incorrect; actual FAILURE.');

      await next({ drain: 'remaining' });
      await execute('FAILURE');
      assert.equal(await text('desired-state'), 'Desired: RETAINED');
      assert.equal(await text('observed-state'), 'Observed: DRAINING');
      const drainRows = await rows('gate-rows');
      for (const [name, value] of [['Remaining clients', '2'], ['Remaining work', '1'], ['Remaining ownership holders', '1']]) {
        assert.ok(drainRows.some((row) => row[0] === name && row[1] === value && row[3] === 'FAILURE'));
      }
      await observe('warm true cannot bypass drain clients/work/ownership FAILURE');
      await retain('FAILURE');

      await next({ retention: 'open' });
      await execute('FAILURE');
      assert.equal(await text('desired-state'), 'Desired: RETIRED');
      assert.equal(await text('observed-state'), 'Observed: RETAINED');
      await observe('rollback retention deadline blocks retirement FAILURE');
      await retain('FAILURE');

      await next({ endpoint: 'missing' });
      await execute('UNKNOWN');
      assert.equal(await text('observed-state'), 'Observed: UNOBSERVED');
      assert.ok((await rows('gate-rows')).some((row) => row[1] === 'unknown' && row[3] === 'UNKNOWN'));
      await observe('missing endpoint UNKNOWN is not a completed migration');
      await screenshot('browser-unknown.png');
      await retain('UNKNOWN');

      await next({ endpoint: 'missing', epoch: 'stale' });
      await execute('FAILURE');
      assert.equal(await text('gate-counts'), 'Current gate checks: success 1 · failure 1 · unknown 1');
      await observe('known stale epoch FAILURE dominates missing endpoint at same gate');
      await retain('UNKNOWN');
      assert.equal(await text('attempt-totals'), 'Retained attempts: 6 · success 1 · failure 4 · unknown 1');
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      const retained = await page.locator('#retained-proof').textContent();
      const history = await rows('history-rows');
      await page.locator('#new-attempt').evaluate((node) => node.dispatchEvent(new Event('click', { bubbles: true })));
      assert.match(await text('input-error'), /Six retained attempts/);
      await focused('input-error');
      assert.deepEqual(await rows('history-rows'), history);
      assert.equal(await page.locator('#retained-proof').textContent(), retained);
      await observe('seventh attempt rejected without evicting complete history or failed denominator');
      await reset();
      await observe('explicit reset clears inputs, evidence, errors, predictions, history and counters');

      for (const [values, expected, target, name] of [
        [{ readiness: 'stale' }, 'FAILURE', 'READY', 'stale readiness FAILURE'],
        [{ readiness: 'insufficient' }, 'FAILURE', 'READY', 'capacity compatibility health FAILURE'],
        [{ routing: 'missing' }, 'UNKNOWN', 'CANARY', 'missing routing UNKNOWN'],
        [{ drain: 'missing' }, 'UNKNOWN', 'DRAINING', 'missing drain UNKNOWN'],
        [{ retention: 'missing' }, 'UNKNOWN', 'RETAINED', 'missing retention UNKNOWN'],
      ]) {
        await settings(values);
        await execute(expected);
        assert.equal(await text('desired-state'), `Desired: ${target}`);
        await observe(name);
        await reset();
      }
      await page.locator('#epoch').evaluate((select) => {
        select.add(new Option('Injected invalid choice', 'not-an-epoch'));
        select.value = 'not-an-epoch';
      });
      await press('start-candidate');
      assert.match(await text('input-error'), /Invalid input: epoch/);
      await focused('epoch');
      assert.equal(await page.locator('#epoch').getAttribute('aria-invalid'), 'true');
      assert.equal(await text('phase'), 'Phase: idle');
      assert.equal(await text('outcome'), 'Result: NOT_DECIDED');
      await observe('invalid injected enum rejected with focused field and unchanged state');
      await reset();
      await page.locator('#observe-state').evaluate((node) => node.dispatchEvent(new Event('click', { bubbles: true })));
      assert.match(await text('input-error'), /Phase idle/);
      await focused('input-error');
      assert.equal(await text('phase'), 'Phase: idle');
      await observe('out-of-order observation rejected with alert and unchanged state');
      await reset();
      await press('start-candidate');
      await press('observe-state', 'Space');
      const beforeRepeat = await rows('trace-rows');
      await page.locator('#observe-state').evaluate((node) => node.dispatchEvent(new Event('click', { bubbles: true })));
      assert.match(await text('input-error'), /Phase advanced/);
      assert.deepEqual(await rows('trace-rows'), beforeRepeat);
      await observe('repeated observation rejected without duplicate lifecycle effect');
      await reset();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#start-candidate').focus();
      proof.narrowViewport = await page.evaluate(() => ({
        width: innerWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth,
        visibleKeyboardFocus: getComputedStyle(document.activeElement).outlineStyle !== 'none'
          && parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0,
      }));
      assert.equal(proof.narrowViewport.bodyOverflow, false);
      assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
      await execute('SUCCESS');
      await retain('SUCCESS');
      await page.locator('#retained-detail').evaluate((node) => { node.open = true; });
      await page.reload({ waitUntil: 'load' });
      await defaults();
      assert.equal(await text('attempt-totals'), 'Retained attempts: 0 · success 0 · failure 0 · unknown 0');
      await observe('narrow viewport visible keyboard focus and reload clears memory');

      stage = 'csp-probes';
      proof.csp = await page.evaluate(async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        globalThis.__s081InlineProbe = false;
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s081InlineProbe = true;';
        document.head.append(script);
        let connection;
        try { await fetch('http://127.0.0.1:1/s081-csp-probe'); connection = 'unexpected success'; }
        catch (error) { connection = error.name; }
        await new Promise((resolve) => setTimeout(resolve, 100));
        script.remove();
        return { inlineRan: globalThis.__s081InlineProbe, connection, violations };
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
