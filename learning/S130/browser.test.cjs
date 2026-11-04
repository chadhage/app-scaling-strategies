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
    assert.equal(entry.isSymbolicLink(), false);
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(path.join(directory, entry.name), relative));
    else result[relative] = sha256(fs.readFileSync(path.join(directory, entry.name)));
  }
  return result;
}

test('actual isolated S130 DOM, keyboard, error/reset, failure and CSP observations', { timeout: 120000 }, async (t) => {
  const before = hashes();
  const report = {
    cardId: 'A-S130', mode: 'portable-synthetic', helperSha256, node: process.version,
    playwright: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    observations: [], checks: [], failures: [], pageErrors: [], remoteRequests: [], consoleErrors: [],
    rawLessonHashesBefore: before, lessonAndExistingProofUnchanged: false, awaitedCleanupCompleted: false,
    nativeProof: false, productionNode24Validated: false, extraKanoCredits: 0,
  };
  assert.equal(report.node, 'v22.23.4');
  assert.equal(report.playwright, '1.56.1');
  const session = await openIsolatedLesson(path.join('learning', 'S130', 'index.html'));
  const page = session.page;
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  report.browser = session.browserVersion;
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
  const key = async (id) => { await page.locator(`#${id}`).focus(); await page.keyboard.press('Enter'); };
  const reset = async () => {
    await key('reset-button');
    assert.equal(await page.locator('#phase').textContent(), 'empty');
    assert.equal(await page.locator('#history-count').textContent(), '0 / 12');
    assert.equal(await page.locator('#preset').evaluate((element) => document.activeElement === element), true);
    assert.equal(await page.locator('#software-token').inputValue(), 'v2');
    assert.equal(await page.locator('#error').textContent(), '');
  };
  const conduct = async (presetId) => {
    await page.locator('#preset').selectOption(presetId);
    await page.locator('#software-token').press('Enter');
    assert.equal(await page.locator('#phase').textContent(), 'loaded');
    assert.equal(await page.locator('#outcomes-body tr').count(), 0);
    await key('inspect-button');
    assert.equal(await page.locator('#phase').textContent(), 'inspected');
    assert.equal(await page.locator('#execution-body tr').count(), 3);
    await key('measure-button');
    assert.equal(await page.locator('#phase').textContent(), 'measured');
  };
  const observe = async (name, details = {}) => {
    const actual = await page.evaluate(() => ({
      fields: Object.fromEntries(['phase', 'history-count', 'trace-description', 'grace', 'completion', 'work-summary', 'sample-summary', 'claim', 'error', 'status']
        .map((id) => [id, document.getElementById(id)?.textContent ?? null])),
      capacity: Array.from(document.querySelectorAll('#capacity-body tr'), (row) => row.textContent),
      executions: Array.from(document.querySelectorAll('#execution-body tr'), (row) => row.textContent),
      journeys: Array.from(document.querySelectorAll('#outcomes-body tr'), (row) => row.textContent),
      actions: Array.from(document.querySelectorAll('#history li'), (row) => row.textContent),
      retainedRuns: Array.from(document.querySelectorAll('#run-history li'), (row) => row.textContent),
    }));
    report.observations.push({ name, ...actual, ...details });
  };
  try {
    assert.equal(report.browser, '156.0.4314.50');
    await check('standalone exact banner, labels, semantic guards and native keyboard focus', async () => {
      assert.equal(await page.title(), 'S130 - Flex trace rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fixed Flex trace preset', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Software token (exactly v2)', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('alert').count(), 1);
      assert.equal(await page.locator('#status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#measure-button').getAttribute('aria-disabled'), 'true');
      await page.locator('#preset').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#software-token').evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#load-button').evaluate((element) => document.activeElement === element), true);
      const outlineWidth = await page.locator('#load-button').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(outlineWidth, '3px');
      await observe('standalone-keyboard', { outlineWidth });
    });
    await check('typed input, malformed preset and out-of-order errors retain state and history', async () => {
      await reset();
      await key('measure-button');
      assert.match(await page.locator('#error').textContent(), /ERR_STATE: Safe hold/);
      assert.equal(await page.locator('#history li').count(), 0);
      for (const input of [' v2', 'v2 ', '2', '<script>v2</script>']) {
        await page.locator('#software-token').fill(input);
        await page.locator('#software-token').press('Enter');
        assert.match(await page.locator('#error').textContent(), /exactly v2/);
        assert.equal(await page.locator('#software-token').evaluate((element) => document.activeElement === element), true);
        assert.equal(await page.locator('#phase').textContent(), 'empty');
        assert.equal(await page.locator('#history li').count(), 0);
        await observe('invalid-token', { input });
      }
      await page.locator('#software-token').fill('v2');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.id = 'invalid-option';
        option.value = 'constructor';
        option.textContent = 'Injected malformed preset DATA';
        document.getElementById('preset').append(option);
      });
      await page.locator('#preset').selectOption('constructor');
      await key('load-button');
      assert.match(await page.locator('#error').textContent(), /exact fixed preset/);
      assert.equal(await page.locator('#history li').count(), 0);
      await observe('invalid-preset-safe-hold');
      await page.locator('#invalid-option').evaluate((element) => element.remove());
      await reset();
      await page.locator('#software-token').press('Enter');
      await key('measure-button');
      assert.match(await page.locator('#error').textContent(), /inspect the loaded/);
      assert.equal(await page.locator('#history li').count(), 1);
      await observe('nominal-load-does-not-measure');
    });
    await check('single/multi comparison distinguishes polling downtime from completed work and retains interruption', async () => {
      await reset();
      await conduct('single-compatible');
      assert.match(await page.locator('#sample-summary').textContent(), /3 attempted: 2 uninterrupted, 1 interrupted, 0 unknown/);
      assert.match(await page.locator('#work-summary').textContent(), /3 completed, 0 terminated, 0 unknown/);
      assert.match(await page.locator('#outcomes-body').textContent(), /polling error 503/);
      assert.match(await page.locator('#capacity-body').textContent(), /0 \/ 3/);
      await observe('single-instance-interrupted-polling-completed-work');
      await conduct('multi-compatible');
      assert.match(await page.locator('#sample-summary').textContent(), /3 attempted: 3 uninterrupted, 0 interrupted, 0 unknown/);
      assert.equal(await page.locator('#run-history li').count(), 2);
      assert.match(await page.locator('#run-history li').first().textContent(), /1 interrupted/);
      assert.match(await page.locator('#completion').textContent(), /unknown/);
      assert.match(await page.locator('#claim').textContent(), /cannot prove every user or execution completed/);
      assert.equal(await page.locator('#history-count').textContent(), '6 / 12');
      await observe('multi-instance-bounded-positive-not-fleet-completion');
    });
    await check('mixed versions and insufficient ready capacity fail despite successful endpoints or more instances', async () => {
      await reset();
      await conduct('multi-incompatible');
      assert.match(await page.locator('#sample-summary').textContent(), /1 uninterrupted, 2 interrupted/);
      assert.match(await page.locator('#outcomes-body').textContent(), /state lost/);
      assert.match(await page.locator('#outcomes-body').textContent(), /2 business effects/);
      await observe('mixed-version-state-and-effect-failure');
      await conduct('multi-starved');
      assert.match(await page.locator('#capacity-body').textContent(), /1 \/ 3/);
      assert.match(await page.locator('#outcomes-body').textContent(), /1400 ms exceeds original 900 ms/);
      assert.match(await page.locator('#sample-summary').textContent(), /2 interrupted/);
      await observe('three-instances-insufficient-ready-capacity');
    });
    await check('rolling grace exceeded and unknown grace/completion remain interruptions or unknowns', async () => {
      await reset();
      await conduct('multi-grace-expired');
      assert.match(await page.locator('#execution-body').textContent(), /3700 \/ 3600/);
      assert.match(await page.locator('#sample-summary').textContent(), /1 interrupted/);
      await observe('rolling-grace-exceeded');
      await conduct('multi-grace-unknown');
      assert.match(await page.locator('#grace').textContent(), /documented reference 3600 s; observed unknown s/);
      assert.match(await page.locator('#execution-body').textContent(), /2700 \/ unknown/);
      assert.match(await page.locator('#sample-summary').textContent(), /2 uninterrupted, 0 interrupted, 1 unknown/);
      assert.match(await page.locator('#outcomes-body').textContent(), /completion unknown/);
      assert.match(await page.locator('#completion').textContent(), /unknown/);
      await observe('unknown-grace-execution-effect-version-retained');
    });
    await check('platform-update grace and recreate termination do not borrow rolling completion guarantees', async () => {
      await reset();
      await conduct('multi-platform-restart');
      assert.match(await page.locator('#execution-body').textContent(), /780 \/ 600/);
      assert.match(await page.locator('#grace').textContent(), /do not borrow/);
      assert.match(await page.locator('#capacity-body').textContent(), /restarted; job-B terminated/);
      assert.match(await page.locator('#sample-summary').textContent(), /1 interrupted/);
      await observe('platform-update-distinct-ten-minute-grace');
      await conduct('multi-recreate');
      assert.match(await page.locator('#work-summary').textContent(), /0 completed, 3 terminated/);
      assert.match(await page.locator('#sample-summary').textContent(), /0 uninterrupted, 3 interrupted/);
      assert.match(await page.locator('#grace').textContent(), /no rolling completion grace inferred/);
      await observe('recreate-immediate-termination');
    });
    await check('all twelve actions retain earlier failures and unknowns; keyboard reset survives form.reset shadowing', async () => {
      await reset();
      for (const id of ['single-compatible', 'multi-grace-unknown', 'multi-compatible', 'multi-incompatible']) await conduct(id);
      assert.equal(await page.locator('#history li').count(), 12);
      assert.equal(await page.locator('#run-history li').count(), 4);
      assert.match(await page.locator('#status').textContent(), /12 attempted, 3 interrupted, 1 unknown/);
      const prior = await page.locator('#run-history').textContent();
      await key('load-button');
      assert.match(await page.locator('#error').textContent(), /ERR_HISTORY/);
      assert.equal(await page.locator('#run-history').textContent(), prior);
      await observe('bounded-history-no-pruning');
      const shadowed = await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 'reset';
        input.name = 'reset';
        document.getElementById('controls').append(input);
        return typeof document.getElementById('controls').reset !== 'function';
      });
      assert.equal(shadowed, true);
      await reset();
      assert.equal(await page.locator('#run-history li').count(), 0);
      await page.locator('#reset').evaluate((element) => element.remove());
      await observe('keyboard-native-reset-after-shadow', { formResetWasShadowed: shadowed });
    });
    await check('actual missing-model DOM fails visibly without successful results; invalid helper path fails closed', async () => {
      await page.goto(pathToFileURL(path.join(__dirname, 'evidence', 'missing-model.html')).href, { waitUntil: 'load' });
      assert.match(await page.locator('#error').textContent(), /required local model DATA did not load/);
      assert.equal(await page.locator('#phase').textContent(), 'unavailable');
      assert.equal(await page.locator('#load-button').isDisabled(), true);
      assert.equal(await page.locator('#reset-button').isDisabled(), true);
      assert.match(await page.locator('#sample-summary').textContent(), /no measured result/);
      await observe('actual-missing-model-failure-ux');
      await assert.rejects(openIsolatedLesson(path.join('learning', 'S130', 'does-not-exist.html')), (error) => error.code === 'ERR_LESSON_PATH');
      await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href, { waitUntil: 'load' });
      assert.equal(await page.locator('#phase').textContent(), 'empty');
      await observe('restore-real-entry-after-controlled-failure');
    });
    await check('actual CSP blocks inline/event script, eval, style, data connections/images/frames and form navigation', async () => {
      const originalUrl = page.url();
      await page.evaluate((url) => {
        const script = document.createElement('script');
        script.src = url;
        document.head.append(script);
      }, pathToFileURL(path.join(__dirname, 'evidence', 'csp-probe.js')).href);
      await page.waitForFunction(() => globalThis.__s130Csp?.complete === true, null, { timeout: 5000 });
      const csp = await page.evaluate(() => globalThis.__s130Csp);
      assert.equal(csp.error, undefined);
      for (const field of ['inlineScriptBlocked', 'inlineEventBlocked', 'evalBlocked', 'inlineStyleBlocked', 'connectBlocked', 'imageBlocked', 'formNavigationBlocked']) {
        assert.equal(csp[field], true, field);
      }
      for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
        assert.equal(csp.violations.some((entry) => entry.directive === directive), true, directive);
      }
      assert.equal(page.url(), originalUrl);
      report.csp = csp;
      await observe('actual-csp-denials-no-live-network', { csp });
    });
    await check('no page exceptions or live requests and no source/existing proof rewrite', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.remoteRequests, []);
      assert.deepEqual(hashes(), before);
      report.lessonAndExistingProofUnchanged = true;
      await observe('read-only-sources-and-existing-proof');
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
        assert.deepEqual(hashes(), before, 'Normal browser verification must remain READ-ONLY.');
      }
    }
  }
});
