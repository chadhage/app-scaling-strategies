'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { withApp, request, send, startApp } = require('./helpers.cjs');

const ASSETS = ['/', '/page.js', '/style.css'];

test('every GET verifies a presented credential, so a forged or expired token never rides along on a public asset', () => withApp({}, async (context) => {
  const expired = context.app.issueToken('visitor', { ttlMs: 0 });
  const valid = context.app.issueToken('visitor');
  for (const route of [...ASSETS, '/scope.json', '/v1/state']) {
    assert.equal((await request(context, { route })).status, 200, route);
    assert.equal((await request(context, { route, headers: { Authorization: `Bearer ${valid}` } })).status, 200, route);
    const bad = [[`Bearer ${expired}`, 'TOKEN_EXPIRED'], [`Bearer c009_${'Z'.repeat(43)}`, 'TOKEN_UNKNOWN'], ['Basic eDp5', 'TOKEN_MALFORMED']];
    for (const [value, code] of bad) {
      const answer = await request(context, { route, headers: { Authorization: value } });
      assert.equal(answer.status, 401, `${route} ${code}`);
      assert.equal(answer.json.error.code, code);
      assert.match(answer.headers['www-authenticate'], /^Bearer realm="c009-local"/);
    }
  }
}));

test('a collaborator that throws something that is not an Error still fails closed with a typed 500 and no effect', () => withApp({ app: { validateInput: () => { throw null; } } }, async (context) => {
  const before = context.app.snapshot();
  const outcome = await send(context, 'pool.resize', context.app.issueToken('operator')).then((answer) => answer, (error) => ({ status: error.code }));
  assert.equal(outcome.status, 500);
  assert.equal(outcome.json.error.code, 'INTERNAL_ERROR');
  assert.deepEqual(context.app.snapshot(), before);
}));

test('a client that stalls half way through a body does not block anyone else and its command never runs', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const stalled = net.connect({ host: '127.0.0.1', port: context.port });
  stalled.on('error', () => {});
  stalled.write(['POST /v1/commands/pool.resize HTTP/1.1', `Host: 127.0.0.1:${context.port}`, `Authorization: Bearer ${operator}`,
    'Content-Type: application/json', 'Content-Length: 12', '', '{"size'].join('\r\n'));
  try {
    const other = await send(context, 'pool.resize', context.app.issueToken('operator'), { size: 6 });
    assert.equal(other.status, 200);
    assert.equal(context.app.snapshot().state.pool.size, 6);
    assert.equal(context.app.queued(), 0);
  } finally {
    stalled.destroy();
  }
  assert.deepEqual(context.app.auditLog().map((entry) => entry.outcome), ['applied']);
  assert.notDeepEqual(context.app.snapshot(), before);
}));

test('a token issued by one server is unknown to another, and tokens never carry identity text', async () => {
  const first = await startApp();
  const second = await startApp();
  try {
    const token = first.app.issueToken('operator');
    assert.equal((await send(first, 'pool.resize', token)).status, 200);
    const foreign = await send(second, 'pool.resize', token);
    assert.equal(foreign.status, 401);
    assert.equal(foreign.json.error.code, 'TOKEN_UNKNOWN');
    assert.equal(second.app.snapshot().revision, 0);
  } finally {
    await first.close();
    await second.close();
  }
});
