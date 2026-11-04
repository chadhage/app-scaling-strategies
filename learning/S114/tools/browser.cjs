'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function tree(directory = root) {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(tree(file)) : [[path.relative(root, file), hash(fs.readFileSync(file))]];
  }).sort(([a], [b]) => a.localeCompare(b)));
}

async function observe() {
  const before = tree();
  const report = {
    status: 'running', startedAtUtc: new Date().toISOString(), nodeVersion: process.version,
    steps: [], pageErrors: [], consoleErrors: [], requestedUrls: [],
    cleanup: { requested: false, awaited: false, pageClosed: false }, readOnlyVerified: false,
  };
  let session;
  let phase = 'exercise';
  async function snapshot(name) {
    const dom = await session.page.evaluate(() => {
      const text = (id) => document.getElementById(id).textContent;
      return {
        title: document.title, banner: document.querySelector('.banner').textContent,
        status: { text: text('status'), result: document.getElementById('status').dataset.result },
        checks: Object.fromEntries(['detection', 'capacity', 'data', 'transactions', 'clientRecovery', 'budget']
          .map((name) => [name, text(`check-${name}`)])),
        details: Object.fromEntries(['detection', 'capacity', 'data', 'transactions', 'clientRecovery', 'budget']
          .map((name) => [name, text(`detail-${name}`)])),
        fault: text('fault-state'), proxy: text('proxy-state'), recovery: text('recovery-state'),
        metrics: text('metrics'), regional: text('regional-result'), bound: text('bound'),
        history: Array.from(document.querySelectorAll('#history li')).map((item) =>
          ({ action: item.dataset.action, result: item.dataset.result, text: item.textContent })),
        journeys: Array.from(document.querySelectorAll('#journey-results li')).map((item) =>
          ({ result: item.dataset.result, text: item.textContent })),
        error: { hidden: document.getElementById('error').hidden, text: text('error') },
        controls: Object.fromEntries(Array.from(document.getElementById('operator-form').elements)
          .map((item) => [item.id, { value: item.value, disabled: item.disabled, name: item.name }])),
        nativeResetType: typeof document.getElementById('operator-form').reset,
        focus: document.activeElement.id || document.activeElement.className || document.activeElement.tagName,
      };
    });
    assert.equal(dom.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(dom.regional, /Full regional continuity: UNKNOWN/);
    assert.match(dom.regional, /cannot certify an actual Azure-region outage or full regional continuity/);
    report.steps.push({ name, phase, observedAtUtc: new Date().toISOString(), dom });
    return dom;
  }
  try {
    assert.equal(process.version, 'v22.23.4', 'Only the approved local Node 22 tooling is exercised.');
    const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
    report.helperWorkingSha256 = hash(fs.readFileSync(helper));
    assert.equal(report.helperWorkingSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    report.helperCanonicalGitSha256 = hash(execFileSync('git', ['show', '53c0c0d82cc1db6780a87ac2b1085734af6d5c60:testing/browser/isolated.cjs'], { cwd: repo }));
    assert.equal(report.helperCanonicalGitSha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
    report.playwrightVersion = JSON.parse(fs.readFileSync(require.resolve('playwright/package.json', { paths: [path.join(repo, 'testing', 'browser')] }), 'utf8')).version;
    assert.equal(report.playwrightVersion, '1.56.1');
    const preflightCommand = [
      "$ErrorActionPreference='Stop'",
      "$p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'",
      '$s=Get-AuthenticodeSignature -FilePath $p',
      '[ordered]@{executable=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus="$($s.Status)";signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress',
    ].join('; ');
    report.preflightRaw = execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', preflightCommand], { cwd: repo, timeout: 30000 }).toString('utf8');
    report.preflight = JSON.parse(report.preflightRaw.replace(/^\uFEFF/, ''));
    assert.equal(report.preflight.signatureStatus, 'Valid');
    assert.match(report.preflight.signer, /CN=Microsoft Corporation/);
    assert.match(report.preflight.version, /^156\./);
    const { openIsolatedLesson } = require(helper);
    session = await openIsolatedLesson('learning\\S114\\index.html');
    report.browserVersion = session.browserVersion;
    assert.equal(report.browserVersion, report.preflight.version);
    const page = session.page;
    page.on('pageerror', (error) => report.pageErrors.push({ phase, text: String(error) }));
    page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push({ phase, text: message.text() }); });
    page.on('request', (request) => report.requestedUrls.push(request.url()));
    await page.reload({ waitUntil: 'load' });
    let dom = await snapshot('initial standalone DOM');
    assert.equal(dom.title, 'S114 — Unplanned regional failure rehearsal');
    assert.equal(dom.nativeResetType, 'function');
    assert.equal(dom.error.hidden, true);
    assert.equal(dom.history.length, 0);
    assert.ok(Object.values(dom.checks).every((result) => result === 'UNKNOWN'));
    assert.equal(dom.controls.budget.value, '60');

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'budget');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fault');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#fault').inputValue(), 'origins');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'isolate');
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard isolation labels are not detection or regional proof');
    assert.equal(dom.focus, 'detect');
    assert.ok(Object.values(dom.checks).every((result) => result === 'UNKNOWN'));
    assert.match(dom.fault, /Origins: north-a unhealthy, north-b unhealthy/);
    assert.match(dom.fault, /Dependencies: profile-store healthy, order-log healthy/);
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard bounded detection and non-certifying proxy');
    assert.equal(dom.focus, 'recover');
    assert.equal(dom.checks.detection, 'POSITIVE');
    assert.match(dom.details.detection, /\+12s/);
    assert.equal(dom.checks.capacity, 'UNKNOWN');
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard alternate capacity and data gate before journeys');
    assert.equal(dom.focus, 'journeys');
    assert.equal(dom.checks.capacity, 'POSITIVE');
    assert.equal(dom.checks.data, 'POSITIVE');
    assert.equal(dom.checks.transactions, 'UNKNOWN');
    assert.match(dom.recovery, /selected; destination Teaching South \/ south-a/);
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard positive fixture with measured clients and interruption');
    assert.equal(dom.focus, 'fixture');
    assert.equal(dom.status.result, 'positive');
    assert.ok(Object.values(dom.checks).every((result) => result === 'POSITIVE'));
    assert.match(dom.details.budget, /30 total interrupted seconds \/ 60s budget/);
    assert.match(dom.journeys[0].text, /lesson-session-001/);
    assert.match(dom.journeys[1].text, /committed-once; effects: 1/);
    const positiveHistory = structuredClone(dom.history);

    async function complete(fixture, fault, name) {
      const prior = structuredClone((await snapshot(`before ${name}`)).history);
      await page.selectOption('#fixture', fixture);
      await page.selectOption('#fault', fault);
      await page.fill('#budget', '60');
      for (const id of ['isolate', 'detect', 'recover', 'journeys']) await page.click(`#${id}`);
      const observed = await snapshot(name);
      assert.deepEqual(observed.history.slice(0, prior.length), prior);
      return observed;
    }
    dom = await complete('capacity-shortfall', 'dependencies', 'negative surviving capacity despite healthy shallow origins');
    assert.equal(dom.status.result, 'negative');
    assert.equal(dom.checks.capacity, 'NEGATIVE');
    assert.equal(dom.checks.transactions, 'UNKNOWN');
    assert.equal(dom.checks.clientRecovery, 'NEGATIVE');
    assert.equal(dom.checks.budget, 'UNKNOWN');
    assert.match(dom.details.capacity, /50 surviving \/ 80 required/);
    assert.match(dom.recovery, /blocked; destination NONE/);
    assert.match(dom.journeys[1].text, /unconfirmed; effects: UNKNOWN/);
    assert.deepEqual(dom.history.slice(0, 4), positiveHistory);
    dom = await complete('shallow-proxy-only', 'dependencies', 'unknown HTTP-only proxy cannot certify regional continuity');
    assert.equal(dom.status.result, 'unknown');
    assert.ok(Object.values(dom.checks).every((result) => result === 'UNKNOWN'));
    assert.match(dom.proxy, /north-a healthy; south-a healthy/);
    assert.match(dom.proxy, /Dependency-aware path: UNKNOWN/);
    assert.match(dom.recovery, /unverified; destination NONE/);
    assert.match(dom.metrics, /positive 0; interrupted 0; unknown 2/);
    dom = await complete('data-unavailable', 'both', 'negative required data availability');
    assert.equal(dom.checks.data, 'NEGATIVE');
    assert.match(dom.details.data, /Revision 6 \/ 7 required; dependency access unhealthy/);
    assert.match(dom.recovery, /blocked; destination NONE/);
    dom = await complete('budget-exceeded', 'both', 'negative interruption budget despite completed clients');
    assert.equal(dom.status.result, 'negative');
    assert.equal(dom.checks.clientRecovery, 'POSITIVE');
    assert.equal(dom.checks.budget, 'NEGATIVE');
    assert.match(dom.details.budget, /75 total interrupted seconds \/ 60s budget/);
    dom = await complete('duplicate-effect', 'both', 'negative duplicate transaction effects despite healthy proxy');
    assert.equal(dom.checks.transactions, 'NEGATIVE');
    assert.equal(dom.checks.clientRecovery, 'NEGATIVE');
    assert.equal(dom.checks.budget, 'POSITIVE');
    assert.match(dom.details.transactions, /2 total effects \/ 1 required/);
    assert.equal(dom.history.length, 24);
    assert.equal(dom.focus, 'reset-lesson');
    assert.equal(dom.controls.isolate.disabled, true);
    assert.match(dom.bound, /Bound reached/);
    const boundedHistory = structuredClone(dom.history);
    await page.evaluate(() => { document.getElementById('isolate').disabled = false; });
    await page.click('#isolate');
    dom = await snapshot('forced seventh action is rejected with focused error and retained history');
    assert.equal(dom.error.hidden, false);
    assert.match(dom.error.text, /Six rehearsals are the limit/);
    assert.equal(dom.focus, 'error');
    assert.deepEqual(dom.history, boundedHistory);
    assert.equal(dom.controls.isolate.disabled, true);

    await page.focus('#reset-lesson');
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard reset restores defaults and native form method');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.controls.fixture.value, 'alternate-ready');
    assert.equal(dom.controls.fault.value, 'both');
    assert.equal(dom.controls.budget.value, '60');
    assert.equal(dom.nativeResetType, 'function');
    assert.equal(dom.focus, 'fixture');
    assert.equal(dom.error.hidden, true);
    await complete('alternate-ready', 'both', 'positive history before invalid inputs');
    const prior = structuredClone((await snapshot('retained history before guard probes')).history);
    await page.fill('#budget', '6e1');
    await page.click('#isolate');
    dom = await snapshot('malformed raw budget has focused error without history mutation');
    assert.match(dom.error.text, /canonical whole-number string/);
    assert.equal(dom.focus, 'error');
    assert.deepEqual(dom.history, prior);
    await page.fill('#budget', '60');
    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'unknown-fixture';
      option.textContent = 'Invalid teaching input';
      document.getElementById('fixture').append(option);
    });
    await page.selectOption('#fixture', 'unknown-fixture');
    await page.click('#isolate');
    dom = await snapshot('unknown fixture input is rejected without losing positive history');
    assert.match(dom.error.text, /Choose a fixed fixture/);
    assert.equal(dom.focus, 'error');
    assert.deepEqual(dom.history, prior);
    await page.selectOption('#fixture', 'alternate-ready');
    await page.click('#isolate');
    const isolatedHistory = structuredClone((await snapshot('corrected input begins an ordered rehearsal')).history);
    await page.evaluate(() => { document.getElementById('journeys').disabled = false; });
    await page.click('#journeys');
    dom = await snapshot('forced out-of-order journey action has focused error and unchanged state');
    assert.match(dom.error.text, /not valid in phase isolated/);
    assert.equal(dom.focus, 'error');
    assert.equal(dom.controls.journeys.disabled, true);
    assert.deepEqual(dom.history, isolatedHistory);
    await page.click('#reset-lesson');
    dom = await snapshot('error recovery reset clears trace and restores initial unknown checks');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.error.hidden, true);
    assert.ok(Object.values(dom.checks).every((result) => result === 'UNKNOWN'));
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors.filter((item) => item.phase === 'exercise'), []);

    phase = 'csp';
    report.csp = await page.evaluate(async () => {
      globalThis.__s114Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s114Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s114InlineProbe = true;';
      document.head.append(script);
      let connectionBlocked = false;
      try { await fetch(new URL('manifest.json', location.href)); } catch { connectionBlocked = true; }
      return { connectionBlocked, inlineExecuted: globalThis.__s114InlineProbe === true };
    });
    await page.waitForFunction(() => globalThis.__s114Violations.some((item) => item.directive.startsWith('script-src'))
      && globalThis.__s114Violations.some((item) => item.directive === 'connect-src'));
    report.csp.violations = await page.evaluate(() => globalThis.__s114Violations);
    assert.equal(report.csp.connectionBlocked, true);
    assert.equal(report.csp.inlineExecuted, false);
    await snapshot('CSP blocks benign inline script and owned local-file connection probes');

    phase = 'startup-failure';
    await page.route('**/model.js', (route) => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: '/* Deliberate omission of the owned local model API for startup error UX; no regional fault or network failure. */',
    }));
    await page.reload({ waitUntil: 'load' });
    dom = await snapshot('deliberate local model omission exposes visible startup failure');
    assert.equal(dom.error.hidden, false);
    assert.match(dom.error.text, /model\.js did not load/);
    assert.equal(dom.focus, 'error');
    assert.equal(dom.controls.isolate.disabled, true);
    assert.equal(dom.status.result, 'unknown');
    await page.click('#reset-lesson');
    dom = await snapshot('startup failure reset cannot fabricate a result');
    assert.match(dom.error.text, /Reset cannot fabricate a result/);
    assert.equal(dom.focus, 'error');
    assert.equal(dom.history.length, 0);
    await page.unroute('**/model.js');
    phase = 'restored';
    await page.reload({ waitUntil: 'load' });
    dom = await snapshot('complete bundle restored after deliberate startup error probe');
    assert.equal(dom.error.hidden, true);
    assert.equal(dom.controls.isolate.disabled, false);
    assert.equal(dom.status.result, 'unknown');
    assert.equal(dom.history.length, 0);
    assert.ok(report.requestedUrls.every((url) => url.startsWith('file:')), 'No HTTP or cloud request is permitted.');
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors.filter((item) => item.phase !== 'csp'), []);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      report.cleanup.requested = true;
      try {
        await session.close();
        report.cleanup.awaited = true;
        report.cleanup.pageClosed = session.page.isClosed();
      } catch (error) {
        report.status = 'failed';
        report.cleanup.error = String(error);
      }
    }
    report.readOnlyVerified = JSON.stringify(before) === JSON.stringify(tree());
    if (!report.readOnlyVerified) report.status = 'failed';
    report.finishedAtUtc = new Date().toISOString();
  }
  return report;
}

if (process.argv[2] === '--observe') {
  observe().then((report) => {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.status !== 'passed') process.exitCode = 1;
  }).catch((error) => { console.error(error); process.exitCode = 1; });
} else {
  const before = tree();
  const snapshots = Object.keys(before).filter((name) => !name.startsWith(`evidence${path.sep}`))
    .map((source) => ({ source, bytes: fs.readFileSync(path.join(root, source)) }));
  if (capture && fs.existsSync(path.join(root, 'evidence', 'browser.json'))) throw new Error('Historical browser proof exists; normal verification must be read-only.');
  const result = spawnSync(process.execPath, [__filename, '--observe'], {
    cwd: repo, timeout: 150000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '' },
  });
  let observations;
  try { observations = JSON.parse(result.stdout.toString('utf8')); } catch {
    observations = { status: 'failed', failure: { message: result.error ? String(result.error) : 'No readable browser report.' }, steps: [] };
  }
  assert.deepEqual(tree(), before, 'Actual browser verification must not rewrite any lesson or historical evidence byte.');
  if (capture) {
    const passed = result.status === 0 && observations.status === 'passed';
    let attempt = 1;
    while (fs.existsSync(path.join(root, 'evidence', 'raw', `browser-${attempt}`))) attempt++;
    const raw = (name, bytes, extra = {}) => {
      const file = path.join('raw', `browser-${attempt}`, `${name}.raw.gz`);
      const target = path.join(root, 'evidence', file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, gzipSync(bytes), { flag: 'wx' });
      return { file, sha256: hash(bytes), bytes: bytes.length, crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length, ...extra };
    };
    const proof = {
      cardId: 'A-S114', workerId: 'worker-A-S114', kano: 'S', kanoUnit: 'A-S114', packet: 'SC-S114',
      mode: 'synthetic', status: passed ? 'passed' : 'failed', startedAtUtc: observations.startedAtUtc, finishedAtUtc: observations.finishedAtUtc,
      command: [process.execPath, 'learning\\S114\\tools\\browser.cjs'],
      exitStatus: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
      captureGuard: { acceptedValue: '1', observedValue: process.env.CAPTURE_BROWSER_EVIDENCE, normalVerificationReadOnly: true },
      stdout: raw('stdout', result.stdout), stderr: raw('stderr', result.stderr),
      preflightStdout: raw('preflight-stdout', Buffer.from(observations.preflightRaw || '', 'utf8')),
      snapshots: snapshots.map(({ source, bytes }) => raw(source.replace(/[\\/.]/g, '_'), bytes, { source })),
      nodeVersion: observations.nodeVersion, playwrightVersion: observations.playwrightVersion,
      browserVersion: observations.browserVersion, preflight: observations.preflight,
      helperWorkingSha256: observations.helperWorkingSha256, helperCanonicalGitSha256: observations.helperCanonicalGitSha256,
      steps: observations.steps.map((step) => step.name), cleanup: observations.cleanup,
      sourceParentComplete: false, nativeValidation: false, productionNode24Validated: false, additionalKanoCredits: 0,
    };
    fs.writeFileSync(path.join(root, 'evidence', passed ? 'browser.json' : `browser-failed-${attempt}.json`), `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify({
    cardId: 'A-S114', status: observations.status, browserVersion: observations.browserVersion,
    steps: observations.steps.length, cleanup: observations.cleanup,
    readOnlyVerified: observations.readOnlyVerified, evidenceCaptured: capture,
  }));
  if (result.status !== 0 || observations.status !== 'passed') {
    console.error(observations.failure || result.error || 'Browser observation failed.');
    process.exitCode = 1;
  }
}
