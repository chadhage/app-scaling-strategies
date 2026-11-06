'use strict';

// Unit tests of timeline.js: every refusal, every mark, every limit, the fold identity and the typed NOT_RECORDED answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const Reducer = require('..\\..\\C044\\reducer.js');
const saved = require('..\\saved.js');

const find = (id) => saved.runs.find((run) => run.id === id);
const built = (id, model = T) => { const timeline = model.build(find(id)); assert.equal(timeline.ok, true, id); return timeline; };
const fold = (entries, last) => entries.slice(0, last + 1).reduce((state, entry) => Reducer.reduce(state, entry), Reducer.initial());
const run = (patch) => ({ ...find('c044-complete'), ...patch });
const zero = { applied: 0, duplicates: 0, outOfOrder: 0, rejected: 0, reconnects: 0, disconnects: 0, resyncs: 0 };
const fake = (reduce) => ({ initial: () => ({ counts: { ...zero }, dropped: [], gaps: [], epochChanges: [], failure: null, completed: false, lastId: null }), reduce });

test('the saved set holds ten runs: console sessions, accepted traces and hostile sets', () => {
  assert.deepEqual(saved.runs.map((entry) => `${entry.kind}:${entry.id}`), [
    'console:c044-restart-gap', 'console:c044-complete', 'console:c044-truncated', 'console:c044-hostile-mix', 'trace:c034-closed-history',
    'trace:c034-held-snapshot', 'trace:c034-reordered', 'trace:c034-truncated', 'trace:c034-tampered', 'trace:c034-unknown-code']);
  assert.equal(Object.isFrozen(saved.runs[0].entries[3]), true);
  assert.equal(T.FORMAT, 'X001-saved-run/1');
});

test('every position of every console run is the C044 reducer fold, deeply frozen, with the producing entry', () => {
  for (const entry of saved.runs.filter((item) => item.kind === 'console')) {
    const timeline = built(entry.id);
    for (let i = 0; i < timeline.length; i++) {
      const answer = timeline.stateAt(i);
      assert.deepStrictEqual(answer.state, fold(entry.entries, i));
      assert.equal(answer.entry, entry.entries[i]);
      assert.equal(Object.isFrozen(answer.state.counts), true);
      assert.equal(Object.isFrozen(answer), true);
    }
  }
});

test('every mark of the hostile mix and the restart run is derived from what the reducer did', () => {
  const mix = built('c044-hostile-mix');
  const tail = mix.stateAt(mix.length - 1);
  assert.equal(tail.tallies.byMark.applied, 10);
  assert.equal(tail.tallies.byMark.duplicate, 2);
  assert.equal(tail.tallies.byMark['out-of-order'], 2);
  assert.equal(tail.tallies.byMark.rejected, 3);
  assert.equal(tail.tallies.byMark['unknown-event'], 1);
  assert.equal(tail.tallies.byMark['unknown-entry'], 1);
  assert.equal(tail.tallies.byMark['failure-unrecognized'], 1);
  assert.equal(tail.tallies.byMark.control, 5);
  assert.equal(mix.limits.status, 'INCOMPLETE');
  assert.deepEqual(mix.limits.failed.map((item) => item.detail), ['attribution-mismatch', 'malformed-id', 'foreign-run']);
  assert.deepEqual(mix.limits.unknown.map((item) => item.mark), ['unknown-event', 'unknown-entry', 'failure-unrecognized']);
  assert.equal(mix.limits.duplicates.length, 2);
  assert.equal(mix.limits.outOfOrder.length, 2);
  const restart = built('c044-restart-gap');
  const final = restart.stateAt(restart.length - 1);
  assert.deepEqual([final.tallies.gaps, final.tallies.epochChanges, final.tallies.failed, final.tallies.unknown], [1, 1, 2, 0]);
  assert.equal(restart.marks.filter((mark) => mark === 'no-effect').length, 0);
});

test('a session action that changes nothing is recorded as no-effect, never as progress', () => {
  const timeline = T.build(run({ id: 'x', entries: [{ type: 'resync' }, { type: 'open' }, { type: 'open' }, { type: 'stop' }, { type: 'open' }] }));
  assert.deepEqual(timeline.marks, ['no-effect', 'control', 'control', 'control', 'no-effect']);
  assert.equal(timeline.limits.epochs.length, 0);
  assert.equal(timeline.limits.status, 'INCOMPLETE');
});

test('non-object and unknown entries are UNKNOWN positions that change nothing', () => {
  const timeline = T.build(run({ id: 'x', entries: [null, 7, 'text', [1], { type: 'teleport' }, { type: 'constructor' }, { type: 'open' }] }));
  assert.deepEqual(timeline.marks, ['unknown-entry', 'unknown-entry', 'unknown-entry', 'unknown-entry', 'unknown-entry', 'unknown-entry', 'control']);
  assert.equal(timeline.stateAt(5).state, timeline.stateAt(4).state);
  assert.equal(timeline.stateAt(6).tallies.unknown, 6);
});

test('stateAt answers NOT_RECORDED for every non-position and never carries a state', () => {
  const timeline = built('c044-complete');
  for (const bad of [-1, timeline.length, 1e9, NaN, 1.5, '0', null, undefined, Infinity, {}, [], true, 2 ** 53]) {
    const answer = timeline.stateAt(bad);
    assert.deepEqual([answer.ok, answer.code, answer.reason, 'state' in answer], [false, 'NOT_RECORDED', 'outside-recording', false]);
    assert.deepEqual(answer.range, { from: 1, to: timeline.length });
  }
  assert.equal(T.stateAt(timeline, 0).ok, true);
  assert.deepEqual([T.stateAt(null, 0).code, T.stateAt({ ok: false }, 0).code, T.locate(null, 1, 1).code, T.locate({}, 1, 1).code], Array(4).fill('TIMELINE_REQUIRED'));
});

test('locate separates a gap, before, after, an unknown epoch and an invalid sequence, and finds recorded ones', () => {
  const timeline = built('c044-restart-gap');
  assert.deepEqual(T.locate(timeline, 1, 10).range, { from: 10, to: 12 });
  assert.deepEqual(T.locate(timeline, 1, 12).range, { from: 10, to: 12 });
  assert.deepEqual([T.locate(timeline, 1, 9).ok, T.locate(timeline, 1, 13).ok, T.locate(timeline, 2, 8).ok], [true, true, true]);
  assert.equal(T.locate(timeline, 2, 9).reason, 'after-recorded');
  assert.deepEqual(T.locate(timeline, 2, 9).range, { from: 9, to: 22 });
  for (const [epoch, seq] of [[1, 0], [1, -3], [1, 1.5], [1.5, 1], ['1', 1], [1, '1'], [NaN, 1]]) assert.equal(T.locate(timeline, epoch, seq).reason, 'invalid-sequence');
  assert.equal(T.locate(timeline, 3, 1).reason, 'unknown-epoch');
  const applied = timeline.entries.map((entry, index) => [entry, index]).filter(([entry]) => entry.type === 'event');
  for (const [, index] of applied) {
    const answer = timeline.stateAt(index);
    if (answer.mark !== 'applied') continue;
    assert.equal(T.locate(timeline, answer.state.epoch, answer.state.lastSeq).index, index);
  }
  const mid = T.build(run({ id: 'x', entries: find('c044-complete').entries.slice(0, 2).concat(find('c044-complete').entries.slice(6, 9)) }));
  assert.equal(mid.limits.status, 'INCOMPLETE');
  assert.equal(T.locate(mid, 1, 3).reason, 'before-recorded');
  assert.deepEqual(T.locate(mid, 1, 3).range, { from: 1, to: 4 });
});
test('the accepted C034 traces fold per attempt and agree with the accepted decoder', () => {
  const decoder = require('..\\..\\C034\\trace.js');
  const closed = built('c034-closed-history');
  assert.equal(closed.length, 43);
  assert.equal(closed.limits.status, 'COMPLETE');
  const verdict = decoder.validateSnapshot(find('c034-closed-history').snapshot);
  assert.deepEqual(closed.limits.attempts.map((a) => [a.attemptId, a.classification, a.requests, a.responses]),
    verdict.attempts.map((a) => [a.attemptId, a.classification, a.requests, a.responses]));
  assert.deepEqual(closed.stateAt(42).state.attempts.map((a) => a.phase), ['observed', 'observed', 'observed', 'failed', 'unknown', 'unknown']);
  assert.equal(closed.stateAt(42).state.attempts.every((a) => a.reset), true);
  assert.equal(closed.stateAt(1).state.attempts[0].phase, 'paused');
  assert.deepEqual([closed.limits.failed.length, closed.limits.unknown.length], [1, 2]);
  assert.deepEqual(closed.limits.failed.map((item) => item.mark), ['failed']);
  const held = built('c034-held-snapshot');
  assert.equal(held.limits.status, 'INCOMPLETE');
  assert.deepEqual(held.limits.attempts.map((a) => [a.classification, a.endPosition]), [['observed-local-segment', 8], ['partial-unknown', null]]);
  assert.deepEqual(closed.hits.gap.concat(closed.hits.epoch), []);
  assert.equal(T.locate(closed, 1, 1).reason, 'unknown-epoch');
});

test('a hostile C034 trace is refused with the decoder code, a malformed one with its own typed code', () => {
  for (const [id, code] of [['c034-reordered', 'BOUNDARY_ACTION_ORDER'], ['c034-truncated', 'MISSING_OR_DUPLICATE_ORIGINAL'],
    ['c034-tampered', 'ORIGINAL_ELAPSED_MISMATCH'], ['c034-unknown-code', 'UNKNOWN_ACTION']]) {
    const refused = T.build(find(id));
    assert.deepEqual([refused.ok, refused.code, refused.detail, 'entries' in refused], [false, 'DECODER_REFUSED', code, false]);
  }
  const trace = find('c034-closed-history');
  for (const [patch, code] of [[{ snapshot: null }, 'ENTRIES_REQUIRED'], [{ snapshot: { events: [] } }, 'ENTRIES_REQUIRED'], [{ snapshot: { events: 'x' } }, 'ENTRIES_REQUIRED'],
    [{ snapshot: { events: new Array(501).fill({}) } }, 'TOO_MANY_ENTRIES']]) assert.equal(T.build({ ...trace, ...patch }).code, code);
});

test('a decoder that is missing or disagrees makes the trace refuse instead of guessing', () => {
  const trace = find('c034-held-snapshot');
  for (const deps of [{ trace: null }, { trace: {} }, { trace: { validateSnapshot: 7 } }]) assert.equal(T.using(deps).build(trace).code, 'DECODER_UNAVAILABLE');
  const events = [{ code: 'ORIGINAL_ATTEMPT_STARTED', attemptId: 'a1' }, { code: 'ACTUAL_READ_STARTED', attemptId: 'a1' }];
  const attempt = { attemptId: 'a1', classification: 'partial-unknown', requests: 1, responses: 0 };
  const decoded = (attempts) => T.using({ trace: { validateSnapshot: () => ({ valid: true, attempts }) } }).build({ ...trace, snapshot: { events } });
  assert.equal(decoded([attempt]).ok, true);
  for (const bad of [[], [{ ...attempt, attemptId: 'a2' }], [{ ...attempt, requests: 2 }], [{ ...attempt, responses: 1 }], [{ ...attempt, classification: 'observed-local-segment' }]]) {
    assert.equal(decoded(bad).code, 'DECODER_DISAGREES');
  }
});

test('unknown action codes, non-objects and events of an attempt that never started are UNKNOWN trace positions', () => {
  const events = [{ code: 'ORIGINAL_ATTEMPT_STARTED', attemptId: 'a1' }, { code: 'ACTUAL_READ_STARTED', attemptId: 'a1' }, { code: 'ACTUAL_READ_ACKNOWLEDGED', attemptId: 'a1' },
    { code: 'BOUNDARY_HELD', attemptId: 'a1' }, { code: 'RESUME_ORIGINAL_ATTEMPT', attemptId: 'a1' }, { code: 'TWO_READ_LOCAL_SEGMENT_OBSERVED', attemptId: 'a1' },
    { code: 'constructor', attemptId: 'a1' }, { code: 7, attemptId: 'a1' }, null, { code: 'ACTUAL_READ_STARTED', attemptId: 'ghost' },
    { code: 'RESET_VIEW_HISTORY_RETAINED', attemptId: 'a1' }];
  const attempts = [{ attemptId: 'a1', classification: 'observed-local-segment', requests: 1, responses: 1 }];
  const timeline = T.using({ trace: { validateSnapshot: () => ({ valid: true, attempts }) } }).build({ ...find('c034-held-snapshot'), snapshot: { events } });
  assert.deepEqual(timeline.marks, ['started', 'read-started', 'read-acknowledged', 'held', 'resumed', 'observed', 'unknown-code', 'unknown-code', 'unknown-code', 'unknown-code', 'reset']);
  assert.equal(timeline.stateAt(9).state, timeline.stateAt(8).state);
  assert.equal(timeline.limits.unknown.length, 4);
  assert.equal(timeline.limits.status, 'COMPLETE');
  const none = T.using({ trace: { validateSnapshot: () => ({ valid: true, attempts: [] }) } }).build({ ...find('c034-held-snapshot'), snapshot: { events: [{ code: 'x', attemptId: 'a' }] } });
  assert.equal(none.limits.status, 'INCOMPLETE');
});

test('the producer and the reducer are the only dependencies: a stuck or odd reducer never yields success', () => {
  const entries = [{ type: 'event', id: 'a', event: 'b', data: {} }];
  assert.equal(T.using({ reducer: fake((state) => state) }).build(run({ id: 'x', entries })).marks[0], 'unknown-entry');
  const rejecting = fake((state) => ({ ...state, counts: { ...state.counts, rejected: 1 }, dropped: [{ display: 'shown' }] }));
  const odd = T.using({ reducer: rejecting }).build(run({ id: 'x', entries }));
  assert.deepEqual([odd.marks[0], odd.stateAt(0).detail], ['rejected', 'shown']);
  assert.equal(T.using({}).build(find('c044-complete')).ok, true);
});

test('producer metadata is optional and checked; without a total nothing after the last event is invented', () => {
  for (const producer of [{ lastSeq: 0, totalSteps: 1, replayWindow: 1 }, { lastSeq: '22', totalSteps: 1, replayWindow: 1 }, 7, [], 'x', { totalSteps: 1, replayWindow: 1 }]) {
    assert.equal(T.build(run({ producer })).code, 'PRODUCER_INVALID');
  }
  const unknownTotal = T.build(run({ producer: undefined }));
  assert.deepEqual([unknownTotal.limits.producer, unknownTotal.limits.status, unknownTotal.limits.epochs[0].total, unknownTotal.limits.epochs[0].complete], [null, 'COMPLETE', null, false]);
  const cut = T.build(run({ producer: null, entries: find('c044-complete').entries.slice(0, 9) }));
  assert.deepEqual([cut.limits.status, cut.limits.notRecorded], ['INCOMPLETE', []]);
  assert.equal(T.locate(cut, 1, 99).range.to, null);
});

test('build refuses a malformed saved run with a typed code and never throws', () => {
  const trace = find('c034-closed-history');
  const cases = [[null, 'SAVED_RUN_REQUIRED'], [[], 'SAVED_RUN_REQUIRED'], ['x', 'SAVED_RUN_REQUIRED'], [{}, 'FORMAT_UNSUPPORTED'], [run({ format: 'x' }), 'FORMAT_UNSUPPORTED'],
    [run({ id: 7 }), 'ID_INVALID'], [run({ id: 'A' }), 'ID_INVALID'], [run({ id: 'a'.repeat(41) }), 'ID_INVALID'], [run({ kind: 'weird' }), 'KIND_UNSUPPORTED'],
    [run({ entries: null }), 'ENTRIES_REQUIRED'], [run({ entries: [] }), 'ENTRIES_REQUIRED'], [run({ entries: new Array(T.MAX_ENTRIES + 1).fill({ type: 'open' }) }), 'TOO_MANY_ENTRIES'],
    [{ ...trace, kind: 'console' }, 'ENTRIES_REQUIRED']];
  for (const [input, code] of cases) assert.deepEqual([T.build(input).ok, T.build(input).code], [false, code], code);
  assert.equal(T.build(run({ title: 7, source: 'x' })).title, 'c044-complete');
  assert.equal(T.build(run({ title: 'x'.repeat(500) })).title.length, 200);
  assert.equal(T.build(run({ source: 'x' })).source, null);
});
test('jumps find the next or previous hit from any integer position and refuse everything else with null', () => {
  const timeline = built('c044-restart-gap');
  const { gap, failure, epoch } = timeline.hits;
  assert.deepEqual([gap.length, failure.length, epoch.length, timeline.hits.unknown.length], [1, 2, 1, 0]);
  assert.equal(T.jump(timeline, -5, 'gap', 1), gap[0]);
  assert.equal(T.jump(timeline, 999, 'gap', -1), gap[0]);
  assert.equal(T.jump(timeline, gap[0], 'gap', 1), null);
  assert.equal(T.jump(timeline, 999, 'failure', 1), null);
  assert.deepEqual([T.jump(timeline, 0, 'epoch', 1), T.jump(timeline, 0, 'unknown', 1)], [epoch[0], null]);
  for (const args of [[null, 0, 'gap', 1], [{}, 0, 'gap', 1], [timeline, 0, 'nope', 1], [timeline, 0, 'gap', 0], [timeline, 0, 'gap', 2], [timeline, 1.5, 'gap', 1],
    [timeline, '1', 'gap', 1], [timeline, 0, '__proto__', 1], [timeline, 0, 'constructor', 1]]) assert.equal(T.jump(...args), null);
  assert.deepEqual(T.JUMPS, ['gap', 'failure', 'unknown', 'epoch']);
});

test('verify recomputes each position from scratch and names the kind of every difference', () => {
  for (const entry of saved.runs.filter((item) => item.kind === 'trace' && !item.source.hostile)) {
    assert.deepEqual([T.verify(entry).ok, T.verify(entry).checked], [true, entry.snapshot.events.length]);
  }
  const base = find('c044-restart-gap');
  const timeline = built('c044-restart-gap');
  const forge = (index, change) => ({ ...timeline, stateAt: (i) => (i === index ? change(timeline.stateAt(i)) : timeline.stateAt(i)) });
  const what = (forged) => T.verify(base, forged).mismatches.map((item) => `${item.index}:${item.what}`);
  assert.deepEqual(what(forge(3, (a) => ({ ...a, state: { ...a.state, connection: 'failed' } }))), ['3:state']);
  assert.deepEqual(what(forge(4, (a) => ({ ...a, mark: 'duplicate' }))), ['4:mark']);
  assert.deepEqual(what(forge(5, (a) => ({ ...a, tallies: { ...a.tallies, failed: 9 } }))), ['5:tallies']);
  assert.deepEqual(what(forge(6, () => ({ ok: false }))), ['6:missing']);
  assert.deepEqual(what({ ...timeline, length: timeline.length + 1 }), ['-1:length']);
  assert.deepEqual([T.verify(null).code, T.verify(find('c034-reordered')).code, T.verify(base, null).code, T.verify(base, {}).code],
    ['SAVED_RUN_REQUIRED', 'DECODER_REFUSED', 'TIMELINE_REQUIRED', 'TIMELINE_REQUIRED']);
  assert.deepEqual(T.verify(base, T.build(find('c044-complete'))).mismatches.length > 0, true);
});

test('a fragment is parsed strictly: every refusal has its own code and nothing hostile is echoed or polluted', () => {
  const ids = ['c044-complete', 'a'];
  const code = (text, list = ids) => T.parseFragment(text, list).code;
  assert.deepEqual([code(7), code(null), code(''), code('#'), code(`#${'x'.repeat(100)}`), code('run=a&pos=1'), code('#run'), code('#run=a=b&pos=1'),
    code('#run=a&pos=1&q=2'), code('#run=a&run=a&pos=1'), code('#pos=1&pos=1'), code('#run=a'), code('#pos=1'), code('#run=nope&pos=1'), code('#run=a&pos=1', 'a'),
    code('#run=A&pos=1'), code('#run=a&pos=0'), code('#run=a&pos=07'), code('#run=a&pos=1234567'), code('#run=a&pos=-1'), code('#run=a&pos=%31'), code('#run=a&pos=')],
  ['FRAGMENT_INVALID', 'FRAGMENT_INVALID', 'FRAGMENT_EMPTY', 'FRAGMENT_EMPTY', 'FRAGMENT_TOO_LONG', 'FRAGMENT_INVALID', 'FRAGMENT_MALFORMED', 'FRAGMENT_MALFORMED',
    'FRAGMENT_UNKNOWN_KEY', 'FRAGMENT_DUPLICATE_KEY', 'FRAGMENT_DUPLICATE_KEY', 'FRAGMENT_INCOMPLETE', 'FRAGMENT_INCOMPLETE', 'RUN_UNKNOWN', 'RUN_UNKNOWN', 'RUN_UNKNOWN',
    'POSITION_INVALID', 'POSITION_INVALID', 'POSITION_INVALID', 'POSITION_INVALID', 'POSITION_INVALID', 'POSITION_INVALID']);
  assert.deepEqual(T.parseFragment('#run=a&pos=123456', ids), { ok: true, run: 'a', pos: 123456 });
  assert.equal(code('#__proto__=1&run=a&pos=1'), 'FRAGMENT_UNKNOWN_KEY');
  assert.equal({}.run, undefined);
  assert.equal(T.formatFragment('a', 3), '#run=a&pos=3');
  assert.equal(T.parseFragment(T.formatFragment('c044-complete', 24), ids).pos, 24);
});
