'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { cursorFor, createHub } = require('../stream.cjs');

function attach(hub) {
  const sent = [];
  const state = { closed: null };
  const connection = hub.connect({
    send: (message) => sent.push(message),
    close: (code, reason) => { state.closed = { code, reason }; }
  });
  return { sent, state, connection, say: (message) => connection.receive(JSON.stringify(message)) };
}
const ids = (...names) => { const queue = [...names]; return () => queue.shift(); };
const messages = (sent) => sent.filter((item) => item.type === 'message').map((item) => [item.seq, item.redelivered, item.deliveries]);

function failure(raw, code) {
  const hub = createHub({ newSessionId: ids('s') });
  const client = attach(hub);
  client.connection.receive(raw);
  assert.equal(client.sent.at(-1).code, code, raw);
  assert.deepEqual(client.state.closed, { code: 1008, reason: code }, raw);
}

test('options are validated', () => {
  for (const options of [{ total: 0 }, { total: 1.5 }, { total: 100001 }, { window: 0 }, { total: 2, window: 3 }, { maxSessions: 0 }]) {
    assert.throws(() => createHub(options), RangeError, JSON.stringify(options));
  }
  assert.deepEqual(createHub().config, { total: 12, window: 3, maxSessions: 32 });
});

test('the window limits unacknowledged messages and each acknowledgement releases exactly one more', () => {
  const hub = createHub({ total: 12, window: 3, newSessionId: ids('s') });
  const client = attach(hub);
  client.say({ type: 'hello' });
  assert.deepEqual(messages(client.sent), [[1, false, 1], [2, false, 1], [3, false, 1]]);
  for (let seq = 1; seq <= 12; seq += 1) {
    const before = messages(client.sent).length;
    client.say({ type: 'ack', seq });
    assert.equal(messages(client.sent).length - before, seq <= 9 ? 1 : 0, `ack ${seq}`);
  }
  assert.deepEqual(messages(client.sent).map(([seq]) => seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(client.sent.at(-1), { type: 'complete', session: 's', through: 12 });
  assert.deepEqual(client.state.closed, { code: 1000, reason: 'COMPLETE' });
  assert.equal(hub.inspect('s').complete, true);
  assert.equal(hub.inspect('s').attached, false);
});

test('every typed protocol failure is reported once and closes with 1008', () => {
  failure('{not json', 'MALFORMED_JSON');
  for (const raw of ['[]', 'null', '7', '"text"']) failure(raw, 'MALFORMED_MESSAGE');
  failure('{}', 'UNSUPPORTED_MESSAGE');
  failure('{"type":"bogus"}', 'UNSUPPORTED_MESSAGE');
  failure('{"type":7}', 'UNSUPPORTED_MESSAGE');
  failure('{"type":"constructor"}', 'UNSUPPORTED_MESSAGE');
  failure('{"type":"hello","extra":1}', 'UNEXPECTED_FIELD');
  failure('{"type":"ack","seq":1,"note":"x"}', 'UNEXPECTED_FIELD');
  failure('{"type":"message","seq":1,"body":"forged"}', 'CLIENT_SEQUENCE_FORBIDDEN');
  failure('{"type":"message"}', 'CLIENT_SEQUENCE_FORBIDDEN');
  failure('{"type":"hello","seq":4}', 'CLIENT_SEQUENCE_FORBIDDEN');
  failure('{"type":"resume","session":"s","cursor":"c1.s.0","seq":0}', 'CLIENT_SEQUENCE_FORBIDDEN');
  failure('{"type":"ack","seq":1}', 'HELLO_REQUIRED');
});

test('acknowledgements are validated against what the server sent and recorded', () => {
  const cases = [
    [[{ type: 'ack', seq: '1' }], 'ACK_MALFORMED', 0],
    [[{ type: 'ack', seq: 0 }], 'ACK_MALFORMED', 0],
    [[{ type: 'ack', seq: -1 }], 'ACK_MALFORMED', 0],
    [[{ type: 'ack', seq: 2 ** 60 }], 'ACK_MALFORMED', 0],
    [[{ type: 'ack' }], 'ACK_MALFORMED', 0],
    [[{ type: 'ack', seq: 4 }], 'ACK_UNSENT', 0],
    [[{ type: 'ack', seq: 3 }], 'ACK_OUT_OF_ORDER', 0],
    [[{ type: 'ack', seq: 1 }, { type: 'ack', seq: 3 }], 'ACK_OUT_OF_ORDER', 1],
    [[{ type: 'ack', seq: 1 }, { type: 'ack', seq: 1 }], 'ACK_DUPLICATE', 1],
    [[{ type: 'ack', seq: 1 }, { type: 'ack', seq: 2 }, { type: 'ack', seq: 1 }], 'ACK_DUPLICATE', 2]
  ];
  for (const [steps, code, acknowledged] of cases) {
    const hub = createHub({ total: 12, window: 3, newSessionId: ids('s') });
    const client = attach(hub);
    client.say({ type: 'hello' });
    for (const step of steps) client.say(step);
    assert.equal(client.sent.at(-1).code, code, JSON.stringify(steps));
    assert.deepEqual(client.state.closed, { code: 1008, reason: code });
    assert.equal(hub.inspect('s').ackedThrough, acknowledged, JSON.stringify(steps));
    assert.equal(hub.inspect('s').lastSent, 3 + acknowledged);
  }
});

test('a connection may establish a session once; resume and hello are not repeatable', () => {
  const hub = createHub({ newSessionId: ids('s', 't') });
  const first = attach(hub);
  first.say({ type: 'hello' });
  first.say({ type: 'hello' });
  assert.equal(first.sent.at(-1).code, 'ALREADY_ESTABLISHED');
  const second = attach(hub);
  second.say({ type: 'hello' });
  second.say({ type: 'resume', session: 't', cursor: cursorFor('t', 0) });
  assert.equal(second.sent.at(-1).code, 'ALREADY_ESTABLISHED');
  assert.equal(hub.inspect('t').attached, false);
});

test('the number of sessions is bounded', () => {
  const hub = createHub({ maxSessions: 2, newSessionId: ids('a', 'b', 'c') });
  attach(hub).say({ type: 'hello' });
  attach(hub).say({ type: 'hello' });
  const third = attach(hub);
  third.say({ type: 'hello' });
  assert.equal(third.sent.at(-1).code, 'SESSION_LIMIT');
  assert.equal(hub.sessionCount(), 2);
  assert.equal(hub.inspect('c'), null);
});

test('every unusable cursor is a typed failure, in a fixed order, and leaves the session untouched', () => {
  const build = () => {
    const hub = createHub({ total: 12, window: 3, newSessionId: ids('a', 'b') });
    const owner = attach(hub);
    owner.say({ type: 'hello' });
    owner.say({ type: 'ack', seq: 1 });
    owner.connection.disconnected();
    const other = attach(hub);
    other.say({ type: 'hello' });
    other.connection.disconnected();
    return hub;
  };
  const resume = (session, cursor) => ({ type: 'resume', session, cursor });
  const cases = [
    [resume('zzz', cursorFor('zzz', 0)), 'SESSION_UNKNOWN'],
    [{ type: 'resume', cursor: cursorFor('a', 1) }, 'SESSION_UNKNOWN'],
    [resume(7, cursorFor('a', 1)), 'SESSION_UNKNOWN'],
    [{ type: 'resume', session: 'a' }, 'CURSOR_MALFORMED'],
    [resume('a', 5), 'CURSOR_MALFORMED'],
    [resume('a', 'a:1'), 'CURSOR_MALFORMED'],
    [resume('a', 'c1.a.01'), 'CURSOR_MALFORMED'],
    [resume('a', 'c1.a.-1'), 'CURSOR_MALFORMED'],
    [resume('a', 'c1.a.1.5'), 'CURSOR_MALFORMED'],
    [resume('a', cursorFor('b', 0)), 'CURSOR_FOREIGN_SESSION'],
    [resume('a', cursorFor('zzz', 0)), 'CURSOR_FOREIGN_SESSION'],
    [resume('a', cursorFor('a', 99)), 'CURSOR_FROM_FUTURE'],
    [resume('a', cursorFor('a', 5)), 'CURSOR_FROM_FUTURE'],
    [resume('a', cursorFor('a', 2)), 'CURSOR_AHEAD_OF_ACK'],
    [resume('a', cursorFor('a', 4)), 'CURSOR_AHEAD_OF_ACK']
  ];
  for (const [message, code] of cases) {
    const hub = build();
    const before = [hub.inspect('a'), hub.inspect('b')];
    const client = attach(hub);
    client.say(message);
    assert.equal(client.sent.at(-1).code, code, JSON.stringify(message));
    assert.deepEqual(client.state.closed, { code: 1008, reason: code });
    assert.deepEqual([hub.inspect('a'), hub.inspect('b')], before, JSON.stringify(message));
    assert.equal(client.sent.some((item) => item.type === 'message' || item.type === 'resumed'), false);
  }
});

test('resume redelivers every unacknowledged message once per resume, never an acknowledged one, then continues', () => {
  const hub = createHub({ total: 12, window: 3, newSessionId: ids('s') });
  const first = attach(hub);
  first.say({ type: 'hello' });
  first.say({ type: 'ack', seq: 1 });
  first.say({ type: 'ack', seq: 2 });
  first.connection.disconnected();
  const second = attach(hub);
  second.say({ type: 'resume', session: 's', cursor: cursorFor('s', 2) });
  assert.deepEqual(second.sent[0], {
    type: 'resumed', session: 's', cursor: cursorFor('s', 2), ackedThrough: 2, lastSent: 5, total: 12, cursorBehind: false
  });
  assert.deepEqual(messages(second.sent), [[3, true, 2], [4, true, 2], [5, true, 2]]);
  second.connection.disconnected();
  const third = attach(hub);
  third.say({ type: 'resume', session: 's', cursor: cursorFor('s', 2) });
  assert.deepEqual(messages(third.sent), [[3, true, 3], [4, true, 3], [5, true, 3]]);
  third.say({ type: 'ack', seq: 3 });
  third.say({ type: 'ack', seq: 4 });
  assert.deepEqual(messages(third.sent.slice(4)), [[6, false, 1], [7, false, 1]]);
  assert.deepEqual(hub.inspect('s').deliveries.slice(0, 7), [1, 1, 3, 3, 3, 1, 1]);
});

test('with a window of one a resume redelivers exactly the one outstanding message and then continues', () => {
  const hub = createHub({ total: 5, window: 1, newSessionId: ids('s') });
  const first = attach(hub);
  first.say({ type: 'hello' });
  first.say({ type: 'ack', seq: 1 });
  first.connection.disconnected();
  const second = attach(hub);
  second.say({ type: 'resume', session: 's', cursor: cursorFor('s', 1) });
  assert.deepEqual(messages(second.sent), [[2, true, 2]]);
  assert.equal(second.sent[0].lastSent, 2);
  second.say({ type: 'ack', seq: 2 });
  assert.deepEqual(messages(second.sent.slice(2)), [[3, false, 1]]);
});

test('a cursor behind the server record is honoured from the server record, never rewound', () => {
  const hub = createHub({ total: 12, window: 3, newSessionId: ids('s') });
  const first = attach(hub);
  first.say({ type: 'hello' });
  for (const seq of [1, 2, 3]) first.say({ type: 'ack', seq });
  first.connection.disconnected();
  const second = attach(hub);
  second.say({ type: 'resume', session: 's', cursor: cursorFor('s', 1) });
  assert.equal(second.sent[0].type, 'resumed');
  assert.equal(second.sent[0].ackedThrough, 3);
  assert.equal(second.sent[0].cursorBehind, true);
  assert.deepEqual(messages(second.sent).map(([seq]) => seq), [4, 5, 6]);
  assert.equal(hub.inspect('s').deliveries.slice(0, 3).every((count) => count === 1), true);
});

test('a completed stream completes again on resume and sends no message', () => {
  const hub = createHub({ total: 3, window: 3, newSessionId: ids('s') });
  const first = attach(hub);
  first.say({ type: 'hello' });
  for (const seq of [1, 2, 3]) first.say({ type: 'ack', seq });
  const again = attach(hub);
  again.say({ type: 'resume', session: 's', cursor: cursorFor('s', 3) });
  assert.deepEqual(again.sent.map((item) => item.type), ['resumed', 'complete']);
  assert.deepEqual(again.state.closed, { code: 1000, reason: 'COMPLETE' });
});

test('a second connection takes the session over and the first is told so', () => {
  const hub = createHub({ total: 12, window: 3, newSessionId: ids('s') });
  const first = attach(hub);
  first.say({ type: 'hello' });
  first.say({ type: 'ack', seq: 1 });
  const second = attach(hub);
  second.say({ type: 'resume', session: 's', cursor: cursorFor('s', 1) });
  assert.equal(first.sent.at(-1).code, 'SESSION_TAKEN_OVER');
  assert.deepEqual(first.state.closed, { code: 1008, reason: 'SESSION_TAKEN_OVER' });
  assert.equal(hub.inspect('s').attached, true);
  const before = hub.inspect('s');
  first.say({ type: 'ack', seq: 2 });
  first.connection.disconnected();
  assert.deepEqual(hub.inspect('s'), before);
  assert.equal(hub.inspect('s').attached, true);
});

test('a closed or disconnected connection ignores later input and releases its session once', () => {
  const hub = createHub({ newSessionId: ids('s') });
  const client = attach(hub);
  client.say({ type: 'hello' });
  client.connection.disconnected();
  client.connection.disconnected();
  const count = client.sent.length;
  client.say({ type: 'ack', seq: 1 });
  client.connection.receive('{not json');
  assert.equal(client.sent.length, count);
  assert.equal(client.state.closed, null);
  assert.equal(hub.inspect('s').attached, false);
});

test('inspection is a frozen copy and unknown sessions are null', () => {
  const hub = createHub({ total: 4, window: 2, newSessionId: ids('s') });
  attach(hub).say({ type: 'hello' });
  const copy = hub.inspect('s');
  assert.equal(Object.isFrozen(copy) && Object.isFrozen(copy.deliveries), true);
  assert.throws(() => { 'use strict'; copy.ackedThrough = 4; }, TypeError);
  assert.equal(hub.inspect('nope'), null);
  assert.equal(hub.inspect(42), null);
  assert.equal(hub.inspect('s').ackedThrough, 0);
});

test('parallel sessions are isolated even when their frames interleave', () => {
  const hub = createHub({ total: 12, window: 3 });
  const clients = Array.from({ length: 8 }, () => attach(hub));
  for (const client of clients) client.say({ type: 'hello' });
  for (let seq = 1; seq <= 12; seq += 1) for (const client of clients) client.say({ type: 'ack', seq });
  assert.equal(new Set(clients.map((client) => client.sent[0].session)).size, 8);
  for (const client of clients) {
    const delivered = client.sent.filter((item) => item.type === 'message');
    assert.deepEqual(delivered.map((item) => item.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(delivered.every((item) => item.session === client.sent[0].session && !item.redelivered && item.deliveries === 1), true);
    assert.equal(client.sent.at(-1).type, 'complete');
  }
});
