(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S107 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_ATTEMPTS = 6;
  const policies = ['baseline', 'compatible', 'incompatible'];
  const origins = ['A', 'B'];
  const predictions = ['readable', 'cors-denied'];
  const receiptFields = ['attempt', 'runId', 'policy', 'origin', 'apiOrigin', 'method', 'status',
    'allowOrigin', 'finished', 'bodySHA256', 'bodyBytes'];
  const attemptFields = ['id', 'runId', 'policy', 'origin', 'prediction', 'mode', 'frontendOrigin',
    'apiOrigin', 'observation'];

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function reject(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function record(value, fields, code) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      reject(code, 'Expected a plain data record.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some(key => !fields.includes(key))
        || keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      reject(code, 'Missing, extra, symbolic and accessor fields are refused.');
    }
  }
  function literalOrigin(value) {
    if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value)) return false;
    const port = Number(value.substring(value.lastIndexOf(':') + 1));
    return Number.isInteger(port) && port <= 65535;
  }
  function isRunId(value) {
    return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
  }
  function validateCondition(value, code) {
    if (!policies.includes(value.policy) || !origins.includes(value.origin)
        || !predictions.includes(value.prediction) || !['static', 'http'].includes(value.mode)) {
      reject(code, 'Choose fixed policy, origin, prediction and observation mode.');
    }
    if (value.mode === 'static') {
      if (value.frontendOrigin !== null || value.apiOrigin !== null || value.runId !== null) reject(code, 'Static mode has no real origins or correlation ID.');
    } else if (!literalOrigin(value.frontendOrigin) || !literalOrigin(value.apiOrigin)
        || value.frontendOrigin === value.apiOrigin || !isRunId(value.runId)) {
      reject(code, 'HTTP mode requires distinct literal owned loopback origins.');
    }
  }
  function validateReceipt(value) {
    record(value, receiptFields, 'RECEIPT_SHAPE');
    if (!Number.isInteger(value.attempt) || value.attempt < 1 || value.attempt > MAX_ATTEMPTS || !isRunId(value.runId)
        || !policies.includes(value.policy) || !literalOrigin(value.origin) || !literalOrigin(value.apiOrigin)
        || value.origin === value.apiOrigin || value.method !== 'GET'
        || value.status !== 200 || value.finished !== true
        || (value.allowOrigin !== null && value.allowOrigin !== value.origin)
        || typeof value.bodySHA256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.bodySHA256)
        || !Number.isInteger(value.bodyBytes) || value.bodyBytes < 1 || value.bodyBytes > 1024) {
      reject('RECEIPT_VALUE', 'A receipt must describe one finished, bounded fixture HTTP response.');
    }
  }
  function validateObservation(value) {
    record(value, ['browser', 'receipt', 'cspBlocked', 'payloadVerified'], 'OBSERVATION_SHAPE');
    if (!['readable', 'blocked', 'not-measured'].includes(value.browser)
        || typeof value.cspBlocked !== 'boolean' || typeof value.payloadVerified !== 'boolean'
        || (value.browser !== 'readable' && value.payloadVerified)) {
      reject('OBSERVATION_VALUE', 'Observation flags must be typed and internally consistent.');
    }
    if (value.receipt !== null) validateReceipt(value.receipt);
    if (value.browser === 'not-measured' && (value.receipt !== null || value.cspBlocked || value.payloadVerified)) {
      reject('OBSERVATION_VALUE', 'An unmeasured attempt has no transport evidence.');
    }
  }
  function validate(state) {
    record(state, ['version', 'attempts', 'currentVisible'], 'STATE_SHAPE');
    if (state.version !== 1 || typeof state.currentVisible !== 'boolean') reject('STATE_VALUE', 'Unsupported state.');
    const entries = state.attempts;
    if (!Array.isArray(entries) || Object.getPrototypeOf(entries) !== Array.prototype
        || entries.length > MAX_ATTEMPTS || Reflect.ownKeys(entries).length !== entries.length + 1) {
      reject('STATE_HISTORY', 'History must be a dense bounded array; no eviction is allowed.');
    }
    for (let index = 0; index < entries.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(entries, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject('STATE_HISTORY', 'History holes/accessors are refused.');
      const entry = descriptor.value;
      record(entry, attemptFields, 'STATE_ATTEMPT');
      validateCondition(entry, 'STATE_ATTEMPT');
      if (entry.id !== index + 1) reject('STATE_ORDER', 'Attempt identity must be consecutive.');
      if (entry.observation === null) {
        if (index !== entries.length - 1 || !state.currentVisible) reject('STATE_ORDER', 'Only the visible last attempt may be pending.');
      } else {
        validateObservation(entry.observation);
        if (entry.mode === 'static' && entry.observation.browser !== 'not-measured') {
          reject('STATE_ATTEMPT', 'Static teaching cannot become a browser measurement.');
        }
      }
      if (index && (entry.mode !== entries[0].mode || (entry.mode === 'http'
          && ['origin', 'frontendOrigin', 'apiOrigin', 'runId'].some(key => entry[key] !== entries[0][key])))) {
        reject('STATE_ORIGIN', 'One HTTP journal belongs to one unchanged owned origin pair.');
      }
    }
    if (!entries.length && state.currentVisible) reject('STATE_ORDER', 'An empty journal has no current attempt.');
  }

  function createState() {
    return freeze({ version: 1, attempts: [], currentVisible: false });
  }
  function transition(state, action) {
    validate(state);
    const type = action && typeof action === 'object' ? Object.getOwnPropertyDescriptor(action, 'type') : null;
    if (!type || !Object.hasOwn(type, 'value')) reject('ACTION_SHAPE', 'Action needs an explicit data type.');
    const pending = state.attempts.at(-1)?.observation === null;
    if (type.value === 'reset') {
      record(action, ['type'], 'ACTION_SHAPE');
      if (pending) reject('ACTION_ORDER', 'Finish the pending attempt before resetting controls.');
      return freeze({ ...state, currentVisible: false });
    }
    if (type.value === 'begin') {
      record(action, ['type', 'policy', 'origin', 'prediction', 'mode', 'frontendOrigin', 'apiOrigin', 'runId'], 'ACTION_SHAPE');
      validateCondition(action, 'CONDITION');
      if (pending) reject('ACTION_ORDER', 'Finish the pending attempt first.');
      if (state.attempts.length >= MAX_ATTEMPTS) reject('HISTORY_LIMIT', 'Six attempts retained. Reset cannot discard them.');
      const { type: _type, ...condition } = action;
      const next = { version: 1, attempts: [...state.attempts, {
        id: state.attempts.length + 1, ...condition, observation: null,
      }], currentVisible: true };
      validate(next);
      return freeze(next);
    }
    if (type.value === 'complete') {
      record(action, ['type', 'observation'], 'ACTION_SHAPE');
      if (!pending) reject('ACTION_ORDER', 'An observation completes one pending attempt, exactly once.');
      validateObservation(action.observation);
      const observation = { ...action.observation,
        receipt: action.observation.receipt === null ? null : { ...action.observation.receipt } };
      const next = { ...state, attempts: state.attempts.map((entry, index) => index === state.attempts.length - 1
        ? { ...entry, observation } : entry) };
      validate(next);
      return freeze(next);
    }
    reject('ACTION_TYPE', 'Unsupported lesson action.');
  }
  function classify(entry) {
    const expected = entry.policy === 'incompatible' && entry.origin === 'B' ? 'cors-denied' : 'readable';
    const observation = entry.observation;
    let cors = 'unknown';
    const receipt = observation?.receipt;
    const matching = entry.mode === 'http' && receipt && receipt.attempt === entry.id && receipt.runId === entry.runId
      && receipt.policy === entry.policy && receipt.origin === entry.frontendOrigin
      && receipt.apiOrigin === entry.apiOrigin;
    if (matching && !observation.cspBlocked) {
      if (observation.browser === 'readable' && observation.payloadVerified
          && receipt.allowOrigin === entry.frontendOrigin) cors = 'browser-readable';
      else if (observation.browser === 'blocked' && receipt.allowOrigin === null) cors = 'cors-denied';
    }
    return {
      ...entry, expected, verifier: observation ? (entry.prediction === expected ? 'pass' : 'fail') : 'pending',
      cors, userImpact: cors === 'browser-readable' ? 'preserved' : cors === 'cors-denied' ? 'interrupted' : 'unknown',
      actualBrowserCORS: false,
      evidenceBasis: cors !== 'unknown' ? 'browser-fetch-plus-finished-server-receipt'
        : entry.mode === 'static' ? 'static-teaching-only' : 'insufficient-transport-evidence',
      qualification: 'This classifier is not empirical certification; the separate native browser run must corroborate receipts, CSP and Chromium CORS diagnostics.',
    };
  }
  function summarize(state) {
    validate(state);
    const history = state.attempts.map(classify);
    const counts = { attempted: history.length, educationPass: 0, educationFail: 0, pending: 0,
      readable: 0, corsDenied: 0, unknown: 0 };
    for (const entry of history) {
      if (entry.verifier === 'pass') counts.educationPass++;
      else if (entry.verifier === 'fail') counts.educationFail++;
      else counts.pending++;
      if (entry.cors === 'browser-readable') counts.readable++;
      else if (entry.cors === 'cors-denied') counts.corsDenied++;
      else counts.unknown++;
    }
    return freeze({ counts, history, remaining: MAX_ATTEMPTS - history.length,
      current: state.currentVisible ? history.at(-1) : null });
  }
  return freeze({ createState, transition, summarize, validateReceipt, literalOrigin, isRunId, constants: {
    maxAttempts: MAX_ATTEMPTS, policies, origins, predictions,
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
  } });
}));
