'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, LIMITS, createSession, step } = require('./model.js');
const start = (overrides = {}) => step(createSession(), 'start', { ...DEFAULTS, ...overrides });
const drain = (overrides = {}) => step(start(overrides), 'begin-scale-in');
const ticks = (state, count) => {
  for (let n = 0; n < count; n++) state = step(state, 'tick');
  return state;
};
const finish = (overrides = {}) => step(ticks(drain(overrides), 4), 'retire');
const release = (overrides = {}) => {
  let state = ticks(drain({ mode: 'release', ...overrides }), 1);
  state = step(state, 'checkpoint');
  return step(state, 'release');
};

test('loadable API, fixed defaults and explicit finite teaching bounds', () => {
  assert.equal(typeof createSession, 'function');
  assert.equal(typeof step, 'function');
  assert.deepEqual(DEFAULTS, { mode: 'finish', leaseTicks: 5, graceTicks: 6, workBudget: 8, condition: 'complete' });
  assert.deepEqual(LIMITS, { units: 4, ticks: 12, events: 40, archives: 4, renewals: 4 });
});

test('start accounts for exactly one claimed job, not two consumers worth of success', () => {
  const state = start();
  assert.equal(state.phase, 'ACTIVE');
  assert.equal(state.job?.owner, 'consumer-A');
  assert.equal(state.job.epoch, 1);
  assert.equal(state.job.progress, 0);
  assert.equal(state.job.leaseUntil, 5);
  assert.equal(state.metrics.attempted, 1);
  assert.equal(state.metrics.pending, 1);
  assert.equal(state.result.verifier, 'UNKNOWN');
});

test('finish observes completion once before actual consumer removal', () => {
  const state = step(finish(), 'verify');
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.result.workOutcome, 'SUCCESS');
  assert.equal(state.result.cleanup, 'NO_RESOURCES');
  assert.equal(state.admission, 'CLOSED');
  assert.equal(state.actualConsumers, 1);
  assert.equal(state.retirement, 'OBSERVED');
  assert.equal(state.job.effects, 1);
  assert.equal(state.job.completedAt, 4);
  assert.equal(state.job.completedBy, 'consumer-A');
  assert.deepEqual(state.metrics, { attempted: 1, succeeded: 1, failed: 0, unknown: 0, pending: 0, effects: 1 });
});

test('retirement cannot bypass admission closure or unfinished work', () => {
  let state = step(start(), 'retire');
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.actualConsumers, 2);
  state = step(step(state, 'begin-scale-in'), 'retire');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  assert.equal(state.job.owner, 'consumer-A');
  assert.equal(state.job.status, 'PENDING');
  assert.notEqual(state.result.verifier, 'PASS');
});

test('completion without observed retirement is not successful scale-in', () => {
  const state = step(ticks(drain(), 4), 'verify');
  assert.equal(state.result.verifier, 'UNKNOWN');
  assert.equal(state.metrics.succeeded, 1);
  assert.equal(state.actualConsumers, 2);
  assert.equal(state.retirement, 'NOT_REQUESTED');
});

test('renew preserves original deadlines and does not permit stopping an active owner', () => {
  let state = ticks(drain({ mode: 'renew', leaseTicks: 2 }), 1);
  state = step(state, 'renew');
  assert.equal(state.job?.leaseUntil, 3);
  state = step(state, 'retire');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  assert.equal(state.actualConsumers, 2);
  state = step(ticks(state, 1), 'renew');
  state = step(ticks(state, 1), 'renew');
  state = step(ticks(state, 1), 'retire');
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.renewals, 3);
  assert.equal(state.job.deadline, 8);
  assert.equal(state.drainDeadline, 6);
  assert.equal(state.job.effects, 1);
});

test('repeating renewal at the same tick cannot manufacture extra lease time', () => {
  let state = step(ticks(drain({ mode: 'renew', leaseTicks: 2 }), 1), 'renew');
  state = step(state, 'renew');
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.job.leaseUntil, 3);
  assert.equal(state.renewals, 1);
});

test('denied renewal leaves the original lease and expiry fails without a business effect', () => {
  let state = ticks(drain({ mode: 'renew', leaseTicks: 2, condition: 'renew-denied' }), 1);
  state = step(state, 'renew');
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.job.leaseUntil, 2);
  state = ticks(state, 1);
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.metrics.failed, 1);
  assert.equal(state.job.effects, 0);
  assert.ok(state.violations.includes('lease-expired'));
});

test('lease expiry is exclusive and expired authority cannot renew or complete', () => {
  let state = ticks(drain({ mode: 'renew', leaseTicks: 2 }), 2);
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.job?.progress, 1);
  state = step(state, 'renew');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  assert.equal(state.job.effects, 0);
});

test('renewing authority cannot stretch shutdown grace', () => {
  let state = drain({ mode: 'renew', leaseTicks: 2, graceTicks: 2 });
  for (let n = 0; n < 3; n++) state = step(ticks(state, 1), 'renew');
  state = step(ticks(state, 1), 'retire');
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.metrics.succeeded, 1);
  assert.equal(state.actualConsumers, 2);
  assert.ok(state.violations.includes('shutdown-grace-exceeded'));
  assert.equal(state.drainDeadline, 2);
});

test('release transfers acknowledged progress and ownership before shutdown, not a second job', () => {
  let state = release();
  assert.equal(state.job?.owner, null);
  assert.equal(state.job.released, true);
  assert.equal(state.job.checkpoint, 1);
  assert.equal(state.job.checkpointAcknowledged, true);
  state = step(state, 'retire');
  assert.equal(state.actualConsumers, 1);
  assert.equal(state.result.verifier, 'UNKNOWN');
  assert.equal(state.metrics.pending, 1);
  state = step(state, 'claim');
  assert.equal(state.job.owner, 'consumer-B');
  assert.equal(state.job.epoch, 2);
  assert.equal(state.job.progress, 1);
  assert.equal(state.job.deadline, 8);
  state = ticks(state, 3);
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.job.completedBy, 'consumer-B');
  assert.equal(state.job.completedAt, 4);
  assert.equal(state.job.effects, 1);
  assert.equal(state.metrics.attempted, 1);
});

test('a checkpoint of zero is valid only after an explicit acknowledged save', () => {
  let state = drain({ mode: 'release' });
  state = step(state, 'checkpoint');
  assert.equal(state.job?.checkpointAcknowledged, true);
  assert.equal(state.job.checkpoint, 0);
  state = step(step(step(state, 'release'), 'retire'), 'claim');
  state = ticks(state, 4);
  assert.equal(state.result.verifier, 'PASS');
});

test('missing checkpoint blocks release and B cannot steal the live claim', () => {
  let state = step(drain({ mode: 'release' }), 'release');
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  state = step(state, 'claim');
  assert.equal(state.lastAction.verdict, 'BLOCKED');
  assert.equal(state.job.owner, 'consumer-A');
  assert.equal(state.job.epoch, 1);
  assert.equal(state.actualConsumers, 2);
});

test('a stale saved checkpoint does not cover later acknowledged progress', () => {
  let state = step(ticks(drain({ mode: 'release' }), 1), 'checkpoint');
  state = step(ticks(state, 1), 'release');
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.job.checkpoint, 1);
  assert.equal(state.job.progress, 2);
  state = step(step(state, 'checkpoint'), 'release');
  assert.equal(state.job.released, true);
  assert.equal(state.job.checkpoint, 2);
});

test('missing checkpoint observation cannot be converted into a saved receipt', () => {
  let state = step(ticks(drain({ mode: 'release', condition: 'checkpoint-missing' }), 1), 'checkpoint');
  assert.equal(state.lastAction?.verdict, 'UNKNOWN');
  assert.equal(state.job.checkpointAcknowledged, false);
  state = step(step(state, 'release'), 'retire');
  assert.equal(state.actualConsumers, 2);
  assert.equal(state.result.verifier, 'UNKNOWN');
});

test('unobserved release gives neither B ownership nor authority to declare safe shutdown', () => {
  let state = release({ condition: 'ownership-unknown' });
  assert.equal(state.job?.status, 'UNKNOWN');
  assert.equal(state.job.owner, 'UNVERIFIED');
  assert.equal(state.metrics.unknown, 1);
  state = step(step(state, 'claim'), 'retire');
  assert.equal(state.actualConsumers, 2);
  assert.equal(state.job.epoch, 1);
  assert.equal(state.result.verifier, 'UNKNOWN');
});

test('unavailable completion proof preserves an unknown job and effect count', () => {
  const state = step(ticks(drain({ condition: 'completion-unknown' }), 4), 'retire');
  assert.equal(state.metrics.unknown, 1);
  assert.equal(state.job?.effects, null);
  assert.equal(state.result.verifier, 'UNKNOWN');
  assert.equal(state.actualConsumers, 2);
});

test('unobserved consumer removal cannot invent a one-consumer result', () => {
  const state = finish({ condition: 'retirement-unknown' });
  assert.equal(state.retirement, 'UNVERIFIED');
  assert.equal(state.actualConsumers, null);
  assert.equal(state.metrics.succeeded, 1);
  assert.equal(state.result.verifier, 'UNKNOWN');
});

test('a confirmed abrupt stop fails a held job and later ticks do not erase it', () => {
  let state = step(ticks(drain(), 1), 'force-stop', { confirmed: true });
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.job?.status, 'FAILED');
  assert.equal(state.actualConsumers, 1);
  assert.ok(state.violations.includes('unsafe-shutdown-claimed-work'));
  state = step(ticks(state, 4), 'verify');
  assert.equal(state.metrics.failed, 1);
  assert.equal(state.job.effects, 0);
});

test('fault consent must be explicit and is not inferred from ordinary retirement', () => {
  const state = step(drain(), 'force-stop', { confirmed: false });
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.actualConsumers, 2);
  assert.equal(state.metrics.pending, 1);
});

test('original job deadline is not reset when a successor claims released work', () => {
  let state = step(step(release({ workBudget: 3 }), 'retire'), 'claim');
  state = ticks(state, 3);
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.job?.deadline, 3);
  assert.equal(state.metrics.failed, 1);
  assert.equal(state.job.effects, 0);
  assert.ok(state.violations.includes('original-work-deadline-exceeded'));
});

test('completion exactly at the original work deadline and retirement at grace are allowed', () => {
  const state = finish({ workBudget: 4, graceTicks: 4 });
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.job?.completedAt, 4);
});

test('late shutdown remains a failed scale-in even when the job succeeds', () => {
  const state = finish({ graceTicks: 3 });
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.metrics.succeeded, 1);
  assert.equal(state.job?.effects, 1);
  assert.equal(state.actualConsumers, 2);
});

test('known abrupt-stop failure takes precedence over unknown retirement proof', () => {
  const state = step(drain({ condition: 'retirement-unknown' }), 'force-stop', { confirmed: true });
  assert.equal(state.result.verifier, 'FAIL');
  assert.equal(state.metrics.failed, 1);
  assert.equal(state.retirement, 'UNVERIFIED');
  assert.equal(state.actualConsumers, null);
});

test('checks and post-completion ticks cannot create another business effect', () => {
  let state = finish();
  state = step(step(ticks(state, 4), 'verify'), 'verify');
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.job?.effects, 1);
  assert.equal(state.metrics.attempted, 1);
  assert.equal(state.clock, 8);
});

test('reset preserves complete failed and unknown attempts while restoring a fresh baseline', () => {
  let state = step(drain(), 'force-stop', { confirmed: true });
  const failed = state;
  state = step(state, 'reset');
  assert.equal(state.attempt, 2);
  assert.equal(state.phase, 'IDLE');
  assert.equal(state.config, null);
  assert.equal(state.history.length, 1);
  assert.deepEqual(state.history[0].events, failed.events);
  assert.equal(state.history[0].result.verifier, 'FAIL');
  state = step(state, 'start', { ...DEFAULTS, condition: 'completion-unknown' });
  state = step(ticks(step(state, 'begin-scale-in'), 4), 'reset');
  assert.equal(state.history.length, 2);
  assert.equal(state.history[1].metrics.unknown, 1);
  assert.equal(state.history[0].result.verifier, 'FAIL');
});

test('full archives refuse destructive reset rather than deleting the oldest failure', () => {
  let state = createSession();
  for (let n = 0; n < LIMITS.archives; n++) {
    state = step(step(step(state, 'start', { ...DEFAULTS }), 'begin-scale-in'), 'reset');
  }
  state = step(step(state, 'start', { ...DEFAULTS }), 'reset');
  assert.equal(state.history.length, 4);
  assert.equal(state.attempt, 5);
  assert.equal(state.phase, 'ACTIVE');
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.history[0].attempt, 1);
});

test('logical time is bounded without silently completing or evicting evidence', () => {
  let state = ticks(drain(), LIMITS.ticks);
  const before = state.events.length;
  state = step(state, 'tick');
  assert.equal(state.clock, 12);
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.events.length, before + 1);
});

test('identical commands yield identical deeply immutable detached snapshots', () => {
  const a = finish();
  const b = finish();
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.job), true);
  assert.equal(Object.isFrozen(a.events), true);
  assert.throws(() => { a.job.effects = 99; }, TypeError);
  const earlier = drain();
  const later = ticks(earlier, 1);
  assert.equal(earlier.job.progress, 0);
  assert.equal(later.job.progress, 1);
  assert.notEqual(earlier.job, later.job);
});
