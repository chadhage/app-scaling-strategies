(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S105 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_RUNS = 6;
  const fixtures = [
    { id: 'matched', label: 'Destination observations match', permission: 'allowed', network: 'reachable' },
    { id: 'identity-denied', label: 'Destination principal denied', permission: 'denied', network: 'reachable' },
    { id: 'network-denied', label: 'Destination network blocked', permission: 'allowed', network: 'blocked' },
    { id: 'unobserved', label: 'Destination observations missing', permission: 'unknown', network: 'unknown' },
  ];
  const predictions = ['destination-bound', 'all-follow-sender'];
  const slots = freeze({
    sender: {
      application: { DISPLAY_LABEL: 'candidate-v2' },
      bound: { DATA_ALIAS: 'dataset-copper', identity: 'principal-copper', network: 'network-copper' },
    },
    destination: {
      application: { DISPLAY_LABEL: 'serving-v1' },
      bound: { DATA_ALIAS: 'dataset-cedar', identity: 'principal-cedar', network: 'network-cedar' },
    },
  });

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function reject(code, message) {
    const error = new Error(message);
    error.name = 'LessonError';
    error.code = code;
    throw error;
  }

  function record(value, fields, code) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      reject(code, 'Expected a plain data record.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))
        || keys.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      reject(code, 'Unexpected, missing, symbolic or accessor fields are not accepted.');
    }
  }

  function command(value, stateEvent = false) {
    const descriptor = value && typeof value === 'object'
      ? Object.getOwnPropertyDescriptor(value, 'type') : null;
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') {
      reject(stateEvent ? 'STATE_EVENT' : 'COMMAND_TYPE', 'Action type must be an explicit string.');
    }
    const type = descriptor.value;
    const code = stateEvent ? 'STATE_EVENT' : 'COMMAND_SHAPE';
    if (type === 'swap') {
      record(value, ['type', 'fixture', 'prediction'], code);
      if (typeof value.fixture !== 'string' || !fixtures.some((fixture) => fixture.id === value.fixture)) {
        reject(stateEvent ? 'STATE_EVENT' : 'FIXTURE', 'Choose one of the four fixed fictional fixtures.');
      }
      if (typeof value.prediction !== 'string' || !predictions.includes(value.prediction)) {
        reject(stateEvent ? 'STATE_EVENT' : 'PREDICTION', 'Choose an explicit movement prediction.');
      }
    } else if (type === 'observe' || (type === 'reset' && !stateEvent)) {
      record(value, ['type'], code);
    } else {
      reject(stateEvent ? 'STATE_EVENT' : 'COMMAND_TYPE', 'Unsupported lesson action.');
    }
  }

  function validate(state) {
    record(state, ['version', 'events'], 'STATE_SHAPE');
    if (state.version !== 1) reject('STATE_VERSION', 'Unsupported lesson state version.');
    const events = state.events;
    if (!Array.isArray(events) || Object.getPrototypeOf(events) !== Array.prototype
        || events.length > 2 * MAX_RUNS
        || Reflect.ownKeys(events).length !== events.length + 1) {
      reject('STATE_HISTORY', 'History must be a dense, bounded array of lesson events.');
    }
    for (let index = 0; index < events.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(events, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        reject('STATE_HISTORY', 'History holes and accessors are not accepted.');
      }
      command(descriptor.value, true);
      if (descriptor.value.type !== (index % 2 === 0 ? 'swap' : 'observe')) {
        reject('STATE_ORDER', 'History must alternate a swap and its one explicit observation.');
      }
    }
  }

  function createState() {
    return freeze({ version: 1, events: [] });
  }

  function transition(state, action) {
    validate(state);
    command(action);
    if (action.type === 'reset') return createState();
    const pending = state.events.length % 2 === 1;
    if (action.type === 'observe' && !pending) {
      reject('OBSERVE_ORDER', 'Rehearse a swap before observing; each rehearsal is observed once.');
    }
    if (action.type === 'swap' && pending) {
      reject('SWAP_ORDER', 'Inspect the pending destination before starting another rehearsal.');
    }
    if (action.type === 'swap' && state.events.length / 2 >= MAX_RUNS) {
      reject('RUN_LIMIT', 'Six rehearsals reached. Reset explicitly to clear this retained history.');
    }
    return freeze({ version: 1, events: [...state.events.map((event) => ({ ...event })), { ...action }] });
  }

  function swapped(run, event) {
    const after = {
      sender: { application: { DISPLAY_LABEL: slots.destination.application.DISPLAY_LABEL }, bound: slots.sender.bound },
      destination: { application: { DISPLAY_LABEL: slots.sender.application.DISPLAY_LABEL }, bound: slots.destination.bound },
    };
    return {
      run, fixture: event.fixture, prediction: event.prediction,
      before: slots, after, predictionCorrect: null, result: 'unknown',
      access: {
        observed: false, outcome: 'unknown', permission: 'unknown', network: 'unknown',
        subject: after.destination.bound.identity, resource: after.destination.bound.DATA_ALIAS,
        via: after.destination.bound.network,
      },
    };
  }

  function observed(current) {
    const fixture = fixtures.find((entry) => entry.id === current.fixture);
    const outcome = fixture.permission === 'denied' || fixture.network === 'blocked' ? 'negative'
      : fixture.permission === 'unknown' || fixture.network === 'unknown' ? 'unknown' : 'positive';
    const predictionCorrect = current.prediction === 'destination-bound';
    return {
      ...current, predictionCorrect,
      access: { ...current.access, observed: true, outcome, permission: fixture.permission, network: fixture.network },
      result: predictionCorrect ? outcome : 'negative',
    };
  }

  function summarize(state) {
    validate(state);
    let current = null;
    let attempted = 0;
    let observations = 0;
    const counts = { positive: 0, negative: 0, unknown: 0 };
    const history = state.events.map((event, index) => {
      if (event.type === 'swap') current = swapped(++attempted, event);
      else {
        current = observed(current);
        observations++;
        counts[current.result]++;
      }
      return { step: index + 1, run: current.run, action: event.type, snapshot: current };
    });
    const pending = attempted - observations;
    return freeze({
      phase: pending ? 'pending-observation' : attempted ? 'observed' : 'initial',
      attempted, observed: observations, pending, counts, remaining: MAX_RUNS - attempted,
      initial: slots, current, history,
    });
  }

  return freeze({
    createState, transition, summarize,
    constants: {
      maxRuns: MAX_RUNS, fixtures, predictions,
      banner: 'Training rehearsal - synthetic data - not a live Azure result',
    },
  });
}));
