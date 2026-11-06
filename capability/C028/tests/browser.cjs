'use strict';

// Test tooling, not production code: a real isolated headless Edge observation of the C028 transcript page.
// Browsers cannot speak native gRPC and the isolated helper allows only same-origin read-only GET, so the browser observes
// a transcript that the server produced from a real server-side gRPC conversation, never gRPC itself.
// Nothing is written unless CAPTURE_BROWSER_EVIDENCE=1.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const approved = require('../../C001/approved-contract.js');
const { startLocal } = require('../server.cjs');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const QUALIFIED_MAJOR = '156';
const record = {
  schemaVersion: 1, cardId: 'C028', kind: 'isolated-headless-edge-grpc-transcript-page', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  testRuntime: process.version, businessData: 'synthetic', browserNativeGrpcObserved: false,
  limits: ['Browsers cannot speak native gRPC and the isolated helper allows only same-origin read-only GET: the browser observed a server-produced transcript, not gRPC.'],
  integratedForegroundBrowserUsed: false, checks: [], cleanup: { listenersClosed: false, browserClosed: false }
};

function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}

function signedEdge() {
  const script = "$ErrorActionPreference='Stop';$edge=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft\\Edge\\Application\\msedge.exe'))|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1;$s=Get-AuthenticodeSignature -LiteralPath $edge;[ordered]@{path=$edge;status=[string]$s.Status;signer=$s.SignerCertificate.Subject;fileVersion=(Get-Item -LiteralPath $edge).VersionInfo.FileVersion;sha256=(Get-FileHash -LiteralPath $edge -Algorithm SHA256).Hash.ToLower()}|ConvertTo-Json -Compress";
  return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true }));
}

async function main() {
  let local;
  let session;
  let failure;
  try {
    const edge = signedEdge();
    assert.equal(edge.status, 'Valid');
    assert.match(edge.signer, /Microsoft Corporation/);
    assert.equal(edge.fileVersion.split('.')[0], QUALIFIED_MAJOR, 'the installed Edge must stay within the qualified major version');
    record.signedEdge = edge;
    checked('the installed Edge is Microsoft-signed and within the qualified major version', { version: edge.fileVersion, sha256: edge.sha256 });

    local = await startLocal({ readLedger: () => JSON.stringify({ approvals: { C001: approved.approval } }) });
    const origin = `http://127.0.0.1:${local.web.address().port}`;
    record.listeners = { pid: process.pid, page: origin, grpc: local.grpc.origin, ownership: 'this process, exact returned servers' };
    session = await openIsolatedLoopback(path.join('capability', 'C028', 'index.html'), local.web);
    record.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion.split('.')[0], QUALIFIED_MAJOR);
    record.playwrightVersion = require(path.join(repositoryRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    const { page } = session;
    const pageErrors = [];
    const consoleErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
    page.on('websocket', (socket) => requests.push({ method: 'WEBSOCKET', url: socket.url() }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('load').disabled);
    assert.match(await page.locator('#status').textContent(), /^Not run/);
    assert.match(await page.locator('main').textContent(), /Synthetic business data · Loopback only/);
    assert.match(await page.locator('#limit').textContent(), /This page does not speak gRPC/);
    assert.equal(await page.locator('#calls > section').count(), 0);
    checked('initial state shows no observation and states that browsers cannot speak native gRPC', await page.locator('#status').textContent());

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'load');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED LOCAL TRANSCRIPT'));
    const status = await page.locator('#status').textContent();
    assert.match(status, /7 calls, 14 messages, 3 refused probes\. The browser observed this transcript, not native gRPC\.$/);
    const summary = JSON.parse(await page.locator('#summary').textContent());
    assert.deepEqual(summary.outcomes, [
      'watch-ok: ok / OK', 'chat-ok: ok / OK', 'watch-cancelled: cancelled / CANCELLED', 'watch-deadline: deadline-exceeded / DEADLINE_EXCEEDED',
      'unknown-method: server-error / UNIMPLEMENTED', 'invalid-argument: server-error / INVALID_ARGUMENT', 'message-too-large: protocol-violation / RESOURCE_EXHAUSTED']);
    const sections = page.locator('#calls > section');
    assert.equal(await sections.count(), 7);
    const first = await sections.nth(0).textContent();
    for (const needle of ['"seq":1', '"seq":5', '{"grpc-status":"0"}', 'OK (0) from server-trailers', 'application/grpc']) assert.ok(first.includes(needle), needle);
    const cancelled = await sections.nth(2).textContent();
    assert.match(cancelled, /CANCELLED \(1\) from client-cancel; server: CANCELLED via client-reset, produced 3/);
    assert.match(await sections.nth(3).textContent(), /DEADLINE_EXCEEDED \(4\) from server-trailers; server: DEADLINE_EXCEEDED via deadline, produced 3/);
    assert.match(await sections.nth(4).textContent(), /UNIMPLEMENTED \(12\) from server-trailers/);
    assert.match(await sections.nth(6).textContent(), /MESSAGE_TOO_LARGE/);
    assert.equal(await page.locator('#probes tr').count(), 3);
    assert.match(await page.locator('#probes').textContent(), /HTTP\/1\.1 505/);
    assert.equal(await page.locator('#load').isEnabled(), true);
    checked('real Tab/Enter loads the transcript; the page verified it and shows order, status, trailers, a cancelled and a deadline-exceeded call', { status, summary: summary.outcomes });
    if (capture) {
      const folder = path.join(__dirname, '..', 'evidence', 'raw', `browser-${randomUUID()}`);
      fs.mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: path.join(folder, 'browser-transcript.png'), fullPage: true });
      record.evidenceFolder = path.relative(repositoryRoot, folder);
    }

    const direct = await page.evaluate(async (target) => {
      try {
        await fetch(`${target}/acme.ticker.v1.Ticker/Watch`, { method: 'POST', headers: { 'content-type': 'application/grpc' }, body: new Uint8Array(5) });
        return 'answered';
      } catch {
        return 'blocked';
      }
    }, local.grpc.origin);
    assert.equal(direct, 'blocked');
    checked('the isolated browser cannot reach the gRPC listener at all: a native gRPC call from the page is blocked', direct);

    const real = await page.evaluate(async () => (await fetch('/transcript.json')).json());
    const tampers = [
      ['a forged sequence number', (value) => { value.calls[0].events.find((event) => event.ev === 'message').message.seq = 9; }, 'MESSAGE_ORDER'],
      ['trailers removed from an ok call', (value) => { const item = value.calls[0]; item.events.splice(item.events.findIndex((event) => event.ev === 'trailers'), 1); item.events.forEach((event, index) => { event.n = index + 1; }); }, 'OK_WITHOUT_TRAILERS'],
      ['a cancel the server did not observe', (value) => { value.calls[2].server.outcome = 'OK'; }, 'CANCEL_NOT_OBSERVED'],
      ['a missing deadline call', (value) => { value.calls = value.calls.filter((item) => item.id !== 'watch-deadline'); }, 'EXPECTED_EVIDENCE_MISSING']
    ];
    for (const [name, mutate, code] of tampers) {
      const altered = structuredClone(real);
      mutate(altered);
      await page.route('**/transcript.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(altered) }));
      await page.getByRole('button', { name: 'Load server-produced transcript', exact: true }).click();
      await page.waitForFunction((expected) => document.getElementById('status').textContent.startsWith(`REJECTED — ${expected}`), code);
      assert.equal(await page.locator('#calls > section').count(), 0);
      assert.equal(await page.locator('#summary').textContent(), 'No verified transcript.');
      await page.unroute('**/transcript.json');
      checked(`the page REJECTS ${name} and clears the display`, await page.locator('#status').textContent());
    }
    await page.route('**/transcript.json', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.getByRole('button', { name: 'Load server-produced transcript', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED — HTTP_500'));
    await page.unroute('**/transcript.json');
    await page.getByRole('button', { name: 'Load server-produced transcript', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED LOCAL TRANSCRIPT'));
    checked('an HTTP 500 is REJECTED and the untouched transcript verifies again afterwards', 'HTTP_500 then VERIFIED');

    const inline = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__c028_inline = 1';
      document.head.appendChild(script);
      return typeof window.__c028_inline;
    });
    assert.equal(inline, 'undefined');
    checked('the strict CSP blocks an injected inline script', inline);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors.filter((text) => !/Content Security Policy|Refused to execute inline script/.test(text)).filter((text) => !/Failed to load resource|ERR_BLOCKED|net::/.test(text)), []);
    assert.equal(requests.every((request) => request.method === 'GET' && request.url.startsWith(`${origin}/`) || request.url.startsWith(local.grpc.origin)), true);
    assert.equal(requests.some((request) => request.method === 'WEBSOCKET'), false);
    checked('no uncaught page errors, no WebSocket and every successful request is a same-origin GET', { pageErrors, requests: requests.length });
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      try {
        if (session) { await session.close(); record.cleanup.browserClosed = true; }
      } finally {
        if (local) { await local.close(); record.cleanup.listenersClosed = !local.web.listening; }
      }
    } catch (error) {
      failure ||= error;
      record.outcome = 'failed';
      record.cleanup.error = error.message;
    }
    record.completedAtUtc = new Date().toISOString();
    if (capture && record.evidenceFolder) fs.writeFileSync(path.join(repositoryRoot, record.evidenceFolder, 'browser-acceptance.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  }
  if (failure) throw failure;
  console.log(`C028 browser: ${record.checks.length} actual checks passed; Edge ${record.browserVersion}; cleanup complete.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
