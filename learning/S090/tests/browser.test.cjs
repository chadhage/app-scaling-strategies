'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, canonical } = require('.\\provenance.cjs');
const { FIXTURES } = require('..\\model.js');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha(fs.readFileSync(helper)), helperHash, 'Only the authorized published helper is allowed.');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
function hashes() {
  const result = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else result[path.relative(root, file)] = sha(fs.readFileSync(file));
    }
  }
  walk(root);
  return result;
}

test('actual isolated DOM: retirement gates, measured results, keyboard, errors, history/reset, bounds and enforced CSP',
  { timeout: 210000 }, async () => {
    const before = capture ? null : hashes();
    const proof = {
      cardId: 'A-S090', workerId: 'worker-A-S090', mode: 'synthetic', outcome: 'FAIL',
      entry: 'learning\\S090\\index.html', runtime: process.version, playwrightVersion,
      startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
      helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
      testedSourceHashes: Object.fromEntries([
        '.gitattributes', 'index.html', 'theme.js', 'styles.css', 'model.js', 'app.js',
        'manifest.json', 'README.md', 'retirement.feature', 'tests\\model.test.cjs',
        'tests\\surface.test.cjs', 'tests\\provenance.cjs', 'tests\\capture.cjs',
        'tests\\integrity.test.cjs', 'tests\\browser.test.cjs',
      ].map((file) => [file, sha(canonical(read(file)))])),
      groups: [], observations: [], pageErrors: [], consoleErrors: [],
      exerciseNetworkRequests: [], probeNetworkRequests: [], probeResponses: [],
      screenshots: [], cleanup: {}, retirementIsTeachingTraceOnly: true,
      nativeDrainRetentionRetirementCertified: false, productionNode24Validated: false,
    };
    let session;
    let failure;
    let stage = 'exercise';
    try {
      assert.equal(process.version, 'v22.23.4');
      assert.equal(playwrightVersion, '1.56.1');
      if (capture) for (const file of ['browser.json', 'browser-failure.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Deliberate capture may not overwrite evidence.');
      }
      session = await openIsolatedLesson('learning\\S090\\index.html');
      proof.browserVersion = session.browserVersion;
      assert.match(session.browserVersion, /^156\./);
      const page = session.page;
      page.on('pageerror', (error) => proof.pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
      });
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeNetworkRequests).push(request.url());
      });
      page.on('response', (response) => {
        if (/^https?:/.test(response.url()) && stage === 'csp-probes') proof.probeResponses.push(response.url());
      });
      await page.route(/^https?:/, (route) => route.abort('blockedbyclient'));
      await page.setViewportSize({ width: 1100, height: 950 });
      await page.reload({ waitUntil: 'load' });
      const text = (id) => page.locator(`#${id}`).textContent();
      const current = async () => JSON.parse(await text('current-proof'));
      const totals = () => text('totals');
      const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
      const press = async (id, key = 'Enter') => {
        await page.locator(`#${id}`).focus();
        await page.keyboard.press(key);
      };
      const observe = async (name) => {
        proof.groups.push(name);
        proof.observations.push({
          name, phase: await text('phase'), outcome: await text('outcome'), decision: await text('decision'),
          verifier: await text('verifier'), capacity: await text('capacity'), blockers: await text('blockers'),
          unknowns: await text('unknowns'), impact: await text('impact'), totals: await totals(),
          historyCount: await text('history-count'), prediction: await text('prediction-result'),
          error: await text('input-error'), activeElement: await page.evaluate(() => document.activeElement.id),
          current: (await text('current-proof')).startsWith('{') ? await current() : null,
          history: (await text('history-proof')).startsWith('[') ? JSON.parse(await text('history-proof')) : [],
        });
      };
      const defaults = async () => {
        assert.equal(await text('phase'), 'Lesson: idle');
        assert.equal(await text('outcome'), 'Latest attempt: NOT_ATTEMPTED');
        assert.equal(await text('decision'), 'Decision: NOT_CHECKED');
        assert.equal(await text('verifier'), 'Safety verifier: NOT_CHECKED');
        assert.equal(await text('capacity'), 'Synthetic old capacity: not evaluated');
        assert.equal(await totals(), 'Retirement attempts: 0 · success 0 · failure 0 · unknown 0');
        assert.equal(await text('history-count'), 'Archived rehearsals: 0 / 4 · active 0');
        assert.equal(await text('prediction-result'), 'No prediction checked.');
        assert.equal(await text('current-proof'), 'No rehearsal started.');
        assert.equal(await text('history-proof'), 'No archived rehearsals.');
        for (const [id, value] of Object.entries({ fixture: 'all-dependencies', action: 'attempt-retirement', prediction: '' })) {
          assert.equal(await page.locator(`#${id}`).inputValue(), value);
        }
        assert.equal(await page.locator('#start-lesson').isEnabled(), true);
        for (const id of ['action', 'apply-action', 'prediction', 'check-prediction', 'new-rehearsal']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
        }
        assert.equal(await page.locator('#input-error').isHidden(), true);
        assert.equal(await text('input-error'), '');
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
        for (const id of ['current-detail', 'history-detail']) {
          assert.equal(await page.locator(`#${id}`).evaluate((node) => node.open), false);
        }
        for (const id of ['inventory-rows', 'trace-rows', 'history-rows']) {
          assert.equal(await page.locator(`#${id} tr`).count(), 0);
        }
        for (const id of ['fixture-form', 'action-form', 'prediction-form']) {
          assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function', id);
        }
      };
      const reset = async () => {
        await press('reset-lesson', 'Space');
        await focused('fixture');
        await defaults();
      };
      const start = async (fixture) => {
        await page.locator('#fixture').selectOption(fixture);
        await press('start-lesson');
        await focused('action');
        assert.deepEqual((await current()).inventory, FIXTURES[fixture]);
        assert.equal(await page.locator('#fixture').isDisabled(), true);
        assert.equal(await page.locator('#new-rehearsal').isDisabled(), true);
      };
      const act = async (action) => {
        await page.locator('#action').selectOption(action);
        await press('apply-action');
      };
      const attempted = async (outcome, blockers, unknown = []) => {
        await act('attempt-retirement');
        const state = await current();
        assert.equal(state.lastAttempt.outcome, outcome);
        assert.deepEqual(state.lastAttempt.blockers, blockers);
        assert.deepEqual(state.lastAttempt.unknown, unknown);
        assert.equal(state.lastAttempt.verifier, 'PASS');
        assert.equal(state.migrationCertified, false);
        assert.equal(state.oldCapacity, outcome === 'SUCCESS' ? 'RETIRED_IN_TRACE' : 'AVAILABLE');
        assert.equal(state.lastAttempt.decision, outcome === 'SUCCESS' ? 'SIMULATED_RETIRED'
          : outcome === 'UNKNOWN' ? 'HELD_UNVERIFIED' : 'REJECTED');
        assert.equal(await page.locator('#input-error').isHidden(), true);
        return state;
      };
      const archive = async () => {
        await press('new-rehearsal');
        if (!(await page.locator('#fixture').isDisabled())) await focused('fixture');
        assert.equal(await text('phase'), 'Lesson: idle');
        assert.equal(await text('current-proof'), 'No rehearsal started.');
      };
      const invalidAtomic = async (operation, message) => {
        const oldCurrent = await text('current-proof');
        const oldHistory = await text('history-proof');
        const oldTotals = await totals();
        await operation();
        assert.match(await text('input-error'), message);
        await focused('input-error');
        assert.equal(await text('current-proof'), oldCurrent);
        assert.equal(await text('history-proof'), oldHistory);
        assert.equal(await totals(), oldTotals);
      };
      assert.match(await page.title(), /S090/);
      assert.equal(await text('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      await defaults();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      assert.ok((await page.locator('.skip-link').boundingBox()).y >= 0);
      await page.keyboard.press('Enter');
      await focused('controls');
      await page.keyboard.press('Tab');
      await focused('fixture');
      await page.keyboard.press('Tab');
      await focused('start-lesson');
      await page.keyboard.press('Enter');
      await focused('action');
      await observe('Keyboard Tab skip link and Enter start; empty samples are not success');

      await invalidAtomic(() => act('drain-users'), /Stop observed new admissions/);
      await invalidAtomic(() => act('transfer-ownership'), /Finish observed work/);
      await observe('Out-of-order drain and ownership commands reject atomically with focused alert');
      await attempted('FAILURE', ['new-admissions', 'pinned-users', 'pending-work', 'state-ownership', 'rollback-retention']);
      assert.equal(await totals(), 'Retirement attempts: 1 · success 0 · failure 1 · unknown 0');
      assert.equal((await current()).inventory.users, 2);
      assert.match(await text('impact'), /No interrupted journeys are injected/);
      if (capture) {
        await page.screenshot({ path: path.join(root, 'evidence', 'browser-failure.png'), fullPage: true });
        proof.screenshots.push('browser-failure.png');
      }
      await observe('Early retirement FAILURE safely rejected; all five dependencies and old capacity retained');

      await page.locator('#prediction').selectOption('SUCCESS');
      await press('check-prediction');
      assert.equal(await text('prediction-result'), 'Not correct: chose SUCCESS; observed FAILURE at attempt 1.');
      assert.equal(await totals(), 'Retirement attempts: 1 · success 0 · failure 1 · unknown 0');
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      await attempted('FAILURE', ['new-admissions', 'pinned-users', 'pending-work', 'state-ownership', 'rollback-retention']);
      await invalidAtomic(() => press('check-prediction'), /Choose SUCCESS, FAILURE or UNKNOWN/);
      assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
      await page.locator('#prediction').selectOption('FAILURE');
      await press('check-prediction');
      assert.equal(await text('prediction-result'), 'Correct: chose FAILURE; observed FAILURE at attempt 2.');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      await observe('Wrong and empty predictions visible; valid correction clears errors without changing attempts');

      for (const action of ['stop-admission', 'drain-users', 'finish-work', 'transfer-ownership']) await act(action);
      assert.equal((await current()).lifecycle, 'RETAINED');
      await attempted('FAILURE', ['rollback-retention']);
      await act('advance-tick');
      assert.equal((await current()).tick, 1);
      await attempted('FAILURE', ['rollback-retention']);
      await act('advance-tick');
      const firstRun = await attempted('SUCCESS', []);
      assert.equal(firstRun.tick, 2);
      assert.equal(firstRun.attempts.length, 5);
      assert.equal(await totals(), 'Retirement attempts: 5 · success 1 · failure 4 · unknown 0');
      assert.equal(await page.locator('#apply-action').isDisabled(), true);
      await focused('new-rehearsal');
      await observe('Observed drain does not expire retention; equality at tick two permits teaching-only SUCCESS and retains four failures');
      await invalidAtomic(async () => {
        await page.locator('#action-fields').evaluate((node) => { node.disabled = false; });
        await page.locator('#apply-action').evaluate((node) => { node.disabled = false; });
        await press('apply-action');
      }, /teaching trace is retired/);
      await observe('Forged retired cleanup control still hits strict state guard');
      await archive();
      assert.deepEqual(JSON.parse(await text('history-proof'))[0], firstRun);

      await start('unobserved');
      await attempted('UNKNOWN', [], ['new-admissions', 'pinned-users', 'pending-work', 'state-ownership', 'rollback-retention']);
      assert.equal(await totals(), 'Retirement attempts: 6 · success 1 · failure 4 · unknown 1');
      assert.equal(await page.locator('#inventory-rows').getByText('HELD · unknown', { exact: true }).count(), 5);
      await page.locator('#prediction').selectOption('UNKNOWN');
      await press('check-prediction');
      assert.match(await text('prediction-result'), /^Correct:/);
      if (capture) {
        await page.screenshot({ path: path.join(root, 'evidence', 'browser-unknown.png'), fullPage: true });
        proof.screenshots.push('browser-unknown.png');
      }
      await observe('Missing inventory UNKNOWN held without false zero; earlier failures retained in history');
      await invalidAtomic(async () => {
        await page.locator('#action').evaluate((node) => {
          const option = document.createElement('option');
          option.value = 'retire-real-resource';
          option.textContent = 'Injected invalid token';
          node.append(option);
          node.value = option.value;
        });
        await press('apply-action');
      }, /seven synthetic actions/);
      assert.equal(await page.locator('#action').getAttribute('aria-invalid'), 'true');
      await page.locator('#action option[value="retire-real-resource"]').evaluate((node) => node.remove());
      await act('observe-inventory');
      assert.deepEqual((await current()).inventory, FIXTURES.ready);
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      await attempted('SUCCESS', []);
      await observe('Injected action enum rejected; named synthetic observation alone resolves unknown fields');
      await archive();

      await start('mixed-unknown');
      await attempted('FAILURE', ['pending-work'], ['new-admissions', 'pinned-users', 'state-ownership', 'rollback-retention']);
      await act('observe-inventory');
      assert.equal((await current()).inventory.work, 1);
      await attempted('FAILURE', ['pending-work']);
      await act('finish-work');
      await attempted('SUCCESS', []);
      await observe('Known work FAILURE dominates UNKNOWN; observation cannot erase known work');
      await archive();
      await start('ready');
      await attempted('SUCCESS', []);
      await archive();
      const retained = JSON.parse(await text('history-proof'));
      assert.equal(retained.length, 4);
      assert.deepEqual(retained[0], firstRun);
      assert.equal(retained[1].attempts[0].outcome, 'UNKNOWN');
      assert.equal(retained[2].attempts[0].outcome, 'FAILURE');
      assert.equal(await totals(), 'Retirement attempts: 11 · success 4 · failure 6 · unknown 1');
      assert.equal(await page.locator('#start-lesson').isDisabled(), true);
      await invalidAtomic(async () => {
        await page.locator('#fixture-fields').evaluate((node) => { node.disabled = false; });
        await page.locator('#start-lesson').evaluate((node) => { node.disabled = false; });
        await press('start-lesson');
      }, /Four rehearsals are retained/);
      await observe('Four complete histories preserve all denominators; forged fifth start rejects without eviction');
      await page.locator('#current-detail').evaluate((node) => { node.open = true; });
      await page.locator('#history-detail').evaluate((node) => { node.open = true; });
      await reset();
      await observe('Explicit Space reset clears all history, errors, predictions, defaults and expanded details');

      for (const [fixture, blocker] of Object.entries({
        'traffic-only': 'new-admissions', 'users-only': 'pinned-users', 'work-only': 'pending-work',
        'ownership-only': 'state-ownership', 'retention-only': 'rollback-retention',
      })) {
        await start(fixture);
        await attempted('FAILURE', [blocker]);
        assert.deepEqual((await current()).inventory, FIXTURES[fixture]);
        await observe(`Independent ${fixture} guard rejects and retains required capacity`);
        await reset();
      }
      await invalidAtomic(async () => {
        await page.locator('#fixture').evaluate((node) => {
          const option = document.createElement('option');
          option.value = '__proto__';
          option.textContent = 'Injected invalid fixture';
          node.append(option);
          node.value = option.value;
        });
        await press('start-lesson');
      }, /named synthetic inventory fixtures/);
      assert.equal(await page.locator('#fixture').getAttribute('aria-invalid'), 'true');
      await page.locator('#fixture option[value="__proto__"]').evaluate((node) => node.remove());
      await reset();
      await observe('Injected prototype fixture rejected in actual DOM; reset removes invalid markers');

      await start('all-dependencies');
      for (let index = 0; index < 6; index++) {
        await attempted('FAILURE', ['new-admissions', 'pinned-users', 'pending-work', 'state-ownership', 'rollback-retention']);
      }
      assert.equal(await page.locator('#apply-action').isDisabled(), true);
      await invalidAtomic(async () => {
        await page.locator('#apply-action').evaluate((node) => { node.disabled = false; });
        await press('apply-action');
      }, /Six retirement attempts are retained/);
      for (const action of ['stop-admission', 'drain-users', 'finish-work', 'transfer-ownership', 'advance-tick', 'advance-tick']) await act(action);
      assert.equal((await current()).lifecycle, 'RETAINED');
      assert.equal((await current()).oldCapacity, 'AVAILABLE');
      assert.ok((await current()).trace.length <= 14);
      await invalidAtomic(() => act('advance-tick'), /known two-tick/);
      await invalidAtomic(() => act('stop-admission'), /old-admission dependency greater than zero/);
      assert.equal(await totals(), 'Retirement attempts: 6 · success 0 · failure 6 · unknown 0');
      await observe('Six-attempt bound and repeated resolved actions reject atomically without deleting failures');
      await reset();

      await page.setViewportSize({ width: 360, height: 800 });
      await page.locator('#current-detail').evaluate((node) => { node.open = true; });
      await page.locator('#history-detail').evaluate((node) => { node.open = true; });
      await reset();
      proof.narrowViewport = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement);
        return {
          bodyOverflow: document.documentElement.scrollWidth > window.innerWidth,
          activeElement: document.activeElement.id,
          visibleKeyboardFocus: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
        };
      });
      assert.equal(proof.narrowViewport.bodyOverflow, false);
      assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
      await observe('Narrow viewport has no body overflow and visible keyboard/reset focus');
      await start('ready');
      await attempted('SUCCESS', []);
      await page.reload({ waitUntil: 'load' });
      await defaults();
      await observe('Reload deliberately clears memory-only history; native form.reset remains callable');
      const originalURL = page.url();
      proof.themes = {};
      for (const theme of ['dark', 'light']) {
        const themeURL = new URL(originalURL);
        themeURL.searchParams.set('clawpilotTheme', theme);
        await page.goto(themeURL.href, { waitUntil: 'load' });
        proof.themes[theme] = await page.evaluate(() => ({
          name: document.documentElement.dataset.theme,
          background: getComputedStyle(document.body).backgroundColor,
          palette: getComputedStyle(document.documentElement).getPropertyValue('--cp-bg').trim(),
        }));
        assert.equal(proof.themes[theme].name, theme);
      }
      assert.equal(proof.themes.dark.palette, '#3d3b3a');
      assert.equal(proof.themes.light.palette, '#f7f4ef');
      assert.notEqual(proof.themes.dark.background, proof.themes.light.background);
      await observe('Actual light/dark theme detection and token styles load before lesson code');

      assert.deepEqual(proof.pageErrors, []);
      assert.deepEqual(proof.consoleErrors, []);
      assert.deepEqual(proof.exerciseNetworkRequests, []);
      stage = 'csp-probes';
      const probeURL = page.url();
      await page.evaluate(async () => {
        window.__s090Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s090Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        window.__s090Inline = false;
        window.__s090Handler = false;
        const script = document.createElement('script');
        script.textContent = 'window.__s090Inline = true';
        document.body.append(script);
        const button = document.createElement('button');
        button.setAttribute('onclick', 'window.__s090Handler = true');
        button.textContent = 'CSP probe only';
        document.body.append(button);
        button.click();
        const style = document.createElement('style');
        style.textContent = 'body { --s090-inline-style: applied; }';
        document.head.append(style);
        const frame = document.createElement('iframe');
        frame.src = 'https://synthetic.invalid/frame';
        document.body.append(frame);
        const form = document.createElement('form');
        form.action = 'https://synthetic.invalid/form';
        document.body.append(form);
        form.submit();
        try { await fetch('https://synthetic.invalid/connection'); window.__s090Connection = 'unexpected success'; }
        catch (error) { window.__s090Connection = error.name; }
        window.__s090ProbeNodes = [script, button, style, frame, form];
      });
      await page.waitForFunction(() => window.__s090Violations.length >= 6);
      proof.csp = await page.evaluate(() => ({
        inlineRan: window.__s090Inline, handlerRan: window.__s090Handler,
        inlineStyle: getComputedStyle(document.body).getPropertyValue('--s090-inline-style'),
        connection: window.__s090Connection, violations: window.__s090Violations,
      }));
      assert.equal(proof.csp.inlineRan, false);
      assert.equal(proof.csp.handlerRan, false);
      assert.equal(proof.csp.inlineStyle, '');
      assert.equal(proof.csp.connection, 'TypeError');
      for (const prefix of ['script-src', 'style-src', 'connect-src', 'frame-src', 'form-action']) {
        assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith(prefix)), prefix);
      }
      assert.equal(page.url(), probeURL);
      assert.deepEqual(proof.probeNetworkRequests, []);
      assert.deepEqual(proof.probeResponses, []);
      assert.deepEqual(proof.pageErrors, []);
      await page.evaluate(() => window.__s090ProbeNodes.forEach((node) => node.remove()));
      await observe('Actual CSP blocks inline script/handler/style, connection, frame and form navigation; zero external requests');
      proof.outcome = 'PASS';
    } catch (error) {
      failure = error;
      proof.failure = { name: error.name, message: error.message, stack: error.stack };
    } finally {
      if (session) {
        proof.cleanup.closeAwaited = true;
        try { await session.close(); proof.cleanup.closed = true; }
        catch (error) {
          proof.cleanup.closed = false;
          proof.cleanup.error = error.message;
          proof.outcome = 'FAIL';
          failure = failure ? new AggregateError([failure, error], 'Browser checks and awaited cleanup failed') : error;
        }
      }
      proof.completedAtUtc = new Date().toISOString();
      if (!capture) {
        assert.deepEqual(hashes(), before, 'Normal browser verification is read-only for every owned source and evidence byte.');
        proof.normalVerificationOwnedBytesUnchanged = true;
      } else {
        fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
      }
    }
    if (failure) throw failure;
    console.log(`Actual Edge ${proof.browserVersion}: ${proof.groups.length} observed groups; awaited close; ${capture ? 'deliberate proof captured' : 'owned bytes unchanged'}.`);
  });
