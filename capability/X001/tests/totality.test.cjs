'use strict';

// F6 and F7 (review of the first publication): build() and verify() are TOTAL. Whatever they are given, they answer with a typed refusal or a timeline
// whose every position can be asked for; they never throw and never build half a timeline. The producer metadata is cross-checked against the recording.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const saved = require('..\\saved.js');

const clone = (value) => JSON.parse(JSON.stringify(value));
const runOf = (id) => clone(saved.runs.find((run) => run.id === id));
const withEntries = (entries) => ({ ...runOf('c044-complete'), entries });
const refused = (input, code) => {
  let built;
  assert.doesNotThrow(() => { built = T.build(input); });
  assert.equal(built.ok, false);
  assert.equal(built.code, code);
  assert.equal(Object.isFrozen(built), true);
  return built;
};

test('every kind of hostile input has its own typed code and never a throw (not data, too large, cyclic, sparse, unreadable)', () => {
  const entries = runOf('c044-complete').entries.slice(0, 3);
  const hole = [...entries];
  delete hole[1];
  const cycle = clone(entries);
  cycle[1].data = cycle[1];
  const deep = (levels) => { let node = {}; for (let i = 0; i < levels; i++) node = { a: node, b: node }; return node; };
  const getter = [entries[0], { get type() { throw new Error('hostile getter'); } }];
  const proxy = [entries[0], new Proxy({}, { ownKeys() { throw new Error('hostile proxy'); }, getPrototypeOf() { return Object.prototype; } })];
  const cases = [
    ['a function in an entry', withEntries([entries[0], { type: 'connect', f() {} }]), 'SAVED_RUN_NOT_DATA'],
    ['a symbol in an entry', withEntries([entries[0], { type: 'connect', s: Symbol('x') }]), 'SAVED_RUN_NOT_DATA'],
    ['a Date in an entry', withEntries([entries[0], { type: 'connect', d: new Date(0) }]), 'SAVED_RUN_NOT_DATA'],
    ['a Map in an entry', withEntries([entries[0], { type: 'connect', m: new Map() }]), 'SAVED_RUN_NOT_DATA'],
    ['a function inside the source', { ...runOf('c044-complete'), source: { producer() {} } }, 'SAVED_RUN_NOT_DATA'],
    ['new Array(3)', withEntries(new Array(3)), 'SAVED_RUN_SPARSE'],
    ['a hole between two entries', withEntries(hole), 'SAVED_RUN_SPARSE'],
    ['a hole inside the data of an entry', withEntries([{ type: 'connect', data: [1, , 3] }]), 'SAVED_RUN_SPARSE'],
    ['a cyclic entry', withEntries(cycle), 'SAVED_RUN_CYCLIC'],
    ['300,000 elements in one entry', withEntries([{ type: 'connect', data: new Array(300000).fill(0) }]), 'SAVED_RUN_TOO_LARGE'],
    ['300,000 keys in one entry', withEntries([{ type: 'connect', data: Object.fromEntries(Array.from({ length: 300000 }, (_, i) => [i, 0])) }]), 'SAVED_RUN_TOO_LARGE'],
    ['a shared structure that doubles 40 times', withEntries([{ type: 'connect', data: deep(40) }]), 'SAVED_RUN_TOO_LARGE'],
    ['a sparse array of 10 million holes', withEntries([{ type: 'connect', data: new Array(1e7) }]), 'SAVED_RUN_TOO_LARGE'],
    ['a throwing getter', withEntries(getter), 'SAVED_RUN_UNREADABLE'],
    ['a proxy that throws', withEntries(proxy), 'SAVED_RUN_UNREADABLE'],
  ];
  for (const [name, input, code] of cases) {
    try { refused(input, code); } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
  }
});

test('deep nesting does not overflow the stack: a 50,000-deep entry is read iteratively and the entry is shown as what the reducer made of it', () => {
  let node = {};
  for (let i = 0; i < 50000; i++) node = { n: node };
  const built = T.build(withEntries([{ type: 'connect' }, { type: 'event', id: 'x', event: 'run-started', data: node }]));
  assert.equal(built.ok, true);
  assert.equal(built.marks[1], 'rejected');
  assert.equal(T.verify(withEntries([{ type: 'connect' }, { type: 'event', id: 'x', event: 'run-started', data: node }]), built).ok, true);
  let array = [];
  for (let i = 0; i < 3000; i++) array = [array];
  assert.equal(T.build(withEntries([{ type: 'connect', data: array }])).ok, true);
});

test('a seeded fuzz over hostile JavaScript values: build and verify never throw, a refusal is typed, a built timeline answers every position', () => {
  const hostile = [undefined, null, NaN, Infinity, -0, 0, 1.5, 2 ** 53, '', 'x'.repeat(20000), '__proto__', true, [], {}, [undefined], [null, NaN], new Array(4), Symbol('s'), () => 1, 10n, new Date(0),
    new Map(), /x/, { __proto__: null }, JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'), { get a() { throw new Error('getter'); } },
    new Proxy([], { get() { throw new Error('proxy'); } }), Object.freeze([1, 2]), [[[[[]]]]], { type: 'event', id: 5, event: [], data: 7 }, { type: 'failure', failure: 'x' }, { type: 'toString' }];
  let state;
  const random = () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const before = Object.keys(Object.prototype).length;
  let builtCount = 0;
  let refusedCount = 0;
  const bases = ['c044-complete', 'c044-hostile-mix', 'c034-closed-history', 'c034-reordered'];
  for (const seed of [11, 2026, 77777]) {
    state = seed;
    for (let round = 0; round < 100; round++) {
      const run = runOf(pick(bases));
      const list = run.kind === 'console' ? run.entries : run.snapshot.events;
      const mode = Math.floor(random() * 4);
      if (mode === 0) run[pick(['format', 'id', 'kind', 'title', 'source', 'producer', 'entries', 'snapshot'])] = pick(hostile);
      else if (mode === 1) list[Math.floor(random() * list.length)] = pick(hostile);
      else if (mode === 2) { const entry = list[Math.floor(random() * list.length)]; if (entry && typeof entry === 'object') entry[pick(['type', 'id', 'event', 'data', 'code', 'attemptId', 'failure'])] = pick(hostile); }
      else list.length = Math.floor(random() * (list.length + 3));
      let built;
      assert.doesNotThrow(() => { built = T.build(run); }, `seed ${seed} round ${round}`);
      assert.equal(typeof built.ok, 'boolean');
      if (built.ok) {
        builtCount += 1;
        for (let index = 0; index < built.length; index++) assert.equal(built.stateAt(index).ok, true, `seed ${seed} round ${round} position ${index}`);
        assert.equal(built.stateAt(built.length).code, T.NOT_RECORDED);
      } else {
        refusedCount += 1;
        assert.match(built.code, /^[A-Z_]+$/);
      }
      assert.doesNotThrow(() => T.verify(run), `verify seed ${seed} round ${round}`);
      assert.doesNotThrow(() => T.verify(run, built), `verify with a built answer, seed ${seed} round ${round}`);
      assert.doesNotThrow(() => T.verify(pick(hostile), pick(hostile)));
    }
  }
  assert.ok(builtCount > 50 && refusedCount > 50, `the fuzz reached both outcomes (${builtCount} built, ${refusedCount} refused)`);
  assert.equal(Object.keys(Object.prototype).length, before, 'no prototype pollution');
  assert.equal({}.polluted, undefined);
});

test('verify is total and typed: anything that is not a saved run, a forged timeline and unreadable entries all give a frozen typed answer', () => {
  const run = runOf('c044-complete');
  const timeline = T.build(run);
  for (const value of [undefined, null, 0, 'x', [], () => 1, Symbol('s')]) {
    const answer = T.verify(value);
    assert.deepEqual([answer.ok, answer.code, answer.checked, answer.mismatches], [false, 'SAVED_RUN_REQUIRED', 0, []]);
    assert.equal(Object.isFrozen(answer), true);
  }
  assert.equal(T.verify(run, null).code, 'TIMELINE_REQUIRED');
  assert.deepEqual(T.verify(run, { ok: true }).mismatches, [{ index: -1, what: 'length' }], 'a forged timeline without positions does not verify');
  assert.equal(T.verify(run, { ok: false, code: 'X' }).code, 'X');
  assert.equal(T.verify(run, { ...timeline, stateAt() { throw new Error('forged'); } }).code, 'VERIFY_FAILED');
  assert.equal(T.verify({ ...run, entries: 5 }, timeline).code, 'ENTRIES_REQUIRED');
  assert.equal(T.verify({ kind: 'trace' }, timeline).code, 'VERIFY_FAILED');
  assert.equal(T.verify({ ...run, entries: new Array(501).fill({ type: 'connect' }) }, timeline).code, 'ENTRIES_REQUIRED');
  const holes = [...run.entries];
  delete holes[2];
  assert.equal(T.verify({ ...run, entries: holes }, timeline).code, 'VERIFY_FAILED');
  assert.equal(T.verify(run).ok, true);
  assert.equal(T.verify({ ...run, producer: { lastSeq: 5, totalSteps: 3, replayWindow: 2 } }).code, 'PRODUCER_INCONSISTENT');
});

test('F4: limits.gaps[].position and limits.epochChanges[].position are the 1-based position of the entry where the gap or the restart shows', () => {
  const timeline = T.build(saved.runs[0]);
  assert.deepEqual(timeline.limits.gaps.map((gap) => gap.position), timeline.hits.gap.map((index) => index + 1));
  assert.deepEqual(timeline.limits.epochChanges.map((change) => change.position), timeline.hits.epoch.map((index) => index + 1));
  assert.equal(timeline.limits.gaps.length, 1);
  assert.equal(timeline.limits.epochChanges.length, 1);
  const [gap] = timeline.limits.gaps;
  assert.deepEqual([gap.epoch, gap.from, gap.to, gap.count], [1, 10, 12, 3]);
  assert.equal(timeline.stateAt(gap.position - 1).state.gaps.length, 1, 'the position is the entry at which the gap was recorded');
  assert.equal(timeline.stateAt(gap.position - 2).state.gaps.length, 0);
  const [change] = timeline.limits.epochChanges;
  assert.equal(timeline.stateAt(change.position - 1).state.epochChanges.length, 1);
  assert.equal(timeline.stateAt(change.position - 2).state.epochChanges.length, 0);
});

test('F7: a producer total that the recording exceeds is refused; the pinned sets and an exact total are valid, a total one short is not', () => {
  const run = runOf('c044-complete');
  assert.equal(run.producer.lastSeq, 22);
  for (const id of ['c044-restart-gap', 'c044-complete', 'c044-truncated', 'c044-hostile-mix']) assert.equal(T.build(saved.runs.find((item) => item.id === id)).ok, true, id);
  assert.equal(T.build({ ...run, producer: { ...run.producer, lastSeq: 22 } }).ok, true, 'the exact total');
  refused({ ...run, producer: { ...run.producer, lastSeq: 21 } }, 'PRODUCER_INCONSISTENT');
  refused({ ...run, producer: { ...run.producer, lastSeq: 5 } }, 'PRODUCER_INCONSISTENT');
  assert.equal(T.build({ ...run, producer: undefined }).ok, true, 'without producer metadata nothing can be cross-checked');
  const hostile = runOf('c044-restart-gap');
  hostile.producer.lastSeq = 7;
  refused(hostile, 'PRODUCER_INCONSISTENT');
});

test('the node budget is exact: 200,000 nodes build and 200,001 are refused; a verify of something that is not a saved run is typed even with a timeline', () => {
  const withData = (n) => ({ ...runOf('c044-complete'), producer: undefined, source: null, entries: [{ type: 'connect', data: new Array(n).fill(0) }] });
  assert.equal(T.build(withData(199990)).ok, true, 'the root, its entries, the entry and the data hold 200,000 nodes');
  assert.equal(T.build(withData(199991)).code, 'SAVED_RUN_TOO_LARGE');
  const timeline = T.build(runOf('c044-complete'));
  for (const value of [5, null, 'x', []]) assert.equal(T.verify(value, timeline).code, 'SAVED_RUN_REQUIRED', String(value));
});

test('the work is linear and COUNTED, never timed: build folds every entry once, scrubbing folds nothing, verify is one more pass, whatever the size', () => {
  const real = require('..\\..\\C044\\reducer.js');
  let reduced = 0;
  const model = T.using({ reducer: { ...real, reduce: (state, action) => { reduced += 1; return real.reduce(state, action); } } });
  for (const size of [1, 10, 100, 400, 500]) {
    const run = { ...runOf('c044-complete'), producer: undefined, entries: Array.from({ length: size }, () => ({ type: 'open' })) };
    reduced = 0;
    const timeline = model.build(run);
    assert.equal(reduced, size, `build folds ${size} entries once each`);
    for (let index = 0; index < size; index++) timeline.stateAt(index);
    timeline.locate(1, 1);
    T.jump(timeline, 0, 'gap', 1);
    assert.equal(reduced, size, 'scrubbing folds nothing');
    assert.equal(model.verify(run, timeline).ok, true);
    assert.equal(reduced, 2 * size, 'verify is one independent pass over the raw entries');
  }
  reduced = 0;
  assert.equal(model.build({ ...runOf('c044-complete'), entries: new Array(501).fill({ type: 'open' }) }).code, 'TOO_MANY_ENTRIES');
  assert.equal(reduced, 0, 'a recording over the cap is refused before any entry is folded');
});

test('hostile sizes are refused by counters inside a capped heap: a 64 MB old space is enough for every refusal and for a 50,000-deep entry', () => {
  const { runNode } = require('.\\nested-runner.cjs');
  const script = `
    const T = require(${JSON.stringify(require.resolve('..\\timeline.js'))});
    const base = ${JSON.stringify(runOf('c044-complete'))};
    const withData = (data) => ({ ...base, entries: [{ type: 'connect', data }] });
    let deep = {};
    for (let i = 0; i < 50000; i++) deep = { n: deep };
    let doubling = {};
    for (let i = 0; i < 40; i++) doubling = { a: doubling, b: doubling };
    const answers = [T.build(withData(new Array(300000).fill(0))).code, T.build(withData(doubling)).code, T.build(withData(new Array(1e7))).code, T.build(withData(deep)).ok, T.build(base).ok];
    process.stdout.write(JSON.stringify(answers));`;
  const result = runNode(['--max-old-space-size=64', '-e', script], { cwd: __dirname });
  assert.equal(result.status, 0, `${result.stderr}`.slice(0, 400));
  assert.deepEqual(JSON.parse(result.stdout), ['SAVED_RUN_TOO_LARGE', 'SAVED_RUN_TOO_LARGE', 'SAVED_RUN_TOO_LARGE', true, true]);
});
