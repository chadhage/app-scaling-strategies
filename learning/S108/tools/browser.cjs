'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash, tree, nextName, saveRaw, writeRecord } = require('./proof.cjs');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const before = tree(root);
const snapshotFiles = ['model.js', 'lesson.js', 'index.html', 'lesson.css', 'lesson.feature', 'manifest.json', 'tools\\browser.cjs', 'tools\\csp-probe.js'];
const snapshots = snapshotFiles.map((file) => ({ source: file, bytes: fs.readFileSync(path.join(root, file)) }));
const startedAtUtc = new Date().toISOString();
const steps = [];
const pageErrors = [];
const consoleErrors = [];
const requestedUrls = [];
let preflightRaw = Buffer.alloc(0);
let preflight = null;
let preflightInvocation = null;
let browserVersion = null;
let closeAwaited = false;
let pageClosed = false;
let failure = null;

async function observe(page, name) {
  const dom = await page.evaluate(() => ({
    title: document.title, banner: document.querySelector('.banner').textContent,
    status: document.getElementById('status').textContent,
    result: document.getElementById('status').dataset.result,
    policyState: document.getElementById('policy-state').textContent,
    comparison: document.getElementById('comparison-result').textContent,
    recovery: document.getElementById('recovery-result').textContent,
    metrics: document.getElementById('metrics').textContent,
    recoveryMetrics: document.getElementById('recovery-metrics').textContent,
    focus: document.activeElement.id || document.activeElement.tagName,
    error: { hidden: document.getElementById('error').hidden, text: document.getElementById('error').textContent },
    requests: Array.from(document.querySelectorAll('#requests tr')).map((row) => ({
      id: row.dataset.request, cells: Array.from(row.cells).map((cell) => cell.textContent),
    })),
    history: Array.from(document.querySelectorAll('#history li')).map((item) => ({
      comparison: item.dataset.comparison, action: item.dataset.action, result: item.dataset.result, text: item.textContent,
    })),
    controls: Array.from(document.getElementById('comparison-form').elements).map((control) => ({
      id: control.id, value: control.value, disabled: control.disabled,
      invalid: control.getAttribute('aria-invalid'),
    })),
  }));
  steps.push({ name, observedAtUtc: new Date().toISOString(), dom });
  return dom;
}

async function exercise() {
  assert.match(process.version, /^v22\./, 'Only Node 22 test tooling is qualified here.');
  const helper = fs.readFileSync(helperPath);
  assert.equal(hash(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(hash(Buffer.from(helper.toString('utf8').replace(/\r\n/g, '\n'))),
    '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  const packagePath = require.resolve('playwright/package.json', { paths: [path.join(repo, 'testing', 'browser')] });
  assert.equal(JSON.parse(fs.readFileSync(packagePath)).version, '1.56.1');
  const command = [
    "$ErrorActionPreference='Stop'",
    "$p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'",
    '$s=Get-AuthenticodeSignature -FilePath $p',
    '[ordered]@{executable=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus="$($s.Status)";signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress',
  ].join('; ');
  preflightInvocation = ['pwsh.exe', '-NoProfile', '-NonInteractive', '-Command', command];
  preflightRaw = execFileSync(preflightInvocation[0], preflightInvocation.slice(1), { cwd: repo, timeout: 30000 });
  preflight = JSON.parse(preflightRaw.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(preflight.signatureStatus, 'Valid');
  assert.match(preflight.signer, /CN=Microsoft Corporation/);
  assert.match(preflight.version, /^156\./);

  const { openIsolatedLesson } = require(helperPath);
  let session;
  try {
    session = await openIsolatedLesson('learning\\S108\\index.html');
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, preflight.version);
    const page = session.page;
    page.on('pageerror', (problem) => pageErrors.push(String(problem)));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', (request) => requestedUrls.push(request.url()));
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#history li').count(), 0);
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
    await observe(page, 'initial standalone DOM');

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'policy');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#policy').inputValue(), 'asset-block');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'recovery');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'apply-policy');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inspect-traffic');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
    assert.match(await page.locator('#metrics').textContent(), /inspected journeys: 0; positive: 0/);
    assert.equal(await page.locator('#history li').count(), 1);
    await observe(page, 'keyboard apply leaves comparison unknown');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'restore-policy');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'negative');
    const requestCells = async (id) => page.locator(`[data-request="${id}"] td`).allTextContents();
    assert.match((await requestCells('page'))[1], /^200 allow/);
    assert.match((await requestCells('profile'))[1], /^200 allow/);
    assert.match((await requestCells('script'))[1], /^403 block; rule POLICY-ASSET/);
    assert.match(await page.locator('#metrics').textContent(), /blocked journey requests: 0; blocked assets: 1/);
    await observe(page, 'keyboard inspection detects blocked required asset despite page and API success');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'verify-recovery');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
    assert.match(await page.locator('#recovery-metrics').textContent(), /Measured recoveries: 0; positive: 0; negative: 0; unknown: 0; pending: 1/);
    await observe(page, 'keyboard restoration retains interruption and cannot imply recovery');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'policy');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'positive');
    assert.match(await page.locator('#comparison-result').textContent(), /^Comparison: negative/);
    assert.equal(await page.locator('#history li').count(), 4);
    assert.match((await requestCells('script'))[2], /^200 allow/);
    await observe(page, 'keyboard measured recovery succeeds without erasing initial negative');

    async function compare(policy, recovery, comparisonResult, recoveryResult, label) {
      await page.locator('#policy').selectOption(policy);
      await page.locator('#recovery').selectOption(recovery);
      await page.locator('#apply-policy').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
      await page.locator('#inspect-traffic').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), comparisonResult);
      await observe(page, `${label}: inspected comparison`);
      await page.locator('#restore-policy').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
      await observe(page, `${label}: restored label with recovery unknown`);
      await page.locator('#verify-recovery').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), recoveryResult);
      await observe(page, `${label}: measured recovery`);
    }
    await compare('journey-block', 'blocked-asset', 'negative', 'negative', 'valid API block and failed recovery');
    assert.match((await requestCells('profile'))[1], /^403 block; rule POLICY-API/);
    assert.match((await requestCells('script'))[2], /^403 block; rule POLICY-ASSET/);
    await compare('matched', 'complete', 'positive', 'positive', 'complete matched traffic');
    await compare('missing-observation', 'missing-asset', 'unknown', 'unknown', 'missing script evidence');
    assert.match((await requestCells('script'))[1], /^Unknown: observation unavailable/);
    assert.match((await requestCells('script'))[2], /^Unknown: observation unavailable/);
    assert.match(await page.locator('#metrics').textContent(), /Comparisons: 4\/4; inspected journeys: 4; positive: 1; negative: 2; unknown: 1/);
    assert.match(await page.locator('#recovery-metrics').textContent(), /Measured recoveries: 4; positive: 2; negative: 1; unknown: 1/);
    assert.equal(await page.locator('#history li').count(), 16);
    assert.match(await page.locator('#history li[data-action="inspect"]').first().textContent(), /script: 403, rule POLICY-ASSET/);
    assert.equal(await page.locator('#apply-policy').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-lesson');
    assert.match(await page.locator('#status').textContent(), /Four-comparison bound reached/);
    await observe(page, 'four-comparison bound retains positive negative unknown and recovery history');

    await page.locator('#comparison-form').evaluate((form) => form.requestSubmit());
    assert.equal(await page.locator('#error').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
    assert.match(await page.locator('#error').textContent(), /four-comparison bound/);
    assert.equal(await page.locator('#history li').count(), 16);
    await observe(page, 'programmatic local submission cannot bypass the model bound');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-lesson');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'policy');
    assert.equal(await page.locator('#history li').count(), 0);
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('#policy').inputValue(), 'journey-block');
    assert.equal(await page.locator('#recovery').inputValue(), 'complete');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
    await observe(page, 'keyboard reset clears full history errors selections and observations');

    for (const id of ['policy', 'recovery']) {
      await page.locator(`#${id}`).evaluate((select) => {
        const option = document.createElement('option');
        option.value = 'invalid-test-only-fixture';
        option.dataset.invalidTest = 'true';
        option.textContent = 'Invalid test-only fixture';
        select.append(option);
        select.value = option.value;
      });
      await page.locator('#apply-policy').click();
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'true');
      assert.match(await page.locator('#error').textContent(), /^No action recorded: Choose one fixed policy/);
      assert.equal(await page.locator('#history li').count(), 0);
      await observe(page, `invalid ${id} data produces focused accessible error with no run`);
      await page.locator(`#${id} option[data-invalid-test]`).evaluate((option) => option.remove());
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-lesson');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), null);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'policy');
      await observe(page, `keyboard reset after invalid ${id} clears error and restores defaults`);
    }

    const csp = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push({
        directive: event.effectiveDirective, blocked: event.blockedURI,
      }));
      globalThis.__s108InlineExecuted = false;
      globalThis.__s108HandlerExecuted = false;
      globalThis.__s108EvalExecuted = false;
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s108InlineExecuted = true';
      document.body.append(script);
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('onclick', 'globalThis.__s108HandlerExecuted = true');
      document.body.append(button);
      button.click();
      const nativeScript = document.createElement('script');
      nativeScript.src = new URL('tools/csp-probe.js', document.baseURI).href;
      await new Promise((resolve, reject) => {
        nativeScript.onload = resolve;
        nativeScript.onerror = () => reject(new Error('The ordinary self-loaded eval probe did not load.'));
        document.body.append(nativeScript);
      });
      let connectionBlocked = false;
      try { await fetch('data:text/plain,s108-synthetic-csp-probe'); } catch { connectionBlocked = true; }
      await new Promise((resolve) => setTimeout(resolve, 50));
      script.remove();
      button.remove();
      nativeScript.remove();
      return {
        inlineExecuted: globalThis.__s108InlineExecuted,
        handlerExecuted: globalThis.__s108HandlerExecuted,
        evalExecuted: globalThis.__s108NativeEvalProbe.executed,
        evalBlocked: globalThis.__s108NativeEvalProbe.blocked, connectionBlocked, violations,
        evalContext: 'Ordinary self-loaded local script, not DevTools page.evaluate eval',
        target: 'data: only; no socket, remote endpoint, WAF or network probe',
      };
    });
    steps.push({ name: 'actual CSP blocks inline script handler eval and data-only connection', observedAtUtc: new Date().toISOString(), csp });
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.handlerExecuted, false);
    assert.equal(csp.evalExecuted, false);
    assert.equal(csp.evalBlocked, true);
    assert.equal(csp.connectionBlocked, true);
    for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src']) {
      assert.ok(csp.violations.some((entry) => entry.directive === directive));
    }
    await page.route('**/model.js', (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#error').isVisible(), true);
    assert.match(await page.locator('#error').textContent(), /Lesson model unavailable; no synthetic result/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
    assert.match(await page.locator('#status').textContent(), /Model unavailable: no synthetic result/);
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
    assert.equal(await page.locator('#history li').count(), 0);
    assert.equal(await page.locator('#comparison-form').evaluate((form) => Array.from(form.elements).every((control) => control.disabled)), true);
    await observe(page, 'actual missing-model load fails visibly with every control disabled and no success fallback');
    await page.unroute('**/model.js');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('#apply-policy').isEnabled(), true);
    assert.equal(await page.locator('#history li').count(), 0);
    await observe(page, 'complete bundle reload restores a clean unknown initial lesson after load failure');
    assert.deepEqual(pageErrors, []);
    assert.ok(requestedUrls.every((url) => url.startsWith('file:') || url.startsWith('data:')));
  } finally {
    if (session) {
      await session.close();
      closeAwaited = true;
      pageClosed = session.page.isClosed();
    }
  }
}

function captureReport(report, stdout, stderr) {
  const name = nextName(evidence, 'browser');
  const save = (label, bytes) => saveRaw(evidence, name, label, bytes);
  writeRecord(evidence, name, {
    stage: 'browser', name, outcome: report.outcome, startedAtUtc, finishedAtUtc: report.finishedAtUtc,
    command: [process.execPath, __filename], runtime: process.version,
    playwright: '1.56.1', browserVersion, helperSource: '53c0c0d',
    helperWorkingSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
    closeAwaited, pageClosed, ownedTreeUnchangedBeforeCapture: report.ownedTreeUnchangedBeforeCapture,
    stdout: save('stdout', stdout), stderr: save('stderr', stderr),
    preflight: save('signed-edge-preflight', preflightRaw),
    transcript: save('observations', Buffer.from(`${JSON.stringify(report, null, 2)}\n`)),
    snapshots: snapshots.map((entry) => ({
      source: entry.source.split(path.sep).join('/'), ...save(entry.source.replace(/[\\/]/g, '--'), entry.bytes),
    })),
    captureAuthorization: 'Exact deliberate CAPTURE_BROWSER_EVIDENCE=1 only; append-only; normal verification read-only.',
    additionalKanoCredits: 0, nativeValidated: false, nodeProduction24Validated: false,
  });
}

(async () => {
  try {
    await exercise();
    assert.equal(closeAwaited, true);
    assert.equal(pageClosed, true);
    assert.deepEqual(tree(root), before, 'Normal browser verification must not modify the owned lesson or previous proofs.');
  } catch (problem) {
    failure = problem;
  }
  const ownedTreeUnchangedBeforeCapture = JSON.stringify(tree(root)) === JSON.stringify(before);
  const report = {
    cardId: 'A-S108', workerId: 'worker-A-S108', packet: 'SC-S108', kanoUnit: 'A-S108',
    outcome: failure ? 'failed' : 'passed', startedAtUtc, finishedAtUtc: new Date().toISOString(),
    node: process.version, playwright: '1.56.1', browserVersion, preflight, preflightInvocation,
    steps, pageErrors, consoleErrors, requestedUrls, closeAwaited, pageClosed, ownedTreeUnchangedBeforeCapture,
    cleanupScope: 'Only awaited published helper close and observed owned page closed. Overall helper lifecycle remains unqualified; no unrelated process/profile cleanup.',
    failure: failure ? { name: failure.name, message: failure.message, stack: failure.stack } : null,
    qualification: 'Actual local DOM/keyboard/error/reset/failure/CSP observations only. Policy/rule/traffic/asset/routing/authentication remain fixed fictional DATA ONLY; no native/source-parent/production Node 24 validation.',
  };
  const stdout = Buffer.from(`${JSON.stringify({
    outcome: report.outcome, browserVersion, playwright: '1.56.1', node: process.version,
    observedChecks: steps.map((step) => step.name), closeAwaited, pageClosed,
    ownedTreeUnchangedBeforeCapture, deliberateCapture: capture,
  }, null, 2)}\n`);
  const stderr = Buffer.from(failure ? `${failure.stack}\n` : '');
  if (capture) captureReport(report, stdout, stderr);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (failure) process.exitCode = 1;
})().catch((problem) => {
  console.error(problem);
  process.exitCode = 1;
});
