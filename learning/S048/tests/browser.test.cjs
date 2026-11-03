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
const normalized = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM, keyboard, errors, false completion, history, exact reset and enforced CSP', { timeout: 180000 }, async () => {
  const proof = {
    schemaVersion: 1, cardId: 'A-S048', workerId: 'worker-A-S048', mode: 'synthetic',
    startedAtUtc: new Date().toISOString(), runtime: process.version, playwrightVersion,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    entry: 'learning\\S048\\index.html', captureExplicitlyEnabled: capture,
    outcome: 'FAIL', browserVersion: null, observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], cleanup: {},
    testedSourceHashes: Object.fromEntries(['index.html', 'styles.css', 'model.js', 'app.js', path.join('tests', 'browser.test.cjs')]
      .map((file) => [file, sha(normalized(fs.readFileSync(path.join(root, file))))])),
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(playwrightVersion, '1.56.1');
    session = await openIsolatedLesson('learning\\S048\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(proof.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests).push(request.url());
      }
    });
    await page.reload({ waitUntil: 'load' });
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        job: await page.locator('#job-status').innerText(),
        verdict: await page.locator('#verdict').innerText(),
        progress: await page.locator('#progress').innerText(),
        metrics: await page.locator('#metrics').textContent(),
        itemEffects: await page.locator('#item-effects tr').evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
        checks: await page.locator('#checks tr').evaluateAll((rows) =>
          rows.map((row) => ({ id: row.dataset.check, cells: [...row.cells].map((cell) => cell.textContent) }))),
        history: await page.locator('#history tr').evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
        prediction: await page.locator('#prediction-result').innerText(),
        alert: await page.locator('#input-error').textContent(),
        trace: await page.locator('#trace').innerText(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const defaults = {
      retirement: 'checkpoint', checkpoint: 'durable-current', effects: 'idempotent',
      observation: 'complete', resumeDelayMs: '20', budgetMs: '100',
    };
    const configure = async (changes = {}) => {
      const values = { ...defaults, ...changes };
      for (const id of ['retirement', 'checkpoint', 'effects', 'observation']) {
        await page.locator(`#${id}`).selectOption(values[id]);
      }
      await page.locator('#resume-delay-ms').fill(values.resumeDelayMs);
      await page.locator('#budget-ms').fill(values.budgetMs);
    };
    const completeByKeyboard = async () => {
      const previous = await page.locator('#history tr[data-attempt]').count();
      await page.locator('#start-job').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'retire-worker');
      assert.equal(await page.locator('#configuration').evaluate((node) => node.disabled), true);
      assert.equal(await page.locator('#checkpoint').isDisabled(), true);
      assert.equal(await page.locator('#budget-ms').isDisabled(), true);
      assert.equal(await page.locator('#verify-job').isDisabled(), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'verify-job');
      assert.equal(await page.locator('#history tr[data-attempt]').count(), previous);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: complete');
      assert.equal(await page.locator('#history tr[data-attempt]').count(), previous + 1);
    };
    const predict = async (expected) => {
      await page.locator('#prediction').selectOption(expected);
      await page.locator('#prediction').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
      await page.keyboard.press('Space');
      assert.match(await page.locator('#prediction-result').innerText(), /Prediction verifier: PASS/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'new-attempt');
    };
    const next = async () => {
      const previous = await page.locator('#history tr[data-attempt]').count();
      await page.locator('#new-attempt').click();
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator('#verdict').innerText(), 'Not verified.');
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#checks tr').count(), 0);
      assert.equal(await page.locator('#history tr[data-attempt]').count(), previous);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
    };
    const exactReset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start-job');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator('#job-status').innerText(), 'Job: not-started');
      assert.equal(await page.locator('#verdict').innerText(), 'Not verified.');
      assert.equal(await page.locator('#progress').innerText(), 'No job started.');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#history-limit').isHidden(), true);
      assert.equal(await page.locator('#configuration').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#metrics').textContent(), '');
      assert.equal(await page.locator('#checks tr').count(), 0);
      assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
      assert.equal(await page.locator('#history').innerText(), 'No completed attempts.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      const values = await page.locator('#rehearsal-form').evaluate((form) => Object.fromEntries(new FormData(form).entries()));
      assert.deepEqual(values, defaults);
      assert.equal(await page.locator('#rehearsal-form').evaluate((form) => typeof form.reset), 'function');
    };

    assert.match(await page.title(), /S048.*Batch job retirement/);
    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    await page.locator('#verify-job').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires retired/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
    for (const invalid of ['', '-1', '1.5', '1e2', ' 20', '020', '1001', '<svg/onload=1>']) {
      await page.locator('#resume-delay-ms').fill(invalid);
      await page.locator('#start-job').click();
      assert.match(await page.locator('#input-error').innerText(), /Resume delay: enter a whole number/);
      assert.equal(await page.locator('#resume-delay-ms').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'resume-delay-ms');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator('#verdict').innerText(), 'Not verified.');
      assert.equal(await page.locator('svg').count(), 0);
    }
    await page.locator('#resume-delay-ms').fill('20');
    for (const invalid of ['0', '2001', '1e2', '100 ']) {
      await page.locator('#budget-ms').fill(invalid);
      await page.locator('#start-job').click();
      assert.match(await page.locator('#input-error').innerText(), /Original budget: enter a whole number/);
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
    }
    await configure();
    await page.locator('#checkpoint').evaluate((select) => {
      const option = document.createElement('option');
      option.value = 'forged';
      option.textContent = 'forged';
      select.append(option);
      select.value = 'forged';
    });
    await page.locator('#start-job').click();
    assert.match(await page.locator('#input-error').innerText(), /Invalid configuration/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
    await observe('strict input and state guards, no stale success');
    await page.locator('#checkpoint option[value="forged"]').evaluate((option) => option.remove());
    await configure();

    await page.locator('#start-job').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'retire-worker');
    assert.equal(await page.locator('#checkpoint').isDisabled(), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'verify-job');
    assert.equal(await page.locator('#job-status').innerText(), 'Job: resumable-not-complete');
    assert.match(await page.locator('#progress').innerText(), /3 remaining/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
    assert.equal(await page.locator('#verdict').innerText(), 'Not verified.');
    await observe('durable checkpoint is resumable, not complete');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#verdict').innerText(), /PASSED.*completed-correctly/);
    assert.equal(await page.locator('#checks tr').count(), 5);
    assert.match(await page.locator('#metrics').innerText(), /80 \/ 100/);
    assert.deepEqual(await page.locator('#item-effects tr td:last-child').allTextContents(), ['1', '1', '1', '1', '1', '1']);
    await predict('passed');
    await observe('correct bounded continuation, separate prediction PASS');

    const cases = [
      ['stale checkpoint duplicate effects', { checkpoint: 'durable-stale', effects: 'repeat' }, 'failed', /80 \/ 60/],
      ['local-only checkpoint loses unfinished items', { checkpoint: 'local-only' }, 'failed', /4, 5, 6/],
      ['false completion retains missing work', { retirement: 'false-complete' }, 'failed', /Falsely declared complete\s*yes/],
      ['forced retirement cannot resume', { retirement: 'force' }, 'failed', /4, 5, 6/],
      ['unobserved checkpoint stays unknown', { checkpoint: 'unobserved' }, 'unknown', /unknown \/ 60/],
      ['unobserved final effects stay unknown', { observation: 'unobserved' }, 'unknown', /unknown \/ 60/],
      ['finish before retirement needs no checkpoint', { retirement: 'finish', checkpoint: 'unobserved', effects: 'repeat', resumeDelayMs: '1000' }, 'passed', /60 \/ 100/],
    ];
    for (const [name, changes, verdict, metrics] of cases) {
      await next();
      await configure(changes);
      await completeByKeyboard();
      assert.match(await page.locator('#verdict').innerText(), new RegExp(verdict.toUpperCase()));
      assert.match(await page.locator('#metrics').innerText(), metrics);
      if (verdict === 'unknown') {
        assert.deepEqual(await page.locator('#item-effects tr td:last-child').allTextContents(), Array(6).fill('unknown'));
      }
      await predict(verdict);
      await observe(name);
    }
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 8);
    assert.match(await page.locator('#history tr[data-attempt="2"]').innerText(), /FAILED \/ interrupted/);
    assert.match(await page.locator('#history tr[data-attempt="6"]').innerText(), /UNKNOWN \/ unverified/);
    await next();
    assert.equal(await page.locator('#start-job').isDisabled(), true);
    await page.locator('#rehearsal-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /History limit/);
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 8);
    await observe('eighth result retained; ninth attempt blocked, not evicted');

    await exactReset();
    await configure({ observation: 'unobserved', resumeDelayMs: '100', budgetMs: '100' });
    await completeByKeyboard();
    assert.match(await page.locator('#verdict').innerText(), /FAILED.*interrupted/);
    assert.match(await page.locator('#checks tr[data-check="budget"]').innerText(), /FAIL.*160 ms/);
    assert.match(await page.locator('#checks tr[data-check="effects"]').innerText(), /UNKNOWN/);
    await predict('failed');
    await observe('known budget breach fails while effect proof remains unknown');
    await next();
    await configure({ checkpoint: 'durable-stale' });
    await completeByKeyboard();
    assert.match(await page.locator('#verdict').innerText(), /PASSED/);
    assert.match(await page.locator('#metrics').innerText(), /100 \/ 100/);
    assert.match(await page.locator('#checks tr[data-check="effects"]').innerText(), /PASS.*0 duplicate effects/);
    await observe('stale checkpoint with idempotent effects passes inclusive original budget');

    await exactReset();
    await page.locator('#start-job').focus();
    await page.keyboard.press('Enter');
    await exactReset();
    await page.locator('#start-job').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await exactReset();
    await observe('exact keyboard reset from completed, active and retired phases');
    await page.setViewportSize({ width: 375, height: 812 });
    proof.smallViewport = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
    }));
    assert.equal(proof.smallViewport.noPageHorizontalOverflow, true);
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.consoleErrors, []);

    stage = 'csp-probes';
    await page.evaluate(async () => {
      globalThis.__s048InlineRan = false;
      globalThis.__s048Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s048Violations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s048InlineRan = true;';
      document.head.append(script);
      try {
        await fetch('http://127.0.0.1:9/s048-csp-probe');
        globalThis.__s048FetchRejected = false;
      } catch {
        globalThis.__s048FetchRejected = true;
      }
    });
    await page.waitForFunction(() => globalThis.__s048Violations.length >= 2);
    proof.csp = await page.evaluate(() => ({
      inlineExecuted: globalThis.__s048InlineRan,
      fetchRejected: globalThis.__s048FetchRejected,
      violations: globalThis.__s048Violations,
    }));
    assert.equal(proof.csp.inlineExecuted, false);
    assert.equal(proof.csp.fetchRejected, true);
    assert.ok(proof.csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src')));
    assert.ok(proof.csp.violations.some((entry) => entry.effectiveDirective === 'connect-src'));
    assert.ok(proof.csp.violations.every((entry) => entry.disposition === 'enforce'));
    assert.deepEqual(proof.pageErrors, []);
    assert.ok(proof.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
    proof.outcome = 'PASS';
  } catch (error) {
    proof.failure = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        proof.cleanup.sessionCloseAwaited = true;
      }
    } catch (error) {
      proof.outcome = 'FAIL';
      proof.cleanup.closeError = error.message;
      throw error;
    } finally {
      proof.cleanup.serversStarted = 0;
      proof.cleanup.foregroundLeaseUsed = false;
      proof.completedAtUtc = new Date().toISOString();
      if (capture) fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
    }
  }
});
