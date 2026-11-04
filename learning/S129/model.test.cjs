'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const start = {
  type: 'begin', host: 'supporting-slots', policy: 'deduplicate',
  budget: 6, consent: true,
};
function through(actions) {
  let state = model.send(model.createState(), start);
  for (const type of actions) state = model.send(state, { type });
  return state;
}

test('the behavioral baseline loads without module or syntax failure', () => {
  assert.equal(typeof model.send, 'function');
  assert.equal(typeof model.assess, 'function');
  assert.equal(model.createState().runs.length, 0);
});

test('swap retains every started journey: positive, interruption and unknown', () => {
  const result = model.assess(through(['swap']));
  assert.deepEqual(result.counts, {
    attempted: 3, uninterrupted: 1, interrupted: 1, unknown: 1,
  });
});

test('successful replay cannot erase the original interruption or unknown execution', () => {
  const result = model.assess(through(['swap', 'probe', 'replay', 'evaluate']));
  assert.equal(result.counts.interrupted, 1);
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.knownQueueEffects, 1);
});

function configured(options, actions = ['swap', 'probe', 'replay', 'evaluate']) {
  let state = model.send(model.createState(), { ...start, ...options });
  for (const type of actions) state = model.send(state, { type });
  return state;
}
function rejected(state, command, code) {
  const before = JSON.stringify(state);
  assert.throws(() => model.send(state, command), { code });
  assert.equal(JSON.stringify(state), before);
}

test('pre-swap active executions and precommitted queue effect are not migrated journeys', () => {
  const state = configured({}, []);
  const result = model.assess(state);
  assert.deepEqual(result.originalExecutions.map((execution) => execution.status), ['active', 'active']);
  assert.equal(result.knownQueueEffects, 1);
  assert.equal(result.queue.checkpoint, 2);
  assert.equal(result.counts.attempted, 0);
  assert.equal(result.uninterruptedRate, null);
  assert.equal(result.zeroDowntime, false);
});

test('swap routes new invocations but old-slot retention adds no compute or execution protection', () => {
  const state = through(['swap']);
  const run = state.runs[0];
  assert.deepEqual(run.swap, { status: 'successful', newTriggers: 'candidate-v2', retainedSlot: 'old-v1', addedCompute: 0 });
  assert.deepEqual(run.executions.map((execution) => execution.status), ['terminated', 'unknown', 'completed']);
  assert.equal(run.journeys[2].destination, 'candidate-v2');
  assert.equal(run.journeys[0].elapsed > run.journeys[0].budget, true);
});

test('HTTP 200 is a probe only and leaves all original execution receipts unchanged', () => {
  let state = through(['swap']);
  const originals = state.runs[0].executions;
  const journeys = state.runs[0].journeys;
  state = model.send(state, { type: 'probe' });
  assert.deepEqual(state.runs[0].probe, {
    status: 200, destination: 'candidate-v2', countedAsJourney: false, executionRecoveryVerified: false,
  });
  assert.equal(state.runs[0].executions, originals);
  assert.equal(state.runs[0].journeys, journeys);
  assert.equal(model.assess(state).counts.attempted, 3);
});

test('safe replay records a separate execution, checkpoint and acknowledgment with one known effect', () => {
  const state = configured({});
  const run = state.runs[0];
  const result = model.assess(state);
  assert.equal(run.replay.fromCheckpoint, 2);
  assert.equal(run.replay.requiredTicks, 6);
  assert.equal(run.replay.acknowledgmentObserved, true);
  assert.equal(run.queue.checkpoint, 3);
  assert.equal(run.queue.effects, 1);
  assert.equal(run.replayedExecution.original, 'EX-old-queue');
  assert.equal(run.replayedExecution.status, 'completed');
  assert.equal(run.executions[0].status, 'terminated');
  assert.equal(run.executions[0].acknowledgment, 'lost');
  assert.equal(run.executions[1].status, 'unknown');
  assert.match(run.replay.httpReplay, /not provided/);
  assert.match(result.unknownHttpEffects, /unknown/);
  assert.match(result.verification, /^PASS/);
  assert.match(result.impact, /^Interrupted/);
  assert.equal(result.uninterruptedRate, 1 / 3);
  for (const flag of ['zeroDowntime', 'nativeVerified', 'sourceParentComplete']) assert.equal(result[flag], false);
});

test('blind replay fails business-effect acceptance despite successful swap/probe/replay/ack', () => {
  const state = configured({ policy: 'blind-replay' });
  const result = model.assess(state);
  assert.equal(result.swap, 'successful');
  assert.match(result.probe, /HTTP 200/);
  assert.equal(result.recovery, 'completed');
  assert.equal(state.runs[0].replay.acknowledgmentObserved, true);
  assert.equal(result.knownQueueEffects, 2);
  assert.equal(result.duplicateEffects, 1);
  assert.match(result.verification, /^FAIL/);
  assert.deepEqual(result.counts, { attempted: 3, uninterrupted: 1, interrupted: 1, unknown: 1 });
});

test('short recovery window cannot invent completion, advanced checkpoint or acknowledgment', () => {
  const state = configured({ budget: 5 });
  const run = state.runs[0];
  const result = model.assess(state);
  assert.equal(run.replay.status, 'unverified');
  assert.equal(run.replay.observedTicks, 5);
  assert.equal(run.replay.acknowledgmentObserved, false);
  assert.equal(run.queue.checkpoint, 2);
  assert.equal(run.queue.effects, 1);
  assert.equal(run.replayedExecution.status, 'unknown');
  assert.match(result.verification, /^UNVERIFIED/);
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.counts.interrupted, 1);
});

test('all twenty fixed budget/policy combinations preserve original attribution', () => {
  for (let budget = 1; budget <= 10; budget++) {
    for (const policy of Object.keys(model.policies)) {
      const state = configured({ budget, policy });
      const result = model.assess(state);
      assert.deepEqual(result.counts, { attempted: 3, uninterrupted: 1, interrupted: 1, unknown: 1 });
      assert.equal(result.knownQueueEffects, budget >= 6 && policy === 'blind-replay' ? 2 : 1);
      assert.equal(result.recovery, budget >= 6 ? 'completed' : 'unverified');
      assert.equal(result.zeroDowntime, false);
    }
  }
});

test('unsupported Flex and Functions-on-Container-Apps cases have no started/exposed sample', () => {
  for (const host of ['flex-no-slots', 'functions-container-apps']) {
    const prepared = configured({ host }, []);
    assert.equal(model.assess(prepared).unknownHttpEffects, 'not observed');
    const swapped = model.send(prepared, { type: 'swap' });
    assert.equal(swapped.runs[0].phase, 'unsupported');
    rejected(swapped, { type: 'probe' }, 'ERR_PHASE');
    rejected(swapped, { type: 'replay' }, 'ERR_PHASE');
    const result = model.assess(model.send(swapped, { type: 'evaluate' }));
    assert.match(result.verification, /^UNSUPPORTED/);
    assert.equal(result.counts.attempted, 0);
    assert.equal(result.uninterruptedRate, null);
    assert.equal(result.knownQueueEffects, 0);
    assert.deepEqual(result.originalExecutions, []);
    assert.equal(result.zeroDowntime, false);
  }
});

test('typed budget, host, policy and literal consent do not coerce malformed inputs', () => {
  const state = model.createState();
  for (const budget of ['6', 0, -1, 11, 6.5, NaN, Infinity, null, false, new Number(6)]) {
    rejected(state, { ...start, budget }, 'ERR_INPUT');
  }
  for (const consent of [false, 'true', 1, null, undefined, new Boolean(true)]) {
    rejected(state, { ...start, consent }, 'ERR_INPUT');
  }
  for (const host of ['Supporting-slots', ' supporting-slots', '__proto__', 'premium', null, 1]) {
    rejected(state, { ...start, host }, 'ERR_INPUT');
  }
  for (const policy of ['deduplicate ', 'automatic', '__proto__', null, true]) {
    rejected(state, { ...start, policy }, 'ERR_INPUT');
  }
});

test('budget text parser accepts only exact canonical decimal integers 1 through 10', () => {
  for (let number = 1; number <= 10; number++) assert.equal(model.parseBudget(String(number)), number);
  for (const raw of ['', ' 6', '6 ', '+6', '-6', '06', '6.0', '6e0', '0x6', '11', '0', '6\n', 6, null]) {
    assert.throws(() => model.parseBudget(raw), { code: 'ERR_INPUT', field: 'budget' });
  }
});

test('commands require exact own data fields and reject accessors without evaluating them', () => {
  const state = model.createState();
  for (const command of [null, [], false, Object.create(null), { ...start, extra: true }, { ...start, [Symbol('extra')]: 1 }, { ...start, type: ' deploy' }, { ...start, type: true }]) {
    rejected(state, command, 'ERR_INPUT');
  }
  const missing = { ...start };
  delete missing.policy;
  rejected(state, missing, 'ERR_INPUT');
  let reads = 0;
  const accessor = { ...start };
  Object.defineProperty(accessor, 'host', { get() { reads++; return 'supporting-slots'; } });
  rejected(state, accessor, 'ERR_INPUT');
  assert.equal(reads, 0);
  const typeAccessor = { ...start };
  Object.defineProperty(typeAccessor, 'type', { get() { reads++; return 'begin'; } });
  rejected(state, typeAccessor, 'ERR_INPUT');
  assert.equal(reads, 0);
  rejected(configured({}, []), { type: 'swap', budget: 6 }, 'ERR_INPUT');
});

test('idle, ordered, repeated and completed phase guards never mutate issued state', () => {
  const idle = model.createState();
  for (const type of ['swap', 'probe', 'replay', 'evaluate', 'reset']) rejected(idle, { type }, 'ERR_PHASE');
  let state = configured({}, []);
  rejected(state, start, 'ERR_PHASE');
  for (const type of ['probe', 'replay', 'evaluate']) rejected(state, { type }, 'ERR_PHASE');
  state = model.send(state, { type: 'swap' });
  rejected(state, { type: 'swap' }, 'ERR_PHASE');
  rejected(state, { type: 'replay' }, 'ERR_PHASE');
  state = model.send(state, { type: 'probe' });
  rejected(state, { type: 'evaluate' }, 'ERR_PHASE');
  rejected(state, { type: 'probe' }, 'ERR_PHASE');
  state = model.send(state, { type: 'replay' });
  rejected(state, { type: 'replay' }, 'ERR_PHASE');
  state = model.send(state, { type: 'evaluate' });
  for (const type of ['swap', 'probe', 'replay', 'evaluate']) rejected(state, { type }, 'ERR_PHASE');
});

test('forged/imported state and nested mutation cannot rewrite original failures or authority', () => {
  const state = configured({});
  for (const forged of [null, {}, { runs: [], current: null }, JSON.parse(JSON.stringify(state)), Object.create(state)]) {
    assert.throws(() => model.send(forged, { type: 'reset' }), { code: 'ERR_STATE' });
    assert.throws(() => model.assess(forged), { code: 'ERR_STATE' });
  }
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.runs[0].events[1].observation.executions[0]), true);
  assert.throws(() => { state.runs[0].journeys[0].outcome = 'uninterrupted'; }, TypeError);
  assert.throws(() => { state.runs[0].executions[1].status = 'completed'; }, TypeError);
  assert.throws(() => { state.runs.length = 0; }, TypeError);
  assert.throws(() => { model.hosts['live-host'] = 'live'; }, TypeError);
  assert.equal(model.assess(state).counts.interrupted, 1);
});

test('reset retains exact inputs, original receipts and result events instead of erasing them', () => {
  const completed = configured({ policy: 'blind-replay' });
  const before = JSON.stringify(completed.runs[0].events);
  const reset = model.send(completed, { type: 'reset' });
  assert.equal(reset.current, null);
  assert.equal(reset.runs.length, 1);
  assert.equal(reset.runs[0].reset, true);
  assert.equal(JSON.stringify(reset.runs[0].events.slice(0, -1)), before);
  assert.equal(reset.runs[0].journeys[0].outcome, 'interrupted');
  assert.equal(reset.runs[0].journeys[1].outcome, 'unknown');
  assert.equal(reset.runs[0].queue.effects, 2);
  assert.deepEqual(reset.runs[0].events.map((entry) => entry.type), ['begin', 'swap', 'probe', 'replay', 'evaluate', 'reset']);
  const next = model.send(reset, start);
  assert.equal(next.current, 2);
  assert.equal(next.runs[0], reset.runs[0]);
});

test('every legal early reset retains partial evidence without inventing a checked result', () => {
  for (const actions of [[], ['swap'], ['swap', 'probe'], ['swap', 'probe', 'replay']]) {
    const state = through(actions);
    const reset = model.send(state, { type: 'reset' });
    assert.equal(reset.runs[0].events.length, actions.length + 2);
    assert.equal(reset.runs[0].events.at(-1).type, 'reset');
    assert.equal(reset.runs[0].journeys.length, actions.length ? 3 : 0);
  }
});

test('six-run, six-event bound is enforced without pruning any history', () => {
  let state = model.createState();
  for (let run = 1; run <= model.MAX_RUNS; run++) {
    state = model.send(state, start);
    for (const type of ['swap', 'probe', 'replay', 'evaluate', 'reset']) state = model.send(state, { type });
    assert.equal(state.runs[run - 1].events.length, 6);
  }
  assert.equal(state.runs.length, 6);
  assert.equal(state.runs.flatMap((run) => run.events).length, 36);
  rejected(state, start, 'ERR_BOUND');
  assert.equal(state.runs[0].journeys[1].outcome, 'unknown');
});

test('identical fixed actions produce deterministic results and immutable observations', () => {
  const first = configured({ policy: 'deduplicate', budget: 8 });
  const second = configured({ policy: 'deduplicate', budget: 8 });
  assert.deepEqual(first, second);
  const observed = model.assess(first);
  assert.equal(Object.isFrozen(observed), true);
  assert.equal(Object.isFrozen(observed.counts), true);
  assert.deepEqual(observed, model.assess(second));
});
