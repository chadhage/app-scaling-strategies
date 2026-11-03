(function (root, factory) {
  'use strict';
  const model = factory(typeof module === 'object' && module.exports
    ? require('./fixtures.js') : root.S061Fixtures);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.S061Model = model;
}(typeof globalThis === 'object' ? globalThis : this, function (F) {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const initial = (history = []) => ({
    phase: 'idle', config: null,
    primary: { version: F.previousVersion, writers: 1, acknowledgedWrites: 0 },
    sessionRequiredVersion: null, readers: [{ id: 'reader-1', version: F.previousVersion }],
    reads: [], result: null, prediction: null, history, trace: [],
  });
  function invalid(message, field) {
    const error = new Error(message);
    if (field) error.field = field;
    throw error;
  }
  function noArguments(args) {
    if (args.length) invalid('This action takes no arguments.');
  }
  function configuration(input) {
    if (!input || typeof input !== 'object'
        || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
      invalid('Configuration must be an exact own-data-property object.');
    }
    const keys = Reflect.ownKeys(input);
    const expected = Object.keys(F.defaults);
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
      invalid('Configuration must contain exactly the four declared fields.');
    }
    const labels = { addedReader: 'Added reader', routing: 'Routing', freshness: 'Freshness', coverage: 'Coverage' };
    const copy = {};
    for (const key of expected) {
      const property = Object.getOwnPropertyDescriptor(input, key);
      if (!property || !property.enumerable || !Object.hasOwn(property, 'value')
          || typeof property.value !== 'string' || !F.choices[key].includes(property.value)) {
        invalid(`${labels[key]}: choose an exact declared value.`, key);
      }
      copy[key] = property.value;
    }
    return copy;
  }
  function createRehearsal() {
    let state = initial();
    const snapshot = () => freeze(clone(state));
    const requires = (phase) => {
      if (state.phase !== phase) invalid(`Action requires ${phase}; current phase is ${state.phase}.`);
    };
    function write(input) {
      requires('idle');
      if (state.history.length >= F.maxAttempts) invalid('History full: reset explicitly before another attempt.');
      if (arguments.length !== 1) invalid('Configuration requires exactly one object.');
      const settings = configuration(input);
      state.config = settings;
      state.primary.version = F.committedVersion;
      state.primary.acknowledgedWrites = 1;
      state.sessionRequiredVersion = F.committedVersion;
      state.readers[0].version = F.committedVersion;
      state.phase = 'written';
      state.trace = [
        `Synthetic primary acknowledged ${F.recordId} version ${F.committedVersion}; session requires at least that version.`,
        'Fixture assumption: reader-1 separately observed version 11. Write acknowledgement alone does not establish replica catch-up.',
        `Writer count remains 1; routing=${settings.routing}, browse freshness=${settings.freshness}, coverage=${settings.coverage}.`,
      ];
      return snapshot();
    }
    function addReader() {
      noArguments(arguments);
      requires('written');
      const version = state.config.addedReader === 'behind' ? F.previousVersion
        : state.config.addedReader === 'current' ? F.committedVersion : null;
      state.readers.push({ id: 'reader-2', version });
      state.phase = 'expanded';
      state.trace.push(`Added reader-2 at synthetic version ${version === null ? 'unknown' : version}; readers 1 -> 2, writers remain 1. No synchronization was performed.`);
      return snapshot();
    }
    function read() {
      noArguments(arguments);
      requires('expanded');
      state.reads = F.plan.map((planned, index) => {
        const candidateVersion = state.readers.find((reader) => reader.id === planned.candidate).version;
        const requiredVersion = planned.kind === 'own-write'
          ? state.sessionRequiredVersion
          : state.config.freshness === 'current-only' ? F.committedVersion : F.previousVersion;
        let selectedTarget = planned.candidate;
        let selectionReason = state.config.routing === 'unchecked' ? 'UNCHECKED_REPLICA' : 'ELIGIBLE_REPLICA';
        if (state.config.routing === 'primary-for-session' && planned.kind === 'own-write') {
          selectedTarget = 'primary';
          selectionReason = 'SESSION_PRIMARY';
        } else if (state.config.routing === 'verified-or-primary'
            && (candidateVersion === null || candidateVersion < requiredVersion)) {
          selectedTarget = 'primary';
          selectionReason = candidateVersion === null ? 'UNKNOWN_WATERMARK_FALLBACK' : 'BEHIND_WATERMARK_FALLBACK';
        }
        const observed = state.config.coverage === 'complete'
          || (state.config.coverage === 'partial' && index < 3);
        const receivedVersion = !observed ? null
          : selectedTarget === 'primary' ? state.primary.version : candidateVersion;
        const status = receivedVersion === null ? 'UNKNOWN' : receivedVersion >= requiredVersion ? 'PASS' : 'FAIL';
        const reason = !observed ? 'NO_OBSERVATION' : receivedVersion === null ? 'VERSION_UNKNOWN'
          : status === 'PASS' ? 'CONTRACT_MET' : 'STALE_READ';
        return {
          ...planned, candidateVersion, requiredVersion, selectedTarget, selectionReason,
          observed, observedTarget: observed ? selectedTarget : null,
          recordId: receivedVersion === null ? null : F.recordId,
          receivedVersion, status, reason,
        };
      });
      const correct = state.reads.filter((entry) => entry.status === 'PASS').length;
      const failed = state.reads.filter((entry) => entry.status === 'FAIL').length;
      const unknown = state.reads.filter((entry) => entry.status === 'UNKNOWN').length;
      const gate = failed > 0 ? 'FAIL' : unknown > 0 ? 'UNKNOWN' : 'PASS';
      state.result = {
        gate, impact: gate === 'FAIL' ? 'INTERRUPTED' : gate === 'UNKNOWN' ? 'UNVERIFIED' : 'CONTRACT_MET',
        attempted: 4, observed: state.reads.filter((entry) => entry.observed).length,
        correct, failed, unknown,
        replicaReads: state.reads.filter((entry) => entry.observedTarget?.startsWith('reader-')).length,
        primaryReads: state.reads.filter((entry) => entry.observedTarget === 'primary').length,
        offloadedEligible: state.reads.filter((entry) =>
          entry.kind === 'browse' && entry.observedTarget?.startsWith('reader-')).length,
      };
      for (const entry of state.reads) {
        state.trace.push(`${entry.id}: selected ${entry.selectedTarget} (${entry.selectionReason}); requires >=${entry.requiredVersion}, received ${entry.receivedVersion === null ? 'unknown' : entry.receivedVersion}; ${entry.status} ${entry.reason}.`);
      }
      state.trace.push(`Synthetic gate ${gate}; ${correct} correct, ${failed} failed, ${unknown} unknown. No write-capacity claim.`);
      state.phase = 'complete';
      state.history.push(clone({
        attempt: state.history.length + 1, config: state.config, primary: state.primary,
        readers: state.readers, reads: state.reads, result: state.result,
        prediction: null, trace: state.trace,
      }));
      return snapshot();
    }
    function predict(selected) {
      requires('complete');
      if (state.prediction) invalid('Prediction already checked for this attempt.');
      if (arguments.length !== 1 || typeof selected !== 'string' || !['PASS', 'FAIL', 'UNKNOWN'].includes(selected)) {
        invalid('Prediction: choose PASS, FAIL or UNKNOWN.', 'prediction');
      }
      state.prediction = { selected, actual: state.result.gate, verifier: selected === state.result.gate ? 'PASS' : 'FAIL' };
      state.trace.push(`Learning prediction ${selected}: verifier ${state.prediction.verifier}; measured synthetic impact remains ${state.result.impact}.`);
      const retained = state.history[state.history.length - 1];
      retained.prediction = clone(state.prediction);
      retained.trace = clone(state.trace);
      return snapshot();
    }
    function newAttempt() {
      noArguments(arguments);
      requires('complete');
      if (state.history.length >= F.maxAttempts) invalid('History full: six attempts retained; reset explicitly to clear them.');
      state = initial(state.history);
      return snapshot();
    }
    function reset() {
      noArguments(arguments);
      state = initial();
      return snapshot();
    }
    return Object.freeze({
      snapshot, write, addReader, read, predict, newAttempt, reset,
    });
  }
  return Object.freeze({ createRehearsal, fixtures: F });
}));
