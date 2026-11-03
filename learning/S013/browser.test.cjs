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

test('real isolated Edge conducts canonical S013 workload scaling, deadlines, and guarded recovery', { timeout: 220000 }, async (t) => {
  const report = {
    cardId: 'A-S013', workerId: 'worker-A-S013', kano: 'S', kanoUnit: 'A-S013', packet: 'SC-S013',
    mode: 'actual-real-headless-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), node: process.version, playwright: playwright.version,
    helper: 'testing\\browser\\isolated.cjs', helperCommit: '53c0c0d',
    helperSha256: sha(path.join(toolingRoot, 'isolated.cjs')),
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'model.js', 'app.js', 'manifest.json', 'browser.test.cjs']
      .map((name) => [name, sha(path.join(__dirname, name))])),
    cases: [], pageErrors: [], consoleErrors: [], externalCompleted: [], closeAwaited: false,
    nativeProof: false, productionNode24Validated: false, parentComplete: false, status: 'running'
  };
  let session;
  let currentCase = 'initial load';
  try {
    assert.match(process.version, /^v22\./);
    assert.equal(playwright.version, '1.56.1');
    assert.equal(report.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    const published = execFileSync('git', ['show', '53c0c0d:testing/browser/isolated.cjs'], { cwd: root });
    const checkoutLF = fs.readFileSync(path.join(toolingRoot, 'isolated.cjs'), 'utf8').replace(/\r\n/g, '\n');
    report.publishedHelperBlobSha256 = hash(published);
    assert.equal(report.publishedHelperBlobSha256, hash(checkoutLF), 'The exact published helper differs only in checkout line endings');
    report.signedBrowser = signedEdge();
    session = await openIsolatedLesson('learning\\S013\\index.html');
    const { page } = session;
    report.browserVersion = session.browserVersion;
    assert.equal(report.browserVersion, report.signedBrowser.productVersion);
    page.on('pageerror', (error) => report.pageErrors.push({ case: currentCase, message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push({ case: currentCase, message: message.text() });
    });
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
    const enqueue = () => press('enqueue-batch', 'Space');
    const reset = () => press('restart-rehearsal', 'Space');
    const apply = async (values = {}) => {
      for (const [id, value] of Object.entries(values)) {
        const element = page.locator(`#${id}`);
        if (['workload-metric', 'observation-condition'].includes(id)) await element.selectOption(value);
        else await element.fill(value);
      }
      await press('apply-inputs');
    };
    const conduct = async (name, check) => {
      currentCase = name;
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
          record.dom = await page.evaluate(() => ({
            verdict: document.getElementById('verdict')?.textContent,
            ready: document.getElementById('ready-value')?.textContent,
            rule: document.getElementById('rule-decision')?.textContent,
            work: document.getElementById('work-verdict')?.textContent,
            alertVisible: !document.getElementById('input-error')?.hidden,
            windowRows: document.querySelectorAll('#window-rows tr').length,
            workRows: document.querySelectorAll('#work-rows tr').length
          }));
          report.cases.push(record);
        }
      });
    };

    await conduct('exact canonical title/banner, labeled portable controls, and zero-sample honesty', async () => {
      assert.equal(await page.title(), 'S013 — Concurrency/queue-driven scale-out');
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      for (const label of ['Batch size (1–40 work items)', 'Concurrent requests (0–120)',
        'Original completion budget (5–60 seconds)', 'Workload metric / support fixture', 'Deterministic observation condition']) {
        assert.equal(await page.getByLabel(label, { exact: true }).count(), 1, label);
      }
      assert.equal(await page.locator('form').evaluateAll((forms) => forms.every((form) => typeof form.reset === 'function')), true);
      assert.equal(await page.locator('#verdict').textContent(), 'NOT_RUN');
      assert.equal((await read()).summary.work.submitted, 0);
      assert.equal(await page.locator('#input-error').isVisible(), false);
      assert.equal(await page.locator('noscript').isVisible(), false);
    });

    await conduct('keyboard-only queue rule: requested intent, later readiness, and all original deadlines', async () => {
      await page.locator('#batch-size').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#active-requests').evaluate((element) => element === document.activeElement), true);
      const focus = await page.locator('#active-requests').evaluate((element) => ({
        width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle
      }));
      assert.equal(focus.width, '3px');
      assert.equal(focus.style, 'solid');
      await enqueue();
      await advance();
      let evidence = await read();
      assert.equal(evidence.summary.capacity.requested, 3);
      assert.equal(evidence.summary.capacity.effectiveReady, 2);
      assert.equal(evidence.summary.work.completed, 4);
      assert.equal(evidence.summary.work.queued, 8);
      assert.equal(await page.locator('#rule-decision').textContent(), 'SCALE_OUT_REQUESTED');
      assert.notEqual(await page.locator('#verdict').textContent(), 'PASS');
      await advance(2);
      evidence = await read();
      assert.equal(await page.locator('#ready-value').textContent(), '3');
      assert.equal(await page.locator('#verdict').textContent(), 'PASS');
      assert.equal(evidence.summary.work.onTime, 12);
      assert.equal(evidence.summary.work.late, 0);
      assert.equal(evidence.state.clockSeconds, 15);
      assert.ok(evidence.summary.work.addedWorkerCompletions > 0);
      assert.equal(await page.locator('#work-rows tr').count(), 12);
      assert.equal(await page.locator('#advance-window').evaluate((element) => element === document.activeElement), true);
    });

    await conduct('concurrency per observed-ready worker independently triggers the supported rule', async () => {
      await apply({ 'workload-metric': 'concurrency' });
      await enqueue();
      await advance(3);
      const evidence = await read();
      assert.equal(evidence.state.windows[0].metricValue, 6);
      assert.equal(evidence.state.windows[0].readyObserved, 2);
      assert.equal(evidence.state.transitions[0].metric, 'concurrency');
      assert.equal(evidence.summary.verification.verdict, 'PASS');
      assert.equal(evidence.summary.work.onTime, 12);
    });

    await conduct('unselected pressure cannot trigger scaling; equality at the chosen threshold can', async () => {
      await apply({ 'batch-size': '7', 'active-requests': '120' });
      await enqueue();
      await advance();
      let evidence = await read();
      assert.equal(evidence.state.windows[0].decision, 'BELOW_THRESHOLD');
      assert.equal(evidence.state.transitions.length, 0);
      await reset();
      await apply({ 'batch-size': '8', 'active-requests': '0' });
      await enqueue();
      await advance();
      evidence = await read();
      assert.equal(evidence.state.windows[0].metricValue, 8);
      assert.equal(evidence.state.windows[0].decision, 'SCALE_OUT_REQUESTED');
      assert.equal(evidence.summary.capacity.effectiveReady, 2);
      assert.equal(evidence.archives.length, 1);
    });

    await conduct('deadline equality succeeds, later completion fails, and recovery never erases misses', async () => {
      await apply({ 'deadline-seconds': '5' });
      await enqueue();
      await advance();
      let evidence = await read();
      assert.equal(evidence.summary.work.onTime, 4);
      assert.equal(evidence.state.jobs[0].completedAt, evidence.state.jobs[0].deadlineAt);
      await advance(2);
      await apply({ 'deadline-seconds': '60' });
      await enqueue();
      await advance(3);
      evidence = await read();
      assert.equal(evidence.summary.work.late, 8);
      assert.equal(evidence.summary.work.onTime, 16);
      assert.equal(evidence.summary.work.verdict, 'DEADLINE_MISSED');
      assert.equal(await page.locator('#verdict').textContent(), 'FAIL');
      assert.ok(evidence.state.jobs.slice(0, 12).every((job) => job.deadlineAt === 5));
    });

    await conduct('queued work can already be overdue despite successful capacity expansion', async () => {
      await apply({ 'batch-size': '40', 'deadline-seconds': '5' });
      await enqueue();
      await advance(2);
      const evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, 3);
      assert.equal(evidence.summary.work.late, 6);
      assert.equal(evidence.summary.work.pendingOverdue, 30);
      assert.equal(await page.locator('#verdict').textContent(), 'FAIL');
    });

    await conduct('missing selected metric is UNKNOWN and remains a gap after recovery', async () => {
      await apply({ 'observation-condition': 'metric-missing' });
      await enqueue();
      await advance();
      let evidence = await read();
      assert.equal(evidence.state.windows[0].metricValue, null);
      assert.equal(evidence.state.transitions.length, 0);
      assert.equal(evidence.summary.work.completed, 4);
      await apply({ 'observation-condition': 'none' });
      await advance(2);
      evidence = await read();
      assert.equal(evidence.summary.work.onTime, 12);
      assert.equal(evidence.summary.rule.unknownWindows, 1);
      assert.equal(await page.locator('#verdict').textContent(), 'UNKNOWN');
    });

    await conduct('missing capacity pauses warm-up and service without turning historical counts into proof', async () => {
      await enqueue();
      await advance();
      await apply({ 'observation-condition': 'capacity-missing' });
      await advance();
      let evidence = await read();
      assert.equal(await page.locator('#ready-value').textContent(), 'UNKNOWN');
      assert.equal(evidence.state.windows[1].readyObserved, null);
      assert.equal(evidence.state.windows[1].queueDepth, null);
      assert.equal(evidence.summary.work.completed, 4);
      assert.equal(evidence.state.transitions[0].status, 'WARMING');
      await apply({ 'observation-condition': 'none' });
      await advance(2);
      evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, 3);
      assert.equal(evidence.summary.work.onTime, 12);
      assert.equal(evidence.summary.verification.verdict, 'UNKNOWN');
    });

    await conduct('missing completion evidence remains an individual UNKNOWN, not a counted success', async () => {
      await apply({ 'observation-condition': 'completion-missing' });
      await enqueue();
      await advance();
      await apply({ 'observation-condition': 'none' });
      await advance(2);
      const evidence = await read();
      assert.equal(evidence.state.jobs[0].status, 'UNKNOWN');
      assert.equal(evidence.state.jobs[0].completedAt, null);
      assert.equal(evidence.state.jobs[0].worker, null);
      assert.equal(evidence.summary.work.unknown, 1);
      assert.equal(evidence.summary.work.onTime, 11);
      assert.equal(await page.locator('#verdict').textContent(), 'UNKNOWN');
    });

    await conduct('failed provisioning preserves requested intent and cannot become a positive capacity claim', async () => {
      await enqueue();
      await advance();
      await apply({ 'observation-condition': 'provision-failure' });
      await advance();
      let evidence = await read();
      assert.equal(evidence.summary.capacity.requested, 3);
      assert.equal(evidence.summary.capacity.effectiveReady, 2);
      assert.equal(evidence.state.transitions[0].status, 'FAILED');
      assert.equal(await page.getByRole('alert').isVisible(), true);
      await apply({ 'observation-condition': 'none' });
      await advance();
      evidence = await read();
      assert.equal(evidence.summary.work.onTime, 12);
      assert.equal(evidence.summary.capacity.failedTransitions, 1);
      assert.equal(evidence.summary.verification.verdict, 'FAIL');
    });

    await conduct('a worker error stays separate from deadline misses and survives healthy recovery', async () => {
      await apply({ 'observation-condition': 'worker-failure' });
      await enqueue();
      await advance();
      await apply({ 'observation-condition': 'none' });
      await advance(2);
      const evidence = await read();
      assert.equal(evidence.summary.work.failed, 1);
      assert.equal(evidence.summary.work.late, 0);
      assert.equal(evidence.summary.work.verdict, 'FAILED');
      assert.equal(evidence.summary.verification.verdict, 'FAIL');
      assert.equal(await page.locator('#work-rows').getByText('FAILED: Synthetic worker error', { exact: true }).count(), 1);
    });

    await conduct('blank, fractional, and out-of-range UI input is rejected without time/work/capacity changes', async () => {
      for (const value of ['', '1.5', '41']) {
        await apply({ 'batch-size': value });
        const evidence = await read();
        assert.equal(evidence.effectiveVerdict, 'INVALID');
        assert.equal(evidence.state.clockSeconds, 0);
        assert.equal(evidence.state.jobs.length, 0);
        assert.equal(evidence.state.capacity.requested, 2);
        assert.equal(await page.getByRole('alert').isVisible(), true);
        assert.equal(evidence.state.input.batchSize, 12);
      }
      await apply({ 'batch-size': '8' });
      await enqueue();
      assert.equal((await read()).state.jobs.length, 8);
      assert.equal((await read()).summary.history.invalid, 3);
    });

    for (const [metric, verdict] of [['cpu-percent', 'UNSUPPORTED'], ['native-unqualified', 'UNKNOWN']]) {
      await conduct(`${metric} refuses enqueue and step without invented work or capacity`, async () => {
        await apply({ 'workload-metric': metric });
        await enqueue();
        await advance();
        const evidence = await read();
        assert.equal(evidence.effectiveVerdict, verdict);
        assert.equal(evidence.state.clockSeconds, 0);
        assert.equal(evidence.state.jobs.length, 0);
        assert.equal(evidence.state.windows.length, 0);
        assert.equal(evidence.state.transitions.length, 0);
        assert.equal(await page.getByRole('alert').isVisible(), true);
      });
    }

    await conduct('apply changes only future batches and cannot rewrite deadlines or cancel warm-up', async () => {
      await enqueue();
      await advance();
      const before = await read();
      await apply({ 'batch-size': '2', 'deadline-seconds': '60' });
      await enqueue();
      const evidence = await read();
      assert.deepEqual(evidence.state.capacity.pending, before.state.capacity.pending);
      assert.ok(evidence.state.jobs.slice(0, 12).every((job) => job.deadlineAt === 20));
      assert.equal(evidence.state.jobs[12].deadlineAt, 65);
      assert.equal(evidence.state.jobs.length, 14);
    });

    await conduct('sustained pressure reaches the declared four-worker ceiling without hidden expansion', async () => {
      await apply({ 'batch-size': '40', 'deadline-seconds': '60' });
      await enqueue();
      await advance(5);
      const evidence = await read();
      assert.equal(evidence.summary.capacity.effectiveReady, 4);
      assert.equal(evidence.summary.capacity.requested, 4);
      assert.equal(evidence.state.transitions.length, 2);
      assert.equal(evidence.state.windows[4].decision, 'AT_LIMIT');
      assert.equal(evidence.summary.work.completed, 32);
    });

    await conduct('bounded queue admission retains all earlier work when further admission is refused', async () => {
      await apply({ 'batch-size': '40' });
      await enqueue();
      await enqueue();
      await enqueue();
      const retained = (await read()).state.jobs;
      await enqueue();
      const evidence = await read();
      assert.equal(evidence.state.lastResult.verdict, 'LIMIT');
      assert.equal(evidence.state.jobs.length, 120);
      assert.deepEqual(evidence.state.jobs, retained);
      assert.equal(evidence.state.batches.length, 3);
    });

    await conduct('80-command bound stops execution rather than pruning historical events', async () => {
      await advance(80);
      const retained = (await read()).state.events;
      await advance();
      const evidence = await read();
      assert.equal(evidence.state.lastResult.verdict, 'LIMIT');
      assert.equal(evidence.state.clockSeconds, 400);
      assert.equal(evidence.state.events.length, 80);
      assert.deepEqual(evidence.state.events, retained);
    });

    await conduct('keyboard reset restores native form defaults and archives failed/invalid history', async () => {
      await apply({ 'observation-condition': 'worker-failure', 'deadline-seconds': '5' });
      await enqueue();
      await advance(2);
      await apply({ 'batch-size': '' });
      const retained = await read();
      await reset();
      const evidence = await read();
      assert.equal(evidence.runNumber, 2);
      assert.equal(evidence.archives.length, 1);
      assert.deepEqual(evidence.archives[0].state, retained.state);
      assert.equal(evidence.archives[0].summary.work.failed, 2);
      assert.equal(evidence.archives[0].state.lastResult.verdict, 'INVALID');
      assert.equal(evidence.state.jobs.length, 0);
      assert.equal(evidence.effectiveVerdict, 'NOT_RUN');
      assert.equal(await page.locator('#batch-size').inputValue(), '12');
      assert.equal(await page.locator('#deadline-seconds').inputValue(), '20');
      assert.equal(await page.locator('#workload-metric').inputValue(), 'queue-depth');
      assert.equal(await page.locator('#observation-condition').inputValue(), 'none');
      assert.equal(await page.locator('form').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#restart-rehearsal').evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.getByRole('alert').isVisible(), false);
    });

    await conduct('unexpected model error replaces stale PASS with ERROR and reset retains the diagnostic', async () => {
      await enqueue();
      await advance(3);
      assert.equal((await read()).effectiveVerdict, 'PASS');
      await page.evaluate(() => {
        globalThis.__originalReduce = globalThis.QueueScaleRehearsal.reduce;
        globalThis.QueueScaleRehearsal.reduce = () => { throw new Error('Deliberate S013 failure-path assertion'); };
      });
      await advance();
      let evidence = await read();
      assert.equal(evidence.effectiveVerdict, 'ERROR');
      assert.match(evidence.uiError, /Deliberate S013 failure-path assertion/);
      assert.equal(evidence.state.jobs.length, 12);
      assert.equal(await page.locator('#batch-size').isDisabled(), true);
      assert.equal(await page.locator('#enqueue-batch').isDisabled(), true);
      assert.equal(await page.locator('#advance-window').isDisabled(), true);
      assert.equal(await page.getByRole('alert').isVisible(), true);
      await page.evaluate(() => { globalThis.QueueScaleRehearsal.reduce = globalThis.__originalReduce; });
      await reset();
      evidence = await read();
      assert.equal(evidence.effectiveVerdict, 'NOT_RUN');
      assert.match(evidence.archives[0].uiError, /Deliberate S013 failure-path assertion/);
      assert.equal(await page.locator('#advance-window').isDisabled(), false);
      await enqueue();
      await advance(3);
      assert.equal((await read()).effectiveVerdict, 'PASS');
    });

    await conduct('eight archived runs are retained and a ninth reset fails closed without deletion', async () => {
      for (let index = 0; index < 8; index += 1) {
        await enqueue();
        await reset();
      }
      const retained = (await read()).archives;
      await enqueue();
      await reset();
      const evidence = await read();
      assert.equal(evidence.effectiveVerdict, 'ERROR');
      assert.equal(evidence.archives.length, 8);
      assert.deepEqual(evidence.archives, retained);
      assert.equal(evidence.state.jobs.length, 12);
      assert.match(await page.getByRole('alert').textContent(), /No archived run was deleted/);
    });

    await conduct('narrow viewport preserves document fit, readable controls, and visible keyboard focus', async (record) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#batch-size').focus();
      await page.keyboard.press('Tab');
      record.layout = await page.evaluate(() => ({
        viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
        activeId: document.activeElement.id,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth
      }));
      assert.ok(record.layout.documentWidth <= record.layout.viewport);
      assert.equal(record.layout.activeId, 'active-requests');
      assert.equal(record.layout.outlineWidth, '3px');
      assert.equal(await page.locator('#enqueue-batch').isVisible(), true);
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    await conduct('actual restrictive CSP blocks inline code, external connections, and form submission', async (record) => {
      const originalURL = page.url();
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
        fetch('https://s013-csp.invalid/blocked').then(
          () => { globalThis.__connectionResult = 'unexpectedly allowed'; },
          () => { globalThis.__connectionResult = 'blocked'; }
        );
      });
      await page.waitForFunction(() => globalThis.__connectionResult !== 'pending'
        && globalThis.__violations.some((entry) => entry.directive === 'connect-src')
        && globalThis.__violations.some((entry) => entry.directive.startsWith('script-src')));
      await enqueue();
      await advance(3);
      assert.equal((await read()).effectiveVerdict, 'PASS');
      await page.evaluate(() => {
        const blockedForm = document.createElement('form');
        blockedForm.action = 'https://s013-csp.invalid/submit';
        document.body.append(blockedForm);
        blockedForm.submit();
      });
      await page.waitForFunction(() => globalThis.__violations.some((entry) => entry.directive === 'form-action'));
      record.csp = await page.evaluate(() => ({
        inlineRan: globalThis.__inlineRan, connection: globalThis.__connectionResult, violations: globalThis.__violations
      }));
      assert.equal(record.csp.inlineRan, false);
      assert.equal(record.csp.connection, 'blocked');
      assert.equal(page.url(), originalURL);
      assert.equal(report.externalCompleted.length, 0);
      assert.equal((await read()).effectiveVerdict, 'PASS');
    });

    assert.equal(report.pageErrors.length, 0);
    assert.equal(report.externalCompleted.length, 0);
    assert.ok(report.consoleErrors.every((entry) => entry.case.startsWith('actual restrictive CSP')));
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
        fs.writeFileSync(path.join(directory, `browser-${number}-observations.json`),
          `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
        console.log(`Captured actual browser observations: evidence\\browser-${number}-observations.json`);
      }
    }
  }
});
