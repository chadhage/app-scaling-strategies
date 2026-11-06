'use strict';

// Mutation check for the U009 fix run (R2-U009; an evidence tool, not production code). Every mutant changes one expression of one production file in a scratch
// copy of the namespace and must make a NAMED ASSERTION fail (m7 of the independent review: a mutant that only makes subtests cancel or the run time out is
// not counted as killed). A baseline over the unmodified copy must pass first.
// Usage (repository root): node testing\coverage\evidence\fix\mutation\mutants.cjs --scratch <dir> [--only id,id] [--check]
//   --check  only verifies that every `find` occurs exactly once, applies nothing and runs no test.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { first } = require('./mutants.first.cjs');
const { fixes } = require('./mutants.list.cjs');

const namespace = path.resolve(__dirname, '..', '..', '..');
const argument = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const scratchValue = argument('--scratch');
const checkOnly = process.argv.includes('--check');
if (!scratchValue && !checkOnly) {
  console.error('Usage: node mutants.cjs --scratch <dir> [--only id,id] [--check]');
  process.exit(2);
}
const scratchRoot = scratchValue ? path.resolve(scratchValue) : null;
const only = argument('--only') ? argument('--only').split(',') : null;
const mutants = [...first, ...fixes].filter((mutant) => only === null || only.includes(mutant.id));

// An own NODE_V8_COVERAGE set to undefined: child_process would otherwise copy the parent's value into a child whose env object lacks the key.
const cleanEnvironment = () => {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'].includes(name.toUpperCase())) environment[name] = value;
  }
  environment.NODE_V8_COVERAGE = undefined;
  return environment;
};

function prepare(id) {
  const root = path.join(scratchRoot, id);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(namespace, path.join(root, 'testing', 'coverage'), { recursive: true, filter: (source) => !['evidence', '.scratch'].includes(path.basename(source)) });
  return root;
}

function runTests(root, tests) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests.map((name) => path.join('testing', 'coverage', 'tests', name))], {
    cwd: root, env: cleanEnvironment(), encoding: 'utf8', timeout: 300000, windowsHide: true, maxBuffer: 64 * 1024 * 1024
  });
  const stdout = run.stdout || '';
  const summary = (key) => Number(new RegExp(`^# ${key} (\\d+)`, 'm').exec(stdout)?.[1]);
  return {
    exit: run.status, timedOut: Boolean(run.error && run.error.code === 'ETIMEDOUT'), tests: summary('tests'), failed: summary('fail'), cancelled: summary('cancelled'),
    assertionFailures: (stdout.match(/code: 'ERR_ASSERTION'/g) || []).length,
    failedTests: [...new Set([...stdout.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1]))].slice(0, 6)
  };
}

const how = (outcome) => {
  if (outcome.timedOut) return 'timeout';
  if (outcome.exit === 0) return 'survived';
  if (outcome.failed >= 1 && outcome.assertionFailures >= 1) return 'assertion';
  return outcome.failed >= 1 ? 'failure-without-assertion' : 'cancelled-only';
};

const sourceOf = (mutant) => fs.readFileSync(path.join(namespace, mutant.file), 'utf8');
if (checkOnly) {
  const bad = mutants.filter((mutant) => sourceOf(mutant).split(mutant.find).length - 1 !== 1).map((mutant) => mutant.id);
  console.log(JSON.stringify({ checked: mutants.length, notExactlyOnce: bad }, null, 2));
  process.exit(bad.length === 0 ? 0 : 1);
}

const allTests = [...new Set(mutants.flatMap((mutant) => mutant.tests))];
const baselineRoot = prepare('baseline');
console.error(`baseline: ${allTests.length} test files`);
// A timing test can fail on a machine that other jobs saturate; the unmodified copy gets up to three attempts, every attempt is recorded.
const attempts = [];
let baseline;
do {
  baseline = runTests(baselineRoot, allTests);
  attempts.push({ exit: baseline.exit, tests: baseline.tests, failed: baseline.failed, failedTests: baseline.failedTests });
  console.error(`baseline attempt ${attempts.length}: exit ${baseline.exit}${baseline.exit === 0 ? '' : ` failed ${baseline.failedTests.join(' | ')}`}`);
} while (baseline.exit !== 0 && attempts.length < 3);
fs.rmSync(baselineRoot, { recursive: true, force: true });
const results = [];
if (baseline.exit === 0) {
  for (const mutant of mutants) {
    const root = prepare(mutant.id);
    const target = path.join(root, 'testing', 'coverage', mutant.file);
    const source = fs.readFileSync(target, 'utf8');
    const occurrences = source.split(mutant.find).length - 1;
    if (occurrences !== 1) {
      results.push({ id: mutant.id, file: mutant.file, applied: false, occurrences, killed: false });
    } else {
      fs.writeFileSync(target, source.replace(mutant.find, () => mutant.replace));
      const outcome = runTests(root, mutant.tests);
      const killedBy = how(outcome);
      results.push({ id: mutant.id, file: mutant.file, applied: true, tests: mutant.tests, killedBy, killed: killedBy === 'assertion', exit: outcome.exit, failed: outcome.failed, cancelled: outcome.cancelled, assertionFailures: outcome.assertionFailures, failedTests: outcome.failedTests });
    }
    console.error(`${mutant.id}: ${results[results.length - 1].killedBy || 'not applied'}`);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const killed = results.filter((result) => result.killed).length;
const survivors = results.filter((result) => !result.killed).map((result) => result.id);
console.log(JSON.stringify({ tool: 'U009 fix mutation check', node: process.version, baseline: { exit: baseline.exit, tests: baseline.tests, failed: baseline.failed, attempts }, total: results.length, killed, survivors, results }, null, 2));
process.exitCode = baseline.exit === 0 && results.length === mutants.length && killed === results.length ? 0 : 1;
