'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, repo, sha, inventory, dependencies, randomUUID } = require('./provenance.cjs');
const observed = require('..\\observations.js');

test('C016 actual signed Edge DOM, keyboard, original unknown, errors/reset and CSP', { timeout: 240000 }, async (t) => {
  const before = inventory(root, ['publication.json']);
  const acceptedBefore = dependencies();
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    assert.equal(Object.keys(before).filter((file) => /^evidence\\browser-[0-9a-f-]{36}\.raw\.json$/.test(file)).length, 0,
      'The one deliberate raw proof already exists; normal read-only verification remains available, never refresh or delete it.');
  }
  const signatureResult = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $edge; @{status=[string]$s.Status;signer=$s.SignerCertificate.Subject;fileVersion=(Get-Item -LiteralPath $edge).VersionInfo.FileVersion}|ConvertTo-Json -Compress"],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.ifError(signatureResult.error);
  assert.equal(signatureResult.status, 0, signatureResult.stderr);
  const signature = JSON.parse(signatureResult.stdout);
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.equal(signature.fileVersion, '156.0.4314.50');
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperSha256 = sha(fs.readFileSync(helper));
  assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const report = {
    schemaVersion: 1, cardId: 'C016', kind: 'actual-signed-edge-dom-keyboard-csp',
    capturedAtUtc: new Date().toISOString(), signature, helperSha256,
    playwrightVersion: require(require.resolve('playwright/package.json', { paths: [path.dirname(helper)] })).version,
    browserFilesystemOperation: false, browserStartsNodeProcesses: false, liveConsentRead: false,
    cloudTransaction: false, foregroundLease: false, checks: [], pageErrors: [], nonFileRequests: [],
    passed: false, closed: false, originalUnitCredits: 0,
  };
  assert.equal(report.playwrightVersion, '1.56.1');
  let session;
  async function check(name, operation) {
    await t.test(name, async () => {
      try {
        const actualDOM = await operation();
        report.checks.push({ name, passed: true, actualDOM });
      } catch (error) {
        report.checks.push({ name, passed: false, error: error.message });
        throw error;
      }
    });
  }
  try {
    session = await require(helper).openIsolatedLesson(path.join('capability', 'C016', 'index.html'));
    const { page } = session;
    report.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion, signature.fileVersion);
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('request', (request) => { if (!request.url().startsWith('file:')) report.nonFileRequests.push(request.url()); });
    await page.route('**/*', (route) => route.request().url().startsWith('file:')
      ? route.continue() : route.abort('blockedbyclient'));
    await page.addInitScript(() => {
      globalThis.__c016PolicyViolations = [];
      addEventListener('securitypolicyviolation', (event) => globalThis.__c016PolicyViolations.push({
        directive: event.effectiveDirective, blocked: event.blockedURI,
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('conduct').disabled);
    const journey = page.locator('#journey');
    const scope = page.locator('#scope');
    const conduct = page.locator('#conduct');
    const retry = page.locator('#retry');
    const inspect = page.locator('#inspect');
    const status = page.locator('#status');
    const dom = () => page.locator('#result').textContent().then(JSON.parse);
    const waitEntries = (length) => page.waitForFunction((count) => {
      try { return JSON.parse(document.getElementById('result').textContent).entries.length === count; } catch { return false; }
    }, length);
    async function next(length) {
      await conduct.click();
      await waitEntries(length);
    }

    await check('exact banner and genuine historical versus filesystem boundaries', async () => {
      assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      const main = await page.locator('main').textContent();
      assert.match(main, /bundled historical observations from actual fresh Node processes, not live disk operations/);
      assert.match(main, /This browser cannot write files, launch processes, reclaim markers/);
      assert.match(main, /H004, H012, native execution, and production Node 24 remain incomplete/);
      assert.match(await status.textContent(), /No current consent or disk state is inferred/);
      return { banner: await page.locator('#banner').textContent(), initialStatus: await status.textContent() };
    });
    await check('actual Tab and Enter conduct and identical retry inspect matching received acknowledgment', async () => {
      await journey.focus();
      await page.keyboard.press('Tab');
      assert.equal(await scope.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await conduct.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      await waitEntries(1);
      const first = await dom();
      assert.deepEqual(first.entries[0], observed.cases.find((item) => item.id === 'retry').entries[0]);
      await page.keyboard.press('Tab');
      assert.equal(await retry.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      await waitEntries(2);
      const retried = await dom();
      assert.deepEqual(retried.entries[1].result.acknowledgment, first.entries[0].result.acknowledgment);
      assert.equal(retried.entries[1].result.publicationPerformed, false);
      await conduct.focus();
      await page.keyboard.press('Tab');
      assert.equal(await inspect.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Guarded journal inspected'));
      const inspected = await dom();
      assert.equal(inspected.filesystemOperationNow, false);
      assert.equal(inspected.historicalScratchCleaned, true);
      assert.equal(inspected.retainedHistoricalFileCount, 2);
      assert.deepEqual(inspected.journal.entries, retried.entries);
      return { receivedAck: retried.entries[1].result.acknowledgment, retryWrites: false,
        actualKeyboardInspection: true, actualFilesystemOperationNow: inspected.filesystemOperationNow };
    });
    await check('original unobserved acknowledgment is never repainted by a confirmed retry', async () => {
      await journey.selectOption('unknown');
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#result').textContent(), 'No recorded attempt selected.');
      await next(1);
      const original = await dom();
      assert.equal(original.entries[0].result.outcome, 'unknown');
      assert.equal(original.entries[0].process.exitCode, 87);
      assert.equal(original.entries[0].process.stdout, '');
      assert.equal(original.entries[0].result.acknowledgment, null);
      assert.match(await page.locator('#errors').textContent(), /CLIENT_ACK_UNOBSERVED/);
      await retry.focus();
      await page.keyboard.press('Enter');
      await waitEntries(2);
      const retried = await dom();
      assert.deepEqual(retried.entries[0], original.entries[0]);
      assert.equal(retried.originalUserImpact, 'unknown');
      assert.equal(retried.latestOutcome, 'positive');
      assert.deepEqual(retried.unknownAttempts, [1]);
      assert.match(await page.locator('#impact').textContent(), /Original user impact: unknown; latest recorded outcome: positive/);
      assert.match(await page.locator('#history li').first().textContent(), /unknown — CLIENT_ACK_UNOBSERVED/);
      return { originalExit: 87, originalOutcome: retried.entries[0].result.outcome,
        originalAck: retried.entries[0].result.acknowledgment, retryOutcome: retried.latestOutcome,
        impact: await page.locator('#impact').textContent() };
    });
    await check('conflicting expected epoch is negative and cooperative marker hold has no old-state acknowledgment', async () => {
      await journey.selectOption('conflict');
      await next(1);
      await next(2);
      const conflict = await dom();
      assert.equal(conflict.latestOutcome, 'negative');
      assert.equal(conflict.entries[1].result.code, 'EXPECTED_EPOCH_CONFLICT');
      assert.equal(conflict.observedEpoch, 1);
      assert.equal(conflict.entries[1].result.acknowledgment, null);
      assert.match(await page.locator('#errors').textContent(), /Expected epoch 2 does not match observed epoch 1/);
      await journey.selectOption('hold');
      for (const length of [1, 2, 3, 4]) await next(length);
      const held = await dom();
      assert.equal(held.latestOutcome, 'unknown');
      assert.deepEqual(held.unknownAttempts, [2, 3, 4]);
      assert.equal(held.entries[2].result.code, 'HOLD_UNOBSERVED');
      assert.equal(held.entries[2].result.acknowledgment, null);
      assert.equal(held.entries[3].result.acknowledgment, null);
      assert.equal(await retry.isDisabled(), true);
      assert.match(await page.locator('#errors').textContent(), /writer marker remains/);
      return { negativeCode: conflict.entries[1].result.code, heldCode: held.entries[2].result.code,
        heldAck: held.entries[2].result.acknowledgment, unknownAttempts: held.unknownAttempts, retryDisabled: true };
    });
    await check('scope and unknown case errors are explicit; actual keyboard reset clears display and restores focus', async () => {
      await journey.selectOption('retry');
      await scope.selectOption('native.execute');
      await conduct.click();
      await page.waitForFunction(() => document.getElementById('errors').textContent.includes('LIVE_AZURE_NOT_APPROVED'));
      assert.equal(await page.locator('#history li').count(), 0);
      await scope.selectOption('unknown.action');
      await conduct.click();
      await page.waitForFunction(() => document.getElementById('errors').textContent.includes('UNKNOWN_ACTION'));
      await scope.selectOption('local.probe');
      await journey.evaluate((element) => {
        const option = document.createElement('option');
        option.value = 'undeclared-case';
        option.textContent = 'Undeclared case';
        element.append(option);
      });
      await journey.selectOption('undeclared-case');
      assert.match(await page.locator('#errors').textContent(), /UNKNOWN_REPLAY_CASE/);
      assert.equal(await conduct.isDisabled(), true);
      await page.locator('#reset').focus();
      await page.keyboard.press('Enter');
      assert.equal(await journey.evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#errors').textContent(), '');
      assert.equal(await page.locator('#result').textContent(), 'No recorded attempt selected.');
      assert.match(await status.textContent(), /Display reset only; no files, markers, original evidence or consent changed/);
      await journey.selectOption('retry');
      return { nativeDenied: true, unknownActionDenied: true, unknownCaseDenied: true,
        keyboardResetFocus: 'journey', resetOnlyPresentation: true };
    });
    await check('actual CSP rejects inline execution, network connections and form navigation', async () => {
      const urlBefore = page.url();
      const policy = await page.evaluate(async () => {
        const script = document.createElement('script');
        script.textContent = 'globalThis.__c016InlineExecuted = true';
        document.head.append(script);
        let blockedFetch = false;
        try { await fetch('http://127.0.0.1:1/c016-csp-denied'); } catch { blockedFetch = true; }
        const form = document.createElement('form');
        form.action = 'http://127.0.0.1:1/c016-form-denied';
        document.body.append(form);
        form.submit();
        form.remove();
        return { inlineExecuted: globalThis.__c016InlineExecuted === true, blockedFetch };
      });
      await page.waitForFunction(() => ['script-src-elem', 'connect-src', 'form-action']
        .every((name) => globalThis.__c016PolicyViolations.some((event) => event.directive === name)));
      const violations = await page.evaluate(() => globalThis.__c016PolicyViolations);
      assert.equal(policy.inlineExecuted, false);
      assert.equal(policy.blockedFetch, true);
      assert.equal(page.url(), urlBefore);
      assert.equal(report.nonFileRequests.length, 0);
      return { ...policy, formNavigationBlocked: true, violations, actualNonFileRequests: report.nonFileRequests };
    });
    await check('missing observation dependency disables replay visibly without fallback', async () => {
      await page.route('**/observations.js', (route) => route.abort('blockedbyclient'));
      await page.reload({ waitUntil: 'load' });
      assert.match(await status.textContent(), /DEPENDENCY_UNAVAILABLE/);
      assert.equal(await conduct.isDisabled(), true);
      assert.equal(await inspect.isDisabled(), true);
      return { status: await status.textContent(), conductDisabled: true, inspectDisabled: true };
    });
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.nonFileRequests, []);
    report.passed = report.checks.length === 7 && report.checks.every((item) => item.passed);
    assert.equal(report.passed, true);
  } finally {
    if (session) {
      await session.close();
      report.closed = true;
    }
    assert.deepEqual(inventory(root, ['publication.json']), before, 'Browser verification is C016 source/evidence read-only before explicit capture.');
    assert.deepEqual(dependencies(), acceptedBefore, 'Browser cannot change accepted source, evidence or retained C015 demo.');
    report.sourceEvidenceReadOnly = true;
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
      const file = `browser-${randomUUID()}.raw.json`;
      const bytes = Buffer.from(`${JSON.stringify(report, null, 2).replace(/\n/g, '\r\n')}\r\n`);
      fs.writeFileSync(path.join(root, 'evidence', file), bytes, { flag: 'wx' });
      const after = inventory(root, ['publication.json']);
      assert.deepEqual(Object.keys(after).filter((key) => !Object.hasOwn(before, key)), [path.join('evidence', file)]);
      for (const [key, value] of Object.entries(before)) assert.equal(after[key], value);
      t.diagnostic(JSON.stringify({ capturedFile: file, bytes: bytes.length, sha256: sha(bytes),
        exactCaptureValue: '1', uniqueAppendOnlyRawProof: true, passed: report.passed, closed: report.closed }));
    } else {
      t.diagnostic(JSON.stringify({ capture: false, checks: report.checks.length, passed: report.passed,
        closed: report.closed, browserVersion: report.browserVersion, sourceEvidenceReadOnly: true }));
    }
  }
});
