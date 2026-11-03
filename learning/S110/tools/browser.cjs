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
    : [[path.relative(root, path.join(directory, entry.name)), hash(fs.readFileSync(path.join(directory, entry.name)))]]).sort());
const beforeTree = tree();
const snapshotNames = Object.keys(beforeTree).filter((file) => !file.startsWith(`evidence${path.sep}`));
const snapshots = snapshotNames.map((source) => ({ source, bytes: fs.readFileSync(path.join(root, source)) }));
const startedAtUtc = new Date().toISOString();
const steps = [];
const pageErrors = [];
const consoleErrors = [];
const requestedUrls = [];
let preflightRaw = Buffer.alloc(0);
let preflight = null;
let browserVersion = null;
let closeAwaited = false;
let pageClosed = false;
let csp = null;

async function observe(page, name) {
  const dom = await page.evaluate(() => {
    const text = (id) => document.getElementById(id).textContent;
    return {
      title: document.title,
      banner: document.querySelector('.banner').textContent,
      status: { text: text('status'), result: document.getElementById('status').dataset.result },
      nominal: text('nominal'),
      propagation: text('propagation-gate'), drain: text('drain-gate'), journeys: text('journey-gate'),
      oldOrigin: text('old-origin'), decision: text('decision'), metrics: text('metrics'),
      coverage: text('coverage'), historyCount: text('history-count'),
      rows: Array.from(document.querySelectorAll('#samples tr')).map((row) =>
        ({ pop: row.dataset.pop, cells: Array.from(row.cells).map((cell) => cell.textContent) })),
      history: Array.from(document.querySelectorAll('#history li')).map((item) =>
        ({ action: item.dataset.action, result: item.dataset.result, text: item.textContent })),
      error: { hidden: document.getElementById('error').hidden, text: text('error') },
      focus: document.activeElement.id || document.activeElement.className || document.activeElement.tagName,
      controls: Array.from(document.getElementById('operator-form').elements).map((control) =>
        ({ id: control.id, name: control.name, value: control.value, disabled: control.disabled })),
      nativeResetType: typeof document.getElementById('operator-form').reset,
    };
  });
  steps.push({ name, observedAtUtc: new Date().toISOString(), dom });
  return dom;
}

async function exercise() {
  assert.match(process.version, /^v22\./, 'This run qualifies Node 22 test tooling only.');
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
  preflightRaw = execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', preflightCommand],
    { cwd: repo, timeout: 30000 });
  preflight = JSON.parse(preflightRaw.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(preflight.signatureStatus, 'Valid');
  assert.match(preflight.signer, /CN=Microsoft Corporation/);
  assert.match(preflight.version, /^156\./);

  const { openIsolatedLesson } = require(helperPath);
  let session;
  try {
    session = await openIsolatedLesson('learning\\S110\\index.html');
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, preflight.version);
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', (request) => requestedUrls.push(request.url()));
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.title(), 'S110 — Edge propagation rehearsal');
    assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    const initial = await observe(page, 'initial standalone DOM');
    assert.equal(initial.history.length, 0);
    assert.equal(initial.nativeResetType, 'function');
    assert.equal(initial.error.hidden, true);
    assert.equal(initial.rows.length, 3);
    assert.ok(initial.rows.every((row) => row.cells[1] === 'UNKNOWN' && row.cells[2] === 'UNKNOWN'));

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#fixture').inputValue(), 'partial');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'propagate-edge');
    await page.keyboard.press('Enter');
    let dom = await observe(page, 'keyboard nominal change leaves observed gates unknown');
    assert.match(dom.nominal, /Epoch 2; 100% to origin-v2/);
    assert.equal(dom.propagation, 'UNKNOWN');
    assert.equal(dom.drain, 'UNKNOWN');
    assert.equal(dom.status.result, 'unknown');
    assert.equal(dom.focus, 'sample-pops');
    assert.equal(dom.history.length, 1);

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'retire-safely');
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard nominal-only retirement is unverified and retained');
    assert.equal(dom.decision, 'UNVERIFIED');
    assert.equal(dom.status.result, 'unknown');
    assert.match(dom.oldOrigin, /^RETAINED.*UNKNOWN/);
    assert.equal(dom.history.length, 2);
    assert.equal(dom.focus, 'sample-pops');
    const prematureHistory = structuredClone(dom.history);

    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard stale effective route is measured despite 100 percent desired');
    assert.equal(dom.propagation, 'NEGATIVE');
    assert.equal(dom.drain, 'NEGATIVE');
    assert.equal(dom.journeys, 'POSITIVE');
    assert.equal(dom.rows[1].cells[1], '1');
    assert.equal(dom.rows[1].cells[2], 'origin-v1');
    assert.match(dom.metrics, /successful: 3; interrupted: 0; unknown: 0; pending: 0; migrated: 2\/3/);
    assert.equal(dom.focus, 'retire-safely');
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard negative retirement retains origin and premature history');
    assert.equal(dom.status.result, 'negative');
    assert.equal(dom.decision, 'BLOCKED');
    assert.match(dom.oldOrigin, /^RETAINED.*work: 1/);
    assert.deepEqual(dom.history.slice(0, 2), prematureHistory);
    assert.equal(dom.history.length, 4);
    assert.equal(dom.focus, 'fixture');

    async function run(fixture, result, label) {
      const prior = await page.locator('#history li').allTextContents();
      await page.locator('#fixture').selectOption(fixture);
      await page.locator('#propagate-edge').click();
      assert.equal(await page.locator('#status').getAttribute('data-result'), 'unknown');
      await page.locator('#sample-pops').click();
      assert.match(await page.locator('#old-origin').textContent(), /^RETAINED/);
      if (fixture === 'converged') {
        const observed = await observe(page, 'positive sampled gates do not retire before operator check');
        assert.equal(observed.status.result, 'positive');
        assert.equal(observed.decision, 'NOT-CHECKED');
        assert.match(observed.metrics, /successful: 3; interrupted: 0; unknown: 0; pending: 0; migrated: 3\/3/);
      }
      await page.locator('#retire-safely').click();
      const observed = await observe(page, label);
      assert.equal(observed.status.result, result);
      assert.deepEqual(observed.history.slice(0, prior.length).map((item) => item.text), prior);
      assert.match(observed.coverage, /exactly three authored.*not global convergence/);
      return observed;
    }
    dom = await run('converged', 'positive', 'positive fixture-scoped retirement');
    assert.equal(dom.decision, 'RETIRED');
    assert.match(dom.oldOrigin, /^RETIRED.*work: 0/);
    assert.match(dom.status.text, /within this fixture/);
    dom = await run('missing', 'unknown', 'missing POP and old work remain unknown');
    assert.equal(dom.decision, 'UNVERIFIED');
    assert.match(dom.metrics, /observed: 2; successful: 2; interrupted: 0; unknown: 1/);
    assert.equal(dom.rows[2].cells[2], 'UNKNOWN');
    assert.match(dom.oldOrigin, /^RETAINED.*UNKNOWN/);
    dom = await run('draining', 'negative', 'converged routing cannot replace observed old-work drain');
    assert.equal(dom.propagation, 'POSITIVE');
    assert.equal(dom.drain, 'NEGATIVE');
    assert.match(dom.oldOrigin, /^RETAINED.*work: 2/);
    dom = await run('slow', 'negative', 'latency interruption survives positive routing and drain');
    assert.equal(dom.propagation, 'POSITIVE');
    assert.equal(dom.drain, 'POSITIVE');
    assert.equal(dom.journeys, 'NEGATIVE');
    assert.equal(dom.rows[1].cells[3], '200');
    assert.equal(dom.rows[1].cells[4], '180 / 120');
    assert.match(dom.metrics, /successful: 2; interrupted: 1/);
    dom = await run('failed', 'negative', 'failed request survives positive routing and drain');
    assert.equal(dom.rows[1].cells[3], '503');
    assert.equal(dom.journeys, 'NEGATIVE');
    assert.match(dom.oldOrigin, /^RETAINED/);
    assert.match(dom.metrics, /successful: 2; interrupted: 1/);
    assert.match(dom.historyCount, /19 events; 6\/6 runs/);
    assert.equal(await page.locator('#propagate-edge').isDisabled(), true);
    const cappedHistory = structuredClone(dom.history);
    await page.evaluate(() => { document.getElementById('propagate-edge').disabled = false; });
    await page.locator('#propagate-edge').click();
    dom = await observe(page, 'tampered enabled seventh-run control is rejected without mutation');
    assert.equal(dom.error.hidden, false);
    assert.match(dom.error.text, /six-run limit/);
    assert.equal(dom.focus, 'error');
    assert.deepEqual(dom.history, cappedHistory);
    assert.equal(dom.status.result, 'negative');

    await page.locator('#restart-lesson').focus();
    await page.keyboard.press('Enter');
    dom = await observe(page, 'keyboard reset clears state history error and restores selector focus');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.error.hidden, true);
    assert.equal(dom.focus, 'fixture');
    assert.equal(await page.locator('#fixture').inputValue(), 'converged');
    assert.equal(dom.decision, 'NOT-CHECKED');
    assert.equal(dom.status.result, 'unknown');
    assert.match(dom.historyCount, /^0 events; 0\/6 runs/);
    assert.equal(dom.nativeResetType, 'function');

    await page.evaluate(() => { document.getElementById('fixture').value = ''; });
    await page.locator('#propagate-edge').click();
    dom = await observe(page, 'malformed selection produces focused error without applying action');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.error.hidden, false);
    assert.match(dom.error.text, /Choose one of the six fixed fictional traces/);
    assert.equal(dom.focus, 'error');
    assert.equal(dom.status.result, 'unknown');
    await page.locator('#restart-lesson').click();
    await page.evaluate(() => { document.getElementById('sample-pops').disabled = false; });
    await page.locator('#sample-pops').click();
    dom = await observe(page, 'tampered out-of-order sample is rejected by state guard');
    assert.equal(dom.history.length, 0);
    assert.match(dom.error.text, /Sample once, after rehearsing a change/);
    assert.equal(dom.focus, 'error');
    await page.locator('#restart-lesson').click();

    await page.evaluate(async () => {
      globalThis.__s110CspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s110CspViolations.push({
          effectiveDirective: event.effectiveDirective, violatedDirective: event.violatedDirective,
          blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      const inline = document.createElement('script');
      inline.textContent = 'globalThis.__s110InlineExecuted = true;';
      document.body.append(inline);
      inline.remove();
      try {
        await fetch('data:text/plain,synthetic-CSP-check');
        globalThis.__s110Connect = 'unexpected success';
      } catch (error) {
        globalThis.__s110Connect = { name: error.name, message: error.message };
      }
    });
    await page.waitForFunction(() => globalThis.__s110CspViolations.some((event) => event.effectiveDirective === 'connect-src')
      && globalThis.__s110CspViolations.some((event) => event.effectiveDirective.startsWith('script-src')));
    csp = await page.evaluate(() => ({
      inlineExecuted: globalThis.__s110InlineExecuted === true,
      connection: globalThis.__s110Connect, violations: globalThis.__s110CspViolations,
    }));
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.connection.name, 'TypeError');
    assert.ok(csp.violations.some((event) => event.blockedURI === 'inline' && event.disposition === 'enforce'));
    assert.ok(csp.violations.some((event) => event.effectiveDirective === 'connect-src' && event.disposition === 'enforce'));
    dom = await observe(page, 'actual CSP blocks inline execution and data connection without network');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.error.hidden, true);
    assert.deepEqual(pageErrors, []);
    assert.ok(consoleErrors.length >= 2);
    assert.ok(consoleErrors.every((message) => /Content Security Policy/i.test(message)));
    assert.ok(requestedUrls.every((url) => url.startsWith('file:')), 'Only local lesson asset requests are observed.');
  } finally {
    if (session) {
      await session.close();
      closeAwaited = true;
      pageClosed = session.page.isClosed();
      assert.equal(pageClosed, true);
    }
  }
}

async function main() {
  let failure = null;
  try { await exercise(); } catch (error) { failure = { name: error.name, message: error.message, stack: error.stack }; }
  const unchanged = JSON.stringify(beforeTree) === JSON.stringify(tree());
  if (!unchanged && !failure) failure = { name: 'IntegrityError', message: 'Verification changed lesson or historical proof bytes.' };
  const report = {
    schemaVersion: 1, cardId: 'A-S110', workerId: 'worker-A-S110', packet: 'SC-S110',
    mode: 'synthetic', status: failure ? 'failed' : 'passed',
    startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
    playwright: '1.56.1', browserVersion, preflight,
    helperWorkingSha256: hash(fs.readFileSync(helperPath)),
    helperCanonicalGitSha256: '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0',
    captureEnabled: capture, lessonAndHistoryUnchangedBeforeCapture: unchanged,
    closeAwaited, pageClosed, pageErrors, consoleErrors, requestedUrls, csp, steps, failure,
    nativeProof: false, sourceParentComplete: false, additionalKanoCredits: 0,
  };
  if (capture) {
    const evidence = path.join(root, 'evidence');
    const number = fs.readdirSync(evidence).filter((file) => /^browser-\d{3}\.json$/.test(file)).length + 1;
    const stage = `browser-${String(number).padStart(3, '0')}`;
    const raw = (name, bytes) => {
      const file = path.join('raw', stage, `${name}.raw.gz`);
      fs.mkdirSync(path.dirname(path.join(evidence, file)), { recursive: true });
      fs.writeFileSync(path.join(evidence, file), gzipSync(bytes, { mtime: 0 }));
      return { file, sha256: hash(bytes), bytes: bytes.length, crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length };
    };
    report.preflightRaw = raw('signed-edge-preflight', preflightRaw);
    report.snapshots = snapshots.map(({ source, bytes }) =>
      ({ source, ...raw(source.replace(/[\\.]/g, '-'), bytes), lfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) }));
    const rawReport = raw('observations', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
    const persisted = JSON.stringify({ ...report, rawReport }, null, 2) + '\n';
    fs.writeFileSync(path.join(evidence, `${stage}.json`), persisted);
    fs.writeFileSync(path.join(evidence, 'browser.json'), persisted);
  }
  console.log(JSON.stringify({
    status: report.status, observations: steps.length, runtime: process.version,
    playwright: report.playwright, browserVersion, signedEdge: preflight && preflight.signatureStatus,
    cspEnforced: Boolean(csp && !csp.inlineExecuted && csp.connection.name === 'TypeError'),
    closeAwaited, pageClosed, lessonAndHistoryUnchanged: unchanged,
    captureEnabled: capture, historicalEvidenceWritten: capture, failure,
  }, null, 2));
  if (failure) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
