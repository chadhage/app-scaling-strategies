'use strict';

// Initial behavioral specification of the C032 HTTP contract, retained as RED evidence.
// Subject selection: C032_TEST_SUBJECT is resolved relative to this directory and defaults to the real server.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');

const subject = require(path.resolve(__dirname, process.env.C032_TEST_SUBJECT || path.join('..', '..', 'server.cjs')));
const ALPHA = 'c032-synthetic-opaque-alpha-0001';
const BETA = 'c032-synthetic-opaque-beta-0002';
const EXPIRED = 'c032-synthetic-opaque-expired-0003';
const FORGED = 'c032-synthetic-opaque-alpha-9999';
const ALLOWED_HEADERS = new Set(['cache-control', 'content-security-policy', 'x-content-type-options', 'referrer-policy',
  'x-c032-scope', 'content-type', 'content-length', 'date', 'connection', 'keep-alive', 'www-authenticate',
  'x-c032-destination', 'x-c032-state-counter', 'x-c032-stamp', 'allow']);
const DECOY = 'c032_destination=synthetic-destination-green; c032_client=synthetic-client-beta; ARRAffinity=synthetic-affinity-green; session=synthetic-session-1';

async function withServer(body) {
  const server = subject.createLocalServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = { port: server.address().port };
  try { return await body(origin); } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function request(origin, { path: target = '/api/v1/observation', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port: origin.port, path: target, method: 'GET', headers, agent: false }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON bodies are asserted by the caller */ }
        resolve({ status: response.statusCode, headers: response.headers, json });
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

async function sequence(origin, credential, count, cookie) {
  const observed = [];
  for (let index = 0; index < count; index += 1) {
    const headers = { Authorization: `Bearer ${credential}` };
    if (cookie) headers.Cookie = cookie;
    const { status, json } = await request(origin, { headers });
    assert.equal(status, 200);
    observed.push({ client: json.client.id, destination: json.destination.id, counter: json.state.counter });
  }
  return observed;
}

test('an authenticated client is routed by the server-owned plan and counted per client', async () => {
  await withServer(async (origin) => {
    const observed = await sequence(origin, ALPHA, 4);
    assert.deepEqual(observed.map((item) => item.destination), [
      'synthetic-destination-blue', 'synthetic-destination-blue', 'synthetic-destination-green', 'synthetic-destination-green']);
    assert.deepEqual(observed.map((item) => item.counter), [1, 2, 3, 4]);
    assert.ok(observed.every((item) => item.client === 'synthetic-client-alpha'));
    const beta = await request(origin, { headers: { Authorization: `Bearer ${BETA}` } });
    assert.equal(beta.json.client.id, 'synthetic-client-beta');
    assert.equal(beta.json.state.counter, 1);
    assert.equal(beta.headers['x-c032-destination'], beta.json.destination.id);
  });
});

test('a conflicting decoy cookie changes neither the destination nor the identity', async () => {
  const baseline = await withServer((origin) => sequence(origin, ALPHA, 4));
  const decoyed = await withServer((origin) => sequence(origin, ALPHA, 4, DECOY));
  assert.deepEqual(decoyed, baseline);
});

test('a sticky cookie naming the old destination cannot hold the client after the transition', async () => {
  await withServer(async (origin) => {
    const observed = await sequence(origin, ALPHA, 4, 'c032_destination=synthetic-destination-blue; ARRAffinity=synthetic-affinity-blue');
    assert.deepEqual(observed.map((item) => item.destination).slice(2), ['synthetic-destination-green', 'synthetic-destination-green']);
  });
});

test('the server never emits Set-Cookie or any header outside the closed allowlist', async () => {
  await withServer(async (origin) => {
    const responses = [
      await request(origin, { headers: { Authorization: `Bearer ${ALPHA}`, Cookie: DECOY } }),
      await request(origin, { headers: { Cookie: DECOY } }),
      await request(origin, { path: '/no-such-path', headers: { Cookie: DECOY } })
    ];
    for (const response of responses) {
      assert.equal(response.headers['set-cookie'], undefined);
      assert.deepEqual(Object.keys(response.headers).filter((name) => !ALLOWED_HEADERS.has(name)), []);
    }
  });
});

for (const [name, headers, status, code] of [
  ['missing credential', {}, 401, 'CREDENTIAL_MISSING'],
  ['forged credential', { Authorization: `Bearer ${FORGED}` }, 401, 'CREDENTIAL_FORGED'],
  ['expired credential', { Authorization: `Bearer ${EXPIRED}` }, 401, 'CREDENTIAL_EXPIRED']
]) {
  test(`a ${name} is an explicit typed failure and a cookie never supplies the identity`, async () => {
    await withServer(async (origin) => {
      const response = await request(origin, { headers: { ...headers, Cookie: 'c032_client=synthetic-client-alpha; session=synthetic-session-1' } });
      assert.equal(response.status, status);
      assert.equal(response.json.error.code, code);
      assert.match(response.headers['www-authenticate'], /^Bearer/);
      for (const field of ['client', 'destination', 'state', 'stamp']) assert.equal(Object.hasOwn(response.json, field), false, field);
    });
  });
}

test('failed credentials never advance a served-request counter', async () => {
  await withServer(async (origin) => {
    await request(origin, { headers: { Cookie: 'c032_client=synthetic-client-alpha' } });
    await request(origin, { headers: { Authorization: `Bearer ${FORGED}` } });
    const first = await request(origin, { headers: { Authorization: `Bearer ${ALPHA}` } });
    assert.equal(first.status, 200);
    assert.equal(first.json.state.counter, 1);
  });
});

test('a caller cannot supply a destination and caller headers are ignored', async () => {
  await withServer(async (origin) => {
    const query = await request(origin, { path: '/api/v1/observation?destination=synthetic-destination-green', headers: { Authorization: `Bearer ${ALPHA}` } });
    assert.equal(query.status, 400);
    assert.equal(query.json.error.code, 'INVALID_QUERY');
    assert.equal(Object.hasOwn(query.json, 'destination'), false);
    const headers = await request(origin, {
      headers: { Authorization: `Bearer ${ALPHA}`, 'X-C032-Destination': 'synthetic-destination-green', 'X-C032-Stamp': 'forged' }
    });
    assert.equal(headers.status, 200);
    assert.equal(headers.json.destination.id, 'synthetic-destination-blue');
    assert.equal(headers.json.stamp, 'C032-loopback-r1');
  });
});
