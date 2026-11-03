'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repository = path.resolve(__dirname, '..', '..', '..');
const lessonRoot = path.resolve(__dirname, '..');
const helperPath = path.join(repository, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helperPath)), helperSha256, 'Only the published helper is qualified for this check');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated browser: POST ambiguity, keyboard, errors, history, reset and CSP', { timeout: 120000 }, async (t) => {
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const observations = {};
  const pageErrors = [];
  const consoleErrors = [];
  const externalRoutes = [];
  let session;
  let browserVersion;
  let failureDOM;
  let failureImage;
  let finalDOM;
  let closed = false;
  async function check(name, work) {
    await t.test(name, async () => {
      try {
        await work();
        checks.push({ name, passed: true });
      } catch (error) {
        checks.push({ name, passed: false, error: error.message });
        throw error;
      }
    });
    assert.equal(checks.at(-1)?.passed, true, `Browser check failed: ${name}`);
  }
  try {
    session = await openIsolatedLesson(path.join('learning', 'S049', 'index.html'));
    browserVersion = session.browserVersion;
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (/^https?:/i.test(url)) {
        externalRoutes.push(url);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const text = (id) => page.locator(`#${id}`).textContent();
    const focus = () => page.evaluate(() => document.activeElement.id);
    const snapshot = () => page.evaluate(() => ({
      effects: document.getElementById('effect-count').textContent,
      units: document.getElementById('total-units').textContent,
      posts: document.getElementById('post-count').textContent,
      client: document.getElementById('client-result').textContent,
      clock: document.getElementById('clock').textContent,
      outcome: document.getElementById('outcome').textContent,
      reasons: document.getElementById('reasons').textContent,
      trace: [...document.querySelectorAll('#trace > li')].map((row) => row.textContent),
      history: [...document.querySelectorAll('#history > li > p')].map((row) => row.textContent),
      historyCount: document.getElementById('history-count').textContent,
    }));
    async function choosePrediction(value) {
      await page.locator('#prediction').selectOption(value);
      await page.locator('#check-prediction').click();
    }
    async function newAttempt() {
      await page.locator('#new-attempt').click();
      assert.equal(await focus(), 'deduplication');
      assert.equal(await page.locator('#retry-key').inputValue(), 'same');
    }
    async function conduct() {
      await page.locator('#commit-post').click();
      await page.locator('#retry-post').click();
    }
    await check('portable source and exact banner load with intact native controls', async () => {
      assert.equal(await page.title(), 'S049 — Ambiguous POST completion');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(await page.locator('header').textContent(), /D-S049.*A-S049.*SC-S049/s);
      assert.equal(await page.locator('#retry-post').isDisabled(), true);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.evaluate(() => typeof document.getElementById('controls').reset), 'function');
      assert.match(await page.locator('#limits-title').locator('..').textContent(), /No native HTTP.*is established/s);
      observations.initial = await snapshot();
    });
    await check('keyboard-only same-key replay preserves one effect and the correct client result', async () => {
      await page.locator('#deduplication').focus();
      for (const id of ['retry-key', 'retry-payload', 'retry-response', 'retry-after', 'deadline', 'commit-post']) {
        await page.keyboard.press('Tab');
        assert.equal(await focus(), id);
      }
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'retry-post');
      assert.equal(await text('effect-count'), '1');
      assert.equal(await text('client-result'), 'unresolved');
      assert.equal(await text('outcome'), 'Not assessed');
      assert.equal(await page.locator('#retry-key').isDisabled(), true);
      observations.ambiguous = await snapshot();
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'prediction');
      assert.equal(await text('outcome'), 'SUCCESS');
      assert.equal(await text('effect-count'), '1');
      assert.match(await text('client-result'), /synth-effect-1, 10 units/);
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#prediction').inputValue(), 'success');
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'check-prediction');
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'new-attempt');
      assert.match(await text('prediction-feedback'), /Correct prediction.*SUCCESS/);
      assert.equal(await page.locator('#history > li').count(), 1);
      observations.safe = await snapshot();
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'deduplication');
      assert.equal(await page.locator('#history > li').count(), 1);
    });
    await check('invalid numeric, enum and phase actions show focused errors without state mutation', async () => {
      const before = await snapshot();
      for (const invalid of ['', '-1', '0.5', '1001', '1e2']) {
        await page.locator('#retry-after').fill(invalid);
        await page.locator('#commit-post').click();
        assert.equal(await page.locator('#error').isVisible(), true);
        assert.equal(await focus(), 'error');
        assert.match(await text('error'), /retryAfterMs/);
        assert.deepEqual(await snapshot(), before);
      }
      await page.locator('#retry-after').fill('30');
      await page.locator('#deadline').fill('0');
      await page.locator('#commit-post').click();
      assert.match(await text('error'), /deadlineMs/);
      assert.deepEqual(await snapshot(), before);
      await page.locator('#deadline').fill('100');
      await page.evaluate(() => { document.getElementById('retry-key').value = 'unregistered-real-key'; });
      await page.locator('#commit-post').click();
      assert.match(await text('error'), /retryKey/);
      assert.deepEqual(await snapshot(), before);
      await page.locator('#retry-key').selectOption('same');
      await page.evaluate(() => document.getElementById('retry-post').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await text('error'), /requires ambiguous/);
      assert.deepEqual(await snapshot(), before);
      observations.guarded = { visibleError: await text('error'), unchanged: true };
    });
    await check('unsafe duplicate retry fails, cannot recommit, and prediction cannot turn it green', async () => {
      await page.locator('#deduplication').selectOption('none');
      await page.locator('#commit-post').click();
      assert.equal(await page.locator('#error').isHidden(), true);
      const committed = await snapshot();
      await page.evaluate(() => document.getElementById('controls').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await text('error'), /requires configure/);
      assert.deepEqual(await snapshot(), committed);
      await page.locator('#retry-post').click();
      assert.equal(await text('effect-count'), '2');
      assert.equal(await text('total-units'), '20');
      assert.equal(await text('outcome'), 'FAILURE');
      const beforePrediction = await snapshot();
      await page.locator('#check-prediction').click();
      assert.match(await text('error'), /Choose success/);
      assert.deepEqual(await snapshot(), beforePrediction);
      await choosePrediction('success');
      assert.match(await text('prediction-feedback'), /did not match.*FAILURE/);
      assert.equal(await page.locator('#history > li').count(), 2);
      assert.deepEqual((await snapshot()).history.slice(0, 1), observations.safe.history);
      observations.duplicate = await snapshot();
      if (capture) {
        failureDOM = await page.content();
        failureImage = await page.screenshot({ fullPage: true });
      }
    });
    await check('changed payload and missing key reject explicitly while preserving one effect', async () => {
      await newAttempt();
      await page.locator('#retry-payload').selectOption('changed');
      await conduct();
      assert.equal(await text('effect-count'), '1');
      assert.equal(await text('outcome'), 'FAILURE');
      assert.equal(await text('client-result'), 'rejected-conflict');
      assert.match((await snapshot()).trace.join(' '), /409.*conflict/);
      await choosePrediction('failure');
      observations.conflict = await snapshot();
      await newAttempt();
      await page.locator('#retry-key').selectOption('missing');
      await conduct();
      assert.equal(await text('effect-count'), '1');
      assert.equal(await text('client-result'), 'rejected-missing-key');
      assert.equal(await text('outcome'), 'FAILURE');
      await choosePrediction('failure');
      observations.missingKey = await snapshot();
    });
    await check('another lost response is visibly unknown, not successful completion', async () => {
      await newAttempt();
      await page.locator('#retry-response').selectOption('lost');
      await conduct();
      assert.equal(await text('effect-count'), '1');
      assert.equal(await text('client-result'), 'unresolved');
      assert.equal(await text('outcome'), 'UNKNOWN');
      assert.match(await text('reasons'), /explicitly unresolved/);
      await choosePrediction('unknown');
      observations.unknown = await snapshot();
    });
    await check('new key and original-deadline breach dominate ambiguity; six results are not evicted', async () => {
      await newAttempt();
      await page.locator('#retry-key').selectOption('new');
      await page.locator('#retry-response').selectOption('lost');
      await page.locator('#retry-after').fill('101');
      await conduct();
      assert.equal(await text('effect-count'), '2');
      assert.equal(await text('client-result'), 'unresolved');
      assert.equal(await text('outcome'), 'FAILURE');
      assert.equal(await text('clock'), '101 / 100 synthetic ms');
      assert.match(await text('reasons'), /Duplicate.*deadline/s);
      await choosePrediction('failure');
      assert.equal(await page.locator('#history > li').count(), 6);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#history-limit').isVisible(), true);
      assert.equal(await focus(), 'reset-lesson');
      const full = await snapshot();
      await page.evaluate(() => document.getElementById('new-attempt').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await text('error'), /Six results retained/);
      assert.deepEqual(await snapshot(), full);
      observations.fullHistory = full;
    });
    await check('keyboard reset restores exact defaults; the inclusive deadline also succeeds in the DOM', async () => {
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'deduplication');
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.equal(await page.locator('#history > li').count(), 0);
      assert.equal(await text('effect-count'), '0');
      assert.equal(await page.locator('#deduplication').inputValue(), 'atomic');
      assert.equal(await page.locator('#retry-key').inputValue(), 'same');
      assert.equal(await page.locator('#retry-payload').inputValue(), 'same');
      assert.equal(await page.locator('#retry-response').inputValue(), 'received');
      assert.equal(await page.locator('#retry-after').inputValue(), '30');
      assert.equal(await page.locator('#deadline').inputValue(), '100');
      await page.locator('#retry-after').fill('100');
      await conduct();
      assert.equal(await text('clock'), '100 / 100 synthetic ms');
      assert.equal(await text('outcome'), 'SUCCESS');
      observations.inclusiveDeadline = await snapshot();
    });
    await check('actual CSP blocks inline code and connection; no network route or JS error occurs', async () => {
      await page.evaluate(async () => {
        window.__s049Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s049Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const probe = document.createElement('script');
        probe.id = 's049-csp-probe';
        probe.textContent = 'window.__s049InlineExecuted = true;';
        document.body.append(probe);
        try {
          await fetch('https://s049.invalid/csp-probe');
          window.__s049Connection = 'unexpectedly allowed';
        } catch { window.__s049Connection = 'blocked'; }
        probe.remove();
      });
      await page.waitForFunction(() => window.__s049Violations.some((event) => event.directive.startsWith('script-src'))
        && window.__s049Violations.some((event) => event.directive === 'connect-src'));
      observations.csp = await page.evaluate(() => ({
        inlineExecuted: window.__s049InlineExecuted === true,
        connection: window.__s049Connection, violations: window.__s049Violations,
      }));
      assert.equal(observations.csp.inlineExecuted, false);
      assert.equal(observations.csp.connection, 'blocked');
      assert.equal(externalRoutes.length, 0, 'CSP, not the extra test route guard, must block the connection');
      assert.deepEqual(pageErrors, []);
      assert.ok(consoleErrors.every((message) => /Content Security Policy|content security policy|violates.*directive/.test(message)));
    });
    await check('final keyboard reset clears ledger, trace, prediction and history, including at a narrow viewport', async () => {
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'deduplication');
      assert.deepEqual(await snapshot(), observations.initial);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await text('prediction-feedback'), '');
      assert.equal(await page.locator('#history-limit').isHidden(), true);
      assert.equal(await page.locator('#retry-post').isDisabled(), true);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      observations.finalReset = await snapshot();
      if (capture) finalDOM = await page.content();
    });
  } finally {
    if (session) {
      await session.close();
      closed = true;
    }
  }
  assert.equal(closed, true);
  assert.ok(checks.every((entry) => entry.passed));
  if (capture) {
    const evidence = path.join(lessonRoot, 'evidence');
    let number = 1;
    while (fs.existsSync(path.join(evidence, `browser-${String(number).padStart(3, '0')}.json`))) number += 1;
    const prefix = `browser-${String(number).padStart(3, '0')}`;
    const sourceFiles = ['model.js', 'lesson.js', 'index.html', 'styles.css', 'manifest.json',
      'README.md', 'ambiguous-post.feature', path.join('tests', 'model.test.cjs'),
      path.join('tests', 'surface.test.cjs'), path.join('tests', 'integrity.test.cjs'),
      path.join('tests', 'browser.test.cjs')];
    const assets = [
      [`${prefix}-failure.dom.txt`, Buffer.from(failureDOM)],
      [`${prefix}-failure.png`, failureImage],
      [`${prefix}-reset.dom.txt`, Buffer.from(finalDOM)],
    ];
    for (const [name, bytes] of assets) fs.writeFileSync(path.join(evidence, name), bytes, { flag: 'wx' });
    const record = {
      cardId: 'A-S049', workerId: 'worker-A-S049', mode: 'synthetic',
      startedAtUtc, completedAtUtc: new Date().toISOString(), captureOptIn: 'CAPTURE_BROWSER_EVIDENCE=1',
      node: process.version, playwright: require(require.resolve('playwright/package.json',
        { paths: [path.dirname(helperPath)] })).version,
      browserVersion, helper: path.relative(repository, helperPath), helperSha256,
      helperPublication: '53c0c0d', lifecycle: 'openIsolatedLesson; awaited close in finally',
      abandonedPrototypeUsed: false, unattendedLifecycleCertified: false, closed,
      checks, observations, pageErrors, consoleErrors, externalRoutes,
      sourceBindings: sourceFiles.map((name) => ({ path: name, sha256: hash(fs.readFileSync(path.join(lessonRoot, name))) })),
      assets: assets.map(([name, bytes]) => ({ path: name, sha256: hash(bytes) })),
      actualHttpOrAzureResult: 'unknown; portable synthetic model only',
    };
    fs.writeFileSync(path.join(evidence, `${prefix}.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    t.diagnostic(`Deliberate evidence capture: learning\\S049\\evidence\\${prefix}.json`);
  } else t.diagnostic('Read-only browser verification; retained evidence was not written.');
});
