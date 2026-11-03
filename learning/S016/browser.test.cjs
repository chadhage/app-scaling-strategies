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
const qualifiedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

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

test('real isolated offline Edge conducts S016 oscillation, failure, uncertainty and recovery', { timeout: 210000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(playwright.version, '1.56.1');
  assert.equal(sha(path.join(toolingRoot, 'isolated.cjs')), qualifiedHelper);
  const report = {
    cardId: 'A-S016', workerId: 'worker-A-S016', kano: 'S', kanoUnit: 'A-S016', packet: 'SC-S016',
    mode: 'actual-real-headless-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), node: process.version, playwright: playwright.version,
    signedBrowser: signedEdge(), helper: 'testing\\browser\\isolated.cjs', helperSha256: qualifiedHelper,
    helperPublishedCommit: '53c0c0d',
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'model.js', 'app.js', 'manifest.json', 'browser.test.cjs']
      .map((name) => [name, sha(path.join(__dirname, name))])),
    cases: [], pageErrors: [], externalCompleted: [], closeAwaited: false,
    nativeProof: false, productionNode24Validated: false, parentComplete: false, status: 'running'
  };
  let session;
  try {
    session = await openIsolatedLesson('learning\\S016\\index.html');
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
    const advance = async (count = 1) => {
      for (let index = 0; index < count; index += 1) await press('advance-window');
    };
    const run = () => press('run-remaining', 'Space');
    const reset = () => press('restart-rehearsal', 'Space');
    const condition = (value) => page.locator('#observation-condition').selectOption(value);
    const apply = async (values = {}) => {
      for (const [id, value] of Object.entries(values)) {
        const element = page.locator(`#${id}`);
        if (id === 'demand-pattern') await element.selectOption(value);
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
            immediateOutcome: await page.locator('#immediate-outcome').textContent(),
            stabilizedOutcome: await page.locator('#stabilized-outcome').textContent(),
            alertVisible: await page.locator('#input-error').isVisible(),
            traceRows: await page.locator('#trace-rows tr').count(),
            journeyRows: await page.locator('#journey-rows tr').count()
          };
          report.cases.push(record);
        }
      });
    };

    await conduct('exact canonical objective, prominent banner, labeled controls, callable reset and zero-sample honesty', async () => {
      assert.equal(await page.title(), 'S016 — Autoscale oscillation');
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Down-stabilization (1–4 low windows)').count(), 1);
      assert.equal(await page.getByLabel('Cooldown (0–5 windows)').count(), 1);
      assert.equal(await page.locator('form').evaluateAll((forms) => forms.every((form) => typeof form.reset === 'function')), true);
      const observed = await read();
      assert.equal(observed.effectiveVerdict, 'NOT_RUN');
      assert.equal(observed.summary.lanes.stabilized.attempts, 0);
      assert.equal(observed.summary.lanes.stabilized.maxLatencyMs, null);
      assert.match(await page.locator('#active-fixture').textContent(), /low 60 rps; high 180 rps/);
      assert.equal(await page.getByRole('alert').isVisible(), false);
      assert.equal(await page.locator('noscript').isVisible(), false);
    });

    await conduct('keyboard-only same-trace comparison measures disruptive reversals and forty healthy stabilized clients', async () => {
      await page.locator('#low-demand').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#high-demand').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('#high-demand').evaluate((element) => getComputedStyle(element).outlineWidth), '3px');
      await advance(2);
      let observed = await read();
      assert.equal(observed.state.observations[1].lanes.immediate.unsafeDown, true);
      assert.equal(observed.state.observations[1].lanes.stabilized.decision, 'STABILIZING');
      assert.equal(await page.locator('#low-demand').isDisabled(), true);
      await run();
      observed = await read();
      assert.equal(observed.effectiveVerdict, 'PASS');
      assert.equal(observed.summary.lanes.immediate.requestedChanges, 9);
      assert.equal(observed.summary.lanes.immediate.effectiveChanges, 9);
      assert.equal(observed.summary.lanes.immediate.reversals, 8);
      assert.equal(observed.summary.lanes.immediate.interrupted, 21);
      assert.equal(observed.summary.lanes.stabilized.uninterrupted, 40);
      assert.equal(await page.locator('#immediate-outcome').textContent(), 'INTERRUPTED');
      assert.equal(await page.locator('#stabilized-outcome').textContent(), 'UNINTERRUPTED');
      assert.match(await page.locator('#immediate-changes').textContent(), /unsafe removals 5/);
      assert.match(await page.locator('#stabilized-clients').textContent(), /original budget 250 ms/);
      assert.equal(await page.locator('#trace-rows tr').count(), 20);
      assert.equal(await page.locator('#journey-rows tr').count(), 80);
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      assert.equal(await page.locator('#run-remaining').isDisabled(), true);
    });

    await conduct('one-window hold and zero cooldown reproduce interruption rather than a false pass', async () => {
      await apply({ 'stabilization-windows': '1', 'cooldown-windows': '0' });
      await run();
      const observed = await read();
      assert.equal(observed.effectiveVerdict, 'FAIL');
      assert.deepEqual(observed.summary.lanes.stabilized, observed.summary.lanes.immediate);
      assert.equal(await page.getByRole('alert').isVisible(), true);
      assert.match(await page.getByRole('alert').textContent(), /budget breach/);
    });

    await conduct('fewer changes with excessive cooldown still FAIL and retain twelve interruptions after recovery', async () => {
      await apply({ 'demand-pattern': 'rebound', 'cooldown-windows': '4' });
      await run();
      const observed = await read();
      assert.equal(observed.state.observations[6].lanes.stabilized.decision, 'COOLDOWN');
      assert.equal(observed.state.observations[6].lanes.stabilized.cooldownRemaining, 2);
      assert.equal(observed.state.observations[9].lanes.stabilized.journeys[0].outcome, 'UNINTERRUPTED');
      assert.equal(observed.summary.lanes.stabilized.interrupted, 12);
      assert.ok(observed.summary.lanes.stabilized.requestedChanges < observed.summary.lanes.immediate.requestedChanges);
      assert.equal(await page.locator('#verdict').textContent(), 'FAIL');
      assert.match(await page.locator('#stabilized-clients').textContent(), /interrupted 12/);
    });

    await conduct('suitable longer stabilization preserves capacity through the short rebound trough', async () => {
      await apply({ 'demand-pattern': 'rebound', 'stabilization-windows': '4' });
      await run();
      const observed = await read();
      assert.equal(observed.effectiveVerdict, 'PASS');
      assert.equal(observed.summary.lanes.stabilized.requestedChanges, 0);
      assert.equal(observed.summary.lanes.stabilized.uninterrupted, 40);
    });

    await conduct('requested versus ready capacity, warm-up overload and failed readiness remain distinct', async () => {
      await apply({ 'high-demand': '360' });
      await advance();
      let observed = await read();
      assert.equal(observed.state.lanes.stabilized.ready, 2);
      assert.equal(observed.state.lanes.stabilized.pending.target, 4);
      assert.equal(observed.state.observations[0].lanes.stabilized.queueRps, 160);
      assert.match(await page.locator('#stabilized-capacity').textContent(), /Observed ready: 2\. Pending target: 4/);
      await condition('readiness-failed');
      await advance();
      observed = await read();
      assert.equal(observed.state.observations[1].lanes.stabilized.decision, 'READINESS_FAILED');
      assert.equal(observed.state.lanes.stabilized.ready, 2);
      assert.equal(observed.summary.lanes.stabilized.readinessFailures, 1);
      await condition('complete');
      await run();
      observed = await read();
      assert.equal(observed.summary.lanes.stabilized.readinessFailures, 1);
      assert.equal(observed.effectiveVerdict, 'FAIL');
    });

    await conduct('missing client observation stays null and UNKNOWN after complete later windows', async () => {
      await condition('missing-client');
      await advance();
      await condition('complete');
      await run();
      const observed = await read();
      assert.equal(observed.state.observations[0].lanes.stabilized.journeys[0].latencyMs, null);
      assert.equal(observed.effectiveVerdict, 'UNKNOWN');
      assert.equal(observed.summary.lanes.stabilized.unknown, 1);
      assert.equal(observed.summary.lanes.stabilized.uninterrupted, 39);
      assert.equal(await page.locator('#stabilized-outcome').textContent(), 'UNKNOWN');
      assert.match(await page.locator('#journey-rows').textContent(), /UNKNOWN/);
    });

    await conduct('unknown effective capacity blocks a scale decision and cannot reuse stale readiness as proof', async () => {
      await condition('capacity-unknown');
      await advance();
      let observed = await read();
      assert.equal(observed.state.observations[0].lanes.stabilized.ready, null);
      assert.equal(observed.state.observations[0].lanes.stabilized.decision, 'CAPACITY_UNKNOWN');
      assert.equal(observed.state.lanes.stabilized.ready, 2);
      assert.equal(observed.summary.lanes.stabilized.currentReady, null);
      assert.match(await page.locator('#stabilized-capacity').textContent(), /Observed ready: UNKNOWN/);
      await condition('complete');
      await run();
      observed = await read();
      assert.equal(observed.summary.lanes.stabilized.unknown, 4);
      assert.equal(observed.effectiveVerdict, 'UNKNOWN');
    });

    await conduct('HTTP 200 with incorrect business state is an interruption retained after recovery', async () => {
      await condition('state-loss');
      await advance();
      await condition('complete');
      await run();
      const observed = await read();
      const journey = observed.state.observations[0].lanes.stabilized.journeys[0];
      assert.equal(journey.httpStatus, 200);
      assert.equal(journey.stateCorrect, false);
      assert.equal(journey.outcome, 'INTERRUPTED');
      assert.equal(observed.effectiveVerdict, 'FAIL');
      assert.equal(observed.summary.lanes.stabilized.interrupted, 1);
      assert.match(await page.locator('#journey-rows tr').nth(4).textContent(), /true \/ 200.*false \/ 1.*INTERRUPTED/);
    });

    await conduct('strict malformed, out-of-envelope and reversed inputs reject visibly and retain prior configuration', async () => {
      const initial = (await read()).state.config;
      for (const values of [
        { 'low-demand': '' }, { 'low-demand': '60', 'high-demand': '2e2' },
        { 'high-demand': '180.5' }, { 'high-demand': '401' },
        { 'low-demand': '180', 'high-demand': '100' }
      ]) {
        await apply(values);
        const observed = await read();
        assert.equal(observed.effectiveVerdict, 'INVALID');
        assert.deepEqual(observed.state.config, initial);
        assert.equal(observed.state.cursor, 0);
        assert.equal(await page.getByRole('alert').isVisible(), true);
      }
      await apply({ 'low-demand': '60', 'high-demand': '180' });
      await advance();
      const before = (await read()).state;
      await page.locator('form').evaluate((form) => form.requestSubmit());
      const observed = await read();
      assert.equal(observed.effectiveVerdict, 'INVALID');
      assert.deepEqual(observed.state.observations, before.observations);
      assert.equal(observed.state.events.length, 8);
      assert.match(await page.getByRole('alert').textContent(), /locked/);
    });

    await conduct('unsupported observation stops run-all promptly; forged state fails closed without DOM mutation', async (record) => {
      record.deliberateTestInjection = 'Unsupported local option and forged in-memory state; not an incident.';
      await page.locator('#observation-condition').evaluate((element) => {
        const option = document.createElement('option');
        option.value = 'unqualified-native';
        option.textContent = 'Deliberate unsupported-option test';
        element.append(option);
        element.value = option.value;
      });
      await run();
      const before = await read();
      assert.equal(before.state.cursor, 0);
      assert.equal(before.state.events.length, 1);
      assert.equal(before.effectiveVerdict, 'INVALID');
      const error = await page.evaluate(() => {
        const forged = JSON.parse(document.getElementById('run-evidence').textContent).state;
        forged.lanes.stabilized.ready = 99;
        try {
          globalThis.OscillationRehearsal.reduce(forged, { type: 'step', condition: 'complete' });
          return 'unexpectedly allowed';
        } catch (failure) { return failure.message; }
      });
      assert.match(error, /Invalid rehearsal state/);
      assert.deepEqual(await read(), before);
      await condition('complete');
      await advance();
      assert.equal((await read()).state.cursor, 1);
    });

    await conduct('healthy clients without demonstrated oscillation improvement are NOT_DEMONSTRATED', async () => {
      await apply({ 'low-demand': '20', 'high-demand': '100' });
      await run();
      const observed = await read();
      assert.equal(observed.effectiveVerdict, 'NOT_DEMONSTRATED');
      assert.equal(observed.summary.lanes.stabilized.uninterrupted, 40);
      assert.equal(observed.summary.lanes.stabilized.unsafeTransitions, 0);
    });

    await conduct('keyboard native reset restores defaults and archives failed, unknown and rejected evidence', async () => {
      await apply({ 'stabilization-windows': '3', 'latency-budget': '300' });
      await condition('state-loss');
      await advance();
      await condition('missing-client');
      await advance();
      await page.locator('form').evaluate((form) => form.requestSubmit());
      const before = await read();
      await reset();
      let observed = await read();
      assert.equal(observed.effectiveVerdict, 'NOT_RUN');
      assert.deepEqual(observed.archives[0].state, before.state);
      assert.equal(observed.archives[0].summary.lanes.stabilized.interrupted, 1);
      assert.equal(observed.archives[0].summary.lanes.stabilized.unknown, 1);
      assert.equal(observed.archives[0].state.lastResult.verdict, 'INVALID');
      assert.equal(await page.locator('#stabilization-windows').inputValue(), '2');
      assert.equal(await page.locator('#latency-budget').inputValue(), '250');
      assert.equal(await page.locator('#observation-condition').inputValue(), 'complete');
      assert.equal(await page.locator('form').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#restart-rehearsal').evaluate((element) => element === document.activeElement), true);
      const archived = JSON.stringify(observed.archives);
      await advance();
      observed = await read();
      assert.equal(observed.summary.lanes.stabilized.attempts, 4);
      assert.equal(JSON.stringify(observed.archives), archived);
      assert.equal(await page.locator('#archive-list li').count(), 1);
    });

    await conduct('caught unexpected model error locks controls, retains state and recovers by keyboard reset', async (record) => {
      record.deliberateTestInjection = 'Throwing local reducer to exercise the application error boundary.';
      await advance(3);
      const before = (await read()).state;
      await page.evaluate(() => {
        globalThis.__originalReduce = globalThis.OscillationRehearsal.reduce;
        globalThis.OscillationRehearsal.reduce = () => { throw new Error('Deliberate S016 browser error-path assertion'); };
      });
      await advance();
      let observed = await read();
      assert.equal(observed.effectiveVerdict, 'ERROR');
      assert.deepEqual(observed.state, before);
      assert.match(observed.uiError, /Deliberate S016 browser error-path assertion/);
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      assert.equal(await page.locator('#observation-condition').isDisabled(), true);
      assert.equal(await page.locator('#high-demand').isDisabled(), true);
      assert.equal(await page.getByRole('alert').isVisible(), true);
      await page.evaluate(() => { globalThis.OscillationRehearsal.reduce = globalThis.__originalReduce; });
      await reset();
      observed = await read();
      assert.equal(observed.uiError, null);
      assert.equal(observed.effectiveVerdict, 'NOT_RUN');
      assert.match(observed.archives[0].uiError, /Deliberate S016 browser error-path assertion/);
      assert.equal(await page.locator('#advance-window').isDisabled(), false);
      await advance();
      assert.equal((await read()).state.cursor, 1);
    });

    await conduct('forty-command limit preserves rejected evidence and reset recovers instead of dropping history', async () => {
      await page.locator('#low-demand').fill('');
      for (let count = 0; count < 40; count += 1) await press('apply-inputs');
      const before = (await read()).state;
      assert.equal(before.events.length, 40);
      await advance();
      let observed = await read();
      assert.equal(observed.effectiveVerdict, 'ERROR');
      assert.deepEqual(observed.state, before);
      assert.match(observed.uiError, /Command limit/);
      await reset();
      observed = await read();
      assert.equal(observed.archives[0].state.events.length, 40);
      assert.equal(observed.effectiveVerdict, 'NOT_RUN');
      await advance();
      assert.equal((await read()).state.cursor, 1);
    });

    await conduct('six-run archive bound retains all previous records and current evidence without deletion', async () => {
      for (let count = 0; count < 6; count += 1) {
        await advance();
        await reset();
      }
      const retained = (await read()).archives;
      await advance();
      const before = (await read()).state;
      await reset();
      const observed = await read();
      assert.equal(observed.effectiveVerdict, 'ERROR');
      assert.equal(observed.archives.length, 6);
      assert.deepEqual(observed.archives, retained);
      assert.deepEqual(observed.state, before);
      assert.match(await page.getByRole('alert').textContent(), /No archived run was deleted/);
    });

    await conduct('narrow viewport keeps document fit, readable controls and visible keyboard focus', async (record) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#low-demand').focus();
      await page.keyboard.press('Tab');
      record.layout = await page.evaluate(() => ({
        viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
        activeId: document.activeElement.id, outlineWidth: getComputedStyle(document.activeElement).outlineWidth
      }));
      assert.ok(record.layout.documentWidth <= record.layout.viewport);
      assert.equal(record.layout.activeId, 'high-demand');
      assert.equal(record.layout.outlineWidth, '3px');
      await run();
      assert.equal(await page.locator('#advance-window').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    });

    await conduct('actual CSP blocks inline code and external connections without bypass or completed network', async (record) => {
      record.deliberateTestInjection = 'Blocked inline script and reserved invalid-domain fetch prove CSP enforcement.';
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
        fetch('https://s016-csp.invalid/blocked').then(
          () => { globalThis.__connectionResult = 'unexpectedly allowed'; },
          () => { globalThis.__connectionResult = 'blocked'; }
        );
      });
      await page.waitForFunction(() => globalThis.__connectionResult !== 'pending'
        && globalThis.__violations.some((entry) => entry.directive === 'connect-src')
        && globalThis.__violations.some((entry) => entry.directive.startsWith('script-src')));
      record.csp = await page.evaluate(() => ({
        inlineRan: globalThis.__inlineRan, connection: globalThis.__connectionResult,
        violations: globalThis.__violations
      }));
      assert.equal(record.csp.inlineRan, false);
      assert.equal(record.csp.connection, 'blocked');
      assert.equal(report.externalCompleted.length, 0);
      await advance();
      assert.equal((await read()).summary.lanes.stabilized.uninterrupted, 4);
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
        fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
        console.log(`Captured actual browser observations: evidence\\${filename}`);
      }
    }
  }
});
