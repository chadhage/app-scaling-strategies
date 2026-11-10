'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { Socket, turns, fixture } = require('./u060-finite-transport.cjs');

test('U060 finite boundary facts include exact URL and streaming limits, without elapsed-time decisions', async (context) => {
  const f = fixture(context);
  assert.equal((await f.request({ url: '/' + 'x'.repeat(2047) })).response.statusCode, 404, '2048 URL characters are admitted to routing');
  assert.equal((await f.request({ url: '/' + 'x'.repeat(2048) })).response.statusCode, 414, '2049 URL characters are refused before routing');
  const socket = new Socket(); socket.remoteAddress = '127.0.0.2';
  assert.equal((await f.request({ socket })).response.statusCode, 421);
  assert.equal((await f.request({ headers: { origin: 'http://127.0.0.1:43210', 'content-length': '0' } })).response.statusCode, 200);
  const exact = Buffer.alloc(2048, 32);
  const accepted = await f.request({ method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' }, body: exact });
  assert.equal(accepted.response.statusCode, 201);
  assert.equal(accepted.response.headers.Connection, undefined, 'a completely consumed successful body is kept alive');
  assert.deepEqual(f.calls.find(([name]) => name === 'run')[1], exact, 'all admitted chunks reach the runner unchanged');
  const declared = await f.request({ method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '2048' }, body: exact });
  assert.equal(declared.response.statusCode, 201, 'the declared body-length limit itself is admitted');
  const beyond = await f.request({ method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' }, body: [exact, Buffer.from(' ')] });
  assert.equal(beyond.response.statusCode, 413);
  assert.equal(beyond.socket.destroyed, true);
  const count = f.calls.length;
  assert.equal((await f.request({ method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '2049' } })).response.statusCode, 413);
  assert.equal(f.calls.length, count, 'declared excessive length never invokes a runner');
});

test('U060 finite route branches inspect, cancel, resume, unsupported actions and every only-method refusal', async (context) => {
  const f = fixture(context);
  for (const [url, method, expected, operation] of [
    ['/v1/presets/missing-valid-key', 'GET', 200, 'inspect'],
    ['/v1/presets/missing-valid-key/cancel', 'POST', 202, 'cancel'],
    ['/v1/presets/missing-valid-key/resume', 'POST', 200, 'resume'],
    ['/v1/presets/missing-valid-key/undo', 'POST', 422, 'unsupported'],
  ]) {
    assert.equal((await f.request({ url, method })).response.statusCode, expected);
    assert.deepEqual(f.calls.at(-1), [operation, 'missing-valid-key']);
  }
  for (const url of ['/', '/scope.json', '/v1/leases', '/v1/journal', '/transcript.json', '/v1/presets', '/v1/presets/missing-valid-key']) {
    const before = f.calls.length;
    const reads = context.mock.method(fs, 'readFileSync');
    const denied = await f.request({ url, method: 'PATCH' });
    assert.equal(denied.response.statusCode, 405, url);
    assert.equal(denied.response.headers.Allow, url === '/v1/presets' ? 'POST' : 'GET', url);
    assert.equal(f.calls.length, before, `a denied ${url} cannot perform service work`);
    assert.equal(reads.mock.callCount(), 0, `a denied ${url} cannot read an asset`);
    reads.mock.restore();
  }
  for (const url of ['/v1/presets/x', '/v1/presets/x/cancel']) {
    const before = f.calls.length;
    assert.equal((await f.request({ url, method: url.endsWith('/cancel') ? 'POST' : 'GET' })).response.statusCode, 400);
    assert.equal(f.calls.length, before);
  }
  assert.equal((await f.request({ url: '/v1/presets/missing-valid-key/cancel', method: 'GET' })).response.statusCode, 405);
  assert.equal((await f.request({ url: '/v1/presets/missing-valid-key/not_valid', method: 'POST' })).response.statusCode, 404);
  assert.equal((await f.request({ url: 'http://[invalid' })).response.statusCode, 400, 'invalid URL parser errors remain typed');
});

test('U060 finite expectation, body-close and unexpected-collaborator paths remain observable', async (context) => {
  const f = fixture(context);
  assert.equal((await f.request({ event: 'checkExpectation' })).response.statusCode, 417);
  const accepted = await f.request({ event: 'checkContinue', method: 'POST', url: '/v1/presets',
    headers: { 'content-type': 'Application/JSON; charset=utf-8', expect: '100-continue', 'content-length': '1' }, body: Buffer.from(' ') });
  assert.equal(accepted.response.statusCode, 201);
  assert.deepEqual(accepted.response.writes[0], ['continue']);
  const refused = await f.request({ event: 'checkContinue', method: 'POST', url: '/v1/presets',
    headers: { 'content-type': 'text/plain', expect: '100-continue' } });
  assert.equal(refused.response.statusCode, 415);
  assert.equal(refused.response.writes.some(([name]) => name === 'continue'), false);
  const closed = f.pending({ method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '1' } });
  await turns(); closed.request.emit('close'); await turns();
  assert.equal(closed.settled, true);
  assert.equal(closed.error, undefined);
  assert.equal(closed.response.writableEnded, false, 'a closed unfinished body cannot be submitted or answered');
  context.mock.method(f.engine, 'snapshot', () => { throw new Error('injected finite snapshot rejection'); });
  assert.equal((await f.request()).response.statusCode, 500);
  context.mock.method(f.engine, 'snapshot', () => { throw new TypeError('injected non-URL type failure'); });
  assert.equal((await f.request()).response.statusCode, 500, 'a non-URL TypeError must not be mislabeled INVALID_URL');
});

test('U060 finite transcript facts distinguish null, a cached concurrent result and a failed result that can retry', async (context) => {
  let release;
  let produced = 0;
  let fail = true;
  const f = fixture(context, { transcript: () => {
    produced += 1;
    if (fail) return Promise.reject(new Error('injected transcript failure'));
    return new Promise((resolve) => { release = resolve; });
  } });
  assert.equal((await f.request({ url: '/transcript.json' })).response.statusCode, 500);
  fail = false;
  const first = f.pending({ url: '/transcript.json' });
  const second = f.pending({ url: '/transcript.json' });
  await turns();
  assert.equal(produced, 2, 'the failed cache resets, then concurrent requests share exactly one production');
  release({ fixture: 'shared' });
  await f.finish(first); await f.finish(second);
  assert.equal(first.response.statusCode, 200);
  assert.deepEqual(first.response.bytes, second.response.bytes);
  const absent = fixture(context, { transcript: null });
  assert.equal((await absent.request({ url: '/transcript.json' })).response.statusCode, 404);
});

test('U060 finite pipeline facts count four admitted requests, ordered release and refusal isolation', async (context) => {
  let release;
  let snapshots = 0;
  const engine = { snapshot: () => { snapshots += 1; return {}; }, halt() {} };
  const runner = { run: () => new Promise((resolve) => { release = () => resolve({ status: 201, body: {} }); }), halt() {} };
  const f = fixture(context, { engine, runner });
  const socket = new Socket();
  const first = f.pending({ socket, method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '1' } });
  await turns(); first.request.emit('data', Buffer.from(' ')); first.request.emit('end'); await turns();
  const behind = Array.from({ length: 3 }, () => f.pending({ socket }));
  await turns();
  assert.equal(snapshots, 0, 'later operations wait behind the held runner');
  assert.equal(socket.destroyed, false, 'exactly four requests are admitted');
  release();
  await f.finish(first);
  for (const pending of behind) await f.finish(pending);
  assert.equal(snapshots, 3);
  assert.equal(socket.destroyed, false);
  for (let index = 0; index < 6; index += 1) assert.equal((await f.request({ socket })).response.statusCode, 200, 'answered requests release pipeline depth');
  const blocked = new Socket();
  const refused = f.pending({ socket: blocked, url: '/absent' });
  const after = f.pending({ socket: blocked });
  await f.finish(refused); await turns();
  assert.equal(after.settled, true);
  assert.equal(after.response.writableEnded, false, 'a refusal closes everything queued behind it');
  assert.equal(snapshots, 9);
  const flooded = new Socket();
  const stalled = f.pending({ socket: flooded, method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '1' } });
  await turns();
  for (let index = 0; index < 4; index += 1) f.pending({ socket: flooded });
  await turns();
  assert.equal(flooded.destroyed, true, 'the fifth uncompleted request exceeds the bound');
  stalled.request.emit('close'); await turns();
});

test('U060 finite send guards do not attempt writes after response destruction or an already ended response', async (context) => {
  for (const field of ['destroyed', 'writableEnded']) {
    let release;
    const f = fixture(context, { runner: { run: () => new Promise((resolve) => { release = () => resolve({ status: 201, body: {} }); }) } });
    const state = f.pending({ method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '1' } });
    await turns(); state.request.emit('data', Buffer.from(' ')); state.request.emit('end'); await turns();
    state.response[field] = true;
    release(); await turns();
    assert.equal(state.settled, true);
    assert.equal(state.error, undefined);
    assert.deepEqual(state.response.writes, [], `no late write when ${field} is already true`);
  }
});

test('U060 finite parser refusals and connection settings expose exact configuration, bytes and socket actions', async (context) => {
  const f = fixture(context);
  assert.deepEqual(f.server.configuration, { maxHeaderSize: 8192, connectionsCheckingInterval: 1000 });
  assert.deepEqual([f.server.requireHostHeader, f.server.requestTimeout, f.server.headersTimeout, f.server.keepAliveTimeout,
    f.server.timeout, f.server.maxConnections, f.server.maxHeadersCount], [false, 5000, 5000, 1000, 90000, 128, 64]);
  assert.equal(f.server.engine, f.engine); assert.equal(f.server.runner, f.runner);
  for (const [code, status, expected] of [['HPE_HEADER_OVERFLOW', 431, 'HEADERS_TOO_LARGE'], ['HPE_INVALID_METHOD', 400, 'MALFORMED_REQUEST'],
    ['ERR_HTTP_REQUEST_TIMEOUT', 408, 'REQUEST_TIMEOUT'], ['C043_CONNECT', 405, 'METHOD_NOT_ALLOWED']]) {
    const socket = new Socket();
    if (code === 'C043_CONNECT') f.server.emit('connect', {}, socket);
    else f.server.emit('clientError', Object.assign(new Error('injected parser refusal'), { code }), socket);
    await turns();
    assert.equal(socket.sent.length, 1, code);
    const text = socket.sent[0].toString('utf8');
    assert.equal(text.startsWith(`HTTP/1.1 ${status} `), true, code);
    assert.equal(JSON.parse(text.split('\r\n\r\n')[1]).error.code, expected);
    assert.match(text, /\r\nConnection: close\r\n/);
    if (status === 405) assert.match(text, /\r\nAllow: GET, POST\r\n/);
    assert.deepEqual(socket.events, ['pause', 'end', 'destroy']);
  }
  for (const mode of ['unwritable', 'closed']) {
    const socket = new Socket();
    if (mode === 'unwritable') socket.writable = false;
    f.server.emit('clientError', Object.assign(new Error('injected closed parser'), { code: mode === 'closed' ? 'HPE_CLOSED_CONNECTION' : 'HPE_INVALID_METHOD' }), socket);
    assert.deepEqual(socket.sent, []);
    assert.equal(socket.destroyed, true);
  }
  const callbacks = [];
  const cleared = [];
  context.mock.method(globalThis, 'setTimeout', (callback, ms) => { const timer = { callback, ms, unref() { this.unrefed = true; } }; callbacks.push(timer); return timer; });
  context.mock.method(globalThis, 'clearTimeout', (timer) => cleared.push(timer));
  const socket = new Socket();
  f.server.emit('connection', socket);
  assert.equal(callbacks.length, 1);
  assert.deepEqual([callbacks[0].ms, callbacks[0].unrefed], [5000, true]);
  await f.request({ socket });
  assert.equal(cleared.includes(callbacks[0]), true, 'starting a request disarms its silent timer');
  socket.destroy();
  assert.equal(cleared.filter((timer) => timer === callbacks[0]).length, 2);
  const open = new Socket();
  f.server.emit('connection', open);
  callbacks.at(-1).callback();
  assert.equal(open.destroyed, true);
  const shutdown = new Socket();
  f.server.emit('connection', shutdown);
  const disposed = [socket, open].map((closed) => closed.events.filter((event) => event === 'destroy').length);
  await f.api.closeServer(f.server);
  assert.equal(shutdown.destroyed, true);
  assert.deepEqual([socket, open].map((closed) => closed.events.filter((event) => event === 'destroy').length), disposed,
    'already disposed connections are removed from the owned set, not retained until shutdown');
  assert.deepEqual(f.calls.slice(-4), [['runner.halt'], ['engine.halt'], ['close'], ['closeAllConnections']]);
});

test('U060 finite parser-error queue waits for earlier answers while an in-flight timeout destroys immediately', async (context) => {
  let release;
  const runner = { run: () => new Promise((resolve) => { release = () => resolve({ status: 201, body: {} }); }) };
  const f = fixture(context, { runner });
  for (const code of ['HPE_INVALID_METHOD', 'ERR_HTTP_REQUEST_TIMEOUT']) {
    const socket = new Socket();
    const first = f.pending({ socket, method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '1' } });
    await turns(); first.request.emit('data', Buffer.from(' ')); first.request.emit('end'); await turns();
    f.server.emit('clientError', Object.assign(new Error('injected in-flight error'), { code }), socket);
    await turns();
    assert.equal(socket.sent.length, 0, 'an unfinished earlier request is not overtaken by a parse-error answer');
    assert.equal(socket.destroyed, code === 'ERR_HTTP_REQUEST_TIMEOUT', 'only a timed-out incomplete request is cut off immediately');
    release(); await turns();
    if (code === 'HPE_INVALID_METHOD') {
      assert.equal(first.response.statusCode, 201);
      assert.equal(socket.sent.length, 1);
      assert.equal(socket.destroyed, true);
    } else assert.deepEqual(first.response.writes, [], 'a late completion cannot answer a destroyed response');
  }
});

test('U060 finite rejected-body facts observe zero retained chunks after the refusal', async (context) => {
  const f = fixture(context);
  const concat = context.mock.method(Buffer, 'concat');
  const state = f.pending({ method: 'POST', url: '/v1/presets',
    headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } });
  await turns();
  state.request.emit('data', Buffer.alloc(1024, 32));
  state.request.emit('data', Buffer.alloc(1025, 32));
  await turns();
  assert.equal(state.response.statusCode, 413);
  state.request.emit('end');
  assert.equal(concat.mock.callCount(), 1, 'the actual collector processed its finite end event');
  assert.equal(concat.mock.calls[0].arguments[0].length, 0, 'a rejected body retains none of its earlier chunks');
});

test('U060 finite completed-request facts remove each socket release listener', async (context) => {
  const f = fixture(context);
  const socket = new Socket();
  const off = context.mock.method(socket, 'off');
  for (let count = 0; count < 4; count += 1) await f.request({ socket });
  assert.equal(off.mock.callCount(), 4, 'each completed response removes its exact socket-close release listener');
  assert.equal(off.mock.calls.every((call) => call.arguments[0] === 'close' && typeof call.arguments[1] === 'function'), true);
  socket.destroy();
});

test('U060 finite socket-close facts release queued work independently of a missing response-close event', async (context) => {
  let release;
  const f = fixture(context, { runner: { run: () => new Promise((resolve) => { release = () => resolve({ status: 201, body: {} }); }) } });
  const socket = new Socket();
  const first = f.pending({ socket, method: 'POST', url: '/v1/presets', headers: { 'content-type': 'application/json', 'content-length': '1' } });
  await turns(); first.request.emit('data', Buffer.from(' ')); first.request.emit('end'); await turns();
  const second = f.pending({ socket });
  const emit = first.response.emit;
  context.mock.method(first.response, 'emit', function withoutResponseClose(event, ...args) {
    return event === 'close' ? false : emit.call(this, event, ...args);
  });
  socket.destroy();
  await turns();
  assert.equal(second.settled, true, 'the socket-close release is independent of the response-close release');
  assert.equal(second.error, undefined);
  assert.deepEqual(second.response.writes, [], 'an aborted connection cannot receive a late response');
  release(); await turns();
  assert.equal(first.settled, true);
});
