'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { startLocal, MAX_LIFETIME_MS, DEFAULT_LIFETIME_MS } = require('../server.cjs');
const { getArtifact } = require('../artifact.cjs');
const { DownloadSession } = require('../download.js');

let server;
test.before(async () => { server = await startLocal({ lifetimeMs: 120000 }); });
test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    assert.equal(server.listening, false);
  }
});

function request(url, headers = {}, method = 'GET', body, listener = server) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: listener.address().port, path: url,
      method, headers, agent: false, timeout: 5000
    }, (response) => {
      const parts = [];
      response.on('data', (part) => parts.push(part));
      response.once('error', reject);
      response.once('end', () => resolve({
        status: response.statusCode, headers: response.headers, bytes: Buffer.concat(parts)
      }));
    });
    req.once('error', reject);
    req.once('timeout', () => req.destroy(new Error('Owned HTTP request timed out.')));
    req.end(body);
  });
}
const urlFor = (version = 'r1', profileId = 'synthetic-001', endpoint = '/artifact') =>
  `${endpoint}?profileId=${profileId}&version=${version}`;

test('listener is actual IPv4 loopback with bounded expiry and no caller host/approval override', async () => {
  assert.equal(server instanceof http.Server, true);
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal(server.address().family, 'IPv4');
  assert.equal(MAX_LIFETIME_MS, 900000);
  assert.equal(DEFAULT_LIFETIME_MS, 600000);
  const catalog = await request('/api/catalog');
  const body = JSON.parse(catalog.bytes);
  assert.equal(body.lease.lifetimeMs, 120000);
  assert.equal(body.lease.bindAddress, '127.0.0.1');
  assert.equal(body.nativeTargetQualified, false);
  assert.equal(body.productionRuntimeValidated, false);
  assert.equal(body.durableStorage, false);
  assert.equal(body.liveAzureRuns, 0);
  assert.equal(body.authorizedCloudSpend, 0);
  assert.deepEqual(body.profiles.map((profile) => profile.id), ['synthetic-001', 'synthetic-002']);
  for (const options of [{ host: '0.0.0.0' }, { approval: true }, { port: 8080 },
    { lifetimeMs: 900001 }, { lifetimeMs: 0 }, { lifetimeMs: 1.5 }, { lifetimeMs: '1000' }]) {
    await assert.rejects(startLocal(options));
  }
});

test('explicit short lifetime actually closes the exact listener without external process termination', async () => {
  const expiring = await startLocal({ lifetimeMs: 100 });
  const closed = new Promise((resolve) => expiring.once('close', resolve));
  try {
    assert.equal((await request('/api/catalog', {}, 'GET', undefined, expiring)).status, 200);
    await closed;
    assert.equal(expiring.listening, false);
    assert.equal(expiring.address(), null);
  } finally {
    if (expiring.listening) {
      expiring.closeAllConnections();
      await new Promise((resolve, reject) => expiring.close((error) => error ? reject(error) : resolve()));
    }
  }
});

for (const profileId of ['synthetic-001', 'synthetic-002']) {
  for (const version of ['r1', 'r2']) {
    test(`actual whole HTTP bytes and manifest are repeatable for ${profileId}/${version}`, async () => {
      const manifestResponse = await request(urlFor(version, profileId, '/api/manifest'));
      assert.equal(manifestResponse.status, 200);
      const manifest = JSON.parse(manifestResponse.bytes);
      const first = await request(urlFor(version, profileId));
      const second = await request(urlFor(version, profileId));
      assert.equal(first.status, 200);
      assert.equal(first.headers['accept-ranges'], 'bytes');
      assert.equal(first.headers['content-type'], 'application/octet-stream');
      assert.equal(first.headers['content-length'], '8192');
      assert.equal(first.headers.etag, manifest.etag);
      assert.equal(first.headers['x-c025-artifact-id'], manifest.artifactId);
      assert.equal(first.headers['x-c020-deployment-stamp'], manifest.lineage.stamp.deploymentStamp);
      assert.deepEqual(first.bytes, getArtifact({ profileId, version }).bytes);
      assert.deepEqual(second.bytes, first.bytes);
      assert.equal(createHash('sha256').update(first.bytes).digest('hex'), manifest.sha256);
      assert.equal(new Set(first.bytes.subarray(-256)).size, 256);
    });
  }
}

for (const [range, start, end] of [
  ['bytes=0-1023', 0, 1023], ['bytes=1024-', 1024, 8191],
  ['bytes=-256', 7936, 8191], ['bytes=-9999', 0, 8191],
  ['bytes=8000-99999', 8000, 8191], ['bytes=8191-8191', 8191, 8191]
]) {
  test(`real HTTP ${range} returns exact 206 inclusive bytes`, async () => {
    const full = await request(urlFor());
    const response = await request(urlFor(), { Range: range, 'If-Range': full.headers.etag });
    assert.equal(response.status, 206);
    assert.equal(response.headers['content-range'], `bytes ${start}-${end}/8192`);
    assert.equal(Number(response.headers['content-length']), end - start + 1);
    assert.deepEqual(response.bytes, full.bytes.subarray(start, end + 1));
  });
}

test('interrupted real HTTP resume reproduces independently fetched original bytes and SHA-256', async () => {
  const original = await request(urlFor());
  const manifest = JSON.parse((await request(urlFor('r1', 'synthetic-001', '/api/manifest'))).bytes);
  const assembly = new DownloadSession(manifest);
  const transcript = [];
  for (const range of ['bytes=0-1023', 'bytes=4096-8191', 'bytes=1024-2047', 'bytes=2048-4095']) {
    const response = await request(urlFor(), { Range: range, 'If-Range': manifest.etag });
    const state = await assembly.observe({ ...response, requestedRange: range });
    transcript.push({ range, status: response.status, cursor: state.cursor, accepted: state.acceptedBytes });
    if (transcript.length === 1) {
      assert.equal(state.outcome, 'incomplete');
      assert.equal(state.assembledSha256, null);
      assert.equal(state.cursor, 1024);
    }
  }
  const state = assembly.snapshot();
  assert.deepEqual(transcript.map((value) => value.cursor), [1024, 1024, 2048, null]);
  assert.equal(state.outcome, 'verified');
  assert.equal(state.assembledSha256, createHash('sha256').update(original.bytes).digest('hex'));
  assert.deepEqual(Buffer.from(assembly.verifiedBytes()), original.bytes);
});

test('actual If-Range version replacement is 200, rejected client-side; restoring original resumes without deleting failure', async () => {
  const manifest = JSON.parse((await request(urlFor('r1', 'synthetic-001', '/api/manifest'))).bytes);
  const assembly = new DownloadSession(manifest);
  const first = await request(urlFor(), { Range: 'bytes=0-1023', 'If-Range': manifest.etag });
  await assembly.observe({ ...first, requestedRange: 'bytes=0-1023' });
  const replacement = await request(urlFor('r2'), { Range: 'bytes=1024-', 'If-Range': manifest.etag });
  assert.equal(replacement.status, 200);
  assert.equal(replacement.headers['content-range'], undefined);
  assert.equal(replacement.bytes.length, 8192);
  assert.notEqual(replacement.headers.etag, manifest.etag);
  const rejected = await assembly.observe({ ...replacement, requestedRange: 'bytes=1024-' });
  assert.equal(rejected.lastAttempt.code, 'HTTP_200');
  assert.equal(rejected.acceptedBytes, 1024);
  assert.equal(rejected.cursor, 1024);
  const remaining = await request(urlFor(), { Range: 'bytes=1024-', 'If-Range': manifest.etag });
  const completed = await assembly.observe({ ...remaining, requestedRange: 'bytes=1024-' });
  assert.equal(completed.outcome, 'verified-with-failures');
  assert.equal(completed.failures, 1);
  assert.deepEqual(Buffer.from(assembly.verifiedBytes()), (await request(urlFor())).bytes);
  const guarded = await request(urlFor('r2'), { Range: 'bytes=1024-', 'If-Match': manifest.etag });
  assert.equal(guarded.status, 412);
  assert.equal(JSON.parse(guarded.bytes).error.code, 'PRECONDITION_FAILED');
});

test('a different synthetic profile cannot be mixed into a pinned version', async () => {
  const manifest = JSON.parse((await request(urlFor('r1', 'synthetic-001', '/api/manifest'))).bytes);
  const assembly = new DownloadSession(manifest);
  const other = await request(urlFor('r1', 'synthetic-002'), { Range: 'bytes=0-1023' });
  assert.equal(other.status, 206);
  assert.equal((await assembly.observe({ ...other, requestedRange: 'bytes=0-1023' })).lastAttempt.code, 'ARTIFACT_CHANGED');
  assert.equal(assembly.snapshot().acceptedBytes, 0);
});

for (const range of ['bytes=9-1', 'bytes=0-1,4-9', 'bytes=-', 'items=0-9', 'bytes=9007199254740992-', 'bytes=0-9007199254740992']) {
  test(`real HTTP rejects invalid range ${range}`, async () => {
    const response = await request(urlFor(), { Range: range });
    assert.equal(response.status, 400);
    assert.equal(JSON.parse(response.bytes).error.code, 'INVALID_RANGE');
  });
}
for (const range of ['bytes=8192-', 'bytes=-0', 'bytes=9999-99999']) {
  test(`real HTTP 416 exposes original total for ${range}`, async () => {
    const response = await request(urlFor(), { Range: range });
    assert.equal(response.status, 416);
    assert.equal(response.headers['content-range'], 'bytes */8192');
    assert.equal(JSON.parse(response.bytes).error.code, 'RANGE_UNSATISFIABLE');
  });
}

test('HEAD has whole-representation metadata and no bytes; If-Match and validators fail explicitly', async () => {
  const manifest = JSON.parse((await request(urlFor('r1', 'synthetic-001', '/api/manifest'))).bytes);
  const head = await request(urlFor(), { Range: 'bytes=0-1' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.bytes.length, 0);
  assert.equal(head.headers['content-length'], '8192');
  assert.equal(head.headers.etag, manifest.etag);
  assert.equal(head.headers['content-range'], undefined);
  assert.equal((await request(urlFor(), { Range: 'bytes=0-1', 'If-Match': manifest.etag })).status, 206);
  assert.equal((await request(urlFor(), { 'If-Match': '*' })).status, 200);
  for (const headers of [{ 'If-Range': `W/${manifest.etag}` }, { 'If-Match': 'yesterday' }, { 'If-Range': 'Tue, 03 Nov 2026 00:00:00 GMT' }]) {
    const invalid = await request(urlFor(), { Range: 'bytes=0-1', ...headers });
    assert.equal(invalid.status, 400);
    assert.equal(JSON.parse(invalid.bytes).error.code, 'INVALID_VALIDATOR');
  }
});

for (const [url, code, status] of [
  ['/artifact', 'INVALID_QUERY', 400],
  [`${urlFor()}&version=r2`, 'INVALID_QUERY', 400],
  [`${urlFor()}&etag=forged`, 'INVALID_QUERY', 400],
  [urlFor('r1', 'synthetic-999'), 'UNKNOWN_PROFILE', 404],
  [urlFor('r3'), 'UNKNOWN_VERSION', 404],
  [urlFor('r1', ''), 'INVALID_PROFILE_ID', 400],
  ['/api/catalog?approval=true', 'INVALID_QUERY', 400],
  ['/download.js?override=1', 'INVALID_QUERY', 400],
  ['/not-owned', 'NOT_FOUND', 404]
]) {
  test(`bounded routing rejects ${url}`, async () => {
    const response = await request(url);
    assert.equal(response.status, status);
    assert.equal(JSON.parse(response.bytes).error.code, code);
  });
}

test('same-origin, body, method and CSP rules apply to the real listener', async () => {
  assert.equal((await request(urlFor(), { Host: 'attacker.invalid' })).status, 421);
  assert.equal((await request(urlFor(), { Origin: 'https://other.invalid' })).status, 403);
  assert.equal((await request(urlFor(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const post = await request(urlFor(), {}, 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  assert.equal((await request(urlFor(), { 'Content-Length': '1' }, 'GET', 'x')).status, 400);
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.match(page.headers['content-security-policy'], /connect-src 'self'/);
  assert.doesNotMatch(page.headers['content-security-policy'], /unsafe-inline|unsafe-eval/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['cache-control'], 'no-store');
  for (const asset of ['/download.js', '/page.js', '/styles.css']) assert.equal((await request(asset)).status, 200);
});

test('an explicitly null lifetime is invalid rather than silently replaced by the default', async () => {
  let unexpected;
  let rejection;
  try {
    try { unexpected = await startLocal({ lifetimeMs: null }); }
    catch (error) { rejection = error; }
    assert.ok(rejection instanceof Error, 'Explicit null is not a positive bounded lifetime.');
  } finally {
    if (unexpected) {
      unexpected.closeAllConnections();
      await new Promise((resolve, reject) => unexpected.close((error) => error ? reject(error) : resolve()));
    }
  }
});
