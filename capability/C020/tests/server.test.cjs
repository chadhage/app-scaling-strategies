'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { before, after, test } = require('node:test');
const vm = require('node:vm');
const { createLocalServer, startLocal } = require('../server.cjs');
const inspector = require('../inspector.js');

let server;
let origin;
before(async () => {
  server = createLocalServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function get(route, options) {
  const response = await fetch(`${origin}${route}`, options);
  return { response, body: await response.json() };
}

for (const implementation of ['v1', 'v2']) {
  for (const id of ['synthetic-001', 'synthetic-002']) {
    test(`actual loopback ${implementation} serves ${id} with coherent server-owned stamps`, async () => {
      const { response, body } = await get(`/fixtures/${implementation}/getProfile?profileId=${id}`);
      assert.equal(response.status, 200);
      assert.equal(inspector.inspect(body, implementation, id).verified, true);
      assert.equal(response.headers.get('x-c020-implementation-version'), implementation === 'v1' ? '1.0.0' : '2.0.0');
      assert.equal(response.headers.get('x-c020-deployment-stamp'), `C020-loopback-${implementation}-r1`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-c020-scope'), 'synthetic-loopback-only');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    });
  }
  for (const [name, query, status, code] of [
    ['missing query', '', 400, 'INVALID_QUERY'],
    ['missing ID', '?implementationVersion=999', 400, 'INVALID_QUERY'],
    ['empty ID', '?profileId=', 400, 'INVALID_PROFILE_ID'],
    ['malformed ID', '?profileId=real-person', 400, 'INVALID_PROFILE_ID'],
    ['trailing newline', '?profileId=synthetic-001%0A', 400, 'INVALID_PROFILE_ID'],
    ['unknown profile', '?profileId=synthetic-999', 404, 'UNKNOWN_PROFILE'],
    ['duplicate ID', '?profileId=synthetic-001&profileId=synthetic-002', 400, 'INVALID_QUERY'],
    ['version override', '?profileId=synthetic-001&implementationVersion=999', 400, 'INVALID_QUERY'],
    ['deployment override', '?profileId=synthetic-001&deploymentStamp=forged', 400, 'INVALID_QUERY'],
    ['implementation override', '?profileId=synthetic-001&implementation=v1', 400, 'INVALID_QUERY'],
    ['prototype query', '?profileId=synthetic-001&__proto__=forged', 400, 'INVALID_QUERY']
  ]) {
    test(`actual loopback ${implementation} rejects ${name} without a profile or stamp`, async () => {
      const { response, body } = await get(`/fixtures/${implementation}/getProfile${query}`);
      assert.equal(response.status, status);
      assert.equal(body.error.code, code);
      assert.equal(Object.hasOwn(body, 'profile'), false);
      assert.equal(Object.hasOwn(body, 'stamp'), false);
      assert.equal(response.headers.get('x-c020-implementation-version'), null);
    });
  }
  test(`${implementation} ignores caller HTTP stamp headers rather than reflecting them`, async () => {
    const { response, body } = await get(`/fixtures/${implementation}/getProfile?profileId=synthetic-001`, {
      headers: { 'X-C020-Implementation-Version': 'forged', 'X-C020-Deployment-Stamp': 'production', 'X-Deployment-Version': '999' }
    });
    assert.equal(response.status, 200);
    assert.equal(inspector.inspect(body, implementation, 'synthetic-001').verified, true);
    assert.notEqual(response.headers.get('x-c020-deployment-stamp'), 'production');
  });
}

test('unchanged old consumers observe equal semantics through BOTH actual HTTP implementations', async () => {
  for (const id of ['synthetic-001', 'synthetic-002']) {
    const v1 = (await get(`/fixtures/v1/getProfile?profileId=${id}`)).body;
    const v2 = (await get(`/fixtures/v2/getProfile?profileId=${id}`)).body;
    assert.deepEqual(inspector.oldConsumer(v1), inspector.oldConsumer(v2));
    const clientCopy = JSON.parse(JSON.stringify(v1));
    clientCopy.profile.preferences.topics.push('local-mutation');
    assert.deepEqual((await get(`/fixtures/v2/getProfile?profileId=${id}`)).body, v2);
  }
});

for (const route of ['/fixtures/v3/getProfile?profileId=synthetic-001', '/profiles', '/server.cjs', '/C001/approved-contract.js']) {
  test(`unknown path ${route} does not fall back to a healthy fixture`, async () => {
    const { response, body } = await get(route);
    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
}

test('scope is explicit about synthetic data, observed tooling, and unqualified production/native execution', async () => {
  const { response, body } = await get('/scope.json');
  assert.equal(response.status, 200);
  assert.equal(body.businessData, 'synthetic');
  assert.equal(body.transport, '127.0.0.1 HTTP only');
  assert.equal(body.testRuntime, process.version);
  for (const field of ['productionRuntimeValidated', 'identityVerified', 'nativeTargetQualified', 'controlApiImplemented', 'durableStoreImplemented']) {
    assert.equal(body[field], false);
  }
  assert.equal(body.liveAzureRuns, 0);
  assert.equal(body.authorizedCloudSpend, 0);
});

test('inspection assets are allowlisted, noncached, and use only local scripts', async () => {
  for (const route of ['/', '/contract.js', '/inspector.js', '/page.js', '/styles.css']) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.text()).length > 100);
  }
});

test('read-only methods, foreign origins, and forged Host headers are explicitly rejected', async () => {
  const post = await get('/fixtures/v1/getProfile?profileId=synthetic-001', { method: 'POST' });
  assert.equal(post.response.status, 405);
  assert.equal(post.body.error.code, 'METHOD_NOT_ALLOWED');
  const crossOrigin = await get('/scope.json', { headers: { Origin: 'https://example.invalid' } });
  assert.equal(crossOrigin.response.status, 403);
  assert.equal(crossOrigin.body.error.code, 'CROSS_ORIGIN_DENIED');
  const raw = await new Promise((resolve, reject) => {
    const request = http.get(`${origin}/scope.json`, { headers: { Host: 'example.invalid' } }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
  });
  assert.equal(raw, 421);
});

test('CLI refuses arbitrary host/port/stamp overrides before starting any listener', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.cjs'), '--host=0.0.0.0'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /accepts no host, port/);
  assert.doesNotMatch(run.stdout, /listening/);
});

test('CLI startup rechecks the real current C001 local-only consent', async () => {
  const local = await startLocal();
  try {
    assert.equal(local.address().address, '127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${local.address().port}/scope.json`);
    assert.equal(response.status, 200);
  } finally {
    local.closeAllConnections();
    await new Promise((resolve) => local.close(resolve));
  }
});

test('missing, malformed, and forged current consent cannot create a listener', async () => {
  let creates = 0;
  const file = path.join(__dirname, '..', 'server.cjs');
  for (const authority of [null, '{', '{}', '{"approvals":{"C001":{"designAndLocalImplementationApproved":true}}}']) {
    const module = { exports: {} };
    const context = vm.createContext({
      module, __dirname: path.dirname(file), process, console,
      require(name) {
        if (name === 'node:fs') return { readFileSync() { if (authority === null) throw new Error('missing'); return authority; } };
        if (name === 'node:http') return { createServer() { creates++; throw new Error('unexpected listener'); } };
        if (name.startsWith('.')) return require(path.resolve(path.dirname(file), name));
        return require(name);
      }
    });
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    await assert.rejects(module.exports.startLocal(), /consent (is unavailable|denied)/);
  }
  assert.equal(creates, 0);
});
