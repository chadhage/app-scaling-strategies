'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { openIsolatedLesson } = require('..\\..\\testing\\browser\\isolated.cjs');

const directory = __dirname;
const toolingRoot = path.resolve(directory, '..', '..', 'testing', 'browser');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tooling = require(path.join(toolingRoot, 'node_modules', 'playwright', 'package.json'));

test('real isolated offline Edge conducts S011 with capacity, client, keyboard, and CSP observations', { timeout: 180000 }, async (t) => {
  assert.equal(tooling.version, '1.56.1', 'explicit offline Playwright pairing; no fallback or install');
  const signature = JSON.parse(fs.readFileSync(path.join(directory, 'evidence', 'browser-provenance.json'), 'utf8'));
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.match(signature.productVersion, /^156\./);
  const cases = [];
  const applicationErrors = [];
  const externalCompleted = [];
  let session;
  const report = {
    cardId: 'A-S011', kano: 'S', kanoUnit: 'A-S011', packet: 'SC-S011',
    workerId: 'worker-A-S011', mode: 'actual-isolated-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), runtime: process.version,
    playwright: tooling.version, signedBrowser: signature,
    helper: 'testing\\browser\\isolated.cjs',
    helperSha256: sha256(path.join(toolingRoot, 'isolated.cjs')),
    entryPoint: 'learning\\S011\\index.html',
    cases, applicationErrors, externalCompleted,
    nativeProof: false, parentComplete: false, productionNode24Validated: false,
    closeAwaited: false, status: 'running'
  };
  try {
    session = await openIsolatedLesson('learning\\S011\\index.html');
    const { page } = session;
    report.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    page.on('pageerror', (error) => applicationErrors.push(error.message));
    page.on('requestfinished', (request) => {
      if (!request.url().startsWith('file:')) externalCompleted.push(request.url());
    });
    const read = async () => JSON.parse(await page.locator('#run-evidence').textContent());
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const reset = () => press('restart-rehearsal', 'Space');
    const request = async ({ condition = 'healthy', demand = '160', connections = '100' } = {}) => {
      await page.locator('#fixture-condition').selectOption(condition);
      await page.locator('#demand-rps').fill(demand);
      await page.locator('#connection-ceiling').fill(connections);
      await press('request-scale');
    };
    const observeAndVerify = async () => {
      await press('observe-capacity');
      await press('observe-capacity');
      await press('verify-capacity');
    };
    const conduct = async (name, check) => {
      await t.test(name, async () => {
        try {
          await check();
          const state = await read();
          cases.push({
            name, status: 'passed', logicalSeconds: state.clockSeconds,
            capacity: state.capacity, lastAction: state.lastResult,
            result: state.result, totals: state.totals,
            observationIds: state.observations.map((observation) => observation.id)
          });
        } catch (error) {
          cases.push({ name, status: 'failed', error: error.message });
          throw error;
        }
      });
    };

    await conduct('local entry point, exact banner, labels, and zero-sample classification', async () => {
      assert.match(await page.title(), /S011.*Manual horizontal scale-out/);
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      const state = await read();
      assert.equal(state.result.verdict, 'NOT_RUN');
      assert.equal(state.result.successRate, null);
      assert.equal(await page.getByLabel('Requested total instances (3–6)').count(), 1);
      assert.equal(await page.getByLabel('Deterministic observation condition').count(), 1);
      assert.equal(await page.locator('noscript').isVisible(), false);
      assert.equal(await page.locator('#input-error').isVisible(), false);
    });

    await conduct('keyboard-only request, deploy, ready, verify, actual admission, and reset', async () => {
      await request();
      let state = await read();
      assert.deepEqual([state.capacity.requested, state.capacity.deployed, state.capacity.ready, state.capacity.eligible], [4, 2, 2, 2]);
      assert.equal(await page.locator('#target-total').isDisabled(), true);
      assert.equal(await page.locator('#fixture-condition').isDisabled(), true);
      await press('increase-admission');
      assert.equal((await read()).lastResult.verdict, 'BLOCKED');
      await press('observe-capacity');
      state = await read();
      assert.deepEqual([state.capacity.deployed, state.capacity.ready, state.capacity.eligible], [4, 2, 2]);
      await press('observe-capacity');
      await press('verify-capacity');
      state = await read();
      assert.equal(state.lastResult.verdict, 'PASS');
      assert.equal(state.capacity.eligible, 2);
      await press('increase-admission');
      state = await read();
      assert.equal(state.capacity.eligible, 4);
      assert.equal(state.totals.successfulTransitions, 10);
      assert.equal(state.totals.oldOnlySuccessful, 10);
      assert.equal(await page.locator('#client-rows tr').count(), 20);
      assert.equal(await page.locator('#increase-admission').evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.locator('form').evaluateAll((forms) => forms.every((form) => typeof form.reset === 'function')), true);
    });

    await conduct('reset is keyboard-safe and malformed browser input is visibly rejected', async () => {
      await reset();
      let state = await read();
      assert.equal(state.capacity.eligible, 2);
      assert.equal(state.history.length, 0);
      assert.equal(await page.locator('#target-total').inputValue(), '4');
      assert.equal(await page.locator('#added-share').inputValue(), '50');
      assert.equal(await page.locator('#target-total').isDisabled(), false);
      await page.locator('#target-total').fill('');
      await press('request-scale');
      state = await read();
      assert.equal(state.lastResult.verdict, 'INVALID');
      assert.equal(await page.getByRole('alert').isVisible(), true);
      assert.match(await page.getByRole('alert').textContent(), /Invalid input/);
      assert.equal(state.clients.length, 0);
      assert.equal(state.capacity.requested, 2);
      await reset();
      assert.equal(await page.getByRole('alert').isVisible(), false);
    });

    await conduct('one unready instance blocks complete-pool verification and admission', async () => {
      await request({ condition: 'unready' });
      await observeAndVerify();
      let state = await read();
      assert.equal(state.capacity.ready, 3);
      assert.equal(state.lastResult.verdict, 'FAIL');
      assert.equal(await page.locator('#instance-rows tr').filter({ hasText: 'unready' }).count(), 1);
      await press('increase-admission');
      state = await read();
      assert.equal(state.lastResult.verdict, 'BLOCKED');
      assert.equal(state.capacity.eligible, 2);
      assert.equal(state.clients.length, 0);
    });

    await conduct('missing capacity telemetry is visibly unknown, with confirmed lower bounds', async () => {
      await reset();
      await request({ condition: 'capacity-unknown' });
      await press('observe-capacity');
      await press('verify-capacity');
      const state = await read();
      assert.equal(state.capacity.deployed, null);
      assert.equal(state.capacity.ready, null);
      assert.equal(state.lastResult.verdict, 'UNVERIFIED');
      assert.equal(await page.locator('#deployed-count').textContent(), 'Unknown (2 confirmed)');
      assert.equal(await page.locator('#ready-count').textContent(), 'Unknown (2 confirmed)');
      assert.match(await page.locator('#connection-summary').textContent(), /observed unknown/);
    });

    await conduct('known provisioning failure is distinct from unknown observations', async () => {
      await reset();
      await request({ condition: 'provisioning-failure' });
      await press('observe-capacity');
      const state = await read();
      assert.equal(state.lastResult.verdict, 'FAIL');
      assert.equal(state.capacity.deployed, 2);
      assert.equal(state.capacity.ready, 2);
      assert.equal(state.clients.length, 0);
    });

    await conduct('dependency capacity blocks exposure even with four ready instances', async () => {
      await reset();
      await request({ connections: '60' });
      await observeAndVerify();
      const state = await read();
      assert.equal(state.capacity.ready, 4);
      assert.equal(state.connections.observed, 80);
      assert.equal(state.connections.withinLimit, false);
      assert.equal(state.lastResult.verdict, 'FAIL');
      await press('increase-admission');
      assert.equal((await read()).capacity.eligible, 2);
    });

    await conduct('load and traffic-share thresholds are measured rather than assumed', async () => {
      await reset();
      await request({ demand: '161' });
      await observeAndVerify();
      await press('increase-admission');
      let state = await read();
      assert.equal(state.lastResult.verdict, 'BLOCKED');
      assert.ok(state.lastResult.assertions.some((item) => item.id === 'load-total' && item.status === 'fail'));
      await reset();
      await request();
      await observeAndVerify();
      await page.locator('#added-share').fill('75');
      await press('increase-admission');
      state = await read();
      assert.equal(state.lastResult.verdict, 'BLOCKED');
      assert.ok(state.lastResult.assertions.some((item) => item.id === 'load-new' && item.observed === 120));
    });

    await conduct('stale readiness blocks admission; revalidation leaves old evidence unchanged', async () => {
      await reset();
      await request();
      await observeAndVerify();
      const before = (await read()).observations;
      await press('age-evidence');
      await press('increase-admission');
      let state = await read();
      assert.equal(state.lastResult.verdict, 'BLOCKED');
      assert.ok(state.lastResult.assertions.some((item) => item.id === 'freshness' && item.observed > 30));
      await press('observe-capacity');
      await press('verify-capacity');
      await press('increase-admission');
      state = await read();
      assert.equal(state.result.verdict, 'PASS');
      assert.deepEqual(state.observations.slice(0, 2), before);
    });

    await conduct('late journeys remain interrupted after healthy recovery and a passing last sample', async () => {
      await reset();
      await request({ condition: 'slow-journey' });
      await observeAndVerify();
      await press('increase-admission');
      const previous = await read();
      assert.equal(previous.totals.interruptedTransitions, 10);
      assert.equal(previous.result.userOutcome, 'interrupted-transition');
      await press('recover-fixture');
      await observeAndVerify();
      await press('increase-admission');
      const state = await read();
      assert.equal(state.lastResult.verdict, 'PASS');
      assert.equal(state.result.verdict, 'FAIL');
      assert.equal(state.totals.attemptedTransitions, 20);
      assert.equal(state.totals.successfulTransitions, 10);
      assert.equal(state.totals.interruptedTransitions, 10);
      assert.deepEqual(state.clients.slice(0, 20), previous.clients);
      assert.deepEqual(state.observations.slice(0, 2), previous.observations);
      assert.match(await page.locator('#cumulative-verdict').textContent(), /FAIL.*interrupted-transition/);
    });

    await conduct('missing client outcomes stay unknown and broken connections remain failures', async () => {
      await reset();
      await request({ condition: 'journey-unknown' });
      await observeAndVerify();
      await press('increase-admission');
      let state = await read();
      assert.equal(state.totals.unknownTransitions, 10);
      assert.equal(state.totals.interruptedTransitions, 0);
      assert.equal(state.result.verdict, 'UNVERIFIED');
      assert.equal(state.clients.filter((client) => client.affected && client.latencyMs === null).length, 10);
      await reset();
      await request({ condition: 'broken-connection' });
      await observeAndVerify();
      await press('increase-admission');
      state = await read();
      assert.equal(state.totals.interruptedTransitions, 1);
      assert.equal(state.totals.successfulTransitions, 9);
      const budget = state.lastResult.assertions.find((item) => item.id === 'journey-budget');
      assert.equal(budget.status, 'fail');
      assert.equal(budget.missingCompletions, 1);
    });

    await conduct('slot-only changes are not compute scale-out; narrow viewport remains usable', async () => {
      await reset();
      await press('add-shared-slot');
      const state = await read();
      assert.equal(state.slots, 2);
      assert.equal(state.capacity.requested, 2);
      assert.equal(state.capacity.deployed, 2);
      assert.equal(state.capacity.ready, 2);
      assert.equal(state.capacity.eligible, 2);
      assert.equal(state.result.verdict, 'NOT_RUN');
      await page.setViewportSize({ width: 360, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.locator('#restart-rehearsal').focus();
      assert.equal(await page.locator('#restart-rehearsal').evaluate((element) => {
        const style = getComputedStyle(element);
        return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 3;
      }), true);
    });

    await conduct('real CSP blocks inline execution and connections without browser security weakening', async () => {
      const outcome = await page.evaluate(async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (event) => violations.push(event.effectiveDirective));
        const script = document.createElement('script');
        script.textContent = 'globalThis.s011InlineProbeExecuted = true;';
        document.body.append(script);
        let connectionBlocked = false;
        try {
          await fetch('http://127.0.0.1:9/s011-csp-probe');
        } catch {
          connectionBlocked = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        script.remove();
        return { inlineExecuted: globalThis.s011InlineProbeExecuted === true, connectionBlocked, violations };
      });
      assert.equal(outcome.inlineExecuted, false);
      assert.equal(outcome.connectionBlocked, true);
      assert.ok(outcome.violations.some((directive) => directive.startsWith('script-src')));
      assert.ok(outcome.violations.includes('connect-src'));
      report.cspProbe = outcome;
      assert.deepEqual(applicationErrors, []);
      assert.deepEqual(externalCompleted, []);
    });

    assert.ok(cases.every((entry) => entry.status === 'passed'));
    report.status = 'passed';
  } finally {
    try {
      if (session) {
        await session.close();
        report.closeAwaited = true;
      }
    } finally {
      if (report.status !== 'passed') report.status = 'failed';
      report.finishedAtUtc = new Date().toISOString();
      fs.writeFileSync(path.join(directory, 'evidence', 'browser-observations.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
});
