'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { runPage } = require('./dom-stub.cjs');
const { produceLocalTranscript } = require('../server.cjs');

// page.js runs in its own vm realm; compare plain data only.
const plain = (value) => JSON.parse(JSON.stringify(value));
const FAILURES = ['ACK_OUT_OF_ORDER', 'ACK_UNSENT', 'CLIENT_SEQUENCE_FORBIDDEN', 'CURSOR_FOREIGN_SESSION', 'CURSOR_FROM_FUTURE'];
let cached;
async function realTranscript() {
  cached ??= await produceLocalTranscript();
  return structuredClone(cached);
}
const renumber = (transcript) => { transcript.events.forEach((event, index) => { event.n = index + 1; }); return transcript; };
const received = (transcript, type, conn) => transcript.events.find((event) => event.dir === 'recv' && event.frame.type === type && (conn === undefined || event.conn === conn));
const redelivery = (transcript, conn) => transcript.events.find((event) => event.conn === conn && event.dir === 'recv' && event.frame.redelivered === true);
const verifier = () => runPage({ fetch: async () => { throw new Error('this test never fetches'); } }).context.C026Transcript.verify;

test('a transcript produced by a real conversation verifies with exact counts', async () => {
  const transcript = await realTranscript();
  const verdict = plain(verifier()(transcript));
  assert.deepEqual(verdict, {
    verified: true, sessions: 4, events: transcript.events.length, firstDeliveries: 15, redeliveries: 6, acknowledgements: 6,
    resumes: 2, aborts: 1, completes: 1, typedFailures: FAILURES
  });
});

test('the page exposes its required failure list and nothing writable', () => {
  const { context } = runPage({ fetch: async () => { throw new Error('unused'); } });
  assert.deepEqual(plain(context.C026Transcript.REQUIRED_FAILURES), FAILURES);
  assert.equal(Object.isFrozen(context.C026Transcript), true);
  assert.throws(() => Object.defineProperty(context, 'C026Transcript', { value: 1 }), TypeError);
});

test('every kind of damage to the transcript is rejected with its own code', async () => {
  const mutations = [
    ['a missing event', (t) => { t.events.splice(5, 1); }, 'EVENT_MALFORMED'],
    ['an unknown direction', (t) => { t.events[2].dir = 'teleport'; }, 'EVENT_MALFORMED'],
    ['a connection that is not text', (t) => { t.events[2].conn = 7; }, 'EVENT_MALFORMED'],
    ['an event that is not an object', (t) => { t.events[2] = 'x'; }, 'EVENT_MALFORMED'],
    ['a frame that is not an object', (t) => { received(t, 'welcome').frame = 'welcome'; }, 'FRAME_MALFORMED'],
    ['a frame without a type', (t) => { delete received(t, 'welcome').frame.type; }, 'FRAME_MALFORMED'],
    ['an unknown frame type', (t) => { received(t, 'welcome').frame.type = 'surprise'; }, 'FRAME_TYPE_UNKNOWN'],
    ['a gap in the first deliveries', (t) => { received(t, 'message', 'A1').frame.seq = 2; }, 'SEQUENCE_GAP_OR_DUPLICATE'],
    ['a first delivery counted twice', (t) => { received(t, 'message', 'A1').frame.deliveries = 2; }, 'SEQUENCE_GAP_OR_DUPLICATE'],
    ['a message of no session', (t) => { received(t, 'message', 'A1').frame.session = 'S-Z'; }, 'MESSAGE_SESSION_UNKNOWN'],
    ['a fractional sequence', (t) => { received(t, 'message', 'A1').frame.seq = 1.5; }, 'MESSAGE_SESSION_UNKNOWN'],
    ['an acknowledged message delivered again', (t) => { redelivery(t, 'A2').frame.seq = 1; }, 'REDELIVERY_INVALID'],
    ['a message redelivered that was never delivered', (t) => { redelivery(t, 'A2').frame.seq = 9; }, 'REDELIVERY_INVALID'],
    ['a redelivery that claims one delivery', (t) => { redelivery(t, 'A2').frame.deliveries = 1; }, 'REDELIVERY_INVALID'],
    ['a redelivered flag that is not a boolean', (t) => { redelivery(t, 'A2').frame.redelivered = 'yes'; }, 'REDELIVERY_INVALID'],
    ['a redelivery repeated on one connection', (t) => {
      const index = t.events.indexOf(redelivery(t, 'A2'));
      t.events.splice(index + 1, 0, structuredClone(t.events[index]));
      renumber(t);
    }, 'REDELIVERY_INVALID'],
    ['an acknowledgement without a usable cursor', (t) => { received(t, 'acked').frame.cursor = 'garbage'; }, 'ACK_CURSOR_INVALID'],
    ['an acknowledgement without a cursor', (t) => { delete received(t, 'acked').frame.cursor; }, 'ACK_CURSOR_INVALID'],
    ['an acknowledgement of a session nobody opened', (t) => { received(t, 'acked').frame.cursor = 'c1.S-Z.1'; }, 'ACK_CURSOR_INVALID'],
    ['an acknowledgement different from its cursor', (t) => { received(t, 'acked').frame.seq = 2; }, 'ACK_CURSOR_INVALID'],
    ['an acknowledgement of a message never sent', (t) => { Object.assign(received(t, 'acked').frame, { seq: 5, cursor: 'c1.S-A.5' }); }, 'ACK_FOR_UNSENT'],
    ['an acknowledgement that skips', (t) => { Object.assign(received(t, 'acked').frame, { seq: 2, cursor: 'c1.S-A.2' }); }, 'ACK_OUT_OF_ORDER'],
    ['a resume at another position', (t) => { received(t, 'resumed').frame.ackedThrough = 1; }, 'RESUME_POSITION_MISMATCH'],
    ['a resume with another last sent', (t) => { received(t, 'resumed').frame.lastSent = 9; }, 'RESUME_POSITION_MISMATCH'],
    ['a resume of an unknown session', (t) => { received(t, 'resumed').frame.session = 'S-Z'; }, 'RESUME_POSITION_MISMATCH'],
    ['a completion before everything was acknowledged', (t) => { received(t, 'complete').frame.through = 5; }, 'COMPLETE_BEFORE_ALL_ACKNOWLEDGED'],
    ['a completion of an unknown session', (t) => { received(t, 'complete').frame.session = 'S-Z'; }, 'COMPLETE_BEFORE_ALL_ACKNOWLEDGED']
  ];
  const verify = verifier();
  for (const [name, mutate, code] of mutations) {
    const transcript = await realTranscript();
    mutate(transcript);
    const verdict = plain(verify(transcript));
    assert.equal(verdict.verified, false, name);
    assert.equal(verdict.code, code, name);
    assert.equal(typeof verdict.at, 'number', name);
  }
});

test('a transcript that lacks required evidence is rejected, naming what is missing', async () => {
  const removals = [
    ['abrupt disconnect', (event) => event.dir === 'abort'],
    ['resume', (event) => event.dir === 'recv' && event.frame.type === 'resumed'],
    ['redelivery', (event) => event.dir === 'recv' && event.frame.redelivered === true],
    ['completion', (event) => event.dir === 'recv' && event.frame.type === 'complete'],
    ['CLIENT_SEQUENCE_FORBIDDEN', (event) => event.dir === 'recv' && event.frame.code === 'CLIENT_SEQUENCE_FORBIDDEN'],
    ['ACK_UNSENT', (event) => event.dir === 'recv' && event.frame.code === 'ACK_UNSENT']
  ];
  const verify = verifier();
  for (const [label, predicate] of removals) {
    const transcript = await realTranscript();
    transcript.events = transcript.events.filter((event) => !predicate(event));
    renumber(transcript);
    const verdict = plain(verify(transcript));
    assert.equal(verdict.verified, false, label);
    assert.equal(verdict.code, 'EXPECTED_EVIDENCE_MISSING', label);
    assert.equal(verdict.message.includes(label), true, `${label}: ${verdict.message}`);
    assert.equal(verdict.at, null);
  }
});

test('input that is not a transcript is rejected, never defaulted', () => {
  const verify = verifier();
  for (const value of [undefined, null, 'text', 7, [], {}, { events: 'x' }, { events: [] }]) {
    const verdict = plain(verify(value));
    assert.deepEqual([verdict.verified, verdict.code, verdict.at], [false, 'TRANSCRIPT_MALFORMED', null], JSON.stringify(value));
  }
});

test('the page shows a verified transcript completely and re-enables its button', async () => {
  const transcript = await realTranscript();
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { document } = runPage({
    fetch: async (url, options) => { calls.push([url, plain(options)]); await gate; return { ok: true, status: 200, json: async () => structuredClone(transcript) }; }
  });
  const load = document.element('load');
  assert.equal(load.disabled, false);
  const clicking = load.click();
  assert.equal(load.disabled, true);
  assert.match(document.element('status').textContent, /^Pending — fetching/);
  release();
  await clicking;
  assert.equal(load.disabled, false);
  assert.deepEqual(calls, [['/transcript.json', { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error' }]]);
  const status = document.element('status').textContent;
  assert.match(status, /^VERIFIED LOCAL TRANSCRIPT — 4 sessions, 15 first deliveries, 6 redeliveries, 5 typed failures\./);
  assert.match(status, /The browser observed this transcript, not a WebSocket\.$/);
  const rows = document.element('events').children;
  assert.equal(rows.length, transcript.events.length);
  rows.forEach((row, index) => {
    const event = transcript.events[index];
    assert.equal(row.tagName, 'tr');
    assert.equal(row.className, `dir-${event.dir}`);
    assert.deepEqual(row.children.map((cell) => cell.tagName), ['td', 'td', 'td', 'td']);
    assert.equal(row.children[0].textContent, String(event.n));
    assert.equal(row.children[1].textContent, event.conn);
  });
  const cell = (predicate) => rows[transcript.events.findIndex(predicate)].children;
  assert.equal(cell((event) => event.dir === 'open')[3].textContent, '');
  assert.equal(cell((event) => event.dir === 'abort')[2].textContent, 'client destroys the socket, no close frame');
  assert.equal(cell((event) => event.dir === 'close-send')[3].textContent, '1000');
  assert.equal(cell((event) => event.dir === 'close-recv' && event.conn === 'A2')[3].textContent, '1000 COMPLETE');
  assert.equal(cell((event) => event.dir === 'recv' && event.frame.redelivered === true)[3].textContent.includes('"redelivered":true'), true);
  assert.deepEqual(JSON.parse(document.element('summary').textContent).typedFailures, FAILURES);
});

test('damaged, missing or unavailable transcripts are REJECTED and clear what was shown before', async () => {
  const good = await realTranscript();
  const bad = await realTranscript();
  received(bad, 'message', 'A1').frame.seq = 2;
  let answer = { ok: true, status: 200, json: async () => structuredClone(good) };
  const { document } = runPage({ fetch: async () => answer });
  const load = document.element('load');
  await load.click();
  assert.equal(document.element('events').children.length, good.events.length);
  const rejections = [
    [{ ok: true, status: 200, json: async () => structuredClone(bad) }, /^REJECTED — SEQUENCE_GAP_OR_DUPLICATE: .* \(event \d+\)$/],
    [{ ok: true, status: 200, json: async () => ({}) }, /^REJECTED — TRANSCRIPT_MALFORMED: The transcript has no events\.$/],
    [{ ok: false, status: 500, json: async () => ({}) }, /^REJECTED — HTTP_500: the server produced no transcript\.$/],
    [{ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }, /^REJECTED — TRANSCRIPT_UNAVAILABLE/]
  ];
  for (const [next, pattern] of rejections) {
    answer = { ok: true, status: 200, json: async () => structuredClone(good) };
    await load.click();
    assert.equal(document.element('events').children.length, good.events.length);
    answer = next;
    await load.click();
    assert.match(document.element('status').textContent, pattern);
    assert.equal(document.element('events').children.length, 0);
    assert.equal(document.element('summary').textContent, 'No verified transcript.');
    assert.equal(load.disabled, false);
  }
  answer = null;
  await load.click();
  assert.match(document.element('status').textContent, /^REJECTED — TRANSCRIPT_UNAVAILABLE/);
});

test('a click that arrives while a load is running is ignored', async () => {
  let fetches = 0;
  const { document } = runPage({ fetch: async () => { fetches += 1; return { ok: false, status: 503, json: async () => ({}) }; } });
  const load = document.element('load');
  load.disabled = true;
  await load.forceClick();
  assert.equal(fetches, 0);
  load.disabled = false;
  await load.click();
  assert.equal(fetches, 1);
});
