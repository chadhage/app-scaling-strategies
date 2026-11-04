'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const helperPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const { openIsolatedLesson } = require(helperPath);
const { captureBrowser, sha256 } = require(path.join(__dirname, 'capture.cjs'));
const lesson = require(path.resolve(__dirname, '..', 'model.js'));
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('S147 actual isolated DOM, keyboard, retained impact, error, reset and CSP acceptance', { timeout: 120000 }, async (t) => {
  const evidence = {
    cardId: 'A-S147', workerId: 'worker-A-S147',
    stage: 'implemented-local-browser-acceptance',
    helperSha256: sha256(fs.readFileSync(helperPath)),
    runtime: process.version,
    playwrightVersion: require(path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    browserVersion: null,
    passed: false, cleanup: 'not-opened',
    checks: [], snapshots: [], requests: [], deniedRequests: [], pageErrors: [], consoleErrors: [],
    cspViolations: [],
    scope: 'Actual local DOM and browser security observations only. Client/business traces remain fixed fictional DATA ONLY.',
    limits: 'Not Node 24 production, native Azure, source-parent completion or qualification of the inactive lifecycle prototype.',
  };
  let session;
  try {
    assert.equal(evidence.helperSha256, helperHash);
    assert.equal(evidence.playwrightVersion, '1.56.1');
    assert.match(process.version, /^v22\./);
    session = await openIsolatedLesson('learning\\S147\\index.html');
    evidence.cleanup = 'open';
    evidence.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const { page } = session;
    page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') evidence.consoleErrors.push(message.text());
    });
    page.on('request', (request) => {
      const url = new URL(request.url());
      evidence.requests.push({ protocol: url.protocol, asset: url.pathname.split('/').at(-1), method: request.method() });
    });
    await page.context().route('**/*', async (route) => {
      if (new URL(route.request().url()).protocol !== 'file:') {
        evidence.deniedRequests.push(route.request().url());
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    await page.reload({ waitUntil: 'load' });

    const readJSON = async (id) => JSON.parse(await page.locator(`#${id}`).textContent());
    const activeId = async () => page.evaluate(() => document.activeElement.id);
    const save = async (label) => {
      evidence.snapshots.push({
        label,
        assertions: await readJSON('assertions-output'),
        originalImpact: await readJSON('impact-output'),
        journeys: await readJSON('journeys-output'),
        transport: await readJSON('transport-output'),
        conformance: await readJSON('conformance-output'),
        learnerCheck: await readJSON('check-output'),
        retainedHistory: await page.locator('#history-output').textContent(),
      });
    };
    const conduct = async (id) => {
      await page.selectOption('#fixture-picker', id);
      await page.click('#conduct-button');
      await page.click('#inspect-button');
    };
    const answer = async (verdict) => {
      await page.selectOption('#verdict-picker', verdict);
      await page.click('#check-button');
    };
    const check = async (name, body) => {
      await t.test(name, async () => {
        try {
          await body();
          evidence.checks.push({ name, verdict: 'PASS' });
        } catch (error) {
          evidence.checks.push({ name, verdict: 'FAIL', error: error.stack });
          throw error;
        }
      });
    };

    await check('loadable lesson detects the empty-success failure in the actual DOM', async () => {
      assert.equal(await page.title(), 'S147 — Client-side correctness oracle');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('body').getAttribute('data-lesson-ready'), 'true');
      await conduct('empty-success');
      const assertions = await readJSON('assertions-output');
      assert.equal(assertions.find((item) => item.requirement === 'nonempty-response').verdict, 'FAIL');
      assert.equal(assertions.length, 5);
      assert.equal((await readJSON('impact-output')).interrupted, 1);
      assert.equal((await readJSON('transport-output')).http200, 1);
      await answer('CLIENT-SIDE FAILURE');
      const result = await readJSON('check-output');
      assert.equal(result.verifierVerdict, 'PASS');
      assert.equal(result.expectedVerdict, 'CLIENT-SIDE FAILURE');
      assert.equal(result.expectedNegativeConformance.verdict, 'PASS');
      assert.equal(result.originalImpact.completed, 0);
      await save('empty-success: detected failure is not user success');
    });

    await check('all five observed source failures defeat health-only acceptance and retain original impact', async () => {
      for (const [id, requirement] of [
        ['silent-logout', 'authentication'], ['lost-state', 'preserved-state'],
        ['duplicate-effect', 'exactly-one-effect'], ['broken-ui', 'usable-compatible-ui'],
      ]) {
        await conduct(id);
        assert.equal((await readJSON('assertions-output')).find((item) => item.requirement === requirement).verdict, 'FAIL');
        assert.deepEqual(await readJSON('impact-output'), lesson.evaluateFixture(id).originalImpact);
        await answer('CLIENT-SIDE FAILURE');
        const result = await readJSON('check-output');
        assert.equal(result.verifierVerdict, 'PASS');
        assert.equal(result.originalImpact.interrupted, 1);
        assert.equal(result.originalImpact.completed, 0);
        await save(`${id}: actual DOM source failure`);
      }
      assert.equal(await page.locator('#history-output > li').count(), 5);
      assert.match(await page.locator('#history-output > li').first().textContent(), /0\/1 completed; 1\/1 interrupted/);
    });

    await check('positive, unknown and later recovery use exact observation/original denominators and eight retained runs', async () => {
      for (const [id, verdict] of [
        ['positive-control', 'CLIENT-SIDE CORRECT'], ['missing-observation', 'UNKNOWN'],
        ['later-recovery', 'CLIENT-SIDE FAILURE'],
      ]) {
        await conduct(id);
        const expected = lesson.evaluateFixture(id);
        assert.deepEqual(await readJSON('impact-output'), expected.originalImpact);
        assert.deepEqual(await readJSON('transport-output'), expected.transportSummary);
        assert.deepEqual(await readJSON('assertions-output'), expected.assertions);
        assert.deepEqual(await readJSON('journeys-output'), expected.journeys);
        await answer(verdict);
        assert.equal((await readJSON('check-output')).verifierVerdict, 'PASS');
        await save(`${id}: original outcome retained`);
      }
      assert.equal(await page.locator('#history-output > li').count(), 8);
      assert.equal(await page.locator('#conduct-button').isDisabled(), true);
      assert.equal(await page.locator('#fixture-picker').isDisabled(), true);
      assert.deepEqual(await readJSON('impact-output'), {
        denominator: 2, completed: 0, interrupted: 1, unknown: 1, laterRecoveryObserved: 2,
      });
      assert.match(await page.locator('#assertion-summary').textContent(), /14\/20 PASS; 1\/20 FAIL; 5\/20 UNKNOWN/);
      assert.match(await page.locator('#history-output > li').nth(6).textContent(), /0\/1 completed; 0\/1 interrupted; 1\/1 unknown/);
    });

    await check('keyboard conduct/inspect/select/check and correction retain learner FAIL separately from interrupted impact', async () => {
      await page.locator('#lesson-reset').press('Enter');
      assert.equal(await activeId(), 'fixture-picker');
      await page.keyboard.press('Home');
      for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#fixture-picker').inputValue(), 'duplicate-effect');
      await page.keyboard.press('Tab');
      assert.equal(await activeId(), 'conduct-button');
      await page.keyboard.press('Enter');
      assert.equal(await activeId(), 'inspect-button');
      await page.keyboard.press('Enter');
      assert.equal(await activeId(), 'verdict-picker');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#verdict-picker').inputValue(), 'CLIENT-SIDE CORRECT');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await activeId(), 'error-output');
      assert.equal((await readJSON('check-output')).verifierVerdict, 'FAIL');
      assert.equal((await readJSON('impact-output')).interrupted, 1);
      const impact = await readJSON('impact-output');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await activeId(), 'verdict-picker');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal((await readJSON('check-output')).verifierVerdict, 'PASS');
      assert.deepEqual(await readJSON('impact-output'), impact);
      assert.equal(await page.locator('#error-output').isHidden(), true);
      const history = await page.locator('#history-output').textContent();
      assert.match(history, /Check 1: learner FAIL/);
      assert.match(history, /Check 2: learner PASS/);
      await save('keyboard: wrong and corrected selections do not repair fictional duplicate effects');
    });

    await check('invalid controls and missing selections show focused errors without consuming or replacing history', async () => {
      await answer('CLIENT-SIDE FAILURE');
      assert.equal(await page.locator('#check-button').isDisabled(), true);
      assert.equal(await page.locator('#verdict-picker').isDisabled(), true);
      const history = await page.locator('#history-output').textContent();
      const impact = await readJSON('impact-output');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'phantom';
        option.textContent = 'Test-only forged fixture';
        document.getElementById('fixture-picker').append(option);
      });
      await page.selectOption('#fixture-picker', 'phantom');
      await page.click('#conduct-button');
      assert.match(await page.locator('#error-output').textContent(), /ERR_FIXTURE/);
      assert.equal(await activeId(), 'error-output');
      assert.equal(await page.locator('#history-output').textContent(), history);
      assert.deepEqual(await readJSON('impact-output'), impact);
      await page.evaluate(() => document.querySelector('option[value="phantom"]').remove());
      await conduct('positive-control');
      const inspectedHistory = await page.locator('#history-output').textContent();
      await page.click('#check-button');
      assert.match(await page.locator('#error-output').textContent(), /ERR_VERDICT/);
      assert.equal(await activeId(), 'error-output');
      assert.equal(await page.locator('#history-output').textContent(), inspectedHistory);
      assert.equal((await readJSON('impact-output')).completed, 2);
      assert.equal(await page.locator('#check-output').textContent(), 'No selection checked.');
      await answer('CLIENT-SIDE CORRECT');
      await save('typed invalid selections rejected without losing prior facts');
    });

    await check('reset is memory-only, restores focus and controls, and does not shadow native form.reset', async () => {
      assert.equal(await page.evaluate(() => typeof document.getElementById('exercise-form').reset), 'function');
      assert.equal(await page.evaluate(() => document.getElementById('exercise-form').elements.namedItem('reset')), null);
      await page.click('#lesson-reset');
      assert.equal(await activeId(), 'fixture-picker');
      assert.equal(await page.locator('#history-output > li').count(), 0);
      assert.match(await page.locator('#history-summary').textContent(), /0 \/ 8 retained runs\. Epoch 2; revision 0/);
      assert.equal(await page.locator('#fixture-picker').inputValue(), '');
      assert.equal(await page.locator('#verdict-picker').inputValue(), '');
      assert.equal(await page.locator('#error-output').isHidden(), true);
      assert.equal(await page.locator('#inspect-button').isDisabled(), true);
      assert.equal(await page.locator('#check-button').isDisabled(), true);
      assert.equal(await page.locator('#verdict-picker').isDisabled(), true);
      assert.equal(await page.locator('#conduct-button').isEnabled(), true);
      assert.deepEqual(await readJSON('assertions-output'), []);
      for (const id of ['impact-output', 'journeys-output', 'transport-output', 'conformance-output']) assert.equal(await readJSON(id), null);
      assert.equal(await page.locator('#trace-output').textContent(), 'No trace yet.');
      assert.match(await page.locator('#status-output').textContent(), /No fictional journey has been conducted/);
    });

    await check('actual CSP blocks inline script/style without any network or invented client impact', async () => {
      await page.evaluate(() => {
        globalThis.__s147Csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s147Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = "document.body.dataset.inlineExecuted = 'unsafe';";
        document.body.append(script);
        const style = document.createElement('style');
        style.textContent = 'body { --s147-unsafe-test: applied; }';
        document.head.append(style);
      });
      await page.waitForFunction(() => globalThis.__s147Csp.length >= 2);
      evidence.cspViolations = await page.evaluate(() => globalThis.__s147Csp);
      assert.equal(await page.locator('body').getAttribute('data-inline-executed'), null);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--s147-unsafe-test')), '');
      assert.ok(evidence.cspViolations.some((item) => item.directive.startsWith('script-src') && item.blockedURI === 'inline'));
      assert.ok(evidence.cspViolations.some((item) => item.directive.startsWith('style-src') && item.blockedURI === 'inline'));
      assert.equal(await readJSON('impact-output'), null);
      assert.equal(evidence.deniedRequests.length, 0);
      assert.ok(evidence.requests.length >= 5);
      assert.ok(evidence.requests.every((item) => item.protocol === 'file:'));
      assert.deepEqual(evidence.pageErrors, []);
    });

    await check('a deliberately unavailable oracle module fails closed in the actual DOM, not as client success or fabricated failure', async () => {
      await page.addInitScript(() => {
        Object.defineProperty(globalThis, 'S147Lesson', {
          configurable: true, get() { return undefined; }, set() {},
        });
      });
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('body').getAttribute('data-lesson-ready'), 'error');
      assert.match(await page.locator('#error-output').textContent(), /ERR_INITIALIZATION.*unavailable or incompatible/);
      assert.equal(await page.locator('#error-output').isVisible(), true);
      assert.equal(await activeId(), 'error-output');
      assert.match(await page.locator('#status-output').textContent(), /No client outcome can be inferred/);
      assert.equal(await page.locator('button:enabled, select:enabled').count(), 0);
      assert.equal(await readJSON('impact-output'), null);
      assert.deepEqual(await readJSON('assertions-output'), []);
      evidence.initializationFault = 'Test-only browser init guard withholds the module; no asset, network, CSP override or business operation.';
    });
    evidence.passed = evidence.checks.length === 8 && evidence.checks.every((item) => item.verdict === 'PASS');
  } finally {
    try {
      if (session) {
        await session.close();
        evidence.cleanup = 'awaited-closed';
      }
    } catch (error) {
      evidence.cleanup = 'close-failed';
      evidence.passed = false;
      evidence.cleanupError = error.stack;
      throw error;
    } finally {
      const target = captureBrowser(evidence);
      if (target) console.log(`Deliberate unique raw browser capture: ${target}`);
    }
  }
});
