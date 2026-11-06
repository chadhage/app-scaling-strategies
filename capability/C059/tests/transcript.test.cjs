'use strict';

// The server-produced transcript: produced over real sockets, served as /transcript.json, and accepted only when every envelope
// validates with the page's own rules. A tampered transcript is rejected BY NAME.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, startService } = require('./net.cjs');
const { REQUIRED_CODES, produceTranscript, verifyTranscript } = require('../transcript.cjs');

const OPTIONS = { timeout: 60000 };
const clone = (value) => JSON.parse(JSON.stringify(value));
let produced;
const transcript = async () => { produced ??= await produceTranscript(); return clone(produced); };

test('the service produces a transcript of its own POST journey and the checker accepts it with the required evidence', OPTIONS, async () => {
  const made = await transcript();
  const verdict = verifyTranscript(made);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.deepEqual(verdict.summary.outcomes, ['cancelled', 'interrupted', 'rejected', 'succeeded', 'unknown', 'unsupported']);
  assert.ok(verdict.summary.replays >= 1 && verdict.summary.aborts >= 2 && verdict.summary.effects >= 3);
  for (const code of REQUIRED_CODES) assert.ok(verdict.summary.codes.includes(code), code);
  assert.ok(made.events.some((event) => event.kind === 'note' && /restarted/.test(event.note)));
  assert.ok(made.events.filter((event) => event.kind === 'exchange' && event.request.method === 'POST').length >= 8, 'POST actions are in the transcript');
});

test('GET /transcript.json serves the transcript once for concurrent requests and a failure is retried', OPTIONS, async () => {
  let builds = 0;
  const service = await startService({ transcript: async () => { builds += 1; return transcript(); } });
  try {
    const [a, b] = await Promise.all([call(service.port, 'GET', '/transcript.json'), call(service.port, 'GET', '/transcript.json')]);
    assert.equal(a.status, 200);
    assert.deepEqual(a.json, b.json);
    assert.equal(builds, 1);
    assert.equal(verifyTranscript(a.json).ok, true);
  } finally {
    await service.stop();
  }
  let attempts = 0;
  const flaky = await startService({ transcript: async () => { attempts += 1; if (attempts === 1) throw new Error('boom'); return transcript(); } });
  try {
    const first = await call(flaky.port, 'GET', '/transcript.json');
    assert.equal(first.status, 500);
    assert.equal(first.json.error.code, 'TRANSCRIPT_UNAVAILABLE');
    assert.equal((await call(flaky.port, 'GET', '/transcript.json')).status, 200);
  } finally {
    await flaky.stop();
  }
});

const find = (made, test_) => made.events.find(test_);
const TAMPERS = [
  ['the wrong kind', (made) => { made.kind = 'C042-server-transcript'; }, 'TRANSCRIPT_SHAPE'],
  ['no events', (made) => { made.events = []; }, 'TRANSCRIPT_SHAPE'],
  ['a gap in the sequence', (made) => { made.events[3].n = 99; }, 'SEQUENCE_GAP'],
  ['an unknown event kind', (made) => { made.events[1].kind = 'magic'; }, 'EVENT_SHAPE'],
  ['an exchange without a response', (made) => { find(made, (event) => event.kind === 'exchange').response = null; }, 'EVENT_SHAPE'],
  ['an envelope with prose added', (made) => { find(made, (event) => event.kind === 'exchange' && event.response.body.kind === 'C042-step-result').response.body.prose = 'trust me'; }, 'ENVELOPE_INVALID'],
  ['a success claimed with a 500 status', (made) => { find(made, (event) => event.kind === 'exchange' && event.response.status === 201).response.status = 500; }, 'STATUS_CONTRADICTS_ENVELOPE'],
  ['a second commit for one key', (made) => {
    const ok = made.events.filter((event) => event.kind === 'exchange' && event.response.body.trail?.some((item) => item.type === 'commit'));
    const later = ok.find((event) => event.request.method === 'GET');
    later.response.body.trail[later.response.body.trail.length - 1].seq += 5;
  }, 'SECOND_EFFECT'],
  ['a ledger that disagrees with the effects', (made) => { find(made, (event) => event.kind === 'exchange' && event.response.body.kind === 'C042-lease-snapshot').response.body.leases['synthetic-lease-001'].committed += 1; }, 'LEDGER_MISMATCH'],
  ['the aborted clients removed', (made) => { made.events = made.events.filter((event) => event.kind !== 'abort'); made.events.forEach((event, index) => { event.n = index + 1; }); }, 'MISSING_EVIDENCE'],
];

for (const [name, change, code] of TAMPERS) {
  test(`a tampered transcript (${name}) is rejected as ${code}`, OPTIONS, async () => {
    const made = await transcript();
    change(made);
    const verdict = verifyTranscript(made);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, code, verdict.message);
  });
}

test('a transcript that is not an object at all is rejected', OPTIONS, () => {
  for (const value of [null, undefined, 5, 'x', [], {}]) assert.equal(verifyTranscript(value).code, 'TRANSCRIPT_SHAPE');
});
