'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate, validateConfig, createSession, OPTIONS, LIMITS } = require('../model.js');

const safe = Object.freeze({
  routing: 'coordinated', ownership: 'exclusive', data: 'current', coverage: 'complete',
});

test('S065 synchronized exclusive relocation preserves committed effects and routing', () => {
  const result = simulate(safe);
  assert.equal(result.verdict, 'success', 'a fully observed safe hot-partition move must pass');
  assert.equal(result.metrics.attemptedOperations, 12);
  assert.equal(result.metrics.successfulOperations, 12);
  assert.equal(result.metrics.dualOwnerPhases, 0);
  assert.equal(result.metrics.routingGapPhases, 0);
  assert.deepEqual(result.metrics.missingCommittedEffects, []);
  assert.deepEqual(result.trace.map((phase) => phase.hotRoute), ['shard-old', 'shard-new', 'shard-new']);
  assert.deepEqual(result.trace.map((phase) => phase.activeOwners.length), [1, 1, 1]);
  assert.ok(result.trace.every((phase) => phase.coldRoute === 'shard-cold'));
  assert.deepEqual(result.trace[2].operations.find((operation) => operation.id === 'H-R3').received,
    ['H0', 'H1', 'H2', 'H3']);
});

test('a recovered hot routing gap retains two failed operations and cannot pass', () => {
  const result = simulate({ ...safe, routing: 'gap' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.routingGapPhases, 1);
  assert.equal(result.metrics.failedOperations, 2);
  assert.equal(result.metrics.successfulOperations, 10);
  assert.equal(result.trace[1].hotRoute, null);
  assert.equal(result.trace[2].hotRoute, 'shard-new');
  assert.deepEqual(result.trace[1].operations.slice(0, 2).map((operation) => operation.reason),
    ['routing-gap', 'routing-gap']);
  assert.deepEqual(result.trace[2].acknowledgedHotEffects, ['H0', 'H1', 'H3']);
  assert.match(result.userImpact, /Interrupted or unsafe/);
});

test('a stale hot route reaches the fenced former owner; cold traffic is not migration proof', () => {
  const result = simulate({ ...safe, routing: 'stale' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.staleRoutePhases, 2);
  assert.equal(result.metrics.failedOperations, 4);
  assert.equal(result.metrics.coldSuccessfulOperations, 6);
  assert.equal(result.metrics.movedHotOperations, 0);
  assert.equal(result.trace[1].operations[0].reason, 'fenced-former-owner');
  assert.deepEqual(result.trace[2].activeOwners, ['shard-new']);
  assert.ok(result.reasons.includes('No successful hot target exposure.'));
});

test('two active owners fail despite twelve successful operations and later fencing', () => {
  const result = simulate({ ...safe, ownership: 'overlap' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.failedOperations, 0);
  assert.equal(result.metrics.successfulOperations, 12);
  assert.equal(result.metrics.dualOwnerPhases, 1);
  assert.deepEqual(result.trace[1].activeOwners, ['shard-old', 'shard-new']);
  assert.deepEqual(result.trace[1].ownerEpochs, [
    { owner: 'shard-old', epoch: 7 }, { owner: 'shard-new', epoch: 8 },
  ]);
  assert.deepEqual(result.trace[2].activeOwners, ['shard-new']);
  assert.ok(result.reasons.some((reason) => /simultaneous/.test(reason)));
});

test('missing acknowledged H1 fails two reads even with correct routes and exclusive owners', () => {
  const result = simulate({ ...safe, data: 'behind' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.failedOperations, 2);
  assert.deepEqual(result.metrics.missingCommittedEffects, ['H1']);
  assert.equal(result.metrics.routingGapPhases, 0);
  assert.equal(result.metrics.dualOwnerPhases, 0);
  const read = result.trace[2].operations.find((operation) => operation.id === 'H-R3');
  assert.deepEqual(read.required, ['H0', 'H1', 'H2', 'H3']);
  assert.deepEqual(read.received, ['H0', 'H2', 'H3']);
  assert.deepEqual(read.missing, ['H1']);
});

test('unknown observations redact evidence; configured intent cannot create a pass or observed failure', () => {
  for (const config of [safe, { ...safe, routing: 'gap' }, { ...safe, ownership: 'overlap' }]) {
    const partial = simulate({ ...config, coverage: 'partial' });
    assert.equal(partial.verdict, 'unknown');
    assert.equal(partial.metrics.unknownOperations, 4);
    assert.equal(partial.metrics.observedOperations, 8);
    assert.equal(partial.metrics.successfulOperations, 8);
    assert.equal(partial.trace[1].observed, false);
    assert.equal(partial.trace[1].activeOwners, null);
    assert.equal(partial.trace[1].hotRoute, null);
    assert.deepEqual(partial.trace[1].operations, []);
  }
  const none = simulate({ ...safe, routing: 'gap', ownership: 'overlap', data: 'behind', coverage: 'none' });
  assert.equal(none.verdict, 'unknown');
  assert.equal(none.metrics.successfulOperations, 0);
  assert.equal(none.metrics.unknownOperations, 12);
  assert.equal(none.metrics.dualOwnerPhases, 0);
  assert.ok(none.trace.every((phase) => !phase.observed && phase.acknowledgedHotEffects === null));
});

test('known after-phase failures dominate missing cutover evidence', () => {
  const stale = simulate({ ...safe, routing: 'stale', coverage: 'partial' });
  assert.equal(stale.verdict, 'failure');
  assert.equal(stale.metrics.failedOperations, 2);
  assert.equal(stale.metrics.unknownOperations, 4);
  const missing = simulate({ ...safe, data: 'behind', coverage: 'partial' });
  assert.equal(missing.verdict, 'failure');
  assert.equal(missing.metrics.failedOperations, 1);
  assert.deepEqual(missing.metrics.missingCommittedEffects, ['H1']);
});

test('all 36 configurations are deterministic and obey failure-over-unknown classification', () => {
  const counts = { success: 0, failure: 0, unknown: 0 };
  for (const routing of OPTIONS.routing) for (const ownership of OPTIONS.ownership) {
    for (const data of OPTIONS.data) for (const coverage of OPTIONS.coverage) {
      const config = { routing, ownership, data, coverage };
      const result = simulate(config);
      const expected = coverage === 'none' ? 'unknown'
        : routing === 'stale' || data === 'behind' ? 'failure'
          : coverage === 'partial' ? 'unknown'
            : routing === 'gap' || ownership === 'overlap' ? 'failure' : 'success';
      assert.equal(result.verdict, expected, JSON.stringify(config));
      assert.deepEqual(result, simulate(config));
      const metrics = result.metrics;
      assert.equal(metrics.successfulOperations + metrics.failedOperations + metrics.unknownOperations, 12);
      assert.equal(metrics.successfulOperations + metrics.failedOperations, metrics.observedOperations);
      assert.equal(metrics.coldSuccessfulOperations, coverage === 'complete' ? 6 : coverage === 'partial' ? 4 : 0);
      assert.equal(result.nativeQualified, false);
      assert.equal(result.mode, 'synthetic');
      counts[result.verdict]++;
    }
  }
  assert.deepEqual(counts, { success: 1, failure: 19, unknown: 16 });
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), LIMITS.configurations);
});

test('strict exact-shape enums reject malformed objects without evaluating getters', () => {
  const getter = { ...safe };
  Object.defineProperty(getter, 'routing', { enumerable: true, get() { throw new Error('getter executed'); } });
  const hidden = { ...safe };
  Object.defineProperty(hidden, 'routing', { value: 'coordinated', enumerable: false });
  const inherited = Object.create(safe);
  const invalid = [
    null, undefined, true, 1, 'coordinated', [], new Date(), new Map(),
    Object.create(null), inherited, getter, hidden,
    {}, { ...safe, extra: true }, { ...safe, endpoint: 'synthetic.invalid' },
    { ...safe, [Symbol('extra')]: 'x' }, { ...safe, routing: ' coordinated' },
    { ...safe, routing: 'COORDINATED' }, { ...safe, routing: new String('coordinated') },
    { ...safe, ownership: null }, { ...safe, data: 1 }, { ...safe, coverage: [] },
    { ...safe, coverage: 'complete\n' }, JSON.parse('{"__proto__":{},"routing":"coordinated","ownership":"exclusive","data":"current","coverage":"complete"}'),
  ];
  for (const input of invalid) {
    assert.throws(() => validateConfig(input), TypeError);
    assert.throws(() => simulate(input), TypeError);
    const session = createSession();
    const before = session.snapshot();
    assert.throws(() => session.start(input), TypeError);
    assert.deepEqual(session.snapshot(), before);
  }
  assert.deepEqual(validateConfig({ ...safe }), safe);
  assert.throws(() => OPTIONS.routing.push('arbitrary'), TypeError);
});

test('lifecycle guards reject wrong-order actions with no state mutation or premature verdict', () => {
  const session = createSession();
  function unchanged(action) {
    const before = session.snapshot();
    assert.throws(action, { code: 'ERR_LESSON_STATE' });
    assert.deepEqual(session.snapshot(), before);
  }
  unchanged(() => session.step());
  unchanged(() => session.newAttempt());
  session.start(safe);
  assert.equal(session.snapshot().current.result, null);
  unchanged(() => session.start(safe));
  unchanged(() => session.newAttempt());
  for (let index = 0; index < 3; index++) {
    const state = session.step();
    assert.equal(state.current.trace.length, index + 1);
    assert.equal(state.completedAttempts, index === 2 ? 1 : 0);
    assert.equal(state.status, index === 2 ? 'complete' : 'running');
    if (index !== 2) assert.equal(state.current.result, null);
  }
  unchanged(() => session.step());
  unchanged(() => session.start(safe));
});

test('inputs and deep-frozen snapshots cannot modify current or retained failure evidence', () => {
  const input = { ...safe, routing: 'gap' };
  const session = createSession();
  const started = session.start(input);
  input.routing = 'coordinated';
  assert.equal(session.snapshot().current.config.routing, 'gap');
  assert.throws(() => { started.current.config.routing = 'coordinated'; }, TypeError);
  assert.throws(() => started.current.trace.push({}), TypeError);
  session.step(); session.step(); session.step();
  const completed = session.snapshot();
  assert.equal(completed.history[0].result.verdict, 'failure');
  assert.throws(() => { completed.history[0].result.metrics.failedOperations = 0; }, TypeError);
  assert.throws(() => completed.history[0].trace[1].operations.pop(), TypeError);
  session.newAttempt();
  session.start(safe); session.step(); session.step(); session.step();
  assert.deepEqual(session.snapshot().history[0], completed.history[0]);
  assert.equal(session.snapshot().history[1].result.verdict, 'success');
  session.reset();
  assert.equal(completed.history.length, 1);
  assert.equal(session.snapshot().history.length, 0);
});

test('six attempts are bounded; reset clears both completed and in-flight state', () => {
  const session = createSession();
  for (let index = 0; index < 6; index++) {
    if (index) session.newAttempt();
    session.start({ ...safe, coverage: index % 2 ? 'none' : 'complete' });
    session.step(); session.step(); session.step();
    assert.equal(session.snapshot().current.id, index + 1);
  }
  const full = session.snapshot();
  assert.equal(full.history.length, 6);
  assert.throws(() => session.newAttempt(), /Six attempts retained/);
  assert.throws(() => session.start(safe), /new, ready attempt/);
  assert.deepEqual(session.snapshot(), full);
  session.reset();
  session.start(safe); session.step();
  assert.equal(session.snapshot().current.id, 1);
  const reset = session.reset();
  assert.deepEqual(reset, { status: 'ready', current: null, history: [], completedAttempts: 0, limit: 6 });
  assert.deepEqual(session.reset(), reset);
});
