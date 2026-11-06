'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const cursors = require('../cursor.js');
const { createRun, defaultScheduler } = require('../run.cjs');
const { manualScheduler, fixtureContext, scratchDirectory } = require('./support.cjs');

const context = fixtureContext();
const make = (options = {}) => {
  const scheduler = manualScheduler();
  return { scheduler, run: createRun({ context, scheduler, ...options }) };
};

test('the producer emits run-started, numbered steps and run-completed in order with attribution in every event', () => {
  const { scheduler, run } = make({ totalSteps: 3, intervalMs: 100 });
  assert.equal(run.snapshot().run.status, 'idle');
  assert.equal(run.produce(), null, 'nothing is produced before start');
  run.start();
  run.start();
  assert.equal(scheduler.activeJobs(), 1, 'start is idempotent');
  scheduler.advance(1000);
  const view = run.view();
  assert.equal(view.headSeq, 5);
  assert.equal(run.snapshot().run.status, 'completed');
  assert.equal(scheduler.activeJobs(), 0, 'a completed run releases its timer');
  const frames = run.attach(null, () => {}).replay;
  assert.deepEqual(frames.map((event) => event.event), ['run-started', 'step-completed', 'step-completed', 'step-completed', 'run-completed']);
  assert.deepEqual(frames.map((event) => event.data.step), [0, 1, 2, 3, 3]);
  for (const event of frames) {
    assert.equal(event.id, cursors.format('synthetic-run-001', 3, event.seq));
    assert.deepEqual([event.data.runId, event.data.epoch, event.data.seq, event.data.of], ['synthetic-run-001', 3, event.seq, 3]);
    assert.equal(event.frame, `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    assert.equal(Object.isFrozen(event), true);
  }
  assert.equal(run.produce(), null);
  assert.equal(run.isComplete(), true);
});

test('the replay window is bounded and the head, first retained sequence and resume cursor follow it', () => {
  const { run } = make({ replayWindow: 4, totalSteps: 50 });
  assert.deepEqual(run.view(), { runId: 'synthetic-run-001', epoch: 3, headSeq: 0, firstRetainedSeq: 1, replayWindow: 4 });
  assert.equal(run.snapshot().run.resumeCursor, null);
  run.start();
  for (let step = 0; step < 10; step++) run.produce();
  assert.deepEqual(run.view(), { runId: 'synthetic-run-001', epoch: 3, headSeq: 10, firstRetainedSeq: 7, replayWindow: 4 });
  assert.equal(run.snapshot().run.resumeCursor, 'synthetic-run-001:3:10');
  assert.deepEqual(run.attach(null, () => {}).replay.map((event) => event.seq), [7, 8, 9, 10]);
  assert.deepEqual(run.attach(8, () => {}).replay.map((event) => event.seq), [9, 10]);
  assert.deepEqual(run.attach(10, () => {}).replay, []);
});

test('attach and detach never touch the producer and the counters track every client', () => {
  const { scheduler, run } = make({ totalSteps: 50, intervalMs: 10 });
  run.start();
  const jobs = scheduler.activeJobs();
  const seen = [];
  const first = run.attach(null, (event) => seen.push(event.seq));
  const second = run.attach(3, () => {});
  scheduler.advance(30);
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(run.counters.clientsAttached, 2);
  assert.equal(run.counters.resumes, 1);
  first.detach();
  first.detach();
  second.detach();
  assert.deepEqual([run.counters.clientsAttached, run.counters.disconnects, run.counters.clientsTotal], [0, 2, 2]);
  const produced = run.counters.produced;
  scheduler.advance(50);
  assert.equal(run.counters.produced - produced, 5, 'the run kept producing with no client attached');
  assert.equal(scheduler.activeJobs(), jobs);
  assert.deepEqual(seen, [1, 2, 3], 'a detached subscriber receives nothing more');
});

test('a failing subscriber can never stop or alter the run', () => {
  const { scheduler, run } = make({ totalSteps: 50, intervalMs: 10 });
  run.start();
  run.attach(null, () => { throw new Error('client exploded'); });
  const healthy = [];
  run.attach(null, (event) => healthy.push(event.seq));
  scheduler.advance(30);
  assert.deepEqual(healthy, [1, 2, 3]);
  assert.equal(run.counters.produced, 3);
});

test('resolveCursor counts rejected cursors and answers with the typed failure', () => {
  const { run } = make({ totalSteps: 50 });
  run.start();
  for (let step = 0; step < 3; step++) run.produce();
  assert.equal(run.resolveCursor({ header: 'synthetic-run-001:3:2' }).afterSeq, 2);
  const refused = run.resolveCursor({ header: 'synthetic-run-001:3:9' });
  assert.equal(refused.failure.error.code, 'CURSOR_FROM_FUTURE');
  assert.equal(run.counters.rejectedCursors, 1);
});

test('close stops only the producer, is idempotent and keeps a completed run completed', () => {
  const { scheduler, run } = make({ totalSteps: 50 });
  run.start();
  run.produce();
  run.close();
  run.close();
  assert.equal(run.snapshot().run.status, 'closed');
  assert.equal(run.snapshot().run.producerActive, false);
  assert.equal(scheduler.activeJobs(), 0);
  assert.equal(run.produce(), null);
  const finished = make({ totalSteps: 1 });
  finished.run.start();
  finished.scheduler.advance(10000);
  finished.run.close();
  assert.equal(finished.run.snapshot().run.status, 'completed');
});

test('option validation is closed and nothing is defaulted from hostile input', () => {
  const scheduler = manualScheduler();
  for (const options of [
    {}, { context: null }, { context: { runId: 'real-run', epoch: 1, stateSha256: 'a' } },
    { context: { ...context, epoch: 0 } }, { context: { ...context, epoch: 1000 } }, { context: { ...context, epoch: 1.5 } },
    { context, totalSteps: 0 }, { context, totalSteps: 5001 }, { context, replayWindow: 0 }, { context, intervalMs: 0 },
    { context, intervalMs: 'fast' },
  ]) {
    assert.throws(() => createRun({ scheduler, ...options }), (error) => error instanceof TypeError && error.code === 'CLOSED_SCHEMA', JSON.stringify(options));
  }
});

test('the default scheduler runs and cancels real timers without keeping the process alive', async () => {
  let ticks = 0;
  const stop = defaultScheduler.every(1, () => { ticks += 1; });
  await new Promise((resolve) => setTimeout(resolve, 15));
  stop();
  const seen = ticks;
  assert.ok(seen >= 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ticks, seen);
  let fired = 0;
  defaultScheduler.after(1, () => { fired += 1; });
  const cancel = defaultScheduler.after(1, () => { fired += 10; });
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(fired, 1);
});

test('a persisted run restores head, window and counters and continues at the next sequence', () => {
  const scratch = scratchDirectory();
  try {
    const first = make({ persistDir: scratch.directory, totalSteps: 20, replayWindow: 4 });
    first.run.start();
    for (let step = 0; step < 9; step++) first.run.produce();
    assert.equal(first.run.counters.persisted, 9);
    first.run.close();
    const second = make({ persistDir: scratch.directory, totalSteps: 20, replayWindow: 4 });
    assert.deepEqual(second.run.view(), { runId: 'synthetic-run-001', epoch: 3, headSeq: 9, firstRetainedSeq: 6, replayWindow: 4 });
    assert.equal(second.run.counters.produced, 0, 'this process produced nothing yet');
    const { restore } = second.run.snapshot();
    assert.deepEqual([restore.persisted, restore.restoredEvents, restore.created, restore.tornTailBytesDiscarded, restore.knownEarlierEpochs], [true, 9, false, 0, []]);
    second.run.start();
    assert.equal(second.run.produce().seq, 10);
    second.run.close();
  } finally {
    scratch.remove();
  }
});

test('a restored completed run starts completed and produces nothing more', () => {
  const scratch = scratchDirectory();
  try {
    const first = make({ persistDir: scratch.directory, totalSteps: 2 });
    first.run.start();
    first.scheduler.advance(10000);
    first.run.close();
    const second = make({ persistDir: scratch.directory, totalSteps: 2 });
    second.run.start();
    assert.equal(second.run.snapshot().run.status, 'completed');
    assert.equal(second.scheduler.activeJobs(), 0);
    assert.equal(second.run.produce(), null);
    second.run.close();
  } finally {
    scratch.remove();
  }
});

test('a persistence failure stops the producer with an explicit fault and never publishes the event', (t) => {
  const scratch = scratchDirectory();
  try {
    const { scheduler, run } = make({ persistDir: scratch.directory, totalSteps: 20 });
    run.start();
    assert.equal(run.produce().seq, 1);
    const seen = [];
    run.attach(null, (event) => seen.push(event.seq));
    t.mock.method(fs, 'writeSync', () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); }, { times: 1 });
    assert.equal(run.produce(), null);
    const { run: state } = run.snapshot();
    assert.deepEqual([state.status, state.fault, state.headSeq, state.producerActive], ['faulted', 'STORAGE_ERROR', 1, false]);
    assert.deepEqual(seen, [], 'an event that could not be made durable is never published');
    assert.equal(run.counters.produced, 1);
    assert.equal(scheduler.activeJobs(), 0);
    assert.equal(run.produce(), null);
    run.close();
    assert.equal(run.snapshot().run.status, 'faulted');
  } finally {
    scratch.remove();
  }
});
