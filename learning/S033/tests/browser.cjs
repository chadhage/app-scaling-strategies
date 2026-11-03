'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helperPath)), helperHash, 'Only the published helper is authorized');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwrightVersion, '1.56.1');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function lessonHashes(directory = root, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}\\${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, lessonHashes(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result[relative] = hash(fs.readFileSync(path.join(directory, entry.name)));
    else throw new Error('Unexpected non-regular owned lesson entry');
  }
  return result;
}

async function main() {
  const before = lessonHashes();
  const report = {
    cardId: 'A-S033', workerId: 'worker-A-S033', mode: 'actual-isolated-browser/local-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), captureRequested: capture, node: process.version,
    playwright: playwrightVersion,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, api: 'openIsolatedLesson', lifecyclePrototype: false },
    sourceHashes: Object.fromEntries(['affinity.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'affinity-removal.feature', 'tests\\browser.cjs', 'tests\\csp-probe.js'].map((file) => [file, before[file]])),
    assertionsPassed: 0, cases: [], keyboardKeys: [], cleanup: 'not-started', forcedClicks: false,
    skippedAssertions: false, productionNode24Certified: false, nativeAzureCertified: false,
  };
  let session;
  let failure;
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  let safetyRouteBlocks = 0;
  function equal(actual, expected, message) {
    assert.deepEqual(actual, expected, message);
    report.assertionsPassed += 1;
  }
  function check(condition, message) {
    assert.ok(condition, message);
    report.assertionsPassed += 1;
  }
  async function caseOf(name, run) {
    const count = report.assertionsPassed;
    await run();
    report.cases.push({ name, outcome: 'passed', assertions: report.assertionsPassed - count });
  }

  try {
    session = await openIsolatedLesson('learning\\S033\\index.html');
    report.cleanup = 'open';
    report.browserVersion = session.browserVersion;
    check(/^156\./.test(session.browserVersion), 'The authorized installed Edge 156 pairing is required');
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', (request) => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
    await page.route(/^https?:\/\//, async (route) => {
      safetyRouteBlocks += 1;
      await route.abort('blockedbyclient');
    });
    await page.addInitScript(() => {
      window.__s033CspEvents = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s033CspEvents.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
    });
    await page.reload({ waitUntil: 'load' });
    const action = page.locator('#lesson-action');
    const observation = page.locator('#lesson-observation');
    const step = page.locator('#step-lesson');
    const result = page.locator('#result');
    const history = page.locator('#history-list > li');
    const state = () => page.locator('#run-state').innerText();
    const key = async (value) => { report.keyboardKeys.push(value); await page.keyboard.press(value); };
    const activeId = () => page.evaluate(() => document.activeElement.id);
    async function metrics(expected) {
      for (const [name, value] of Object.entries(expected)) equal(await page.locator(`#count-${name}`).innerText(), String(value));
    }
    async function act(value, observed = 'complete') {
      await action.selectOption(value);
      if (['probe', 'externalize'].includes(value)) await observation.selectOption(observed);
      await step.click();
    }
    async function keyboardAct(value, observed = 'complete') {
      await action.focus();
      await key('Home');
      const actions = ['probe', 'externalize', 'remove-affinity', 'restore-affinity', 'preview-unsafe'];
      for (let index = 0; index < actions.indexOf(value); index += 1) await key('ArrowDown');
      equal(await action.inputValue(), value);
      await key('Tab');
      if (['probe', 'externalize'].includes(value)) {
        equal(await activeId(), 'lesson-observation');
        await key('Home');
        for (let index = 0; index < ['complete', 'mismatch', 'missing'].indexOf(observed); index += 1) await key('ArrowDown');
        equal(await observation.inputValue(), observed);
        await key('Tab');
      }
      equal(await activeId(), 'step-lesson');
      await key('Enter');
    }

    await caseOf('loadable standalone DOM and native Tab baseline', async () => {
      equal(await page.title(), 'A-S033 — Worker-affinity removal rehearsal');
      equal(await page.locator('.training').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      check(await page.locator('.training').isVisible());
      equal(await result.getAttribute('data-verdict'), 'untested');
      equal(await history.count(), 0);
      check((await state()).includes('affinity on · local state · migration unverified'));
      equal(await page.evaluate(() => typeof document.getElementById('lesson-controls').reset), 'function');
      await key('Tab');
      equal(await page.evaluate(() => document.activeElement.className), 'skip');
      await key('Tab');
      equal(await activeId(), 'lesson-action');
      await key('Home');
      await key('Tab');
      equal(await activeId(), 'lesson-observation');
      await key('Home');
      await key('Tab');
      equal(await activeId(), 'step-lesson');
      await key('Enter');
      equal(await result.getAttribute('data-verdict'), 'success');
      await metrics({ attempted: 4, preserved: 4, failed: 0, unknown: 0 });
      equal(await page.locator('#trace-body tr').count(), 4);
      check((await result.innerText()).includes('Pinned baseline only'));
    });

    await caseOf('unsupported removal is a keyboard-operated explicit safe abort', async () => {
      await key('Shift+Tab');
      await key('Shift+Tab');
      equal(await activeId(), 'lesson-action');
      await key('ArrowDown');
      await key('ArrowDown');
      equal(await action.inputValue(), 'remove-affinity');
      check(await observation.isDisabled());
      await key('Tab');
      equal(await activeId(), 'step-lesson');
      await key('Enter');
      equal(await result.getAttribute('data-verdict'), 'failure');
      check((await result.innerText()).includes('Unsupported local-state removal'));
      check((await page.locator('#user-impact').innerText()).includes('safe-abort-before-exposure'));
      check((await state()).includes('affinity on · local state · migration unverified'));
      equal(await history.count(), 2);
      equal(await page.locator('#metric-unit').innerText(), 'Measurement unit: guard');
      check((await page.locator('#trace-body').innerText()).includes('No requests issued'));
    });

    await caseOf('unsafe local/off counterexample detects HTTP 200 state loss without application', async () => {
      await key('Shift+Tab');
      equal(await activeId(), 'lesson-action');
      await key('End');
      equal(await action.inputValue(), 'preview-unsafe');
      await key('Tab');
      await key('Enter');
      equal(await result.getAttribute('data-verdict'), 'failure');
      await metrics({ attempted: 4, preserved: 2, failed: 2, unknown: 0 });
      const rows = await page.locator('#trace-body tr').allTextContents();
      equal(rows.length, 4);
      equal(rows.filter((row) => row.includes('200')).length, 4);
      equal(rows.filter((row) => row.includes('worker-b') && row.includes('failed:') && row.includes('NO REQUIRED STATE')).length, 2);
      check((await result.innerText()).includes('NOT APPLIED'));
      check((await state()).includes('affinity on · local state'));
      equal(await history.count(), 3);
    });

    await caseOf('missing and wrong migration receipts refuse commit without resetting users', async () => {
      await act('externalize', 'missing');
      equal(await result.getAttribute('data-verdict'), 'unknown');
      await metrics({ attempted: 2, preserved: 1, failed: 0, unknown: 1 });
      check((await state()).includes('affinity on · local state · migration unverified'));
      await act('remove-affinity');
      equal(await result.getAttribute('data-verdict'), 'failure');
      await act('externalize', 'mismatch');
      equal(await result.getAttribute('data-verdict'), 'failure');
      await metrics({ attempted: 2, preserved: 1, failed: 1, unknown: 0 });
      check((await state()).includes('affinity on · local state · migration unverified'));
      await act('probe');
      await metrics({ attempted: 4, preserved: 4, failed: 0, unknown: 0 });
      equal(await history.count(), 7);
      check((await page.locator('#history-summary').innerText()).includes('1 unknown'));
    });

    await caseOf('malformed DOM inputs announce errors without replacing valid result or history', async () => {
      const previous = await result.innerText();
      const historyBefore = await history.allTextContents();
      const invalid = '<img src=x onerror=window.s033Injected=true>';
      await page.evaluate((value) => document.getElementById('lesson-action').append(new Option(value, value)), invalid);
      await action.selectOption(invalid);
      await step.click();
      check(await page.locator('#input-error').isVisible());
      equal(await activeId(), 'input-error');
      check((await page.locator('#input-error').innerText()).includes('Input rejected'));
      equal(await result.innerText(), previous);
      equal(await history.allTextContents(), historyBefore);
      equal(await page.locator('img').count(), 0);
      equal(await page.evaluate(() => window.s033Injected === true), false);
      await page.evaluate((value) => {
        for (const option of document.getElementById('lesson-action').options) if (option.value === value) option.remove();
      }, invalid);
      await action.selectOption('probe');
      await page.evaluate(() => document.getElementById('lesson-observation').append(new Option('Invalid observation', 'not-an-observation')));
      await observation.selectOption('not-an-observation');
      await step.click();
      check(await page.locator('#input-error').isVisible());
      equal(await result.innerText(), previous);
      equal(await history.allTextContents(), historyBefore);
      await page.evaluate(() => {
        for (const option of document.getElementById('lesson-observation').options) if (option.value === 'not-an-observation') option.remove();
      });
      await key('Shift+Tab');
      equal(await activeId(), 'reset-lesson');
      await key('Enter');
      equal(await activeId(), 'lesson-action');
      equal(await result.getAttribute('data-verdict'), 'untested');
      equal(await history.count(), 0);
      equal(await action.inputValue(), 'probe');
      equal(await observation.inputValue(), 'complete');
      check(!await observation.isDisabled());
      check(!await page.locator('#input-error').isVisible());
      check((await state()).includes('affinity on · local state · migration unverified · 16 steps remaining'));
    });

    await caseOf('keyboard safe sequence compares verified shared state with affinity on and off', async () => {
      await keyboardAct('externalize');
      equal(await result.getAttribute('data-verdict'), 'success');
      await metrics({ attempted: 2, preserved: 2, failed: 0, unknown: 0 });
      check((await state()).includes('affinity on · shared state · migration verified'));
      await keyboardAct('probe');
      await metrics({ attempted: 4, preserved: 4, failed: 0, unknown: 0 });
      equal((await page.locator('#trace-body tr').allTextContents()).filter((row) => row.includes('worker-a')).length, 4);
      await keyboardAct('remove-affinity');
      check((await state()).includes('affinity off · shared state · migration verified'));
      check((await page.locator('#user-impact').innerText()).includes('not-yet-probed'));
      await keyboardAct('probe');
      equal(await result.getAttribute('data-verdict'), 'success');
      await metrics({ attempted: 4, preserved: 4, failed: 0, unknown: 0 });
      const rows = await page.locator('#trace-body tr').allTextContents();
      equal(rows.filter((row) => row.includes('worker-a')).length, 2);
      equal(rows.filter((row) => row.includes('worker-b')).length, 2);
      check(rows.every((row) => row.includes('preserved:')));
      equal(await history.count(), 4);
    });

    await caseOf('post-removal unknown and failure remain inspectable after later success', async () => {
      await act('probe', 'missing');
      equal(await result.getAttribute('data-verdict'), 'unknown');
      await metrics({ attempted: 4, preserved: 3, failed: 0, unknown: 1 });
      await act('probe', 'mismatch');
      equal(await result.getAttribute('data-verdict'), 'failure');
      await metrics({ attempted: 4, preserved: 3, failed: 1, unknown: 0 });
      equal((await page.locator('#trace-body tr').allTextContents()).filter((row) => row.includes('200')).length, 4);
      await act('probe');
      equal(await result.getAttribute('data-verdict'), 'success');
      await metrics({ attempted: 4, preserved: 4, failed: 0, unknown: 0 });
      equal(await history.count(), 7);
      check((await page.locator('#history-summary').innerText()).includes('1 failure, 1 unknown'));
      for (const [index, outcome] of [[4, 'unknown'], [5, 'failed']]) {
        await history.nth(index).locator('summary').click();
        check(await history.nth(index).locator('pre').isVisible());
        check((await history.nth(index).locator('pre').innerText()).includes(`"outcome": "${outcome}"`));
      }
      await act('restore-affinity');
      check((await state()).includes('affinity on · shared state · migration verified'));
      await act('probe');
      equal((await page.locator('#trace-body tr').allTextContents()).filter((row) => row.includes('worker-a')).length, 4);
      equal(await history.count(), 9);
    });

    await caseOf('bounded history and complete keyboard reset from a migrated run', async () => {
      while (await history.count() < 16) await act('probe');
      equal(await history.count(), 16);
      check(await step.isDisabled());
      check((await state()).includes('0 steps remaining'));
      const previous = await result.innerText();
      await page.evaluate(() => document.getElementById('lesson-controls').requestSubmit());
      check((await page.locator('#input-error').innerText()).includes('16-step run is full'));
      equal(await result.innerText(), previous);
      equal(await history.count(), 16);
      await page.locator('#reset-lesson').focus();
      await key('Space');
      equal(await activeId(), 'lesson-action');
      equal(await result.getAttribute('data-verdict'), 'untested');
      await metrics({ attempted: 0, preserved: 0, failed: 0, unknown: 0 });
      equal(await history.count(), 0);
      check(!await step.isDisabled());
      check((await state()).includes('affinity on · local state · migration unverified · 16 steps remaining'));
      equal(await page.evaluate(() => typeof document.getElementById('lesson-controls').reset), 'function');
      equal(pageErrors, []);
      equal(consoleErrors, []);
      equal(externalRequests, []);
      equal(await page.evaluate(() => window.__s033CspEvents), []);
      report.normalOperation = { pageErrors: [], consoleErrors: [], externalRequests: [], cspViolations: [] };
    });

    await caseOf('actual CSP blocks inline code, evaluation, connections and native form submission', async () => {
      const url = page.url();
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'tests\\csp-probe.js';
        document.head.append(script);
      });
      await page.waitForFunction(() => window.__s033PolicyResult !== undefined);
      const attempts = await page.evaluate(() => window.__s033PolicyResult);
      await page.waitForFunction(() => {
        const directives = window.__s033CspEvents.map((event) => event.directive);
        return directives.includes('connect-src') && directives.includes('form-action')
          && directives.some((item) => item.startsWith('script-src'));
      });
      equal(attempts, { inlineExecuted: false, evaluationExecuted: false, evaluationBlocked: true, connectionRejected: true });
      equal(page.url(), url);
      const violations = await page.evaluate(() => window.__s033CspEvents);
      check(violations.some((event) => event.blockedURI === 'inline' && event.directive.startsWith('script-src')));
      check(violations.some((event) => event.blockedURI === 'eval' && event.directive.startsWith('script-src')));
      check(violations.some((event) => event.directive === 'connect-src'));
      check(violations.some((event) => event.directive === 'form-action'));
      equal(safetyRouteBlocks, 0, 'CSP, not the independent no-egress safety route, must block the probes');
      equal(pageErrors, []);
      report.csp = {
        executionContext: 'Allowed local external author script, not privileged DevTools evaluation',
        attempts, violations, safetyRouteBlocks, expectedConsoleErrors: consoleErrors.slice(),
      };
    });
    report.outcome = 'passed';
  } catch (error) {
    failure = error;
    report.outcome = 'failed';
    report.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try {
        await session.close();
        report.cleanup = 'closed-in-awaited-finally';
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Verification and cleanup failed') : error;
        report.outcome = 'failed';
        report.cleanup = 'failed';
        report.cleanupError = String(error);
      }
    }
    report.finishedAtUtc = new Date().toISOString();
    report.helperUnchanged = hash(fs.readFileSync(helperPath)) === helperHash;
    if (!report.helperUnchanged) {
      failure = failure || new Error('Published browser helper changed during verification');
      report.outcome = 'failed';
    }
    if (!capture) {
      try {
        assert.deepEqual(lessonHashes(), before, 'Ordinary browser verification must leave all owned source and proof bytes unchanged');
        report.readOnlyProofVerified = true;
      } catch (error) {
        failure = failure || error;
        report.outcome = 'failed';
      }
    } else {
      let index = 1;
      let output;
      do {
        output = path.join(root, 'evidence', `browser-${String(index).padStart(3, '0')}.json`);
        index += 1;
      } while (fs.existsSync(output));
      report.evidenceFile = path.relative(root, output);
      fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
