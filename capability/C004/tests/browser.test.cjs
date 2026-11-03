'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const fixtures = require('../plan-fixtures.js');
const matrix = require('../../C003/matrix-data.js');
const helperPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = createHash('sha256').update(readFileSync(helperPath)).digest('hex');
const { openIsolatedLesson } = require(helperPath);
const helperRequire = createRequire(helperPath);
const playwrightVersion = helperRequire('playwright/package.json').version;
const evidence = path.resolve(__dirname, '..', 'evidence');
const clone = value => structuredClone(value);

test('real isolated headless C004 DOM, keyboard, error, consent and reset acceptance', { timeout: 120000 }, async t => {
  const reportPath = path.join(evidence, 'browser-acceptance.json');
  await fs.rm(reportPath, { force: true });
  assert.equal(playwrightVersion, '1.56.1');
  const session = await openIsolatedLesson('capability\\C004\\index.html');
  const { page, browserVersion } = session;
  const checks = [];
  const pageErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.method() + ' [remote URL redacted]');
  });
  let report;

  async function check(name, run) {
    await t.test(name, async () => {
      await run();
      checks.push({ name, passed: true });
    });
  }
  async function reviewed() {
    await page.waitForFunction(() => !document.getElementById('plan-view').hidden ||
      !document.getElementById('input-errors').hidden);
  }
  async function review() {
    await page.locator('#review').click();
    await reviewed();
  }
  async function loadLocal() {
    await page.locator('#load-local').click();
  }
  async function fillRequest(request) {
    const { envelopeRequest, ...details } = request;
    await page.locator('#plan-json').fill(JSON.stringify(details));
    await page.locator('#envelope-json').fill(JSON.stringify(envelopeRequest));
  }
  async function acknowledge() {
    await page.locator('#acknowledgement').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#acknowledgement').isChecked(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'acknowledge');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('consent-state').textContent.startsWith('Acknowledged'));
  }

  try {
    assert.match(browserVersion, /^156\./);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('load-local').disabled);

    await check('initial actual DOM has labelled empty explicit inputs, no plan and all cloud authority denied', async () => {
      assert.equal(await page.title(), 'C004 — local run-consent plan');
      assert.equal(await page.locator('#plan-json').inputValue(), '');
      assert.equal(await page.locator('#envelope-json').inputValue(), '');
      assert.equal(await page.locator('#plan-view').isVisible(), false);
      assert.equal(await page.locator('#acknowledgement').isDisabled(), true);
      assert.equal(await page.locator('#acknowledgement').isChecked(), false);
      assert.equal(await page.locator('#acknowledge').isDisabled(), true);
      for (const id of ['plan-json', 'envelope-json', 'acknowledgement']) {
        assert.equal(await page.locator(`label[for="${id}"]`).count(), 1);
        assert.ok(await page.locator(`#${id}`).getAttribute('aria-describedby'));
      }
      assert.equal(await page.locator('#status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#status').getAttribute('aria-live'), 'polite');
      const body = await page.locator('body').innerText();
      assert.match(body, /Live Azure runs: 0/);
      assert.match(body, /all false/);
      assert.match(body, /production Node.js 24 remains unvalidated/);
      assert.equal(await page.locator('form, iframe, [onclick]').count(), 0);
    });

    await check('actual Enter and Tab review local assumptions without an invented Azure monetary estimate', async () => {
      await page.locator('#load-local').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'plan-json');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'envelope-json');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'review');
      await page.keyboard.press('Enter');
      await reviewed();
      assert.equal(await page.locator('#plan-view').isVisible(), true);
      assert.match(await page.locator('#cost-status').innerText(), /not-applicable.*no cloud execution/i);
      assert.match(await page.locator('#cost-amount').innerText(), /No monetary estimate \(null\), not zero/);
      assert.match(await page.locator('#duration-value').innerText(), /30.*\[1, 300\].*unknown \(null\)/);
      assert.match(await page.locator('#resources-value').innerText(), /0 assumed cloud resources.*No cloud execution/);
      assert.match(await page.locator('#load-value').innerText(), /10.*\[1, 100\].*2.*\[1, 20\]/);
      assert.match(await page.locator('#capacity-value').innerText(), /1 synthetic units \[1, 4\].*not an Azure SKU/);
      assert.match(await page.locator('#comparison-label').innerText(), /C002 synthetic fixture/);
      assert.equal(await page.locator('#acknowledgement').isDisabled(), false);
      assert.equal(await page.locator('#acknowledgement').isChecked(), false);
      assert.equal(await page.locator('#acknowledge').isDisabled(), true);
    });

    await check('real Space, Tab and Enter bind an in-memory local-only acknowledgement to the current fingerprint', async () => {
      await acknowledge();
      const consent = JSON.parse(await page.locator('#consent-json').innerText());
      const plan = JSON.parse(await page.locator('#result-json').textContent());
      assert.equal(consent.scope, 'local-plan-review-only');
      assert.equal(consent.inputFingerprint, plan.inputFingerprint);
      assert.equal(consent.cloudExecutionAuthorized, false);
      assert.equal(consent.executed, false);
      assert.match(consent.acknowledgedAtUtc, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(await page.locator('#acknowledge').isDisabled(), true);
      await page.screenshot({ path: path.join(evidence, 'browser-local.png'), fullPage: true });
    });

    await check('editing either textarea instantly clears stale results and actual consent; rereview does not reuse consent', async () => {
      const details = JSON.parse(await page.locator('#plan-json').inputValue());
      details.resources.description += ' Explicit edit.';
      await page.locator('#plan-json').fill(JSON.stringify(details));
      assert.equal(await page.locator('#plan-view').isVisible(), false);
      assert.equal(await page.locator('#result-json').textContent(), '');
      assert.equal(await page.locator('#acknowledgement').isChecked(), false);
      assert.equal(await page.locator('#acknowledgement').isDisabled(), true);
      assert.equal(await page.locator('#consent-json').innerText(), 'No consent record.');
      await review();
      assert.equal(await page.locator('#acknowledgement').isChecked(), false);
      await acknowledge();
      const request = JSON.parse(await page.locator('#envelope-json').inputValue());
      request.envelope.durationSeconds = 40;
      await page.locator('#envelope-json').fill(JSON.stringify(request));
      assert.equal(await page.locator('#plan-view').isVisible(), false);
      assert.equal(await page.locator('#consent-json').innerText(), 'No consent record.');
      assert.match(await page.locator('#status').innerText(), /prior plan and consent invalidated/);
      await review();
      assert.match(await page.locator('#duration-value').innerText(), /^40 comparison seconds/);
      assert.equal(await page.locator('#acknowledgement').isChecked(), false);
    });

    await check('actual native missing/unknown pricing stays null and blocked with C001 reasons, never zero-cost approval', async () => {
      await page.locator('#load-native').focus();
      await page.keyboard.press('Enter');
      await review();
      for (const status of ['missing', 'unknown']) {
        if (status === 'unknown') {
          const value = clone(fixtures.native);
          value.pricing.status = 'unknown';
          await fillRequest(value);
          await review();
        }
        assert.match(await page.locator('#plan-outcome').innerText(), /^BLOCKED/);
        assert.match(await page.locator('#cost-amount').innerText(), /No monetary estimate \(null\), not zero/);
        assert.match(await page.locator('#resources-value').innerText(), /Unknown cloud resource count \(null\)/);
        const reasons = await page.locator('#blockers').innerText();
        assert.ok(reasons.includes(`PRICING_${status.toUpperCase()}`));
        for (const code of ['LIVE_AZURE_NOT_APPROVED', 'ZERO_NATIVE_LIMIT', 'CLOUD_SPEND_FORBIDDEN', 'NATIVE_UNQUALIFIED']) {
          assert.ok(reasons.includes(code));
        }
        assert.equal(await page.locator('#acknowledgement').isDisabled(), true);
        assert.equal(await page.locator('#acknowledge').isDisabled(), true);
        assert.equal(await page.locator('#consent-json').innerText(), 'No consent record.');
      }
      await page.screenshot({ path: path.join(evidence, 'browser-blocked.png'), fullPage: true });
    });

    await check('unsupported and unknown C003 configuration reasons and constraints survive unchanged in the actual DOM', async () => {
      for (const status of ['unsupported', 'unknown']) {
        const row = matrix.rows.find(item => item.status === status);
        const value = clone(fixtures.native);
        value.configurationId = row.id;
        await fillRequest(value);
        await review();
        const summary = await page.locator('#configuration-summary').innerText();
        assert.ok(summary.includes(row.reason));
        assert.ok(summary.includes(`status ${status}`));
        assert.ok(summary.includes('native qualified false'));
        const constraints = await page.locator('#configuration-constraints').innerText();
        for (const item of row.constraints) assert.ok(constraints.includes(item.text));
        assert.ok((await page.locator('#blockers').innerText()).includes(`CONFIGURATION_${status.toUpperCase()}`));
        assert.equal(await page.locator('#acknowledgement').isDisabled(), true);
      }
    });

    await check('documented support and a declared positive estimate remain blocked; HTML-looking source text is inert', async () => {
      const value = clone(fixtures.native);
      value.configurationId = matrix.rows.find(row => row.status === 'documented-supported').id;
      value.pricing = {
        status: 'unverified-estimate', currency: 'USD', totalMinorUnits: 125,
        basis: 'Synthetic browser-test total only; all native costs, currency precision and coverage unverified.',
        source: {
          reference: '<img id="injected" src="https://invalid.example/" onerror="globalThis.__c004Injected=true">',
          capturedAtUtc: '2026-11-03T14:00:00Z', configurationId: value.configurationId
        }
      };
      await fillRequest(value);
      await review();
      assert.match(await page.locator('#cost-status').innerText(), /unverified-estimate.*not a provider quote/);
      assert.match(await page.locator('#cost-amount').innerText(), /125 minor units \(USD\).*unverified/);
      assert.match(await page.locator('#configuration-summary').innerText(), /documented-supported.*native qualified false/);
      assert.ok((await page.locator('#price-source').innerText()).includes(value.pricing.source.reference));
      assert.equal(await page.locator('img, #injected').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.__c004Injected), undefined);
      assert.match(await page.locator('#blockers').innerText(), /PRICING_UNVERIFIED/);
      assert.equal(await page.locator('#acknowledge').isDisabled(), true);
    });

    await check('malformed, duplicate, unsafe-number, missing-limit and unknown-field errors have actual alert/focus and no stale plan', async () => {
      for (const [label, change, expected] of [
        ['malformed', async () => { await page.locator('#plan-json').fill('{broken'); }, 'INVALID_JSON'],
        ['duplicate', async () => { await page.locator('#plan-json').fill('{"mode":"local-resource-free","mode":"native-proposal"}'); }, 'DUPLICATE_FIELD'],
        ['rounded number', async () => {
          const text = await page.locator('#plan-json').inputValue();
          await page.locator('#plan-json').fill(text.replace('"cloudResourceCount": 0', '"cloudResourceCount": 1.00000000000000001'));
        }, 'UNSAFE_NUMBER_LITERAL'],
        ['missing limits', async () => {
          await page.locator('#envelope-json').fill(JSON.stringify({ envelope: fixtures.local.envelopeRequest.envelope }));
        }, 'REQUIRED_FIELD'],
        ['unknown override', async () => {
          const text = JSON.parse(await page.locator('#plan-json').inputValue());
          text.approveNative = true;
          await page.locator('#plan-json').fill(JSON.stringify(text));
        }, 'UNKNOWN_FIELD'],
        ['embedded envelope', async () => {
          const text = JSON.parse(await page.locator('#plan-json').inputValue());
          text.envelopeRequest = fixtures.local.envelopeRequest;
          await page.locator('#plan-json').fill(JSON.stringify(text));
        }, 'SEPARATE_ENVELOPE_REQUIRED']
      ]) {
        await loadLocal();
        await change();
        await review();
        assert.equal(await page.locator('#input-errors').isVisible(), true, label);
        assert.equal(await page.locator('#input-errors').getAttribute('role'), 'alert');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'input-errors');
        assert.ok((await page.locator('#error-list').innerText()).includes(expected), label);
        assert.equal(await page.locator('#plan-view').isVisible(), false);
        assert.equal(await page.locator('#acknowledgement').isDisabled(), true);
        assert.equal(await page.locator('#consent-json').innerText(), 'No consent record.');
      }
    });

    await check('real reset clears both inputs, errors, plan and consent and restores keyboard focus; refresh retains nothing', async () => {
      await loadLocal();
      await review();
      await acknowledge();
      await page.locator('#reset').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#plan-json').inputValue(), '');
      assert.equal(await page.locator('#envelope-json').inputValue(), '');
      assert.equal(await page.locator('#input-errors').isVisible(), false);
      assert.equal(await page.locator('#plan-view').isVisible(), false);
      assert.equal(await page.locator('#acknowledge').isDisabled(), true);
      assert.equal(await page.locator('#consent-json').innerText(), 'No consent record.');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'plan-json');
      await loadLocal();
      await review();
      await acknowledge();
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('load-local').disabled);
      assert.equal(await page.locator('#plan-json').inputValue(), '');
      assert.equal(await page.locator('#envelope-json').inputValue(), '');
      assert.equal(await page.locator('#consent-json').innerText(), 'No consent record.');
    });

    await check('actual browser dependency omission, changed matrix data and missing integrity fail closed', async () => {
      const matrixSource = readFileSync(path.resolve(__dirname, '..', '..', 'C003', 'matrix-data.js'), 'utf8');
      const guardSource = readFileSync(path.resolve(__dirname, '..', '..', 'C001', 'contract-guard.js'), 'utf8');
      const changedMatrix = matrixSource.replace("scope: 'local-documented-only'", "scope: 'test-injected-drift'");
      const noIntegrity = guardSource.replace('root.crypto)', 'undefined)');
      assert.notEqual(changedMatrix, matrixSource);
      assert.notEqual(noIntegrity, guardSource);
      for (const [pattern, body, expected, reviewRequired] of [
        ['**/C002/validator.js', '/* Deliberately omitted dependency for this browser error-path test. */', 'DEPENDENCY_UNAVAILABLE', false],
        ['**/C003/matrix-data.js', changedMatrix, 'DEPENDENCY_DRIFT', true],
        ['**/C001/contract-guard.js', noIntegrity, 'INTEGRITY_UNAVAILABLE', false]
      ]) {
        let intercepted = 0;
        await page.route(pattern, route => {
          intercepted++;
          return route.fulfill({ contentType: 'text/javascript', body });
        });
        try {
          await page.reload({ waitUntil: 'load' });
          if (reviewRequired) {
            await page.waitForFunction(() => !document.getElementById('load-local').disabled);
            await loadLocal();
            await review();
          } else {
            await page.waitForFunction(() => !document.getElementById('input-errors').hidden);
            assert.equal(await page.locator('#review').isDisabled(), true);
          }
          assert.ok(intercepted > 0, 'fault injection must actually reach the owned browser');
          assert.ok((await page.locator('#error-list').innerText()).includes(expected), expected);
          assert.equal(await page.locator('#plan-view').isVisible(), false);
          assert.equal(await page.locator('#acknowledgement').isDisabled(), true);
          assert.equal(await page.locator('#acknowledge').isDisabled(), true);
          assert.equal(await page.locator('#consent-json').innerText(), 'No consent record.');
        } finally {
          await page.unroute(pattern);
        }
      }
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('load-local').disabled);
    });

    await check('390px reflow, disclosure keyboard, exact false flags, provenance and no normal browser errors or remote traffic', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loadLocal();
      await review();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const summary = page.getByText('Bundled approval and accepted dependency pins — not current server consent', { exact: true });
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#permissions').isVisible(), true);
      const flags = JSON.parse(await page.locator('#permissions').innerText());
      for (const key of matrixContractFlagKeys()) assert.equal(flags[key], false);
      assert.equal(flags.liveAzureRuns, 0);
      assert.equal(flags.productionRuntimeValidated, false);
      assert.match(await page.locator('#provenance').innerText(), /1583da90c1013ba95fdf268d6901f8a14bdf900a/);
      assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
    });

    assert.equal(checks.length, 11, 'all actual acceptance subchecks must complete before saving success evidence');
    assert.equal(createHash('sha256').update(readFileSync(helperPath)).digest('hex'), helperSha256);
    report = {
      cardId: 'C004', workerId: 'worker-C004', observedAtUtc: new Date().toISOString(),
      mode: 'local-implementation-only', helper: 'testing\\browser\\isolated.cjs',
      api: 'openIsolatedLesson(relativeRepoPath)', helperSourceSha256: helperSha256,
      helperSourceUnchangedDuringTest: createHash('sha256').update(readFileSync(helperPath)).digest('hex') === helperSha256,
      browser: 'Microsoft Edge', browserVersion, playwrightVersion,
      headless: true, sandboxDisabled: false, tlsWeakened: false, installedOrDownloaded: false,
      integratedForegroundUsed: false, mockedBrowser: false,
      dependencyFaultInjection: 'Only the dependency-error subcheck fulfills three local script requests with deliberately omitted/changed test bytes. It changes no file or authority, and is not a normal-dependency or native-platform proof.',
      checks, remoteRequests, pageErrors, liveAzureRuns: 0, productionRuntimeValidated: false,
      limits: 'Real local DOM/keyboard/error/reset evidence only. Not a full WCAG audit, server authorization test, current pricing proof, native qualification, or production Node.js 24 validation.'
    };
  } finally {
    await session.close();
  }
  if (report) {
    assert.equal(page.isClosed(), true);
    report.isolatedBrowserCloseAwaited = true;
    report.actualPageClosed = true;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
});

function matrixContractFlagKeys() {
  return require('../../C003/matrix-contract.js').FLAG_KEYS;
}
