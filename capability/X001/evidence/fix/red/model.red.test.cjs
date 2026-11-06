'use strict';

// RED of the fix for review findings F2 (returned objects are mutable and alias the caller), F4 (limits.gaps[].position never read), F6 (build is not
// total for sparse arrays and hostile values) and F7 (producer metadata is not cross-checked). FROZEN: it is replayed against the first-publication
// code (node --require tests\base-shim.cjs --test <this file>: it fails) and unchanged against the final code (it passes). It never reads the
// working copy of any other test helper, so it stays valid byte for byte.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ns = path.resolve(__dirname, '..', '..', '..');
const T = require(path.join(ns, 'timeline.js'));
const D = require(path.join(ns, 'describe.js'));
const saved = require(path.join(ns, 'saved.js'));

const clone = (value) => JSON.parse(JSON.stringify(value));
const runOf = (id) => saved.runs.find((run) => run.id === id);
const indexes = (length) => Array.from({ length }, (_, index) => index);

// Everything a consumer can ask of a timeline, as one string; a throw is part of the picture (never an exception of the test itself).
function picture(timeline) {
  try {
    const answers = indexes(timeline.length).map((index) => {
      const answer = timeline.stateAt(index);
      return [answer, D.announce(answer), D.headline(answer), D.stateLines(answer), D.notes(answer.flags), D.entryText(answer.entry)];
    });
    const jumps = T.JUMPS.map((kind) => [T.jump(timeline, -1, kind, 1), T.jump(timeline, timeline.length, kind, -1)]);
    return JSON.stringify({ answers, jumps, limits: timeline.limits, hits: timeline.hits, marks: timeline.marks, entries: timeline.entries, source: timeline.source,
      limitLines: D.limitLines(timeline.limits), outside: [timeline.stateAt(-1), timeline.stateAt(timeline.length)] });
  } catch (error) {
    return `THROWS ${error.constructor.name}: ${error.message}`;
  }
}

const attempt = (action) => { try { action(); return 'accepted'; } catch { return 'refused'; } };

const ATTACKS = {
  'flags.gap = null': (tl) => { tl.stateAt(tl.hits.gap[0]).flags.gap = null; },
  'flags.gap forged': (tl) => { tl.stateAt(2).flags.gap = { epoch: 9, skippedFrom: 1, skippedTo: 99 }; },
  'flags.epochChange = null': (tl) => { tl.stateAt(tl.hits.epoch[0]).flags.epochChange = null; },
  'marks[5] = applied': (tl) => { tl.marks[5] = 'applied'; },
  'marks.length = 0': (tl) => { tl.marks.length = 0; },
  'marks.push': (tl) => { tl.marks.push('x'); },
  'entries[3] replaced': (tl) => { tl.entries[3] = { type: 'stop' }; },
  'entries.length = 1': (tl) => { tl.entries.length = 1; },
  'entry.data.step = 99': (tl) => { tl.stateAt(tl.marks.indexOf('applied')).entry.data.step = 99; },
  'entry.type = stop': (tl) => { tl.stateAt(2).entry.type = 'stop'; },
  'source.producer forged': (tl) => { tl.source.producer = 'FORGED'; },
  'state.counts.applied = 999': (tl) => { tl.stateAt(10).state.counts.applied = 999; },
  'tallies.failed = 0': (tl) => { tl.stateAt(30).tallies.failed = 0; },
  'limits.status = COMPLETE': (tl) => { tl.limits.status = 'COMPLETE'; },
  'limits.epochs[0].recorded = 0': (tl) => { tl.limits.epochs[0].recorded = 0; },
  'hits.failure.length = 0': (tl) => { tl.hits.failure.length = 0; },
  'stateAt replaced': (tl) => { tl.stateAt = () => ({ ok: false }); },
};

for (const [label, make] of [['a FROZEN saved run (what the page passes)', (id) => runOf(id)], ['an UNFROZEN saved run (any other consumer)', (id) => clone(runOf(id))]]) {
  test(`F2: no attempt to change a returned object changes a later answer (${label})`, () => {
    for (const [name, attack] of Object.entries(ATTACKS)) {
      const run = make('c044-restart-gap');
      const timeline = T.build(run);
      assert.equal(timeline.ok, true);
      const before = picture(timeline);
      attempt(() => attack(timeline));
      assert.equal(picture(timeline), before, `${name}: a later answer changed`);
      assert.equal(picture(T.build(run)), before, `${name}: a rebuilt timeline differs`);
    }
  });
}

test('F2: nothing the caller does to its saved run after build() changes a later answer, and build never freezes or touches the caller data', () => {
  const attacks = {
    'entries.length = 1': (run) => { run.entries.length = 1; },
    'entry.data.step = 99': (run) => { run.entries[run.entries.findIndex((entry) => entry.type === 'event')].data.step = 99; },
    'entries[2] replaced': (run) => { run.entries[2] = { type: 'stop' }; },
    'source.producer forged': (run) => { run.source.producer = 'FORGED'; },
    'producer.lastSeq = 5': (run) => { run.producer.lastSeq = 5; },
    'title forged': (run) => { run.title = 'FORGED'; },
  };
  for (const [name, attack] of Object.entries(attacks)) {
    const run = clone(runOf('c044-restart-gap'));
    const timeline = T.build(run);
    assert.deepEqual([Object.isFrozen(run), Object.isFrozen(run.entries), Object.isFrozen(run.entries[0]), Object.isFrozen(run.source), Object.isFrozen(run.producer)],
      [false, false, false, false, false], `${name}: build left the caller data alone`);
    const before = picture(timeline);
    attempt(() => attack(run));
    assert.equal(picture(timeline), before, `${name}: the caller changed a later answer`);
    assert.equal(timeline.title, runOf('c044-restart-gap').title.slice(0, 200));
  }
});

test('F2: a generic walk over every reachable object of every public return value finds nothing mutable on the model side and no later answer ever changes', () => {
  for (const make of [(id) => runOf(id), (id) => clone(runOf(id))]) {
    const run = make('c044-restart-gap');
    const timeline = T.build(run);
    const roots = [timeline, ...indexes(timeline.length).map((index) => timeline.stateAt(index)), timeline.locate(1, 13), timeline.locate(1, 11), T.locate(timeline, 1, 99),
      T.stateAt(timeline, 3), T.stateAt(timeline, -1), T.verify(run, timeline), T.parseFragment('#run=c044-complete&pos=3', ['c044-complete'])];
    const before = picture(timeline);
    const nodes = new Set();
    const queue = roots.filter((value) => value && typeof value === 'object');
    while (queue.length > 0) {
      const node = queue.pop();
      if (nodes.has(node)) continue;
      nodes.add(node);
      for (const key of Object.keys(node)) if (node[key] && typeof node[key] === 'object') queue.push(node[key]);
    }
    assert.ok(nodes.size > 300, `the walk reached ${nodes.size} objects`);
    const mutable = [];
    for (const node of nodes) {
      if (!Object.isFrozen(node)) mutable.push(Array.isArray(node) ? `array of ${node.length}` : `object ${Object.keys(node).join(',').slice(0, 40)}`);
      for (const key of Object.keys(node)) {
        attempt(() => { node[key] = 'ALIASED'; });
        attempt(() => { delete node[key]; });
      }
      if (Array.isArray(node)) { attempt(() => node.push('ALIASED')); attempt(() => { node.length = 0; }); }
    }
    assert.deepEqual(mutable, [], 'every object the model returns is frozen');
    assert.equal(picture(timeline), before, 'a later answer changed after the walk');
  }
});

test('F4: limits.gaps[].position and limits.epochChanges[].position are the 1-based position of the entry where the gap or the restart shows', () => {
  const timeline = T.build(runOf('c044-restart-gap'));
  assert.deepEqual(timeline.limits.gaps.map((gap) => gap.position), timeline.hits.gap.map((index) => index + 1));
  assert.deepEqual(timeline.limits.epochChanges.map((change) => change.position), timeline.hits.epoch.map((index) => index + 1));
  assert.ok(timeline.limits.gaps.length >= 1 && timeline.limits.epochChanges.length >= 1);
  for (const gap of timeline.limits.gaps) assert.equal(D.notes(timeline.stateAt(gap.position - 1).flags).startsWith('GAP BEFORE'), true, 'the entry at the position shows the gap');
});

test('F6: build is total: sparse arrays and hostile values give a typed refusal and never a throw or a half-built timeline', () => {
  const run = clone(runOf('c044-complete'));
  const withHole = run.entries.slice(0, 3);
  delete withHole[1];
  const throwing = { ...clone(run), entries: [{ type: 'connect' }, { get type() { throw new Error('hostile getter'); } }] };
  const cyclic = clone(run);
  cyclic.entries[1].data = cyclic.entries[1];
  const cases = { 'new Array(3)': { ...clone(run), entries: new Array(3) }, 'a hole between two events': { ...clone(run), entries: withHole }, 'a throwing getter': throwing, 'a cyclic entry': cyclic };
  for (const [name, input] of Object.entries(cases)) {
    let built;
    assert.doesNotThrow(() => { built = T.build(input); }, name);
    assert.equal(built.ok, false, `${name} is refused`);
    assert.equal(typeof built.code, 'string', `${name} carries a typed code`);
    assert.doesNotThrow(() => T.verify(input), name);
    assert.equal(T.verify(input).ok, false, `${name}: verify does not call it verified`);
  }
});

test('F7: producer metadata is cross-checked against the recording: a recorded sequence beyond the producer total is refused with PRODUCER_INCONSISTENT', () => {
  assert.equal(T.build(clone(runOf('c044-complete'))).ok, true, 'the pinned set is consistent');
  const run = clone(runOf('c044-complete'));
  run.producer.lastSeq = 5;
  const built = T.build(run);
  assert.equal(built.ok, false);
  assert.equal(built.code, 'PRODUCER_INCONSISTENT');
  for (const id of ['c044-restart-gap', 'c044-complete', 'c044-truncated', 'c044-hostile-mix']) assert.equal(T.build(runOf(id)).ok, true, `${id} stays valid`);
});
