(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S120 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const VERSION = 'S120-fixed-v1';
  const LIMITS = Object.freeze({ actions: 12, archives: 5, demandUnits: 2, budgetMs: 100 });
  const issued = new WeakSet();
  const schemas = Object.freeze({
    observe: ['type'], remove: ['type', 'destination', 'confirmed'],
    recover: ['type', 'destination', 'reconciled'], verify: ['type', 'claim'],
    retry: ['type'], reset: ['type']
  });

  class LessonError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'LessonError';
      this.code = code;
    }
  }
  function fail(code, message) { throw new LessonError(code, message); }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function issue(state) {
    freeze(state);
    issued.add(state);
    return state;
  }
  function requireState(state) {
    if (!state || typeof state !== 'object' || !issued.has(state)) {
      fail('ERR_STATE', 'Use only an immutable state issued by this lesson; imported or forged state is unsupported.');
    }
  }
  function fresh(runNumber, history) {
    return {
      fixtureId: VERSION, runNumber, step: 0, history,
      destinations: [
        { id: 'origin-a', region: 'fictional-region-a', capacityUnits: 2, stateRevision: 7, writerEpoch: 3, available: true },
        { id: 'origin-b', region: 'fictional-region-b', capacityUnits: 2, stateRevision: 7, writerEpoch: 3, available: true }
      ],
      attempts: [], effects: [], events: [], observedTopologies: [], lossObserved: false,
      recoveredIds: [], pendingEffect: 'not-observed', claim: null
    };
  }
  function create() {
    if (arguments.length !== 0) fail('ERR_STATE', 'The fixed fixture accepts no input or imported state.');
    return issue(fresh(1, []));
  }
  function readCommand(command) {
    if (!command || typeof command !== 'object' || Object.getPrototypeOf(command) !== Object.prototype) {
      fail('ERR_COMMAND', 'Use an exact plain-object lesson command.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(command);
    const type = descriptors.type && descriptors.type.value;
    const keys = Reflect.ownKeys(command);
    if (typeof type !== 'string' || !Object.hasOwn(schemas, type)
        || keys.length !== schemas[type].length
        || keys.some((key) => typeof key !== 'string' || !schemas[type].includes(key)
          || !Object.hasOwn(descriptors[key], 'value'))) {
      fail('ERR_COMMAND', 'Unknown command, missing field, accessor or extra field; no action was applied.');
    }
    return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  }
  function viable(state) {
    return state.destinations.filter((item) => item.available
      && item.capacityUnits >= LIMITS.demandUnits && item.stateRevision === 7 && item.writerEpoch === 3);
  }
  function owned(destination) {
    if (typeof destination !== 'string' || !['origin-a', 'origin-b'].includes(destination)) {
      fail('ERR_DESTINATION', 'Choose exactly an owned fictional destination: origin-a or origin-b.');
    }
  }
  function confirm(value) {
    if (value !== true) fail('ERR_CONFIRMATION', 'Confirmation must be boolean true; the unchecked action was not applied.');
  }
  function receipt(state, batch, kind, cohort, destination, outcome, httpStatus, latencyMs, effect, stateRevision) {
    return {
      id: `run-${state.runNumber}-batch-${batch}-${kind}`, kind, cohort, destination, outcome,
      httpStatus, latencyMs, budgetMs: LIMITS.budgetMs, stateRevision, effect
    };
  }
  function act(state, input) {
    requireState(state);
    const command = readCommand(input);
    if (command.type === 'reset') {
      if (state.history.length >= LIMITS.archives) {
        fail('ERR_HISTORY', 'Retained history is full (5 archives). No record was deleted; reload deliberately starts a new page session.');
      }
      const archive = {
        fixtureId: VERSION, runNumber: state.runNumber, destinations: state.destinations,
        attempts: state.attempts, effects: state.effects, events: state.events,
        pendingEffect: state.pendingEffect, result: summarize(state)
      };
      return issue(fresh(state.runNumber + 1, [...state.history, archive]));
    }
    if (state.step >= LIMITS.actions) fail('ERR_LIMIT', 'This run reached its 12-action bound. Reset to archive it without erasing its results.');
    if (command.type === 'remove' || command.type === 'recover') {
      owned(command.destination);
      confirm(command.type === 'remove' ? command.confirmed : command.reconciled);
    }
    if (command.type === 'verify' && !['expected-interruption', 'zero-downtime', 'unverified'].includes(command.claim)) {
      fail('ERR_CLAIM', 'Choose one exact claim: expected-interruption, zero-downtime or unverified.');
    }
    if (command.type === 'retry') {
      fail('ERR_RETRY', 'Unknown acknowledgment is not permission to issue a new mutation. Reconcile authoritative fixture state; do not invent a new effect.');
    }
    const next = JSON.parse(JSON.stringify(state));
    let detail;
    if (command.type === 'remove') {
      const target = next.destinations.find((item) => item.id === command.destination);
      if (!target.available || state.lossObserved) {
        fail('ERR_REMOVAL', 'This path is already unavailable, or the total-loss exercise has reached recovery. No further removal was applied.');
      }
      target.available = false;
      detail = `Removed only fictional ${target.id}; reachability is teaching data.`;
    } else if (command.type === 'observe') {
      const paths = viable(state);
      const topology = `${state.recoveredIds.length ? 'recovered:' : ''}${paths.map((item) => item.id).join(',') || 'none'}`;
      if (state.observedTopologies.includes(topology)) {
        fail('ERR_OBSERVATION', 'This fixed topology was already observed. Do not inflate its sample by repeating identical receipts.');
      }
      const batch = state.observedTopologies.length + 1;
      if (paths.length) {
        const destination = paths[0].id;
        const cohort = state.recoveredIds.length ? 'recovered-control' : 'control';
        const durations = cohort === 'recovered-control' ? [26, 40] : destination === 'origin-b' ? [28, 42] : [22, 35];
        const key = `known-write-${state.runNumber}-${batch}`;
        next.attempts.push(
          receipt(state, batch, 'read', cohort, destination, 'succeeded', 200, durations[0], 'not a mutation', 7),
          receipt(state, batch, 'write', cohort, destination, 'succeeded', 200, durations[1], key, 7)
        );
        next.effects.push({ key, units: 1, destination, stateRevision: 7, source: 'fixed acknowledged control receipt' });
        detail = `Observed two fixed ${cohort} receipts on ${destination}; no migration is evidenced.`;
      } else {
        next.attempts.push(
          receipt(state, batch, 'read', 'loss', 'none', 'interrupted', 503, 250, 'none', null),
          receipt(state, batch, 'write', 'loss', 'none', 'interrupted', 503, 250, 'refused before admission', null),
          receipt(state, batch, 'in-flight-write', 'loss', 'unconfirmed prior path', 'unknown', null, null, 'pending-commit: unconfirmed', null)
        );
        next.lossObserved = true;
        next.pendingEffect = 'unresolved';
        detail = 'No viable destination: two unavoidable interruptions and one missing in-flight acknowledgment; new writes refused.';
      }
      next.observedTopologies.push(topology);
    } else if (command.type === 'recover') {
      if (!state.lossObserved || viable(state).length || state.recoveredIds.length) {
        fail('ERR_RECOVERY', 'Observe total loss first; this bounded exercise reconciles and recovers one unavailable owned path once.');
      }
      const target = next.destinations.find((item) => item.id === command.destination);
      target.stateRevision = 7;
      target.writerEpoch = 3;
      target.available = true;
      next.recoveredIds.push(target.id);
      next.pendingEffect = 'reconciled-once';
      next.effects.push({ key: 'pending-commit', units: 1, destination: target.id, stateRevision: 7, source: 'fixed authoritative recovery snapshot, one committed effect' });
      detail = `Reconciled fixed state revision 7 / writer epoch 3 before restoring only fictional ${target.id}; original receipt remains unknown.`;
    } else if (command.type === 'verify') {
      next.claim = command.claim;
      detail = `Checked claim ${command.claim} against retained observations; user impact is not rewritten.`;
    }
    next.step++;
    next.events.push({ step: next.step, tickMs: next.step * 5, type: command.type, detail });
    return issue(next);
  }
  function summarize(state) {
    requireState(state);
    const paths = viable(state).map((item) => item.id);
    const interrupted = state.attempts.filter((item) => item.outcome === 'interrupted').length;
    const unknown = state.attempts.filter((item) => item.outcome === 'unknown').length;
    let verification = 'unverified';
    let reason = 'No total-loss observations yet. A control request is not an uninterrupted migration.';
    if (state.lossObserved) {
      reason = 'Unavoidable interruption and missing acknowledgment were observed. Select the expected negative verdict; no zero-downtime result is achievable in this envelope.';
      if (state.claim === 'expected-interruption') {
        verification = 'pass';
        reason = 'Unavoidable interruption observed: the expected negative educational check passes. This is not an uninterrupted migration.';
      } else if (state.claim === 'zero-downtime') {
        verification = 'fail';
        reason = 'Zero-downtime claim rejected: unavoidable interruption and an unknown acknowledgment remain, including after recovery.';
      }
    }
    return freeze({
      viableDestinations: paths,
      attempted: state.attempts.length,
      succeeded: state.attempts.filter((item) => item.outcome === 'succeeded').length,
      interrupted, unknown,
      affectedAttempts: state.attempts.filter((item) => item.cohort === 'loss').length,
      successfulMigrations: 0, verification,
      userImpact: interrupted ? 'interrupted' : 'unverified',
      envelope: state.lossObserved
        ? 'unsupported: no viable destination during the recorded total-loss interval; recovery does not erase that limit'
        : paths.length ? 'supported control only; at least one compatible path is reachable' : 'unsupported: no viable destination; outcomes not yet observed',
      consistency: state.pendingEffect === 'reconciled-once'
        ? 'fixed authoritative snapshot reconciled once; original acknowledgment remains unknown'
        : state.lossObserved ? 'new writes refused; missing acknowledgment unresolved'
          : paths.length ? 'authoritative fixture state reachable' : 'no authoritative path; new writes must be refused',
      cleanup: state.recoveredIds.length
        ? `owned fixture recovered: ${state.recoveredIds[0]}; the other fictional path remains unavailable`
        : state.destinations.some((item) => !item.available) ? 'owned fictional recovery pending; no real resources changed' : 'not required',
      reason
    });
  }
  return Object.freeze({ BANNER, VERSION, LIMITS, LessonError, create, act, summarize });
}));
