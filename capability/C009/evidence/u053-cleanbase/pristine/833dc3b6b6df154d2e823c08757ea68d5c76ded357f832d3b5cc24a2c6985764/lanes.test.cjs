'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { load } = require('./helpers.cjs');

// Unit tests of the reference implementation of the refusal path in http-io.cjs (imported read-only by C010, C014 and C022): the one
// mark per SOCKET, the per-connection lanes that run the requests of one connection one at a time, the fail-closed read stop.
const io = load('http-io.cjs');

const socketOf = (extra = {}) => ({ destroyed: false, stopped: 0, _handle: { readStop() { socketOf.last.stopped += 1; } }, destroy() { this.destroyed = true; }, ...extra });
const makeSocket = (extra) => { const socket = socketOf(extra); socketOf.last = socket; return socket; };
function exchange(socket, { queued = false, complete = true } = {}) {
  const response = Object.assign(new EventEmitter(), {
    req: { socket }, socket: queued ? null : socket, wrote: [], ended: false, destroyed: false,
    writeHead(status, headers) { this.wrote.push([status, headers]); },
    end() { this.ended = true; },
    destroy() { this.destroyed = true; }
  });
  return { request: { socket, complete }, response };
}
const finish = (response) => { response.emit('finish'); response.emit('close'); };

test('a refusal marks the socket of the REQUEST in the same tick, even when the response has no socket yet, announces Connection: close and stops reading', () => {
  const socket = makeSocket();
  const { response } = exchange(socket, { queued: true });
  assert.equal(io.isFinished(socket), false);
  io.createResponder(response).fail('ROLE_FORBIDDEN');
  assert.equal(io.isFinished(socket), true, 'marked although response.socket is null');
  assert.equal(response.wrote[0][0], 403);
  assert.equal(response.wrote[0][1].Connection, 'close');
  assert.equal(response.ended, true);
  assert.equal(socket.stopped, 1, 'reading stopped');
});

test('a success marks nothing and keeps the connection', () => {
  const socket = makeSocket();
  const { response } = exchange(socket);
  io.createResponder(response).json(200, { ok: true });
  assert.equal(io.isFinished(socket), false);
  assert.equal(socket.stopped, 0);
  assert.equal(response.wrote[0][1].Connection, undefined);
});

test('a socket that cannot stop reading is destroyed after the refusal (fail closed), and canStopReading says why', () => {
  const socket = makeSocket({ _handle: {} });
  const { response } = exchange(socket);
  assert.equal(io.canStopReading(socket), false);
  assert.equal(io.canStopReading({}), false);
  assert.equal(io.canStopReading(undefined), false);
  assert.equal(io.canStopReading(makeSocket()), true);
  io.createResponder(response).fail('NOT_FOUND');
  assert.equal(socket.destroyed, true);
  assert.equal(io.isFinished(socket), true);
});

test('endConnection marks and stops without a responder, and ignores a socket that is already gone', () => {
  const socket = makeSocket();
  io.endConnection(socket);
  assert.equal(io.isFinished(socket), true);
  assert.equal(socket.stopped, 1);
  const gone = makeSocket({ destroyed: true });
  io.endConnection(gone);
  assert.equal(gone.stopped, 0);
  io.endConnection(null);
});

test('the requests of one connection run one at a time, in order; another connection is not held up', () => {
  const admit = io.createLanes({ depth: 4 });
  const log = [];
  const one = makeSocket();
  const other = makeSocket();
  const first = exchange(one);
  const second = exchange(one, { queued: true });
  const elsewhere = exchange(other);
  const task = (name) => () => { log.push(name); };
  admit(first.request, first.response, task('1'));
  admit(second.request, second.response, task('2'));
  admit(elsewhere.request, elsewhere.response, task('x'));
  assert.deepEqual(log, ['1', 'x'], 'the second request of the connection waits for the first answer');
  finish(first.response);
  assert.deepEqual(log, ['1', 'x', '2']);
});

test('a refusal drops every request queued behind it; a request that arrives later on that connection is dropped too', () => {
  const admit = io.createLanes({ depth: 4 });
  const socket = makeSocket();
  const ran = [];
  const first = exchange(socket);
  const second = exchange(socket, { queued: true });
  const third = exchange(socket, { queued: true });
  admit(first.request, first.response, (request, response) => { ran.push('refused'); io.createResponder(response).fail('ROLE_FORBIDDEN'); });
  admit(second.request, second.response, () => ran.push('behind 1'));
  admit(third.request, third.response, () => ran.push('behind 2'));
  finish(first.response);
  const late = exchange(socket);
  admit(late.request, late.response, () => ran.push('late'));
  assert.deepEqual(ran, ['refused']);
});

test('requests before a refusal are still answered: the mark only stops what has not started', () => {
  const admit = io.createLanes({ depth: 4 });
  const socket = makeSocket();
  const ran = [];
  const answered = exchange(socket);
  const refused = exchange(socket, { queued: true });
  const behind = exchange(socket, { queued: true });
  admit(answered.request, answered.response, () => ran.push('earlier'));
  admit(refused.request, refused.response, (request, response) => { ran.push('refusal'); io.createResponder(response).fail('NOT_FOUND'); });
  admit(behind.request, behind.response, () => ran.push('behind'));
  finish(answered.response);
  finish(refused.response);
  assert.deepEqual(ran, ['earlier', 'refusal']);
});

test('a connection that queues more than the depth is destroyed and nothing more is admitted', () => {
  const admit = io.createLanes({ depth: 2 });
  const socket = makeSocket();
  const ran = [];
  const exchanges = [exchange(socket), exchange(socket, { queued: true }), exchange(socket, { queued: true })];
  exchanges.forEach(({ request, response }, index) => admit(request, response, () => ran.push(index)));
  assert.equal(socket.destroyed, true);
  assert.deepEqual(ran, [0], 'only the first ran; the second was queued when the third arrived');
  finish(exchanges[0].response);
  assert.deepEqual(ran, [0], 'a destroyed connection starts nothing more');
});

test('a task that throws or rejects destroys its response; finish and close together release the lane once', async () => {
  const admit = io.createLanes({ depth: 4 });
  const socket = makeSocket();
  const ran = [];
  const thrown = exchange(socket);
  const rejected = exchange(socket, { queued: true });
  const after = exchange(socket, { queued: true });
  admit(thrown.request, thrown.response, () => { throw new Error('synthetic'); });
  assert.equal(thrown.response.destroyed, true);
  finish(thrown.response);
  admit(rejected.request, rejected.response, async () => { throw new Error('synthetic'); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rejected.response.destroyed, true);
  admit(after.request, after.response, () => ran.push('after'));
  rejected.response.emit('close');
  rejected.response.emit('finish');
  assert.deepEqual(ran, ['after'], 'the lane moved on exactly once');
});

test('a response that only finishes, or only closes (the socket died), releases the lane; finishing AND closing releases it exactly once', () => {
  const admit = io.createLanes({ depth: 5 });
  for (const events of [['finish'], ['close'], ['finish', 'close']]) {
    const socket = makeSocket();
    const ran = [];
    const first = exchange(socket);
    const second = exchange(socket, { queued: true });
    const third = exchange(socket, { queued: true });
    admit(first.request, first.response, () => ran.push('1'));
    admit(second.request, second.response, () => ran.push('2'));
    admit(third.request, third.response, () => ran.push('3'));
    events.forEach((event) => first.response.emit(event));
    assert.deepEqual(ran, ['1', '2'], `after ${events}: the second request started, the third waits for the second answer`);
  }
});

test('a socket that is already destroyed or marked admits nothing', () => {
  const admit = io.createLanes({ depth: 4 });
  const ran = [];
  const dead = makeSocket({ destroyed: true });
  const marked = makeSocket();
  io.endConnection(marked);
  for (const socket of [dead, marked]) {
    const { request, response } = exchange(socket);
    admit(request, response, () => ran.push('ran'));
  }
  assert.deepEqual(ran, []);
});

const writable = (extra = {}) => makeSocket({ writable: true, ended: null, end(data) { this.ended = Buffer.from(data).toString('latin1'); }, once(event, handler) { if (event === 'finish') this.flushed = handler; }, ...extra });

test('admit.refuse writes the typed answer on the socket, marks it, stops reading, ends it and destroys it once flushed; a second refusal changes nothing', () => {
  const admit = io.createLanes({ depth: 4 });
  const socket = writable();
  admit.refuse(socket, 'REQUEST_MALFORMED');
  assert.match(socket.ended, /^HTTP\/1\.1 400 Bad Request\r\n/);
  assert.match(socket.ended, /Connection: close\r\n/);
  assert.match(socket.ended, /"code":"REQUEST_MALFORMED"/);
  assert.equal(io.isFinished(socket), true);
  assert.equal(socket.stopped, 1);
  assert.equal(socket.destroyed, false, 'the answer is flushed first');
  socket.flushed();
  assert.equal(socket.destroyed, true, 'then nothing keeps the connection');
  socket.ended = null;
  admit.refuse(socket, 'HEADERS_TOO_LARGE');
  assert.equal(socket.ended, null, 'a connection that was refused is not answered twice');
});

test('admit.refuse waits behind the request that is still being answered, but answers at once for the request that was still being received', () => {
  const admit = io.createLanes({ depth: 4 });
  const socket = writable();
  const running = exchange(socket);
  admit(running.request, running.response, () => {});
  admit.refuse(socket, 'REQUEST_MALFORMED');
  assert.equal(socket.ended, null, 'the answer of the earlier, complete request goes first');
  assert.equal(socket.stopped, 1, 'but reading stops at once');
  finish(running.response);
  assert.match(socket.ended, /^HTTP\/1\.1 400 /);
  const stalled = writable();
  const busy = exchange(stalled, { complete: false });
  admit(busy.request, busy.response, () => {});
  admit.refuse(stalled, 'REQUEST_TIMEOUT');
  assert.match(stalled.ended, /^HTTP\/1\.1 408 Request Timeout\r\n/, 'the running request that never completed is the one that failed');
});

test('a queued request that never completed does not run: the refusal takes its place behind the answers before it', () => {
  const admit = io.createLanes({ depth: 4 });
  const socket = writable();
  const ran = [];
  const first = exchange(socket);
  const broken = exchange(socket, { queued: true, complete: false });
  admit(first.request, first.response, () => ran.push('first'));
  admit(broken.request, broken.response, () => ran.push('broken'));
  admit.refuse(socket, 'REQUEST_MALFORMED');
  assert.equal(socket.ended, null);
  finish(first.response);
  assert.deepEqual(ran, ['first'], 'the request that failed to parse never ran');
  assert.match(socket.ended, /^HTTP\/1\.1 400 /);
});

test('admit.refuse ignores a socket that is gone or already marked, and destroys one that cannot be written to', () => {
  const admit = io.createLanes({ depth: 4 });
  const gone = writable({ destroyed: true });
  admit.refuse(gone, 'REQUEST_MALFORMED');
  assert.equal(gone.ended, null);
  const marked = writable();
  io.endConnection(marked);
  admit.refuse(marked, 'REQUEST_MALFORMED');
  assert.equal(marked.ended, null);
  const closing = writable({ writable: false });
  admit.refuse(closing, 'REQUEST_MALFORMED');
  assert.equal(closing.destroyed, true);
  const unstoppable = writable({ _handle: {} });
  admit.refuse(unstoppable, 'REQUEST_MALFORMED');
  assert.equal(unstoppable.destroyed, true, 'fail closed when reading cannot be stopped');
});

test('a refusal queued behind a marked socket is dropped with the rest of the lane', () => {
  const admit = io.createLanes({ depth: 4 });
  const socket = writable();
  const first = exchange(socket);
  admit(first.request, first.response, (request, response) => io.createResponder(response).fail('ROLE_FORBIDDEN'));
  admit.refuse(socket, 'REQUEST_MALFORMED');
  finish(first.response);
  assert.equal(socket.ended, null, 'the connection was already refused by the first request: no second answer');
});

test('the typed codes of Node client errors, and Expect: 100-continue answered only for HTTP/1.1 requests that ask for it', () => {
  assert.equal(io.clientErrorCode({ code: 'HPE_HEADER_OVERFLOW' }), 'HEADERS_TOO_LARGE');
  assert.equal(io.clientErrorCode({ code: 'ERR_HTTP_REQUEST_TIMEOUT' }), 'REQUEST_TIMEOUT');
  assert.equal(io.clientErrorCode({ code: 'HPE_CHUNK_EXTENSIONS_OVERFLOW' }), 'BODY_TOO_LARGE');
  for (const error of [{ code: 'HPE_INVALID_METHOD' }, {}, undefined, null, { code: 'constructor' }, { code: '__proto__' }]) assert.equal(io.clientErrorCode(error), 'REQUEST_MALFORMED');
  const asking = (httpVersion, expect) => {
    const { response } = exchange(makeSocket());
    response.req = { socket: response.req.socket, httpVersion, headers: expect === undefined ? {} : { expect } };
    response.continued = 0;
    response.writeContinue = () => { response.continued += 1; };
    io.createResponder(response).proceed();
    return response.continued;
  };
  assert.deepEqual([asking('1.1', '100-continue'), asking('1.1', '100-Continue, x'), asking('1.1', 'nonsense'), asking('1.1'), asking('1.0', '100-continue')], [1, 1, 0, 0, 0]);
});
