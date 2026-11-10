'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('..\\timeline.js');
const saved = require('..\\saved.js');
const reducer = require('..\\..\\C044\\reducer.js');
const decoder = require('..\\..\\C034\\trace.js');
const { shared, consoleRun, boundedReducer } = require('.\\u049-fixtures.cjs');
const { observed } = require('.\\u049-observed.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));
const refusal = (answer, verification) => {
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'SAVED_RUN_TOO_LARGE');
  assert.equal(Object.isFrozen(answer), true);
  if (verification) assert.deepEqual([answer.checked, answer.mismatches], [0, []]);
};

test('G1 real dependencies refuse depth24 and depth40 before folding or decoding; actual work and reads are counted', (t) => {
  const rows = [];
  for (const depth of [24, 40]) {
    for (const location of ['console entry', 'source', 'trace snapshot']) {
      for (const operation of ['build', 'verify', 'supplied verify']) {
        const counts = { reads: 0, folds: 0, decodes: 0 };
        const measured = observed();
        const model = measured.model.using({
          reducer: { ...reducer, reduce(state, entry) { counts.folds += 1; return reducer.reduce(state, entry); } },
          trace: { validateSnapshot(snapshot) { counts.decodes += 1; return decoder.validateSnapshot(snapshot); } },
        });
        const base = location === 'trace snapshot'
          ? clone(saved.runs.find((run) => run.id === 'c034-held-snapshot')) : consoleRun({});
        const timeline = model.build(base);
        assert.equal(timeline.ok, true);
        counts.folds = 0;
        counts.decodes = 0;
        measured.metrics.calls.length = 0;
        const graph = shared(depth, counts);
        const input = location === 'console entry' ? consoleRun(graph)
          : location === 'source' ? { ...base, source: graph }
            : { ...base, snapshot: { ...base.snapshot, extra: graph } };
        let answer;
        assert.doesNotThrow(() => {
          answer = operation === 'build' ? model.build(input)
            : operation === 'verify' ? model.verify(input) : model.verify(input, timeline);
        });
        refusal(answer, operation !== 'build');
        assert.deepEqual([counts.folds, counts.decodes], [0, 0], `${location}/${operation}: no expensive collaborator ran`);
        assert.equal(measured.metrics.boundHit, false, 'the production guard, not the observation safety bound, refused it');
        assert.equal(measured.metrics.calls.length, 1);
        const [work] = measured.metrics.calls;
        assert.ok(work.charged > 200000 && work.charged <= 200004, 'the actual occurrence counter crossed its declared limit');
        assert.ok(work.steps > 60000 && work.steps <= 200000, 'actual executed ownership iterations stay bounded');
        assert.ok(work.reads > 60000 && work.reads <= 200000, 'actual property reads stay bounded');
        assert.ok(counts.reads > 60000 && counts.reads <= 200000, 'getter observations independently count raw shared-data reads');
        assert.ok(work.allocated > 10000 && work.allocated < 100000);
        assert.ok(work.reads + work.allocated <= 200000, 'actual property reads plus allocated objects fit the occurrence-work budget');
        assert.equal(Object.isFrozen(graph), false);
        assert.equal(Object.isFrozen(input), false);
        rows.push({ depth, location, operation, ...work, getterReads: counts.reads });
      }
    }
  }
  assert.equal(rows.length, 18);
  t.diagnostic(JSON.stringify({ measuredWork: rows }));
});

test('G1 the exact 200000 occurrence boundary admits small sharing and refuses one extra unit in every entry point', () => {
  const model = T.using({ reducer: boundedReducer() });
  for (const count of [199990, 199991]) {
    const input = consoleRun(new Array(count).fill(0));
    const timeline = model.build(consoleRun({}));
    const built = model.build(input);
    if (count === 199990) {
      assert.equal(built.ok, true);
      assert.equal(model.verify(input).ok, true);
      assert.equal(model.verify(input, built).ok, true);
    } else {
      refusal(built, false);
      refusal(model.verify(input), true);
      refusal(model.verify(input, timeline), true);
    }
  }
  const leaf = { value: 7 };
  const input = consoleRun({ a: leaf, b: leaf });
  const built = model.build(input);
  assert.equal(built.ok, true);
  assert.deepEqual(built.entries[0].data, input.entries[0].data);
  assert.notEqual(built.entries[0].data.a, leaf);
  assert.notEqual(built.entries[0].data.a, built.entries[0].data.b);
  assert.equal(Object.isFrozen(built.entries[0].data.a), true);
  assert.equal(Object.isFrozen(leaf), false);
  assert.equal(model.verify(input, built).ok, true);
});

test('G1 removing the work guard and adding hidden shared-data reads each fail named counted-work assertions, not timeouts', () => {
  const original = fs.readFileSync(path.join(__dirname, '..', 'timeline.js'), 'utf8');
  const guard = "if (nodes > MAX_NODES) throw new Refusal('SAVED_RUN_TOO_LARGE');";
  assert.equal(original.split(guard).length, 2);
  const unguarded = observed(original.replace(guard, ';'));
  const model = unguarded.model.using({ reducer: boundedReducer() });
  const timeline = model.build(consoleRun({}));
  model.verify(consoleRun(shared(40)), timeline);
  assert.equal(unguarded.metrics.boundHit, true, 'actual iteration bound discriminates a removed production guard');
  assert.throws(() => assert.equal(unguarded.metrics.boundHit, false, 'G1 counted work guard must precede expansion'), assert.AssertionError);
  const hidden = observed(original.replace('onPath.add(source);', 'Object.values(source); onPath.add(source);'));
  const counts = { reads: 0 };
  const hiddenModel = hidden.model.using({ reducer: boundedReducer() });
  const target = hiddenModel.build(consoleRun({}));
  refusal(hiddenModel.verify(consoleRun(shared(40, counts)), target), true);
  const allocated = hidden.metrics.calls.at(-1).allocated;
  assert.ok(counts.reads + allocated > 200000, 'independent raw reads plus actual allocations observe inserted work the charged-node formula misses');
  assert.throws(() => assert.ok(counts.reads + allocated <= 200000, 'G1 actual raw-read and allocation budget'), assert.AssertionError);
});

test('G1 depth24 and depth40 real-dependency refusals and exact boundary controls replay inside a 64 MB child', () => {
  const { runNode } = require('.\\nested-runner.cjs');
  const script = `
    const assert = require('node:assert/strict');
    const T = require(${JSON.stringify(require.resolve('..\\timeline.js'))});
    const { shared, consoleRun } = require(${JSON.stringify(require.resolve('.\\u049-fixtures.cjs'))});
    for (const depth of [24, 40]) {
      const timeline = T.build(consoleRun({}));
      for (const answer of [T.build(consoleRun(shared(depth))), T.verify(consoleRun(shared(depth))), T.verify(consoleRun(shared(depth)), timeline)]) {
        assert.equal(answer.ok, false);
        assert.equal(answer.code, 'SAVED_RUN_TOO_LARGE');
      }
    }
    const input = consoleRun(new Array(199990).fill(0));
    assert.equal(T.build(input).ok, true);
    assert.equal(T.verify(input).ok, true);
    assert.equal(T.build(consoleRun(new Array(199991).fill(0))).code, 'SAVED_RUN_TOO_LARGE');
    console.log('PASS G1 capped-heap typed refusals and exact counted boundaries');`;
  const result = runNode(['--max-old-space-size=64', '-e', script], { cwd: __dirname });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'PASS G1 capped-heap typed refusals and exact counted boundaries');
});
