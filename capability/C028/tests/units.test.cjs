'use strict';

// Unit tests for the small modules: status mapping and reports, the listener front, manual time and the service handlers.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http2 = require('node:http2');
const { test } = require('node:test');
const report = require('../report.cjs');
const front = require('../front.cjs');
const { ManualTimers } = require('../timers.cjs');
const service = require('../service.cjs');
const { GrpcError, STATUS } = require('../grpc.cjs');

const H2 = http2.constants;

test('HTTP statuses and HTTP/2 reset codes map to gRPC statuses by the protocol table', () => {
  const http = { 400: 13, 401: 16, 403: 7, 404: 12, 429: 14, 502: 14, 503: 14, 504: 14, 500: 2, 200: 2, 302: 2, 418: 2 };
  for (const [status, code] of Object.entries(http)) assert.equal(report.statusForHttp(Number(status)), code, status);
  assert.equal(report.statusForReset(H2.NGHTTP2_CANCEL), 1);
  assert.equal(report.statusForReset(H2.NGHTTP2_REFUSED_STREAM), 14);
  assert.equal(report.statusForReset(H2.NGHTTP2_ENHANCE_YOUR_CALM), 8);
  assert.equal(report.statusForReset(H2.NGHTTP2_INADEQUATE_SECURITY), 7);
  for (const other of [0, 1, 2, 3, 4, 5, 6, 9, 10, 13, 99]) assert.equal(report.statusForReset(other), 13, String(other));
  assert.deepEqual(report.makeStatus(5, 'x', 'o'), { code: 5, name: 'NOT_FOUND', message: 'x', origin: 'o' });
});

test('server status is read only from a clean grpc-status and decoded from grpc-message', () => {
  for (let code = 0; code <= 16; code += 1) assert.equal(report.readServerStatus({ 'grpc-status': String(code) }).status.code, code);
  assert.deepEqual(report.readServerStatus({ 'grpc-status': '3', 'grpc-message': 'a%20b%C3%A9' }).status, { code: 3, name: 'INVALID_ARGUMENT', message: 'a bé', origin: 'server-trailers' });
  assert.equal(report.readServerStatus({ 'grpc-status': '0', 'grpc-message': 7 }).status.message, '');
  assert.equal(report.readServerStatus({}).violation.code, 'STATUS_MISSING');
  for (const bad of ['', '-1', '17', '99', '00', '01', ' 1', '1 ', '1.0', 'x', '１', 5, null, ['1']]) {
    assert.equal(report.readServerStatus({ 'grpc-status': bad }).violation.code, 'STATUS_INVALID', JSON.stringify(bad));
  }
});

test('the outcome and the ok flag follow only the evidence: origin, status code and violations', () => {
  const server = (code) => report.makeStatus(code, '', 'server-trailers');
  assert.equal(report.outcomeOf(server(0), []), 'ok');
  assert.equal(report.outcomeOf(server(1), []), 'cancelled');
  assert.equal(report.outcomeOf(server(4), []), 'deadline-exceeded');
  assert.equal(report.outcomeOf(server(14), []), 'server-error');
  assert.equal(report.outcomeOf(server(0), [{ code: 'X' }]), 'protocol-violation');
  assert.equal(report.outcomeOf(report.makeStatus(14, '', 'transport'), [{ code: 'X' }]), 'transport-failure');
  assert.equal(report.outcomeOf(report.makeStatus(3, '', 'client-validation'), []), 'client-error');
  const base = { path: '/p', kind: 'k', httpStatus: 200, trailersOnly: false, headers: {}, trailers: {}, messages: [{ seq: 1 }], rstCode: 0, events: [] };
  assert.equal(report.buildReport({ ...base, status: server(0), violations: [] }).ok, true);
  assert.equal(report.buildReport({ ...base, status: server(0), violations: [{ code: 'TRUNCATED_MESSAGE' }] }).ok, false);
  assert.equal(report.buildReport({ ...base, status: report.makeStatus(0, '', 'client-cancel'), violations: [] }).ok, false);
  assert.equal(report.buildReport({ ...base, status: server(14), violations: [] }).ok, false);
  const built = report.buildReport({ ...base, status: server(0), violations: [] });
  assert.equal(built.messageCount, 1);
  assert.notEqual(built.messages, base.messages, 'the report copies the arrays it was given');
});

test('the front recognizes the HTTP/2 preface by whatever prefix of it has arrived', () => {
  assert.equal(front.looksLikeHttp2(front.PREFACE), true);
  assert.equal(front.looksLikeHttp2(Buffer.concat([front.PREFACE, Buffer.from('more')])), true);
  assert.equal(front.looksLikeHttp2(front.PREFACE.subarray(0, 3)), true);
  assert.equal(front.looksLikeHttp2(Buffer.from('PRI * HTTP/1.1\r\n')), false);
  assert.equal(front.looksLikeHttp2(Buffer.from('GET / HTTP/1.1')), false);
  assert.equal(front.looksLikeHttp2(Buffer.alloc(0)), false);
});

test('the front refuses with an HTTP/1.1 status line and a Content-Length that matches its body', () => {
  let written = '';
  front.refuse({ end: (text) => { written = text; } });
  const [head, body] = written.split('\r\n\r\n');
  assert.match(head, /^HTTP\/1\.1 505 HTTP Version Not Supported\r\nConnection: close\r\nContent-Type: text\/plain; charset=utf-8\r\nContent-Length: \d+$/);
  assert.equal(Number(/Content-Length: (\d+)/.exec(head)[1]), Buffer.byteLength(body));
});

test('the bridge replays the sniffed bytes, forwards writes, pauses the socket under backpressure and mirrors close', async () => {
  const socket = Object.assign(new EventEmitter(), {
    paused: false, written: [], ended: false, destroyed: false,
    pause() { this.paused = true; }, resume() { this.paused = false; },
    write(chunk, encoding, callback) { this.written.push(Buffer.from(chunk)); callback(); },
    end(callback) { this.ended = true; callback(); }, destroy() { this.destroyed = true; }
  });
  const duplex = front.bridge(socket, Buffer.from('first'));
  const received = [];
  duplex.on('data', (chunk) => received.push(chunk));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(Buffer.concat(received).toString(), 'first');
  socket.emit('data', Buffer.alloc(200000, 1));
  assert.equal(socket.paused, false, 'a flowing reader keeps the socket flowing');
  duplex.pause();
  socket.emit('data', Buffer.alloc(200000, 2));
  assert.equal(socket.paused, true, 'a full readable buffer pauses the socket');
  duplex.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(socket.paused, false, 'reading resumes it');
  await new Promise((resolve) => duplex.write('out', resolve));
  assert.equal(socket.written[0].toString(), 'out');
  const finished = new Promise((resolve) => duplex.once('finish', resolve));
  duplex.end();
  await finished;
  assert.equal(socket.ended, true);
  const closed = new Promise((resolve) => duplex.once('close', resolve));
  socket.emit('end');
  socket.emit('close');
  await closed;
  assert.equal(duplex.destroyed, true);
  const other = Object.assign(new EventEmitter(), { pause() {}, resume() {}, destroyed: false, destroy() { this.destroyed = true; } });
  const second = front.bridge(other, Buffer.alloc(0));
  second.destroy();
  assert.equal(other.destroyed, true, 'destroying the duplex destroys the socket');
});

test('manual time runs due timers earliest first, ties in creation order, and nested timers fall due in the same advance', () => {
  const timers = new ManualTimers();
  const order = [];
  timers.setTimeout(() => order.push('b'), 20);
  timers.setTimeout(() => order.push('a'), 10);
  timers.setTimeout(() => order.push('c'), 20);
  const cleared = timers.setTimeout(() => order.push('never'), 15);
  timers.setTimeout(() => { order.push('d'); timers.setTimeout(() => order.push('d2'), 5); }, 25);
  assert.equal(timers.pending, 5);
  timers.clearTimeout(cleared);
  timers.clearTimeout(cleared);
  timers.clearTimeout(null);
  assert.equal(timers.pending, 4);
  timers.advance(9);
  assert.deepEqual(order, []);
  assert.equal(timers.now, 9);
  timers.advance(100);
  assert.deepEqual(order, ['a', 'b', 'c', 'd', 'd2']);
  assert.equal(timers.now, 109);
  assert.equal(timers.pending, 0);
  timers.advance(5);
  assert.equal(timers.now, 114);
});

test('whenPending resolves at once when enough timers exist and later when they are set', async () => {
  const timers = new ManualTimers();
  await timers.whenPending(0);
  let resolved = false;
  const waiting = timers.whenPending(2).then(() => { resolved = true; });
  timers.setTimeout(() => {}, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  timers.setTimeout(() => {}, 1);
  await waiting;
  assert.equal(resolved, true);
  await timers.whenPending(2);
});

test('the Watch handler stops at once when the call is over and paces ticks with the timers it was given', async () => {
  const timers = new ManualTimers();
  const { methods } = service.createService({ timers });
  const watch = methods['/acme.ticker.v1.Ticker/Watch'];
  const collect = async (request, controller) => {
    const seen = [];
    for await (const message of watch.handler({ request, signal: controller.signal })) seen.push(message);
    return seen;
  };
  const gone = new AbortController();
  gone.abort();
  assert.deepEqual(await collect({ topic: 'a', count: 3, interval_ms: 25, payload_bytes: 0 }, gone), []);
  assert.deepEqual(await collect({ topic: 'a', count: 0, interval_ms: 0, payload_bytes: 0 }, new AbortController()), []);
  const live = new AbortController();
  const pending = collect({ topic: 'a', count: 5, interval_ms: 25, payload_bytes: 0 }, live);
  await timers.whenPending(1);
  timers.advance(25);
  await timers.whenPending(1);
  live.abort();
  assert.deepEqual(await pending, [{ topic: 'a', seq: 1, body: 'tick-1' }]);
  assert.equal(timers.pending, 0);
  const padded = await collect({ topic: 'a', count: 1, interval_ms: 0, payload_bytes: 5 }, new AbortController());
  assert.deepEqual(padded, [{ topic: 'a', seq: 1, body: 'xxxxx' }]);
});

test('the Watch validator and the Chat handler refuse what the service cannot honestly serve', async () => {
  const { methods } = service.createService();
  const validate = methods['/acme.ticker.v1.Ticker/Watch'].validate;
  const good = { topic: 'alpha-1', count: 1, interval_ms: 0, payload_bytes: 0 };
  assert.doesNotThrow(() => validate(good));
  assert.doesNotThrow(() => validate({ ...good, count: 10000, interval_ms: 10000, payload_bytes: 131072 }));
  for (const bad of [{ topic: '' }, { topic: '1a' }, { topic: 'A' }, { topic: 'a b' }, { topic: 'a'.repeat(33) }, { count: 0 }, { count: 10001 }, { interval_ms: 10001 }, { payload_bytes: 131073 }]) {
    assert.throws(() => validate({ ...good, ...bad }), (error) => error instanceof GrpcError && error.grpcCode === STATUS.INVALID_ARGUMENT, JSON.stringify(bad));
  }
  const chat = methods['/acme.ticker.v1.Ticker/Chat'].handler;
  async function* notes(...texts) { for (const text of texts) yield { text }; }
  const echoes = [];
  for await (const echo of chat({ requests: notes('a', 'b') })) echoes.push(echo);
  assert.deepEqual(echoes, [{ text: 'echo: a', seq: 1, received: 1 }, { text: 'echo: b', seq: 2, received: 2 }]);
  await assert.rejects(async () => { for await (const unused of chat({ requests: notes('x'.repeat(1025)) })) assert.fail(String(unused)); }, (error) => error.grpcCode === STATUS.INVALID_ARGUMENT);
  assert.equal(Object.isFrozen(service.SCHEMAS.Tick.fields[0]), true);
  assert.equal(service.METHODS.Watch.path, '/acme.ticker.v1.Ticker/Watch');
  assert.equal(service.PACKAGE, 'acme.ticker.v1');
});
