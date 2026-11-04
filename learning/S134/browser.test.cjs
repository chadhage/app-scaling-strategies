'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperSha256 = sha256(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

function hashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(), false, 'owned lesson cannot contain a junction or symlink');
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(path.join(directory, entry.name), relative));
    else result[relative] = sha256(fs.readFileSync(path.join(directory, entry.name)));
  }
  return result;
}

test('actual isolated S134 DOM, keyboard, error/reset, failure and CSP observations', { timeout: 120000 }, async (t) => {
  const before = hashes();
  const report = {
    cardId: 'A-S134', workerId: 'worker-A-S134', mode: 'portable-synthetic',
    domainObservations: 'fixed fictional teaching DATA ONLY; no payment, business, user-data, network or database operation',
    helperSha256, node: process.version,
    playwright: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    checks: [], observations: [], failures: [], pageErrors: [], consoleErrors: [], remoteRequests: [],
    rawLessonHashesBefore: before, lessonAndExistingProofUnchanged: false, awaitedCleanupCompleted: false,
    captureRequested: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
    nativeProof: false, sourceParentComplete: false, productionNode24Validated: false, extraKanoCredits: 0,
    passed: false,
  };
  let session;
  let cleanupError;
  try {
    assert.equal(report.node, 'v22.23.4');
    assert.equal(report.playwright, '1.56.1');
    session = await openIsolatedLesson(path.join('learning', 'S134', 'index.html'));
    report.browser = session.browserVersion;
    assert.equal(report.browser, '156.0.4314.50');
    const page = session.page;
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(10000);
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
    const key = async (id, stroke = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(stroke);
    };
    const reset = async () => {
      await key('reset-button');
      assert.equal(await page.locator('#phase').textContent(), 'ready');
      assert.equal(await page.locator('#history-count').textContent(), '0 / 16');
      assert.equal(await page.locator('#run-count').textContent(), '0 / 4');
      assert.equal(await page.locator('#checkout-id').inputValue(), 'CHECKOUT-DEMO-01');
      assert.equal(await page.locator('#ledger-id').inputValue(), '');
      assert.equal(await page.locator('#checkout-id').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#outcome').textContent(), 'not measured');
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#run-history li').count(), 0);
    };
    const conduct = async (ledgerId) => {
      await page.locator('#checkout-id').press('Enter');
      assert.equal(await page.locator('#phase').textContent(), 'lost');
      assert.equal(await page.locator('#outcome').textContent(), 'not measured');
      await key('retry-button', 'Space');
      assert.equal(await page.locator('#phase').textContent(), 'retried');
      await key('inspect-button');
      assert.equal(await page.locator('#phase').textContent(), 'inspected');
      assert.equal(await page.locator('#ledgers-body tr').count(), 7);
      await page.locator('#ledger-id').selectOption(ledgerId);
      await key('select-button');
      assert.equal(await page.locator('#phase').textContent(), 'measured');
    };
    const observe = async (name, details = {}) => {
      const actual = await page.evaluate(() => ({
        fields: Object.fromEntries(['phase', 'history-count', 'run-count', 'outcome', 'counts', 'one-order',
          'client-outcome', 'interruptions', 'claim', 'error', 'status'].map((id) => [id, document.getElementById(id).textContent])),
        attempts: Array.from(document.querySelectorAll('#attempts-body tr'), (row) => row.textContent),
        ledgers: Array.from(document.querySelectorAll('#ledgers-body tr'), (row) => row.textContent),
        unknowns: Array.from(document.querySelectorAll('#unknowns li'), (item) => item.textContent),
        reasons: Array.from(document.querySelectorAll('#reasons li'), (item) => item.textContent),
        history: Array.from(document.querySelectorAll('#history li'), (item) => item.textContent),
        runs: Array.from(document.querySelectorAll('#run-history li'), (item) => item.textContent),
        focus: document.activeElement.id,
      }));
      report.observations.push({ name, ...actual, ...details });
    };

    await check('standalone exact banner, labels, Tab/Enter/Space and genuinely measured one-order DATA', async () => {
      assert.equal(await page.title(), 'S134 - Checkout retry ledger rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fictional checkout token (exactly CHECKOUT-DEMO-01)', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Fixed fictional ledger to measure', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('alert').count(), 1);
      assert.equal(await page.locator('#status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#select-button').getAttribute('aria-disabled'), 'true');
      await page.locator('#checkout-id').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#load-button').evaluate((element) => document.activeElement === element), true);
      const outlineWidth = await page.locator('#load-button').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(outlineWidth, '3px');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').textContent(), 'lost');
      assert.equal(await page.locator('#retry-button').evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#phase').textContent(), 'retried');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').textContent(), 'inspected');
      assert.equal(await page.locator('#ledger-id').evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#ledger-id').inputValue(), 'kept-key');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#select-button').evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#outcome').textContent(), 'positive');
      assert.equal(await page.locator('#counts').textContent(), 'orders 1 | effects 1 | payment markers 1 | attempts 2');
      assert.equal(await page.locator('#one-order').textContent(), 'yes');
      assert.equal(await page.locator('#client-outcome').textContent(), 'correct');
      assert.equal(await page.locator('#interruptions').textContent(), '1');
      assert.equal(await page.locator('#unknowns li').count(), 2);
      assert.match(await page.locator('#attempts-body tr').first().textContent(), /missing.*response lost.*effect outcome unknown/);
      assert.match(await page.locator('#ledger-kept-key').textContent(), /ORDER-DEMO-01.*EFFECT-DEMO-01.*PAYMENT-DEMO-01/);
      assert.equal(await page.locator('#history li').count(), 4);
      await observe('keyboard-positive-bounded-DATA', { outlineWidth });
    });

    await check('typed and out-of-order safe holds show errors without changing observed state/history', async () => {
      await reset();
      await page.locator('#ledger-id').selectOption('kept-key');
      await key('select-button');
      assert.match(await page.locator('#error').textContent(), /ERR_STATE: Safe hold/);
      assert.equal(await page.locator('#history li').count(), 0);
      await observe('premature-selection-safe-hold');
      for (const input of [' CHECKOUT-DEMO-01', 'CHECKOUT-DEMO-01 ', '1', 'checkout-demo-01', '<script>']) {
        await page.locator('#checkout-id').fill(input);
        await page.locator('#checkout-id').press('Enter');
        assert.match(await page.locator('#error').textContent(), /ERR_INPUT.*exactly CHECKOUT-DEMO-01/);
        assert.equal(await page.locator('#phase').textContent(), 'ready');
        assert.equal(await page.locator('#history li').count(), 0);
        assert.equal(await page.locator('#checkout-id').evaluate((element) => document.activeElement === element), true);
        await observe('typed-token-rejected', { input });
      }
      await reset();
      await page.locator('#checkout-id').press('Enter');
      await key('inspect-button');
      assert.match(await page.locator('#error').textContent(), /ERR_STATE/);
      assert.equal(await page.locator('#history li').count(), 1);
      await key('retry-button');
      await key('inspect-button');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.id = 's134-invalid-ledger';
        option.value = 'constructor';
        option.textContent = 'Malformed test DATA';
        document.getElementById('ledger-id').append(option);
      });
      await page.locator('#ledger-id').selectOption('constructor');
      await key('select-button');
      assert.match(await page.locator('#error').textContent(), /ERR_INPUT.*exact fixed ledger ID/);
      assert.equal(await page.locator('#phase').textContent(), 'inspected');
      assert.equal(await page.locator('#history li').count(), 3);
      assert.equal(await page.locator('#run-history li').count(), 0);
      assert.equal(await page.locator('#ledger-id').evaluate((element) => document.activeElement === element), true);
      await observe('malformed-ledger-safe-hold');
      await page.locator('#s134-invalid-ledger').evaluate((element) => element.remove());
      await page.locator('#ledger-id').selectOption('kept-key');
      await key('select-button');
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#outcome').textContent(), 'positive');
    });

    await check('known duplicate, wrong response, lost state and wrong identity remain negative despite 200 DATA', async () => {
      for (const ledgerId of ['fresh-key', 'wrong-response', 'lost-state', 'wrong-identity']) {
        await reset();
        await conduct(ledgerId);
        assert.equal(await page.locator('#outcome').textContent(), 'negative');
        assert.equal(await page.locator('#client-outcome').textContent(), 'incorrect');
        assert.match(await page.locator('#claim').textContent(), /known duplicate or mismatch.*200 DATA/);
        assert.equal(await page.locator('#interruptions').textContent(), '1');
        assert.match(await page.locator('#counts').textContent(), ledgerId === 'fresh-key' ? /orders 2.*effects 2.*payment markers 2/ : /orders 1.*effects 1.*payment markers 1/);
        assert.match(await page.locator(`#ledger-${ledgerId}`).textContent(), /present.*200 DATA/);
        if (ledgerId === 'wrong-response') assert.match(await page.locator('#reasons').textContent(), /CLIENT_RESULT_MISMATCH/);
        if (ledgerId === 'lost-state') assert.match(await page.locator('#reasons').textContent(), /STATE_CHANGED/);
        if (ledgerId === 'wrong-identity') assert.match(await page.locator('#reasons').textContent(), /IDENTITY_CHANGED/);
        await observe(`negative-${ledgerId}`);
      }
    });

    await check('missing final ACK gives explicit unresolved client outcome; unavailable counts never become zero', async () => {
      for (const ledgerId of ['unacknowledged', 'unobserved']) {
        await reset();
        await conduct(ledgerId);
        assert.equal(await page.locator('#outcome').textContent(), 'unknown');
        assert.equal(await page.locator('#client-outcome').textContent(), 'unresolved');
        assert.match(await page.locator('#claim').textContent(), /neither order failure nor success.*no duplicate order/);
        assert.match(await page.locator('#attempts-body tr').last().textContent(), /missing.*unobserved; not success or failure/);
        if (ledgerId === 'unacknowledged') {
          assert.equal(await page.locator('#one-order').textContent(), 'yes');
          assert.match(await page.locator('#counts').textContent(), /orders 1.*effects 1.*payment markers 1/);
        } else {
          assert.equal(await page.locator('#one-order').textContent(), 'unknown');
          assert.equal(await page.locator('#counts').textContent(), 'orders unknown | effects unknown | payment markers unknown | attempts 2');
          assert.match(await page.locator('#ledger-unobserved').textContent(), /unknown \(not zero\)/);
        }
        await observe(`unknown-${ledgerId}`);
      }
    });

    await check('later recovery retains earlier negative/unknown runs and all sixteen actions; budget safely holds', async () => {
      await reset();
      const retained = [];
      for (const [index, ledgerId] of ['fresh-key', 'unobserved', 'kept-key', 'unacknowledged'].entries()) {
        await conduct(ledgerId);
        assert.equal(await page.locator('#history li').count(), (index + 1) * 4);
        assert.equal(await page.locator('#run-history li').count(), index + 1);
        for (const [oldIndex, text] of retained.entries()) {
          assert.equal(await page.locator('#run-history li').nth(oldIndex).textContent(), text);
        }
        retained.push(await page.locator('#run-history li').last().textContent());
        await observe(`retained-run-${index + 1}`);
      }
      assert.match(retained[0], /fresh-key.*negative.*orders 2/);
      assert.match(retained[1], /unobserved.*unknown.*orders unknown/);
      assert.match(retained[2], /kept-key.*positive.*interruption 1.*boundary unknown/);
      assert.equal(await page.locator('#load-button').getAttribute('aria-disabled'), 'true');
      await key('load-button');
      assert.match(await page.locator('#error').textContent(), /ERR_LIMIT.*sixteen actions/);
      assert.equal(await page.locator('#history-count').textContent(), '16 / 16');
      assert.equal(await page.locator('#run-count').textContent(), '4 / 4');
      assert.equal(await page.locator('#phase').textContent(), 'measured');
      assert.deepEqual(await page.locator('#run-history li').allTextContents(), retained);
      await observe('seventeenth-action-safe-hold');
    });

    await check('actual native reset survives a shadowed form.reset and restores memory, error, defaults and keyboard focus', async () => {
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 's134-reset-shadow';
        input.name = 'reset';
        input.type = 'hidden';
        document.getElementById('checkout-form').append(input);
      });
      const shadowedType = await page.locator('#checkout-form').evaluate((element) => typeof element.reset);
      assert.equal(shadowedType, 'object');
      await page.locator('#checkout-id').fill('not-the-token');
      await key('reset-button', 'Space');
      assert.equal(await page.locator('#checkout-id').inputValue(), 'CHECKOUT-DEMO-01');
      assert.equal(await page.locator('#ledger-id').inputValue(), '');
      assert.equal(await page.locator('#phase').textContent(), 'ready');
      assert.equal(await page.locator('#history-count').textContent(), '0 / 16');
      assert.equal(await page.locator('#run-count').textContent(), '0 / 4');
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#checkout-id').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('#attempts-body tr').count(), 0);
      assert.equal(await page.locator('#ledgers-body tr').count(), 0);
      assert.equal(await page.locator('#run-history li').count(), 0);
      assert.equal(await page.locator('#outcome').textContent(), 'not measured');
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.consoleErrors, []);
      await observe('reset-with-native-name-shadow', { shadowedType });
      await page.locator('#s134-reset-shadow').evaluate((element) => element.remove());
    });

    await check('actual CSP denies inline script, eval, inline style, connect, image, frame and form before local-file operation', async () => {
      const originalURL = page.url();
      const originalMargin = await page.locator('#phase').evaluate((element) => getComputedStyle(element).marginLeft);
      await page.evaluate((url) => {
        const script = document.createElement('script');
        script.className = 's134-csp-probe';
        script.src = url;
        document.head.append(script);
      }, pathToFileURL(path.join(__dirname, 'evidence', 'csp-probe.js')).href);
      await page.waitForFunction(() => globalThis.__s134Csp?.complete === true, null, { timeout: 10000 });
      const csp = await page.evaluate(() => globalThis.__s134Csp);
      assert.equal(csp.executionContext, 'ordinary external self-script, not privileged Playwright evaluation');
      assert.equal(csp.inlineScriptBlocked, true);
      assert.equal(csp.inlineEventBlocked, true);
      assert.equal(csp.evalError, 'EvalError');
      assert.equal(csp.connectError, 'TypeError');
      assert.equal(csp.imageWidth, 0);
      assert.equal(csp.inlineStyleBlocked, true);
      assert.equal(csp.violations.every((entry) => entry.disposition === 'enforce'), true);
      for (const name of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-elem', 'style-src-attr',
        'connect-src', 'img-src', 'frame-src', 'form-action']) {
        assert.equal(csp.violations.some((entry) => entry.effectiveDirective === name), true, name);
      }
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('phase')).marginLeft), originalMargin);
      assert.equal(page.url(), originalURL);
      assert.deepEqual(report.remoteRequests, []);
      report.csp = csp;
      await observe('actual-CSP-local-file-denials', { csp, originalURL, originalMargin });
      await page.evaluate(() => {
        document.querySelectorAll('.s134-csp-probe').forEach((element) => element.remove());
        document.getElementById('phase').removeAttribute('style');
      });
    });

    await check('missing local model has visible failure and disables actions; restoring the resource recovers without certified results', async () => {
      await page.route(/\/model\.js$/, (route) => route.abort('failed'));
      try {
        await page.reload({ waitUntil: 'load' });
        assert.match(await page.locator('#error').textContent(), /ERR_INIT.*model resource did not load/);
        assert.match(await page.locator('#status').textContent(), /Initialization failed.*no synthetic result is certified/);
        for (const id of ['checkout-id', 'ledger-id', 'load-button', 'retry-button', 'inspect-button', 'select-button', 'reset-button']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true);
        }
        assert.equal(await page.locator('#history-count').textContent(), '0 / 16');
        assert.equal(await page.locator('#outcome').textContent(), 'not measured');
        assert.deepEqual(report.pageErrors, []);
        await observe('missing-model-actual-resource-failure');
      } finally {
        await page.unroute(/\/model\.js$/);
      }
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#load-button').isDisabled(), false);
      assert.equal(await page.locator('#error').textContent(), '');
      await reset();
      await observe('resource-restored-uncertified-reset');
    });

    assert.equal(report.failures.length, 0, 'all actual browser assertions must pass');
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.remoteRequests, []);
  } catch (error) {
    report.executionError = { name: error.name, message: error.message };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        report.awaitedCleanupCompleted = true;
      }
    } catch (error) {
      cleanupError = error;
      report.cleanupError = { name: error.name, message: error.message };
    }
    const after = hashes();
    report.rawLessonHashesAfter = after;
    report.lessonAndExistingProofUnchanged = JSON.stringify(before) === JSON.stringify(after);
    report.finishedAtUtc = new Date().toISOString();
    report.passed = !report.executionError && !cleanupError && report.checks.length === 8
      && report.failures.length === 0 && report.awaitedCleanupCompleted && report.lessonAndExistingProofUnchanged;
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
      const name = `browser-observation-${report.finishedAtUtc.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
      const capture = path.join(__dirname, 'evidence', 'raw', name);
      fs.writeFileSync(capture, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      console.log(`Deliberate browser evidence: ${path.relative(root, capture)} (passed=${report.passed})`);
    }
    assert.equal(report.lessonAndExistingProofUnchanged, true, 'verification must not rewrite lessons or existing proof');
    if (cleanupError) throw cleanupError;
  }
});
