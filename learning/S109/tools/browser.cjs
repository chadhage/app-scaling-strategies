'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function tree(directory = root) {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? Object.entries(tree(path.join(directory, entry.name)))
      : [[path.relative(root, path.join(directory, entry.name)), hash(fs.readFileSync(path.join(directory, entry.name)))]]));
}
const beforeTree = tree();
const sourceNames = ['model.js', 'lesson.js', 'index.html', 'lesson.css', 'manifest.json', 'lesson.feature',
  'tests\\model.test.cjs', 'tests\\integrity.test.cjs', 'tools\\browser.cjs', 'tools\\syntax.cjs', 'tools\\canonical.cjs'];
const sourceBytes = sourceNames.map((source) => ({ source, bytes: fs.readFileSync(path.join(root, source)) }));
const startedAtUtc = new Date().toISOString();
const steps = [];
const requestedUrls = [];
const requestFailures = [];
const pageErrors = [];
const consoleErrors = [];
let preflightRaw = Buffer.alloc(0);
let preflight = null;
let preflightInvocation = null;
let browserVersion = null;
let closeAwaited = false;
let pageClosed = false;
let failure = null;

async function observe(page, name, extra = {}) {
  const dom = await page.evaluate(() => ({
    title: document.title,
    banner: document.querySelector('.banner').textContent,
    status: document.getElementById('status').textContent,
    result: document.getElementById('status').dataset.result,
    counters: document.getElementById('counters').textContent,
    summary: document.getElementById('summary').textContent,
    metrics: document.getElementById('metrics').textContent,
    capacity: document.getElementById('capacity-result').textContent,
    journey: document.getElementById('journey-result').textContent,
    syntheticSnat: document.getElementById('synthetic-snat').textContent,
    nativeSnat: document.getElementById('native-snat').textContent,
    error: { hidden: document.getElementById('error').hidden, text: document.getElementById('error').textContent },
    bootError: { hidden: document.getElementById('boot-error').hidden, text: document.getElementById('boot-error').textContent },
    focus: document.activeElement.id || document.activeElement.className || document.activeElement.tagName,
    history: Array.from(document.querySelectorAll('#history li')).map((item) => ({
      result: item.dataset.result, action: item.dataset.action, text: item.textContent,
    })),
    controls: Array.from(document.getElementById('rehearsal-form').elements).map((control) => ({
      id: control.id, value: control.value, disabled: control.disabled,
    })),
    formResetType: typeof document.getElementById('rehearsal-form').reset,
  }));
  steps.push({ name, observedAtUtc: new Date().toISOString(), dom, ...extra });
  return dom;
}

async function exercise() {
  assert.match(process.version, /^v22\./, 'Local Node 22 test tooling only.');
  const helper = fs.readFileSync(helperPath);
  assert.equal(hash(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(hash(Buffer.from(helper.toString('utf8').replace(/\r\n/g, '\n'))),
    '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  const packagePath = require.resolve('playwright/package.json', { paths: [path.join(repo, 'testing', 'browser')] });
  assert.equal(JSON.parse(fs.readFileSync(packagePath, 'utf8')).version, '1.56.1');
  const command = [
    "$ErrorActionPreference='Stop'",
    "$p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'",
    '$s=Get-AuthenticodeSignature -FilePath $p',
    '[ordered]@{executable=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus="$($s.Status)";signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress',
  ].join('; ');
  preflightInvocation = ['pwsh.exe', '-NoProfile', '-NonInteractive', '-Command', command];
  preflightRaw = execFileSync(preflightInvocation[0], preflightInvocation.slice(1), { cwd: repo, timeout: 30000 });
  preflight = JSON.parse(preflightRaw.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(preflight.signatureStatus, 'Valid');
  assert.match(preflight.signer, /CN=Microsoft Corporation/);
  assert.match(preflight.version, /^156\./);

  const { openIsolatedLesson } = require(helperPath);
  let session;
  try {
    session = await openIsolatedLesson('learning\\S109\\index.html');
    const page = session.page;
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, preflight.version);
    page.on('request', (request) => requestedUrls.push({ url: request.url(), method: request.method() }));
    page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure() }));
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('.banner').textContent(),
      'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#boot-error').isVisible(), false);
    assert.equal(await page.locator('#history li').count(), 0);
    const initial = await observe(page, 'initial standalone DOM with no inferred native evidence');
    assert.equal(initial.formResetType, 'function');
    assert.match(initial.nativeSnat, /Native Azure SNAT: unverified/);

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'level');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#level').inputValue(), 'raised');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'strategy');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'rehearse');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inspect');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'pending');
    assert.match(await page.locator('#summary').textContent(), /demand: 96; strategy: direct; connections: 96/);
    assert.match(await page.locator('#metrics').textContent(), /not inspected/);
    assert.equal(await page.locator('#history li').count(), 1);
    await observe(page, 'keyboard raised-demand command remains pending until inspection');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'level');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'negative');
    assert.match(await page.locator('#metrics').textContent(), /model ports: 96; model capacity: 64/);
    assert.match(await page.locator('#metrics').textContent(), /completed: 12; failed: 8; p95 latency: 240 ms/);
    await observe(page, 'keyboard inspection measures negative fictional capacity and interrupted journeys');

    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'not-a-fixture';
      option.textContent = 'Invalid fixture';
      document.getElementById('level').append(option);
      document.getElementById('level').value = option.value;
      document.getElementById('rehearsal-form').requestSubmit(document.getElementById('rehearse'));
    });
    assert.equal(await page.locator('#error').isVisible(), true);
    assert.match(await page.locator('#error').textContent(), /Action rejected/);
    assert.equal(await page.locator('#history li').count(), 2);
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'negative');
    assert.equal(await page.locator('#level').getAttribute('aria-invalid'), 'true');
    await observe(page, 'invalid typed choice exposes error and preserves prior negative history');

    async function run(level, strategy, verdict, name) {
      await page.locator('#level').selectOption(level);
      await page.locator('#strategy').selectOption(strategy);
      await page.locator('#rehearse').click();
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('#status').getAttribute('data-result'), 'pending');
      await page.locator('#inspect').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), verdict);
      assert.match(await page.locator('#native-snat').textContent(), /Native Azure SNAT: unverified/);
      return observe(page, name);
    }
    const pooled = await run('raised', 'pooled', 'positive', 'same raised demand pooled: positive synthetic result, native SNAT unverified');
    assert.match(pooled.metrics, /model ports: 24; model capacity: 64/);
    assert.match(pooled.metrics, /completed: 20; failed: 0; p95 latency: 90 ms/);
    const missing = await run('missing', 'pooled', 'unknown', 'missing capacity and journeys stay unknown despite nominal counts');
    assert.match(missing.metrics, /model capacity: not observed/);
    assert.match(missing.metrics, /completed: not observed; failed: not observed; p95 latency: not observed/);
    const ceiling = await run('ceiling', 'pooled', 'negative', 'positive port headroom cannot hide negative journey budget');
    assert.match(ceiling.capacity, /gate: positive/);
    assert.match(ceiling.journey, /gate: negative/);
    assert.match(ceiling.metrics, /failed: 4; p95 latency: 175 ms/);
    await run('baseline', 'direct', 'positive', 'baseline reference observed rather than assumed');
    const full = await run('raised', 'direct', 'negative', 'six-attempt bound retains all twelve history events');
    assert.equal(full.history.length, 12);
    assert.match(full.counters, /positive: 2; negative: 3; unknown: 1; pending: 0/);
    assert.equal(await page.locator('#level').isDisabled(), true);
    assert.equal(await page.locator('#inspect').isDisabled(), true);
    assert.equal(full.focus, 'reset-lesson');
    await page.evaluate(() => {
      for (const id of ['level', 'strategy', 'rehearse']) document.getElementById(id).disabled = false;
      document.getElementById('rehearsal-form').requestSubmit(document.getElementById('rehearse'));
    });
    assert.match(await page.locator('#error').textContent(), /Six-attempt limit reached/);
    assert.equal(await page.locator('#history li').count(), 12);
    assert.equal(await page.locator('#rehearse').isDisabled(), true);
    await observe(page, 'state guard rejects programmatic attempt beyond disabled controls without erasing outcomes');
    await page.keyboard.press('Enter');
    const reset = await observe(page, 'keyboard explicit reset clears errors/history and restores defaults and focus');
    assert.equal(reset.focus, 'level');
    assert.equal(reset.history.length, 0);
    assert.equal(reset.error.hidden, true);
    assert.equal(await page.locator('#level').inputValue(), 'baseline');
    assert.equal(await page.locator('#strategy').inputValue(), 'direct');
    assert.match(reset.counters, /Attempts: 0 \/ 6; positive: 0; negative: 0; unknown: 0; pending: 0/);
    assert.equal(await page.locator('#inspect').isDisabled(), true);
    assert.equal(pageErrors.length, 0);
    assert.equal(consoleErrors.length, 0);

    const csp = await page.evaluate(async () => {
      window.s109CspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        window.s109CspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI }));
      const script = document.createElement('script');
      script.textContent = 'window.s109InlineExecuted = true';
      document.head.append(script);
      const button = document.createElement('button');
      button.setAttribute('onclick', 'window.s109HandlerExecuted = true');
      document.body.append(button);
      button.click();
      let fetchRejected = false;
      try { await window.fetch(window.location.href); } catch { fetchRejected = true; }
      script.remove();
      button.remove();
      return { inlineExecuted: window.s109InlineExecuted === true, handlerExecuted: window.s109HandlerExecuted === true, fetchRejected };
    });
    await page.waitForFunction(() => ['script-src-elem', 'script-src-attr', 'connect-src']
      .every((directive) => window.s109CspViolations.some((event) => event.directive === directive)));
    const violations = await page.evaluate(() => window.s109CspViolations);
    assert.deepEqual(csp, { inlineExecuted: false, handlerExecuted: false, fetchRejected: true });
    await observe(page, 'actual CSP blocks inline script/handler and local-file fetch before any socket', { csp, violations });

    await page.route('**/model.js', (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'load' });
    const modelFailure = await observe(page, 'actual missing model resource fails closed with visible error and disabled controls');
    assert.equal(modelFailure.bootError.hidden, false);
    assert.match(modelFailure.bootError.text, /local model script is unavailable/);
    assert.ok(modelFailure.controls.every((control) => control.disabled));
    assert.equal(modelFailure.history.length, 0);
    await page.unroute('**/model.js');
    await page.route('**/lesson.js', (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'load' });
    const controllerFailure = await observe(page, 'actual missing controller resource retains static unavailable error and disabled controls');
    assert.equal(controllerFailure.bootError.hidden, false);
    assert.ok(controllerFailure.controls.every((control) => control.disabled));
    assert.equal(controllerFailure.history.length, 0);
    await page.unroute('**/lesson.js');
    await page.reload({ waitUntil: 'load' });
    const recovered = await observe(page, 'owned resource failure recovery reload restores clean lesson without claiming prior results');
    assert.equal(recovered.bootError.hidden, true);
    assert.equal(recovered.history.length, 0);
    assert.equal(await page.locator('#level').isDisabled(), false);
    assert.equal(pageErrors.length, 0);
    assert.ok(requestedUrls.every(({ url }) => new URL(url).protocol === 'file:'), 'No HTTP/WebSocket/actual connection load.');
  } finally {
    if (session) {
      await session.close();
      closeAwaited = true;
      pageClosed = session.page.isClosed();
    }
  }
}

async function main() {
  try { await exercise(); } catch (error) { failure = String(error.stack || error); }
  const afterTree = tree();
  try { assert.deepEqual(afterTree, beforeTree, 'Normal exercise must not modify any owned files or proof.'); }
  catch (error) { failure = `${failure || ''}\n${error.stack}`; }
  const record = {
    schemaVersion: 1, cardId: 'A-S109', workerId: 'worker-A-S109',
    mode: 'synthetic', status: failure ? 'failed' : 'passed', startedAtUtc, finishedAtUtc: new Date().toISOString(),
    runtime: process.version, playwrightVersion: '1.56.1', helperCommit: '53c0c0d',
    helperWorkingSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
    preflightInvocation, preflight, browserVersion, steps, requestedUrls, requestFailures, pageErrors, consoleErrors,
    cleanup: { closeAwaited, pageClosed }, ownedFilesUnchangedDuringVerification: JSON.stringify(afterTree) === JSON.stringify(beforeTree),
    nativeSnat: 'unverified', nativeAzureValidated: false, productionNode24Validated: false,
    sourceParentComplete: false, additionalKanoCredits: 0, failure,
  };
  if (capture) {
    const evidence = path.join(root, 'evidence');
    let index = 1;
    while (fs.existsSync(path.join(evidence, `browser-${String(index).padStart(3, '0')}.json`))) index++;
    const name = `browser-${String(index).padStart(3, '0')}`;
    function raw(label, bytes) {
      const file = path.join('raw', name, `${label}.raw.gz`);
      const target = path.join(evidence, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, gzipSync(bytes), { flag: 'wx' });
      return { file, sha256: hash(bytes), bytes: bytes.length, crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length };
    }
    record.preflightStdout = raw('preflight-stdout', preflightRaw);
    record.rawObservations = raw('actual-dom-observations', Buffer.from(JSON.stringify(steps)));
    record.snapshots = sourceBytes.map(({ source, bytes }) => ({ source, ...raw(source.replace(/[\\/.]/g, '-'), bytes) }));
    const target = path.join(evidence, `${name}.json`);
    fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    console.log(`Deliberate append-only browser evidence: ${path.relative(repo, target)}`);
  }
  if (failure) { console.error(failure); process.exitCode = 1; }
  else console.log(`Browser PASS: ${steps.length} DOM observations; keyboard/error/reset/failure/CSP; awaited close. ${capture ? 'Captured deliberately.' : 'Read-only; no proof written.'}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
