'use strict';
const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const owned = __dirname;
const helper = path.resolve(owned, '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);
const proof = {
  mode: 'actual-local-browser-observations-of-a-fixed-fictional-lesson',
  cloudResult: false, sourceParentComplete: false, nativeProofComplete: false,
  capturedAt: new Date().toISOString(), nodeVersion: process.version,
  playwrightVersion: require(path.resolve(owned, '..', '..', 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
  helperPublishedCommit: '53c0c0d', helperSha256, observations: [], sessions: [], requests: [],
};

async function snapshot(page) {
  return page.evaluate(() => ({
    banner: document.getElementById('mode-banner').textContent,
    result: document.getElementById('result').textContent,
    html: document.getElementById('html-observations').textContent,
    route: document.getElementById('route-observations').textContent,
    journeys: document.getElementById('journey-counts').textContent,
    local: document.getElementById('local-result').textContent,
    history: document.getElementById('history-body').textContent,
    error: document.getElementById('validation-error').hidden ? null : document.getElementById('validation-error').textContent,
    checks: [...document.querySelectorAll('#checks-body tr')].map((row) => [...row.cells].map((cell) => cell.textContent)),
    previews: ['v1', 'v2'].map((version) => {
      const section = document.getElementById(`preview-${version}`);
      const product = section.querySelector('.fixture-product');
      const image = section.querySelector('img');
      return {
        version, result: section.dataset.localResult || 'not loaded',
        caption: section.querySelector('.rendered-caption')?.textContent || null,
        background: product ? getComputedStyle(product).backgroundColor : null,
        imageComplete: image?.complete || false, naturalWidth: image?.naturalWidth || 0,
      };
    }),
  }));
}
async function ready(page) {
  await page.waitForFunction(() => document.getElementById('fatal-error').hidden);
}
async function start(page, fixture = 'retained-assets', budget = '2000') {
  await page.locator('#fixture').selectOption(fixture);
  await page.locator('#budget').fill(budget);
  await page.locator('#data-only').check();
  await page.locator('#start-run').click();
}
async function act(page, action) {
  await page.locator(`#${action}`).click();
  if (action === 'render-old' || action === 'render-new') {
    await page.waitForFunction(() => document.documentElement.dataset.pendingAssets === '0');
    await page.waitForFunction(() => !document.getElementById('next-action').textContent.startsWith('Loading'));
  }
}
async function allSteps(page) {
  for (const action of ['capture-old', 'check-readiness', 'cutover', 'render-old', 'render-new']) await act(page, action);
  await act(page, 'verify');
}
async function observation(t, name, page, assertion) {
  await t.test(name, async () => {
    try {
      const observed = await assertion();
      proof.observations.push({ name, passed: true, observed: observed || await snapshot(page) });
    } catch (error) {
      proof.observations.push({ name, passed: false, error: { message: error.message, stack: error.stack }, observed: await snapshot(page) });
      throw error;
    }
  });
}
after(() => {
  proof.finishedAt = new Date().toISOString();
  proof.allObservedAssertionsPassed = proof.observations.length > 0 && proof.observations.every((entry) => entry.passed);
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const target = path.join(owned, 'evidence', 'raw', `browser-${proof.capturedAt.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`);
    fs.writeFileSync(target, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
    console.log(`Deliberate append-only browser evidence: ${target}`);
  }
});

test('S131 actual DOM, rendering, operator and failure observations', { timeout: 180000 }, async (t) => {
  let session;
  try {
    session = await openIsolatedLesson('learning\\S131\\index.html');
  } catch (error) {
    proof.observations.push({ name: 'main isolated browser setup', passed: false, error: error.message });
    throw error;
  }
  const page = session.page;
  const browser = page.context().browser();
  const sessionProof = { entry: 'learning\\S131\\index.html', browserVersion: session.browserVersion };
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', (request) => proof.requests.push(request.url()));
  try {
    await page.reload();
    await ready(page);
    await observation(t, 'exact banner, native keyboard controls and visible invalid-input errors', page, async () => {
      assert.equal(await page.locator('#mode-banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      await page.locator('#budget').focus();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('2e3');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#data-only').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#start-run').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#validation-error').isVisible(), true);
      assert.match(await page.locator('#validation-error').innerText(), /ERR_INPUT.*no coercion/);
      assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#budget').evaluate((node) => node === document.activeElement), true);
      for (const value of ['2000 ', '02000', '2000.5', '99', '5001', '']) {
        await page.locator('#budget').fill(value);
        await page.locator('#start-run').click();
        assert.equal(await page.locator('#validation-error').isVisible(), true);
        assert.equal(await page.locator('#capture-old').isDisabled(), true);
      }
      await page.locator('#budget').fill('2000');
      await page.locator('#data-only').uncheck();
      await page.locator('#start-run').click();
      assert.match(await page.locator('#validation-error').innerText(), /literal boolean true/);
      assert.equal(await page.locator('#data-only').getAttribute('aria-invalid'), 'true');
    });
    await page.reload();
    await ready(page);
    await observation(t, 'out-of-order DOM-tampered action is denied without an observation', page, async () => {
      await start(page);
      const before = await page.locator('#history-body').innerText();
      await page.locator('#cutover').evaluate((node) => { node.disabled = false; });
      await page.locator('#cutover').click();
      assert.match(await page.locator('#validation-error').innerText(), /ERR_PHASE.*out of order/);
      assert.equal(await page.locator('#history-body').innerText(), before);
      assert.equal(await page.locator('#cutover').isDisabled(), true);
    });
    await page.locator('#reset-lesson').click();
    await observation(t, 'old HTML 200 is unverified and its required references remain unloaded', page, async () => {
      await start(page);
      await act(page, 'capture-old');
      await act(page, 'verify');
      const observed = await snapshot(page);
      assert.match(observed.result, /^UNVERIFIED/);
      assert.match(observed.html, /v1: fictional 200; v2: not observed/);
      assert.match(observed.journeys, /0 succeeded/);
      assert.equal(observed.previews[0].naturalWidth, 0);
      assert.ok(observed.checks.some((check) => check[0] === 'v1 required script status' && check[3] === 'UNKNOWN'));
      return observed;
    });
    await observation(t, 'keyboard positive cutover really renders owned old and new CSS/script/image assets', page, async () => {
      await page.locator('#check-readiness').focus();
      for (const action of ['check-readiness', 'cutover', 'render-old', 'render-new']) {
        assert.equal(await page.locator(`#${action}`).evaluate((node) => node === document.activeElement), true);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.documentElement.dataset.pendingAssets === '0');
        const next = { 'check-readiness': 'cutover', cutover: 'render-old', 'render-old': 'render-new', 'render-new': 'verify' }[action];
        await page.waitForFunction((id) => document.activeElement.id === id, next);
      }
      await page.keyboard.press('Space');
      const observed = await snapshot(page);
      assert.match(observed.result, /^PASS — uninterrupted-transition/);
      assert.match(observed.journeys, /2 attempted; 2 succeeded; 0 failed; 0 unknown/);
      assert.deepEqual(observed.previews.map((entry) => entry.result), ['passed', 'passed']);
      assert.deepEqual(observed.previews.map((entry) => entry.caption), ['Archive shelf — v1', 'Today shelf — v2']);
      assert.deepEqual(observed.previews.map((entry) => entry.background), ['rgb(224, 243, 255)', 'rgb(233, 255, 230)']);
      assert.deepEqual(observed.previews.map((entry) => entry.naturalWidth), [80, 88]);
      assert.ok(observed.previews.every((entry) => entry.imageComplete));
      assert.ok(observed.checks.every((check) => check[3] === 'PASS'));
      assert.match(observed.history, /UNVERIFIED/);
      assert.match(observed.history, /PASS/);
      return observed;
    });
    await observation(t, 'keyboard reset restores defaults and preserves all prior assessments', page, async () => {
      const historyBefore = await page.locator('#history-body').innerText();
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#fixture').inputValue(), 'retained-assets');
      assert.equal(await page.locator('#budget').inputValue(), '2000');
      assert.equal(await page.locator('#data-only').isChecked(), false);
      assert.equal(await page.locator('#fixture').evaluate((node) => node === document.activeElement), true);
      assert.match(await page.locator('#history-body').innerText(), /UNVERIFIED/);
      assert.match(await page.locator('#history-body').innerText(), /PASS/);
      assert.ok((await page.locator('#history-body').innerText()).length > historyBefore.length);
      assert.equal(await page.locator('#preview-v1 .fixture-product').count(), 0);
      assert.equal(await page.locator('#cutover').isDisabled(), true);
      assert.equal(await page.locator('#configuration').evaluate((node) => typeof node.reset), 'function');
    });
    for (const [fixture, expected] of [
      ['missing-old-script', 'failed'],
      ['missing-new-image', 'failed'],
      ['wrong-cache-version', 'failed'],
      ['render-defect', 'failed'],
    ]) {
      await page.reload();
      await ready(page);
      await observation(t, `${fixture}: HTML 200 and nominal cutover do not conceal actual local render failure`, page, async () => {
        await start(page, fixture);
        await allSteps(page);
        const observed = await snapshot(page);
        assert.match(observed.result, /^FAIL — interrupted-transition/);
        assert.match(observed.html, /v1: fictional 200; v2: fictional 200/);
        assert.match(observed.route, /nominal cutover true/);
        assert.match(observed.journeys, /2 attempted; 1 succeeded; 1 failed; 0 unknown/);
        assert.ok(observed.previews.some((entry) => entry.result === expected));
        if (fixture === 'missing-old-script') assert.equal(observed.previews[0].caption, 'Script-dependent content not rendered.');
        if (fixture === 'missing-new-image') assert.equal(observed.previews[1].naturalWidth, 0);
        if (fixture === 'wrong-cache-version') assert.equal(observed.previews[0].background, 'rgb(255, 255, 255)');
        if (fixture === 'render-defect') assert.equal(observed.previews[1].caption, 'Incorrect shelf — render defect');
        return observed;
      });
    }
    await observation(t, 'a later positive run cannot erase the retained failed user journey', page, async () => {
      await page.locator('#reset-lesson').click();
      assert.match(await page.locator('#history-body').innerText(), /FAIL — interrupted-transition/);
      await start(page);
      await allSteps(page);
      assert.match(await page.locator('#result').innerText(), /^PASS/);
      assert.match(await page.locator('#history-body').innerText(), /render-defect/);
      assert.match(await page.locator('#history-body').innerText(), /FAIL — interrupted-transition/);
    });
    for (const fixture of ['lost-browse-context', 'slow-html-200']) {
      await page.reload();
      await ready(page);
      await observation(t, `${fixture}: complete local rendering does not conceal the fixed journey failure`, page, async () => {
        await start(page, fixture);
        await allSteps(page);
        const observed = await snapshot(page);
        assert.match(observed.result, /^FAIL — interrupted-transition/);
        assert.deepEqual(observed.previews.map((entry) => entry.result), ['passed', 'passed']);
        assert.match(observed.journeys, /1 failed/);
        assert.ok(observed.checks.some((check) => check[3] === 'FAIL'));
        return observed;
      });
    }
    for (const fixture of ['unknown-page-receipts', 'unknown-routing']) {
      await page.reload();
      await ready(page);
      await observation(t, `${fixture}: required unknowns remain unverified despite nominal cutover`, page, async () => {
        await start(page, fixture);
        await allSteps(page);
        const observed = await snapshot(page);
        assert.match(observed.result, /^UNVERIFIED — unknown-transition/);
        assert.match(observed.route, /nominal cutover true/);
        assert.ok(observed.checks.some((check) => check[3] === 'UNKNOWN'));
        if (fixture === 'unknown-page-receipts') {
          assert.equal(observed.previews[0].result, 'unknown');
          assert.equal(observed.previews[0].naturalWidth, 0);
          assert.match(observed.journeys, /1 unknown/);
        } else {
          assert.deepEqual(observed.previews.map((entry) => entry.result), ['passed', 'passed']);
          assert.match(observed.journeys, /0 succeeded; 0 failed; 2 unknown/);
        }
        return observed;
      });
    }
    for (const fixture of ['unknown-readiness', 'candidate-not-ready']) {
      await page.reload();
      await ready(page);
      await observation(t, `${fixture}: actual disabled cutover and visible denial prevent exposure`, page, async () => {
        await start(page, fixture);
        await act(page, 'capture-old');
        await act(page, 'check-readiness');
        assert.equal(await page.locator('#cutover').isDisabled(), true);
        await page.locator('#cutover').evaluate((node) => { node.disabled = false; });
        await page.locator('#cutover').click();
        assert.match(await page.locator('#validation-error').innerText(), /ERR_READINESS.*denied before exposure/);
        assert.equal(await page.locator('#cutover').isDisabled(), true);
        await act(page, 'verify');
        const observed = await snapshot(page);
        assert.match(observed.result, fixture === 'unknown-readiness' ? /^UNVERIFIED — not-exposed/ : /^FAIL — not-exposed/);
        assert.match(observed.journeys, /0 succeeded/);
        assert.match(observed.route, /nominal cutover false/);
        return observed;
      });
    }
    await page.reload();
    await ready(page);
    await observation(t, 'reset during an actual pending local load cannot write stale render success', page, async () => {
      await start(page);
      for (const action of ['capture-old', 'check-readiness', 'cutover']) await act(page, action);
      await page.evaluate(() => {
        document.getElementById('render-old').click();
        document.getElementById('reset-lesson').click();
      });
      await page.waitForFunction(() => document.documentElement.dataset.pendingAssets === '0');
      assert.equal(await page.locator('#preview-v1').getAttribute('data-local-result'), null);
      assert.equal(await page.locator('#preview-v1 .rendered-caption').count(), 0);
      assert.match(await page.locator('#history-body').innerText(), /Reset while local illustration was loading/);
      assert.match(await page.locator('#history-body').innerText(), /unknown/);
      assert.equal(await page.locator('#fixture').isDisabled(), false);
    });
    await page.reload();
    await ready(page);
    await observation(t, 'actual six-run UI bound refuses a seventh without pruning history', page, async () => {
      for (let run = 0; run < 6; run++) {
        await start(page);
        await act(page, 'capture-old');
        await page.locator('#reset-lesson').click();
      }
      assert.equal(await page.locator('#start-run').isDisabled(), true);
      assert.match(await page.locator('#next-action').innerText(), /Six-run bound reached/);
      assert.match(await page.locator('#history-body').innerText(), /1 \/ retained-assets/);
      assert.match(await page.locator('#history-body').innerText(), /6 \/ retained-assets/);
      await page.locator('#data-only').check();
      await page.locator('#start-run').evaluate((node) => { node.disabled = false; });
      await page.locator('#start-run').click();
      assert.match(await page.locator('#validation-error').innerText(), /ERR_BOUND/);
      assert.equal(await page.locator('#start-run').isDisabled(), true);
    });
    await page.reload();
    await ready(page);
    await observation(t, 'actual CSP denies inline script, eval and a local connection attempt', page, async () => {
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'evidence/csp-probe.js';
        document.head.append(script);
      });
      await page.waitForFunction(() => globalThis.S131CspProof?.connection === 'blocked'
        && globalThis.S131CspProof.violations.some((entry) => entry.effectiveDirective === 'connect-src')
        && globalThis.S131CspProof.violations.some((entry) => entry.blockedURI === 'inline')
        && globalThis.S131CspProof.violations.some((entry) => entry.blockedURI === 'eval'));
      const observed = await page.evaluate(() => globalThis.S131CspProof);
      assert.equal(observed.inlineRan, false);
      assert.equal(observed.evalRan, false);
      assert.equal(observed.evalError, 'EvalError');
      assert.equal(observed.connection, 'blocked');
      return observed;
    });
    await t.test('browser requests remain owned files and no unexpected JavaScript error occurs', () => {
      assert.deepEqual(pageErrors, []);
      assert.ok(proof.requests.length > 0);
      for (const request of proof.requests) {
        assert.equal(new URL(request).protocol, 'file:');
        const relative = path.relative(owned, fileURLToPath(request));
        assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      }
      proof.observations.push({ name: 'owned-file requests and expected browser errors', passed: true, observed: { pageErrors, consoleErrors, requests: proof.requests.length } });
    });
  } catch (error) {
    proof.observations.push({ name: 'main browser execution', passed: false, error: error.message });
    throw error;
  } finally {
    try {
      await session.close();
      sessionProof.closeAwaited = true;
      sessionProof.pageClosed = page.isClosed();
      sessionProof.browserDisconnected = !browser.isConnected();
    } catch (error) {
      sessionProof.closeAwaited = false;
      sessionProof.error = error.message;
      proof.observations.push({ name: 'main browser cleanup', passed: false, error: error.message });
      throw error;
    } finally {
      proof.sessions.push(sessionProof);
    }
  }
});

test('S131 actual missing-model error is fail-closed', { timeout: 45000 }, async () => {
  let session;
  try {
    session = await openIsolatedLesson('learning\\S131\\evidence\\missing-model.html');
  } catch (error) {
    proof.observations.push({ name: 'missing-model isolated browser setup', passed: false, error: error.message });
    throw error;
  }
  const browser = session.page.context().browser();
  const observed = { entry: 'learning\\S131\\evidence\\missing-model.html', browserVersion: session.browserVersion };
  try {
    observed.banner = await session.page.locator('#mode-banner').innerText();
    observed.error = await session.page.locator('#fatal-error').innerText();
    observed.visible = await session.page.locator('#fatal-error').isVisible();
    observed.buttonDisabled = await session.page.locator('button').isDisabled();
    observed.inputDisabled = await session.page.locator('input').isDisabled();
    assert.match(observed.error, /Lesson model did not load.*no result is verified/);
    assert.equal(observed.visible, true);
    assert.equal(observed.buttonDisabled, true);
    assert.equal(observed.inputDisabled, true);
    proof.observations.push({ name: 'actual missing-model fail-closed error', passed: true, observed });
  } catch (error) {
    proof.observations.push({ name: 'actual missing-model fail-closed error', passed: false, observed, error: error.message });
    throw error;
  } finally {
    try {
      await session.close();
      proof.sessions.push({ entry: observed.entry, closeAwaited: true, pageClosed: session.page.isClosed(), browserDisconnected: !browser.isConnected() });
    } catch (error) {
      proof.sessions.push({ entry: observed.entry, closeAwaited: false, error: error.message });
      proof.observations.push({ name: 'missing-model browser cleanup', passed: false, error: error.message });
      throw error;
    }
  }
});
