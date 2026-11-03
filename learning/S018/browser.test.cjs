'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const tooling = path.join(root, 'testing', 'browser');
const { openIsolatedLesson } = require(path.join(tooling, 'isolated.cjs'));
const playwright = require(path.join(tooling, 'node_modules', 'playwright', 'package.json'));
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (filename) => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
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

test('real isolated Edge conducts the exact S018 synthetic tier-scaling exercise', { timeout: 190000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(playwright.version, '1.56.1');
  assert.equal(sha(path.join(tooling, 'isolated.cjs')), helperHash);
  const report = {
    cardId: 'A-S018', workerId: 'worker-A-S018', kano: 'S', kanoUnit: 'A-S018', packet: 'SC-S018',
    mode: 'actual-real-headless-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), node: process.version, playwright: playwright.version,
    signedBrowser: signedEdge(), helper: 'testing\\browser\\isolated.cjs', helperSha256: helperHash,
    helperPublishedCommit: '53c0c0d',
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'model.js', 'app.js', 'manifest.json', 'browser.test.cjs']
      .map((name) => [name, sha(path.join(__dirname, name))])),
    cases: [], pageErrors: [], externalCompleted: [], closeAwaited: false, status: 'running',
    nativeProof: false, productionNode24Validated: false, parentComplete: false
  };
  let session;
  try {
    session = await openIsolatedLesson('learning\\S018\\index.html');
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
    const scale = async (tier, count = '2') => {
      await page.locator(`#${tier}-instances`).fill(count);
      await press(`scale-${tier}`);
    };
    const observe = () => press('observe-window', 'Space');
    const reset = () => press('archive-reset', 'Space');
    const configure = async (tier) => {
      await page.locator('#bottleneck').selectOption(tier);
      await press('configure-fixture');
    };
    const latest = (state) => state.current.observations.at(-1);
    const conduct = async (name, check) => {
      await t.test(name, async () => {
        const record = { name, status: 'running' };
        try {
          await page.reload({ waitUntil: 'load' });
          await check(record);
          record.status = 'passed';
        } catch (error) {
          record.status = 'failed'; record.error = error.message;
          throw error;
        } finally {
          record.observed = await read().catch((error) => ({ readError: error.message }));
          record.dom = {
            runVerdict: await page.locator('#run-verdict').textContent(),
            latestVerdict: await page.locator('#latest-verdict').textContent(),
            latestSummary: await page.locator('#latest-summary').textContent(),
            bounds: await page.locator('#bounds').textContent(),
            alertVisible: await page.getByRole('alert').isVisible(),
            alertText: await page.locator('#input-error').textContent(),
            observationRows: await page.locator('#observation-rows tr').count(),
            journeyRows: await page.locator('#journey-rows tr').count()
          };
          report.cases.push(record);
        }
      });
    };

    await conduct('exact banner, canonical objective, semantic labels, native form reset and zero-sample honesty', async () => {
      assert.equal(await page.title(), 'S018 — Independent tier scaling');
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(await page.locator('header').textContent(), /Scale the constrained tier while preserving contracts and capacity limits in remaining tiers/);
      for (const label of ['Constrained tier', 'Frontend instances (1–3)', 'API instances (1–3)',
        'Worker instances (1–3)', 'Downstream completion evidence', 'Tier contract condition']) {
        assert.equal(await page.getByLabel(label, { exact: true }).count(), 1);
      }
      assert.equal(await page.locator('form').evaluateAll((forms) => forms.every((form) => typeof form.reset === 'function')), true);
      assert.equal((await read()).current.verdict, 'NOT_RUN');
      assert.equal((await read()).current.observations.length, 0);
      assert.equal(await page.locator('#journey-rows tr').count(), 0);
      assert.equal(await page.getByRole('alert').isVisible(), false);
      assert.equal(await page.locator('noscript').isVisible(), false);
    });

    await conduct('keyboard-only frontend targeting changes no other tier and succeeds within pool and journey budgets', async () => {
      await page.locator('#bottleneck').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#bottleneck').inputValue(), 'frontend');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#configure-fixture').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('#configure-fixture').evaluate((element) => getComputedStyle(element).outlineWidth), '3px');
      await page.keyboard.press('Enter');
      await page.locator('#frontend-instances').focus();
      await page.keyboard.press('Enter');
      await observe();
      const state = await read();
      assert.deepEqual(state.current.counts, { frontend: 2, api: 1, worker: 1 });
      assert.equal(latest(state).completed, 10);
      assert.equal(latest(state).observedConnections, 8);
      assert.equal(latest(state).maxLatencyMs, 100);
      assert.equal(await page.locator('#run-verdict').textContent(), 'PASS');
      assert.equal(await page.locator('#bottleneck').isDisabled(), true);
    });

    for (const tier of ['api', 'worker']) {
      await conduct(`independent ${tier} control changes only its intended tier and verifies ten successful journeys`, async () => {
        if (tier !== 'api') await configure(tier);
        await scale(tier);
        assert.equal((await read()).current.verdict, 'NOT_RUN', 'scaling alone is not success');
        await observe();
        const state = await read();
        assert.deepEqual(state.current.counts, { frontend: 1, api: 1, worker: 1, [tier]: 2 });
        assert.equal(latest(state).completed, 10);
        assert.equal(latest(state).observedConnections, 12);
        assert.equal(latest(state).maxLatencyMs, 100);
        assert.equal(await page.locator('#run-verdict').textContent(), 'PASS');
        assert.equal(await page.locator('#journey-rows tr').count(), 10);
        assert.equal(await page.locator('#assertion-rows td').filter({ hasText: /^PASS$/ }).count(), 4);
      });
    }

    await conduct('wrong-tier scaling preserves API constraint and reports four actual synthetic deadline failures', async () => {
      await scale('frontend');
      await observe();
      const window = latest(await read());
      assert.equal(window.admitted, 6);
      assert.equal(window.completed, 6);
      assert.equal(window.failed, 4);
      assert.equal(window.maxLatencyMs, 250);
      assert.equal(await page.locator('#journey-rows tr').filter({ hasText: 'tier deadline' }).count(), 4);
      assert.equal(await page.locator('#run-verdict').textContent(), 'FAIL');
    });

    await conduct('scale-all transfers pressure to sixteen downstream connections and fails four journeys', async () => {
      await press('scale-all', 'Space');
      await observe();
      const window = latest(await read());
      assert.deepEqual(window.counts, { frontend: 2, api: 2, worker: 2 });
      assert.equal(window.admitted, 10);
      assert.equal(window.observedConnections, 16);
      assert.equal(window.connectionExcess, 4);
      assert.equal(window.completed, 6);
      assert.equal(window.failed, 4);
      assert.match(await page.locator('#latest-summary').textContent(), /observed DB 16\/12/);
      assert.equal(await page.locator('#journey-rows tr').filter({ hasText: 'connection acquisition' }).count(), 4);
      assert.equal(await page.locator('#run-verdict').textContent(), 'FAIL');
    });

    await conduct('even correctly targeted API expansion to three cannot override downstream limits', async () => {
      await scale('api', '3');
      await observe();
      const state = await read();
      assert.deepEqual(state.current.counts, { frontend: 1, api: 3, worker: 1 });
      assert.equal(latest(state).connectionExcess, 4);
      assert.equal(state.current.verdict, 'FAIL');
    });

    await conduct('fast 100 ms incompatible-contract responses fail all ten journeys', async () => {
      await scale('api');
      await page.locator('#tier-contract').selectOption('incompatible');
      await observe();
      const window = latest(await read());
      assert.equal(window.maxLatencyMs, 100);
      assert.equal(window.completed, 0);
      assert.equal(window.failed, 10);
      assert.equal(await page.locator('#journey-rows tr').filter({ hasText: 'incompatible tier contract' }).count(), 10);
      assert.equal(await page.locator('#run-verdict').textContent(), 'FAIL');
    });

    await conduct('missing downstream completion evidence leaves ten UNKNOWN and no fabricated maximum latency', async () => {
      await scale('api');
      await page.locator('#completion-proof').selectOption('missing');
      await observe();
      const window = latest(await read());
      assert.equal(window.observedConnections, null);
      assert.equal(window.maxLatencyMs, null);
      assert.equal(window.completed, 0);
      assert.equal(window.unknown, 10);
      assert.equal(await page.locator('#run-verdict').textContent(), 'UNKNOWN');
      assert.match(await page.locator('#latest-summary').textContent(), /configured connection demand 12; observed DB UNKNOWN/);
      assert.match(await page.locator('#latest-summary').textContent(), /maximum latency UNKNOWN \/ 150 ms/);
    });

    await conduct('recovery cannot erase a failure; keyboard reset archives evidence and restores native form defaults', async () => {
      await observe();
      const first = (await read()).current.observations[0];
      await scale('api');
      await observe();
      assert.deepEqual((await read()).current.observations[0], first);
      assert.equal(await page.locator('#latest-verdict').textContent(), 'PASS');
      assert.equal(await page.locator('#run-verdict').textContent(), 'FAIL');
      await page.locator('#api-instances').fill('bad');
      await page.locator('#completion-proof').selectOption('missing');
      await page.locator('#tier-contract').selectOption('incompatible');
      const archived = (await read()).current;
      await reset();
      const state = await read();
      assert.deepEqual(state.archives, [archived]);
      assert.equal(state.current.id, 2);
      assert.equal(state.current.bottleneck, 'api');
      assert.deepEqual(state.current.counts, { frontend: 1, api: 1, worker: 1 });
      assert.equal(state.current.verdict, 'NOT_RUN');
      assert.equal(await page.locator('#api-instances').inputValue(), '2');
      assert.equal(await page.locator('#completion-proof').inputValue(), 'complete');
      assert.equal(await page.locator('#tier-contract').inputValue(), 'compatible');
      assert.equal(await page.locator('#archives summary').textContent(), 'Run 1 — FAIL — 2 observations — API bottleneck');
      assert.equal(await page.locator('#bottleneck').evaluate((element) => document.activeElement === element), true);
      await scale('api');
      await observe();
      assert.equal((await read()).current.verdict, 'PASS');
      assert.deepEqual((await read()).archives[0], archived);
    });

    await conduct('a later PASS cannot erase UNKNOWN and an additional contract failure wins cumulatively', async () => {
      await scale('api');
      await page.locator('#completion-proof').selectOption('missing');
      await observe();
      await page.locator('#completion-proof').selectOption('complete');
      await observe();
      assert.equal(await page.locator('#latest-verdict').textContent(), 'PASS');
      assert.equal(await page.locator('#run-verdict').textContent(), 'UNKNOWN');
      await page.locator('#tier-contract').selectOption('incompatible');
      await observe();
      assert.equal((await read()).current.observations.length, 3);
      assert.equal(await page.locator('#run-verdict').textContent(), 'FAIL');
    });

    await conduct('strict lexical input, caught action errors and recovery preserve previous evidence atomically', async () => {
      const before = await read();
      for (const text of ['', '0', '4', '1.5', '2e0', ' 2', '2 ']) {
        await scale('api', text);
        assert.equal(await page.getByRole('alert').isVisible(), true);
        assert.match(await page.getByRole('alert').textContent(), /exactly 1, 2 or 3/);
        assert.equal(await page.getByRole('alert').evaluate((element) => document.activeElement === element), true);
        assert.deepEqual(await read(), before);
      }
      await page.locator('#api-form').evaluate((form) => { form.dataset.tier = 'database'; });
      await scale('api', '2');
      assert.match(await page.getByRole('alert').textContent(), /Unknown scaling tier/);
      assert.deepEqual(await read(), before);
      await page.locator('#api-form').evaluate((form) => { form.dataset.tier = 'api'; });
      await scale('api');
      assert.equal(await page.getByRole('alert').isVisible(), false);
      await observe();
      assert.equal((await read()).current.verdict, 'PASS');
    });

    await conduct('forged replay state and injected observation conditions are rejected in the actual browser', async (record) => {
      const before = await read();
      record.stateGuard = await page.evaluate(() => {
        const input = JSON.parse(document.getElementById('run-evidence').textContent);
        input.current.counts.api = 3;
        try { globalThis.S018Lesson.dispatch(input, { type: 'reset' }); return 'unexpectedly accepted'; }
        catch (error) { return error.message; }
      });
      assert.match(record.stateGuard, /State replay mismatch/);
      await page.locator('#completion-proof').evaluate((select) => {
        const option = document.createElement('option');
        option.value = 'unqualified'; option.textContent = 'injected invalid condition';
        select.append(option); select.value = option.value;
      });
      await observe();
      assert.match(await page.getByRole('alert').textContent(), /Unknown downstream proof condition/);
      assert.deepEqual(await read(), before);
      await page.locator('#completion-proof').selectOption('complete');
      await scale('api');
      await observe();
      assert.equal((await read()).current.verdict, 'PASS');
    });

    await conduct('eight-observation UI and model bounds retain evidence while reset stays operable', async () => {
      await scale('api');
      for (let index = 0; index < 8; index += 1) await observe();
      assert.equal(await page.locator('#observe-window').isDisabled(), true);
      assert.equal(await page.locator('#observation-rows tr').count(), 8);
      const before = await read();
      await page.locator('#observation-form').evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await page.getByRole('alert').textContent(), /8-observation bound/);
      assert.deepEqual(await read(), before);
      await reset();
      assert.equal((await read()).archives[0].observations.length, 8);
      assert.equal(await page.locator('#observe-window').isDisabled(), false);
    });

    await conduct('twenty-four-command UI and state guards are finite and preserve the archived full command trace', async () => {
      for (let index = 0; index < 24; index += 1) await scale('frontend', index % 2 ? '1' : '2');
      const before = await read();
      assert.equal(before.current.commands.length, 24);
      assert.equal(await page.locator('#scale-frontend').isDisabled(), true);
      assert.equal(await page.locator('#scale-all').isDisabled(), true);
      await page.locator('#frontend-form').evaluate((form) => {
        document.getElementById('frontend-instances').value = '2';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      assert.match(await page.getByRole('alert').textContent(), /24-command bound/);
      assert.deepEqual(await read(), before);
      await reset();
      assert.equal((await read()).archives[0].commands.length, 24);
      assert.equal(await page.locator('#scale-frontend').isDisabled(), false);
    });

    await conduct('explicit six-run retention evicts only oldest nonempty runs and does not erase on empty reset', async () => {
      for (let index = 0; index < 8; index += 1) { await observe(); await reset(); }
      const state = await read();
      assert.deepEqual(state.archives.map((run) => run.id), [3, 4, 5, 6, 7, 8]);
      assert.ok(state.archives.every((run) => run.verdict === 'FAIL' && run.observations[0].failed === 4));
      assert.equal(await page.locator('#archives summary').count(), 6);
      await reset();
      assert.deepEqual((await read()).archives, state.archives);
      assert.equal((await read()).current.id, 10);
    });

    await conduct('narrow viewport fits the document, preserves visible keyboard focus and readable controls', async (record) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.locator('#api-instances').focus();
      await page.keyboard.press('Tab');
      record.layout = await page.evaluate(() => ({
        viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
        activeId: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineWidth,
        height: document.activeElement.getBoundingClientRect().height
      }));
      assert.ok(record.layout.documentWidth <= record.layout.viewport);
      assert.equal(record.layout.activeId, 'scale-api');
      assert.equal(record.layout.outline, '3px');
      assert.ok(record.layout.height >= 44);
      await page.keyboard.press('Enter');
      await observe();
      assert.equal(await page.locator('#run-verdict').textContent(), 'PASS');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    });

    await conduct('enforced CSP blocks inline code and external connections without unsafe flags or completed network', async (record) => {
      await page.evaluate(() => {
        globalThis.__s018Inline = false;
        globalThis.__s018Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s018Violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s018Inline = true;';
        document.body.append(script);
        globalThis.__s018Connection = 'pending';
        fetch('https://s018-csp.invalid/blocked').then(
          () => { globalThis.__s018Connection = 'unexpectedly allowed'; },
          () => { globalThis.__s018Connection = 'blocked'; }
        );
      });
      await page.waitForFunction(() => globalThis.__s018Connection !== 'pending'
        && globalThis.__s018Violations.some((entry) => entry.directive === 'connect-src')
        && globalThis.__s018Violations.some((entry) => entry.directive.startsWith('script-src')));
      record.csp = await page.evaluate(() => ({
        inlineRan: globalThis.__s018Inline, connection: globalThis.__s018Connection, violations: globalThis.__s018Violations
      }));
      assert.equal(record.csp.inlineRan, false);
      assert.equal(record.csp.connection, 'blocked');
      assert.equal(report.externalCompleted.length, 0);
      await scale('api');
      await observe();
      assert.equal((await read()).current.verdict, 'PASS');
    });

    assert.equal(report.pageErrors.length, 0);
    assert.equal(report.externalCompleted.length, 0);
    assert.ok(report.cases.every((entry) => entry.status === 'passed'));
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        report.closeAwaited = true;
      }
    } catch (error) {
      report.status = 'failed'; report.cleanupError = error.message;
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
