'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const toolingRoot = path.join(root, 'testing', 'browser');
const { openIsolatedLesson } = require(path.join(toolingRoot, 'isolated.cjs'));
const playwright = require(path.join(toolingRoot, 'node_modules', 'playwright', 'package.json'));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = (file) => hash(fs.readFileSync(file));

function signedEdge() {
  const command = [
    "$ErrorActionPreference='Stop'",
    "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'",
    '$s=Get-AuthenticodeSignature -LiteralPath $p',
    '@{path=$p;status=[string]$s.Status;signer=$s.SignerCertificate.Subject;productVersion=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress'
  ].join('; ');
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 30000
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const signature = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.match(signature.productVersion, /^156\./);
  return signature;
}

test('real isolated Edge conducts S017 continuity/cost comparison and guarded recovery', { timeout: 220000 }, async (t) => {
  const report = {
    cardId: 'A-S017', workerId: 'worker-A-S017', kano: 'S', kanoUnit: 'A-S017', packet: 'SC-S017',
    mode: 'actual-real-headless-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), node: process.version, playwright: playwright.version,
    helper: 'testing\\browser\\isolated.cjs', helperCommit: '53c0c0d',
    helperSha256: sha(path.join(toolingRoot, 'isolated.cjs')),
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'model.js', 'app.js', 'manifest.json', 'browser.test.cjs']
      .map((name) => [name, sha(path.join(__dirname, name))])),
    cases: [], pageErrors: [], consoleErrors: [], externalCompleted: [], interceptedProbeRequests: [],
    closeAwaited: false, nativeProof: false, productionNode24Validated: false, parentComplete: false, status: 'running'
  };
  let session;
  let currentCase = 'initial load';
  let cspProbe = false;
  try {
    assert.match(process.version, /^v22\./);
    assert.equal(playwright.version, '1.56.1');
    assert.equal(report.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    const published = execFileSync('git', ['show', '53c0c0d:testing/browser/isolated.cjs'], { cwd: root });
    const checkoutLF = fs.readFileSync(path.join(toolingRoot, 'isolated.cjs'), 'utf8').replace(/\r\n/g, '\n');
    report.publishedHelperBlobSha256 = hash(published);
    assert.equal(report.publishedHelperBlobSha256, hash(checkoutLF));
    report.signedBrowser = signedEdge();
    session = await openIsolatedLesson('learning\\S017\\index.html');
    report.browserVersion = session.browserVersion;
    assert.equal(report.browserVersion, report.signedBrowser.productVersion);
    const { page } = session;
    page.on('pageerror', (error) => report.pageErrors.push({ case: currentCase, message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push({ case: currentCase, expectedCspProbe: cspProbe, message: message.text() });
    });
    page.on('requestfinished', (request) => {
      if (!request.url().startsWith('file:')) report.externalCompleted.push(request.url());
    });
    await page.route('https://s017.invalid/**', async (route) => {
      report.interceptedProbeRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const read = async () => JSON.parse(await page.locator('#run-evidence').textContent());
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const fresh = async () => {
      await page.reload({ waitUntil: 'load' });
      assert.equal((await read()).effectiveVerdict, 'NOT_RUN');
    };
    const tick = async (observation = 'healthy') => {
      await page.locator('#observation').selectOption(observation);
      await press('advance-window');
    };
    const parallel = async (demand = '4') => {
      await page.locator('#demand').fill(demand);
      await press('prepare-replacement', 'Space');
      await tick();
      await tick();
      await press('handoff-replacement');
      await tick();
    };
    const scenario = async (name, action) => {
      currentCase = name;
      await t.test(name, async () => {
        const startedAtUtc = new Date().toISOString();
        try {
          const observation = await action();
          report.cases.push({ name, status: 'PASS', startedAtUtc, finishedAtUtc: new Date().toISOString(), observation });
        } catch (error) {
          report.cases.push({ name, status: 'FAIL', startedAtUtc, finishedAtUtc: new Date().toISOString(), error: error.message });
          throw error;
        }
      });
    };

    await scenario('exact banner, native labels, file-only page and initial guards', async () => {
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(page.url(), /^file:/);
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      assert.equal(await page.locator('#handoff-replacement').isDisabled(), true);
      assert.equal(await page.getByLabel('Journeys per five-second window (whole number 1–8)').count(), 1);
      assert.equal(await page.evaluate(() => typeof document.querySelector('form').reset), 'function');
      return { verdict: (await read()).effectiveVerdict, nativeResetCallable: true };
    });
    await scenario('real Tab, Enter and Space conduct an interrupted in-place resize', async () => {
      await page.locator('#demand').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'apply-demand');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start-in-place');
      await page.keyboard.press('Space');
      await tick();
      await tick();
      await tick();
      const run = await read();
      assert.equal(run.state.phase, 'ACTIVE');
      assert.equal(run.summary.verification, 'FAIL');
      assert.equal(run.summary.attempted, 12);
      assert.equal(run.summary.successful, 8);
      assert.equal(run.summary.interrupted, 4);
      assert.equal(run.summary.costCredits, 6);
      assert.equal(await page.locator('#window-trace tr').count(), 3);
      return run.summary;
    });
    await scenario('keyboard reset restores defaults and archives the failed run', async () => {
      await press('reset-rehearsal', 'Space');
      const run = await read();
      assert.equal(run.effectiveVerdict, 'NOT_RUN');
      assert.equal(run.archives.length, 1);
      assert.equal(run.archives[0].summary.interrupted, 4);
      assert.equal(await page.locator('#demand').inputValue(), '4');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'demand');
      assert.equal(await page.evaluate(() => typeof document.querySelector('form').reset), 'function');
      return { archives: run.archives.length, previous: run.archives[0].summary };
    });
    await scenario('fresh observed readiness precedes handoff; READY is not migration', async () => {
      await press('prepare-replacement');
      assert.equal(await page.locator('#handoff-replacement').isDisabled(), true);
      await tick();
      assert.equal(await page.locator('#handoff-replacement').isDisabled(), true);
      await tick();
      let run = await read();
      assert.equal(run.state.phase, 'READY');
      assert.equal(run.state.route, 'old');
      assert.equal(run.summary.observedReadyCapacity, 8);
      assert.equal(run.effectiveVerdict, 'INCOMPLETE');
      await press('handoff-replacement', 'Space');
      run = await read();
      assert.equal(run.effectiveVerdict, 'INCOMPLETE');
      assert.equal(run.state.handedOffAt, 10);
      await tick();
      run = await read();
      assert.equal(run.effectiveVerdict, 'PASS');
      assert.equal(run.summary.targetSuccessful, 4);
      assert.equal(run.summary.successful, 12);
      assert.equal(run.summary.costCredits, 9);
      assert.equal(run.archives[0].summary.costCredits, 6);
      assert.equal(await page.locator('#comparison-history tr').count(), 2);
      return { replacement: run.summary, retainedInPlace: run.archives[0].summary };
    });
    await scenario('blank, exponent, fraction and out-of-range UI inputs retain refusals', async () => {
      await fresh();
      for (const demand of ['', '1e0', '2.5', '9']) {
        await page.locator('#demand').fill(demand);
        await press('apply-demand');
        const run = await read();
        assert.equal(run.state.lastRejection.code, 'INVALID');
        assert.equal(run.state.demand, 4);
        assert.equal(run.summary.costCredits, 0);
        assert.equal(run.state.windows.length, 0);
      }
      await press('prepare-replacement');
      assert.equal((await read()).state.phase, 'IDLE', 'Start revalidates the visible field rather than using stale applied demand');
      await press('reset-rehearsal');
      const run = await read();
      assert.equal(run.archives[0].state.events.filter((event) => !event.accepted).length, 5);
      return { retainedRefusals: 5, restoredDemand: run.state.demand };
    });
    await scenario('old-capacity overload remains FAIL after target success', async () => {
      await fresh();
      await parallel('6');
      const run = await read();
      assert.equal(run.state.demand, 6);
      assert.equal(run.summary.interrupted, 4);
      assert.equal(run.summary.successful, 14);
      assert.equal(run.summary.targetSuccessful, 6);
      assert.equal(run.effectiveVerdict, 'FAIL');
      return run.summary;
    });
    await scenario('failed candidate safely aborts without exposing users', async () => {
      await fresh();
      await press('prepare-replacement');
      await tick('target-failure');
      const run = await read();
      assert.equal(run.state.phase, 'ABORTED');
      assert.equal(run.state.route, 'old');
      assert.equal(run.summary.userImpact, 'safe-abort-before-exposure');
      assert.equal(run.summary.interrupted, 0);
      assert.equal(run.effectiveVerdict, 'FAIL');
      assert.equal(await page.locator('#handoff-replacement').isDisabled(), true);
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      return run.summary;
    });
    await scenario('missing data remains UNKNOWN through healthy recovery and reset', async () => {
      await fresh();
      await press('prepare-replacement');
      await tick('missing');
      let run = await read();
      assert.equal(run.summary.effectiveServingCapacity, null);
      assert.equal(run.summary.observedReadyCapacity, null);
      assert.equal(run.summary.unknown, 4);
      assert.equal(run.state.warmupProgress, 0);
      assert.equal(await page.locator('#serving-capacity').textContent(), 'UNKNOWN');
      assert.equal(await page.locator('#handoff-replacement').isDisabled(), true);
      await tick();
      await tick();
      await press('handoff-replacement');
      await tick();
      run = await read();
      assert.equal(run.effectiveVerdict, 'UNKNOWN');
      assert.equal(run.summary.unknown, 4);
      assert.equal(run.summary.targetSuccessful, 4);
      await press('reset-rehearsal', 'Space');
      assert.equal((await read()).archives[0].summary.unknown, 4);
      return run.summary;
    });
    await scenario('a missing refresh removes READY and disables handoff until observed again', async () => {
      await fresh();
      await press('prepare-replacement');
      await tick();
      await tick();
      await tick('missing');
      assert.equal((await read()).state.phase, 'WARMING');
      assert.equal(await page.locator('#handoff-replacement').isDisabled(), true);
      await tick();
      assert.equal((await read()).state.phase, 'READY');
      assert.equal(await page.locator('#handoff-replacement').isEnabled(), true);
      return { readyAfterRecovery: true, retainedUnknown: (await read()).summary.unknown };
    });
    await scenario('failure after handoff is an interrupted transition, never a safe abort', async () => {
      await fresh();
      await press('prepare-replacement');
      await tick();
      await tick();
      await press('handoff-replacement');
      await tick('target-failure');
      const run = await read();
      assert.equal(run.state.phase, 'FAILED');
      assert.equal(run.summary.interrupted, 4);
      assert.equal(run.summary.userImpact, 'interrupted');
      assert.equal(run.effectiveVerdict, 'FAIL');
      return run.summary;
    });
    await scenario('model refuses forged states and accessor commands in the real browser', async () => {
      const guard = await page.evaluate(() => {
        const model = window.S017Model;
        const original = model.initial();
        let getterRan = false;
        const accessor = { get type() { getterRan = true; return 'prepare'; } };
        const refused = model.reduce(original, accessor);
        let forgedRejected = false;
        try { model.reduce({ ...original }, { type: 'prepare' }); } catch { forgedRejected = true; }
        return { getterRan, forgedRejected, refusal: refused.lastRejection.code,
          stateFrozen: Object.isFrozen(original), unchangedWindows: refused.windows.length };
      });
      assert.deepEqual(guard, { getterRan: false, forgedRejected: true, refusal: 'INVALID', stateFrozen: true, unchangedWindows: 0 });
      return guard;
    });
    await scenario('unknown select values and forced lifecycle events cannot change execution', async () => {
      await fresh();
      await press('prepare-replacement');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'unrecognized';
        option.textContent = 'Invalid test fixture';
        document.querySelector('#observation').append(option);
        document.querySelector('#observation').value = option.value;
      });
      await press('advance-window');
      let run = await read();
      assert.equal(run.state.lastRejection.code, 'INVALID');
      assert.equal(run.summary.attempted, 0);
      await page.evaluate(() => document.querySelector('#handoff-replacement').dispatchEvent(new MouseEvent('click')));
      run = await read();
      assert.equal(run.state.lastRejection.code, 'BLOCKED');
      assert.equal(run.state.route, 'old');
      assert.equal(run.state.windows.length, 0);
      return { retainedRefusals: run.state.events.filter((event) => !event.accepted).length };
    });
    await scenario('unexpected runtime error replaces stale PASS and reset archives it', async () => {
      await fresh();
      await parallel();
      assert.equal((await read()).effectiveVerdict, 'PASS');
      await page.evaluate(() => {
        window.__savedS017Reduce = window.S017Model.reduce;
        window.S017Model.reduce = () => { throw new Error('Deliberate S017 browser error-path fixture'); };
      });
      await press('advance-window');
      let run = await read();
      assert.equal(run.effectiveVerdict, 'ERROR');
      assert.equal(run.summaryIsLastKnown, true);
      assert.equal(await page.locator('#verification').textContent(), 'ERROR');
      assert.equal(await page.locator('#comparison-history tr').last().locator('td').last().textContent(), 'ERROR');
      assert.equal(await page.locator('#prepare-replacement').isDisabled(), true);
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      assert.equal(await page.locator('#reset-rehearsal').isEnabled(), true);
      await page.evaluate(() => { window.S017Model.reduce = window.__savedS017Reduce; delete window.__savedS017Reduce; });
      await press('reset-rehearsal', 'Space');
      run = await read();
      assert.equal(run.effectiveVerdict, 'NOT_RUN');
      assert.equal(run.archives[0].effectiveVerdict, 'ERROR');
      assert.match(run.archives[0].uiError.message, /Deliberate S017/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'demand');
      return { archivedError: run.archives[0].uiError, recovered: true };
    });
    await scenario('window, command and archive bounds preserve all retained proof', async () => {
      await fresh();
      await press('start-in-place');
      for (let index = 0; index < 12; index += 1) await tick();
      await tick();
      let run = await read();
      assert.equal(run.state.windows.length, 12);
      assert.equal(run.state.locked, true);
      assert.equal(run.state.lastRejection.code, 'LIMIT');
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      await press('reset-rehearsal');
      for (let index = 0; index < 40; index += 1) {
        await page.evaluate(() => document.querySelector('#handoff-replacement').dispatchEvent(new MouseEvent('click')));
      }
      run = await read();
      assert.equal(run.state.events.length, 40);
      assert.equal(run.state.locked, true);
      await press('reset-rehearsal');
      for (let index = 0; index < 2; index += 1) {
        await press('start-in-place');
        await tick();
        await press('reset-rehearsal');
      }
      run = await read();
      assert.equal(run.archives.length, 4);
      assert.equal(run.archives[0].state.windows.length, 12);
      assert.equal(run.archives[1].state.events.length, 40);
      assert.equal(await page.locator('#reset-rehearsal').isDisabled(), true);
      await page.evaluate(() => document.querySelector('#reset-rehearsal').dispatchEvent(new MouseEvent('click')));
      run = await read();
      assert.equal(run.archives.length, 4);
      assert.equal(run.archiveLimitRefused, true);
      return { archiveCount: 4, retainedWindowCount: 12, retainedCommandCount: 40, noPruning: true };
    });
    await scenario('actual CSP blocks inline code, handlers, styles, connections and forms', async () => {
      await fresh();
      cspProbe = true;
      await page.evaluate(async () => {
        window.__s017Csp = [];
        document.addEventListener('securitypolicyviolation', (event) => window.__s017Csp.push({
          directive: event.effectiveDirective, blockedURI: event.blockedURI
        }));
        const script = document.createElement('script');
        script.textContent = 'window.__s017InlineRan = true';
        document.body.append(script);
        const button = document.createElement('button');
        button.setAttribute('onclick', 'window.__s017HandlerRan = true');
        document.body.append(button);
        button.click();
        button.remove();
        const style = document.createElement('style');
        style.textContent = 'body { --s017-inline-style: forbidden; }';
        document.head.append(style);
        await fetch('https://s017.invalid/probe').catch(() => {});
        const probeForm = document.createElement('form');
        probeForm.action = 'https://s017.invalid/form-probe';
        document.body.append(probeForm);
        HTMLFormElement.prototype.submit.call(probeForm);
        probeForm.remove();
      });
      await page.waitForFunction(() => window.__s017Csp.length >= 5);
      const probe = await page.evaluate(() => ({
        inlineRan: window.__s017InlineRan === true, handlerRan: window.__s017HandlerRan === true,
        inlineStyle: getComputedStyle(document.body).getPropertyValue('--s017-inline-style'),
        violations: window.__s017Csp
      }));
      assert.equal(probe.inlineRan, false);
      assert.equal(probe.handlerRan, false);
      assert.equal(probe.inlineStyle, '');
      for (const directive of ['script-src-elem', 'script-src-attr', 'style-src-elem', 'connect-src', 'form-action']) {
        assert.ok(probe.violations.some((entry) => entry.directive === directive), directive);
      }
      assert.equal(report.interceptedProbeRequests.length, 0, 'CSP must block probes before the network backstop is used');
      assert.equal(report.externalCompleted.length, 0);
      assert.equal((await read()).effectiveVerdict, 'NOT_RUN');
      return probe;
    });
    await scenario('no unexpected browser errors or completed external requests', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.consoleErrors.filter((entry) => !entry.expectedCspProbe), []);
      assert.deepEqual(report.externalCompleted, []);
      return { pageErrors: 0, unexpectedConsoleErrors: 0, externalCompleted: 0 };
    });
    report.status = report.cases.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL';
  } catch (error) {
    report.status = 'FAIL';
    report.failure = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        report.closeAwaited = true;
      }
    } catch (error) {
      report.status = 'FAIL';
      report.cleanupFailure = error.message;
      throw error;
    } finally {
      report.finishedAtUtc = new Date().toISOString();
      if (capture) {
        const directory = path.join(__dirname, 'evidence');
        fs.mkdirSync(directory, { recursive: true });
        let number = 1;
        while (fs.existsSync(path.join(directory, `browser-${number}-observations.json`))) number += 1;
        fs.writeFileSync(path.join(directory, `browser-${number}-observations.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
