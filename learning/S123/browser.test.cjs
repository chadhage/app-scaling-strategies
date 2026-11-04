'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperSha256 = sha(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

function ownedHashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, ownedHashes(target, relative));
    else {
      assert.equal(entry.isFile(), true, 'Owned lesson files must be ordinary files');
      result[relative] = sha(fs.readFileSync(target));
    }
  }
  return result;
}

test('actual container-lesson DOM, keyboard, negative/unknown results, errors, reset, CSP and cleanup', { timeout: 120000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  const playwrightVersion = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  assert.equal(playwrightVersion, '1.56.1');
  const before = ownedHashes();
  const observations = [];
  const pageErrors = [];
  const remoteRequests = [];
  let checksFailed = false;
  let session;
  let closed = false;
  let violations = [];
  const check = (name, operation) => t.test(name, async () => {
    try { await operation(); } catch (failure) { checksFailed = true; throw failure; }
  });
  try {
    session = await openIsolatedLesson(path.join('learning', 'S123', 'index.html'));
    assert.equal(session.browserVersion, '156.0.4314.50');
    const page = session.page;
    const initialURL = page.url();
    page.on('pageerror', (failure) => pageErrors.push(failure.message));
    page.on('request', (request) => {
      if (/^(https?|wss?):/i.test(request.url())) remoteRequests.push(request.url());
    });
    const key = async (id) => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press('Enter');
    };
    const text = (id) => page.locator(`#${id}`).textContent();
    const snapshot = async (name) => {
      observations.push(await page.evaluate((label) => ({
        name: label,
        phase: document.getElementById('phase').textContent,
        production: document.getElementById('production').textContent,
        verification: document.getElementById('verdict').textContent,
        impact: document.getElementById('impact').textContent,
        status: document.getElementById('status').textContent,
        metrics: document.getElementById('metrics').textContent,
        history: [...document.querySelectorAll('#history li')].map((node) => node.textContent),
        journeys: [...document.querySelectorAll('#journeys tr')].map((node) => node.textContent),
        error: document.getElementById('error').hidden ? null : document.getElementById('error').textContent,
        focusedId: document.activeElement.id,
        formResetIsFunction: typeof document.getElementById('setup').reset === 'function',
      }), name));
    };
    const reset = async (fixture = 'prepared', promotionPath = 'manual') => {
      await key('reset-button');
      assert.equal(await text('phase'), 'new');
      assert.equal(await text('production'), 'teaching-v1');
      assert.equal(await text('verdict'), 'unverified');
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#journeys tr').count(), 0);
      assert.match(await text('metrics'), /0 attempted.*no migration evidence/);
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.equal(await page.locator('#fixture-select').inputValue(), 'prepared');
      assert.equal(await page.locator('#path-select').inputValue(), 'manual');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture-select');
      await page.locator('#fixture-select').selectOption(fixture);
      await page.locator('#path-select').selectOption(promotionPath);
    };
    const prepareAndInitialize = async (fixture = 'prepared', promotionPath = 'manual') => {
      await reset(fixture, promotionPath);
      await key('prepare-button');
      await key('initialize-button');
    };

    await check('standalone banner, fixed fixtures, semantic controls and no remote load', async () => {
      assert.equal(await text('banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#fixture-select option').count(), 10);
      assert.match(await text('fixture-data'), /registry\.example\.invalid/);
      assert.match(await text('fixture-data'), /not an executable command/);
      assert.equal(await page.locator('#initialize-button').isDisabled(), true);
      assert.equal(await page.locator('#promote-button').isDisabled(), true);
      assert.equal(await page.locator('#observe-button').isDisabled(), true);
      assert.equal(await page.evaluate(() => typeof document.getElementById('setup').reset), 'function');
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
      assert.equal(resources.some((url) => /^(https?|wss?):/i.test(url)), false);
      await snapshot('initial-load');
    });

    await check('real Tab and Enter progression measures pending and positive candidate journeys', async () => {
      await page.locator('#fixture-select').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'path-select');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare-button');
      await page.keyboard.press('Enter');
      assert.equal(await text('phase'), 'prepared');
      assert.equal(await page.locator('#history li').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'initialize-button');
      assert.match(await text('metrics'), /0 attempted.*no migration evidence/);
      await page.keyboard.press('Enter');
      assert.equal(await text('phase'), 'ready');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'promote-button');
      await page.keyboard.press('Enter');
      assert.equal(await text('phase'), 'promoted');
      assert.match(await text('metrics'), /2 attempted.*2 unknown/);
      assert.equal(await page.locator('#journeys tr').count(), 2);
      await snapshot('pending-started-journeys');
      await page.keyboard.press('Enter');
      assert.equal(await text('phase'), 'observed');
      assert.equal(await text('verdict'), 'positive');
      assert.match(await text('metrics'), /2 attempted.*2 positive.*0 negative.*0 unknown/);
      assert.equal(await page.locator('#history li').count(), 4);
      assert.match(await text('journeys'), /identity=.*session=.*state=.*effects=1.*contractCompatible=true/);
      assert.equal(page.url(), initialURL);
      await snapshot('positive-keyboard-manual');
    });

    await check('controlled pipeline has the same explicit gates, followed by complete reset', async () => {
      await prepareAndInitialize('prepared', 'pipeline');
      await key('promote-button');
      await key('observe-button');
      assert.equal(await text('verdict'), 'positive');
      assert.match(await text('history'), /Controlled pipeline promotion rehearsed only/);
      await snapshot('positive-controlled-pipeline');
      await reset();
      await snapshot('reset-after-positive');
    });

    await check('unsupported auto-swap is rejected before exposure and retained across a supported path', async () => {
      await prepareAndInitialize();
      assert.equal(await page.locator('#path-select option[value="native-auto-swap"]').count(), 0);
      await key('auto-swap-button');
      assert.equal(await text('phase'), 'ready');
      assert.equal(await text('verdict'), 'unsupported');
      assert.equal(await text('production'), 'teaching-v1');
      assert.match(await text('status'), /unsupported.*Linux.*Web App for Containers/);
      assert.equal(await page.locator('#history li').count(), 3);
      assert.match(await text('metrics'), /0 attempted.*no migration evidence/);
      await snapshot('unsupported-auto-swap');
      await key('promote-button');
      await key('observe-button');
      assert.equal(await text('verdict'), 'positive');
      assert.equal(await page.locator('#history li').count(), 5);
      assert.match(await text('history'), /reject-auto-swap.*unsupported/);
      await reset();
    });

    for (const fixture of ['mutable-tag', 'pull-failed', 'wrong-port', 'startup-failed', 'startup-unknown', 'shallow-green', 'no-headroom']) {
      await check(`actual ${fixture} pre-exposure result and reset`, async () => {
        await reset(fixture);
        await key('prepare-button');
        if (await text('phase') === 'prepared') await key('initialize-button');
        assert.equal(await text('phase'), fixture === 'startup-unknown' ? 'held' : 'blocked');
        assert.equal(await text('verdict'), fixture === 'startup-unknown' ? 'unknown' : 'negative');
        assert.equal(await text('production'), 'teaching-v1');
        assert.equal(await page.locator('#promote-button').isDisabled(), true);
        assert.match(await text('metrics'), /0 attempted.*no migration evidence/);
        if (fixture === 'no-headroom') assert.match(await text('status'), /11.*10.*extra slots add no compute/);
        if (fixture === 'shallow-green') assert.match(await text('status'), /200.*not meaningful readiness/);
        await snapshot(fixture);
        await reset();
      });
    }

    for (const [fixture, verdict, counts] of [
      ['journey-interrupted', 'negative', /2 attempted.*1 positive.*1 negative.*0 unknown/],
      ['journey-unknown', 'unknown', /2 attempted.*1 positive.*0 negative.*1 unknown/],
    ]) {
      await check(`actual ${fixture} retains both started attempts, history and reset`, async () => {
        await prepareAndInitialize(fixture);
        await key('promote-button');
        assert.match(await text('metrics'), /2 attempted.*2 unknown/);
        await key('observe-button');
        assert.equal(await text('verdict'), verdict);
        assert.match(await text('metrics'), counts);
        assert.equal(await page.locator('#journeys tr').count(), 2);
        assert.equal(await page.locator('#history li').count(), 4);
        if (verdict === 'negative') assert.match(await text('journeys'), /status=503.*latency=900.*budget=500.*effects=0/);
        else assert.match(await text('journeys'), /unknown.*status=unknown.*effects=unknown/);
        await snapshot(fixture);
        await reset();
        await snapshot(`reset-after-${fixture}`);
      });
    }

    await check('invalid typed selection gives a focused error without state changes; reset recovers', async () => {
      await reset();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'native-auto-swap';
        option.textContent = 'Injected invalid test value';
        document.getElementById('path-select').append(option);
        document.getElementById('path-select').value = option.value;
      });
      await key('prepare-button');
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await text('error'), /Invalid promotion path.*No state was changed/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await text('phase'), 'new');
      assert.equal(await page.locator('#history li').count(), 0);
      await snapshot('typed-selection-error');
      await reset();
      await page.locator('#path-select option[value="native-auto-swap"]').evaluate((option) => option.remove());
      await snapshot('reset-after-error');
    });

    await check('forced out-of-order DOM event still reaches a strict non-mutating state guard', async () => {
      await reset();
      await page.locator('#initialize-button').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await text('error'), /requires prepared.*No state was changed/);
      assert.equal(await text('phase'), 'new');
      assert.equal(await page.locator('#history li').count(), 0);
      await snapshot('out-of-order-state-error');
      await reset();
    });

    await check('20-action history bound stops further work without losing evidence and reset clears it', async () => {
      await reset();
      for (let index = 0; index < 20; index += 1) await key('auto-swap-button');
      assert.equal(await page.locator('#history li').count(), 20);
      assert.equal(await page.locator('#auto-swap-button').isDisabled(), true);
      assert.equal(await page.locator('#prepare-button').isDisabled(), true);
      await page.locator('#auto-swap-button').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await text('error'), /History limit 20 reached.*reset/);
      assert.equal(await page.locator('#history li').count(), 20);
      await snapshot('bounded-history-error');
      await reset();
      await snapshot('reset-after-bound');
    });

    await check('actual CSP blocks inline scripts, handlers, eval, styles, connections and form navigation', async () => {
      await page.evaluate(() => {
        globalThis.__s123Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s123Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
        });
      });
      const probes = await page.evaluate(async () => {
        globalThis.__s123InlineRan = false;
        globalThis.__s123HandlerRan = false;
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s123InlineRan = true';
        document.head.append(script);
        const button = document.createElement('button');
        button.setAttribute('onclick', 'globalThis.__s123HandlerRan = true');
        document.body.append(button);
        button.click();
        const evalButton = document.createElement('button');
        evalButton.type = 'button';
        evalButton.id = 'csp-origin-eval-probe';
        evalButton.textContent = 'Origin CSP eval probe (testing only)';
        evalButton.addEventListener('click', () => {
          globalThis.__s123EvalRan = false;
          try {
            globalThis.eval('globalThis.__s123EvalRan = true');
            globalThis.__s123EvalBlocked = false;
          } catch (failure) {
            globalThis.__s123EvalBlocked = failure.name === 'EvalError';
          }
        });
        document.body.append(evalButton);
        const style = document.createElement('style');
        style.textContent = '#banner { display: none; }';
        document.head.append(style);
        let connectionBlocked = false;
        try { await fetch('https://example.invalid/csp-denied'); } catch (failure) { connectionBlocked = failure.name === 'TypeError'; }
        return { inlineRan: globalThis.__s123InlineRan, handlerRan: globalThis.__s123HandlerRan, connectionBlocked };
      });
      // DevTools evaluation bypasses eval policy; a native keyboard callback does not.
      await key('csp-origin-eval-probe');
      const originEval = await page.evaluate(() => ({ blocked: globalThis.__s123EvalBlocked, ran: globalThis.__s123EvalRan }));
      assert.deepEqual(probes, { inlineRan: false, handlerRan: false, connectionBlocked: true });
      assert.deepEqual(originEval, { blocked: true, ran: false });
      assert.equal(await page.locator('#banner').isVisible(), true);
      // Keep the blocked navigation last: Playwright gates later locator actions on it.
      await page.evaluate(() => {
        const form = document.createElement('form');
        form.action = location.href;
        document.body.append(form);
        form.submit();
      });
      await page.waitForFunction(() => globalThis.__s123Violations.length >= 6);
      violations = await page.evaluate(() => globalThis.__s123Violations);
      assert.ok(violations.some((item) => item.directive === 'script-src' && item.blockedURI === 'eval'));
      for (const prefix of ['script-src', 'style-src', 'connect-src', 'form-action']) {
        assert.ok(violations.some((item) => item.directive.startsWith(prefix)), prefix);
      }
      assert.equal(page.url(), initialURL);
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      await snapshot('actual-csp-denials');
    });
  } finally {
    if (session) await session.close();
    closed = true;
  }
  assert.deepEqual(ownedHashes(), before, 'Verification must not modify any owned file bytes');
  assert.equal(checksFailed, false, 'Do not publish a success-shaped capture after a failed browser assertion');
  assert.equal(closed, true);
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const evidence = {
      schemaVersion: 1, cardId: 'A-S123', workerId: 'worker-A-S123',
      mode: 'actual-local-browser-observation-of-fixed-synthetic-data',
      capturedAtUtc: new Date().toISOString(), node: process.version, playwright: playwrightVersion,
      browser: session.browserVersion, helperSha256, allChecksPassed: true,
      normalReadOnlyVerified: true, awaitedCloseCompleted: closed,
      nativeProofComplete: false, sourceParentComplete: false,
      testedOwnedRawSha256: before,
      observations, cspViolations: violations, pageErrors, remoteRequests,
    };
    const stamp = evidence.capturedAtUtc.replace(/[^0-9]/g, '');
    fs.writeFileSync(path.join(__dirname, 'evidence', 'raw', `browser-observations-${stamp}.json`),
      `${JSON.stringify(evidence, null, 2)}\r\n`, { flag: 'wx' });
  }
});
