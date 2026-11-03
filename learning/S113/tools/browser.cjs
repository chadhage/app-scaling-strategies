'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root, repo, evidence, hash, lf, read, tree, writeJson, raw } = require('./proof.cjs');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const shouldCapture = (value) => value === '1';

async function verifyBrowser() {
  const report = {
    schemaVersion: 1, cardId: 'A-S113', workerId: 'worker-A-S113', packet: 'SC-S113',
    mode: 'synthetic', observationPolicy: 'All region, topology, failure, evacuation, state, fence, writer, route and journey outcomes are fixed fictional teaching DATA ONLY.',
    startedAtUtc: new Date().toISOString(), toolingNode: process.version, productionNode24Validated: false,
    helperWorkingSha256: hash(fs.readFileSync(helperPath)), helperCommit: '53c0c0d',
    steps: [], pageErrors: [], consoleErrors: [], requestedUrls: [], deniedNetworkRoutes: [],
    preflight: null, browserVersion: null, closeAwaited: false, pageClosed: false, failure: null,
  };
  let preflightBytes = Buffer.alloc(0);
  let session;
  async function observe(page, name) {
    const dom = await page.evaluate(() => {
      const text = (id) => document.getElementById(id).textContent;
      return {
        title: document.title, banner: document.querySelector('.banner').textContent,
        status: { text: text('status'), result: document.getElementById('status').dataset.result },
        gates: Object.fromEntries(['capacity', 'state', 'fence', 'routes', 'journeys'].map((name) => [name, {
          result: text(`${name}-result`), detail: text(`${name}-detail`),
        }])),
        owner: text('owner'), evacuation: text('evacuation'), sourceOrigin: text('source-origin'),
        metrics: text('metrics'), runBudget: text('run-budget'),
        samples: Array.from(document.querySelectorAll('#samples tr')).map((row) => ({
          journey: row.dataset.journey, result: row.dataset.result,
          cells: Array.from(row.cells).map((cell) => cell.textContent),
        })),
        history: Array.from(document.querySelectorAll('#history li')).map((item) => ({
          run: item.dataset.run, action: item.dataset.action, result: item.dataset.result, text: item.textContent,
        })),
        error: { hidden: document.getElementById('error').hidden, text: text('error'),
          role: document.getElementById('error').getAttribute('role') },
        focus: document.activeElement.id || document.activeElement.className || document.activeElement.tagName,
        controls: Array.from(document.getElementById('operator-form').elements).map((control) => ({
          id: control.id, name: control.name, value: control.value, disabled: control.disabled,
        })),
        nativeResetType: typeof document.getElementById('operator-form').reset,
      };
    });
    report.steps.push({ name, observedAtUtc: new Date().toISOString(), dom });
    return dom;
  }
  try {
    assert.equal(process.version, 'v22.23.4', 'This proof qualifies installed Node 22 tooling only.');
    assert.equal(report.helperWorkingSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    report.helperCanonicalLfSha256 = hash(lf(fs.readFileSync(helperPath)));
    assert.equal(report.helperCanonicalLfSha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
    const packagePath = require.resolve('playwright/package.json', { paths: [path.join(repo, 'testing', 'browser')] });
    report.playwrightVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
    assert.equal(report.playwrightVersion, '1.56.1');
    const command = [
      "$ErrorActionPreference='Stop'",
      "$p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'",
      '$s=Get-AuthenticodeSignature -FilePath $p',
      '[ordered]@{executable=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus="$($s.Status)";signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress',
    ].join('; ');
    preflightBytes = execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
      { cwd: repo, timeout: 30000 });
    report.preflight = JSON.parse(preflightBytes.toString('utf8').replace(/^\uFEFF/, ''));
    assert.equal(report.preflight.signatureStatus, 'Valid');
    assert.match(report.preflight.signer, /CN=Microsoft Corporation/);
    assert.match(report.preflight.version, /^156\./);
    const { openIsolatedLesson } = require(helperPath);
    session = await openIsolatedLesson('learning\\S113\\index.html');
    report.browserVersion = session.browserVersion;
    assert.equal(report.browserVersion, report.preflight.version);
    const page = session.page;
    page.on('pageerror', (error) => report.pageErrors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('request', (request) => report.requestedUrls.push(request.url()));
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).protocol === 'file:') return route.continue();
      report.deniedNetworkRoutes.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    await page.reload({ waitUntil: 'load' });
    let dom = await observe(page, 'initial standalone DOM and unknown observations');
    assert.equal(dom.title, 'S113 — Planned regional evacuation rehearsal');
    assert.equal(dom.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(dom.nativeResetType, 'function');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.error.hidden, true);
    assert.equal(dom.samples.length, 2);
    assert.ok(Object.values(dom.gates).every((gate) => gate.result === 'UNKNOWN'));
    assert.ok(dom.samples.every((sample) => sample.cells.slice(1).every((cell) => cell === 'UNKNOWN')));
    assert.match(dom.metrics, /unknown: 2; effects: UNKNOWN/);

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('details').getAttribute('open'), '');
    dom = await observe(page, 'keyboard opens exact source contract through native details summary');
    assert.equal(dom.focus, 'SUMMARY');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('details').getAttribute('open'), null);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'begin-run');
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard begin leaves all prerequisites unknown');
    assert.equal(dom.focus, 'warm-capacity');
    assert.equal(dom.status.result, 'unknown');
    assert.ok(Object.values(dom.gates).every((gate) => gate.result === 'UNKNOWN'));
    assert.match(dom.owner, /^region-amber/);
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard warm-capacity observation precedes state and writer');
    assert.equal(dom.focus, 'synchronize-state');
    assert.equal(dom.gates.capacity.result, 'POSITIVE');
    assert.match(dom.gates.capacity.detail, /Warm: YES; available units: 4; required: 4/);
    assert.equal(dom.gates.state.result, 'UNKNOWN');
    assert.equal(dom.gates.fence.result, 'UNKNOWN');
    assert.match(dom.owner, /^region-amber/);
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard synchronized required state precedes writer handoff');
    assert.equal(dom.focus, 'transfer-writer');
    assert.equal(dom.gates.state.result, 'POSITIVE');
    assert.match(dom.gates.state.detail, /checkpoint: 42; required: 42; sessions available: YES/);
    assert.match(dom.owner, /^region-amber/);
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard exclusive fenced writer is not yet verified evacuation');
    assert.equal(dom.focus, 'migrate-traffic');
    assert.equal(dom.gates.fence.result, 'POSITIVE');
    assert.match(dom.gates.fence.detail, /epoch 7 fenced: YES; destination epoch: 8; eligible writers: 1/);
    assert.match(dom.owner, /^region-violet — epoch 8/);
    assert.match(dom.evacuation, /^UNVERIFIED/);
    assert.equal(dom.sourceOrigin, 'RETAINED');
    assert.equal(dom.gates.routes.result, 'UNKNOWN');
    assert.equal(dom.gates.journeys.result, 'UNKNOWN');
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard positive evacuation only after both sampled routes and journeys');
    assert.equal(dom.focus, 'fixture');
    assert.equal(dom.status.result, 'positive');
    assert.ok(Object.values(dom.gates).every((gate) => gate.result === 'POSITIVE'));
    assert.match(dom.evacuation, /^VERIFIED — fixture scope only/);
    assert.equal(dom.sourceOrigin, 'EVACUATED in the fixed fixture only');
    assert.match(dom.metrics, /Successful: 2; interrupted: 0; unknown: 0; effects: 1/);
    assert.equal(dom.history.length, 5);
    const firstRun = structuredClone(dom.history);

    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#fixture').inputValue(), 'cold');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'begin-run');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard cold destination is a measured negative capacity');
    assert.equal(dom.gates.capacity.result, 'NEGATIVE');
    assert.match(dom.gates.capacity.detail, /Warm: NO; available units: 1; required: 4/);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard cold handoff is blocked before fencing and retains history');
    assert.equal(dom.focus, 'fixture');
    assert.equal(dom.status.result, 'negative');
    assert.equal(dom.gates.fence.result, 'UNKNOWN');
    assert.match(dom.gates.fence.detail, /Writer handoff not attempted/);
    assert.match(dom.owner, /^region-amber — epoch 7/);
    assert.match(dom.evacuation, /^BLOCKED/);
    assert.equal(dom.sourceOrigin, 'RETAINED');
    assert.equal(await page.locator('#migrate-traffic').isDisabled(), true);
    assert.deepEqual(dom.history.slice(0, 5), firstRun);
    assert.equal(dom.history.length, 9);

    async function runFixture(id, expectedResult) {
      const before = structuredClone(dom.history);
      await page.selectOption('#fixture', id);
      await page.click('#begin-run');
      await page.click('#warm-capacity');
      await page.click('#synchronize-state');
      await page.click('#transfer-writer');
      dom = await observe(page, `${id} prerequisite and exclusive-writer check`);
      if (['route-lag', 'journey-failure'].includes(id)) {
        assert.equal(dom.status.result, 'positive');
        assert.match(dom.owner, /^region-violet — epoch 8/);
        assert.match(dom.evacuation, /^UNVERIFIED/);
        assert.equal(dom.gates.routes.result, 'UNKNOWN');
        await page.click('#migrate-traffic');
        dom = await observe(page, `${id} sampled migration outcomes`);
      } else assert.equal(await page.locator('#migrate-traffic').isDisabled(), true);
      assert.equal(dom.status.result, expectedResult);
      assert.equal(dom.sourceOrigin, 'RETAINED');
      assert.deepEqual(dom.history.slice(0, before.length), before);
      assert.equal(dom.focus, await page.locator('#fixture').isDisabled() ? 'reset-lesson' : 'fixture');
      return dom;
    }
    dom = await runFixture('stale', 'negative');
    assert.equal(dom.gates.capacity.result, 'POSITIVE');
    assert.equal(dom.gates.state.result, 'NEGATIVE');
    assert.match(dom.gates.state.detail, /checkpoint: 40; required: 42/);
    assert.equal(dom.gates.fence.result, 'UNKNOWN');
    assert.match(dom.owner, /^region-amber/);
    dom = await runFixture('split', 'negative');
    assert.equal(dom.gates.fence.result, 'NEGATIVE');
    assert.match(dom.gates.fence.detail, /fenced: NO.*eligible writers: 2/);
    assert.match(dom.owner, /^region-amber/);
    dom = await runFixture('missing', 'unknown');
    assert.ok(Object.values(dom.gates).every((gate) => gate.result === 'UNKNOWN'));
    assert.match(dom.gates.capacity.detail, /available units: UNKNOWN/);
    assert.match(dom.gates.state.detail, /checkpoint: UNKNOWN.*sessions available: UNKNOWN/);
    assert.match(dom.evacuation, /^UNVERIFIED/);
    assert.match(dom.metrics, /unknown: 2; effects: UNKNOWN/);
    assert.match(dom.owner, /^region-amber/);
    dom = await runFixture('route-lag', 'negative');
    assert.equal(dom.gates.fence.result, 'POSITIVE');
    assert.equal(dom.gates.routes.result, 'NEGATIVE');
    assert.equal(dom.gates.journeys.result, 'POSITIVE');
    assert.equal(dom.samples[0].cells[1], 'region-amber');
    assert.equal(dom.samples[1].cells[1], 'region-violet');
    assert.match(dom.metrics, /Successful: 2; interrupted: 0/);
    assert.match(dom.owner, /^region-violet/);
    dom = await runFixture('journey-failure', 'negative');
    for (const name of ['capacity', 'state', 'fence', 'routes']) assert.equal(dom.gates[name].result, 'POSITIVE');
    assert.equal(dom.gates.journeys.result, 'NEGATIVE');
    assert.match(dom.metrics, /Successful: 1; interrupted: 1; unknown: 0; effects: 0/);
    assert.deepEqual(dom.samples[1].cells, ['session-write', 'region-violet', 'failed', '145 ms', 'NO', '0', 'NEGATIVE']);
    assert.match(dom.owner, /^region-violet — epoch 8/);
    assert.match(dom.status.text, /Do not automatically restore a fenced source writer/);
    assert.equal(dom.history.length, 31);
    assert.match(dom.runBudget, /Runs: 7\/7; retained events: 31\/35/);
    assert.equal(await page.locator('#begin-run').isDisabled(), true);
    const beforeBudgetError = structuredClone(dom.history);
    await page.evaluate(() => document.getElementById('operator-form').requestSubmit());
    dom = await observe(page, 'eighth-run budget guard shows focused error without history mutation');
    assert.equal(dom.focus, 'error');
    assert.equal(dom.error.role, 'alert');
    assert.match(dom.error.text, /Seven runs are the declared limit/);
    assert.deepEqual(dom.history, beforeBudgetError);
    assert.equal(dom.status.result, 'negative');

    await page.locator('#reset-lesson').focus();
    await page.keyboard.press('Space');
    dom = await observe(page, 'keyboard reset clears teaching history and restores native form defaults');
    assert.equal(dom.focus, 'fixture');
    assert.equal(dom.nativeResetType, 'function');
    assert.equal(dom.error.hidden, true);
    assert.equal(dom.history.length, 0);
    assert.match(dom.runBudget, /Runs: 0\/7; retained events: 0\/35/);
    assert.ok(Object.values(dom.gates).every((gate) => gate.result === 'UNKNOWN'));
    assert.equal(await page.locator('#fixture').inputValue(), 'ready');

    await page.evaluate(() => {
      const button = document.getElementById('migrate-traffic');
      button.disabled = false;
      button.click();
    });
    dom = await observe(page, 'forged enabled migration control cannot bypass state-order guard');
    assert.equal(dom.focus, 'error');
    assert.match(dom.error.text, /out of order/);
    assert.equal(dom.history.length, 0);
    assert.match(dom.owner, /^region-amber/);
    assert.equal(dom.gates.fence.result, 'UNKNOWN');
    assert.equal(await page.locator('#migrate-traffic').isDisabled(), true);
    await page.evaluate(() => {
      const select = document.getElementById('fixture');
      const option = document.createElement('option');
      option.value = ' ready ';
      option.textContent = 'Malformed typed fixture';
      select.append(option);
      select.value = option.value;
      document.getElementById('operator-form').requestSubmit();
    });
    dom = await observe(page, 'strict malformed fixture input shows focused error without mutation');
    assert.equal(dom.focus, 'error');
    assert.match(dom.error.text, /Unknown fixture/);
    assert.equal(dom.history.length, 0);
    assert.match(dom.runBudget, /Runs: 0\/7/);
    assert.equal(dom.status.result, 'unknown');
    await page.selectOption('#fixture', 'ready');
    await page.click('#begin-run');
    dom = await observe(page, 'valid action recovers error UX without a reload');
    assert.equal(dom.error.hidden, true);
    assert.equal(dom.focus, 'warm-capacity');
    assert.equal(dom.history.length, 1);
    for (let index = 0; index < 4; index++) await page.keyboard.press('Enter');
    dom = await observe(page, 'recovered keyboard run retains genuine positive fixture result');
    assert.equal(dom.status.result, 'positive');
    assert.equal(dom.history.length, 5);
    await page.locator('#reset-lesson').focus();
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard reset after recovery clears outcomes and errors');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.error.hidden, true);
    assert.equal(dom.focus, 'fixture');
    assert.equal(dom.nativeResetType, 'function');
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors, []);

    report.cspPolicy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = 'tools/fixtures/csp-probe.js';
      document.head.append(script);
    });
    await page.waitForFunction(() => globalThis.__s113CspProbeResult && globalThis.__s113CspProbeResult.complete
      && globalThis.__s113CspViolations.some((event) => event.directive === 'connect-src')
      && globalThis.__s113CspViolations.some((event) => event.blockedURI === 'inline')
      && globalThis.__s113CspViolations.some((event) => event.blockedURI === 'eval'));
    report.csp = await page.evaluate(() => globalThis.__s113CspProbeResult);
    report.csp.violations = await page.evaluate(() => globalThis.__s113CspViolations);
    assert.equal(report.csp.probeContext, 'normal document external script');
    assert.equal(report.csp.inlineExecuted, false);
    assert.equal(report.csp.evalExecuted, false);
    assert.equal(report.csp.evalError, 'EvalError');
    assert.equal(report.csp.fetchResolved, false);
    assert.equal(report.csp.fetchError, 'TypeError');
    assert.ok(report.csp.violations.every((event) => event.disposition === 'enforce'));
    assert.deepEqual(report.deniedNetworkRoutes, [], 'CSP must deny connections before the fail-safe network guard.');
    assert.ok(report.requestedUrls.length >= 4);
    assert.ok(report.requestedUrls.every((url) => new URL(url).protocol === 'file:'));
    assert.deepEqual(report.pageErrors, []);
    dom = await observe(page, 'actual enforced CSP denies inline script eval and connections without lesson mutation');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.status.result, 'unknown');
  } catch (error) {
    report.failure = { name: error.name, message: error.message, stack: error.stack };
    if (session && !session.page.isClosed()) {
      try { await observe(session.page, 'actual failure DOM at assertion'); } catch {}
      try {
        report.cspDiagnostic = await session.page.evaluate(() => ({
          result: globalThis.__s113CspProbeResult || null, violations: globalThis.__s113CspViolations || [],
        }));
      } catch {}
    }
  } finally {
    if (session) {
      try {
        await session.close();
        report.closeAwaited = true;
        report.pageClosed = session.page.isClosed();
      } catch (error) {
        report.failure = { ...(report.failure || {}), cleanupError: String(error) };
      }
    }
    report.finishedAtUtc = new Date().toISOString();
  }
  report.passed = report.failure === null && report.closeAwaited && report.pageClosed;
  return { report, preflightBytes };
}

async function main() {
  const capture = shouldCapture(process.env.CAPTURE_BROWSER_EVIDENCE);
  const before = tree();
  const inputs = Object.keys(before).filter((name) => !name.startsWith(`evidence${path.sep}`))
    .map((source) => ({ source, bytes: read(source) }));
  const { report, preflightBytes } = await verifyBrowser();
  assert.deepEqual(tree(), before, 'Actual browser verification must not mutate lesson or historical evidence bytes.');
  let evidenceFile = null;
  if (capture) {
    const numbers = fs.readdirSync(evidence).map((name) => /^browser-(\d+)\.json$/.exec(name))
      .filter(Boolean).map((match) => Number(match[1]));
    const next = String(Math.max(0, ...numbers) + 1).padStart(3, '0');
    const scope = `browser-${next}`;
    evidenceFile = `${scope}.json`;
    writeJson(evidenceFile, { ...report, captureId: scope, captureWasExactOne: true,
      inputs: inputs.map(({ source, bytes }) => ({ ...raw(scope, source, bytes, source), normalizedLfSha256: hash(lf(bytes)) })),
      observationsRaw: raw(scope, 'observations', Buffer.from(`${JSON.stringify(report, null, 2)}\n`)),
      preflightRaw: raw(scope, 'signed-edge-preflight', preflightBytes) });
  }
  console.log(JSON.stringify({ cardId: report.cardId, passed: report.passed, actualDomObservations: report.steps.length,
    browserVersion: report.browserVersion, closeAwaited: report.closeAwaited, pageClosed: report.pageClosed,
    readOnly: !capture, evidenceFile, failure: report.failure }));
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { shouldCapture, verifyBrowser };
