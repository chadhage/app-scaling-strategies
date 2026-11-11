'use strict';

// The strict JSON reader: what JSON.parse lets through or rounds is a failure or an UNSAFE number here, and the reader is total on hostile text.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { UNSAFE, parseStrict } = require('../json.cjs');

const ok = (text, options) => { const result = parseStrict(text, options); assert.equal(result.ok, true, text); return result.value; };
const bad = (text, options) => assert.deepEqual(parseStrict(text, options), { ok: false }, text.slice(0, 40));

test('valid documents of every kind are read, with whitespace and escapes', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ok(' { "a" : [ 1 , -2 , 0 , "x" , true , false , null , { } , [ ] ] , "b" : { "c" : "d" } } \n\t\r'))), { a: [1, -2, 0, 'x', true, false, null, {}, []], b: { c: 'd' } });
  assert.equal(ok('"\\u0041\\n\\"\\\\\\/\\b\\f\\r\\t"'), 'A\n"\\/\b\f\r\t');
  assert.equal(ok('"ключ ✓"'), 'ключ ✓');
  assert.equal(ok('{}') instanceof Object, false, 'an object has no prototype');
  assert.equal(Object.getPrototypeOf(ok('{"a":{}}').a), null);
  for (const [text, value] of [['true', true], ['false', false], ['null', null], ['0', 0], ['-7', -7], ['""', ''], ['[]', []]]) assert.deepEqual(ok(text), value);
});

test('a duplicate member name is a failure at every level, whatever the values', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"a":1}', '{"a":{"b":1,"b":2}}', '[{"a":1,"a":2}]', '{"a":1,"b":2,"a":3}', '{"a\\u0062":1,"ab":2}']) bad(text);
  ok('{"a":{"a":1},"b":{"a":2}}');
});

test('a number is read only when it is a plain safe integer: everything else is UNSAFE', () => {
  for (const text of ['1.0', '1.5', '1e1', '1E1', '1e+1', '1e-1', '0.0', '-0', '-0.0', '9007199254740992', '9007199254740993', '-9007199254740992', `1${'0'.repeat(399)}`, '1e400', '123456789012345678901234567890']) {
    assert.equal(ok(text), UNSAFE, text);
  }
  for (const [text, value] of [['0', 0], ['7', 7], ['-7', -7], ['9007199254740991', 9007199254740991], ['-9007199254740991', -9007199254740991], ['10', 10]]) assert.equal(ok(text), value);
  assert.equal(typeof UNSAFE, 'symbol');
  assert.equal(ok('{"n":2.0}').n, UNSAFE);
});

test('malformed text of every kind fails and never throws', () => {
  for (const text of ['', ' ', '{', '}', '[', ']', '{"a"}', '{"a":}', '{"a":1,}', '[1,]', '[,1]', '{,}', '{"a" 1}', '{a:1}', "{'a':1}", '{"a":1}x', '{"a":1}{"b":2}', '01', '00', '-', '--1', '+1', '.5', '5.', '1e', '0x1',
    'NaN', 'Infinity', '-Infinity', 'undefined', 'tru', 'truee', 'nul', 'True', '"abc', '"a\nb"', '"a\u0001b"', '"\\x"', '"\\u12"', '"\\u12g4"', '"\\', '[1 2]', '{"a":1 "b":2}', '/*c*/1', '1//c', '\uFEFF1', '1\u00a0', '[1]\u0000']) bad(text);
});

test('nesting is limited by the depth option and deep hostile text cannot overflow the stack', () => {
  const nest = (levels) => '['.repeat(levels) + ']'.repeat(levels);
  ok(nest(7));
  bad(nest(8));
  ok(nest(4), { depth: 3 });
  bad(nest(5), { depth: 3 });
  ok('{"a":{"b":{"c":{"d":{"e":{"f":1}}}}}}');
  bad('{"a":{"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}}');
  bad('['.repeat(100000));
  bad(`{"a":${'['.repeat(100000)}`);
});

test('a member named like a prototype property is an ordinary own member of a prototype-less object', () => {
  const value = ok('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"toString":3}');
  assert.deepEqual(Object.keys(value), ['__proto__', 'constructor', 'toString']);
  assert.equal(Object.getPrototypeOf(value), null);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(value, '__proto__'), true);
});

test('long and wide inputs are read in one pass', () => {
  assert.equal(ok(`"${'x'.repeat(100000)}"`).length, 100000);
  const wide = `{${Array.from({ length: 2000 }, (_, n) => `"k${n}":${n}`).join(',')}}`;
  assert.equal(Object.keys(ok(wide)).length, 2000);
  assert.equal(ok(`[${'1,'.repeat(5000)}1]`).length, 5001);
});
