(function (root) {
  'use strict';
  const hosts = Object.freeze({
    'supporting-slots': 'Fictional supporting-slot plan (Premium category)',
    'flex-no-slots': 'Fictional Flex Consumption category: no slots',
    'functions-container-apps': 'Fictional Functions on Container Apps category: revisions, not slots',
  });
  const policies = Object.freeze({
    deduplicate: 'Checkpoint + stable effect key',
    'blind-replay': 'Blind replay (deliberate duplicate-effect counterexample)',
  });
  const issued = new WeakSet();
  const MAX_RUNS = 6;
  const REPLAY_COST = 6;
  const JOURNEY_BUDGET = 10;

  class LessonError extends Error {
    constructor(code, message, field) {
      super(message);
      this.name = 'LessonError';
      this.code = code;
      this.field = field || null;
    }
  }
  function fail(code, message, field) {
    throw new LessonError(code, message, field);
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  function issue(value) {
    freeze(value);
    issued.add(value);
    return value;
  }
  function stateGuard(state) {
    if (!state || !issued.has(state)) {
      fail('ERR_STATE', 'State must be an issued immutable lesson state; imported or forged data is not executable.');
    }
  }
  function exact(command, names) {
    if (!command || Object.getPrototypeOf(command) !== Object.prototype) {
      fail('ERR_INPUT', 'A command must be a plain object with exact data fields.');
    }
    const keys = Reflect.ownKeys(command);
    if (keys.length !== names.length || keys.some((key) => !names.includes(key))
        || keys.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(command, key), 'value'))) {
      fail('ERR_INPUT', `Command requires exactly: ${names.join(', ')}.`);
    }
  }
  function parseBudget(raw) {
    if (typeof raw !== 'string' || !/^(?:[1-9]|10)$/.test(raw) || /\s/.test(raw)) {
      fail('ERR_INPUT', 'Recovery budget must be an exact whole number from 1 to 10; no spaces or numeric coercion.', 'budget');
    }
    return Number(raw);
  }
  function currentRun(state) {
    return state.current === null ? null : state.runs[state.current - 1];
  }
  function phaseGuard(run, action, allowed) {
    if (!run || !allowed.includes(run.phase)) {
      fail('ERR_PHASE', `Safe hold: ${action} requires ${allowed.join(' or ')}; current phase is ${run ? run.phase : 'idle'}.`);
    }
  }
  function event(run, type, observation) {
    return [...run.events, { sequence: run.events.length + 1, type, observation }];
  }
  function initialExecutions() {
    return [
      { id: 'EX-old-queue', trigger: 'Queue', slot: 'old-v1', status: 'active', checkpoint: '2 / 3', acknowledgment: 'not observed' },
      { id: 'EX-old-http', trigger: 'HTTP', slot: 'old-v1', status: 'active', checkpoint: 'none', acknowledgment: 'unknown' },
    ];
  }
  function transitionJourneys() {
    return [
      { id: 'J-queue', execution: 'EX-old-queue', destination: 'old-v1', outcome: 'interrupted', elapsed: 14, budget: JOURNEY_BUDGET, reason: 'Original client timeout; replay cannot undo it.' },
      { id: 'J-http', execution: 'EX-old-http', destination: 'old-v1', outcome: 'unknown', elapsed: null, budget: JOURNEY_BUDGET, reason: 'Started execution has no completion/effect receipt.' },
      { id: 'J-candidate', execution: 'EX-candidate-http', destination: 'candidate-v2', outcome: 'uninterrupted', elapsed: 2, budget: JOURNEY_BUDGET, reason: 'Declared transition client observed candidate v2.' },
    ];
  }
  function inspect(run) {
    const journeys = run ? run.journeys : [];
    const counts = {
      attempted: journeys.length,
      uninterrupted: journeys.filter((journey) => journey.outcome === 'uninterrupted').length,
      interrupted: journeys.filter((journey) => journey.outcome === 'interrupted').length,
      unknown: journeys.filter((journey) => journey.outcome === 'unknown').length,
    };
    const unsupported = !!run && !!run.swap && run.swap.status === 'unsupported';
    const effects = run && run.queue ? run.queue.effects : 0;
    let verification = 'NOT CHECKED';
    if (run && (run.phase === 'reviewed' || run.reset)) {
      if (unsupported) verification = 'UNSUPPORTED — no slot swap or journey exposure';
      else if (!run.replay) verification = 'NOT CHECKED — reset before full observation';
      else if (run.replay.status === 'unverified') verification = 'UNVERIFIED — bounded replay has no completion receipt';
      else if (effects !== 1) verification = 'FAIL — duplicate queue business effect';
      else verification = 'PASS — expected interruption and safe queue replay observed';
    }
    return {
      phase: run ? run.phase : 'idle',
      counts,
      uninterruptedRate: counts.attempted ? counts.uninterrupted / counts.attempted : null,
      verification,
      impact: counts.attempted ? 'Interrupted transition; unknown started journey retained' : 'No transition journeys started',
      swap: run && run.swap ? run.swap.status : 'unobserved',
      probe: run && run.probe ? 'HTTP 200 from candidate-v2 (probe only)' : 'unobserved',
      recovery: run && run.replay ? run.replay.status : 'unobserved',
      knownQueueEffects: effects,
      duplicateEffects: Math.max(0, effects - 1),
      unknownHttpEffects: run && run.host === 'supporting-slots' ? 'unknown; not reconciled by queue replay' : 'not observed',
      originalExecutions: run ? run.executions : [],
      replayedExecution: run ? run.replayedExecution : null,
      queue: run ? run.queue : null,
      journeys,
      zeroDowntime: false,
      nativeVerified: false,
      sourceParentComplete: false,
      cleanup: 'N/A — in-memory teaching data only; reset retains history',
    };
  }
  function createState() {
    return issue({ runs: [], current: null });
  }
  function send(state, command) {
    stateGuard(state);
    if (!command || Object.getPrototypeOf(command) !== Object.prototype) {
      fail('ERR_INPUT', 'A command must be a plain object with exact data fields.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(command, 'type');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof command.type !== 'string') {
      fail('ERR_INPUT', 'Action type must be an exact string data field.');
    }
    const type = command.type;
    if (!['begin', 'swap', 'probe', 'replay', 'evaluate', 'reset'].includes(type)) {
      fail('ERR_INPUT', 'Unknown lesson action; no command was executed.');
    }
    exact(command, type === 'begin' ? ['type', 'host', 'policy', 'budget', 'consent'] : ['type']);
    const runs = [...state.runs];
    let run = currentRun(state);
    if (type === 'begin') {
      if (typeof command.host !== 'string' || !Object.hasOwn(hosts, command.host)) {
        fail('ERR_INPUT', 'Select an exact fictional hosting category.', 'host');
      }
      if (typeof command.policy !== 'string' || !Object.hasOwn(policies, command.policy)) {
        fail('ERR_INPUT', 'Select an exact fixed replay policy.', 'policy');
      }
      if (!Number.isInteger(command.budget) || command.budget < 1 || command.budget > 10) {
        fail('ERR_INPUT', 'Recovery budget must be a typed integer from 1 to 10.', 'budget');
      }
      if (command.consent !== true) {
        fail('ERR_INPUT', 'Confirm that this is fixed fictional DATA ONLY; consent must be literal true.', 'consent');
      }
      if (run) fail('ERR_PHASE', 'Reset the current rehearsal before beginning another; its evidence will be retained.');
      if (runs.length >= MAX_RUNS) fail('ERR_BOUND', 'Six-run session bound reached. History is not pruned. Reload deliberately starts a fresh in-memory session.');
      const supported = command.host === 'supporting-slots';
      run = {
        id: runs.length + 1, host: command.host, policy: command.policy, budget: command.budget,
        phase: 'prepared', reset: false, events: [], swap: null, probe: null, replay: null,
        executions: supported ? initialExecutions() : [], journeys: [], replayedExecution: null,
        queue: supported ? { checkpoint: 2, total: 3, effects: 1, acknowledgment: 'not observed' } : null,
      };
      run.events = event(run, type, { host: command.host, policy: command.policy, budget: command.budget, journeyBudget: JOURNEY_BUDGET });
      runs.push(run);
      return issue({ runs, current: run.id });
    }
    if (type === 'reset') {
      phaseGuard(run, type, ['prepared', 'swapped', 'probed', 'replayed', 'reviewed', 'unsupported']);
      run = { ...run, reset: true, events: event(run, type, { retained: true }) };
      runs[run.id - 1] = run;
      return issue({ runs, current: null });
    }
    const allowed = {
      swap: ['prepared'], probe: ['swapped'], replay: ['probed'], evaluate: ['replayed', 'unsupported'],
    };
    phaseGuard(run, type, allowed[type]);
    run = { ...run };
    let observation;
    if (type === 'swap') {
      if (run.host !== 'supporting-slots') {
        run.phase = 'unsupported';
        run.swap = {
          status: 'unsupported',
          reason: run.host === 'flex-no-slots' ? 'Flex Consumption does not support slots.' : 'Functions on Container Apps uses revisions, not slots.',
        };
      } else {
        run.phase = 'swapped';
        run.swap = { status: 'successful', newTriggers: 'candidate-v2', retainedSlot: 'old-v1', addedCompute: 0 };
        run.executions = [
          { ...run.executions[0], status: 'terminated', acknowledgment: 'lost' },
          { ...run.executions[1], status: 'unknown' },
          { id: 'EX-candidate-http', trigger: 'HTTP', slot: 'candidate-v2', status: 'completed', checkpoint: 'none', acknowledgment: 'response observed' },
        ];
        run.queue = { ...run.queue, acknowledgment: 'lost' };
        run.journeys = transitionJourneys();
      }
      observation = { swap: run.swap, executions: run.executions, journeys: run.journeys };
    } else if (type === 'probe') {
      run.phase = 'probed';
      run.probe = { status: 200, destination: 'candidate-v2', countedAsJourney: false, executionRecoveryVerified: false };
      observation = run.probe;
    } else if (type === 'replay') {
      const completed = run.budget >= REPLAY_COST;
      run.phase = 'replayed';
      run.queue = {
        ...run.queue,
        checkpoint: completed ? 3 : 2,
        acknowledgment: completed ? 'observed on replay only' : 'not observed within replay budget',
        effects: run.queue.effects + (completed && run.policy === 'blind-replay' ? 1 : 0),
      };
      run.replay = {
        status: completed ? 'completed' : 'unverified',
        policy: run.policy, fromCheckpoint: 2, requiredTicks: REPLAY_COST,
        budget: run.budget, observedTicks: completed ? REPLAY_COST : run.budget,
        acknowledgmentObserved: completed, originalInterruptionErased: false,
        httpReplay: 'not provided; HTTP retry and unknown completion require separate evidence',
      };
      run.replayedExecution = {
        id: 'EX-replay-queue', original: 'EX-old-queue', trigger: 'Queue', slot: 'candidate-v2',
        status: completed ? 'completed' : 'unknown', checkpoint: `${run.queue.checkpoint} / 3`,
        acknowledgment: run.queue.acknowledgment,
      };
      observation = { replay: run.replay, execution: run.replayedExecution, queue: run.queue };
    } else {
      run.phase = 'reviewed';
      observation = inspect(run);
    }
    run.events = event(run, type, observation);
    runs[run.id - 1] = run;
    return issue({ runs, current: run.id });
  }
  function assess(state) {
    stateGuard(state);
    return freeze(inspect(currentRun(state)));
  }
  const api = Object.freeze({
    createState, send, assess, parseBudget, hosts, policies, MAX_RUNS, REPLAY_COST, JOURNEY_BUDGET,
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S129Lesson = api;
})(typeof globalThis === 'object' ? globalThis : this);
