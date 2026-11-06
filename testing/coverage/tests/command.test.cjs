'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { UsageError } = require('../errors.cjs');
const { INHERITED, buildEnvironment, visibleEnvironment, argumentPath, includePattern, buildCommand } = require('../command.cjs');

const drive = path.parse(process.cwd()).root;
const cwd = path.join(drive, 'repo');

test('the child environment drops NODE_TEST_CONTEXT and NODE_V8_COVERAGE in any letter case and keeps everything else', () => {
  const source = { NODE_TEST_CONTEXT: 'child-v8', node_v8_coverage: 'C:\\cov', Node_Test_Context: 'x', PATH: 'p', Keep: '1' };
  const environment = buildEnvironment(source);
  assert.deepEqual(visibleEnvironment(environment), { PATH: 'p', Keep: '1' });
  assert.equal(source.NODE_TEST_CONTEXT, 'child-v8', 'the source environment is never mutated');
  assert.deepEqual([...INHERITED], ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']);
  assert.equal(Object.isFrozen(INHERITED), true);
});

test('NODE_V8_COVERAGE is an OWN property set to undefined, because spawn re-injects the parent value into an object without it (F1)', () => {
  const environment = buildEnvironment({ PATH: 'p', NODE_V8_COVERAGE: 'C:\\outer' });
  assert.equal(Object.hasOwn(environment, 'NODE_V8_COVERAGE'), true);
  assert.equal(environment.NODE_V8_COVERAGE, undefined);
  assert.equal('NODE_V8_COVERAGE' in visibleEnvironment(environment), false);
  assert.equal(Object.hasOwn(buildEnvironment({}), 'NODE_V8_COVERAGE'), true, 'also when the source never had one');
});

test('an explicit override of NODE_V8_COVERAGE is the caller\'s choice and replaces the undefined marker', () => {
  const environment = buildEnvironment({ node_v8_coverage: 'C:\\outer' }, { NODE_V8_COVERAGE: 'C:\\own' });
  assert.deepEqual(visibleEnvironment(environment), { NODE_V8_COVERAGE: 'C:\\own' });
});

test('overrides replace a variable of any letter case instead of duplicating it', () => {
  const environment = buildEnvironment({ Temp: 'a', TMP: 'b', X: '1' }, { TEMP: 'c', TMP: 'c', TMPDIR: 'c' });
  assert.deepEqual(visibleEnvironment(environment), { X: '1', TEMP: 'c', TMP: 'c', TMPDIR: 'c' });
});

test('argument paths are relative with / inside the cwd and absolute with / elsewhere', () => {
  assert.equal(argumentPath(cwd, path.join(cwd, 'capability', 'C031', 'cli.cjs')), 'capability/C031/cli.cjs');
  const outside = path.join(drive, 'elsewhere', 'x', 'lib.cjs');
  assert.equal(argumentPath(cwd, outside), outside.replace(/\\/g, '/'));
  assert.equal(argumentPath(cwd, path.join(cwd, '..', 'sibling', 'a.cjs')), path.join(drive, 'sibling', 'a.cjs').replace(/\\/g, '/'));
  assert.equal(argumentPath(cwd, cwd), cwd.replace(/\\/g, '/'));
});

test('a file name that Node would read as glob syntax cannot be measured and is a usage error', () => {
  assert.equal(includePattern(cwd, path.join(cwd, 'a', 'plain-name.cjs')), 'a/plain-name.cjs');
  for (const name of ['a(1).cjs', 'a[1].cjs', 'a{1}.cjs', 'a*.cjs', 'a?.cjs', 'a!.cjs']) {
    assert.throws(() => includePattern(cwd, path.join(cwd, name)), (error) => error instanceof UsageError && /cannot be measured: rename the file/.test(error.message), name);
  }
});

test('one command measures one file: the L-0004 thresholds, one include, the tap and lcov reporters, then the tests', () => {
  const lcov = path.join(drive, 'scratch', '0.lcov');
  const command = buildCommand({
    cwd, file: path.join(cwd, 'cap', 'C1', 'cli.cjs'), min: 85, lcov,
    tests: [path.join(cwd, 'cap', 'C1', 'tests', 'a.test.cjs'), path.join(cwd, 'cap', 'C1', 'tests', 'b b.test.cjs')]
  });
  assert.deepEqual(command.args, [
    '--test', '--test-concurrency=1', '--experimental-test-coverage', '--test-coverage-include=cap/C1/cli.cjs',
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85',
    '--test-reporter=tap', '--test-reporter-destination=stdout', '--test-reporter=lcov', `--test-reporter-destination=${lcov}`,
    'cap/C1/tests/a.test.cjs', 'cap/C1/tests/b b.test.cjs'
  ]);
  assert.equal(command.canonical,
    'node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=cap/C1/cli.cjs --test-coverage-lines=85 ' +
    '--test-coverage-branches=85 --test-coverage-functions=85 cap/C1/tests/a.test.cjs "cap/C1/tests/b b.test.cjs"');
  assert.equal(command.args.filter((argument) => argument.startsWith('--test-coverage-include=')).length, 1, 'never one command with several includes (L-0100)');
});

test('the minimum is passed to all three thresholds and quotes inside an argument are escaped in the canonical command', () => {
  const command = buildCommand({ cwd, file: path.join(cwd, 'a.cjs'), min: 70, lcov: 'x.lcov', tests: [path.join(cwd, 'say "hi".test.cjs')] });
  assert.deepEqual(command.args.filter((argument) => /^--test-coverage-(lines|branches|functions)=/.test(argument)),
    ['--test-coverage-lines=70', '--test-coverage-branches=70', '--test-coverage-functions=70']);
  assert.ok(command.canonical.endsWith('"say \\"hi\\".test.cjs"'));
});
