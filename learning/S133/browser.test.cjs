'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = digest(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const { EXPECTATIONS } = require('./model.js');
const sourceNames = [
  '.gitattributes', 'form-continuity.feature', 'model.js', 'app.js', 'index.html', 'lesson.css', 'manifest.json',
  'README.txt', 'model.test.cjs', 'integrity.test.cjs', 'browser.test.cjs',
  path.join('evidence', 'csp-probe.js'), path.join('evidence', 'missing-model.html'),
];
function hashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(), false, 'No linked lesson or proof paths.');
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(path.join(directory, entry.name), relative));
    else result[relative] = digest(fs.readFileSync(path.join(directory, entry.name)));
  }
  return result;
}
function provenance() {
  return Object.fromEntries(sourceNames.map((name) => {
    const absolute = path.join(__dirname, name);
    const raw = fs.readFileSync(absolute);
    const canonical = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    const canonicalGitOid = execFileSync('git', ['--no-pager', 'hash-object', '--path', path.relative(root, absolute), absolute], { cwd: root, encoding: 'utf8' }).trim();
    return [name, {
      rawSha256: digest(raw), rawByteLength: raw.length, rawCrlfCount: (raw.toString('utf8').match(/\r\n/g) || []).length,
      canonicalSha256: digest(canonical), canonicalGitOid,
    }];
  }));
}

test('actual isolated S133 DOM, keyboard, error, reset, failure, unknown and CSP observations', { timeout: 120000 }, async (t) => {
  const before = hashes();
  const report = {
    schemaVersion: 1, cardId: 'A-S133', workerId: 'worker-A-S133', mode: 'portable-synthetic',
    observedAtUtc: new Date().toISOString(), helperSha256, node: process.version,
    playwright: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    sourceProvenance: provenance(), rawLessonHashesBefore: before,
    observations: [], checks: [], failures: [], pageErrors: [], consoleErrors: [], remoteRequests: [],
    lessonAndExistingProofUnchanged: false, awaitedCleanupCompleted: false,
    nativeProof: false, actualAuthentication: false, actualStorage: false, actualBusinessEffect: false,
    productionNode24Validated: false, sourceParentComplete: false, extraKanoCredits: 0,
  };
  assert.equal(report.node, 'v22.23.4');
  assert.equal(report.playwright, '1.56.1');
  const session = await openIsolatedLesson(path.join('learning', 'S133', 'index.html'));
  const page = session.page;
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  report.browserVersion = session.browserVersion;
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('request', (request) => {
    if (/^(https?|wss?):/i.test(request.url())) report.remoteRequests.push(request.url());
  });
  const check = (name, action) => t.test(name, async () => {
    try {
      await action();
      report.checks.push({ name, passed: true });
    } catch (error) {
      report.checks.push({ name, passed: false });
      report.failures.push({ name, message: error.message });
      throw error;
    }
  });
  const key = async (action, keyName = 'Enter') => {
    await page.locator(`#${action}-button`).focus();
    await page.keyboard.press(keyName);
  };
  const observe = async (name, details = {}) => {
    const actual = await page.evaluate(() => ({
      fields: Object.fromEntries([
        'phase', 'active-preset', 'current-journey', 'version', 'answers', 'prior-validation', 'prior-token',
        'identity-session', 'permissions', 'final-step', 'attempt-summary', 'http-statuses', 'outcome',
        'verifier', 'run-summary', 'history-count', 'status', 'error',
      ].map((id) => [id, document.getElementById(id)?.textContent ?? null])),
      checkRows: Array.from(document.querySelectorAll('#checks-body tr'), (element) => element.textContent),
      attemptRows: Array.from(document.querySelectorAll('#attempts-body tr'), (element) => element.textContent),
      retainedRuns: Array.from(document.querySelectorAll('#run-history > li > p'), (element) => element.textContent),
      acceptedActions: Array.from(document.querySelectorAll('#history > li'), (element) => element.textContent),
      rejectedActions: Array.from(document.querySelectorAll('#rejected-history > li'), (element) => element.textContent),
    }));
    report.observations.push({ name, ...actual, ...details });
  };
  const reset = async (expectedRuns) => {
    const rejectedCount = await page.locator('#rejected-history > li').count();
    await key('reset', 'Space');
    assert.equal(await page.locator('#phase').textContent(), 'idle');
    assert.equal(await page.locator('#preset').inputValue(), 'preserved');
    assert.equal(await page.locator('#preset').evaluate((element) => document.activeElement === element), true);
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal(await page.locator('#run-history > li').count(), expectedRuns);
    assert.equal(await page.locator('#rejected-history > li').count(), rejectedCount);
  };
  const conduct = async (presetId, retry = true) => {
    await page.locator('#preset').selectOption(presetId);
    await key('start');
    assert.equal(await page.locator('#phase').textContent(), 'old-step');
    assert.equal(await page.locator('#version').textContent(), 'teaching-v1');
    assert.match(await page.locator('#answers').textContent(), /paper-star; colour=violet/);
    for (const [action, phase] of [['cutover', 'cutover'], ['continue', 'continued'], ['submit', 'submitted'], ...(retry ? [['retry', 'retried']] : []), ['measure', 'measured']]) {
      await key(action);
      assert.equal(await page.locator('#phase').textContent(), phase);
    }
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal(await page.locator('#checks-body tr').count(), 10);
    assert.equal(await page.locator('#attempts-body tr').count(), retry ? 2 : 1);
    assert.equal(await page.locator('#verifier').textContent(), 'matched fixed preset expectation');
  };
  try {
    assert.equal(report.browserVersion, '156.0.4314.50');
    await check('exact banner, semantic labels, keyboard Tab/Enter/Space, visible focus and safe-order UX', async () => {
      assert.equal(await page.title(), 'S133 - Preserved form rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fixed form trace preset', { exact: true }).count(), 1);
      assert.equal(await page.locator('#preset option').count(), 9);
      assert.equal(await page.getByRole('alert').count(), 1);
      assert.equal(await page.locator('#status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#measure-button').getAttribute('aria-disabled'), 'true');
      await page.locator('#preset').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#start-button').evaluate((element) => document.activeElement === element), true);
      const outlineWidth = await page.locator('#start-button').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(outlineWidth, '3px');
      await key('measure');
      assert.match(await page.locator('#error').textContent(), /ERR_STATE: Safe hold/);
      assert.equal(await page.locator('#history > li').count(), 0);
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      assert.equal(await page.locator('#outcome').textContent(), 'no measured journey');
      await observe('initial-keyboard-and-out-of-order-error', { outlineWidth });
    });
    await check('malformed fixed inputs fail closed, receive focus and do not start or replace a journey', async () => {
      for (const value of ['constructor', ' preserved', '1']) {
        await page.evaluate((injected) => {
          const option = document.createElement('option');
          option.id = 's133-invalid-option';
          option.value = injected;
          option.textContent = 'Injected malformed teaching preset DATA';
          document.getElementById('preset').append(option);
        }, value);
        await page.locator('#preset').selectOption(value);
        await key('start');
        assert.match(await page.locator('#error').textContent(), /ERR_INPUT: Safe hold.*exact fixed preset/);
        assert.equal(await page.locator('#preset').evaluate((element) => document.activeElement === element), true);
        assert.equal(await page.locator('#phase').textContent(), 'idle');
        assert.equal(await page.locator('#history > li').count(), 0);
        await observe('malformed-preset-safe-hold', { injectedFixedTestValue: value });
        await page.locator('#s133-invalid-option').evaluate((element) => element.remove());
      }
      await reset(0);
      assert.equal(await page.locator('#rejected-history > li').count(), 4);
    });
    await check('the same old form finishes with preserved prior facts, one intended effect and two attempts', async () => {
      await page.locator('#preset').selectOption('preserved');
      await key('start');
      await page.locator('#preset').selectOption('replacement-http200');
      await key('cutover');
      assert.equal(await page.locator('#current-journey').textContent(), 'fictional-form-01');
      assert.equal(await page.locator('#active-preset').textContent(), 'Preserved original form');
      assert.equal(await page.locator('#version').textContent(), 'teaching-v2');
      assert.equal(await page.locator('#outcome').textContent(), 'no measured journey');
      for (const action of ['continue', 'submit', 'retry', 'measure']) await key(action);
      assert.equal(await page.locator('#outcome').textContent(), 'preserved');
      assert.equal(await page.locator('#checks-body .result-pass').count(), 10);
      assert.equal(await page.locator('#attempt-summary').textContent(), '2 attempts; 1 observed fictional effects');
      assert.match(await page.locator('#prior-token').textContent(), /fictional-prior-token-07; accepted=true/);
      assert.match(await page.locator('#run-summary').textContent(), /attempted=1; preserved=1; interrupted=0; unknown=0/);
      assert.equal(await page.locator('#rejected-history > li').count(), 4);
      await observe('same-original-form-positive-retry');
    });
    let runs = 1;
    for (const [presetId, expected] of Object.entries(EXPECTATIONS)) {
      if (expected.outcome !== 'interrupted') continue;
      await check(`actual negative DOM: ${presetId}`, async () => {
        await reset(runs);
        await conduct(presetId);
        runs++;
        assert.equal(await page.locator('#outcome').textContent(), 'interrupted');
        assert.equal(await page.locator('#checks-body .result-fail').count() > 0, true);
        const expectedLabel = require('./model.js').inspect(require('./model.js').execute(require('./model.js').createState(), { type: 'start', presetId })).checks.find((entry) => entry.id === expected.failedCheck).label;
        const failedRow = page.locator('#checks-body tr').filter({ hasText: expectedLabel });
        assert.equal(await failedRow.locator('td').last().textContent(), 'fail');
        assert.equal(await page.locator('#run-history > li').count(), runs);
        if (presetId === 'duplicate-submission') assert.match(await page.locator('#attempt-summary').textContent(), /2 observed fictional effects/);
        if (presetId === 'replacement-http200') {
          assert.equal(await page.locator('#current-journey').textContent(), 'fictional-restarted-form-02');
          assert.match(await page.locator('#final-step').textContent(), /completed; validation=valid/);
          assert.match(await page.locator('#http-statuses').textContent(), /^200, 200/);
          assert.match(await page.locator('#attempt-summary').textContent(), /1 observed fictional effects/);
        }
        await observe(`measured-failure-${presetId}`, { requiredFailedCheck: expected.failedCheck });
      });
    }
    await check('HTTP 200 and candidate version cannot manufacture a receipt or effect count; unknown remains through retry', async () => {
      await reset(runs);
      await conduct('receipt-unknown');
      runs++;
      assert.equal(await page.locator('#outcome').textContent(), 'unknown');
      assert.equal(await page.locator('#checks-body .result-unknown').count(), 2);
      assert.equal(await page.locator('#checks-body .result-fail').count(), 0);
      assert.match(await page.locator('#attempt-summary').textContent(), /2 attempts; UNKNOWN/);
      assert.match(await page.locator('#http-statuses').textContent(), /^200, 200/);
      assert.equal(await page.locator('#version').textContent(), 'teaching-v2');
      await observe('unobserved-receipt-and-effects-unknown');
    });
    await check('later success and keyboard native reset keep seven failures, unknown, all attempts and rejected-action history', async () => {
      await reset(runs);
      await conduct('preserved');
      runs++;
      assert.equal(runs, 10);
      assert.equal(await page.locator('#run-summary').textContent(), 'attempted=10; preserved=2; interrupted=7; unknown=1; unmeasured=0');
      assert.equal(await page.locator('#run-history > li').count(), 10);
      assert.equal(await page.locator('#run-history > li > p').filter({ hasText: 'interrupted' }).count(), 7);
      assert.equal(await page.locator('#run-history > li > p').filter({ hasText: 'UNKNOWN' }).count(), 1);
      const shadowed = await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 'reset';
        input.name = 'reset';
        document.getElementById('controls').append(input);
        return typeof document.getElementById('controls').reset !== 'function';
      });
      assert.equal(shadowed, true);
      await reset(10);
      assert.equal(await page.locator('#outcome').textContent(), 'preserved');
      assert.equal(await page.locator('#run-history > li > p').filter({ hasText: 'interrupted' }).count(), 7);
      await key('start');
      assert.match(await page.locator('#error').textContent(), /ERR_LIMIT: Safe hold.*10 original/);
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      assert.equal(await page.locator('#run-history > li').count(), 10);
      await page.locator('#reset').evaluate((element) => element.remove());
      await observe('retained-failures-unknown-success-native-reset-and-run-bound', { formResetWasShadowed: shadowed });
    });
    await check('deliberately fresh page retains incomplete-reset unknown and already observed failure, never early version success', async () => {
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#run-history > li').count(), 0, 'documented deliberate reload discards nonpersistent DATA');
      await key('start');
      await key('cutover');
      await key('measure');
      assert.match(await page.locator('#error').textContent(), /ERR_STATE: Safe hold/);
      assert.equal(await page.locator('#outcome').textContent(), 'no measured journey');
      assert.equal(await page.locator('#history > li').count(), 2);
      await reset(1);
      assert.equal(await page.locator('#outcome').textContent(), 'unknown (incomplete reset)');
      await page.locator('#preset').selectOption('lost-answers');
      await key('start');
      await key('cutover');
      await reset(2);
      assert.equal(await page.locator('#outcome').textContent(), 'interrupted (incomplete reset)');
      assert.equal(await page.locator('#run-summary').textContent(), 'attempted=2; preserved=0; interrupted=1; unknown=1; unmeasured=0');
      await observe('incomplete-reset-does-not-complete-original-form');
    });
    await check('actual missing-model failure UX disables actions without fake success; invalid helper path fails before launch', async () => {
      await page.goto(pathToFileURL(path.join(__dirname, 'evidence', 'missing-model.html')).href, { waitUntil: 'load' });
      assert.match(await page.locator('#error').textContent(), /ERR_MODEL: Safe hold.*Required local model DATA did not load/);
      assert.equal(await page.locator('#phase').textContent(), 'unavailable');
      assert.equal(await page.locator('#controls button:disabled').count(), 7);
      assert.match(await page.locator('#run-summary').textContent(), /No measured result/);
      await observe('actual-missing-model-safe-failure');
      await assert.rejects(openIsolatedLesson(path.join('learning', 'S133', 'absent-entry.html')), (error) => error.code === 'ERR_LESSON_PATH');
      await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href, { waitUntil: 'load' });
      assert.equal(await page.locator('#phase').textContent(), 'idle');
    });
    await check('actual CSP denies inline/event/eval/style, data connections/images/frames and form navigation', async () => {
      const originalUrl = page.url();
      await page.evaluate((url) => {
        const script = document.createElement('script');
        script.src = url;
        document.head.append(script);
      }, pathToFileURL(path.join(__dirname, 'evidence', 'csp-probe.js')).href);
      await page.waitForFunction(() => globalThis.__s133Csp?.complete === true, null, { timeout: 5000 });
      const csp = await page.evaluate(() => globalThis.__s133Csp);
      report.csp = csp;
      await observe('actual-csp-raw-before-assertions', { csp });
      assert.equal(csp.error, undefined);
      for (const field of ['inlineScriptBlocked', 'inlineEventBlocked', 'evalBlocked', 'inlineStyleBlocked', 'connectBlocked', 'imageBlocked', 'frameBlocked', 'formNavigationBlocked']) assert.equal(csp[field], true, field);
      for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
        assert.equal(csp.violations.some((entry) => entry.directive === directive), true, directive);
      }
      assert.equal(page.url(), originalUrl);
      await observe('actual-csp-denials-local-data-only', { csp });
    });
    await check('no page exceptions or remote requests; source and all earlier proof stay byte-for-byte read-only', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.remoteRequests, []);
      assert.deepEqual(hashes(), before);
      report.lessonAndExistingProofUnchanged = true;
      await observe('read-only-source-proof-no-remote-requests');
    });
    assert.deepEqual(report.failures, []);
  } finally {
    try {
      await session.close();
      report.awaitedCleanupCompleted = true;
    } catch (error) {
      report.failures.push({ name: 'awaited cleanup', message: error.message });
      throw error;
    } finally {
      report.success = report.failures.length === 0 && report.awaitedCleanupCompleted && report.lessonAndExistingProofUnchanged;
      if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
        const name = `browser-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
        fs.writeFileSync(path.join(__dirname, 'evidence', 'raw', name), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
        console.log(`Deliberate browser capture: ${name}; success=${report.success}`);
      } else {
        assert.deepEqual(hashes(), before, 'Normal verification must remain READ-ONLY, including archived proof.');
      }
    }
  }
});
