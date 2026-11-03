'use strict';

(function expose(root) {
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const LIMIT = 6;
  const BUDGET_MS = 250;
  const FIXTURES = Object.freeze([
    'guarded-crash', 'forced-exposure', 'production-regression', 'missing-evidence', 'healthy-migration',
  ]);
  const CONCLUSIONS = Object.freeze(['safe-abort', 'completed-migration', 'interrupted-transition', 'unknown']);

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function reject(code, message) {
    const error = new TypeError(`${message} No rehearsal was recorded.`);
    error.code = code;
    throw error;
  }

  function exactKeys(value, keys, code, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
        })) {
      reject(code, `${label} must contain only ${keys.join(' and ')} as plain data.`);
    }
  }

  function validateInput(input) {
    exactKeys(input, ['fixture', 'conclusion'], 'ERR_LESSON_INPUT', 'Input');
    if (typeof input.fixture !== 'string' || !FIXTURES.includes(input.fixture)) {
      reject('ERR_LESSON_INPUT', 'Input fixture is not an allowed fixed teaching trace.');
    }
    if (typeof input.conclusion !== 'string' || !CONCLUSIONS.includes(input.conclusion)) {
      reject('ERR_LESSON_INPUT', 'Input conclusion is not an allowed outcome classification.');
    }
  }

  function journey(id, version, outcome, latencyMs, reason) {
    const unknown = outcome === 'unknown';
    const crashed = version === 'candidate-v2' && outcome === 'failure';
    return {
      id, version, deploymentEpoch: unknown ? null : version === 'old-v1' ? 1 : 2,
      httpStatus: unknown ? null : crashed ? 503 : 200,
      latencyMs, sessionPreserved: unknown ? null : true, statePreserved: unknown ? null : true,
      businessEffects: unknown ? null : crashed ? 0 : 1, outcome, reason,
    };
  }

  function event(tick, candidateState, action, oldPercent, candidatePercent, evidence) {
    return { tick, candidateState, action, oldPercent, candidatePercent, evidence };
  }

  function resultFor(input, attempt) {
    const fixture = input.fixture;
    const healthy = fixture === 'healthy-migration';
    const forced = fixture === 'forced-exposure';
    const regression = fixture === 'production-regression';
    const unknown = fixture === 'missing-evidence';
    const productionJourneys = [80, 95, 110].map((latency, index) => journey(
      `production-091-${index + 1}`, unknown ? null : 'old-v1',
      unknown ? 'unknown' : regression && index === 0 ? 'failure' : 'success',
      unknown ? null : regression && index === 0 ? 400 : latency,
      unknown ? 'Production observation is missing; continuity is unverified.'
        : regression && index === 0 ? 'Synthetic HTTP 200 took 400 ms, exceeding the original 250 ms budget.'
          : 'Observed old-v1 preserved session, saved state and one effect within 250 ms.',
    ));
    const transitionJourneys = healthy || forced || unknown
      ? [0, 1, 2].map((index) => ({
        started: true,
        ...journey(`transition-091-${index + 1}`, unknown ? null : 'candidate-v2',
          unknown ? 'unknown' : forced ? 'failure' : 'success', unknown ? null : forced ? 45 : 120 + index * 10,
          unknown ? 'Commanded transition started; destination and client outcome observations are missing.'
            : forced ? 'A synthetic 503 from the CRASHED candidate interrupts the started journey.'
              : 'Observed candidate-v2 epoch 2 preserved session, saved state and one effect within 250 ms.'),
      })) : [];
    const outcome = unknown ? 'unknown' : forced || regression ? 'interrupted-transition'
      : healthy ? 'completed-migration' : 'safe-abort';
    const acceptance = unknown ? 'unknown' : forced || regression ? 'fail' : 'pass';
    const acceptanceReason = unknown
      ? 'Exposure, abort and production observations are missing. Neither safe abort nor migration is established.'
      : forced ? 'Crash gating was bypassed. Later recovery cannot erase the three interrupted transitions.'
        : regression ? 'Candidate abort was acknowledged before exposure, but production continuity failed its original journey budget.'
          : healthy ? 'The comparison records readiness before exposure and three actual synthetic candidate-version journeys; old standby is retained.'
            : 'Crash caused a visible abort before any exposure and all three old-v1 journeys stayed usable. This is not completed migration.';
    const trace = [event(0, 'WARMING', 'Register fictional candidate-v2 epoch 2', 100, 0, 'No user admitted to the warming candidate.')];
    if (healthy) {
      trace.push(
        event(1, 'READY', 'Observe all fixed readiness gates', 100, 0, 'Two required instances, dependencies, configuration, authentication, compatible state and representative journeys pass.'),
        event(2, 'ACTIVE', 'Admit three synthetic transition journeys', 0, 100, 'Admission follows readiness; actual candidate version must be observed.'),
        event(3, 'ACTIVE', 'Verify three candidate-v2 outcomes', 0, 100, 'All three journeys meet the contract. Old-v1 remains retained standby, not retired.'),
      );
    } else {
      trace.push(event(1, 'CRASHED', 'Record candidate process crash', 100, 0, 'Teaching data only: no real process or resource is touched.'));
      if (forced) {
        trace.push(
          event(2, 'CRASHED', 'Replay an unsafe gate-bypass instruction', 0, 100, 'Three started candidate journeys return synthetic 503 failures.'),
          event(3, 'ABORTED', 'Record recovery to retained old-v1', 100, 0, 'Current routing recovered, but peak exposure and interruptions remain recorded.'),
        );
      } else if (unknown) {
        trace.push(
          event(2, 'CRASHED', 'Record a commanded exposure with missing observations', null, null, 'Three intended transitions started; neither effective routing nor outcomes are evidenced.'),
          event(3, 'CRASHED', 'Request abort; acknowledgement unavailable', null, null, 'Last-known old-v1 routing is not proof of current production continuity.'),
        );
      } else {
        trace.push(
          event(2, 'CRASHED', 'Block candidate admission', 100, 0, 'Readiness fails: zero of two required candidate instances are ready.'),
          event(3, 'ABORTED', 'Acknowledge abort before exposure', 100, 0,
            regression ? 'One production journey has a slow synthetic 200; continuity acceptance fails.'
              : 'All three observed old-v1 journeys remain within their original contract.'),
        );
      }
    }
    return freeze({
      attempt, input: { fixture: input.fixture, conclusion: input.conclusion }, outcome, acceptance, acceptanceReason,
      conclusionCheck: input.conclusion === outcome ? 'pass' : 'fail',
      conclusionReason: input.conclusion === outcome
        ? `Correct: ${outcome}.${outcome === 'safe-abort' ? ' No completed migration is claimed.' : ''}`
        : `Incorrect: observations establish ${outcome}, not ${input.conclusion}. Your claim cannot change the trace.`,
      candidateState: healthy ? 'ACTIVE' : unknown ? 'CRASHED' : 'ABORTED',
      abortStatus: healthy ? 'not-needed' : unknown ? 'unverified' : forced ? 'recovery-after-exposure' : 'acknowledged-before-exposure',
      readiness: {
        process: healthy ? 'running' : 'crashed', requiredInstances: 2, readyInstances: healthy ? 2 : 0,
        dependencies: healthy ? true : null, configuration: healthy ? true : null,
        authentication: healthy ? true : null, compatibleState: healthy ? true : null, journeysWithinBudget: healthy ? true : null,
      },
      peakCandidateExposure: unknown ? null : healthy || forced ? 3 : 0,
      effectiveRouting: {
        observed: !unknown, oldPercent: unknown ? null : healthy ? 0 : 100, candidatePercent: unknown ? null : healthy ? 100 : 0,
      },
      productionJourneys, transitionJourneys, completedMigration: healthy,
      retention: {
        old: unknown ? 'last-known-retained; current service unverified' : healthy ? 'retained-standby; not retired' : 'serving-retained',
        candidate: unknown ? 'exclusion-unverified' : healthy ? 'active' : 'excluded',
      },
      trace,
    });
  }

  function sameFrozenData(actual, expected) {
    if (!expected || typeof expected !== 'object') return actual === expected;
    if (!actual || !Object.isFrozen(actual) || Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) return false;
    const keys = Reflect.ownKeys(expected);
    if (Reflect.ownKeys(actual).length !== keys.length) return false;
    return keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(actual, key);
      const expectedDescriptor = Object.getOwnPropertyDescriptor(expected, key);
      return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable === expectedDescriptor.enumerable
        && sameFrozenData(descriptor.value, expected[key]);
    });
  }

  function validateSession(session) {
    exactKeys(session, ['schemaVersion', 'history'], 'ERR_LESSON_STATE', 'State');
    const history = session.history;
    if (session.schemaVersion !== 1 || !Object.isFrozen(session) || !Array.isArray(history)
        || Object.getPrototypeOf(history) !== Array.prototype || !Object.isFrozen(history)
        || history.length > LIMIT || Reflect.ownKeys(history).length !== history.length + 1) {
      reject('ERR_LESSON_STATE', 'State must be a frozen, bounded lesson snapshot with schemaVersion 1.');
    }
    for (let index = 0; index < history.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(history, String(index));
      const record = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
      const inputDescriptor = record && Object.getOwnPropertyDescriptor(record, 'input');
      if (!inputDescriptor || !Object.hasOwn(inputDescriptor, 'value')) reject('ERR_LESSON_STATE', 'State history must contain exact recorded attempts.');
      try { validateInput(inputDescriptor.value); }
      catch { reject('ERR_LESSON_STATE', 'State history contains an invalid recorded input.'); }
      const expected = resultFor(inputDescriptor.value, index + 1);
      if (!sameFrozenData(record, expected)) reject('ERR_LESSON_STATE', 'State history was changed, reordered or forged.');
    }
  }

  function createSession() {
    return freeze({ schemaVersion: 1, history: [] });
  }

  function runLesson(session, input) {
    validateSession(session);
    validateInput(input);
    if (session.history.length === LIMIT) reject('ERR_LESSON_LIMIT', 'The six-attempt limit is reached; use Reset rehearsal.');
    return freeze({ schemaVersion: 1, history: [...session.history, resultFor(input, session.history.length + 1)] });
  }

  function resetSession(session) {
    validateSession(session);
    return createSession();
  }

  function summarize(session) {
    validateSession(session);
    const production = session.history.flatMap((record) => record.productionJourneys);
    const transitions = session.history.flatMap((record) => record.transitionJourneys);
    const count = (records, outcome) => records.filter((record) => record.outcome === outcome).length;
    const successes = count(transitions, 'success');
    return freeze({
      attempts: session.history.length, safeAborts: count(session.history, 'safe-abort'),
      completedMigrations: session.history.filter((record) => record.completedMigration).length,
      interruptedRuns: count(session.history, 'interrupted-transition'), unknownRuns: count(session.history, 'unknown'),
      production: { successes: count(production, 'success'), interruptions: count(production, 'failure'), unknown: count(production, 'unknown') },
      transitions: { attempted: transitions.length, successes, interruptions: count(transitions, 'failure'),
        unknown: count(transitions, 'unknown'), successRate: transitions.length ? successes / transitions.length : null },
    });
  }

  const api = Object.freeze({ BANNER, LIMIT, BUDGET_MS, FIXTURES, CONCLUSIONS, createSession, runLesson, resetSession, summarize });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S091Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
