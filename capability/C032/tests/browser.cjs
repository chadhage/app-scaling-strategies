'use strict';

// Real isolated headless Edge observation of the C032 page against the real loopback fixture.
// Run it under a heavy slot (README). Without CAPTURE_BROWSER_EVIDENCE=1 it writes nothing; with it, it writes ONE new
// unique directory evidence\browser\browser-<uuid>\ (record.json and observation.png) and never overwrites anything.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { startLocal } = require('../server.cjs');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const QUALIFIED_MAJOR = '156';
const CREDENTIAL = {
  alpha: 'c032-synthetic-opaque-alpha-0001', beta: 'c032-synthetic-opaque-beta-0002',
  expired: 'c032-synthetic-opaque-expired-0003', forged: 'c032-synthetic-opaque-alpha-9999'
};
const record = {
  cardId: 'C032', startedAtUtc: new Date().toISOString(), outcome: 'not-run', mode: 'isolated-headless', engine: 'Microsoft Edge (Chromium)',
  testRuntime: process.version, businessData: 'synthetic', nativeTargetQualified: false, productionRuntimeValidated: false,
  integratedForegroundLeaseUsed: false, consent: 'live C001 local-probe recheck through startLocal()', checks: [], cleanup: { serverClosed: false, browserClosed: false }
};

function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}

// Asserts only that the installed Edge is Microsoft-signed and within the qualified major; the version and hash are recorded.
function signedEdge() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$exe = @((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'), (Join-Path $env:ProgramFiles 'Microsoft\\Edge\\Application\\msedge.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1",
    "$s = Get-AuthenticodeSignature -LiteralPath $exe",
    "[Console]::WriteLine(([ordered]@{ executable = $exe; status = [string]$s.Status; signer = $s.SignerCertificate.Subject; fileVersion = (Get-Item -LiteralPath $exe).VersionInfo.FileVersion; sha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLower() } | ConvertTo-Json -Compress))"
  ].join('; ');
  const run = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

async function main() {
  let server;
  let session;
  let failure;
  const seen = [];
  try {
    assert.equal(typeof openIsolatedLoopback, 'function', 'The verified shared loopback API is required; its guards are never bypassed.');
    server = await startLocal({ onRequest: (info) => seen.push(info) });
    record.server = { pid: process.pid, address: server.address(), ownership: 'this process, exact returned http.Server handle' };
    const origin = `http://127.0.0.1:${server.address().port}`;
    session = await openIsolatedLoopback(path.join('capability', 'C032', 'index.html'), server);
    record.browserVersion = session.browserVersion;
    record.playwrightVersion = require(path.join(repositoryRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    const edge = signedEdge();
    assert.equal(edge.status, 'Valid');
    assert.match(edge.signer, /Microsoft Corporation/);
    assert.equal(edge.fileVersion.split('.')[0], QUALIFIED_MAJOR);
    assert.equal(session.browserVersion.split('.')[0], QUALIFIED_MAJOR);
    record.edge = edge;
    checked('the installed Edge is Microsoft-signed and within the qualified major version; actual version and SHA recorded', {
      version: session.browserVersion, fileVersion: edge.fileVersion, sha256: edge.sha256
    });

    const { page } = session;
    const pageErrors = [];
    const requests = [];
    const responses = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push(request));
    page.on('response', (response) => responses.push(response));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('observe').disabled);

    const text = (id) => page.locator(`#${id}`).textContent();
    const cookies = () => page.evaluate(() => document.cookie);
    const press = () => page.getByRole('button', { name: 'Observe through the cookie-less client', exact: true }).click();
    const done = (pattern) => page.waitForFunction((source) => new RegExp(source).test(document.getElementById('status').textContent), pattern);
    const shown = async () => ({
      client: await text('client-view'), destination: await text('destination-view'), counter: await text('counter-view'), cookieView: await text('cookie-view')
    });
    assert.match(await text('status'), /^Not run/);
    assert.match(await text('runtime'), new RegExp(process.version.replaceAll('.', '\\.')));
    assert.equal(await text('cookie-view'), 'document.cookie: (none)');
    assert.equal(await text('destination-view'), 'No observation.');
    checked('initial state has no observation, no cookie, and labels synthetic local tooling', await text('runtime'));

    await page.selectOption('#credential', CREDENTIAL.alpha);
    await press();
    await done('^VERIFIED LOCAL');
    const first = await shown();
    assert.deepEqual([first.client, first.destination, first.counter], ['synthetic-client-alpha', 'synthetic-destination-blue (version 1.0.0)', '1']);
    assert.equal(first.cookieView, 'document.cookie: (none)');
    checked('first observation with no cookie: server-chosen alpha, blue, counter 1', first);

    await page.getByRole('button', { name: 'Set conflicting decoy cookies', exact: true }).click();
    const decoy = 'c032_destination=synthetic-destination-green; c032_client=synthetic-client-beta; ARRAffinity=synthetic-affinity-green';
    assert.equal(await cookies(), decoy);
    const jar = (await page.context().cookies(origin)).map((cookie) => `${cookie.name}=${cookie.value}`).sort();
    assert.deepEqual(jar, decoy.split('; ').sort(), 'the real browser cookie jar holds the conflicting decoys');
    assert.equal(await text('cookie-view'), `document.cookie: ${decoy}`);
    await page.getByRole('button', { name: 'Observe through the cookie-less client', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('counter-view').textContent === '2');
    const second = await shown();
    assert.deepEqual([second.client, second.destination, second.counter], ['synthetic-client-alpha', 'synthetic-destination-blue (version 1.0.0)', '2']);
    assert.equal(await cookies(), decoy, 'the server added or changed no cookie');
    assert.equal(second.cookieView, `document.cookie: ${decoy}`);
    checked('with decoy cookies naming green and beta, a keyboard-activated observation is still alpha, blue, counter 2 and the cookies are untouched', second);

    await page.selectOption('#decoy-destination', 'synthetic-destination-blue');
    await page.getByRole('button', { name: 'Set conflicting decoy cookies', exact: true }).click();
    assert.match(await cookies(), /c032_destination=synthetic-destination-blue; .*ARRAffinity=synthetic-affinity-blue/);
    await press();
    await page.waitForFunction(() => document.getElementById('counter-view').textContent === '3');
    const third = await shown();
    assert.deepEqual([third.client, third.destination, third.counter], ['synthetic-client-alpha', 'synthetic-destination-green (version 2.0.0)', '3']);
    checked('a sticky decoy naming blue cannot hold the client after the server-owned transition: green, counter 3', third);

    const failures = [];
    for (const [label, value, code] of [['expired', CREDENTIAL.expired, 'CREDENTIAL_EXPIRED'], ['forged', CREDENTIAL.forged, 'CREDENTIAL_FORGED'],
      ['empty Bearer', '', 'CREDENTIAL_MALFORMED'], ['no credential', '__none__', 'CREDENTIAL_MISSING']]) {
      await page.selectOption('#credential', value);
      await press();
      await done(`^UNVERIFIED — ${code}`);
      assert.equal(await text('client-view'), 'No observation.');
      assert.equal(await text('destination-view'), 'No observation.');
      assert.equal(await text('result'), 'No observation.');
      failures.push({ label, status: await text('status') });
    }
    checked('an expired, forged, empty or absent credential is an explicit typed failure that clears the observation even with a decoy identity cookie present', failures);

    await page.selectOption('#credential', CREDENTIAL.beta);
    await press();
    await done('^VERIFIED LOCAL');
    const beta = await shown();
    assert.deepEqual([beta.client, beta.counter], ['synthetic-client-beta', '1']);
    await page.selectOption('#credential', CREDENTIAL.alpha);
    await press();
    await page.waitForFunction(() => document.getElementById('counter-view').textContent === '4');
    const again = await shown();
    assert.deepEqual([again.client, again.destination, again.counter], ['synthetic-client-alpha', 'synthetic-destination-green (version 2.0.0)', '4']);
    checked('state is per client, survives failures and never moved backwards: beta counter 1, alpha counter 4 on green', { beta, again });

    await page.getByRole('button', { name: 'Clear decoy cookies', exact: true }).click();
    assert.equal(await cookies(), '');
    assert.equal(await text('cookie-view'), 'document.cookie: (none)');
    await page.selectOption('#credential', CREDENTIAL.alpha);
    await press();
    await page.waitForFunction(() => document.getElementById('counter-view').textContent === '5');
    const cleared = await shown();
    assert.deepEqual([cleared.destination, cleared.counter], ['synthetic-destination-green (version 2.0.0)', '5']);
    assert.equal(await cookies(), '', 'the server still set no cookie');
    checked('after the decoys are cleared the same server-owned plan continues: green, counter 5, still no cookie', cleared);

    const api = requests.filter((request) => new URL(request.url()).pathname === '/api/v1/observation');
    const wire = [];
    for (const request of api) {
      const own = request.headers();
      let browserCookie = 'unavailable';
      try { browserCookie = (await request.allHeaders()).cookie === undefined ? 'absent' : 'present'; } catch { /* extra info can be unavailable for routed requests */ }
      wire.push({ method: request.method(), authorization: own.authorization ? 'Bearer <synthetic>' : 'absent', browserCookie });
    }
    assert.equal(api.length, 10);
    assert.ok(wire.every((item) => item.method === 'GET' && item.browserCookie !== 'present'), 'credentials omit: the browser attached no cookie to any API request');
    assert.equal(wire.filter((item) => item.authorization === 'absent').length, 1, 'only the no-credential case sends no Authorization header');
    const setCookie = [];
    for (const response of responses) setCookie.push(await response.headerValue('set-cookie'));
    assert.ok(setCookie.every((value) => value === null), 'no response carried Set-Cookie');
    assert.deepEqual(pageErrors, []);
    assert.ok(requests.every((request) => request.url().startsWith(`${origin}/`) && request.method() === 'GET'), 'only GETs to the owned origin');
    const apiSeen = seen.filter((item) => item.url === '/api/v1/observation');
    assert.equal(apiSeen.length, 10);
    record.serverWire = apiSeen.map((item) => ({ cookieHeader: item.headers.cookie === undefined ? 'absent' : 'present', authorization: item.headers.authorization === undefined ? 'absent' : 'present' }));
    checked('monitored page: 10 credentials-omit GET observation requests, no Set-Cookie response, no page error, no nonlocal request', {
      wire, setCookieResponses: setCookie.length, pageErrors, serverWire: record.serverWire,
      note: 'the guarded helper forwards requests through Playwright route.fetch, so a Cookie header can reach the server even when the browser fetch omitted credentials; observations were identical either way'
    });
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
      record.evidenceDirectory = path.join('capability', 'C032', 'evidence', 'browser', `browser-${randomUUID()}`);
      fs.mkdirSync(path.join(repositoryRoot, record.evidenceDirectory), { recursive: true });
      const png = await page.screenshot({ fullPage: true });
      fs.writeFileSync(path.join(repositoryRoot, record.evidenceDirectory, 'observation.png'), png);
      record.screenshot = { file: 'observation.png', sha256: createHash('sha256').update(png).digest('hex') };
    }
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
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
          record.cleanup.serverClosed = !server.listening;
          record.cleanup.method = 'exact owned http.Server handle closed in the caller PID; no process-name termination';
        }
      }
    } catch (error) {
      failure = failure || error;
      record.outcome = 'failed';
      record.cleanup.error = error.message;
    }
    record.completedAtUtc = new Date().toISOString();
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1' && record.evidenceDirectory) {
      fs.writeFileSync(path.join(repositoryRoot, record.evidenceDirectory, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
    }
  }
  if (failure) throw failure;
  console.log(`C032 browser: ${record.checks.length} actual checks passed; Edge ${record.browserVersion}; cleanup complete (server closed: ${record.cleanup.serverClosed}, browser closed: ${record.cleanup.browserClosed}).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
