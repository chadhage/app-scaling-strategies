'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonInput } = require('../json-input.js');
const fixture = require('../synthetic-fixture.js');

test('rejects precision-losing integer-looking JSON before numeric coercion hides it', () => {
  const parsed = parseJsonInput('{"load":{"requestsPerSecond":1.00000000000000001}}', 'envelope');
  assert.equal(parsed.value, null);
  assert.ok(parsed.errors.some((error) =>
    error.path === 'envelope.load.requestsPerSecond' && error.code === 'UNSAFE_NUMBER_LITERAL'));
});

test('rejects duplicate JSON keys rather than hiding earlier unknown fields', () => {
  const parsed = parseJsonInput('{"load":{"unknown":true},"lo\\u0061d":{"requestsPerSecond":10}}', 'envelope');
  assert.equal(parsed.value, null);
  assert.ok(parsed.errors.some((error) => error.path === 'envelope.load' && error.code === 'DUPLICATE_FIELD'));
});

test('reports malformed, missing, and excessively nested JSON explicitly', () => {
  for (const [text, code] of [
    ['', 'REQUIRED_JSON'], ['{', 'INVALID_JSON'], ['{"load":1,}', 'INVALID_JSON'],
    [`${'['.repeat(18)}0${']'.repeat(18)}`, 'INPUT_DEPTH_EXCEEDED']
  ]) {
    const parsed = parseJsonInput(text, 'limits');
    assert.equal(parsed.value, null);
    assert.ok(parsed.errors.some((error) => error.code === code));
  }
});

test('accepts fixture objects and exact safe integer numeric literals', () => {
  for (const key of ['envelope', 'limits']) {
    const parsed = parseJsonInput(JSON.stringify(fixture[key]), key);
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.value, fixture[key]);
  }
  for (const literal of ['0', '1', '-1', '1.0', '10e-1', '0.01e2', '1e2', '9007199254740991', '0.0e999999']) {
    const parsed = parseJsonInput(`{"value":${literal}}`, 'envelope');
    assert.deepEqual(parsed.errors, [], literal);
    assert.equal(parsed.value.value, Number(literal));
  }
});

test('rejects unsafe source numeric literals even when JSON.parse rounds to an integer', () => {
  for (const literal of ['-0', '-0.0', '1.5', '1.00000000000000001', '9007199254740991.1',
    '9007199254740993', '1e9999', '1e-9999', '0.00000000000000001e-9999']) {
    const parsed = parseJsonInput(`{"value":${literal}}`, 'envelope');
    assert.equal(parsed.value, null, literal);
    assert.ok(parsed.errors.some((error) => error.code === 'UNSAFE_NUMBER_LITERAL'), literal);
  }
});

test('does not interpret strings as numeric tokens or mutate object prototypes', () => {
  const parsed = parseJsonInput('{"label":"{\\"x\\":1.5}, 1e9999","__proto__":{"approved":true}}', 'limits');
  assert.deepEqual(parsed.errors, []);
  assert.equal(Object.hasOwn(parsed.value, '__proto__'), true);
  assert.equal({}.approved, undefined);
});
