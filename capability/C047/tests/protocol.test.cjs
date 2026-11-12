'use strict';
const { test } = require('node:test');
const { assert, fixture, request, login, raw, world, subject } = require('./kit.cjs');

test('all unsupported candidate methods recheck authorization before method dispatch', async () => {
  const f = await fixture();
  try {
    const member = await login(f), before = world(f);
    for (const row of subject.ROUTES.filter(r => r.candidate)) for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'TRACE']) {
      if (row.method === method) continue;
      const denied = await request(f, row.path, { method });
      assert.equal(denied.status, 401, 'UNAUTHORIZED_METHOD_NO_BYPASS:' + row.path + ':' + method);
      assert.equal(/synthetic-00[12]|displayName/.test(denied.raw), false, 'UNAUTHORIZED_METHOD_NO_DATA');
      const allowed = await request(f, row.path, { method, token: member.token });
      assert.equal(allowed.status, 405, 'AUTHORIZED_UNSUPPORTED_METHOD_TYPED_DENIAL');
    }
    assert.deepEqual(world(f), before, 'ALL_UNSUPPORTED_METHODS_NO_EFFECT');
  } finally { await f.app.close(); }
});

test('unmounted source/static/traversal/encoding aliases are not candidate bypasses', async () => {
  const f = await fixture();
  try {
    const member = await login(f), before = world(f);
    for (const url of ['/candidate/index.html', '/candidate/page.js', '/page.js', '/contract.js', '/server.cjs', '/C022', '/v1/profiles',
      '/candidate//profile.json', '/%63andidate', '/candidate%2fprofile.json', '/V2', '/candidate%5cprofile.json', '//candidate', '/candidate/../candidate', '/candidate\\profile.json']) {
      const text = `GET ${url} HTTP/1.1\r\nHost: $HOST\r\nAuthorization: Bearer ${member.token}\r\nConnection: close\r\n\r\n`;
      const r = await raw(f, text);
      assert.match(r.data, /^HTTP\/1\.1 (400|404) /, 'UNMOUNTED_ALIAS_DENIED:' + url);
      assert.equal(/synthetic-00[12]|displayName/.test(r.data), false, 'UNMOUNTED_ALIAS_NO_DATA');
    }
    assert.deepEqual(world(f), before, 'UNMOUNTED_ALIAS_NO_EFFECT');
  } finally { await f.app.close(); }
});

test('HTTP1.0, absolute form, Expect, pipeline, CONNECT, Upgrade and h2c preserve refusal boundaries', async () => {
  const f = await fixture();
  try {
    const member = await login(f), before = world(f);
    for (const [name, bytes, statuses] of [
      ['HTTP10', 'GET /candidate HTTP/1.0\r\nHost: $HOST\r\n\r\n', [401]],
      ['HTTP10-authorized', `GET /candidate HTTP/1.0\r\nHost: $HOST\r\nAuthorization: Bearer ${member.token}\r\n\r\n`, [200]],
      ['absolute-form', 'GET http://$HOST/candidate HTTP/1.1\r\nHost: $HOST\r\n\r\n', [400]],
      ['expect-unknown', 'GET /candidate HTTP/1.1\r\nHost: $HOST\r\nExpect: unsupported\r\n\r\n', [417]],
      ['continue-denied', 'POST /candidate/projects HTTP/1.1\r\nHost: $HOST\r\nExpect: 100-continue\r\nContent-Length: 100\r\n\r\n', [401]],
      ['connect', 'CONNECT $HOST HTTP/1.1\r\nHost: $HOST\r\n\r\n', [405]],
      ['upgrade', 'GET /candidate HTTP/1.1\r\nHost: $HOST\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n', [405]],
      ['h2c-upgrade', 'GET /candidate HTTP/1.1\r\nHost: $HOST\r\nConnection: Upgrade\r\nUpgrade: h2c\r\n\r\n', [405]],
      ['h2-preface', 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n', [400]],
      ['pipeline-after-denial', `GET /candidate HTTP/1.1\r\nHost: $HOST\r\n\r\nPOST /candidate/projects HTTP/1.1\r\nHost: $HOST\r\nAuthorization: Bearer ${member.token}\r\nContent-Type: application/json\r\nContent-Length: 23\r\n\r\n{"name":"bad","units":1}`, [401]],
      ['prior-legitimate-preserved', 'GET /scope.json HTTP/1.1\r\nHost: $HOST\r\n\r\nGET /candidate HTTP/1.1\r\nHost: $HOST\r\n\r\nGET /scope.json HTTP/1.1\r\nHost: $HOST\r\n\r\n', [200, 401]]
    ]) {
      const r = await raw(f, bytes, { keepOpen: true });
      const actual = [...r.data.matchAll(/HTTP\/1\.[01] ([0-9]{3}) /g)].map(m => Number(m[1]));
      assert.deepEqual(actual, statuses, 'PROTOCOL_EXACT_STATUS_SEQUENCE:' + name);
      if (!name.includes('authorized')) assert.equal(/synthetic-00[12]|displayName/.test(r.data), false, 'PROTOCOL_REFUSAL_NO_DATA:' + name);
      assert.equal(r.closed, true, 'PROTOCOL_OWN_SOCKET_CLOSED:' + name);
    }
    assert.deepEqual(world(f), before, 'PROTOCOL_REFUSAL_NO_WORLD_EFFECT');
  } finally { await f.app.close(); }
});

test('parser own errors and loopback/origin/URL guards do not reach candidate serving', async () => {
  const f = await fixture();
  try {
    const before = world(f);
    for (const [bytes, status] of [
      ['GET /candidate HTTP/1.1\r\n\r\n', 421],
      ['GET /candidate HTTP/1.1\r\nHost: evil.test\r\n\r\n', 421],
      ['GET /candidate HTTP/1.1\r\nHost: $HOST\r\nOrigin: https://evil.test\r\n\r\n', 403],
      ['GET /candidate#fragment HTTP/1.1\r\nHost: $HOST\r\n\r\n', 400],
      ['GET /' + 'x'.repeat(2050) + ' HTTP/1.1\r\nHost: $HOST\r\n\r\n', 414],
      ['GET /candidate HTTP/1.1\r\nHost: $HOST\r\nX-Big: ' + 'x'.repeat(20000) + '\r\n\r\n', 431],
      ['BAD METHOD /candidate HTTP/1.1\r\nHost: $HOST\r\n\r\n', 400]
    ]) {
      const r = await raw(f, bytes, { keepOpen: true });
      assert.match(r.data, new RegExp('^HTTP/1.1 ' + status + ' '), 'TYPED_PARSER_OR_LOCAL_REFUSAL');
      assert.equal(/synthetic-00[12]|displayName/.test(r.data), false, 'PARSER_OR_LOCAL_REFUSAL_NO_DATA');
    }
    assert.deepEqual(world(f), before, 'PARSER_OR_LOCAL_REFUSAL_NO_EFFECT');
  } finally { await f.app.close(); }
});

test('cache/conditional/range credentials are never preview authorization', async () => {
  const f = await fixture();
  try {
    for (const headers of [{ 'If-None-Match': '*' }, { Range: 'bytes=0-2' }, { 'If-Modified-Since': 'Wed, 01 Jan 2020 00:00:00 GMT' }]) {
      const r = await request(f, '/assets/candidate.json', { headers });
      assert.equal(r.status, 401, 'CONDITIONAL_OR_RANGE_UNAUTHORIZED');
      assert.equal(r.headers['cache-control'], 'no-store', 'NO_PREVIEW_CACHE');
      assert.equal(r.headers.vary, 'Authorization', 'AUTHORITY_VARY');
    }
  } finally { await f.app.close(); }
});
