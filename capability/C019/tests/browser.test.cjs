'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, repo, sha } = require('./provenance.cjs');
const manifest = require('..\\manifest.json');
const bank = require(path.join(root, manifest.historicalObservations));

test('actual signed Edge DOM/keyboard/errors/unknown/rejected actions/reset/CSP and cleanup', { timeout: 300000 }, async (t) => {
  const observations = {
    schemaVersion: 1, cardId: 'C019', kind: 'signed-Edge-DOM',
    capturedAtUtc: new Date().toISOString(), node: process.version,
    browserFilesystemInspection: false, browserRecovery: false,
    writeAuthorization: false, cloudExecution: false, foregroundLease: false,
    checks: [], pageErrorCount: 0, nonFileRequestCount: 0,
    passed: false, closed: false, originalUnitCredits: 0,
  };
  let session;
  let browser;
  let page;
  try {
    const signatureProcess = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe';$s=Get-AuthenticodeSignature -LiteralPath $edge;@{status=[string]$s.Status;signer=$s.SignerCertificate.Subject;fileVersion=(Get-Item -LiteralPath $edge).VersionInfo.FileVersion}|ConvertTo-Json -Compress"],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.ifError(signatureProcess.error);
    assert.equal(signatureProcess.status, 0);
    const signature = JSON.parse(signatureProcess.stdout);
    assert.equal(signature.status, 'Valid');
    assert.match(signature.signer, /Microsoft Corporation/);
    assert.equal(signature.fileVersion, '156.0.4314.50');
    observations.signature = signature;
    const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
    observations.helperSha256 = sha(fs.readFileSync(helperPath));
    assert.equal(observations.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    observations.playwrightVersion = require(require.resolve('playwright/package.json', { paths: [path.dirname(helperPath)] })).version;
    assert.equal(observations.playwrightVersion, '1.56.1');
    const { openIsolatedLesson } = require(helperPath);
    session = await openIsolatedLesson(path.join('capability', 'C019', 'index.html'));
    page = session.page;
    browser = page.context().browser();
    observations.browserVersion = session.browserVersion;
    assert.equal(observations.browserVersion, signature.fileVersion);
    page.on('pageerror', () => { observations.pageErrorCount++; });
    page.on('request', (request) => { if (!request.url().startsWith('file:')) observations.nonFileRequestCount++; });
    await page.route('**/*', (route) => route.request().url().startsWith('file:')
      ? route.continue() : route.abort('blockedbyclient'));
    await page.addInitScript(() => {
      globalThis.__c019Violations = [];
      addEventListener('securitypolicyviolation', (event) => {
        globalThis.__c019Violations.push(event.effectiveDirective);
      });
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('inspect').disabled);
    const caseSelect = page.locator('#case-id');
    const actionSelect = page.locator('#action-id');
    const inspectButton = page.getByRole('button', { name: 'Inspect historical failure', exact: true });
    const performButton = page.getByRole('button', { name: 'Apply allowed read-only step', exact: true });
    const resetButton = page.getByRole('button', { name: 'Reset presentation only', exact: true });
    const state = async () => JSON.parse(await page.locator('#canonical-state').textContent());
    const expected = (id) => bank.cases.find((entry) => entry.id === id).failure;
    let heldState;
    async function check(name, action) {
      await t.test(name, async () => {
        try {
          const observed = await action();
          observations.checks.push({ name, passed: true, observed });
        } catch (error) {
          observations.checks.push({ name, passed: false, code: 'BROWSER_ASSERTION_FAILED' });
          throw error;
        }
      });
    }

    await check('exact banner, historical boundaries and pinned closed initial state', async () => {
      const banner = await page.locator('#banner').textContent();
      assert.equal(banner, 'Training rehearsal - synthetic data - not a live Azure result');
      const text = await page.locator('main').textContent();
      assert.match(text, /Historical teaching observations, not live filesystem recovery/);
      assert.match(text, /never reads live storage/);
      assert.match(text, /H004\/H008, native proof, distributed recovery, and production Node 24 remain incomplete/);
      const initial = await state();
      assert.equal(initial.status, 'uninspected');
      assert.equal(initial.recoveryConfirmed, false);
      assert.equal(initial.writesAuthorized, false);
      assert.equal(initial.history.length, 0);
      assert.equal(await caseSelect.locator('option').count(), 13);
      assert.equal(await page.locator('#status').getAttribute('role'), 'alert');
      assert.equal(await page.locator('#status').getAttribute('aria-live'), 'polite');
      return { banner, mode: initial.mode, status: initial.status, cases: 13 };
    });
    await check('real Tab and Enter inspect the actual captured STATE_MISSING error', async () => {
      await caseSelect.focus();
      await page.keyboard.press('Tab');
      assert.equal(await inspectButton.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      const actual = await state();
      assert.equal(actual.status, 'failed');
      assert.deepEqual(actual.failure, expected('missing-state'));
      assert.equal(actual.failure.error.code, 'STATE_MISSING');
      assert.deepEqual(actual.unknownContext, { runId: false, epoch: true, pendingStep: true });
      assert.match(await page.locator('#pending-epoch').textContent(), /UNKNOWN/);
      return { status: actual.status, code: actual.failure.error.code, unknownContext: actual.unknownContext };
    });
    await check('actual held publication shows pending epoch and previous receipt without a fallback', async () => {
      await caseSelect.selectOption('held-published');
      await inspectButton.click();
      heldState = await state();
      assert.equal(heldState.status, 'held-unobserved');
      assert.deepEqual(heldState.failure, expected('held-published'));
      assert.equal(await page.locator('#error-code').textContent(), 'C015.HOLD_UNOBSERVED');
      assert.equal(await page.locator('#pending-run').textContent(), 'synthetic-run-001');
      assert.equal(await page.locator('#pending-epoch').textContent(), '2');
      assert.equal(await page.locator('#pending-step').textContent(), 'advance');
      const prior = JSON.parse(await page.locator('#prior-ack').textContent());
      assert.equal(prior.epoch, 1);
      assert.deepEqual(prior, expected('held-published').priorAcknowledgment);
      assert.equal(heldState.recoveryConfirmed, false);
      assert.equal(heldState.history[0].failure.error.code, 'STATE_MISSING');
      return { status: heldState.status, code: heldState.failure.error.code, pending: heldState.failure.context,
        priorEpoch: prior.epoch, priorStateSha256: prior.stateSha256 };
    });
    await check('keyboard reinspection is a historical replay, never live recovery', async () => {
      await actionSelect.selectOption('reinspect');
      await actionSelect.focus();
      await page.keyboard.press('Tab');
      assert.equal(await performButton.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      const actual = await state();
      assert.equal(actual.notification.code, 'HISTORICAL_REINSPECTION');
      assert.equal(actual.inspectionCount, 1);
      assert.deepEqual(actual.failure, heldState.failure);
      assert.deepEqual(actual.lastInspection, heldState.failure);
      assert.equal(actual.status, 'held-unobserved');
      assert.match(await page.locator('#status').textContent(), /not a new disk inspection/);
      return { code: actual.notification.code, reads: actual.inspectionCount, recoveryConfirmed: actual.recoveryConfirmed };
    });
    await check('third inspection is the limit and an injected fourth request visibly rejects', async () => {
      for (let index = 0; index < 2; index++) {
        await actionSelect.selectOption('reinspect');
        await performButton.click();
      }
      assert.equal((await state()).inspectionCount, 3);
      assert.equal(await actionSelect.locator('option[value="reinspect"]').count(), 0);
      await actionSelect.evaluate((element) => {
        element.add(new Option('Injected fourth read', 'reinspect'));
        element.value = 'reinspect';
      });
      await performButton.click();
      const actual = await state();
      assert.equal(actual.notification.code, 'READ_LIMIT');
      assert.equal(actual.inspectionCount, 3);
      assert.deepEqual(actual.failure, heldState.failure);
      return { code: actual.notification.code, reads: actual.inspectionCount, actions: actual.actions };
    });
    await check('review-needed acknowledgment cannot claim completed review or recovery', async () => {
      await actionSelect.selectOption('confirm-operator-review');
      await actionSelect.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      const actual = await state();
      assert.equal(actual.notification.code, 'REVIEW_NEEDED_CONFIRMED');
      assert.equal(actual.operatorReviewAcknowledged, true);
      assert.equal(actual.operatorReviewNeeded, true);
      assert.equal(actual.recoveryConfirmed, false);
      assert.equal(actual.status, 'held-unobserved');
      assert.match(await page.locator('#authority').textContent(), /Operator review not performed/);
      return { code: actual.notification.code, reviewNeeded: actual.operatorReviewNeeded, recoveryConfirmed: actual.recoveryConfirmed };
    });
    await check('injected forbidden marker-reclaim action rejects and appends without input retention', async () => {
      const before = await state();
      await actionSelect.evaluate((element) => {
        element.add(new Option('Untrusted action', 'reclaim-marker'));
        element.value = 'reclaim-marker';
      });
      await performButton.click();
      const actual = await state();
      assert.equal(actual.notification.code, 'ACTION_NOT_ALLOWED');
      assert.deepEqual(actual.failure, before.failure);
      assert.deepEqual(actual.history.slice(0, before.history.length), before.history);
      assert.equal(actual.history.length, before.history.length + 1);
      assert.equal(JSON.stringify(actual).includes('reclaim-marker'), false);
      assert.equal(await actionSelect.locator('option[value="reclaim-marker"]').count(), 0);
      return { code: actual.notification.code, historyBefore: before.history.length, historyAfter: actual.history.length };
    });
    await check('unknown DOM fixture selection rejects while preserving error/context and discarding the input', async () => {
      const before = await state();
      await caseSelect.evaluate((element) => {
        element.add(new Option('Untrusted fixture', 'untrusted-synthetic-marker'));
        element.value = 'untrusted-synthetic-marker';
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await inspectButton.click();
      const actual = await state();
      assert.equal(actual.notification.code, 'UNKNOWN_SELECTION');
      assert.deepEqual(actual.failure, before.failure);
      assert.deepEqual(actual.unknownContext, before.unknownContext);
      assert.deepEqual(actual.history.slice(0, before.history.length), before.history);
      assert.equal(JSON.stringify(actual).includes('untrusted-synthetic-marker'), false);
      assert.equal(await caseSelect.inputValue(), '');
      assert.equal(await caseSelect.locator('option[value="untrusted-synthetic-marker"]').count(), 0);
      return { code: actual.notification.code, errorPreserved: actual.failure.error.code, inputDiscarded: true };
    });
    await check('keyboard reset returns focus and preserves failure, review, read count and history', async () => {
      const before = await state();
      await page.getByText('Canonical closed console state', { exact: true }).click();
      await resetButton.focus();
      await page.keyboard.press('Enter');
      const actual = await state();
      assert.equal(actual.notification.code, 'VIEW_RESET');
      assert.deepEqual(actual.failure, before.failure);
      assert.equal(actual.inspectionCount, before.inspectionCount);
      assert.equal(actual.operatorReviewAcknowledged, before.operatorReviewAcknowledged);
      assert.deepEqual(actual.history.slice(0, before.history.length), before.history);
      assert.equal(await caseSelect.evaluate((element) => element === document.activeElement), true);
      assert.equal(await caseSelect.inputValue(), 'missing-state');
      assert.equal(await page.locator('details[open]').count(), 0);
      return { code: actual.notification.code, focus: 'case-id', retainedError: actual.failure.error.code,
        retainedReads: actual.inspectionCount, historyEntries: actual.history.length };
    });
    await check('history details are inspectable with actual keyboard expansion', async () => {
      const summary = page.locator('#history summary').first();
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history details').first().getAttribute('open'), '');
      assert.match(await page.locator('#history pre').first().textContent(), /STATE_MISSING/);
      return { firstRecordedError: 'STATE_MISSING', expanded: true };
    });
    await check('all 13 genuine captured error cases show exact code, pending context and explicit unknowns', async () => {
      const results = [];
      for (const entry of bank.cases) {
        await caseSelect.selectOption(entry.id);
        await inspectButton.click();
        const actual = await state();
        assert.deepEqual(actual.failure, entry.failure);
        assert.equal(actual.status, entry.failure.error.code === 'HOLD_UNOBSERVED' ? 'held-unobserved' : 'failed');
        assert.equal(actual.recoveryConfirmed, false);
        assert.equal(actual.writesAuthorized, false);
        if (entry.failure.context.runId === null) assert.equal(actual.actions.includes('reinspect'), false);
        results.push({ id: entry.id, code: actual.failure.error.code, status: actual.status,
          context: actual.failure.context, unknownContext: actual.unknownContext });
      }
      return results;
    });
    await check('keyboard stop and subsequent reset preserve the unresolved error and reject further actions', async () => {
      const before = await state();
      await actionSelect.selectOption('stop');
      await actionSelect.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      const stopped = await state();
      assert.equal(stopped.status, 'stopped');
      assert.deepEqual(stopped.failure, before.failure);
      assert.deepEqual(stopped.actions, []);
      assert.equal(await performButton.isDisabled(), true);
      await inspectButton.click();
      assert.equal((await state()).notification.code, 'STOPPED');
      await resetButton.click();
      const reset = await state();
      assert.equal(reset.status, 'stopped');
      assert.deepEqual(reset.failure, before.failure);
      assert.deepEqual(reset.history.slice(0, before.history.length), before.history);
      return { status: reset.status, error: reset.failure.error.code, historyEntries: reset.history.length };
    });
    await check('actual CSP blocks inline script, connection, worker, frame and form navigation', async () => {
      const originalURL = page.url();
      await page.evaluate(async () => {
        globalThis.__c019InlineExecuted = false;
        const script = document.createElement('script');
        script.textContent = 'globalThis.__c019InlineExecuted = true;';
        document.body.append(script);
        try { await fetch('http://127.0.0.1:65534/c019-csp-probe'); } catch {}
        try { new Worker('data:text/javascript,postMessage("blocked")'); } catch {}
        const frame = document.createElement('iframe');
        frame.src = 'data:text/html,C019 CSP blocked frame';
        document.body.append(frame);
        const form = document.createElement('form');
        form.action = 'http://127.0.0.1:65534/c019-csp-form';
        document.body.append(form);
        form.submit();
      });
      await page.waitForFunction(() => globalThis.__c019Violations.length >= 5);
      const blocked = await page.evaluate(() => ({ inlineExecuted: globalThis.__c019InlineExecuted,
        directives: [...new Set(globalThis.__c019Violations)] }));
      assert.equal(blocked.inlineExecuted, false);
      for (const directive of ['script-src-elem', 'connect-src', 'worker-src', 'frame-src', 'form-action']) {
        assert.ok(blocked.directives.includes(directive));
      }
      assert.equal(page.url(), originalURL);
      assert.equal(observations.nonFileRequestCount, 0);
      return blocked;
    });
    await check('tampered historical dependency rejects with disabled controls and no forged error disclosure', async () => {
      let second;
      let secondBrowser;
      let secondPage;
      try {
        second = await openIsolatedLesson(path.join('capability', 'C019', 'index.html'));
        secondPage = second.page;
        secondBrowser = secondPage.context().browser();
        await secondPage.route('**/*', (route) => {
          if (!route.request().url().startsWith('file:')) return route.abort('blockedbyclient');
          if (route.request().url().endsWith('/observations.raw.js')) {
            const bytes = fs.readFileSync(path.join(root, manifest.historicalObservations), 'utf8');
            return route.fulfill({ contentType: 'application/javascript', body: bytes.replace('"STATE_MISSING"', '"UNTRUSTED_FUTURE_CODE"') });
          }
          return route.continue();
        });
        await secondPage.reload({ waitUntil: 'load' });
        await secondPage.waitForFunction(() => document.getElementById('status').textContent.includes('INVALID_BUNDLE'));
        assert.match(await secondPage.locator('#status').textContent(), /REJECTED INVALID_BUNDLE/);
        for (const id of ['case-id', 'inspect', 'action-id', 'perform', 'reset']) assert.equal(await secondPage.locator(`#${id}`).isDisabled(), true);
        assert.equal((await secondPage.locator('main').textContent()).includes('UNTRUSTED_FUTURE_CODE'), false);
        assert.equal(JSON.parse(await secondPage.locator('#canonical-state').textContent()).recoveryConfirmed, false);
      } finally {
        if (second) {
          await second.close();
          assert.equal(secondPage.isClosed(), true);
          assert.equal(secondBrowser.isConnected(), false);
        }
      }
      return { code: 'INVALID_BUNDLE', controlsDisabled: true, ownedSecondSessionClosed: true };
    });
    assert.equal(observations.pageErrorCount, 0);
    assert.equal(observations.nonFileRequestCount, 0);
    observations.passed = observations.checks.length === 14 && observations.checks.every((check) => check.passed);
    assert.equal(observations.passed, true);
  } finally {
    try {
      if (session) {
        await session.close();
        await session.close();
        observations.closed = page.isClosed() && !browser.isConnected();
        observations.pageClosed = page.isClosed();
        observations.browserDisconnected = !browser.isConnected();
        observations.helperCleanupAwaited = true;
      }
    } finally {
      process.stdout.write('C019_BROWSER_RECORD=' + JSON.stringify(observations) + '\n');
    }
  }
  assert.equal(observations.closed, true);
});
