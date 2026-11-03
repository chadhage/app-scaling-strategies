'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { getLog, encodeEvent, suffix } = require('../fixture.cjs');
const {
  CursorSession, eventId, parseCursor, EVENT_COUNT, MAX_ATTEMPTS,
  expectedEvent, tailFor, validateEvent
} = require('../protocol.js');
const { getProfileV1, getProfileV2 } = require('../../C020/profiles.cjs');
const request = { profileId: 'synthetic-001', version: 'r1' };

test('immutable ordered log reuses the actual unchanged C020 fixtures and stamps', () => {
  const log = getLog(request);
  assert.equal(log.length, EVENT_COUNT);
  assert.deepEqual(log.map((event) => event.sequence), [1, 2, 3, 4, 5, 6]);
  assert.equal(Object.isFrozen(log), true);
  for (const event of log) {
    const fixture = event.sequence % 2 ? getProfileV1 : getProfileV2;
    assert.deepEqual(event.payload, fixture({ profileId: request.profileId }));
    assert.equal(event.id, eventId(request.profileId, event.sequence));
    assert.equal(event.streamVersion, 'r1');
    assert.equal(Object.isFrozen(event.payload.profile.preferences.topics), true);
  }
});

test('SSE wire bytes contain explicit id, event, one JSON data line and frame delimiter', () => {
  const event = getLog(request)[0];
  const bytes = encodeEvent(event);
  assert.ok(Buffer.isBuffer(bytes));
  assert.match(bytes.toString('utf8'), /^id: C027:r1:synthetic-001:000001\nevent: profile\ndata: \{/);
  assert.equal(bytes.toString('utf8'), `id: ${event.id}\nevent: profile\ndata: ${JSON.stringify(event)}\n\n`);
});

test('ordered suffix starts strictly after the accepted cursor, not the last received cursor', () => {
  const log = getLog(request);
  assert.deepEqual(suffix(request, eventId(request.profileId, 1)).map((event) => event.sequence), [2, 3, 4, 5, 6]);
  assert.deepEqual(suffix(request, eventId(request.profileId, 6)), []);
  assert.deepEqual(suffix(request, 'START'), log);
});

test('received three but accepted one resumes from one, replaying two and three', () => {
  const session = new CursorSession(request.profileId);
  const log = getLog(request);
  assert.equal(session.begin(), 'START');
  session.opened();
  for (const event of log.slice(0, 3)) {
    assert.equal(session.receive({ id: event.id, data: JSON.stringify(event) }).queued, true);
  }
  assert.equal(session.snapshot().receivedCursor, eventId(request.profileId, 3));
  assert.equal(session.snapshot().acceptedCursor, 'START');
  session.acceptNext();
  const before = session.snapshot();
  session.disconnect();
  assert.equal(session.begin(), eventId(request.profileId, 1));
  session.opened();
  for (const event of log.slice(1)) {
    session.receive({ id: event.id, data: JSON.stringify(event) });
    session.acceptNext();
  }
  assert.equal(session.snapshot().acceptedSequence, 6);
  assert.deepEqual(session.snapshot().acceptedEvents.map((event) => event.sequence), [1, 2, 3, 4, 5, 6]);
  assert.equal(before.acceptedSequence, 1, 'Previously returned evidence is immutable.');
  assert.equal(Object.isFrozen(before), true);
});

test('invalid, future and foreign cursors reject instead of silently starting over', () => {
  for (const [cursor, code] of [
    ['', 'INVALID_CURSOR'], [null, 'INVALID_CURSOR'], ['1', 'INVALID_CURSOR'],
    ['C027:r1:synthetic-001:000000', 'INVALID_CURSOR'],
    ['C027:r1:synthetic-001:000007', 'FUTURE_CURSOR'],
    ['C027:r1:synthetic-002:000001', 'CURSOR_STREAM_MISMATCH'],
    ['C027:r2:synthetic-001:000001', 'CURSOR_STREAM_MISMATCH']
  ]) {
    assert.throws(() => parseCursor(cursor, request.profileId), { code });
  }
});

test('both C020 profiles produce repeatable but distinctly identified immutable streams', () => {
  for (const profileId of ['synthetic-001', 'synthetic-002']) {
    const first = getLog({ profileId, version: 'r1' });
    const second = getLog({ profileId, version: 'r1' });
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.throws(() => { first[0].payload.profile.preferences.topics.push('forged'); }, TypeError);
    assert.deepEqual(first[0], expectedEvent(profileId, 1));
  }
  assert.notEqual(eventId('synthetic-001', 1), eventId('synthetic-002', 1));
});

test('initial, received-only and accepted-without-tail states remain unknown, not verified', () => {
  const session = new CursorSession(request.profileId);
  assert.equal(session.snapshot().outcome, 'unknown');
  assert.throws(() => session.acceptNext(), { code: 'ACCEPTANCE_BLOCKED' });
  session.begin();
  session.opened();
  assert.throws(() => session.begin(), { code: 'STREAM_ALREADY_OPEN' });
  assert.throws(() => session.acceptNext(), { code: 'NO_PENDING_EVENT' });
  for (const event of getLog(request)) {
    session.receive({ id: event.id, data: JSON.stringify(event) });
    assert.equal(session.snapshot().outcome, 'unknown');
    session.acceptNext();
  }
  assert.equal(session.snapshot().acceptedSequence, 6);
  assert.equal(session.snapshot().outcome, 'unknown');
  assert.equal(session.tail(JSON.stringify(tailFor(request.profileId))).tailVerified, true);
  assert.equal(session.snapshot().outcome, 'verified-local');
  assert.equal(session.snapshot().transportOpen, true, 'A verified suffix is not an ended HTTP response.');
  session.disconnect();
  assert.equal(session.begin(), eventId(request.profileId, 6));
  session.opened();
  session.tail(JSON.stringify(tailFor(request.profileId)));
  assert.equal(session.snapshot().outcome, 'verified-local');
  assert.equal(session.snapshot().acceptedEvents.length, 6);
});

for (const [name, events, code] of [
  ['gap', [3], 'EVENT_GAP'],
  ['duplicate of accepted event', [1], 'DUPLICATE_EVENT'],
  ['duplicate pending event', [2, 2], 'DUPLICATE_EVENT']
]) {
  test(`${name} fails closed and never changes the already accepted cursor`, () => {
    const session = new CursorSession(request.profileId);
    session.begin();
    session.opened();
    const first = expectedEvent(request.profileId, 1);
    session.receive({ id: first.id, data: JSON.stringify(first) });
    session.acceptNext();
    const accepted = session.snapshot();
    for (const sequence of events) {
      const event = expectedEvent(request.profileId, sequence);
      session.receive({ id: event.id, data: JSON.stringify(event) });
    }
    const failed = session.snapshot();
    assert.equal(failed.outcome, 'error');
    assert.equal(failed.error.code, code);
    assert.equal(failed.acceptedCursor, first.id);
    assert.equal(failed.acceptedSequence, 1);
    assert.throws(() => session.acceptNext(), { code: 'ACCEPTANCE_BLOCKED' });
    assert.equal(session.begin(), first.id);
    assert.ok(session.snapshot().transitions.some((transition) => transition.code === code));
    assert.deepEqual(accepted.acceptedEvents, [first], 'Earlier snapshots cannot be retroactively changed.');
  });
}

for (const [name, mutate] of [
  ['changed C020 business data', (event) => { event.payload.profile.preferences.theme = 'forged'; }],
  ['changed implementation stamp', (event) => { event.payload.stamp.implementationVersion = '24-certified'; }],
  ['changed deployment stamp', (event) => { event.payload.stamp.deploymentStamp = 'native-Azure'; }],
  ['missing lineage', (event) => { delete event.payload.stamp; }],
  ['unknown contract', (event) => { event.eventContract = 'future/2'; }],
  ['unknown stream version', (event) => { event.streamVersion = 'r2'; }],
  ['unknown event kind', (event) => { event.kind = 'success'; }],
  ['extra payload field', (event) => { event.payload.extra = true; }]
]) {
  test(`received ${name} is rejected rather than healthy by default`, () => {
    const event = structuredClone(expectedEvent(request.profileId, 1));
    mutate(event);
    const session = new CursorSession(request.profileId);
    session.begin();
    session.opened();
    assert.equal(session.receive({ id: event.id, data: JSON.stringify(event) }).queued, false);
    const observed = session.snapshot();
    assert.equal(observed.error.code, 'EVENT_PAYLOAD_MISMATCH');
    assert.equal(observed.acceptedCursor, 'START');
    assert.equal(observed.receivedCursor, event.id);
    assert.equal(observed.receipts[0].disposition, 'rejected');
    assert.equal(Object.isFrozen(observed.receipts[0]), true);
  });
}

test('invalid JSON, IDs, JSON sequences and bounded event data have typed rejection outcomes', () => {
  const first = expectedEvent(request.profileId, 1);
  for (const [id, data, code] of [
    [first.id, '{', 'INVALID_JSON'],
    [first.id, 'null', 'INVALID_EVENT'],
    [first.id, '[]', 'INVALID_EVENT'],
    [eventId(request.profileId, 2), JSON.stringify(first), 'EVENT_ID_MISMATCH'],
    ['START', JSON.stringify(first), 'EVENT_ID_MISMATCH'],
    ['C027:r1:synthetic-001:999999', JSON.stringify(first), 'FUTURE_CURSOR'],
    [first.id, ' '.repeat(16385), 'INVALID_EVENT']
  ]) {
    assert.throws(() => validateEvent(id, data, request.profileId), { code });
  }
});

test('tail validation cannot conceal gaps, duplicates, malformed metadata or stream loss', () => {
  for (const data of ['{', '{}', JSON.stringify({ ...tailFor(request.profileId), total: 7 }), ' '.repeat(1025)]) {
    const session = new CursorSession(request.profileId);
    session.begin();
    session.opened();
    assert.equal(session.tail(data).tailVerified, undefined);
    assert.equal(session.snapshot().error.code, 'INVALID_TAIL');
    assert.equal(session.snapshot().outcome, 'error');
  }
  const session = new CursorSession(request.profileId);
  session.begin();
  session.opened();
  session.tail(JSON.stringify(tailFor(request.profileId)));
  assert.equal(session.snapshot().error.code, 'INCOMPLETE_SUFFIX');
  assert.equal(session.snapshot().acceptedSequence, 0);
});

test('a transport error retains the accepted prefix and receipts, clears pending and remains unknown', () => {
  const session = new CursorSession(request.profileId);
  session.begin();
  session.opened();
  for (const event of getLog(request).slice(0, 3)) session.receive({ id: event.id, data: JSON.stringify(event) });
  session.acceptNext();
  session.interrupt();
  const observed = session.snapshot();
  assert.equal(observed.error.code, 'TRANSPORT_INTERRUPTED');
  assert.equal(observed.outcome, 'unknown');
  assert.equal(observed.receivedCursor, eventId(request.profileId, 3));
  assert.equal(observed.acceptedCursor, eventId(request.profileId, 1));
  assert.deepEqual(observed.pendingSequences, []);
  assert.equal(observed.receipts.length, 3);
  assert.equal(session.begin(), eventId(request.profileId, 1));
});

test('strict fixture requests reject missing, extra, accessor, unknown-profile and unknown-version inputs', () => {
  let getterCalls = 0;
  const getter = { profileId: 'synthetic-001', get version() { getterCalls++; return 'r1'; } };
  for (const input of [undefined, null, [], {}, { ...request, after: 'START' }, getter, Object.create(request)]) {
    assert.throws(() => getLog(input), { code: 'INVALID_REQUEST' });
  }
  assert.equal(getterCalls, 0);
  assert.throws(() => getLog({ profileId: 'synthetic-999', version: 'r1' }), { code: 'UNKNOWN_PROFILE' });
  assert.throws(() => getLog({ profileId: 'synthetic-001', version: 'r2' }), { code: 'UNKNOWN_VERSION' });
  assert.throws(() => new CursorSession(''), { code: 'INVALID_PROFILE_ID' });
});

test('local attempts are bounded; reset must be explicit, not a silent retry loop', () => {
  const session = new CursorSession(request.profileId);
  for (let index = 0; index < MAX_ATTEMPTS; index++) {
    assert.equal(session.begin(), 'START');
    session.disconnect();
  }
  assert.throws(() => session.begin(), { code: 'ATTEMPT_LIMIT' });
  assert.equal(session.snapshot().attempts.length, 8);
  assert.equal(session.snapshot().acceptedSequence, 0);
});
