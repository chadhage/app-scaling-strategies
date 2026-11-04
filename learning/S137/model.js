(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S137 = api;
}(globalThis, function () {
  'use strict';

  const MAX_RUNS = 12;
  const MAX_HISTORY = 64;
  const MAX_ERRORS = 12;
  const ACTIONS = ['pin', 'cutover', 'measure', 'reset'];
  const STATE_KEYS = ['schema', 'phase', 'current', 'runs', 'history'];
  const EVENT_KEYS = ['sequence', 'action', 'runId', 'presetId', 'phase'];

  class LessonError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'LessonError';
      this.code = code;
    }
  }

  function freeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function record(value, keys) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) return false;
    if (keys && (ownKeys.length !== keys.length || keys.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }

  function dataArray(value, maximum) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) return false;
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
    }
    return true;
  }

  function sameData(actual, expected) {
    if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
    if (Array.isArray(expected)) {
      return dataArray(actual, expected.length) && actual.length === expected.length
        && expected.every((value, index) => sameData(actual[index], value));
    }
    return record(actual, Object.keys(expected))
      && Object.keys(expected).every((key) => sameData(actual[key], expected[key]));
  }

  const ORIGINAL = freeze({
    bundleId: 'teaching-client-v1',
    backendVersion: 'teaching-backend-v1',
    lineage: {
      serviceWorkerId: 'teaching-sw-v1',
      cacheId: 'teaching-cache-v1',
      bundleId: 'teaching-client-v1',
    },
    assets: [
      { path: '/assets/client-v1.js', httpStatus: 200, contentId: 'fictional-js-v1-content' },
      { path: '/assets/layout-v1.css', httpStatus: 200, contentId: 'fictional-css-v1-content' },
    ],
    state: { schema: 'ui-draft-v1', itemId: 'paper-star', quantity: 2 },
    render: { itemId: 'paper-star', label: 'Paper star', quantity: 2 },
    safeView: 'Paper star × 2',
  });

  function observations(label, overrides = {}) {
    return {
      label,
      backend: { version: 'teaching-backend-v2', httpStatus: 200 },
      lineage: ORIGINAL.lineage,
      assets: ORIGINAL.assets,
      api: {
        httpStatus: 200,
        body: {
          contract: 'catalog-v1',
          item: { id: 'paper-star', label: 'Paper star', stock: 4 },
          additiveMetadata: 'fictional-v2-server-still-supports-v1',
        },
      },
      state: ORIGINAL.state,
      render: ORIGINAL.render,
      ...overrides,
    };
  }

  const PRESETS = freeze({
    preserved: observations('Preserved old bundle, assets, API and state'),
    'api-shape-break': observations('HTTP 200, incompatible old API shape', {
      api: { httpStatus: 200, body: { contract: 'catalog-v2', item: { id: 'paper-star', title: 'Paper star', stock: '4' } } },
    }),
    'missing-old-asset': observations('Fresh backend, old asset missing', {
      assets: [
        { path: '/assets/client-v1.js', httpStatus: 404, contentId: null },
        ORIGINAL.assets[1],
      ],
    }),
    'changed-old-asset': observations('HTTP 200, old asset content changed', {
      assets: [
        { path: '/assets/client-v1.js', httpStatus: 200, contentId: 'fictional-incompatible-js-v2-content' },
        ORIGINAL.assets[1],
      ],
    }),
    'lost-client-state': observations('HTTP 200, prior draft state lost', {
      state: { schema: 'ui-draft-v2', itemId: 'paper-star', quantity: 0 },
    }),
    'corrupt-render': observations('HTTP 200, silent render corruption detected', {
      render: { itemId: 'paper-star', label: '', quantity: 2 },
    }),
    'backend-only': observations('Fresh backend and HTTP 200 only', {
      lineage: null, assets: null, api: null, state: null, render: null,
    }),
    'cache-unknown': observations('Worker/cache lineage unobserved', { lineage: null }),
  });

  const EXPECTATIONS = freeze({
    preserved: { verdict: 'POSITIVE', passed: 7, failed: 0, unknown: 0 },
    'api-shape-break': { verdict: 'NEGATIVE', passed: 6, failed: 1, unknown: 0 },
    'missing-old-asset': { verdict: 'NEGATIVE', passed: 6, failed: 1, unknown: 0 },
    'changed-old-asset': { verdict: 'NEGATIVE', passed: 6, failed: 1, unknown: 0 },
    'lost-client-state': { verdict: 'NEGATIVE', passed: 6, failed: 1, unknown: 0 },
    'corrupt-render': { verdict: 'NEGATIVE', passed: 6, failed: 1, unknown: 0 },
    'backend-only': { verdict: 'UNKNOWN', passed: 2, failed: 0, unknown: 5 },
    'cache-unknown': { verdict: 'UNKNOWN', passed: 6, failed: 0, unknown: 1 },
  });

  function preset(presetId) {
    if (typeof presetId !== 'string' || !Object.hasOwn(PRESETS, presetId)) {
      throw new LessonError('ERR_S137_INPUT', 'Choose one exact fixed preset ID; no coercion or arbitrary observation input.');
    }
    return PRESETS[presetId];
  }

  function check(id, known, compatible, detail) {
    return { id, result: !known ? 'UNKNOWN' : compatible ? 'PASS' : 'FAIL', detail };
  }

  function apiCompatible(api) {
    if (api === null || api.httpStatus !== 200 || !record(api.body) || api.body.contract !== 'catalog-v1') return false;
    const item = api.body.item;
    return record(item) && item.id === ORIGINAL.render.itemId
      && typeof item.label === 'string' && item.label === ORIGINAL.render.label
      && Number.isInteger(item.stock) && item.stock >= ORIGINAL.state.quantity;
  }

  function measure(presetId, run) {
    const data = preset(presetId);
    const matchedAssets = data.assets === null ? null : ORIGINAL.assets.filter((expected) =>
      data.assets.some((actual) => actual.path === expected.path
        && actual.httpStatus === 200 && actual.contentId === expected.contentId)).length;
    const checks = [
      check('old-bundle-retained', true, run.bundleId === ORIGINAL.bundleId,
        `Bundle DATA=${run.bundleId}; original=${ORIGINAL.bundleId}; no refresh or replacement.`),
      check('new-backend', true, run.backendVersion === 'teaching-backend-v2' && run.backendVersion === data.backend.version,
        `Version DATA=${run.backendVersion}; observed fixture=${data.backend.version}; warm-up DATA HTTP ${data.backend.httpStatus} is not compatibility proof.`),
      check('cache-lineage', data.lineage !== null, sameData(data.lineage, ORIGINAL.lineage),
        data.lineage === null ? 'Worker/cache/bundle lineage DATA unobserved.'
          : `${data.lineage.serviceWorkerId} / ${data.lineage.cacheId} / ${data.lineage.bundleId} (DATA ONLY).`),
      check('old-assets', data.assets !== null, matchedAssets === ORIGINAL.assets.length,
        data.assets === null ? 'Required old asset DATA unobserved.'
          : `${matchedAssets} / ${ORIGINAL.assets.length} required old content IDs match; ${data.assets.map((asset) =>
            `${asset.path}: HTTP ${asset.httpStatus}, ${asset.contentId ?? 'missing content'}`).join('; ')} (DATA ONLY).`),
      check('old-api-contract', data.api !== null, apiCompatible(data.api),
        data.api === null ? 'Old-client API contract DATA unobserved.'
          : `HTTP ${data.api.httpStatus}; contract=${data.api.body.contract}; label=${typeof data.api.body.item.label}; stock=${typeof data.api.body.item.stock}. v1 requires label:string and stock:integer; additive metadata is allowed.`),
      check('retained-state', data.state !== null, sameData(data.state, ORIGINAL.state),
        data.state === null ? 'Prior draft state DATA unobserved.'
          : `schema=${data.state.schema}; item=${data.state.itemId}; quantity=${data.state.quantity}; expected ui-draft-v1 / paper-star / 2 (DATA ONLY).`),
      check('render-integrity', data.render !== null, sameData(data.render, ORIGINAL.render),
        data.render === null ? 'Old-client rendered-result DATA unobserved.'
          : `Recorded attempted label=${JSON.stringify(data.render.label)}, item=${data.render.itemId}, quantity=${data.render.quantity}; expected ${ORIGINAL.safeView} (DATA ONLY).`),
    ];
    const counts = {
      passed: checks.filter((row) => row.result === 'PASS').length,
      failed: checks.filter((row) => row.result === 'FAIL').length,
      unknown: checks.filter((row) => row.result === 'UNKNOWN').length,
      total: checks.length,
      oldAssetsMatched: matchedAssets,
    };
    const verdict = counts.failed > 0 ? 'NEGATIVE' : counts.unknown > 0 ? 'UNKNOWN' : 'POSITIVE';
    return freeze({
      checks, counts, verdict, candidateAccepted: verdict === 'POSITIVE',
      safeView: ORIGINAL.safeView,
      scope: 'Fixed fictional teaching DATA ONLY; not live compatibility or service-worker proof.',
    });
  }

  function createState() {
    return freeze({ schema: 's137/1', phase: 'idle', current: null, runs: [], history: [] });
  }

  function validateAction(action) {
    if (!record(action) || typeof action.type !== 'string' || !ACTIONS.includes(action.type)
        || !record(action, action.type === 'pin' ? ['type', 'presetId'] : ['type'])) {
      throw new LessonError('ERR_S137_INPUT', 'Use an exact typed operator action with no extra keys or accessors.');
    }
    if (action.type === 'pin') preset(action.presetId);
  }

  function advance(state, action) {
    if (state.history.length >= MAX_HISTORY) {
      throw new LessonError('ERR_S137_LIMIT', 'The 64 accepted-action envelope is full. Retained history is not discarded.');
    }
    let phase = state.phase;
    let current = state.current;
    let runs = state.runs;
    const previous = current;
    if (action.type === 'pin') {
      if (phase !== 'idle') throw new LessonError('ERR_S137_ORDER', 'Reset the current run before reusing an old bundle again.');
      if (runs.length >= MAX_RUNS) throw new LessonError('ERR_S137_LIMIT', 'The 12 measured-run envelope is full. Reload only to begin a new in-memory lesson.');
      if (state.history.length > MAX_HISTORY - 4) {
        throw new LessonError('ERR_S137_LIMIT', 'Not enough history room for pin, cutover, measure and reset; no partial run admitted.');
      }
      current = {
        id: runs.length + 1, presetId: action.presetId, bundleId: ORIGINAL.bundleId,
        backendVersion: ORIGINAL.backendVersion, result: null,
      };
      phase = 'pinned';
    } else if (action.type === 'cutover') {
      if (phase !== 'pinned') throw new LessonError('ERR_S137_ORDER', 'Reuse the old bundle before selecting new backend DATA.');
      current = { ...current, backendVersion: preset(current.presetId).backend.version };
      phase = 'cutover';
    } else if (action.type === 'measure') {
      if (phase !== 'cutover') throw new LessonError('ERR_S137_ORDER', 'Use new backend DATA before measuring old-client compatibility.');
      current = { ...current, result: measure(current.presetId, current) };
      runs = [...runs, current];
      phase = 'measured';
    } else {
      if (phase === 'idle') throw new LessonError('ERR_S137_ORDER', 'No current run to reset. Choose a preset and reuse the old bundle.');
      current = null;
      phase = 'idle';
    }
    const identity = current ?? previous;
    const event = {
      sequence: state.history.length + 1, action: action.type,
      runId: identity.id, presetId: identity.presetId, phase,
    };
    return freeze({ schema: 's137/1', phase, current, runs, history: [...state.history, event] });
  }

  function validateState(state) {
    const invalid = () => { throw new LessonError('ERR_S137_STATE', 'State/history is not a canonical typed S137 rehearsal. No result is trusted.'); };
    if (!record(state, STATE_KEYS) || state.schema !== 's137/1'
        || !dataArray(state.history, MAX_HISTORY) || !dataArray(state.runs, MAX_RUNS)) invalid();
    // Replay only bounded accepted events; cached verdicts and nested client/state data are never trusted.
    let canonical = createState();
    for (const event of state.history) {
      if (!record(event, EVENT_KEYS) || !Number.isInteger(event.sequence)
          || typeof event.action !== 'string' || !ACTIONS.includes(event.action)) invalid();
      const action = event.action === 'pin' ? { type: 'pin', presetId: event.presetId } : { type: event.action };
      try {
        validateAction(action);
        canonical = advance(canonical, action);
      } catch {
        invalid();
      }
      if (!sameData(event, canonical.history[canonical.history.length - 1])) invalid();
    }
    if (!sameData(state, canonical)) invalid();
    return true;
  }

  function execute(state, action) {
    validateState(state);
    validateAction(action);
    return advance(state, action);
  }

  return freeze({
    MAX_RUNS, MAX_HISTORY, MAX_ERRORS, ORIGINAL, PRESETS, EXPECTATIONS,
    LessonError, createState, execute, validateState,
  });
}));
