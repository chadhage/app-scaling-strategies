'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fs, path, root, repo, read, sha, helperPath, helperSha256, testedHashes } = require('./provenance.cjs');

test('actual isolated Edge checks DOM, keyboard, conflict/epoch/unknown, errors, history, reset and CSP', { timeout: 120000 }, async () => {
  assert.equal(sha(fs.readFileSync(path.join(repo, helperPath))), helperSha256);
  const { openIsolatedLesson } = require(path.join(repo, helperPath));
  const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
  const screenshots = ['evidence\\browser-desktop.png', 'evidence\\browser-narrow.png'];
  if (capture) {
    for (const file of ['evidence\\browser.json', ...screenshots]) {
      assert.equal(fs.existsSync(path.join(root, file)), false, 'Deliberate capture never overwrites evidence');
    }
  }
  const proof = {
    cardId: 'A-S085', workerId: 'worker-A-S085', parentId: 'D-S085', packet: 'SC-S085',
    mode: 'synthetic', outcome: 'PASS', captureExplicitlyEnabled: capture,
    startedAtUtc: new Date().toISOString(), runtime: process.version,
    playwrightVersion: require(path.join(repo, 'testing\\browser\\node_modules\\playwright\\package.json')).version,
    helper: { path: helperPath, sha256: helperSha256, publication: '53c0c0d' },
    testedSourceHashes: testedHashes(), observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeResponses: [], screenshots,
    cleanup: { closeAwaited: false, closed: false },
    actualConcurrentControllerLockEpochPromotionCertification: false,
    nativeSourceParentCompleted: false, productionNode24Validated: false,
  };
  const observe = (name, value) => proof.observations.push({ name, value });
  let stage = 'exercise';
  let session;
  const images = [];
  try {
    session = await openIsolatedLesson('learning\\S085\\index.html');
    proof.browserVersion = session.browserVersion;
    const page = session.page;
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^(https?|wss?):/.test(request.url())) proof.exerciseNetworkRequests.push({ stage, url: request.url() });
    });
    page.on('response', (response) => {
      if (!response.url().startsWith('file:')) proof.probeResponses.push({ stage, url: response.url(), status: response.status() });
    });
    await page.reload({ waitUntil: 'load' });
    const text = (selector) => page.locator(selector).textContent();
    const focus = () => page.evaluate(() => document.activeElement.id);
    async function unchangedOther() {
      assert.deepEqual(await page.locator('tbody tr').nth(1).locator('td').allTextContents(),
        ['observer', '40', 'purple-v4', '0']);
    }
    async function emptyState() {
      assert.equal(await page.locator('#history > li').count(), 0);
      assert.equal(await page.locator('#trace > li').count(), 0);
      assert.equal(await page.locator('#first-session').inputValue(), 'alpha');
      assert.equal(await page.locator('#contender-condition').inputValue(), 'busy-lock');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('#start').isEnabled(), true);
      for (const id of ['submit-first', 'submit-contender', 'check-prediction', 'new-attempt']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      assert.equal(await text('#destination-epoch'), 'Not started');
      assert.equal(await text('#other-epoch'), 'Not started');
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'NOT_EVALUATED');
      assert.match(await text('#totals'), /Retained attempts: 0\/6; commands: 0; applied: 0; rejected: 0; unknown: 0; correct predictions: 0\/0/);
      assert.equal(await page.evaluate(() => typeof document.getElementById('lesson-controls').reset), 'function');
    }
    async function injectedClick(id) {
      await page.locator(`#${id}`).evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    async function attempt(condition, first, outcome, expectedEffects, expectedEpoch) {
      await page.locator('#first-session').selectOption(first);
      await page.locator('#contender-condition').selectOption(condition);
      await page.locator('#start').click();
      assert.equal(await text('#destination-owner'), first);
      await page.locator('#submit-first').click();
      assert.equal(await text('#destination-epoch'), '8');
      assert.equal(await text('#destination-effects'), '1');
      await unchangedOther();
      await page.locator('#submit-contender').click();
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), outcome);
      assert.equal(await text('#destination-effects'), String(expectedEffects));
      assert.equal(await text('#destination-epoch'), String(expectedEpoch));
      assert.match(await text('#current-metrics'), /Submitted: 2;.*invalid-owner effects: 0; unrelated changes: 0/);
      await unchangedOther();
    }

    assert.equal(await text('.training'), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await page.title(), /A-S085/);
    await emptyState();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Enter');
    assert.equal(await focus(), 'main');
    observe('Tab skip link and Enter reach the main lesson', true);

    await injectedClick('submit-contender');
    assert.match(await text('#error'), /Submit the first promotion before the contender/);
    assert.equal(await focus(), 'error');
    assert.equal(await page.locator('#trace > li').count(), 0);
    observe('out-of-order injected contender is rejected atomically with a focused alert', true);
    await page.locator('#reset-lesson').click();
    await emptyState();

    for (const [id, message] of [
      ['first-session', /Choose alpha or bravo/],
      ['contender-condition', /Choose one of the four fixed conditions/],
    ]) {
      await page.locator(`#${id}`).evaluate((element) => {
        element.append(new Option('<img src=x onerror=bad> forged input', 'forged', false, true));
      });
      await page.locator('#start').click();
      assert.match(await text('#error'), message);
      assert.equal(await focus(), id);
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#trace > li').count(), 0);
      assert.equal(await page.locator('img').count(), 0);
      await page.locator(`#${id} option[value="forged"]`).evaluate((element) => element.remove());
      await page.locator('#reset-lesson').click();
    }
    observe('invalid injected input enums fail without effects or HTML execution', true);

    assert.equal(await focus(), 'start');
    await page.keyboard.press('Enter');
    assert.equal(await focus(), 'submit-first');
    assert.equal(await page.locator('#first-session').isDisabled(), true);
    await page.keyboard.press('Space');
    assert.equal(await focus(), 'submit-contender');
    assert.equal(await text('#destination-epoch'), '8');
    await unchangedOther();
    await injectedClick('submit-first');
    assert.match(await text('#error'), /exactly once after Start/);
    assert.equal(await text('#destination-effects'), '1');
    observe('repeated first submission cannot duplicate a promotion effect', true);
    await page.locator('#submit-contender').focus();
    await page.keyboard.press('Enter');
    assert.equal(await focus(), 'prediction');
    assert.match(await text('#outcome'), /FAILURE — LOCK_CONFLICT.*Safety verifier: PASS/);
    assert.equal(await text('#destination-version'), 'green-v2');
    assert.equal(await text('#destination-epoch'), '8');
    assert.match(await text('#trace'), /"expectedEpoch": 8/);
    await unchangedOther();
    observe('keyboard Enter/Space busy-lock FAILURE preserves first version and independent lease', true);

    await page.locator('#check-prediction').click();
    assert.match(await text('#error'), /Choose SUCCESS, FAILURE or UNKNOWN/);
    assert.equal(await focus(), 'prediction');
    assert.equal(await page.locator('#history > li').count(), 0);
    observe('empty prediction is a focused validation error without losing outcome', true);
    await page.locator('#prediction').selectOption('SUCCESS');
    await page.locator('#prediction').focus();
    await page.keyboard.press('Tab');
    assert.equal(await focus(), 'check-prediction');
    await page.keyboard.press('Space');
    assert.match(await text('#prediction-feedback'), /Incorrect prediction: SUCCESS.*actual contender outcome remains FAILURE/);
    assert.equal(await page.locator('#history > li').count(), 1);
    assert.equal(await focus(), 'new-attempt');
    await page.locator('#history summary').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#history pre').first().isVisible(), true);
    assert.match(await text('#history pre'), /"reason": "LOCK_CONFLICT"/);
    await injectedClick('check-prediction');
    assert.match(await text('#error'), /Submit both promotions before checking once/);
    assert.equal(await page.locator('#history > li').count(), 1);
    observe('wrong prediction and full trace retained; repeated check cannot double-count', true);
    await page.locator('#new-attempt').focus();
    await page.keyboard.press('Enter');
    assert.equal(await focus(), 'start');
    assert.equal(await page.locator('#history > li').count(), 1);
    assert.equal(await page.locator('#trace > li').count(), 0);
    assert.equal(await page.locator('#prediction').inputValue(), '');
    observe('new attempt restores defaults while retaining history', true);

    const cases = [
      ['stale-epoch', 'alpha', 'FAILURE', 1, 8, 'STALE_EPOCH'],
      ['serialized', 'alpha', 'SUCCESS', 2, 9, 'VALID_OWNER_AND_EPOCH'],
      ['missing-owner', 'alpha', 'UNKNOWN', 1, 8, 'MISSING_OWNER_EVIDENCE'],
      ['serialized', 'bravo', 'SUCCESS', 2, 9, 'VALID_OWNER_AND_EPOCH'],
      ['busy-lock', 'bravo', 'FAILURE', 1, 8, 'LOCK_CONFLICT'],
    ];
    for (let index = 0; index < cases.length; index++) {
      const [condition, first, outcome, effects, epoch, reason] = cases[index];
      await attempt(condition, first, outcome, effects, epoch);
      assert.ok((await text('#outcome')).includes(reason));
      if (condition === 'stale-epoch') {
        assert.equal(await text('#destination-owner'), 'bravo');
        assert.match(await text('#trace'), /"expectedEpoch": 7/);
      }
      if (condition === 'missing-owner') {
        assert.match(await text('#outcome'), /Safety verifier: UNVERIFIED/);
        assert.match(await text('#current-metrics'), /applied: 1; rejected: 0; unknown: 1/);
        await page.locator('#prediction').evaluate((element) => element.append(new Option('forged', 'forged', false, true)));
        await page.locator('#check-prediction').click();
        assert.match(await text('#error'), /Choose SUCCESS, FAILURE or UNKNOWN/);
        assert.equal(await page.locator('#history > li').count(), 3);
        await page.locator('#prediction option[value="forged"]').evaluate((element) => element.remove());
        observe('invalid injected prediction remains an error, not a counted result', true);
      }
      await page.locator('#prediction').selectOption(outcome);
      await page.locator('#check-prediction').click();
      observe(`${condition} ${first}-first ${outcome}: ${reason}, effects=${effects}, epoch=${epoch}`, true);
      if (index < cases.length - 1) await page.locator('#new-attempt').click();
    }
    assert.equal(await page.locator('#history > li').count(), 6);
    assert.match(await text('#totals'), /Retained attempts: 6\/6; commands: 12; applied: 8; rejected: 3; unknown: 1; correct predictions: 5\/6/);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.equal(await focus(), 'reset-lesson');
    const retained = await text('#history');
    await injectedClick('new-attempt');
    assert.match(await text('#error'), /Six attempts are retained/);
    await page.locator('#lesson-controls').evaluate((element) => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await text('#error'), /Finish and retain the current attempt/);
    assert.equal(await text('#history'), retained);
    assert.equal(await page.locator('#history > li').count(), 6);
    observe('seventh attempt refused with no history eviction; failures and unknown remain counted', true);
    if (capture) images.push(await page.screenshot({ fullPage: true }));

    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#history summary').first().focus();
    await page.keyboard.press('Tab');
    proof.narrowViewport = await page.evaluate(() => ({
      width: innerWidth,
      bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      visibleKeyboardFocus: document.activeElement.matches(':focus-visible')
        && getComputedStyle(document.activeElement).outlineStyle === 'solid'
        && getComputedStyle(document.activeElement).outlineWidth === '3px',
    }));
    assert.equal(proof.narrowViewport.bodyOverflow, false);
    assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
    observe('375px narrow viewport has no body overflow and visible keyboard focus', proof.narrowViewport);
    if (capture) images.push(await page.screenshot({ fullPage: true }));

    stage = 'csp-probe';
    proof.csp = await page.evaluate(async () => {
      globalThis.__s085Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s085Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s085Inline = true;';
      document.head.append(script);
      script.remove();
      let connection = 'unexpected success';
      try { await fetch('data:text/plain,S085-synthetic-CSP-probe'); }
      catch (error) { connection = error.name; }
      return { inlineRan: globalThis.__s085Inline === true, connection };
    });
    await page.waitForFunction(() => globalThis.__s085Violations.some((entry) => entry.directive.startsWith('script-src'))
      && globalThis.__s085Violations.some((entry) => entry.directive === 'connect-src'));
    proof.csp.violations = await page.evaluate(() => globalThis.__s085Violations);
    assert.equal(proof.csp.inlineRan, false);
    assert.equal(proof.csp.connection, 'TypeError');
    observe('CSP actually blocks injected inline script and a synthetic data connection', proof.csp);
    stage = 'exercise';

    await page.locator('#reset-lesson').click();
    await emptyState();
    assert.equal(await focus(), 'start');
    assert.match(await text('#prediction-feedback'), /^Prediction correctness is separate/);
    observe('explicit reset clears inputs, focused errors, traces, history, predictions and counters', true);
    await page.locator('#first-session').selectOption('bravo');
    await page.locator('#contender-condition').selectOption('serialized');
    await page.locator('#start').click();
    await page.locator('#submit-first').click();
    assert.equal(await text('#destination-version'), 'amber-v3');
    await page.reload({ waitUntil: 'load' });
    await emptyState();
    observe('reload clears a partial attempt and restores input defaults', true);
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(testedHashes(), proof.testedSourceHashes);
  } finally {
    if (session) {
      proof.cleanup.closeAwaited = true;
      await session.close();
      proof.cleanup.closed = session.page.isClosed();
    }
  }
  assert.equal(proof.cleanup.closed, true);
  proof.completedAtUtc = new Date().toISOString();
  if (capture) {
    for (let index = 0; index < screenshots.length; index++) {
      fs.writeFileSync(path.join(root, screenshots[index]), images[index], { flag: 'wx' });
    }
    fs.writeFileSync(path.join(root, 'evidence\\browser.json'), `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  }
});
