'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const config = (changes = {}) => ({ ...model.DEFAULTS, ...changes });
function conduct(session, changes = {}) {
  session.dispatch('burst', config(changes));
  session.dispatch('expand');
  session.dispatch('drain');
  return session.dispatch('verify');
}

test('the CommonJS model and default session are loadable', () => {
  assert.equal(typeof model.createSession, 'function');
  assert.equal(typeof model.runScenario, 'function');
  assert.equal(model.createSession().snapshot().phase, 'idle');
});

test('burst creates an observable six-job backlog before expansion', () => {
  const state = model.createSession().dispatch('burst', config());
  assert.equal(state.phase, 'burst');
  assert.equal(state.jobs.length, 6);
  assert.equal(state.consumers, 1);
  assert.equal(state.result, null);
});

test('one added worker meets keyed FIFO and the inclusive tick-5 deadline', () => {
  const state = conduct(model.createSession());
  assert.equal(state.phase, 'verified');
  assert.equal(state.observationTick, 5);
  assert.deepEqual(state.result, {
    outcome: 'PASS', success: 6, failure: 0, unknown: 0,
    completed: 6, overdue: 0, orderingViolations: 0,
    total: 6, observedBacklog: 0, throughput: 1.2,
  });
});

test('faster complete throughput still fails actual ordering', () => {
  const run = model.runScenario(config({ addedWorkers: 2, scheduling: 'parallel', deadline: 4 }));
  assert.equal(run.observationTick, 4);
  assert.equal(run.result.outcome, 'FAIL');
  assert.equal(run.result.completed, 6);
  assert.equal(run.result.overdue, 0);
  assert.equal(run.result.orderingViolations, 2);
  assert.deepEqual(run.jobs.filter((job) => job.ordered === false).map((job) => job.id), ['A2', 'B2']);
  assert.equal(run.result.throughput, 1.5);
});

test('eventual complete drain does not erase overdue failures', () => {
  const run = model.runScenario(config({ deadline: 4 }));
  assert.equal(run.result.outcome, 'FAIL');
  assert.equal(run.result.completed, 6);
  assert.equal(run.result.overdue, 2);
  assert.equal(run.result.failure, 2);
  assert.deepEqual(run.jobs.filter((job) => job.onTime === false).map((job) => job.id), ['A3', 'B3']);
});

test('expansion is key-limited and burst size affects completion time', () => {
  assert.equal(model.runScenario(config({ addedWorkers: 0 })).observationTick, 10);
  assert.equal(model.runScenario(config({ addedWorkers: 2 })).observationTick, 5);
  assert.equal(model.runScenario(config({ burstSize: 12 })).observationTick, 8);
  assert.equal(model.runScenario(config({ addedWorkers: 0, deadline: 10 })).result.outcome, 'PASS');
  assert.equal(model.runScenario(config({ scheduling: 'parallel' })).result.outcome, 'PASS');
});

test('missing completion evidence remains unknown and known failures dominate', () => {
  const unknown = model.runScenario(config({ evidence: 'gap' }));
  assert.equal(unknown.result.outcome, 'UNKNOWN');
  assert.equal(unknown.result.success, 5);
  assert.equal(unknown.result.unknown, 1);
  assert.equal(unknown.result.completed, 5);
  const failure = model.runScenario(config({ evidence: 'gap', deadline: 4 }));
  assert.equal(failure.result.outcome, 'FAIL');
  assert.equal(failure.result.failure, 1);
  assert.equal(failure.result.unknown, 1);
  assert.equal(failure.jobs.at(-1).completionTick, null);
});

test('malformed input is rejected without changing idle state', () => {
  for (const invalid of [
    null, [], {}, config({ burstSize: '6' }), config({ burstSize: 0 }),
    config({ burstSize: 7 }), config({ addedWorkers: 1.5 }), config({ addedWorkers: 3 }),
    config({ deadline: NaN }), config({ deadline: Infinity }), config({ deadline: 6 }),
    config({ evidence: 'fabricated' }), config({ scheduling: 'random' }),
    { ...config(), endpoint: 'synthetic-only' }, Object.create(config()),
  ]) {
    const session = model.createSession();
    const before = session.snapshot();
    assert.throws(() => session.dispatch('burst', invalid), /Invalid/);
    assert.deepEqual(session.snapshot(), before);
  }
});

test('unknown, repeated and out-of-order transitions cannot mutate state', () => {
  const session = model.createSession();
  for (const action of ['expand', 'drain', 'verify', 'check', 'next', 'bogus', null]) {
    assert.throws(() => session.dispatch(action), /Invalid/);
    assert.equal(session.snapshot().phase, 'idle');
  }
  session.dispatch('burst', config());
  const before = session.snapshot();
  assert.throws(() => session.dispatch('burst', config()), /Invalid/);
  assert.throws(() => session.dispatch('expand', {}), /Invalid/);
  assert.deepEqual(session.snapshot(), before);
});

test('history retains failed and unknown outcomes independently of predictions', () => {
  const session = model.createSession();
  conduct(session, { deadline: 4 });
  const failed = session.dispatch('check', 'PASS');
  assert.equal(failed.phase, 'recorded');
  assert.equal(failed.history[0].result.outcome, 'FAIL');
  assert.equal(failed.history[0].predictionCorrect, false);
  session.dispatch('next');
  conduct(session, { evidence: 'gap' });
  const retained = session.dispatch('check', 'UNKNOWN');
  assert.equal(retained.history.length, 2);
  assert.equal(retained.history[1].result.outcome, 'UNKNOWN');
  assert.equal(retained.history[0].config.deadline, 4);
  assert.ok(retained.history[0].trace.length > 0);
});

test('six attempts are bounded without eviction and reset clears everything', () => {
  const session = model.createSession();
  for (let index = 0; index < model.MAX_HISTORY; index += 1) {
    conduct(session);
    session.dispatch('check', 'PASS');
    if (index < model.MAX_HISTORY - 1) session.dispatch('next');
  }
  assert.equal(session.snapshot().history.length, 6);
  assert.throws(() => session.dispatch('next'), /Invalid/);
  assert.throws(() => session.dispatch('check', 'PASS'), /Invalid/);
  assert.deepEqual(session.dispatch('reset'), model.createSession().snapshot());
});

test('all 96 configurations replay deterministically and conserve job attribution', () => {
  let cases = 0;
  for (const burstSize of model.CHOICES.burstSize) {
    for (const addedWorkers of model.CHOICES.addedWorkers) {
      for (const scheduling of model.CHOICES.scheduling) {
        for (const deadline of model.CHOICES.deadline) {
          for (const evidence of model.CHOICES.evidence) {
            const input = { burstSize, addedWorkers, scheduling, deadline, evidence };
            const run = model.runScenario(input);
            assert.deepEqual(run, model.runScenario(input));
            const completions = run.trace.filter((event) => event.type === 'complete');
            const starts = run.trace.filter((event) => event.type === 'start');
            assert.equal(new Set(starts.map((event) => event.jobId)).size, burstSize);
            assert.equal(completions.length, burstSize - (evidence === 'gap' ? 1 : 0));
            assert.equal(run.result.success + run.result.failure + run.result.unknown, burstSize);
            assert.ok(run.observationTick >= 1 && run.observationTick <= 16);
            assert.ok(starts.every((event) => event.worker >= 0 && event.worker <= addedWorkers));
            for (const job of run.jobs) {
              const finish = completions.findIndex((event) => event.jobId === job.id);
              if (finish < 0) {
                assert.equal(job.outcome, 'UNKNOWN');
                assert.equal(job.completionTick, null);
                continue;
              }
              assert.equal(completions[finish].tick, job.startTick + job.serviceTicks);
              const earlier = completions.slice(0, finish).filter((event) => event.key === job.key);
              const ordered = Array.from({ length: job.sequence - 1 }, (_, index) => index + 1)
                .every((sequence) => earlier.some((event) => event.sequence === sequence));
              const onTime = completions[finish].tick <= deadline;
              assert.equal(job.ordered, ordered);
              assert.equal(job.onTime, onTime);
              assert.equal(job.outcome, ordered && onTime ? 'PASS' : 'FAIL');
              if (scheduling === 'keyed') assert.equal(ordered, true);
            }
            const expected = run.jobs.some((job) => job.outcome === 'FAIL') ? 'FAIL'
              : run.jobs.some((job) => job.outcome === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';
            assert.equal(run.result.outcome, expected);
            cases += 1;
          }
        }
      }
    }
  }
  assert.equal(cases, 96);
});

test('keyed dispatch serializes each key and each worker without overlap', () => {
  for (const addedWorkers of [0, 1, 2]) {
    const run = model.runScenario(config({ burstSize: 12, addedWorkers, deadline: 16 }));
    const activeKeys = new Set();
    const activeWorkers = new Set();
    for (const event of run.trace) {
      if (event.type === 'start') {
        assert.equal(activeKeys.has(event.key), false);
        assert.equal(activeWorkers.has(event.worker), false);
        activeKeys.add(event.key);
        activeWorkers.add(event.worker);
      } else if (event.type === 'complete') {
        assert.equal(activeKeys.delete(event.key), true);
        assert.equal(activeWorkers.delete(event.worker), true);
      }
    }
    assert.equal(activeKeys.size, 0);
    assert.equal(activeWorkers.size, 0);
  }
});

test('own data fields only; accessors are not invoked during validation', () => {
  let reads = 0;
  const getter = config();
  Object.defineProperty(getter, 'deadline', { enumerable: true, get() { reads += 1; return 5; } });
  const symbol = { ...config(), [Symbol('extra')]: true };
  const nonEnumerable = config();
  Object.defineProperty(nonEnumerable, 'extra', { value: true });
  for (const value of [getter, symbol, nonEnumerable, Object.assign(Object.create(null), config())]) {
    assert.throws(() => model.runScenario(value), /Invalid/);
  }
  assert.equal(reads, 0);
});

test('snapshots, input copies and history are immutable and failed checks are atomic', () => {
  const session = model.createSession();
  const input = config();
  session.dispatch('burst', input);
  input.deadline = 4;
  assert.equal(session.snapshot().config.deadline, 5);
  assert.throws(() => { session.snapshot().config.deadline = 4; }, TypeError);
  assert.throws(() => { session.snapshot().jobs.push({}); }, TypeError);
  session.dispatch('expand');
  session.dispatch('drain');
  session.dispatch('verify');
  const before = session.snapshot();
  for (const prediction of ['', 'pass', null, {}, ['PASS']]) {
    assert.throws(() => session.dispatch('check', prediction), /Invalid/);
    assert.deepEqual(session.snapshot(), before);
  }
  session.dispatch('check', 'PASS');
  assert.throws(() => { session.snapshot().history[0].result.outcome = 'FAIL'; }, TypeError);
  assert.throws(() => session.dispatch('reset', true), /Invalid/);
  assert.equal(session.snapshot().history[0].result.outcome, 'PASS');
});

test('every premature or repeated stage is rejected and reset works at every phase', () => {
  const path = ['burst', 'expand', 'drain', 'verify', 'check', 'next'];
  for (let stop = 0; stop < path.length; stop += 1) {
    const session = model.createSession();
    for (let step = 0; step < stop; step += 1) {
      const action = path[step];
      session.dispatch(action, action === 'burst' ? config() : action === 'check' ? 'PASS' : undefined);
    }
    const before = session.snapshot();
    for (const action of path.filter((candidate) => candidate !== path[stop])) {
      assert.throws(() => session.dispatch(action, action === 'burst' ? config() : action === 'check' ? 'PASS' : undefined), /Invalid/);
      assert.deepEqual(session.snapshot(), before);
    }
    assert.deepEqual(session.dispatch('reset'), model.createSession().snapshot());
  }
});
