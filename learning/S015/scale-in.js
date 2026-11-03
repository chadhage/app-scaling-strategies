(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScaleInLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    mechanism: 'drain', condition: 'healthy', requestTicks: 2,
    jobTicks: 4, drainBudget: 5, workBudget: 6
  });
  const LIMITS = Object.freeze({ ticks: 12, actions: 48, probes: 8, archives: 4 });
  const issued = new WeakSet();
  const actions = new Set([
    'start', 'close-admission', 'checkpoint', 'advance', 'probe',
    'retire', 'force-retire', 'verify', 'reset'
  ]);
  const clone = (value) => structuredClone(value);

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function baseline(run = 1, archives = []) {
    return {
      schemaVersion: 1, run, phase: 'IDLE', config: null, tick: 0,
      admission: 'OPEN', closedAt: null, retiring: 'ACTIVE', retiredAt: null,
      actualCapacity: 2, work: [], probes: [], events: [], archives,
      drainExceeded: false, invalid: false, limited: false, forced: false,
      lastAction: { action: 'none', verdict: 'NOT_RUN', reason: 'Start a synthetic rehearsal.' },
      metrics: {
        attempted: 0, succeeded: 0, failed: 0, unknown: 0, pending: 0,
        observedSuccessRate: null, newToRetiring: 0, rejectedToRetiring: 0
      },
      assertions: [],
      result: { verifier: 'NOT_RUN', workOutcome: 'NOT_RUN', nativeOutcome: 'UNVERIFIED', cleanup: 'N/A' }
    };
  }

  function seal(state) {
    freeze(state);
    issued.add(state);
    return state;
  }

  function createRehearsal() { return seal(baseline()); }

  function exactRecord(value, keys) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(descriptors).length === keys.length
      && keys.every((key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value'));
  }

  function validConfig(value) {
    if (!exactRecord(value, Object.keys(DEFAULTS))) return false;
    if (!['drain', 'checkpoint', 'opaque'].includes(value.mechanism)
        || !['healthy', 'checkpoint-missing', 'stale-routing', 'missing-completion',
          'retirement-unobserved'].includes(value.condition)) return false;
    if (value.condition === 'checkpoint-missing' && value.mechanism !== 'checkpoint') return false;
    return [['requestTicks', 8], ['jobTicks', 8], ['drainBudget', 10], ['workBudget', 12]]
      .every(([key, max]) => Number.isInteger(value[key]) && value[key] >= 1 && value[key] <= max);
  }

  function update(state) {
    if (state.phase === 'IDLE') {
      state.result.verifier = state.invalid ? 'INVALID' : 'NOT_RUN';
      return;
    }
    const metrics = {
      attempted: state.work.length, succeeded: 0, failed: 0, unknown: 0, pending: 0,
      observedSuccessRate: null,
      newToRetiring: state.probes.filter((probe) => probe.violation && probe.accepted === true).length,
      rejectedToRetiring: state.probes.filter((probe) => probe.violation && probe.accepted === false).length
    };
    for (const item of state.work) {
      if (item.lifecycle === 'LOST' || item.missedBudget
          || (item.completedAt !== null && item.completedAt > item.deadline)) item.outcome = 'FAILED';
      else if (item.lifecycle === 'COMPLETED') item.outcome = 'SUCCEEDED';
      else if (item.lifecycle === 'UNOBSERVED') item.outcome = 'UNKNOWN';
      else item.outcome = 'PENDING';
      metrics[{ SUCCEEDED: 'succeeded', FAILED: 'failed', UNKNOWN: 'unknown', PENDING: 'pending' }[item.outcome]]++;
    }
    if (!metrics.pending) metrics.observedSuccessRate = metrics.succeeded / metrics.attempted * 100;
    state.metrics = metrics;
    const active = state.work.some((item) => item.lifecycle === 'ACTIVE');
    const unobserved = state.work.some((item) => item.lifecycle === 'UNOBSERVED');
    const lost = state.work.some((item) => item.lifecycle === 'LOST');
    const budgetFailure = state.work.some((item) => item.missedBudget
      || (item.completedAt !== null && item.completedAt > item.deadline));
    const job = state.work.find((item) => item.kind === 'job');
    const afterRetirement = state.probes.some((probe) => probe.afterRetirement
      && probe.owner === 'retained-B' && probe.accepted === true);
    const assertion = (name, verdict, detail) => ({ name, verdict, detail });
    state.assertions = [
      assertion('Admitted work continuity', metrics.failed ? 'FAIL' : metrics.unknown ? 'UNKNOWN'
        : metrics.pending ? 'PENDING' : 'PASS', 'The original request and job remain in the denominator.'),
      assertion('Original work budgets', budgetFailure || lost ? 'FAIL' : unobserved ? 'UNKNOWN'
        : active ? 'PENDING' : 'PASS', 'Deadlines are measured from tick 0, never from a retry or checkpoint.'),
      assertion('Completion evidence', unobserved ? 'UNKNOWN' : lost ? 'FAIL' : active ? 'PENDING' : 'PASS',
        'Missing proof is separate from known interruption.'),
      assertion('Actual capacity retirement', state.retiring === 'RETIRED' ? 'PASS'
        : state.retiring === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING', 'Requested retirement is not observed retirement.'),
      assertion('New admission routing', state.probes.some((probe) => probe.violation) ? 'FAIL'
        : state.admission === 'UNKNOWN' ? 'UNKNOWN' : afterRetirement ? 'PASS' : 'PENDING',
      'A fresh probe after retirement must reach retained-B; probes are not completed user journeys.'),
      assertion('Drain budget', state.drainExceeded ? 'FAIL' : state.retiring === 'RETIRED'
        ? (state.closedAt !== null && state.retiredAt - state.closedAt <= state.config.drainBudget ? 'PASS' : 'FAIL')
        : state.retiring === 'UNKNOWN' || state.admission === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING',
      'The drain clock starts at the closure action; late retirement is refused.'),
      assertion('Job business effect', job.lifecycle === 'COMPLETED' && job.effects === 1 ? 'PASS'
        : job.lifecycle === 'LOST' ? 'FAIL' : job.lifecycle === 'UNOBSERVED' ? 'UNKNOWN' : 'PENDING',
      `Observed job effects: ${job.effects}; required exactly one.`),
      assertion('Continuation ownership', job.owner === 'retained-B'
        ? (job.checkpoint && job.checkpoint.durable && job.checkpoint.epoch === 2 ? 'PASS' : 'FAIL')
        : job.lifecycle === 'ACTIVE' && job.checkpointProof === 'UNKNOWN' ? 'UNKNOWN' : 'PASS',
      'Only the declared durable job checkpoint transfers ownership; requests never relocate.'),
      assertion('Safe retirement protocol', state.forced ? 'FAIL' : state.admission === 'CLOSED' ? 'PASS'
        : state.admission === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING',
      'An explicit terminate-now fault is not a successful safe scale-in.')
    ];
    const failure = state.assertions.some((item) => item.verdict === 'FAIL');
    state.result = {
      verifier: failure ? 'FAIL' : state.invalid ? 'INVALID' : state.limited ? 'UNKNOWN'
        : state.assertions.every((item) => item.verdict === 'PASS') ? 'PASS' : 'UNKNOWN',
      workOutcome: metrics.failed ? 'INTERRUPTED' : metrics.unknown ? 'UNKNOWN'
        : metrics.pending ? 'IN_PROGRESS' : 'SUCCESS',
      nativeOutcome: 'UNVERIFIED',
      cleanup: state.retiring === 'RETIRED' ? 'SYNTHETIC_1_RETAINED'
        : state.retiring === 'UNKNOWN' ? 'SYNTHETIC_CAPACITY_UNKNOWN' : 'SYNTHETIC_2_RETAINED'
    };
  }

  function finish(state, action, verdict, reason, record = true) {
    state.invalid = verdict === 'INVALID';
    state.limited = verdict === 'LIMIT';
    state.lastAction = { action: actions.has(action) ? action : 'invalid-action', verdict, reason };
    update(state);
    if (action === 'verify' && verdict !== 'INVALID' && verdict !== 'BLOCKED' && verdict !== 'LIMIT') {
      state.lastAction.verdict = state.result.verifier;
      state.lastAction.reason = `Synthetic verification ${state.result.verifier}; work ${state.result.workOutcome}; native outcome UNVERIFIED.`;
    }
    if (record && state.events.length < LIMITS.actions) {
      state.events.push({
        sequence: state.events.length + 1, tick: state.tick, ...state.lastAction,
        view: clone({
          admission: state.admission, retiring: state.retiring, actualCapacity: state.actualCapacity,
          work: state.work, metrics: state.metrics, assertions: state.assertions, result: state.result
        })
      });
    }
    return seal(state);
  }

  function retirementGate(state) {
    if (state.retiring !== 'ACTIVE') return [state.retiring === 'UNKNOWN' ? 'UNKNOWN' : 'BLOCKED', 'Retirement is already observed or remains unknown.'];
    if (state.admission === 'UNKNOWN' || state.config.mechanism === 'opaque') return ['UNKNOWN', 'Host closure and retirement support are unqualified; do not infer them.'];
    if (state.admission !== 'CLOSED') return ['BLOCKED', 'Close new admission before retirement.'];
    if (state.drainExceeded || state.tick - state.closedAt > state.config.drainBudget) return ['FAIL', 'Drain budget exceeded; keep capacity rather than discard work.'];
    if (state.probes.some((probe) => probe.violation)) return ['FAIL', 'Stale routing was observed; safe retirement is refused.'];
    const owned = state.work.filter((item) => item.owner === 'retiring-A');
    if (owned.some((item) => item.lifecycle === 'ACTIVE')) return ['BLOCKED', 'Already-admitted work is still active on retiring-A.'];
    if (owned.some((item) => item.lifecycle === 'UNOBSERVED')) return ['UNKNOWN', 'Completion proof is missing; hold retirement.'];
    if (!state.probes.some((probe) => probe.afterClosure && probe.owner === 'retained-B'
        && probe.accepted === true)) return ['BLOCKED', 'Probe fresh admission after closure before retirement.'];
    return null;
  }

  function transition(previous, action, payload) {
    if (!previous || !issued.has(previous)) throw new TypeError('Unrecognized rehearsal state; use createRehearsal and transition.');
    const state = clone(previous);
    if (!actions.has(action)) return finish(state, action, 'INVALID', 'Unsupported action.');
    if (action === 'start' && !validConfig(payload)) return finish(state, action, 'INVALID', 'Invalid input: exact fixture fields, supported choices, and bounded integers are required.');
    if (action === 'force-retire' && (!exactRecord(payload, ['confirmed']) || payload.confirmed !== true)) {
      return finish(state, action, 'INVALID', 'Explicit confirmation is required for the synthetic terminate-now fault.');
    }
    if (!['start', 'force-retire'].includes(action) && payload !== undefined) {
      return finish(state, action, 'INVALID', 'Unexpected action payload.');
    }
    if (action === 'reset') {
      if (!state.events.length) {
        const fresh = baseline(state.run, state.archives);
        fresh.lastAction = { action, verdict: 'PASS', reason: 'Working defaults restored; session archives retained.' };
        return seal(fresh);
      }
      if (state.archives.length >= LIMITS.archives) {
        return finish(state, action, 'LIMIT', 'Archive full (4 attempts). Inspect the JSON before explicitly reloading; reset will not erase evidence.', false);
      }
      const { archives, ...record } = previous;
      const fresh = baseline(previous.run + 1, [...archives, record]);
      fresh.lastAction = { action, verdict: 'PASS', reason: 'Defaults restored; the previous attempt is retained in the session archive.' };
      return seal(fresh);
    }
    if (state.events.length >= LIMITS.actions) {
      return finish(state, action, 'LIMIT', 'Action history full (48). Reset to archive this attempt; existing evidence is unchanged.', false);
    }
    if (action !== 'start' && state.phase !== 'RUNNING') {
      return finish(state, action, 'BLOCKED', 'Start a bounded synthetic fixture first.');
    }
    if (action === 'start') {
      if (state.phase !== 'IDLE') return finish(state, action, 'BLOCKED', 'Reset and archive the current attempt before starting another.');
      state.phase = 'RUNNING';
      state.config = clone(payload);
      state.work = ['request', 'job'].map((kind) => ({
        id: `${kind}-1`, kind, owner: 'retiring-A', admittedAt: 0,
        duration: payload[`${kind}Ticks`], dueAt: payload[`${kind}Ticks`],
        deadline: payload.workBudget, lifecycle: 'ACTIVE', outcome: 'PENDING',
        completedAt: null, missedBudget: false, effects: 0, checkpoint: null,
        checkpointProof: 'NOT_ATTEMPTED'
      }));
      return finish(state, action, 'PASS', 'Two original work items admitted on retiring-A; retained-B is ready in this fixture.');
    }
    if (action === 'close-admission') {
      if (state.admission !== 'OPEN') return finish(state, action, 'BLOCKED', 'Closure was already requested; it is not a new drain clock.');
      state.closedAt = state.tick;
      state.admission = state.config.mechanism === 'opaque' ? 'UNKNOWN' : 'CLOSED';
      return finish(state, action, state.admission === 'UNKNOWN' ? 'UNKNOWN' : 'PASS',
        state.admission === 'UNKNOWN' ? 'Unqualified host: closure is unknown.' : 'Declared fixture closure applied; probe routing before retirement.');
    }
    if (action === 'checkpoint') {
      if (state.config.mechanism !== 'checkpoint') {
        return finish(state, action, state.config.mechanism === 'opaque' ? 'UNKNOWN' : 'BLOCKED', 'This fixture does not establish checkpoint-continuation support.');
      }
      if (state.admission !== 'CLOSED') return finish(state, action, 'BLOCKED', 'Close new admission before checkpoint ownership transfer.');
      const job = state.work[1];
      if (job.lifecycle !== 'ACTIVE' || job.owner !== 'retiring-A') return finish(state, action, 'BLOCKED', 'No active job remains on retiring-A to checkpoint.');
      if (state.config.condition === 'checkpoint-missing') {
        job.checkpointProof = 'UNKNOWN';
        return finish(state, action, 'UNKNOWN', 'Durable checkpoint proof missing; job ownership remains on retiring-A.');
      }
      job.checkpointProof = 'KNOWN';
      job.checkpoint = {
        tick: state.tick, progress: Math.min(state.tick, job.duration), durable: true,
        from: 'retiring-A', to: 'retained-B', epoch: 2
      };
      job.owner = 'retained-B';
      return finish(state, action, 'PASS', 'Durable synthetic checkpoint transferred the job to retained-B; original deadline and one-effect ledger retained.');
    }
    if (action === 'advance') {
      if (state.tick >= LIMITS.ticks) return finish(state, action, 'LIMIT', 'Logical clock limit is 12 ticks; no extra work or time is invented.');
      state.tick++;
      for (const item of state.work) {
        if (item.lifecycle !== 'ACTIVE') continue;
        if (state.tick > item.deadline) item.missedBudget = true;
        if (state.tick >= item.dueAt) {
          if (state.config.condition === 'missing-completion' && item.kind === 'request') {
            item.lifecycle = 'UNOBSERVED';
          } else {
            item.lifecycle = 'COMPLETED';
            item.completedAt = state.tick;
            item.effects = item.kind === 'job' ? 1 : 0;
          }
        }
      }
      if (state.admission === 'CLOSED' && state.retiring === 'ACTIVE'
          && state.tick - state.closedAt > state.config.drainBudget) state.drainExceeded = true;
      return finish(state, action, 'PASS', 'Advanced exactly one logical tick and observed the declared synthetic work.');
    }
    if (action === 'probe') {
      if (state.probes.length >= LIMITS.probes) return finish(state, action, 'LIMIT', 'Admission probe limit is 8; existing observations are retained.');
      const owner = state.admission === 'UNKNOWN' ? null
        : state.admission === 'OPEN' || state.config.condition === 'stale-routing' ? 'retiring-A' : 'retained-B';
      const accepted = owner === null ? null : owner === 'retained-B' || state.retiring === 'ACTIVE';
      const violation = owner === 'retiring-A' && (state.closedAt !== null || state.retiring !== 'ACTIVE');
      state.probes.push({
        id: `probe-${state.probes.length + 1}`, tick: state.tick, owner, accepted,
        afterClosure: state.closedAt !== null, afterRetirement: state.retiring === 'RETIRED',
        retirementState: state.retiring, violation
      });
      return finish(state, action, violation ? 'FAIL' : owner === null ? 'UNKNOWN' : 'PASS',
        violation ? 'Fresh routing still targets retiring-A; unintended admission or rejected stale routing is recorded.'
          : owner === null ? 'Fresh admission target is unobserved.' : `Fresh admission probe reached ${owner}; this is not a completed user journey.`);
    }
    if (action === 'retire') {
      const gate = retirementGate(state);
      if (gate) return finish(state, action, ...gate);
      if (state.config.condition === 'retirement-unobserved') {
        state.retiring = 'UNKNOWN';
        state.actualCapacity = null;
        return finish(state, action, 'UNKNOWN', 'Retirement requested but not observed; actual capacity is unknown, not one.');
      }
      state.retiring = 'RETIRED';
      state.retiredAt = state.tick;
      state.actualCapacity = 1;
      return finish(state, action, 'PASS', 'Observed synthetic retirement: actual capacity 2 -> 1. Continued work on retained-B may still be pending.');
    }
    if (action === 'force-retire') {
      if (state.config.mechanism === 'opaque') return finish(state, action, 'UNKNOWN', 'Unqualified host: do not fabricate termination or lost work.');
      if (state.retiring !== 'ACTIVE') return finish(state, action, 'BLOCKED', 'Known active retiring capacity is required for this fault.');
      state.retiring = 'RETIRED';
      state.actualCapacity = 1;
      state.retiredAt = state.tick;
      state.forced = true;
      for (const item of state.work) {
        if (item.owner === 'retiring-A' && item.lifecycle === 'ACTIVE') item.lifecycle = 'LOST';
      }
      return finish(state, action, 'FAIL', 'Explicit synthetic unsafe termination; known active work on retiring-A is lost, not silently retried.');
    }
    return finish(state, action, 'UNKNOWN', 'Evaluate the recorded synthetic assertions.');
  }
  return Object.freeze({ DEFAULTS, LIMITS, createRehearsal, transition });
}));
