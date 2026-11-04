'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');
const load = (presetId = 'stable-key') => ({
  type: 'load', presetId, eventId: 'fictional-event-135', budgetMs: 1000,
});
const copy = (value) => JSON.parse(JSON.stringify(value));
function run(presetId, state = model.createState()) {
  for (const command of [load(presetId), { type: 'cutover' }, { type: 'redeliver' }, { type: 'measure' }]) {
    state = model.execute(state, command);
  }
  return state;
}
function rejected(state, command, code) {
  const before = JSON.stringify(state);
  assert.throws(() => model.execute(state, command), (error) => error instanceof model.LessonGuardError && error.code === code);
  assert.equal(JSON.stringify(state), before, 'rejection must not mutate input state');
}

test('load, cutover and delayed redelivery expose DATA before measuring exactly one event', () => {
  const before = model.createState();
  const command = load();
  const originalCommand = copy(command);
  let state = model.execute(before, command);
  assert.equal(before.phase, 'ready');
  assert.equal(before.history.length, 0);
  assert.notEqual(state, before);
  assert.deepEqual(command, originalCommand);
  assert.equal(state.phase, 'loaded');
  assert.equal(state.attempts.length, 1);
  assert.equal(state.attempts[0].version, 'v1');
  assert.equal(state.results.length, 0);
  state = model.execute(state, { type: 'cutover' });
  assert.equal(state.phase, 'cutover');
  assert.equal(state.attempts.length, 1, 'cutover is not an event attempt or effect');
  state = model.execute(state, { type: 'redeliver' });
  assert.equal(state.phase, 'redelivered');
  assert.equal(state.attempts.length, 2);
  assert.equal(state.results.length, 0);
  assert.equal(state.attempts[0].eventId, state.attempts[1].eventId);
  assert.equal(state.attempts[0].key, state.attempts[1].key);
  state = model.execute(state, { type: 'measure' });
  assert.equal(state.phase, 'measured');
  assert.equal(state.results.length, 1);
  assert.equal(state.results[0].eventCount, 1);
  assert.equal(state.results[0].deliveryAttempts, 2);
  assert.equal(state.results[0].observedEffects, 1);
  assert.equal(state.results[0].verifiedCorrectBusinessResults, 1);
  assert.deepEqual(model.summarize(state), {
    deliveryAttempts: 2, measuredEvents: 1, positive: 1, negative: 0,
    unknown: 0, retainedUnknownAttempts: 0, actions: 4,
  });
});

test('six fixed presets measure positive, negative and unknown status without inflating effects', async (t) => {
  const expected = {
    'stable-key': ['positive', 'verified-positive', 1, 0, 0, 1, /ONE correct effect/],
    'versioned-key': ['negative', 'verified-negative', 2, 1, 0, 0, /version-scoped key/],
    'lost-ack': ['unknown', 'unverified', 1, 0, 1, 0, /acknowledgement lost/],
    'unknown-completion': ['unknown', 'unverified', 1, 0, 1, 0, /completion was unobserved/],
    'budget-exceeded': ['negative', 'verified-negative', 1, 0, 0, 0, /1250 ms exceeds the ORIGINAL 1000 ms/],
    'wrong-effect': ['negative', 'verified-negative', 1, 0, 0, 0, /state or result is not/],
  };
  assert.deepEqual(Object.keys(model.PRESETS), Object.keys(expected));
  for (const [presetId, [outcome, verification, effects, duplicates, unknownAttempts, correct, reason]] of Object.entries(expected)) {
    await t.test(presetId, () => {
      const state = run(presetId);
      const result = state.results[0];
      assert.equal(result.eventCount, 1);
      assert.equal(result.deliveryAttempts, 2);
      assert.equal(result.outcome, outcome);
      assert.equal(result.verification, verification);
      assert.equal(result.observedEffects, effects);
      assert.equal(result.duplicateEffects, duplicates);
      assert.equal(result.unknownAttemptCount, unknownAttempts);
      assert.equal(result.verifiedCorrectBusinessResults, correct);
      assert.match(result.reasons.join(' '), reason);
      assert.equal(result.originalStartMs, 0);
      assert.equal(result.budgetMs, 1000);
      assert.equal(state.attempts[1].acknowledgement, 'received');
      const counts = model.summarize(state);
      assert.equal(counts.positive + counts.negative + counts.unknown, 1);
    });
  }
});

test('original lost acknowledgement survives acknowledged deduplicated recovery', () => {
  const state = run('lost-ack');
  assert.equal(state.attempts[0].acknowledgement, 'lost');
  assert.equal(state.attempts[0].completion, 'completed');
  assert.equal(state.attempts[0].effectsAfter.length, 1);
  assert.equal(state.attempts[1].acknowledgement, 'received');
  assert.equal(state.attempts[1].completion, 'deduplicated');
  assert.equal(state.results[0].acknowledgedAttempts, 1);
  assert.equal(state.results[0].outcome, 'unknown');
  assert.equal(state.results[0].verification, 'unverified');
  assert.equal(state.results[0].verifiedCorrectBusinessResults, 0);
  assert.match(state.results[0].recovery, /ORIGINAL unknown remains unverified/);
  assert.match(state.history[0].detail, /acknowledgement lost/);
  assert.match(state.history[3].detail, /unknown; unverified/);
});

test('later observed one-effect snapshot cannot retroactively prove original completion or state', () => {
  const state = run('unknown-completion');
  assert.equal(state.attempts[0].completion, 'unknown');
  assert.equal(state.attempts[0].dedupState, 'unobserved');
  assert.equal(state.attempts[0].effectsAfter, null, 'unknown is not coerced to zero effects');
  assert.equal(state.attempts[1].effectsAfter.length, 1);
  assert.equal(state.results[0].observedEffects, 1, 'latest snapshot is distinguished from historic unknown');
  assert.equal(state.results[0].unknownAttemptCount, 1);
  assert.equal(state.results[0].outcome, 'unknown');
  assert.equal(state.results[0].verification, 'unverified');
  assert.equal(state.results[0].verifiedCorrectBusinessResults, 0);
  assert.match(state.results[0].reasons.join(' '), /original effect snapshot was unobserved/);
});

test('same one-row effect snapshot on two attempts is never two new correct results', () => {
  const state = run('stable-key');
  assert.deepEqual(state.attempts[0].effectsAfter, state.attempts[1].effectsAfter);
  assert.equal(state.attempts.reduce((sum, attempt) => sum + attempt.effectsAfter.length, 0), 2, 'additive snapshots would be misleading');
  assert.equal(state.results[0].observedEffects, 1);
  assert.equal(state.results[0].verifiedCorrectBusinessResults, 1);
  assert.equal(model.summarize(state).positive, 1);
  const duplicate = run('versioned-key').results[0];
  assert.equal(duplicate.observedEffects, 2);
  assert.equal(duplicate.verifiedCorrectBusinessResults, 0, 'duplicate row is not a second correct business event');
});

test('original budget does not restart at redelivery and one acknowledged effect may be incorrect', () => {
  const late = run('budget-exceeded');
  assert.equal(late.attempts[1].elapsedMs, 1250);
  assert.equal(late.results[0].originalStartMs, 0);
  assert.equal(late.results[0].budgetMs, 1000);
  assert.equal(late.results[0].outcome, 'negative');
  const wrong = run('wrong-effect');
  assert.equal(wrong.results[0].observedEffects, 1);
  assert.equal(wrong.results[0].acknowledgedAttempts, 2);
  assert.equal(wrong.results[0].outcome, 'negative');
  assert.equal(wrong.results[0].verifiedCorrectBusinessResults, 0);
  assert.match(wrong.results[0].reasons.join(' '), /state changed/);
});

test('later positive rehearsal retains earlier duplicate and lost-ack results in all denominators', () => {
  let state = run('versioned-key');
  state = run('lost-ack', state);
  const old = copy(state);
  state = run('stable-key', state);
  assert.deepEqual(state.attempts.slice(0, 4), old.attempts);
  assert.deepEqual(state.results.slice(0, 2), old.results);
  assert.deepEqual(state.history.slice(0, 8), old.history);
  assert.deepEqual(model.summarize(state), {
    deliveryAttempts: 6, measuredEvents: 3, positive: 1, negative: 1,
    unknown: 1, retainedUnknownAttempts: 1, actions: 12,
  });
  assert.equal(state.results[0].observedEffects, 2);
  assert.equal(state.results[1].verification, 'unverified');
});

test('four rehearsals and sixteen actions are retained without pruning; action seventeen requires reset', () => {
  let state = model.createState();
  for (const presetId of ['versioned-key', 'lost-ack', 'stable-key', 'unknown-completion']) state = run(presetId, state);
  assert.equal(state.history.length, 16);
  assert.equal(state.attempts.length, 8);
  assert.equal(state.results.length, 4);
  assert.deepEqual(model.summarize(state), {
    deliveryAttempts: 8, measuredEvents: 4, positive: 1, negative: 1,
    unknown: 2, retainedUnknownAttempts: 2, actions: 16,
  });
  rejected(state, load(), 'ERR_LESSON_LIMIT');
  rejected(state, { type: 'measure' }, 'ERR_LESSON_LIMIT');
  assert.equal(model.createState().history.length, 0);
});

test('typed load records reject coercion, wrong tokens, extra fields and unsafe budget values', async (t) => {
  const bad = [
    null, false, true, 1, 'load', [], [load()], () => load(),
    {}, { type: 'Load' }, { type: ' load' }, { type: 'reset' },
    { ...load(), presetId: 'toString' }, { ...load(), presetId: '__proto__' },
    { ...load(), presetId: 'stable-key ' }, { ...load(), presetId: new String('stable-key') },
    { ...load(), eventId: ' fictional-event-135' }, { ...load(), eventId: 'fictional-event-135 ' },
    { ...load(), eventId: true }, { ...load(), eventId: 135 },
    { ...load(), acknowledgement: 'received' },
    { ...load(), budgetMs: '1000' }, { ...load(), budgetMs: true },
    { ...load(), budgetMs: NaN }, { ...load(), budgetMs: Infinity },
    { ...load(), budgetMs: -1 }, { ...load(), budgetMs: 999 },
    { ...load(), budgetMs: 1001 }, { ...load(), budgetMs: 1000.5 },
    { ...load(), budgetMs: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'cutover', budgetMs: 1000 }, { type: Symbol('load') },
  ];
  for (let index = 0; index < bad.length; index++) {
    await t.test(`invalid typed record ${index + 1}`, () => rejected(model.createState(), bad[index], 'ERR_LESSON_INPUT'));
  }
});

test('descriptor, symbol, array and prototype guards never invoke an input accessor', () => {
  let reads = 0;
  const getter = { ...load() };
  Object.defineProperty(getter, 'eventId', { enumerable: true, get() { reads++; return 'fictional-event-135'; } });
  const hidden = { ...load() };
  Object.defineProperty(hidden, 'hidden', { enumerable: false, value: true });
  const symbol = { ...load(), [Symbol('hidden')]: true };
  const inherited = Object.assign(Object.create({ inherited: true }), load());
  const hole = new Array(1);
  const extraArray = Object.assign([], { hidden: true });
  const customArray = Object.setPrototypeOf([], {});
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('descriptor trap'); } });
  const cycle = { type: 'load' };
  cycle.self = cycle;
  const polluted = JSON.parse('{"type":"load","presetId":"stable-key","eventId":"fictional-event-135","budgetMs":1000,"__proto__":{"s135Polluted":true}}');
  for (const command of [getter, hidden, symbol, inherited, hole, extraArray, customArray, hostile, cycle, polluted]) {
    rejected(model.createState(), command, 'ERR_LESSON_INPUT');
  }
  assert.equal(reads, 0);
  assert.equal({}.s135Polluted, undefined);
});

test('every out-of-order action is a safe hold without mutation', () => {
  const ready = model.createState();
  const loaded = model.execute(ready, load());
  const cutover = model.execute(loaded, { type: 'cutover' });
  const redelivered = model.execute(cutover, { type: 'redeliver' });
  const measured = model.execute(redelivered, { type: 'measure' });
  for (const [state, actions] of [
    [ready, ['cutover', 'redeliver', 'measure']],
    [loaded, ['load', 'redeliver', 'measure']],
    [cutover, ['load', 'cutover', 'measure']],
    [redelivered, ['load', 'cutover', 'redeliver']],
    [measured, ['cutover', 'redeliver', 'measure']],
  ]) {
    for (const type of actions) rejected(state, type === 'load' ? load() : { type }, 'ERR_LESSON_ORDER');
  }
});

test('deterministic state replay rejects forged attempts, positive results and pruned or reordered history', () => {
  const original = run('lost-ack');
  const forgeries = [
    (state) => { state.phase = 'ready'; },
    (state) => { state.schemaVersion = '1'; },
    (state) => { state.extra = true; },
    (state) => { state.active.budgetMs = 1250; },
    (state) => { state.active.runNumber = 2; },
    (state) => { state.attempts[0].acknowledgement = 'received'; },
    (state) => { state.attempts[0].effectsAfter = []; },
    (state) => { state.attempts.shift(); },
    (state) => { state.results[0].outcome = 'positive'; },
    (state) => { state.results[0].verification = 'verified-positive'; },
    (state) => { state.results[0].unknownAttemptCount = 0; },
    (state) => { state.results[0].verifiedCorrectBusinessResults = 2; },
    (state) => { state.results[0].reasons = []; },
    (state) => { state.history.pop(); },
    (state) => { state.history[0].command.presetId = 'stable-key'; },
    (state) => { state.history[0].detail = 'Success'; },
    (state) => { state.history[0].step = 4; },
    (state) => { state.history.reverse(); },
    (state) => { state.history[2].command.type = 'measure'; },
  ];
  for (const forge of forgeries) {
    const state = copy(original);
    forge(state);
    rejected(state, load(), 'ERR_LESSON_STATE');
    assert.throws(() => model.summarize(state), (error) => error.code === 'ERR_LESSON_STATE');
  }
  assert.equal(original.attempts[0].acknowledgement, 'lost');
});

test('state descriptor and shape attacks reject safely without accessor reads', () => {
  let reads = 0;
  const getter = copy(run('stable-key'));
  Object.defineProperty(getter, 'results', { enumerable: true, get() { reads++; return []; } });
  const symbol = { ...copy(model.createState()), [Symbol('history')]: [] };
  const sparse = copy(run('stable-key'));
  delete sparse.history[1];
  const aliased = copy(run('stable-key'));
  aliased.attempts[1].effectsAfter = aliased.attempts[0].effectsAfter;
  const huge = copy(model.createState());
  huge.history = new Array(65).fill(null);
  for (const state of [undefined, null, [], 'ready', getter, symbol, sparse, aliased, huge]) {
    assert.throws(() => model.execute(state, load()), (error) => error.code === 'ERR_LESSON_STATE');
  }
  assert.equal(reads, 0);
});

test('ordinary JSON serialized state and reordered record keys preserve values, not object identities', () => {
  const original = run('lost-ack');
  const serialized = copy(original);
  const reordered = {
    history: serialized.history, results: serialized.results, attempts: serialized.attempts,
    active: serialized.active, phase: serialized.phase, schemaVersion: serialized.schemaVersion,
  };
  const after = model.execute(reordered, load('stable-key'));
  assert.equal(after.phase, 'loaded');
  assert.deepEqual(after.results, original.results);
  assert.deepEqual(after.history.slice(0, 4), original.history);
  assert.deepEqual(model.execute(Object.assign(Object.create(null), model.createState()), load()).phase, 'loaded');
});

test('fixtures, returned state and summary are deeply immutable fixed DATA with no actual effect operation', () => {
  function frozen(value) {
    if (value && typeof value === 'object') {
      assert.equal(Object.isFrozen(value), true);
      for (const child of Object.values(value)) frozen(child);
    }
  }
  frozen(model.CONFIG);
  frozen(model.PRESETS);
  frozen(run('unknown-completion'));
  frozen(model.summarize(run('stable-key')));
  assert.equal(model.CONFIG.maximumActions, 16);
  assert.equal(model.CONFIG.maximumRuns, 4);
  assert.equal(model.CONFIG.eventId, 'fictional-event-135');
  for (const fixture of Object.values(model.PRESETS)) {
    assert.equal(fixture.deliveries.length, 2);
    assert.deepEqual(fixture.deliveries.map((attempt) => attempt.version), ['v1', 'v2']);
    assert.deepEqual(fixture.deliveries.map((attempt) => attempt.eventId), ['fictional-event-135', 'fictional-event-135']);
  }
  assert.throws(() => { model.PRESETS['stable-key'].deliveries[0].acknowledgement = 'lost'; }, TypeError);
});
