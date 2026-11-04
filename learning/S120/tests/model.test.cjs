'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const remove = (state, destination) => M.act(state, { type: 'remove', destination, confirmed: true });
const observe = (state) => M.act(state, { type: 'observe' });
const verify = (state, claim = 'expected-interruption') => M.act(state, { type: 'verify', claim });
const outage = () => observe(remove(remove(M.create(), 'origin-a'), 'origin-b'));
const rejected = (state, command, code) => {
  const before = JSON.stringify(state);
  assert.throws(() => M.act(state, command), (error) => error.code === code);
  assert.equal(JSON.stringify(state), before, 'rejection must not mutate the issued state');
};

test('BDD: empty sample is unverified, not 100% success', () => {
  const state = M.create();
  const result = M.summarize(state);
  assert.equal(M.BANNER, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(result.verification, 'unverified');
  assert.equal(result.attempted, 0);
  assert.equal(result.successfulMigrations, 0);
  assert.equal(result.affectedAttempts, 0);
  assert.deepEqual(result.viableDestinations, ['origin-a', 'origin-b']);
});

test('BDD: one surviving consistent path is a positive control only', () => {
  const initial = M.create();
  const state = observe(remove(observe(initial), 'origin-a'));
  const result = M.summarize(state);
  assert.deepEqual(result.viableDestinations, ['origin-b']);
  assert.equal(result.succeeded, 4);
  assert.equal(result.interrupted, 0);
  assert.equal(result.unknown, 0);
  assert.equal(result.successfulMigrations, 0);
  assert.equal(result.verification, 'unverified');
  assert.equal(initial.attempts.length, 0);
  assert.deepEqual(state.attempts.map((item) => item.destination), ['origin-a', 'origin-a', 'origin-b', 'origin-b']);
  assert.ok(state.attempts.every((item) => item.latencyMs <= item.budgetMs && item.stateRevision === 7));
  assert.equal(new Set(state.effects.map((item) => item.key)).size, 2);
});

test('BDD: total loss retains two known interruptions and an unknown write', () => {
  const state = verify(outage());
  const result = M.summarize(state);
  assert.deepEqual(result.viableDestinations, []);
  assert.deepEqual([result.attempted, result.succeeded, result.interrupted, result.unknown], [3, 0, 2, 1]);
  assert.equal(result.affectedAttempts, 3);
  assert.equal(result.successfulMigrations, 0);
  assert.equal(result.verification, 'pass');
  assert.equal(result.userImpact, 'interrupted');
  assert.match(result.envelope, /unsupported.*no viable destination/i);
  assert.match(result.reason, /unavoidable interruption/i);
  assert.equal(state.effects.length, 0, 'a new write without authoritative state must not be admitted');
  assert.deepEqual(state.attempts.map((item) => item.outcome), ['interrupted', 'interrupted', 'unknown']);
  assert.deepEqual(state.attempts.map((item) => item.httpStatus), [503, 503, null]);
  assert.equal(state.attempts[2].latencyMs, null);
  assert.equal(state.pendingEffect, 'unresolved');
});

test('BDD: zero-downtime claim fails without relabeling user impact', () => {
  const result = M.summarize(verify(outage(), 'zero-downtime'));
  assert.equal(result.verification, 'fail');
  assert.equal(result.userImpact, 'interrupted');
  assert.equal(result.unknown, 1);
  assert.equal(result.successfulMigrations, 0);
});

test('BDD: incomplete-evidence claim cannot produce a success', () => {
  const state = verify(outage(), 'unverified');
  assert.equal(M.summarize(state).verification, 'unverified');
  assert.equal(M.summarize(state).userImpact, 'interrupted');
  assert.equal(M.summarize(state).successfulMigrations, 0);
});

test('BDD: recovery requires prior total-loss observations and authoritative reconciliation', () => {
  rejected(M.create(), { type: 'recover', destination: 'origin-a', reconciled: true }, 'ERR_RECOVERY');
  const unobserved = remove(remove(M.create(), 'origin-a'), 'origin-b');
  rejected(unobserved, { type: 'recover', destination: 'origin-a', reconciled: true }, 'ERR_RECOVERY');
  for (const reconciled of [false, 'true', 1, null, undefined]) {
    rejected(outage(), { type: 'recover', destination: 'origin-a', reconciled }, 'ERR_CONFIRMATION');
  }
});

for (const destination of ['origin-a', 'origin-b']) {
  test(`BDD: recovering ${destination} keeps outage and unknown history`, () => {
    const loss = verify(outage());
    const state = verify(observe(M.act(loss, { type: 'recover', destination, reconciled: true })));
    const result = M.summarize(state);
    assert.deepEqual(result.viableDestinations, [destination]);
    assert.deepEqual([result.attempted, result.succeeded, result.interrupted, result.unknown], [5, 2, 2, 1]);
    assert.equal(result.affectedAttempts, 3);
    assert.equal(result.verification, 'pass');
    assert.equal(result.userImpact, 'interrupted');
    assert.equal(result.successfulMigrations, 0);
    assert.match(result.cleanup, new RegExp(`owned fixture recovered: ${destination}`));
    assert.match(result.envelope, /unsupported/);
    assert.equal(state.pendingEffect, 'reconciled-once');
    assert.equal(state.effects.filter((item) => item.key === 'pending-commit').length, 1);
    assert.deepEqual(state.attempts.slice(0, 3), loss.attempts);
    assert.equal(loss.effects.length, 0);
    assert.equal(state.destinations.find((item) => item.id !== destination).available, false);
    rejected(state, { type: 'recover', destination: destination === 'origin-a' ? 'origin-b' : 'origin-a', reconciled: true }, 'ERR_RECOVERY');
  });
}

test('BDD: blind retry is rejected before and after reconciliation', () => {
  rejected(M.create(), { type: 'retry' }, 'ERR_RETRY');
  const loss = outage();
  rejected(loss, { type: 'retry' }, 'ERR_RETRY');
  const recovered = M.act(loss, { type: 'recover', destination: 'origin-a', reconciled: true });
  rejected(recovered, { type: 'retry' }, 'ERR_RETRY');
});

test('BDD: duplicate removal and duplicate topology observation are rejected', () => {
  const single = remove(M.create(), 'origin-a');
  rejected(single, { type: 'remove', destination: 'origin-a', confirmed: true }, 'ERR_REMOVAL');
  rejected(observe(M.create()), { type: 'observe' }, 'ERR_OBSERVATION');
  rejected(outage(), { type: 'observe' }, 'ERR_OBSERVATION');
  const recovered = M.act(outage(), { type: 'recover', destination: 'origin-a', reconciled: true });
  rejected(recovered, { type: 'remove', destination: 'origin-a', confirmed: true }, 'ERR_REMOVAL');
});

test('BDD: only exact owned destination identifiers are accepted', () => {
  for (const destination of ['origin-c', ' origin-a', 'ORIGIN-A', '', '<img src=x onerror=alert(1)>', '__proto__', 1, null, {}, [], undefined]) {
    rejected(M.create(), { type: 'remove', destination, confirmed: true }, 'ERR_DESTINATION');
    rejected(outage(), { type: 'recover', destination, reconciled: true }, 'ERR_DESTINATION');
  }
});

test('BDD: confirmation is strictly boolean true', () => {
  for (const confirmed of [false, 'true', 'false', 1, 0, null, undefined, [], {}]) {
    rejected(M.create(), { type: 'remove', destination: 'origin-a', confirmed }, 'ERR_CONFIRMATION');
  }
});

test('BDD: closed typed command schemas reject extra keys and malformed commands', () => {
  for (const command of [null, undefined, true, 1, 'observe', [], {}, { type: 'unknown' }, { type: ' observe' },
    { type: 'observe', ignored: true }, { type: 'reset', clearHistory: true }, { type: 'retry', newKey: 'duplicate' },
    { type: 'remove', destination: 'origin-a', confirmed: true, owner: 'foreign' },
    { type: 'recover', destination: 'origin-a', reconciled: true, stateRevision: 1 },
    { type: 'verify', claim: 'expected-interruption', fabricatedSuccesses: 100 }]) {
    rejected(M.create(), command, 'ERR_COMMAND');
  }
  const inherited = Object.create({ type: 'observe' });
  rejected(M.create(), inherited, 'ERR_COMMAND');
  const symbolKey = { type: 'observe', [Symbol('extra')]: true };
  rejected(M.create(), symbolKey, 'ERR_COMMAND');
  const accessor = Object.defineProperty({}, 'type', { enumerable: true, get() { throw new Error('must not invoke an untrusted getter'); } });
  rejected(M.create(), accessor, 'ERR_COMMAND');
});

test('BDD: only the three exact claims are accepted', () => {
  for (const claim of ['pass', 'Expected-interruption', '', true, null, 100, undefined]) {
    rejected(outage(), { type: 'verify', claim }, 'ERR_CLAIM');
  }
});

test('BDD: states and nested history are immutable and foreign states are rejected', () => {
  const state = outage();
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.attempts) && Object.isFrozen(state.destinations[0]));
  assert.throws(() => { state.destinations[0].available = true; }, TypeError);
  assert.throws(() => { state.attempts[2].outcome = 'succeeded'; }, TypeError);
  for (const foreign of [null, undefined, {}, { ...state }, JSON.parse(JSON.stringify(state)), [], 'state']) {
    assert.throws(() => M.act(foreign, { type: 'observe' }), (error) => error.code === 'ERR_STATE');
    assert.throws(() => M.summarize(foreign), (error) => error.code === 'ERR_STATE');
  }
  assert.throws(() => M.create({ destinations: [] }), (error) => error.code === 'ERR_STATE');
});

test('BDD: reset retains the complete original run and never silently drops history', () => {
  const prior = verify(M.act(outage(), { type: 'recover', destination: 'origin-a', reconciled: true }));
  let state = M.act(prior, { type: 'reset' });
  assert.equal(state.runNumber, 2);
  assert.equal(state.step, 0);
  assert.equal(state.history.length, 1);
  assert.deepEqual(state.history[0].attempts, prior.attempts);
  assert.deepEqual(state.history[0].effects, prior.effects);
  assert.deepEqual(state.history[0].events, prior.events);
  assert.deepEqual(state.history[0].result, M.summarize(prior));
  assert.ok(Object.isFrozen(state.history[0].attempts[2]));
  assert.equal(M.summarize(state).attempted, 0);
  assert.deepEqual(M.summarize(state).viableDestinations, ['origin-a', 'origin-b']);
  for (let index = 1; index < M.LIMITS.archives; index++) state = M.act(state, { type: 'reset' });
  assert.equal(state.history.length, 5);
  rejected(state, { type: 'reset' }, 'ERR_HISTORY');
  assert.equal(state.history[0].result.unknown, 1);
});

test('BDD: accepted actions are bounded, but reset remains available at the action limit', () => {
  let state = M.create();
  for (let index = 0; index < M.LIMITS.actions; index++) state = verify(state, 'unverified');
  assert.equal(state.step, 12);
  rejected(state, { type: 'observe' }, 'ERR_LIMIT');
  assert.equal(M.act(state, { type: 'reset' }).step, 0);
});

test('BDD: the complete worked trace is deterministic, with distinct attempt attribution', () => {
  const run = () => {
    let state = observe(M.create());
    state = observe(remove(state, 'origin-a'));
    state = verify(observe(remove(state, 'origin-b')));
    state = M.act(state, { type: 'recover', destination: 'origin-a', reconciled: true });
    return verify(observe(state));
  };
  const first = run();
  assert.deepEqual(run(), first);
  assert.equal(first.events.length, first.step);
  assert.deepEqual(first.events.map((item) => item.tickMs), first.events.map((_, index) => (index + 1) * 5));
  assert.equal(new Set(first.attempts.map((item) => item.id)).size, first.attempts.length);
  assert.ok(first.attempts.every((item) => ['control', 'loss', 'recovered-control'].includes(item.cohort)));
  assert.deepEqual([M.summarize(first).succeeded, M.summarize(first).interrupted, M.summarize(first).unknown], [6, 2, 1]);
});
