'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const { CONTRACT, LIMITS, createSession, act, assess, summary, parseBudget } = model;
const steps = ['switchProcess', 'process', 'switchPoll', 'poll', 'switchDownload', 'download'];
function start(options = {}) {
  return act(createSession(), {
    type: 'submit', scenario: 'preserved', requester: CONTRACT.owner, budgetMs: 40, ...options,
  });
}
function journey(options = {}, initial = createSession()) {
  let state = act(initial, { type: 'submit', scenario: 'preserved', requester: CONTRACT.owner, budgetMs: 40, ...options });
  for (const type of steps) state = act(state, { type });
  return act(state, { type: 'check' });
}
const result = (state) => state.results.at(-1) || {};
const checkpoint = (state, id) => result(state).checks.find((check) => check.id === id);

test('loadable contract: fixed-fiction oracle and initial state are available', () => {
  assert.equal(CONTRACT.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.deepEqual(CONTRACT.bytes, [83, 49, 52, 48, 10, 49, 44, 55, 10]);
  assert.equal(createSession().stage, 'ready');
  assert.equal(createSession().attempt, 0);
  assert.ok(Object.isFrozen(CONTRACT.bytes));
  assert.equal(typeof act, 'function');
  assert.equal(typeof assess, 'function');
});

test('complete owner journey preserves job, final bytes, isolation, access and independent tiers', () => {
  const state = journey();
  assert.equal(result(state).outcome, 'positive');
  assert.equal(state.stage, 'downloaded');
  assert.equal(state.active.request.syntheticHttpStatus, 202);
  assert.equal(state.active.job.id, CONTRACT.jobId);
  assert.equal(state.active.job.state, 'completed');
  assert.equal(state.active.poll.syntheticHttpStatus, 200);
  assert.equal(state.active.download.syntheticHttpStatus, 200);
  assert.deepEqual(state.active.download.bytes, CONTRACT.bytes);
  assert.equal(state.active.download.authorization.allow, true);
  assert.equal(state.active.download.foreignProbe.allow, false);
  assert.equal(state.active.download.foreignProbe.syntheticHttpStatus, 403);
  assert.deepEqual(state.active.tiers, {
    submit: 'submit-v1', process: 'processor-v2', poll: 'poller-v2', download: 'download-v2',
  });
  assert.equal(result(state).elapsedMs, 30);
  assert.equal(result(state).comparedBytes, 9);
  assert.ok(result(state).checks.every((check) => check.status === 'pass'));
  assert.deepEqual(summary(state), { attempted: 1, positive: 1, negative: 0, unknown: 0, unassessed: 0 });
  assert.equal(result(state).nativeAzureResult, 'unverified');
});

test('HTTP 200 and completed job without authorized artifact observation remain unknown', () => {
  let state = start();
  for (const type of steps.slice(0, 4)) state = act(state, { type });
  assert.equal(state.stage, 'polled');
  assert.equal(state.active.job.state, 'completed');
  assert.equal(state.active.poll.syntheticHttpStatus, 200);
  state = act(state, { type: 'check' });
  assert.equal(result(state).outcome, 'unknown');
  for (const id of ['artifact', 'bytes', 'authorization', 'isolation', 'download']) {
    assert.equal(checkpoint(state, id).status, 'unknown', id);
  }
  assert.equal(summary(state).positive, 0);
  assert.equal(summary(state).unknown, 1);
});

test('artifact loss is negative despite a completed job and successful poll', () => {
  const state = journey({ scenario: 'artifact-lost' });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.active.job.state, 'completed');
  assert.equal(state.active.poll.syntheticHttpStatus, 200);
  assert.equal(state.active.download.syntheticHttpStatus, 404);
  assert.equal(checkpoint(state, 'artifact').status, 'fail');
  assert.equal(result(state).comparedBytes, 0);
});

test('lost owner authorization is detected independently of job completion and bytes', () => {
  const state = journey({ scenario: 'authorization-lost' });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.active.job.state, 'completed');
  assert.equal(state.active.download.syntheticHttpStatus, 403);
  assert.equal(state.active.download.authorization.identity, CONTRACT.owner);
  assert.equal(state.active.download.authorization.allow, false);
  assert.equal(checkpoint(state, 'authorization').status, 'fail');
  assert.equal(checkpoint(state, 'download').status, 'fail');
});

test('a synthetic HTTP 200 cannot conceal foreign-identity authorization bypass', () => {
  const state = journey({ scenario: 'authorization-bypass' });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.active.download.syntheticHttpStatus, 200);
  assert.deepEqual(state.active.download.bytes, CONTRACT.bytes);
  assert.equal(checkpoint(state, 'bytes').status, 'pass');
  assert.equal(state.active.download.foreignProbe.syntheticHttpStatus, 200);
  assert.equal(checkpoint(state, 'isolation').status, 'fail');
});

test('same-length corrupt bytes fail an exact byte oracle, not merely status and length', () => {
  const state = journey({ scenario: 'bytes-changed' });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.active.download.syntheticHttpStatus, 200);
  assert.equal(state.active.download.bytes.length, CONTRACT.bytes.length);
  assert.notDeepEqual(state.active.download.bytes, CONTRACT.bytes);
  assert.equal(checkpoint(state, 'bytes').status, 'fail');
  assert.equal(result(state).comparedBytes, 9);
});

test('job metadata loss across processing cutover is detected, never reconstructed as completed', () => {
  const state = journey({ scenario: 'job-lost' });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.active.job.state, 'missing');
  assert.equal(state.active.poll.syntheticHttpStatus, 404);
  assert.equal(checkpoint(state, 'job').status, 'fail');
  assert.equal(checkpoint(state, 'poll').status, 'fail');
});

test('unobserved polling and download remain unknown even when processing says completed', () => {
  const state = journey({ scenario: 'unobserved' });
  assert.equal(result(state).outcome, 'unknown');
  assert.equal(state.active.job.state, 'completed');
  assert.equal(state.active.poll.observed, false);
  assert.equal(state.active.download.observed, false);
  assert.equal(state.active.download.bytes, null);
  assert.equal(checkpoint(state, 'poll').status, 'unknown');
  assert.equal(checkpoint(state, 'authorization').status, 'unknown');
  assert.equal(checkpoint(state, 'bytes').status, 'unknown');
  assert.equal(summary(state).unknown, 1);
});

test('a denied foreign requester is not the intended owner completing the journey', () => {
  const state = journey({ requester: CONTRACT.foreign });
  assert.equal(result(state).outcome, 'negative');
  assert.equal(state.active.download.requester, CONTRACT.foreign);
  assert.equal(state.active.download.syntheticHttpStatus, 403);
  assert.equal(state.active.download.authorization.allow, false);
  assert.equal(checkpoint(state, 'authorization').status, 'fail');
  assert.equal(summary(state).negative, 1);
});

test('fictional client timings enforce the exact budget boundary, not browser or Azure latency', () => {
  const slow = journey({ budgetMs: 29 });
  assert.equal(result(slow).outcome, 'negative');
  assert.equal(result(slow).elapsedMs, 30);
  assert.equal(checkpoint(slow, 'timing').status, 'fail');
  const boundary = journey({ budgetMs: 30 });
  assert.equal(result(boundary).outcome, 'positive');
  assert.equal(checkpoint(boundary, 'timing').status, 'pass');
});

test('budget parsing and model command validation reject coercion, unknown enums and extra fields', () => {
  assert.equal(parseBudget('40'), 40);
  assert.equal(parseBudget('1'), 1);
  assert.equal(parseBudget('100'), 100);
  for (const input of ['', ' 40', '40 ', '40.0', '1e2', '+40', '0', '101', 'NaN', 'Infinity', 40, false, [], {}]) {
    assert.throws(() => parseBudget(input), /budget/i, String(input));
  }
  const state = createSession();
  const baseline = JSON.stringify(state);
  const base = { type: 'submit', scenario: 'preserved', requester: CONTRACT.owner, budgetMs: 40 };
  for (const command of [
    null, [], 'submit', { ...base, extra: true }, { ...base, scenario: 'live' },
    { ...base, requester: 'credential' }, { ...base, budgetMs: '40' }, { ...base, budgetMs: true },
    { ...base, budgetMs: NaN }, { ...base, budgetMs: 40.5 }, { type: 'fetch' },
    Object.assign(Object.create({ inherited: true }), base),
  ]) assert.throws(() => act(state, command), /invalid|budget|command|requester|condition/i);
  assert.equal(JSON.stringify(state), baseline);
});

test('out-of-order actions and forged typed state cannot create a positive result or mutate history', () => {
  const state = createSession();
  assert.throws(() => act(state, { type: 'download' }), /stage|order/i);
  assert.throws(() => act(start(), { type: 'submit', scenario: 'preserved', requester: CONTRACT.owner, budgetMs: 40 }), /stage|order/i);
  for (const forged of [null, [], {}, 'ready', { ...state, extra: true }, { ...state, attempt: '0' }]) {
    assert.throws(() => act(forged, { type: 'check' }), /state/i);
  }
  const complete = journey();
  assert.equal(result(complete).outcome, 'positive');
  const forged = JSON.parse(JSON.stringify(complete));
  forged.active.download.bytes[0] = 0;
  assert.throws(() => assess(forged), /state/i);
  const forgedTrace = JSON.parse(JSON.stringify(complete));
  forgedTrace.history[0].atMs = 999;
  assert.throws(() => act(forgedTrace, { type: 'check' }), /state/i);
  assert.ok(Object.isFrozen(complete.active.download.bytes));
  assert.equal(state.history.length, 0);
});

test('reset restores the active exercise while retaining distinct results and immutable event history', () => {
  const failed = journey({ scenario: 'artifact-lost' });
  assert.equal(result(failed).outcome, 'negative');
  const firstEvent = JSON.stringify(failed.history[0]);
  const reset = act(failed, { type: 'reset' });
  assert.equal(reset.stage, 'ready');
  assert.equal(reset.active, null);
  assert.equal(reset.results.length, 1);
  assert.equal(reset.attempt, 1);
  assert.equal(JSON.stringify(reset.history[0]), firstEvent);
  const recovered = journey({}, reset);
  assert.equal(result(recovered).outcome, 'positive');
  assert.deepEqual(summary(recovered), { attempted: 2, positive: 1, negative: 1, unknown: 0, unassessed: 0 });
  assert.equal(failed.results.length, 1);
  assert.equal(failed.stage, 'downloaded');
});

test('early unknown is retained but latest assessment counts each attempted journey only once', () => {
  let state = start();
  state = act(state, { type: 'check' });
  assert.equal(result(state).outcome, 'unknown');
  for (const type of steps) state = act(state, { type });
  state = act(state, { type: 'check' });
  assert.equal(result(state).outcome, 'positive');
  assert.equal(state.results.length, 2);
  assert.equal(state.results[0].outcome, 'unknown');
  assert.deepEqual(summary(state), { attempted: 1, positive: 1, negative: 0, unknown: 0, unassessed: 0 });
});

test('bounded attempts and retained events reject excess work without silently discarding history', () => {
  let state = createSession();
  for (let index = 0; index < LIMITS.maxAttempts; index++) {
    state = act(journey({}, state), { type: 'reset' });
  }
  assert.equal(state.attempt, 8);
  assert.equal(state.results.length, 8);
  const before = JSON.stringify(state);
  assert.throws(() => act(state, { type: 'submit', scenario: 'preserved', requester: CONTRACT.owner, budgetMs: 40 }), /limit|eight|8/i);
  assert.equal(JSON.stringify(state), before);
  let events = createSession();
  for (let index = 0; index < LIMITS.maxEvents; index++) events = act(events, { type: 'check' });
  assert.equal(events.history.length, 96);
  assert.equal(summary(events).attempted, 0);
  assert.throws(() => act(events, { type: 'check' }), /history|event|96/i);
  assert.equal(events.history.length, 96);
});
