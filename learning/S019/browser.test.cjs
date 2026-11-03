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
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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

test('actual isolated browser conducts the S019 synthetic cell handoff and its negative paths', { timeout: 180000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(playwright.version, '1.56.1');
  assert.equal(hash(path.join(tooling, 'isolated.cjs')), helperHash);
  const report = {
    cardId: 'A-S019', workerId: 'worker-A-S019', kano: 'S', kanoUnit: 'A-S019', packet: 'SC-S019',
    mode: 'actual-real-headless-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), node: process.version, playwright: playwright.version,
    signedBrowser: signedEdge(), helper: 'testing\\browser\\isolated.cjs',
    helperSha256: helperHash, helperPublishedCommit: '53c0c0d',
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'model.js', 'app.js', 'manifest.json', 'browser.test.cjs']
      .map((name) => [name, hash(path.join(__dirname, name))])),
    cases: [], pageErrors: [], externalCompleted: [], closeAwaited: false,
    nativeProof: false, productionNode24Validated: false, parentComplete: false, status: 'running'
  };
  let session;
  try {
    session = await openIsolatedLesson('learning\\S019\\index.html');
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
    const sequence = async (...ids) => { for (const id of ids) await press(id); };
    const condition = (value) => page.locator('#target-observation').selectOption(value);
    const handoff = () => sequence('create-cell', 'synchronize', 'transfer-owner', 'route-tenant', 'exercise-fence');
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
            phase: await page.locator('#phase').textContent(),
            counters: await page.locator('#counters').textContent(),
            capacity: await page.locator('#capacity').textContent(),
            alertVisible: await page.locator('#input-error').isVisible(),
            traceRows: await page.locator('#trace li').count(),
            journeyRows: await page.locator('#journey-rows tr').count(),
            archivedRuns: await page.locator('#history > details').count()
          };
          report.cases.push(record);
        }
      });
    };

    await conduct('exact banner, real labels, callable native form reset and zero-sample unknown', async () => {
      assert.equal(await page.title(), 'S019 — Cell-based expansion');
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Tenant to migrate (locked after the first action)').count(), 1);
      assert.equal(await page.getByLabel('Cell B observation').count(), 1);
      assert.equal(await page.locator('form').evaluate((form) => typeof form.reset), 'function');
      assert.equal((await read()).summary.verdict, 'unknown');
      assert.equal((await read()).summary.attempts, 0);
      assert.equal(await page.getByRole('alert').isVisible(), false);
      assert.equal(await page.locator('noscript').isVisible(), false);
    });

    await conduct('keyboard controls block stale routing and move only beta without missing writes', async (record) => {
      await page.locator('#selected-tenant').focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal((await read()).state.tenant, 'beta');
      assert.equal(await page.locator('#target-observation').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('#target-observation').evaluate((element) => getComputedStyle(element).outlineWidth), '3px');
      await sequence('route-tenant', 'create-cell', 'synchronize', 'source-write', 'transfer-owner', 'route-tenant');
      let observed = await read();
      assert.equal(observed.state.owners.beta.cell, 'A');
      assert.deepEqual(observed.state.cells.B.beta, [1]);
      assert.deepEqual(observed.state.expected.beta, [1, 2]);
      assert.equal(observed.summary.blocked, 3);
      assert.equal(await page.locator('#selected-tenant').isDisabled(), true);
      await sequence('synchronize', 'transfer-owner', 'route-tenant', 'exercise-fence');
      await press('run-journeys', 'Space');
      observed = await read();
      assert.equal(observed.summary.verdict, 'success');
      assert.equal(observed.summary.successful, 2);
      assert.deepEqual(observed.state.cells.B.beta, [1, 2, 3]);
      assert.deepEqual(observed.state.cells.B.alpha, []);
      assert.equal(observed.state.routes.alpha, 'A');
      assert.equal(observed.state.owners.alpha.cell, 'A');
      assert.equal(observed.summary.capacity.allocatedRps, 200);
      assert.equal(observed.summary.fenceChecks, 1);
      assert.equal(await page.locator('#journey-rows tr').count(), 2);
      record.keyboardOnlyActionSequence = true;
    });

    await conduct('HTTP 200 with wrong business state is failure and recovery cannot erase it', async (record) => {
      await handoff();
      await condition('wrong-state');
      await press('run-journeys');
      const failed = await read();
      assert.equal(failed.state.journeys[0].httpStatus, 200);
      assert.equal(failed.state.journeys[0].classification, 'failure');
      assert.equal(failed.state.journeys[1].classification, 'success');
      assert.equal(await page.locator('#verdict').textContent(), 'failure');
      await condition('healthy');
      await press('run-journeys');
      const recovered = await read();
      assert.equal(recovered.summary.verdict, 'failure');
      assert.equal(recovered.summary.failed, 1);
      assert.equal(recovered.summary.successful, 3);
      assert.deepEqual(recovered.state.journeys.slice(0, 2), failed.state.journeys);
      record.failureBeforeRecovery = failed;
    });

    await conduct('missing observation is unknown, with retained uncertainty after recovery', async (record) => {
      await handoff();
      await condition('unknown');
      await press('run-journeys');
      const missing = await read();
      assert.equal(missing.state.journeys[0].httpStatus, null);
      assert.equal(missing.summary.unknown, 1);
      assert.equal(missing.summary.failed, 0);
      assert.match(await page.locator('#capacity').textContent(), /unknown \(A still has 100 known rps\)/);
      await condition('healthy');
      await press('run-journeys');
      assert.equal((await read()).summary.verdict, 'unknown');
      assert.equal((await read()).summary.unknown, 1);
      record.unknownBeforeRecovery = missing;
    });

    await conduct('ownership-to-route gap returns 409 and preserves unaffected tenant service', async () => {
      await sequence('create-cell', 'synchronize', 'transfer-owner', 'run-journeys');
      let observed = await read();
      assert.equal(observed.state.journeys[0].httpStatus, 409);
      assert.equal(observed.state.journeys[1].classification, 'success');
      await sequence('route-tenant', 'exercise-fence', 'run-journeys');
      observed = await read();
      assert.equal(observed.summary.failed, 1);
      assert.equal(observed.summary.verdict, 'failure');
      assert.deepEqual(observed.state.cells.B.alpha, observed.state.expected.alpha);
    });

    await conduct('unready B blocks unsafe moves while A remains usable, then permits a healthy handoff', async () => {
      await press('create-cell');
      await condition('unready');
      await sequence('synchronize', 'transfer-owner', 'route-tenant', 'run-journeys');
      let observed = await read();
      assert.equal(observed.summary.blocked, 3);
      assert.equal(observed.summary.successful, 2);
      assert.equal(observed.summary.capacity.readyRps, 100);
      assert.equal(observed.summary.verdict, 'unknown');
      await condition('healthy');
      await sequence('synchronize', 'transfer-owner', 'route-tenant', 'exercise-fence', 'run-journeys');
      observed = await read();
      assert.equal(observed.summary.verdict, 'success');
      await condition('unready');
      await press('run-journeys');
      observed = await read();
      assert.equal(observed.summary.verdict, 'failure');
      assert.equal(observed.state.journeys.at(-2).httpStatus, 503);
    });

    await conduct('malformed DOM selection creates a focused error with unchanged state, then keyboard reset recovers', async () => {
      const before = await read();
      await page.locator('#selected-tenant').evaluate((element) => {
        const option = document.createElement('option');
        option.value = 'unregistered-tenant';
        option.textContent = 'Invalid test input';
        element.append(option);
        element.value = option.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert.deepEqual(await read(), before);
      assert.equal(await page.getByRole('alert').isVisible(), true);
      assert.match(await page.getByRole('alert').textContent(), /Invalid tenant selection/);
      assert.equal(await page.getByRole('alert').evaluate((element) => document.activeElement === element), true);
      await reset();
      const observed = await read();
      assert.equal(observed.state.run, 2);
      assert.equal(observed.summary.verdict, 'unknown');
      assert.equal(observed.archivedRuns, 1);
      assert.equal(await page.getByRole('alert').isVisible(), false);
      assert.equal(await page.locator('#selected-tenant').isDisabled(), false);
      assert.equal(await page.locator('#selected-tenant').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('form').evaluate((form) => typeof form.reset), 'function');
    });

    await conduct('journey and action bounds stop without truncating data or silently resetting proof', async () => {
      await handoff();
      for (let count = 0; count < 8; count += 1) await press('run-journeys');
      const before = await read();
      await press('run-journeys');
      assert.deepEqual(await read(), before);
      assert.match(await page.getByRole('alert').textContent(), /8 journey batches/);
      while ((await read()).state.trace.length < 48) await press('exercise-fence');
      const full = await read();
      await press('exercise-fence');
      assert.deepEqual(await read(), full);
      assert.match(await page.getByRole('alert').textContent(), /48 actions/);
      assert.equal(await page.locator('#trace li').count(), 48);
      assert.equal(await page.locator('#journey-rows tr').count(), 16);
      await reset();
      assert.equal((await read()).summary.verdict, 'unknown');
      const archive = JSON.parse(await page.locator('#history pre').textContent());
      assert.equal(archive.state.trace.length, 48);
      assert.equal(archive.state.journeys.length, 16);
    });

    await conduct('reset retains failure and unknown runs, bounds history and declares eviction', async (record) => {
      await handoff();
      await condition('wrong-state');
      await press('run-journeys');
      await reset();
      await handoff();
      await condition('unknown');
      await press('run-journeys');
      await reset();
      let records = await page.locator('#history pre').allTextContents();
      assert.equal(JSON.parse(records[0]).summary.verdict, 'unknown');
      assert.equal(JSON.parse(records[1]).summary.verdict, 'failure');
      record.retainedNegativeRuns = records.map((value) => JSON.parse(value));
      for (let count = 0; count < 4; count += 1) await reset();
      records = await page.locator('#history pre').allTextContents();
      assert.equal(records.length, 4);
      assert.equal((await read()).evictedRuns, 2);
      assert.match(await page.locator('#history-status').textContent(), /2 older runs evicted/);
      assert.deepEqual(records.map((value) => JSON.parse(value).state.run), [6, 5, 4, 3]);
      assert.equal((await read()).state.run, 7);
    });

    await conduct('actual CSP blocks inline execution and external fetch; narrow layout remains usable', async (record) => {
      record.csp = await page.evaluate(async () => {
        globalThis.__s019Csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s019Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s019InlineExecuted = true;';
        document.body.append(script);
        let fetchBlocked = false;
        try { await fetch('https://example.invalid/s019-csp-check'); } catch { fetchBlocked = true; }
        return { inlineExecuted: globalThis.__s019InlineExecuted === true, fetchBlocked };
      });
      await page.waitForFunction(() => globalThis.__s019Csp.length >= 2);
      record.csp.violations = await page.evaluate(() => globalThis.__s019Csp);
      assert.equal(record.csp.inlineExecuted, false);
      assert.equal(record.csp.fetchBlocked, true);
      assert.ok(record.csp.violations.some((event) => event.directive === 'script-src-elem' && event.blockedURI === 'inline'));
      assert.ok(record.csp.violations.some((event) => event.directive === 'connect-src'));
      await page.setViewportSize({ width: 360, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.setViewportSize({ width: 1280, height: 720 });
    });

    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalCompleted, []);
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
        const directory = path.join(__dirname, 'evidence');
        let number = 1;
        while (fs.existsSync(path.join(directory, `browser-observations-${number}.json`))) number += 1;
        fs.writeFileSync(path.join(directory, `browser-observations-${number}.json`),
          `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
