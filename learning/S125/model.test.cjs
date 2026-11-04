'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

test('nominal update records a candidate but keeps old routing until observed readiness', () => {
  const state = model.execute(model.createState(), { type: 'update', fixture: 'ready', version: 'v2' });
  assert.equal(state.phase, 'awaiting-readiness');
  assert.equal(state.candidate.revision, 'lesson-api--r2');
  assert.equal(state.readiness, 'unobserved');
  assert.equal(state.trafficResult, 'unobserved');
  assert.deepEqual(state.traffic, { old: 100, candidate: 0 });
  assert.equal(state.oldLifecycle, 'active');
  assert.equal(state.completed, false);
  assert.equal(state.outcome, 'unknown');
  assert.equal(state.oldImage, 'fictional-image-v1');
  assert.equal(state.candidate.image, 'fictional-image-v2');
  assert.deepEqual(state.replicaTarget, { before: 2, after: 2, minimum: 2, maximum: 2 });
  assert.equal(state.changeKind, model.CHANGE_KIND);
  assert.equal(state.history.length, 1);
});

const command = (type) => ({ type });
const update = (fixture = 'ready') => model.execute(model.createState(), { type: 'update', fixture, version: 'v2' });
const ready = (fixture = 'ready') => model.execute(update(fixture), command('readiness'));
const switched = (fixture = 'ready') => model.execute(ready(fixture), command('traffic'));
const verified = (fixture = 'ready') => model.execute(switched(fixture), command('continuity'));
const copy = (value) => JSON.parse(JSON.stringify(value));

for (const [fixture, result, failingCheck] of [
  ['ready', 'positive', null],
  ['provision-failed', 'negative', 'provisioning'],
  ['replicas-short', 'negative', 'requiredReplicas'],
  ['startup-failed', 'negative', 'startupProbes'],
  ['probe-failed', 'negative', 'readinessProbes'],
  ['readiness-unknown', 'unknown', 'provisioning'],
]) test(`readiness ${fixture} is ${result}, not observed traffic`, () => {
  const state = ready(fixture);
  assert.equal(state.readiness, result);
  assert.equal(state.outcome, result);
  assert.equal(state.trafficResult, 'unobserved');
  assert.deepEqual(state.traffic, { old: 100, candidate: 0 });
  assert.equal(state.oldLifecycle, 'active');
  assert.equal(state.completed, false);
  if (failingCheck) assert.equal(state.data.checks[failingCheck], result);
  if (result !== 'positive') {
    const hold = model.execute(state, command('traffic'));
    assert.equal(hold.trafficResult, 'unobserved');
    assert.deepEqual(hold.traffic, { old: 100, candidate: 0 });
    assert.equal(hold.oldLifecycle, 'active');
    assert.equal(hold.safeHolds, 1);
    assert.equal(hold.journeys.attempted, 0);
  }
});

test('positive readiness only permits replacement; separate observed traffic is required', () => {
  const state = ready();
  assert.equal(state.phase, 'ready-awaiting-traffic');
  assert.equal(state.oldLifecycle, 'active');
  assert.equal(state.candidateLifecycle, 'ready');
  const premature = model.execute(state, command('continuity'));
  assert.equal(premature.outcome, 'negative');
  assert.equal(premature.journeys.attempted, 0);
  const traffic = model.execute(premature, command('traffic'));
  assert.equal(traffic.phase, 'switched-awaiting-continuity');
  assert.equal(traffic.trafficResult, 'positive');
  assert.deepEqual(traffic.traffic, { old: 0, candidate: 100 });
  assert.equal(traffic.oldLifecycle, 'inactive');
  assert.equal(traffic.completed, false);
  assert.equal(traffic.sessions, 'unobserved');
  assert.equal(traffic.work, 'unobserved');
});

for (const [fixture, result, route, lifecycle] of [
  ['traffic-mismatch', 'negative', { old: 100, candidate: 0 }, 'active'],
  ['traffic-unknown', 'unknown', null, 'unknown'],
]) test(`${fixture} cannot pass as effective replacement or continuity`, () => {
  const state = switched(fixture);
  assert.equal(state.trafficResult, result);
  assert.equal(state.outcome, result);
  assert.deepEqual(state.traffic, route);
  assert.deepEqual(state.lastTraffic, { old: 100, candidate: 0 });
  assert.equal(state.oldLifecycle, lifecycle);
  const hold = model.execute(state, command('continuity'));
  assert.equal(hold.journeys.attempted, 0);
  assert.equal(hold.completed, false);
  assert.equal(hold.trafficResult, result);
});

for (const [fixture, sessions, work, overall, counts] of [
  ['ready', 'positive', 'positive', 'positive', [2, 0, 0]],
  ['session-lost', 'negative', 'positive', 'negative', [1, 1, 0]],
  ['work-interrupted', 'positive', 'negative', 'negative', [2, 0, 0]],
  ['work-unknown', 'positive', 'unknown', 'unknown', [2, 0, 0]],
  ['journey-unknown', 'unknown', 'positive', 'unknown', [1, 0, 1]],
  ['latency-breach', 'negative', 'positive', 'negative', [1, 1, 0]],
]) test(`${fixture}: sessions and old work are independent ${overall} observations`, () => {
  const state = verified(fixture);
  assert.equal(state.sessions, sessions);
  assert.equal(state.work, work);
  assert.equal(state.outcome, overall);
  assert.equal(state.completed, overall === 'positive');
  assert.deepEqual(state.journeys, { attempted: 2, passed: counts[0], failed: counts[1], unknown: counts[2] });
  assert.equal(state.journeys.attempted, state.journeys.passed + state.journeys.failed + state.journeys.unknown);
  assert.equal(state.data.oldWork.observation.startedOn, 'lesson-api--r1');
  assert.equal(state.data.sessions.journeys[0].observation.expectedRevision, 'lesson-api--r2');
  const repeated = model.execute(state, command('continuity'));
  assert.equal(repeated.outcome, 'negative');
  assert.equal(repeated.completed, state.completed);
  assert.deepEqual(repeated.journeys, state.journeys);
  assert.deepEqual(repeated.history.slice(0, 4), state.history);
  if (overall !== 'positive') assert.equal(repeated.completed, false);
});

test('every premature action is a retained safe hold and no readiness is fabricated', () => {
  let state = model.createState();
  for (const type of ['readiness', 'traffic', 'continuity']) state = model.execute(state, command(type));
  assert.equal(state.phase, 'baseline');
  assert.equal(state.history.length, 3);
  assert.equal(state.safeHolds, 3);
  assert.equal(state.readiness, 'unobserved');
  assert.deepEqual(state.traffic, { old: 100, candidate: 0 });
  assert.equal(state.journeys.attempted, 0);
  state = model.execute(state, { type: 'update', fixture: 'ready', version: 'v2' });
  for (const type of ['readiness', 'traffic', 'continuity']) state = model.execute(state, command(type));
  assert.equal(state.completed, true);
  assert.equal(state.safeHolds, 3);
  assert.equal(state.history.length, 7);
  assert.equal(state.history[0].outcome, 'negative');
});

test('candidate and fixture cannot be silently replaced after update', () => {
  const original = update('work-interrupted');
  const repeated = model.execute(original, { type: 'update', fixture: 'ready', version: 'v2' });
  assert.equal(repeated.fixture, 'work-interrupted');
  assert.deepEqual(repeated.candidate, original.candidate);
  assert.equal(repeated.safeHolds, 1);
  assert.equal(repeated.phase, 'awaiting-readiness');
});

test('exact typed commands reject missing/extra fields, unknown actions and coercion', () => {
  const initial = model.createState();
  const invalid = [
    null, [], 'update', { type: 'reset' }, { type: 'traffic', candidate: 100 },
    { type: 'update', fixture: 'ready' },
    { type: 'update', fixture: 'ready', version: 2 },
    { type: 'update', fixture: 'ready', version: ['v2'] },
    { type: 'update', fixture: 0, version: 'v2' },
    { type: 'update', fixture: '__proto__', version: 'v2' },
    { type: 'update', fixture: 'ready', version: ' v2' },
    { type: 'update', fixture: 'ready', version: 'v2 ' },
    { type: 'update', fixture: 'ready', version: 'V2' },
    { type: 'update', fixture: 'ready', version: '<script>v2</script>' },
    { type: 'update', fixture: 'ready', version: 'v2', image: 'other' },
  ];
  for (const input of invalid) {
    assert.throws(() => model.execute(initial, input), { code: 'ERR_COMMAND' });
    assert.equal(initial.history.length, 0);
  }
});

test('non-JSON, sparse, cyclic, prototype and accessor inputs are rejected without getter execution', () => {
  const initial = model.createState();
  let invoked = false;
  const accessor = { get type() { invoked = true; return 'traffic'; } };
  const cyclic = { type: 'traffic' };
  cyclic.extra = cyclic;
  for (const input of [
    accessor, cyclic, Object.create({ type: 'traffic' }),
    { type: 'traffic', extra: NaN }, { type: 'traffic', extra: Infinity },
    { type: 'traffic', extra: undefined }, { type: 'traffic', extra: new Date() },
    { type: 'traffic', extra: Array(1) }, { type: 'traffic', [Symbol('hidden')]: 1 },
  ]) assert.throws(() => model.execute(initial, input), { code: 'ERR_COMMAND' });
  assert.equal(invoked, false);
});

test('deterministic replay guards state, facts, outcomes, history and counters', () => {
  const state = verified('work-unknown');
  const forgeries = [
    (item) => { item.oldLifecycle = 'active'; },
    (item) => { item.readiness = 'unknown'; },
    (item) => { item.traffic.candidate = 0; },
    (item) => { item.candidate.image = 'other-image'; },
    (item) => { item.replicaTarget.after = 4; },
    (item) => { item.journeys.attempted = 0; },
    (item) => { item.completed = true; },
    (item) => { item.work = 'positive'; },
    (item) => { item.data.oldWork.observation.committedEffectCount = 1; },
    (item) => { item.history[0].command.fixture = 'ready'; },
    (item) => { item.history[1].data.checks.startupProbes = 'negative'; },
    (item) => { item.history[2].sequence = 99; },
    (item) => { item.history.pop(); },
    (item) => { item.extra = true; },
  ];
  for (const forge of forgeries) {
    const malformed = copy(state);
    forge(malformed);
    assert.throws(() => model.execute(malformed, command('continuity')), { code: 'ERR_STATE' });
  }
  for (const malformed of [null, [], { history: [] }, { ...copy(state), history: Array(1) }]) {
    assert.throws(() => model.execute(malformed, command('traffic')), { code: 'ERR_STATE' });
  }
  assert.equal(model.execute(copy(state), command('continuity')).history.length, 5);
});

test('state and fixed evidence are deeply immutable and input commands are copied', () => {
  const input = { type: 'update', fixture: 'ready', version: 'v2' };
  const state = model.execute(model.createState(), input);
  input.fixture = 'provision-failed';
  assert.equal(state.history[0].command.fixture, 'ready');
  assert.throws(() => { state.traffic.old = 0; }, TypeError);
  assert.throws(() => { state.history[0].command.fixture = 'provision-failed'; }, TypeError);
  assert.throws(() => { model.FIXTURES.push('other'); }, TypeError);
  assert.deepEqual(model.createState(), model.createState());
  assert.deepEqual(verified(), verified());
});

test('history limit keeps all twelve entries; reset is a new baseline, not pruning', () => {
  let state = model.createState();
  for (let index = 0; index < model.HISTORY_LIMIT; index++) state = model.execute(state, command('traffic'));
  const before = copy(state);
  assert.throws(() => model.execute(state, command('traffic')), { code: 'ERR_HISTORY_LIMIT' });
  assert.deepEqual(state, before);
  assert.equal(state.history.length, 12);
  assert.equal(state.safeHolds, 12);
  assert.deepEqual(model.createState().history, []);
  assert.equal(model.createState().oldLifecycle, 'active');
  assert.deepEqual(model.createState().traffic, { old: 100, candidate: 0 });
});
