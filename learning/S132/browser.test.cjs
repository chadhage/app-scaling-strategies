'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = hash(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
function hashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(), false, 'owned lesson evidence must not traverse links');
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(path.join(directory, entry.name), relative));
    else result[relative] = hash(fs.readFileSync(path.join(directory, entry.name)));
  }
  return result;
}

test('actual isolated S132 DOM, keyboard, errors/reset, failures and CSP', { timeout: 120000 }, async (t) => {
  const before = hashes();
  const report = {
    cardId: 'A-S132', workerId: 'worker-A-S132', packet: 'SC-S132', mode: 'portable-synthetic',
    helperSha256, node: process.version,
    playwright: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    checks: [], observations: [], failures: [], pageErrors: [], consoleErrors: [], remoteRequests: [],
    rawLessonHashesBefore: before, lessonAndExistingProofUnchanged: false, awaitedCleanupCompleted: false,
    nativeProof: false, sourceParentComplete: false, productionNode24Validated: false, extraKanoCredits: 0,
  };
  const session = await openIsolatedLesson(path.join('learning', 'S132', 'index.html'));
  const page = session.page;
  page.setDefaultTimeout(4000);
  page.setDefaultNavigationTimeout(10000);
  report.browser = session.browserVersion;
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('request', (request) => { if (/^(?:https?|wss?):/i.test(request.url())) report.remoteRequests.push(request.url()); });
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
  const key = async (id) => { await page.locator(`#${id}`).focus(); await page.keyboard.press('Enter'); };
  const reset = async () => {
    await key('reset-button');
    assert.equal(await page.locator('#phase').textContent(), 'idle');
    assert.equal(await page.locator('#history-count').textContent(), '0 / 16');
    assert.equal(await page.locator('#run-count').textContent(), '0 / 4 measured runs');
    assert.equal(await page.locator('#budget').inputValue(), '2000');
    assert.equal(await page.locator('#preset').inputValue(), 'compatible');
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal(await page.locator('#preset').evaluate((element) => document.activeElement === element), true);
  };
  const conduct = async (preset, budget = 2000) => {
    await page.locator('#preset').selectOption(preset);
    await page.locator('#budget').fill(String(budget));
    await page.locator('#budget').press('Enter');
    assert.equal(await page.locator('#phase').textContent(), 'started');
    await key('cutover-button');
    assert.equal(await page.locator('#phase').textContent(), 'cutover');
    await key('callback-button');
    assert.equal(await page.locator('#phase').textContent(), 'callback');
    assert.equal(await page.locator('#checks-body tr').count(), 0);
    await key('finish-button');
    assert.equal(await page.locator('#phase').textContent(), 'measured');
  };
  const observe = async (name, details = {}) => {
    const dom = await page.evaluate(() => ({
      fields: Object.fromEntries(['phase', 'history-count', 'run-count', 'trace-description', 'result', 'claim', 'error', 'status']
        .map((id) => [id, document.getElementById(id)?.textContent ?? null])),
      trace: document.getElementById('trace-data')?.textContent || null,
      checks: Array.from(document.querySelectorAll('#checks-body tr'), (row) => Array.from(row.cells, (cell) => cell.textContent)),
      actions: Array.from(document.querySelectorAll('#history li'), (item) => item.textContent),
      retainedRuns: Array.from(document.querySelectorAll('#run-history > li > p'), (item) => item.textContent),
    }));
    report.observations.push({ name, ...dom, ...details });
  };
  try {
    assert.equal(report.node, 'v22.23.4');
    assert.equal(report.playwright, '1.56.1');
    assert.equal(report.browser, '156.0.4314.50');
    await check('exact banner, native labels, keyboard tab order and visible focus', async () => {
      assert.equal(await page.title(), 'S132 - Original sign-in journey rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fixed fictional sign-in trace', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Agreed original journey budget (1000-5000 ms)', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('alert').count(), 1);
      assert.equal(await page.locator('#status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#finish-button').getAttribute('aria-disabled'), 'true');
      await page.locator('#preset').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#budget').evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#start-button').evaluate((element) => document.activeElement === element), true);
      const outlineWidth = await page.locator('#start-button').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(outlineWidth, '3px');
      report.initialResourceEntries = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
      assert.equal(report.initialResourceEntries.some((url) => /^(?:https?|wss?):/i.test(url)), false);
      await observe('standalone-native-keyboard', { outlineWidth });
    });
    await check('malformed typed controls and out-of-order actions retain state and show focused safe-hold errors', async () => {
      await reset();
      await key('finish-button');
      assert.match(await page.locator('#error').textContent(), /ERR_STATE: Safe hold/);
      assert.equal(await page.locator('#history li').count(), 0);
      await observe('out-of-order-error');
      for (const raw of [' 2000', '2000 ', '2e3', '02000', '2000.0', '+2000', '999', '5001', '<script>']) {
        await page.locator('#budget').fill(raw);
        await page.locator('#budget').press('Enter');
        assert.match(await page.locator('#error').textContent(), /ERR_INPUT: Use an exact integer string/);
        assert.equal(await page.locator('#budget').evaluate((element) => document.activeElement === element), true);
        assert.equal(await page.locator('#phase').textContent(), 'idle');
        assert.equal(await page.locator('#history li').count(), 0);
        await observe('invalid-budget-safe-hold', { raw });
      }
      await page.locator('#budget').fill('2000');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.id = 'invalid-owned-preset';
        option.value = 'constructor';
        option.textContent = 'Malformed teaching preset DATA';
        document.getElementById('preset').append(option);
      });
      await page.locator('#preset').selectOption('constructor');
      await key('start-button');
      assert.match(await page.locator('#error').textContent(), /ERR_INPUT: Choose one exact fixed fictional/);
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      assert.equal(await page.locator('#preset').evaluate((element) => document.activeElement === element), true);
      await observe('invalid-preset-safe-hold');
      await page.locator('#invalid-owned-preset').evaluate((element) => element.remove());
      await reset();
    });
    await check('callback HTTP success is intermediate; only the full intended original sign-in is positive', async () => {
      await page.locator('#budget').press('Enter');
      assert.equal(await page.locator('#phase').textContent(), 'started');
      assert.equal(await page.locator('#budget').evaluate((element) => element.readOnly), true);
      assert.equal(await page.locator('#preset').isDisabled(), true);
      await key('cutover-button');
      await key('callback-button');
      const callback = JSON.parse(await page.locator('#trace-data').textContent());
      assert.equal(callback.callback.httpStatus, 200);
      assert.equal(callback.callback.version, 'v2');
      assert.equal(callback.completion, null);
      assert.match(await page.locator('#result').textContent(), /No measured/);
      assert.match(await page.locator('#status').textContent(), /only an intermediate/);
      await observe('callback-200-not-completion');
      await key('finish-button');
      assert.match(await page.locator('#result').textContent(), /^POSITIVE.*1800 ms.*2000 ms/);
      assert.equal(await page.locator('#checks-body tr').count(), 15);
      assert.equal(await page.locator('#checks-body tr').evaluateAll((rows) => rows.every((row) => row.cells[1].textContent === 'POSITIVE')), true);
      const complete = JSON.parse(await page.locator('#trace-data').textContent());
      assert.notEqual(complete.started.pendingSessionId, complete.callback.issuedSession);
      assert.equal(complete.completion.sessionId, complete.callback.issuedSession);
      assert.equal(complete.completion.identity, complete.started.expectedIdentity);
      assert.match(await page.locator('#claim').textContent(), /not a live sign-in/);
      await observe('full-original-sign-in-positive');
    });
    await check('actual negative state, identity, session, restart, version, route and final page observations cannot pass on HTTP 200', async () => {
      for (const [preset, failed] of [
        ['lost-state', 'callback-state'], ['state-mismatch', 'callback-state'],
        ['wrong-identity', 'intended-identity'], ['session-mismatch', 'signed-in-session'],
        ['forced-restart', 'no-forced-restart'], ['incompatible-state-version', 'state-version-contract'],
        ['wrong-route', 'callback-route'], ['wrong-page', 'signed-in-page'],
      ]) {
        await reset();
        await conduct(preset);
        assert.match(await page.locator('#result').textContent(), /^NEGATIVE/);
        assert.equal(JSON.parse(await page.locator('#trace-data').textContent()).callback.httpStatus, 200);
        assert.equal(await page.locator(`[data-check="${failed}"] td`).nth(1).textContent(), 'NEGATIVE');
        assert.match(await page.locator('#claim').textContent(), /continuity failed/);
        await observe(`detected-${preset}`);
      }
    });
    await check('original budget stays pinned despite a DOM-edited input; equality uses final completion not callback time', async () => {
      await reset();
      await page.locator('#preset').selectOption('slow-200');
      await page.locator('#budget').press('Enter');
      await page.locator('#budget').evaluate((element) => { element.value = '5000'; });
      await key('cutover-button');
      await key('callback-button');
      assert.match(await page.locator('#result').textContent(), /No measured/);
      await key('finish-button');
      assert.match(await page.locator('#result').textContent(), /^NEGATIVE.*4200 ms.*2000 ms/);
      assert.match(await page.locator('#trace-description').textContent(), /Pinned original budget: 2000 ms/);
      await observe('slow-200-original-budget-pinned', { editedDisplayedBudget: await page.locator('#budget').inputValue() });
      await reset();
      await conduct('compatible', 1799);
      assert.match(await page.locator('#result').textContent(), /^NEGATIVE/);
      await observe('budget-one-ms-over');
      await conduct('compatible', 1800);
      assert.match(await page.locator('#result').textContent(), /^POSITIVE/);
      await observe('budget-equality-positive');
      await conduct('slow-200', 4200);
      assert.match(await page.locator('#result').textContent(), /^POSITIVE.*4200 ms.*4200 ms/);
      await observe('slow-completion-agreed-equality');
    });
    await check('actual unknown callback and original timing observations stay unknown despite signed-in v2 DATA', async () => {
      await reset();
      for (const preset of ['callback-unobserved', 'timing-unobserved']) {
        await conduct(preset);
        assert.match(await page.locator('#result').textContent(), /^UNKNOWN/);
        assert.match(await page.locator('#claim').textContent(), /missing observations are not positive/);
        const fixed = JSON.parse(await page.locator('#trace-data').textContent());
        assert.equal(fixed.completion.signedIn, true);
        assert.equal(fixed.completion.version, 'v2');
        if (preset === 'timing-unobserved') {
          assert.equal(fixed.callback.httpStatus, 200);
          assert.equal(await page.locator('[data-check="original-journey-budget"] td').nth(1).textContent(), 'UNKNOWN');
        }
        await observe(`retained-${preset}`);
      }
      assert.equal(await page.locator('#run-history > li').count(), 2);
    });
    await check('all four measured histories remain visible; fifth run fails without pruning or erasing unknowns', async () => {
      await reset();
      for (const preset of ['lost-state', 'callback-unobserved', 'compatible', 'forced-restart']) await conduct(preset);
      assert.equal(await page.locator('#history li').count(), 16);
      assert.equal(await page.locator('#run-history > li').count(), 4);
      const summaries = await page.locator('#run-history > li > p').allTextContents();
      assert.match(summaries[0], /lost-state - NEGATIVE/);
      assert.match(summaries[1], /callback-unobserved - UNKNOWN/);
      assert.match(summaries[2], /compatible - POSITIVE/);
      assert.match(summaries[3], /forced-restart - NEGATIVE/);
      await page.locator('#run-history details').first().locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#run-history details').first().getAttribute('open'), '');
      assert.match(await page.locator('#run-history details pre').first().textContent(), /fictional-state|missing/);
      const traceBefore = await page.locator('#trace-data').textContent();
      await key('start-button');
      assert.match(await page.locator('#error').textContent(), /ERR_LIMIT: Safe hold/);
      assert.equal(await page.locator('#history-count').textContent(), '16 / 16');
      assert.deepEqual(await page.locator('#run-history > li > p').allTextContents(), summaries);
      assert.equal(await page.locator('#trace-data').textContent(), traceBefore);
      await observe('bounded-retained-negative-unknown-positive-history');
    });
    await check('actual native prototype reset survives a named form.reset control and returns keyboard focus', async () => {
      const shadowed = await page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.id = 'reset';
        input.name = 'reset';
        document.getElementById('controls').append(input);
        return typeof document.getElementById('controls').reset !== 'function';
      });
      assert.equal(shadowed, true);
      await reset();
      assert.equal(await page.locator('#run-history > li').count(), 0);
      assert.equal(await page.locator('#checks-body tr').count(), 0);
      assert.match(await page.locator('#result').textContent(), /No measured/);
      await page.locator('#reset').evaluate((element) => element.remove());
      await observe('native-prototype-reset-after-shadow', { formResetWasShadowed: shadowed });
    });
    await check('actual controlled missing-model failure visibly disables actions; invalid helper path fails before launch', async () => {
      await page.goto(pathToFileURL(path.join(__dirname, 'evidence', 'missing-model.html')).href, { waitUntil: 'load' });
      assert.match(await page.locator('#error').textContent(), /ERR_MODEL.*required local model DATA did not load/);
      assert.equal(await page.locator('#phase').textContent(), 'unavailable');
      for (const id of ['start-button', 'cutover-button', 'callback-button', 'finish-button', 'reset-button']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.match(await page.locator('#result').textContent(), /No measured/);
      await observe('controlled-missing-model-no-success');
      await assert.rejects(openIsolatedLesson(path.join('learning', 'S132', 'not-present.html')), (error) => error.code === 'ERR_LESSON_PATH');
      await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href, { waitUntil: 'load' });
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      await observe('restored-owned-standalone-entry');
    });
    await check('actual CSP denies inline/event script, eval, style, data connections/images/frames and form navigation', async () => {
      const originalUrl = page.url();
      await page.evaluate((url) => {
        const script = document.createElement('script');
        script.src = url;
        document.head.append(script);
      }, pathToFileURL(path.join(__dirname, 'evidence', 'csp-probe.js')).href);
      await page.waitForFunction(() => globalThis.__s132Csp?.complete === true, null, { timeout: 4000 });
      const csp = await page.evaluate(() => globalThis.__s132Csp);
      assert.equal(csp.error, undefined);
      for (const field of ['inlineScriptBlocked', 'inlineEventBlocked', 'evalBlocked', 'inlineStyleBlocked', 'connectBlocked', 'imageBlocked', 'formNavigationBlocked']) assert.equal(csp[field], true, field);
      for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
        assert.equal(csp.violations.some((item) => item.directive === directive), true, directive);
      }
      assert.equal(page.url(), originalUrl);
      report.csp = csp;
      await observe('actual-csp-denials-no-live-network', { csp });
    });
    await check('no page exceptions, remote requests or source/existing evidence mutations', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.remoteRequests, []);
      assert.deepEqual(hashes(), before);
      report.lessonAndExistingProofUnchanged = true;
      await observe('normal-verification-read-only');
    });
    assert.deepEqual(report.failures, []);
  } catch (error) {
    report.failures.push({ name: 'browser run', message: error.message });
    throw error;
  } finally {
    try {
      await session.close();
      report.awaitedCleanupCompleted = true;
    } catch (error) {
      report.failures.push({ name: 'awaited isolated cleanup', message: error.message });
      throw error;
    } finally {
      report.success = report.failures.length === 0 && report.checks.length === 11 && report.awaitedCleanupCompleted && report.lessonAndExistingProofUnchanged;
      if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
        const name = `browser-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
        fs.writeFileSync(path.join(__dirname, 'evidence', 'raw', name), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
        console.log(`Deliberate browser capture ${name}; success=${report.success}`);
      } else {
        assert.deepEqual(hashes(), before, 'Normal verification must remain READ-ONLY.');
      }
    }
  }
});
