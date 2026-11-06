'use strict';

// Mutation check for U009 (evidence tool, not production code; it lives next to its archived result).
// Each mutant changes one expression of one production file in a scratch copy of the namespace and must make at least one named test file fail.
// A baseline run over the unmodified copy must pass, so a failing mutant run means the tests noticed the change.
// Usage (repository root): node testing\coverage\evidence\mutation\mutants.cjs --scratch <dir>
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const namespace = path.resolve(__dirname, '..', '..');
const scratchFlag = process.argv.indexOf('--scratch');
if (scratchFlag < 0 || !process.argv[scratchFlag + 1]) {
  console.error('Usage: node mutants.cjs --scratch <dir>');
  process.exit(2);
}
const scratchRoot = path.resolve(process.argv[scratchFlag + 1]);

const mutants = [
  { id: 'M01-test-context-kept', file: 'command.cjs', find: "['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']", replace: "['NODE_V8_COVERAGE']", tests: ['command.test.cjs', 'e2e.test.cjs'] },
  { id: 'M02-threshold-off-by-one', file: 'command.cjs', find: '`--test-coverage-branches=${min}`', replace: '`--test-coverage-branches=${min - 1}`', tests: ['command.test.cjs'] },
  { id: 'M03-vacuous-metric-is-zero', file: 'report.cjs', find: 'return total === 0 ? 100 :', replace: 'return total === 0 ? 0 :', tests: ['report.test.cjs', 'evaluate.test.cjs'] },
  { id: 'M04-rounded-comparison', file: 'report.cjs', find: 'return total === 0 || covered * 100 >= min * total;', replace: 'return total === 0 || Math.round((covered * 10000) / total) / 100 >= min;', tests: ['report.test.cjs', 'e2e.test.cjs'] },
  { id: 'M05-inconsistent-lcov-accepted', file: 'report.cjs', find: '|| covered > total', replace: '|| false', tests: ['report.test.cjs'] },
  { id: 'M06-missing-summary-is-zero-tests', file: 'report.cjs', find: "typeof summary.tests === 'number' ?", replace: 'true ?', tests: ['report.test.cjs', 'gate.test.cjs'] },
  { id: 'M07-no-summary-passes', file: 'evaluate.cjs', find: 'if (summary === null) {', replace: 'if (false) {', tests: ['evaluate.test.cjs', 'gate.test.cjs'] },
  { id: 'M08-unloaded-passes', file: 'evaluate.cjs', find: 'else if (runProblem === null && !loaded) problems.push(', replace: 'else if (false) problems.push(', tests: ['evaluate.test.cjs', 'gate.test.cjs', 'e2e.test.cjs'] },
  { id: 'M09-zero-tests-pass', file: 'evaluate.cjs', find: 'if (summary.tests === 0) return', replace: 'if (false) return', tests: ['evaluate.test.cjs'] },
  { id: 'M10-unclassified-ignored', file: 'evaluate.cjs', find: 'errors.length === 0 && unclassified.length === 0 &&', replace: 'errors.length === 0 &&', tests: ['evaluate.test.cjs', 'e2e.test.cjs'] },
  { id: 'M11-empty-gate-passes', file: 'evaluate.cjs', find: 'if (files.length === 0) errors.push(', replace: 'if (false) errors.push(', tests: ['evaluate.test.cjs', 'gate.test.cjs'] },
  { id: 'M12-misses-ignored', file: 'evaluate.cjs', find: 'if (!meetsMinimum(counts[metric], min))', replace: 'if (false)', tests: ['evaluate.test.cjs', 'e2e.test.cjs'] },
  { id: 'M13-verify-not-tooling', file: 'enumerate.cjs', find: '(?:verify|capture|seal|evidence-tool)', replace: '(?:capture|seal|evidence-tool)', tests: ['enumerate.test.cjs', 'e2e.test.cjs'] },
  { id: 'M14-links-followed', file: 'enumerate.cjs', find: 'if (entry.isSymbolicLink()) {', replace: 'if (false) {', tests: ['enumerate.test.cjs'] },
  { id: 'M15-manifest-conflict-ignored', file: 'enumerate.cjs', find: 'if (excludeEntry && productionEntry) {', replace: 'if (false) {', tests: ['enumerate.test.cjs'] },
  { id: 'M16-exclusion-needs-no-reason', file: 'enumerate.cjs', find: "typeof entry.reason !== 'string' || entry.reason.trim() === ''", replace: "typeof entry.reason !== 'string'", tests: ['enumerate.test.cjs'] },
  { id: 'M17-star-crosses-segments', file: 'glob.cjs', find: "source += '[^/]*';", replace: "source += '.*';", tests: ['glob.test.cjs'] },
  { id: 'M18-environment-inherited', file: 'gate.cjs', find: 'env: buildEnvironment(deps.env, { TEMP: temp, TMP: temp, TMPDIR: temp })', replace: 'env: deps.env', tests: ['gate.test.cjs', 'e2e.test.cjs'] },
  { id: 'M19-usage-error-exits-1', file: 'gate.cjs', find: '    return 2;', replace: '    return 1;', tests: ['gate.test.cjs', 'e2e.test.cjs'] },
  { id: 'M20-failed-test-not-judged', file: 'evaluate.cjs', find: 'if (summary.fail > 0 || summary.cancelled > 0)', replace: 'if (false)', tests: ['evaluate.test.cjs', 'e2e.test.cjs'] },
  { id: 'M21-table-disagreement-ignored', file: 'evaluate.cjs', find: 'if (different.length > 0) problems.push(', replace: 'if (false) problems.push(', tests: ['evaluate.test.cjs', 'gate.test.cjs'] },
  { id: 'M22-own-group-never-detached', file: 'runner.cjs', find: "detached: platform !== 'win32'", replace: 'detached: false', tests: ['runner.test.cjs'] },
  { id: 'M23-output-never-truncated', file: 'runner.cjs', find: 'if (out.size + chunk.length > maxBuffer) {', replace: 'if (false) {', tests: ['runner.test.cjs'] }
];

const cleanEnvironment = () => {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'].includes(name.toUpperCase())) delete environment[name];
  }
  return environment;
};

function prepare(id) {
  const root = path.join(scratchRoot, id);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(namespace, path.join(root, 'testing', 'coverage'), {
    recursive: true,
    filter: (source) => !['evidence', '.scratch'].includes(path.basename(source))
  });
  return root;
}

function runTests(root, tests) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests.map((name) => path.join('testing', 'coverage', 'tests', name))], {
    cwd: root, env: cleanEnvironment(), encoding: 'utf8', timeout: 300000, windowsHide: true, maxBuffer: 64 * 1024 * 1024
  });
  const summary = (key) => Number(new RegExp(`^# ${key} (\\d+)`, 'm').exec(run.stdout || '')?.[1]);
  return {
    exit: run.status, timedOut: Boolean(run.error && run.error.code === 'ETIMEDOUT'), tests: summary('tests'), failed: summary('fail'),
    failedTests: [...(run.stdout || '').matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]).slice(0, 5)
  };
}

const allTests = [...new Set(mutants.flatMap((mutant) => mutant.tests))];
const baselineRoot = prepare('baseline');
const baseline = runTests(baselineRoot, allTests);
const results = [];
for (const mutant of mutants) {
  const root = prepare(mutant.id);
  const target = path.join(root, 'testing', 'coverage', mutant.file);
  const source = fs.readFileSync(target, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    results.push({ id: mutant.id, file: mutant.file, applied: false, occurrences, killed: false });
    continue;
  }
  fs.writeFileSync(target, source.replace(mutant.find, () => mutant.replace));
  const outcome = runTests(root, mutant.tests);
  results.push({
    id: mutant.id, file: mutant.file, applied: true, tests: mutant.tests, exit: outcome.exit, timedOut: outcome.timedOut,
    killed: outcome.exit !== 0 && !outcome.timedOut, failed: outcome.failed, failedTests: outcome.failedTests
  });
  fs.rmSync(root, { recursive: true, force: true });
}
fs.rmSync(baselineRoot, { recursive: true, force: true });
const killed = results.filter((result) => result.killed).length;
const verdict = { tool: 'U009 mutation check', node: process.version, baseline: { exit: baseline.exit, tests: baseline.tests, failed: baseline.failed }, total: results.length, killed, results };
console.log(JSON.stringify(verdict, null, 2));
process.exitCode = baseline.exit === 0 && killed === results.length ? 0 : 1;
