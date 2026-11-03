'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(helper)), helperSha256);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const runId = process.env.BROWSER_EVIDENCE_RUN || '001';
const canonicalHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
const evidenceDigest = () => {
  const entries = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else entries.push([path.relative(root, target), sha(fs.readFileSync(target))]);
    }
  }
  walk(path.join(root, 'evidence'));
  return entries.sort(([left], [right]) => left.localeCompare(right));
};

test('real isolated S054 DOM: sequence, independent dependencies, failure/unknown, keyboard/errors, retained history, reset and CSP',
  { timeout: 240000 }, async () => {
    const savedProofBefore = capture ? null : evidenceDigest();
    if (capture) {
      assert.match(runId, /^\d{3}$/);
      assert.equal(fs.existsSync(path.join(root, 'evidence', `browser-${runId}.json`)), false,
        'Use a new deliberate evidence run ID; saved proof is never overwritten.');
    }
    const proof = {
      schemaVersion: 1, cardId: 'A-S054', workerId: 'worker-A-S054', mode: 'synthetic',
      entry: 'learning\\S054\\index.html', runtime: process.version, playwrightVersion,
      captureExplicitlyEnabled: capture, startedAtUtc: new Date().toISOString(),
      helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperSha256, publication: '53c0c0d' },
      testedSourceHashes: Object.fromEntries(['index.html', 'styles.css', 'fixtures.js', 'model.js',
        'lesson.js', 'manifest.json', 'tests\\browser.test.cjs'].map((file) => [file, canonicalHash(file)])),
      outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
      exerciseNetworkRequests: [], probeRequests: [], probeResponses: [], cleanup: {},
    };
    let session;
    let stage = 'exercise';
    try {
      assert.equal(process.version, 'v22.23.4');
      assert.equal(playwrightVersion, '1.56.1');
      session = await openIsolatedLesson('learning\\S054\\index.html');
      proof.browserVersion = session.browserVersion;
      assert.match(proof.browserVersion, /^156\./);
      const page = session.page;
      page.on('pageerror', (error) => proof.pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
      });
      page.on('request', (request) => {
        if (/^https?:/i.test(request.url())) {
          (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests)
            .push({ url: request.url(), method: request.method() });
        }
      });
      page.on('response', (response) => {
        if (stage === 'csp-probes' && /^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
      });
      const text = (id) => page.locator(`#${id}`).innerText();
      const press = async (id, key = 'Enter') => {
        await page.locator(`#${id}`).focus();
        await page.keyboard.press(key);
      };
      const forceClick = async (id) => page.locator(`#${id}`)
        .evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      const snapshot = async (name) => {
        proof.observations.push({
          name, phase: await text('phase'), gate: await text('gate'), impact: await text('impact'),
          completion: await text('completion'), dependencies: await text('dependencies'),
          metrics: await text('metrics'), reason: await text('reason'), alert: await text('input-error'),
          reads: await page.locator('#reads tr').evaluateAll((rows) =>
            rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
          history: await page.locator('#history tr').evaluateAll((rows) =>
            rows.map((row) => [...row.cells].map((cell) => cell.textContent))),
          trace: await page.locator('#trace li').allTextContents(),
          focus: await page.evaluate(() => document.activeElement.id),
        });
      };
      const defaults = async () => {
        assert.equal(await page.locator('#migration').inputValue(), 'faithful');
        assert.equal(await page.locator('#observation').inputValue(), 'complete');
        assert.equal(await page.locator('#old-consumers').inputValue(), '2');
        assert.equal(await page.locator('#old-work').inputValue(), '1');
      };
      const exactReset = async () => {
        await press('reset-rehearsal', 'Space');
        await defaults();
        assert.equal(await page.evaluate(() => document.activeElement.id), 'migration');
        assert.equal(await text('phase'), 'Phase: idle');
        assert.equal(await text('gate'), 'Contraction gate: not evaluated');
        assert.equal(await text('impact'), 'Synthetic user impact: not evaluated');
        assert.equal(await text('completion'), 'No completed migration.');
        assert.equal(await text('metrics'), 'No read observations.');
        assert.equal(await text('dependencies'), 'No active dependencies measured.');
        assert.equal(await text('trace'), 'No active attempt.');
        assert.equal(await text('history'), 'No attempts yet.');
        assert.equal(await page.locator('#history tr[data-attempt]').count(), 0);
        assert.equal(await page.locator('#input-error').isHidden(), true);
        assert.equal(await page.locator('#input-error').textContent(), '');
        assert.equal(await page.locator('[aria-invalid]').count(), 0);
        assert.equal(await page.locator('#history-limit').isHidden(), true);
        assert.equal(await page.locator('#event-limit').isHidden(), true);
        assert.equal(await page.locator('#configuration').evaluate((fieldset) => fieldset.disabled), false);
        assert.equal(await page.locator('#begin').isDisabled(), false);
        for (const id of ['expand', 'migrate', 'contract', 'upgrade', 'drain', 'new-attempt']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
        }
      };
      const newAttempt = async () => {
        const priorRows = await page.locator('#history tr[data-attempt]').count();
        await press('new-attempt', 'Space');
        assert.equal(await text('phase'), 'Phase: idle');
        assert.equal(await text('metrics'), 'No read observations.');
        assert.equal(await text('trace'), 'No active attempt.');
        assert.equal(await page.locator('#history tr[data-attempt]').count(), priorRows);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'migration');
        await defaults();
      };
      const runToMigration = async () => {
        await press('begin');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'expand');
        await page.keyboard.press('Space');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'migrate');
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'contract');
      };

      assert.equal(await page.title(), 'S054 · Database expand-migrate-contract rehearsal');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.evaluate(() => typeof document.getElementById('setup-form').reset), 'function');
      await defaults();
      await page.locator('#migration').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'observation');
      proof.keyboardFocusStyle = await page.locator('#observation').evaluate((input) => ({
        style: getComputedStyle(input).outlineStyle, width: getComputedStyle(input).outlineWidth,
      }));
      assert.deepEqual(proof.keyboardFocusStyle, { style: 'solid', width: '3px' });

      await forceClick('migrate');
      assert.match(await text('input-error'), /active attempt/);
      assert.equal(await text('phase'), 'Phase: idle');
      assert.equal(await text('history'), 'No attempts yet.');
      await snapshot('idle state guard rejects a forced disabled action without mutation');
      await page.locator('#old-consumers').fill('');
      await press('begin');
      assert.match(await text('input-error'), /empty values are not zero/);
      assert.equal(await page.locator('#old-consumers').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'old-consumers');
      await page.locator('#old-consumers').fill('1.5');
      await press('begin');
      assert.match(await text('input-error'), /whole number/);
      await page.locator('#old-consumers').fill('5');
      await press('begin');
      assert.match(await text('input-error'), /0 to 4/);
      await page.locator('#old-consumers').fill('2');
      await page.locator('#observation').evaluate((select) => {
        select.add(new Option('Unlisted test input', 'unlisted'));
        select.value = 'unlisted';
      });
      await press('begin');
      assert.match(await text('input-error'), /Observation must be a listed fixture/);
      assert.equal(await page.locator('#observation').getAttribute('aria-invalid'), 'true');
      assert.equal(await text('history'), 'No attempts yet.');
      await snapshot('strict numeric and enum input guards do not create an attempt');
      await exactReset();

      await press('begin');
      assert.equal(await text('phase'), 'Phase: baseline · attempt 1/6');
      assert.equal(await page.locator('#configuration').evaluate((fieldset) => fieldset.disabled), true);
      await forceClick('migrate');
      assert.match(await text('input-error'), /expanded phase/);
      assert.equal(await page.locator('#trace li').count(), 1);
      await snapshot('baseline phase guard preserves the locked attempt');
      await page.locator('#migration').evaluate((select) => { select.value = 'corrupt-first'; });
      await page.locator('#observation').evaluate((select) => { select.value = 'none'; });
      await press('expand');
      await defaults();
      assert.match(await text('metrics'), /8 expected reads; 8 observed; 8 passed; 0 failed; 0 unknown; 0\/4/);
      assert.equal(await page.locator('#reads tr').count(), 8);
      assert.equal(await page.locator('#reads').getByText('legacy fallback preserved the new bridge reader', { exact: true }).count(), 4);
      await snapshot('additive expansion keeps eight overlap reads correct and ignores locked DOM tampering');
      await press('contract', 'Space');
      assert.equal(await text('gate'), 'Contraction gate: FAIL — BLOCKED');
      assert.equal(await text('impact'), 'Synthetic user impact: SAFE_ABORT');
      assert.match(await text('reason'), /expand, then migrate/);
      await snapshot('contraction before migration is a safe abort with old structure retained');
      await press('migrate');
      assert.match(await text('metrics'), /8 expected reads; 8 observed; 8 passed; 0 failed; 0 unknown; 4\/4/);
      assert.equal(await text('completion'), 'No completed migration.');
      await page.keyboard.press('Space');
      assert.equal(await text('gate'), 'Contraction gate: FAIL — BLOCKED');
      assert.match(await text('reason'), /2 old consumers/);
      assert.match(await text('reason'), /1 old work/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'upgrade');
      await snapshot('faithful migrated data still blocks contraction while old consumers and work remain');
      await page.keyboard.press('Enter');
      assert.match(await text('dependencies'), /0 old consumers; 4 new consumers; 1 old work pending/);
      await page.keyboard.press('Enter');
      assert.match(await text('reason'), /1 old work/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'drain');
      await snapshot('upgrading consumers does not erase the independent old-work gate');
      await page.keyboard.press('Space');
      assert.match(await text('dependencies'), /0 old work pending; 1 old work completed; legacy structure retained/);
      await page.keyboard.press('Enter');
      assert.equal(await text('gate'), 'Contraction gate: PASS — ALLOWED');
      assert.equal(await text('impact'), 'Synthetic user impact: UNINTERRUPTED');
      assert.match(await text('completion'), /^Synthetic contraction complete/);
      assert.match(await text('metrics'), /4 expected reads; 4 observed; 4 passed; 0 failed; 0 unknown/);
      assert.match(await text('dependencies'), /legacy structure removed/);
      assert.equal(await page.locator('#reads tr').count(), 4);
      assert.equal(await page.locator('#reads tr').evaluateAll((rows) => rows.every((row) =>
        row.cells[1].textContent === 'new' && row.cells[2].textContent === 'PASS')), true);
      await snapshot('ordered fully observed contraction succeeds only after both dependency types disappear');

      await newAttempt();
      await page.locator('#history tr[data-attempt="1"] summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history tr[data-attempt="1"] details').evaluate((details) => details.open), true);
      assert.match(await text('history'), /expand, then migrate/);
      assert.match(await text('history'), /1 old work/);
      await page.locator('#old-consumers').fill('0');
      await page.locator('#old-work').fill('2');
      await runToMigration();
      await page.keyboard.press('Space');
      assert.match(await text('reason'), /2 old work/);
      assert.doesNotMatch(await text('reason'), /old consumers still/);
      await snapshot('zero old consumers still leaves two independently blocking old work items');
      await press('drain');
      await page.keyboard.press('Enter');
      assert.equal(await text('gate'), 'Contraction gate: PASS — ALLOWED');

      await newAttempt();
      await page.locator('#migration').selectOption('corrupt-first');
      await runToMigration();
      assert.match(await text('metrics'), /8 expected reads; 8 observed; 7 passed; 1 failed; 0 unknown; 4\/4/);
      assert.equal(await text('impact'), 'Synthetic user impact: INTERRUPTED');
      assert.match(await text('reads'), /Wrong synthetic label/);
      assert.equal(await page.locator('#upgrade').isDisabled(), true);
      await page.keyboard.press('Space');
      assert.equal(await text('gate'), 'Contraction gate: FAIL — BLOCKED');
      assert.equal(await text('impact'), 'Synthetic user impact: INTERRUPTED');
      const failedTrace = await text('trace');
      await forceClick('upgrade');
      assert.match(await text('input-error'), /fully verified migration/);
      assert.equal(await text('trace'), failedTrace);
      await snapshot('corrupt migration visibly fails a new-reader journey; an upgrade cannot waive it');

      await newAttempt();
      await page.locator('#observation').selectOption('partial');
      await page.locator('#old-consumers').fill('0');
      await page.locator('#old-work').fill('0');
      await runToMigration();
      await page.keyboard.press('Space');
      assert.equal(await text('gate'), 'Contraction gate: UNKNOWN — BLOCKED');
      assert.equal(await text('impact'), 'Synthetic user impact: UNKNOWN');
      assert.match(await text('metrics'), /8 expected reads; 2 observed; 2 passed; 0 failed; 6 unknown/);
      await snapshot('partial faithful observations are unknown even without old dependencies');

      await newAttempt();
      await page.locator('#migration').selectOption('corrupt-first');
      await page.locator('#observation').selectOption('none');
      await page.locator('#old-consumers').fill('0');
      await page.locator('#old-work').fill('0');
      await runToMigration();
      await page.keyboard.press('Space');
      assert.equal(await text('gate'), 'Contraction gate: UNKNOWN — BLOCKED');
      assert.match(await text('metrics'), /8 expected reads; 0 observed; 0 passed; 0 failed; 8 unknown/);
      assert.doesNotMatch(await text('reads'), /Wrong synthetic label/);
      await snapshot('absent observations cannot infer a selected corrupt fixture as observed failure or success');

      await newAttempt();
      await page.locator('#migration').selectOption('corrupt-first');
      await page.locator('#observation').selectOption('partial');
      await page.locator('#old-consumers').fill('0');
      await page.locator('#old-work').fill('0');
      await runToMigration();
      await page.keyboard.press('Space');
      assert.equal(await text('gate'), 'Contraction gate: FAIL — BLOCKED');
      assert.equal(await text('impact'), 'Synthetic user impact: INTERRUPTED');
      assert.match(await text('metrics'), /8 expected reads; 2 observed; 1 passed; 1 failed; 6 unknown/);
      assert.equal(await page.locator('#history tr[data-attempt]').count(), 6);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#history-limit').isVisible(), true);
      const retained = await text('history');
      await forceClick('new-attempt');
      assert.match(await text('input-error'), /History full/);
      assert.equal(await text('history'), retained);
      await snapshot('known failure dominates partial uncertainty; six retained attempts cannot be evicted');
      for (let count = 4; count < 12; count++) await press('contract');
      assert.equal(await page.locator('#trace li').count(), 12);
      assert.equal(await page.locator('#event-limit').isVisible(), true);
      assert.equal(await page.locator('#contract').isDisabled(), true);
      const cappedTrace = await text('trace');
      await forceClick('contract');
      assert.match(await text('input-error'), /Event limit/);
      assert.equal(await text('trace'), cappedTrace);
      await snapshot('twelve-event state guard retains the entire trace without mutation');

      await page.setViewportSize({ width: 320, height: 800 });
      proof.smallViewport = await page.evaluate(() => ({
        width: innerWidth, pageWidth: document.documentElement.scrollWidth,
        noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      }));
      assert.equal(proof.smallViewport.noPageHorizontalOverflow, true);
      await exactReset();
      await snapshot('exact keyboard reset from failed, full retained history clears results, errors and limits');
      await press('begin');
      await page.keyboard.press('Space');
      assert.match(await text('phase'), /^Phase: expanded/);
      await exactReset();
      await snapshot('exact keyboard reset also clears an active expanded overlap');

      stage = 'csp-probes';
      const probe = await page.evaluate(async () => {
        window.__s054InlineExecuted = false;
        window.__s054Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s054Violations.push({
            effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
          });
        });
        const script = document.createElement('script');
        script.textContent = 'window.__s054InlineExecuted = true;';
        document.head.append(script);
        let fetchRejected = false;
        try { await fetch('https://csp-probe.invalid/S054'); } catch { fetchRejected = true; }
        script.remove();
        return { fetchRejected };
      });
      await page.waitForFunction(() => window.__s054Violations.some((entry) => entry.effectiveDirective === 'connect-src')
        && window.__s054Violations.some((entry) => entry.effectiveDirective.startsWith('script-src')),
      undefined, { timeout: 5000 });
      proof.csp = await page.evaluate((result) => ({
        ...result, inlineExecuted: window.__s054InlineExecuted, violations: window.__s054Violations,
      }), probe);
      assert.equal(proof.csp.fetchRejected, true);
      assert.equal(proof.csp.inlineExecuted, false);
      assert.ok(proof.csp.violations.every((entry) => entry.disposition === 'enforce'));
      assert.deepEqual(proof.probeResponses, []);
      assert.deepEqual(proof.exerciseNetworkRequests, []);
      assert.deepEqual(proof.pageErrors, []);
      assert.ok(proof.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
      proof.outcome = 'PASS';
    } catch (error) {
      proof.failure = { name: error.name, message: error.message, stack: error.stack };
      throw error;
    } finally {
      try {
        if (session) await session.close();
        proof.cleanup = { sessionCloseAwaited: Boolean(session), serversStarted: 0, foregroundLeaseUsed: false };
      } catch (error) {
        proof.outcome = 'FAIL';
        proof.cleanup = { sessionCloseAwaited: Boolean(session), error: error.message };
        throw error;
      } finally {
        proof.completedAtUtc = new Date().toISOString();
        if (capture) {
          fs.writeFileSync(path.join(root, 'evidence', `browser-${runId}.json`),
            `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
        } else {
          assert.deepEqual(evidenceDigest(), savedProofBefore, 'Normal verification is read-only to saved proof.');
        }
      }
    }
  });
