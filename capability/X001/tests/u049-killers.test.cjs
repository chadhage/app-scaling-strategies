'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const saved = require('..\\saved.js');
const { loadPage } = require('.\\dom-stub.cjs');
const { assertShown, assertUnloaded } = require('.\\invariants.cjs');
const { consoleRun, boundedReducer } = require('.\\u049-fixtures.cjs');
const valid = saved.runs.filter((run) => !run.source.hostile || run.kind === 'console');

function objectAnswer(action, label) {
  let value;
  assert.doesNotThrow(() => { value = action(); }, label);
  assert.ok(value !== null && typeof value === 'object', `${label}: an answer object is required`);
  return value;
}

test('U049 all public timeline adapters return their documented answer shapes without throwing on their supported domains', () => {
  assert.equal(Object.isFrozen(T), true);
  assert.equal(Object.isFrozen(T.JUMPS), true);
  for (const run of valid) {
    const timeline = objectAnswer(() => T.build(run), 'build');
    assert.equal(timeline.ok, true);
    assert.deepEqual(objectAnswer(() => T.verify(run, timeline), 'verify'), { ok: true, checked: timeline.length, mismatches: [] });
    for (const index of [0, Math.floor(timeline.length / 2), timeline.length - 1, -1, timeline.length, NaN, '1', null]) {
      const answer = objectAnswer(() => T.stateAt(timeline, index), `stateAt ${String(index)}`);
      assert.deepEqual(answer, timeline.stateAt(index));
      assert.equal(Object.isFrozen(answer), true);
    }
    for (const [epoch, sequence] of [[1, 1], [1, 10], [2, 1], [99, 1], [1, 0], [1, NaN], [null, 1]]) {
      const answer = objectAnswer(() => T.locate(timeline, epoch, sequence), 'locate');
      assert.deepEqual(answer, timeline.locate(epoch, sequence));
    }
    for (const kind of T.JUMPS) for (const from of [-1, 0, timeline.length - 1, timeline.length]) for (const direction of [-1, 1]) {
      let answer;
      assert.doesNotThrow(() => { answer = T.jump(timeline, from, kind, direction); });
      const hits = timeline.hits[kind];
      const expected = direction === 1 ? hits.find((index) => index > from) : hits.findLast((index) => index < from);
      assert.equal(answer, expected === undefined ? null : expected);
    }
  }
  for (const target of [null, undefined, {}, { ok: false }, { ok: true }, 1, [], 'x']) {
    for (const method of ['stateAt', 'locate']) {
      const answer = objectAnswer(() => T[method](target, 0, 1), `${method} invalid target`);
      assert.deepEqual(answer, { ok: false, code: 'TIMELINE_REQUIRED', detail: null });
    }
  }
  const model = objectAnswer(() => T.using({}), 'using');
  assert.equal(typeof model.build, 'function');
  assert.equal(model.build(consoleRun({})).ok, true);
});

test('U049 all control classifications, unknown details, null prototypes and sparse-safe array proxies preserve the supported model behavior', () => {
  const model = T.using({ reducer: boundedReducer() });
  for (const type of ['connect', 'open', 'disconnect', 'reconnect', 'resync', 'notice', 'stop', 'counters']) {
    const timeline = objectAnswer(() => model.build(consoleRun({}, { entries: [{ type }] })), type);
    assert.equal(timeline.ok, true);
    assert.deepEqual([timeline.stateAt(0).mark, timeline.stateAt(0).detail], ['no-effect', type]);
  }
  const unknown = model.build(consoleRun({}, { entries: [{ type: 'constructor' }] }));
  assert.equal(unknown.ok, true);
  assert.deepEqual([unknown.stateAt(0).mark, unknown.stateAt(0).detail], ['unknown-entry', 'unrecognised entry type']);
  const nullPrototype = Object.assign(Object.create(null), { value: 1 });
  const accepted = objectAnswer(() => model.build(consoleRun(nullPrototype)), 'null-prototype data');
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.entries[0].data, { value: 1 });
  let enumerated = 0;
  const array = new Proxy([1, 2], { ownKeys() { enumerated += 1; throw new Error('array ownKeys is not required'); } });
  const arrayRun = consoleRun(array);
  const built = objectAnswer(() => model.build(arrayRun), 'array proxy with unused throwing enumeration');
  assert.equal(built.ok, true);
  assert.deepEqual(built.entries[0].data, [1, 2]);
  assert.equal(model.verify(arrayRun, built).ok, true);
  assert.equal(enumerated, 0, 'array ownership reads indexed own properties, never unnecessary ownKeys');
});

test('U049 a cyclic dependency state freezes without recursion failure and remains a typed unverifiable state rather than a throw', () => {
  const base = boundedReducer();
  const model = T.using({ reducer: { ...base, initial() { const state = base.initial(); state.self = state; return state; } } });
  const timeline = objectAnswer(() => model.build(consoleRun({})), 'cycle-aware state freezing');
  assert.equal(timeline.ok, true);
  const state = timeline.stateAt(0).state;
  assert.equal(state.self, state);
  assert.equal(Object.isFrozen(state), true);
  const answer = objectAnswer(() => model.verify(consoleRun({}), timeline), 'cyclic comparison refusal');
  assert.deepEqual(answer, { ok: false, checked: 0, mismatches: [], code: 'VERIFY_FAILED' });
});

test('U049 verification distinguishes array and object state shapes and ignores only object insertion order', () => {
  const run = saved.runs.find((entry) => entry.id === 'c044-complete');
  const timeline = T.build(run);
  assert.equal(timeline.ok, true);
  const forge = (state) => ({ ...timeline, stateAt: (index) => index === 0 ? { ...timeline.stateAt(0), state } : timeline.stateAt(index) });
  const original = timeline.stateAt(0).state;
  const reversed = Object.fromEntries(Object.entries(original).reverse());
  assert.deepEqual(T.verify(run, forge(reversed)), { ok: true, checked: timeline.length, mismatches: [] });
  assert.deepEqual(T.verify(run, forge({ ...original, events: {} })), { ok: false, checked: timeline.length, mismatches: [{ index: 0, what: 'state' }] });
});

test('U049 every documented page input handler answers without throwing, including typed refusals and both jump directions', () => {
  const page = loadPage();
  const action = (label, callback) => assert.doesNotThrow(callback, label);
  for (const run of valid) {
    action(`load ${run.id}`, () => { page.$('saved-run').value = run.id; page.click('load'); });
    assertShown(page, run.id, 0);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Tab', 'constructor']) {
      action(`${run.id} key ${key}`, () => page.key(key));
    }
    action('reset to first', () => page.changeHash(`#run=${run.id}&pos=1`));
    assertShown(page, run.id, 0);
    for (const kind of T.JUMPS) for (const direction of ['prev', 'next']) action(`${direction}-${kind}`, () => page.click(`${direction}-${kind}`));
    action('Home after jumps', () => page.key('Home'));
    assertShown(page, run.id, 0);
    for (const [epoch, sequence] of [['1', '1'], ['1', '11'], ['', ''], ['01', '1']]) {
      action('sequence lookup', () => {
        page.$('seq-epoch').value = epoch;
        page.$('seq-number').value = sequence;
        page.$('seq-number').dispatch('keydown', { key: 'Enter' });
        page.click('seq-find');
      });
      assert.ok(page.text('seq-result').length > 0);
    }
    action('hostile fragment', () => page.changeHash('#run=__proto__&pos=1'));
    assert.match(page.text('error'), /^RUN_UNKNOWN:/);
    action('same run fragment recovery', () => page.changeHash(`#run=${run.id}&pos=1`));
    assertShown(page, run.id, 0);
  }
  action('refused run', () => { page.$('saved-run').value = 'c034-reordered'; page.click('load'); });
  assertUnloaded(page, 'refused run');
  for (const key of ['Home', 'ArrowRight', 'End']) action(`unloaded ${key}`, () => page.key(key));
  for (const id of ['prev', 'next', 'seq-find', 'prev-gap', 'next-gap']) action(`unloaded ${id}`, () => page.click(id));
  assert.deepEqual(page.calls, []);
});

test('U049 two live page contexts keep prepared caches, fragments, entries and refusals independent in both directions', () => {
  const one = loadPage({ hash: '#run=c044-complete&pos=3' });
  const two = loadPage({ hash: '#run=c044-restart-gap&pos=17' });
  const firstEntries = [...one.$('entries').children];
  const secondEntries = [...two.$('entries').children];
  one.changeHash('#run=c034-reordered&pos=1');
  assertUnloaded(one, 'first refuses');
  assertShown(two, 'c044-restart-gap', 16);
  secondEntries.forEach((entry, index) => assert.equal(two.$('entries').children[index], entry));
  one.changeHash('#run=c044-complete&pos=3');
  assertShown(one, 'c044-complete', 2);
  assert.notEqual(one.$('entries').children[0], firstEntries[0], 'a reload owns its fresh entry nodes');
  const restored = [...one.$('entries').children];
  two.changeHash('#run=c034-tampered&pos=1');
  assertUnloaded(two, 'second refuses');
  assertShown(one, 'c044-complete', 2);
  restored.forEach((entry, index) => assert.equal(one.$('entries').children[index], entry));
  assert.deepEqual([...one.calls, ...two.calls], []);
});

test('U049 verification canonicalizes null and undefined identically while keeping different defined values distinct', () => {
  const base = boundedReducer();
  const model = T.using({ reducer: { ...base, initial: () => ({ ...base.initial(), extra: undefined }) } });
  const run = consoleRun({});
  const timeline = model.build(run);
  assert.equal(timeline.ok, true);
  const changed = (extra) => ({ ...timeline, stateAt: (index) => ({ ...timeline.stateAt(index), state: { ...timeline.stateAt(index).state, extra } }) });
  assert.deepEqual(model.verify(run, changed(null)), { ok: true, checked: 1, mismatches: [] });
  assert.deepEqual(model.verify(run, changed('null')), { ok: false, checked: 1, mismatches: [{ index: 0, what: 'state' }] });
  assert.deepEqual(model.verify(run, changed(0)), { ok: false, checked: 1, mismatches: [{ index: 0, what: 'state' }] });
});
