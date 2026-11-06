'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const contract = require('../contract.js');
const { createWorld } = require('../fixture.cjs');
const { scope } = require('../server.cjs');
const { allowedResponseHeaders, bearer, credentials, request, withServer } = require('./support.cjs');

const emittedCodes = new Set();
async function call(fixture, options) {
  const response = await request(fixture, options);
  if (response.json && response.json.error) emittedCodes.add(response.json.error.code);
  return response;
}
const ALPHA_COOKIE = 'c032_client=synthetic-client-alpha; session=synthetic-session-1';

for (const [client, credential, requests, destination] of [
  ['synthetic-client-alpha', credentials.alpha, 1, 'synthetic-destination-blue'],
  ['synthetic-client-alpha', credentials.alpha, 2, 'synthetic-destination-blue'],
  ['synthetic-client-alpha', credentials.alpha, 3, 'synthetic-destination-green'],
  ['synthetic-client-beta', credentials.beta, 1, 'synthetic-destination-blue']
]) {
  test(`${client} served ${requests} time(s) is observed on ${destination} with a coherent body and headers`, async () => {
    await withServer({}, async (fixture) => {
      let last;
      for (let index = 0; index < requests; index += 1) last = await call(fixture, { headers: bearer(credential) });
      assert.equal(last.status, 200);
      assert.equal(last.json.client.id, client);
      assert.equal(last.json.destination.id, destination);
      assert.equal(last.json.destination.version, destination.endsWith('blue') ? '1.0.0' : '2.0.0');
      assert.equal(last.json.state.counter, requests);
      assert.equal(last.json.apiContract, 'cookieless-observation/1');
      assert.equal(last.json.businessData, 'synthetic');
      assert.equal(last.headers['x-c032-destination'], destination);
      assert.equal(last.headers['x-c032-state-counter'], String(requests));
      assert.equal(last.headers['x-c032-stamp'], 'C032-loopback-r1');
      assert.equal(last.headers['content-type'], 'application/json; charset=utf-8');
      assert.equal(last.headers['cache-control'], 'no-store');
    });
  });
}

test('state is per client and survives the destination transition', async () => {
  await withServer({}, async (fixture) => {
    for (let index = 0; index < 2; index += 1) await call(fixture, { headers: bearer(credentials.alpha) });
    const beta = await call(fixture, { headers: bearer(credentials.beta) });
    const third = await call(fixture, { headers: bearer(credentials.alpha) });
    assert.equal(beta.json.state.counter, 1);
    assert.equal(beta.json.destination.id, 'synthetic-destination-blue');
    assert.equal(third.json.state.counter, 3);
    assert.equal(third.json.destination.id, 'synthetic-destination-green');
  });
});

for (const [name, headers, status, code] of [
  ['no Authorization header', {}, 401, 'CREDENTIAL_MISSING'],
  ['an empty Bearer value', { Authorization: 'Bearer ' }, 401, 'CREDENTIAL_MALFORMED'],
  ['the Basic scheme', { Authorization: 'Basic YWxwaGE6YWxwaGE=' }, 401, 'CREDENTIAL_MALFORMED'],
  ['a well-formed but unissued credential', bearer(credentials.forged), 401, 'CREDENTIAL_FORGED'],
  ['the expired credential', bearer(credentials.expired), 401, 'CREDENTIAL_EXPIRED'],
  ['two Authorization headers', { Authorization: [`Bearer ${credentials.alpha}`, `Bearer ${credentials.beta}`] }, 400, 'CREDENTIAL_AMBIGUOUS']
]) {
  test(`${name} fails as ${code} with a decoy identity cookie and invents no default identity`, async () => {
    await withServer({}, async (fixture) => {
      const response = await call(fixture, { headers: { ...headers, Cookie: ALPHA_COOKIE } });
      assert.equal(response.status, status);
      assert.equal(response.json.error.code, code);
      assert.equal(response.headers['www-authenticate'], status === 401 ? 'Bearer realm="c032-synthetic"' : undefined);
      for (const field of ['client', 'destination', 'state', 'stamp', 'apiContract']) assert.equal(Object.hasOwn(response.json, field), false, field);
      assert.equal(response.headers['x-c032-destination'], undefined);
      const first = await call(fixture, { headers: bearer(credentials.alpha) });
      assert.equal(first.json.state.counter, 1, 'a failed request advanced no served-request counter');
    });
  });
}

test('expiry follows the server logical epoch: a later epoch expires every credential', async () => {
  await withServer({ world: createWorld({ epoch: 10 }) }, async (fixture) => {
    for (const credential of [credentials.alpha, credentials.beta]) {
      const response = await call(fixture, { headers: bearer(credential) });
      assert.equal(response.status, 401);
      assert.equal(response.json.error.code, 'CREDENTIAL_EXPIRED');
    }
  });
});

test('cookies that name an identity, a destination, an affinity or a credential change nothing', async () => {
  const cookies = ['c032_destination=synthetic-destination-green', 'c032_client=synthetic-client-beta; session=synthetic-session-1',
    'ARRAffinity=synthetic-affinity-green; ARRAffinitySameSite=synthetic-affinity-green',
    `authorization=Bearer ${credentials.beta}`, 'c032_destination=synthetic-destination-blue; c032_client=synthetic-client-alpha'];
  for (const cookie of cookies) {
    await withServer({}, async (fixture) => {
      const response = await call(fixture, { headers: bearer(credentials.alpha, { Cookie: cookie }) });
      assert.equal(response.status, 200, cookie);
      assert.deepEqual([response.json.client.id, response.json.destination.id, response.json.state.counter],
        ['synthetic-client-alpha', 'synthetic-destination-blue', 1], cookie);
      const missing = await call(fixture, { headers: { Cookie: cookie } });
      assert.equal(missing.status, 401, cookie);
      assert.equal(missing.json.error.code, 'CREDENTIAL_MISSING', cookie);
    });
  }
});

test('callers cannot supply or override a destination, state, stamp or identity', async () => {
  await withServer({}, async (fixture) => {
    for (const query of ['?destination=synthetic-destination-green', '?stamp=forged', '?state=99', '?client=synthetic-client-beta', '?', '?a=1&a=2']) {
      const response = await call(fixture, { path: `/api/v1/observation${query}`, headers: bearer(credentials.alpha) });
      assert.equal(response.status, 400, query);
      assert.equal(response.json.error.code, 'INVALID_QUERY', query);
      for (const field of ['client', 'destination', 'state', 'stamp']) assert.equal(Object.hasOwn(response.json, field), false);
    }
    for (const path of ['/scope.json?x=1', '/?x=1', '/page.js?x=1']) {
      assert.equal((await call(fixture, { path })).json.error.code, 'INVALID_QUERY', path);
    }
    const jsonBody = await call(fixture, {
      headers: bearer(credentials.alpha, { 'Content-Length': '33', 'Content-Type': 'application/json' }), body: '{"destination":"green","counter":99}'.slice(0, 33)
    });
    assert.equal(jsonBody.status, 400);
    assert.equal(jsonBody.json.error.code, 'UNEXPECTED_BODY');
    const chunked = await call(fixture, { headers: bearer(credentials.alpha, { 'Transfer-Encoding': 'chunked' }), body: 'x' });
    assert.equal(chunked.json.error.code, 'UNEXPECTED_BODY');
    const ignored = await call(fixture, {
      headers: bearer(credentials.alpha, {
        'X-C032-Destination': 'synthetic-destination-green', 'X-C032-Stamp': 'forged', 'X-C032-State-Counter': '99',
        'X-Forwarded-Host': 'example.invalid', 'X-Destination': 'synthetic-destination-green', 'Set-Cookie': 'c032_destination=synthetic-destination-green'
      })
    });
    assert.equal(ignored.status, 200);
    assert.deepEqual([ignored.json.destination.id, ignored.json.state.counter, ignored.json.stamp], ['synthetic-destination-blue', 1, 'C032-loopback-r1']);
    assert.equal(ignored.headers['x-c032-destination'], 'synthetic-destination-blue');
    assert.equal(ignored.headers['x-c032-stamp'], 'C032-loopback-r1');
    assert.equal(ignored.headers['x-forwarded-host'], undefined);
  });
});

test('only read-only GET exists: other methods fail with an Allow header', async () => {
  await withServer({}, async (fixture) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) {
      for (const target of ['/api/v1/observation', '/scope.json', '/', '/page.js']) {
        const response = await call(fixture, { method, path: target, headers: bearer(credentials.alpha) });
        assert.equal(response.status, 405, `${method} ${target}`);
        assert.equal(response.headers.allow, 'GET');
        if (method !== 'HEAD') assert.equal(response.json.error.code, 'METHOD_NOT_ALLOWED');
      }
    }
    const first = await call(fixture, { headers: bearer(credentials.alpha) });
    assert.equal(first.json.state.counter, 1, 'rejected methods served nothing');
  });
});

test('unknown paths, other sources and traversal attempts are 404 and never a healthy fixture', async () => {
  await withServer({}, async (fixture) => {
    for (const target of ['/api/v1/advance', '/api/v1/observation/', '/api/v1/Observation', '/server.cjs', '/fixture.cjs',
      '/C001/approved-contract.js', '/%2e%2e/server.cjs', '/favicon.ico', '/scope.json/', '/tests/support.cjs']) {
      const response = await call(fixture, { path: target, headers: bearer(credentials.alpha) });
      assert.equal(response.status, 404, target);
      assert.equal(response.json.error.code, 'NOT_FOUND', target);
      assert.equal(Object.hasOwn(response.json, 'destination'), false);
    }
  });
});

test('foreign Host, foreign Origin, oversized and malformed URLs fail explicitly', async () => {
  await withServer({}, async (fixture) => {
    const host = await call(fixture, { path: '/scope.json', headers: { Host: 'example.invalid' } });
    assert.equal(host.status, 421);
    assert.equal(host.json.error.code, 'LOCAL_HOST_REQUIRED');
    const origin = await call(fixture, { path: '/scope.json', headers: { Origin: 'https://example.invalid' } });
    assert.equal(origin.status, 403);
    assert.equal(origin.json.error.code, 'CROSS_ORIGIN_DENIED');
    const own = await call(fixture, { path: '/scope.json', headers: { Origin: fixture.origin } });
    assert.equal(own.status, 200);
    const long = await call(fixture, { path: `/${'a'.repeat(2100)}` });
    assert.equal(long.status, 414);
    assert.equal(long.json.error.code, 'URL_TOO_LONG');
    for (const target of ['//', '//example.invalid/scope.json', '/scope.json#fragment']) {
      const response = await call(fixture, { path: target });
      assert.equal(response.status, 400, target);
      assert.equal(response.json.error.code, 'INVALID_URL', target);
    }
  });
});

test('no response sets a cookie, permits cross-origin use or carries a header outside the closed allowlist', async () => {
  const requests = [
    { headers: bearer(credentials.alpha, { Cookie: ALPHA_COOKIE }) },
    { headers: { Cookie: ALPHA_COOKIE } },
    { headers: bearer(credentials.forged, { Cookie: ALPHA_COOKIE }) },
    { headers: bearer(credentials.expired) },
    { path: '/scope.json', headers: { Cookie: ALPHA_COOKIE } },
    { path: '/', headers: { Cookie: ALPHA_COOKIE } },
    { path: '/page.js' },
    { path: '/no-such-path', headers: { Cookie: ALPHA_COOKIE } },
    { method: 'POST', headers: { Cookie: ALPHA_COOKIE } },
    { path: '/api/v1/observation?destination=x', headers: bearer(credentials.alpha) }
  ];
  await withServer({}, async (fixture) => {
    for (const options of requests) {
      const response = await call(fixture, options);
      assert.equal(response.headers['set-cookie'], undefined);
      assert.deepEqual(response.rawHeaders.filter((name, index) => index % 2 === 0).map((name) => name.toLowerCase())
        .filter((name) => !allowedResponseHeaders.includes(name)), []);
      assert.equal(response.headers['access-control-allow-origin'], undefined);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['referrer-policy'], 'no-referrer');
      assert.equal(response.headers['x-c032-scope'], 'synthetic-loopback-only');
    }
  });
});

test('assets are allowlisted, byte-exact, noncached and governed by a strict CSP', async () => {
  await withServer({}, async (fixture) => {
    const expected = { '/': ['index.html', 'text/html; charset=utf-8'], '/contract.js': ['contract.js', 'text/javascript; charset=utf-8'],
      '/client.js': ['client.js', 'text/javascript; charset=utf-8'], '/page.js': ['page.js', 'text/javascript; charset=utf-8'],
      '/style.css': ['style.css', 'text/css; charset=utf-8'] };
    for (const [route, [file, type]] of Object.entries(expected)) {
      const response = await call(fixture, { path: route });
      assert.equal(response.status, 200, route);
      assert.equal(response.headers['content-type'], type);
      assert.equal(response.text, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['content-security-policy'],
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    }
  });
});

test('an unavailable asset is an explicit 500 without any observation', async () => {
  const readAsset = () => { throw new Error('disk unavailable'); };
  await withServer({ readAsset }, async (fixture) => {
    const response = await call(fixture, { path: '/page.js' });
    assert.equal(response.status, 500);
    assert.equal(response.json.error.code, 'FIXTURE_UNAVAILABLE');
    assert.equal(Object.hasOwn(response.json, 'destination'), false);
    assert.equal((await call(fixture, { headers: bearer(credentials.alpha) })).json.state.counter, 1);
  });
});

test('the scope record is explicit about synthetic data and unqualified production, identity and native execution', async () => {
  await withServer({}, async (fixture) => {
    const response = await call(fixture, { path: '/scope.json' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, scope);
    assert.equal(response.json.businessData, 'synthetic');
    assert.equal(response.json.transport, '127.0.0.1 HTTP only');
    assert.equal(response.json.testRuntime, process.version);
    for (const field of ['productionRuntimeValidated', 'identityVerified', 'nativeTargetQualified', 'controlApiImplemented', 'durableStoreImplemented']) {
      assert.equal(response.json[field], false, field);
    }
    assert.equal(response.json.liveAzureRuns, 0);
    assert.equal(response.json.authorizedCloudSpend, 0);
    assert.match(response.json.credentialTransport, /cookies are never read or set/);
  });
});

test('the request hook reports the raw Cookie header the server was sent while the observation ignores it', async () => {
  await withServer({}, async (fixture) => {
    await call(fixture, { headers: bearer(credentials.alpha) });
    await call(fixture, { headers: bearer(credentials.alpha, { Cookie: 'c032_destination=synthetic-destination-green' }) });
    assert.deepEqual(fixture.seen.map((item) => item.headers.cookie), [undefined, 'c032_destination=synthetic-destination-green']);
    assert.ok(fixture.seen.every((item) => item.method === 'GET' && item.url === '/api/v1/observation'));
  });
});

test('the public error catalogue is exactly the set of codes the server emitted in this suite', () => {
  assert.deepEqual([...emittedCodes].sort(), [...contract.errorCodes].sort());
});
