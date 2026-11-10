'use strict';

// The wiring of the server itself: the deny-by-default role table, the ONE refusal, the limits and what they cut, the fail-closed read stop, the
// 100-continue and upgrade handling, and closing. Everything here is observed over real loopback sockets or through the app's own accessors.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const { bare, bearer, exchange, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { call, load, same, seed, startApp, target, until, withApp } = require('./helpers.cjs');

const contract = load('contract.js');
const QUICK = { settleMs: 300 };

test('deny by default: a route without roles is 403 for everyone, a route missing from the table is 404 COMMAND_UNKNOWN, and a conductor still reaches the others', () => {
  const roleTable = { ...contract.roleTable, 'lease.read': { roles: [] } };
  delete roleTable['resource.list'];
  return withApp({ app: { roleTable } }, async (context) => {
    const { tokens, ids } = await seed(context);
    for (const identity of ['conductor-a', 'operator', 'visitor']) assert.equal((await call(context, tokens[identity], 'GET', target(ids.a, 'lease'))).json.error.code, 'ROLE_FORBIDDEN', identity);
    for (const identity of ['conductor-a', 'operator']) {
      const answer = await call(context, tokens[identity], 'GET', `/v1/leases/${ids.a.lease}/runs`);
      assert.equal(answer.status, 404);
      assert.equal(answer.json.error.code, 'COMMAND_UNKNOWN');
    }
    assert.equal((await call(context, tokens['conductor-a'], 'GET', target(ids.a, 'run'))).status, 200);
  });
});

test('an id generator that fails is an INTERNAL_ERROR with no effect, and the server keeps serving', () => withApp({ app: { newId: () => 'broken' } }, async (context) => {
  const token = context.app.issueToken('conductor-a');
  const answer = await call(context, token, 'POST', '/v1/leases', { name: 'x', ttlMs: 1000 });
  assert.equal(answer.status, 500);
  assert.equal(answer.json.error.code, 'INTERNAL_ERROR');
  assert.deepEqual(context.app.snapshot(), { leases: [] });
  assert.equal((await call(context, token, 'GET', '/v1/leases')).status, 200);
}));

test('exactly one place writes an error answer: every JSON answer goes through refuse or answer, Node-own answers go through refuseSocket, and no upgrade listener exists', () => withApp({}, async (context) => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  assert.equal(source.match(/out\.json\(/g).length, 3, 'refuse, answer and the fixed scope');
  assert.equal(source.match(/out\.fail\(/g), null, 'the responder shortcut that bypasses the audit is not used');
  assert.equal(source.match(/admit\.refuse\(/g).length, 1, 'Node\'s own refusals have one door');
  assert.equal(source.match(/CODES\[/g).length, 1, 'a code is turned into an answer in one place');
  assert.equal(context.app.server.listenerCount('upgrade'), 0, 'an Upgrade header is an ordinary request here');
  for (const event of ['checkContinue', 'checkExpectation', 'clientError', 'connect']) assert.equal(context.app.server.listenerCount(event), 1, event);
}));

test('an Upgrade request is an ordinary request: no 101, the normal answer, and the connection is not switched', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const upgrade = [bearer(tokens['conductor-a']), 'Connection: Upgrade', 'Upgrade: websocket', 'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=='];
  const { answers } = await exchange(context.port, bare(context.port, 'GET', '/v1/me', upgrade), QUICK);
  assert.deepEqual(answers.map((answer) => answer.status), [200]);
  const refused = await exchange(context.port, bare(context.port, 'GET', '/v1/leases/lease-ffffffffffffffff', upgrade));
  assert.deepEqual(refused.answers.map((answer) => answer.status), [404]);
  assert.equal(refused.closedByServer, true);
}));

test('Expect: 100-continue: a request that is going to be read is invited with 100, one that is refused never is', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const expect = (lease) => withBody(context.port, 'POST', `/v1/leases/${lease}/scratches`, [bearer(tokens['conductor-b']), JSON_TYPE, 'Expect: 100-continue'], '{"name":"invited"}');
  const invited = await exchange(context.port, expect(ids.b.lease), QUICK);
  assert.deepEqual(invited.answers.map((answer) => answer.status), [100, 200]);
  const refused = await exchange(context.port, expect(ids.a.lease));
  assert.deepEqual(refused.answers.map((answer) => answer.status), [404], 'a refused request is never invited to send its body');
  assert.equal(refused.closedByServer, true);
  assert.equal(context.app.snapshot().leases.find((lease) => lease.id === ids.a.lease).scratches.length, 1);
}));

test('the body bound is exact: 4096 bytes are read, 4097 are 413; the media type must be JSON, with or without a charset, in any case', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const post = (body, type = JSON_TYPE) => exchange(context.port, withBody(context.port, 'POST', `/v1/leases/${ids.b.lease}/scratches`, [bearer(tokens['conductor-b']), type], body), QUICK);
  const padded = (size) => `{"name":"edge"}${' '.repeat(size - 15)}`;
  assert.deepEqual((await post(padded(4096))).answers.map((answer) => answer.status), [200]);
  assert.deepEqual((await post(padded(4097))).answers.map((answer) => answer.status), [413]);
  for (const type of ['Content-Type: application/json; charset=utf-8', 'Content-Type: APPLICATION/JSON', 'Content-Type: application/json ;charset=utf-8']) assert.equal((await post('{"name":"t"}', type)).answers[0].status, 200, type);
  for (const type of ['Content-Type: application/jsonx', 'Content-Type: text/json', 'Content-Type: application/json5', 'Content-Type: x/application/json']) assert.equal((await post('{"name":"t"}', type)).answers[0].status, 415, type);
}));

test('the limits are wired: a connection past the cap is cut, a client past the pipelining bound is cut, a silent socket is dropped, close ends every socket', async () => {
  const context = await startApp({ app: { limits: { connections: 2, pipelined: 2, idleMs: 200, checkMs: 50 } } });
  try {
    const open = () => new Promise((resolve) => { const socket = net.connect({ host: '127.0.0.1', port: context.port }); socket.on('error', () => {}); socket.once('connect', () => resolve(socket)); });
    const first = await open();
    const second = await open();
    const third = await open();
    const closed = (socket) => new Promise((resolve) => (socket.destroyed ? resolve(true) : socket.once('close', () => resolve(true))));
    await Promise.race([closed(third), until(() => third.destroyed, 'the third connection is cut')]);
    assert.equal(third.destroyed, true, 'the cap of two connections held');
    await closed(first);
    await closed(second);
    const burst = Buffer.from(bare(context.port, 'GET', '/scope.json').toString().repeat(3));
    const cut = await exchange(context.port, burst);
    assert.ok(cut.answers.length < 3 && cut.closedByServer, 'three requests in flight on a bound of two: the client is cut');
    const kept = await exchange(context.port, Buffer.from(bare(context.port, 'GET', '/scope.json').toString().repeat(2)), QUICK);
    assert.equal(kept.answers.length, 2, 'two in flight are served');
    const silent = await open();
    await closed(silent);
    const hold = await open();
    await context.close();
    await closed(hold);
    assert.equal(hold.destroyed, true);
  } finally {
    await context.close();
  }
});

test('fail closed: where the read stop is missing, a connection is destroyed, nothing is served and the app says why', async () => {
  const context = await startApp();
  try {
    const stub = new net.Socket();
    let destroyed = false;
    stub.destroy = () => { destroyed = true; };
    const warnings = [];
    const listen = (warning) => warnings.push(warning.code);
    process.on('warning', listen);
    context.app.server.emit('connection', stub);
    await until(() => destroyed, 'the connection is destroyed');
    process.removeListener('warning', listen);
    assert.deepEqual(context.app.health(), { ok: false, reason: 'READ_STOP_UNAVAILABLE' });
  } finally {
    await context.close();
  }
  const { createApp } = load('server.cjs');
  const idle = createApp();
  const errors = [];
  idle.server.on('error', (error) => errors.push(error.message));
  idle.server.emit('listening');
  assert.match(errors.join(), /READ_STOP_UNAVAILABLE/);
  assert.equal(idle.health().ok, false);
  assert.equal(createApp().health().ok, true);
});

test('the scope, the page assets and the local server: startLocal serves a token for every identity, and close is final and repeatable', async () => {
  const { startLocal } = load('server.cjs');
  const local = await startLocal({ tokenMs: 60000 });
  try {
    assert.deepEqual(Object.keys(local.tokens).sort(), ['conductor-a', 'conductor-b', 'operator', 'visitor']);
    assert.equal(local.origin, `http://127.0.0.1:${local.port}`);
    assert.equal(local.app.health().ok, true);
    const me = await call(local, local.tokens.operator, 'GET', '/v1/me');
    assert.deepEqual([me.json.subject, me.json.role], ['operator', 'operator']);
    assert.equal((await call(local, null, 'GET', '/')).text.includes('Whose lease is it?'), true);
  } finally {
    await local.close();
  }
  await local.close();
  assert.ok(same(local.app.snapshot()));
});
