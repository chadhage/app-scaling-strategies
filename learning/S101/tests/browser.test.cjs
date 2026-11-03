'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex'), helperSHA256);
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwrightVersion, '1.56.1');
assert.match(process.version, /^v22\./);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const label = process.env.BROWSER_EVIDENCE_LABEL || 'browser';
if (capture && !/^[a-z][a-z0-9-]{0,40}$/.test(label)) throw new Error('Invalid deliberate capture label.');

test('actual isolated DOM, keyboard, negative/unknown, error/reset/failure and CSP observations', async () => {
  const target = path.join(lesson, 'evidence', `${label}.json`);
  if (capture && fs.existsSync(target)) throw new Error('Append-only browser evidence already exists.');
  const observations = [];
  const screenshots = [];
  const consoleErrors = [];
  const pageErrors = [];
  const startedAtUtc = new Date().toISOString();
  let phase = 'initial';
  let session;
  let closed = false;
  let passed = false;
  let failure = null;
  let browserVersion;
  try {
    session = await openIsolatedLesson(path.join('learning', 'S101', 'index.html'));
    browserVersion = session.browserVersion;
    assert.match(browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push({ phase, message: message.text() });
    });
    async function press(id, key = 'Enter') {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    }
    async function measure(condition) {
      await page.locator('#condition').selectOption(condition);
      await press('switch-backend');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'measure-journeys');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'result-panel');
    }
    async function dom() {
      return page.evaluate(() => {
        const value = (id) => document.getElementById(id).textContent;
        return {
          outcome: document.getElementById('outcome').dataset.outcome,
          verifier: value('verifier'), userImpact: value('user-impact'), cleanup: value('cleanup-status'),
          status: value('operator-status'), counts: Object.fromEntries(
            ['attempted', 'successful', 'interrupted', 'unknown', 'not-transitioned']
              .map((id) => [id, value(id)])),
          callers: document.getElementById('caller-results').textContent,
          history: [...document.querySelectorAll('#history > li')].map((item) => ({
            runId: item.dataset.runId, outcome: item.dataset.outcome, text: item.textContent,
          })),
          focused: document.activeElement.id,
          errorVisible: !document.getElementById('error-panel').hidden,
          error: value('error-panel'), learnerCheck: value('learner-check'),
          learnerVerdict: document.getElementById('learner-check').dataset.verdict,
        };
      });
    }
    async function step(id, execute) {
      phase = id;
      const result = await execute();
      observations.push({ id, passed: true, observation: result });
      console.log(`Observed ${id}`);
    }
    async function screenshot(name) {
      if (!capture) return;
      const relative = path.join('evidence', 'raw', `${label}-${name}.png`);
      const absolute = path.join(lesson, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      if (fs.existsSync(absolute)) throw new Error('Append-only screenshot already exists.');
      await page.screenshot({ path: absolute, fullPage: true });
      const bytes = fs.readFileSync(absolute);
      screenshots.push({ path: relative, bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
    await step('initial-banner-and-empty-denominator', async () => {
      assert.equal(await page.locator('#training-banner').textContent(),
        'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.title(), 'S101 — Stable getProfile endpoint');
      const result = await dom();
      assert.equal(result.counts.attempted, '0');
      assert.match(await page.locator('#denominator').textContent(), /Empty sample/);
      assert.equal(await page.locator('#measure-journeys').isDisabled(), true);
      return result;
    });
    await step('keyboard-tab-enter-positive-journey', async () => {
      await page.locator('#condition').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'switch-backend');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.locator('#expected-outcome').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-outcome');
      await page.keyboard.press('Enter');
      const result = await dom();
      assert.equal(result.outcome, 'positive');
      assert.equal(result.verifier, 'pass');
      assert.equal(result.counts.successful, '2');
      assert.equal(result.learnerVerdict, 'matched');
      assert.match(result.callers, /release-blue-17 → release-green-42/);
      assert.match(result.callers, /profile\.v1 → profile\.v1/);
      assert.match(result.callers, /55 ms \/ 100 ms/);
      return result;
    });
    for (const condition of ['breaking-contract', 'authentication-loss', 'navigation-loss',
      'endpoint-change', 'over-budget']) {
      await step(`negative-${condition}`, async () => {
        await page.reload();
        await measure(condition);
        await page.locator('#expected-outcome').selectOption('negative');
        await press('check-outcome', 'Space');
        const result = await dom();
        assert.equal(result.outcome, 'negative');
        assert.equal(result.verifier, 'fail');
        assert.equal(result.userImpact, 'Interrupted transition');
        assert.equal(result.counts.interrupted, '2');
        assert.equal(result.counts.successful, '0');
        assert.equal(result.learnerVerdict, 'matched');
        assert.match(result.callers, /HTTP status200 → 200/);
        assert.match(result.callers, /release-blue-17 → release-green-42/);
        if (condition === 'breaking-contract') await screenshot('negative');
        return result;
      });
    }
    await step('configured-route-is-not-observed-migration', async () => {
      await page.reload(); await measure('stale-route');
      const result = await dom();
      assert.equal(result.outcome, 'not-transitioned');
      assert.equal(result.counts['not-transitioned'], '2');
      assert.equal(result.counts.successful, '0');
      assert.match(result.status, /configured backend green/);
      assert.match(result.callers, /release-blue-17 → release-blue-17/);
      return result;
    });
    await step('unknown-completion-remains-in-denominator', async () => {
      await page.reload(); await measure('missing-observation');
      await page.locator('#expected-outcome').selectOption('unknown');
      await press('check-outcome');
      const result = await dom();
      assert.equal(result.outcome, 'unknown');
      assert.equal(result.verifier, 'unverified');
      assert.deepEqual(result.counts, {
        attempted: '2', successful: '1', interrupted: '0', unknown: '1', 'not-transitioned': '0',
      });
      assert.equal(result.learnerVerdict, 'matched');
      await screenshot('unknown');
      return result;
    });
    await step('rollback-and-native-form-reset-retain-failure', async () => {
      await page.reload(); await measure('breaking-contract');
      const failed = await dom();
      await press('restore-blue', 'Space');
      assert.match((await dom()).status, /configured backend blue/);
      await page.locator('#expected-outcome').selectOption('negative');
      await press('reset-rehearsal');
      const reset = await dom();
      assert.equal(reset.outcome, 'unmeasured');
      assert.equal(reset.focused, 'condition');
      assert.equal(reset.errorVisible, false);
      assert.equal(await page.locator('#condition').inputValue(), 'compatible');
      assert.equal(await page.locator('#expected-outcome').inputValue(), 'positive');
      assert.equal(await page.evaluate(() => typeof document.getElementById('operator-controls').reset), 'function');
      assert.deepEqual(reset.history, failed.history);
      assert.equal(reset.counts.interrupted, '2');
      await screenshot('reset-retained-failure');
      await measure('compatible');
      const later = await dom();
      assert.equal(later.counts.attempted, '4');
      assert.equal(later.counts.successful, '2');
      assert.equal(later.counts.interrupted, '2');
      assert.deepEqual(later.history.slice(0, 1), failed.history);
      return { failed, reset, later };
    });
    await step('invalid-input-error-focus-no-mutation-and-reset', async () => {
      await page.reload();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = '<img src=x onerror=alert(1)>'; option.textContent = 'Invalid test option';
        document.getElementById('condition').append(option);
      });
      await page.locator('#condition').selectOption('<img src=x onerror=alert(1)>');
      await press('switch-backend');
      const rejected = await dom();
      assert.equal(rejected.focused, 'error-panel');
      assert.equal(rejected.errorVisible, true);
      assert.match(rejected.error, /^ERR_LESSON_INPUT:/);
      assert.equal(rejected.counts.attempted, '0');
      assert.equal(rejected.history.length, 0);
      assert.equal(await page.locator('img').count(), 0);
      await screenshot('input-error');
      await press('reset-rehearsal');
      assert.equal(await page.locator('#condition').inputValue(), 'compatible');
      assert.equal((await dom()).errorVisible, false);
      await measure('compatible');
      await page.locator('#expected-outcome').selectOption('negative');
      await press('check-outcome');
      assert.equal((await dom()).learnerVerdict, 'mismatch');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'unknown-type'; option.textContent = 'Invalid prediction';
        const select = document.getElementById('expected-outcome');
        select.append(option); select.value = option.value;
      });
      await press('check-outcome');
      const invalidPrediction = await dom();
      assert.match(invalidPrediction.error, /^ERR_LESSON_INPUT:/);
      assert.equal(invalidPrediction.counts.successful, '2');
      await press('reset-rehearsal');
      assert.equal((await dom()).errorVisible, false);
      return { rejected, invalidPrediction, reset: await dom() };
    });
    await step('actual-eight-run-limit-retains-all-started-journeys', async () => {
      await page.reload();
      for (let index = 0; index < 8; index += 1) {
        await measure('compatible');
        if (index < 7) await press('reset-rehearsal');
      }
      await press('reset-rehearsal');
      const result = await dom();
      assert.match(result.error, /^ERR_LESSON_LIMIT:/);
      assert.equal(result.focused, 'error-panel');
      assert.equal(result.history.length, 8);
      assert.equal(result.counts.attempted, '16');
      assert.equal(result.counts.successful, '16');
      return result;
    });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    await step('enforced-csp-inline-foreign-script-connect-and-form-blocks', async () => {
      await page.reload();
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'tests/csp-probe.js';
        document.head.append(script);
      });
      await page.waitForFunction(() => window.__s101CspProbe && window.__s101CspProbe.done);
      const probe = await page.evaluate(() => ({
        ...window.__s101CspProbe, forbiddenInlineRan: window.__s101ForbiddenInlineRan,
      }));
      assert.equal(probe.forbiddenInlineRan, false);
      assert.equal(probe.fetchRejected, true);
      for (const [directive, uri] of [
        ['script-src', 'inline'], ['script-src', 'https://blocked.training.invalid/rehearsal-probe.js'],
        ['connect-src', 'https://blocked.training.invalid/connection-probe'],
        ['form-action', 'https://blocked.training.invalid/form-probe'],
      ]) {
        const originOnly = uri === 'inline' ? 'inline' : new URL(uri).origin;
        assert.ok(probe.violations.some((event) => event.effectiveDirective.startsWith(directive)
          && [uri, originOnly, `${originOnly}/`].includes(event.blockedURI)
          && event.disposition === 'enforce'), `${directive}: ${uri}`);
      }
      return probe;
    });
    await step('actual-load-failure-has-no-live-fallback-and-recovers', async () => {
      await page.route('**/model.js', (route) => route.abort('failed'));
      await page.reload();
      assert.match(await page.locator('#error-panel').textContent(), /Lesson model unavailable.*no live fallback/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error-panel');
      assert.equal(await page.locator('#switch-backend').isDisabled(), true);
      await screenshot('load-failure');
      const failureDOM = await dom();
      await page.unroute('**/model.js');
      await page.reload();
      assert.equal(await page.locator('#switch-backend').isDisabled(), false);
      assert.equal((await dom()).errorVisible, false);
      return { failed: failureDOM, recovered: await dom() };
    });
    assert.deepEqual(pageErrors, []);
    assert.ok(consoleErrors.every((entry) => entry.phase.startsWith('enforced-csp')
      ? /Content Security Policy|Refused|violates/i.test(entry.message)
      : entry.phase.startsWith('actual-load-failure') && /Failed to load resource|ERR_FAILED/i.test(entry.message)));
    passed = true;
  } catch (error) {
    failure = { name: error.name, message: error.message };
    throw error;
  } finally {
    try {
      if (session) { await session.close(); closed = true; }
    } finally {
      if (capture) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${JSON.stringify({
          schemaVersion: 1, cardId: 'A-S101', packet: 'SC-S101', mode: 'local-synthetic',
          deliberateCapture: true, startedAtUtc, endedAtUtc: new Date().toISOString(),
          passed: passed && closed, failure, browserVersion, playwrightVersion, nodeVersion: process.version,
          helperSHA256, helperPublication: '53c0c0d', lifecycleQualified: false,
          closeAwaitedInFinally: closed, observations, screenshots, pageErrors, consoleErrors,
          limits: 'This observed session is not unattended lifecycle qualification, native Azure proof, production Node24 or source-parent certification.',
        }, null, 2)}\n`);
      }
    }
  }
});
