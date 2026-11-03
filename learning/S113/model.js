'use strict';

((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S113Model = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const freeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const CONTRACT = freeze({
    sourceRegion: 'region-amber', destinationRegion: 'region-violet',
    requiredCapacityUnits: 4, requiredCheckpoint: 42, sourceEpoch: 7, destinationEpoch: 8,
    journeyBudgetMs: 120, maxRuns: 7, maxHistoryEvents: 35,
  });
  const ACTION_LABELS = freeze({
    begin: 'Begin independent fixture', warm: 'Read warm-capacity data',
    sync: 'Read synchronized-state data', handoff: 'Check exclusive-writer handoff',
    migrate: 'Migrate fictional traffic',
  });
  const FIXTURES = freeze([
    { id: 'ready', label: 'Ready capacity, synchronized state, fenced writer and good journeys' },
    { id: 'cold', label: 'Cold destination — insufficient warm capacity' },
    { id: 'stale', label: 'Stale required state checkpoint' },
    { id: 'split', label: 'Source writer not fenced — two eligible writers' },
    { id: 'missing', label: 'Missing capacity, state and fence observations' },
    { id: 'route-lag', label: 'Exclusive writer but one route still uses source' },
    { id: 'journey-failure', label: 'Converged routes but one failed mutating journey' },
  ]);
  const goodSamples = [
    { id: 'profile-read', route: 'region-violet', response: 'ok', latencyMs: 36, session: true, effects: 0 },
    { id: 'session-write', route: 'region-violet', response: 'ok', latencyMs: 61, session: true, effects: 1 },
  ];
  const ready = {
    warm: true, units: 4, checkpoint: 42, sessions: true,
    sourceFenced: true, destinationEpoch: 8, eligibleWriters: 1, samples: goodSamples,
  };
  const DATA = freeze({
    ready,
    cold: { ...ready, warm: false, units: 1 },
    stale: { ...ready, checkpoint: 40 },
    split: { ...ready, sourceFenced: false, eligibleWriters: 2 },
    missing: {
      warm: null, units: null, checkpoint: null, sessions: null,
      sourceFenced: null, destinationEpoch: null, eligibleWriters: null, samples: null,
    },
    'route-lag': { ...ready, samples: [{ ...goodSamples[0], route: 'region-amber' }, goodSamples[1]] },
    'journey-failure': { ...ready, samples: [goodSamples[0],
      { ...goodSamples[1], response: 'failed', latencyMs: 145, session: false, effects: 0 }] },
  });
  class LessonError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'LessonError';
      this.code = code;
    }
  }
  const issuedStates = new WeakSet();
  const issue = (state) => {
    freeze(state);
    issuedStates.add(state);
    return state;
  };
  const guardState = (state) => {
    if (!issuedStates.has(state)) throw new LessonError('ERR_S113_STATE', 'State is not an issued immutable rehearsal state. Reset the lesson.');
  };
  const guardInput = (input) => {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      throw new LessonError('ERR_S113_INPUT', 'An action must be a plain typed record.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) {
      throw new LessonError('ERR_S113_INPUT', 'Action fields must be ordinary string-keyed data values.');
    }
    if (typeof input.action !== 'string' || !Object.hasOwn(ACTION_LABELS, input.action)) {
      throw new LessonError('ERR_S113_INPUT', 'Unknown action. Use a listed operator action.');
    }
    const expected = input.action === 'begin' ? ['action', 'fixtureId'] : ['action'];
    const keys = Reflect.ownKeys(input).sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw new LessonError('ERR_S113_INPUT', 'Unexpected or missing action fields.');
    }
    if (input.action === 'begin' && (typeof input.fixtureId !== 'string' || !Object.hasOwn(DATA, input.fixtureId))) {
      throw new LessonError('ERR_S113_INPUT', 'Unknown fixture. Choose a listed fixed teaching trace.');
    }
  };
  const combine = (results) => results.includes('negative') ? 'negative'
    : results.includes('unknown') ? 'unknown' : 'positive';
  const measured = (values, passes) => values.includes(null) ? 'unknown' : passes ? 'positive' : 'negative';
  const show = (value) => value === null ? 'UNKNOWN' : typeof value === 'boolean' ? value ? 'YES' : 'NO' : String(value);
  const initialCurrent = (fixtureId) => ({
    fixtureId, capacity: null, state: null, fence: null, routes: null, journeys: null,
    handoff: 'unverified', owner: CONTRACT.sourceRegion, ownerEpoch: CONTRACT.sourceEpoch,
    evacuation: 'UNVERIFIED', evacuated: false, sourceRetained: true,
  });
  const createState = () => issue({ version: 1, runCount: 0, phase: 'idle', current: null, history: [] });
  const append = (state, phase, current, action, result, detail, runCount = state.runCount) => {
    if (state.history.length >= CONTRACT.maxHistoryEvents) throw new LessonError('ERR_S113_BUDGET', 'Retained history is full. Reset before another action.');
    return issue({ version: 1, runCount, phase, current, history: [...state.history, {
      index: state.history.length + 1, run: runCount, fixtureId: current.fixtureId, action, result, detail,
    }] });
  };
  const controls = (state) => {
    guardState(state);
    const begin = ['idle', 'complete'].includes(state.phase) && state.runCount < CONTRACT.maxRuns;
    return freeze({ begin, fixture: begin, warm: state.phase === 'warm', sync: state.phase === 'sync',
      handoff: state.phase === 'handoff', migrate: state.phase === 'migrate', reset: true });
  };
  const step = (state, input) => {
    guardState(state);
    guardInput(input);
    const { action } = input;
    if (action === 'begin') {
      if (!['idle', 'complete'].includes(state.phase)) throw new LessonError('ERR_S113_ORDER', 'Finish the current fixture or reset before beginning another.');
      if (state.runCount >= CONTRACT.maxRuns) throw new LessonError('ERR_S113_BUDGET', 'Seven runs are the declared limit. Reset before another fixture.');
      return append(state, 'warm', initialCurrent(input.fixtureId), action, 'unknown',
        'Independent fixed fixture begun. Readiness, fencing, routes and journeys are not yet observed.', state.runCount + 1);
    }
    if (state.phase !== action) throw new LessonError('ERR_S113_ORDER', `Action ${ACTION_LABELS[action]} is out of order. Complete the enabled prerequisite first.`);
    const current = state.current;
    const data = DATA[current.fixtureId];
    if (action === 'warm') {
      const result = measured([data.warm, data.units], data.warm === true && data.units >= CONTRACT.requiredCapacityUnits);
      const detail = `Warm: ${show(data.warm)}; available units: ${show(data.units)}; required: ${CONTRACT.requiredCapacityUnits}. DATA ONLY.`;
      return append(state, 'sync', { ...current, capacity: { result, warm: data.warm, units: data.units, detail } },
        action, result, detail);
    }
    if (action === 'sync') {
      const result = measured([data.checkpoint, data.sessions], data.checkpoint === CONTRACT.requiredCheckpoint && data.sessions === true);
      const detail = `Destination checkpoint: ${show(data.checkpoint)}; required: ${CONTRACT.requiredCheckpoint}; sessions available: ${show(data.sessions)}. DATA ONLY.`;
      return append(state, 'handoff', { ...current, state: { result, checkpoint: data.checkpoint, sessions: data.sessions, detail } },
        action, result, detail);
    }
    if (action === 'handoff') {
      const prerequisites = combine([current.capacity.result, current.state.result]);
      const sourceFenced = prerequisites === 'positive' ? data.sourceFenced : null;
      const destinationEpoch = prerequisites === 'positive' ? data.destinationEpoch : null;
      const eligibleWriters = prerequisites === 'positive' ? data.eligibleWriters : null;
      const fenceResult = measured([sourceFenced, destinationEpoch, eligibleWriters],
        sourceFenced === true && destinationEpoch === CONTRACT.destinationEpoch && eligibleWriters === 1);
      const fenceDetail = prerequisites === 'positive'
        ? `Source epoch ${CONTRACT.sourceEpoch} fenced: ${show(sourceFenced)}; destination epoch: ${show(destinationEpoch)}; eligible writers: ${show(eligibleWriters)}. DATA ONLY.`
        : 'Writer handoff not attempted: warm-capacity/state prerequisites do not pass; fence and destination eligibility remain UNKNOWN. DATA ONLY.';
      const result = combine([current.capacity.result, current.state.result, fenceResult]);
      const approved = result === 'positive';
      const next = { ...current,
        fence: { result: fenceResult, sourceFenced, destinationEpoch, eligibleWriters, detail: fenceDetail },
        handoff: approved ? 'approved' : result === 'negative' ? 'blocked' : 'unverified',
        owner: approved ? CONTRACT.destinationRegion : CONTRACT.sourceRegion,
        ownerEpoch: approved ? CONTRACT.destinationEpoch : CONTRACT.sourceEpoch,
        evacuation: result === 'negative' ? 'BLOCKED' : 'UNVERIFIED',
      };
      const detail = approved
        ? 'Prerequisites pass. Only the fictional destination writer at epoch 8 is eligible; old epoch 7 is fenced. Routes and journeys still UNKNOWN. DATA ONLY.'
        : `${result === 'negative' ? 'Blocked' : 'Unverified'} handoff: retain the source owner and origin. No traffic migration. ${fenceDetail}`;
      return append(state, approved ? 'migrate' : 'complete', next, action, result, detail);
    }
    const samples = data.samples.map((sample) => ({
      ...sample, result: measured([sample.response, sample.latencyMs, sample.session, sample.effects],
        sample.response === 'ok' && sample.latencyMs <= CONTRACT.journeyBudgetMs && sample.session === true
          && sample.effects === (sample.id === 'session-write' ? 1 : 0)),
    }));
    const routeResult = combine(samples.map((sample) => sample.route === null ? 'unknown'
      : sample.route === CONTRACT.destinationRegion ? 'positive' : 'negative'));
    const journeyResult = combine(samples.map((sample) => sample.result));
    const successful = samples.filter((sample) => sample.result === 'positive').length;
    const interrupted = samples.filter((sample) => sample.result === 'negative').length;
    const unknown = samples.filter((sample) => sample.result === 'unknown').length;
    const effects = samples.some((sample) => sample.effects === null) ? null : samples.reduce((sum, sample) => sum + sample.effects, 0);
    const result = combine([routeResult, journeyResult]);
    const next = { ...current,
      routes: { result: routeResult, observed: samples.filter((sample) => sample.route !== null).length,
        detail: `Destination routes: ${samples.filter((sample) => sample.route === CONTRACT.destinationRegion).length}/2; exactly two fixed samples. DATA ONLY.` },
      journeys: { result: journeyResult, successful, interrupted, unknown, effects, samples,
        detail: `Successful: ${successful}; interrupted: ${interrupted}; unknown: ${unknown}; effects: ${show(effects)}; budget: ${CONTRACT.journeyBudgetMs} ms. DATA ONLY.` },
      evacuation: result === 'positive' ? 'VERIFIED' : result === 'negative' ? 'BLOCKED' : 'UNVERIFIED',
      evacuated: result === 'positive', sourceRetained: result !== 'positive',
    };
    const detail = result === 'positive'
      ? 'Fixture-scoped evacuation verified: warm capacity, required state, one fenced destination writer and both sampled journeys/routes pass. DATA ONLY, not a real regional result.'
      : `${result === 'negative' ? 'Negative' : 'Unknown'} evacuation: retain the source origin; destination remains the writer. Do not automatically restore a fenced source writer. ${next.journeys.detail}`;
    return append(state, 'complete', next, action, result, detail);
  };
  return freeze({ CONTRACT, ACTION_LABELS, FIXTURES, LessonError, createState, controls, step });
});
