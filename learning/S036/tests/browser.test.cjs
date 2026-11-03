'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const helperPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(path.dirname(helperPath), 'node_modules', 'playwright', 'package.json')).version;
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('A-S036 actual isolated DOM, keyboard, error, reset, failure and CSP observations', async (t) => {
  const helperSha256 = createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
  assert.equal(helperSha256, expectedHelper, 'Use only the published helper, never the abandoned lifecycle prototype.');
  assert.equal(process.version, 'v22.23.4');
  assert.equal(playwrightVersion, '1.56.1');
  const signatureCommand = "$ErrorActionPreference='Stop'; $p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $p; [ordered]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;status=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress";
  const signatureRun = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', signatureCommand], {
    encoding: 'utf8', windowsHide: true
  });
  t.diagnostic(JSON.stringify({
    signatureHost: 'pwsh.exe', signatureCommand, signatureStdout: signatureRun.stdout,
    signatureStderr: signatureRun.stderr, signatureExitCode: signatureRun.status
  }));
  assert.equal(signatureRun.status, 0, signatureRun.stderr);
  assert.equal(signatureRun.stderr, '');
  const signature = JSON.parse(signatureRun.stdout);
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /O=Microsoft Corporation/);
  assert.equal(signature.version, '156.0.4314.50');
  t.diagnostic(JSON.stringify({
    node: process.version, playwrightVersion, helperSha256, helperPublishedCommit: '53c0c0d',
    signatureStatus: signature.status
  }));
  const session = await openIsolatedLesson(path.join('learning', 'S036', 'index.html'));
  const { page } = session;
  const browser = page.context().browser();
  const httpAttempts = [];
  const pageErrors = [];
  const consoleErrors = [];
  const observations = [];
  const metrics = () => page.locator('#result').evaluate((element) => Object.fromEntries(
    [...element.querySelectorAll('dt')].map((term) => [term.textContent, term.nextElementSibling.textContent])
  ));
  const resultStatus = () => page.locator('#result').getAttribute('data-status');
  const historyCount = () => page.locator('#history > li').count();
  const reset = () => page.locator('#reset-current').click();
  const tabTo = async (id) => {
    for (let count = 0; count < 18; count += 1) {
      if (await page.evaluate((target) => document.activeElement?.id === target, id)) return;
      await page.keyboard.press('Tab');
    }
    assert.fail(`${id} is not keyboard reachable.`);
  };
  const runUI = async (config = {}) => {
    for (const [id, value] of Object.entries(config)) await page.locator(`#${id}`).selectOption(value);
    await page.locator('#load-form').click();
    await page.locator('#cut-over').click();
    await page.locator('#submit-form').click();
    observations.push({
      config, result: await page.locator('#result').innerText(),
      trace: await page.locator('#trace').allTextContents(), metrics: await metrics()
    });
  };
  try {
    assert.equal(session.browserVersion, '156.0.4314.50');
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.context().route(/^https?:/, (route) => {
      httpAttempts.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    await page.addInitScript(() => {
      globalThis.__s036Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s036Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
    });
    await page.reload({ waitUntil: 'load' });

    await t.test('file lesson loads with exact banner, unmeasured result and callable native reset', async () => {
      assert.match(await page.title(), /S036.*Existing form submission/);
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('.banner').isVisible(), true);
      assert.equal(await resultStatus(), 'unmeasured');
      assert.equal(await historyCount(), 0);
      assert.equal(await page.locator('#submit-form').isDisabled(), true);
      assert.equal(await page.locator('#cut-over').isDisabled(), true);
      assert.equal(await page.locator('form').evaluate((element) => typeof element.reset), 'function');
      assert.match(await page.locator('main').innerText(), /not cryptographic material/);
    });

    await t.test('native Tab, arrows and Enter conduct a compatible old-form acceptance', async () => {
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip').evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('main').evaluate((element) => element === document.activeElement), true);
      await tabTo('configuration');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#configuration').inputValue(), 'retired-key');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#configuration').inputValue(), 'compatible');
      await tabTo('load-form');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#configuration').isDisabled(), true);
      assert.equal(await page.locator('#trace > li').count(), 1);
      await tabTo('cut-over');
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#trace').innerText(), /Route v1 -> v2/);
      assert.equal(await page.locator('#trace > li').count(), 2);
      await tabTo('submit-form');
      await page.keyboard.press('Enter');
      assert.equal(await resultStatus(), 'success');
      assert.match(await page.locator('#result').innerText(), /Submission: ACCEPTED/);
      assert.match(await page.locator('#result').innerText(), /continuity: preserved/);
      assert.deepEqual(await metrics(), { 'Synthetic accepted': '1', 'Synthetic rejected': '0', 'Synthetic unknown': '0', 'Synthetic effects': '1' });
      assert.equal(await historyCount(), 1);
    });

    await t.test('a DOM-enabled duplicate submit rejects without changing result, history or effects', async () => {
      const before = await page.locator('#history').innerText();
      await page.locator('#submit-form').evaluate((element) => { element.disabled = false; });
      await page.locator('#submit-form').click();
      assert.match(await page.locator('#error').innerText(), /requires phase cutover/);
      assert.equal(await page.locator('#error').evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.locator('#history').innerText(), before);
      assert.equal(await resultStatus(), 'success');
      assert.equal((await metrics())['Synthetic effects'], '1');
    });

    await t.test('keyboard reset restores defaults and focus while retaining completed history', async () => {
      await tabTo('reset-current');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.equal(await page.locator('#configuration').inputValue(), 'compatible');
      assert.equal(await page.locator('#token').inputValue(), 'valid-prior');
      assert.equal(await page.locator('#observation').inputValue(), 'observed');
      assert.equal(await page.locator('#configuration').evaluate((element) => element === document.activeElement), true);
      assert.equal(await historyCount(), 1);
      assert.equal(await page.locator('#trace > li').count(), 0);
      assert.equal(await resultStatus(), 'unmeasured');
    });

    await t.test('retiring the old key interrupts a valid old form; no validation bypass is offered', async () => {
      await runUI({ configuration: 'retired-key' });
      assert.equal(await resultStatus(), 'failure');
      assert.match(await page.locator('#result').innerText(), /Submission: REJECTED/);
      assert.match(await page.locator('#result').innerText(), /oldKeyReadable: FAIL/);
      assert.match(await page.locator('#result').innerText(), /valid prior form was interrupted/);
      assert.equal((await metrics())['Synthetic effects'], '0');
      await reset();
    });

    await t.test('a changed application boundary also rejects valid prior tokens', async () => {
      await runUI({ configuration: 'changed-application' });
      assert.equal(await resultStatus(), 'failure');
      assert.match(await page.locator('#result').innerText(), /application: FAIL/);
      assert.match(await page.locator('#result').innerText(), /oldKeyReadable: PASS/);
      await reset();
    });

    await t.test('compatible validation still rejects forged request tokens, not a continuity success', async () => {
      await runUI({ token: 'forged' });
      assert.equal(await resultStatus(), 'success');
      assert.match(await page.locator('#result').innerText(), /Submission: REJECTED/);
      assert.match(await page.locator('#result').innerText(), /requestIntegrity: FAIL/);
      assert.match(await page.locator('#result').innerText(), /continuity was NOT TESTED/);
      assert.equal((await metrics())['Synthetic effects'], '0');
      await reset();
    });

    await t.test('missing observations remain unknown, including acceptance, rejection and effects', async () => {
      await runUI({ observation: 'missing' });
      assert.equal(await resultStatus(), 'unknown');
      assert.deepEqual(await metrics(), { 'Synthetic accepted': 'UNKNOWN', 'Synthetic rejected': 'UNKNOWN', 'Synthetic unknown': '1', 'Synthetic effects': 'UNKNOWN' });
      assert.match(await page.locator('#result').innerText(), /oldKeyReadable: UNKNOWN/);
      assert.match(await page.locator('#result').innerText(), /Synthetic HTTP: UNKNOWN/);
      await reset();
    });

    await t.test('missing cookie rejects; six histories retain earlier failures and unknown at the bound', async () => {
      await runUI({ token: 'missing-cookie' });
      assert.match(await page.locator('#result').innerText(), /cookieBinding: FAIL/);
      assert.equal(await historyCount(), 6);
      await reset();
      const history = await page.locator('#history').innerText();
      assert.match(history, /Run 2: FAILURE/);
      assert.match(history, /Run 5: UNKNOWN/);
      assert.equal(await page.locator('#load-form').isDisabled(), true);
      await page.locator('#load-form').evaluate((element) => { element.disabled = false; });
      await page.locator('#load-form').click();
      assert.match(await page.locator('#error').innerText(), /Six completed/);
      assert.equal(await page.locator('#history').innerText(), history);
      assert.match(await page.locator('#status').innerText(), /Limit reached/);
    });

    await t.test('reload clears page memory and foreign pairing remains rejected in a fresh rehearsal', async () => {
      await page.reload({ waitUntil: 'load' });
      assert.equal(await historyCount(), 0);
      assert.equal(await resultStatus(), 'unmeasured');
      await runUI({ token: 'foreign-pair' });
      assert.match(await page.locator('#result').innerText(), /Submission: REJECTED/);
      assert.match(await page.locator('#result').innerText(), /requestIntegrity: PASS/);
      assert.match(await page.locator('#result').innerText(), /cookieBinding: FAIL/);
      assert.equal((await metrics())['Synthetic effects'], '0');
      await reset();
    });

    await t.test('tampered input and early submission produce focused errors without erasing history', async () => {
      const before = await page.locator('#history').innerText();
      await page.locator('#configuration').evaluate((element) => { element.value = 'not-an-option'; });
      await page.locator('#load-form').click();
      assert.match(await page.locator('#error').innerText(), /Invalid configuration/);
      assert.equal(await page.locator('#error').evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.locator('#history').innerText(), before);
      await reset();
      await page.locator('#load-form').click();
      await page.locator('#submit-form').evaluate((element) => { element.disabled = false; });
      await page.locator('#submit-form').click();
      assert.match(await page.locator('#error').innerText(), /requires phase cutover/);
      assert.equal(await page.locator('#trace > li').count(), 1);
      assert.equal(await page.locator('#history').innerText(), before);
      await reset();
      assert.equal(await page.locator('#trace > li').count(), 0);
      assert.equal(await page.locator('#history').innerText(), before);
      assert.equal(await resultStatus(), 'unmeasured');
    });

    await t.test('retained details and trace remain keyboard accessible without narrow-viewport overflow', async () => {
      await page.setViewportSize({ width: 360, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#history summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history details').getAttribute('open'), '');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#history details').getAttribute('open'), null);
      await page.locator('#trace').focus();
      assert.equal(await page.locator('#trace').evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.locator('#trace').evaluate((element) => getComputedStyle(element).outlineStyle), 'solid');
      await page.keyboard.press('ArrowDown');
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(await page.evaluate(() => globalThis.__s036Violations), []);
      assert.deepEqual(httpAttempts, []);
    });

    await t.test('real CSP blocks inline code, handlers, styles, connections, form, base and blob worker', async () => {
      const originalURL = page.url();
      await page.evaluate(async () => {
        globalThis.__s036InlineExecuted = false;
        globalThis.__s036HandlerExecuted = false;
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s036InlineExecuted = true;';
        document.head.append(script);
        const button = document.createElement('button');
        button.setAttribute('onclick', 'globalThis.__s036HandlerExecuted = true;');
        document.body.append(button);
        button.click();
        const style = document.createElement('style');
        style.textContent = 'body { --s036-forbidden-style: applied; }';
        document.head.append(style);
        await fetch('https://example.invalid/s036-connect').catch(() => {});
        const probeForm = document.createElement('form');
        probeForm.action = 'https://example.invalid/s036-form';
        document.body.append(probeForm);
        HTMLFormElement.prototype.submit.call(probeForm);
        const base = document.createElement('base');
        base.href = 'https://example.invalid/';
        document.head.append(base);
        const workerURL = URL.createObjectURL(new Blob(['self.postMessage("synthetic");'], { type: 'text/javascript' }));
        try {
          const worker = new Worker(workerURL);
          worker.terminate();
        } catch {}
        URL.revokeObjectURL(workerURL);
        for (const element of [script, button, style, probeForm, base]) element.remove();
      });
      const expectedDirectives = ['script-src-elem', 'script-src-attr', 'style-src-elem', 'connect-src', 'form-action', 'base-uri', 'worker-src'];
      await page.waitForFunction((directives) => directives.every((directive) =>
        globalThis.__s036Violations.some((violation) => violation.directive === directive)), expectedDirectives);
      assert.equal(await page.evaluate(() => globalThis.__s036InlineExecuted), false);
      assert.equal(await page.evaluate(() => globalThis.__s036HandlerExecuted), false);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--s036-forbidden-style')), '');
      assert.equal(page.url(), originalURL);
      assert.deepEqual(httpAttempts, [], 'CSP must block before the additional HTTP route guard.');
      assert.deepEqual(pageErrors, []);
      t.diagnostic(JSON.stringify({
        browserVersion: session.browserVersion, observations,
        cspViolations: await page.evaluate(() => globalThis.__s036Violations),
        externalRequestsReachingGuard: httpAttempts.length, pageErrors,
        expectedCspConsoleErrors: consoleErrors.length,
        realUserImpact: 'UNMEASURED; all observations are the synthetic fixture'
      }));
    });
  } finally {
    await session.close();
    const cleanup = { pageClosed: page.isClosed(), browserDisconnected: !browser.isConnected() };
    t.diagnostic(JSON.stringify({ cleanup, helperLifecyclePrototypeUsed: false }));
    assert.deepEqual(cleanup, { pageClosed: true, browserDisconnected: true });
  }
});
