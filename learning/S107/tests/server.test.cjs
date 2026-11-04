'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { startFixture, ownedOrigin, policyCsp } = require('../serve.cjs');

function get(origin, target, headers = {}, method = 'GET') {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/);
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${target}`, { method, headers, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Owned test request exceeded deadline')));
    req.on('error', reject);
    req.end();
  });
}
async function runtime(fixture, label) {
  const response = await get(fixture.origins[label], '/runtime.js');
  return JSON.parse(response.bytes.toString().match(/window\.S107_RUNTIME = (\{[^\n]+\});/)[1]);
}
test('fixture chooses three distinct literal ephemeral origins and idempotently closes all owned listeners', async () => {
  const fixture = await startFixture({ ttlMs: 10000 });
  try {
    assert.equal(new Set(Object.values(fixture.origins)).size, 3);
    assert.deepEqual(fixture.servers.map(ownedOrigin), [fixture.origins.A, fixture.origins.B, fixture.origins.api]);
    const page = await get(fixture.origins.A, '/');
    assert.equal(page.status, 200);
    assert.match(page.bytes.toString(), /Training rehearsal - synthetic data - not a live Azure result/);
    assert.equal(page.headers['content-security-policy'], policyCsp(fixture.origins.api));
    assert.match(page.bytes.toString(), new RegExp(`connect-src 'self' ${fixture.origins.api}`));
    assert.doesNotMatch(page.headers['content-security-policy'], /127\.0\.0\.1:\*/);
    const cfg = await get(fixture.origins.B, '/runtime.js');
    assert.match(cfg.bytes.toString(), /"origin":"B"/);
  } finally { await fixture.close(); await fixture.close(); }
  assert.equal(fixture.cleanup().listenersClosed, true);
  for (const server of fixture.servers) assert.throws(() => ownedOrigin(server), { code: 'OWNED_ORIGIN' });
});
test('server contract sends real allow/deny headers and metadata-only receipts; this Node test is NOT CORS proof', async () => {
  const fixture = await startFixture({ ttlMs: 10000 });
  try {
    const runs = { A: await runtime(fixture, 'A'), B: await runtime(fixture, 'B') };
    for (const label of ['A', 'B']) {
      for (const [index, policy] of ['baseline', 'compatible', 'incompatible'].entries()) {
        const response = await get(fixture.origins.api, `/profile?policy=${policy}&attempt=${index + 1}&run=${runs[label].runId}`,
          { Origin: fixture.origins[label] });
        assert.equal(response.status, 200);
        assert.equal(response.headers['access-control-allow-origin'],
          policy === 'incompatible' && label === 'B' ? undefined : fixture.origins[label]);
        assert.equal(response.headers['access-control-allow-credentials'], undefined);
        assert.equal(response.headers.vary, 'Origin');
        const metadata = JSON.parse((await get(fixture.origins[label], `/receipt?attempt=${index + 1}&run=${runs[label].runId}`)).bytes);
        assert.deepEqual(Object.keys(metadata), ['receipt']);
        assert.equal(metadata.receipt.origin, fixture.origins[label]);
        assert.equal(metadata.receipt.status, 200);
        assert.equal(metadata.receipt.allowOrigin, response.headers['access-control-allow-origin'] || null);
        assert.equal(metadata.receipt.bodySHA256, createHash('sha256').update(response.bytes).digest('hex'));
        assert.equal(metadata.receipt.bodyBytes, response.bytes.length);
        assert.doesNotMatch(JSON.stringify(metadata), /Cedar learner|fictional-profile|displayName/);
      }
    }
    const before = fixture.receiptSnapshot();
    assert.equal((await get(fixture.origins.api, `/profile?policy=compatible&attempt=3&run=${runs.B.runId}`, { Origin: fixture.origins.B })).status, 409);
    assert.deepEqual(fixture.receiptSnapshot(), before);
    assert.equal(before.length, 6);
  } finally { await fixture.close(); }
});
test('unsafe hosts, Origins, methods, credentials, target paths and query forgery are rejected without API receipts', async () => {
  const fixture = await startFixture({ ttlMs: 10000 });
  try {
    const cases = [
      [fixture.origins.A, '/', { Host: 'localhost:80' }, 'GET', 421],
      [fixture.origins.A, '/', { Origin: fixture.origins.B }, 'GET', 403],
      [fixture.origins.A, '/', { Cookie: 'fictional=1' }, 'GET', 403],
      [fixture.origins.A, '/', { Authorization: 'fictional' }, 'GET', 403],
      [fixture.origins.A, '/', {}, 'POST', 405],
      [fixture.origins.A, '/%2e%2e/README.md', {}, 'GET', 400],
      [fixture.origins.A, '/serve.cjs', {}, 'GET', 404],
      [fixture.origins.A, '/receipt?attempt=7', {}, 'GET', 400],
      [fixture.origins.api, '/profile?policy=baseline&attempt=1', {}, 'GET', 403],
      [fixture.origins.api, '/profile?policy=baseline&attempt=1', { Origin: 'null' }, 'GET', 403],
      [fixture.origins.api, '/profile?policy=baseline&attempt=7', { Origin: fixture.origins.A }, 'GET', 400],
      [fixture.origins.api, '/profile?policy=baseline&attempt=1&extra=1', { Origin: fixture.origins.A }, 'GET', 400],
      [fixture.origins.api, '/profile?policy=baseline&attempt=1', { Origin: fixture.origins.A }, 'HEAD', 400],
    ];
    for (const [origin, target, headers, method, status] of cases) {
      assert.equal((await get(origin, target, headers, method)).status, status, target);
    }
    assert.deepEqual(fixture.receiptSnapshot(), []);
    assert.equal(fixture.metrics().apiGETs, 0);
  } finally { await fixture.close(); }
});
test('lifetime and ownership inputs cannot widen binding or silently fall back', async () => {
  for (const options of [null, [], { ttlMs: '1000' }, { ttlMs: 0 }, { ttlMs: 900001 },
    { port: 80 }, { host: '0.0.0.0' }, { url: 'http://localhost:80' }, { [Symbol('extra')]: true }]) {
    await assert.rejects(startFixture(options));
  }
  const accessor = {};
  Object.defineProperty(accessor, 'ttlMs', { get() { throw new Error('Getter must not run'); }, enumerable: true });
  await assert.rejects(startFixture(accessor), TypeError);
  for (const value of [null, {}, 'http://127.0.0.1:80', http.createServer()]) {
    assert.throws(() => ownedOrigin(value), { code: 'OWNED_ORIGIN' });
  }
  const fixture = await startFixture({ ttlMs: 1000 });
  await new Promise(resolve => setTimeout(resolve, 1200));
  await fixture.close();
  assert.equal(fixture.cleanup().listenersClosed, true);
});

test('per-document correlation cannot reuse a stopped API receipt; metadata contract only, NOT browser CORS proof', async () => {
  const fixture = await startFixture({ ttlMs: 10000 });
  try {
    const first = await runtime(fixture, 'B');
    assert.equal(typeof first.runId, 'string');
    const target = `/profile?policy=incompatible&attempt=1&run=${first.runId}`;
    const response = await get(fixture.origins.api, target, { Origin: fixture.origins.B });
    assert.equal(response.status, 200);
    const original = JSON.parse((await get(fixture.origins.B, `/receipt?attempt=1&run=${first.runId}`)).bytes);
    assert.equal(original.receipt.runId, first.runId);
    await new Promise((resolve, reject) => {
      fixture.servers[2].close(error => error ? reject(error) : resolve());
      fixture.servers[2].closeAllConnections();
    });
    const next = await runtime(fixture, 'B');
    assert.notEqual(next.runId, first.runId);
    const missing = JSON.parse((await get(fixture.origins.B, `/receipt?attempt=1&run=${next.runId}`)).bytes);
    assert.equal(missing.receipt, null);
    assert.deepEqual(JSON.parse((await get(fixture.origins.B, `/receipt?attempt=1&run=${first.runId}`)).bytes), original);
  } finally { await fixture.close(); }
});
test('issued correlation IDs and origin response slots are bounded without eviction across documents', async () => {
  const fixture = await startFixture({ ttlMs: 10000 });
  try {
    const runs = [];
    for (let index = 0; index < 6; index++) runs.push(await runtime(fixture, 'A'));
    assert.equal(new Set(runs.map(run => run.runId)).size, 6);
    assert.equal((await get(fixture.origins.A, '/runtime.js')).status, 429);
    for (let index = 0; index < runs.length; index++) {
      assert.equal((await get(fixture.origins.api,
        `/profile?policy=baseline&attempt=1&run=${runs[index].runId}`, { Origin: fixture.origins.A })).status, 200);
    }
    const prior = fixture.receiptSnapshot();
    assert.equal((await get(fixture.origins.api,
      `/profile?policy=baseline&attempt=2&run=${runs[0].runId}`, { Origin: fixture.origins.A })).status, 429);
    assert.deepEqual(fixture.receiptSnapshot(), prior);
    assert.equal(prior.length, 6);
  } finally { await fixture.close(); }
});
