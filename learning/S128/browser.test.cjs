'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const HELPER_SHA = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex'), HELPER_SHA);
const { openIsolatedLesson } = require(helperPath);
const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
function ownedHashes(directory = __dirname, prefix = '') {
  const hashes = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(), false, 'No owned evidence junction/symlink traversal.');
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, ownedHashes(path.join(directory, entry.name), relative));
    else hashes[relative] = createHash('sha256').update(fs.readFileSync(path.join(directory, entry.name))).digest('hex');
  }
  return hashes;
}

test('actual isolated signed-Edge DOM, keyboard, errors, reset, failure and CSP', async (t) => {
  const before = ownedHashes();
  const observations = [];
  const tooling = {
    node: process.version,
    playwright: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    helperSha256: HELPER_SHA, helperCommit: '53c0c0d', inactivePrototypeUsed: false,
    unattendedHelperQualified: false,
  };
  const cleanup = [];
  let session;
  let page;
  const pageErrors = [];
  const read = async () => JSON.parse(await page.locator('#state-view').textContent());
  const action = async (value) => {
    await page.locator(`button[value="${value}"]`).focus();
    await page.keyboard.press('Enter');
  };
  const reset = async () => {
    await page.locator('#reset-lesson').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#action-count').textContent(), /^0\/12/);
  };
  const choose = async (id, value) => { await page.locator(`#${id}`).selectOption(value); };
  const conduct = async (fixture = 'compatible') => {
    await reset();
    await choose('fixture', fixture);
    for (const value of ['inspect', 'route', 'verify']) await action(value);
    return read();
  };
  const check = async (name, fn) => {
    await t.test(name, async () => {
      try {
        const result = await fn();
        observations.push({ case: name, status: 'passed', ...result });
      } catch (failure) {
        observations.push({ case: name, status: 'failed', error: failure.message });
        throw failure;
      }
    });
  };
  try {
    assert.equal(tooling.node, 'v22.23.4');
    assert.equal(tooling.playwright, '1.56.1');
    session = await openIsolatedLesson('learning\\S128\\index.html');
    page = session.page;
    tooling.edge = session.browserVersion;
    assert.equal(tooling.edge, '156.0.4314.50');
    page.on('pageerror', (failure) => pageErrors.push(failure.message));
    await check('baseline banner, inventory, labels and unknown gates', async () => {
      assert.equal(await page.locator('#training-banner').textContent(), BANNER);
      assert.equal(await page.locator('#pod-rows tr').count(), 4);
      assert.equal(await page.locator('#stage-rows tr').count(), 4);
      assert.ok((await page.locator('#result').textContent()).startsWith('unknown'));
      assert.equal(await page.locator('label[for="ga-selector"]').count(), 1);
      assert.equal(await page.locator('label[for="preview-selector"]').count(), 1);
      assert.equal(await page.locator('#result').getAttribute('role'), 'status');
      assert.equal(await page.locator('#error').getAttribute('role'), 'alert');
      assert.equal((await read()).history.length, 0);
      return { banner: BANNER, inventoryPods: 4, initialStatus: 'unknown' };
    });
    let happy;
    await check('keyboard tab/focus/submit completes independent positive gates', async () => {
      await page.locator('#ga-selector').focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.value), 'inspect');
      const focus = await page.evaluate(() => ({
        visible: document.activeElement.matches(':focus-visible'),
        style: getComputedStyle(document.activeElement).outlineStyle,
      }));
      assert.equal(focus.visible, true);
      assert.notEqual(focus.style, 'none');
      await page.keyboard.press('Enter');
      assert.equal((await read()).topology.status, 'passed');
      await action('route');
      assert.equal((await read()).journeys.status, 'unknown');
      assert.equal((await read()).authorization.status, 'unknown');
      await action('verify');
      happy = await read();
      assert.ok((await page.locator('#result').textContent()).startsWith('passed'));
      assert.equal(await page.locator('#authorization-rows tr').count(), 8);
      assert.match(await page.locator('#journey-counts').textContent(), /^2 attempted; 2 passed; 0 failed; 0 unknown/);
      assert.deepEqual(happy.journeys.items.map((item) => item.responseApiContract), ['profile-v1', 'profile-v1']);
      assert.ok(happy.journeys.items.every((item) => item.stateAfter === 'cart:3' && item.completed));
      return { focus, state: happy, counts: await page.locator('#journey-counts').textContent() };
    });
    await check('keyboard app-only GA selection exposes mixed audience and retains prior positive history', async () => {
      await page.locator('#ga-selector').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#ga-selector').inputValue(), 'app-only');
      for (const value of ['inspect', 'route', 'verify']) await action(value);
      const state = await read();
      assert.equal(state.topology.services[0].matchedPods.length, 4);
      assert.equal(state.topology.status, 'failed');
      assert.equal(state.traffic.receipts[0].observedService, 'fictional-GA-service');
      assert.equal(state.traffic.receipts[0].observedSoftwareVersion, 'build-2');
      assert.equal(state.authorization.routeLeak, true);
      assert.ok((await page.locator('#result').textContent()).startsWith('failed'));
      assert.deepEqual(state.history.slice(0, 3), happy.history);
      assert.equal(await page.locator('#history li').count(), 6);
      return { state, retainedPositiveHistory: true };
    });
    await check('tampered invalid selector is a focused typed alert with no state/history mutation', async () => {
      const before = await page.locator('#state-view').textContent();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'app=arbitrary-not-allowed';
        option.textContent = 'invalid teaching input';
        option.dataset.injected = 'true';
        document.getElementById('ga-selector').append(option);
        document.getElementById('ga-selector').value = option.value;
      });
      await action('inspect');
      assert.match(await page.locator('#error').textContent(), /^ERR_INPUT:/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await page.locator('#state-view').textContent(), before);
      await page.locator('option[data-injected]').evaluate((element) => element.remove());
      return { error: await page.locator('#error').textContent(), stateUnchanged: true, focusedAlert: true };
    });
    await check('keyboard reset survives actual form.reset shadowing and clears only page memory', async () => {
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.name = 'reset';
        input.dataset.shadow = 'true';
        document.getElementById('lesson-controls').append(input);
      });
      assert.notEqual(await page.evaluate(() => typeof document.getElementById('lesson-controls').reset), 'function');
      await reset();
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#ga-selector').inputValue(), 'build-1-only');
      assert.equal(await page.locator('#preview-selector').inputValue(), 'build-2-only');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'ga-selector');
      assert.ok((await page.locator('#result').textContent()).startsWith('unknown'));
      await page.locator('input[data-shadow]').evaluate((element) => element.remove());
      return { shadowedFormMember: true, prototypeResetWorked: true, state: await read() };
    });
    await check('valid premature and changed-control commands are retained failed holds', async () => {
      await action('verify');
      assert.equal((await read()).history[0].held, true);
      assert.ok((await page.locator('#result').textContent()).startsWith('failed'));
      await action('inspect');
      await choose('fixture', 'state-loss');
      assert.match(await page.locator('#control-note').textContent(), /Results still describe the last recorded choice/);
      await action('route');
      const state = await read();
      assert.equal(state.history.at(-1).held, true);
      assert.match(await page.locator('#result').textContent(), /inspect these exact controls first/);
      return { state, failedHoldGuidanceVisible: true };
    });
    await check('correct cohort selection cannot pass a leaked private-preview callback', async () => {
      const state = await conduct('private-preview-leak');
      assert.equal(state.topology.status, 'passed');
      assert.equal(state.traffic.status, 'passed');
      assert.equal(state.journeys.status, 'passed');
      assert.equal(state.authorization.status, 'failed');
      assert.equal(state.traffic.receipts[0].observedSoftwareVersion, 'build-1');
      assert.ok((await page.locator('#authorization-rows').textContent()).includes('preview-callback'));
      assert.ok((await page.locator('#result').textContent()).startsWith('failed'));
      return { state, zeroGaSelectionIsNotAuthorization: true };
    });
    await check('API contract, state and original-budget regressions fail despite HTTP 200', async () => {
      const states = [];
      for (const fixture of ['contract-break', 'state-loss', 'slow-200']) {
        const state = await conduct(fixture);
        assert.equal(state.traffic.status, 'passed');
        assert.equal(state.journeys.items[1].httpStatus, 200);
        assert.equal(state.journeys.items[1].observedSoftwareVersion, 'build-2');
        assert.equal(state.journeys.status, 'failed');
        if (fixture === 'contract-break') {
          assert.equal(Object.hasOwn(state.journeys.items[1].payload, 'displayName'), false);
          assert.equal(state.journeys.items[1].payload.fullName, 'Fictional Learner');
        }
        assert.match(await page.locator('#journey-counts').textContent(), /^2 attempted; 1 passed; 1 failed; 0 unknown/);
        states.push(state);
      }
      return { states, softwareNotApiContract: true, http200NotJourneySuccess: true };
    });
    await check('missing destination, completion or access cannot pass and attempts stay counted', async () => {
      const states = [];
      for (const fixture of ['unobserved-route', 'incomplete-journey', 'authorization-unknown']) {
        const state = await conduct(fixture);
        assert.ok((await page.locator('#result').textContent()).startsWith('unknown'));
        assert.equal(state.journeys.items.length, 2);
        if (fixture !== 'authorization-unknown') {
          assert.match(await page.locator('#journey-counts').textContent(), /^2 attempted; 1 passed; 0 failed; 1 unknown/);
        } else assert.equal(state.authorization.status, 'unknown');
        states.push(state);
      }
      return { states, unknownNotSuccess: true, bothAttemptsRetained: true };
    });
    await check('empty selector and Deployment-only routing are not valid substitutes', async () => {
      await reset();
      await choose('ga-selector', 'no-match');
      await action('inspect');
      assert.equal((await read()).topology.services[0].matchedPods.length, 0);
      assert.ok((await page.locator('#result').textContent()).startsWith('failed'));
      await reset();
      await choose('routing', 'deployments-only');
      for (const value of ['inspect', 'route', 'verify']) await action(value);
      const state = await read();
      assert.equal(state.traffic.status, 'unknown');
      assert.match(await page.locator('#capability-note').textContent(), /alone do not supply weighted/);
      assert.ok((await page.locator('#result').textContent()).startsWith('failed'));
      return { state, noDeploymentOnlyWeightedClaim: true };
    });
    await check('twelve-action bound retains history, typed limit error and reset recovery', async () => {
      await reset();
      for (let i = 0; i < 12; i++) await action('inspect');
      const before = await page.locator('#state-view').textContent();
      await action('inspect');
      assert.match(await page.locator('#error').textContent(), /^ERR_LIMIT:/);
      assert.equal(await page.locator('#history li').count(), 12);
      assert.equal(await page.locator('#state-view').textContent(), before);
      await reset();
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(pageErrors.length, 0);
      return { twelveRetained: true, thirteenthNonmutating: true, resetRecovered: true, pageErrors };
    });
  } finally {
    if (session) { await session.close(); cleanup.push('main: awaited close completed'); }
  }
  try {
    await check('actual missing-model failure is an unknown alert, with disabled controls', async () => {
      let failureSession;
      try {
        failureSession = await openIsolatedLesson('learning\\S128\\evidence\\missing-model.html');
        const failurePage = failureSession.page;
        assert.equal(await failurePage.locator('#training-banner').textContent(), BANNER);
        assert.match(await failurePage.locator('#error').textContent(), /^ERR_MODEL:/);
        assert.ok((await failurePage.locator('#result').textContent()).startsWith('unknown'));
        assert.equal(await failurePage.locator('select:enabled, button:enabled').count(), 0);
        assert.equal(await failurePage.evaluate(() => document.activeElement.id), 'error');
        return { error: await failurePage.locator('#error').textContent(), missingModelNotSuccess: true };
      } finally {
        if (failureSession) { await failureSession.close(); cleanup.push('missing-model: awaited close completed'); }
      }
    });
    await check('actual CSP denies inline script/event/style, eval, connections, images, frames and form navigation', async () => {
      let cspSession;
      try {
        cspSession = await openIsolatedLesson('learning\\S128\\evidence\\csp-probe.html');
        const cspPage = cspSession.page;
        const beforeURL = cspPage.url();
        await cspPage.locator('#csp-run').focus();
        await cspPage.keyboard.press('Enter');
        await cspPage.waitForFunction(() => globalThis.S128Csp.done === true);
        const csp = await cspPage.evaluate(() => globalThis.S128Csp);
        assert.equal(csp.error, undefined);
        assert.equal(csp.inlineScriptRan, false);
        assert.equal(csp.inlineEventRan, false);
        assert.equal(csp.evalRan, false);
        assert.equal(csp.evalError, 'EvalError');
        assert.equal(csp.connectionSucceeded, false);
        assert.equal(csp.currentColor, csp.originalColor);
        assert.notEqual(csp.currentBackground, 'rgb(12, 34, 56)');
        const directives = new Set(csp.violations.map((event) => event.directive));
        for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-elem',
          'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
          assert.ok(directives.has(directive), `Missing actual CSP violation: ${directive}`);
        }
        assert.equal(cspPage.url(), beforeURL);
        return { csp, nativeKeyboardExternalScriptDispatch: true, sameURLAfterDeniedForm: true,
          attemptedConnections: 'data URI only; no remote network', bypassCSP: false };
      } finally {
        if (cspSession) { await cspSession.close(); cleanup.push('CSP: awaited close completed'); }
      }
    });
  } finally {
    const after = ownedHashes();
    for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, `Existing owned file changed: ${file}`);
    if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') assert.deepEqual(after, before, 'Normal browser verification is read-only.');
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
      const raw = path.join(__dirname, 'evidence', 'raw');
      const output = path.join(raw, `browser-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
      fs.writeFileSync(output, `${JSON.stringify({
        schemaVersion: 1, cardId: 'A-S128', recordedAtUtc: new Date().toISOString(),
        tooling, observations, cleanup, actualDOM: true, existingOwnedFilesPreserved: true, sourceHashesBefore: before,
        outcome: observations.length === 13 && observations.every((item) => item.status === 'passed') ? 'passed' : 'failed',
        captureFlag: 'CAPTURE_BROWSER_EVIDENCE=1', nativeProofComplete: false, sourceParentComplete: false,
      }, null, 2)}\n`, { flag: 'wx' });
      console.log(`S128_BROWSER_CAPTURE=${path.relative(root, output)}`);
    }
  }
  assert.equal(observations.length, 13);
  assert.ok(observations.every((item) => item.status === 'passed'));
  assert.equal(cleanup.length, 3);
});
