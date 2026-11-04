'use strict';

(function expose(root) {
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const FIXTURES = Object.freeze({
    healthy: 'Prepared candidate with durable continuation',
    'warmup-503': 'Warm-up responds HTTP 503',
    'config-mismatch': 'Effective target configuration is wrong',
    'overlap-deficit': 'Shared-plan overlap exceeds capacity',
    'recycle-loss': 'Former worker loses long-running work',
    'missing-observation': 'Two journey observations are missing',
  });
  const MAX_RUNS = 6;
  const issued = new WeakSet();

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function issue(state) {
    freeze(state);
    issued.add(state);
    return state;
  }

  function exactRecord(value, keys, code) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => !Object.hasOwn(value, key)
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      fail(code, `Expected only own data fields: ${keys.join(', ')}.`);
    }
  }

  function validateInput(input) {
    exactRecord(input, ['path', 'fixture', 'budgetMs'], 'INPUT_GUARD');
    if (input.path === 'native-auto-swap') {
      fail('UNSUPPORTED_PATH', 'Native auto-swap is unsupported on Linux and Web App for Containers. Choose a reviewed manual swap or an explicit controlled pipeline.');
    }
    if (!['manual', 'pipeline'].includes(input.path)
        || typeof input.fixture !== 'string' || !Object.hasOwn(FIXTURES, input.fixture)
        || typeof input.budgetMs !== 'number' || !Number.isInteger(input.budgetMs)
        || input.budgetMs < 100 || input.budgetMs > 500) {
      fail('INPUT_GUARD', 'Choose a listed supported path and fixture, with a numeric integer budget from 100 to 500 ms.');
    }
  }

  function requirePhase(state, phases) {
    if (!phases.includes(state.phase)) {
      fail('STATE_GUARD', `This action requires ${phases.join(' or ')}; current phase is ${state.phase}. Reset to start another run.`);
    }
  }

  function candidateGates(fixture) {
    const warmupStatus = fixture === 'warmup-503' ? 503 : 200;
    const effectiveSetting = fixture === 'config-mismatch' ? 'staging-catalog' : 'production-catalog';
    const overlapDemand = fixture === 'overlap-deficit' ? 240 : 170;
    return [
      { code: 'WARMUP_STATUS', passed: warmupStatus === 200, detail: `Fictional /ready: HTTP ${warmupStatus}; explicit acceptable status: 200 (not the platform default).` },
      { code: 'TARGET_CONFIGURATION', passed: effectiveSetting === 'production-catalog', detail: `Fictional effective target setting: ${effectiveSetting}; required production-catalog. Slot-bound setting stays with production.` },
      { code: 'DEPENDENCY_STATE', passed: true, detail: 'Fixed dependency, authentication and state-compatibility checks: true; a status alone is not readiness.' },
      { code: 'OVERLAP_CAPACITY', passed: overlapDemand <= 200, detail: `Shared capacity: 2 workers × 100 teaching units = 200; overlap demand ${overlapDemand}. Two slots do not create four workers.` },
    ];
  }

  function fixedReceipts(run) {
    const exposed = run.exposed;
    const version = exposed ? 'candidate-v2' : 'old-v1';
    const names = ['profile-read', 'save-cart', 'held-export'];
    const latencies = exposed ? [120, 180, 220] : [60, 80, 100];
    return names.map((journey, index) => {
      const receipt = {
        journey, transitionAttempted: exposed, receiptObserved: true,
        admittedVersion: exposed && index === 2 ? 'old-v1' : version,
        frontendVersion: version, apiVersion: version, httpStatus: 200,
        latencyMs: latencies[index], originalBudgetMs: run.budgetMs,
        authenticationPreserved: true, statePreserved: true, correct: true,
        effects: index === 1 ? 1 : 0, expectedEffects: index === 1 ? 1 : 0,
        continuation: exposed && index === 2 ? 'durable-fictional-receipt' : 'not-needed',
        terminalReason: null,
      };
      if (exposed && run.fixture === 'recycle-loss' && index === 2) {
        Object.assign(receipt, {
          frontendVersion: null, apiVersion: null, httpStatus: null, latencyMs: null,
          continuation: 'none', terminalReason: 'FORMER_WORKER_RECYCLED',
        });
      }
      if (exposed && run.fixture === 'missing-observation' && index === 1) {
        Object.assign(receipt, {
          receiptObserved: false, frontendVersion: null, apiVersion: null,
          httpStatus: null, latencyMs: null, effects: null,
        });
      }
      if (exposed && run.fixture === 'missing-observation' && index === 2) {
        receipt.frontendVersion = null;
        receipt.apiVersion = null;
      }
      return classify(receipt, version);
    });
  }

  function classify(receipt, expectedVersion) {
    let outcome = 'success';
    let reason = 'COMPLETE_SYNTHETIC_JOURNEY';
    if (receipt.terminalReason) {
      outcome = 'interruption';
      reason = receipt.terminalReason;
    } else if (!receipt.receiptObserved || receipt.httpStatus === null
        || receipt.frontendVersion === null || receipt.apiVersion === null) {
      outcome = 'unknown';
      reason = receipt.receiptObserved ? 'DESTINATION_VERSION_UNOBSERVED' : 'CLIENT_RECEIPT_UNOBSERVED';
    } else if (receipt.httpStatus !== 200 || !receipt.authenticationPreserved
        || !receipt.statePreserved || !receipt.correct || receipt.effects !== receipt.expectedEffects
        || receipt.frontendVersion !== expectedVersion || receipt.apiVersion !== expectedVersion) {
      outcome = 'interruption';
      reason = 'JOURNEY_CONTRACT_BROKEN';
    } else if (receipt.latencyMs > receipt.originalBudgetMs) {
      outcome = 'interruption';
      reason = 'ORIGINAL_BUDGET_EXCEEDED';
    }
    return { ...receipt, outcome, reason };
  }

  function metricsFor(receipts) {
    const transitions = receipts.filter((receipt) => receipt.transitionAttempted);
    const count = (population, outcome) => population.filter((receipt) => receipt.outcome === outcome).length;
    return {
      attempted: transitions.length, successes: count(transitions, 'success'),
      interruptions: count(transitions, 'interruption'), unknowns: count(transitions, 'unknown'),
      successFraction: transitions.length ? count(transitions, 'success') / transitions.length : null,
      productionAttempted: receipts.length, productionSuccesses: count(receipts, 'success'),
      productionInterruptions: count(receipts, 'interruption'), productionUnknowns: count(receipts, 'unknown'),
    };
  }

  function cancelledMetrics(exposed) {
    return {
      attempted: exposed ? 3 : 0, successes: 0, interruptions: 0, unknowns: exposed ? 3 : 0,
      successFraction: exposed ? 0 : null,
      productionAttempted: exposed ? 3 : 0, productionSuccesses: 0,
      productionInterruptions: 0, productionUnknowns: exposed ? 3 : 0,
    };
  }

  function initialState() {
    return issue({ phase: 'idle', current: null, history: [], message: 'Ready to assess. No candidate has been exposed.' });
  }

  function apply(state, command) {
    if (!issued.has(state)) fail('STATE_GUARD', 'Use an issued immutable lesson state, not a forged or deserialized state.');
    const typeField = command && typeof command === 'object'
      ? Object.getOwnPropertyDescriptor(command, 'type') : null;
    if (!typeField || !Object.hasOwn(typeField, 'value') || typeof typeField.value !== 'string'
        || !['assess', 'promote', 'measure', 'rollback', 'reset'].includes(typeField.value)) {
      fail('COMMAND_GUARD', 'Choose exactly one known lesson action.');
    }
    exactRecord(command, command.type === 'assess' ? ['type', 'input'] : ['type'], 'COMMAND_GUARD');
    if (command.type === 'assess') {
      requirePhase(state, ['idle']);
      if (state.history.length >= MAX_RUNS) fail('RUN_LIMIT', 'Six archived runs reached. History is retained; reload the page for a new in-memory lesson.');
      validateInput(command.input);
      const gates = candidateGates(command.input.fixture);
      const ready = gates.every((gate) => gate.passed);
      const current = {
        runId: state.history.length + 1, path: command.input.path, fixture: command.input.fixture,
        budgetMs: command.input.budgetMs, source: 'staging', target: 'production',
        computeWorkers: 2, slots: 2, nativeAutoSwap: false,
        productionContent: 'old-v1', stagingContent: 'candidate-v2',
        desiredRoute: 'old-v1', observedRoute: 'not-observed', formerWorkers: 'not-swapped',
        gates, exposed: false, metrics: null, receipts: [], outcome: null, recoveryRequested: false,
        faultNote: command.input.fixture === 'recycle-loss'
          ? 'Negative teaching fixture intentionally lacks old-work continuation. This is not a recommended live promotion.' : null,
        actions: [`1. Assessed ${command.input.path} path under fictional production settings: ${ready ? 'candidate ready' : 'safe pre-exposure abort'}.`],
      };
      return issue({
        phase: ready ? 'ready' : 'aborted', current, history: state.history,
        message: ready
          ? 'Candidate readiness gates passed. Explicit promotion and measured journeys are still required; no continuity is claimed.'
          : 'Candidate rejected before exposure. Promotion is blocked; measure existing production separately.',
      });
    }
    if (command.type === 'promote') {
      requirePhase(state, ['ready']);
      const current = {
        ...state.current, exposed: true, productionContent: 'candidate-v2', stagingContent: 'old-v1',
        desiredRoute: 'candidate-v2', observedRoute: 'not-observed', formerWorkers: 'recycled',
        actions: [...state.current.actions, `2. Explicit ${state.current.path} swap rehearsal targets production; the declared three crossing attempts begin. Former workers recycle; no native operation occurred.`],
      };
      return issue({
        phase: 'promoted', current, history: state.history,
        message: 'Fictional promotion recorded; desired routing is not observed migration. Measure the three declared crossing journeys.',
      });
    }
    if (command.type === 'measure') {
      requirePhase(state, ['promoted', 'aborted']);
      const receipts = fixedReceipts(state.current);
      const metrics = metricsFor(receipts);
      const outcome = !state.current.exposed ? 'safe-abort'
        : metrics.interruptions ? 'interrupted' : metrics.unknowns ? 'unverified' : 'synthetic-uninterrupted';
      const current = {
        ...state.current, receipts, metrics, outcome,
        observedRoute: !state.current.exposed ? 'old-only'
          : metrics.successes === metrics.attempted ? 'candidate-v2' : 'partially-observed',
        actions: [...state.current.actions, `3. Measured fixed receipts: ${metrics.successes} migration successes, ${metrics.interruptions} interruptions, ${metrics.unknowns} unknowns / ${metrics.attempted} attempted transitions.`],
      };
      return issue({
        phase: 'measured', current, history: [...state.history, current],
        message: `${outcome}: fixed synthetic observations retained. No native or reliability claim.`,
      });
    }
    if (command.type === 'rollback') {
      requirePhase(state, ['measured']);
      if (!state.current.exposed || !['interrupted', 'unverified'].includes(state.current.outcome)) {
        fail('STATE_GUARD', 'Fictional rollback is available only after an exposed interrupted or unverified result.');
      }
      const current = {
        ...state.current, desiredRoute: 'old-v1', observedRoute: 'not-observed-after-recovery',
        recoveryRequested: true,
        actions: [...state.current.actions, '4. Fictional rollback requested, not observed complete. Original interruptions and unknowns remain unchanged.'],
      };
      return issue({
        phase: 'recovery-requested', current,
        history: state.history.map((run) => run.runId === current.runId ? current : run),
        message: 'Fictional recovery requested only. No recovery observations; prior failures and uncertainty are retained.',
      });
    }
    let history = state.history;
    if (state.current && !state.current.metrics) {
      const current = {
        ...state.current, outcome: 'cancelled', metrics: cancelledMetrics(state.current.exposed),
        actions: [...state.current.actions, 'Reset archived an unfinished attempt; absent observations are not successful migration.'],
      };
      history = [...history, current];
    }
    return issue({
      phase: 'idle', current: null, history,
      message: 'Current controls reset. History retained; no new transition evidence.',
    });
  }

  const api = Object.freeze({ BANNER, FIXTURES, MAX_RUNS, initialState, apply });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S122Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
