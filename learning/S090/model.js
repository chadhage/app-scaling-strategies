(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S090Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ rehearsals: 4, attempts: 6, trace: 14, ticks: 2 });
  const inventory = (newAdmissions, users, work, stateOwners, retentionUntil) =>
    Object.freeze({ newAdmissions, users, work, stateOwners, retentionUntil });
  const FIXTURES = Object.freeze({
    'all-dependencies': inventory(1, 2, 2, 1, 2),
    'traffic-only': inventory(1, 0, 0, 0, 0),
    'users-only': inventory(0, 2, 0, 0, 0),
    'work-only': inventory(0, 0, 2, 0, 0),
    'ownership-only': inventory(0, 0, 0, 1, 0),
    'retention-only': inventory(0, 0, 0, 0, 2),
    unobserved: inventory(null, null, null, null, null),
    'mixed-unknown': inventory(null, null, 1, null, null),
    ready: inventory(0, 0, 0, 0, 0),
  });
  const ACTIONS = Object.freeze(['attempt-retirement', 'stop-admission', 'drain-users',
    'finish-work', 'transfer-ownership', 'advance-tick', 'observe-inventory']);
  const OUTCOMES = Object.freeze(['SUCCESS', 'FAILURE', 'UNKNOWN']);
  const dependencies = Object.freeze([
    ['newAdmissions', 'new-admissions'], ['users', 'pinned-users'], ['work', 'pending-work'],
    ['stateOwners', 'state-ownership'], ['retentionUntil', 'rollback-retention'],
  ]);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function reject(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function requireState(condition, message) {
    if (!condition) reject('ERR_STATE', message);
  }
  function lifecycle(run) {
    if (run.inventory.newAdmissions > 0) return 'ACTIVE';
    return dependencies.slice(0, 4).every(([key]) => run.inventory[key] === 0)
      && run.inventory.retentionUntil !== null ? 'RETAINED' : 'DRAINING';
  }
  function assess(run) {
    const blockers = [];
    const unknown = [];
    for (const [key, name] of dependencies) {
      const value = run.inventory[key];
      if (value === null) unknown.push(name);
      else if (key === 'retentionUntil' ? value > run.tick : value > 0) blockers.push(name);
    }
    return { blockers, unknown };
  }
  function createLesson() {
    let current = null;
    let history = [];
    function snapshot() {
      const totals = { attempts: 0, success: 0, failure: 0, unknown: 0 };
      for (const run of current ? [...history, current] : history) {
        for (const attempt of run.attempts) {
          totals.attempts++;
          totals[attempt.outcome.toLowerCase()]++;
        }
      }
      return copy({ phase: current ? 'active' : 'idle', current, history, totals, limits: LIMITS });
    }
    function record(action) {
      current.trace.push({
        step: current.trace.length + 1, action, lifecycle: current.lifecycle, tick: current.tick,
        inventory: copy(current.inventory), oldCapacity: current.oldCapacity,
        latestAttempt: current.lastAttempt ? current.lastAttempt.id : null,
        latestOutcome: current.lastAttempt ? current.lastAttempt.outcome : 'NOT_ATTEMPTED',
      });
    }
    return {
      snapshot,
      begin(fixture) {
        if (typeof fixture !== 'string' || !Object.hasOwn(FIXTURES, fixture)) {
          reject('ERR_INPUT', 'Choose one of the named synthetic inventory fixtures.');
        }
        requireState(current === null, 'Archive the current attempted rehearsal or reset before starting another.');
        if (history.length >= LIMITS.rehearsals) reject('ERR_LIMIT', 'Four rehearsals are retained. Reset explicitly to start again.');
        current = {
          id: 1, fixture, deployment: 'synthetic-old-v1', lifecycle: 'ACTIVE',
          inventory: copy(FIXTURES[fixture]), tick: 0, oldCapacity: 'AVAILABLE',
          attempts: [], trace: [], prediction: null, migrationCertified: false,
          lastAttempt: null,
        };
        current.id = history.length + 1;
        current.lifecycle = lifecycle(current);
        record('begin');
        return snapshot();
      },
      act(action) {
        if (typeof action !== 'string' || !ACTIONS.includes(action)) {
          reject('ERR_INPUT', 'Choose one of the seven synthetic actions.');
        }
        requireState(current !== null, 'Start a named rehearsal before applying an action.');
        requireState(current.lifecycle !== 'RETIRED', 'This teaching trace is retired. Archive it or reset; no repeated cleanup is allowed.');
        if (current.trace.length >= LIMITS.trace) reject('ERR_LIMIT', 'The fourteen-event trace bound has been reached. Archive or reset.');
        const values = current.inventory;
        if (action === 'attempt-retirement') {
          if (current.attempts.length >= LIMITS.attempts) reject('ERR_LIMIT', 'Six retirement attempts are retained. Archive or reset.');
          const { blockers, unknown } = assess(current);
          const before = { lifecycle: current.lifecycle, inventory: copy(values), tick: current.tick, oldCapacity: current.oldCapacity };
          const outcome = blockers.length ? 'FAILURE' : unknown.length ? 'UNKNOWN' : 'SUCCESS';
          const decision = outcome === 'FAILURE' ? 'REJECTED' : outcome === 'UNKNOWN' ? 'HELD_UNVERIFIED' : 'SIMULATED_RETIRED';
          if (outcome === 'SUCCESS') {
            current.lifecycle = 'RETIRED';
            current.oldCapacity = 'RETIRED_IN_TRACE';
          }
          const attempt = {
            id: current.attempts.length + 1, outcome, decision, verifier: 'PASS', blockers, unknown,
            before, after: { lifecycle: current.lifecycle, inventory: copy(values), tick: current.tick, oldCapacity: current.oldCapacity },
            retirementIsTeachingTraceOnly: true, migrationCertified: false,
          };
          current.attempts.push(attempt);
          current.lastAttempt = attempt;
          current.prediction = null;
        } else {
          if (action === 'stop-admission') {
            requireState(values.newAdmissions > 0, 'Stopping admission requires an observed old-admission dependency greater than zero.');
            values.newAdmissions = 0;
          } else if (action === 'drain-users') {
            requireState(values.newAdmissions === 0 && values.users > 0, 'Stop observed new admissions before draining observed pinned users.');
            values.users = 0;
          } else if (action === 'finish-work') {
            requireState(values.work > 0, 'Finishing work requires an observed pending work count greater than zero.');
            values.work = 0;
          } else if (action === 'transfer-ownership') {
            requireState(values.work === 0 && values.stateOwners > 0, 'Finish observed work before transferring the observed state owner.');
            values.stateOwners = 0;
          } else if (action === 'advance-tick') {
            requireState(values.retentionUntil !== null && values.retentionUntil > current.tick && current.tick < LIMITS.ticks,
              'Advance only within the known two-tick synthetic rollback-retention window.');
            current.tick++;
          } else {
            requireState(Object.values(values).some((value) => value === null), 'The named synthetic observation applies only to missing inventory fields.');
            for (const [key] of dependencies) if (values[key] === null) values[key] = 0;
          }
          current.lifecycle = lifecycle(current);
        }
        record(action);
        return snapshot();
      },
      checkPrediction(expected) {
        if (typeof expected !== 'string' || !OUTCOMES.includes(expected)) {
          reject('ERR_INPUT', 'Choose SUCCESS, FAILURE or UNKNOWN for the recorded attempt.');
        }
        requireState(current !== null && current.lastAttempt !== null, 'Attempt retirement before checking a prediction.');
        requireState(current.prediction === null, 'This attempt already has a checked prediction. Attempt again or start a new rehearsal.');
        current.prediction = {
          attempt: current.lastAttempt.id, expected, observed: current.lastAttempt.outcome,
          correct: expected === current.lastAttempt.outcome,
        };
        return snapshot();
      },
      newRehearsal() {
        requireState(current !== null && current.attempts.length > 0, 'Only an attempted rehearsal can be archived.');
        history.push(copy(current));
        current = null;
        return snapshot();
      },
      reset() {
        current = null;
        history = [];
        return snapshot();
      },
    };
  }
  return Object.freeze({ createLesson, FIXTURES, LIMITS, ACTIONS, OUTCOMES });
}));
