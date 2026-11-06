'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { exchange, request, startServer } = require('./k-c020-support.cjs');

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const LIMIT = { timeout: 20000 };
const NOT_FOUND = 'No local fixture or inspection asset has that path.';
let live;
before(async () => { live = await startServer(); }, LIMIT);
after(async () => { await live.close(); }, LIMIT);

function assertHeaders(response, type) {
  assert.equal(response.headers['content-type'], type);
  assert.equal(response.headers['content-length'], String(response.body.length));
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['content-security-policy'], CSP);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-c020-scope'], 'synthetic-loopback-only');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
}

function assertRefusal(response, status, code, message) {
  assert.equal(response.status, status);
  assert.deepEqual(JSON.parse(response.text), { error: { code, message }, businessData: 'synthetic', localOnly: true });
  assertHeaders(response, 'application/json; charset=utf-8');
}

const get = (target, headers, body) => exchange(live.port, request(live.host, 'GET', target, headers, body));

test('a GET that declares a body is refused before routing, however the body is framed', LIMIT, async () => {
  const message = 'GET fixture requests must not contain a body.';
  for (const [headers, body] of [
    [{ 'Content-Length': '5' }, 'hello'],
    [{ 'Content-Length': '1' }, 'x'],
    [{ 'Transfer-Encoding': 'chunked' }, '5\r\nhello\r\n0\r\n\r\n']
  ]) {
    assertRefusal(await get('/scope.json', headers, body), 400, 'UNEXPECTED_BODY', message);
    assertRefusal(await get('/fixtures/v1/getProfile?profileId=synthetic-001', headers, body), 400, 'UNEXPECTED_BODY', message);
  }
  assert.equal((await get('/scope.json', { 'Content-Length': '0' })).status, 200, 'an empty declared body is not a body');
});

test('request targets above 2048 characters are 414 and exactly 2048 characters still reach routing', LIMIT, async () => {
  const message = 'The local request URL is too long.';
  assertRefusal(await get(`/${'a'.repeat(2048)}`), 414, 'URL_TOO_LONG', message);
  assertRefusal(await get(`/scope.json?${'q'.repeat(3000)}`), 414, 'URL_TOO_LONG', message);
  assertRefusal(await get(`/${'a'.repeat(2047)}`), 404, 'NOT_FOUND', NOT_FOUND);
});

test('fragments and foreign or malformed targets are INVALID_URL while the own absolute form is accepted', LIMIT, async () => {
  const explicit = 'An explicit local URL without a fragment is required.';
  const otherPort = live.port === 65535 ? live.port - 1 : live.port + 1;
  for (const target of ['/scope.json#frag', '//evil.example/scope.json', 'http://example.invalid/scope.json',
    `http://127.0.0.1:${otherPort}/scope.json`, 'http://127.0.0.1/scope.json']) {
    assertRefusal(await get(target), 400, 'INVALID_URL', explicit);
  }
  for (const target of ['//[', 'http://[::1']) {
    assertRefusal(await get(target), 400, 'INVALID_URL', 'The local URL is malformed.');
  }
  const own = await get(`http://${live.host}/scope.json`);
  assert.equal(own.status, 200);
  assert.deepEqual(JSON.parse(own.text), JSON.parse((await get('/scope.json')).text));
});

test('the scope record and every inspection asset refuse query parameters', LIMIT, async () => {
  assertRefusal(await get('/scope.json?x=1'), 400, 'INVALID_QUERY', 'The scope record accepts no query parameters.');
  for (const route of ['/', '/contract.js', '/inspector.js', '/page.js', '/styles.css']) {
    assertRefusal(await get(`${route}?x=1`), 400, 'INVALID_QUERY', 'The inspection assets accept no query parameters.');
  }
});

test('every method except GET is METHOD_NOT_ALLOWED, including HEAD and OPTIONS', LIMIT, async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE']) {
    assertRefusal(await exchange(live.port, request(live.host, method, '/scope.json')), 405, 'METHOD_NOT_ALLOWED', 'Only read-only GET is supported.');
  }
  const head = await exchange(live.port, request(live.host, 'HEAD', '/scope.json'));
  assert.equal(head.status, 405);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['cache-control'], 'no-store');
});

test('the guards run in a fixed order: host, origin, method, body, URL length, URL shape', LIMIT, async () => {
  const foreign = { Origin: 'https://example.invalid' };
  const cases = [
    ['example.invalid', 'POST', '/scope.json', { ...foreign, 'Content-Length': '1' }, 'x', 421, 'LOCAL_HOST_REQUIRED'],
    [live.host, 'POST', '/scope.json', { ...foreign, 'Content-Length': '1' }, 'x', 403, 'CROSS_ORIGIN_DENIED'],
    [live.host, 'POST', '/scope.json', { 'Content-Length': '1' }, 'x', 405, 'METHOD_NOT_ALLOWED'],
    [live.host, 'GET', `/${'a'.repeat(3000)}`, { 'Content-Length': '1' }, 'x', 400, 'UNEXPECTED_BODY'],
    [live.host, 'GET', `/${'a'.repeat(3000)}#frag`, {}, '', 414, 'URL_TOO_LONG']
  ];
  for (const [host, method, target, headers, body, status, code] of cases) {
    const response = await exchange(live.port, request(host, method, target, headers, body));
    assert.equal(response.status, status, code);
    assert.equal(JSON.parse(response.text).error.code, code);
  }
});

test('only the exact listener host and origin are served', LIMIT, async () => {
  const hostMessage = 'Only the actual 127.0.0.1 listener is supported.';
  const otherPort = live.port === 65535 ? live.port - 1 : live.port + 1;
  for (const host of [`localhost:${live.port}`, '127.0.0.1', `127.0.0.1:${otherPort}`, `[::1]:${live.port}`, `LOCALHOST:${live.port}`]) {
    assertRefusal(await exchange(live.port, request(host, 'GET', '/scope.json')), 421, 'LOCAL_HOST_REQUIRED', hostMessage);
  }
  assertRefusal(await exchange(live.port, 'GET /scope.json HTTP/1.0\r\n\r\n'), 421, 'LOCAL_HOST_REQUIRED', hostMessage);
  for (const origin of ['null', `http://localhost:${live.port}`, `${live.origin}/`, `https://127.0.0.1:${live.port}`, `HTTP://127.0.0.1:${live.port}`]) {
    assertRefusal(await get('/scope.json', { Origin: origin }), 403, 'CROSS_ORIGIN_DENIED',
      'This synthetic inspector supports only its own loopback origin.');
  }
  assert.equal((await get('/scope.json', { Origin: live.origin })).status, 200);
});
