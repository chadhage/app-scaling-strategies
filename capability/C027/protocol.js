(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C020/contract.js'));
  } else {
    Object.defineProperty(root, 'C027Protocol', { value: factory(root.C020Contract) });
  }
}(globalThis, function (contract) {
  'use strict';

  const VERSION = 'r1';
  const START = 'START';
  const EVENT_COUNT = 6;
  const EVENT_CONTRACT = 'C027.sse/1';
  const MAX_ATTEMPTS = 8;
  const MAX_RECEIPTS = 64;

  class ProtocolError extends Error {
    constructor(code, message, status = 400) {
      super(message);
      this.name = 'ProtocolError';
      this.code = code;
      this.status = status;
    }
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function fields(value, expected, code = 'INVALID_REQUEST') {
    try {
      if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError();
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.length !== expected.length || keys.some((key) => !expected.includes(key) ||
          !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw new TypeError();
      return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
    } catch {
      throw new ProtocolError(code, 'Only the declared own data fields are supported.');
    }
  }

  function profileFor(profileId) {
    if (typeof profileId !== 'string' || !/^synthetic-\d{3}$/.test(profileId)) {
      throw new ProtocolError('INVALID_PROFILE_ID', 'An explicit synthetic-NNN profile identifier is required.');
    }
    const profile = contract?.profiles?.find((value) => value.id === profileId);
    if (!profile) throw new ProtocolError('UNKNOWN_PROFILE', 'No unchanged C020 fixture has that identifier.', 404);
    return profile;
  }

  function streamId(profileId) {
    profileFor(profileId);
    return `C027:${VERSION}:${profileId}`;
  }

  function eventId(profileId, sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > EVENT_COUNT) {
      throw new ProtocolError('INVALID_SEQUENCE', 'An event sequence must be an integer from one through six.');
    }
    return `${streamId(profileId)}:${String(sequence).padStart(6, '0')}`;
  }

  function parseCursor(cursor, profileId) {
    profileFor(profileId);
    if (cursor === START) return 0;
    const match = typeof cursor === 'string' && /^C027:([a-z0-9-]{1,10}):(synthetic-\d{3}):(\d{6})$/.exec(cursor);
    if (!match || Number(match[3]) === 0) {
      throw new ProtocolError('INVALID_CURSOR', 'Use START or an explicit versioned C027 event ID.');
    }
    if (match[1] !== VERSION || match[2] !== profileId) {
      throw new ProtocolError('CURSOR_STREAM_MISMATCH', 'The accepted cursor belongs to another stream or version.', 409);
    }
    if (Number(match[3]) > EVENT_COUNT) {
      throw new ProtocolError('FUTURE_CURSOR', 'The accepted cursor is beyond this immutable event log.', 416);
    }
    return Number(match[3]);
  }

  function expectedEvent(profileId, sequence) {
    const profile = profileFor(profileId);
    const id = eventId(profileId, sequence);
    const implementation = sequence % 2 ? 'v1' : 'v2';
    return freeze(structuredClone({
      eventContract: EVENT_CONTRACT, streamId: streamId(profileId), streamVersion: VERSION,
      id, sequence, kind: 'profile.snapshot',
      payload: { apiContract: contract.apiContract, profile, stamp: contract.stamps[implementation] }
    }));
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function validateEvent(id, data, profileId) {
    if (typeof data !== 'string' || data.length > 16384) {
      throw new ProtocolError('INVALID_EVENT', 'An event must be bounded JSON text.');
    }
    let value;
    try { value = JSON.parse(data); }
    catch { throw new ProtocolError('INVALID_JSON', 'The received SSE data is not valid JSON.'); }
    fields(value, ['eventContract', 'streamId', 'streamVersion', 'id', 'sequence', 'kind', 'payload'], 'INVALID_EVENT');
    const sequence = parseCursor(id, profileId);
    if (sequence === 0 || value.id !== id || value.sequence !== sequence) {
      throw new ProtocolError('EVENT_ID_MISMATCH', 'The SSE ID and JSON sequence/ID must agree.');
    }
    const expected = expectedEvent(profileId, sequence);
    if (canonical(value) !== canonical(expected)) {
      throw new ProtocolError('EVENT_PAYLOAD_MISMATCH', 'Event data, contract and unchanged C020 lineage must match the pinned fixture.');
    }
    return expected;
  }

  function tailFor(profileId) {
    return freeze({ streamId: streamId(profileId), streamVersion: VERSION, lastId: eventId(profileId, EVENT_COUNT), total: EVENT_COUNT });
  }

  class CursorSession {
    #profileId;
    #accepted = [];
    #pending = [];
    #receipts = [];
    #attempts = [];
    #transitions = [];
    #receivedCursor = null;
    #receivedSequence = 0;
    #lastAttemptSequence = 0;
    #phase = 'idle';
    #error = null;
    #tailSeen = false;
    #transportOpen = false;

    constructor(profileId) {
      profileFor(profileId);
      this.#profileId = profileId;
      Object.freeze(this);
    }

    #acceptedCursor() {
      return this.#accepted.at(-1)?.id || START;
    }

    #fail(error, phase = 'error') {
      this.#phase = phase;
      this.#error = { code: error.code || 'UNVERIFIED_EVENT', message: error.message };
      this.#transportOpen = false;
      this.#transitions.push({ attempt: this.#attempts.length, phase, ...this.#error, acceptedCursor: this.#acceptedCursor() });
      return freeze({ queued: false, error: structuredClone(this.#error) });
    }

    begin() {
      if (this.#transportOpen || this.#phase === 'connecting') {
        throw new ProtocolError('STREAM_ALREADY_OPEN', 'Disconnect the owned EventSource before starting another attempt.');
      }
      if (this.#attempts.length >= MAX_ATTEMPTS) {
        throw new ProtocolError('ATTEMPT_LIMIT', 'Reset explicitly after eight bounded attempts; prior proof is not overwritten.');
      }
      this.#pending = [];
      this.#lastAttemptSequence = this.#accepted.length;
      this.#tailSeen = false;
      this.#error = null;
      this.#phase = 'connecting';
      const cursor = this.#acceptedCursor();
      this.#attempts.push({ attempt: this.#attempts.length + 1, acceptedAfter: cursor });
      return cursor;
    }

    opened() {
      if (this.#phase !== 'connecting') throw new ProtocolError('UNEXPECTED_OPEN', 'No connecting attempt exists.');
      this.#transportOpen = true;
      this.#phase = 'streaming';
    }

    receive(envelope) {
      if (!this.#transportOpen || this.#tailSeen) {
        return this.#fail(new ProtocolError('UNEXPECTED_EVENT', 'No unfinished open event stream exists.'));
      }
      let id;
      let data;
      try {
        ({ id, data } = fields(envelope, ['id', 'data'], 'INVALID_ENVELOPE'));
        if (typeof id !== 'string' || id.length > 128 || typeof data !== 'string') {
          throw new ProtocolError('INVALID_ENVELOPE', 'SSE ID and data must be bounded text.');
        }
        if (this.#receipts.length >= MAX_RECEIPTS) throw new ProtocolError('RECEIPT_LIMIT', 'The local observation bound has been reached.');
        this.#receivedCursor = id;
        const receipt = {
          attempt: this.#attempts.length, receivedCursor: id, acceptedCursorBefore: this.#acceptedCursor(),
          dataLength: data.length, data: data.slice(0, 16384), disposition: 'rejected'
        };
        this.#receipts.push(receipt);
        const event = validateEvent(id, data, this.#profileId);
        this.#receivedSequence = event.sequence;
        if (event.sequence <= this.#lastAttemptSequence) {
          throw new ProtocolError('DUPLICATE_EVENT', 'Repeated received/accepted events are rejected, never accepted twice.');
        }
        if (event.sequence !== this.#lastAttemptSequence + 1) {
          throw new ProtocolError('EVENT_GAP', 'The next received sequence is not the contiguous ordered suffix.');
        }
        this.#lastAttemptSequence = event.sequence;
        this.#pending.push(event);
        receipt.disposition = 'queued-not-accepted';
        return freeze({ queued: true, event });
      } catch (error) {
        return this.#fail(error);
      }
    }

    acceptNext() {
      if (!this.#transportOpen || this.#error) {
        throw new ProtocolError('ACCEPTANCE_BLOCKED', 'Only a validated event from a clean open attempt can be accepted.');
      }
      const next = this.#pending[0];
      if (!next) throw new ProtocolError('NO_PENDING_EVENT', 'No received event is waiting for explicit acceptance.');
      if (next.sequence !== this.#accepted.length + 1) {
        throw new ProtocolError('ACCEPTANCE_GAP', 'Acceptance must remain contiguous.');
      }
      this.#accepted.push(this.#pending.shift());
      if (this.#tailSeen && this.#accepted.length === EVENT_COUNT) this.#phase = 'verified-local';
      return next;
    }

    tail(data) {
      try {
        if (!this.#transportOpen || this.#tailSeen) throw new ProtocolError('UNEXPECTED_TAIL', 'An open unfinished suffix is required.');
        if (typeof data !== 'string' || data.length > 1024) throw new ProtocolError('INVALID_TAIL', 'The tail must be bounded JSON.');
        let value;
        try { value = JSON.parse(data); }
        catch { throw new ProtocolError('INVALID_TAIL', 'The tail is not valid JSON.'); }
        if (canonical(value) !== canonical(tailFor(this.#profileId))) throw new ProtocolError('INVALID_TAIL', 'The tail does not identify this pinned stream.');
        if (this.#lastAttemptSequence !== EVENT_COUNT) throw new ProtocolError('INCOMPLETE_SUFFIX', 'Tail arrived before the complete ordered suffix.');
        this.#tailSeen = true;
        this.#phase = this.#accepted.length === EVENT_COUNT ? 'verified-local' : 'awaiting-acceptance';
        return freeze({ tailVerified: true });
      } catch (error) {
        return this.#fail(error);
      }
    }

    disconnect() {
      this.#transitions.push({
        attempt: this.#attempts.length, phase: 'disconnected', receivedCursor: this.#receivedCursor,
        acceptedCursor: this.#acceptedCursor(), discardedUnacceptedSequences: this.#pending.map((event) => event.sequence)
      });
      this.#transportOpen = false;
      this.#pending = [];
      this.#phase = 'disconnected';
    }

    interrupt() {
      this.#pending = [];
      return this.#fail(new ProtocolError('TRANSPORT_INTERRUPTED',
        'Native EventSource failed or closed before a verified local suffix; it exposes no HTTP status.'), 'unknown');
    }

    snapshot() {
      return freeze(structuredClone({
        streamId: streamId(this.#profileId), streamVersion: VERSION,
        receivedCursor: this.#receivedCursor, receivedSequence: this.#receivedSequence,
        acceptedCursor: this.#acceptedCursor(), acceptedSequence: this.#accepted.length,
        pendingSequences: this.#pending.map((event) => event.sequence), acceptedEvents: this.#accepted,
        receipts: this.#receipts, attempts: this.#attempts, transitions: this.#transitions,
        phase: this.#phase, error: this.#error, tailSeen: this.#tailSeen, transportOpen: this.#transportOpen,
        outcome: this.#phase === 'verified-local' ? 'verified-local' : this.#phase === 'error' ? 'error' : 'unknown'
      }));
    }
  }

  return freeze({
    VERSION, START, EVENT_COUNT, EVENT_CONTRACT, MAX_ATTEMPTS, MAX_RECEIPTS,
    ProtocolError, CursorSession, freeze, fields, profileFor, streamId, eventId, parseCursor,
    expectedEvent, validateEvent, tailFor
  });
}));
