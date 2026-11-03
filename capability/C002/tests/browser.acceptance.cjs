'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { openIsolatedLesson } = require('../../../testing/browser/isolated.cjs');
const fixture = require('../synthetic-fixture.js');
const snapshot = require('../../C001/approved-contract.js');

const evidenceRoot = path.join('capability', 'C002', 'evidence');

test('C002 actual isolated headless browser: contract, keyboard, invalid inputs, reset, and offline behavior', async (t) => {
  const observations = {
    cardId: 'C002',
    workerId: 'worker-C002',
    startedAtUtc: new Date().toISOString(),
    mode: 'isolated-headless',
    helper: 'testing\\browser\\isolated.cjs',
    engine: 'Microsoft Edge / Chromium',
    playwrightVersion: require(require.resolve('playwright/package.json', {
      paths: [path.resolve('testing', 'browser')]
    })).version,
    integratedBrowserUsed: false,
    foregroundLeaseRequested: false,
    requestObservationScope: 'Production page reload and all subsequent interactions; helper initial navigation precedes instrumentation.',
    checks: [],
    remoteRequests: [],
    pageErrors: [],
    passed: false
  };
  await fs.mkdir(evidenceRoot, { recursive: true });
  let session;
  try {
    session = await openIsolatedLesson(path.join('capability', 'C002', 'index.html'));
    const { page } = session;
    observations.browserVersion = session.browserVersion;
    observations.userAgent = await page.evaluate(() => navigator.userAgent);
    assert.match(observations.userAgent, /HeadlessChrome/);
    page.on('request', (request) => {
      if (!request.url().startsWith('file:')) observations.remoteRequests.push(request.url());
    });
    page.on('pageerror', (error) => observations.pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
      if (route.request().url().startsWith('file:')) await route.continue();
      else await route.abort('blockedbyclient');
    });
    await page.addInitScript(() => {
      globalThis.__c002CspViolations = [];
      addEventListener('securitypolicyviolation', (event) => {
        globalThis.__c002CspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
      });
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('validate').disabled);

    const envelope = page.getByRole('textbox', { name: 'Envelope JSON', exact: true });
    const limits = page.getByRole('textbox', { name: 'Explicit limits JSON', exact: true });
    const validate = page.getByRole('button', { name: 'Validate locally — no execution', exact: true });
    const loadFixture = page.getByRole('button', { name: 'Load synthetic local fixture', exact: true });
    const result = () => page.locator('#result-json').textContent().then(JSON.parse);
    async function submit() {
      await validate.click();
      await page.waitForFunction(() => ['true', 'false'].includes(document.getElementById('result').dataset.valid));
      return result();
    }
    async function setInputs(inputEnvelope, inputLimits = fixture.limits) {
      await envelope.fill(typeof inputEnvelope === 'string' ? inputEnvelope : JSON.stringify(inputEnvelope, null, 2));
      await limits.fill(typeof inputLimits === 'string' ? inputLimits : JSON.stringify(inputLimits, null, 2));
    }
    function rejected(decision, field, code) {
      assert.equal(decision.valid, false);
      assert.equal(decision.executed, false);
      assert.equal(decision.validatedEnvelope, null);
      assert.equal(decision.appliedLimits, null);
      assert.ok(decision.errors.some((error) => error.path === field && error.code === code),
        `Expected ${field} ${code}; got ${JSON.stringify(decision.errors)}`);
    }

    await t.test('read-only C001 authority and exact schema are visible with no input defaults', async () => {
      assert.equal(await envelope.inputValue(), '');
      assert.equal(await limits.inputValue(), '');
      assert.match(await page.locator('#integrity').textContent(), /VERIFIED/);
      assert.equal(await page.locator('#schema-json').isVisible(), true);
      const displayedApproval = JSON.parse(await page.locator('#approval-json').textContent());
      assert.deepEqual(displayedApproval, snapshot);
      for (const flag of ['liveAzureExecutionApproved', 'iacGenerationApproved', 'scaffoldApproved',
        'deploymentApproved', 'identityRegistrationApproved', 'expenditureApproved']) {
        assert.equal(displayedApproval.approval[flag], false);
      }
      const displayedSchema = JSON.parse(await page.locator('#schema-json').textContent());
      assert.equal(displayedSchema.additionalProperties, false);
      observations.checks.push({ name: 'visible-contract-no-defaults', passed: true, falseApprovalFlags: 6 });
    });

    await t.test('real Enter/Tab keyboard flow loads explicit fixture and validates locally', async () => {
      await loadFixture.focus();
      await page.keyboard.press('Enter');
      assert.equal(await envelope.evaluate((element) => element === document.activeElement), true);
      assert.deepEqual(JSON.parse(await envelope.inputValue()), fixture.envelope);
      assert.deepEqual(JSON.parse(await limits.inputValue()), fixture.limits);
      await page.keyboard.press('Tab');
      assert.equal(await limits.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await validate.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('result').dataset.valid === 'true');
      const decision = await result();
      assert.equal(decision.valid, true);
      assert.equal(decision.executed, false);
      assert.equal(decision.validatedEnvelope.scope.liveAzureRuns, 0);
      assert.equal(decision.validatedEnvelope.budget.cloudSpend, 0);
      assert.equal(decision.authority.productionRuntimeValidated, false);
      assert.deepEqual(decision.appliedLimits, fixture.limits);
      assert.equal(await validate.evaluate((element) => element === document.activeElement), true);
      observations.validStatus = await page.locator('#result').textContent();
      await page.screenshot({ path: path.join(evidenceRoot, 'browser-valid.png'), fullPage: true });
      observations.checks.push({ name: 'keyboard-valid-local-only', passed: true, keys: ['Enter', 'Tab', 'Tab', 'Enter'], executed: false });
    });

    await t.test('editing clears stale success; all five metric errors show exact paths and intervals', async () => {
      const invalid = structuredClone(fixture.envelope);
      invalid.load.requestsPerSecond = 101;
      invalid.load.concurrentUsers = 21;
      invalid.durationSeconds = 301;
      invalid.capacity.units = 5;
      invalid.budget.cloudSpend = 1;
      await envelope.fill(JSON.stringify(invalid, null, 2));
      assert.match(await page.locator('#result').textContent(), /EDITED/);
      assert.match(await page.locator('#result-json').textContent(), /^No validation result/);
      const decision = await submit();
      const rows = await page.locator('#error-rows tr').allTextContents();
      const expected = [
        ['load.requestsPerSecond', '[1, 100]'], ['load.concurrentUsers', '[1, 20]'],
        ['durationSeconds', '[1, 300]'], ['capacity.units', '[1, 4]'], ['budget.cloudSpend', '[0, 0]']
      ];
      for (const [field, interval] of expected) {
        rejected(decision, `envelope.${field}`, 'OUT_OF_RANGE');
        assert.ok(rows.some((row) => row.includes(`envelope.${field}`) && row.includes('OUT_OF_RANGE') && row.includes(interval)));
      }
      assert.equal(await envelope.getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#field-errors').isVisible(), true);
      await page.screenshot({ path: path.join(evidenceRoot, 'browser-invalid.png'), fullPage: true });
      observations.visibleRangeErrors = decision.errors.filter((error) => error.code === 'OUT_OF_RANGE');
      observations.checks.push({ name: 'precise-five-metric-errors', passed: true, errorRows: rows.length, staleSuccessCleared: true });
    });

    await t.test('malformed JSON, missing limits, missing endpoints and unknown fields are explicit', async () => {
      await setInputs('{"load":');
      rejected(await submit(), 'envelope', 'INVALID_JSON');
      await setInputs(fixture.envelope, '');
      rejected(await submit(), 'limits', 'REQUIRED_JSON');
      const invalidEnvelope = { ...structuredClone(fixture.envelope), sku: 'not-approved' };
      const invalidLimits = structuredClone(fixture.limits);
      delete invalidLimits.capacity.units.max;
      await setInputs(invalidEnvelope, invalidLimits);
      const decision = await submit();
      rejected(decision, 'envelope.sku', 'UNKNOWN_FIELD');
      rejected(decision, 'limits.capacity.units.max', 'REQUIRED_FIELD');
      assert.equal(await limits.getAttribute('aria-invalid'), 'true');
      observations.checks.push({ name: 'json-missing-unknown-field-errors', passed: true });
    });

    await t.test('C001 denies escalation and positive budget bounds cannot grant authority', async () => {
      const escalated = structuredClone(fixture.envelope);
      escalated.action = 'deployment.execute';
      escalated.scope.mode = 'azure-live';
      escalated.scope.liveAzureRuns = 1;
      await setInputs(escalated);
      const denied = await submit();
      rejected(denied, 'envelope.action', 'DEPLOYMENT_NOT_APPROVED');
      rejected(denied, 'envelope.scope.mode', 'SCOPE_ESCALATION');
      rejected(denied, 'envelope.scope.liveAzureRuns', 'SCOPE_ESCALATION');
      assert.equal(denied.authority.allowed, false);
      const unsafeLimits = structuredClone(fixture.limits);
      unsafeLimits.budget.cloudSpend.max = 1;
      await setInputs(fixture.envelope, unsafeLimits);
      rejected(await submit(), 'limits.budget.cloudSpend.max', 'SCOPE_ESCALATION');
      observations.checks.push({ name: 'scope-escalation-denied-by-c001', passed: true, executed: false });
    });

    await t.test('numeric strings, precision loss and duplicate fields cannot bypass validation', async () => {
      const unsafe = structuredClone(fixture.envelope);
      unsafe.load.requestsPerSecond = '10';
      await setInputs(unsafe);
      rejected(await submit(), 'envelope.load.requestsPerSecond', 'UNSAFE_NUMBER');
      await setInputs(JSON.stringify(fixture.envelope).replace('"requestsPerSecond":10', '"requestsPerSecond":1.00000000000000001'));
      rejected(await submit(), 'envelope.load.requestsPerSecond', 'UNSAFE_NUMBER_LITERAL');
      await setInputs(JSON.stringify(fixture.envelope).replace('"load":', '"load":{"hiddenUnknown":true},"lo\\u0061d":'));
      rejected(await submit(), 'envelope.load', 'DUPLICATE_FIELD');
      observations.checks.push({ name: 'unsafe-and-ambiguous-json-denied', passed: true });
    });

    await t.test('real keyboard reset clears inputs, result and errors and restores input focus', async () => {
      const reset = page.getByRole('button', { name: 'Reset inputs and result', exact: true });
      await reset.focus();
      await page.keyboard.press('Enter');
      assert.equal(await envelope.inputValue(), '');
      assert.equal(await limits.inputValue(), '');
      assert.equal(await page.locator('#error-rows tr').count(), 0);
      assert.equal(await page.locator('#field-errors').isVisible(), false);
      assert.match(await page.locator('#result').textContent(), /RESET/);
      assert.match(await page.locator('#result-json').textContent(), /^No validation result/);
      assert.equal(await envelope.evaluate((element) => element === document.activeElement), true);
      assert.equal(await envelope.getAttribute('aria-invalid'), 'false');
      assert.equal(await limits.getAttribute('aria-invalid'), 'false');
      observations.checks.push({ name: 'keyboard-reset-clears-and-focuses', passed: true, keys: ['Enter'] });
    });

    await t.test('production page remains offline and generates no CSP violations or script errors', async () => {
      observations.cspViolations = await page.evaluate(() => globalThis.__c002CspViolations);
      assert.deepEqual(observations.remoteRequests, []);
      assert.deepEqual(observations.pageErrors, []);
      assert.deepEqual(observations.cspViolations, []);
      assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
      observations.checks.push({ name: 'no-network-management-csp-errors', passed: true, remoteRequests: 0, cspViolations: 0 });
    });

    await t.test('blocking the real C001 guard script leaves the production surface explicitly denied', async () => {
      let blocked = 0;
      await page.route('**/C001/contract-guard.js', async (route) => {
        blocked++;
        await route.abort('blockedbyclient');
      });
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('result').dataset.valid === 'false');
      assert.equal(blocked, 1, 'The actual guard resource request must have been blocked, not a simulated DOM flag');
      assert.equal(await validate.isDisabled(), true);
      assert.equal(await loadFixture.isDisabled(), true);
      const decision = await result();
      rejected(decision, 'approval', 'SURFACE_UNAVAILABLE');
      assert.match(await page.locator('#integrity').textContent(), /DENIED.*unavailable/);
      assert.deepEqual(observations.remoteRequests, []);
      observations.checks.push({ name: 'actual-missing-guard-fails-closed', passed: true, blockedLocalGuardRequests: blocked });
    });

    observations.passed = !observations.checks.some((check) => !check.passed) && observations.checks.length === 9;
    assert.equal(observations.passed, true);
    t.diagnostic(`Actual ${observations.engine} ${session.browserVersion}; Playwright ${observations.playwrightVersion}; isolated headless keyboard/DOM checks, not a Node browser mock.`);
  } catch (error) {
    observations.failure = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        const browser = session.page.context().browser();
        await session.close();
        observations.closed = session.page.isClosed() && !browser.isConnected();
        assert.equal(observations.closed, true, 'The isolated real page and browser must both close');
      }
    } finally {
      observations.completedAtUtc = new Date().toISOString();
      await fs.writeFile(path.join(evidenceRoot, 'browser-observations.json'), `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
    }
  }
});
