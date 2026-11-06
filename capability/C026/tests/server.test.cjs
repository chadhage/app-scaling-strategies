'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const framing = require('../framing.cjs');
const { connect } = require('../conversation.cjs');
const { cursorFor } = require('../stream.cjs');
const approved = require('../../C001/approved-contract.js');
const { scope, createLocalServer, closeServer, startLocal, runCli } = require('../server.cjs');
const { listen, rawHttp, request, upgradeRequest, until, upgradeRaw, openSocket } = require('./support.cjs');

const KEY = Buffer.from([1, 2, 3, 4]);
const clientFrame = (opcode, payload, fin = true) => framing.encodeFrame({ opcode, payload, fin, maskKey: KEY });
const ledgerWith = (approval) => () => JSON.stringify({ approvals: { C001: approval } });

async function withServer(options, body) {
  const server = createLocalServer(options);
  const port = await listen(server);
  try {
    return await body(server, port);
  } finally {
    await closeServer(server);
  }
}

async function message(client, type) {
  const item = await client.next();
  assert.equal(item.kind, 'message', JSON.stringify(item));
  assert.equal(item.value.type, type, JSON.stringify(item.value));
  return item.value;
}

async function closeOf(client) {
  const item = await client.next();
  assert.equal(item.kind, 'close', JSON.stringify(item));
  return item;
}

async function skipTo(client, type) {
  for (;;) {
    const item = await client.next();
    if (item.kind === 'message' && item.value.type === type) return item.value;
  }
}

test('a real WebSocket client receives all 12 messages in order, acknowledging each, and the stream completes', () => withServer({}, async (server, port) => {
  const client = await openSocket(`ws://127.0.0.1:${port}/stream`);
  client.say({ type: 'hello' });
  const welcome = await client.next();
  assert.deepEqual(welcome, { type: 'welcome', session: welcome.session, cursor: cursorFor(welcome.session, 0), total: 12, window: 3 });
  const delivered = [];
  const confirmations = [];
  for (;;) {
    const frame = await client.next();
    if (frame.type === 'complete') {
      assert.deepEqual(frame, { type: 'complete', session: welcome.session, through: 12 });
      break;
    }
    if (frame.type === 'acked') {
      confirmations.push(frame);
    } else {
      assert.deepEqual(Object.keys(frame), ['type', 'session', 'seq', 'body', 'redelivered', 'deliveries']);
      assert.equal(frame.session, welcome.session);
      assert.equal(frame.redelivered, false);
      delivered.push(frame.seq);
      client.say({ type: 'ack', seq: frame.seq });
    }
  }
  assert.deepEqual(delivered, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(confirmations.map((item) => item.seq), delivered);
  assert.equal(confirmations.every((item) => item.cursor === cursorFor(welcome.session, item.seq)), true);
  assert.deepEqual(await client.closed(), { code: 1000, reason: 'COMPLETE' });
  assert.equal(server.hub.inspect(welcome.session).complete, true);
}));

test('eight parallel real clients each receive their own messages 1 to 12 once, in order', () => withServer({}, async (server, port) => {
  const runs = await Promise.all(Array.from({ length: 8 }, async () => {
    const client = await openSocket(`ws://127.0.0.1:${port}/stream`);
    client.say({ type: 'hello' });
    const seen = [];
    let session;
    for (;;) {
      const frame = await client.next();
      if (frame.type === 'welcome') session = frame.session;
      else if (frame.type === 'message') {
        seen.push([frame.session, frame.seq, frame.redelivered]);
        client.say({ type: 'ack', seq: frame.seq });
      } else if (frame.type === 'complete') break;
    }
    return { session, seen, closed: await client.closed() };
  }));
  assert.equal(new Set(runs.map((run) => run.session)).size, 8);
  for (const run of runs) {
    assert.deepEqual(run.seen.map(([, seq]) => seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(run.seen.every(([session, , redelivered]) => session === run.session && redelivered === false), true);
    assert.deepEqual(run.closed, { code: 1000, reason: 'COMPLETE' });
  }
  assert.equal(server.hub.sessionCount(), 8);
}));

test('an abrupt TCP close loses nothing: resume redelivers 3 to 5 once, never 1 or 2, and the stream then completes', () => withServer({}, async (server, port) => {
  const first = await connect(port);
  first.say({ type: 'hello' });
  const welcome = await message(first, 'welcome');
  for (let seq = 1; seq <= 3; seq += 1) assert.equal((await message(first, 'message')).seq, seq);
  first.say({ type: 'ack', seq: 1 });
  await message(first, 'acked');
  assert.equal((await message(first, 'message')).seq, 4);
  first.say({ type: 'ack', seq: 2 });
  const acked = await message(first, 'acked');
  assert.equal((await message(first, 'message')).seq, 5);
  first.abort();
  await until(() => server.hub.inspect(welcome.session).attached === false, 'the server notices the destroyed socket');
  assert.equal(server.hub.inspect(welcome.session).ackedThrough, 2);

  const second = await connect(port);
  second.say({ type: 'resume', session: welcome.session, cursor: acked.cursor });
  const resumed = await message(second, 'resumed');
  assert.deepEqual([resumed.ackedThrough, resumed.lastSent, resumed.cursorBehind], [2, 5, false]);
  const redelivered = [await message(second, 'message'), await message(second, 'message'), await message(second, 'message')];
  assert.deepEqual(redelivered.map((item) => [item.seq, item.redelivered, item.deliveries]), [[3, true, 2], [4, true, 2], [5, true, 2]]);
  for (let seq = 3; seq <= 12; seq += 1) second.say({ type: 'ack', seq });
  const later = [];
  for (;;) {
    const item = await second.next();
    if (item.kind === 'close') {
      assert.deepEqual([item.code, item.reason], [1000, 'COMPLETE']);
      break;
    }
    if (item.value.type === 'message') later.push([item.value.seq, item.value.redelivered, item.value.deliveries]);
  }
  assert.deepEqual(later.map(([seq]) => seq), [6, 7, 8, 9, 10, 11, 12]);
  assert.equal(later.every(([, redelivered, deliveries]) => redelivered === false && deliveries === 1), true);
  assert.deepEqual(server.hub.inspect(welcome.session).deliveries, [1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1]);
}));

test('a second connection takes the session over; the first is told and closed', () => withServer({}, async (server, port) => {
  const first = await connect(port);
  first.say({ type: 'hello' });
  const welcome = await message(first, 'welcome');
  await message(first, 'message');
  first.say({ type: 'ack', seq: 1 });
  const acked = await skipTo(first, 'acked');
  const second = await connect(port);
  second.say({ type: 'resume', session: welcome.session, cursor: acked.cursor });
  await message(second, 'resumed');
  for (;;) {
    const item = await first.next();
    if (item.kind === 'message' && item.value.type === 'error') {
      assert.equal(item.value.code, 'SESSION_TAKEN_OVER');
      break;
    }
  }
  assert.deepEqual((({ code, reason }) => ({ code, reason }))(await closeOf(first)), { code: 1008, reason: 'SESSION_TAKEN_OVER' });
  assert.equal(server.hub.inspect(welcome.session).attached, true);
}));

test('forged sequences and unusable cursors over real sockets are typed failures that change no state', () => withServer({}, async (server, port) => {
  const owner = await connect(port);
  owner.say({ type: 'hello' });
  const welcome = await message(owner, 'welcome');
  const other = await connect(port);
  other.say({ type: 'hello' });
  const otherWelcome = await message(other, 'welcome');
  owner.abort();
  other.abort();
  await until(() => !server.hub.inspect(welcome.session).attached && !server.hub.inspect(otherWelcome.session).attached, 'both detached');
  const known = server.hub.inspect(welcome.session);
  const cases = [
    ['a message that was never sent is acknowledged', [{ type: 'hello' }, { type: 'ack', seq: 6 }], 'ACK_UNSENT'],
    ['a client names its own message sequence', [{ type: 'hello' }, { type: 'message', seq: 7, body: 'forged' }], 'CLIENT_SEQUENCE_FORBIDDEN'],
    ['an acknowledgement skips ahead', [{ type: 'hello' }, { type: 'ack', seq: 3 }], 'ACK_OUT_OF_ORDER'],
    ['a cursor from the future', [{ type: 'resume', session: welcome.session, cursor: cursorFor(welcome.session, 99) }], 'CURSOR_FROM_FUTURE'],
    ['a cursor from another session', [{ type: 'resume', session: welcome.session, cursor: cursorFor(otherWelcome.session, 0) }], 'CURSOR_FOREIGN_SESSION'],
    ['a session that never existed', [{ type: 'resume', session: 'nope', cursor: cursorFor('nope', 0) }], 'SESSION_UNKNOWN'],
    ['text that is not JSON', ['{broken'], 'MALFORMED_JSON']
  ];
  for (const [name, steps, code] of cases) {
    const client = await connect(port);
    for (const step of steps) {
      if (typeof step === 'string') client.writeRaw(clientFrame(framing.OPCODES.text, step)); else client.say(step);
    }
    let failure;
    for (;;) {
      const item = await client.next();
      if (item.kind === 'message' && item.value.type === 'error') { failure = item.value; break; }
    }
    assert.equal(failure.code, code, name);
    const closed = await closeOf(client);
    assert.deepEqual([closed.code, closed.reason], [1008, code], name);
  }
  assert.deepEqual(server.hub.inspect(welcome.session), known);
  assert.equal(server.hub.sessionCount(), 2 + 3);
}));

test('framing violations close with the RFC 6455 code and never reach the stream', () => withServer({}, async (server, port) => {
  const violations = [
    ['an unmasked frame', framing.encodeFrame({ opcode: 1, payload: '{"type":"hello"}' }), 1002, 'UNMASKED_CLIENT_FRAME'],
    ['a reserved bit', Buffer.from([0xc1, 0x80, 1, 2, 3, 4]), 1002, 'RESERVED_BITS_SET'],
    ['a fragmented control frame', Buffer.from([0x09, 0x80, 1, 2, 3, 4]), 1002, 'INVALID_CONTROL_FRAME'],
    ['a continuation without a start', clientFrame(framing.OPCODES.continuation, 'x'), 1002, 'UNEXPECTED_CONTINUATION'],
    ['an invalid close payload', clientFrame(framing.OPCODES.close, Buffer.from([3])), 1002, 'INVALID_CLOSE_PAYLOAD'],
    ['invalid UTF-8 text', clientFrame(framing.OPCODES.text, Buffer.from([0xc3, 0x28])), 1007, 'INVALID_UTF8'],
    ['a binary frame', clientFrame(framing.OPCODES.binary, Buffer.from([1])), 1003, 'BINARY_UNSUPPORTED'],
    ['an oversized frame', Buffer.from([0x81, 0xfe, 0x20, 0x00, 1, 2, 3, 4]), 1009, 'MESSAGE_TOO_BIG']
  ];
  for (const [name, bytes, code, reason] of violations) {
    const client = await connect(port);
    client.writeRaw(bytes);
    const closed = await closeOf(client);
    assert.deepEqual([closed.code, closed.reason], [code, reason], name);
  }
  assert.equal(server.hub.sessionCount(), 0);
}));

test('a handshake that arrives with its first frame still works; pings are answered; a close is echoed', () => withServer({}, async (server, port) => {
  const early = await upgradeRaw(port, { trailer: clientFrame(framing.OPCODES.text, '{"type":"hello"}') });
  assert.match(early.status, /^HTTP\/1\.1 101 /);
  assert.equal(early.headers.some((line) => line.toLowerCase() === `sec-websocket-accept: ${framing.acceptKey(early.key).toLowerCase()}`), true);
  assert.equal((await early.next()).text.includes('"type":"welcome"'), true);
  early.send(clientFrame(framing.OPCODES.ping, 'are you there'));
  for (let index = 0; index < 4; index += 1) {
    const frame = await early.next();
    if (frame.type === 'pong') {
      assert.equal(frame.data.toString(), 'are you there');
      break;
    }
    assert.equal(frame.type, 'text');
  }
  early.send(clientFrame(framing.OPCODES.pong, 'unsolicited'));
  early.send(clientFrame(framing.OPCODES.close, Buffer.from([0x03, 0xe9, 0x62, 0x79, 0x65])));
  for (;;) {
    const frame = await early.next();
    if (frame.type === 'close') {
      assert.equal(frame.code, 1001);
      break;
    }
  }
  await early.ended();

  const bare = await upgradeRaw(port);
  bare.send(clientFrame(framing.OPCODES.close, Buffer.alloc(0)));
  assert.deepEqual(await bare.next(), { type: 'close', code: 1000, reason: '' });
  await bare.ended();
}));

test('a peer that half-closes without a close frame releases its session and its socket', () => withServer({}, async (server, port) => {
  const peer = await upgradeRaw(port, { trailer: clientFrame(framing.OPCODES.text, '{"type":"hello"}') });
  const welcome = JSON.parse((await peer.next()).text);
  assert.equal(server.hub.inspect(welcome.session).attached, true);
  peer.socket.end();
  await until(() => server.hub.inspect(welcome.session).attached === false, 'the session is released after the FIN');
  await peer.ended();
}));

test('a peer that resets the connection (RST) releases its session and cannot crash the server', () => withServer({}, async (server, port) => {
  const peer = await upgradeRaw(port, { trailer: clientFrame(framing.OPCODES.text, '{"type":"hello"}') });
  const welcome = JSON.parse((await peer.next()).text);
  peer.socket.on('error', () => {});
  peer.socket.resetAndDestroy();
  await until(() => server.hub.inspect(welcome.session).attached === false, 'the session is released after the RST');
  const again = await connect(port);
  again.say({ type: 'resume', session: welcome.session, cursor: cursorFor(welcome.session, 0) });
  assert.equal((await message(again, 'resumed')).lastSent, 3);
  again.abort();
}));

test('only a well formed local upgrade to /stream is accepted', () => withServer({}, async (server, port) => {
  const refusals = [
    ['wrong version', upgradeRequest(port, { headers: { 'Sec-WebSocket-Version': '12' } }), 426, 'UNSUPPORTED_VERSION'],
    ['missing key', upgradeRequest(port, { headers: { 'Sec-WebSocket-Key': undefined } }), 400, 'INVALID_KEY'],
    ['malformed key', upgradeRequest(port, { headers: { 'Sec-WebSocket-Key': 'AAAA' } }), 400, 'INVALID_KEY'],
    ['another Host', upgradeRequest(port, { headers: { Host: `localhost:${port}` } }), 421, 'LOCAL_HOST_REQUIRED'],
    ['another Origin', upgradeRequest(port, { headers: { Origin: 'http://example.invalid' } }), 403, 'CROSS_ORIGIN_DENIED'],
    ['another path', upgradeRequest(port, { target: '/other' }), 404, 'NOT_FOUND'],
    ['a query string', upgradeRequest(port, { target: '/stream?x=1' }), 400, 'INVALID_QUERY'],
    ['a malformed URL', upgradeRequest(port, { target: '//' }), 400, 'INVALID_URL'],
    ['a POST', upgradeRequest(port, { method: 'POST' }), 405, 'METHOD_NOT_ALLOWED'],
    ['another protocol', upgradeRequest(port, { headers: { Upgrade: 'h2c' } }), 400, 'UPGRADE_HEADERS_REQUIRED']
  ];
  for (const [name, text, status, code] of refusals) {
    const response = await rawHttp(port, text);
    assert.equal(response.status, status, name);
    assert.equal(JSON.parse(response.body).error.code, code, name);
    assert.equal(response.headers['content-security-policy'].includes("script-src 'self'"), true, name);
  }
  const version = await rawHttp(port, upgradeRequest(port, { headers: { 'Sec-WebSocket-Version': '8' } }));
  assert.equal(version.headers['sec-websocket-version'], '13');
  const sameOrigin = await upgradeRaw(port);
  assert.match(sameOrigin.status, / 101 /);
  sameOrigin.socket.destroy();
  assert.equal(server.hub.sessionCount(), 0);
}));

test('plain HTTP serves the page assets with a strict policy and refuses everything else explicitly', () => withServer({}, async (server, port) => {
  for (const [target, type] of [['/', 'text/html; charset=utf-8'], ['/page.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'text/css; charset=utf-8']]) {
    const response = await rawHttp(port, request(port, { target }));
    assert.equal(response.status, 200, target);
    assert.equal(response.headers['content-type'], type);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(response.headers['content-security-policy'], /^default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:;/);
    assert.equal(response.headers['content-security-policy'].includes('unsafe'), false);
  }
  const scoped = await rawHttp(port, request(port, { target: '/scope.json' }));
  assert.deepEqual(JSON.parse(scoped.body), JSON.parse(JSON.stringify(scope)));
  assert.equal(scope.productionRuntimeValidated, false);
  assert.equal(scope.authorizedCloudSpend, 0);
  assert.equal(scope.browserWebSocketObserved, false);
  const refusals = [
    ['/nowhere', {}, 404, 'NOT_FOUND'],
    ['/stream', {}, 426, 'UPGRADE_REQUIRED'],
    ['/', { method: 'POST' }, 405, 'METHOD_NOT_ALLOWED'],
    ['/', { headers: { Host: 'example.invalid' } }, 421, 'LOCAL_HOST_REQUIRED'],
    ['/', { headers: { Origin: 'http://example.invalid' } }, 403, 'CROSS_ORIGIN_DENIED'],
    ['/page.js?x=1', {}, 400, 'INVALID_QUERY'],
    ['/scope.json?x=1', {}, 400, 'INVALID_QUERY'],
    ['/transcript.json?x=1', {}, 400, 'INVALID_QUERY'],
    ['/', { headers: { 'Content-Length': '5' } }, 400, 'UNEXPECTED_BODY'],
    ['//', {}, 400, 'INVALID_URL']
  ];
  for (const [target, options, status, code] of refusals) {
    const response = await rawHttp(port, request(port, { target, ...options }));
    assert.equal(response.status, status, `${target} ${JSON.stringify(options)}`);
    assert.equal(JSON.parse(response.body).error.code, code, target);
  }
  assert.equal(server.hub.sessionCount(), 0);
}));

test('the transcript route runs a real server-side conversation and returns it', () => withServer({}, async (server, port) => {
  const response = await rawHttp(port, request(port, { target: '/transcript.json' }));
  assert.equal(response.status, 200);
  const transcript = JSON.parse(response.body);
  assert.equal(transcript.kind, 'server-side-websocket-transcript');
  assert.deepEqual(transcript.sessionAliases, ['S-A', 'S-B', 'S-C', 'S-D']);
  assert.equal(transcript.events.length > 60, true);
  assert.equal(transcript.events.some((event) => event.dir === 'abort'), true);
  assert.equal(server.hub.sessionCount(), 0, 'the conversation used a private fixture, not this server');
}));

test('a failing conversation and a server without transcripts are explicit, never a fabricated success', async () => {
  await withServer({ transcript: () => Promise.reject(new Error('boom')) }, async (server, port) => {
    const response = await rawHttp(port, request(port, { target: '/transcript.json' }));
    assert.equal(response.status, 500);
    assert.equal(JSON.parse(response.body).error.code, 'TRANSCRIPT_UNAVAILABLE');
  });
  await withServer({ transcript: null }, async (server, port) => {
    const response = await rawHttp(port, request(port, { target: '/transcript.json' }));
    assert.equal(response.status, 404);
  });
});

test('an unreadable asset is an explicit 500, not an empty success', async (t) => {
  await withServer({}, async (server, port) => {
    t.mock.method(fs, 'readFileSync', () => { throw new Error('disk gone'); });
    const response = await rawHttp(port, request(port, { target: '/' }));
    assert.equal(response.status, 500);
    assert.equal(JSON.parse(response.body).error.code, 'FIXTURE_UNAVAILABLE');
  });
});

test('an unexpected failure inside the stream model closes the socket with 1011', () => withServer({
  hub: { connect: () => ({ receive() { throw new Error('boom'); }, disconnected() {} }) }
}, async (server, port) => {
  const client = await connect(port);
  client.say({ type: 'hello' });
  const closed = await closeOf(client);
  assert.deepEqual([closed.code, closed.reason], [1011, 'INTERNAL_ERROR']);
}));

test('closing a server that never listened, or that holds WebSocket sockets, always finishes', async () => {
  await closeServer(createLocalServer());
  await withServer({}, async (server, port) => {
    const client = await connect(port);
    client.say({ type: 'hello' });
    await message(client, 'welcome');
  });
});

test('startLocal rechecks C001 consent and binds 127.0.0.1 on an automatic port', async () => {
  const server = await startLocal({ readLedger: ledgerWith(approved.approval) });
  try {
    const address = server.address();
    assert.equal(address.address, '127.0.0.1');
    assert.equal(address.family, 'IPv4');
    assert.equal(address.port > 0, true);
  } finally {
    await closeServer(server);
  }
  await assert.rejects(startLocal({ readLedger: ledgerWith({ ...approved.approval, expenditureApproved: true }) }), /C001 local consent denied: .*APPROVAL_DRIFT/);
  await assert.rejects(startLocal({ readLedger: () => JSON.stringify({ approvals: {} }) }), /C001 local consent denied: .*APPROVAL_MISSING/);
  await assert.rejects(startLocal({ readLedger: () => { throw new Error('no ledger'); } }), /current consent is unavailable/);
  await assert.rejects(startLocal({ readLedger: () => '{not json' }), /current consent is unavailable/);
});

test('the command line accepts no overrides, prints the exact origin, and closes its server on a signal', async () => {
  const errors = [];
  assert.equal(await runCli(['--port=80'], { error: (text) => errors.push(text) }), 1);
  assert.match(errors[0], /no host, port, stream size, identity, or deployment overrides/);

  const logs = [];
  let handler;
  const code = await runCli([], {
    start: () => startLocal({ readLedger: ledgerWith(approved.approval) }),
    log: (line) => logs.push(JSON.parse(line)), error: (text) => errors.push(text), onSignal: (value) => { handler = value; }
  });
  assert.equal(code, 0);
  assert.equal(logs[0].event, 'C026-local-listening');
  assert.match(logs[0].origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(logs[0].scope.authorizedCloudSpend, 0);
  const response = await rawHttp(Number(new URL(logs[0].origin).port), request(Number(new URL(logs[0].origin).port), { target: '/scope.json' }));
  assert.equal(response.status, 200);
  await handler();
  await assert.rejects(rawHttp(Number(new URL(logs[0].origin).port), request(1, {})), /ECONNREFUSED/);

  assert.equal(await runCli([], { start: () => Promise.reject(new Error('C001 current consent is unavailable')), error: (text) => errors.push(text) }), 1);
  assert.match(errors.at(-1), /consent is unavailable/);
});

test('the default signal hook registers one SIGINT and one SIGTERM handler that close the server', async () => {
  const before = { SIGINT: process.listeners('SIGINT'), SIGTERM: process.listeners('SIGTERM') };
  const server = await startLocal({ readLedger: ledgerWith(approved.approval) });
  try {
    assert.equal(await runCli([], { start: async () => server, log() {} }), 0);
    const added = { SIGINT: process.listeners('SIGINT').filter((fn) => !before.SIGINT.includes(fn)), SIGTERM: process.listeners('SIGTERM').filter((fn) => !before.SIGTERM.includes(fn)) };
    assert.deepEqual([added.SIGINT.length, added.SIGTERM.length], [1, 1]);
    for (const [name, handlers] of Object.entries(added)) for (const handler of handlers) process.removeListener(name, handler);
    await added.SIGINT[0]();
    assert.equal(server.listening, false);
  } finally {
    await closeServer(server);
  }
});
