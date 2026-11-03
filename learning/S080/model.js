(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fixtures.js'));
  else root.PartitionLesson = factory(root.PartitionFixture);
}(typeof globalThis === 'object' ? globalThis : this, function (fixture) {
  'use strict';
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const error = (code, message, field = null) => Object.assign(new Error(message), { code, field });
  const eventRows = () => fixture.events.map((event) => ({
    ...event, beforeEffectCount: event.offset <= fixture.requiredCheckpoint ? 1 : 0,
    deliveryCount: null, effectCount: null, outcome: 'not verified',
  }));
  function initial(history = []) {
    const totals = { success: 0, failure: 0, unknown: 0 };
    for (const entry of history) totals[{ PASS: 'success', FAIL: 'failure', UNKNOWN: 'unknown' }[entry.result.outcome]] += 1;
    return {
      phase: 'idle', settings: null,
      transfer: {
        newOwnerAcquired: false, newConsumer: null, newEpoch: null,
        requiredCheckpoint: fixture.requiredCheckpoint, checkpoint: null, resumeOffset: null, oldProbe: null,
      },
      batch: {
        deliveries: [], events: eventRows(), deliveryCount: null, repeatedDeliveries: null,
        totalEffects: null, duplicateEffects: null, suppressed: null, missingEvents: [],
      },
      result: {
        outcome: 'not verified', ownership: 'not verified', checkpoint: 'not verified', effects: 'not verified',
        success: 0, failure: 0, unknown: 0, reasons: [], impact: 'Not verified',
      },
      prediction: null, learning: null, trace: [], history, totals, maxAttempts: fixture.maxAttempts,
    };
  }
  function validate(input) {
    const keys = Object.keys(fixture.options);
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length
        || !keys.every((key) => Object.hasOwn(input, key))) {
      throw error('INPUT', 'Choose exactly the four declared synthetic settings.', 'settings');
    }
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(input, key);
      if (!property.enumerable || !Object.hasOwn(property, 'value') || !fixture.options[key].includes(property.value)) {
        throw error('INPUT', `Choose a declared ${key} option.`, key);
      }
    }
  }
  function createLesson() {
    let state = initial();
    const snapshot = () => copy(state);
    function phase(expected) {
      if (state.phase !== expected) throw error('PHASE', `Action requires phase ${expected}; current phase is ${state.phase}.`);
    }
    function capacity() {
      if (state.history.length >= fixture.maxAttempts) throw error('HISTORY_LIMIT', 'Six attempts are retained. Reset all local data to begin again.');
    }
    function reassign(input) {
      phase('idle');
      capacity();
      validate(input);
      const checkpoint = { transfer: 3, missing: null, ahead: 5, unavailable: null }[input.checkpoint];
      const resumeOffset = input.checkpoint === 'missing' ? 0 : checkpoint;
      state.settings = copy(input);
      state.transfer = {
        newOwnerAcquired: true, newConsumer: fixture.newConsumer, newEpoch: fixture.newEpoch,
        requiredCheckpoint: fixture.requiredCheckpoint, checkpoint, resumeOffset,
        oldProbe: { fenced: 'rejected', accepted: 'accepted', unavailable: 'unknown' }[input.oldProbe],
      };
      state.phase = 'reassigned';
      state.trace = [
        `P0 acquisition succeeded: ${fixture.newConsumer}, epoch ${fixture.newEpoch}. Ownership alone does not prove checkpoint transfer.`,
        `Required checkpoint 3; observation ${input.checkpoint}; resume after ${resumeOffset === null ? 'unobserved offset' : `offset ${resumeOffset}`}. Missing-checkpoint replay from 0 is an explicit unsafe fixture fallback.`,
        `Concurrent ${fixture.oldConsumer} epoch ${fixture.oldEpoch} probe of E04: ${state.transfer.oldProbe}.`,
      ];
      return snapshot();
    }
    function consume() {
      phase('reassigned');
      const input = state.settings;
      if (input.checkpoint === 'unavailable' || input.delivery === 'unavailable') {
        state.batch.events = eventRows().map((event) => ({ ...event, outcome: 'unknown' }));
        state.trace.push('Delivery/effect observation unavailable: all six final effect outcomes remain unknown; no smaller denominator is substituted.');
      } else {
        let resumed = fixture.events.filter((event) => event.offset > state.transfer.resumeOffset);
        if (input.delivery === 'drop') resumed = resumed.filter((event) => event.id !== 'E05');
        if (input.delivery === 'repeat') resumed = resumed.flatMap((event) => event.id === 'E04' ? [event, event] : [event]);
        const attempted = [];
        if (input.oldProbe === 'accepted') {
          attempted.push({ event: fixture.events[3], consumer: fixture.oldConsumer, epoch: fixture.oldEpoch });
        }
        attempted.push(...resumed.map((event) => ({ event, consumer: fixture.newConsumer, epoch: fixture.newEpoch })));
        const counts = new Map(fixture.events.map((event) => [event.id, event.offset <= fixture.requiredCheckpoint ? 1 : 0]));
        const deliveries = new Map(fixture.events.map((event) => [event.id, 0]));
        const seen = new Set(fixture.events.filter((event) => event.offset <= fixture.requiredCheckpoint).map((event) => event.id));
        let repeated = 0;
        let suppressed = 0;
        const rows = attempted.map(({ event, consumer, epoch }, index) => {
          const duplicate = seen.has(event.id);
          if (duplicate) repeated += 1;
          seen.add(event.id);
          deliveries.set(event.id, deliveries.get(event.id) + 1);
          const blocked = input.effects === 'idempotent' && counts.get(event.id) > 0;
          if (blocked) suppressed += 1;
          else counts.set(event.id, counts.get(event.id) + 1);
          return {
            sequence: index + 1, event: event.id, effectKey: event.effectKey, consumer, epoch,
            repeatedDelivery: duplicate, effect: blocked ? 'suppressed' : 'applied',
            effectCountAfter: counts.get(event.id),
          };
        });
        const events = eventRows().map((event) => ({
          ...event, deliveryCount: deliveries.get(event.id), effectCount: counts.get(event.id),
          outcome: counts.get(event.id) === 1 ? 'success' : 'failure',
        }));
        state.batch = {
          deliveries: rows, events, deliveryCount: rows.length, repeatedDeliveries: repeated,
          totalEffects: [...counts.values()].reduce((sum, count) => sum + count, 0),
          duplicateEffects: [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
          suppressed, missingEvents: events.filter((event) => event.effectCount === 0).map((event) => event.id),
        };
        state.trace.push(`Observed ${rows.length} deliveries, ${repeated} repeated deliveries, ${suppressed} suppressed effects; ${state.batch.totalEffects} final effects include three pre-handoff effects.`);
      }
      state.phase = 'consumed';
      return snapshot();
    }
    function verify() {
      phase('consumed');
      const input = state.settings;
      const ownership = { fenced: 'PASS', accepted: 'FAIL', unavailable: 'UNKNOWN' }[input.oldProbe];
      const checkpoint = { transfer: 'PASS', missing: 'FAIL', ahead: 'FAIL', unavailable: 'UNKNOWN' }[input.checkpoint];
      const effects = state.batch.totalEffects === null ? 'UNKNOWN'
        : state.batch.events.some((event) => event.effectCount !== 1) ? 'FAIL' : 'PASS';
      const gates = [ownership, checkpoint, effects];
      const outcome = gates.includes('FAIL') ? 'FAIL' : gates.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
      const reasons = [];
      if (ownership !== 'PASS') reasons.push(ownership === 'FAIL' ? 'Old epoch work was accepted concurrently.' : 'Old epoch rejection was not observed.');
      if (checkpoint !== 'PASS') reasons.push(input.checkpoint === 'missing' ? 'Required checkpoint was not transferred, despite successful new ownership.'
        : input.checkpoint === 'ahead' ? 'Checkpoint 5 is ahead of required committed checkpoint 3.' : 'Checkpoint transfer was not observed.');
      if (effects !== 'PASS') reasons.push(effects === 'FAIL' ? 'At least one declared event has a missing or duplicate business effect.' : 'Final effect outcomes are unavailable for six declared events.');
      if (!reasons.length) reasons.push('Checkpoint 3 transferred, the old epoch was rejected, and every event has one final effect.');
      state.result = {
        outcome, ownership, checkpoint, effects,
        success: state.batch.events.filter((event) => event.outcome === 'success').length,
        failure: state.batch.events.filter((event) => event.outcome === 'failure').length,
        unknown: state.batch.events.filter((event) => event.outcome === 'unknown').length,
        reasons, impact: { PASS: 'Synthetic contract met', FAIL: 'Synthetic contract failure', UNKNOWN: 'Unverified synthetic transition' }[outcome],
      };
      state.trace.push(`Verification ${outcome}: ownership ${ownership}, checkpoint ${checkpoint}, effects ${effects}. Known failures dominate unknown evidence.`);
      state.phase = 'verified';
      return snapshot();
    }
    function check(prediction) {
      phase('verified');
      capacity();
      if (!['PASS', 'FAIL', 'UNKNOWN'].includes(prediction)) throw error('INPUT', 'Choose PASS, FAIL, or UNKNOWN before retaining the attempt.', 'prediction');
      state.prediction = prediction;
      state.learning = prediction === state.result.outcome ? 'correct' : 'incorrect';
      state.trace.push(`Prediction ${prediction}: ${state.learning}. Measured result remains ${state.result.outcome}.`);
      state.history.push(copy({
        number: state.history.length + 1, settings: state.settings, transfer: state.transfer,
        batch: state.batch, result: state.result, prediction, learning: state.learning, trace: state.trace,
      }));
      state.totals[{ PASS: 'success', FAIL: 'failure', UNKNOWN: 'unknown' }[state.result.outcome]] += 1;
      state.phase = 'checked';
      return snapshot();
    }
    function next() {
      phase('checked');
      capacity();
      state = initial(state.history);
      return snapshot();
    }
    function reset() {
      state = initial();
      return snapshot();
    }
    return { snapshot, reassign, consume, verify, check, next, reset };
  }
  return { createLesson };
}));
