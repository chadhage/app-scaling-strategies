'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const toolingRoot = path.join(root, 'testing', 'browser');
const { openIsolatedLesson } = require(path.join(toolingRoot, 'isolated.cjs'));
const playwright = require(path.join(toolingRoot, 'node_modules', 'playwright', 'package.json'));
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

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

test('real isolated offline Edge conducts the canonical CPU/memory strategy and its failure paths', { timeout: 210000 }, async (t) => {
  assert.match(process.version, /^v22\./);
  assert.equal(playwright.version, '1.56.1');
  const report = {
    cardId: 'A-S012', workerId: 'worker-A-S012', kano: 'S', kanoUnit: 'A-S012', packet: 'SC-S012',
    mode: 'actual-real-headless-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), node: process.version, playwright: playwright.version,
    signedBrowser: signedEdge(), helper: 'testing\\browser\\isolated.cjs',
    helperSha256: sha(path.join(toolingRoot, 'isolated.cjs')),
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'model.js', 'app.js', 'manifest.json', 'browser.test.cjs']
      .map((name) => [name, sha(path.join(__dirname, name))])),
    cases: [], pageErrors: [], externalCompleted: [], closeAwaited: false,
    nativeProof: false, productionNode24Validated: false, parentComplete: false, status: 'running'
  };
  let session;
  try {
    session = await openIsolatedLesson('learning\\S012\\index.html');
    const { page } = session;
    report.browserVersion = session.browserVersion;
    assert.equal(report.browserVersion, report.signedBrowser.productVersion);
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('requestfinished', (request) => {
      if (!request.url().startsWith('file:')) report.externalCompleted.push(request.url());
    });
    const read = async () => JSON.parse(await page.locator('#run-evidence').textContent());
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const advance = async (windows = 1) => {
      for (let count = 0; count < windows; count += 1) await press('advance-window');
    };
    const observe = () => press('observe-journeys');
    const reset = () => press('restart-rehearsal', 'Space');
    const apply = async (values = {}) => {
      for (const [id, value] of Object.entries(values)) {
        const element = page.locator(`#${id}`);
        if (['rule-profile', 'observation-condition'].includes(id)) await element.selectOption(value);
        else await element.fill(value);
      }
      await press('apply-inputs');
    };
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
            ready: await page.locator('#ready-value').textContent(),
            rule: await page.locator('#rule-decision').textContent(),
            userVerdict: await page.locator('#user-verdict').textContent(),
            alertVisible: await page.locator('#input-error').isVisible(),
            metricRows: await page.locator('#metric-rows tr').count(),
            journeyRows: await page.locator('#journey-rows tr').count()
          };
          report.cases.push(record);
        }
      });
    };

    await conduct('exact canonical title/banner, labeled controls, callable native reset, zero-sample honesty', async () => {
      assert.equal(await page.title(), 'S012 — CPU/memory-driven scale-out');
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Aggregate CPU demand (0–1200 units)').count(), 1);
      assert.equal(await page.getByLabel('Aggregate memory demand (0–1200 units)').count(), 1);
      assert.equal(await page.locator('form').evaluateAll((forms) => forms.every((form) => typeof form.reset === 'function')), true);
      assert.equal((await read()).summary.users.attempts, 0);
      assert.equal(await page.locator('#verdict').textContent(), 'NOT_RUN');
      assert.equal(await page.locator('#input-error').isVisible(), false);
      assert.equal(await page.locator('noscript').isVisible(), false);
    });

    await conduct('keyboard-only transition: baseline, threshold, warm-up, effective capacity, post-scale samples', async () => {
      await page.locator('#cpu-demand').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#memory-demand').evaluate((element) => element === document.activeElement), true);
      const focus = await page.locator('#memory-demand').evaluate((element) => ({
        width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle
      }));
      assert.equal(focus.width, '3px');
      assert.equal(focus.style, 'solid');
      await observe();
      await advance(2);
      let evidence = await read();
      assert.equal(evidence.summary.capacity.requested, 3);
      assert.equal(evidence.summary.capacity.effectiveReady, 2);
      assert.equal(await page.locator('#rule-decision').textContent(), 'SCALE_OUT_REQUESTED');
      await observe();
      await advance(2);
      assert.equal(await page.locator('#ready-value').textContent(), '3');
      await observe();
      evidence = await read();
      assert.equal(evidence.summary.verification.verdict, 'PASS');
      assert.equal(evidence.summary.users.uninterrupted, 30);
      assert.ok(evidence.summary.transition.addedInstanceSamples > 0);
      assert.equal(evidence.state.observations.at(-1).cpuPct, 46.67);
      assert.equal(await page.locator('#journey-rows tr').count(), 30);
      assert.equal(await page.locator('#observe-journeys').evaluate((element) => element === document.activeElement), true);
    });

    await conduct('memory-only trigger changes capacity but never invents successful users', async () => {
      await apply({ 'cpu-demand': '40', 'memory-demand': '150' });
      await advance(4);
      const evidence = await read();
      assert.deepEqual(evidence.state.transitions[0].triggerMetrics, ['memory']);
      assert.equal(evidence.state.observations.at(-1).memoryPct, 50);
      assert.equal(evidence.summary.capacity.effectiveReady, 3);
      assert.equal(evidence.summary.users.verdict, 'NOT_OBSERVED');
      assert.equal(evidence.summary.verification.verdict, 'INCOMPLETE');
      assert.equal(await page.locator('#journey-rows tr').count(), 0);
    });

    await conduct('keyboard reset restores defaults and archives interrupted observations without native reset shadowing', async () => {
      await apply({ 'cpu-demand': '260', 'offered-load': '260' });
      await observe();
      const original = (await read()).state;
      await reset();
      const evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, 2);
      assert.equal(evidence.state.events.length, 0);
      assert.equal(evidence.summary.users.attempts, 0);
      assert.equal(evidence.archives.length, 1);
      assert.deepEqual(evidence.archives[0].state, original);
      assert.equal(evidence.archives[0].summary.users.interrupted, 10);
      assert.equal(await page.locator('#cpu-demand').inputValue(), '140');
      assert.equal(await page.locator('#offered-load').inputValue(), '120');
      assert.equal(await page.locator('#rule-profile').inputValue(), 'metric-rule');
      assert.equal(await page.locator('#observation-condition').inputValue(), 'none');
      assert.equal(await page.locator('#input-error').isVisible(), false);
      await page.locator('#archived-runs summary').click();
      assert.match(await page.locator('#archive-list').textContent(), /10 interrupted/);
    });

    await conduct('blank, fractional, and tampered unknown inputs are visible INVALID with no fabricated work', async () => {
      for (const value of ['', '12.5', '1201']) {
        await apply({ 'cpu-demand': value });
        const evidence = await read();
        assert.equal(evidence.state.lastResult.verdict, 'INVALID');
        assert.equal(evidence.state.observations.length, 0);
        assert.equal(evidence.summary.users.attempts, 0);
        assert.equal(await page.getByRole('alert').isVisible(), true);
        assert.equal(await page.locator('#verdict').textContent(), 'INVALID');
      }
      await page.locator('#rule-profile').evaluate((element) => {
        const option = document.createElement('option');
        option.value = 'invented';
        option.textContent = 'Unknown profile';
        element.append(option);
        element.value = 'invented';
      });
      await apply({ 'cpu-demand': '140' });
      assert.equal((await read()).state.lastResult.verdict, 'INVALID');
      assert.equal((await read()).state.capacity.requested, 2);
      await reset();
      assert.equal(await page.getByRole('alert').isVisible(), false);
    });

    for (const [profile, expected] of [['http-slot-unsupported', 'UNSUPPORTED'], ['unverified-rule', 'UNKNOWN']]) {
      await conduct(`${profile}: rejected support is not native evidence or client success`, async () => {
        await apply({ 'rule-profile': profile });
        await advance();
        await observe();
        const evidence = await read();
        assert.equal(evidence.state.lastResult.verdict, expected);
        assert.equal(evidence.summary.verification.verdict, expected);
        assert.equal(evidence.state.observations.length, 0);
        assert.equal(evidence.state.journeys.length, 0);
        assert.equal(evidence.state.capacity.confirmedReady, 2);
        assert.equal(await page.getByRole('alert').isVisible(), true);
      });
    }

    await conduct('missing metric windows stay UNKNOWN while separately observed clients may pass', async () => {
      await advance();
      await apply({ 'observation-condition': 'metrics-unknown' });
      await advance();
      await observe();
      const evidence = await read();
      assert.equal(evidence.state.breachStreak, 0);
      assert.equal(evidence.state.observations.at(-1).cpuPct, null);
      assert.match(await page.locator('#metric-values').textContent(), /UNKNOWN/);
      assert.equal(evidence.summary.users.uninterrupted, 10);
      assert.equal(evidence.summary.verification.verdict, 'UNKNOWN');
    });

    await conduct('unknown effective capacity pauses readiness and cannot yield successful routing samples', async () => {
      await advance(2);
      await apply({ 'observation-condition': 'capacity-unknown' });
      await advance(3);
      await observe();
      let evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, null);
      assert.equal(evidence.state.capacity.confirmedReady, 2);
      assert.equal(evidence.state.transitions[0].status, 'WARMING');
      assert.equal(evidence.summary.users.unknown, 10);
      assert.equal(evidence.summary.users.uninterrupted, 0);
      assert.equal(await page.locator('#ready-value').textContent(), 'UNKNOWN');
      await apply({ 'observation-condition': 'none' });
      await advance(2);
      evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, 3);
      assert.equal(evidence.summary.verification.verdict, 'UNKNOWN');
    });

    await conduct('provisioning failure and later recovery retain a failed transition without inventing user interruptions', async () => {
      await apply({ 'observation-condition': 'provision-failure' });
      await advance(3);
      await observe();
      let evidence = await read();
      assert.equal(evidence.state.transitions[0].status, 'FAILED');
      assert.equal(evidence.summary.capacity.effectiveReady, 2);
      assert.equal(evidence.summary.users.uninterrupted, 10);
      assert.equal(evidence.summary.users.interrupted, 0);
      assert.equal(evidence.summary.verification.verdict, 'FAIL');
      await apply({ 'observation-condition': 'none' });
      await advance(4);
      evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, 3);
      assert.equal(evidence.summary.transition.failed, 1);
      assert.equal(evidence.summary.verification.verdict, 'FAIL');
      assert.equal(await page.locator('#transition-rows tr').filter({ hasText: 'FAILED' }).count(), 1);
    });

    await conduct('late scaling measures saturation, queuing and over-budget users; recovery never erases them', async () => {
      await apply({ 'cpu-demand': '260', 'offered-load': '260' });
      await advance();
      let evidence = await read();
      assert.equal(evidence.summary.capacity.saturationWindows, 1);
      assert.equal(evidence.summary.users.verdict, 'NOT_OBSERVED');
      await observe();
      evidence = await read();
      const original = evidence.state.journeys;
      assert.equal(evidence.summary.users.interrupted, 10);
      assert.ok(original.every((entry) => entry.queueRps === 60 && entry.latencyMs > entry.budgetMs));
      await apply({ 'cpu-demand': '140', 'offered-load': '120' });
      await advance(4);
      await observe();
      evidence = await read();
      assert.equal(evidence.summary.users.uninterrupted, 10);
      assert.equal(evidence.summary.users.interrupted, 10);
      assert.deepEqual(evidence.state.journeys.slice(0, 10), original);
      assert.equal(evidence.summary.verification.verdict, 'FAIL');
    });

    await conduct('HTTP 200 does not hide incorrect business state or duplicate effects', async () => {
      await apply({ 'observation-condition': 'journey-failure' });
      await observe();
      const evidence = await read();
      assert.equal(evidence.state.journeys[0].httpStatus, 200);
      assert.equal(evidence.state.journeys[0].effects, 2);
      assert.equal(evidence.state.journeys[0].stateCorrect, false);
      assert.equal(evidence.summary.users.interrupted, 1);
      assert.equal(evidence.summary.users.uninterrupted, 9);
      assert.equal(await page.locator('#journey-rows tr').filter({ hasText: 'INTERRUPTED:' }).count(), 1);
    });

    await conduct('missing client completion and zero offered load never count as successful samples', async () => {
      await apply({ 'observation-condition': 'journey-unknown' });
      await observe();
      let evidence = await read();
      assert.equal(evidence.summary.users.unknown, 1);
      assert.equal(evidence.summary.users.uninterrupted, 9);
      assert.equal(evidence.state.journeys[0].latencyMs, null);
      assert.equal(evidence.state.journeys[0].completed, null);
      await reset();
      await apply({ 'offered-load': '0' });
      await observe();
      evidence = await read();
      assert.equal(evidence.summary.users.attempts, 0);
      assert.equal(evidence.state.lastResult.verdict, 'NOT_OBSERVED');
    });

    await conduct('four-instance limit is explicit despite continuing resource pressure', async () => {
      await apply({ 'cpu-demand': '600', 'memory-demand': '400' });
      await advance(14);
      const evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, 4);
      assert.equal(evidence.summary.capacity.requested, 4);
      assert.equal(evidence.state.transitions.length, 2);
      assert.equal(evidence.state.observations.at(-1).decision, 'AT_LIMIT');
      assert.equal(evidence.summary.users.attempts, 0);
    });

    await conduct('unexpected model failure fails closed, retains state, and keyboard reset recovers', async () => {
      await observe();
      await advance(4);
      await observe();
      assert.equal((await read()).summary.verification.verdict, 'PASS');
      await page.evaluate(() => {
        globalThis.__originalReduce = globalThis.ScaleOutRehearsal.reduce;
        globalThis.ScaleOutRehearsal.reduce = () => { throw new Error('Deliberate local browser failure-path assertion'); };
      });
      await advance();
      let evidence = await read();
      assert.equal(evidence.effectiveVerdict, 'ERROR');
      assert.match(evidence.uiError, /Deliberate local browser failure-path assertion/);
      assert.equal(evidence.state.journeys.length, 20);
      assert.equal(await page.locator('#verdict').textContent(), 'ERROR');
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      assert.equal(await page.locator('#cpu-demand').isDisabled(), true);
      assert.equal(await page.getByRole('alert').isVisible(), true);
      await page.evaluate(() => { globalThis.ScaleOutRehearsal.reduce = globalThis.__originalReduce; });
      await reset();
      evidence = await read();
      assert.equal(evidence.uiError, null);
      assert.equal(evidence.effectiveVerdict, 'NOT_RUN');
      assert.match(evidence.archives[0].uiError, /Deliberate local browser failure-path assertion/);
      assert.equal(await page.locator('#advance-window').isDisabled(), false);
      await observe();
      assert.equal((await read()).summary.users.attempts, 10);
    });

    await conduct('bounded reset archive retains eight prior runs and fails closed rather than deleting one', async () => {
      for (let count = 0; count < 8; count += 1) {
        await observe();
        await reset();
      }
      const retained = (await read()).archives;
      await observe();
      await reset();
      const evidence = await read();
      assert.equal(evidence.effectiveVerdict, 'ERROR');
      assert.equal(evidence.archives.length, 8);
      assert.deepEqual(evidence.archives, retained);
      assert.equal(evidence.state.journeys.length, 10);
      assert.match(await page.getByRole('alert').textContent(), /No archived run was deleted/);
    });

    await conduct('narrow viewport preserves document fit, readable controls, and keyboard focus', async (record) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#cpu-demand').focus();
      await page.keyboard.press('Tab');
      record.layout = await page.evaluate(() => ({
        viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
        activeId: document.activeElement.id,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth
      }));
      assert.ok(record.layout.documentWidth <= record.layout.viewport);
      assert.equal(record.layout.activeId, 'memory-demand');
      assert.equal(record.layout.outlineWidth, '3px');
      assert.equal(await page.locator('#advance-window').isVisible(), true);
    });

    await conduct('actual CSP blocks inline execution and external connections without bypass or completed network', async (record) => {
      await page.evaluate(() => {
        globalThis.__inlineRan = false;
        globalThis.__violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__inlineRan = true;';
        document.body.append(script);
        globalThis.__connectionResult = 'pending';
        fetch('https://s012-csp.invalid/blocked').then(
          () => { globalThis.__connectionResult = 'unexpectedly allowed'; },
          () => { globalThis.__connectionResult = 'blocked'; }
        );
      });
      await page.waitForFunction(() => globalThis.__connectionResult !== 'pending'
        && globalThis.__violations.some((entry) => entry.directive === 'connect-src')
        && globalThis.__violations.some((entry) => entry.directive.startsWith('script-src')));
      record.csp = await page.evaluate(() => ({
        inlineRan: globalThis.__inlineRan, connection: globalThis.__connectionResult, violations: globalThis.__violations
      }));
      assert.equal(record.csp.inlineRan, false);
      assert.equal(record.csp.connection, 'blocked');
      assert.equal(report.externalCompleted.length, 0);
      await observe();
      assert.equal((await read()).summary.users.uninterrupted, 10);
    });

    assert.equal(report.pageErrors.length, 0);
    assert.equal(report.externalCompleted.length, 0);
    assert.ok(report.cases.every((entry) => entry.status === 'passed'));
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
        let number = 1;
        const directory = path.join(__dirname, 'evidence');
        while (fs.existsSync(path.join(directory, `browser-${number}-observations.json`))) number += 1;
        const filename = `browser-${number}-observations.json`;
        fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Captured actual browser observations: evidence\\${filename}`);
      }
    }
  }
});
