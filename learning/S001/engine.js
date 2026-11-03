(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WarmHandoffLesson = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONDITIONS = Object.freeze([
    'healthy', 'dependency-failure', 'incompatible-state', 'duplicate-effects',
    'slow-warmup', 'missing-readiness', 'stale-readiness',
    'missing-admission', 'regressed-handoff'
  ]);
  const BUDGET_MS = 500;
  const RETENTION_MS = 1000;

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function fixture(condition = 'healthy') {
    if (!CONDITIONS.includes(condition)) throw new RangeError('Unknown synthetic condition: ' + condition);
    const input = {
      condition: condition,
      budgetMs: BUDGET_MS,
      maxEvidenceAgeMs: 1000,
      rollbackRetentionMs: RETENTION_MS,
      requiredInstances: 2,
      requiredOverlapUnits: 2,
      readiness: {
        candidateId: 'v2@1', ageMs: 0, instancesReady: 2,
        dependenciesReady: true, configurationCompatible: true,
        authenticated: true, cartQuantity: 3, effectCount: 1,
        latencyMs: 180, overlapUnits: 2
      },
      admission: {
        id: 'new-002', destination: 'v2', completed: true,
        authenticated: true, cartQuantity: 3, effectCount: 1, latencyMs: 180
      },
      expected: 'READY after warm-up; PASS after observed handoff. New work reaches v2 in 180/500 ms; old work stays on v1 until drain. Retire only after drain and rollback retention.'
    };
    switch (condition) {
      case 'dependency-failure':
        input.readiness.dependenciesReady = false;
        input.expected = 'FAIL at warm-up: dependency is not ready. Safe abort before exposure; no migrated user.';
        break;
      case 'incompatible-state':
        input.readiness.cartQuantity = 2;
        input.expected = 'FAIL at warm-up: cart quantity 2 does not preserve quantity 3. No v2 user admission.';
        break;
      case 'duplicate-effects':
        input.readiness.effectCount = 2;
        input.expected = 'FAIL at warm-up: two effects violate exactly-once behavior. No v2 user admission.';
        break;
      case 'slow-warmup':
        input.readiness.latencyMs = 501;
        input.expected = 'FAIL at warm-up: 501 ms exceeds the inclusive 500 ms budget. No v2 user admission.';
        break;
      case 'missing-readiness':
        input.readiness.dependenciesReady = null;
        input.expected = 'UNKNOWN readiness: the dependency observation is missing, not healthy. Keep admissions on v1.';
        break;
      case 'stale-readiness':
        input.readiness.ageMs = 1001;
        input.expected = 'UNKNOWN readiness: age 1001 ms exceeds the 1000 ms evidence window. Keep admissions on v1.';
        break;
      case 'missing-admission':
        input.admission.destination = null;
        input.expected = 'Warm-up READY, then UNKNOWN handoff: desired routing cannot replace the missing version stamp. Keep the attempt; revert future admissions to v1.';
        break;
      case 'regressed-handoff':
        input.admission.latencyMs = 501;
        input.expected = 'Warm-up READY, then FAIL: an observed v2 journey takes 501/500 ms. Record one interruption even after future admissions revert to v1.';
        break;
    }
    return input;
  }

  function check(id, actual, expected, accepts) {
    const missing = actual === null || actual === undefined;
    return {
      id: id,
      expected: expected,
      actual: missing ? null : actual,
      status: missing ? 'unknown' : accepts(actual) ? 'pass' : 'fail'
    };
  }

  function assess(checks) {
    return {
      verdict: checks.some((item) => item.status === 'fail') ? 'FAIL'
        : checks.some((item) => item.status === 'unknown') ? 'UNKNOWN' : 'PASS',
      checks: checks
    };
  }

  function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function validLatency(value) {
    return Number.isFinite(value) && value >= 0 && value <= BUDGET_MS;
  }

  function evaluateReadiness(observations) {
    const value = record(observations);
    const freshness = check('freshness', value.ageMs, '0..1000 ms inclusive', (age) => Number.isFinite(age) && age >= 0 && age <= 1000);
    if (Number.isFinite(value.ageMs) && value.ageMs > 1000) freshness.status = 'unknown';
    return assess([
      check('identity', value.candidateId, 'v2@1', (id) => id === 'v2@1'),
      freshness,
      check('instances', value.instancesReady, 'at least 2', (count) => Number.isInteger(count) && count >= 2),
      check('dependencies', value.dependenciesReady, true, (ready) => ready === true),
      check('configuration', value.configurationCompatible, true, (compatible) => compatible === true),
      check('authentication', value.authenticated, true, (authenticated) => authenticated === true),
      check('state', value.cartQuantity, 3, (quantity) => quantity === 3),
      check('effects', value.effectCount, 1, (count) => count === 1),
      check('latency', value.latencyMs, '0..500 ms inclusive', validLatency),
      check('capacity', value.overlapUnits, 'at least 2 units', (units) => Number.isInteger(units) && units >= 2)
    ]);
  }

  function evaluateTransition(observations) {
    const value = record(observations);
    return assess([
      check('destination', value.destination, 'v2', (destination) => destination === 'v2'),
      check('completion', value.completed, true, (completed) => completed === true),
      check('authentication', value.authenticated, true, (authenticated) => authenticated === true),
      check('state', value.cartQuantity, 3, (quantity) => quantity === 3),
      check('effects', value.effectCount, 1, (count) => count === 1),
      check('latency', value.latencyMs, '0..500 ms inclusive', validLatency)
    ]);
  }

  function log(state, event, details) {
    state.trace.push({ step: state.trace.length + 1, event: event, details: copy(details) });
  }

  function refreshCleanup(state) {
    if (state.v1 === 'RETIRED') {
      state.cleanup = {
        status: 'complete',
        message: 'Local rehearsal complete: v1 retired after observed drain and rollback retention. No external resources were created or deleted. Reset clears only this page memory.'
      };
      return state;
    }
    const holds = [];
    if (state.oldJourney.status !== 'complete') holds.push('old-001 still running on v1');
    if (state.elapsedSinceHandoffMs < RETENTION_MS) holds.push('1000 ms rollback retention not yet observed');
    if (state.attemptedTransitions.length === 0 || state.attemptedTransitions[0].verdict !== 'PASS') {
      holds.push('no verified successful handoff');
    }
    state.cleanup = {
      status: 'retained',
      message: 'v1 retained: ' + (holds.length ? holds.join('; ') : 'gates passed; explicit retirement still required') +
        '. No external resources were created. Reset clears only local page memory.'
    };
    return state;
  }

  function createExercise(condition = 'healthy') {
    fixture(condition);
    const state = {
      mode: 'synthetic', condition: condition, verdict: 'NOT_RUN',
      v1: 'ACTIVE', v2: 'WARMING', admissionTarget: 'v1',
      readiness: null, newJourney: null, attemptedTransitions: [], checks: [],
      halted: false, elapsedSinceHandoffMs: 0,
      reason: 'v2 is unready. Rehearse all readiness gates before handing off.',
      oldJourney: {
        id: 'old-001', destination: 'v1', status: 'running',
        authenticated: true, cartQuantity: 3, effectCount: 0, latencyMs: null
      },
      userImpact: {
        classification: 'not-migrated', successfulTransitions: 0, interruptedJourneys: 0,
        message: 'No transition attempted. Warm-up probes are not migrated users. Existing old-001 continues on v1.'
      },
      trace: []
    };
    log(state, 'start', { mode: 'synthetic', candidate: 'v2@1', lifecycle: 'WARMING', oldJourney: state.oldJourney });
    return refreshCleanup(state);
  }

  function reject(state, reason) {
    state.verdict = 'FAIL';
    state.halted = true;
    state.reason = reason + ' Reset to start a new scored rehearsal.';
    if (state.attemptedTransitions.length === 0) {
      state.userImpact = {
        classification: 'safe-abort', successfulTransitions: 0, interruptedJourneys: 0,
        message: 'Safe abort before exposure: 0 transition attempts, 0 interrupted users in this fixture. v1 still admits users; no completed migration is claimed.'
      };
    }
    log(state, 'action-rejected', { reason: reason, admissionTarget: state.admissionTarget });
  }

  function scoped(checks, scope) {
    return checks.map((item) => Object.assign({ scope: scope }, item));
  }

  function act(previous, action) {
    const state = copy(previous);
    const input = fixture(state.condition);
    if (!['warm', 'handoff', 'drain', 'elapse', 'retire'].includes(action)) {
      reject(state, 'Unknown action: ' + action);
      return refreshCleanup(state);
    }
    if (state.halted && ['warm', 'handoff', 'retire'].includes(action)) {
      log(state, 'blocked-until-reset', { requested: action, preservedVerdict: state.verdict });
      return refreshCleanup(state);
    }
    if (action === 'warm') {
      if (state.attemptedTransitions.length > 0) {
        reject(state, 'Warm-up cannot overwrite an already observed transition.');
      } else {
        state.readiness = evaluateReadiness(input.readiness);
        state.checks = scoped(state.readiness.checks, 'Warm-up');
        log(state, 'warmup-observed', { isolatedProbe: true, observations: input.readiness });
        const verdict = state.readiness.verdict;
        state.verdict = verdict === 'PASS' ? 'READY' : verdict;
        state.v2 = verdict === 'PASS' ? 'READY' : verdict === 'FAIL' ? 'ABORTED' : 'WARMING';
        state.halted = verdict !== 'PASS';
        state.reason = verdict === 'PASS'
          ? 'All 10 warm-up gates passed. No user has migrated yet; hand off new admissions next.'
          : verdict + ' warm-up: no ordinary v2 admissions. Reset before trying different evidence.';
        if (verdict === 'FAIL') {
          state.userImpact = {
            classification: 'safe-abort', successfulTransitions: 0, interruptedJourneys: 0,
            message: 'Safe abort before exposure. Known warm-up regression; old-001 and new admissions remain on v1. This is not a completed migration.'
          };
        } else if (verdict === 'UNKNOWN') {
          state.userImpact = {
            classification: 'unknown', successfulTransitions: 0, interruptedJourneys: 0,
            message: 'UNKNOWN readiness: missing or stale evidence cannot certify success. No transition admitted; v1 continues serving.'
          };
        }
        log(state, 'warmup-evaluated', { verdict: verdict, candidateLifecycle: state.v2, migratedUsers: 0 });
      }
    } else if (action === 'handoff') {
      if (state.attemptedTransitions.length > 0) {
        log(state, 'handoff-already-observed', { attemptedTransitions: state.attemptedTransitions.length });
      } else if (state.v2 !== 'READY' || !state.readiness || state.readiness.verdict !== 'PASS') {
        state.v2 = 'ABORTED';
        reject(state, 'Unready destination: v2 must pass warm-up before new admissions.');
      } else {
        log(state, 'handoff-requested', { desiredDestination: 'v2', oldWorkDestination: 'v1' });
        state.newJourney = copy(input.admission);
        const result = evaluateTransition(state.newJourney);
        state.attemptedTransitions.push({ journey: copy(state.newJourney), verdict: result.verdict });
        state.checks = scoped(state.readiness.checks, 'Warm-up').concat(scoped(result.checks, 'Handoff'));
        state.verdict = result.verdict;
        state.halted = result.verdict !== 'PASS';
        state.v2 = result.verdict === 'PASS' ? 'ACTIVE' : 'QUARANTINED';
        state.v1 = result.verdict === 'PASS' ? (state.oldJourney.status === 'complete' ? 'RETAINED' : 'DRAINING') : 'ACTIVE';
        state.admissionTarget = result.verdict === 'PASS' ? 'v2' : 'v1';
        log(state, 'admission-observed', state.newJourney);
        log(state, 'transition-evaluated', { verdict: result.verdict, attempted: 1, successful: result.verdict === 'PASS' ? 1 : 0 });
        if (result.verdict === 'PASS') {
          state.reason = 'PASS: observed new-002 on v2 with intact authentication, state, one effect, and latency 180/500 ms. Keep v1 for old work and rollback.';
          state.userImpact = {
            classification: 'uninterrupted', successfulTransitions: 1, interruptedJourneys: 0,
            message: 'Synthetic uninterrupted transition: 1/1 attempt observed on v2; authentication intact, cart=3, effects=1, latency=180/500 ms. Old work is accounted for separately, not counted as another migration.'
          };
        } else {
          state.reason = result.verdict + ': attempted transition retained in evidence; future admissions reverted to v1. Reset before a new exercise.';
          state.userImpact = {
            classification: result.verdict === 'FAIL' ? 'interrupted' : 'unknown',
            successfulTransitions: 0,
            interruptedJourneys: result.verdict === 'FAIL' ? 1 : 0,
            message: result.verdict === 'FAIL'
              ? 'Interrupted transition: 1/1 attempted v2 journey took 501/500 ms. Future admissions reverted to v1; rollback does not erase that interruption.'
              : 'UNKNOWN transition: destination stamp missing. Keep 1 attempted journey and 0 proven successes; desired v2 routing is not proof. Future admissions reverted to v1.'
          };
          log(state, 'rollback-future-admissions', { admissionTarget: 'v1', candidate: 'QUARANTINED', preservedAttemptVerdict: result.verdict });
        }
      }
    } else if (action === 'drain') {
      if (state.oldJourney.status !== 'complete') {
        state.oldJourney.status = 'complete';
        state.oldJourney.effectCount = 1;
        state.oldJourney.latencyMs = 240;
        if (state.v1 === 'DRAINING') state.v1 = 'RETAINED';
        log(state, 'old-work-completed', state.oldJourney);
      } else {
        log(state, 'old-work-already-complete', { effectCount: state.oldJourney.effectCount });
      }
    } else if (action === 'elapse') {
      if (state.attemptedTransitions.length === 0) {
        reject(state, 'Rollback retention starts at handoff, not before a transition attempt.');
      } else {
        state.elapsedSinceHandoffMs = RETENTION_MS;
        log(state, 'retention-observed', { elapsedSinceHandoffMs: RETENTION_MS, simulatedOnly: true });
      }
    } else if (action === 'retire') {
      const old = state.oldJourney;
      const drained = old.status === 'complete' && old.effectCount === 1 &&
        old.authenticated === true && old.cartQuantity === 3 && validLatency(old.latencyMs);
      const migrated = state.attemptedTransitions.length === 1 &&
        state.attemptedTransitions[0].verdict === 'PASS' && state.admissionTarget === 'v2' && state.v2 === 'ACTIVE';
      if (!migrated || !drained || state.elapsedSinceHandoffMs < RETENTION_MS) {
        reject(state, 'Retirement blocked: require proven v2 migration, complete old work with correct effects, and the 1000 ms rollback window.');
      } else if (state.v1 !== 'RETIRED') {
        state.v1 = 'RETIRED';
        state.reason = 'PASS: observed handoff, old-work drain, and rollback retention gates passed. Only synthetic local state was retired.';
        log(state, 'v1-retired', { drainObserved: true, retentionMs: RETENTION_MS, externalResourcesDeleted: 0 });
      }
    }
    return refreshCleanup(state);
  }

  return {
    conditions: CONDITIONS,
    fixture: fixture,
    createExercise: createExercise,
    act: act,
    evaluateReadiness: evaluateReadiness,
    evaluateTransition: evaluateTransition
  };
}));
