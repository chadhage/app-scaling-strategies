'use strict';

// The closed, versioned input contract C042-reserve-capacity-input/1: a strict JSON reader (duplicate fields,
// prototype-related names, unsafe numbers, depth and size are typed failures) and a closed validator.
const crypto = require('node:crypto');
const contract = require('./contract.js');

const { ERRORS, LEASES, LIMITS, UNITS, INPUT_KEYS, KEY_PATTERN, STEP, SCHEMA_VERSION } = contract;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const STEP_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const WHITESPACE_ONLY = /^[ \t\n\r]*$/;

// Field names come from the caller: keep them printable and short before they appear in a typed detail.
const safePath = (raw) => String(raw).replace(/[^A-Za-z0-9_.$[\]-]/g, '?').slice(0, 64) || '$';
const detail = (path, code) => ({ path: safePath(path), code, message: ERRORS[code].message });

function parseRequestText(text) {
  const problems = [];
  const add = (path, code) => { if (problems.length < 16) problems.push(detail(path, code)); };
  const stop = (code) => { throw Object.assign(new Error(code), { typed: code }); };
  if (typeof text !== 'string') return { ok: false, problems: [detail('$', 'INVALID_JSON')] };
  if (text.length > LIMITS.bodyBytes) return { ok: false, problems: [detail('$', 'BODY_TOO_LARGE')] };
  if (WHITESPACE_ONLY.test(text)) return { ok: false, problems: [detail('$', 'REQUIRED_JSON')] };
  let index = 0;
  const white = () => { while (index < text.length && ' \t\n\r'.includes(text[index])) index += 1; };

  function string() {
    let end = index + 1;
    for (;;) {
      const char = text[end];
      if (char === undefined || char < ' ') stop('INVALID_JSON');
      if (char === '"') break;
      if (char !== '\\') { end += 1; continue; }
      const next = text[end + 1];
      if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(end + 2, end + 6))) end += 6;
      else if (next !== undefined && next !== 'u' && '"\\/bfnrt'.includes(next)) end += 2;
      else stop('INVALID_JSON');
    }
    const decoded = JSON.parse(text.slice(index, end + 1));
    index = end + 1;
    return decoded;
  }

  function object(path, depth) {
    index += 1;
    const result = Object.create(null);
    const seen = new Set();
    for (;;) {
      white();
      if (text[index] === '}' && seen.size === 0) { index += 1; return result; }
      if (text[index] !== '"') stop('INVALID_JSON');
      const key = string();
      const child = path === '$' ? key : `${path}.${key}`;
      if (seen.has(key)) add(child, 'DUPLICATE_FIELD');
      seen.add(key);
      if (FORBIDDEN.has(key)) add(child, 'FORBIDDEN_FIELD');
      white();
      if (text[index] !== ':') stop('INVALID_JSON');
      index += 1;
      const item = value(child, depth + 1);
      if (!FORBIDDEN.has(key)) result[key] = item;
      white();
      if (text[index] === '}') { index += 1; return result; }
      if (text[index] !== ',') stop('INVALID_JSON');
      index += 1;
    }
  }

  function array(path, depth) {
    index += 1;
    const result = [];
    for (;;) {
      white();
      if (text[index] === ']' && result.length === 0) { index += 1; return result; }
      result.push(value(`${path}[${result.length}]`, depth + 1));
      white();
      if (text[index] === ']') { index += 1; return result; }
      if (text[index] !== ',') stop('INVALID_JSON');
      index += 1;
    }
  }

  function value(path, depth) {
    white();
    if (depth > LIMITS.depth) stop('NESTING_TOO_DEEP');
    const char = text[index];
    if (char === '{') return object(path, depth);
    if (char === '[') return array(path, depth);
    if (char === '"') {
      const decoded = string();
      if (decoded.length > LIMITS.stringLength) add(path, 'STRING_TOO_LONG');
      return decoded;
    }
    const literal = /^(?:true|false|null)/.exec(text.slice(index, index + 5));
    if (literal) {
      index += literal[0].length;
      return { true: true, false: false, null: null }[literal[0]];
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index, index + 400));
    if (!number) stop('INVALID_JSON');
    index += number[0].length;
    if (/[.eE]/.test(number[0]) || number[0] === '-0' || !Number.isSafeInteger(Number(number[0]))) {
      add(path, 'UNSAFE_NUMBER');
      return null;
    }
    return Number(number[0]);
  }

  try {
    const parsed = value('$', 0);
    white();
    if (index !== text.length) stop('INVALID_JSON');
    return problems.length ? { ok: false, problems } : { ok: true, value: parsed };
  } catch (error) {
    if (!error.typed) throw error;
    return { ok: false, problems: [...problems, detail('$', error.typed)].slice(0, 16) };
  }
}

const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

function integerProblem(value) {
  if (typeof value !== 'number') return 'WRONG_TYPE';
  return !Number.isSafeInteger(value) || Object.is(value, -0) ? 'UNSAFE_NUMBER' : null;
}

function validateInput(value) {
  if (!plain(value)) return { ok: false, problems: [detail('$', 'INVALID_SHAPE')] };
  const problems = [];
  const add = (path, code) => { if (problems.length < 16) problems.push(detail(path, code)); };
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of INPUT_KEYS) if (!Object.hasOwn(descriptors, key)) add(key, 'REQUIRED_FIELD');
  for (const key of Reflect.ownKeys(descriptors)) {
    const text = typeof key === 'string' ? key : '$';
    if (typeof key !== 'string' || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) add(text, 'INVALID_SHAPE');
    else if (FORBIDDEN.has(key)) add(key, 'FORBIDDEN_FIELD');
    else if (!INPUT_KEYS.includes(key)) add(key, 'UNKNOWN_FIELD');
  }
  const field = (name) => (Object.hasOwn(descriptors, name) && Object.hasOwn(descriptors[name], 'value') ? descriptors[name].value : undefined);
  const present = (name) => Object.hasOwn(descriptors, name) && Object.hasOwn(descriptors[name], 'value');
  const unsupported = [];
  if (present('schemaVersion')) {
    const code = integerProblem(field('schemaVersion'));
    if (code) add('schemaVersion', code);
    else if (field('schemaVersion') !== SCHEMA_VERSION) unsupported.push('UNSUPPORTED_SCHEMA_VERSION');
  }
  if (present('step')) {
    if (typeof field('step') !== 'string') add('step', 'WRONG_TYPE');
    else if (!STEP_NAME.test(field('step'))) add('step', 'INVALID_FORMAT');
    else if (field('step') !== STEP) unsupported.push('UNSUPPORTED_STEP');
  }
  if (present('idempotencyKey')) {
    if (typeof field('idempotencyKey') !== 'string') add('idempotencyKey', 'WRONG_TYPE');
    else if (!KEY_PATTERN.test(field('idempotencyKey'))) add('idempotencyKey', 'INVALID_FORMAT');
  }
  if (present('leaseId')) {
    if (typeof field('leaseId') !== 'string') add('leaseId', 'WRONG_TYPE');
    else if (!Object.hasOwn(LEASES, field('leaseId'))) add('leaseId', 'FIELD_OUT_OF_RANGE');
  }
  if (present('units')) {
    const code = integerProblem(field('units'));
    if (code) add('units', code);
    else if (field('units') < UNITS.min || field('units') > UNITS.max) add('units', 'FIELD_OUT_OF_RANGE');
  }
  if (problems.length) return { ok: false, problems };
  if (unsupported.length) return { ok: false, problems: [], unsupported: unsupported[0] };
  return { ok: true, input: Object.freeze(Object.fromEntries(INPUT_KEYS.map((key) => [key, field(key)]))) };
}

function digestInput(input) {
  return crypto.createHash('sha256').update(JSON.stringify(INPUT_KEYS.map((key) => input[key]))).digest('hex');
}

// Bytes to a validated input or a typed failure; the byte order mark is kept so that it is refused as invalid JSON.
function parseBody(bytes) {
  if (bytes.length > LIMITS.bodyBytes) return { ok: false, problems: [detail('$', 'BODY_TOO_LARGE')] };
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { ok: false, problems: [detail('$', 'INVALID_ENCODING')] };
  }
  const parsed = parseRequestText(text);
  return parsed.ok ? validateInput(parsed.value) : parsed;
}

module.exports = Object.freeze({ parseRequestText, validateInput, parseBody, digestInput, safePath });
