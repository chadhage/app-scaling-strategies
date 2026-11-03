(function expose(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S014 = api;
}(typeof globalThis === 'object' ? globalThis : this, function build() {
  'use strict';

  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const DEFAULTS = Object.freeze({
    demandAt: 30, lead: 20, provision: 8, warm: 7,
    target: 4, demand: 120, fixture: 'healthy',
  });
  const CONTRACT = Object.freeze({
    baseline: 2, ratePerUnit: 40, window: 20, step: 5,
    clientsPerSample: 10, sampleCount: 4, budgetMs: 800,
  });
  const FIXTURES = Object.freeze({
    healthy: 'Observed schedule, capacity and complete clients',
    'missed-trigger': 'Calendar accepted; scheduler did not fire',
    'provisioning-failure': 'Additional units not deployed',
    'warmup-failure': 'Additional units not ready',
    'missing-readiness': 'Readiness and effective capacity unobserved',
    'missing-clients': 'Capacity observed; client outcomes missing',
    'slow-clients': 'Capacity ready; 800 ms journey budget exceeded',
    'unsupported-schedule': 'Schedule support unqualified; no execution',
  });
  const RANGES = Object.freeze({
    demandAt: [20, 120], lead: [0, 120], provision: [0, 60],
    warm: [0, 60], target: [3, 8], demand: [1, 320],
  });

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function createState() {
    return freeze({
      schemaVersion: 1, source: 'S014', mode: 'synthetic-only',
      attempts: [], actions: [], nextAttempt: 1,
      message: 'No attempt yet. Schedule the known demand, then observe the logical clock.',
    });
  }

  function current(state) { return state.attempts.at(-1) || null; }

  function action(state, kind, disposition, message, input = null) {
    state.actions.push({
      sequence: state.actions.length + 1, attemptId: current(state)?.id || null,
      kind, disposition, message, input,
    });
    state.message = message;
    return freeze(state);
  }

  function reject(state, kind, message, input = null) {
    return action(structuredClone(state), kind, 'invalid', message, input);
  }

  function validate(raw) {
    const config = {};
    const errors = [];
    const input = {};
    for (const [key, [min, max]] of Object.entries(RANGES)) {
      const value = raw && typeof raw === 'object' ? raw[key] : undefined;
      input[key] = String(value);
      const number = typeof value === 'number' ? value
        : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
      if (!Number.isSafeInteger(number) || number < min || number > max) {
        errors.push(`${key} must be a whole number from ${min} to ${max}`);
      } else config[key] = number;
    }
    const fixture = raw && typeof raw === 'object' ? raw.fixture : undefined;
    input.fixture = String(fixture);
    if (typeof fixture !== 'string' || !Object.hasOwn(FIXTURES, fixture)) {
      errors.push('fixture must be one of the declared synthetic observations');
    } else config.fixture = fixture;
    if (Number.isInteger(config.lead) && Number.isInteger(config.demandAt)
        && config.lead > config.demandAt) {
      errors.push('lead must not place the schedule trigger before logical second zero');
    }
    return { config, errors, input };
  }

  function snapshot(run, at, event, detail) {
    run.trace.push({
      at, event, detail, scheduledTrigger: run.triggerAt,
      requested: run.config.target, deployed: run.deployed,
      ready: run.ready, eligible: run.eligible,
      effectiveRps: run.eligible === null ? null : run.eligible * CONTRACT.ratePerUnit,
    });
  }

  function sample(run, at) {
    const missing = run.config.fixture === 'missing-clients' || run.eligible === null;
    const available = run.eligible === null ? null : run.eligible * CONTRACT.ratePerUnit;
    const successful = missing ? 0
      : Math.min(CONTRACT.clientsPerSample,
        Math.floor(CONTRACT.clientsPerSample * available / run.config.demand));
    for (let index = 0; index < CONTRACT.clientsPerSample; index += 1) {
      const slow = run.config.fixture === 'slow-clients';
      const interrupted = !missing && (slow || index >= successful);
      run.clients.push({
        id: `${run.id}-t${at}-client${index + 1}`, observedAt: at,
        effectiveRps: available,
        outcome: missing ? 'unknown' : interrupted ? 'interrupted' : 'successful',
        completed: missing ? null : slow || !interrupted,
        latencyMs: missing ? null : slow ? 1000 : interrupted ? 1100 : 600,
        payloadCorrect: missing || (interrupted && !slow) ? null : true,
        stateIntact: missing || (interrupted && !slow) ? null : true,
        reason: missing ? 'Missing client or readiness observations; no success inferred'
          : slow ? '800 ms journey budget exceeded'
            : interrupted ? 'Observed capacity shortfall; journey timed out'
              : 'Complete correct synthetic journey within 800 ms',
      });
    }
    snapshot(run, at, 'demand sample', `10 synthetic journeys; demand ${run.config.demand} requests/s`);
  }

  function tick(run, at) {
    const { config } = run;
    if (at === run.triggerAt) {
      if (config.fixture === 'missed-trigger') {
        run.scheduleState = 'missed';
        snapshot(run, at, 'scheduler failure', 'Calendar correct, but scheduler did not fire');
      } else {
        run.scheduleState = 'fired';
        run.startedAt = at;
        run.provisionState = 'provisioning';
        snapshot(run, at, 'schedule observed', 'Synthetic scheduler fired; provisioning started');
      }
    }
    if (run.startedAt !== null && at === run.triggerAt + config.provision) {
      if (config.fixture === 'provisioning-failure') {
        run.provisionState = 'failed';
        snapshot(run, at, 'provisioning failure', 'Additional units not deployed');
      } else {
        run.deployed = config.target;
        run.provisionState = 'deployed';
        run.warmState = 'warming';
        snapshot(run, at, 'deployment observed', 'Deployed is not yet warm, ready, or traffic-eligible');
      }
    }
    if (run.deployed === config.target && at === run.plannedReadyAt) {
      if (config.fixture === 'warmup-failure') {
        run.warmState = 'failed';
        snapshot(run, at, 'warm-up failure', 'Additional units not ready');
      } else if (config.fixture === 'missing-readiness') {
        run.ready = null;
        run.eligible = null;
        run.warmState = 'unknown';
        snapshot(run, at, 'readiness unknown', 'No readiness evidence; planned time cannot fill the gap');
      } else {
        run.ready = config.target;
        run.eligible = config.target;
        run.firstReadyAt = at;
        run.warmState = 'ready';
        snapshot(run, at, 'readiness observed', 'Warm readiness and effective capacity observed');
      }
    }
    if (at >= config.demandAt && at < run.endAt
        && (at - config.demandAt) % CONTRACT.step === 0) sample(run, at);
    if (at === run.endAt) {
      run.finished = true;
      snapshot(run, at, 'window ended', 'Declared 20-second demand observation window ended');
    }
  }

  function schedule(state, raw) {
    const { config, errors, input } = validate(raw);
    if (errors.length) return reject(state, 'schedule', `Invalid input: ${errors.join('; ')}.`, input);
    if (current(state) && !current(state).finished) {
      return reject(state, 'schedule', 'Invalid action: finish the active observation window before scheduling another attempt.', input);
    }
    const next = structuredClone(state);
    const unsupported = config.fixture === 'unsupported-schedule';
    const run = {
      id: `attempt-${next.nextAttempt++}`, config, now: 0,
      triggerAt: config.demandAt - config.lead,
      plannedReadyAt: config.demandAt - config.lead + config.provision + config.warm,
      endAt: config.demandAt + CONTRACT.window,
      scheduleAccepted: !unsupported, scheduleState: unsupported ? 'unsupported' : 'planned',
      startedAt: null, firstReadyAt: null, provisionState: 'not-started', warmState: 'not-started',
      deployed: CONTRACT.baseline, ready: CONTRACT.baseline, eligible: CONTRACT.baseline,
      trace: [], clients: [], assessments: [], finished: unsupported,
      verdict: unsupported ? 'unsupported' : 'incomplete',
    };
    snapshot(run, 0, unsupported ? 'unsupported schedule' : 'calendar accepted',
      unsupported ? 'Schedule support unqualified; no execution or client result claimed'
        : 'Calendar is a control plan, not capacity or client evidence');
    if (!unsupported) tick(run, 0);
    next.attempts.push(run);
    return action(next, 'schedule', unsupported ? 'unsupported' : 'accepted',
      unsupported ? `${run.id}: unsupported schedule fixture; no execution or success.`
        : `${run.id}: calendar accepted. Observe provisioning, readiness, and the complete demand window.`, input);
  }

  function advance(state) {
    const active = current(state);
    if (!active || active.finished) {
      return reject(state, 'advance', 'Invalid action: schedule an unfinished supported attempt before advancing.');
    }
    const next = structuredClone(state);
    const run = current(next);
    const until = Math.min(run.now + CONTRACT.step, run.endAt);
    for (let at = run.now + 1; at <= until; at += 1) tick(run, at);
    run.now = until;
    snapshot(run, until, 'clock observation', 'Explicit deterministic logical-clock observation');
    return action(next, 'advance', 'accepted',
      `${run.id}: observed through logical second ${until}${run.finished ? '; window complete. Check outcome.' : '.'}`);
  }

  function metrics(clients) {
    const counts = { total: clients.length, successful: 0, interrupted: 0, unknown: 0 };
    for (const client of clients) counts[client.outcome] += 1;
    counts.successFraction = counts.total ? counts.successful / counts.total : null;
    return counts;
  }

  function check(id, label, value, observed, expected) {
    return { id, label, status: value === null ? 'unknown' : value ? 'pass' : 'fail', observed, expected };
  }

  function assess(state) {
    if (!current(state)) return reject(state, 'assess', 'Invalid action: schedule an attempt before checking the outcome.');
    const next = structuredClone(state);
    const run = current(next);
    const counts = metrics(run.clients);
    const fullSample = CONTRACT.sampleCount * CONTRACT.clientsPerSample;
    const complete = run.finished && counts.total === fullSample;
    const fired = run.scheduleState === 'fired' ? true : run.scheduleState === 'missed' ? false : null;
    const timely = run.firstReadyAt !== null ? run.firstReadyAt < run.config.demandAt
      : run.now < run.config.demandAt || run.warmState === 'unknown' ? null : false;
    const firstSample = run.trace.find((row) => row.event === 'demand sample' && row.at === run.config.demandAt);
    const capacity = !firstSample || firstSample.effectiveRps === null ? null
      : firstSample.effectiveRps >= run.config.demand;
    const clientPass = counts.interrupted ? false
      : counts.unknown || counts.total < fullSample ? null : true;
    const checks = [
      check('scheduler', 'Observed scheduler trigger', fired, run.startedAt, `trigger at ${run.triggerAt} s`),
      check('ready-before', 'Warm capacity strictly before demand', timely, run.firstReadyAt,
        `observed ready time < ${run.config.demandAt} s; plan alone insufficient`),
      check('capacity', 'Effective capacity at demand start', capacity, firstSample?.effectiveRps ?? null,
        `at least ${run.config.demand} requests/s`),
      check('clients', 'Complete correct journeys within budget', clientPass, counts,
        `${fullSample} known complete journeys, no interruption, <= ${CONTRACT.budgetMs} ms each`),
      { id: 'window', label: 'Full declared observation window', status: complete ? 'pass' : 'pending',
        observed: `${counts.total}/${fullSample} clients at logical second ${run.now}`,
        expected: `all ${CONTRACT.sampleCount} cohorts through second ${run.endAt}` },
    ];
    const verdict = !run.scheduleAccepted ? 'unsupported'
      : checks.some((item) => item.status === 'fail') ? 'fail'
        : !complete ? 'incomplete'
          : checks.some((item) => item.status === 'unknown') ? 'unknown' : 'pass';
    run.verdict = verdict;
    run.assessments.push({
      sequence: run.assessments.length + 1, at: run.now, verdict, checks,
      metrics: { ...counts, windowComplete: complete },
    });
    return action(next, 'assess', 'accepted',
      `${run.id}: ${verdict.toUpperCase()} (synthetic only). Earlier attempts and assessments remain visible.`);
  }

  function summary(state) {
    const result = {
      attempts: state.attempts.length, pass: 0, fail: 0, unknown: 0,
      unsupported: 0, incomplete: 0, unassessed: 0,
      clients: metrics(state.attempts.flatMap((run) => run.clients)),
    };
    for (const run of state.attempts) {
      result[run.verdict] += 1;
      if (!run.assessments.length) result.unassessed += 1;
    }
    return freeze(result);
  }

  return freeze({ BANNER, DEFAULTS, CONTRACT, FIXTURES, createState, current, schedule, advance,
    assess, summary, reset: createState });
}));
