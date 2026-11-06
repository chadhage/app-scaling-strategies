'use strict';

// The mutants of the first publication (evidence\mutation\mutants.cjs, 23 of them), carried over unchanged except for M17 (the glob matcher is no longer a
// translation to a RegExp: N10 in mutants.list.cjs replaces it) and M19 (the usage-error return moved one level deeper).
const first = [
  { id: 'M01-test-context-kept', file: 'command.cjs', find: "['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']", replace: "['NODE_V8_COVERAGE']",   tests: ['command.test.cjs'] },
  { id: 'M02-threshold-off-by-one', file: 'command.cjs', find: '`--test-coverage-branches=${min}`', replace: '`--test-coverage-branches=${min - 1}`', tests: ['command.test.cjs'] },
  { id: 'M03-vacuous-metric-is-zero', file: 'report.cjs', find: 'return total === 0 ? 100 :', replace: 'return total === 0 ? 0 :', tests: ['report.test.cjs', 'evaluate.test.cjs'] },
  { id: 'M04-rounded-comparison', file: 'report.cjs', find: 'return total === 0 || covered * 100 >= min * total;', replace: 'return total === 0 || Math.round((covered * 10000) / total) / 100 >= min;',   tests: ['report.test.cjs'] },
  { id: 'M05-inconsistent-lcov-accepted', file: 'report.cjs', find: '|| covered > total', replace: '|| false', tests: ['report.test.cjs'] },
  { id: 'M06-missing-summary-is-zero-tests', file: 'report.cjs', find: "typeof summary.tests === 'number' ?", replace: 'true ?', tests: ['report.test.cjs', 'gate.test.cjs'] },
  { id: 'M07-no-summary-passes', file: 'evaluate.cjs', find: 'if (summary === null) {', replace: 'if (summary === null) { return null; } if (false) {', tests: ['evaluate.test.cjs', 'gate.test.cjs'] },
  { id: 'M08-unloaded-passes', file: 'evaluate.cjs', find: 'else if (runProblem === null && !loaded) problems.push(', replace: 'else if (false) problems.push(',   tests: ['evaluate.test.cjs', 'gate.test.cjs'] },
  { id: 'M09-zero-tests-pass', file: 'evaluate.cjs', find: 'if (summary.tests === 0) return', replace: 'if (false) return', tests: ['evaluate.test.cjs'] },
  { id: 'M10-unclassified-ignored', file: 'evaluate.cjs', find: 'errors.length === 0 && unclassified.length === 0 &&', replace: 'errors.length === 0 &&',   tests: ['evaluate.test.cjs'] },
  { id: 'M11-empty-gate-passes', file: 'evaluate.cjs', find: 'if (files.length === 0) errors.push(', replace: 'if (false) errors.push(', tests: ['evaluate.test.cjs', 'gate.test.cjs'] },
  { id: 'M12-misses-ignored', file: 'evaluate.cjs', find: 'if (!meetsMinimum(counts[metric], min))', replace: 'if (false)',   tests: ['evaluate.test.cjs'] },
  { id: 'M13-verify-not-tooling', file: 'enumerate.cjs', find: '(?:verify|capture|seal|evidence-tool)', replace: '(?:capture|seal|evidence-tool)',   tests: ['enumerate.test.cjs'] },
  { id: 'M14-links-followed', file: 'enumerate.cjs', find: 'if (entry.isSymbolicLink()) {', replace: 'if (false) {', tests: ['enumerate.test.cjs'] },
  { id: 'M15-manifest-conflict-ignored', file: 'enumerate.cjs', find: 'if (excludeEntry && productionEntry) {', replace: 'if (false) {', tests: ['enumerate.test.cjs'] },
  { id: 'M16-exclusion-needs-no-reason', file: 'enumerate.cjs', find: "typeof entry.reason !== 'string' || entry.reason.trim() === ''", replace: "typeof entry.reason !== 'string'", tests: ['enumerate.test.cjs'] },
  { id: 'M18-environment-inherited', file: 'gate.cjs', find: 'env: buildEnvironment(deps.env, { TEMP: temp, TMP: temp, TMPDIR: temp })', replace: 'env: deps.env',   tests: ['gate.test.cjs'] },
  { id: 'M19-usage-error-exits-1', file: 'gate.cjs', find: '      return 2;', replace: '      return 1;',   tests: ['gate.test.cjs'] },
  { id: 'M20-failed-test-not-judged', file: 'evaluate.cjs', find: 'if (summary.fail > 0 || summary.cancelled > 0)', replace: 'if (false)',   tests: ['evaluate.test.cjs'] },
  { id: 'M21-table-disagreement-ignored', file: 'evaluate.cjs', find: 'if (different.length > 0) problems.push(', replace: 'if (false) problems.push(', tests: ['evaluate.test.cjs', 'gate.test.cjs'] },
  { id: 'M22-own-group-never-detached', file: 'runner.cjs', find: "detached: platform !== 'win32'", replace: 'detached: false', tests: ['runner.test.cjs'] },
  { id: 'M23-output-never-truncated', file: 'runner.cjs', find: 'if (out.size + chunk.length > maxBuffer) {', replace: 'if (false) {', tests: ['runner.test.cjs'] }
];

module.exports = Object.freeze({ first });
