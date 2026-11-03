(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BacklogSurge = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    burstSize: 6, addedWorkers: 1, scheduling: 'keyed', deadline: 5, evidence: 'complete',
  });
  const MAX_HISTORY = 6;
  const CHOICES = Object.freeze({
    burstSize: Object.freeze([6, 12]),
    addedWorkers: Object.freeze([0, 1, 2]),
    scheduling: Object.freeze(['keyed', 'parallel']),
    deadline: Object.freeze([4, 5, 10, 16]),
    evidence: Object.freeze(['complete', 'gap']),
  });
  function invalid(message, field) {
    const error = new RangeError(`Invalid ${message}`);
    if (field) error.field = field;
    return error;
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function validateConfig(input) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== Object.keys(CHOICES).length) {
      throw invalid('configuration: supply exactly the five declared own fields.');
    }
    const config = {};
    for (const [field, values] of Object.entries(CHOICES)) {
      const property = Object.getOwnPropertyDescriptor(input, field);
      if (!property || !Object.hasOwn(property, 'value') || !property.enumerable
          || !values.includes(property.value)) {
        throw invalid(`${field}: choose a declared value.`, field);
      }
      config[field] = property.value;
    }
    return freeze(config);
  }
  function makeJobs(config) {
    const jobs = [];
    for (let sequence = 1; sequence <= config.burstSize / 2; sequence += 1) {
      for (const key of ['A', 'B']) {
        jobs.push({
          id: `${key}${sequence}`, key, sequence, arrivalTick: 0,
          serviceTicks: sequence === 1 ? 3 : 1,
          startTick: null, completionTick: null, completionOrdinal: null,
          deadline: config.deadline, ordered: null, onTime: null, outcome: 'PENDING',
        });
      }
    }
    return jobs;
  }
  function summarize(jobs, observationTick) {
    const count = (predicate) => jobs.filter(predicate).length;
    const success = count((job) => job.outcome === 'PASS');
    const failure = count((job) => job.outcome === 'FAIL');
    const unknown = count((job) => job.outcome === 'UNKNOWN');
    const completed = count((job) => job.completionTick !== null);
    return {
      outcome: failure ? 'FAIL' : unknown ? 'UNKNOWN' : 'PASS',
      success, failure, unknown, completed,
      overdue: count((job) => job.onTime === false),
      orderingViolations: count((job) => job.ordered === false),
      total: jobs.length, observedBacklog: jobs.length - completed,
      throughput: Number((completed / observationTick).toFixed(2)),
    };
  }
  function runScenario(input) {
    const config = validateConfig(input);
    const jobs = makeJobs(config);
    const consumers = 1 + config.addedWorkers;
    const workers = Array(consumers).fill(null);
    const queue = [...jobs];
    const trace = [
      { type: 'burst', tick: 0, jobs: config.burstSize },
      { type: 'expand', tick: 0, consumers },
    ];
    let completed = 0;
    let observationTick = 0;
    for (let tick = 0; tick <= 16; tick += 1) {
      for (let worker = 0; worker < consumers; worker += 1) {
        const job = workers[worker];
        if (job && job.completionTick === tick) {
          completed += 1;
          job.completionOrdinal = completed;
          trace.push({
            type: 'complete', tick, worker, jobId: job.id, key: job.key, sequence: job.sequence,
          });
          workers[worker] = null;
        }
      }
      if (completed === jobs.length) {
        observationTick = tick;
        break;
      }
      for (let worker = 0; worker < consumers; worker += 1) {
        if (workers[worker]) continue;
        const candidate = queue.findIndex((job) => config.scheduling === 'parallel'
          || !workers.some((active) => active && active.key === job.key));
        if (candidate < 0) continue;
        const [job] = queue.splice(candidate, 1);
        job.startTick = tick;
        job.completionTick = tick + job.serviceTicks;
        workers[worker] = job;
        trace.push({
          type: 'start', tick, worker, jobId: job.id, key: job.key, sequence: job.sequence,
        });
      }
    }
    if (completed !== jobs.length || observationTick === 0) {
      throw new Error('Synthetic scheduler exceeded its declared 16-tick bound.');
    }
    const hiddenId = config.evidence === 'gap' ? jobs.at(-1).id : null;
    const observedTrace = trace.filter((event) => !(event.type === 'complete' && event.jobId === hiddenId));
    if (hiddenId) {
      observedTrace.push({ type: 'evidence-gap', tick: observationTick, jobId: hiddenId });
    }
    const observations = jobs.map((job) => {
      const completionTick = job.id === hiddenId ? null : job.completionTick;
      const completionOrdinal = job.id === hiddenId ? null : job.completionOrdinal;
      const predecessors = jobs.filter((prior) => prior.key === job.key && prior.sequence < job.sequence);
      const ordered = completionTick === null || predecessors.some((prior) => prior.id === hiddenId)
        ? null : predecessors.every((prior) => prior.completionOrdinal < completionOrdinal);
      const onTime = completionTick === null ? null : completionTick <= config.deadline;
      const outcome = ordered === false || onTime === false ? 'FAIL'
        : ordered === null || onTime === null ? 'UNKNOWN' : 'PASS';
      return { ...job, completionTick, completionOrdinal, ordered, onTime, outcome };
    });
    return freeze({
      config, jobs: observations, trace: observedTrace, observationTick, consumers,
      result: summarize(observations, observationTick),
    });
  }
  function idle(history = []) {
    return freeze({
      phase: 'idle', config: null, jobs: [], trace: [], result: null,
      observationTick: 0, consumers: 1, history,
    });
  }
  function createSession() {
    let state = idle();
    const phases = {
      burst: 'idle', expand: 'burst', drain: 'expanded',
      verify: 'drained', check: 'verified', next: 'recorded',
    };
    function dispatch(action, payload) {
      if (arguments.length > 2 || typeof action !== 'string'
          || (action !== 'reset' && !Object.hasOwn(phases, action))) {
        throw invalid('action: choose the next declared step.');
      }
      if (!['burst', 'check'].includes(action) && payload !== undefined) {
        throw invalid(`${action} payload: this action takes no input.`);
      }
      if (action !== 'reset' && phases[action] !== state.phase) {
        throw invalid(`state: ${action} is not available during ${state.phase}.`);
      }
      let next;
      switch (action) {
        case 'reset':
          next = idle();
          break;
        case 'burst': {
          if (state.history.length >= MAX_HISTORY) throw invalid('state: reset after six retained attempts.');
          const config = validateConfig(payload);
          next = {
            ...state, config, phase: 'burst', jobs: makeJobs(config),
            trace: [{ type: 'burst', tick: 0, jobs: config.burstSize }],
          };
          break;
        }
        case 'expand':
          next = {
            ...state, phase: 'expanded', consumers: 1 + state.config.addedWorkers,
            trace: [...state.trace, { type: 'expand', tick: 0, consumers: 1 + state.config.addedWorkers }],
          };
          break;
        case 'drain': {
          const run = runScenario(state.config);
          next = {
            ...state, phase: 'drained', jobs: run.jobs, trace: run.trace,
            observationTick: run.observationTick,
          };
          break;
        }
        case 'verify':
          next = { ...state, phase: 'verified', result: summarize(state.jobs, state.observationTick) };
          break;
        case 'check': {
          if (!['PASS', 'FAIL', 'UNKNOWN'].includes(payload)) {
            throw invalid('prediction: choose PASS, FAIL or UNKNOWN.', 'prediction');
          }
          const record = {
            attempt: state.history.length + 1, config: state.config, jobs: state.jobs,
            trace: state.trace, observationTick: state.observationTick, consumers: state.consumers,
            result: state.result, prediction: payload, predictionCorrect: payload === state.result.outcome,
          };
          next = { ...state, phase: 'recorded', history: [...state.history, record] };
          break;
        }
        case 'next':
          if (state.history.length >= MAX_HISTORY) throw invalid('state: six retained attempts; reset explicitly.');
          next = idle(state.history);
          break;
        default:
          throw invalid('action.');
      }
      state = freeze(next);
      return state;
    }
    return Object.freeze({ snapshot: () => state, dispatch });
  }
  return Object.freeze({ DEFAULTS, CHOICES, MAX_HISTORY, validateConfig, createSession, runScenario });
}));
