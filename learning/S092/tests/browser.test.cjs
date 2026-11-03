'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, lf, filesBelow, HELPER_SHA } = require('.\\provenance.cjs');
const helperPath = path.join(repo, 'testing\\browser\\isolated.cjs');
assert.equal(sha(fs.readFileSync(helperPath)), HELPER_SHA, 'Only the exact published helper is authorized');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const captureFiles = ['evidence\\browser.json', 'evidence\\failed-canary.png', 'evidence\\unknown-recovery.png'];
const snapshotFiles = () => filesBelow().map((file) => ({ file, rawSha256: sha(read(file)) }));

test('actual isolated Edge: canary accounting, keyboard, guards, history, reset and enforced CSP', { timeout: 150000 }, async (t) => {
  if (capture) for (const file of captureFiles) assert.equal(fs.existsSync(path.join(root, file)), false, 'Capture is append-only');
  const before = snapshotFiles();
  const sourceDigests = before.filter((item) => !item.file.startsWith('evidence\\')).map((item) => ({
    file: item.file, canonicalLFSourceSha256: sha(lf(read(item.file))),
  }));
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const screenshots = new Map();
  const session = await openIsolatedLesson('learning\\S092\\index.html');
  const page = session.page;
  const pageErrors = [];
  const networkRequests = [];
  let cleanupCompleted = false;
  let allChecksPassed = false;
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('request', (request) => {
    if (/^(?:https?|wss?):/.test(request.url())) networkRequests.push(request.url());
  });
  const value = async (id) => (await page.locator(`#${id}`).textContent()).trim();
  const focus = () => page.evaluate(() => document.activeElement.id);
  const number = async (id, expected) => assert.equal(await value(id), String(expected), id);
  const counts = async () => {
    const result = {};
    for (const id of ['transition-result', 'recovery-result', 'expansion-result', 'desired-routing', 'observed-routing',
      'attempted-count', 'successful-count', 'interrupted-count', 'unknown-count', 'total-attempts',
      'total-attempted', 'total-successful', 'total-interrupted', 'total-unknown', 'total-fraction', 'learning-result']) {
      result[id] = await value(id);
    }
    return result;
  };
  async function check(name, action) {
    let passed = false;
    await t.test(name, async () => {
      const observations = await action();
      checks.push({ name, pass: true, observations });
      passed = true;
    });
    if (!passed) throw new Error(`Actual browser check failed: ${name}`);
  }
  async function act(name, key = 'Enter') {
    const button = page.getByRole('button', { name, exact: true });
    await button.focus();
    await page.keyboard.press(key);
  }
  async function conduct(prediction, recoveryPrediction, wrong = false) {
    await act('Start measured canary');
    await act('Observe synthetic canary', 'Space');
    await act('Attempt expansion gate');
    if (await value('expansion-result') === 'REJECTED') await act('Rehearse rollback', 'Space');
    await page.locator('#predict-transition').selectOption(wrong ? 'SUCCESS' : prediction);
    await page.locator('#predict-recovery').selectOption(recoveryPrediction);
    await act('Check prediction', 'Space');
  }
  async function cleanReset() {
    await act('Reset all local data');
    assert.equal(await focus(), 'canary-stage');
    for (const id of ['attempted-count', 'successful-count', 'interrupted-count', 'unknown-count',
      'total-attempts', 'total-attempted', 'total-successful', 'total-interrupted', 'total-unknown']) await number(id, 0);
    assert.equal(await value('total-fraction'), 'No sample');
    assert.equal(await value('transition-result'), 'NOT_STARTED');
    assert.equal(await value('recovery-result'), 'NOT_ATTEMPTED');
    assert.equal(await value('learning-result'), 'NOT_CHECKED');
    assert.equal(await value('desired-routing'), '0%');
    assert.equal(await value('observed-routing'), '0%');
    assert.equal(await page.locator('#trace-list li').count(), 0);
    assert.equal(await page.locator('#history-body tr').count(), 0);
    assert.equal(await page.locator('#journey-body tr').count(), 0);
    assert.equal(await page.locator('[aria-invalid]').count(), 0);
    assert.equal(await page.locator('#lesson-error').isVisible(), false);
    assert.equal(await value('lesson-error'), '');
    assert.equal(await page.locator('#canary-stage').inputValue(), '50');
    assert.equal(await page.locator('#canary-observation').inputValue(), 'failed');
    assert.equal(await page.locator('#rollback-evidence').inputValue(), 'confirmed');
    assert.equal(await page.locator('#predict-transition').inputValue(), 'FAILURE');
    assert.equal(await page.locator('#predict-recovery').inputValue(), 'SUCCESS');
  }
  try {
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    await check('actual local DOM, exact banner, labels, native reset and keyboard skip/focus', async () => {
      assert.equal(await page.title(), 'S092 — Canary rollback does not erase interruptions');
      assert.equal(await value('synthetic-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('label[for]').count(), 5);
      assert.equal(await page.evaluate(() => typeof document.getElementById('exercise').reset), 'function');
      await number('total-attempted', 0);
      assert.equal(await value('total-fraction'), 'No sample');
      assert.equal(await page.locator('#observe-canary').isDisabled(), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      assert.notEqual(await page.locator('.skip-link').evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'lesson-main');
      return { title: await page.title(), banner: await value('synthetic-banner'), labelCount: 5, nativeReset: true, keyboardSkip: true };
    });
    await check('keyboard failure, atomic state error, stopped expansion and successful rollback retain interruption', async () => {
      await act('Start measured canary');
      assert.equal(await focus(), 'observe-canary');
      await number('attempted-count', 4);
      await number('unknown-count', 4);
      await number('successful-count', 0);
      await page.evaluate(() => document.getElementById('exercise').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await value('lesson-error'), /ERR_STATE/);
      assert.equal(await focus(), 'lesson-error');
      await number('total-attempted', 4);
      assert.equal(await page.locator('#trace-list li').count(), 1);
      await act('Observe synthetic canary', 'Space');
      assert.equal(await focus(), 'attempt-expansion');
      assert.equal(await value('transition-result'), 'FAILURE');
      assert.equal(await value('admission-result'), 'STOPPED');
      assert.equal(await value('desired-routing'), '0%');
      assert.equal(await value('observed-routing'), '50%');
      await act('Attempt expansion gate');
      assert.equal(await focus(), 'rehearse-rollback');
      assert.equal(await value('expansion-result'), 'REJECTED');
      await number('total-attempted', 4);
      await act('Rehearse rollback', 'Space');
      assert.equal(await focus(), 'predict-transition');
      assert.equal(await value('recovery-result'), 'SUCCESS');
      assert.equal(await value('observed-routing'), '0%');
      await number('recovery-count', 8);
      await number('successful-count', 3);
      await number('interrupted-count', 1);
      await number('unknown-count', 0);
      await act('Check prediction');
      assert.equal(await value('learning-result'), 'PASS');
      assert.equal(await value('transition-result'), 'FAILURE');
      assert.equal(await focus(), 'new-attempt');
      assert.equal(await page.locator('#journey-body tr').count(), 8);
      const failedRow = await page.locator('#journey-body tr').first().textContent();
      assert.match(failedRow, /FAILURE/);
      assert.match(failedRow, /503 \/ 60/);
      assert.match(failedRow, /old-v1/);
      assert.match(failedRow, /SUCCESS/);
      assert.equal(await page.locator('#history-body tr').count(), 1);
      if (capture) screenshots.set('evidence\\failed-canary.png', await page.screenshot({ fullPage: true }));
      return { ...await counts(), failedRow, stateErrorAtomic: true, learningPassNotCanarySuccess: true };
    });
    await check('retained failed history and healthy stage exclude old comparisons and unexecuted expansion', async () => {
      await act('New attempt — keep history', 'Space');
      assert.equal(await focus(), 'canary-stage');
      await number('total-attempted', 4);
      await number('total-interrupted', 1);
      await page.locator('#canary-stage').selectOption('25');
      await page.locator('#canary-observation').selectOption('healthy');
      await conduct('SUCCESS', 'NOT_ATTEMPTED');
      assert.equal(await value('expansion-result'), 'ELIGIBLE_NOT_EXECUTED');
      assert.equal(await value('observed-routing'), '25%');
      assert.equal(await page.locator('#rehearse-rollback').isDisabled(), true);
      await number('old-only-count', 6);
      await number('recovery-count', 0);
      await number('total-attempts', 2);
      await number('total-attempted', 6);
      await number('total-successful', 5);
      await number('total-interrupted', 1);
      await number('total-unknown', 0);
      assert.equal(await page.locator('#history-body tr').count(), 2);
      return { ...await counts(), oldOnlyExcluded: 6, furtherExposureNotExecuted: true };
    });
    await check('UNKNOWN canary and mixed failure keep uncertainty after confirmed or missing reversal', async () => {
      await act('New attempt — keep history');
      await page.locator('#canary-stage').selectOption('25');
      await page.locator('#canary-observation').selectOption('missing');
      await conduct('UNKNOWN', 'SUCCESS');
      assert.equal(await value('transition-result'), 'UNKNOWN');
      assert.equal(await value('recovery-result'), 'SUCCESS');
      await number('total-attempted', 8);
      await number('total-unknown', 1);
      const missing = await counts();
      await act('New attempt — keep history');
      await page.locator('#canary-stage').selectOption('25');
      await page.locator('#canary-observation').selectOption('mixed');
      await page.locator('#rollback-evidence').selectOption('missing');
      await conduct('FAILURE', 'UNKNOWN');
      assert.equal(await value('transition-result'), 'FAILURE');
      assert.equal(await value('recovery-result'), 'UNKNOWN');
      assert.equal(await value('observed-routing'), 'UNKNOWN');
      await number('successful-count', 0);
      await number('interrupted-count', 1);
      await number('unknown-count', 1);
      await number('total-attempted', 10);
      await number('total-successful', 6);
      await number('total-interrupted', 2);
      await number('total-unknown', 2);
      assert.equal(await page.locator('#history-body tr').count(), 4);
      if (capture) screenshots.set('evidence\\unknown-recovery.png', await page.screenshot({ fullPage: true }));
      return { missing, mixed: await counts(), knownFailureDominatesWithoutHidingUnknown: true };
    });
    await check('strict DOM input/error focus, wrong prediction and six-attempt no-eviction bound', async () => {
      await act('New attempt — keep history');
      await page.locator('#canary-stage').evaluate((select) => {
        const option = document.createElement('option');
        option.value = '100';
        option.textContent = 'Invalid synthetic option';
        select.append(option);
        select.value = '100';
      });
      await act('Start measured canary');
      assert.match(await value('lesson-error'), /ERR_INPUT/);
      assert.equal(await focus(), 'canary-stage');
      assert.equal(await page.locator('#canary-stage').getAttribute('aria-invalid'), 'true');
      await number('total-attempted', 10);
      assert.equal(await page.locator('#trace-list li').count(), 0);
      await page.locator('#canary-stage').selectOption('50');
      await conduct('FAILURE', 'SUCCESS', true);
      assert.equal(await value('learning-result'), 'FAIL');
      assert.equal(await value('transition-result'), 'FAILURE');
      assert.equal(await page.locator('[aria-invalid]').count(), 0);
      assert.equal(await page.locator('#lesson-error').isVisible(), false);
      await act('New attempt — keep history');
      await conduct('FAILURE', 'SUCCESS');
      assert.equal(await page.locator('#history-body tr').count(), 6);
      assert.equal(await focus(), 'reset-lesson');
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#start-canary').isDisabled(), true);
      await number('total-attempted', 18);
      await number('total-successful', 12);
      await number('total-interrupted', 4);
      await number('total-unknown', 2);
      const beforeLimit = await counts();
      await page.evaluate(() => document.getElementById('exercise').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await value('lesson-error'), /ERR_LIMIT/);
      assert.equal(await focus(), 'lesson-error');
      assert.deepEqual(await counts(), beforeLimit);
      assert.equal(await page.locator('#history-body tr').count(), 6);
      return { ...beforeLimit, invalidFieldFocused: true, wrongPredictionRetained: true, seventhRejected: true, noneEvicted: true };
    });
    await check('native reset clears full/error state, active attempts and reload clears memory', async () => {
      await cleanReset();
      const cleared = await counts();
      await page.locator('#canary-stage').selectOption('25');
      await page.locator('#canary-observation').selectOption('mixed');
      await page.locator('#rollback-evidence').selectOption('missing');
      await act('Start measured canary');
      await number('total-attempted', 2);
      await cleanReset();
      await act('Start measured canary');
      await act('Observe synthetic canary');
      await number('interrupted-count', 1);
      await page.reload({ waitUntil: 'load', timeout: 15000 });
      await number('total-attempted', 0);
      assert.equal(await page.locator('#history-body tr').count(), 0);
      assert.equal(await value('transition-result'), 'NOT_STARTED');
      assert.equal(await page.locator('#canary-stage').inputValue(), '50');
      return { cleared, resetDuringActive: true, resetErrorsInputsPredictionsRowsRoutesHistory: true, reloadClearsMemory: true };
    });
    await check('narrow viewport stays within bounds and keyboard focus remains visible', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.reload({ waitUntil: 'load', timeout: 15000 });
      const dimensions = await page.evaluate(() => ({
        viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
        resetHeight: document.getElementById('reset-lesson').getBoundingClientRect().height,
      }));
      assert.ok(dimensions.documentWidth <= dimensions.viewportWidth);
      assert.ok(dimensions.resetHeight >= 44);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'lesson-main');
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'canary-stage');
      assert.notEqual(await page.locator('#canary-stage').evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
      return { ...dimensions, narrowKeyboardFocus: true };
    });
    await check('actual CSP denies inline/eval, data connections, frames, objects and form submission', async () => {
      const originalURL = page.url();
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.id = 's092-csp-probe';
        script.src = new URL('tests/csp-probe.js', location.href).href;
        document.head.append(script);
      });
      await page.waitForFunction(() => window.__s092Csp?.done
        && ['script-src-elem', 'script-src', 'connect-src', 'frame-src', 'object-src', 'form-action']
          .every((directive) => window.__s092Csp.violations.some((event) => event.directive === directive)));
      const { blocked, violations, error } = await page.evaluate(() => window.__s092Csp);
      assert.equal(error, undefined);
      assert.equal(blocked.inlineRan, false);
      assert.equal(blocked.evalRan, false);
      assert.equal(blocked.evalBlocked, true);
      assert.equal(blocked.connectionBlocked, true);
      assert.equal(page.url(), originalURL);
      await page.evaluate(() => {
        for (const id of ['s092-csp-probe', 's092-csp-frame', 's092-csp-object', 's092-csp-form']) document.getElementById(id).remove();
      });
      assert.deepEqual(networkRequests, []);
      assert.deepEqual(pageErrors, []);
      return { blocked, violations, probeRunsAsLocalBrowserScript: true, noRemoteRequests: true, noPageErrors: true, securityBypassUsed: false };
    });
    allChecksPassed = true;
  } finally {
    await session.close();
    cleanupCompleted = true;
  }
  assert.equal(allChecksPassed, true);
  assert.equal(cleanupCompleted, true);
  assert.deepEqual(snapshotFiles(), before, 'Browser verification must not modify source or proof');
  if (capture) {
    const imageRecords = [];
    for (const [file, bytes] of screenshots) {
      fs.writeFileSync(path.join(root, file), bytes, { flag: 'wx' });
      imageRecords.push({ file, bytes: bytes.length, rawSha256: sha(bytes) });
    }
    fs.writeFileSync(path.join(root, 'evidence\\browser.json'), `${JSON.stringify({
      cardId: 'A-S092', workerId: 'worker-A-S092', outcome: 'PASS', captureExplicitlyEnabled: true,
      startedAtUtc, completedAtUtc: new Date().toISOString(), node: process.version,
      playwright: JSON.parse(fs.readFileSync(path.join(repo, 'testing\\browser\\node_modules\\playwright\\package.json'))).version,
      browserVersion: session.browserVersion, helperSha256: HELPER_SHA, helperAPI: 'openIsolatedLesson',
      cleanup: { awaitedInFinally: true, completed: cleanupCompleted },
      normalVerificationReadOnly: true, sourceDigests, checks, screenshots: imageRecords,
      nativeCanaryRollbackOrContinuityCertified: false, productionNode24Validated: false,
    }, null, 2)}\n`, { flag: 'wx' });
  }
});
