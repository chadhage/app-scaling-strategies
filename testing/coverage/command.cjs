'use strict';

const path = require('node:path');
const { UsageError } = require('./errors.cjs');

// A nested "node --test" that inherits NODE_TEST_CONTEXT reports through the outer runner and exits 0 even when its test fails (L-0002);
// an inherited NODE_V8_COVERAGE would write into the outer coverage directory.
const INHERITED = Object.freeze(['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']);
// Characters that Node would read as glob syntax inside --test-coverage-include.
const GLOB_CHARACTERS = /[*?[\]{}()!]/;

function buildEnvironment(source, overrides = {}) {
  const environment = {};
  for (const [name, value] of Object.entries(source)) {
    if (!INHERITED.includes(name.toUpperCase())) environment[name] = value;
  }
  for (const [name, value] of Object.entries(overrides)) {
    for (const existing of Object.keys(environment)) {
      if (existing.toUpperCase() === name.toUpperCase()) delete environment[existing];
    }
    environment[name] = value;
  }
  return environment;
}

// What a person would type: relative to cwd with / separators when the file is inside cwd, otherwise absolute.
function argumentPath(cwd, target) {
  const relative = path.relative(cwd, target);
  const outside = relative === '' || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..';
  return (outside ? target : relative).replace(/\\/g, '/');
}

function includePattern(cwd, file) {
  const pattern = argumentPath(cwd, file);
  if (GLOB_CHARACTERS.test(pattern)) {
    throw new UsageError(`Node reads glob characters in --test-coverage-include literally as syntax, so ${pattern} cannot be measured: rename the file`);
  }
  return pattern;
}

function quote(value) {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

// One L-0004 command for one production file. `args` is what runs (it adds the tap and lcov reporters, which change no measurement);
// `canonical` is the same command without the reporters, ready to be replayed by hand from cwd.
function buildCommand({ cwd, file, tests, min, lcov }) {
  const measured = [
    '--test', '--test-concurrency=1', '--experimental-test-coverage', `--test-coverage-include=${includePattern(cwd, file)}`,
    `--test-coverage-lines=${min}`, `--test-coverage-branches=${min}`, `--test-coverage-functions=${min}`
  ];
  const testArguments = tests.map((test) => argumentPath(cwd, test));
  const reporters = ['--test-reporter=tap', '--test-reporter-destination=stdout', '--test-reporter=lcov', `--test-reporter-destination=${lcov}`];
  return {
    args: [...measured, ...reporters, ...testArguments],
    canonical: ['node', ...measured, ...testArguments].map(quote).join(' ')
  };
}

module.exports = Object.freeze({ INHERITED, buildEnvironment, argumentPath, includePattern, buildCommand });
