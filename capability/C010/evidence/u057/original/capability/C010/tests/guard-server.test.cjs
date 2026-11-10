'use strict';

// C010 wiring of the server that the first tests passed through without deciding anything (rev-C010 m7, generated mutants): the limit check, the exact URL
// limit, the fail-closed read stop (it destroys at once, it warns once), a served public route (no audit record, the connection stays usable), an
// unexpected failure at the commit (one INTERNAL_ERROR record, never a second record under the error's own code), the limits wired into the Node server
// (timeouts, keep-alive, the connection cap), a stalled body and the audit of what Node refuses by itself.
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');
const v8 = require('node:v8');
const vm = require('node:vm');
const { CODES } = require('../codes.cjs');
const { bare, bearer, exchange, head, JSON_TYPE } = require('./raw-http.cjs');
const { call, load, seed, startApp, until, withApp } = require('./helpers.cjs');

const contract = load('contract.js');
const QUICK = { settleMs: 300 };
const turn = () => new Promise((resolve) => setImmediate(resolve));

test('a limit is an integer of 1 or more: 0, a negative number, a fraction and a non-number are LIMITS_INVALID, and 1 is accepted', () => {
  const { createApp } = load('server.cjs');
  for (const bad of [0, -1, 0.5, Number.NaN, '5', null]) assert.throws(() => createApp({ limits: { bodyBytes: bad } }), (error) => error.code === 'LIMITS_INVALID', String(bad));
  assert.throws(() => createApp({ limits: { urlChars: 10 } }), (error) => error.code === 'LIMITS_INVALID', 'a limit that is not tunable');
  assert.deepEqual(createApp({ limits: { bodyBytes: 1, connections: 1, pipelined: 1 } }).health(), { ok: true, reason: null });
});

test('the URL limit is exact: a target of the limit length is looked up (404 NOT_FOUND), one character more is 414 URL_TOO_LONG', () => withApp({}, async (context) => {
  const longest = `/${'a'.repeat(contract.limits.urlChars - 1)}`;
  assert.equal(longest.length, contract.limits.urlChars);
  const fits = (await exchange(context.port, bare(context.port, 'GET', longest), QUICK)).answers[0];
  assert.deepEqual([fits.status, fits.json.error.code], [CODES.NOT_FOUND[0], 'NOT_FOUND']);
  const over = (await exchange(context.port, bare(context.port, 'GET', `${longest}a`), QUICK)).answers[0];
  assert.deepEqual([over.status, over.json.error.code], [CODES.URL_TOO_LONG[0], 'URL_TOO_LONG']);
}));

test('fail closed: a connection that cannot stop reading is destroyed before the handler returns, the first one warns, later checks do not warn again', async () => {
  const { createApp } = load('server.cjs');
  const app = createApp();
  const warnings = [];
  const listen = (warning) => { if (warning.code === 'C010_READ_STOP_UNAVAILABLE') warnings.push(warning); };
  process.on('warning', listen);
  try {
    const destroyed = [];
    const stub = () => {
      const socket = new net.Socket();
      socket.destroy = () => { destroyed.push(socket); };
      return socket;
    };
    const first = stub();
    app.server.emit('connection', first);
    assert.deepEqual(destroyed, [first], 'destroyed by the handler itself, not later by a timer');
    await turn();
    assert.equal(warnings.length, 1, 'the first failure warns');
    assert.deepEqual(app.health(), { ok: false, reason: 'READ_STOP_UNAVAILABLE' });
    const second = stub();
    app.server.emit('connection', second);
    assert.deepEqual(destroyed, [first, second], 'every later connection is destroyed at once too');
    const errors = [];
    app.server.on('error', (error) => errors.push(error.message));
    app.server.emit('listening');
    await turn();
    assert.match(errors.join(), /READ_STOP_UNAVAILABLE/);
    assert.equal(warnings.length, 1, 'the warning is given once');
  } finally {
    process.removeListener('warning', listen);
  }
});

test('a served public route writes no audit record and leaves the connection usable for the next request', () => withApp({}, async (context) => {
  const before = context.app.auditLog().length;
  for (const route of ['/', '/page.js', '/style.css', '/scope.json']) {
    const { answers } = await exchange(context.port, Buffer.concat([bare(context.port, 'GET', route), bare(context.port, 'GET', route)]), QUICK);
    assert.deepEqual(answers.map((answer) => answer.status), [200, 200], route);
  }
  assert.equal(context.app.auditLog().length, before, 'a served public route is not an audited decision');
}));

test('the audit names the method of what it records (GET, POST, PATCH, DELETE, anything else is OTHER) and counts its records from 1 upward by one', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const token = tokens['conductor-b'];
  const base = `/v1/leases/${ids.b.lease}/scratches`;
  const before = context.app.auditLog().length;
  await call(context, token, 'GET', '/v1/me');
  const made = await call(context, token, 'POST', base, { name: 'audited' });
  await call(context, token, 'PATCH', `${base}/${made.json.resource.id}`, { name: 'renamed' });
  await call(context, token, 'DELETE', `${base}/${made.json.resource.id}`);
  const put = await call(context, token, 'PUT', `${base}/${made.json.resource.id}`, { name: 'x' });
  assert.equal(put.status, CODES.METHOD_NOT_ALLOWED[0]);
  const log = context.app.auditLog();
  assert.deepEqual(log.slice(before).map((entry) => [entry.method, entry.outcome]), [['GET', 'read'], ['POST', 'applied'], ['PATCH', 'applied'], ['DELETE', 'applied'], ['OTHER', 'refused']]);
  assert.deepEqual(log.map((entry) => entry.seq), log.map((entry, index) => index + 1), 'the sequence starts at 1 and grows by one');
}));

test('startLocal rejects when the listener cannot start, instead of an unhandled error on the server', async () => {
  const { startLocal } = load('server.cjs');
  const original = http.Server.prototype.listen;
  http.Server.prototype.listen = function refused() { process.nextTick(() => this.emit('error', new Error('LISTEN_REFUSED'))); return this; };
  try {
    await assert.rejects(startLocal(), /LISTEN_REFUSED/);
  } finally {
    http.Server.prototype.listen = original;
  }
});

test('an unexpected failure at the commit is one INTERNAL_ERROR audit record and no authentication challenge', () => withApp({ app: { newId: () => 'broken' } }, async (context) => {
  const token = context.app.issueToken('conductor-a');
  const answer = await call(context, token, 'POST', '/v1/leases', { name: 'x', ttlMs: 1000 });
  assert.deepEqual([answer.status, answer.json.error.code], [CODES.INTERNAL_ERROR[0], 'INTERNAL_ERROR']);
  assert.equal(answer.headers['www-authenticate'], undefined, 'it is not an authentication refusal');
  assert.deepEqual(context.app.auditLog().map(({ subject, route, outcome, code }) => [subject, route, outcome, code]), [['conductor-a', 'lease.create', 'refused', 'INTERNAL_ERROR']]);
  assert.deepEqual(context.app.snapshot(), { leases: [] });
}));

test('the limits are wired into the Node server: request and header timeouts, idle timeout, keep-alive, connection cap and checking interval', () => {
  const { createApp } = load('server.cjs');
  const { server } = createApp({ limits: { headerMs: 1234, idleMs: 2345, connections: 7, checkMs: 345 } });
  assert.deepEqual(
    { request: server.requestTimeout, headers: server.headersTimeout, idle: server.timeout, cap: server.maxConnections, check: server.connectionsCheckingInterval, keepAlive: server.keepAliveTimeout },
    { request: 1234, headers: 1234, idle: 2345, cap: 7, check: 345, keepAlive: 1000 }
  );
});

test('the connection cap is applied by the server: the connection past it is dropped (a drop event), not merely left to the idle timeout', async () => {
  const context = await startApp({ app: { limits: { connections: 2 } } });
  const sockets = [];
  try {
    let drops = 0;
    context.app.server.on('drop', () => { drops += 1; });
    const open = () => new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: context.port });
      sockets.push(socket);
      socket.on('error', () => {});
      socket.once('connect', () => resolve(socket));
    });
    await open();
    await open();
    await open();
    await until(() => drops === 1, 'the third connection is dropped by the cap', 1000);
  } finally {
    for (const socket of sockets) socket.destroy();
    await context.close();
  }
});

test('a connection that ended is released: nothing in the server keeps the socket of a closed connection alive', async () => {
  v8.setFlagsFromString('--expose-gc');
  const collect = vm.runInNewContext('gc');
  const context = await startApp();
  try {
    const refs = [];
    const ended = [];
    context.app.server.on('connection', (socket) => {
      refs.push(new WeakRef(socket));
      ended.push(new Promise((resolve) => socket.once('close', resolve)));
    });
    for (let index = 0; index < 3; index += 1) {
      const client = net.connect({ host: '127.0.0.1', port: context.port });
      client.on('error', () => {});
      await new Promise((resolve) => client.once('connect', resolve));
      client.destroy();
    }
    await until(() => refs.length === 3, 'the server saw the three connections');
    await Promise.all(ended);
    await until(() => { collect(); return refs.every((ref) => ref.deref() === undefined); }, 'every closed socket was collected', 100);
  } finally {
    await context.close();
  }
});

test('a body that stalls is ended by the request timeout: 408 REQUEST_TIMEOUT, the connection closed by the server, nothing applied', async () => {
  const context = await startApp({ app: { limits: { headerMs: 300, checkMs: 50 } } });
  try {
    const token = context.app.issueToken('conductor-a');
    const partial = Buffer.from(`${head(context.port, 'POST', '/v1/leases', [bearer(token), JSON_TYPE, 'Content-Length: 40'])}\r\n\r\n{"name"`);
    const { answers, closedByServer } = await exchange(context.port, partial, { waitMs: 15000, settleMs: 300 });
    assert.deepEqual(answers.map((answer) => [answer.status, answer.json.error.code]), [[CODES.REQUEST_TIMEOUT[0], 'REQUEST_TIMEOUT']]);
    assert.equal(closedByServer, true);
    assert.deepEqual(context.app.snapshot(), { leases: [] });
  } finally {
    await context.close();
  }
});

test('what Node refuses by itself is audited like any refusal: a malformed request and a CONNECT leave one anonymous record each', () => withApp({}, async (context) => {
  const before = context.app.auditLog().length;
  const host = `Host: 127.0.0.1:${context.port}`;
  const malformed = (await exchange(context.port, Buffer.from(`BREW / HTTP/1.1\r\n${host}\r\n\r\n`), QUICK)).answers[0];
  assert.deepEqual([malformed.status, malformed.json.error.code], [CODES.REQUEST_MALFORMED[0], 'REQUEST_MALFORMED']);
  const connect = (await exchange(context.port, Buffer.from(`CONNECT 127.0.0.1:1 HTTP/1.1\r\n${host}\r\n\r\n`), QUICK)).answers[0];
  assert.deepEqual([connect.status, connect.json.error.code], [CODES.METHOD_NOT_ALLOWED[0], 'METHOD_NOT_ALLOWED']);
  const records = context.app.auditLog().slice(before).map(({ subject, role, route, method, outcome, code }) => [subject, role, route, method, outcome, code]);
  assert.deepEqual(records, [[null, null, null, 'OTHER', 'refused', 'REQUEST_MALFORMED'], [null, null, null, 'OTHER', 'refused', 'METHOD_NOT_ALLOWED']]);
}));
