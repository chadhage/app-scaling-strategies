'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const saved = require('..\\saved.js');
const { consoleRun, shared, boundedReducer } = require('.\\u049-fixtures.cjs');
const find = (id) => saved.runs.find((run) => run.id === id);
const answer = (action, label) => {
  let value;
  assert.doesNotThrow(() => { value = action(); }, label);
  assert.ok(value !== null && typeof value === 'object', `${label}: answer`);
  return value;
};

test('U049 every failed and unknown limits row names its exact one-based recorded position mark and detail', () => {
  for (const run of saved.runs) {
    const built = answer(() => T.build(run), run.id);
    if (!built.ok) continue;
    for (const [field, marks] of [['failed', ['rejected', 'failure', 'failed']],
      ['unknown', ['unknown-event', 'failure-unrecognized', 'unknown-entry', 'unknown-outcome', 'unknown-code']]]) {
      const expected = built.marks.flatMap((mark, index) => marks.includes(mark) ? [{ position: index + 1, mark, detail: built.stateAt(index).detail }] : []);
      assert.deepEqual(built.limits[field], expected, `${run.id} ${field}`);
    }
  }
});

test('U049 an event without a reducer counter change stays a typed unknown entry with null detail', () => {
  const model = T.using({ reducer: boundedReducer() });
  const built = answer(() => model.build(consoleRun({}, { entries: [{ type: 'event' }] })), 'counter-neutral event');
  assert.equal(built.ok, true);
  assert.deepEqual(built.marks, ['unknown-entry']);
  assert.equal(built.stateAt(0).detail, null);
});

test('U049 entry construction creates an empty current-position marker rather than injecting stale marker text', () => {
  const { StubElement, loadPage } = require('.\\dom-stub.cjs');
  const append = StubElement.prototype.append;
  let markers = 0;
  StubElement.prototype.append = function (...nodes) {
    if (this.tag === 'li') for (const node of nodes) if (node?.className === 'here') {
      markers += 1;
      assert.equal(node.textContent, '', 'the newly created marker is empty before rendering the selected position');
    }
    return Reflect.apply(append, this, nodes);
  };
  try {
    const page = answer(() => loadPage({ hash: '#run=c044-complete&pos=1' }), 'entry marker construction');
    assert.equal(page.position(), 1);
    assert.equal(markers, 24);
  } finally { StubElement.prototype.append = append; }
});

test('U049 a real timeline refuses an unknown jump kind without throwing or choosing a different jump list', () => {
  const built = T.build(find('c044-restart-gap'));
  let value;
  assert.doesNotThrow(() => { value = T.jump(built, 0, 'not-a-kind', 1); });
  assert.equal(value, null);
});

test('U049 the exact occurrence counter boundary is admitted or typed-refused by build and both verification entry points', () => {
  const model = T.using({ reducer: boundedReducer() });
  const target = model.build(consoleRun({}));
  for (const count of [199990, 199991]) {
    const input = consoleRun(new Array(count).fill(0));
    for (const call of [() => model.build(input), () => model.verify(input), () => model.verify(input, target)]) {
      const observed = answer(call, `counted boundary ${count}`);
      if (count === 199990) assert.equal(observed.ok, true);
      else {
        assert.equal(observed.ok, false);
        assert.equal(observed.code, 'SAVED_RUN_TOO_LARGE');
      }
    }
  }
});

test('U049 a gap in a different epoch cannot replace the requested epochs after-recorded refusal', () => {
  const built = T.build(find('c044-restart-gap'));
  let exercised = 0;
  for (const window of built.limits.epochs) for (const gap of built.limits.gaps) {
    if (gap.epoch === window.epoch || gap.from <= window.lastSeq) continue;
    const found = answer(() => T.locate(built, window.epoch, gap.from), 'cross-epoch sequence lookup');
    assert.deepEqual(found, { ok: false, code: 'NOT_RECORDED', reason: 'after-recorded', range: { from: window.lastSeq + 1, to: window.total } });
    exercised += 1;
  }
  assert.ok(exercised > 0, 'a real retained cross-epoch gap was checked');
});

test('U049 trace source normalization ignores only nonobject metadata and never invents an object or unreadable producer', () => {
  for (const source of [undefined, null, false, 1, 'source', () => {}]) {
    const built = answer(() => T.build({ ...find('c034-held-snapshot'), source }), 'trace source normalization');
    assert.equal(built.ok, true);
    assert.equal(built.source, null);
  }
});

test('U049 nonstring trace codes expose null detail while a real unknown string remains explicit', () => {
  const events = [{ code: 7 }, { code: false }, { code: {} }, null, { code: 'not-known' }];
  const model = T.using({ trace: { validateSnapshot: () => ({ valid: true, attempts: [] }) } });
  const built = answer(() => model.build({ ...find('c034-held-snapshot'), snapshot: { events } }), 'unknown trace codes');
  assert.equal(built.ok, true);
  assert.deepEqual(built.marks, new Array(5).fill('unknown-code'));
  assert.deepEqual(events.map((event, index) => built.stateAt(index).detail), [null, null, null, null, 'not-known']);
});

test('U049 a one-event started trace has one incomplete attempt at position one rather than reading a penultimate state', () => {
  const events = [{ code: 'ORIGINAL_ATTEMPT_STARTED', attemptId: 'a1' }];
  const model = T.using({ trace: { validateSnapshot: () => ({ valid: true, attempts: [{ attemptId: 'a1', classification: 'partial-unknown', requests: 0, responses: 0 }] }) } });
  const built = answer(() => model.build({ ...find('c034-held-snapshot'), snapshot: { events } }), 'one-event trace');
  assert.equal(built.ok, true);
  assert.equal(built.limits.status, 'INCOMPLETE');
  assert.deepEqual(built.limits.attempts, [{
    attemptId: 'a1', phase: 'running', classification: 'partial-unknown', requests: 0, responses: 0, startPosition: 1, endPosition: null,
  }]);
});

test('U049 a recording beginning at sequence two reports the single missing first sequence exactly', () => {
  const base = find('c044-complete');
  const events = base.entries.filter((entry) => entry.type === 'event');
  const built = answer(() => T.build({ ...base, entries: events.slice(1, 5) }), 'recording begins at sequence two');
  assert.equal(built.ok, true);
  assert.deepEqual(built.limits.notRecorded, [
    { epoch: 1, from: 1, to: 1, why: 'before-first' }, { epoch: 1, from: 6, to: 22, why: 'after-last' },
  ]);
});

test('U049 dependency-seam epoch windows sort numerically and completeness checks both endpoints independently', () => {
  const scenario = (states, total) => {
    const base = boundedReducer();
    const model = T.using({ reducer: { ...base, reduce(state, entry) {
      return { ...state, ...states[entry.offset], counts: { ...state.counts, applied: state.counts.applied + 1 } };
    } } });
    const producer = total === null ? null : { lastSeq: total, totalSteps: 1, replayWindow: 1 };
    const input = consoleRun({}, { producer, entries: states.map((state, offset) => ({ type: 'event', offset })) });
    const built = answer(() => model.build(input), 'declared reducer seam');
    assert.equal(built.ok, true);
    return built;
  };
  const sorted = scenario([{ epoch: 2, lastSeq: 1 }, { epoch: 1, lastSeq: 1 }], 1);
  assert.deepEqual(sorted.limits.epochs.map((window) => window.epoch), [1, 2]);
  for (const sequence of [[2, 2, 3], [1, 1, 2]]) {
    const built = scenario(sequence.map((lastSeq) => ({ epoch: 1, lastSeq })), 3);
    assert.equal(built.limits.epochs[0].recorded, 3);
    assert.equal(built.limits.epochs[0].complete, false);
  }
  const unspecified = scenario([{ epoch: 1, lastSeq: -1 }], null);
  assert.deepEqual(unspecified.limits.notRecorded, [], 'an unspecified total never creates an after-last range in the dependency seam');
});

test('U049 producer consistency checks applied deliveries rather than a dependency-seam control state', () => {
  const base = boundedReducer();
  const model = T.using({ reducer: { ...base, reduce(state) { return { ...state, lastSeq: 2 }; } } });
  const built = answer(() => model.build(consoleRun({}, { producer: { lastSeq: 1, totalSteps: 1, replayWindow: 1 } })), 'counter-neutral control');
  assert.equal(built.ok, true);
  assert.deepEqual(built.marks, ['control']);
  assert.deepEqual(built.limits.epochs, []);
});

test('U049 optional producer accessors are not reread after an undefined sentinel during ownership admission', () => {
  const model = T.using({ reducer: boundedReducer() });
  const target = model.build(consoleRun({}));
  for (const [operation, limit] of [['build', 1], ['verify', 2], ['supplied verify', 1]]) {
    let reads = 0;
    const input = Object.defineProperty(consoleRun({}), 'producer', { enumerable: true, get() {
      reads += 1;
      if (reads > limit) throw new Error('an extra producer read is not allowed');
      return undefined;
    } });
    const observed = answer(() => operation === 'build' ? model.build(input) : operation === 'verify' ? model.verify(input) : model.verify(input, target), operation);
    assert.equal(observed.ok, true);
    assert.equal(reads, limit);
  }
});

test('U049 a defined producer accessor retains its second-read value and cannot bypass the saved-work refusal', () => {
  const model = T.using({ reducer: boundedReducer() });
  const target = model.build(consoleRun({}));
  let reads = 0;
  const input = Object.defineProperty(consoleRun({}), 'producer', { enumerable: true, get() {
    reads += 1;
    return reads === 1 ? { lastSeq: 1, totalSteps: 1, replayWindow: 1 } : shared(40);
  } });
  const observed = answer(() => model.verify(input, target), 'second-read producer graph');
  assert.equal(observed.ok, false);
  assert.equal(observed.code, 'SAVED_RUN_TOO_LARGE');
  assert.equal(reads, 2);
});

test('U049 verification does not freeze newly produced collaborator states during its independent forward pass', () => {
  const base = boundedReducer();
  const model = T.using({ reducer: { ...base, reduce(state) {
    return { ...state, observedFrozenInput: Object.isFrozen(state) };
  } } });
  const input = consoleRun({}, { entries: [{ type: 'open' }, { type: 'open' }] });
  const built = answer(() => model.build(input), 'build freezes its produced states');
  assert.equal(built.ok, true);
  assert.equal(built.stateAt(1).state.observedFrozenInput, true);
  assert.deepEqual(answer(() => model.verify(input, built), 'independent pass'), {
    ok: false, checked: 2, mismatches: [{ index: 1, what: 'state' }],
  });
});
