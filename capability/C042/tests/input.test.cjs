'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../contract.js');
const input = require('../input.cjs');
const { valid } = require('./support.cjs');

const base = JSON.stringify(valid());
const withUnits = (text) => base.replace('"units":5', text);
const codes = (verdict) => (verdict.problems ?? []).map((item) => item.code);
const parse = (text) => input.parseBody(Buffer.from(text));

test('a valid request is accepted as a frozen, ordered, closed object', () => {
  const verdict = parse(base);
  assert.equal(verdict.ok, true);
  assert.deepEqual(Object.keys(verdict.input), contract.INPUT_KEYS);
  assert.equal(Object.isFrozen(verdict.input), true);
  assert.deepEqual(verdict.input, valid());
  assert.equal(parse(`  \n${base}\t\r\n`).ok, true);
  for (const units of [1, 10]) assert.equal(parse(JSON.stringify(valid({ units }))).ok, true);
  assert.equal(parse(JSON.stringify(valid({ leaseId: 'synthetic-lease-002' }))).ok, true);
});

const hostile = [
  ['a missing field', () => JSON.stringify({ ...valid(), units: undefined }), 'REQUIRED_FIELD'],
  ['all fields missing', () => '{}', 'REQUIRED_FIELD'],
  ['an unknown field', () => JSON.stringify({ ...valid(), mode: 'fast' }), 'UNKNOWN_FIELD'],
  ['a duplicated field', () => withUnits('"units":5,"units":6'), 'DUPLICATE_FIELD'],
  ['a duplicate through an escape', () => withUnits('"units":5,"un\\u0069ts":6'), 'DUPLICATE_FIELD'],
  ['a nested duplicate', () => '{"a":{"b":1,"b":2}}', 'DUPLICATE_FIELD'],
  ['__proto__', () => withUnits('"units":5,"__proto__":{"units":1}'), 'FORBIDDEN_FIELD'],
  ['an escaped __proto__', () => withUnits('"units":5,"\\u005f_proto__":1'), 'FORBIDDEN_FIELD'],
  ['constructor', () => withUnits('"units":5,"constructor":1'), 'FORBIDDEN_FIELD'],
  ['prototype', () => withUnits('"units":5,"prototype":1'), 'FORBIDDEN_FIELD'],
  ['a nested __proto__', () => '{"a":{"__proto__":1}}', 'FORBIDDEN_FIELD'],
  ['units as a string', () => JSON.stringify(valid({ units: '5' })), 'WRONG_TYPE'],
  ['units as null', () => JSON.stringify(valid({ units: null })), 'WRONG_TYPE'],
  ['units as an object', () => JSON.stringify(valid({ units: {} })), 'WRONG_TYPE'],
  ['units as a fraction', () => withUnits('"units":5.5'), 'UNSAFE_NUMBER'],
  ['units written 5.0', () => withUnits('"units":5.0'), 'UNSAFE_NUMBER'],
  ['units with an exponent', () => withUnits('"units":1e1'), 'UNSAFE_NUMBER'],
  ['units 5E0', () => withUnits('"units":5E0'), 'UNSAFE_NUMBER'],
  ['negative zero', () => withUnits('"units":-0'), 'UNSAFE_NUMBER'],
  ['an overflow', () => withUnits('"units":1e400'), 'UNSAFE_NUMBER'],
  ['a number beyond the safe range', () => withUnits('"units":9007199254740993'), 'UNSAFE_NUMBER'],
  ['units 0', () => JSON.stringify(valid({ units: 0 })), 'FIELD_OUT_OF_RANGE'],
  ['units 11', () => JSON.stringify(valid({ units: 11 })), 'FIELD_OUT_OF_RANGE'],
  ['units -1', () => JSON.stringify(valid({ units: -1 })), 'FIELD_OUT_OF_RANGE'],
  ['an unknown lease', () => JSON.stringify(valid({ leaseId: 'synthetic-lease-003' })), 'FIELD_OUT_OF_RANGE'],
  ['a lease named like a prototype member', () => JSON.stringify(valid({ leaseId: 'toString' })), 'FIELD_OUT_OF_RANGE'],
  ['a numeric lease', () => JSON.stringify(valid({ leaseId: 1 })), 'WRONG_TYPE'],
  ['a key of 7 characters', () => JSON.stringify(valid({ idempotencyKey: 'abcdefg' })), 'INVALID_FORMAT'],
  ['a key of 65 characters', () => JSON.stringify(valid({ idempotencyKey: 'a'.repeat(65) })), 'INVALID_FORMAT'],
  ['a key with a trailing newline', () => JSON.stringify(valid({ idempotencyKey: 'key-0001-aaaa\n' })), 'INVALID_FORMAT'],
  ['a key with a look-alike letter', () => JSON.stringify(valid({ idempotencyKey: 'ｋey-0001-aaaa' })), 'INVALID_FORMAT'],
  ['a key that starts with a dot', () => JSON.stringify(valid({ idempotencyKey: '.key-0001-aaaa' })), 'INVALID_FORMAT'],
  ['a key as a number', () => JSON.stringify(valid({ idempotencyKey: 12345678 })), 'WRONG_TYPE'],
  ['a step with capitals', () => JSON.stringify(valid({ step: 'Reserve' })), 'INVALID_FORMAT'],
  ['a step as a number', () => JSON.stringify(valid({ step: 7 })), 'WRONG_TYPE'],
  ['a version as a string', () => JSON.stringify(valid({ schemaVersion: '1' })), 'WRONG_TYPE'],
  ['a version as a fraction', () => base.replace('"schemaVersion":1', '"schemaVersion":1.5'), 'UNSAFE_NUMBER'],
  ['a very long string', () => JSON.stringify(valid({ extra: 'x'.repeat(200) })), 'STRING_TOO_LONG'],
  ['an array body', () => '[]', 'INVALID_SHAPE'],
  ['a null body', () => 'null', 'INVALID_SHAPE'],
  ['a string body', () => '"text"', 'INVALID_SHAPE'],
  ['a number body', () => '5', 'INVALID_SHAPE'],
  ['an empty body', () => '', 'REQUIRED_JSON'],
  ['a whitespace-only body', () => ' \t\r\n ', 'REQUIRED_JSON'],
  ['truncated JSON', () => '{"schemaVersion":', 'INVALID_JSON'],
  ['a trailing comma in an object', () => '{"a":1,}', 'INVALID_JSON'],
  ['a trailing comma in an array', () => '[1,]', 'INVALID_JSON'],
  ['a missing comma', () => '{"a":1 "b":2}', 'INVALID_JSON'],
  ['a missing colon', () => '{"a" 1}', 'INVALID_JSON'],
  ['a key that is not a string', () => '{a:1}', 'INVALID_JSON'],
  ['trailing garbage', () => `${base} x`, 'INVALID_JSON'],
  ['two documents', () => `${base}${base}`, 'INVALID_JSON'],
  ['a leading zero', () => withUnits('"units":05'), 'INVALID_JSON'],
  ['a bare minus', () => withUnits('"units":-'), 'INVALID_JSON'],
  ['a bad literal', () => withUnits('"units":tru'), 'INVALID_JSON'],
  ['single quotes', () => "{'a':1}", 'INVALID_JSON'],
  ['a comment', () => `${base}//x`, 'INVALID_JSON'],
  ['a bad escape', () => '{"a":"\\x"}', 'INVALID_JSON'],
  ['a short unicode escape', () => '{"a":"\\u12"}', 'INVALID_JSON'],
  ['a raw control character in a string', () => '{"a":"\u0001"}', 'INVALID_JSON'],
  ['an unterminated string', () => '{"a":"x', 'INVALID_JSON'],
  ['a dangling escape', () => '{"a":"\\', 'INVALID_JSON'],
  ['a byte order mark', () => `\uFEFF${base}`, 'INVALID_JSON'],
  ['a no-break space', () => `\u00A0${base}`, 'INVALID_JSON'],
  ['a NUL character', () => `${base}\u0000`, 'INVALID_JSON'],
  ['nesting beyond the limit', () => '{"a":{"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}}', 'NESTING_TOO_DEEP'],
  ['deep arrays', () => `${'['.repeat(40)}${']'.repeat(40)}`, 'NESTING_TOO_DEEP'],
];

test('hostile text is a typed rejection, never an accepted input', () => {
  for (const [name, make, code] of hostile) {
    const verdict = parse(make());
    assert.equal(verdict.ok, false, name);
    assert.equal(verdict.problems[0].code, code, `${name}: ${JSON.stringify(verdict.problems)}`);
    assert.equal(verdict.unsupported, undefined, name);
    for (const item of verdict.problems) {
      assert.equal(item.message, contract.ERRORS[item.code].message);
      assert.match(item.path, /^[A-Za-z0-9_.$[\]?-]{1,64}$/);
    }
  }
});

test('bytes that are not text or are too large are refused before parsing', () => {
  for (const bytes of [[0xc3, 0x28], [0xc0, 0x80], [0x80], [0xed, 0xa0, 0x80], [0x7b, 0xff, 0x7d], [0xf8, 0x88, 0x80, 0x80, 0x80]]) {
    assert.deepEqual(codes(input.parseBody(Buffer.from(bytes))), ['INVALID_ENCODING']);
  }
  assert.deepEqual(codes(input.parseBody(Buffer.alloc(2049, 0x20))), ['BODY_TOO_LARGE']);
  assert.deepEqual(codes(input.parseRequestText(' '.repeat(2049))), ['BODY_TOO_LARGE']);
  assert.deepEqual(codes(input.parseRequestText(5)), ['INVALID_JSON']);
  assert.equal(input.parseBody(Buffer.from(`${base}${' '.repeat(2048 - base.length)}`)).ok, true);
});

test('an unsupported step or version is not a validation failure, and a malformed request wins over it', () => {
  assert.equal(parse(JSON.stringify(valid({ step: 'release-capacity' }))).unsupported, 'UNSUPPORTED_STEP');
  assert.equal(parse(JSON.stringify(valid({ schemaVersion: 2 }))).unsupported, 'UNSUPPORTED_SCHEMA_VERSION');
  assert.equal(parse(JSON.stringify(valid({ schemaVersion: 2, step: 'x-step' }))).unsupported, 'UNSUPPORTED_SCHEMA_VERSION');
  assert.deepEqual(codes(parse(JSON.stringify(valid({ schemaVersion: 2, units: 0 })))), ['FIELD_OUT_OF_RANGE']);
  assert.deepEqual(parse(JSON.stringify(valid({ step: 'release-capacity' }))).problems, []);
});

test('the object validator refuses non-plain, accessor, hidden and symbol-keyed inputs without running them', () => {
  let ran = false;
  const accessor = Object.defineProperty({ ...valid() }, 'units', { enumerable: true, get() { ran = true; return 5; } });
  assert.deepEqual(codes(input.validateInput(accessor)), ['INVALID_SHAPE']);
  assert.equal(ran, false);
  const hidden = Object.defineProperty({ ...valid() }, 'units', { enumerable: false, value: 5 });
  assert.deepEqual(codes(input.validateInput(hidden)), ['INVALID_SHAPE']);
  const symbol = { ...valid(), [Symbol('x')]: 1 };
  assert.deepEqual(codes(input.validateInput(symbol)), ['INVALID_SHAPE']);
  class Input {}
  for (const value of [null, undefined, [], new Map(), new Input(), 'text', 5, () => 1, Object.create({ units: 5 })]) {
    assert.deepEqual(codes(input.validateInput(value)), ['INVALID_SHAPE']);
  }
  const bare = Object.assign(Object.create(null), valid());
  assert.equal(input.validateInput(bare).ok, true);
  const polluted = JSON.parse('{"__proto__":{"units":1}}');
  assert.deepEqual(codes(input.validateInput(polluted)).slice(-1), ['FORBIDDEN_FIELD']);
  assert.equal(({}).units, undefined, 'no prototype pollution');
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`f${index}`, index]));
  assert.equal(input.validateInput(many).problems.length, 16);
  for (const units of [1.5, NaN, Infinity, -0, 2 ** 53]) assert.deepEqual(codes(input.validateInput(valid({ units }))), ['UNSAFE_NUMBER']);
  assert.deepEqual(codes(input.validateInput(valid({ schemaVersion: -0 }))), ['UNSAFE_NUMBER']);
});

test('the digest covers every field in the contract order and ignores property order', () => {
  const digest = input.digestInput(valid());
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(input.digestInput({ units: 5, leaseId: 'synthetic-lease-001', idempotencyKey: 'key-0001-aaaa', step: 'reserve-capacity', schemaVersion: 1 }), digest);
  for (const change of [{ units: 6 }, { leaseId: 'synthetic-lease-002' }, { idempotencyKey: 'key-0001-aaab' }, { step: 'other' }, { schemaVersion: 2 }]) {
    assert.notEqual(input.digestInput(valid(change)), digest);
  }
});

test('details never reflect hostile field names unchanged', () => {
  assert.equal(input.safePath('plain.name[0]'), 'plain.name[0]');
  assert.equal(input.safePath('<script>alert(1)</script>'), '?script?alert?1???script?');
  assert.equal(input.safePath('é\u0000\u202e'), '???');
  assert.equal(input.safePath('x'.repeat(100)).length, 64);
  assert.equal(input.safePath(''), '$');
  const verdict = parse(JSON.stringify({ ...valid(), '<img src=x onerror=1>': 1 }));
  assert.equal(verdict.problems[0].path, '?img?src?x?onerror?1?');
});
