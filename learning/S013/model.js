(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QueueScaleRehearsal = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    batchSize: 12, activeRequests: 12, deadlineSeconds: 20,
    metric: 'queue-depth', fault: 'none'
  });
  const RULE = Object.freeze({
    windowSeconds: 5, queueThreshold: 8, concurrencyThreshold: 6,
    itemsPerWorker: 2, warmupWindows: 1, maxWorkers: 4
  });
  const LIMITS = Object.freeze({ events: 80, queued: 120, jobs: 240, archives: 8 });

  function initial() {
    return {
      schemaVersion: 1, mode: 'synthetic-only', clockSeconds: 0,
      input: { ...DEFAULTS }, capacity: { requested: 2, lastConfirmedReady: 2, pending: null },
      batches: [], jobs: [], windows: [], transitions: [], events: [],
      lastResult: { verdict: 'NOT_RUN', message: 'No synthetic work has been observed.' }
    };
  }

  function finish(state, type, verdict, message, details = {}) {
    state.lastResult = { verdict, message };
    state.events.push({
      sequence: state.events.length + 1, atSeconds: state.clockSeconds,
      type, verdict, message, ...details
    });
    return state;
  }

  function integer(value, minimum, maximum) {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
  }

  function exactKeys(event, keys) {
    return event !== null && typeof event === 'object' && !Array.isArray(event)
      && Object.keys(event).length === keys.length
      && keys.every((key) => Object.hasOwn(event, key));
  }

  function normalize(event) {
    if (!exactKeys(event, ['type', ...Object.keys(DEFAULTS)])) {
      return { error: 'Configure requires exactly the five declared fields. Missing and unknown fields are rejected.' };
    }
    const input = {
      batchSize: integer(event.batchSize, 1, 40),
      activeRequests: integer(event.activeRequests, 0, 120),
      deadlineSeconds: integer(event.deadlineSeconds, 5, 60),
      metric: event.metric, fault: event.fault
    };
    if (Object.values(input).includes(null)) {
      return { error: 'Use strict whole numbers: batch 1–40, concurrent requests 0–120, deadline 5–60 seconds. Blank, fractional, and non-finite inputs are invalid.' };
    }
    if (!['queue-depth', 'concurrency', 'cpu-percent', 'native-unqualified'].includes(input.metric)
        || !['none', 'metric-missing', 'capacity-missing', 'provision-failure', 'completion-missing', 'worker-failure'].includes(input.fault)) {
      return { error: 'Unknown metric or observation condition. No metric support or successful observation is inferred.' };
    }
    return { input };
  }

  function support(metric) {
    if (metric === 'cpu-percent') {
      return {
        verdict: 'UNSUPPORTED',
        message: 'CPU percent is not a supported workload metric in this S013 fixture. Use queue depth or concurrency; no work or time is advanced.'
      };
    }
    if (metric === 'native-unqualified') {
      return {
        verdict: 'UNKNOWN',
        message: 'Native metric, adapter, host, and rule qualification are unverified. No native eligibility or synthetic execution is invented.'
      };
    }
    return null;
  }

  function advance(state) {
    state.clockSeconds += RULE.windowSeconds;
    const { fault, metric, activeRequests } = state.input;
    const capacityMissing = fault === 'capacity-missing';
    const metricMissing = fault === 'metric-missing' || capacityMissing;
    let decision;
    let message;
    if (state.capacity.pending && !capacityMissing) {
      const pending = state.capacity.pending;
      const transition = state.transitions.find((entry) => entry.id === pending.id);
      if (fault === 'provision-failure') {
        transition.status = 'FAILED';
        transition.failedAt = state.clockSeconds;
        state.capacity.pending = null;
        decision = 'PROVISION_FAILED';
        message = 'Provisioning failed in the synthetic observation. Requested intent remains; no added ready worker is claimed.';
      } else {
        pending.remainingWindows -= 1;
        if (pending.remainingWindows === 0) {
          state.capacity.lastConfirmedReady = pending.target;
          transition.status = 'READY';
          transition.readyAt = state.clockSeconds;
          state.capacity.pending = null;
          decision = 'READY';
          message = 'The added worker is observed ready before this boundary’s service completions. Completion deadlines still need separate evidence.';
        }
      }
    }
    const ready = state.capacity.lastConfirmedReady;
    const waiting = state.jobs.filter((job) => job.status === 'QUEUED');
    const queueDepth = metricMissing ? null : waiting.length;
    const concurrencyPerReady = metricMissing ? null : Number((activeRequests / ready).toFixed(2));
    const metricValue = metric === 'queue-depth' ? queueDepth : concurrencyPerReady;
    const threshold = metric === 'queue-depth' ? RULE.queueThreshold : RULE.concurrencyThreshold;
    if (metricMissing && !decision) {
      decision = 'UNKNOWN';
      message = capacityMissing
        ? 'Effective capacity and current queue are UNKNOWN. Last-confirmed values are historical; service and warm-up are paused, not fabricated.'
        : 'The selected workload metric is UNKNOWN, not zero. No new scale request is inferred; independent known service observations may continue.';
    } else if (!decision) {
      if (state.capacity.pending) {
        decision = 'WARMING';
        message = 'The requested worker is warming; it is not effective capacity and no duplicate request is issued.';
      } else if (metricValue < threshold) {
        decision = 'BELOW_THRESHOLD';
        message = 'Only the selected workload metric is evaluated; its observed value is below the inclusive threshold.';
      } else if (ready >= RULE.maxWorkers) {
        decision = 'AT_LIMIT';
        message = 'The selected metric breaches its threshold at the four-worker fixture ceiling. Additional capacity is not invented.';
      } else {
        const target = ready + 1;
        const id = `transition-${state.transitions.length + 1}`;
        state.capacity.requested = target;
        state.capacity.pending = { id, target, remainingWindows: RULE.warmupWindows };
        state.transitions.push({
          id, metric, metricValue, threshold, from: ready, to: target,
          requestedAt: state.clockSeconds, readyAt: null, failedAt: null, status: 'WARMING'
        });
        decision = 'SCALE_OUT_REQUESTED';
        message = `${metric} ${metricValue} meets threshold ${threshold}. One worker is requested, not yet ready.`;
      }
    }
    const selected = capacityMissing ? [] : waiting.slice(0, ready * RULE.itemsPerWorker);
    for (const [index, job] of selected.entries()) {
      job.observedAt = state.clockSeconds;
      if (fault === 'completion-missing' && index === 0) {
        job.status = 'UNKNOWN';
        job.reason = 'Missing completion observation';
      } else {
        job.worker = `worker-${index % ready + 1}`;
        if (fault === 'worker-failure' && index === 0) {
          job.status = 'FAILED';
          job.reason = 'Synthetic worker error';
        } else {
          job.completedAt = state.clockSeconds;
          job.status = job.completedAt <= job.deadlineAt ? 'ON_TIME' : 'LATE';
          job.reason = job.status === 'LATE' ? 'Original completion deadline exceeded' : null;
        }
      }
    }
    const count = (status) => selected.filter((job) => job.status === status).length;
    const observation = {
      id: `window-${state.windows.length + 1}`, atSeconds: state.clockSeconds,
      input: { ...state.input }, metric, metricValue, threshold,
      queueDepth, lastKnownQueueDepth: waiting.length,
      activeRequests: metricMissing ? null : activeRequests, concurrencyPerReady,
      requested: state.capacity.requested, readyObserved: capacityMissing ? null : ready,
      lastConfirmedReady: ready, decision, message,
      serviced: selected.length, completed: count('ON_TIME') + count('LATE'),
      onTime: count('ON_TIME'), late: count('LATE'), failed: count('FAILED'), unknown: count('UNKNOWN'),
      queueAfter: capacityMissing ? null : state.jobs.filter((job) => job.status === 'QUEUED').length
    };
    state.windows.push(observation);
    return finish(state, 'tick', decision, message, { windowId: observation.id });
  }

  function reduce(previous, event) {
    const state = JSON.parse(JSON.stringify(previous));
    if (state.events.length >= LIMITS.events) {
      state.lastResult = { verdict: 'LIMIT', message: 'The 80-command run limit was reached. Existing evidence is retained; archive/reset to continue.' };
      return state;
    }
    if (event?.type === 'configure') {
      const normalized = normalize(event);
      if (normalized.error) return finish(state, 'invalid', 'INVALID', normalized.error);
      state.input = normalized.input;
      const blocked = support(state.input.metric);
      return finish(state, 'configure', blocked?.verdict || 'CONFIGURED',
        blocked?.message || 'Inputs applied to future actions. Existing work deadlines, observations, and any warming request are unchanged.',
        { input: { ...state.input } });
    }
    if (!exactKeys(event, ['type']) || !['enqueue', 'tick'].includes(event.type)) {
      return finish(state, 'invalid', 'INVALID', 'Unknown or malformed command. Use configure, enqueue, or tick with exactly the declared fields.');
    }
    const blocked = support(state.input.metric);
    if (blocked) return finish(state, event.type, blocked.verdict, blocked.message);
    if (event.type === 'tick') return advance(state);
    const queued = state.jobs.filter((job) => job.status === 'QUEUED').length;
    if (queued + state.input.batchSize > LIMITS.queued || state.jobs.length + state.input.batchSize > LIMITS.jobs) {
      return finish(state, 'enqueue', 'LIMIT', 'Admission refused: maximum 120 queued items or 240 retained work items/run. No work history was removed.');
    }
    const batchId = `batch-${state.batches.length + 1}`;
    const deadlineAt = state.clockSeconds + state.input.deadlineSeconds;
    state.batches.push({
      id: batchId, submittedAt: state.clockSeconds, deadlineAt, input: { ...state.input }
    });
    for (let index = 0; index < state.input.batchSize; index += 1) {
      state.jobs.push({
        id: `job-${state.jobs.length + 1}`, batchId, submittedAt: state.clockSeconds,
        deadlineAt, status: 'QUEUED', completedAt: null, observedAt: null, worker: null, reason: null
      });
    }
    return finish(state, 'enqueue', 'ENQUEUED',
      `${state.input.batchSize} synthetic items admitted at ${state.clockSeconds}s with original absolute deadline ${deadlineAt}s.`,
      { batchId, admitted: state.input.batchSize, deadlineAt });
  }

  function summarize(state) {
    const counts = (status) => state.jobs.filter((job) => job.status === status).length;
    const queued = counts('QUEUED');
    const onTime = counts('ON_TIME');
    const late = counts('LATE');
    const failed = counts('FAILED');
    const unknown = counts('UNKNOWN');
    const pendingOverdue = state.jobs.filter((job) => job.status === 'QUEUED' && state.clockSeconds > job.deadlineAt).length;
    const addedWorkerCompletions = state.jobs.filter((job) => ['ON_TIME', 'LATE'].includes(job.status)
      && Number(job.worker.slice('worker-'.length)) > 2).length;
    const readyTransitions = state.transitions.filter((entry) => entry.status === 'READY').length;
    const failedTransitions = state.transitions.filter((entry) => entry.status === 'FAILED').length;
    const unknownWindows = state.windows.filter((entry) => entry.metricValue === null || entry.readyObserved === null).length;
    const blocked = support(state.input.metric);
    const workVerdict = failed ? 'FAILED'
      : late || pendingOverdue ? 'DEADLINE_MISSED'
        : unknown ? 'UNKNOWN'
          : queued ? 'PENDING' : state.jobs.length ? 'DEADLINES_MET' : 'NOT_RUN';
    let verdict;
    let message;
    if (['INVALID', 'LIMIT'].includes(state.lastResult.verdict)) {
      verdict = state.lastResult.verdict;
      message = state.lastResult.message;
    } else if (blocked) {
      ({ verdict, message } = blocked);
    } else if (failedTransitions || failed || late || pendingOverdue) {
      verdict = 'FAIL';
      message = 'Recorded provisioning failure, worker error, or original deadline miss remains in this run. Later recovery cannot erase it.';
    } else if (unknown || unknownWindows || ['metric-missing', 'capacity-missing'].includes(state.input.fault)) {
      verdict = 'UNKNOWN';
      message = 'Missing metric, effective capacity, or completion evidence prevents a positive conclusion. Historical gaps remain after recovery.';
    } else if (!state.events.length) {
      verdict = 'NOT_RUN';
      message = 'No synthetic work has been observed; zero samples are not success.';
    } else if (!state.jobs.length || queued || state.capacity.pending || !readyTransitions || !addedWorkerCompletions) {
      verdict = 'INCOMPLETE';
      message = 'Need completed bounded work, an observed workload-triggered ready transition, and completion on an added worker. Rule intent alone cannot pass.';
    } else {
      verdict = 'PASS';
      message = 'In this declared synthetic envelope, a supported workload metric caused observed scale-out and all retained work met its original deadlines.';
    }
    return {
      verification: { verdict, message },
      rule: {
        metric: state.input.metric, support: blocked?.verdict || 'SUPPORTED_FIXTURE',
        lastDecision: state.windows.at(-1)?.decision || 'NOT_RUN', unknownWindows
      },
      capacity: {
        requested: state.capacity.requested,
        effectiveReady: state.input.fault === 'capacity-missing' ? null : state.capacity.lastConfirmedReady,
        lastConfirmedReady: state.capacity.lastConfirmedReady, warming: state.capacity.pending !== null,
        readyTransitions, failedTransitions
      },
      work: {
        submitted: state.jobs.length, queued, completed: onTime + late, onTime, late, failed, unknown,
        pendingOverdue, addedWorkerCompletions, verdict: workVerdict
      },
      history: {
        events: state.events.length, windows: state.windows.length, batches: state.batches.length,
        invalid: state.events.filter((entry) => entry.verdict === 'INVALID').length
      }
    };
  }
  return { DEFAULTS, RULE, LIMITS, initial, reduce, summarize };
}));
