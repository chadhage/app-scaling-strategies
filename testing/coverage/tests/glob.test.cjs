'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { UsageError } = require('../errors.cjs');
const { normalizePattern, hasMagic, globToRegExp, matchesGlob } = require('../glob.cjs');

test('* stays inside one path segment while ** crosses segments', () => {
  assert.equal(matchesGlob('a.cjs', '*.cjs'), true);
  assert.equal(matchesGlob('dir/a.cjs', '*.cjs'), false);
  assert.equal(matchesGlob('a.cjs', '**/*.cjs'), true);
  assert.equal(matchesGlob('x/y/a.cjs', '**/*.cjs'), true);
  assert.equal(matchesGlob('x/y/a.mjs', '**/*.cjs'), false);
  assert.equal(matchesGlob('fixtures/a/b/c.js', 'fixtures/**'), true);
  assert.equal(matchesGlob('fixtures', 'fixtures/**'), false);
});

test('? matches exactly one character and never a separator', () => {
  assert.equal(matchesGlob('a1.cjs', 'a?.cjs'), true);
  assert.equal(matchesGlob('a.cjs', 'a?.cjs'), false);
  assert.equal(matchesGlob('a/.cjs', 'a?.cjs'), false);
});

test('regular expression characters in a pattern stay literal', () => {
  assert.equal(matchesGlob('a.b', 'a.b'), true);
  assert.equal(matchesGlob('aXb', 'a.b'), false);
  assert.equal(matchesGlob('a+b', 'a+b'), true);
  assert.equal(matchesGlob('ab', 'a+b'), false);
  assert.equal(matchesGlob('a$b', 'a$b'), true);
  assert.equal(matchesGlob('a^b|c', 'a^b|c'), true);
});

test('backslashes are normalized to separators in the pattern and in the path', () => {
  assert.equal(normalizePattern('tests\\unit\\*.cjs'), 'tests/unit/*.cjs');
  assert.equal(matchesGlob('tests\\unit\\a.cjs', 'tests\\unit\\*.cjs'), true);
  assert.equal(matchesGlob('tests/unit/a.cjs', 'tests\\unit\\*.cjs'), true);
});

test('hasMagic is true only for * and ?', () => {
  assert.equal(hasMagic('tests/*.test.cjs'), true);
  assert.equal(hasMagic('tests/a?.test.cjs'), true);
  assert.equal(hasMagic('tests/a.test.cjs'), false);
});

test('an empty pattern and unsupported glob syntax are usage errors, never guessed', () => {
  assert.throws(() => globToRegExp(''), (error) => error instanceof UsageError && /empty/.test(error.message));
  for (const pattern of ['a[0-9].cjs', 'a{b,c}.cjs', 'a(b).cjs', '!a.cjs']) {
    assert.throws(() => globToRegExp(pattern), (error) => error instanceof UsageError && /Unsupported glob syntax/.test(error.message), pattern);
  }
});

test('UsageError carries its name and code', () => {
  const error = new UsageError('x');
  assert.equal(error.name, 'UsageError');
  assert.equal(error.code, 'USAGE');
  assert.equal(error instanceof Error, true);
});
