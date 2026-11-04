'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const model = require('./model.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const helperPath = path.join(repoRoot, 'testing', 'browser', 'isolated.cjs');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helperPath)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

function ownedHashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, ownedHashes(target, relative));
    else {
      assert.equal(entry.isFile(), true, 'Owned lesson/proof entries must be ordinary files');
      result[relative] = hash(fs.readFileSync(target));
    }
  }
  return result;
}

test('actual standalone DOM, keyboard, failures, guards, reset, resource error and CSP', { timeout: 120000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(require(path.join(repoRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const before = ownedHashes();
  const observations = [];
  const errors = [];
  const remoteRequests = [];
  let checksFailed = false;
  const check = (name, action) => t.test(name, async () => {
    try { await action(); } catch (error) { checksFailed = true; throw error; }
  });
  const session = await openIsolatedLesson(path.join('learning', 'S124', 'index.html'));
  const page = session.page;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^(?:https?|wss?):/i.test(request.url())) remoteRequests.push(request.url());
  });
  const key = async (id, value = 'Enter') => {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press(value);
  };
  const reset = async (strategy = 'separate-plans', fixture = 'healthy') => {
    await key('reset-button');
    assert.equal(await page.locator('#phase').textContent(), 'awaiting-compare');
    assert.equal(await page.locator('#strategy-select').evaluate((el) => document.activeElement === el), true);
    await page.locator('#strategy-select').selectOption(strategy);
    await page.locator('#fixture-select').selectOption(fixture);
  };
  const warm = async (strategy = 'separate-plans', fixture = 'healthy') => {
    await reset(strategy, fixture);
    await key('compare-button');
    await key('warm-button');
  };
  const route = async () => {
    await page.locator('#admission-percent').fill('100');
    await page.locator('#admission-percent').press('Enter');
  };
  const dispatch = async (id, type = 'click') => page.locator(`#${id}`).evaluate((el, eventType) => {
    el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
  }, type);
  const observe = async (name, extra = {}) => {
    const snapshot = await page.evaluate(() => {
      const fields = {};
      for (const id of ['phase', 'compute', 'plans', 'slots', 'placements', 'cost', 'isolation', 'fault-domains',
        'lifecycle', 'warm-up', 'routing', 'remaining', 'retention', 'counts', 'safe-aborts', 'user-outcome', 'outcome', 'error']) {
        fields[id] = document.getElementById(id).textContent;
      }
      return {
        fields, classification: document.getElementById('outcome').dataset.outcome,
        history: [...document.querySelectorAll('#history > li')].map((el) => el.textContent),
        fixedData: document.getElementById('observations').textContent,
        receipts: document.getElementById('receipts').textContent,
      };
    });
    observations.push({ name, ...snapshot, ...extra });
  };
  try {
    assert.equal(session.browserVersion, '156.0.4314.50');
    await check('standalone load, exact banner, real keyboard select/Tab and visible focus', async () => {
      assert.equal(await page.title(), 'S124 - Slots versus separate plans rehearsal');
      assert.equal(await page.locator('.banner').textContent(), model.BANNER);
      assert.equal(await page.locator('#startup-error').isVisible(), false);
      assert.equal(await page.getByLabel('Fixed placement strategy', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Fixed observation fixture', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('New-admission percent', { exact: true }).count(), 1);
      assert.equal(await page.locator('#fixture-select option').count(), Object.keys(model.FIXTURES).length);
      await page.locator('#strategy-select').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#strategy-select').inputValue(), 'separate-plans');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#fixture-select').evaluate((el) => document.activeElement === el), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#compare-button').evaluate((el) => document.activeElement === el), true);
      const focusOutline = await page.locator('#compare-button').evaluate((el) => getComputedStyle(el).outlineWidth);
      assert.equal(focusOutline, '3px');
      await observe('load-and-keyboard', { focusOutline });
    });

    await check('separate capacity stays fixed after content; positive lifecycle requires drain and retention', async () => {
      await reset();
      await key('compare-button', 'Space');
      assert.equal(await page.locator('#compute').textContent(), '48');
      assert.equal(await page.locator('#cost').textContent(), '4');
      await key('add-button');
      assert.equal(await page.locator('#compute').textContent(), '48');
      assert.match(await page.locator('#placements').textContent(), /4 workers \/ 3 placements/);
      await key('warm-button');
      await route();
      assert.equal(await page.locator('#phase').textContent(), 'exposed');
      assert.equal(await page.locator('#counts').textContent(), '2 / 2 / 0 / 0');
      assert.equal(await page.locator('#remaining').textContent(), '2 work / 0 pinned sessions');
      const retained = await page.locator('#history').textContent();
      await dispatch('retire-button');
      assert.match(await page.locator('#error').textContent(), /completed drain/);
      assert.equal(await page.locator('#history').textContent(), retained);
      await key('drain-button');
      assert.equal(await page.locator('#phase').textContent(), 'retained');
      assert.equal(await page.locator('#counts').textContent(), '4 / 4 / 0 / 0');
      await dispatch('retire-button');
      assert.match(await page.locator('#error').textContent(), /rollback-retention gates/);
      await key('retain-button');
      await key('retire-button');
      assert.equal(await page.locator('#phase').textContent(), 'retired');
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'positive');
      assert.equal(await page.locator('#user-outcome').textContent(), 'Uninterrupted synthetic transition');
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#history > li').count(), 7);
      assert.match(await page.locator('#fault-domains').textContent(), /Shared.*unverified/);
      await observe('positive-separate-lifecycle-with-runtime-retirement-guards');
    });

    await check('invalid typed input preserves state/history, announces error and focuses exact field', async () => {
      await warm();
      const retained = await page.locator('#history').textContent();
      for (const value of ['100.0', ' 100', '100 ', '+100', '1e2', '99', '100x', '']) {
        await page.locator('#admission-percent').fill(value);
        await page.locator('#admission-percent').press('Enter');
        assert.match(await page.getByRole('alert').filter({ hasText: 'State/input rejected' }).textContent(), /Enter exactly 100/);
        assert.equal(await page.locator('#admission-percent').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.locator('#admission-percent').evaluate((el) => document.activeElement === el), true);
        assert.equal(await page.locator('#phase').textContent(), 'ready');
        assert.equal(await page.locator('#history').textContent(), retained);
      }
      await observe('typed-errors-preserve-ready-state');
      await route();
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#admission-percent').getAttribute('aria-invalid'), null);
      assert.equal(await page.locator('#phase').textContent(), 'exposed');
    });

    await check('native reset is keyboard usable even when both form reset properties are shadowed', async () => {
      const shadowTypes = await page.evaluate(() => ['comparison-form', 'routing-form'].map((id) => {
        const input = document.createElement('input');
        input.name = 'reset';
        input.className = 'test-shadow';
        document.getElementById(id).append(input);
        return typeof document.getElementById(id).reset;
      }));
      assert.deepEqual(shadowTypes, ['object', 'object']);
      await key('reset-button', 'Space');
      assert.equal(await page.locator('#history > li').count(), 0);
      assert.equal(await page.locator('#phase').textContent(), 'awaiting-compare');
      assert.equal(await page.locator('#counts').textContent(), '0 / 0 / 0 / 0');
      assert.equal(await page.locator('#admission-percent').inputValue(), '100');
      assert.equal(await page.locator('#strategy-select').inputValue(), 'shared-slots');
      assert.equal(await page.locator('#fixture-select').inputValue(), 'healthy');
      assert.equal(await page.locator('#strategy-select').isEnabled(), true);
      assert.equal(await page.locator('#strategy-select').evaluate((el) => document.activeElement === el), true);
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#admission-percent').getAttribute('aria-invalid'), null);
      await page.locator('.test-shadow').evaluateAll((elements) => elements.forEach((el) => el.remove()));
      await observe('keyboard-reset-with-shadowed-native-method', { shadowTypes });
    });

    await check('shared native recycling remains an interrupted transition; slot retention cannot drain it', async () => {
      await warm('shared-slots');
      await route();
      assert.equal(await page.locator('#compute').textContent(), '24');
      assert.equal(await page.locator('#phase').textContent(), 'exposed-held');
      assert.equal(await page.locator('#counts').textContent(), '4 / 2 / 2 / 0');
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'negative');
      assert.match(await page.locator('#receipts').textContent(), /recycling abandoned existing work despite retained slot/);
      assert.equal(await page.locator('#drain-button').isDisabled(), true);
      const retained = await page.locator('#history').textContent();
      await dispatch('drain-button');
      assert.match(await page.locator('#error').textContent(), /not an application-controlled drain/);
      assert.equal(await page.locator('#history').textContent(), retained);
      await observe('shared-swap-interruptions-not-erased');
    });

    await check('identical overlap demonstrates real compute-pool distinction within the fictional data', async () => {
      await reset('shared-slots', 'overlap');
      await key('compare-button');
      await key('add-button');
      await key('warm-button');
      assert.equal(await page.locator('#compute').textContent(), '24');
      assert.equal(await page.locator('#phase').textContent(), 'held');
      assert.equal(await page.locator('#safe-aborts').textContent(), '1');
      assert.equal(await page.locator('#counts').textContent(), '0 / 0 / 0 / 0');
      assert.match(await page.locator('#outcome').textContent(), /28 exceeds 24/);
      await observe('shared-overlap-negative-safe-abort');
      await warm('separate-plans', 'overlap');
      assert.equal(await page.locator('#phase').textContent(), 'ready');
      assert.equal(await page.locator('#compute').textContent(), '48');
      await observe('separate-overlap-positive-capacity-not-fault-certification');
    });

    await check('both placements reject successful-shaped warm-up without initialization', async () => {
      for (const strategy of model.STRATEGIES) {
        await warm(strategy, 'warmup-only');
        assert.equal(await page.locator('#phase').textContent(), 'held');
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'negative');
        assert.match(await page.locator('#observations').textContent(), /"httpStatus": 200/);
        assert.match(await page.locator('#observations').textContent(), /"initialized": false/);
        assert.equal(await page.locator('#route-button').isDisabled(), true);
        await observe(`${strategy}-200-is-not-readiness`);
      }
    });

    await check('session, missing-receipt, pin, dependency and host-restart failures remain measured', async () => {
      const cases = [
        ['session-loss', 'negative', '2 / 1 / 1 / 0'],
        ['missing-receipt', 'unknown', '2 / 1 / 0 / 1'],
        ['pinned-client', 'unknown', '2 / 1 / 0 / 1'],
        ['dependency-outage', 'negative', '4 / 0 / 4 / 0'],
        ['platform-restart', 'negative', '4 / 2 / 2 / 0'],
      ];
      for (const [fixture, classification, counts] of cases) {
        await warm('separate-plans', fixture);
        await route();
        assert.equal(await page.locator('#phase').textContent(), 'exposed-held');
        assert.equal(await page.locator('#counts').textContent(), counts);
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), classification);
        assert.equal(await page.locator('#drain-button').isDisabled(), true);
        assert.equal(await page.locator('#retire-button').isDisabled(), true);
        assert.match(await page.locator('#fault-domains').textContent(), /Shared.*unverified/);
        assert.equal(await page.locator('#history > li').count(), 3);
        await observe(`measured-${fixture}`);
      }
    });

    await check('unknown drain preserves pending work and bounded history; reset releases only memory', async () => {
      await warm('separate-plans', 'drain-pending');
      await route();
      await key('drain-button');
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'unknown');
      assert.equal(await page.locator('#remaining').textContent(), '2 work / 0 pinned sessions');
      assert.equal(await page.locator('#retain-button').isDisabled(), true);
      const retained = await page.locator('#history').textContent();
      await dispatch('retain-button');
      assert.match(await page.locator('#error').textContent(), /completed drain/);
      assert.equal(await page.locator('#history').textContent(), retained);
      while (await page.locator('#history > li').count() < model.MAX_ACTIONS) await key('drain-button');
      assert.equal(await page.locator('#history > li').count(), 24);
      assert.equal(await page.locator('#drain-button').isDisabled(), true);
      assert.match(await page.locator('#guard').textContent(), /24-action limit/);
      await observe('incomplete-drain-24-actions-no-fabricated-retirement');
      await reset();
      assert.equal(await page.locator('#history > li').count(), 0);
    });

    await check('invalid fixture and tampered locked controls cannot change state or retained history', async () => {
      await reset();
      await page.locator('#fixture-select').evaluate((el) => {
        const option = document.createElement('option');
        option.value = 'forged-fixture';
        option.textContent = 'forged teaching option';
        el.append(option);
        el.value = option.value;
      });
      await key('compare-button');
      assert.match(await page.locator('#error').textContent(), /exact fixed strategy and observation fixture/);
      assert.equal(await page.locator('#fixture-select').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#fixture-select').evaluate((el) => document.activeElement === el), true);
      assert.equal(await page.locator('#history > li').count(), 0);
      await page.locator('#fixture-select option[value="forged-fixture"]').evaluate((el) => el.remove());
      await reset();
      await key('compare-button');
      assert.equal(await page.locator('#fixture-select').isDisabled(), true);
      const retained = await page.locator('#history').textContent();
      await page.locator('#fixture-select').evaluate((el) => { el.value = 'session-loss'; });
      await dispatch('comparison-form', 'submit');
      assert.match(await page.locator('#error').textContent(), /Reset before changing/);
      assert.equal(await page.locator('#phase').textContent(), 'compared');
      assert.equal(await page.locator('#history').textContent(), retained);
      await observe('invalid-and-locked-fixture-runtime-guards');
    });

    await check('actual browser CSP blocks inline handlers, eval, data connections and form navigation', async () => {
      await reset();
      const originalURL = page.url();
      const probes = await page.evaluate(async () => {
        window.__violations = [];
        window.__inlineRan = 0;
        window.__pageWorldEvalProbe = null;
        window.__cspEvalRan = false;
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'window.__inlineRan = 1';
        document.body.append(script);
        const button = document.createElement('button');
        button.setAttribute('onclick', 'window.__inlineRan = 2');
        document.body.append(button);
        button.click();
        const evalScript = document.createElement('script');
        evalScript.src = new URL('evidence/probes/csp-probe.js', location.href).href;
        document.body.append(evalScript);
        let connectionBlocked = false;
        try { await fetch('data:text/plain,synthetic-csp-probe'); } catch (error) { connectionBlocked = error.name === 'TypeError'; }
        const form = document.createElement('form');
        form.action = new URL('manifest.json', location.href).href;
        document.body.append(form);
        HTMLFormElement.prototype.submit.call(form);
        return { connectionBlocked };
      });
      await page.waitForFunction(() => window.__pageWorldEvalProbe !== null);
      await page.waitForFunction(() => window.__violations.some((item) => item.directive === 'form-action'));
      const policy = await page.evaluate(() => ({
        inlineRan: window.__inlineRan, evalRan: window.__cspEvalRan,
        evalProbe: window.__pageWorldEvalProbe, violations: window.__violations,
      }));
      assert.deepEqual(probes, { connectionBlocked: true });
      assert.deepEqual(policy.evalProbe, { evalBlocked: true, errorName: 'EvalError' });
      assert.equal(policy.evalRan, false);
      assert.equal(policy.inlineRan, 0);
      assert.equal(page.url(), originalURL);
      assert.equal(policy.violations.some((item) => item.directive.startsWith('script-src')), true);
      assert.equal(policy.violations.some((item) => item.directive === 'script-src-attr'), true);
      assert.equal(policy.violations.some((item) => item.blockedURI === 'eval'), true);
      assert.equal(policy.violations.some((item) => item.directive === 'connect-src'), true);
      assert.equal(policy.violations.some((item) => item.directive === 'form-action'), true);
      assert.deepEqual(remoteRequests, []);
      await observe('actual-CSP-enforcement', {
        probes, policy, evalMethod: 'Normal page-loaded test script; not DevTools-evaluated code',
      });
    });

    await check('blocked lesson asset leaves visible startup error and every action disabled', async () => {
      await page.route(/\/app\.js(?:\?|$)/, (routeHandle) => routeHandle.abort('failed'));
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#startup-error').isVisible(), true);
      assert.match(await page.locator('#startup-error').textContent(), /Lesson controls did not initialize/);
      assert.equal(await page.locator('#phase').textContent(), 'awaiting-compare');
      assert.equal(await page.locator('button').evaluateAll((items) => items.every((item) => item.disabled)), true);
      assert.equal(await page.locator('#strategy-select').isDisabled(), true);
      await observe('actual-resource-failure-startup-UX');
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, []);
  } finally {
    await session.close();
  }

  const after = ownedHashes();
  assert.deepEqual(after, before, 'Browser verification must preserve all existing source and raw evidence bytes');
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const output = path.join(__dirname, 'evidence', 'raw', `browser-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(output, JSON.stringify({
      cardId: 'A-S124', observedAtUtc: new Date().toISOString(), mode: 'actual-isolated-headless-browser',
      browserVersion: session.browserVersion, playwrightVersion: '1.56.1', nodeVersion: process.version,
      helperSha256: hash(fs.readFileSync(helperPath)), checksPassed: !checksFailed, observations,
      pageErrors: errors, remoteRequests, existingOwnedBytesUnchanged: true,
      cleanup: 'awaited session.close completed in finally',
      qualification: 'Bounded observed run only; no native Azure, Node 24 or general unattended helper qualification',
      additionalCredits: 0,
    }, null, 2) + '\r\n', { flag: 'wx' });
  }
  assert.equal(checksFailed, false, 'All actual browser checks must pass');
});
