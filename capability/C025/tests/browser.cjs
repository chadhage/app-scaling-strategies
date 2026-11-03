'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { startLocal } = require('../server.cjs');
const { getArtifact } = require('../artifact.cjs');
const repo = path.resolve(__dirname, '..', '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const HELPER_SHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helperPath)), HELPER_SHA256, 'Only the unchanged verified published helper is authorized.');
const { openIsolatedLoopback } = require(helperPath);
const proofPath = path.join(__dirname, '..', 'evidence', 'browser-acceptance.json');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const beforeProof = fs.existsSync(proofPath) ? hash(fs.readFileSync(proofPath)) : null;
const record = {
  label: '[C025][S]', cardId: 'C025', outcome: 'not-run', runtime: process.version,
  captureRequested: capture, proofWrites: capture,
  mode: 'fresh isolated sandboxed headless Edge; guarded real owned loopback responses',
  tooling: {
    helper: 'testing\\browser\\isolated.cjs',
    verifiedPublishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
    sha256: HELPER_SHA256,
    transport: 'GET/HEAD only, same origin, no redirects; route.fetch forwards actual http.Server responses, not mocked business responses'
  },
  scope: {
    dataKind: 'synthetic', nativeTargetQualified: false, productionRuntimeValidated: false,
    durableStorage: false, liveAzureRuns: 0, authorizedCloudSpend: 0, foregroundLeaseUsed: false
  },
  checks: [], cleanup: { browserClosed: false, serverClosed: false }
};
function checked(name, observed) { record.checks.push({ name, passed: true, observed }); }
async function state(page) {
  return JSON.parse(await page.locator('#observations').textContent()).assembly;
}
async function idle(page) {
  await page.waitForFunction(() => !document.getElementById('status').textContent.startsWith('PENDING'));
}

async function main() {
  let server;
  let session;
  let failure;
  try {
    server = await startLocal({ lifetimeMs: 180000 });
    record.listener = { address: server.address(), lease: server.c025Lease, pid: process.pid };
    const origin = `http://127.0.0.1:${server.address().port}`;
    session = await openIsolatedLoopback(path.join('capability', 'C025', 'index.html'), server);
    record.browserVersion = session.browserVersion;
    const { page } = session;
    const pageErrors = [];
    const requests = [];
    const redirects = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push({
      url: request.url(), method: request.method(),
      range: request.headers().range || null, ifRange: request.headers()['if-range'] || null
    }));
    page.on('response', (response) => {
      if (response.status() >= 300 && response.status() < 400) redirects.push(response.status());
    });
    const documentResponse = await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('pin').disabled);
    assert.match(await page.locator('#status').textContent(), /^NOT STARTED/);
    assert.equal(await page.locator('#accepted').textContent(), '0 / unknown');
    assert.match(await page.locator('#runtime').textContent(), /not production runtime certification/);
    assert.equal(await page.locator('#status').getAttribute('role'), 'status');
    assert.equal(await page.locator('#error').getAttribute('role'), 'alert');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'conductor');
    assert.equal(await page.locator('#observations').getAttribute('tabindex'), '0');
    checked('initial actual DOM and keyboard skip link are accessible, explicitly local and have no successful byte/hash observation', {
      status: await page.locator('#status').textContent(), runtime: await page.locator('#runtime').textContent()
    });

    await page.evaluate(() => {
      globalThis.__c025Pending = [];
      new MutationObserver(() => {
        if (document.getElementById('status').textContent.startsWith('PENDING')) {
          globalThis.__c025Pending.push(['profile', 'version', 'pin', 'range', 'fetch-range', 'resume', 'finish', 'reset']
            .every((id) => document.getElementById(id).disabled));
        }
      }).observe(document.getElementById('status'), { childList: true });
    });
    await page.getByLabel('Synthetic profile', { exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'version');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pin');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('identity').textContent === 'C025:synthetic-001:r1');
    await idle(page);
    const manifest = JSON.parse(await page.locator('#manifest').textContent());
    assert.equal(manifest.lineage.cardId, 'C020');
    assert.equal(manifest.lineage.stamp.implementation, 'v1');
    assert.equal((await state(page)).cursor, 0);
    checked('real Tab/Enter pins the original manifest and unchanged C020 lineage without fetching invented bytes', manifest);

    await page.getByLabel('HTTP Range header', { exact: true }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('bytes=0-1023');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fetch-range');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('cursor').textContent === '1024');
    await idle(page);
    let observed = await state(page);
    assert.equal(observed.outcome, 'incomplete');
    assert.equal(observed.assembledSha256, null);
    assert.deepEqual(observed.ranges, [{ start: 0, end: 1023 }]);
    assert.equal(observed.lastAttempt.httpStatus, 206);
    assert.equal(observed.lastAttempt.contentRange, 'bytes 0-1023/8192');
    assert.equal(observed.lastAttempt.etag, manifest.etag);
    const pausedRequests = requests.filter((request) => new URL(request.url).pathname === '/artifact').length;
    await page.waitForTimeout(100);
    assert.equal(requests.filter((request) => new URL(request.url).pathname === '/artifact').length, pausedRequests);
    checked('real keyboard range request accepts 1024 bytes with inspectable 206 interval, pinned ETag and pause cursor', observed);

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resume');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('cursor').textContent === '2048');
    await idle(page);
    observed = await state(page);
    assert.deepEqual(observed.ranges, [{ start: 0, end: 2047 }]);
    assert.equal(observed.lastAttempt.requestedRange, 'bytes=1024-2047');
    checked('real Tab/Enter resumes at the first missing byte, not at a painted progress cursor', observed.lastAttempt);

    for (const [range, httpStatus] of [['bytes=9-1', 400], ['bytes=8192-', 416]]) {
      await page.getByLabel('HTTP Range header', { exact: true }).fill(range);
      await page.getByRole('button', { name: 'Fetch selected range', exact: true }).click();
      await idle(page);
      observed = await state(page);
      assert.equal(observed.lastAttempt.httpStatus, httpStatus);
      assert.equal(observed.outcome, 'rejected');
      assert.equal(observed.acceptedBytes, 2048);
      assert.equal(observed.cursor, 2048);
      assert.match(await page.locator('#error').textContent(), new RegExp(`HTTP_${httpStatus}`));
      if (httpStatus === 416) assert.equal(observed.lastAttempt.contentRange, 'bytes */8192');
      checked(`actual DOM rejects real HTTP ${httpStatus} without losing accepted bytes or fabricating a hash`, observed.lastAttempt);
    }

    await page.getByLabel('Requested fixture version', { exact: true }).selectOption('r2');
    await page.getByRole('button', { name: 'Resume next range', exact: true }).click();
    await idle(page);
    observed = await state(page);
    assert.equal(observed.lastAttempt.httpStatus, 200);
    assert.equal(observed.lastAttempt.code, 'HTTP_200');
    assert.notEqual(observed.lastAttempt.etag, manifest.etag);
    assert.equal(observed.acceptedBytes, 2048);
    assert.equal(observed.cursor, 2048);
    assert.equal(observed.assembledSha256, null);
    assert.match(await page.locator('#status').textContent(), /TARGET DIFFERS/);
    checked('real If-Range version change returns 200 replacement and the DOM rejects mixed-artifact assembly', observed);

    await page.getByLabel('Requested fixture version', { exact: true }).selectOption('r1');
    await page.getByRole('button', { name: 'Resume to completion', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('BYTES VERIFIED WITH EARLIER FAILURES'));
    observed = await state(page);
    assert.equal(observed.acceptedBytes, 8192);
    assert.equal(observed.failures, 3);
    assert.equal(observed.cursor, null);
    assert.equal(observed.assembledSha256, manifest.sha256);
    const wholeOriginal = await page.evaluate(async () => {
      const response = await fetch('/artifact?profileId=synthetic-001&version=r1', {
        cache: 'no-store', redirect: 'error', credentials: 'omit'
      });
      return { status: response.status, bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
    });
    assert.equal(wholeOriginal.status, 200);
    assert.deepEqual(Buffer.from(wholeOriginal.bytes), getArtifact({ profileId: 'synthetic-001', version: 'r1' }).bytes);
    assert.equal(hash(Buffer.from(wholeOriginal.bytes)), observed.assembledSha256);
    checked('actual UI resume computes the real original SHA-256; independent whole HTTP bytes match; all earlier failures remain', {
      completedAssembly: observed, independentWholeOriginalSha256: hash(Buffer.from(wholeOriginal.bytes))
    });

    await page.getByLabel('HTTP Range header', { exact: true }).fill('bytes=8192-');
    await page.getByRole('button', { name: 'Fetch selected range', exact: true }).click();
    await idle(page);
    assert.match(await page.locator('#status').textContent(), /^REJECTED/);
    assert.equal((await state(page)).failures, 4);
    checked('a later real HTTP failure does not leave a stale success-shaped latest status', await page.locator('#status').textContent());

    await page.locator('#fetch-range').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('NOT STARTED'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pin');
    assert.equal(await state(page), null);
    assert.equal(await page.locator('#identity').textContent(), 'none');
    assert.equal(await page.locator('#failures').textContent(), '0');
    assert.equal(await page.locator('#original-hash').textContent(), 'unknown');
    assert.match(await page.locator('#assembly-hash').textContent(), /not computed/);
    checked('real keyboard reset intentionally clears bytes, identity, hashes, failures and stale success and restores focus', 'empty assembly; focus=pin');

    await page.getByLabel('Synthetic profile', { exact: true }).selectOption('synthetic-002');
    await page.getByLabel('Requested fixture version', { exact: true }).selectOption('r2');
    await page.getByRole('button', { name: 'Pin original manifest', exact: true }).click();
    await idle(page);
    await page.getByRole('button', { name: 'Resume to completion', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('BYTES VERIFIED —'));
    observed = await state(page);
    const second = getArtifact({ profileId: 'synthetic-002', version: 'r2' });
    assert.equal(observed.manifest.artifactId, second.manifest.artifactId);
    assert.equal(observed.manifest.lineage.stamp.implementation, 'v2');
    assert.equal(observed.assembledSha256, hash(second.bytes));
    assert.notEqual(observed.assembledSha256, manifest.sha256);
    assert.equal(observed.attempts.length, 8);
    assert.equal(observed.failures, 0);
    checked('explicit reset permits a different profile/version; eight real 206 responses compute its own distinct original hash', observed);

    await page.getByRole('button', { name: 'Reset assembly', exact: true }).click();
    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'synthetic-999';
      option.textContent = 'Deliberate unknown synthetic fixture';
      document.getElementById('profile').append(option);
    });
    await page.getByLabel('Synthetic profile', { exact: true }).selectOption('synthetic-999');
    await page.getByRole('button', { name: 'Pin original manifest', exact: true }).click();
    await idle(page);
    assert.match(await page.locator('#status').textContent(), /^UNKNOWN \/ REJECTED/);
    assert.match(await page.locator('#error').textContent(), /Manifest HTTP 404/);
    assert.equal(await state(page), null);
    assert.equal(await page.locator('#identity').textContent(), 'none');
    checked('actual unknown-profile HTTP failure leaves no pinned artifact or success-shaped fallback', JSON.parse(await page.locator('#observations').textContent()));

    await page.getByRole('button', { name: 'Reset assembly', exact: true }).click();
    await page.getByLabel('Synthetic profile', { exact: true }).selectOption('synthetic-001');
    await page.getByLabel('Requested fixture version', { exact: true }).selectOption('r1');
    await page.getByRole('button', { name: 'Pin original manifest', exact: true }).click();
    await idle(page);
    await page.evaluate(() => {
      globalThis.__c025CryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    });
    try {
      await page.getByRole('button', { name: 'Resume to completion', exact: true }).click();
      await idle(page);
      observed = await state(page);
      assert.equal(observed.acceptedBytes, 8192);
      assert.equal(observed.outcome, 'unknown');
      assert.equal(observed.lastAttempt.code, 'HASH_UNKNOWN');
      assert.equal(observed.assembledSha256, null);
      assert.match(await page.locator('#status').textContent(), /^UNKNOWN/);
      checked('deliberately unavailable browser hashing leaves actual complete HTTP coverage UNKNOWN, never verified', observed);
    } finally {
      await page.evaluate(() => {
        Object.defineProperty(globalThis, 'crypto', globalThis.__c025CryptoDescriptor);
        delete globalThis.__c025CryptoDescriptor;
      });
    }

    const policy = await page.evaluate(() => new Promise((resolve) => {
      globalThis.__c025InlineRan = false;
      const timer = setTimeout(() => resolve({ violation: null, ran: globalThis.__c025InlineRan }), 1500);
      document.addEventListener('securitypolicyviolation', (event) => {
        clearTimeout(timer);
        resolve({ violation: event.effectiveDirective, blockedURI: event.blockedURI, ran: globalThis.__c025InlineRan });
      }, { once: true });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__c025InlineRan = true;';
      document.head.append(script);
    }));
    assert.equal(policy.ran, false);
    assert.equal(policy.blockedURI, 'inline');
    assert.match(policy.violation, /^script-src/);
    const csp = documentResponse.headers()['content-security-policy'];
    assert.match(csp, /connect-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    checked('real browser CSP blocks inline code while self-hosted scripts and same-origin HTTP work', { csp, policy });

    const pending = await page.evaluate(() => globalThis.__c025Pending);
    assert.ok(pending.length >= 8);
    assert.equal(pending.every(Boolean), true);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(redirects, []);
    assert.ok(requests.length > 20);
    assert.equal(requests.every((request) => new URL(request.url).origin === origin && ['GET', 'HEAD'].includes(request.method)), true);
    const rangeRequests = requests.filter((request) => request.range);
    assert.ok(rangeRequests.length >= 20);
    assert.equal(rangeRequests.every((request) => /^"sha256-[a-f0-9]{64}"$/.test(request.ifRange)), true);
    assert.equal(server.listening, true);
    checked('actual pending DOM locks competing controls; all monitored requests are read-only same-origin with no redirects or uncaught errors', {
      pendingSnapshots: pending.length, requests: requests.length, rangeRequests: rangeRequests.length, pageErrors, redirects
    });
    record.rangeRequests = rangeRequests.map((request) => ({
      path: new URL(request.url).pathname + new URL(request.url).search,
      method: request.method, range: request.range, ifRange: request.ifRange
    }));
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      if (session) {
        await session.close();
        record.cleanup.browserClosed = true;
      }
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'Browser and cleanup failed') : error;
    } finally {
      try {
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
          record.cleanup.serverClosed = !server.listening;
        }
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Verification and server cleanup failed') : error;
      }
    }
  }
  if (failure) record.outcome = 'failed';
  if (capture) fs.writeFileSync(proofPath, `${JSON.stringify(record, null, 2)}\n`);
  else assert.equal(fs.existsSync(proofPath) ? hash(fs.readFileSync(proofPath)) : null, beforeProof, 'Normal verification must not rewrite published proof.');
  console.log(JSON.stringify({
    label: record.label, outcome: record.outcome, checks: record.checks.length,
    browserVersion: record.browserVersion, captureRequested: capture, cleanup: record.cleanup
  }));
  if (failure) throw failure;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
