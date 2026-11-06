'use strict';

// RED supplement, produced AFTER the implementation by replaying against the unchanged stubs. The original
// pre-implementation RED (initial-red.*) kept five failures as TypeErrors because the stub sends no frame and the
// initial tests read the last frame directly. These five tests state the same behavior but first assert that a frame or
// a session exists, so each stub failure is an AssertionError about the specified behavior. By default they target the
// real modules; the replay points C026_RED_SUBJECT at evidence\red\stubs.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const subject = process.env.C026_RED_SUBJECT ? path.resolve(process.env.C026_RED_SUBJECT) : path.resolve(__dirname, '..', '..');
const stream = require(path.join(subject, 'stream.cjs'));

function attach(hub) {
  const sent = [];
  const state = { closed: null };
  const connection = hub.connect({
    send: (message) => sent.push(message),
    close: (code, reason) => { state.closed = { code, reason }; }
  });
  return { sent, state, connection, say: (message) => connection.receive(JSON.stringify(message)) };
}

function lastFrame(client, name) {
  assert.ok(client.sent.length > 0, `${name}: the connection sent no frame`);
  return client.sent.at(-1);
}

function session(hub, id, name) {
  const found = hub.inspect(id);
  assert.notEqual(found, null, `${name}: session ${id} was never created`);
  return found;
}

const summary = (messages) => messages.filter((item) => item.type === 'message').map((item) => [item.seq, item.redelivered, item.deliveries]);

test('stream: a message that was never sent is never acknowledged', () => {
  const hub = stream.createHub({ total: 12, window: 3, newSessionId: () => 'session-a' });
  const client = attach(hub);
  client.say({ type: 'hello' });
  client.say({ type: 'ack', seq: 6 });
  assert.equal(lastFrame(client, 'ack 6').type, 'error');
  assert.equal(lastFrame(client, 'ack 6').code, 'ACK_UNSENT');
  assert.deepEqual(client.state.closed, { code: 1008, reason: 'ACK_UNSENT' });
  assert.equal(session(hub, 'session-a', 'ack 6').ackedThrough, 0);
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
    assert.equal(lastFrame(client, name).code, code, name);
    assert.equal(client.state.closed?.code, 1008, name);
    assert.equal(session(hub, 'session-a', name).ackedThrough, acked, name);
  }
});

test('stream: after an abrupt close, resume redelivers unacknowledged messages once and never the acknowledged ones', () => {
  const hub = stream.createHub({ total: 12, window: 3, newSessionId: () => 'session-a' });
  const first = attach(hub);
  first.say({ type: 'hello' });
  first.say({ type: 'ack', seq: 1 });
  first.say({ type: 'ack', seq: 2 });
  first.connection.disconnected();
  assert.equal(session(hub, 'session-a', 'before resume').attached, false);
  const second = attach(hub);
  second.say({ type: 'resume', session: 'session-a', cursor: stream.cursorFor('session-a', 2) });
  assert.ok(second.sent.length > 0, 'resume: the connection sent no frame');
  assert.equal(second.sent[0].type, 'resumed');
  assert.equal(second.sent[0].ackedThrough, 2);
  assert.equal(second.sent[0].lastSent, 5);
  assert.deepEqual(summary(second.sent), [[3, true, 2], [4, true, 2], [5, true, 2]]);
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
    const before = session(hub, 'session-a', name);
    const client = attach(hub);
    client.say(message);
    assert.equal(lastFrame(client, name).code, code, name);
    assert.deepEqual(client.state.closed, { code: 1008, reason: code }, name);
    assert.deepEqual(session(hub, 'session-a', name), before, name);
  }
});

test('stream: parallel sessions never see each other\'s messages', () => {
  const hub = stream.createHub({ total: 6, window: 3 });
  const clients = Array.from({ length: 8 }, () => attach(hub));
  for (const client of clients) client.say({ type: 'hello' });
  for (let seq = 1; seq <= 6; seq += 1) for (const client of clients) client.say({ type: 'ack', seq });
  for (const client of clients) assert.ok(client.sent.length > 0, 'a parallel client received no frame');
  assert.equal(new Set(clients.map((client) => client.sent[0].session)).size, 8);
  for (const client of clients) {
    const delivered = client.sent.filter((item) => item.type === 'message');
    assert.deepEqual(delivered.map((item) => item.seq), [1, 2, 3, 4, 5, 6]);
    assert.ok(delivered.every((item) => item.session === client.sent[0].session && item.redelivered === false));
  }
});
