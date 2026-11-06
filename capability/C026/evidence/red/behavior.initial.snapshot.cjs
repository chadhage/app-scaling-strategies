'use strict';

// Retained initial C026 behavioral tests, written before any implementation. The `.snapshot.cjs` name keeps ordinary
// `node --test` discovery from running them. By default they target the real modules one directory up; the RED replay
// points C026_RED_SUBJECT at evidence\red\stubs, whose loadable modules have the API but no behavior.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const subject = process.env.C026_RED_SUBJECT ? path.resolve(process.env.C026_RED_SUBJECT) : path.resolve(__dirname, '..', '..');
const framing = require(path.join(subject, 'framing.cjs'));
const stream = require(path.join(subject, 'stream.cjs'));
const server = require(path.join(subject, 'server.cjs'));

const hex = (text) => Buffer.from(text.replaceAll(' ', ''), 'hex');

function attach(hub) {
  const sent = [];
  const state = { closed: null };
  const connection = hub.connect({
    send: (message) => sent.push(message),
    close: (code, reason) => { state.closed = { code, reason }; }
  });
  return { sent, state, connection, say: (message) => connection.receive(JSON.stringify(message)) };
}

function summary(messages) {
  return messages.filter((item) => item.type === 'message').map((item) => [item.seq, item.redelivered, item.deliveries]);
}

test('framing: Sec-WebSocket-Accept follows RFC 6455 section 1.3', () => {
  assert.equal(framing.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('framing: a server text frame is unmasked (RFC 6455 section 5.7 example)', () => {
  assert.deepEqual(framing.encodeFrame({ opcode: 1, payload: 'Hello' }), hex('81 05 48 65 6c 6c 6f'));
});

test('framing: a masked client text frame parses to its text', () => {
  const parser = framing.createParser({ requireMask: true });
  assert.deepEqual(parser.push(hex('81 85 37 fa 21 3d 7f 9f 4d 51 58')), [{ type: 'text', text: 'Hello' }]);
});

test('framing: an unmasked client frame is a protocol error with close code 1002', () => {
  const parser = framing.createParser({ requireMask: true });
  assert.throws(() => parser.push(hex('81 05 48 65 6c 6c 6f')),
    (error) => error.code === 'UNMASKED_CLIENT_FRAME' && error.closeCode === 1002);
});

test('stream: hello is answered with welcome and server-numbered messages 1 to 3, nothing beyond the window', () => {
  const hub = stream.createHub({ total: 12, window: 3, newSessionId: () => 'session-a' });
  const client = attach(hub);
  client.say({ type: 'hello' });
  assert.deepEqual(client.sent[0], {
    type: 'welcome', session: 'session-a', cursor: stream.cursorFor('session-a', 0), total: 12, window: 3
  });
  assert.deepEqual(summary(client.sent), [[1, false, 1], [2, false, 1], [3, false, 1]]);
  assert.equal(client.sent.length, 4);
});

test('stream: an in-order acknowledgement is confirmed with a cursor and releases the next message', () => {
  const hub = stream.createHub({ total: 12, window: 3, newSessionId: () => 'session-a' });
  const client = attach(hub);
  client.say({ type: 'hello' });
  client.say({ type: 'ack', seq: 1 });
  assert.deepEqual(client.sent[4], { type: 'acked', seq: 1, cursor: stream.cursorFor('session-a', 1) });
  assert.deepEqual(summary(client.sent.slice(5)), [[4, false, 1]]);
  assert.equal(hub.inspect('session-a').ackedThrough, 1);
});

test('stream: a message that was never sent is never acknowledged', () => {
  const hub = stream.createHub({ total: 12, window: 3, newSessionId: () => 'session-a' });
  const client = attach(hub);
  client.say({ type: 'hello' });
  client.say({ type: 'ack', seq: 6 });
  assert.equal(client.sent.at(-1).type, 'error');
  assert.equal(client.sent.at(-1).code, 'ACK_UNSENT');
  assert.deepEqual(client.state.closed, { code: 1008, reason: 'ACK_UNSENT' });
  assert.equal(hub.inspect('session-a').ackedThrough, 0);
});

test('stream: a client cannot forge, skip or repeat a sequence', () => {
  const attempts = [
    ['forged message', [{ type: 'message', seq: 9, body: 'forged' }], 'CLIENT_SEQUENCE_FORBIDDEN', 0],
    ['skipped acknowledgement', [{ type: 'ack', seq: 3 }], 'ACK_OUT_OF_ORDER', 0],
    ['repeated acknowledgement', [{ type: 'ack', seq: 1 }, { type: 'ack', seq: 1 }], 'ACK_DUPLICATE', 1],
    ['fractional acknowledgement', [{ type: 'ack', seq: 1.5 }], 'ACK_MALFORMED', 0]
  ];
  for (const [name, steps, code, acked] of attempts) {
    const hub = stream.createHub({ total: 12, window: 3, newSessionId: () => 'session-a' });
    const client = attach(hub);
    client.say({ type: 'hello' });
    for (const step of steps) client.say(step);
    assert.equal(client.sent.at(-1).code, code, name);
    assert.equal(client.state.closed.code, 1008, name);
    assert.equal(hub.inspect('session-a').ackedThrough, acked, name);
  }
});

test('stream: after an abrupt close, resume redelivers unacknowledged messages once and never the acknowledged ones', () => {
  const hub = stream.createHub({ total: 12, window: 3, newSessionId: () => 'session-a' });
  const first = attach(hub);
  first.say({ type: 'hello' });
  first.say({ type: 'ack', seq: 1 });
  first.say({ type: 'ack', seq: 2 });
  first.connection.disconnected();
  assert.equal(hub.inspect('session-a').attached, false);
  const second = attach(hub);
  second.say({ type: 'resume', session: 'session-a', cursor: stream.cursorFor('session-a', 2) });
  assert.equal(second.sent[0].type, 'resumed');
  assert.equal(second.sent[0].ackedThrough, 2);
  assert.equal(second.sent[0].lastSent, 5);
  assert.deepEqual(summary(second.sent), [[3, true, 2], [4, true, 2], [5, true, 2]]);
  assert.equal(second.sent.length, 4);
  second.say({ type: 'ack', seq: 3 });
  assert.deepEqual(summary(second.sent.slice(4)), [[6, false, 1]]);
});

test('stream: unusable cursors are explicit typed failures and change nothing', () => {
  const build = () => {
    const hub = stream.createHub({ total: 12, window: 3, newSessionId: (() => { let n = 0; return () => `session-${'ab'[n++]}`; })() });
    const owner = attach(hub);
    owner.say({ type: 'hello' });
    owner.say({ type: 'ack', seq: 1 });
    owner.connection.disconnected();
    const other = attach(hub);
    other.say({ type: 'hello' });
    other.connection.disconnected();
    return hub;
  };
  const cases = [
    ['unknown session', { type: 'resume', session: 'session-z', cursor: stream.cursorFor('session-z', 0) }, 'SESSION_UNKNOWN'],
    ['malformed cursor', { type: 'resume', session: 'session-a', cursor: 'not a cursor' }, 'CURSOR_MALFORMED'],
    ['another session', { type: 'resume', session: 'session-a', cursor: stream.cursorFor('session-b', 0) }, 'CURSOR_FOREIGN_SESSION'],
    ['future', { type: 'resume', session: 'session-a', cursor: stream.cursorFor('session-a', 99) }, 'CURSOR_FROM_FUTURE'],
    ['ahead of acknowledgement', { type: 'resume', session: 'session-a', cursor: stream.cursorFor('session-a', 3) }, 'CURSOR_AHEAD_OF_ACK']
  ];
  for (const [name, message, code] of cases) {
    const hub = build();
    const before = hub.inspect('session-a');
    const client = attach(hub);
    client.say(message);
    assert.equal(client.sent.at(-1).code, code, name);
    assert.deepEqual(client.state.closed, { code: 1008, reason: code }, name);
    assert.deepEqual(hub.inspect('session-a'), before, name);
  }
});

test('stream: a fully acknowledged stream completes, and resuming it completes again without messages', () => {
  const hub = stream.createHub({ total: 4, window: 2, newSessionId: () => 'session-a' });
  const client = attach(hub);
  client.say({ type: 'hello' });
  for (const seq of [1, 2, 3, 4]) client.say({ type: 'ack', seq });
  assert.deepEqual(client.sent.at(-1), { type: 'complete', session: 'session-a', through: 4 });
  assert.deepEqual(client.state.closed, { code: 1000, reason: 'COMPLETE' });
  const again = attach(hub);
  again.say({ type: 'resume', session: 'session-a', cursor: stream.cursorFor('session-a', 4) });
  assert.deepEqual(again.sent.map((item) => item.type), ['resumed', 'complete']);
});

test('stream: parallel sessions never see each other\'s messages', () => {
  const hub = stream.createHub({ total: 6, window: 3 });
  const clients = Array.from({ length: 8 }, () => attach(hub));
  for (const client of clients) client.say({ type: 'hello' });
  for (let seq = 1; seq <= 6; seq += 1) for (const client of clients) client.say({ type: 'ack', seq });
  const sessions = new Set(clients.map((client) => client.sent[0].session));
  assert.equal(sessions.size, 8);
  for (const client of clients) {
    const delivered = client.sent.filter((item) => item.type === 'message');
    assert.deepEqual(delivered.map((item) => item.seq), [1, 2, 3, 4, 5, 6]);
    assert.ok(delivered.every((item) => item.session === client.sent[0].session && item.redelivered === false));
  }
});

async function listen(instance) {
  await new Promise((resolve, reject) => { instance.once('error', reject); instance.listen(0, '127.0.0.1', resolve); });
  return `ws://127.0.0.1:${instance.address().port}/stream`;
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const queue = [];
    const waiters = [];
    const state = { closed: null };
    socket.addEventListener('message', (event) => {
      const value = JSON.parse(event.data);
      if (waiters.length) waiters.shift().resolve(value); else queue.push(value);
    });
    socket.addEventListener('close', (event) => {
      state.closed = event.code;
      for (const waiter of waiters.splice(0)) waiter.reject(new assert.AssertionError({ message: `socket closed ${event.code} while waiting for a frame` }));
      reject(new assert.AssertionError({ message: `the WebSocket upgrade to ${url} was refused (close ${event.code})` }));
    });
    // undici reports a refused handshake as an error event without a close event
    socket.addEventListener('error', (event) => {
      reject(new assert.AssertionError({ message: `the WebSocket upgrade to ${url} was refused: ${event.message}` }));
    });
    socket.addEventListener('open', () => resolve({
      state, socket,
      say: (message) => socket.send(JSON.stringify(message)),
      next: () => new Promise((ok, fail) => {
        if (queue.length) return ok(queue.shift());
        const timer = setTimeout(() => fail(new assert.AssertionError({ message: 'no frame arrived within 2000 ms' })), 2000);
        waiters.push({ resolve: (value) => { clearTimeout(timer); ok(value); }, reject: fail });
        return undefined;
      })
    }));
  });
}

test('server: a real WebSocket client gets welcome, ordered messages 1 to 3, then message 4 after acknowledging 1', async () => {
  const instance = server.createLocalServer();
  const url = await listen(instance);
  try {
    const client = await openSocket(url);
    client.say({ type: 'hello' });
    const welcome = await client.next();
    assert.equal(welcome.type, 'welcome');
    assert.deepEqual([await client.next(), await client.next(), await client.next()].map((item) => item.seq), [1, 2, 3]);
    client.say({ type: 'ack', seq: 1 });
    assert.deepEqual(await client.next(), { type: 'acked', seq: 1, cursor: stream.cursorFor(welcome.session, 1) });
    assert.equal((await client.next()).seq, 4);
    client.socket.close(1000);
  } finally {
    await server.closeServer(instance);
  }
});

test('server: disconnect and resume over real sockets redelivers the unacknowledged messages once', async () => {
  const instance = server.createLocalServer();
  const url = await listen(instance);
  try {
    const first = await openSocket(url);
    first.say({ type: 'hello' });
    const welcome = await first.next();
    await first.next(); await first.next(); await first.next();
    first.say({ type: 'ack', seq: 1 });
    await first.next(); await first.next();
    first.say({ type: 'ack', seq: 2 });
    const acked = await first.next();
    assert.equal(acked.type, 'acked');
    first.socket.close(1000);
    const second = await openSocket(url);
    second.say({ type: 'resume', session: welcome.session, cursor: acked.cursor });
    const resumed = await second.next();
    assert.equal(resumed.type, 'resumed');
    assert.equal(resumed.ackedThrough, 2);
    const redelivered = [await second.next(), await second.next(), await second.next()];
    assert.deepEqual(redelivered.map((item) => [item.seq, item.redelivered, item.deliveries]), [[3, true, 2], [4, true, 2], [5, true, 2]]);
    second.socket.close(1000);
  } finally {
    await server.closeServer(instance);
  }
});
