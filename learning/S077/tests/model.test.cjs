'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const config = { handler: 'ledger', firstOutcome: 'committed' };
const run = (input = config, state = model.createRehearsal()) =>
  model.redeliver(model.expireLock(model.deliver(state, input)));

test('all six configurations account for one message, repeated deliveries, effects and uncertainty', () => {
  let count = 0;
  for (const handler of ['ledger', 'blind']) {
    for (const firstOutcome of ['committed', 'not-committed', 'unresolved']) {
      const state = run({ handler, firstOutcome });
      const result = state.result;
      const expected = firstOutcome === 'unresolved' ? 'UNKNOWN'
        : handler === 'blind' && firstOutcome === 'committed' ? 'FAIL' : 'PASS';
      assert.equal(result.verdict, expected);
      assert.equal(result.deliveries, 2);
      assert.equal(result.repeatedDeliveries, 1);
      assert.equal(result.knownEffects, result.businessLedger.length);
      assert.equal(result.knownTotal, result.knownEffects * 10);
      assert.equal(result.duplicateEffects, Math.max(0, result.knownEffects - 1));
      assert.equal(result.unresolvedEffects, Number(firstOutcome === 'unresolved'));
      assert.deepEqual(result.possibleEffects, [result.knownEffects, result.knownEffects + result.unresolvedEffects]);
      assert.deepEqual(result.deliveryLedger.map((row) => row.messageId), ['MSG-077', 'MSG-077']);
      assert.ok(result.deliveryLedger.every((row) => row.businessKey === 'ORDER-077:credit'));
      assert.ok(result.businessLedger.every((row) => row.businessKey === 'ORDER-077:credit' && row.amount === 10));
      assert.equal(new Set(result.businessLedger.map((row) => row.effectId)).size, result.knownEffects);
      assert.equal(state.events.length, 3);
      count++;
    }
  }
  assert.equal(count, 6);
});

test('strict config shape, enum types, prototypes, symbols and accessors reject without state changes', () => {
  const ready = model.createRehearsal();
  const before = JSON.stringify(ready);
  const invalid = [
    null, undefined, [], '', 1, true, {}, { handler: 'ledger' }, { ...config, extra: true },
    { ...config, handler: 'Ledger' }, { ...config, handler: ['ledger'] },
    { ...config, firstOutcome: 'absent' }, { ...config, firstOutcome: new String('committed') },
    { ...config, firstOutcome: null }, { ...config, [Symbol('extra')]: 1 },
    Object.assign(Object.create(config), config),
    Object.defineProperty({ firstOutcome: 'committed' }, 'handler', { get() { throw new Error('must not evaluate'); } }),
  ];
  for (const input of invalid) {
    assert.throws(() => model.deliver(ready, input), /Choose/);
    assert.equal(JSON.stringify(ready), before);
  }
});

test('only authentic frozen states can drive every stateful action', () => {
  const ready = model.createRehearsal();
  const complete = run();
  for (const forged of [null, {}, { ...ready }, JSON.parse(JSON.stringify(complete)), Object.freeze({ ...complete })]) {
    for (const action of [
      () => model.deliver(forged, config), () => model.expireLock(forged),
      () => model.redeliver(forged), () => model.newAttempt(forged),
      () => model.reset(forged), () => model.checkPrediction(forged, 'PASS'),
    ]) assert.throws(action, /unmodified state/);
  }
  for (const value of [
    ready, ready.history, complete, complete.config, complete.deliveries,
    complete.deliveries[0], complete.effects[0], complete.result,
    complete.result.possibleEffects, complete.history, complete.history[0],
    model.fixture, model,
  ]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { complete.history[0].verdict = 'PASS-EDIT'; }, TypeError);
  assert.throws(() => complete.history.push({}), TypeError);
});

test('all action-order and repeated-action guards leave prior states unchanged', () => {
  const ready = model.createRehearsal();
  const locked = model.deliver(ready, config);
  const expired = model.expireLock(locked);
  const complete = model.redeliver(expired);
  for (const [state, actions] of [
    [ready, [model.expireLock, model.redeliver, model.newAttempt]],
    [locked, [model.redeliver, model.newAttempt, (value) => model.deliver(value, config)]],
    [expired, [model.expireLock, model.newAttempt, (value) => model.deliver(value, config)]],
    [complete, [model.expireLock, model.redeliver, (value) => model.deliver(value, config)]],
  ]) {
    const before = JSON.stringify(state);
    for (const action of actions) {
      assert.throws(() => action(state), /requires phase/);
      assert.equal(JSON.stringify(state), before);
    }
  }
  assert.deepEqual(locked.effects, expired.effects, 'Lock expiry cannot create another business effect');
  assert.equal(locked.deliveries[0].lock, 'held');
  assert.equal(expired.deliveries[0].lock, 'expired');
});

test('configuration is copied and frozen at first delivery', () => {
  const input = { ...config };
  const locked = model.deliver(model.createRehearsal(), input);
  input.handler = 'blind';
  input.firstOutcome = 'unresolved';
  const result = model.redeliver(model.expireLock(locked)).result;
  assert.deepEqual(result.config, config);
  assert.equal(result.verdict, 'PASS');
  assert.notEqual(result.config, input);
});

test('six histories are retained exactly and a seventh attempt requires explicit reset', () => {
  let state = model.createRehearsal();
  const originals = [];
  for (let index = 0; index < 6; index++) {
    state = run({ handler: index % 2 ? 'ledger' : 'blind', firstOutcome: 'committed' }, state);
    originals.push(state.result);
    assert.equal(state.result.attempt, index + 1);
    assert.deepEqual(state.history, originals);
    if (index < 5) state = model.newAttempt(state);
  }
  assert.deepEqual(state.history.map((entry) => entry.verdict), ['FAIL', 'PASS', 'FAIL', 'PASS', 'FAIL', 'PASS']);
  const before = JSON.stringify(state);
  assert.throws(() => model.newAttempt(state), /Six attempts/);
  assert.equal(JSON.stringify(state), before);
  const reset = model.reset(state);
  assert.equal(reset.phase, 'ready');
  assert.deepEqual(reset.history, []);
  assert.equal(state.history.length, 6);
});

test('reset clears each phase without mutating prior ledgers or retained histories', () => {
  const ready = model.newAttempt(run({ handler: 'blind', firstOutcome: 'committed' }));
  const locked = model.deliver(ready, config);
  const expired = model.expireLock(locked);
  const complete = model.redeliver(expired);
  for (const state of [ready, locked, expired, complete]) {
    const before = JSON.stringify(state);
    assert.deepEqual(model.reset(state), model.createRehearsal());
    assert.equal(JSON.stringify(state), before);
  }
});

test('predictions are strict, phase-guarded and independent of the business verdict', () => {
  const state = run({ handler: 'blind', firstOutcome: 'committed' });
  const before = JSON.stringify(state);
  assert.equal(model.checkPrediction(state, 'PASS').correct, false);
  assert.equal(model.checkPrediction(state, 'FAIL').correct, true);
  assert.equal(model.checkPrediction(state, 'UNKNOWN').correct, false);
  for (const choice of ['', 'fail', null, [], {}, 0, ' FAIL ', new String('FAIL')]) {
    assert.throws(() => model.checkPrediction(state, choice), /Choose PASS, FAIL or UNKNOWN/);
  }
  assert.throws(() => model.checkPrediction(model.createRehearsal(), 'PASS'), /complete/);
  assert.equal(JSON.stringify(state), before);
});
