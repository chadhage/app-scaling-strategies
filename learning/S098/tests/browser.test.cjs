'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, lf, filesBelow, HELPER_SHA } = require('.\\provenance.cjs');
const helperPath = path.join(repo, 'testing\\browser\\isolated.cjs');
assert.equal(sha(fs.readFileSync(helperPath)), HELPER_SHA, 'Only the exact published isolated helper is authorized');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const digests = () => filesBelow().map((file) => [file, sha(read(file))]);

test('actual isolated Edge: new-write recovery, guards, retained history, keyboard, reset and CSP', { timeout: 150000 }, async (t) => {
  const captures = ['evidence\\browser.json', 'evidence\\browser-failed.json', 'evidence\\raw\\failed-read.png', 'evidence\\raw\\unknown-read.png'];
  if (capture) for (const name of captures) assert.equal(fs.existsSync(path.join(root, name)), false, 'Deliberate captures never overwrite proof');
  const before = digests();
  const sourceDigests = filesBelow().filter((file) => !file.startsWith('evidence\\')).map((file) => ({
    file, workingSha256: sha(read(file)), canonicalGitSha256: sha(lf(read(file))),
  }));
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const screenshots = new Map();
  const pageErrors = [];
  const requests = [];
  const responses = [];
  const failedRequests = [];
  let session;
  let cleanupCompleted = false;
  let allChecksPassed = false;
  let failure = null;
  try {
    session = await openIsolatedLesson('learning\\S098\\index.html');
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('request', (request) => { if (/^(?:https?|wss?):/.test(request.url())) requests.push(request.url()); });
    page.on('response', (response) => { if (/^https?:/.test(response.url())) responses.push(response.url()); });
    page.on('requestfailed', (request) => {
      if (/^https?:/.test(request.url())) failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
    });
    const value = async (id) => (await page.locator(`#${id}`).textContent()).trim();
    const focus = () => page.evaluate(() => document.activeElement.id);
    const number = async (id, expected) => assert.equal(await value(id), String(expected), id);
    async function snapshot() {
      const result = {};
      for (const id of ['phase', 'effective-version', 'desired-version', 'recovery-outcome', 'retained-effects',
        'committed-total', 'interpreted-effects', 'observed-total', 'learning-verdict', 'total-decisions',
        'total-attempted', 'total-success', 'total-failure', 'total-unknown', 'total-rejected', 'remaining-decisions']) {
        result[id] = await value(id);
      }
      result.ledger = await page.locator('#ledger-body').textContent();
      result.history = await page.locator('#history-body').textContent();
      return result;
    }
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
      await page.getByRole('button', { name, exact: true }).focus();
      await page.keyboard.press(key);
    }
    async function reset() {
      const historyCount = await page.locator('#history-body tr').count();
      const totals = {};
      for (const id of ['total-decisions', 'total-attempted', 'total-success', 'total-failure', 'total-unknown', 'total-rejected']) totals[id] = await value(id);
      await act('Reset rehearsal — keep history', 'Space');
      assert.equal(await value('phase'), 'BASELINE');
      assert.equal(await value('effective-version'), 'v1');
      assert.equal(await value('recovery-outcome'), 'NOT_ATTEMPTED');
      assert.equal(await value('learning-verdict'), 'NOT_CHECKED');
      await number('retained-effects', 1);
      await number('committed-total', 6);
      assert.equal(await page.locator('#ledger-body tr').count(), 1);
      assert.equal(await page.locator('#read-body tr').count(), 0);
      assert.equal(await page.locator('#trace-list li').count(), 0);
      assert.equal(await page.locator('#history-body tr').count(), historyCount);
      for (const [id, expected] of Object.entries(totals)) assert.equal(await value(id), expected);
      assert.equal(await page.locator('#recovery-plan').inputValue(), 'compatible-rollback');
      assert.equal(await page.locator('#read-observation').inputValue(), 'complete');
      assert.equal(await page.locator('#prediction').inputValue(), 'SUCCESS');
      assert.equal(await page.locator('[aria-invalid]').count(), 0);
      assert.equal(await page.locator('#lesson-error').isVisible(), false);
      assert.equal(await value('lesson-error'), '');
      assert.equal(await page.evaluate(() => typeof document.getElementById('exercise').reset), 'function');
      assert.equal(await focus(), historyCount < 12 ? 'apply-writes' : 'reset-lesson');
    }
    async function conduct(plan, observation, prediction, key = 'Enter') {
      await act('Apply fixed v2 writes', key);
      assert.equal(await focus(), 'recovery-plan');
      await page.locator('#recovery-plan').selectOption(plan);
      await page.locator('#read-observation').selectOption(observation);
      await act('Rehearse selected recovery', 'Space');
      assert.equal(await focus(), 'prediction');
      await page.locator('#prediction').selectOption(prediction);
      await act('Check interpretation', 'Space');
      assert.equal(await focus(), 'reset-lesson');
    }

    await page.reload({ waitUntil: 'load', timeout: 15000 });
    await check('actual file DOM, exact banner, labels, native reset and keyboard skip/focus', async () => {
      assert.equal(await page.title(), 'S098 — Recovery after new writes');
      assert.equal(await value('synthetic-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('label[for]').count(), 3);
      assert.equal(await page.evaluate(() => typeof document.getElementById('exercise').reset), 'function');
      assert.equal(await page.locator('#rehearse-recovery').isDisabled(), true);
      await number('total-decisions', 0);
      assert.equal(await value('success-fraction'), 'No sample');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      assert.notEqual(await page.locator('.skip-link').evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'lesson-main');
      return { title: await page.title(), exactBanner: true, nativeReset: true, keyboardSkip: true };
    });
    await check('premature submit is atomic; keyboard compatible rollback preserves all fixed writes', async () => {
      const baseline = await snapshot();
      await page.evaluate(() => document.getElementById('exercise').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await value('lesson-error'), /ERR_STATE/);
      assert.equal(await focus(), 'lesson-error');
      assert.deepEqual(await snapshot(), baseline);
      await reset();
      await conduct('compatible-rollback', 'complete', 'SUCCESS');
      assert.equal(await value('recovery-outcome'), 'SUCCESS');
      assert.equal(await value('effective-version'), 'v1-compatible');
      assert.equal(await value('learning-verdict'), 'PASS');
      await number('retained-effects', 3);
      await number('interpreted-effects', 3);
      await number('committed-total', 8);
      await number('observed-total', 8);
      assert.equal(await value('read-budget'), '7 ms / 10 ms');
      assert.equal(await page.locator('#ledger-body tr').count(), 3);
      assert.equal(await page.locator('#read-body tr').count(), 3);
      assert.equal((await page.locator('#read-body tr').allTextContents())[2], 'L003-1');
      await number('total-attempted', 1);
      await number('total-success', 1);
      return snapshot();
    });
    await check('baseline-only v1 cannot pretend its 6-unit view is a compatible rollback', async () => {
      await reset();
      await conduct('baseline-only', 'complete', 'REJECTED', 'Space');
      assert.equal(await value('recovery-outcome'), 'REJECTED');
      assert.equal(await value('effective-version'), 'v2');
      assert.equal(await value('learning-verdict'), 'PASS');
      assert.match(await value('result-explanation'), /6 units.*8/);
      await number('retained-effects', 3);
      await number('committed-total', 8);
      await number('total-decisions', 2);
      await number('total-attempted', 1);
      await number('total-rejected', 1);
      return snapshot();
    });
    await check('restoring an obsolete snapshot is rejected without discarding committed v2 effects', async () => {
      await reset();
      await conduct('discard-new-writes', 'unknown', 'REJECTED');
      assert.equal(await value('recovery-outcome'), 'REJECTED');
      assert.equal(await value('effective-version'), 'v2');
      assert.match(await value('result-explanation'), /discard L002 and L003/);
      assert.equal(await page.locator('#ledger-body tr').count(), 3);
      await number('committed-total', 8);
      await number('total-decisions', 3);
      await number('total-attempted', 1);
      await number('total-rejected', 2);
      return snapshot();
    });
    await check('missing read fails with intact ledger; wrong learner answer cannot turn it into success', async () => {
      await reset();
      await conduct('compatible-rollback', 'missing', 'SUCCESS');
      assert.equal(await value('recovery-outcome'), 'FAILURE');
      assert.equal(await value('learning-verdict'), 'FAIL');
      assert.equal(await value('effective-version'), 'v2');
      await number('observed-total', 9);
      await number('committed-total', 8);
      await number('interpreted-effects', 2);
      await number('retained-effects', 3);
      await number('total-failure', 1);
      await number('total-attempted', 2);
      assert.equal(await page.locator('#read-body tr').count(), 2);
      if (capture) screenshots.set('evidence\\raw\\failed-read.png', await page.screenshot({ fullPage: true }));
      return snapshot();
    });
    await check('forward recovery is v2.1, while a corrupted signed effect fails even with every ID', async () => {
      await reset();
      await conduct('forward-recovery', 'complete', 'SUCCESS');
      assert.equal(await value('recovery-outcome'), 'SUCCESS');
      assert.equal(await value('effective-version'), 'v2.1');
      await number('observed-total', 8);
      await number('total-success', 2);
      await reset();
      await conduct('forward-recovery', 'corrupt', 'FAILURE');
      assert.equal(await value('recovery-outcome'), 'FAILURE');
      assert.equal(await value('effective-version'), 'v2');
      assert.equal(await value('learning-verdict'), 'PASS');
      await number('interpreted-effects', 3);
      await number('observed-total', 10);
      await number('committed-total', 8);
      await number('total-failure', 2);
      await number('total-attempted', 4);
      return snapshot();
    });
    await check('unknown read is not success; reset keeps failures, unknowns and the denominator', async () => {
      await reset();
      await conduct('compatible-rollback', 'unknown', 'UNKNOWN');
      assert.equal(await value('recovery-outcome'), 'UNKNOWN');
      assert.equal(await value('effective-version'), 'v2');
      assert.equal(await value('observed-total'), 'No observation');
      assert.equal(await value('read-budget'), 'No observation / 10 ms');
      assert.equal(await value('learning-verdict'), 'PASS');
      await number('interpreted-effects', 0);
      await number('retained-effects', 3);
      await number('total-unknown', 1);
      await number('total-decisions', 7);
      await number('total-attempted', 5);
      assert.equal(await value('success-fraction'), '2 / 5');
      if (capture) screenshots.set('evidence\\raw\\unknown-read.png', await page.screenshot({ fullPage: true }));
      await reset();
      assert.equal(await page.locator('#history-body tr').count(), 7);
      await number('total-failure', 2);
      await number('total-unknown', 1);
      return snapshot();
    });
    await check('bad enum, stale/malformed tokens, bad prediction and duplicate action are atomic focused errors', async () => {
      await act('Apply fixed v2 writes');
      const before = await snapshot();
      await page.evaluate(() => {
        const option = new Option('invalid', 'not-a-plan');
        document.getElementById('recovery-plan').add(option);
      });
      await page.locator('#recovery-plan').selectOption('not-a-plan');
      await act('Rehearse selected recovery');
      assert.match(await value('lesson-error'), /ERR_INPUT/);
      assert.equal(await focus(), 'lesson-error');
      assert.equal(await page.locator('[aria-invalid]').count(), 2);
      assert.deepEqual(await snapshot(), before);
      await page.locator('#recovery-plan').selectOption('compatible-rollback');
      const token = await page.locator('#exercise').getAttribute('data-run-id');
      await page.locator('#exercise').evaluate((form, run) => { form.dataset.runId = String(Number(run) - 1); }, token);
      await act('Rehearse selected recovery');
      assert.match(await value('lesson-error'), /ERR_STALE/);
      assert.deepEqual(await snapshot(), before);
      await page.locator('#exercise').evaluate((form) => { form.dataset.runId = '1.5'; });
      await act('Rehearse selected recovery');
      assert.match(await value('lesson-error'), /ERR_INPUT/);
      assert.deepEqual(await snapshot(), before);
      await reset();
      await act('Apply fixed v2 writes');
      await act('Rehearse selected recovery');
      const decided = await snapshot();
      await page.evaluate(() => document.getElementById('prediction').add(new Option('invalid', 'not-a-verdict')));
      await page.locator('#prediction').selectOption('not-a-verdict');
      await act('Check interpretation');
      assert.match(await value('lesson-error'), /ERR_INPUT/);
      assert.equal(await focus(), 'lesson-error');
      assert.deepEqual(await snapshot(), decided);
      await page.locator('#prediction').selectOption('SUCCESS');
      await act('Check interpretation');
      const checked = await snapshot();
      await page.evaluate(() => document.getElementById('exercise').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await value('lesson-error'), /ERR_STATE/);
      assert.deepEqual(await snapshot(), checked);
      await number('total-decisions', 8);
      await reset();
      return { invalidAndStaleAtomic: true, nativeResetRestored: true, retainedDecisions: 8 };
    });
    await check('twelve-decision bound survives reset; forced disabled command is guarded; reload explicitly clears memory', async () => {
      for (let i = 8; i < 12; i += 1) {
        if (i !== 8) await reset();
        await conduct('compatible-rollback', 'complete', 'SUCCESS');
      }
      await number('total-decisions', 12);
      await number('remaining-decisions', 0);
      assert.equal(await page.locator('#history-body tr').count(), 12);
      await reset();
      assert.equal(await page.locator('#apply-writes').isDisabled(), true);
      const full = await snapshot();
      await page.evaluate(() => document.getElementById('apply-writes').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await value('lesson-error'), /ERR_CAPACITY/);
      assert.deepEqual(await snapshot(), full);
      await reset();
      assert.equal(await page.locator('#apply-writes').isDisabled(), true);
      const retained = await snapshot();
      await page.reload({ waitUntil: 'load', timeout: 15000 });
      await number('total-decisions', 0);
      await number('total-attempted', 0);
      assert.equal(await page.locator('#history-body tr').count(), 0);
      assert.equal(await page.locator('#apply-writes').isEnabled(), true);
      return { retainedBeforeExplicitReload: retained, explicitReloadCleared: true };
    });
    await check('page-loaded external probe proves actual CSP blocking, with no external response or runtime error', async () => {
      assert.equal(requests.length, 0, 'Normal lesson made no external requests');
      assert.deepEqual(pageErrors, []);
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = new URL('tests/csp-probe.js', location.href).href;
        document.head.appendChild(script);
      });
      await page.waitForFunction(() => globalThis.__s098CspProbe?.done === true, null, { timeout: 10000 });
      const proof = await page.evaluate(() => globalThis.__s098CspProbe);
      for (const key of ['evaluationBlocked', 'inlineBlocked', 'connectionBlocked', 'imageBlocked', 'formBlocked']) assert.equal(proof[key], true, key);
      for (const directive of ['script-src', 'script-src-elem', 'connect-src', 'img-src', 'form-action']) {
        assert.ok(proof.violations.some((entry) => entry.directive === directive && entry.disposition === 'enforce'), directive);
      }
      assert.deepEqual(responses, []);
      assert.deepEqual(pageErrors, []);
      assert.equal(await page.title(), 'S098 — Recovery after new writes');
      return { proof, normalExternalRequests: 0, externalResponses: 0, failedRequests, pageErrors };
    });
    allChecksPassed = true;
  } catch (error) {
    failure = String(error);
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        cleanupCompleted = true;
      }
    } finally {
      assert.deepEqual(digests(), before, 'Ordinary browser verification must not write lesson source or evidence');
      if (capture) {
        for (const [name, image] of screenshots) fs.writeFileSync(path.join(root, name), image, { flag: 'wx' });
        const record = {
          schemaVersion: 1, cardId: 'A-S098', workerId: 'worker-A-S098', sourceId: 'S098', parentId: 'D-S098',
          mode: 'synthetic', kano: 'S', kanoUnit: 'A-S098', packet: 'LP-COMPARE',
          startedAtUtc, completedAtUtc: new Date().toISOString(),
          browserVersion: session?.browserVersion, node: process.version,
          helperSha256: HELPER_SHA, helperAPI: 'openIsolatedLesson',
          cleanupCompleted, allChecksPassed, failure, checks, sourceDigests,
          ownedFilesUnchangedBeforeDeliberateCapture: true, normalVerificationReadOnly: true,
          screenshots: [...screenshots].map(([file, bytes]) => ({ file, sha256: sha(bytes) })),
          nativeOrActualWritesCompatibilityRollbackRecoveryCertified: false,
          sourceParentCompleted: false, productionNode24Validated: false,
        };
        fs.writeFileSync(path.join(root, allChecksPassed && cleanupCompleted ? 'evidence\\browser.json' : 'evidence\\browser-failed.json'),
          `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
