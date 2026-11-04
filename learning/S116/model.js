(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S116 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  const contract = freeze({
    regions: ['region-one', 'region-two'],
    writer: 'region-one',
    epoch: 7,
    currentRevision: 10,
    committedRevision: 11,
    maxObservations: 12,
    writerModel: 'Single writer; serving region-two forwards supported writes to region-one',
    conflictModel: 'Epoch fencing followed by optimistic expected-revision checking; reject without overwrite',
    consistencyModel: 'Asynchronous replication; session read must meet its committed minimum revision',
  });
  const scenarioIds = freeze([
    'supported', 'stale-reader', 'writer-unobserved', 'stale-epoch', 'version-conflict', 'local-writer',
  ]);
  const actionIds = freeze(['inspect-serving', 'verify-contract']);
  const scenarioLabels = freeze({
    supported: 'Supported single writer, caught-up readers',
    'stale-reader': 'Serving succeeds, region-two reader is stale',
    'writer-unobserved': 'Serving succeeds, writer observation is missing',
    'stale-epoch': 'Stale writer epoch is fenced',
    'version-conflict': 'Optimistic revision conflict is rejected',
    'local-writer': 'Unsupported direct region-two writer',
  });
  const actionLabels = freeze({
    'inspect-serving': 'Inspect serving only',
    'verify-contract': 'Verify writer and consistency contract',
  });

  function plainShape(value, keys) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const actual = Reflect.ownKeys(value);
    return actual.length === keys.length && keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    });
  }

  function denseArray(value) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
    }
    return true;
  }

  function sameData(actual, expected) {
    if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
    if (Array.isArray(expected)) {
      return denseArray(actual) && actual.length === expected.length
        && expected.every((item, index) => sameData(actual[index], item));
    }
    const keys = Object.keys(expected);
    return plainShape(actual, keys) && keys.every((key) => sameData(actual[key], expected[key]));
  }

  function validateInput(input) {
    if (!plainShape(input, ['scenarioId', 'actionId'])
        || typeof input.scenarioId !== 'string' || !scenarioIds.includes(input.scenarioId)
        || typeof input.actionId !== 'string' || !actionIds.includes(input.actionId)) {
      throw new TypeError('Invalid input: choose exactly one listed teaching trace and operator action.');
    }
  }

  function evaluate(input) {
    validateInput(input);
    const { scenarioId, actionId } = input;
    const serving = [
      { region: 'region-one', journey: 'fictional-user-one', status: 'served', durationMs: 18 },
      { region: 'region-two', journey: 'fictional-user-two', status: 'served', durationMs: 24 },
    ];
    let routes = null;
    let write = null;
    let reads = null;
    let observedWriter = null;
    const checks = [{
      id: 'both-serving', status: 'positive',
      detail: '2/2 fictional user journeys served: region-one 18 synthetic ms; region-two 24 synthetic ms.',
    }];

    if (actionId === 'verify-contract') {
      const missing = scenarioId === 'writer-unobserved';
      const unsupported = scenarioId === 'local-writer';
      observedWriter = missing ? null : unsupported ? 'region-two' : 'region-one';
      routes = contract.regions.map((region) => ({
        servingRegion: region,
        targetWriter: missing ? null : unsupported && region === 'region-two' ? 'region-two' : 'region-one',
        route: missing ? 'unobserved' : unsupported && region === 'region-two'
          ? 'unsupported-local' : region === 'region-one' ? 'local' : 'forwarded',
      }));
      const status = missing ? 'unobserved' : unsupported ? 'rejected-unsupported-writer'
        : scenarioId === 'stale-epoch' ? 'rejected-stale-epoch'
          : scenarioId === 'version-conflict' ? 'rejected-revision-conflict' : 'committed';
      write = {
        targetWriter: observedWriter,
        expectedEpoch: 7,
        observedEpoch: missing ? null : scenarioId === 'stale-epoch' ? 6 : 7,
        expectedRevision: scenarioId === 'version-conflict' ? 9 : 10,
        currentRevision: missing ? null : 10,
        status,
        effects: missing ? null : status === 'committed' ? 1 : 0,
        committedRevision: status === 'committed' ? 11 : null,
        durationMs: missing ? null : unsupported ? 4 : scenarioId === 'stale-epoch'
          ? 5 : scenarioId === 'version-conflict' ? 7 : 9,
      };
      reads = contract.regions.map((region, index) => ({
        region,
        revision: missing ? null : status !== 'committed' ? 10
          : scenarioId === 'stale-reader' && index === 1 ? 10 : 11,
        requiredRevision: status === 'committed' ? 11 : null,
        replicationLagMs: missing ? null : scenarioId === 'stale-reader' && index === 1 ? 40 : 0,
        durationMs: missing ? null : index === 0 ? 6 : 8,
      }));
    }

    if (!write) {
      for (const id of ['writer-topology', 'epoch-fencing', 'conflict-handling', 'mutation-outcome', 'read-your-writes']) {
        checks.push({ id, status: 'unknown', detail: 'Serving-only action does not observe writes or post-commit consistency.' });
      }
    } else {
      const missing = write.status === 'unobserved';
      const unsupported = write.status === 'rejected-unsupported-writer';
      const staleEpoch = write.status === 'rejected-stale-epoch';
      const conflict = write.status === 'rejected-revision-conflict';
      checks.push({
        id: 'writer-topology',
        status: missing ? 'unknown' : unsupported ? 'negative' : 'positive',
        detail: missing ? 'Actual synthetic writer target and routes are unobserved (null).'
          : unsupported ? 'region-two direct writer attempt is unsupported and rejected; two serving origins do not grant multi-writer capability.'
            : 'Both supported write routes target the one observed writer region-one; region-two forwards, not writes independently.',
      });
      checks.push({
        id: 'epoch-fencing',
        status: missing || unsupported ? 'unknown' : 'positive',
        detail: missing ? 'Observed writer epoch is null, not verified.'
          : unsupported ? 'Unsupported target rejected before fencing; epoch protection is not observed for that target.'
            : staleEpoch ? 'Observed epoch 6 is below required epoch 7; fenced rejection correctly leaves zero effects.'
              : 'Observed epoch 7 equals required epoch 7.',
      });
      checks.push({
        id: 'conflict-handling',
        status: missing || unsupported || staleEpoch ? 'unknown' : 'positive',
        detail: missing ? 'Writer observation missing; optimistic conflict handling is unobserved.'
          : unsupported || staleEpoch ? 'An earlier writer/epoch gate rejected the request; the revision guard was not reached.'
            : conflict ? 'Expected revision 9 differs from current revision 10; conflict rejected without overwrite, zero effects.'
              : 'Expected revision 10 matches current revision 10; optimistic guard permits revision 11.',
      });
      checks.push({
        id: 'mutation-outcome',
        status: missing ? 'unknown' : write.status === 'committed' ? 'positive' : 'negative',
        detail: missing ? 'Mutation status, effects, committed revision and duration are unobserved (null).'
          : write.status === 'committed' ? '1 synthetic committed effect, revision 11, 9 synthetic ms.'
            : `${write.status}: requested user mutation did not commit, 0 effects, ${write.durationMs} synthetic ms. Correct protection is not user success.`,
      });
      const staleRead = reads.some((read) => read.revision !== null
        && read.requiredRevision !== null && read.revision < read.requiredRevision);
      checks.push({
        id: 'read-your-writes',
        status: missing || write.status !== 'committed' ? 'unknown' : staleRead ? 'negative' : 'positive',
        detail: missing ? 'Read and committed-minimum observations are null; missing replication evidence is not zero lag.'
          : write.status !== 'committed' ? 'No mutation committed; no post-commit session minimum established. Read-your-writes is not proven.'
            : staleRead ? 'region-two revision 10 is below client minimum 11; observed replication lag 40 synthetic ms, read 8 synthetic ms.'
              : 'Both readers return revision 11, meeting client minimum 11; observed lag 0 synthetic ms, reads 6/8 synthetic ms.',
      });
    }
    const overall = checks.some((entry) => entry.status === 'negative') ? 'negative'
      : checks.some((entry) => entry.status === 'unknown') ? 'unknown' : 'positive';
    return freeze({
      scenarioId, actionId, overall, servedUsers: 2, serving, routes, observedWriter,
      multiWriterSupported: false, write, reads, checks,
      note: overall === 'positive' ? 'Synthetic contract met: two serving regions, one supported writer, preserved session read minimum.'
        : overall === 'negative' ? 'Both regions serve, but the requested synthetic data journey fails. Inspect protection and user impact separately.'
          : 'Both regions serve, but missing data-contract observations prevent a positive result. No supported writing capability is inferred.',
    });
  }

  function validateState(state) {
    if (!plainShape(state, ['history', 'currentId']) || !denseArray(state.history)
        || state.history.length > contract.maxObservations
        || !(state.currentId === null || (state.history.length > 0 && state.currentId === state.history.length))) {
      throw new TypeError('Invalid state: history shape or current observation ID is inconsistent.');
    }
    for (let index = 0; index < state.history.length; index += 1) {
      const entry = state.history[index];
      if (!plainShape(entry, ['id', 'input', 'result']) || entry.id !== index + 1) {
        throw new TypeError('Invalid state: observation sequence or record shape is inconsistent.');
      }
      let replay;
      try {
        replay = evaluate(entry.input);
      } catch {
        throw new TypeError('Invalid state: historical input cannot be replayed.');
      }
      if (!sameData(entry.result, replay)) {
        throw new TypeError('Invalid state: historical observations differ from the fixed replay.');
      }
    }
  }

  function createState() {
    return freeze({ history: [], currentId: null });
  }

  function record(state, input) {
    validateState(state);
    validateInput(input);
    if (state.history.length === contract.maxObservations) {
      throw new RangeError('The 12-observation allowance is exhausted. Reset retains it; reload begins a new session.');
    }
    const id = state.history.length + 1;
    const history = state.history.map((entry) => ({
      id: entry.id, input: { ...entry.input }, result: evaluate(entry.input),
    }));
    history.push({ id, input: { ...input }, result: evaluate(input) });
    return freeze({ history, currentId: id });
  }

  function reset(state) {
    validateState(state);
    return freeze({
      history: state.history.map((entry) => ({
        id: entry.id, input: { ...entry.input }, result: evaluate(entry.input),
      })),
      currentId: null,
    });
  }

  function summarize(state) {
    validateState(state);
    const counts = { used: state.history.length, remaining: contract.maxObservations - state.history.length, positive: 0, negative: 0, unknown: 0 };
    for (const entry of state.history) counts[entry.result.overall] += 1;
    return freeze(counts);
  }

  return freeze({
    contract, scenarioIds, actionIds, scenarioLabels, actionLabels,
    createState, evaluate, record, reset, summarize,
  });
}));
