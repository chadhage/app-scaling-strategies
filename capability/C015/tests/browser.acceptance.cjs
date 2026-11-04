'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { openIsolatedLesson } = require('..\\..\\..\\testing\\browser\\isolated.cjs');
const snapshot = require('..\\observed-snapshot.js');

test('C015 actual signed Edge DOM, keyboard, error/reset, unknown/scope and CSP inspection', { timeout: 180000 }, async (t) => {
  const signatureProcess = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $edge; @{status=[string]$s.Status;signer=$s.SignerCertificate.Subject;fileVersion=(Get-Item -LiteralPath $edge).VersionInfo.FileVersion}|ConvertTo-Json -Compress"],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.ifError(signatureProcess.error);
  assert.equal(signatureProcess.status, 0);
  const signature = JSON.parse(signatureProcess.stdout);
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.equal(signature.fileVersion, '156.0.4314.50');
  const helper = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
  const helperSha256 = createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
  assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const observations = {
    schemaVersion: 1, cardId: 'C015', kind: 'signed-edge-dom',
    capturedAtUtc: new Date().toISOString(), signature, helperSha256,
    playwrightVersion: require(require.resolve('playwright/package.json', { paths: [path.dirname(helper)] })).version,
    filesystemExecutionByBrowser: false, nativeAzureExecution: false,
    foregroundLease: false, checks: [], pageErrors: [], nonFileRequests: [],
    passed: false, closed: false, originalUnitCredits: 0,
  };
  assert.equal(observations.playwrightVersion, '1.56.1');
  let session;
  try {
    session = await openIsolatedLesson(path.join('capability', 'C015', 'index.html'));
    const { page } = session;
    observations.browserVersion = session.browserVersion;
    assert.equal(observations.browserVersion, signature.fileVersion);
    page.on('pageerror', (error) => observations.pageErrors.push(error.message));
    page.on('request', (request) => { if (!request.url().startsWith('file:')) observations.nonFileRequests.push(request.url()); });
    await page.route('**/*', async (route) => {
      if (route.request().url().startsWith('file:')) await route.continue();
      else await route.abort('blockedbyclient');
    });
    await page.addInitScript(() => {
      globalThis.__c015Violations = [];
      addEventListener('securitypolicyviolation', (event) => globalThis.__c015Violations.push({
        directive: event.effectiveDirective, blocked: event.blockedURI,
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('inspect').disabled);
    const run = page.locator('#run-id');
    const scope = page.locator('#scope');
    const inspect = page.getByRole('button', { name: 'Inspect recorded receipt', exact: true });
    const status = page.locator('#status');
    const receipt = () => page.locator('#receipt').textContent().then(JSON.parse);
    async function check(name, action) {
      await t.test(name, async () => {
        const result = await action();
        observations.checks.push({ name, passed: true, observed: result });
      });
    }

    await check('exact banner and honest read-only boundaries', async () => {
      assert.equal(await page.locator('#banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      const text = await page.locator('main').textContent();
      assert.match(text, /This browser does not write files, restart a process, reread live storage/);
      assert.match(text, /H001, H004, cloud execution, and production Node 24 remain incomplete/);
      assert.match(text, /No UI prediction is presented as empirical evidence/);
      assert.match(await status.textContent(), /No live consent or disk state is inferred/);
      return { banner: await page.locator('#banner').textContent(), initialStatus: await status.textContent() };
    });
    await check('real Tab and Enter inspect exact captured state and acknowledged fields', async () => {
      await run.focus();
      await page.keyboard.press('Tab');
      assert.equal(await scope.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await inspect.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      const observed = await receipt();
      assert.deepEqual(observed.state, snapshot.runs[0].result.state);
      assert.deepEqual(observed.acknowledgment, snapshot.runs[0].result.acknowledgment);
      assert.equal(observed.actualFilesystemOperationNow, false);
      assert.deepEqual(observed.writerPids, snapshot.runs[0].writerPids);
      assert.equal(observed.readerPid, snapshot.runs[0].readerPid);
      assert.match(await status.textContent(), /This click is not a new disk read or restart/);
      return observed;
    });
    await check('selection edits clear stale evidence and second run displays its actual epoch', async () => {
      await run.selectOption('synthetic-run-002');
      assert.match(await status.textContent(), /no stale observation is retained/);
      assert.equal(await page.locator('#receipt').textContent(), 'No observation selected.');
      await inspect.click();
      const observed = await receipt();
      assert.deepEqual(observed.state, snapshot.runs[1].result.state);
      assert.equal(observed.state.epoch, 2);
      return observed;
    });
    await check('Azure scope is visibly denied without execution', async () => {
      await scope.selectOption('azure');
      await inspect.click();
      assert.match(await status.textContent(), /REJECTED LOCAL_ONLY/);
      assert.match(await page.locator('#receipt').textContent(), /No filesystem or cloud operation occurred/);
      return { status: await status.textContent() };
    });
    await check('unknown run IDs and unknown scopes fail closed', async () => {
      await scope.selectOption('local-snapshot');
      await run.evaluate((element) => { element.add(new Option('unknown', '..\\C001')); element.value = '..\\C001'; });
      await inspect.click();
      assert.match(await status.textContent(), /REJECTED UNKNOWN_RUN_ID/);
      const unknownRun = await status.textContent();
      await run.selectOption('synthetic-run-001');
      await scope.evaluate((element) => { element.add(new Option('unknown', 'unknown')); element.value = 'unknown'; });
      await inspect.click();
      assert.match(await status.textContent(), /REJECTED UNKNOWN_SCOPE/);
      return { unknownRun, unknownScope: await status.textContent() };
    });
    await check('keyboard reset clears only display and returns focus without a storage reset', async () => {
      await page.getByRole('button', { name: 'Clear display only', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await run.evaluate((element) => element === document.activeElement), true);
      assert.match(await status.textContent(), /Files and historical evidence remain unchanged/);
      assert.equal(await page.locator('#receipt').textContent(), 'No observation selected.');
      assert.equal(await run.inputValue(), 'synthetic-run-001');
      assert.equal(await scope.inputValue(), 'local-snapshot');
      return { status: await status.textContent(), focus: 'run-id' };
    });
    await check('actual CSP blocks inline script, connection, worker, frame and form navigation', async () => {
      await page.evaluate(async () => {
        const script = document.createElement('script');
        script.textContent = 'globalThis.__c015InlineExecuted = true';
        document.body.append(script);
        await fetch('https://example.invalid/c015-probe').catch(() => {});
        try { new Worker('data:text/javascript,postMessage(1)'); } catch {}
        const iframe = document.createElement('iframe');
        iframe.src = 'https://example.invalid/c015-frame';
        document.body.append(iframe);
        const form = document.createElement('form');
        form.action = 'https://example.invalid/c015-form';
        form.method = 'post';
        document.body.append(form);
        form.submit();
      });
      await page.waitForFunction(() => globalThis.__c015Violations.length >= 5);
      const violations = await page.evaluate(() => globalThis.__c015Violations);
      for (const directive of ['script-src-elem', 'connect-src', 'worker-src', 'frame-src', 'form-action']) {
        assert.ok(violations.some((entry) => entry.directive === directive), directive);
      }
      assert.equal(await page.evaluate(() => globalThis.__c015InlineExecuted), undefined);
      assert.equal(observations.nonFileRequests.length, 0);
      return { violations, nonFileRequests: observations.nonFileRequests };
    });
    await check('missing bundled evidence leaves inspection disabled, not a predicted default', async () => {
      await page.route('**/observed-snapshot.js', (route) => route.abort('blockedbyclient'));
      await page.reload({ waitUntil: 'load' });
      assert.equal(await inspect.isDisabled(), true);
      assert.match(await status.textContent(), /REJECTED EVIDENCE_MISSING/);
      assert.match(await page.locator('#receipt').textContent(), /No observation returned/);
      return { status: await status.textContent(), disabled: await inspect.isDisabled() };
    });
    assert.equal(observations.checks.length, 8);
    assert.deepEqual(observations.pageErrors, []);
    assert.deepEqual(observations.nonFileRequests, []);
    observations.passed = true;
  } finally {
    try {
      if (session) await session.close();
      observations.closed = true;
    } finally {
      if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
        const file = `browser-${randomUUID()}.raw.json`;
        fs.writeFileSync(path.resolve(__dirname, '..', 'evidence', file),
          JSON.stringify(observations, null, 2).replace(/\n/g, '\r\n') + '\r\n', { flag: 'wx' });
        t.diagnostic(JSON.stringify({ rawEvidence: file, passed: observations.passed, closed: observations.closed, groups: observations.checks.length }));
      }
    }
  }
});
