(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S117Lesson = api;
})(globalThis, function () {
  'use strict';
  const INPUT_KEYS = ['fixtureId', 'journey', 'policy', 'samples'];
  const RAW_KEYS = ['fixtureId', 'journey', 'policy', 'sampleText'];
  const STATE_KEYS = ['version', 'phase', 'nextRun', 'history'];
  const FIXTURES = Object.freeze(['baseline', 'cedar-inventory-failure', 'missing-cedar-evidence', 'recovered']);
  const JOURNEYS = Object.freeze(['checkout', 'catalog']);
  const POLICIES = Object.freeze(['shallow', 'dependency-aware']);
  const MAX_HISTORY = 8;
  const LIMIT = 'All probes, dependencies, regions, network, authorization, state, failures, journeys, counts and times are fictional teaching data. No live Azure result, whole-region outage, native recovery budget or source-parent completion is proved.';

  function error(code, message, field = null) {
    const failure = new TypeError(message);
    failure.code = code;
    failure.field = field;
    return failure;
  }

  function record(value, keys, code) {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw error(code, 'Expected a plain, exact lesson record. Reset if lesson state is invalid.');
    }
    const names = Reflect.ownKeys(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (names.length !== keys.length || names.some(name => typeof name !== 'string' || !keys.includes(name)) ||
        keys.some(name => !Object.hasOwn(descriptors, name) || !Object.hasOwn(descriptors[name], 'value') || !descriptors[name].enumerable)) {
      throw error(code, 'Lesson records cannot contain missing, extra, inherited or accessor fields.');
    }
  }

  function freeze(value) {
    if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function checkInput(value) {
    record(value, INPUT_KEYS, 'ERR_LESSON_INPUT');
    for (const [field, choices] of [['fixtureId', FIXTURES], ['journey', JOURNEYS], ['policy', POLICIES]]) {
      if (typeof value[field] !== 'string' || !choices.includes(value[field])) {
        throw error('ERR_LESSON_INPUT', `Choose a listed ${field}; arbitrary values are not teaching fixtures.`, field);
      }
    }
    if (!Number.isInteger(value.samples) || value.samples < 1 || value.samples > 6) {
      throw error('ERR_LESSON_INPUT', 'Samples must be a typed integer from 1 through 6.', 'samples');
    }
    return { fixtureId: value.fixtureId, journey: value.journey, policy: value.policy, samples: value.samples };
  }

  function createState() {
    return freeze({ version: 1, phase: 'ready', nextRun: 1, history: [] });
  }

  function parseInput(raw) {
    record(raw, RAW_KEYS, 'ERR_LESSON_INPUT');
    if (typeof raw.sampleText !== 'string' || raw.sampleText.length !== 1 || !/^[1-6]$/.test(raw.sampleText)) {
      throw error('ERR_LESSON_INPUT', 'Enter one digit from 1 through 6; no spaces, fractions or coercions.', 'samples');
    }
    return checkInput({ fixtureId: raw.fixtureId, journey: raw.journey, policy: raw.policy, samples: Number(raw.sampleText) });
  }

  function checkData(value, depth = 0, budget = { remaining: 6000 }) {
    budget.remaining -= 1;
    if (depth > 10 || budget.remaining < 0) throw error('ERR_LESSON_STATE', 'Lesson state exceeds its bounded data shape. Reset lesson.');
    if (value === null || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 600)) return;
    if (typeof value !== 'object') throw error('ERR_LESSON_STATE', 'Lesson state must contain finite, plain teaching data. Reset lesson.');
    const names = Reflect.ownKeys(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 32 ||
          names.length !== value.length + 1 ||
          names.some(name => name !== 'length' && (typeof name !== 'string' || !/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length))) {
        throw error('ERR_LESSON_STATE', 'Lesson history must be a bounded, dense data array. Reset lesson.');
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[index];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
          throw error('ERR_LESSON_STATE', 'Lesson arrays cannot contain holes or accessors. Reset lesson.');
        }
        checkData(descriptor.value, depth + 1, budget);
      }
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype || names.length > 24 ||
        names.some(name => typeof name !== 'string' || !Object.hasOwn(descriptors[name], 'value') || !descriptors[name].enumerable)) {
      throw error('ERR_LESSON_STATE', 'Lesson state cannot contain prototypes, symbols or accessors. Reset lesson.');
    }
    for (const descriptor of Object.values(descriptors)) checkData(descriptor.value, depth + 1, budget);
  }

  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }

  function probe(region, inventory, journey) {
    const dependency = journey === 'checkout' ? inventory : 'available';
    const readiness = dependency === 'available' ? 'passed' : dependency === 'failed' ? 'failed' : 'unknown';
    return {
      region,
      label: region === 'cedar' ? 'Cedar (fictional)' : 'Maple (fictional)',
      httpStatus: 200,
      inventory,
      catalogCache: 'available',
      network: 'fixture-open',
      authorization: 'fixture-authorized',
      state: 'fixture-synchronized-v7',
      readiness,
      reason: `${journey === 'checkout' ? 'inventory' : 'catalog-cache'} evidence is ${dependency}; access and state fields are fixed fictional data.`
    };
  }

  function evaluate(phase, id, input) {
    if (input.fixtureId === 'recovered' && (phase !== 'investigating' || input.journey !== 'checkout' || input.policy !== 'dependency-aware')) {
      throw error('ERR_LESSON_STATE', 'Recovery needs earlier Cedar inventory-failure checkout data, checkout, and dependency-aware routing. Nothing changed.', 'fixtureId');
    }
    const inventory = input.fixtureId === 'cedar-inventory-failure' ? 'failed' :
      input.fixtureId === 'missing-cedar-evidence' ? 'unknown' : 'available';
    const probes = [probe('cedar', inventory, input.journey), probe('maple', 'available', input.journey)];
    const destination = input.policy === 'shallow' ? probes[0] : probes.find(candidate => candidate.readiness === 'passed');
    const selected = destination ? destination.region : null;
    const dependency = input.journey === 'checkout' ? 'inventory' : 'catalog-cache';
    const outcome = destination ? destination.readiness : 'unknown';
    const latencyMs = outcome === 'unknown' ? null : outcome === 'failed' ? 70 :
      input.journey === 'catalog' ? (selected === 'cedar' ? 18 : 21) : (selected === 'cedar' ? 42 : 49);
    const samples = Array.from({ length: input.samples }, (_, index) => ({
      sequence: index + 1,
      region: selected,
      journey: input.journey,
      dependency,
      outcome,
      latencyMs,
      identity: 'fictional-shopper',
      stateVersion: 7
    }));
    const metrics = {
      attempted: samples.length,
      completed: samples.filter(sample => sample.outcome === 'passed').length,
      failed: samples.filter(sample => sample.outcome === 'failed').length,
      unknown: samples.filter(sample => sample.outcome === 'unknown').length,
      syntheticElapsedMs: latencyMs === null ? null : latencyMs * samples.length
    };
    const diagnosis = {
      status: inventory === 'available' ? 'passed' : inventory,
      region: 'cedar',
      dependency: 'inventory',
      affectedPath: inventory === 'available' ? 'none (inventory evidence available)' : 'Cedar -> inventory -> checkout',
      scope: 'partial-regional-dependency-data'
    };
    const verdict = input.journey === 'checkout' && inventory === 'unknown' ? 'unknown' :
      metrics.failed > 0 ? 'negative' : metrics.unknown > 0 ? 'unknown' : 'positive';
    const route = {
      policy: input.policy,
      selected,
      reason: input.policy === 'shallow' ?
        'Both shallow samples are HTTP 200; this policy selects Cedar without consulting the business dependency.' :
        `Only passed journey readiness is eligible. ${selected === 'cedar' ? 'Cedar' : selected === 'maple' ? 'Maple' : 'No destination'} selected; unknown is not healthy.`
    };
    let message;
    if (verdict === 'unknown') {
      message = `Cedar inventory evidence is missing. ${metrics.completed}/${metrics.attempted} synthetic samples completed, ${metrics.unknown} remain unknown. A working alternate cannot certify Cedar recovery.`;
    } else if (input.journey === 'catalog') {
      message = `Cedar catalog cache remains available; ${metrics.completed}/${metrics.attempted} synthetic catalog samples completed. Inventory-only failure or missing evidence does not make catalog a failed journey.`;
    } else if (verdict === 'negative') {
      message = `Shallow HTTP 200 hid Cedar -> inventory -> checkout. ${metrics.failed}/${metrics.attempted} fictional checkout samples failed. Catalog cache remains available; this is not a whole-region outage.`;
    } else if (input.fixtureId === 'recovered') {
      message = `Recovered fixture data confirms Cedar inventory readiness and ${metrics.completed}/${metrics.attempted} checkout samples. Earlier interruption remains in history. No native synchronization, failback or recovery budget is proved.`;
    } else if (inventory === 'failed') {
      message = `Cedar inventory failed; dependency-aware routing selected Maple and ${metrics.completed}/${metrics.attempted} synthetic checkout samples completed. This does not erase the earlier failure or prove live recovery.`;
    } else {
      message = `Both inventory dependencies are available in the fixed data; Cedar completes ${metrics.completed}/${metrics.attempted} synthetic checkout samples.`;
    }
    const phaseAfter = input.fixtureId === 'recovered' ? 'recovered' :
      input.fixtureId === 'cedar-inventory-failure' && input.journey === 'checkout' ? 'investigating' : phase;
    return { id, input, phaseBefore: phase, phaseAfter, verdict, diagnosis, probes, route, samples, metrics, message, limit: LIMIT };
  }

  function checkState(value) {
    record(value, STATE_KEYS, 'ERR_LESSON_STATE');
    checkData(value);
    if (value.version !== 1 || !['ready', 'investigating', 'recovered'].includes(value.phase) ||
        !Number.isInteger(value.nextRun) || !Array.isArray(value.history) || value.history.length > MAX_HISTORY) {
      throw error('ERR_LESSON_STATE', 'Lesson version, phase or history is invalid. Reset lesson.');
    }
    let expected = createState();
    try {
      for (const saved of value.history) {
        const chosen = checkInput(saved.input);
        const result = evaluate(expected.phase, expected.nextRun, chosen);
        expected = { version: 1, phase: result.phaseAfter, nextRun: expected.nextRun + 1, history: [...expected.history, result] };
      }
    } catch {
      throw error('ERR_LESSON_STATE', 'Lesson history does not replay as fixed teaching data. Reset lesson.');
    }
    if (canonical(value) !== canonical(expected)) {
      throw error('ERR_LESSON_STATE', 'Lesson phase, counters or trace were altered. Reset lesson.');
    }
    return expected;
  }

  function rehearse(state, input) {
    const current = checkState(state);
    const chosen = checkInput(input);
    if (current.history.length === MAX_HISTORY) {
      throw error('ERR_LESSON_STATE', 'Eight-run history is full. Reset lesson to start another bounded rehearsal.');
    }
    const result = evaluate(current.phase, current.nextRun, chosen);
    return freeze({
      state: { version: 1, phase: result.phaseAfter, nextRun: current.nextRun + 1, history: [...current.history, result] },
      result
    });
  }

  return Object.freeze({ createState, parseInput, rehearse });
});
