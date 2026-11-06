'use strict';

// RED for X001 (behavioral specification of the timeline model, X001.feature). It runs against ./timeline.stub.cjs (the naive first
// attempt) and, byte for byte unchanged, against the final timeline.js through tests\green-shim.cjs (L-0121).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const T = require('./timeline.stub.cjs');
const Reducer = require('..\\..\\..\\C044\\reducer.js');
const saved = require('..\\..\\saved.js');

const run = (id) => saved.runs.find((entry) => entry.id === id);
const consoleRuns = saved.runs.filter((entry) => entry.kind === 'console');
const ids = saved.runs.map((entry) => entry.id);
const fold = (entries, last) => entries.slice(0, last + 1).reduce((state, entry) => Reducer.reduce(state, entry), Reducer.initial());
const built = (id) => { const timeline = T.build(run(id)); assert.equal(timeline.ok, true, id); return timeline; };
const indexOf = (id, predicate) => run(id).entries.findIndex(predicate);
const grew = (entries, key) => entries.flatMap((_, i) => (fold(entries, i)[key].length > (i ? fold(entries, i - 1)[key].length : 0) ? [i] : []));

test('stateAt(i) is the C044 reducer folded over entries 0..i for every position of every console run', () => {
  for (const entry of consoleRuns) {
    const timeline = built(entry.id);
    assert.equal(timeline.length, entry.entries.length, entry.id);
    for (let i = 0; i < timeline.length; i++) {
      const answer = T.stateAt(timeline, i);
      assert.equal(answer.ok, true);
      assert.equal(answer.position, i + 1);
      assert.equal(answer.of, timeline.length);
      assert.deepStrictEqual(answer.state, fold(entry.entries, i), `${entry.id} position ${i}`);
    }
  }
});

test('a position outside the recording is typed NOT_RECORDED and carries no state, never the nearest one', () => {
  const timeline = built('c044-complete');
  assert.equal(T.NOT_RECORDED, 'NOT_RECORDED');
  for (const bad of [-1, timeline.length, timeline.length + 7, NaN, 1.5, '3', null, undefined, Infinity, -Infinity, {}, [0], true]) {
    const answer = T.stateAt(timeline, bad);
    assert.equal(answer.ok, false, String(bad));
    assert.equal(answer.code, 'NOT_RECORDED', String(bad));
    assert.equal('state' in answer, false, String(bad));
  }
});

test('replayed duplicates are counted and marked DUPLICATE, never applied as new events', () => {
  const entries = run('c044-restart-gap').entries;
  const timeline = built('c044-restart-gap');
  const duplicates = entries.flatMap((_, i) => (fold(entries, i).counts.duplicates > (i ? fold(entries, i - 1).counts.duplicates : 0) ? [i] : []));
  assert.equal(duplicates.length, 3);
  for (const i of duplicates) {
    const answer = T.stateAt(timeline, i);
    assert.equal(answer.mark, 'duplicate', `position ${i}`);
    assert.equal(answer.state.counts.applied, fold(entries, i - 1).counts.applied);
  }
  const last = T.stateAt(timeline, timeline.length - 1);
  assert.deepEqual([last.state.counts.applied, last.state.counts.duplicates], [25, 3]);
});

test('a true gap names its exact skipped range and nothing inside it is interpolated', () => {
  const timeline = built('c044-restart-gap');
  assert.deepEqual(timeline.limits.gaps.map(({ epoch, from, to, count }) => ({ epoch, from, to, count })), [{ epoch: 1, from: 10, to: 12, count: 3 }]);
  const inside = T.locate(timeline, 1, 11);
  assert.equal(inside.ok, false);
  assert.equal(inside.code, 'NOT_RECORDED');
  assert.equal(inside.reason, 'gap');
  assert.deepEqual(inside.range, { from: 10, to: 12 });
  const after = T.locate(timeline, 1, 21);
  assert.deepEqual([after.ok, after.code, after.reason, after.range], [false, 'NOT_RECORDED', 'after-recorded', { from: 21, to: 22 }]);
  assert.equal(T.locate(timeline, 9, 1).reason, 'unknown-epoch');
  const found = T.locate(timeline, 2, 3);
  assert.equal(found.ok, true);
  assert.equal(T.stateAt(timeline, found.index).state.lastId, 'synthetic-run-001:2:3');
  assert.equal(T.stateAt(timeline, grew(run('c044-restart-gap').entries, 'gaps')[0]).state.gaps.length, 1);
});

test('a restart is an epoch change with its position and each epoch keeps its own recorded window', () => {
  const timeline = built('c044-restart-gap');
  const at = grew(run('c044-restart-gap').entries, 'epochChanges');
  assert.deepEqual(timeline.limits.epochChanges.map(({ from, to, position }) => ({ from, to, position })), [{ from: 1, to: 2, position: at[0] + 1 }]);
  assert.deepEqual(timeline.limits.epochs.map(({ epoch, firstSeq, lastSeq, recorded, total }) => ({ epoch, firstSeq, lastSeq, recorded, total })),
    [{ epoch: 1, firstSeq: 1, lastSeq: 20, recorded: 17, total: 22 }, { epoch: 2, firstSeq: 1, lastSeq: 8, recorded: 8, total: 22 }]);
});

test('a recording that stops before the producer total is INCOMPLETE and shows recorded of total', () => {
  const cut = built('c044-truncated');
  assert.equal(cut.limits.status, 'INCOMPLETE');
  assert.deepEqual(cut.limits.epochs.map(({ epoch, recorded, total, lastSeq }) => ({ epoch, recorded, total, lastSeq })), [{ epoch: 1, recorded: 15, total: 22, lastSeq: 15 }]);
  assert.deepEqual(cut.limits.notRecorded.map(({ epoch, from, to, why }) => ({ epoch, from, to, why })), [{ epoch: 1, from: 16, to: 22, why: 'after-last' }]);
  assert.equal(built('c044-complete').limits.status, 'COMPLETE');
  assert.deepEqual(built('c044-complete').limits.notRecorded, []);
  assert.equal(built('c044-restart-gap').limits.status, 'INCOMPLETE');
});
test('failed entries are FAILED and unknown events or entry types are UNKNOWN, never success-shaped', () => {
  const mark = (predicate) => built('c044-hostile-mix').marks[indexOf('c044-hostile-mix', predicate)];
  assert.equal(mark((e) => e.event === 'step-failed'), 'unknown-event');
  assert.equal(mark((e) => e.type === 'teleport'), 'unknown-entry');
  assert.equal(mark((e) => e.failure && e.failure.code === 'TOTALLY_NEW'), 'failure-unrecognized');
  assert.equal(mark((e) => e.id === '../../etc/passwd'), 'rejected');
  assert.equal(mark((e) => e.id === 'synthetic-run-002:1:7'), 'rejected');
  assert.equal(mark((e) => e.type === 'event' && e.data && e.data.seq === 5 && e.id.endsWith(':4')), 'rejected');
  const timeline = built('c044-hostile-mix');
  const last = T.stateAt(timeline, timeline.length - 1);
  assert.ok(last.tallies, 'tallies are derived for every position');
  assert.deepEqual([last.tallies.failed, last.tallies.unknown], [3, 3]);
  assert.equal(built('c044-restart-gap').marks.filter((m) => m === 'failure').length, 2);
});

test('the accepted C034 traces fold with their own outcomes and hostile ones are refused with the decoder code', () => {
  const closed = built('c034-closed-history');
  const count = (mark) => closed.marks.filter((entry) => entry === mark).length;
  assert.equal(closed.length, 43);
  assert.deepEqual([count('observed'), count('failed'), count('unknown-outcome')], [3, 1, 2]);
  assert.equal(built('c034-held-snapshot').limits.status, 'INCOMPLETE');
  for (const [id, code] of [['c034-reordered', 'BOUNDARY_ACTION_ORDER'], ['c034-truncated', 'MISSING_OR_DUPLICATE_ORIGINAL'],
    ['c034-tampered', 'ORIGINAL_ELAPSED_MISMATCH'], ['c034-unknown-code', 'UNKNOWN_ACTION']]) {
    const refused = T.build(run(id));
    assert.deepEqual([refused.ok, refused.code, refused.detail], [false, 'DECODER_REFUSED', code], id);
    assert.equal('entries' in refused, false, 'no partial timeline');
  }
});

test('a malformed saved run is refused with a typed code', () => {
  const base = run('c044-complete');
  for (const bad of [null, undefined, 7, 'x', [], {}, { ...base, format: 'other/1' }, { ...base, entries: 'no' }, { ...base, entries: [] },
    { ...base, kind: 'weird' }, { ...base, id: '../x' }, { ...base, entries: new Array(5000).fill({ type: 'open' }) }]) {
    const refused = T.build(bad);
    assert.equal(refused.ok, false, JSON.stringify(bad)?.slice(0, 60));
    assert.equal(typeof refused.code, 'string');
  }
});

test('jumps land exactly on the next or previous gap, failure, unknown or epoch change', () => {
  const entries = run('c044-restart-gap').entries;
  const timeline = built('c044-restart-gap');
  const [gap] = grew(entries, 'gaps');
  const [epoch] = grew(entries, 'epochChanges');
  const failures = entries.flatMap((e, i) => (e.type === 'failure' ? [i] : []));
  assert.equal(T.jump(timeline, 0, 'gap', 1), gap);
  assert.equal(T.jump(timeline, gap, 'gap', 1), null);
  assert.equal(T.jump(timeline, timeline.length - 1, 'gap', -1), gap);
  assert.equal(T.jump(timeline, gap, 'gap', -1), null);
  assert.equal(T.jump(timeline, 0, 'epoch', 1), epoch);
  assert.deepEqual([T.jump(timeline, 0, 'failure', 1), T.jump(timeline, failures[0], 'failure', 1), T.jump(timeline, failures[1], 'failure', 1)], [failures[0], failures[1], null]);
  assert.equal(T.jump(timeline, failures[1], 'failure', -1), failures[0]);
  const hostile = built('c044-hostile-mix');
  const unknown = hostile.marks.flatMap((m, i) => (['unknown-event', 'unknown-entry', 'failure-unrecognized'].includes(m) ? [i] : []));
  assert.equal(unknown.length, 3);
  assert.deepEqual([T.jump(hostile, 0, 'unknown', 1), T.jump(hostile, unknown[0], 'unknown', 1), T.jump(hostile, unknown[2], 'unknown', 1)], [unknown[0], unknown[1], null]);
  assert.equal(T.jump(timeline, 0, 'no-such-kind', 1), null);
});

test('building and scrubbing re-executes nothing: no producer, timer or network is started', () => {
  const calls = [];
  const originals = {};
  for (const name of ['setTimeout', 'setInterval', 'setImmediate', 'fetch']) {
    originals[name] = globalThis[name];
    globalThis[name] = () => { calls.push(name); return { unref() {} }; };
  }
  try {
    const timeline = T.build(run('c044-restart-gap'));
    for (let i = 0; i < timeline.length; i++) T.stateAt(timeline, i);
    T.verify(run('c044-restart-gap'));
  } finally {
    Object.assign(globalThis, originals);
  }
  assert.deepEqual(calls, []);
  const loaded = Object.keys(require.cache).map((file) => `${path.basename(path.dirname(file))}/${path.basename(file)}`);
  for (const forbidden of ['C044/run.cjs', 'C044/server.cjs', 'C044/store.cjs']) assert.ok(!loaded.includes(forbidden), `${forbidden} was loaded`);
});

test('verify recomputes every position from the raw entries and detects a forged state', () => {
  for (const entry of consoleRuns) {
    const verdict = T.verify(entry);
    assert.deepEqual([verdict.ok, verdict.checked, verdict.mismatches], [true, entry.entries.length, []], entry.id);
  }
  const timeline = built('c044-complete');
  const forged = { ...timeline, stateAt: (i) => (i === 5 ? { ...T.stateAt(timeline, i), state: { ...T.stateAt(timeline, i).state, lastSeq: 99 } } : T.stateAt(timeline, i)) };
  const verdict = T.verify(run('c044-complete'), forged);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.mismatches.map((mismatch) => mismatch.index), [5]);
});

test('a fragment is parsed strictly and a hostile one is a typed refusal that echoes nothing', () => {
  assert.deepEqual(T.parseFragment('#run=c044-complete&pos=12', ids), { ok: true, run: 'c044-complete', pos: 12 });
  assert.deepEqual(T.parseFragment('#pos=3&run=c034-closed-history', ids), { ok: true, run: 'c034-closed-history', pos: 3 });
  assert.equal(T.formatFragment('c044-complete', 12), '#run=c044-complete&pos=12');
  for (const hostile of ['', '#', '#run=c044-complete', '#run=c044-complete&pos=0', '#run=c044-complete&pos=-1', '#run=c044-complete&pos=1.5',
    '#run=c044-complete&pos=007', '#run=c044-complete&pos=1&pos=2', '#run=__proto__&pos=1', '#run=nope&pos=1', '#run=c044-complete&pos=1&x=1',
    '#run=<script>alert(1)</script>&pos=1', '#run=c044-complete&pos=%31', `#run=${'a'.repeat(300)}&pos=1`, 'run=c044-complete&pos=1',
    '#run=c044-complete&pos=9999999', null, undefined, 42, {}]) {
    const parsed = T.parseFragment(hostile, ids);
    assert.equal(parsed.ok, false, String(hostile).slice(0, 40));
    assert.equal(typeof parsed.code, 'string');
    assert.ok(!/script|aaaa/.test(JSON.stringify(parsed)), 'the hostile text is never echoed');
  }
});

test('any walk of forward, backward and jump moves shows the same state for the same position (path independent)', () => {
  let seed = 20260506;
  const random = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (const entry of saved.runs.filter((item) => item.kind === 'console')) {
    const timeline = built(entry.id);
    const fresh = built(entry.id);
    let position = random(timeline.length);
    for (let step = 0; step < 200; step++) {
      const move = random(6);
      const target = [position + 1, position - 1, position + 10, position - 10, 0, timeline.length - 1][move];
      if (target >= 0 && target < timeline.length) position = target;
      assert.equal(JSON.stringify(T.stateAt(timeline, position)), JSON.stringify(T.stateAt(fresh, position)), `${entry.id} step ${step}`);
    }
  }
});