'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { openIsolatedLesson } = require('..\\..\\..\\testing\\browser\\isolated.cjs');

const root = path.resolve(__dirname, '..');
const helper = path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs');
const HELPER_SHA = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function files(directory = root, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}\\${entry.name}` : entry.name;
    return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}

function byteInventory() {
  return files().map((relative) => {
    const bytes = fs.readFileSync(path.join(root, relative));
    return { path: relative, bytes: bytes.length, sha256: sha(bytes) };
  });
}

async function dom(page) {
  return page.evaluate(() => ({
    phase: document.getElementById('phase-label').dataset.phase,
    desiredRoute: document.getElementById('desired-route').textContent,
    observedRoute: document.getElementById('observed-route').textContent,
    placement: document.getElementById('content-placement').textContent,
    formerWorkers: document.getElementById('worker-state').textContent,
    result: document.getElementById('current-result').textContent,
    aggregate: document.getElementById('aggregate-result').textContent,
    gates: [...document.querySelectorAll('#readiness-gates > li')].map((item) => item.textContent),
    receipts: [...document.querySelectorAll('#journey-rows > tr')].map((row) => ({
      outcome: row.dataset.outcome, columns: [...row.children].map((cell) => cell.textContent),
    })),
    actions: [...document.querySelectorAll('#action-trace > li')].map((item) => item.textContent),
    history: [...document.querySelectorAll('#run-history > li')].map((item) => ({
      runId: item.dataset.runId, outcome: item.dataset.outcome, text: item.textContent,
    })),
    historyCount: document.getElementById('history-count').textContent,
    errorHidden: document.getElementById('lesson-error').hidden,
    error: document.getElementById('lesson-error').textContent,
    focusedId: document.activeElement.id,
  }));
}

async function start(page, fixture = 'healthy', budget = '250', promotionPath = 'manual') {
  await page.locator('#promotion-path').selectOption(promotionPath);
  await page.locator('#fixture-choice').selectOption(fixture);
  await page.locator('#journey-budget').fill(budget);
  await page.locator('#assess-candidate').click();
}

async function exposed(page, fixture = 'healthy', budget = '250') {
  await start(page, fixture, budget);
  await page.locator('#promote-candidate').click();
  await page.locator('#measure-journeys').click();
}

test('actual DOM supported Linux assessment and full operator acceptance', { timeout: 180000 }, async (t) => {
  const before = byteInventory();
  const rawSources = files().filter((file) => file !== 'result.json' && !file.startsWith('evidence\\')).map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { path: file, bytes: bytes.length, sha256: sha(bytes), base64: bytes.toString('base64') };
  });
  const observations = [];
  const pageErrors = [];
  const networkRequests = [];
  let session;
  let failure = null;
  let cleanup = 'not opened';
  let bytePreservation = false;
  let passed = false;
  const recordedAtUtc = new Date().toISOString();
  try {
    assert.equal(sha(fs.readFileSync(helper)), HELPER_SHA, 'published helper must match, not an archived prototype');
    session = await openIsolatedLesson('learning\\S122\\index.html');
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) networkRequests.push({ url: request.url(), method: request.method() });
    });
    async function check(name, exercise) {
      await t.test(name, async () => {
        try {
          const details = await exercise();
          observations.push({ check: name, passed: true, details, dom: await dom(page) });
        } catch (error) {
          observations.push({
            check: name, passed: false, error: { name: error.name, code: error.code, message: error.message },
            dom: await dom(page).catch(() => null),
          });
          throw error;
        }
      });
    }

    await check('exact banner, native limitation, shared hosting and initial controls', async () => {
      await page.reload();
      assert.equal(await page.locator('#training-banner').textContent(), BANNER);
      assert.equal(await page.locator('option[value="native-auto-swap"]').isDisabled(), true);
      assert.match(await page.locator('#auto-swap-limit').textContent(), /unavailable on Linux and Web App for Containers/);
      const constraints = await page.locator('[aria-labelledby="constraints-heading"]').textContent();
      assert.match(constraints, /two plan workers/);
      assert.match(constraints, /does not add compute/);
      assert.match(constraints, /Windows code/);
      assert.match(constraints, /slot-bound/i);
      assert.equal(await page.locator('#promote-candidate').isDisabled(), true);
      assert.equal(await page.locator('#measure-journeys').isDisabled(), true);
      assert.equal(await page.locator('#request-rollback').isDisabled(), true);
      assert.equal(await page.evaluate(() => typeof document.getElementById('lesson-form').reset), 'function');
      return { banner: BANNER, nativeAutoSwapDisabled: true, computeWorkers: 2, slots: 2 };
    });

    await check('keyboard selects controlled pipeline and completes three fixed journeys', async () => {
      await page.reload();
      await page.locator('#promotion-path').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#promotion-path').inputValue(), 'pipeline');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture-choice');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'journey-budget');
      await page.keyboard.press('Control+A');
      await page.keyboard.type('250');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'assess-candidate');
      await page.keyboard.press('Enter');
      assert.equal((await dom(page)).phase, 'ready');
      assert.equal((await dom(page)).desiredRoute, 'old-v1');
      await page.locator('#promote-candidate').focus();
      await page.keyboard.press('Space');
      assert.equal((await dom(page)).phase, 'promoted');
      assert.equal((await dom(page)).observedRoute, 'not-observed');
      await page.locator('#measure-journeys').focus();
      await page.keyboard.press('Enter');
      const result = await dom(page);
      assert.match(result.result, /synthetic-uninterrupted: 3\/3 migration successes; 0 interruptions; 0 unknowns/);
      assert.deepEqual(result.receipts.map((receipt) => receipt.outcome), ['success', 'success', 'success']);
      assert.match(result.actions[1], /Explicit pipeline/);
      return { keys: ['ArrowDown', 'Tab', 'Control+A', '250', 'Tab', 'Enter', 'Space', 'Enter'], path: 'pipeline' };
    });

    await check('manual readiness and desired promotion are not unmeasured migration', async () => {
      await page.reload();
      await start(page);
      const ready = await dom(page);
      assert.equal(ready.phase, 'ready');
      assert.equal(ready.desiredRoute, 'old-v1');
      assert.equal(ready.receipts.length, 0);
      assert.equal(await page.locator('#measure-journeys').isDisabled(), true);
      assert.equal(await page.locator('#fixture-choice').isDisabled(), true);
      await page.locator('#promote-candidate').click();
      const promoted = await dom(page);
      assert.equal(promoted.desiredRoute, 'candidate-v2');
      assert.equal(promoted.observedRoute, 'not-observed');
      assert.equal(promoted.formerWorkers, 'recycled');
      assert.match(promoted.placement, /production: candidate-v2; staging: old-v1/);
      assert.equal(promoted.receipts.length, 0);
      assert.match(promoted.result, /No run measured/);
      await page.locator('#measure-journeys').click();
      assert.equal((await dom(page)).observedRoute, 'candidate-v2');
      return { productionTarget: true, explicitManualPromotion: true, measurementRequired: true };
    });

    for (const [fixture, code] of [
      ['warmup-503', 'WARMUP_STATUS'], ['config-mismatch', 'TARGET_CONFIGURATION'],
      ['overlap-deficit', 'OVERLAP_CAPACITY'],
    ]) {
      await check(`${fixture} aborts before exposure; old-only success is zero migration`, async () => {
        await page.reload();
        await start(page, fixture);
        const aborted = await dom(page);
        assert.equal(aborted.phase, 'aborted');
        assert.equal(aborted.desiredRoute, 'old-v1');
        assert.ok(aborted.gates.some((gate) => gate.startsWith(`BLOCKED ${code}`)));
        if (fixture === 'config-mismatch') assert.ok(aborted.gates.some((gate) => gate.startsWith('PASS WARMUP_STATUS')));
        assert.equal(await page.locator('#promote-candidate').isDisabled(), true);
        await page.locator('#measure-journeys').click();
        const result = await dom(page);
        assert.match(result.result, /safe-abort: 3\/3 old-only production successes; 0 attempted transitions; no migration percentage/);
        assert.equal(result.observedRoute, 'old-only');
        assert.equal(result.aggregate, '0 attempted transitions; no transition success percentage.');
        assert.ok(result.receipts.every((receipt) => receipt.columns[1].includes('old-v1')));
        return { blockedGate: code, oldOnlyProductionSuccesses: 3, attemptedTransitions: 0 };
      });
    }

    await check('former-worker loss is interruption; rollback and reset retain it', async () => {
      await page.reload();
      await exposed(page, 'recycle-loss');
      const lost = await dom(page);
      assert.match(lost.result, /interrupted: 2\/3 migration successes; 1 interruptions; 0 unknowns/);
      assert.equal(lost.receipts[2].outcome, 'interruption');
      assert.match(lost.receipts[2].columns[3], /FORMER_WORKER_RECYCLED/);
      await page.locator('#request-rollback').click();
      const recovery = await dom(page);
      assert.equal(recovery.phase, 'recovery-requested');
      assert.equal(recovery.desiredRoute, 'old-v1');
      assert.equal(recovery.observedRoute, 'not-observed-after-recovery');
      assert.match(recovery.history[0].text, /1 interruptions/);
      assert.match(recovery.history[0].text, /Recovery requested, not verified/);
      await page.locator('#reset-lesson').click();
      const reset = await dom(page);
      assert.equal(reset.phase, 'idle');
      assert.equal(reset.focusedId, 'promotion-path');
      assert.equal(reset.history.length, 1);
      assert.match(reset.history[0].text, /FORMER_WORKER|interruptions/);
      return { migrationSuccesses: 2, interruptions: 1, unknowns: 0, recoveryObserved: false, failureRetained: true };
    });

    await check('missing receipt and destination evidence retain unknown denominator', async () => {
      await page.reload();
      await exposed(page, 'missing-observation');
      const result = await dom(page);
      assert.match(result.result, /unverified: 1\/3 migration successes; 0 interruptions; 2 unknowns/);
      assert.deepEqual(result.receipts.map((receipt) => receipt.outcome), ['success', 'unknown', 'unknown']);
      assert.equal(result.observedRoute, 'partially-observed');
      assert.match(result.receipts[1].columns[3], /CLIENT_RECEIPT_UNOBSERVED/);
      assert.match(result.receipts[2].columns[3], /DESTINATION_VERSION_UNOBSERVED/);
      return { attemptedTransitions: 3, successes: 1, interruptions: 0, unknowns: 2 };
    });

    await check('positive, negative and unknown comparisons retain history and aggregate', async () => {
      await page.reload();
      for (const fixture of ['recycle-loss', 'missing-observation', 'healthy']) {
        await exposed(page, fixture);
        await page.locator('#reset-lesson').click();
      }
      const result = await dom(page);
      assert.deepEqual(result.history.map((run) => run.outcome), ['interrupted', 'unverified', 'synthetic-uninterrupted']);
      assert.equal(result.aggregate, '9 attempted transitions: 6 successes; 1 interruptions; 2 unknowns. No independent reliability estimate.');
      return { runs: 3, attempts: 9, successes: 6, interruptions: 1, unknowns: 2 };
    });

    await check('raw numeric errors focus alert without changing state; correction works', async () => {
      await page.reload();
      const rejected = ['', ' 250', '250 ', '0250', '+250', '-250', '250.0', '2.5e2', 'NaN', 'Infinity', '99', '501'];
      for (const raw of rejected) {
        await page.locator('#journey-budget').fill(raw);
        await page.locator('#assess-candidate').click();
        const result = await dom(page);
        assert.equal(result.phase, 'idle');
        assert.equal(result.desiredRoute, 'old-v1');
        assert.equal(result.history.length, 0);
        assert.equal(result.errorHidden, false);
        assert.match(result.error, /INPUT_FORMAT/);
        assert.equal(result.focusedId, 'lesson-error');
      }
      await page.locator('#journey-budget').fill('250');
      await page.locator('#assess-candidate').click();
      assert.equal((await dom(page)).phase, 'ready');
      assert.equal((await dom(page)).errorHidden, true);
      return { rejectedRawValues: rejected, unchangedHistory: true, correctedInputAccepted: true };
    });

    await check('DOM tampering cannot enable unsupported native auto-swap', async () => {
      await page.reload();
      await page.evaluate(() => {
        const option = document.querySelector('option[value="native-auto-swap"]');
        option.disabled = false;
        document.getElementById('promotion-path').value = option.value;
      });
      await page.locator('#assess-candidate').click();
      const result = await dom(page);
      assert.equal(result.phase, 'idle');
      assert.equal(result.history.length, 0);
      assert.match(result.error, /UNSUPPORTED_PATH.*unsupported on Linux/);
      assert.equal(result.focusedId, 'lesson-error');
      assert.equal(await page.locator('option[value="native-auto-swap"]').isDisabled(), true);
      await page.locator('#reset-lesson').click();
      assert.equal(await page.locator('#promotion-path').inputValue(), 'manual');
      assert.equal(await page.locator('option[value="native-auto-swap"]').isDisabled(), true);
      assert.equal((await dom(page)).errorHidden, true);
      return { attemptedOption: 'native-auto-swap', rejected: true, exposure: false };
    });

    await check('premature DOM-enabled actions fail closed and reset clears errors', async () => {
      await page.reload();
      for (const id of ['promote-candidate', 'measure-journeys', 'request-rollback']) {
        await page.evaluate((buttonId) => { document.getElementById(buttonId).disabled = false; }, id);
        await page.locator(`#${id}`).click();
        const result = await dom(page);
        assert.equal(result.phase, 'idle');
        assert.equal(result.desiredRoute, 'old-v1');
        assert.match(result.error, /STATE_GUARD/);
        assert.equal(result.focusedId, 'lesson-error');
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Enter');
      const reset = await dom(page);
      assert.equal(reset.errorHidden, true);
      assert.equal(reset.focusedId, 'promotion-path');
      return { forcedControls: 3, stateGuarded: true, keyboardResetClearedAlert: true };
    });

    await check('reset archives exposed unfinished work as three unknowns, not success', async () => {
      await page.reload();
      await start(page);
      await page.locator('#promote-candidate').click();
      await page.locator('#reset-lesson').click();
      const result = await dom(page);
      assert.equal(result.history.length, 1);
      assert.equal(result.history[0].outcome, 'cancelled');
      assert.match(result.history[0].text, /0\/3 migration successes; 0 interruptions; 3 unknowns/);
      assert.equal(result.focusedId, 'promotion-path');
      assert.equal(await page.locator('#journey-budget').inputValue(), '250');
      assert.equal(await page.locator('#fixture-choice').inputValue(), 'healthy');
      assert.equal(await page.evaluate(() => typeof document.getElementById('lesson-form').reset), 'function');
      return { unfinishedAttempts: 3, unknowns: 3, nativeResetMethodPreserved: true };
    });

    await check('six archived runs enforce bound without deletion or duplicate resets', async () => {
      await page.reload();
      for (let run = 0; run < 6; run += 1) {
        await exposed(page);
        await page.locator('#reset-lesson').click();
      }
      assert.equal(await page.locator('#assess-candidate').isDisabled(), true);
      await page.locator('#reset-lesson').click();
      assert.equal((await dom(page)).history.length, 6);
      await page.evaluate(() => { document.getElementById('assess-candidate').disabled = false; });
      await page.locator('#assess-candidate').click();
      const result = await dom(page);
      assert.equal(result.history.length, 6);
      assert.match(result.error, /RUN_LIMIT/);
      return { maximumRuns: 6, retainedRuns: 6, seventhRejected: true };
    });

    await check('slow HTTP 200 receipts violate tighter original journey budget', async () => {
      await page.reload();
      await exposed(page, 'healthy', '150');
      const result = await dom(page);
      assert.match(result.result, /interrupted: 1\/3 migration successes; 2 interruptions; 0 unknowns/);
      assert.ok(result.receipts.slice(1).every((receipt) => receipt.columns[2].includes('HTTP 200')));
      assert.ok(result.receipts.slice(1).every((receipt) => receipt.columns[3].includes('ORIGINAL_BUDGET_EXCEEDED')));
      return { originalBudgetMs: 150, successes: 1, interruptions: 2, httpStatusStill200: true };
    });

    await check('actual Chromium CSP blocks inline script, inline style and data connection', async () => {
      await page.reload();
      const result = await page.evaluate(async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (event) => violations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
          disposition: event.disposition, originalPolicy: event.originalPolicy,
        }));
        const script = document.createElement('script');
        script.textContent = 'window.__S122_INLINE_EXECUTED = true;';
        document.head.append(script);
        const style = document.createElement('style');
        style.textContent = 'body { --s122-forbidden-inline: applied; }';
        document.head.append(style);
        let connectionRejected = false;
        try { await fetch('data:text/plain,S122-CSP-probe'); } catch { connectionRejected = true; }
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          inlineExecuted: window.__S122_INLINE_EXECUTED === true,
          inlineStyleApplied: getComputedStyle(document.body).getPropertyValue('--s122-forbidden-inline').trim(),
          connectionRejected, violations,
          csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
        };
      });
      assert.equal(result.inlineExecuted, false);
      assert.equal(result.inlineStyleApplied, '');
      assert.equal(result.connectionRejected, true);
      for (const directive of ['script-src-elem', 'style-src-elem', 'connect-src']) {
        assert.ok(result.violations.some((violation) => violation.effectiveDirective === directive), directive);
      }
      assert.ok(result.violations.every((violation) => violation.disposition === 'enforce'));
      assert.equal(networkRequests.length, 0);
      assert.deepEqual(pageErrors, []);
      return result;
    });

    assert.equal(observations.length, 16);
    assert.ok(observations.every((observation) => observation.passed));
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(networkRequests, []);
    passed = true;
  } catch (error) {
    failure = { name: error.name, code: error.code, message: error.message };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        cleanup = 'awaited session.close() in finally completed';
      }
      assert.deepEqual(byteInventory(), before, 'browser verification must not modify source or historical proof');
      bytePreservation = true;
    } catch (error) {
      passed = false;
      cleanup = `cleanup/integrity failure: ${error.message}`;
      failure = { name: error.name, code: error.code, message: error.message };
      throw error;
    } finally {
      if (capture) {
        const destination = path.join(root, 'evidence', 'browser');
        fs.mkdirSync(destination, { recursive: true });
        const index = fs.readdirSync(destination).filter((name) => /^capture-\d{3}\.json$/.test(name)).length + 1;
        const label = `capture-${String(index).padStart(3, '0')}`;
        const archive = zlib.gzipSync(Buffer.from(JSON.stringify({
          format: 'exact raw bytes, base64; no line-ending normalization', files: rawSources,
        })));
        fs.writeFileSync(path.join(destination, `${label}.sources.raw.gz`), archive, { flag: 'wx' });
        const report = {
          cardId: 'A-S122', workerId: 'worker-A-S122', mode: 'local-synthetic', banner: BANNER,
          recordedAtUtc, completedAtUtc: new Date().toISOString(),
          nodeVersion: process.version,
          playwrightVersion: require('..\\..\\..\\testing\\browser\\node_modules\\playwright\\package.json').version,
          browserVersion: session && session.browserVersion, helperSha256: HELPER_SHA,
          helperPublication: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
          verifierPassed: passed, checksPassed: observations.filter((observation) => observation.passed).length,
          failure, observations, pageErrors, networkRequests, cleanup, bytePreservation,
          sourceArchive: { path: `evidence\\browser\\${label}.sources.raw.gz`, bytes: archive.length, sha256: sha(archive) },
          rawSources: rawSources.map(({ base64, ...metadata }) => metadata),
          nativeAzureValidated: false, productionNode24Validated: false, sourceParentComplete: false, extraCredits: 0,
        };
        fs.writeFileSync(path.join(destination, `${label}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
