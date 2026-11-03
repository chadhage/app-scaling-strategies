(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S033Affinity = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_STEPS = 16;
  const ACTIONS = Object.freeze(['probe', 'externalize', 'remove-affinity', 'restore-affinity', 'preview-unsafe']);
  const OBSERVATIONS = Object.freeze(['complete', 'mismatch', 'missing']);

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const CLIENTS = freeze([
    { id: 'client-1', expected: { cart: 3, step: 'review', revision: 7 } },
    { id: 'client-2', expected: { cart: 1, step: 'address', revision: 4 } },
  ]);
  const ROUTES = freeze([
    { client: 'client-1', worker: 'worker-a' },
    { client: 'client-1', worker: 'worker-b' },
    { client: 'client-2', worker: 'worker-a' },
    { client: 'client-2', worker: 'worker-b' },
  ]);

  function validate(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(command))) {
      throw new TypeError('Expected an action/observation command object.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(command);
    if (Reflect.ownKeys(command).length !== 2
        || !descriptors.action || !Object.hasOwn(descriptors.action, 'value')
        || !descriptors.observation || !Object.hasOwn(descriptors.observation, 'value')
        || !ACTIONS.includes(descriptors.action.value)
        || !OBSERVATIONS.includes(descriptors.observation.value)) {
      throw new TypeError('Choose exact supported action and observation values; extra fields are refused.');
    }
    const action = descriptors.action.value;
    const observation = descriptors.observation.value;
    if (!['probe', 'externalize'].includes(action) && observation !== 'complete') {
      throw new TypeError('This action requires the complete observation setting.');
    }
    return { action, observation };
  }

  function metricsFor(trace) {
    return {
      attempted: trace.length,
      preserved: trace.filter((row) => row.outcome === 'preserved').length,
      failed: trace.filter((row) => row.outcome === 'failed').length,
      unknown: trace.filter((row) => row.outcome === 'unknown').length,
    };
  }

  function verdictFor(metrics) {
    return metrics.failed ? 'failure' : metrics.unknown ? 'unknown' : 'success';
  }

  function matches(expected, observed) {
    return observed !== null && Object.keys(expected).every((key) => expected[key] === observed[key])
      && Object.keys(observed).length === Object.keys(expected).length;
  }

  function createLesson() {
    let affinity = 'on';
    let storage = 'local';
    let verified = false;
    let shared = null;
    let history = [];
    let runNumber = 1;

    function flags() {
      return { affinity, storage, verified };
    }

    function view() {
      return freeze({
        runNumber,
        ...flags(),
        stepsRemaining: MAX_STEPS - history.length,
        history: history.slice(),
        last: history.at(-1) || null,
        summary: {
          success: history.filter((event) => event.verdict === 'success').length,
          failure: history.filter((event) => event.verdict === 'failure').length,
          unknown: history.filter((event) => event.verdict === 'unknown').length,
        },
      });
    }

    function probe(routeAffinity, routeStorage, observation) {
      return ROUTES.map((route, index) => {
        const client = CLIENTS.find((item) => item.id === route.client);
        const worker = routeAffinity === 'on' ? 'worker-a' : route.worker;
        let observed = routeStorage === 'shared' ? { ...shared[client.id] }
          : worker === 'worker-a' ? { ...client.expected } : null;
        let httpStatus = 200;
        let outcome;
        let reason;
        if (index === ROUTES.length - 1 && observation === 'missing') {
          httpStatus = null;
          observed = null;
          outcome = 'unknown';
          reason = 'No response was observed; continuity is unverified.';
        } else {
          if (index === ROUTES.length - 1 && observation === 'mismatch') {
            observed = { ...client.expected, revision: 0 };
          }
          outcome = matches(client.expected, observed) ? 'preserved' : 'failed';
          reason = outcome === 'preserved' ? 'Cart, workflow step and revision all match.'
            : 'HTTP 200 did not preserve required state; an empty or wrong session is not success.';
        }
        return { client: client.id, worker, httpStatus, expected: client.expected, observed, outcome, reason };
      });
    }

    function step(command) {
      const { action, observation } = validate(command);
      if (history.length >= MAX_STEPS) {
        throw new RangeError(`The ${MAX_STEPS}-step run is full. Reset deliberately to start another run.`);
      }
      const before = flags();
      let trace = [];
      let unit = 'guard';
      let kind = 'guard';
      let applied = false;
      let message;
      let userImpact = 'safe-abort-before-exposure';
      let metrics = { attempted: 1, preserved: 0, failed: 1, unknown: 0 };

      if (action === 'probe' || action === 'preview-unsafe') {
        const counterexample = action === 'preview-unsafe';
        trace = probe(counterexample ? 'off' : affinity, counterexample ? 'local' : storage, observation);
        metrics = metricsFor(trace);
        unit = 'requests';
        kind = counterexample ? 'counterexample' : 'comparison';
        const verdict = verdictFor(metrics);
        userImpact = counterexample ? 'hypothetical-interruption'
          : verdict === 'failure' ? 'interrupted' : verdict === 'unknown' ? 'unverified' : 'preserved';
        message = counterexample
          ? 'Unsafe order, NOT APPLIED: off + local loses required state on worker-b despite HTTP 200. Current state is unchanged.'
          : affinity === 'on' && storage === 'local'
            ? 'Pinned baseline only: matching replies on worker-a do not authorize affinity removal.'
            : 'Compared all required state fields. A current success does not erase earlier failures or unknowns.';
      } else if (action === 'externalize') {
        if (affinity !== 'on' || storage !== 'local') {
          message = 'Externalization requires the initial local-state, affinity-on configuration. Reset to replay migration.';
        } else {
          kind = 'migration';
          unit = 'state-records';
          trace = CLIENTS.map((client, index) => {
            const last = index === CLIENTS.length - 1;
            const observed = last && observation === 'missing' ? null
              : { ...client.expected, ...(last && observation === 'mismatch' ? { revision: 0 } : {}) };
            const outcome = observed === null ? 'unknown'
              : matches(client.expected, observed) ? 'preserved' : 'failed';
            return {
              client: client.id, worker: 'shared-candidate', expected: client.expected, observed, outcome,
              reason: outcome === 'unknown' ? 'No migration receipt; verification is incomplete.'
                : outcome === 'failed' ? 'Migration receipt has a wrong revision; do not commit.'
                  : 'All required fields match the declared source record.',
            };
          });
          metrics = metricsFor(trace);
          if (verdictFor(metrics) === 'success') {
            shared = freeze(Object.fromEntries(trace.map((row) => [row.client, { ...row.observed }])));
            storage = 'shared';
            verified = true;
            applied = true;
            userImpact = 'not-exposed';
            message = 'Both records verified and atomically externalized in this model. Affinity is still on; compare before removal.';
          } else {
            message = 'Migration not committed: failed or missing receipts cannot authorize removal. Original local state is intact.';
          }
        }
      } else if (action === 'remove-affinity') {
        if (affinity === 'off') {
          message = 'Affinity is already off. No routing change was applied.';
        } else if (storage !== 'shared' || !verified || shared === null) {
          message = 'Unsupported local-state removal: blocked before exposure. Externalize and verify both records first; no session was reset.';
        } else {
          affinity = 'off';
          applied = true;
          metrics = { attempted: 1, preserved: 1, failed: 0, unknown: 0 };
          userImpact = 'not-yet-probed';
          message = 'Affinity removed after verified externalization. Probe both workers next; this guard result is not a continuity result.';
        }
      } else if (affinity === 'on') {
        message = 'Affinity is already on. No routing change was applied.';
      } else {
        affinity = 'on';
        applied = true;
        metrics = { attempted: 1, preserved: 1, failed: 0, unknown: 0 };
        userImpact = 'not-yet-probed';
        message = 'Affinity restored without reversing externalization or erasing history.';
      }

      const event = freeze({
        sequence: history.length + 1,
        action, observation, kind, applied, before, after: flags(),
        verdict: verdictFor(metrics), userImpact, unit, metrics, message, trace,
      });
      history.push(event);
      return event;
    }

    function reset() {
      affinity = 'on';
      storage = 'local';
      verified = false;
      shared = null;
      history = [];
      runNumber += 1;
      return view();
    }

    return Object.freeze({ step, view, reset });
  }
  return Object.freeze({ createLesson, MAX_STEPS, ACTIONS, OBSERVATIONS, CLIENTS });
}));
