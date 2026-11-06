'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createLocalServer, exchange, namespaceRoot, request, startServer } = require('./k-c020-support.cjs');

const LIMIT = { timeout: 20000 };
const ASSETS = [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/contract.js', 'contract.js', 'text/javascript; charset=utf-8'],
  ['/inspector.js', 'inspector.js', 'text/javascript; charset=utf-8'],
  ['/page.js', 'page.js', 'text/javascript; charset=utf-8'],
  ['/styles.css', 'styles.css', 'text/css; charset=utf-8']
];
let live;
before(async () => { live = await startServer(); }, LIMIT);
after(async () => { await live.close(); }, LIMIT);
const get = (target) => exchange(live.port, request(live.host, 'GET', target));

test('each allowlisted asset is served byte-exact with its exact type and the local security headers', LIMIT, async () => {
  for (const [route, file, type] of ASSETS) {
    const response = await get(route);
    const bytes = fs.readFileSync(path.join(namespaceRoot, file));
    assert.equal(response.status, 200, route);
    assert.equal(response.headers['content-type'], type, route);
    assert.ok(response.body.equals(bytes), `${route} must be the exact bytes of ${file}`);
    assert.equal(response.headers['content-length'], String(bytes.length), route);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['x-c020-scope'], 'synthetic-loopback-only');
    assert.match(response.headers['content-security-policy'], /^default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'/);
  }
});

test('nothing else is served: every other namespace entry and every traversal form is NOT_FOUND', LIMIT, async () => {
  const served = new Set(ASSETS.map(([, file]) => file));
  const others = fs.readdirSync(namespaceRoot).filter((name) => !served.has(name));
  for (const name of ['server.cjs', 'profiles.cjs', 'README.md', 'evidence.json', 'tests', 'evidence']) {
    assert.ok(others.includes(name), `${name} is expected in the namespace and must stay unserved`);
  }
  const targets = [...others.map((name) => `/${encodeURIComponent(name)}`), '/index.html', '/../server.cjs', '/%2e%2e/server.cjs',
    '/contract.js/../server.cjs', '/..%2fserver.cjs', '/%2e%2e%5cserver.cjs', '/styles.css%2f..%2fserver.cjs', '/Scope.json', '/scope.json/', '/contract.js/',
    '/fixtures/v3/getProfile?profileId=synthetic-001',
    '/fixtures/v1/getprofile?profileId=synthetic-001', '/fixtures/v1/getProfile/?profileId=synthetic-001'];
  for (const target of targets) {
    const response = await get(target);
    assert.equal(response.status, 404, target);
    assert.equal(JSON.parse(response.text).error.code, 'NOT_FOUND', target);
  }
});

test('an unreadable asset is FIXTURE_UNAVAILABLE without leaking the cause, and the server recovers', LIMIT, async (t) => {
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', function readFileSync(file, ...rest) {
    if (String(file).endsWith('styles.css')) throw Object.assign(new Error('simulated disk failure at C:\\private\\path'), { code: 'EIO' });
    if (String(file).endsWith('contract.js')) throw new TypeError('a TypeError that is not a URL problem');
    return original.call(this, file, ...rest);
  });
  for (const route of ['/styles.css', '/contract.js']) {
    const failed = await get(route);
    assert.equal(failed.status, 500, route);
    assert.deepEqual(JSON.parse(failed.text), {
      error: { code: 'FIXTURE_UNAVAILABLE', message: 'The local fixture is unavailable; no successful observation was made.' },
      businessData: 'synthetic', localOnly: true
    });
    assert.doesNotMatch(failed.text, /simulated|private|EIO|TypeError/);
    assert.equal(failed.headers['cache-control'], 'no-store');
  }
  assert.equal((await get('/page.js')).status, 200, 'other assets keep working');
  t.mock.reset();
  assert.equal((await get('/styles.css')).status, 200, 'the same asset is served again once the fault is gone');
});

test('createLocalServer returns independent unbound http.Server objects with bounded timeouts', LIMIT, () => {
  const first = createLocalServer();
  const second = createLocalServer();
  assert.notEqual(first, second);
  for (const server of [first, second]) {
    assert.ok(server instanceof http.Server);
    assert.equal(server.listening, false);
    assert.equal(server.address(), null);
    assert.equal(server.requestTimeout, 5000);
    assert.equal(server.headersTimeout, 5000);
    assert.equal(server.keepAliveTimeout, 1000);
  }
});
