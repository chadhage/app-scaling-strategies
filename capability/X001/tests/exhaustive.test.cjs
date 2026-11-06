'use strict';

// EXHAUSTIVE enumeration (the C040 reviewer enumerated 231,784 views): every saved run x every position x every move (keys, buttons, jumps)
// x every direction, at the model (the state equals a from-scratch fold, any path) and in the rendered DOM (the shown state equals the fold).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const Reducer = require('..\\..\\C044\\reducer.js');
const saved = require('..\\saved.js');
const { loadPage } = require('.\\dom-stub.cjs');
const { assertShown, hitsFor } = require('.\\invariants.cjs');

const valid = saved.runs.filter((run) => !run.source.hostile || run.kind === 'console');
const sizeOf = (run) => (run.kind === 'console' ? run.entries.length : run.snapshot.events.length);
// Every move as { name, key|click, target(position, n, hits) }: null means the move is refused or has no target.
const rel = (delta) => (at, n) => (at + delta >= 0 && at + delta < n ? at + delta : null);
const MOVES = [
  ['ArrowRight', 'key', rel(1)], ['ArrowLeft', 'key', rel(-1)], ['ArrowUp', 'key', rel(1)], ['ArrowDown', 'key', rel(-1)], ['PageUp', 'key', rel(10)],
  ['PageDown', 'key', rel(-10)], ['Home', 'key', () => 0], ['End', 'key', (at, n) => n - 1], ['next', 'click', rel(1)], ['prev', 'click', rel(-1)],
  ...['gap', 'failure', 'unknown', 'epoch'].flatMap((kind) => [[`next-${kind}`, 'click', (at, n, hits) => hits[kind].find((i) => i > at) ?? null],
    [`prev-${kind}`, 'click', (at, n, hits) => hits[kind].findLast((i) => i < at) ?? null]]),
];
const canonical = (value) => JSON.stringify(value, (key, item) => (item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1))) : item));

test('model: every position of every run equals a from-scratch fold, reached by every one and two move paths', (t) => {
  let checks = 0;
  for (const run of valid) {
    const timeline = T.build(run);
    const n = sizeOf(run);
    const other = T.build(run);
    const fresh = Array.from({ length: n }, (_, i) => (run.kind === 'console'
      ? canonical(run.entries.slice(0, i + 1).reduce((state, entry) => Reducer.reduce(state, entry), Reducer.initial())) : canonical(other.stateAt(i).state)));
    const shown = Array.from({ length: n }, (_, i) => canonical(timeline.stateAt(i).state));
    assert.deepEqual(shown, fresh, `${run.id}: every position equals its from-scratch fold`);
    const hits = hitsFor(run);
    for (let i = 0; i < n; i++) {
      checks += 1;
      for (const [, , one] of MOVES) {
        const first = one(i, n, hits);
        if (first === null) continue;
        checks += 1;
        for (const [, , two] of MOVES) {
          const second = two(first, n, hits);
          if (second === null) continue;
          const answer = T.stateAt(timeline, second);
          assert.equal(answer.state, timeline.stateAt(second).state, `${run.id} ${i} -> ${first} -> ${second}: the same state object by every path`);
          assert.equal(answer.position, second + 1);
          assert.equal(T.jump(timeline, second, 'gap', 1) === null, hits.gap.every((g) => g <= second));
          checks += 1;
        }
      }
    }
    for (let i = -3; i < n + 3; i++) if (i < 0 || i >= n) assert.equal(timeline.stateAt(i).code, 'NOT_RECORDED');
  }
  t.diagnostic(`exhaustive model checks: ${checks} (runs ${valid.length}, positions ${valid.reduce((sum, run) => sum + sizeOf(run), 0)}, moves ${MOVES.length})`);
  assert.ok(checks > 10000);
});

test('DOM: every run x every start position x every key, button and jump shows exactly the fold or a typed refusal', (t) => {
  let actions = 0;
  let refused = 0;
  for (const run of valid) {
    const n = sizeOf(run);
    const hits = hitsFor(run);
    const page = loadPage({ hash: `#run=${run.id}&pos=1` });
    for (let start = 0; start < n; start++) {
      for (const [name, how, target] of MOVES) {
        page.changeHash(`#run=${run.id}&pos=${start + 1}`);
        const expected = target(start, n, hits);
        const label = `${run.id} ${start + 1} ${name}`;
        if (how === 'key') page.key(name);
        else page.click(name);
        actions += 1;
        if (expected !== null) assertShown(page, run.id, expected, label);
        else {
          refused += 1;
          const channel = how === 'key' || name === 'next' || name === 'prev' ? 'error' : 'status';
          assert.equal(page.position(), start + 1, label);
          assert.match(page.text(channel), channel === 'error' ? /^NOT_RECORDED: the requested position -?\d+ is outside/ : /^No (earlier|later) (gap|failure|unknown|epoch) in this recording\.$/, label);
          assert.equal(page.location.hash, `#run=${run.id}&pos=${start + 1}`, label);
        }
      }
    }
  }
  t.diagnostic(`exhaustive DOM actions: ${actions} (refused or without target: ${refused}), runs ${valid.length}, moves ${MOVES.length}`);
  assert.ok(actions > 2500);
});

test('every position of every run is shown by a fragment (one page, every position) and by a fresh page at every first, last and hit position', (t) => {
  let shown = 0;
  let fresh = 0;
  for (const run of valid) {
    const n = sizeOf(run);
    const hits = hitsFor(run);
    const page = loadPage({ hash: `#run=${run.id}&pos=1` });
    const special = new Set([0, n - 1, ...Object.values(hits).flat()]);
    for (let i = 0; i < n; i++) {
      page.changeHash(`#run=${run.id}&pos=${i + 1}`);
      assertShown(page, run.id, i, `${run.id} ${i + 1}`);
      shown += 1;
      if (special.has(i) || i % 9 === 0) {
        assertShown(loadPage({ hash: `#run=${run.id}&pos=${i + 1}` }), run.id, i, `fresh ${run.id} ${i + 1}`);
        fresh += 1;
      }
    }
  }
  t.diagnostic(`exhaustive fragment views: ${shown}, fresh page loads: ${fresh}`);
  assert.equal(shown, valid.reduce((sum, run) => sum + sizeOf(run), 0));
});
