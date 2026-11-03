(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StaticAssetLesson = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_ATTEMPTS = 6;
  const DEFAULTS = Object.freeze({ observation: 'complete', retireTarget: 'script' });
  const ASSETS = freeze([
    { html: 'v1', kind: 'script', path: '/assets/app.a17c.js' },
    { html: 'v1', kind: 'style', path: '/assets/site.a17c.css' },
    { html: 'v2', kind: 'script', path: '/assets/app.b28d.js' },
    { html: 'v2', kind: 'style', path: '/assets/site.b28d.css' },
  ]);
  const phases = Object.freeze({
    cache: ['ready', 'cached'], deploy: ['cached', 'deployed'],
    retire: ['deployed', 'retired'], 'load-old': ['deployed', 'retired', 'old-loaded'],
    'load-new': ['old-loaded', 'complete'],
  });
  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) freeze(item);
      Object.freeze(value);
    }
    return value;
  }
  function exact(value, keys, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => !Object.hasOwn(value, key)
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      throw new RangeError(`Invalid ${label}: exact data keys required`);
    }
  }
  function boundedArray(value, maximum, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > maximum || Object.keys(value).length !== value.length
        || Reflect.ownKeys(value).length !== value.length + 1
        || Array.from({ length: value.length }, (_, index) => index).some((index) =>
          !Object.hasOwn(value, index) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, index), 'value'))) {
      throw new RangeError(`Invalid ${label} state or limit`);
    }
  }
  function validateConfig(config) {
    exact(config, ['observation', 'retireTarget'], 'configuration');
    if (!['complete', 'withhold-old-script'].includes(config.observation)
        || !['script', 'all-old'].includes(config.retireTarget)) {
      throw new RangeError('Invalid configuration choice');
    }
  }
  function phaseOf(attempt) {
    let phase = 'ready';
    for (const action of attempt.actions) {
      const rule = typeof action === 'string' && Object.hasOwn(phases, action) ? phases[action] : null;
      if (!rule || !rule.slice(0, -1).includes(phase)) {
        throw new RangeError('Invalid attempt action for phase');
      }
      phase = rule.at(-1);
    }
    return phase;
  }
  function validateAttempt(attempt, id, completed) {
    exact(attempt, ['id', 'config', 'actions'], 'attempt state');
    if (attempt.id !== id || !Number.isSafeInteger(attempt.id)) throw new RangeError('Invalid attempt identity state');
    validateConfig(attempt.config);
    boundedArray(attempt.actions, 5, 'attempt');
    if (attempt.actions[0] !== 'cache') throw new RangeError('Invalid initial attempt phase');
    if (completed && phaseOf(attempt) !== 'complete') throw new RangeError('Invalid incomplete history state');
    phaseOf(attempt);
  }
  function validateState(state) {
    exact(state, ['version', 'current', 'history'], 'state');
    if (state.version !== 1) throw new RangeError('Invalid state version');
    boundedArray(state.history, MAX_ATTEMPTS - 1, 'history');
    state.history.forEach((attempt, index) => validateAttempt(attempt, index + 1, true));
    if (state.current !== null) validateAttempt(state.current, state.history.length + 1, false);
  }
  function createState() { return freeze({ version: 1, current: null, history: [] }); }
  function transition(state, action, config) {
    validateState(state);
    if (!['start', 'deploy', 'retire', 'load-old', 'load-new', 'again', 'reset'].includes(action)) {
      throw new RangeError('Invalid action');
    }
    if (action !== 'start' && config !== undefined) throw new RangeError('Unexpected action payload');
    const phase = state.current ? phaseOf(state.current) : 'ready';
    if (action === 'reset') return createState();
    const next = JSON.parse(JSON.stringify(state));
    if (action === 'start') {
      if (phase !== 'ready') throw new RangeError('Invalid start action for phase');
      validateConfig(config);
      next.current = { id: next.history.length + 1, config: { ...config }, actions: ['cache'] };
    } else if (action === 'again') {
      if (phase !== 'complete') throw new RangeError('Invalid comparison action for phase');
      if (next.history.length + 1 >= MAX_ATTEMPTS) throw new RangeError('Six-attempt history limit; explicitly reset to clear it');
      next.history.push(next.current);
      next.current = null;
    } else {
      const rule = phases[action];
      if (!rule.slice(0, -1).includes(phase)) throw new RangeError('Invalid action for phase');
      next.current.actions.push(action);
    }
    validateState(next);
    return freeze(next);
  }
  function pageOutcome(rows) {
    if (rows.some((row) => row.outcome === 'failure')) return 'failure';
    return rows.length === 2 && rows.every((row) => row.outcome === 'success') ? 'success' : 'unknown';
  }
  function summarize(attempt) {
    const actions = attempt ? attempt.actions : [];
    const phase = attempt ? phaseOf(attempt) : 'ready';
    const deployed = actions.includes('deploy');
    const retiredPaths = actions.includes('retire') ? ASSETS.filter((asset) =>
      asset.html === 'v1' && (attempt.config.retireTarget === 'all-old' || asset.kind === 'script'))
      .map((asset) => asset.path) : [];
    const assets = ASSETS.map((asset) => ({
      ...asset, available: (asset.html === 'v1' || deployed) && !retiredPaths.includes(asset.path),
    }));
    const rows = [];
    for (const [action, html] of [['load-old', 'v1'], ['load-new', 'v2']]) {
      if (!actions.includes(action)) continue;
      for (const asset of assets.filter((item) => item.html === html)) {
        const withheld = html === 'v1' && asset.kind === 'script'
          && attempt.config.observation === 'withhold-old-script';
        const status = withheld ? 'unobserved' : asset.available ? '200' : '404';
        rows.push({
          html, kind: asset.kind, path: asset.path, status,
          outcome: status === 'unobserved' ? 'unknown' : status === '200' ? 'success' : 'failure',
        });
      }
    }
    const success = rows.filter((row) => row.outcome === 'success').length;
    const failure = rows.filter((row) => row.outcome === 'failure').length;
    const metrics = {
      planned: 4, attempted: rows.length, success, failure, unknown: 4 - success - failure,
      pending: 4 - rows.length,
    };
    return {
      phase, rows, assets, retiredPaths, metrics,
      cachedHtml: attempt ? 'v1' : null, publishedHtml: deployed ? 'v2' : 'v1',
      oldOutcome: pageOutcome(rows.filter((row) => row.html === 'v1')),
      newOutcome: pageOutcome(rows.filter((row) => row.html === 'v2')),
      outcome: failure ? 'failure' : phase === 'complete' && metrics.unknown === 0 ? 'success' : 'unknown',
    };
  }
  function inspect(state) {
    validateState(state);
    const view = summarize(state.current);
    const completed = [...state.history, ...(view.phase === 'complete' ? [state.current] : [])];
    return freeze({
      ...view,
      history: completed.map((attempt) => {
        const result = summarize(attempt);
        return {
          id: attempt.id, config: { ...attempt.config }, actions: [...attempt.actions],
          outcome: result.outcome, oldOutcome: result.oldOutcome, newOutcome: result.newOutcome,
          metrics: result.metrics, retiredPaths: result.retiredPaths,
        };
      }),
      retainedCount: completed.length,
    });
  }
  return freeze({ DEFAULTS, MAX_ATTEMPTS, ASSETS, createState, transition, inspect });
}));
