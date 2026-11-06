'use strict';

// C010 scenario "Hostile ids, paths, methods and fields are refused uniformly", the LOCAL GUARD (rev-C010 m7: a generated mutant that the matrix cells of
// the quick mutation stage do not reach). Only the exact listener is served: the Host must be this 127.0.0.1 port (a missing or foreign Host is
// 421 LOCAL_HOST_REQUIRED) and a browser Origin, when sent, must be this origin (403 CROSS_ORIGIN_DENIED). A refusal has no effect, writes one audit
// record and closes the connection; the same request with the right Host and Origin is served.
const assert = require('node:assert/strict');
const test = require('node:test');
const { bare, bearer, exchange, JSON_TYPE } = require('./raw-http.cjs');
const { seed, same, withApp } = require('./helpers.cjs');

const QUICK = { settleMs: 300 };
const raw = (lines, body = '') => Buffer.from(`${lines.join('\r\n')}\r\n\r\n${body}`);

test('a Host that is not this listener, a missing Host and a foreign Origin are refused with their typed code, no effect and a closed connection; the right Host and Origin are served', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const token = tokens['conductor-a'];
  const own = `127.0.0.1:${context.port}`;
  const body = JSON.stringify({ name: 'late' });
  const before = same(context.app.snapshot());
  const auditBefore = context.app.auditLog().length;
  const CASES = [
    ['a foreign Host', raw(['GET /v1/me HTTP/1.1', 'Host: evil.example', bearer(token)]), 421, 'LOCAL_HOST_REQUIRED'],
    ['this address with another port', raw(['GET /v1/me HTTP/1.1', `Host: 127.0.0.1:${context.port + 1}`, bearer(token)]), 421, 'LOCAL_HOST_REQUIRED'],
    ['localhost instead of the address', raw(['GET /v1/me HTTP/1.1', `Host: localhost:${context.port}`, bearer(token)]), 421, 'LOCAL_HOST_REQUIRED'],
    ['no Host at all (HTTP/1.0)', raw(['GET /v1/me HTTP/1.0', bearer(token)]), 421, 'LOCAL_HOST_REQUIRED'],
    ['a foreign Origin', raw(['GET /v1/me HTTP/1.1', `Host: ${own}`, bearer(token), 'Origin: http://evil.example']), 403, 'CROSS_ORIGIN_DENIED'],
    ['the right host with another port as Origin', raw(['GET /v1/me HTTP/1.1', `Host: ${own}`, bearer(token), `Origin: http://127.0.0.1:${context.port + 1}`]), 403, 'CROSS_ORIGIN_DENIED'],
    ['a mutation with a foreign Host', raw([`POST /v1/leases/${ids.a.lease}/scratches HTTP/1.1`, 'Host: evil.example', bearer(token), JSON_TYPE, `Content-Length: ${Buffer.byteLength(body)}`], body), 421, 'LOCAL_HOST_REQUIRED']
  ];
  for (const [name, bytes, status, code] of CASES) {
    const { answers, closedByServer } = await exchange(context.port, bytes, QUICK);
    assert.deepEqual(answers.map((entry) => [entry.status, entry.json?.error?.code]), [[status, code]], name);
    assert.equal(answers[0].headers.connection, 'close', `${name}: the connection is closed`);
    assert.equal(closedByServer, true, `${name}: the server ended the connection`);
  }
  assert.deepEqual(context.app.snapshot(), before, 'no refusal changed anything');
  assert.equal(context.app.auditLog().length, auditBefore + CASES.length, 'one audit record per refusal');
  for (const record of context.app.auditLog().slice(auditBefore)) assert.deepEqual([record.outcome, record.subject], ['refused', null], 'anonymous: the guard decides before the credential is read');
  const served = await exchange(context.port, raw(['GET /v1/me HTTP/1.1', `Host: ${own}`, bearer(token), `Origin: http://${own}`]), QUICK);
  assert.deepEqual(served.answers.map((entry) => entry.status), [200], 'the right Host and the same Origin are served');
  const plain = await exchange(context.port, bare(context.port, 'GET', '/v1/me', [bearer(token)]), QUICK);
  assert.deepEqual(plain.answers.map((entry) => entry.status), [200], 'a request without an Origin is served');
}));
