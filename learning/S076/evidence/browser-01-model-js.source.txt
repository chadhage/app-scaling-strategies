'use strict';

(function expose(root) {
  const DEFAULTS = Object.freeze({
    mode: 'finish', leaseTicks: 5, graceTicks: 6, workBudget: 8, condition: 'complete'
  });
  const LIMITS = Object.freeze({ units: 4, ticks: 12, events: 40, archives: 4, renewals: 4 });
  const issued = new WeakSet();
  const actions = new Set([
    'start', 'begin-scale-in', 'tick', 'renew', 'checkpoint', 'release',
    'claim', 'retire', 'force-stop', 'verify', 'reset'
  ]);
  const conditions = [
    'complete', 'checkpoint-missing', 'ownership-unknown',
    'completion-unknown', 'renew-denied', 'retirement-unknown'
  ];

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function publish(state) {
    freeze(state);
    issued.add(state);
    return state;
  }

  function blank(attempt = 1, history = []) {
    return {
      attempt, phase: 'IDLE', config: null, clock: 0, admission: 'OPEN',
      drainDeadline: null, actualConsumers: 2, retirement: 'NOT_REQUESTED',
      job: null, renewals: 0, violations: [], events: [], history,
      lastAction: null,
      metrics: { attempted: 0, succeeded: 0, failed: 0, unknown: 0, pending: 0, effects: 0 },
      result: { verifier: 'NOT_RUN', workOutcome: 'NOT_STARTED', cleanup: 'NO_RESOURCES', reason: 'No attempt started.' }
    };
  }

  function createSession() {
    return publish(blank());
  }

  function exactRecord(value, keys, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || !keys.every((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
        })) {
      throw new TypeError(`${label} must be an exact plain data record: ${keys.join(', ')}.`);
    }
  }

  function configuration(value) {
    exactRecord(value, Object.keys(DEFAULTS), 'Configuration');
    if (!['finish', 'renew', 'release'].includes(value.mode)) throw new TypeError('Unsupported mode.');
    if (!conditions.includes(value.condition)) throw new TypeError('Unsupported condition.');
    for (const [key, maximum] of [['leaseTicks', 6], ['graceTicks', 8], ['workBudget', 12]]) {
      if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key])
          || value[key] < 1 || value[key] > maximum) {
        throw new RangeError(`${key} must be an integer from 1 to ${maximum}.`);
      }
    }
    return { ...value };
  }

  function violation(state, name) {
    if (!state.violations.includes(name)) state.violations.push(name);
  }

  function evaluate(state) {
    const job = state.job;
    state.metrics = {
      attempted: job ? 1 : 0,
      succeeded: Number(job?.status === 'SUCCEEDED'),
      failed: Number(job?.status === 'FAILED'),
      unknown: Number(job?.status === 'UNKNOWN'),
      pending: Number(job?.status === 'PENDING'),
      effects: job ? job.effects : 0
    };
    const workOutcome = !job ? 'NOT_STARTED' : {
      PENDING: 'PENDING', SUCCEEDED: 'SUCCESS', FAILED: 'FAILURE', UNKNOWN: 'UNKNOWN'
    }[job.status];
    let verifier = 'UNKNOWN';
    let reason = 'The original job or actual consumer removal is not yet fully observed.';
    if (!job) {
      verifier = 'NOT_RUN';
      reason = 'No attempt started.';
    } else if (state.violations.length || job.status === 'FAILED') {
      verifier = 'FAIL';
      reason = state.violations.join('; ') || 'The claimed job failed its declared contract.';
    } else if (job.status === 'SUCCEEDED' && job.effects === 1 && state.retirement === 'OBSERVED') {
      verifier = 'PASS';
      reason = 'One original job finished exactly once under valid ownership; retiring consumer removal was observed.';
    } else if (job.status === 'UNKNOWN' || state.retirement === 'UNVERIFIED') {
      reason = 'Required completion, ownership or retirement observation is unavailable.';
    }
    state.result = { verifier, workOutcome, cleanup: 'NO_RESOURCES', reason };
  }

  function record(state, action, verdict, detail) {
    evaluate(state);
    if (verdict === 'BLOCKED' && state.result.verifier === 'PASS') {
      state.result.verifier = 'UNKNOWN';
      state.result.reason = 'Action blocked; retained successful observations require a fresh verification.';
    }
    state.lastAction = { action, verdict, detail };
    state.events.push({
      sequence: state.events.length + 1, tick: state.clock, action, verdict, detail,
      owner: state.job?.owner ?? null, epoch: state.job?.epoch ?? null,
      progress: state.job?.progress ?? null, checkpoint: state.job?.checkpoint ?? null,
      leaseUntil: state.job?.leaseUntil ?? null, actualConsumers: state.actualConsumers,
      jobOutcome: state.job?.status ?? 'NOT_STARTED', verifier: state.result.verifier
    });
    return publish(state);
  }

  function advance(state) {
    state.clock++;
    const job = state.job;
    if (state.drainDeadline !== null && state.clock > state.drainDeadline
        && state.retirement !== 'OBSERVED') violation(state, 'shutdown-grace-exceeded');
    if (job.status !== 'PENDING') return;
    if (state.clock > job.deadline) {
      job.status = 'FAILED';
      violation(state, 'original-work-deadline-exceeded');
    } else if (job.owner && state.clock >= job.leaseUntil) {
      job.status = 'FAILED';
      violation(state, 'lease-expired');
    } else if (job.owner) {
      job.progress++;
      if (job.progress === LIMITS.units) {
        if (state.config.condition === 'completion-unknown') {
          job.status = 'UNKNOWN';
          job.effects = null;
        } else {
          job.status = 'SUCCEEDED';
          job.effects = 1;
          job.completedAt = state.clock;
          job.completedBy = job.owner;
          job.owner = null;
        }
      }
    }
  }

  function observeRetirement(state) {
    if (state.config.condition === 'retirement-unknown') {
      state.retirement = 'UNVERIFIED';
      state.actualConsumers = null;
    } else {
      state.retirement = 'OBSERVED';
      state.actualConsumers = 1;
      state.phase = 'RETIRED';
    }
  }

  function step(previous, action, payload) {
    if (!previous || !issued.has(previous)) throw new TypeError('An issued state is required.');
    if (typeof action !== 'string' || !actions.has(action)) throw new TypeError('Unsupported action.');
    let config;
    if (action === 'start') config = configuration(payload);
    else if (action === 'force-stop') {
      exactRecord(payload, ['confirmed'], 'Fault consent');
      if (typeof payload.confirmed !== 'boolean') throw new TypeError('Fault consent must be boolean.');
    } else if (payload !== undefined) throw new TypeError('This action accepts no payload.');

    if (action === 'reset' && previous.history.length < LIMITS.archives) {
      const history = structuredClone(previous.history);
      const nonempty = previous.events.length > 0 || previous.phase !== 'IDLE';
      if (nonempty) {
        const { history: ignored, ...attempt } = structuredClone(previous);
        history.push(attempt);
      }
      return publish(blank(previous.attempt + Number(nonempty), history));
    }
    if (previous.events.length >= LIMITS.events) {
      throw new RangeError('Action history limit reached; archive-preserving reset or explicit reload required.');
    }
    const state = structuredClone(previous);
    const blocked = (detail) => record(state, action, 'BLOCKED', detail);
    const applied = (detail) => record(state, action, 'APPLIED', detail);
    const unknown = (detail) => record(state, action, 'UNKNOWN', detail);
    const job = state.job;
    const drainingOwner = () => state.phase === 'DRAINING' && state.admission === 'CLOSED'
      && job?.owner === 'consumer-A' && job.status === 'PENDING' && state.clock < job.leaseUntil;

    switch (action) {
      case 'start':
        if (state.phase !== 'IDLE') return blocked('Reset before starting another attempt.');
        state.config = config;
        state.phase = 'ACTIVE';
        state.job = {
          id: 'job-076', units: LIMITS.units, owner: 'consumer-A', epoch: 1,
          progress: 0, checkpoint: 0, checkpointAcknowledged: false, released: false,
          leaseUntil: config.leaseTicks, deadline: config.workBudget,
          status: 'PENDING', effects: 0, completedAt: null, completedBy: null
        };
        return applied('One four-unit synthetic job claimed by consumer-A at tick 0.');
      case 'begin-scale-in':
        if (state.phase !== 'ACTIVE') return blocked('Start once before closing admission.');
        state.admission = 'CLOSED';
        state.phase = 'DRAINING';
        state.drainDeadline = state.clock + state.config.graceTicks;
        return applied('Admission to A closed; shutdown grace starts now, not a new job deadline.');
      case 'tick':
        if (state.phase === 'IDLE') return blocked('Start the claimed-work fixture first.');
        if (state.clock >= LIMITS.ticks) return blocked('Logical clock limit is 12 ticks.');
        advance(state);
        return applied('Advanced one logical tick; only a valid current owner can process a unit.');
      case 'renew':
        if (state.config?.mode !== 'renew' || !drainingOwner()) {
          return blocked('Renew requires draining mode renew, a pending A claim and unexpired authority.');
        }
        if (state.config.condition === 'renew-denied') return blocked('Renewal denied; original lease is unchanged.');
        if (state.renewals >= LIMITS.renewals) return blocked('At most four observed renewals are allowed.');
        if (state.clock + state.config.leaseTicks <= job.leaseUntil) {
          return blocked('A repeated same-tick renewal cannot extend this lease.');
        }
        job.leaseUntil = state.clock + state.config.leaseTicks;
        state.renewals++;
        return applied('Renewal observed; original job and shutdown deadlines are unchanged.');
      case 'checkpoint':
        if (state.config?.mode !== 'release' || !drainingOwner()) {
          return blocked('Saving requires mode release and a valid draining A claim.');
        }
        if (state.config.condition === 'checkpoint-missing') return unknown('No checkpoint acknowledgement observed.');
        job.checkpoint = job.progress;
        job.checkpointAcknowledged = true;
        return applied('Current progress acknowledged as the durable synthetic checkpoint.');
      case 'release':
        if (state.config?.mode !== 'release' || !drainingOwner()) {
          return blocked('Release requires mode release and a valid draining A claim.');
        }
        if (!job.checkpointAcknowledged || job.checkpoint !== job.progress) {
          return blocked('An acknowledged checkpoint covering current progress is required.');
        }
        if (state.config.condition === 'ownership-unknown') {
          job.status = 'UNKNOWN';
          job.owner = 'UNVERIFIED';
          job.effects = null;
          return unknown('Release outcome unobserved: neither B ownership nor safe A shutdown is established.');
        }
        job.owner = null;
        job.leaseUntil = null;
        job.released = true;
        return applied('A ownership relinquished with current checkpoint; no completion is claimed.');
      case 'claim':
        if (state.config?.mode !== 'release' || !job?.released || job.owner !== null
            || job.status !== 'PENDING' || !job.checkpointAcknowledged) {
          return blocked('B can claim only a pending, observably released job with its checkpoint.');
        }
        job.owner = 'consumer-B';
        job.epoch = 2;
        job.progress = job.checkpoint;
        job.leaseUntil = state.clock + state.config.leaseTicks;
        return applied('B owns epoch 2 and resumes the same job from the acknowledged checkpoint.');
      case 'retire': {
        if (state.phase !== 'DRAINING' || state.admission !== 'CLOSED') {
          return blocked('Close admission before requesting consumer retirement.');
        }
        if (state.retirement !== 'NOT_REQUESTED') return blocked('No new retirement observation is available.');
        if (state.clock > state.drainDeadline) return blocked('Shutdown grace exceeded; retain A rather than invent safe retirement.');
        const completed = job.status === 'SUCCEEDED' && job.effects === 1;
        const relinquished = job.released && job.checkpointAcknowledged
          && job.owner !== 'consumer-A' && job.owner !== 'UNVERIFIED';
        if (!completed && !relinquished) return blocked('Finish under valid ownership or safely release a current checkpoint first.');
        observeRetirement(state);
        return state.retirement === 'OBSERVED'
          ? applied('Retiring consumer A removal observed; B work still needs its original completion proof.')
          : unknown('Retirement requested but actual consumer count is unverified.');
      }
      case 'force-stop':
        if (!payload.confirmed) return blocked('Explicit fault consent is required.');
        if (state.phase !== 'DRAINING' || job?.owner !== 'consumer-A'
            || !['PENDING', 'UNKNOWN'].includes(job.status)) {
          return blocked('This fault targets only A while it holds unresolved claimed work.');
        }
        violation(state, 'unsafe-shutdown-claimed-work');
        if (job.status === 'PENDING') job.status = 'FAILED';
        observeRetirement(state);
        return applied('Abrupt-stop fault: no valid finish or ownership/checkpoint disposition was observed.');
      case 'verify':
        return applied('Checked the retained original job, authority, deadlines and actual retirement observations.');
      case 'reset':
        return blocked('Four archives are full; inspect/copy evidence and explicitly reload instead of dropping history.');
      default:
        throw new TypeError('Unsupported action.');
    }
  }

  const api = Object.freeze({ DEFAULTS, LIMITS, createSession, step });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.S076 = api;
}(globalThis));
