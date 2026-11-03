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
const tree = (directory = root) => Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? Object.entries(tree(path.join(directory, entry.name)))
    : [[path.relative(root, path.join(directory, entry.name)), hash(fs.readFileSync(path.join(directory, entry.name)))]])
  .sort(([a], [b]) => a.localeCompare(b)));
const beforeTree = tree();
const snapshotNames = ['model.js', 'lesson.js', 'index.html', 'lesson.css', 'manifest.json', 'tools/browser.cjs'];
const sourceSnapshots = snapshotNames.map((file) => ({
  source: file, bytes: fs.readFileSync(path.join(root, ...file.split('/'))),
}));
const startedAtUtc = new Date().toISOString();
const steps = [];
const pageErrors = [];
const consoleErrors = [];
const requestedUrls = [];
let preflightRaw = Buffer.alloc(0);
let preflight = null;
let preflightInvocation = null;
let browserVersion = null;
let closeAwaited = false;
let pageClosed = false;
let failure = null;

async function observeDom(page, name) {
  const dom = await page.evaluate(() => ({
    title: document.title,
    banner: document.querySelector('.banner').textContent,
    status: document.getElementById('status').textContent,
    result: document.getElementById('status').dataset.result || null,
    metrics: document.getElementById('metrics').textContent,
    prediction: document.getElementById('prediction-result').textContent,
    access: document.getElementById('access-result').textContent,
    error: {
      hidden: document.getElementById('error').hidden,
      text: document.getElementById('error').textContent,
    },
    focus: document.activeElement.id || document.activeElement.tagName,
    comparison: Array.from(document.querySelectorAll('#comparison tr')).map((row) => ({
      property: row.dataset.property, cells: Array.from(row.cells).map((cell) => cell.textContent),
    })),
    history: Array.from(document.querySelectorAll('#history li')).map((row) => ({
      step: row.dataset.step, result: row.dataset.result, text: row.textContent,
    })),
    controls: Array.from(document.getElementById('rehearsal-form').elements).map((control) => ({
      id: control.id, value: control.value, disabled: control.disabled,
    })),
  }));
  steps.push({ name, observedAtUtc: new Date().toISOString(), dom });
  return dom;
}

async function exercise() {
  assert.match(process.version, /^v22\./, 'Node 22 test tooling only');
  const helper = fs.readFileSync(helperPath);
  assert.equal(hash(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(hash(Buffer.from(helper.toString('utf8').replace(/\r\n/g, '\n'))),
    '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  const packagePath = require.resolve('playwright/package.json', { paths: [path.join(repo, 'testing', 'browser')] });
  assert.equal(JSON.parse(fs.readFileSync(packagePath, 'utf8')).version, '1.56.1');
  const preflightCommand = [
    "$ErrorActionPreference='Stop'",
    "$p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'",
    '$s=Get-AuthenticodeSignature -FilePath $p',
    '[ordered]@{executable=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus="$($s.Status)";signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress',
  ].join('; ');
  preflightInvocation = ['pwsh.exe', '-NoProfile', '-NonInteractive', '-Command', preflightCommand];
  preflightRaw = execFileSync(preflightInvocation[0], preflightInvocation.slice(1), {
    cwd: repo, timeout: 30000,
  });
  preflight = JSON.parse(preflightRaw.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(preflight.signatureStatus, 'Valid');
  assert.match(preflight.signer, /CN=Microsoft Corporation/);
  assert.match(preflight.version, /^156\./);

  const { openIsolatedLesson } = require(helperPath);
  let session;
  try {
    session = await openIsolatedLesson('learning\\S105\\index.html');
    const page = session.page;
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, preflight.version);
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', (request) => requestedUrls.push(request.url()));
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('.banner').textContent(),
      'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#history li').count(), 0);
    assert.equal(await page.locator('#error').isVisible(), false);
    await observeDom(page, 'initial standalone DOM');

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#fixture').inputValue(), 'identity-denied');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'swap-values');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'observe-destination');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
    assert.equal(await page.locator('#history li').count(), 1);
    assert.match(await page.locator('#metrics').textContent(), /Attempted: 1; observed: 0; pending: 1; positive: 0/);
    const destinationValue = async (property) => page.locator(`[data-property="${property}"] td`).nth(3).textContent();
    assert.equal(await destinationValue('DISPLAY_LABEL'), 'candidate-v2');
    assert.equal(await destinationValue('DATA_ALIAS'), 'dataset-cedar');
    assert.equal(await destinationValue('identity'), 'principal-cedar');
    assert.equal(await destinationValue('network'), 'network-cedar');
    await observeDom(page, 'keyboard swap moves only the authored application value; access pending');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'negative');
    assert.match(await page.locator('#access-result').textContent(), /permission denied; path reachable/);
    assert.equal(await page.locator('#history li').count(), 2);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await observeDom(page, 'keyboard destination principal denial remains a negative attempt');

    async function run(fixture, prediction, result, label) {
      await page.locator('#fixture').selectOption(fixture);
      await page.locator('#prediction').selectOption(prediction);
      await page.locator('#swap-values').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
      await page.locator('#observe-destination').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), result);
      return observeDom(page, label);
    }
    await run('matched', 'destination-bound', 'positive', 'positive destination observation after explicit inspection');
    const blocked = await run('network-denied', 'destination-bound', 'negative', 'destination network blockage is not hidden by allowed permission');
    assert.match(blocked.access, /permission allowed; path blocked/);
    const unknown = await run('unobserved', 'destination-bound', 'unknown', 'missing destination observations stay unknown in retained counts');
    assert.match(unknown.access, /permission unknown; path unknown/);
    assert.match(unknown.metrics, /Attempted: 4; observed: 4; pending: 0; positive: 1; negative: 2; unknown: 1/);
    const wrong = await run('matched', 'all-follow-sender', 'negative', 'mistaken movement prediction fails separately from positive access');
    assert.match(wrong.prediction, /Prediction incorrect/);
    assert.match(wrong.status, /Separate destination access: positive/);
    assert.equal(wrong.history.length, 10);
    const retained = await page.locator('#history').textContent();
    const metrics = await page.locator('#metrics').textContent();

    await page.locator('#fixture').evaluate((select) => { select.value = 'not-a-fixture'; });
    await page.locator('#swap-values').click();
    assert.match(await page.locator('#error').textContent(), /^FIXTURE:/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
    assert.equal(await page.locator('#history').textContent(), retained);
    assert.equal(await page.locator('#metrics').textContent(), metrics);
    await observeDom(page, 'invalid DOM selection is announced; all earlier observations retained');

    await run('matched', 'destination-bound', 'positive', 'corrected selection recovers without discarding failed or unknown attempts');
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('#history li').count(), 12);
    for (const id of ['fixture', 'prediction', 'swap-values', 'observe-destination']) {
      assert.equal(await page.locator(`#${id}`).isDisabled(), true);
    }
    assert.match(await page.locator('#metrics').textContent(), /Attempted: 6; observed: 6; pending: 0; positive: 2; negative: 3; unknown: 1/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-lesson');
    await observeDom(page, 'six-rehearsal DOM bound leaves reset reachable');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#history li').count(), 0);
    assert.equal(await page.locator('#fixture').inputValue(), 'matched');
    assert.equal(await page.locator('#prediction').inputValue(), 'destination-bound');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    assert.equal(await destinationValue('DISPLAY_LABEL'), 'Not rehearsed');
    assert.equal(await page.locator('#status').getAttribute('data-result'), 'none');
    await observeDom(page, 'keyboard reset restores selections, table, counters, history and focus');

    await page.locator('#prediction').evaluate((select) => { select.value = 'not-a-prediction'; });
    await page.locator('#swap-values').click();
    assert.match(await page.locator('#error').textContent(), /^PREDICTION:/);
    assert.equal(await page.locator('#history li').count(), 0);
    await observeDom(page, 'invalid prediction produces an actual focused error without a fabricated result');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-lesson');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('#prediction').inputValue(), 'destination-bound');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await observeDom(page, 'keyboard reset from the error restores a clean initial lesson');

    const csp = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push({
        directive: event.effectiveDirective, blocked: event.blockedURI,
      }));
      globalThis.__s105InlineExecuted = false;
      globalThis.__s105HandlerExecuted = false;
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s105InlineExecuted = true;';
      document.body.append(script);
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('onclick', 'globalThis.__s105HandlerExecuted = true;');
      document.body.append(button);
      button.click();
      let connectionBlocked = false;
      try { await fetch('data:text/plain,synthetic-csp-observation'); } catch { connectionBlocked = true; }
      await new Promise((resolve) => setTimeout(resolve, 50));
      script.remove();
      button.remove();
      return {
        inlineExecuted: globalThis.__s105InlineExecuted,
        handlerExecuted: globalThis.__s105HandlerExecuted,
        connectionBlocked, violations,
        connectionTarget: 'data: URL only; no live socket, endpoint or network probe',
      };
    });
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.handlerExecuted, false);
    assert.equal(csp.connectionBlocked, true);
    assert.ok(csp.violations.some((entry) => entry.directive === 'script-src-elem'));
    assert.ok(csp.violations.some((entry) => entry.directive === 'script-src-attr'));
    assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src'));
    steps.push({ name: 'actual CSP blocks inline script, inline handler and data-URL connection without live networking', observedAtUtc: new Date().toISOString(), csp });

    await page.route('**/model.js', (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'load' });
    assert.match(await page.locator('#error').textContent(), /^MODEL_UNAVAILABLE:/);
    assert.equal(await page.locator('#error').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
    assert.match(await page.locator('#status').textContent(), /no synthetic result/);
    const disabled = await page.locator('#rehearsal-form').evaluate((element) => Array.from(element.elements).every((control) => control.disabled));
    assert.equal(disabled, true);
    assert.equal(await page.locator('#history li').count(), 0);
    await observeDom(page, 'actual missing-model load fails visibly with disabled controls and no success fallback');
    assert.deepEqual(pageErrors, []);
    assert.ok(requestedUrls.every((url) => url.startsWith('file:') || url.startsWith('data:')));
  } finally {
    if (session) {
      await session.close();
      closeAwaited = true;
      pageClosed = session.page.isClosed();
    }
  }
}

function publishCapture(report, stdout, stderr) {
  const evidence = path.join(root, 'evidence');
  let attempt = 1;
  while (fs.existsSync(path.join(evidence, `browser-${String(attempt).padStart(3, '0')}.json`))) attempt++;
  const name = `browser-${String(attempt).padStart(3, '0')}`;
  const rawRoot = path.join(evidence, 'raw', name);
  fs.mkdirSync(rawRoot, { recursive: true });
  const save = (file, bytes) => {
    fs.writeFileSync(path.join(rawRoot, `${file}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
    return { file: `raw/${name}/${file}.raw.gz`, sha256: hash(bytes), bytes: bytes.length };
  };
  const metadata = {
    stage: 'browser', name, outcome: report.outcome, startedAtUtc, finishedAtUtc: report.finishedAtUtc,
    command: [process.execPath, __filename], runtime: process.version, browserVersion,
    playwright: '1.56.1', helperSource: '53c0c0d',
    helperWorkingSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
    closeAwaited, pageClosed, ownedTreeUnchangedBeforeCapture: report.ownedTreeUnchangedBeforeCapture,
    nodeProduction24Validated: false, nativeValidated: false, additionalKanoCredits: 0,
    stdout: save('stdout', stdout), stderr: save('stderr', stderr),
    preflight: save('signed-edge-preflight', preflightRaw),
    transcript: save('observations', Buffer.from(`${JSON.stringify(report, null, 2)}\n`)),
    snapshots: sourceSnapshots.map((entry) => ({
      source: entry.source, ...save(entry.source.replaceAll('/', '--'), entry.bytes),
    })),
    captureAuthorization: 'Explicit CAPTURE_BROWSER_EVIDENCE=1 only; append-only; normal verification is read-only.',
  };
  fs.writeFileSync(path.join(evidence, `${name}.json`), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
}

(async () => {
  try {
    await exercise();
    assert.equal(closeAwaited, true);
    assert.equal(pageClosed, true);
    assert.deepEqual(tree(), beforeTree, 'Normal checks must not modify the owned lesson or evidence.');
  } catch (error) {
    failure = error;
  }
  const ownedTreeUnchangedBeforeCapture = JSON.stringify(tree()) === JSON.stringify(beforeTree);
  const report = {
    cardId: 'A-S105', workerId: 'worker-A-S105', packet: 'SC-S105', kanoUnit: 'A-S105',
    outcome: failure ? 'failed' : 'passed', startedAtUtc, finishedAtUtc: new Date().toISOString(),
    node: process.version, playwright: '1.56.1', browserVersion, preflight, preflightInvocation,
    steps, pageErrors, consoleErrors, requestedUrls,
    closeAwaited, pageClosed, ownedTreeUnchangedBeforeCapture,
    cleanupScope: 'Awaited published helper close and observed the owned page closed. No unrelated process/profile cleanup; overall helper lifecycle remains unqualified.',
    failure: failure ? { name: failure.name, message: failure.message, stack: failure.stack } : null,
    qualification: 'Actual local DOM/CSP/keyboard checks only. All displayed settings, principals, networks, swaps and access observations remain fictional DATA ONLY; no native, source-parent or production Node 24 validation.',
  };
  const stdout = Buffer.from(`${JSON.stringify({
    outcome: report.outcome, browserVersion, playwright: '1.56.1', node: process.version,
    observedChecks: steps.map((step) => step.name),
    closeAwaited, pageClosed, ownedTreeUnchangedBeforeCapture, deliberateCapture: capture,
  }, null, 2)}\n`);
  const stderr = Buffer.from(failure ? `${failure.stack}\n` : '');
  if (capture) publishCapture(report, stdout, stderr);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (failure) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
