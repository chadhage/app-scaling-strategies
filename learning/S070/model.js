'use strict';

(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./fixtures.js') : root.S070Fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S070Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  function configuration(input) {
    const invalid = () => { throw new Error('Invalid configuration: use only the three fixed synthetic choices.'); };
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) invalid();
    const keys = Reflect.ownKeys(input);
    const choices = { boundary: fixtures.boundaries, restoration: fixtures.restorations, ownership: fixtures.ownership };
    if (keys.length !== 3 || keys.some((key) => typeof key !== 'string' || !Object.hasOwn(choices, key))) invalid();
    const result = {};
    for (const [key, values] of Object.entries(choices)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string'
          || !Object.hasOwn(values, descriptor.value)) invalid();
      result[key] = descriptor.value;
    }
    return result;
  }
  function synchronize(current) {
    const receipts = current.receipts;
    const missing = receipts === null ? null : fixtures.committed
      .filter((expected) => !receipts.some((actual) => actual.sequence === expected.sequence
        && actual.key === expected.key && actual.value === expected.value))
      .map((entry) => entry.sequence);
    let contiguousThrough = receipts === null ? null : 0;
    if (missing !== null) {
      for (let sequence = 1; sequence <= fixtures.requiredBoundary && !missing.includes(sequence); sequence++) {
        contiguousThrough = sequence;
      }
    }
    const boundaryValid = current.declaredBoundary === fixtures.requiredBoundary;
    const status = !boundaryValid || (missing !== null && missing.length) ? 'FAIL'
      : receipts === null ? 'UNKNOWN' : 'PASS';
    const reason = current.declaredBoundary === null ? 'No declared committed boundary; promotion rejected.'
      : !boundaryValid ? `Declared boundary ${current.declaredBoundary} does not match authoritative boundary 6.`
        : receipts === null ? 'Restoration receipts unavailable; synchronization is unverified.'
          : missing.length ? `Missing committed receipts: ${missing.join(', ')}.`
            : 'Every exact committed effect through declared boundary 6 is present.';
    return {
      status, reason, requiredBoundary: fixtures.requiredBoundary, declaredBoundary: current.declaredBoundary,
      observedEffects: missing === null ? null : fixtures.committed.length - missing.length,
      missing, contiguousThrough, maxReceipt: receipts === null ? null : Math.max(0, ...receipts.map((entry) => entry.sequence)),
    };
  }
  function ownership(config) {
    const grant = fixtures.ownership[config.ownership];
    if (grant === null) {
      return {
        status: 'UNKNOWN', reason: 'Writer grant and fence evidence unavailable.',
        candidate: null, grantEpoch: null, previousFenced: null, candidateEligible: null, potentialWriters: null,
      };
    }
    const candidateEligible = grant.candidate === fixtures.candidate && grant.grantEpoch === fixtures.requiredEpoch;
    const status = candidateEligible && grant.previousFenced ? 'PASS' : 'FAIL';
    const reason = !grant.previousFenced ? 'Previous epoch-7 writer is not fenced; overlapping writers are possible.'
      : grant.grantEpoch !== fixtures.requiredEpoch ? `Stale writer grant epoch ${grant.grantEpoch}; required epoch is 8.`
        : grant.candidate !== fixtures.candidate ? `Grant names ${grant.candidate}, not restored-s070.`
          : 'Grant names restored-s070 at epoch 8; the previous epoch-7 writer is fenced.';
    return {
      status, reason, ...clone(grant), candidateEligible,
      potentialWriters: (candidateEligible ? 1 : 0) + (grant.previousFenced ? 0 : 1),
    };
  }
  function createLesson() {
    let phase = 'idle';
    let current = null;
    let history = [];
    function expect(expected) {
      if (phase !== expected) throw new Error(`Invalid phase: ${phase}; expected ${expected}.`);
    }
    function snapshot() {
      const counts = { success: 0, failure: 0, unknown: 0 };
      const decisions = phase === 'decided' ? [...history, current] : history;
      for (const attempt of decisions) {
        counts[attempt.outcome === 'PASS' ? 'success' : attempt.outcome === 'FAIL' ? 'failure' : 'unknown']++;
      }
      return freeze(clone({ phase, current, history, maxAttempts: fixtures.maxAttempts, counts }));
    }
    function begin(input) {
      expect('idle');
      if (history.length >= fixtures.maxAttempts) throw new Error('History limit: reset explicitly before a seventh attempt.');
      const config = configuration(input);
      current = {
        id: history.length + 1, config,
        declaredBoundary: fixtures.boundaries[config.boundary],
        receipts: clone(fixtures.restorations[config.restoration]),
        verification: null, outcome: null, promoted: false, activatedWriter: null,
        writerCount: null, preservedEffects: null, promotedEffects: [],
        prediction: null, learning: null,
        trace: [`Stage restored-s070: boundary ${fixtures.boundaries[config.boundary] ?? 'undeclared'}, restoration ${config.restoration}, ownership ${config.ownership}.`],
      };
      phase = 'staged';
      return snapshot();
    }
    function verify() {
      expect('staged');
      current.verification = { synchronization: synchronize(current), ownership: ownership(current.config) };
      const { synchronization: sync, ownership: owner } = current.verification;
      current.preservedEffects = sync.observedEffects;
      current.trace.push(`Verify data ${sync.status}: ${sync.reason} Ownership ${owner.status}: ${owner.reason}`);
      phase = 'verified';
      return snapshot();
    }
    function promote() {
      expect('verified');
      const checks = [current.verification.synchronization.status, current.verification.ownership.status];
      current.outcome = checks.includes('FAIL') ? 'FAIL' : checks.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
      current.promoted = current.outcome === 'PASS';
      current.activatedWriter = current.promoted ? fixtures.candidate : null;
      const owner = current.verification.ownership;
      current.writerCount = current.promoted ? 1 : owner.previousFenced === null ? null : owner.previousFenced ? 0 : 1;
      current.promotedEffects = current.promoted ? clone(current.receipts) : [];
      current.trace.push(current.promoted
        ? 'PASS: activate the restored synthetic writer at epoch 8 with all six effects.'
        : `${current.outcome}: ${current.outcome === 'FAIL' ? 'reject' : 'hold'} promotion; no restored writer activated. Original reference data is not completed promotion.`);
      phase = 'decided';
      return snapshot();
    }
    function predict(prediction) {
      expect('decided');
      if (!['PASS', 'FAIL', 'UNKNOWN'].includes(prediction)) throw new Error('Invalid prediction: choose PASS, FAIL or UNKNOWN.');
      current.prediction = prediction;
      current.learning = prediction === current.outcome ? 'PASS' : 'FAIL';
      current.trace.push(`Learning check ${current.learning}: predicted ${prediction}; promotion remains ${current.outcome}.`);
      history.push(clone(current));
      phase = 'checked';
      return snapshot();
    }
    function next() {
      expect('checked');
      current = null;
      phase = 'idle';
      return snapshot();
    }
    function reset() {
      current = null;
      history = [];
      phase = 'idle';
      return snapshot();
    }
    return Object.freeze({ snapshot, begin, verify, promote, predict, next, reset });
  }
  return Object.freeze({ createLesson });
}));
