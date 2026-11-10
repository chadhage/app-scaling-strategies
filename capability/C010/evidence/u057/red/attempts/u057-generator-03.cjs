'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');

function inspect(file, testsDirectory = path.dirname(file)) {
  const text = fs.readFileSync(file, 'utf8');
  const body = text.replace(/\nmain\(\);\s*$/, '\nreturn { all, sources, failing };');
  assert.notEqual(body, text, 'the real generator entry point is retained');
  const argv = [process.execPath, file, '--scratch', 'R:\\mutation-inspect', '--out', 'R:\\not-written.json'];
  return new Function('require', 'process', '__dirname', '__filename', body)(createRequire(path.join(testsDirectory, 'mutate-gen.cjs')), { ...process, argv }, testsDirectory, file);
}
const file = process.env.C010_U057_GENERATOR_SUBJECT ? path.resolve(process.env.C010_U057_GENERATOR_SUBJECT) : path.join(__dirname, 'mutate-gen.cjs');
const generator = inspect(file, process.env.C010_U057_GENERATOR_SUBJECT ? __dirname : path.dirname(file));
const failure = (name, code, type = 'testCodeFailure') => `# Subtest: ${name}\nnot ok 1 - ${name}\n  ---\n  failureType: '${type}'\n  code: '${code}'\n  ...\n# tests 1\n`;

test('U057 mutation kill classification accepts a named ERR_ASSERTION', () => {
  assert.deepEqual(generator.failing(failure('actual ownership assertion', 'ERR_ASSERTION')), ['actual ownership assertion']);
});

test('U057 a named behavioral limit-contract violation is not a file-level or environment fault', () => {
  assert.deepEqual(generator.failing(failure('a valid configured limit must build the server', 'LIMITS_INVALID')), ['a valid configured limit must build the server']);
});

for (const [label, text] of [
  ['a timeout is undecided, never a kill', failure('stalled test', 'ERR_TEST_FAILURE', 'testTimeoutFailure')],
  ['a missing module is not a kill', failure('module load failed', 'MODULE_NOT_FOUND')],
  ['a syntax fault is not a kill', failure('SyntaxError: invalid source', 'ERR_TEST_FAILURE')],
  ['a file-level failure is not a kill', failure('Q:\\capability\\C010\\tests\\commit.test.cjs', 'ERR_TEST_FAILURE')]
]) {
  test(`U057 ${label}`, () => assert.deepEqual(generator.failing(text), []));
}

if (!process.env.C010_U057_GENERATOR_SUBJECT) {
  test('U057 generator extension preserves every original 806 position and its replacement, plus four explicitly enumerated positions', () => {
    const original = inspect(path.join(__dirname, '..', 'evidence', 'u057', 'original', 'capability', 'C010', 'tests', 'mutate-gen.cjs'));
    const key = (item) => `${item.file}: ${item.label}`;
    const old = new Map(original.all.map((item) => [key(item), item]));
    const current = new Map(generator.all.map((item) => [key(item), item]));
    assert.equal(old.size, 806);
    for (const [name, position] of old) {
      assert.ok(current.has(name), `original position retained: ${name}`);
      const actual = current.get(name);
      assert.equal(actual.replacement, position.replacement, name);
      assert.equal(generator.sources.get(actual.file).slice(actual.start, actual.end), original.sources.get(position.file).slice(position.start, position.end), name);
    }
    const additions = generator.all.filter((item) => !old.has(key(item)));
    assert.equal(generator.all.length, 810);
    assert.deepEqual(additions.map((item) => [item.file, item.label, item.replacement]), [
      ['server.cjs', 'condition true @182:27', 'true'],
      ['server.cjs', 'condition false @182:27', 'false'],
      ['contract.js', 'number 2 plus one @9:45', '3'],
      ['contract.js', 'number 2 minus one @9:45', '1']
    ]);
  });
}
