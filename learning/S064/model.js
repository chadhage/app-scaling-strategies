(function expose(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShardLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function model() {
  'use strict';
  const MAX_ATTEMPTS = 8;
  const DEFAULTS = Object.freeze({
    initialCommitted: 3,
    writesDuringCopy: 2,
    assignment: 'after-sync',
    synchronization: 'complete',
    ownership: 'exclusive',
  });
  const choices = Object.freeze({
    assignment: Object.freeze(['before-sync', 'after-sync']),
    synchronization: Object.freeze(['complete', 'snapshot-only', 'unobserved']),
    ownership: Object.freeze(['exclusive', 'ambiguous', 'unobserved']),
  });
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(`${label} must be a plain record`);
    }
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
      throw new TypeError(`${label} fields must exactly match ${keys.join(', ')}`);
    }
    for (const key of actual) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`${label}.${key} must be an enumerable data field, not an accessor`);
      }
    }
  }
  function array(value) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) return false;
    const expected = [...Array(value.length).keys()].map(String).concat('length');
    const keys = Reflect.ownKeys(value);
    return keys.length === expected.length && keys.every((key) => expected.includes(key)
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }
  function same(value, expected) {
    if (!expected || typeof expected !== 'object') return value === expected;
    if (Array.isArray(expected)) {
      return array(value) && value.length === expected.length && expected.every((item, index) => same(value[index], item));
    }
    try { record(value, Object.keys(expected), 'state.history'); } catch { return false; }
    return Object.keys(expected).every((key) => same(value[key], expected[key]));
  }
  function createState() {
    return freeze({ schemaVersion: 1, history: [] });
  }
  function normalizeConfig(config) {
    record(config, Object.keys(DEFAULTS), 'config');
    for (const [key, maximum] of [['initialCommitted', 6], ['writesDuringCopy', 3]]) {
      if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > maximum) {
        throw new TypeError(`${key} must be an integer from 1 to ${maximum}`);
      }
    }
    for (const [key, values] of Object.entries(choices)) {
      if (!values.includes(config[key])) throw new TypeError(`${key} must be one of ${values.join(', ')}`);
    }
    return freeze(Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, config[key]])));
  }
  function evaluate(input, attempt = 1) {
    const config = normalizeConfig(input);
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_ATTEMPTS) throw new RangeError('attempt must be an integer from 1 to 8');
    const copiedIds = Array.from({ length: config.initialCommitted }, (_, index) => `effect-${index + 1}`);
    const requiredIds = Array.from({ length: config.initialCommitted + config.writesDuringCopy }, (_, index) => `effect-${index + 1}`);
    const laterIds = requiredIds.slice(copiedIds.length);
    const before = config.assignment === 'before-sync';
    const synchronizedIds = before || config.synchronization === 'snapshot-only'
      ? [...copiedIds]
      : config.synchronization === 'complete' ? [...requiredIds] : null;
    const missingIds = synchronizedIds === null ? null : requiredIds.filter((id) => !synchronizedIds.includes(id));
    const candidateWriters = config.ownership === 'exclusive' ? ['shard-b']
      : config.ownership === 'ambiguous' ? ['shard-a', 'shard-b'] : null;
    const gates = [
      {
        id: 'synchronization-order', status: before ? 'fail' : 'pass',
        observation: before ? 'Assignment attempted before synchronization; no later step can retroactively pass this gate.' : 'Synchronization observation precedes the assignment gate.',
      },
      {
        id: 'committed-data', status: missingIds === null ? 'unknown' : missingIds.length ? 'fail' : 'pass',
        observation: missingIds === null ? 'Required committed boundary was not observed on shard-b.'
          : missingIds.length ? `Missing committed effects on candidate: ${missingIds.join(', ')}.`
            : `All ${requiredIds.length} required committed effects observed on shard-b before handoff.`,
      },
      {
        id: 'writer-ownership', status: candidateWriters === null ? 'unknown' : candidateWriters.length === 1 ? 'pass' : 'fail',
        observation: candidateWriters === null ? 'Exclusive ownership/fence observation is missing.'
          : candidateWriters.length > 1 ? 'Two proposed writer owners are ambiguous; this proposal must not activate.'
            : 'Synthetic fixture supplies an exclusive transfer: if assignment is authorized, fence source epoch 1 before shard-b epoch 2 writes.',
      },
    ];
    const verdict = gates.some((gate) => gate.status === 'fail') ? 'failure'
      : gates.some((gate) => gate.status === 'unknown') ? 'unknown' : 'success';
    const assignmentAllowed = verdict === 'success';
    const route = assignmentAllowed ? 'shard-b' : 'shard-a';
    const writerEpoch = assignmentAllowed ? 2 : 1;
    const operationId = `handoff-effect-${attempt}`;
    const destinationIds = synchronizedIds === null ? null : [...synchronizedIds];
    const writeProbes = [];
    if (assignmentAllowed) {
      for (const [shard, epoch] of [['shard-b', 2], ['shard-a', 1]]) {
        const accepted = shard === route && epoch === writerEpoch;
        if (accepted) destinationIds.push(operationId);
        writeProbes.push({ shard, epoch, operationId, outcome: accepted ? 'accepted' : 'rejected' });
      }
    }
    const newWriteEffects = destinationIds === null ? 0 : destinationIds.filter((id) => id === operationId).length;
    const trace = [
      { stage: 'source', detail: `training-tenant-1 routes to shard-a, writer epoch 1; committed ${copiedIds.join(', ')}.` },
      { stage: 'copy', detail: `New shard-b receives snapshot ${copiedIds.join(', ')}; routing stays on shard-a.` },
      { stage: 'source-commit', detail: `Source commits ${laterIds.join(', ')} while copying. Required handoff boundary is effect-${requiredIds.length}.` },
    ];
    const sync = {
      stage: 'synchronize',
      detail: before ? 'Not performed before assignment; blocked assignment is not repaired retroactively. Rerun with synchronization first.'
        : synchronizedIds === null ? 'Synchronization outcome unobserved; committed-data coverage is unknown.'
          : `Observed candidate effects: ${synchronizedIds.join(', ')}; missing ${missingIds.length} of ${requiredIds.length} required.`,
    };
    if (!before) trace.push(sync);
    trace.push({
      stage: 'assign',
      detail: assignmentAllowed ? 'Copy, committed boundary and exclusive modeled ownership pass; atomically fence epoch 1, activate epoch 2 and route to shard-b.'
        : `${verdict.toUpperCase()}: assignment blocked; route and sole active writer stay on shard-a epoch 1.`,
    });
    if (before) trace.push(sync);
    trace.push({
      stage: 'new-write',
      detail: assignmentAllowed ? `${operationId} accepted once on shard-b epoch 2.`
        : 'Not run on shard-b: assignment was not authorized; zero new destination effects.',
    }, {
      stage: 'stale-writer-probe',
      detail: assignmentAllowed ? `Synthetic retry of ${operationId} on stale shard-a epoch 1 rejected; zero accepted stale writes and zero duplicate effects.`
        : 'Not run: do not infer zero duplicates or a proven fence from an unexecuted probe.',
    });
    return freeze({
      attempt, config, verdict, assignmentAllowed, route, writerEpoch,
      activeWriters: [route],
      copiedIds, requiredIds, synchronizedIds, missingIds, candidateWriters, gates, trace,
      destinationIds, writeProbes,
      metrics: {
        requiredCommitted: requiredIds.length, copiedCommitted: copiedIds.length,
        missingCommitted: missingIds === null ? null : missingIds.length,
        candidateWriters: candidateWriters === null ? null : candidateWriters.length,
        newWriteEffects,
        staleWriterAccepted: assignmentAllowed ? writeProbes.filter((probe) => probe.shard === 'shard-a' && probe.outcome === 'accepted').length : null,
        duplicateEffects: assignmentAllowed ? Math.max(0, newWriteEffects - 1) : null,
      },
      userImpact: assignmentAllowed ? 'Synthetic handoff allowed; required committed effects retained and one destination write applied.'
        : 'Synthetic assignment blocked; source route retained, no destination write attempted. No live-user observation.',
      cleanup: 'Memory-only comparison. Reset or reload clears the rehearsal; no database, shard or cloud resource was created.',
    });
  }
  function run(state, config) {
    record(state, ['schemaVersion', 'history'], 'state');
    if (state.schemaVersion !== 1 || !array(state.history) || state.history.length > MAX_ATTEMPTS) {
      throw new TypeError('state history must be a dense array of at most 8 valid attempts with schemaVersion 1');
    }
    const history = state.history.map((entry, index) => {
      try {
        if (!entry || typeof entry !== 'object') throw new TypeError('invalid entry');
        const descriptor = Object.getOwnPropertyDescriptor(entry, 'config');
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('invalid config data field');
        const expected = evaluate(descriptor.value, index + 1);
        if (!same(entry, expected)) throw new TypeError('forged result or trace');
        return expected;
      } catch (error) {
        throw new TypeError(`state.history[${index}] is invalid: ${error.message}`);
      }
    });
    if (history.length === MAX_ATTEMPTS) throw new RangeError('8-attempt limit reached; reset before another comparison. Retained history is unchanged.');
    return freeze({ schemaVersion: 1, history: [...history, evaluate(config, history.length + 1)] });
  }
  return Object.freeze({ MAX_ATTEMPTS, DEFAULTS, createState, normalizeConfig, evaluate, run });
}));
