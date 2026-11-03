'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const { DEFAULTS, RULE, LIMITS, initial, reduce, summarize } = model;
const configure = (state, values = {}) => reduce(state, { type: 'configure', ...DEFAULTS, ...values });
const enqueue = (state) => reduce(state, { type: 'enqueue' });
const tick = (state, count = 1) => {
  for (let index = 0; index < count; index += 1) state = reduce(state, { type: 'tick' });
  return state;
};
const batch = (values = {}) => enqueue(configure(initial(), values));
const allDone = (state) => {
  for (let index = 0; index < 35 && state.jobs.some((job) => job.status === 'QUEUED'); index += 1) {
    state = tick(state);
  }
  return state;
};

test('declared fixture starts with two ready workers and no claimed outcomes', () => {
  const state = initial();
  assert.equal(state.mode, 'synthetic-only');
  assert.equal(state.capacity.lastConfirmedReady, 2);
  assert.equal(state.jobs.length, 0);
  assert.equal(summarize(state).verification.verdict, 'NOT_RUN');
  assert.equal(RULE.queueThreshold, 8);
  assert.equal(RULE.concurrencyThreshold, 6);
  assert.equal(RULE.windowSeconds, 5);
  assert.equal(RULE.itemsPerWorker, 2);
});

test('enqueue creates twelve deadline-bearing work items without mutating its input', () => {
  const before = initial();
  const snapshot = JSON.stringify(before);
  const after = enqueue(before);
  assert.equal(after.jobs.length, 12);
  assert.equal(after.batches.length, 1);
  assert.equal(after.jobs[0].submittedAt, 0);
  assert.equal(after.jobs[0].deadlineAt, 20);
  assert.equal(after.jobs[0].status, 'QUEUED');
  assert.equal(JSON.stringify(before), snapshot);
  assert.notEqual(after, before);
});

test('commands are deterministic and preserve earlier states', () => {
  const before = batch();
  const original = JSON.stringify(before);
  const left = tick(before, 3);
  const right = tick(before, 3);
  assert.equal(left.clockSeconds, 15);
  assert.deepEqual(left, right);
  assert.equal(JSON.stringify(before), original);
});

test('queue pressure requests capacity but does not make the requested worker ready', () => {
  const state = tick(batch());
  assert.equal(state.clockSeconds, 5);
  assert.equal(state.windows.length, 1);
  assert.equal(state.windows[0].queueDepth, 12);
  assert.equal(state.windows[0].metricValue, 12);
  assert.equal(state.windows[0].decision, 'SCALE_OUT_REQUESTED');
  assert.equal(state.capacity.requested, 3);
  assert.equal(state.capacity.lastConfirmedReady, 2);
  assert.equal(state.transitions.length, 1);
  assert.equal(state.transitions[0].status, 'WARMING');
  assert.equal(summarize(state).work.completed, 4);
  assert.equal(summarize(state).work.queued, 8);
  assert.notEqual(summarize(state).verification.verdict, 'PASS');
});

test('a later readiness observation precedes use of added capacity', () => {
  const state = tick(batch(), 2);
  assert.equal(state.windows.length, 2);
  assert.equal(state.windows[1].decision, 'READY');
  assert.equal(state.capacity.lastConfirmedReady, 3);
  assert.equal(state.transitions[0].requestedAt, 5);
  assert.equal(state.transitions[0].readyAt, 10);
  assert.equal(state.transitions[0].status, 'READY');
  assert.equal(summarize(state).work.completed, 10);
  assert.equal(summarize(state).work.queued, 2);
  assert.ok(state.jobs.some((job) => job.worker === 'worker-3' && job.completedAt === 10));
});

for (const metric of ['queue-depth', 'concurrency']) {
  test(`${metric} conducts the complete bounded workload-driven scale-out`, () => {
    const state = tick(batch({ metric }), 3);
    const summary = summarize(state);
    assert.equal(summary.verification.verdict, 'PASS');
    assert.equal(summary.rule.metric, metric);
    assert.equal(summary.capacity.effectiveReady, 3);
    assert.equal(summary.work.submitted, 12);
    assert.equal(summary.work.onTime, 12);
    assert.equal(summary.work.completed, 12);
    assert.equal(summary.work.queued, 0);
    assert.equal(summary.work.verdict, 'DEADLINES_MET');
    assert.ok(summary.work.addedWorkerCompletions > 0);
    assert.deepEqual(state.jobs.map((job) => job.id), Array.from({ length: 12 }, (_, index) => `job-${index + 1}`));
  });
}

for (const [metric, batchSize, activeRequests, decision] of [
  ['queue-depth', 7, 120, 'BELOW_THRESHOLD'],
  ['queue-depth', 8, 0, 'SCALE_OUT_REQUESTED'],
  ['concurrency', 40, 11, 'BELOW_THRESHOLD'],
  ['concurrency', 2, 12, 'SCALE_OUT_REQUESTED']
]) {
  test(`${metric}: batch ${batchSize}, concurrency ${activeRequests} yields ${decision}`, () => {
    const state = tick(batch({ metric, batchSize, activeRequests }));
    assert.equal(state.windows.length, 1);
    assert.equal(state.windows[0].decision, decision);
    assert.equal(state.transitions.length, decision === 'SCALE_OUT_REQUESTED' ? 1 : 0);
  });
}

test('concurrency uses ready workers, not requested workers, as its denominator', () => {
  const state = tick(batch({ metric: 'concurrency' }));
  assert.equal(state.windows.length, 1);
  assert.equal(state.windows[0].concurrencyPerReady, 6);
  assert.equal(state.windows[0].readyObserved, 2);
  assert.equal(state.windows[0].requested, 3);
  assert.equal(state.transitions[0].metricValue, 6);
});

test('an empty queue is observed as zero, not as completed work or a passed exercise', () => {
  const state = tick(initial());
  assert.equal(state.windows.length, 1);
  assert.equal(state.windows[0].queueDepth, 0);
  assert.equal(state.windows[0].decision, 'BELOW_THRESHOLD');
  assert.equal(summarize(state).work.verdict, 'NOT_RUN');
  assert.equal(summarize(state).verification.verdict, 'INCOMPLETE');
});

test('finishing work without a scale transition is not evidence of this strategy', () => {
  const state = tick(batch({ batchSize: 2, activeRequests: 120 }));
  assert.equal(summarize(state).work.onTime, 2);
  assert.equal(state.transitions.length, 0);
  assert.equal(summarize(state).verification.verdict, 'INCOMPLETE');
});

test('completion exactly at the immutable deadline is on time', () => {
  const state = tick(batch({ batchSize: 4, deadlineSeconds: 5 }));
  assert.equal(summarize(state).work.onTime, 4);
  assert.equal(summarize(state).work.late, 0);
  assert.equal(state.jobs[0].completedAt, state.jobs[0].deadlineAt);
});

test('later completion misses the original deadline despite successful scale-out', () => {
  const state = tick(batch({ deadlineSeconds: 5 }), 3);
  assert.equal(summarize(state).work.onTime, 4);
  assert.equal(summarize(state).work.late, 8);
  assert.equal(summarize(state).work.verdict, 'DEADLINE_MISSED');
  assert.equal(summarize(state).verification.verdict, 'FAIL');
  assert.equal(state.transitions[0].status, 'READY');
});

test('pending work past its deadline is already overdue and cannot pass', () => {
  const state = tick(batch({ batchSize: 40, deadlineSeconds: 5 }), 2);
  const summary = summarize(state);
  assert.equal(summary.work.queued, 30);
  assert.equal(summary.work.pendingOverdue, 30);
  assert.equal(summary.work.late, 6);
  assert.equal(summary.verification.verdict, 'FAIL');
});

test('new input cannot rewrite earlier deadlines or cancel a warming request', () => {
  let state = tick(batch());
  assert.equal(state.jobs.length, 12);
  const deadlines = state.jobs.map((job) => job.deadlineAt);
  const pending = state.capacity.pending;
  state = configure(state, { batchSize: 2, deadlineSeconds: 60 });
  assert.deepEqual(state.jobs.map((job) => job.deadlineAt), deadlines);
  assert.deepEqual(state.capacity.pending, pending);
  state = enqueue(state);
  assert.equal(state.jobs.length, 14);
  assert.equal(state.jobs[12].deadlineAt, 65);
  assert.equal(state.batches.length, 2);
});

test('capacity observation failure preserves intent but does not add a ready worker', () => {
  let state = tick(batch());
  state = tick(configure(state, { fault: 'provision-failure' }));
  assert.equal(state.transitions.length, 1);
  assert.equal(state.transitions[0].status, 'FAILED');
  assert.equal(state.transitions[0].failedAt, 10);
  assert.equal(state.capacity.requested, 3);
  assert.equal(state.capacity.lastConfirmedReady, 2);
  assert.equal(state.capacity.pending, null);
  assert.equal(summarize(state).capacity.failedTransitions, 1);
  assert.equal(summarize(state).verification.verdict, 'FAIL');
});

test('healthy recovery never deletes failed provisioning evidence', () => {
  let state = tick(batch());
  state = tick(configure(state, { fault: 'provision-failure' }));
  state = allDone(configure(state));
  assert.equal(summarize(state).work.onTime, 12);
  assert.equal(summarize(state).capacity.failedTransitions, 1);
  assert.equal(summarize(state).verification.verdict, 'FAIL');
});

test('missing selected metrics are null, break rule evaluation, and do not invent scaling', () => {
  const state = tick(batch({ fault: 'metric-missing' }));
  assert.equal(state.windows.length, 1);
  assert.equal(state.windows[0].metricValue, null);
  assert.equal(state.windows[0].decision, 'UNKNOWN');
  assert.equal(state.transitions.length, 0);
  assert.equal(summarize(state).work.completed, 4);
  assert.equal(summarize(state).rule.unknownWindows, 1);
  assert.equal(summarize(state).verification.verdict, 'UNKNOWN');
});

test('missing capacity pauses warm-up and service without claiming historical capacity is current', () => {
  let state = tick(batch());
  state = tick(configure(state, { fault: 'capacity-missing' }));
  assert.equal(state.windows.length, 2);
  assert.equal(state.windows[1].readyObserved, null);
  assert.equal(state.windows[1].queueDepth, null);
  assert.equal(state.windows[1].completed, 0);
  assert.equal(state.capacity.lastConfirmedReady, 2);
  assert.notEqual(state.capacity.pending, null);
  assert.equal(summarize(state).capacity.effectiveReady, null);
  assert.equal(summarize(state).work.completed, 4);
  assert.equal(summarize(state).verification.verdict, 'UNKNOWN');
});

test('restored observations retain the earlier unknown window and forbid a clean pass', () => {
  let state = tick(batch({ fault: 'metric-missing' }));
  state = allDone(configure(state));
  assert.equal(summarize(state).work.completed, 12);
  assert.equal(summarize(state).rule.unknownWindows, 1);
  assert.equal(summarize(state).verification.verdict, 'UNKNOWN');
});

test('missing completion evidence remains unknown instead of successful work', () => {
  const state = tick(batch({ fault: 'completion-missing' }));
  assert.equal(state.jobs.length, 12);
  const missing = state.jobs.find((job) => job.status === 'UNKNOWN');
  assert.ok(missing);
  assert.equal(missing.completedAt, null);
  assert.equal(missing.worker, null);
  assert.equal(summarize(state).work.unknown, 1);
  assert.equal(summarize(state).work.onTime, 3);
  assert.equal(summarize(state).verification.verdict, 'UNKNOWN');
});

test('worker errors are separately attributed and persist after recovery', () => {
  let state = tick(batch({ fault: 'worker-failure' }));
  state = allDone(configure(state));
  assert.equal(summarize(state).work.failed, 1);
  assert.equal(summarize(state).work.late, 0);
  assert.equal(summarize(state).work.verdict, 'FAILED');
  assert.equal(summarize(state).verification.verdict, 'FAIL');
  assert.ok(state.jobs.some((job) => job.reason === 'Synthetic worker error'));
});

for (const [metric, verdict] of [['cpu-percent', 'UNSUPPORTED'], ['native-unqualified', 'UNKNOWN']]) {
  test(`${metric} rejects enqueue and tick without fabricating execution`, () => {
    let state = configure(initial(), { metric });
    assert.equal(state.lastResult.verdict, verdict);
    state = tick(enqueue(state));
    assert.equal(state.lastResult.verdict, verdict);
    assert.equal(state.clockSeconds, 0);
    assert.equal(state.jobs.length, 0);
    assert.equal(state.transitions.length, 0);
    assert.equal(state.windows.length, 0);
    assert.equal(summarize(state).verification.verdict, verdict);
    assert.equal(state.events.length, 3);
  });
}

for (const [label, values] of [
  ['blank batch', { batchSize: '' }],
  ['fractional batch', { batchSize: '1.5' }],
  ['negative pressure', { activeRequests: -1 }],
  ['non-finite pressure', { activeRequests: Infinity }],
  ['exponent string', { activeRequests: '1e2' }],
  ['oversized batch', { batchSize: 41 }],
  ['oversized pressure', { activeRequests: 121 }],
  ['short deadline', { deadlineSeconds: 4 }],
  ['long deadline', { deadlineSeconds: 61 }],
  ['unknown metric', { metric: 'queue_length' }],
  ['unknown condition', { fault: 'pretend-success' }]
]) {
  test(`invalid input: ${label} is rejected with a retained event`, () => {
    const state = configure(initial(), values);
    assert.equal(state.lastResult.verdict, 'INVALID');
    assert.deepEqual(state.input, DEFAULTS);
    assert.equal(state.events.length, 1);
    assert.equal(state.clockSeconds, 0);
    assert.equal(state.jobs.length, 0);
  });
}

for (const event of [null, [], {}, { type: 'invent-ready' }, { type: 'tick', arbitrary: true },
  { type: 'configure', ...DEFAULTS, secret: 'ignored?' }, { type: 'configure', batchSize: 12 }]) {
  test(`malformed command ${JSON.stringify(event)} fails closed`, () => {
    const state = reduce(initial(), event);
    assert.equal(state.lastResult.verdict, 'INVALID');
    assert.equal(state.events.length, 1);
    assert.equal(state.clockSeconds, 0);
    assert.equal(state.jobs.length, 0);
  });
}

test('strict whole-number strings are accepted without silently changing their meaning', () => {
  const state = configure(initial(), { batchSize: '8', activeRequests: '12', deadlineSeconds: '20' });
  assert.equal(state.lastResult.verdict, 'CONFIGURED');
  assert.equal(state.input.batchSize, 8);
  assert.equal(state.input.activeRequests, 12);
  assert.equal(state.input.deadlineSeconds, 20);
});

test('four-worker ceiling refuses further expansion while retaining work outcomes', () => {
  const state = tick(batch({ batchSize: 40, activeRequests: 120, deadlineSeconds: 60 }), 5);
  assert.equal(state.capacity.lastConfirmedReady, 4);
  assert.equal(state.capacity.requested, 4);
  assert.equal(state.transitions.length, 2);
  assert.equal(state.windows.length, 5);
  assert.equal(state.windows[4].decision, 'AT_LIMIT');
  assert.equal(summarize(state).work.completed, 32);
  assert.equal(summarize(state).work.queued, 8);
});

test('queue admission bound refuses additional work without discarding history', () => {
  let state = configure(initial(), { batchSize: 40 });
  state = enqueue(enqueue(enqueue(state)));
  assert.equal(state.jobs.length, LIMITS.queued);
  const jobs = JSON.stringify(state.jobs);
  state = enqueue(state);
  assert.equal(state.lastResult.verdict, 'LIMIT');
  assert.equal(JSON.stringify(state.jobs), jobs);
  assert.equal(state.batches.length, 3);
});

test('total work-history bound is independent of the current backlog bound', () => {
  let state = configure(initial(), { batchSize: 40, activeRequests: 120, deadlineSeconds: 60 });
  state = allDone(enqueue(enqueue(enqueue(state))));
  state = allDone(enqueue(enqueue(enqueue(state))));
  assert.equal(state.jobs.length, LIMITS.jobs);
  assert.equal(summarize(state).work.queued, 0);
  const jobs = JSON.stringify(state.jobs);
  state = enqueue(state);
  assert.equal(state.lastResult.verdict, 'LIMIT');
  assert.equal(JSON.stringify(state.jobs), jobs);
});

test('event limit is bounded and fails closed without dropping an earlier event', () => {
  const state = tick(initial(), LIMITS.events);
  assert.equal(state.events.length, LIMITS.events);
  assert.equal(state.clockSeconds, LIMITS.events * RULE.windowSeconds);
  const events = JSON.stringify(state.events);
  const denied = tick(state);
  assert.equal(denied.lastResult.verdict, 'LIMIT');
  assert.equal(denied.clockSeconds, state.clockSeconds);
  assert.equal(JSON.stringify(denied.events), events);
});

test('invalid input preserves prior failures, work, time, and capacity', () => {
  const before = tick(batch({ fault: 'worker-failure' }));
  assert.equal(summarize(before).work.failed, 1);
  const after = configure(before, { batchSize: '' });
  assert.equal(after.lastResult.verdict, 'INVALID');
  assert.deepEqual(after.jobs, before.jobs);
  assert.deepEqual(after.capacity, before.capacity);
  assert.equal(after.clockSeconds, before.clockSeconds);
  assert.equal(summarize(after).work.failed, 1);
});
