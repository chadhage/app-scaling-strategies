'use strict';

// Test tooling, not production code: a real isolated headless Edge observation of the C026 transcript page.
// The helper blocks WebSockets, writes and foreign origins, so the browser observes the server-produced transcript,
// not a browser WebSocket. Nothing is written unless CAPTURE_BROWSER_EVIDENCE=1.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { startLocal, closeServer } = require(path.join(__dirname, '..', 'server.cjs'));
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const QUALIFIED_MAJOR = '156';
const FAILURES = ['ACK_OUT_OF_ORDER', 'ACK_UNSENT', 'CLIENT_SEQUENCE_FORBIDDEN', 'CURSOR_FOREIGN_SESSION', 'CURSOR_FROM_FUTURE'];
const record = {
  schemaVersion: 1, cardId: 'C026', kind: 'isolated-headless-edge-transcript-page', startedAtUtc: new Date().toISOString(),
  outcome: 'not-run', testRuntime: process.version, businessData: 'synthetic', browserWebSocketObserved: false,
  limits: ['The isolated helper blocks WebSockets, writes and foreign origins: the browser observed a server-produced transcript, not a browser WebSocket.'],
  integratedForegroundBrowserUsed: false, checks: [], cleanup: { serverClosed: false, browserClosed: false }
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
  let server;
  let session;
  let failure;
  try {
    const edge = signedEdge();
    assert.equal(edge.status, 'Valid');
    assert.match(edge.signer, /Microsoft Corporation/);
    assert.equal(edge.fileVersion.split('.')[0], QUALIFIED_MAJOR, 'the installed Edge must stay within the qualified major version');
    record.signedEdge = edge;
    checked('the installed Edge is Microsoft-signed and within the qualified major version', { version: edge.fileVersion, sha256: edge.sha256 });

    server = await startLocal();
    const origin = `http://127.0.0.1:${server.address().port}`;
    record.server = { pid: process.pid, address: server.address(), ownership: 'this process, exact returned http.Server handle' };
    session = await openIsolatedLoopback(path.join('capability', 'C026', 'index.html'), server);
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
    assert.match(await page.locator('#limit').textContent(), /This page does not open a WebSocket/);
    assert.equal(await page.locator('#events tr').count(), 0);
    checked('initial state shows no observation and states the WebSocket limit', await page.locator('#status').textContent());

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'load');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED LOCAL TRANSCRIPT'));
    const status = await page.locator('#status').textContent();
    assert.match(status, /4 sessions, 15 first deliveries, 6 redeliveries, 5 typed failures\./);
    assert.match(status, /not a WebSocket\.$/);
    const summary = JSON.parse(await page.locator('#summary').textContent());
    assert.deepEqual(summary, {
      verified: true, sessions: 4, events: summary.events, firstDeliveries: 15, redeliveries: 6, acknowledgements: 6,
      resumes: 2, aborts: 1, completes: 1, typedFailures: FAILURES
    });
    const rows = await page.locator('#events tr').count();
    assert.equal(rows, summary.events);
    assert.equal(rows > 60, true);
    const table = await page.locator('#events').textContent();
    for (const needle of ['client destroys the socket, no close frame', '"redelivered":true', '"deliveries":2', 'COMPLETE', ...FAILURES]) {
      assert.equal(table.includes(needle), true, needle);
    }
    assert.equal(await page.locator('#events tr.dir-abort').count(), 1);
    assert.equal(await page.locator('#load').isEnabled(), true);
    checked('real Tab/Enter loads the transcript; the page verified it and shows abort, resume, redelivery and typed failures', { status, summary, rows });
    if (capture) {
      record.screenshot = path.join('capability', 'C026', 'evidence', 'raw', 'browser-transcript.png');
      record.pendingScreenshot = await page.screenshot({ fullPage: true });
    }

    const original = await page.evaluate(() => fetch('/transcript.json', { cache: 'no-store' }).then((response) => response.json()));
    assert.equal(original.kind, 'server-side-websocket-transcript');
    const tampered = structuredClone(original);
    tampered.events.find((event) => event.dir === 'recv' && event.conn === 'A1' && event.frame.type === 'message').frame.seq = 2;
    const respond = (status, body) => (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const press = () => page.getByRole('button', { name: 'Load server-produced transcript', exact: true }).click();
    await page.route('**/transcript.json', respond(200, tampered));
    await press();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED'));
    assert.match(await page.locator('#status').textContent(), /^REJECTED — SEQUENCE_GAP_OR_DUPLICATE: /);
    assert.equal(await page.locator('#events tr').count(), 0);
    assert.equal(await page.locator('#summary').textContent(), 'No verified transcript.');
    checked('a tampered transcript is REJECTED in the real browser and the earlier display is cleared', await page.locator('#status').textContent());
    assert.deepEqual(consoleErrors, []);

    await page.unroute('**/transcript.json');
    await page.route('**/transcript.json', respond(500, {}));
    await press();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('REJECTED — HTTP_500'));
    assert.equal(await page.locator('#events tr').count(), 0);
    checked('a missing transcript (HTTP 500) is REJECTED, never shown as healthy', await page.locator('#status').textContent());

    await page.unroute('**/transcript.json');
    await press();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED LOCAL TRANSCRIPT'));
    checked('the page recovers to a verified transcript when the server answers again', await page.locator('#status').textContent());

    assert.deepEqual(pageErrors, []);
    assert.equal(consoleErrors.every((text) => /status of 500/.test(text)), true, JSON.stringify(consoleErrors));
    assert.equal(requests.some((request) => request.method === 'WEBSOCKET' || /^wss?:/.test(request.url)), false);
    const external = requests.filter((request) => !request.url.startsWith('data:'));
    assert.equal(external.every((request) => request.method === 'GET' && request.url.startsWith(`${origin}/`)), true, JSON.stringify(external));
    checked('only same-origin GET requests, no WebSocket, no page error', { requests: [...new Set(external.map((request) => `${request.method} ${new URL(request.url).pathname}`))].sort(), consoleErrors });
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = String(error?.stack ?? error);
  } finally {
    try {
      if (session) await session.close();
      record.cleanup.browserClosed = true;
    } catch (error) {
      record.cleanup.browserError = String(error);
    }
    try {
      if (server) await closeServer(server);
      record.cleanup.serverClosed = true;
    } catch (error) {
      record.cleanup.serverError = String(error);
    }
  }
  record.completedAtUtc = new Date().toISOString();
  if (capture && record.outcome === 'passed') {
    const directory = path.join(__dirname, '..', 'evidence', 'raw', `browser-${randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    const screenshot = record.pendingScreenshot;
    delete record.pendingScreenshot;
    record.screenshot = path.relative(repositoryRoot, path.join(directory, 'browser-transcript.png'));
    fs.writeFileSync(path.join(directory, 'browser-transcript.png'), screenshot, { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'browser-acceptance.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    console.log(`C026 browser evidence: ${path.relative(repositoryRoot, directory)}`);
  }
  if (failure) throw failure;
  console.log(`C026 browser GREEN: ${record.checks.length} checks, Edge ${record.browserVersion}, server and browser closed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
