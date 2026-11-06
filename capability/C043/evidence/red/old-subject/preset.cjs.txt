'use strict';

// The closed preset contract C043-preset/1 on the Node side: one strict reader and validator for raw bytes, text and
// objects alike (an object is serialised and read again, so accessors, prototypes and later mutation cannot matter).
// Every step is validated by the accepted C042 validator and the frozen result of THAT validator is what runs.
const crypto = require('node:crypto');
const contract = require('./contract.js');
const validate = require('./validate.js');
const input = require('../C042/input.cjs');

const { LIMITS } = contract;
const detail = (path, code) => ({ path: input.safePath(path), code, message: contract.catalogEntry(code).message });
const fail = (code, problems, extra = {}) => ({ ok: false, code, problems, ...extra });

function stepProblems(step) {
  const checked = input.validateInput(step);
  if (checked.ok) return [];
  if (checked.unsupported) return [{ path: '', code: checked.unsupported }];
  return checked.problems.map(({ path, code }) => ({ path, code }));
}

function digestPreset(preset) {
  return crypto.createHash('sha256').update(JSON.stringify([
    preset.schemaVersion, preset.preset, preset.idempotencyKey, contract.BOUND_KEYS.map((key) => preset.bounds[key]),
    preset.steps.map((step) => input.digestInput(step)),
  ])).digest('hex');
}

// The bounds that are decidable from the declaration refuse before the first effect; the duration is measured by the runner.
function boundProblem(preset) {
  const { bounds, steps } = preset;
  if (steps.length > bounds.maxSteps) return { name: 'maxSteps', limit: bounds.maxSteps, observed: steps.length };
  const units = steps.reduce((total, step) => total + step.units, 0);
  return units > bounds.maxUnits ? { name: 'maxUnits', limit: bounds.maxUnits, observed: units } : null;
}

function readText(source) {
  if (typeof source === 'string') return { text: source };
  if (source instanceof Uint8Array) {
    if (source.length > LIMITS.bodyBytes) return { failure: fail('BODY_TOO_LARGE', [detail('$', 'BODY_TOO_LARGE')]) };
    try {
      return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(source) };
    } catch {
      return { failure: fail('INVALID_ENCODING', [detail('$', 'INVALID_ENCODING')]) };
    }
  }
  let text;
  try {
    text = JSON.stringify(source);
  } catch {
    text = undefined;
  }
  return typeof text === 'string' ? { text } : { failure: fail('INVALID_JSON', [detail('$', 'INVALID_JSON')]) };
}

function parsePreset(source) {
  const read = readText(source);
  if (read.failure) return read.failure;
  const parsed = input.parseRequestText(read.text);
  if (!parsed.ok) return fail(parsed.problems[0].code, parsed.problems);
  const shape = validate.validatePresetShape(parsed.value, stepProblems);
  if (!shape.ok && shape.problems.length) {
    const list = shape.problems.map((problem) => detail(problem.path, problem.code));
    return fail(list[0].code, list);
  }
  if (!shape.ok) return fail(shape.unsupported.code, [detail(shape.unsupported.path, shape.unsupported.code)]);
  const value = parsed.value;
  const preset = Object.freeze({
    schemaVersion: 1, preset: value.preset, idempotencyKey: value.idempotencyKey,
    bounds: Object.freeze(Object.fromEntries(contract.BOUND_KEYS.map((key) => [key, value.bounds[key]]))),
    steps: Object.freeze(value.steps.map((step) => input.validateInput(step).input)),
  });
  const sha256 = digestPreset(preset);
  const bound = boundProblem(preset);
  return bound ? fail('PRESET_BOUND_EXCEEDED', [], { preset, sha256, bound }) : { ok: true, preset, sha256 };
}

const step = (key, leaseId, units) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId, units });
const CATALOG = contract.freeze([
  {
    schemaVersion: 1, preset: 'three-small-reservations', idempotencyKey: 'demo-preset-0001', bounds: { maxSteps: 3, maxDurationMs: 5000, maxUnits: 15 },
    steps: [step('demo-p1-step-1', 'synthetic-lease-001', 5), step('demo-p1-step-2', 'synthetic-lease-001', 5), step('demo-p1-step-3', 'synthetic-lease-001', 5)],
  },
  {
    schemaVersion: 1, preset: 'fill-the-small-lease', idempotencyKey: 'demo-preset-0002', bounds: { maxSteps: 3, maxDurationMs: 5000, maxUnits: 20 },
    steps: [step('demo-p2-step-1', 'synthetic-lease-002', 6), step('demo-p2-step-2', 'synthetic-lease-002', 6), step('demo-p2-step-3', 'synthetic-lease-001', 5)],
  },
  {
    schemaVersion: 1, preset: 'over-the-unit-bound', idempotencyKey: 'demo-preset-0003', bounds: { maxSteps: 3, maxDurationMs: 5000, maxUnits: 25 },
    steps: [step('demo-p3-step-1', 'synthetic-lease-001', 10), step('demo-p3-step-2', 'synthetic-lease-001', 10), step('demo-p3-step-3', 'synthetic-lease-001', 10)],
  },
  {
    schemaVersion: 1, preset: 'tight-duration', idempotencyKey: 'demo-preset-0004', bounds: { maxSteps: 3, maxDurationMs: 1, maxUnits: 15 },
    steps: [step('demo-p4-step-1', 'synthetic-lease-001', 5), step('demo-p4-step-2', 'synthetic-lease-001', 5), step('demo-p4-step-3', 'synthetic-lease-001', 5)],
  },
]);

const catalogDocument = () => ({ schemaVersion: 1, kind: 'C043-preset-catalog', scope: contract.SCOPE, presets: CATALOG });

module.exports = Object.freeze({ LIMITS, CATALOG, catalogDocument, parsePreset, digestPreset, boundProblem });
