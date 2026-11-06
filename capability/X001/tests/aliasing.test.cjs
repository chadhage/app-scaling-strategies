'use strict';

// F2 (review of the first publication): nothing a consumer can reach may change a later answer. Every object the model returns is deeply frozen,
// the timeline holds private copies of the recorded entries, the source and the producer (never the caller's objects), and the caller's objects are
// never frozen or touched. Strict mode makes a write to a frozen object throw; every attempt is made and the pictures of all answers are compared.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const D = require('..\\describe.js');
const saved = require('..\\saved.js');

const clone = (value) => JSON.parse(JSON.stringify(value));
const runOf = (id) => saved.runs.find((run) => run.id === id);
const indexes = (length) => Array.from({ length }, (_, index) => index);
const attempt = (action) => { try { action(); return 'accepted'; } catch { return 'refused'; } };
const VALID = ['c044-restart-gap', 'c044-complete', 'c044-truncated', 'c044-hostile-mix', 'c034-closed-history', 'c034-held-snapshot'];

// Everything a consumer can ask of a timeline, as one string; a throw is part of the picture.
function picture(timeline) {
  try {
    const answers = indexes(timeline.length).map((index) => {
      const answer = timeline.stateAt(index);
      return [answer, D.announce(answer), D.headline(answer), D.stateLines(answer), D.notes(answer.flags), D.entryText(answer.entry)];
    });
    const jumps = T.JUMPS.map((kind) => [T.jump(timeline, -1, kind, 1), T.jump(timeline, timeline.length, kind, -1)]);
    return JSON.stringify({ answers, jumps, limits: timeline.limits, hits: timeline.hits, marks: timeline.marks, entries: timeline.entries, source: timeline.source,
      limitLines: D.limitLines(timeline.limits), outside: [timeline.stateAt(-1), timeline.stateAt(timeline.length)], located: [timeline.locate(1, 11), timeline.locate(1, 13)] });
  } catch (error) {
    return `THROWS ${error.constructor.name}: ${error.message}`;
  }
}

const ATTACKS = {
  'flags.gap = null': (tl) => { tl.stateAt(tl.hits.gap[0]).flags.gap = null; },
  'flags.gap forged': (tl) => { tl.stateAt(2).flags.gap = { epoch: 9, skippedFrom: 1, skippedTo: 99 }; },
  'flags.epochChange = null': (tl) => { tl.stateAt(tl.hits.epoch[0]).flags.epochChange = null; },
  'flags added': (tl) => { tl.stateAt(3).flags.extra = true; },
  'marks[5] = applied': (tl) => { tl.marks[5] = 'applied'; },
  'marks.length = 0': (tl) => { tl.marks.length = 0; },
  'marks.push': (tl) => { tl.marks.push('x'); },
  'entries[3] replaced': (tl) => { tl.entries[3] = { type: 'stop' }; },
  'entries.length = 1': (tl) => { tl.entries.length = 1; },
  'entry.data.step = 99': (tl) => { tl.stateAt(tl.marks.indexOf('applied')).entry.data.step = 99; },
  'entry.type = stop': (tl) => { tl.stateAt(2).entry.type = 'stop'; },
  'source.producer forged': (tl) => { tl.source.producer = 'FORGED'; },
  'state.counts.applied = 999': (tl) => { tl.stateAt(10).state.counts.applied = 999; },
  'state.events.push': (tl) => { tl.stateAt(10).state.events.push({ id: 'x' }); },
  'tallies.failed = 0': (tl) => { tl.stateAt(30).tallies.failed = 0; },
  'tallies.byMark.applied = 0': (tl) => { tl.stateAt(30).tallies.byMark.applied = 0; },
  'limits.status = COMPLETE': (tl) => { tl.limits.status = 'COMPLETE'; },
  'limits.epochs[0].recorded = 0': (tl) => { tl.limits.epochs[0].recorded = 0; },
  'limits.producer.lastSeq = 5': (tl) => { tl.limits.producer.lastSeq = 5; },
  'hits.failure.length = 0': (tl) => { tl.hits.failure.length = 0; },
  'stateAt replaced': (tl) => { tl.stateAt = () => ({ ok: false }); },
  'length replaced': (tl) => { tl.length = 1; },
  'locate range forged': (tl) => { tl.locate(1, 11).range.from = 99; },
  'outside range forged': (tl) => { tl.stateAt(-1).range.to = 99; },
};

for (const [label, make] of [['a FROZEN saved run (what the page passes)', (id) => runOf(id)], ['an UNFROZEN saved run (any other consumer)', (id) => clone(runOf(id))]]) {
  test(`no attempt to change a returned object changes a later answer (${label})`, () => {
    for (const [name, attack] of Object.entries(ATTACKS)) {
      const run = make('c044-restart-gap');
      const timeline = T.build(run);
      assert.equal(timeline.ok, true);
      const before = picture(timeline);
      assert.equal(attempt(() => attack(timeline)), 'refused', `${name}: the object is frozen, the write throws in strict mode`);
      assert.equal(picture(timeline), before, `${name}: a later answer changed`);
      assert.equal(picture(T.build(run)), before, `${name}: a rebuilt timeline differs`);
    }
  });
}

test('nothing the caller does to its saved run after build() changes a later answer, and build never freezes or touches the caller data', () => {
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
    assert.equal(attempt(() => attack(run)), 'accepted', 'the caller data is still the caller\'s own');
    assert.equal(picture(timeline), before, `${name}: the caller changed a later answer`);
    assert.equal(T.verify(run, timeline).ok, !['entries.length = 1', 'entry.data.step = 99', 'entries[2] replaced'].includes(name), `${name}: verify reads the caller data as it is now`);
  }
  for (const id of ['c034-closed-history', 'c034-held-snapshot']) {
    const run = clone(runOf(id));
    const timeline = T.build(run);
    const before = picture(timeline);
    run.snapshot.events[1].code = 'FORGED';
    run.snapshot.events.length = 2;
    run.source.producer = 'FORGED';
    assert.equal(picture(timeline), before, `${id}: a trace is copied too`);
    assert.equal(Object.isFrozen(timeline.entries[0]), true);
  }
});

test('a generic walk over every reachable object of every public return value finds nothing mutable and no later answer ever changes (all valid runs, frozen and unfrozen)', () => {
  for (const id of VALID) {
    for (const make of [(value) => runOf(value), (value) => clone(runOf(value))]) {
      const run = make(id);
      const timeline = T.build(run);
      const roots = [timeline, ...indexes(timeline.length).map((index) => timeline.stateAt(index)), timeline.locate(1, 13), timeline.locate(1, 11), timeline.locate(1, 99), timeline.locate(1.5, 1),
        T.locate(timeline, 1, 99), T.stateAt(timeline, 3), T.stateAt(timeline, -1), T.stateAt(null, 0), T.verify(run, timeline), T.verify(null), T.parseFragment('#run=c044-complete&pos=3', ['c044-complete']),
        T.parseFragment('#nope', []), T.build(null), T.build({ format: 'x' })];
      const before = picture(timeline);
      const nodes = new Set();
      const queue = roots.filter((value) => value && typeof value === 'object');
      while (queue.length > 0) {
        const node = queue.pop();
        if (nodes.has(node)) continue;
        nodes.add(node);
        for (const key of Object.keys(node)) if (node[key] && typeof node[key] === 'object') queue.push(node[key]);
      }
      assert.ok(nodes.size > 20, `${id}: the walk reached ${nodes.size} objects`);
      const mutable = [];
      for (const node of nodes) {
        if (!Object.isFrozen(node)) mutable.push(Array.isArray(node) ? `array of ${node.length}` : `object ${Object.keys(node).join(',').slice(0, 40)}`);
        for (const key of Object.keys(node)) {
          attempt(() => { node[key] = 'ALIASED'; });
          attempt(() => { delete node[key]; });
        }
        if (Array.isArray(node)) { attempt(() => node.push('ALIASED')); attempt(() => { node.length = 0; }); }
      }
      assert.deepEqual(mutable, [], `${id}: every object the model returns is frozen`);
      assert.equal(picture(timeline), before, `${id}: a later answer changed after the walk`);
    }
  }
});

test('verify compares flags and marks as well as state, mark and tallies, and its own answer is frozen', () => {
  const run = runOf('c044-restart-gap');
  const timeline = T.build(run);
  const forge = (patch) => ({ ...timeline, stateAt: (index) => (index === 6 ? { ...timeline.stateAt(index), ...patch } : timeline.stateAt(index)) });
  assert.deepEqual(T.verify(run, forge({})).mismatches, []);
  assert.deepEqual(T.verify(run, forge({ flags: { gap: null, epochChange: { fromEpoch: 1, toEpoch: 2 } } })).mismatches, [{ index: 6, what: 'flags' }]);
  assert.deepEqual(T.verify(run, forge({ flags: undefined })).mismatches, [{ index: 6, what: 'flags' }]);
  const marks = [...timeline.marks];
  marks[9] = timeline.marks[9] === 'applied' ? 'duplicate' : 'applied';
  assert.deepEqual(T.verify(run, { ...timeline, marks }).mismatches, [{ index: 9, what: 'marks' }]);
  const verdict = T.verify(run, timeline);
  assert.equal(verdict.ok, true);
  assert.deepEqual([Object.isFrozen(verdict), Object.isFrozen(verdict.mismatches)], [true, true]);
  assert.deepEqual(T.verify(run, { ...timeline, length: 3 }).mismatches[0], { index: -1, what: 'length' });
});
