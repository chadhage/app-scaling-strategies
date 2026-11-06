'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { UsageError } = require('../errors.cjs');
const { normalizePattern, hasMagic, globToRegExp, compileGlob, matchesGlob, MAX_PATTERN_LENGTH } = require('../glob.cjs');

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

test('the **/ group matches nothing or any folders that end with a separator, ** matches anything and the exports agree', () => {
  const cases = [
    ['**/x.cjs', 'x.cjs', true], ['**/x.cjs', 'a/b/x.cjs', true], ['**/x.cjs', 'a/bx.cjs', false], ['a**/x.cjs', 'ax.cjs', true], ['a**/x.cjs', 'a/x.cjs', true],
    ['a**/x.cjs', 'abc/d/x.cjs', true], ['**/', '', true], ['**/', 'a/', true], ['**/', 'a', false], ['**', 'a/b/c', true], ['a**b', 'a/x/b', true], ['a**b', 'a/x/c', false],
    ['*/**/z', 'a/z', true], ['*/**/z', 'a/b/c/z', true], ['***', 'a/b', true], ['a/*', 'a/b/c', false], ['a/*', 'a/b', true], ['*', '', true], ['?', '', false], ['?', '/', false],
    ['a?c', 'abc', true], ['a?c', 'a/c', false]
  ];
  for (const [pattern, input, expected] of cases) {
    assert.equal(compileGlob(pattern).test(input), expected, `${pattern} against ${JSON.stringify(input)}`);
  }
  assert.equal(globToRegExp, compileGlob, 'the old name still works and returns the same linear matcher');
  assert.equal(compileGlob('a\\b/*.cjs').pattern, 'a/b/*.cjs');
  assert.equal(compileGlob('1?').test(12), true, 'the input is read as text');
});

test('the work is bounded: a pattern has a length limit and a long name with many stars is matched in time', () => {
  assert.equal(MAX_PATTERN_LENGTH, 1024);
  assert.doesNotThrow(() => compileGlob('a'.repeat(MAX_PATTERN_LENGTH)));
  assert.throws(() => compileGlob('a'.repeat(MAX_PATTERN_LENGTH + 1)), (error) => error instanceof UsageError && /at most 1024 characters/.test(error.message));
  const started = process.hrtime.bigint();
  assert.equal(compileGlob(`${'*a'.repeat(10)}*b.cjs`).test(`${'a'.repeat(20000)}.cjs`), false);
  assert.equal(compileGlob(`${'**/'.repeat(20)}x.cjs`).test(`${'a/'.repeat(5000)}q.cjs`), false);
  assert.equal(Number(process.hrtime.bigint() - started) / 1e6 < 5000, true, 'linear in pattern times name, never exponential');
});
