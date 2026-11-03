(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports
    ? require('.\\fixtures.js') : root.S051Fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S051Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function plainData(value) {
    return value !== null && typeof value === 'object'
      && Object.getPrototypeOf(value) === Object.prototype
      && Reflect.ownKeys(value).every((key) =>
        typeof key === 'string' && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }
  function renderOldResponse(body) {
    const reject = (reason) => freeze({ ok: false, value: null, view: null, reason });
    if (!plainData(body)) return reject('Response must contain plain own data fields, not accessors.');
    for (const field of ['id', 'displayName']) {
      if (!Object.hasOwn(body, field) || typeof body[field] !== 'string'
        || !body[field].trim() || body[field].length > 80) {
        return reject(`${field} must be an own non-empty string field (at most 80 characters).`);
      }
    }
    if (!Object.hasOwn(body, 'unreadCount') || !Number.isSafeInteger(body.unreadCount)
      || body.unreadCount < 0 || body.unreadCount > 999) {
      return reject('unreadCount must be an own integer field from 0 to 999.');
    }
    const value = { id: body.id, displayName: body.displayName, unreadCount: body.unreadCount };
    return freeze({
      ok: true, value, view: `${value.displayName} — ${value.unreadCount} unread`, reason: null,
    });
  }
  function configuration(input) {
    if (!plainData(input) || Reflect.ownKeys(input).length !== 2
      || !Object.hasOwn(input, 'response') || !Object.hasOwn(input, 'observation')
      || !['compatible', 'breaking'].includes(input.response)
      || !['complete', 'partial', 'none'].includes(input.observation)) {
      throw new Error('Invalid configuration: exact response and observation choices are required.');
    }
    return { response: input.response, observation: input.observation };
  }
  function initial() {
    return {
      phase: 'idle', frontendVersion: 'v1', configuration: null,
      baseline: null, current: null, prediction: null, history: [], trace: [],
    };
  }
  function createLesson() {
    let state = initial();
    const snapshot = () => freeze(copy(state));
    const requirePhase = (expected, action) => {
      if (state.phase !== expected) throw new Error(`${action} requires ${expected} phase.`);
    };
    function open(input) {
      requirePhase('idle', 'Open old page');
      const selected = configuration(input);
      if (state.history.length >= fixtures.maxAttempts) throw new Error('History full: reset explicitly.');
      const baseline = renderOldResponse(fixtures.baseline);
      state.configuration = selected;
      state.baseline = { status: 200, body: JSON.stringify(fixtures.baseline), view: baseline.view };
      state.phase = 'opened';
      state.trace = [{
        step: 1, event: 'old-page-opened',
        detail: `Frontend v1 consumes id, displayName and unreadCount. Baseline: ${baseline.view}.`,
      }];
      return snapshot();
    }
    function run() {
      requirePhase('opened', 'Run candidate');
      const selected = state.configuration;
      const observedCount = { complete: 3, partial: 1, none: 0 }[selected.observation];
      const journeys = fixtures.journeys.map((fixture, index) => {
        if (index >= observedCount) {
          return {
            request: fixture.request, path: fixture.path, status: null, body: null, view: null,
            verdict: 'UNKNOWN', reason: 'Candidate response not observed; status, shape and rendering are unknown.',
          };
        }
        const response = fixture[selected.response];
        const rendered = renderOldResponse(response.body);
        const correct = rendered.ok && ['id', 'displayName', 'unreadCount']
          .every((field) => rendered.value[field] === fixture.expected[field]);
        const passed = response.status === 200 && correct;
        const reason = response.status !== 200 ? 'Unexpected HTTP status.'
          : !rendered.ok ? rendered.reason : !correct ? 'Rendered fields differ from the expected journey.' : null;
        return {
          request: fixture.request, path: fixture.path, status: response.status,
          body: JSON.stringify(response.body), view: rendered.view, verdict: passed ? 'PASS' : 'FAIL', reason,
        };
      });
      const metrics = {
        planned: journeys.length,
        observed: observedCount,
        http200: journeys.filter((row) => row.status === 200).length,
        rendered: journeys.filter((row) => row.verdict === 'PASS').length,
        failed: journeys.filter((row) => row.verdict === 'FAIL').length,
        unobserved: journeys.filter((row) => row.verdict === 'UNKNOWN').length,
      };
      const gate = metrics.failed ? 'FAIL' : metrics.unobserved ? 'UNKNOWN' : 'PASS';
      const lastObserved = journeys.filter((row) => row.verdict !== 'UNKNOWN').at(-1);
      const preview = !lastObserved ? 'No candidate response observed.'
        : lastObserved.verdict === 'PASS' ? lastObserved.view : 'Old frontend cannot render the observed response.';
      state.current = {
        attempt: state.history.length + 1, gate,
        impact: { PASS: 'uninterrupted', FAIL: 'interrupted', UNKNOWN: 'unknown' }[gate],
        metrics, preview, journeys,
      };
      state.phase = 'complete';
      state.history.push({ configuration: copy(selected), result: copy(state.current), prediction: null });
      state.trace.push({
        step: 2, event: 'new-api-selected',
        detail: `New API ${selected.response} fixture selected; same /api/profile, unchanged frontend v1. No network request.`,
      });
      for (const row of journeys) {
        state.trace.push({
          step: state.trace.length + 1, event: `journey-${row.verdict.toLowerCase()}`,
          detail: `Request ${row.request}: ${row.status === null ? 'status unknown' : `HTTP ${row.status}`}; ${row.verdict}. ${row.reason || row.view}`,
        });
      }
      return snapshot();
    }
    function predict(expected) {
      requirePhase('complete', 'Check prediction');
      if (state.prediction) throw new Error('Prediction already checked; start a new attempt to predict again.');
      if (!['uninterrupted', 'interrupted', 'unknown'].includes(expected)) {
        throw new Error('Invalid prediction: choose uninterrupted, interrupted or unknown.');
      }
      state.prediction = {
        expected, actual: state.current.impact, verdict: expected === state.current.impact ? 'PASS' : 'FAIL',
      };
      state.history.at(-1).prediction = copy(state.prediction);
      return snapshot();
    }
    function next() {
      requirePhase('complete', 'New attempt');
      if (state.history.length >= fixtures.maxAttempts) {
        throw new Error('History full: eight results retained. Reset explicitly to clear them.');
      }
      state = { ...initial(), history: state.history };
      return snapshot();
    }
    function reset() {
      state = initial();
      return snapshot();
    }
    return Object.freeze({ snapshot, open, run, predict, next, reset });
  }
  return Object.freeze({ createLesson, renderOldResponse });
}));
