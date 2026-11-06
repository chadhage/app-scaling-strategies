'use strict';

// The sequenced stream model: no sockets, no clock, no randomness beyond the injected session id factory.
// The server owns every sequence number. A client may only say hello, resume with a cursor, or acknowledge the
// next message the server already sent; everything else is an explicit typed failure.
const { randomUUID } = require('node:crypto');

const CURSOR_PATTERN = /^c1\.([A-Za-z0-9-]{1,64})\.(0|[1-9][0-9]{0,8})$/;
const CLIENT_FIELDS = Object.freeze({
  hello: Object.freeze(['type']),
  resume: Object.freeze(['type', 'session', 'cursor']),
  ack: Object.freeze(['type', 'seq'])
});

function cursorFor(sessionId, seq) {
  return `c1.${sessionId}.${seq}`;
}

function positive(name, value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function createHub({ total = 12, window = 3, maxSessions = 32, newSessionId = randomUUID } = {}) {
  positive('total', total, 100000);
  positive('window', window, total);
  positive('maxSessions', maxSessions, 100000);
  const sessions = new Map();

  function messageFrame(session, seq) {
    session.deliveries[seq - 1] += 1;
    const deliveries = session.deliveries[seq - 1];
    return { type: 'message', session: session.id, seq, body: `synthetic message ${seq} of ${total}`, redelivered: deliveries > 1, deliveries };
  }

  function connect({ send, close }) {
    let state = 'new';
    let session = null;
    const self = {};

    function release() {
      state = 'closed';
      if (session !== null && session.attached === self) session.attached = null;
    }

    function end(code, reason) {
      if (state === 'closed') return;
      release();
      close(code, reason);
    }

    function fail(code, message) {
      if (state === 'closed') return;
      send({ type: 'error', code, message });
      end(1008, code);
    }

    function pump() {
      while (session.lastSent < total && session.lastSent - session.ackedThrough < window) {
        session.lastSent += 1;
        send(messageFrame(session, session.lastSent));
      }
    }

    function completeIfDone() {
      if (session.ackedThrough < total) return false;
      send({ type: 'complete', session: session.id, through: total });
      end(1000, 'COMPLETE');
      return true;
    }

    function hello() {
      if (sessions.size >= maxSessions) return fail('SESSION_LIMIT', 'This fixture holds no more sessions.');
      const id = newSessionId();
      session = { id, lastSent: 0, ackedThrough: 0, deliveries: new Array(total).fill(0), attached: self };
      sessions.set(id, session);
      state = 'streaming';
      send({ type: 'welcome', session: id, cursor: cursorFor(id, 0), total, window });
      return pump();
    }

    function resume(message) {
      const found = typeof message.session === 'string' ? sessions.get(message.session) : undefined;
      if (found === undefined) return fail('SESSION_UNKNOWN', 'No such session exists on this fixture.');
      const match = typeof message.cursor === 'string' ? CURSOR_PATTERN.exec(message.cursor) : null;
      if (match === null) return fail('CURSOR_MALFORMED', 'The cursor is not a C026 cursor.');
      if (match[1] !== found.id) return fail('CURSOR_FOREIGN_SESSION', 'The cursor belongs to another session.');
      const position = Number(match[2]);
      if (position > found.lastSent) return fail('CURSOR_FROM_FUTURE', 'The cursor is beyond anything the server sent.');
      if (position > found.ackedThrough) return fail('CURSOR_AHEAD_OF_ACK', 'The cursor claims an acknowledgement the server never recorded.');
      const previous = found.attached;
      found.attached = self;
      session = found;
      state = 'streaming';
      if (previous !== null) previous.evict();
      send({
        type: 'resumed', session: found.id, cursor: cursorFor(found.id, found.ackedThrough),
        ackedThrough: found.ackedThrough, lastSent: found.lastSent, total, cursorBehind: position < found.ackedThrough
      });
      for (let seq = found.ackedThrough + 1; seq <= found.lastSent; seq += 1) send(messageFrame(found, seq));
      return completeIfDone() ? undefined : pump();
    }

    function acknowledge(message) {
      if (state !== 'streaming') return fail('HELLO_REQUIRED', 'Say hello or resume before acknowledging.');
      const { seq } = message;
      if (!Number.isSafeInteger(seq) || seq < 1) return fail('ACK_MALFORMED', 'An acknowledgement names a positive integer sequence.');
      if (seq > session.lastSent) return fail('ACK_UNSENT', 'That message was never sent, so it cannot be acknowledged.');
      if (seq <= session.ackedThrough) return fail('ACK_DUPLICATE', 'That message was already acknowledged.');
      if (seq !== session.ackedThrough + 1) return fail('ACK_OUT_OF_ORDER', 'Acknowledge the oldest unacknowledged message first.');
      session.ackedThrough = seq;
      send({ type: 'acked', seq, cursor: cursorFor(session.id, seq) });
      return completeIfDone() ? undefined : pump();
    }

    self.evict = () => fail('SESSION_TAKEN_OVER', 'Another connection resumed this session.');

    return Object.freeze({
      receive(text) {
        if (state === 'closed') return;
        let message;
        try {
          message = JSON.parse(text);
        } catch {
          fail('MALFORMED_JSON', 'The frame is not JSON.');
          return;
        }
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
          fail('MALFORMED_MESSAGE', 'A JSON object is required.');
          return;
        }
        const { type } = message;
        if (type === 'message' || (type !== 'ack' && Object.hasOwn(message, 'seq'))) {
          fail('CLIENT_SEQUENCE_FORBIDDEN', 'Only the server numbers messages; a client acknowledges, it never names one.');
          return;
        }
        if (typeof type !== 'string' || !Object.hasOwn(CLIENT_FIELDS, type)) {
          fail('UNSUPPORTED_MESSAGE', 'Say hello, resume or ack.');
          return;
        }
        if (Object.keys(message).some((key) => !CLIENT_FIELDS[type].includes(key))) {
          fail('UNEXPECTED_FIELD', 'The message carries a field this type does not allow.');
          return;
        }
        if (type === 'ack') {
          acknowledge(message);
        } else if (state !== 'new') {
          fail('ALREADY_ESTABLISHED', 'This connection already has a session.');
        } else if (type === 'hello') {
          hello();
        } else {
          resume(message);
        }
      },
      disconnected() {
        if (state !== 'closed') release();
      }
    });
  }

  function inspect(id) {
    const found = typeof id === 'string' ? sessions.get(id) : undefined;
    if (found === undefined) return null;
    return Object.freeze({
      id: found.id, total, lastSent: found.lastSent, ackedThrough: found.ackedThrough,
      deliveries: Object.freeze([...found.deliveries]), attached: found.attached !== null, complete: found.ackedThrough === total
    });
  }

  return Object.freeze({
    connect, inspect, sessionCount: () => sessions.size, config: Object.freeze({ total, window, maxSessions })
  });
}

module.exports = Object.freeze({ CURSOR_PATTERN, cursorFor, createHub });
