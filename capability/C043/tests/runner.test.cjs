'use strict';

// The runner beyond the initial specification: resume paths, the crash window between a step's effect and its
// acknowledgement, journal write failures, cancellation of open runs, bounds, hostile clocks and the run limit.
const test = require('node:test');
const {
  assert, boot, clock, committed, doc, flaky, gate, inFlight, methods, step, statuses, createMemoryIo, openRunner,
} = require('./support.cjs');

const KEY = 'preset-run-0001';
const failOn = (needle, mode = 'lost', after = 0, times = 1) => {
  let seen = 0;
  return (text) => {
    if (!text.includes(needle)) return false;
    seen += 1;
    return seen > after && seen <= after + times ? mode : false;
  };
};

test('an executor that fails once leaves the preset INTERRUPTED and an explicit resume finishes it with one effect', { timeout: 30000 }, async () => {
  let failures = 1;
  const { runner, real, log } = await boot({ executor: async ({ key }) => { if (key === 'preset-a-step-2' && failures > 0) { failures -= 1; throw new Error('once'); } } });
  const first = await runner.run(doc());
  assert.equal(first.body.outcome, 'interrupted');
  const resumed = await runner.resume(KEY);
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.outcome, 'succeeded');
  assert.deepEqual(statuses(resumed.body), ['succeeded', 'succeeded', 'succeeded']);
  assert.deepEqual(resumed.body.steps.map((entry) => entry.appliedByThisRequest), [false, true, true]);
  assert.equal(resumed.body.attempts, 2);
  assert.equal(committed(real), 15);
  assert.deepEqual(methods(log).slice(2), ['inspect', 'resume', 'submit']);
});

test('a step effect that landed but was never acknowledged is not executed again on resume', { timeout: 30000 }, async () => {
  const stepIo = createMemoryIo();
  const runIo = createMemoryIo();
  const lostAck = await boot({ stepIo, runIo: flaky(runIo, failOn('"index":2,"status"')) });
  const answer = await lostAck.runner.run(doc());
  assert.equal(answer.status, 503);
  assert.equal(answer.body.error.code, 'RUN_JOURNAL_UNCERTAIN');
  assert.equal(committed(lostAck.real), 10, 'the step service recorded the effect of step 2');
  const second = await boot({ stepIo, runIo });
  const inspected = second.runner.inspect(KEY);
  assert.equal(inspected.body.outcome, 'interrupted');
  assert.deepEqual(statuses(inspected.body), ['succeeded', 'interrupted', 'not-run']);
  assert.equal(inspected.body.steps[1].applied, null, 'unconfirmed by the preset journal');
  const resumed = await second.runner.resume(KEY);
  assert.equal(resumed.body.outcome, 'succeeded');
  assert.deepEqual(statuses(resumed.body), ['succeeded', 'replayed', 'succeeded']);
  assert.equal(second.log.some((call) => call.method === 'submit' && call.args[0].idempotencyKey === 'preset-a-step-2'), false, 'step 2 was reconciled, not submitted');
  assert.equal(committed(second.real), 15);
});

test('cancelling an open run reconciles the step that was not acknowledged', { timeout: 30000 }, async (context) => {
  await context.test('an interrupted step in the step service is cancelled through it', async () => {
    const held = gate();
    const first = await boot({ executor: held.executor });
    const running = first.runner.run(doc());
    await inFlight(held, 'preset-a-step-1', [running]);
    held.release('preset-a-step-1');
    await inFlight(held, 'preset-a-step-2', [running]);
    first.runner.halt();
    first.real.halt();
    await running;
    const second = await boot({ stepIo: first.stepIo, runIo: first.runIo });
    const answer = await second.runner.cancel(KEY);
    assert.equal(answer.status, 200);
    assert.equal(answer.body.outcome, 'cancelled');
    assert.deepEqual(statuses(answer.body), ['succeeded', 'cancelled', 'not-run']);
    assert.deepEqual(second.real.leases()['synthetic-lease-001'], { capacity: 100, committed: 5, held: 0, available: 95 });
    assert.equal(second.real.inspect('preset-a-step-2').body.step.state, 'cancelled');
  });
  await context.test('a step that had in fact committed makes the cancel too late: the run is completed, not cancelled', async () => {
    const stepIo = createMemoryIo();
    const runIo = createMemoryIo();
    const lost = await boot({ stepIo, runIo: flaky(runIo, failOn('"index":3,"status"')) });
    assert.equal((await lost.runner.run(doc())).body.error.code, 'RUN_JOURNAL_UNCERTAIN');
    const second = await boot({ stepIo, runIo });
    const answer = await second.runner.cancel(KEY);
    assert.equal(answer.status, 409);
    assert.equal(answer.body.error.code, 'ACTION_NOT_ALLOWED');
    assert.equal(answer.body.accepted, false);
    assert.equal(answer.body.run.state, 'completed');
    assert.equal(answer.body.effects.length, 3);
    assert.equal(committed(second.real), 15);
  });
  await context.test('a run whose steps all succeeded but has no end record offers resume and inspect, never cancel', async () => {
    const stepIo = createMemoryIo();
    const runIo = createMemoryIo();
    const lost = await boot({ stepIo, runIo: flaky(runIo, failOn('"type":"end"')) });
    assert.equal((await lost.runner.run(doc())).body.error.code, 'RUN_JOURNAL_UNCERTAIN');
    const second = await boot({ stepIo, runIo });
    const inspected = second.runner.inspect(KEY);
    assert.deepEqual(inspected.body.recovery.allowed, ['resume', 'inspect']);
    assert.equal((await second.runner.cancel(KEY)).body.error.code, 'ACTION_NOT_ALLOWED');
    assert.equal(second.runIo.read().includes('"type":"end"'), false, 'a refused cancel writes nothing');
    const resumed = await second.runner.resume(KEY);
    assert.equal(resumed.body.outcome, 'succeeded');
    assert.deepEqual(second.log, [], 'finishing the record needs no step call');
  });
});

test('a preset-journal write that cannot be confirmed is unknown, and the next request re-reads the journal', { timeout: 30000 }, async (context) => {
  await context.test('a lost begin: nothing ran, the same preset then runs once', async () => {
    const { runner, real, log } = await boot({ runIo: flaky(createMemoryIo(), failOn('"type":"begin"', 'lost')) });
    const first = await runner.run(doc());
    assert.equal(first.status, 503);
    assert.equal(first.body.outcome, 'unknown');
    assert.deepEqual(first.body.didNot.map((item) => item.code), ['NOT_CONFIRMED', 'NO_AUTOMATIC_RETRY', 'NO_CLOUD_CALL']);
    assert.deepEqual(log, []);
    const second = await runner.run(doc());
    assert.equal(second.body.outcome, 'succeeded');
    assert.equal(committed(real), 15);
  });
  await context.test('a begin that landed: the retry finds the interrupted run and resumes nothing by itself', async () => {
    const { runner, log } = await boot({ runIo: flaky(createMemoryIo(), failOn('"type":"begin"', 'landed')) });
    assert.equal((await runner.run(doc())).body.error.code, 'RUN_JOURNAL_UNCERTAIN');
    const again = await runner.run(doc());
    assert.equal(again.body.replayed, true);
    assert.equal(again.body.outcome, 'interrupted');
    assert.deepEqual(log, []);
  });
  await context.test('a failed resume record and a failed cancel record are unknown too', async () => {
    const stepIo = createMemoryIo();
    const runIo = createMemoryIo();
    const base = await boot({ stepIo, runIo, executor: async ({ key }) => { if (key === 'preset-a-step-2') throw new Error('x'); } });
    await base.runner.run(doc());
    const broken = await boot({ stepIo, runIo: flaky(runIo, failOn('"type":"resume"')) });
    assert.equal((await broken.runner.resume(KEY)).body.error.code, 'RUN_JOURNAL_UNCERTAIN');
    const again = await boot({ stepIo, runIo: flaky(runIo, failOn('"type":"cancel"')) });
    assert.equal((await again.runner.cancel(KEY)).body.error.code, 'RUN_JOURNAL_UNCERTAIN');
  });
});

test('an unconfirmed step stops the preset as unknown and resume reconciles it with the step service', { timeout: 30000 }, async (context) => {
  for (const mode of ['lost', 'landed']) {
    await context.test(`the step journal write is ${mode}`, async () => {
      const stepIo = flaky(createMemoryIo(), failOn('"type":"commit"', mode, 1));
      const { runner, real, log } = await boot({ stepIo });
      const answer = await runner.run(doc());
      assert.equal(answer.status, 503);
      assert.equal(answer.body.outcome, 'unknown');
      assert.equal(answer.body.error.code, 'PRESET_UNCONFIRMED');
      assert.deepEqual(statuses(answer.body), ['succeeded', 'unknown', 'not-run']);
      assert.equal(answer.body.steps[1].applied, null);
      assert.deepEqual(answer.body.recovery.allowed, ['resume', 'cancel', 'inspect']);
      assert.equal(log.filter((call) => call.method === 'submit').length, 2);
      const resumed = await runner.resume(KEY);
      assert.equal(resumed.body.outcome, 'succeeded');
      assert.equal(committed(real), 15);
      assert.deepEqual(statuses(resumed.body), mode === 'landed' ? ['succeeded', 'replayed', 'succeeded'] : ['succeeded', 'succeeded', 'succeeded']);
    });
  }
  await context.test('cancelling an unconfirmed preset cancels the step the step service now reports as interrupted', async () => {
    const stepIo = flaky(createMemoryIo(), failOn('"type":"commit"', 'lost', 1));
    const { runner, real } = await boot({ stepIo });
    await runner.run(doc());
    const answer = await runner.cancel(KEY);
    assert.equal(answer.body.outcome, 'cancelled');
    assert.deepEqual(statuses(answer.body), ['succeeded', 'cancelled', 'not-run']);
    assert.equal(committed(real), 5);
  });
});

test('steps already applied by hand replay with one effect, and a step key used differently stops the preset', { timeout: 30000 }, async () => {
  const { runner, real, engine } = await boot();
  await engine.submit(step(1));
  const answer = await runner.run(doc());
  assert.equal(answer.status, 201);
  assert.deepEqual(statuses(answer.body), ['replayed', 'succeeded', 'succeeded']);
  assert.deepEqual(answer.body.steps.map((entry) => entry.appliedByThisRequest), [false, true, true]);
  assert.equal(committed(real), 15);
  const other = await boot();
  await other.engine.submit(step(2, { units: 9 }));
  const conflict = await other.runner.run(doc());
  assert.equal(conflict.body.error.code, 'PRESET_STEP_FAILED');
  assert.equal(conflict.body.error.details[0].code, 'IDEMPOTENCY_KEY_CONFLICT');
  assert.deepEqual(statuses(conflict.body), ['succeeded', 'failed', 'not-run']);
  const allReplayed = await boot();
  for (const entry of doc().steps) await allReplayed.engine.submit(entry);
  assert.equal((await allReplayed.runner.run(doc())).status, 200, 'no effect was applied by this request');
});

test('an inspect while the preset runs shows the steps acknowledged so far as in flight', { timeout: 30000 }, async () => {
  const held = gate();
  const { runner } = await boot({ executor: held.executor });
  const running = runner.run(doc());
  await inFlight(held, 'preset-a-step-1', [running]);
  held.release('preset-a-step-1');
  await inFlight(held, 'preset-a-step-2', [running]);
  const view = runner.inspect(KEY);
  assert.equal(view.status, 202);
  assert.equal(view.body.error.code, 'PRESET_IN_FLIGHT');
  assert.deepEqual(statuses(view.body), ['succeeded', 'running', 'not-run']);
  assert.equal((await runner.resume(KEY)).body.error.code, 'ACTION_NOT_ALLOWED');
  held.release('preset-a-step-2');
  await inFlight(held, 'preset-a-step-3', [running]);
  held.release('preset-a-step-3');
  assert.equal((await running).body.outcome, 'succeeded');
});

test('the bounds, the run limit and a hostile clock', { timeout: 60000 }, async (context) => {
  await context.test('a clock that is not a number never exceeds the bound, one that runs backwards clamps to zero', async () => {
    const clk = clock();
    clk.set(Number.NaN);
    assert.equal((await (await boot({ clk })).runner.run(doc())).body.usage.elapsedMs, 0);
    const back = clock();
    back.set(5000);
    const booted = await boot({ clk: back, executor: async () => { back.set(10); } });
    const answer = await booted.runner.run(doc());
    assert.equal(answer.body.outcome, 'succeeded');
    assert.equal(answer.body.usage.elapsedMs, 0);
  });
  await context.test('a step may start exactly at the duration bound, one millisecond over stops before it', async () => {
    const run = async (maxDurationMs) => {
      const clk = clock();
      const booted = await boot({ clk, executor: async ({ key }) => { if (key !== 'preset-a-step-3') clk.advance(500); } });
      return booted.runner.run(doc({ bounds: { maxSteps: 4, maxDurationMs, maxUnits: 40 } }));
    };
    const within = await run(1000);
    assert.equal(within.body.outcome, 'succeeded', 'at exactly 1000 ms before step 3 the step may start');
    const over = await run(999);
    assert.deepEqual([over.body.error.code, over.body.ran, over.body.notRun], ['PRESET_BOUND_EXCEEDED', [1, 2], [3]]);
  });
  await context.test('the duration bound counts the attempt of a resume, not the time before it', async () => {
    const clk = clock();
    let failures = 1;
    const booted = await boot({ clk, executor: async ({ key }) => { clk.advance(400); if (key === 'preset-a-step-2' && failures > 0) { failures -= 1; throw new Error('once'); } } });
    assert.equal((await booted.runner.run(doc())).body.outcome, 'interrupted');
    clk.advance(100000);
    const resumed = await booted.runner.resume(KEY);
    assert.equal(resumed.body.outcome, 'succeeded', 'the long pause was not part of the resumed attempt');
  });
  await context.test('at most 64 open or completed runs are admitted, and stopped runs never use admission up (C042 F3)', async () => {
    const { runner, real } = await boot();
    const tight = (index) => doc({ idempotencyKey: `stop-run-${String(index).padStart(4, '0')}`, steps: [step(index, { idempotencyKey: `stop-step-${String(index).padStart(4, '0')}`, leaseId: 'synthetic-lease-002', units: 10 })] });
    assert.equal((await runner.run(tight(0))).body.outcome, 'succeeded', 'the first run fills the small lease');
    for (let index = 1; index <= 70; index += 1) assert.equal((await runner.run(tight(index))).body.outcome, 'failed', `run ${index} is refused by capacity and consumes no admission`);
    for (let index = 0; index < 63; index += 1) {
      const answer = await runner.run(doc({ idempotencyKey: `bulk-run-${String(index).padStart(4, '0')}`, steps: [step(`b${index}`, { units: 1, idempotencyKey: `bulk-step-${String(index).padStart(4, '0')}` })] }));
      assert.equal(answer.body.outcome, 'succeeded');
    }
    const over = await runner.run(doc({ idempotencyKey: 'bulk-run-over0', steps: [step('x', { idempotencyKey: 'bulk-step-over0' })] }));
    assert.equal(over.status, 503);
    assert.equal(over.body.error.code, 'RUN_LIMIT_REACHED');
    assert.equal(committed(real), 63);
  });
  await context.test('the preset journal stops admitting below the size its replay accepts, so the service can always restart', async () => {
    const { runner, runIo, stepIo } = await boot();
    const tight = (index) => doc({ idempotencyKey: `grow-run-${String(index).padStart(5, '0')}`, steps: [step(index, { idempotencyKey: `grow-step-${String(index).padStart(5, '0')}`, leaseId: 'synthetic-lease-002', units: 10 })] });
    await runner.run(tight(0));
    let refused = null;
    for (let index = 1; index <= 2000 && refused === null; index += 1) {
      const answer = await runner.run(tight(index));
      if (answer.body.error.code === 'RUN_LIMIT_REACHED') refused = index;
    }
    assert.equal(refused !== null && refused > 500, true, `admission stopped at run ${refused}`);
    assert.equal(runIo.read().length < 1024 * 1024, true, 'the journal is below the replay bound');
    assert.equal((await boot({ stepIo, runIo })).runner.health().runs, refused, 'the journal replays after the bound was reached');
  });
  await context.test('parallel presets share the lease and never oversubscribe it', async () => {
    const held = gate();
    const { runner, real } = await boot({ executor: held.executor });
    const big = (n) => doc({ idempotencyKey: `big-run-000${n}`, steps: [step(`big${n}-a`, { idempotencyKey: `big-step-${n}-a`, leaseId: 'synthetic-lease-002', units: 6 })] });
    const first = runner.run(big(1));
    const second = runner.run(big(2));
    await inFlight(held, 'big-step-1-a', [first]);
    held.release('big-step-1-a');
    const answers = await Promise.all([first, second]);
    assert.deepEqual(answers.map((answer) => answer.body.outcome).sort(), ['failed', 'succeeded']);
    assert.equal(answers.find((answer) => answer.body.outcome === 'failed').body.error.details[0].code, 'CAPACITY_EXHAUSTED');
    assert.equal(committed(real, 'synthetic-lease-002'), 6);
  });
});

test('a halted runner answers every request with a typed unavailable failure and writes nothing', { timeout: 30000 }, async () => {
  const { runner, runIo } = await boot();
  runner.halt();
  const before = runIo.read();
  for (const answer of [await runner.run(doc()), runner.inspect(KEY), await runner.cancel(KEY), await runner.resume(KEY), runner.unsupportedAction(KEY)]) {
    assert.equal(answer.status, 503);
    assert.equal(answer.body.error.code, 'RUN_JOURNAL_UNAVAILABLE');
    assert.equal(answer.body.accepted, false);
  }
  assert.equal(runIo.read(), before);
});

test('openRunner refuses a missing step service, io or clock and a corrupt journal', { timeout: 30000 }, async () => {
  const engine = (await boot()).engine;
  await assert.rejects(() => openRunner({ io: createMemoryIo() }), TypeError);
  await assert.rejects(() => openRunner({ engine: {}, io: createMemoryIo() }), TypeError);
  await assert.rejects(() => openRunner({ engine }), TypeError);
  await assert.rejects(() => openRunner({ engine, io: createMemoryIo(), clock: 5 }), TypeError);
  await assert.rejects(() => openRunner(), TypeError);
  const io = createMemoryIo();
  io.append('{"not":"a record"}\n');
  await assert.rejects(() => openRunner({ engine, io }), { code: 'JOURNAL_CORRUPT' });
});

test('a torn final line of the preset journal is discarded, truncated and reported', { timeout: 30000 }, async () => {
  const first = await boot();
  await first.runner.run(doc());
  first.runIo.append('{"seq":99,"prev":"');
  const second = await boot({ stepIo: first.stepIo, runIo: first.runIo });
  assert.equal(second.runner.health().discardedTailBytes, 18);
  assert.equal(second.runner.inspect(KEY).body.run.state, 'completed');
  assert.equal(second.runIo.read().endsWith('\n'), true);
  assert.equal((await boot({ stepIo: first.stepIo, runIo: first.runIo })).runner.health().discardedTailBytes, 0);
});
