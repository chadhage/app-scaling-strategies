'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const saved = require('..\\saved.js');
const { loadPage } = require('.\\dom-stub.cjs');
const { consoleRun, shared, boundedReducer } = require('.\\u049-fixtures.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));
const find = (id) => saved.runs.find((run) => run.id === id);
const answer = (action, label) => {
  let value;
  assert.doesNotThrow(() => { value = action(); }, label);
  assert.ok(value !== null && typeof value === 'object', `${label}: typed answer`);
  return value;
};
const refusal = (action, code, label) => {
  const value = answer(action, label);
  assert.equal(value.ok, false, label);
  assert.equal(value.code, code, label);
  return value;
};

test('U049 exact typed build and fragment refusals never disappear into undefined or throw', () => {
  const base = find('c044-complete');
  for (const [input, code] of [[null, 'SAVED_RUN_REQUIRED'], [[], 'SAVED_RUN_REQUIRED'],
    [{ ...base, format: 'bad' }, 'FORMAT_UNSUPPORTED'], [{ ...base, id: 'UPPER' }, 'ID_INVALID'],
    [{ ...base, kind: 'bad' }, 'KIND_UNSUPPORTED'], [{ ...base, entries: [() => {}] }, 'SAVED_RUN_NOT_DATA'],
    [Object.defineProperty({}, 'format', { get() { throw new Error('unreadable'); } }), 'SAVED_RUN_UNREADABLE']]) {
    assert.deepEqual(refusal(() => T.build(input), code, code), { ok: false, code, detail: null });
  }
  const ids = ['a', 'UPPER', 'bad_id'];
  const cases = [[null, 'FRAGMENT_INVALID'], [undefined, 'FRAGMENT_INVALID'], [0, 'FRAGMENT_INVALID'],
    ['', 'FRAGMENT_EMPTY'], ['#', 'FRAGMENT_EMPTY'], ['x', 'FRAGMENT_INVALID'],
    ['#run=a&pos', 'FRAGMENT_MALFORMED'], ['#run=a&pos=1=2', 'FRAGMENT_MALFORMED'],
    ['#run=a&junk=1', 'FRAGMENT_UNKNOWN_KEY'], ['#run=a&run=a&pos=1', 'FRAGMENT_DUPLICATE_KEY'],
    ['#run=a', 'FRAGMENT_INCOMPLETE'], ['#run=UPPER&pos=1', 'RUN_UNKNOWN'],
    ['#run=bad_id&pos=1', 'RUN_UNKNOWN'], ['#run=a&pos=0', 'POSITION_INVALID'],
    ['#run=a&pos=01', 'POSITION_INVALID'], ['#run=a&pos=1000000', 'POSITION_INVALID'],
    ['#'.repeat(101), 'FRAGMENT_TOO_LONG'], ['#'.repeat(100), 'FRAGMENT_MALFORMED']];
  for (const [text, code] of cases) assert.deepEqual(refusal(() => T.parseFragment(text, ids), code, `fragment ${String(text).slice(0, 30)}`), { ok: false, code, detail: null });
});

test('U049 public adapters require ok true and invalid targets directions kinds and sequence ranges are exact', () => {
  for (const target of [null, undefined, {}, { ok: false }, [], 1]) {
    for (const kind of ['gap', 'not-a-kind']) {
      let result;
      assert.doesNotThrow(() => { result = T.jump(target, 0, kind, 1); }, 'invalid jump target');
      assert.equal(result, null);
    }
  }
  let calls = 0;
  const invalid = { ok: false, stateAt() { calls += 1; }, locate() { calls += 1; }, hits: { gap: [1] } };
  assert.deepEqual(answer(() => T.stateAt(invalid, 0), 'stateAt invalid'), { ok: false, code: 'TIMELINE_REQUIRED', detail: null });
  assert.deepEqual(answer(() => T.locate(invalid, 1, 1), 'locate invalid'), { ok: false, code: 'TIMELINE_REQUIRED', detail: null });
  assert.equal(T.jump(invalid, 0, 'gap', 1), null);
  assert.equal(calls, 0);
  const timeline = T.build(find('c044-complete'));
  for (const [epoch, seq, reason] of [[1, 0, 'invalid-sequence'], [99, 1, 'unknown-epoch']]) {
    assert.deepEqual(answer(() => T.locate(timeline, epoch, seq), reason), { ok: false, code: 'NOT_RECORDED', reason, range: null });
  }
  for (const target of [{ ok: false, code: 'CUSTOM' }, null, {}, { ok: false }]) {
    const code = target?.code || 'TIMELINE_REQUIRED';
    assert.deepEqual(refusal(() => T.verify(find('c044-complete'), target), code, 'invalid supplied timeline'), { ok: false, checked: 0, mismatches: [], code });
  }
  for (const entries of [null, {}, new Array(501).fill({ type: 'open' })]) {
    assert.deepEqual(refusal(() => T.verify({ ...find('c044-complete'), entries }, timeline), 'ENTRIES_REQUIRED', 'verify entry cap'), {
      ok: false, checked: 0, mismatches: [], code: 'ENTRIES_REQUIRED',
    });
  }
});

test('U049 source and producer occurrence work is counted even when an already-built timeline is supplied', () => {
  const model = T.using({ reducer: boundedReducer() });
  const small = consoleRun({});
  const timeline = model.build(small);
  for (const field of ['source', 'producer']) for (const depth of [24, 40]) {
    const input = { ...small, [field]: shared(depth) };
    assert.deepEqual(refusal(() => model.verify(input, timeline), 'SAVED_RUN_TOO_LARGE', `${field} shared ${depth}`), {
      ok: false, checked: 0, mismatches: [], code: 'SAVED_RUN_TOO_LARGE',
    });
  }
  for (const source of [undefined, null, false, 7, 'text', () => {}]) {
    assert.deepEqual(answer(() => model.verify({ ...small, source }, timeline), 'ignored nonobject source'), { ok: true, checked: 1, mismatches: [] });
  }
  const throwing = Object.defineProperty({}, 'value', { enumerable: true, get() { throw { code: 'SAVED_RUN_TOO_LARGE' }; } });
  assert.deepEqual(refusal(() => model.verify({ ...small, source: throwing }, timeline), 'VERIFY_FAILED', 'a caller exception is not our Refusal'), {
    ok: false, checked: 0, mismatches: [], code: 'VERIFY_FAILED',
  });
});

test('U049 own-object enumeration does not introduce unnecessary proxy descriptor reads', () => {
  let descriptors = 0;
  const data = new Proxy({ value: 1 }, {
    getOwnPropertyDescriptor(target, key) {
      descriptors += 1;
      if (descriptors > 1) throw new Error('an extra descriptor read is not required');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const model = T.using({ reducer: boundedReducer() });
  const built = answer(() => model.build(consoleRun(data)), 'plain-data proxy');
  assert.equal(built.ok, true);
  assert.equal(descriptors, 1);
  assert.deepEqual(built.entries[0].data, { value: 1 });
});

test('U049 verification distinguishes property names and every falsy value without depending on insertion order', () => {
  const model = T.using({ reducer: boundedReducer() });
  const run = consoleRun({});
  const timeline = model.build(run);
  const original = timeline.stateAt(0).state;
  const forge = (state) => ({ ...timeline, stateAt: () => ({ ...timeline.stateAt(0), state }) });
  const renamed = { ...original, counts: { ...original.counts, appliedX: original.counts.applied } };
  delete renamed.counts.applied;
  for (const state of [renamed, { ...original, completed: null }, { ...original, lastId: false },
    { ...original, completed: 0 }, { ...original, completed: '' }]) {
    assert.deepEqual(answer(() => model.verify(run, forge(state)), 'different state'), {
      ok: false, checked: 1, mismatches: [{ index: 0, what: 'state' }],
    });
  }
  const reversed = Object.fromEntries(Object.entries(original).reverse());
  assert.deepEqual(answer(() => model.verify(run, forge(reversed)), 'same state reordered'), { ok: true, checked: 1, mismatches: [] });
});

test('U049 applied and duplicate console details and optional total preserve every exact limits field', () => {
  const base = find('c044-complete');
  const events = base.entries.filter((entry) => entry.type === 'event');
  const first = events[0];
  const duplicate = T.build({ ...base, entries: [first, first], producer: { lastSeq: 1, totalSteps: 1, replayWindow: 1 } });
  assert.equal(duplicate.ok, true);
  assert.deepEqual(duplicate.marks, ['applied', 'duplicate']);
  assert.equal(duplicate.stateAt(0).detail, first.id);
  assert.equal(duplicate.stateAt(1).detail, 'duplicate');
  assert.equal(duplicate.limits.kind, 'console');
  assert.deepEqual(duplicate.limits.epochs, [{ epoch: 1, firstSeq: 1, lastSeq: 1, recorded: 1, total: 1, complete: true }]);
  const afterFirst = answer(() => T.build({ ...base, entries: events.slice(2, 5) }), 'recording starts at sequence three');
  assert.equal(afterFirst.ok, true);
  assert.deepEqual(afterFirst.limits.notRecorded, [
    { epoch: 1, from: 1, to: 2, why: 'before-first' }, { epoch: 1, from: 6, to: 22, why: 'after-last' },
  ]);
  assert.deepEqual(answer(() => T.locate(afterFirst, 1, 1), 'before first'), { ok: false, code: 'NOT_RECORDED', reason: 'before-recorded', range: { from: 1, to: 2 } });
  assert.equal(afterFirst.limits.epochs[0].complete, false);
  const unknown = T.build({ ...base, entries: [events[2]], producer: null });
  assert.equal(unknown.ok, true);
  assert.deepEqual(unknown.limits.notRecorded, [{ epoch: 1, from: 1, to: 2, why: 'before-first' }]);
  assert.equal(unknown.limits.epochs[0].total, null);
  assert.equal(unknown.limits.epochs[0].complete, false);
  assert.deepEqual(T.locate(unknown, 1, 4), { ok: false, code: 'NOT_RECORDED', reason: 'after-recorded', range: { from: 4, to: null } });
  const primitive = new Number(1);
  assert.equal(T.build({ ...base, producer: primitive }).code, 'SAVED_RUN_NOT_DATA');
  for (const producer of [1, true, 'x', []]) refusal(() => T.build({ ...base, producer }), 'PRODUCER_INVALID', 'producer object required');
});

test('U049 trace limits name real starts ends classifications resumed phase and initial reset exactly', () => {
  for (const run of saved.runs.filter((item) => item.kind === 'trace' && !item.source.hostile)) {
    const timeline = answer(() => T.build(run), run.id);
    assert.equal(timeline.ok, true);
    assert.equal(timeline.limits.kind, 'trace');
    for (const limit of timeline.limits.attempts) {
      const start = run.snapshot.events.findIndex((entry) => entry.code === 'ORIGINAL_ATTEMPT_STARTED' && entry.attemptId === limit.attemptId) + 1;
      const ends = run.snapshot.events.map((entry, index) => ({ entry, position: index + 1 })).filter(({ entry }) =>
        entry.attemptId === limit.attemptId && ['TWO_READ_LOCAL_SEGMENT_OBSERVED', 'FAILED_HTTP_REPLY_404', 'INTERRUPTED_BY_STOP', 'INTERRUPTED_BY_RESET'].includes(entry.code));
      assert.equal(limit.startPosition, start);
      assert.equal(limit.endPosition, ends.at(-1)?.position ?? null);
    }
  }
  const events = [
    { code: 'ORIGINAL_ATTEMPT_STARTED', attemptId: 'a1' }, { code: 'BOUNDARY_HELD', attemptId: 'a1' },
    { code: 'RESUME_ORIGINAL_ATTEMPT', attemptId: 'a1' }, { code: 'TWO_READ_LOCAL_SEGMENT_OBSERVED', attemptId: 'a1' },
    { code: 'RESET_VIEW_HISTORY_RETAINED', attemptId: 'a1' },
  ];
  const model = T.using({ trace: { validateSnapshot: () => ({ valid: true, attempts: [{ attemptId: 'a1', classification: 'observed-local-segment', requests: 0, responses: 0 }] }) } });
  const timeline = answer(() => model.build({ ...find('c034-held-snapshot'), snapshot: { events } }), 'injected declared decoder');
  assert.equal(timeline.ok, true);
  assert.deepEqual(timeline.stateAt(0).state.attempts[0], { attemptId: 'a1', phase: 'running', requests: 0, responses: 0, reset: false });
  assert.equal(timeline.stateAt(1).state.attempts[0].phase, 'paused');
  assert.equal(timeline.stateAt(2).state.attempts[0].phase, 'running');
  assert.equal(timeline.stateAt(4).state.attempts[0].reset, true);
  assert.deepEqual(timeline.limits.attempts, [{
    attemptId: 'a1', phase: 'observed', classification: 'observed-local-segment', requests: 0, responses: 0, startPosition: 1, endPosition: 4,
  }]);
  assert.equal(T.using({}).build(find('c034-held-snapshot')).ok, true, 'omitted trace dependency uses the current accepted decoder');
});

test('U049 page chooser labels refusal messages reset text and sequence instructions are exact', () => {
  const base = clone(find('c044-complete'));
  const titled = { ...base, title: 'q'.repeat(112) };
  const bad = { ...base, id: 'u049-no-detail', format: 'bad' };
  const page = answer(() => loadPage({ saved: { schema: 'X001-saved/1', runs: [titled, bad] } }), 'chooser initializes');
  const D = require('..\\describe.js');
  assert.deepEqual(page.$('saved-run').children.map((option) => [option.tag, option.value, option.textContent]), [
    ['option', titled.id, `${titled.id}: ${D.clip(titled.title, 110)}`], ['option', bad.id, `${bad.id}: ${D.clip(bad.title, 110)}`],
  ]);
  page.click('load');
  assert.equal(page.text('error'), 'CHOOSE_A_RUN: choose a saved run first.');
  page.$('saved-run').value = titled.id;
  assert.doesNotThrow(() => page.click('load'), 'all limit lines render as actual li nodes');
  assert.equal(page.text('error'), '');
  assert.ok(page.$('limits').children.every((node) => node !== null && typeof node === 'object'), 'every rendered limit is an actual node');
  assert.ok(page.$('limits').children.every((node) => node.tag === 'li' && node.textContent.length > 0));
  assert.equal(page.$('entries').children[0].children[2].textContent, 'current position');
  assert.equal(page.$('entries').children[1].children[2].textContent, '');
  assert.equal(page.$('entries').children[0].children[2].className, 'here');
  page.key('ArrowLeft');
  assert.equal(page.text('error'), 'NOT_RECORDED: the requested position 0 is outside this recording (positions 1 to 24). The position did not change; Home and End go to the first and the last position.');
  page.key('ArrowRight');
  assert.equal(page.text('error'), '');
  page.$('seq-epoch').value = '';
  page.$('seq-number').value = '';
  page.click('seq-find');
  assert.equal(page.text('seq-result'), 'SEQUENCE_INVALID: enter the epoch and the sequence as whole numbers from 1; nothing was looked up.');
  page.$('saved-run').value = bad.id;
  assert.doesNotThrow(() => page.click('load'), 'no-detail refusal is rendered');
  assert.equal(page.text('error'), 'REFUSED FORMAT_UNSUPPORTED: this saved run is not shown as a timeline.');
  assert.equal(page.text('status'), 'This saved run was refused. No timeline is shown and nothing is assumed to have succeeded.');
  for (const id of ['provenance', 'seq-result']) assert.equal(page.text(id), '');
  assert.equal(page.text('verified'), 'Nothing is verified yet.');
  assert.deepEqual(page.calls, []);
});

test('U049 every same-run fragment avoids entry-list rebuilding and changing runs actually replaces entries without throwing', () => {
  const page = answer(() => loadPage({ hash: '#run=c044-complete&pos=1' }), 'a real initial fragment loads without throwing');
  const entries = [...page.$('entries').children];
  for (const position of [2, 24, 1]) {
    assert.doesNotThrow(() => page.changeHash(`#run=c044-complete&pos=${position}`), 'same-run fragment');
    assert.equal(page.position(), position);
    page.$('entries').children.forEach((entry, index) => assert.equal(entry, entries[index]));
  }
  assert.doesNotThrow(() => page.changeHash('#run=c044-restart-gap&pos=1'), 'different-run fragment builds a new timeline');
  assert.notEqual(page.$('entries').children[0], entries[0]);
});
