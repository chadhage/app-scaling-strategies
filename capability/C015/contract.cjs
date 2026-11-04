'use strict';

const fixture = require('..\\C002\\synthetic-fixture.js');
const { createHash } = require('node:crypto');
const { validateRunEnvelope } = require('..\\C002\\validator.js');
const { parseJsonInput } = require('..\\C002\\json-input.js');

class FixtureError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = 'C015FixtureError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new FixtureError(code, message, details);
}

const runIds = Object.freeze(['synthetic-run-001', 'synthetic-run-002']);
const records = Object.freeze([
  Object.freeze({ status: 'prepared', completedStep: 'prepare', pendingStep: 'advance', acknowledgedUnits: 1 }),
  Object.freeze({ status: 'running', completedStep: 'advance', pendingStep: 'finish', acknowledgedUnits: 2 }),
  Object.freeze({ status: 'completed', completedStep: 'finish', pendingStep: 'none', acknowledgedUnits: 3 }),
]);

function makeState(runId, epoch) {
  if (!runIds.includes(runId)) fail('UNKNOWN_RUN_ID', 'Only the two closed C015 synthetic run IDs are supported.');
  if (!Number.isSafeInteger(epoch) || Object.is(epoch, -0) || epoch < 1 || epoch > records.length) {
    fail('UNKNOWN_EPOCH', 'The closed synthetic fixture has integer epochs 1, 2 and 3 only.');
  }
  return {
    schemaVersion: 1, cardId: 'C015', dataKind: 'closed-synthetic-fixture',
    runId, epoch, envelope: structuredClone(fixture.envelope),
    limits: structuredClone(fixture.limits), record: { ...records[epoch - 1] },
  };
}

function jsonData(value, path = '$', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return;
  if (!value || typeof value !== 'object' || ancestors.has(value) || ancestors.size >= 16) {
    fail('INVALID_JSON_DATA', `Expected finite, exact, acyclic JSON data at ${path}.`);
  }
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('INVALID_JSON_DATA', `Expected a plain JSON record at ${path}.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).filter((key) => !(Array.isArray(value) && key === 'length'));
  if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
    fail('INVALID_JSON_DATA', `Symbols, accessors and hidden fields are forbidden at ${path}.`);
  }
  if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index)))) {
    fail('INVALID_JSON_DATA', `Sparse or extended arrays are forbidden at ${path}.`);
  }
  ancestors.add(value);
  for (const key of keys) jsonData(descriptors[key].value, `${path}.${key}`, ancestors);
  ancestors.delete(value);
}

function closed(value, keys, path) {
  jsonData(value, path);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    fail('CLOSED_SCHEMA', `Missing or additional fields at ${path}; no defaults are supplied.`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function canonical(value) {
  jsonData(value);
  return canonicalJson(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

async function validateState(candidate, approval) {
  closed(candidate, ['schemaVersion', 'cardId', 'dataKind', 'runId', 'epoch', 'envelope', 'limits', 'record'], 'state');
  if (candidate.schemaVersion !== 1 || candidate.cardId !== 'C015' || candidate.dataKind !== 'closed-synthetic-fixture') {
    fail('STATE_VERSION_OR_SCOPE', 'Only C015 version 1 closed synthetic state is accepted.');
  }
  const expected = makeState(candidate.runId, candidate.epoch);
  const envelope = await validateRunEnvelope({ envelope: candidate.envelope, limits: candidate.limits }, approval);
  if (!envelope.valid) fail('INVALID_ENVELOPE', 'C002 rejected the reused versioned envelope.', envelope.errors);
  closed(candidate.record, Object.keys(expected.record), 'state.record');
  if (canonical(candidate) !== canonical(expected)) {
    fail('NON_SYNTHETIC_STATE', 'Only the exact closed synthetic records and C002 fixture values may be written.');
  }
  return structuredClone(candidate);
}

function makePersisted(state, previousStateSha256) {
  const stateSha256 = digest(state);
  return {
    formatVersion: 1, state, previousStateSha256, stateSha256,
    acknowledgment: {
      schemaVersion: 1, kind: 'local-file-write-receipt', runId: state.runId,
      epoch: state.epoch, stateSha256, regularFileFlushed: true, published: true,
    },
  };
}

async function validatePersisted(candidate, approval, previousStateSha256) {
  closed(candidate, ['formatVersion', 'state', 'previousStateSha256', 'stateSha256', 'acknowledgment'], 'file');
  if (candidate.formatVersion !== 1) fail('FILE_VERSION', 'Unknown persisted file format; migration is not implicit.');
  const state = await validateState(candidate.state, approval);
  const expected = makePersisted(state, previousStateSha256);
  if (candidate.stateSha256 !== expected.stateSha256) fail('STATE_DIGEST', 'Persisted state digest does not match the file data.');
  if (candidate.previousStateSha256 !== expected.previousStateSha256) fail('HISTORY_CHAIN', 'Epoch predecessor digest does not match retained history.');
  closed(candidate.acknowledgment, Object.keys(expected.acknowledgment), 'file.acknowledgment');
  if (canonical(candidate.acknowledgment) !== canonical(expected.acknowledgment)) {
    fail('ACKNOWLEDGMENT_MISMATCH', 'The persisted acknowledgment does not match the exact retained state.');
  }
  return structuredClone(candidate);
}

function parseStored(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {
    fail('INVALID_UTF8', 'Persisted bytes are not valid UTF-8.');
  }
  const parsed = parseJsonInput(text, 'file');
  if (parsed.errors.length) fail('CORRUPT_JSON', 'Persisted JSON is malformed, duplicated, too deep or numerically unsafe.', parsed.errors);
  return parsed.value;
}

module.exports = Object.freeze({
  FixtureError, fail, closed, jsonData, runIds, makeState, canonical, digest,
  validateState, makePersisted, validatePersisted, parseStored, maxBytes: 8192,
});
