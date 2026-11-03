(function (root, factory) {
  'use strict';
  const model = factory(typeof module === 'object' && module.exports ? require('./fixtures.js') : root.S075Fixtures);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.S075Model = model;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function invalid(message, field) {
    const error = new Error(`Invalid input: ${message}`);
    error.field = field;
    throw error;
  }
  function validate(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      invalid('an exact plain settings record is required');
    }
    const keys = Object.keys(fixtures.choices);
    const supplied = Reflect.ownKeys(input);
    if (supplied.length !== keys.length || supplied.some((key) => !keys.includes(key))) {
      invalid('only additions, ownership, delivery and dedup are allowed');
    }
    const result = {};
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(input, key);
      if (!property || !Object.hasOwn(property, 'value') || !fixtures.choices[key].includes(property.value)) {
        invalid(`choose an allowed ${key} value`, key);
      }
      result[key] = property.value;
    }
    return result;
  }
  function fresh() {
    return {
      phase: 'idle', config: null, consumers: ['consumer-0'], assignments: [],
      deliveries: null, effects: null, result: null, prediction: null, history: [],
      totals: { success: 0, failure: 0, unknown: 0 }, trace: [],
    };
  }
  function createLesson() {
    let state = fresh();
    const snapshot = () => copy(state);
    function phase(expected) {
      if (state.phase !== expected) throw new Error(`Phase ${state.phase}: expected ${expected}.`);
    }
    function noArguments(args) {
      if (args.length) invalid('this action takes no arguments');
    }
    function expand(input) {
      phase('idle');
      if (state.history.length >= fixtures.maxAttempts) throw new Error('History full: reset all local data before another attempt.');
      const selected = validate(input);
      const count = selected.additions === 'one' ? 2 : 3;
      const consumers = Array.from({ length: count }, (_, index) => `consumer-${index}`);
      const assignments = fixtures.partitions.map((partition, index) => {
        const consumer = consumers[index % count];
        let claims = [{ consumer, epoch: 2, lock: 'held' }];
        if (selected.ownership === 'overlap' && consumer !== 'consumer-0') {
          claims.push({ consumer: 'consumer-0', epoch: 1, lock: 'held' });
        }
        if (selected.ownership === 'stale-lock' && partition === 'P1') {
          claims = [{ consumer, epoch: 1, lock: 'expired' }];
        }
        if (selected.ownership === 'unobserved') claims = null;
        return { partition, expectedEpoch: fixtures.expectedEpoch, claims };
      });
      Object.assign(state, {
        phase: 'expanded', config: selected, consumers, assignments,
        trace: [
          'Initial reference: consumer-0 held P0, P1 and P2 at epoch 1.',
          `Added ${count - 1} synthetic consumer(s); expected epoch is 2 with exactly one held lock per partition.`,
          `Ownership fixture: ${selected.ownership}. Broken fixtures deliberately permit unsafe attempts for detection, not real execution.`,
        ],
      });
      return snapshot();
    }
    function processBatch() {
      noArguments(arguments);
      phase('expanded');
      if (state.config.delivery === 'unobserved') {
        state.trace.push('Delivery/effect observations unavailable: no counts are inferred.');
      } else {
        const deliveries = [];
        for (const event of fixtures.events) {
          if (state.config.delivery === 'missing' && event.id === 'E04') continue;
          const assignment = state.assignments.find((entry) => entry.partition === event.partition);
          const claims = assignment.claims || [{ consumer: null, epoch: null, lock: null }];
          for (const claim of claims) deliveries.push({
            eventId: event.id, partition: event.partition, ...claim, attempt: deliveries.length + 1,
          });
        }
        if (state.config.delivery === 'redelivery') {
          const repeated = deliveries.find((delivery) => delivery.eventId === 'E03');
          deliveries.push({ ...repeated, attempt: deliveries.length + 1 });
        }
        const keys = new Set();
        const effects = [];
        for (const delivery of deliveries) {
          const key = `effect:${delivery.eventId}`;
          if (state.config.dedup === 'ledger' && keys.has(key)) continue;
          keys.add(key);
          effects.push({ eventId: delivery.eventId, key, consumer: delivery.consumer, deliveryAttempt: delivery.attempt });
        }
        state.deliveries = deliveries;
        state.effects = effects;
        state.trace.push(`Observed ${deliveries.length} delivery attempts and ${effects.length} business effects; effect-key ledger ${state.config.dedup}.`);
      }
      state.phase = 'processed';
      return snapshot();
    }
    function verify() {
      noArguments(arguments);
      phase('processed');
      const unknownOwners = state.assignments.some((entry) => entry.claims === null);
      const duplicateOwners = unknownOwners ? null : state.assignments.filter((entry) => entry.claims.length > 1).length;
      const invalidLocks = unknownOwners ? null : state.assignments.reduce((sum, entry) =>
        sum + entry.claims.filter((claim) => claim.epoch !== entry.expectedEpoch || claim.lock !== 'held').length, 0);
      const ownership = duplicateOwners > 0 || invalidLocks > 0 ? 'FAIL' : unknownOwners ? 'UNKNOWN' : 'PASS';
      const observed = state.deliveries !== null;
      const events = fixtures.events.map((event) => {
        if (!observed) return { eventId: event.id, partition: event.partition, deliveries: null, effects: null,
          verdict: 'UNKNOWN', reason: 'Delivery/effect observations unavailable.' };
        const deliveryCount = state.deliveries.filter((entry) => entry.eventId === event.id).length;
        const effectCount = state.effects.filter((entry) => entry.eventId === event.id).length;
        const assignment = state.assignments.find((entry) => entry.partition === event.partition);
        const badOwner = assignment.claims !== null && (assignment.claims.length !== 1
          || assignment.claims.some((claim) => claim.epoch !== assignment.expectedEpoch || claim.lock !== 'held'));
        const badEffect = deliveryCount === 0 || effectCount !== 1;
        const verdict = badOwner || badEffect ? 'FAIL' : assignment.claims === null ? 'UNKNOWN' : 'PASS';
        return {
          eventId: event.id, partition: event.partition, deliveries: deliveryCount, effects: effectCount, verdict,
          reason: badEffect ? 'Missing event or incorrect business-effect count.'
            : badOwner ? 'Duplicate owners or invalid lock.'
              : assignment.claims === null ? 'Ownership/new-consumer progress unobserved.' : 'One valid owner and one effect.',
        };
      });
      const progress = state.consumers.slice(1).map((consumer) => ({
        consumer, events: !observed || unknownOwners ? null : new Set(state.deliveries.filter((entry) =>
          entry.consumer === consumer && entry.epoch === fixtures.expectedEpoch && entry.lock === 'held')
          .map((entry) => entry.eventId)).size,
      }));
      const metrics = {
        attemptedEvents: fixtures.events.length,
        deliveryCount: observed ? state.deliveries.length : null,
        deliveryDuplicates: observed ? events.reduce((sum, event) => sum + Math.max(0, event.deliveries - 1), 0) : null,
        effectCount: observed ? state.effects.length : null,
        duplicateOwnerPartitions: duplicateOwners, invalidLockClaims: invalidLocks,
        missingEvents: observed ? events.filter((event) => event.deliveries === 0).length : null,
        duplicateEffects: observed ? events.reduce((sum, event) => sum + Math.max(0, event.effects - 1), 0) : null,
        suppressedDeliveries: observed ? state.deliveries.length - state.effects.length : null,
        newConsumerEvents: !observed || unknownOwners ? null : progress.reduce((sum, entry) => sum + entry.events, 0),
        success: events.filter((event) => event.verdict === 'PASS').length,
        failure: events.filter((event) => event.verdict === 'FAIL').length,
        unknown: events.filter((event) => event.verdict === 'UNKNOWN').length,
      };
      const verdict = ownership === 'FAIL' || metrics.failure > 0 || progress.some((entry) => entry.events === 0)
        ? 'FAIL' : ownership === 'UNKNOWN' || metrics.unknown > 0 ? 'UNKNOWN' : 'PASS';
      state.result = {
        verdict, ownership, metrics, events, progress,
        impact: verdict === 'PASS' ? 'Synthetic batch passed: all six events have one effect, valid ownership and new-consumer progress.'
          : verdict === 'FAIL' ? 'Synthetic batch failed: known correctness faults remain counted; no uninterrupted transition is claimed.'
            : 'Synthetic batch unverified: unavailable observations are not successful events.',
      };
      state.totals[{ PASS: 'success', FAIL: 'failure', UNKNOWN: 'unknown' }[verdict]]++;
      state.trace.push(`Verification ${verdict}; ownership ${ownership}; event success ${metrics.success}, failure ${metrics.failure}, unknown ${metrics.unknown}.`);
      state.phase = 'verified';
      return snapshot();
    }
    function checkPrediction(expected) {
      phase('verified');
      if (!['PASS', 'FAIL', 'UNKNOWN'].includes(expected)) throw new Error('Invalid prediction: choose PASS, FAIL or UNKNOWN.');
      state.prediction = { expected, observed: state.result.verdict, correct: expected === state.result.verdict };
      state.trace.push(`Learning prediction ${state.prediction.correct ? 'correct' : 'incorrect'}; measured result unchanged.`);
      state.phase = 'checked';
      state.history.push(copy({
        attempt: state.history.length + 1, config: state.config, consumers: state.consumers,
        assignments: state.assignments, deliveries: state.deliveries, effects: state.effects,
        result: state.result, prediction: state.prediction, trace: state.trace,
      }));
      return snapshot();
    }
    function newAttempt() {
      noArguments(arguments);
      phase('checked');
      if (state.history.length >= fixtures.maxAttempts) throw new Error('History full: reset all local data before another attempt.');
      const { history, totals } = state;
      state = { ...fresh(), history, totals };
      return snapshot();
    }
    function reset() {
      noArguments(arguments);
      state = fresh();
      return snapshot();
    }
    return { snapshot, expand, processBatch, verify, checkPrediction, newAttempt, reset };
  }
  return { createLesson };
}));
