'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require(process.env.S014_MODEL_UNDER_TEST || './schedule.js');

test('a calendar creates an observed attempt without inventing ready capacity', () => {
  const initial = model.createState();
  const scheduled = model.schedule(initial, {
    demandAt: 30, lead: 20, provision: 8, warm: 7,
    target: 4, demand: 120, fixture: 'healthy',
  });
  assert.equal(scheduled.attempts.length, 1, 'accepted calendar must create one synthetic attempt');
  assert.equal(scheduled.attempts[0].deployed, 2, 'calendar entry alone must not deploy capacity');
  assert.equal(scheduled.attempts[0].ready, 2, 'calendar entry alone must not prove readiness');
  assert.equal(scheduled.attempts[0].firstReadyAt, null);
  assert.equal(initial.attempts.length, 0, 'previous state must not be rewritten');
});

function scheduled(overrides = {}, state = model.createState()) {
  return model.schedule(state, { ...model.DEFAULTS, ...overrides });
}

function finish(state) {
  while (!model.current(state).finished) state = model.advance(state);
  return model.assess(state);
}

test('default schedule actually fires, deploys and warms before 40 measured journeys', () => {
  const state = finish(scheduled());
  const run = model.current(state);
  assert.equal(run.triggerAt, 10);
  assert.equal(run.startedAt, 10);
  assert.equal(run.firstReadyAt, 25);
  assert.equal(run.verdict, 'pass');
  assert.equal(run.clients.length, 40);
  assert.equal(run.trace.find((row) => row.event === 'deployment observed').at, 18);
  assert.equal(run.trace.find((row) => row.event === 'deployment observed').ready, 2);
  assert.equal(run.trace.find((row) => row.event === 'readiness observed').at, 25);
  assert.deepEqual(run.assessments[0].metrics, {
    total: 40, successful: 40, interrupted: 0, unknown: 0,
    successFraction: 1, windowComplete: true,
  });
  assert.ok(run.assessments[0].checks.every((item) => item.status === 'pass'));
  assert.ok(run.clients.every((client) => client.completed && client.payloadCorrect
    && client.stateIntact && client.latencyMs <= model.CONTRACT.budgetMs));
});

test('short lead time keeps a correct calendar but records late readiness and eight interruptions', () => {
  const run = model.current(finish(scheduled({ lead: 5 })));
  assert.equal(run.scheduleAccepted, true);
  assert.equal(run.startedAt, 25);
  assert.equal(run.firstReadyAt, 40);
  assert.equal(run.verdict, 'fail');
  assert.equal(run.assessments[0].metrics.interrupted, 8);
  assert.equal(run.assessments[0].metrics.successful, 32);
  assert.equal(run.assessments[0].metrics.total, 40);
  assert.equal(run.assessments[0].checks.find((item) => item.id === 'ready-before').status, 'fail');
});

test('readiness exactly at demand is not readiness before demand, even with no client errors', () => {
  const run = model.current(finish(scheduled({ lead: 15 })));
  assert.equal(run.firstReadyAt, 30);
  assert.equal(run.assessments[0].metrics.interrupted, 0);
  assert.equal(run.verdict, 'fail');
});

for (const fixture of ['missed-trigger', 'provisioning-failure', 'warmup-failure', 'slow-clients']) {
  test(`${fixture} is an observed failure, not a calendar-derived success`, () => {
    const run = model.current(finish(scheduled({ fixture })));
    assert.equal(run.verdict, 'fail');
    assert.ok(run.assessments[0].metrics.interrupted > 0);
    assert.equal(run.assessments[0].metrics.total, 40);
    if (fixture === 'slow-clients') {
      assert.equal(run.firstReadyAt, 25);
      assert.ok(run.clients.every((client) => client.completed && client.latencyMs === 1000));
    } else {
      assert.equal(run.firstReadyAt, null);
      assert.equal(run.ready, 2);
    }
  });
}

for (const fixture of ['missing-readiness', 'missing-clients']) {
  test(`${fixture} keeps all unknown clients and never fills observations with the plan`, () => {
    const run = model.current(finish(scheduled({ fixture })));
    assert.equal(run.verdict, 'unknown');
    assert.equal(run.assessments[0].metrics.unknown, 40);
    assert.equal(run.assessments[0].metrics.total, 40);
    assert.equal(run.assessments[0].metrics.successFraction, 0);
    assert.ok(run.clients.every((client) => client.completed === null && client.latencyMs === null));
    if (fixture === 'missing-readiness') {
      assert.equal(run.firstReadyAt, null);
      assert.equal(run.plannedReadyAt, 25);
      assert.equal(run.ready, null);
      assert.equal(run.eligible, null);
    } else assert.equal(run.firstReadyAt, 25);
  });
}

test('unsupported schedule never executes, samples, or invents a success fraction', () => {
  const run = model.current(finish(scheduled({ fixture: 'unsupported-schedule' })));
  assert.equal(run.verdict, 'unsupported');
  assert.equal(run.scheduleAccepted, false);
  assert.equal(run.startedAt, null);
  assert.equal(run.clients.length, 0);
  assert.equal(run.assessments[0].metrics.successFraction, null);
  assert.equal(run.firstReadyAt, null);
});

test('a healthy but insufficient target fails the effective-capacity and client checks', () => {
  const run = model.current(finish(scheduled({ target: 3, demand: 121 })));
  assert.equal(run.firstReadyAt, 25);
  assert.equal(run.verdict, 'fail');
  assert.equal(run.assessments[0].checks.find((item) => item.id === 'capacity').status, 'fail');
  assert.equal(run.assessments[0].metrics.interrupted, 4);
});

test('the exact declared capacity boundary is accepted', () => {
  const run = model.current(finish(scheduled({ target: 3, demand: 120 })));
  assert.equal(run.verdict, 'pass');
});

test('empty or partial windows cannot pass and their assessments remain immutable', () => {
  let state = model.assess(scheduled());
  const early = structuredClone(model.current(state).assessments);
  assert.equal(early[0].verdict, 'incomplete');
  assert.equal(early[0].metrics.successFraction, null);
  assert.equal(early[0].metrics.total, 0);
  for (let count = 0; count < 6; count += 1) state = model.advance(state);
  state = model.assess(state);
  assert.equal(model.current(state).verdict, 'incomplete');
  assert.equal(model.current(state).clients.length, 10);
  const done = finish(state);
  assert.equal(model.current(done).verdict, 'pass');
  assert.deepEqual(model.current(done).assessments.slice(0, 1), early);
  assert.equal(model.current(done).assessments.length, 3);
});

test('timely planned readiness with missing observations never becomes observed readiness', () => {
  const run = model.current(finish(scheduled({ fixture: 'missing-readiness' })));
  assert.equal(run.plannedReadyAt, 25);
  assert.equal(run.trace.find((row) => row.event === 'readiness unknown').at, 25);
  assert.equal(run.firstReadyAt, null);
  assert.equal(run.assessments[0].checks.find((item) => item.id === 'ready-before').status, 'unknown');
});

test('a late readiness event outside the window remains unobserved rather than fabricated', () => {
  const run = model.current(finish(scheduled({ lead: 0, provision: 60, warm: 60 })));
  assert.equal(run.plannedReadyAt, 150);
  assert.equal(run.now, 50);
  assert.equal(run.firstReadyAt, null);
  assert.equal(run.verdict, 'fail');
});

test('a trigger at zero with zero durations produces actual same-tick observations in order', () => {
  const run = model.current(finish(scheduled({ lead: 30, provision: 0, warm: 0 })));
  assert.equal(run.startedAt, 0);
  assert.equal(run.firstReadyAt, 0);
  assert.equal(run.verdict, 'pass');
  assert.deepEqual(run.trace.slice(1, 4).map((row) => row.event),
    ['schedule observed', 'deployment observed', 'readiness observed']);
});

for (const value of ['', ' ', '1.2', -1, NaN, Infinity, true, null, [], {}, '1e2', '0x20', '120x']) {
  test(`invalid input ${String(value)} is recorded without altering any active observations`, () => {
    const existing = scheduled();
    const prior = structuredClone(existing.attempts);
    const rejected = scheduled({ demand: value }, existing);
    assert.deepEqual(rejected.attempts, prior);
    assert.equal(rejected.actions.at(-1).disposition, 'invalid');
    assert.match(rejected.message, /demand must be a whole number/);
    assert.equal(existing.actions.length, 1);
  });
}

test('all numeric bounds, impossible lead and unrecognized fixtures are validated', () => {
  for (const overrides of [
    { demandAt: 19 }, { demandAt: 121 }, { lead: 121 }, { lead: -1 }, { lead: 31 },
    { provision: 61 }, { warm: -1 }, { target: 2 }, { target: 9 }, { demand: 321 },
    { fixture: 'native-is-definitely-supported' }, { fixture: '__proto__' },
  ]) {
    const result = scheduled(overrides);
    assert.equal(result.attempts.length, 0, JSON.stringify(overrides));
    assert.equal(result.actions[0].disposition, 'invalid');
  }
});

test('missing configuration and unfinished rescheduling are rejected with preserved lineage', () => {
  assert.equal(model.schedule(model.createState(), null).attempts.length, 0);
  const state = scheduled();
  const rescheduled = scheduled({}, state);
  assert.deepEqual(rescheduled.attempts, state.attempts);
  assert.equal(rescheduled.actions.at(-1).disposition, 'invalid');
  assert.equal(rescheduled.nextAttempt, 2);
});

test('numeric strings from actual browser controls are supported without coercing booleans or blanks', () => {
  const state = model.schedule(model.createState(), Object.fromEntries(
    Object.entries(model.DEFAULTS).map(([key, value]) => [key, String(value)])));
  assert.equal(model.current(state).config.demand, 120);
});

test('a later healthy run retains failed, unknown and unsupported attempts unchanged', () => {
  let state = finish(scheduled({ lead: 5 }));
  state = finish(scheduled({ fixture: 'missing-clients' }, state));
  state = finish(scheduled({ fixture: 'unsupported-schedule' }, state));
  const previous = structuredClone(state.attempts);
  state = finish(scheduled({}, state));
  assert.deepEqual(state.attempts.slice(0, 3), previous);
  assert.deepEqual(state.attempts.map((run) => run.verdict), ['fail', 'unknown', 'unsupported', 'pass']);
  const totals = model.summary(state);
  assert.equal(totals.fail, 1);
  assert.equal(totals.unknown, 1);
  assert.equal(totals.pass, 1);
  assert.equal(totals.unsupported, 1);
  assert.equal(totals.clients.total, 120);
  assert.equal(totals.clients.unknown, 40);
  assert.equal(totals.clients.interrupted, 8);
});

test('model states, configurations, snapshots and client records are deeply immutable', () => {
  const state = finish(scheduled());
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(model.current(state).trace[0]));
  assert.ok(Object.isFrozen(model.current(state).clients[0]));
  assert.throws(() => { model.current(state).config.demand = 1; }, TypeError);
  assert.throws(() => { state.attempts.pop(); }, TypeError);
  assert.throws(() => { model.current(state).clients[0].outcome = 'unknown'; }, TypeError);
});

test('advance and assess without an attempt, and advance after completion, are retained invalid actions', () => {
  let state = model.advance(model.createState());
  state = model.assess(state);
  assert.equal(state.actions.length, 2);
  assert.ok(state.actions.every((item) => item.disposition === 'invalid'));
  const complete = finish(scheduled());
  assert.deepEqual(model.advance(complete).attempts, complete.attempts);
});

test('reset creates a clean in-memory record without mutating the original history', () => {
  const completed = finish(scheduled({ lead: 5 }));
  const empty = model.reset();
  assert.equal(empty.attempts.length, 0);
  assert.equal(empty.actions.length, 0);
  assert.equal(empty.nextAttempt, 1);
  assert.equal(model.summary(empty).clients.successFraction, null);
  assert.equal(model.current(completed).verdict, 'fail');
});
