(function (root) {
  'use strict';
  const MAX_ATTEMPTS = 6;
  const DEFAULTS = Object.freeze({
    connection: 'reconnect',
    cookie: 'rebind',
    work: 'finish',
    receipt: 'verified',
    retirement: 'guarded',
  });
  const CHOICES = Object.freeze({
    connection: Object.freeze(['reconnect', 'stale']),
    cookie: Object.freeze(['rebind', 'stale']),
    work: Object.freeze(['finish', 'pending']),
    receipt: Object.freeze(['verified', 'missing']),
    retirement: Object.freeze(['guarded', 'force']),
  });
  const OUTCOMES = Object.freeze(['success', 'safe-abort', 'failure', 'unknown']);
  const states = new WeakSet();
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  function own(value) {
    freeze(value);
    states.add(value);
    return value;
  }
  function requireState(state) {
    if (!state || !states.has(state)) throw new TypeError('Use an unmodified state created by this rehearsal.');
  }
  function configuration(config) {
    if (!config || Object.getPrototypeOf(config) !== Object.prototype
        || Reflect.ownKeys(config).length !== Object.keys(CHOICES).length) {
      throw new TypeError('Provide exactly the five declared configuration choices.');
    }
    const result = {};
    for (const [key, choices] of Object.entries(CHOICES)) {
      if (!Object.hasOwn(config, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(config, key), 'value')
          || !choices.includes(config[key])) {
        throw new TypeError(`Invalid ${key}: choose ${choices.join(' or ')}.`);
      }
      result[key] = config[key];
    }
    return freeze(result);
  }
  function dependencies(config, resolved) {
    const rows = [
      { kind: 'Keep-alive connection', client: 'keepalive-1', status: resolved && config.connection === 'reconnect' ? 'resolved' : 'required' },
      { kind: 'Synthetic routing-cookie pin', client: 'pinned-1', status: resolved && config.cookie === 'rebind' ? 'resolved' : 'required' },
      { kind: 'Already-admitted work', client: 'work-1', status: !resolved || config.work === 'pending' ? 'required' : config.receipt === 'missing' ? 'unknown' : 'resolved' },
    ];
    return {
      rows,
      required: rows.filter((row) => row.status === 'required').length,
      unknown: rows.filter((row) => row.status === 'unknown').length,
    };
  }
  function clients(config, phase, inventory) {
    const ready = phase === 'ready';
    const resolved = ['resolved', 'reviewed'].includes(phase);
    const status = (index) => ready ? 'not-started'
      : inventory.rows[index].status === 'resolved' ? 'completed' : inventory.rows[index].status;
    return [
      { id: 'fresh-1', destination: ready ? 'not started' : 'candidate', status: ready ? 'not-started' : 'completed' },
      { id: 'keepalive-1', destination: resolved && config.connection === 'reconnect' ? 'candidate' : 'old', status: status(0) },
      { id: 'pinned-1', destination: resolved && config.cookie === 'rebind' ? 'candidate' : 'old', status: status(1) },
      { id: 'work-1', destination: 'old', status: status(2) },
    ];
  }
  function metrics(rows) {
    const count = (status) => rows.filter((row) => row.status === status).length;
    return {
      attempted: rows.filter((row) => row.status !== 'not-started').length,
      completed: count('completed'), interrupted: count('interrupted'),
      unknown: count('unknown'), required: count('required'),
    };
  }
  function initial(config, history) {
    const inventory = dependencies(config, false);
    const rows = clients(config, 'ready', inventory);
    return own({
      phase: 'ready', config, newAdmissions: 'old', oldDestination: 'usable',
      dependencies: inventory, clients: rows, metrics: metrics(rows),
      trace: [], result: null, prediction: null, history,
    });
  }
  function createState(config = DEFAULTS) {
    return initial(configuration(config), []);
  }
  function configure(state, config) {
    requireState(state);
    if (state.phase !== 'ready') throw new Error('Configuration is locked until another attempt or reset.');
    return initial(configuration(config), state.history);
  }
  function step(state, action) {
    requireState(state);
    const prior = { route: 'ready', resolve: 'routed', retire: 'resolved' };
    if (typeof action !== 'string' || !Object.hasOwn(prior, action) || state.phase !== prior[action]) {
      throw new Error('Action out of order: route new arrivals, resolve dependencies, then request retirement.');
    }
    if (state.history.length >= MAX_ATTEMPTS) throw new Error('Six results are retained. Reset explicitly; no history is pruned.');
    const phase = { route: 'routed', resolve: 'resolved', retire: 'reviewed' }[action];
    const inventory = dependencies(state.config, action !== 'route');
    let rows = clients(state.config, phase, inventory);
    let result = null;
    let oldDestination = 'usable';
    const messages = {
      route: 'Fresh arrivals now use the candidate. Existing keep-alive, cookie pins, and admitted work still require the usable old destination.',
      resolve: `Dependency accounting: ${inventory.required} required; ${inventory.unknown} unknown. Reconnecting and rebinding do not finish already-admitted work.`,
    };
    if (action === 'retire') {
      const blocked = state.config.retirement === 'guarded' && (inventory.required > 0 || inventory.unknown > 0);
      oldDestination = blocked ? 'usable' : 'retired';
      if (!blocked) rows = rows.map((row) => row.status === 'required' ? { ...row, status: 'interrupted' } : row);
      const totals = metrics(rows);
      const outcome = totals.interrupted > 0 ? 'failure' : totals.unknown > 0 ? 'unknown'
        : blocked ? 'safe-abort' : 'success';
      const reason = blocked
        ? `Retirement blocked: retain old destination for ${inventory.required} known and ${inventory.unknown} unverified dependencies.`
        : outcome === 'failure'
          ? `Premature retirement interrupted ${totals.interrupted} required clients; unknown outcomes remain counted.`
          : outcome === 'unknown'
            ? 'Destination retired without the final work receipt: work-1 remains unknown, not successful.'
            : 'Every declared client and old dependency is accounted for before retirement.';
      messages.retire = reason;
      result = {
        attempt: state.history.length + 1, outcome, oldDestination,
        retirement: blocked ? 'blocked' : 'retired',
        userImpact: totals.interrupted > 0 ? 'interrupted transition'
          : totals.unknown > 0 ? 'unverified' : blocked ? 'no retirement interruption; required clients retained' : 'all four synthetic clients accounted for',
        cleanup: blocked ? 'old destination retained' : 'old destination retired',
        reason, config: state.config, metrics: totals, dependencies: inventory, clients: rows,
      };
    }
    const trace = [...state.trace, {
      step: state.trace.length + 1, action, message: messages[action],
      required: inventory.required, unknown: inventory.unknown, oldDestination,
    }];
    if (result) result.trace = trace;
    return own({
      ...state, phase, newAdmissions: 'candidate', oldDestination,
      dependencies: inventory, clients: rows, metrics: metrics(rows), trace, result,
      history: result ? [...state.history, result] : state.history,
    });
  }
  function checkPrediction(state, choice) {
    requireState(state);
    if (state.phase !== 'reviewed' || state.prediction) throw new Error('Check a prediction once after a retirement decision.');
    if (!OUTCOMES.includes(choice)) throw new TypeError('Choose success, safe-abort, failure, or unknown.');
    return own({ ...state, prediction: { choice, correct: choice === state.result.outcome } });
  }
  function nextAttempt(state) {
    requireState(state);
    if (state.phase !== 'reviewed') throw new Error('Finish this attempt before starting another.');
    if (state.history.length >= MAX_ATTEMPTS) throw new Error('Six results are retained. Reset explicitly; no history is pruned.');
    return initial(state.config, state.history);
  }
  function reset(state) {
    requireState(state);
    return createState();
  }
  const api = Object.freeze({ DEFAULTS, CHOICES, OUTCOMES, MAX_ATTEMPTS, createState, configure, step, checkPrediction, nextAttempt, reset });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S050 = api;
}(typeof globalThis === 'object' ? globalThis : this));
