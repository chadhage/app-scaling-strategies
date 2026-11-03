'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const tooling = path.join(root, 'testing', 'browser');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const safe = {
  scope: 'effective', setting: 'target', identity: 'granted', network: 'reachable', background: 'suppressed'
};
function signedEdge() {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'",
    '$s=Get-AuthenticodeSignature -LiteralPath $p',
    '@{path=$p;status=[string]$s.Status;signer=$s.SignerCertificate.Subject;productVersion=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress'
  ].join('; ');
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 30000
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const signature = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.match(signature.productVersion, /^156\./);
  return signature;
}

test('actual isolated browser conducts S024 effective settings and safety checks', { timeout: 150000 }, async (t) => {
  const report = {
    cardId: 'A-S024', workerId: 'worker-A-S024', kano: 'S', kanoUnit: 'A-S024', packet: 'SC-S024',
    mode: 'actual-real-headless-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), node: process.version,
    helper: 'testing\\browser\\isolated.cjs', helperSha256: helperHash, helperPublishedCommit: '53c0c0d',
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'model.js', 'app.js', 'manifest.json', 'browser.test.cjs']
      .map((name) => [name, hash(path.join(__dirname, name))])),
    cases: [], pageErrors: [], consoleErrors: [], externalCompleted: [],
    closeAwaited: false, nativeProof: false, productionNode24Validated: false, parentComplete: false, status: 'running'
  };
  let session;
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(hash(path.join(tooling, 'isolated.cjs')), helperHash);
    report.playwright = JSON.parse(fs.readFileSync(path.join(tooling, 'node_modules', 'playwright', 'package.json'), 'utf8')).version;
    assert.equal(report.playwright, '1.56.1');
    report.signedBrowser = signedEdge();
    const { openIsolatedLesson } = require(path.join(tooling, 'isolated.cjs'));
    session = await openIsolatedLesson('learning\\S024\\index.html');
    report.browserVersion = session.browserVersion;
    assert.equal(report.browserVersion, report.signedBrowser.productVersion);
    const { page } = session;
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('requestfinished', (request) => {
      if (!request.url().startsWith('file:')) report.externalCompleted.push(request.url());
    });
    const read = async () => JSON.parse(await page.locator('#run-evidence').textContent());
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const configure = async (input) => {
      for (const [name, value] of Object.entries(input)) await page.locator(`[name="${name}"]`).selectOption(value);
    };
    const validate = () => press('validate-settings');
    const reset = () => press('archive-run', 'Space');
    const conduct = async (name, check) => {
      await t.test(name, async () => {
        const record = { name, status: 'running' };
        try {
          await page.reload({ waitUntil: 'load' });
          await check(record);
          record.status = 'passed';
        } catch (error) {
          record.status = 'failed';
          record.error = error.message;
          throw error;
        } finally {
          record.observed = await read().catch((error) => ({ readError: error.message }));
          record.dom = {
            verdict: await page.locator('#verdict').textContent(),
            counters: await page.locator('#counters').textContent(),
            workers: await page.locator('#worker-counts').textContent(),
            alertVisible: await page.locator('#input-error').isVisible(),
            traceRows: await page.locator('#trace > li').count(),
            comparisonRows: await page.locator('#comparison-rows > tr').count(),
            archivedRuns: await page.locator('#history > details').count(),
            historyCounts: await page.locator('#history-counts').textContent()
          };
          report.cases.push(record);
        }
      });
    };

    await conduct('exact banner, five labeled controls, callable form reset and empty unknown', async () => {
      assert.equal(await page.title(), 'S024 — Production-configuration validation');
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      for (const label of [
        'Validation scope', 'Candidate dependency setting under target configuration',
        "Candidate identity's access to target dependency", "Candidate network's reachability to target dependency",
        'Candidate background work during validation'
      ]) assert.equal(await page.getByLabel(label, { exact: true }).count(), 1);
      assert.equal(await page.locator('form').evaluate((form) => typeof form.reset), 'function');
      assert.equal((await read()).summary.verdict, 'unknown');
      assert.equal((await read()).summary.validations, 0);
      assert.equal(await page.getByRole('alert').isVisible(), false);
      assert.equal(await page.locator('noscript').isVisible(), false);
      assert.equal(await page.locator('#comparison-rows tr').count(), 4);
    });

    await conduct('staging checks pass while target readiness and non-swapped access remain unproven', async () => {
      await validate();
      const result = await read();
      assert.equal(result.summary.verdict, 'unknown');
      assert.equal(result.summary.checksPassed, 4);
      assert.equal(result.state.attempts[0].targetSettingsObserved, false);
      assert.equal(result.state.attempts[0].config.identity, 'denied');
      assert.equal(result.state.attempts[0].config.network, 'blocked');
      assert.match(await page.locator('#comparison-rows').textContent(), /production-mi.*candidate-mi \(denied\)/);
      assert.match(await page.locator('#trace').textContent(), /Staging checks passed/);
    });

    await conduct('keyboard-only after initial focus produces four safe effective checks', async (record) => {
      await page.locator('#validation-scope').focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#dependency-setting').evaluate((node) => document.activeElement === node), true);
      assert.equal(await page.locator('#dependency-setting').evaluate((node) => getComputedStyle(node).outlineWidth), '3px');
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#validate-settings').evaluate((node) => document.activeElement === node), true);
      await page.keyboard.press('Space');
      const result = await read();
      assert.deepEqual(result.state.attempts[0].config, safe);
      assert.equal(result.summary.verdict, 'success');
      assert.equal(result.summary.checksPassed, 4);
      assert.equal(result.summary.candidateBackgroundStarts, 0);
      assert.equal(result.summary.duplicateBackgroundStarts, 0);
      assert.equal(result.state.attempts[0].candidateIdentity, 'candidate-mi');
      assert.equal(result.state.attempts[0].candidateNetwork, 'candidate-subnet');
      record.keyboardOnlyAfterInitialFocus = true;
    });

    await conduct('three effective differences fail independently and a repair retains the failure', async (record) => {
      await configure({ ...safe, setting: 'sticky-staging', identity: 'denied', network: 'blocked' });
      assert.equal((await read()).state.attempts.length, 0, 'Preview changes are not validation evidence.');
      assert.match(await page.locator('#comparison-rows tr').first().textContent(), /orders-stage-fixture.*orders-prod-fixture.*orders-stage-fixture/);
      await validate();
      const failure = await read();
      assert.equal(failure.summary.verdict, 'failure');
      assert.deepEqual(failure.state.attempts[0].checks.map((check) => check.status), ['fail', 'fail', 'fail', 'pass']);
      await configure(safe);
      await validate();
      const recovery = await read();
      assert.equal(recovery.state.attempts[1].verdict, 'success');
      assert.equal(recovery.summary.verdict, 'failure');
      assert.equal(recovery.summary.failed, 1);
      assert.equal(recovery.summary.successful, 1);
      assert.deepEqual(recovery.state.attempts[0], failure.state.attempts[0]);
      assert.match(await page.locator('#verdict').textContent(), /FAILURE/);
      record.failedSnapshot = failure;
    });

    await conduct('unsafe background request is blocked before checks and cannot execute duplicate work', async () => {
      await configure({ ...safe, background: 'enabled' });
      await validate();
      const result = await read();
      const attempt = result.state.attempts[0];
      assert.equal(result.summary.verdict, 'failure');
      assert.equal(attempt.blocked, true);
      assert.deepEqual(attempt.checks.map((check) => check.status), ['skipped', 'skipped', 'skipped', 'fail']);
      assert.equal(result.summary.preventedDuplicateStarts, 1);
      assert.equal(result.summary.productionBackgroundWorkers, 1);
      assert.equal(result.summary.candidateBackgroundStarts, 0);
      assert.equal(result.summary.duplicateBackgroundStarts, 0);
      assert.match(await page.locator('#trace').textContent(), /blocked before dependency checks or candidate execution/);
    });

    await conduct('each missing target observation is unknown and survives recovery in archived traces', async (record) => {
      record.missingChecks = [];
      for (const key of ['setting', 'identity', 'network']) {
        await configure({ ...safe, [key]: 'unobserved' });
        await validate();
        const unknown = await read();
        assert.equal(unknown.summary.verdict, 'unknown');
        assert.equal(unknown.state.attempts[0].checks.find((check) => check.key === key).status, 'unknown');
        await configure(safe);
        await validate();
        const recovered = await read();
        assert.equal(recovered.summary.verdict, 'unknown');
        assert.equal(recovered.summary.successful, 1);
        record.missingChecks.push({ key, observed: recovered });
        await reset();
      }
      assert.equal((await read()).state.history.length, 3);
      assert.equal(await page.locator('#history > details').count(), 3);
    });

    await conduct('tampered enum produces a focused alert with no state mutation; reset restores native defaults', async (record) => {
      const before = await read();
      await page.locator('#identity-access').evaluate((select) => {
        const option = document.createElement('option');
        option.value = 'injected-invalid';
        option.textContent = 'Invalid test option';
        select.append(option);
        select.value = option.value;
      });
      await validate();
      assert.deepEqual(await read(), before);
      assert.equal(await page.getByRole('alert').isVisible(), true);
      assert.match(await page.getByRole('alert').textContent(), /Invalid configuration/);
      assert.equal(await page.getByRole('alert').evaluate((node) => document.activeElement === node), true);
      record.focusedError = await page.getByRole('alert').textContent();
      await reset();
      assert.equal(await page.getByRole('alert').isVisible(), false);
      assert.equal(await page.locator('#validation-scope').evaluate((node) => document.activeElement === node), true);
      assert.equal(await page.locator('#identity-access').inputValue(), 'denied');
      assert.equal((await read()).state.runId, 1, 'Empty reset does not consume history or a run ID.');
      assert.equal(await page.locator('form').evaluate((form) => typeof form.reset), 'function');
    });

    await conduct('six-check bound, archive/reset keyboard focus and complete bounded history', async (record) => {
      await configure(safe);
      for (let index = 0; index < 6; index += 1) await validate();
      const full = await read();
      await validate();
      assert.deepEqual(await read(), full);
      assert.match(await page.getByRole('alert').textContent(), /six validations/);
      assert.equal(await page.getByRole('alert').evaluate((node) => document.activeElement === node), true);
      record.limitSnapshot = full;
      await reset();
      let current = await read();
      assert.deepEqual(current.state.history[0].attempts, full.state.attempts);
      assert.equal(current.summary.verdict, 'unknown');
      assert.equal(await page.locator('#validation-scope').evaluate((node) => document.activeElement === node), true);
      assert.equal(await page.locator('#validation-scope').inputValue(), 'staging');
      assert.equal(await page.locator('#background-mode').inputValue(), 'suppressed');
      assert.equal(await page.getByRole('alert').isVisible(), false);
      await validate();
      await reset();
      await configure({ ...safe, identity: 'denied' });
      await validate();
      await reset();
      await configure(safe);
      await validate();
      await reset();
      current = await read();
      assert.equal(current.state.runId, 5);
      assert.equal(current.state.history.length, 3);
      assert.equal(current.state.evictedRuns, 1);
      assert.deepEqual(current.state.history.map((run) => run.runId), [2, 3, 4]);
      assert.deepEqual(current.state.history.map((run) => run.summary.verdict), ['unknown', 'failure', 'success']);
      await page.locator('#history > details').nth(1).locator('summary').press('Enter');
      assert.match(await page.locator('#history > details').nth(1).textContent(), /candidate-mi: denied/);
    });

    await conduct('actual CSP blocks inline execution and external connection without network completion', async (record) => {
      await page.evaluate(async () => {
        globalThis.s024Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.s024Violations.push({
            directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition
          });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.s024InlineExecuted = true;';
        document.body.append(script);
        try { await fetch('https://s024.invalid/blocked'); globalThis.s024FetchResolved = true; }
        catch { globalThis.s024FetchRejected = true; }
      });
      await page.waitForFunction(() => globalThis.s024Violations.some((entry) => entry.directive === 'connect-src')
        && globalThis.s024Violations.some((entry) => entry.directive.startsWith('script-src')));
      const observation = await page.evaluate(() => ({
        inlineExecuted: globalThis.s024InlineExecuted === true,
        fetchResolved: globalThis.s024FetchResolved === true,
        fetchRejected: globalThis.s024FetchRejected === true,
        violations: globalThis.s024Violations
      }));
      assert.equal(observation.inlineExecuted, false);
      assert.equal(observation.fetchResolved, false);
      assert.equal(observation.fetchRejected, true);
      assert.ok(observation.violations.every((entry) => entry.disposition === 'enforce'));
      assert.equal(report.externalCompleted.length, 0);
      record.csp = observation;
    });
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalCompleted, []);
    assert.ok(report.consoleErrors.every((message) => /Content Security Policy|content security policy/.test(message)),
      'Only the deliberately triggered CSP console errors are expected.');
    assert.ok(report.cases.every((entry) => entry.status === 'passed'), 'Every actual DOM check must pass.');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        report.closeAwaited = true;
      }
    } catch (error) {
      report.status = 'failed';
      report.cleanupError = error.message;
      throw error;
    } finally {
      report.finishedAtUtc = new Date().toISOString();
      if (capture) {
        const directory = path.join(__dirname, 'evidence');
        fs.mkdirSync(directory, { recursive: true });
        let number = 1;
        while (fs.existsSync(path.join(directory, `browser-observation-${number}.json`))) number += 1;
        report.captureWasExplicit = true;
        fs.writeFileSync(path.join(directory, `browser-observation-${number}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
