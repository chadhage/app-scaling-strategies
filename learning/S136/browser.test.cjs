'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const helperPath = path.resolve(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const expectedHelperSha = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(sha256(fs.readFileSync(helperPath)), expectedHelperSha);
const { openIsolatedLesson } = require(helperPath);
const lessonPath = path.join('learning', 'S136', 'index.html');
const evidencePath = path.join(__dirname, 'evidence', 'browser.json');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function existingEvidence() {
  return fs.existsSync(evidencePath) ? sha256(fs.readFileSync(evidencePath)) : null;
}

async function readOutcome(page) {
  return page.evaluate(() => {
    const text = (id) => document.getElementById(id).textContent;
    return {
      sample: text('sample-connection'), console: text('console-connection'),
      otherWorkers: text('worker-connection'), pending: text('pending-count'),
      effects: text('effect-count'), acknowledgments: text('ack-count'),
      confirmed: text('confirmed-count'), elapsed: text('elapsed'),
      verdict: text('verdict'), impact: text('impact'), reasons: text('reasons'),
      queue: text('queue-summary'), rows: text('operation-rows'),
      journalLimit: text('journal-limit'), history: text('history'),
      focus: document.activeElement.id,
    };
  });
}

async function prepare(page, fixture = 'clean', timing = 'within-budget') {
  await page.locator('#restart').click();
  await page.locator('#fixture').selectOption(fixture);
  await page.locator('#timing').selectOption(timing);
  for (const action of ['sample-offline', 'queue-changes', 'sample-online']) {
    await page.locator(`#${action}`).click();
  }
}

test('actual isolated S136 DOM, keyboard, failure and CSP observations', { timeout: 120000 }, async (t) => {
  const originalDigest = existingEvidence();
  const report = {
    cardId: 'A-S136', workerId: 'worker-A-S136', mode: 'local-synthetic-only',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    startedAt: new Date().toISOString(), nodeVersion: process.version,
    playwrightVersion: require(path.join(path.dirname(helperPath), 'node_modules', 'playwright', 'package.json')).version,
    helperSha256: expectedHelperSha, helperPublishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
    lessonPath, captureRequestedExactly: capture, checks: [], closedSessions: 0,
    qualificationLimit: 'Individual observed file-lesson run only; inactive recovery prototype and broader unattended lifecycle remain unqualified. Not Node 24/native/source-parent proof.',
    files: Object.fromEntries(['index.html', 'model.js', 'lesson.js', 'style.css'].map((name) => [name, sha256(fs.readFileSync(path.join(__dirname, name)))])),
  };
  async function check(name, body) {
    await t.test(name, async () => {
      try {
        const observation = await body();
        report.checks.push({ name, status: 'passed', observation });
      } catch (error) {
        report.checks.push({ name, status: 'failed', error: error.message });
        throw error;
      }
    });
  }
  let primary;
  try {
    try {
      primary = await openIsolatedLesson(lessonPath);
      report.browserVersion = primary.browserVersion;
      const page = primary.page;
      const pageErrors = [];
      const requests = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) => requests.push(request.url()));
      await page.reload({ waitUntil: 'load' });

      await check('initial DOM, exact training banner and keyboard tab order', async () => {
        assert.equal(await page.locator('.banner').textContent(), report.banner);
        assert.match(await page.title(), /S136/);
        assert.equal(await page.locator('#action-error').isVisible(), false);
        assert.equal(await page.locator('#fatal-error').isVisible(), false);
        await page.locator('#fixture').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'timing');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'sample-offline');
        assert.equal(await page.locator('#inspect-console').isEnabled(), true);
        assert.equal(await page.locator('#restart').isEnabled(), true);
        const outcome = await readOutcome(page);
        assert.equal(outcome.effects, 'Not observed');
        assert.match(outcome.verdict, /Unknown/);
        return outcome;
      });

      await check('keyboard offline action preserves console; clean synchronization is measured', async () => {
        await page.keyboard.press('Enter');
        assert.match(await page.locator('#sample-connection').textContent(), /^Offline/);
        assert.equal(await page.locator('#inspect-console').isEnabled(), true);
        assert.equal(await page.locator('#restart').isEnabled(), true);
        await page.locator('#inspect-console').focus();
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#console-inspections').textContent(), '1');
        const offline = await readOutcome(page);
        assert.match(offline.sample, /^Offline/);
        assert.match(offline.console, /Available; never disconnected/);
        assert.match(offline.otherWorkers, /Two available; unaffected/);
        for (const [action, key] of [['queue-changes', 'Enter'], ['sample-online', 'Space'], ['synchronize', 'Enter']]) {
          await page.locator(`#${action}`).focus();
          await page.keyboard.press(key);
        }
        const completed = await readOutcome(page);
        assert.match(completed.verdict, /^positive — PASS/);
        assert.equal(completed.impact, 'completed');
        assert.equal(completed.pending, '0');
        assert.equal(completed.effects, '2');
        assert.equal(completed.acknowledgments, '2');
        assert.equal(completed.confirmed, '2');
        assert.match(completed.rows, /fictional-user-136; v2/);
        return { offline, completed };
      });

      await check('missing acknowledgment is unknown; same-ID retry retains history and one effect', async () => {
        await prepare(page, 'missing-ack');
        await page.locator('#synchronize').click();
        const unresolved = await readOutcome(page);
        assert.match(unresolved.verdict, /^unknown — INCONCLUSIVE/);
        assert.equal(unresolved.impact, 'unresolved');
        assert.equal(unresolved.pending, '1');
        assert.equal(unresolved.effects, '2');
        assert.equal(unresolved.acknowledgments, '1');
        assert.match(unresolved.queue, /change-136-1/);
        assert.equal(await page.locator('#retry-ack').isEnabled(), true);
        await page.locator('#retry-ack').focus();
        await page.keyboard.press('Space');
        const retried = await readOutcome(page);
        assert.match(retried.verdict, /^positive/);
        assert.equal(retried.effects, '2');
        assert.equal(retried.pending, '0');
        assert.equal(await page.locator('#operation-rows tr').first().locator('td').last().textContent(), '2');
        assert.match(retried.history, /unknown \/ unresolved/);
        assert.equal(await page.locator('#retry-ack').isEnabled(), false);
        return { unresolved, retried };
      });

      await check('actual conflict is negative, remains pending and offers no invented merge', async () => {
        await prepare(page, 'conflict');
        await page.locator('#synchronize').click();
        const outcome = await readOutcome(page);
        assert.match(outcome.verdict, /^negative — FAIL/);
        assert.equal(outcome.impact, 'interrupted');
        assert.equal(outcome.pending, '1');
        assert.equal(outcome.effects, '1');
        assert.match(outcome.queue, /change-136-2/);
        assert.match(outcome.reasons, /conflict; no merge or success inferred/);
        assert.equal(await page.locator('#retry-ack').isEnabled(), false);
        return outcome;
      });

      await check('actual missing, duplicate, identity and budget failures do not masquerade as success', async () => {
        const outcomes = [];
        for (const [fixture, timing, effects, pending] of [
          ['missing-effect', 'within-budget', '1', '1'],
          ['duplicate-effect', 'within-budget', '3', '1'],
          ['identity-rejected', 'within-budget', '1', '1'],
          ['clean', 'offline-over-budget', '2', '0'],
          ['clean', 'recovery-over-budget', '2', '0'],
        ]) {
          await prepare(page, fixture, timing);
          await page.locator('#synchronize').click();
          const outcome = await readOutcome(page);
          assert.match(outcome.verdict, /^negative — FAIL/);
          assert.equal(outcome.impact, 'interrupted');
          assert.equal(outcome.effects, effects);
          assert.equal(outcome.pending, pending);
          assert.equal(await page.locator('#inspect-console').isEnabled(), true);
          outcomes.push({ fixture, timing, ...outcome });
        }
        return outcomes;
      });

      await check('invalid fixture and timing produce focused DOM errors with unchanged state', async () => {
        await prepare(page);
        const before = await readOutcome(page);
        await page.evaluate(() => {
          const select = document.getElementById('fixture');
          select.add(new Option('Deliberately invalid teaching input', 'unlisted'));
          select.value = 'unlisted';
        });
        await page.locator('#synchronize').click();
        assert.equal(await page.locator('#action-error').isVisible(), true);
        assert.match(await page.locator('#action-error').textContent(), /ERR_ACTION_INPUT.*listed fictional/);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
        const after = await readOutcome(page);
        for (const key of ['pending', 'effects', 'acknowledgments', 'history', 'verdict']) assert.equal(after[key], before[key]);
        const fixtureError = await page.locator('#action-error').textContent();
        await page.evaluate(() => {
          const fixture = document.getElementById('fixture');
          fixture.querySelector('option[value="unlisted"]').remove();
          fixture.value = 'clean';
          const timing = document.getElementById('timing');
          timing.add(new Option('Deliberately invalid timing input', 'NaN'));
          timing.value = 'NaN';
        });
        await page.locator('#synchronize').click();
        const timingError = await page.locator('#action-error').textContent();
        assert.match(timingError, /ERR_ACTION_INPUT.*listed synthetic/);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'timing');
        assert.equal((await readOutcome(page)).history, before.history);
        await page.evaluate(() => document.querySelector('#timing option[value="NaN"]').remove());
        return { fixtureError, timingError, before, after };
      });

      await check('keyboard reset clears errors and active counts, retaining prior measured results', async () => {
        await page.locator('#restart').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#action-error').isVisible(), false);
        assert.equal(await page.locator('#action-error').textContent(), '');
        assert.equal(await page.locator('#fixture').inputValue(), 'clean');
        assert.equal(await page.locator('#timing').inputValue(), 'within-budget');
        const reset = await readOutcome(page);
        assert.equal(reset.pending, '0');
        assert.equal(reset.effects, 'Not observed');
        assert.equal(reset.impact, 'Not run');
        assert.match(reset.sample, /^Online/);
        assert.match(reset.history, /negative \/ interrupted/);
        assert.match(reset.journalLimit, /older entries omitted/);
        assert.equal(await page.locator('#sample-offline').isEnabled(), true);
        return reset;
      });

      await check('premature action bypass attempt is rejected and reset remains keyboard reachable', async () => {
        const before = await readOutcome(page);
        await page.evaluate(() => { document.getElementById('synchronize').disabled = false; });
        await page.locator('#synchronize').click();
        const error = await page.locator('#action-error').textContent();
        assert.match(error, /ERR_STATE_GUARD.*out of order/);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'restart');
        const after = await readOutcome(page);
        for (const key of ['pending', 'effects', 'history', 'verdict']) assert.equal(after[key], before[key]);
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#action-error').isVisible(), false);
        return { error, before, after };
      });

      await check('actual CSP denies inline code and a non-network data-URI connection probe', async () => {
        await page.evaluate(() => {
          window.__s136Violations = [];
          document.addEventListener('securitypolicyviolation', (event) => {
            window.__s136Violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
          });
          const script = document.createElement('script');
          script.textContent = 'window.__s136ForbiddenInline = true;';
          document.body.append(script);
        });
        const denied = await page.evaluate(async () => {
          try {
            await fetch('data:application/json,%7B%22fictional%22%3Atrue%7D');
            return false;
          } catch {
            return true;
          }
        });
        assert.equal(denied, true);
        await page.waitForFunction(() => window.__s136Violations.some((event) => event.directive === 'connect-src')
          && window.__s136Violations.some((event) => event.directive.startsWith('script-src')));
        assert.equal(await page.evaluate(() => window.__s136ForbiddenInline), undefined);
        assert.deepEqual(pageErrors, []);
        assert.ok(requests.every((url) => url.startsWith('file:')), 'No actual network request may leave this file lesson');
        await page.locator('#inspect-console').click();
        return {
          violations: await page.evaluate(() => window.__s136Violations),
          inlineExecuted: false, dataUriConnectionDenied: denied,
          requestSchemes: [...new Set(requests.map((url) => new URL(url).protocol))],
          pageErrors, consoleStillAvailable: await page.locator('#inspect-console').isEnabled(),
        };
      });
    } finally {
      if (primary) {
        await primary.close();
        report.closedSessions += 1;
      }
    }

    await check('real browser model-export fault shows startup failure, never a successful result', async () => {
      let failed;
      try {
        failed = await openIsolatedLesson(lessonPath);
        await failed.page.addInitScript(() => {
          Object.defineProperty(window, 'S136', { get() { return undefined; }, set() {}, configurable: true });
        });
        await failed.page.reload({ waitUntil: 'load' });
        assert.equal(await failed.page.locator('#fatal-error').isVisible(), true);
        assert.match(await failed.page.locator('#fatal-error').textContent(), /Lesson unavailable.*No synchronization result was observed/);
        const disabledFieldsets = await failed.page.evaluate(() => ({
          sample: document.getElementById('sample-controls').disabled,
          operator: document.getElementById('operator-controls').disabled,
        }));
        assert.deepEqual(disabledFieldsets, { sample: true, operator: true });
        for (const id of ['sample-offline', 'inspect-console', 'restart']) {
          assert.equal(await failed.page.locator(`#${id}`).isEnabled(), false);
        }
        assert.equal(await failed.page.locator('#reload-lesson').isEnabled(), true);
        assert.match(await failed.page.locator('#verdict').textContent(), /^Unknown — lesson unavailable/);
        return {
          fault: 'Suppress local model export before a file reload; no lesson file or network state changed.',
          error: await failed.page.locator('#fatal-error').textContent(),
          verdict: await failed.page.locator('#verdict').textContent(),
          disabledFieldsets,
          reloadAvailable: true,
        };
      } finally {
        if (failed) {
          await failed.close();
          report.closedSessions += 1;
        }
      }
    });
  } catch (error) {
    report.runError = error.message;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.allPassed = report.checks.length === 10
      && report.checks.every((check) => check.status === 'passed')
      && report.closedSessions === 2 && !report.runError;
    if (capture) fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
    else assert.equal(existingEvidence(), originalDigest, 'Ordinary verification must preserve historical browser evidence bytes');
  }
});
