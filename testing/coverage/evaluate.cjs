'use strict';

const { COVERAGE_METRICS, percentOf, meetsMinimum } = require('./report.cjs');

const SCHEMA = 'U009-coverage-gate/1';
// The table that Node prints rounds to two decimals; a difference beyond that rounding means one of the two readings is wrong.
const TABLE_TOLERANCE = 0.0051;

function formatPercent(counts) {
  return percentOf(counts).toFixed(4).replace(/\.?0+$/, '');
}

function describeMiss(metric, counts, min) {
  return `${metric} ${formatPercent(counts)}% (${counts.covered} of ${counts.total}) is below ${min}`;
}

// A run that failed, timed out or found no tests fails every file it covers, whatever the coverage says.
function judgeRun({ run, summary, timeoutMs }) {
  if (run.spawnError) return `could not start node: ${run.spawnError}`;
  if (run.timedOut) return `timed out after ${timeoutMs / 1000} s: the child process tree this gate started was ended`;
  if (run.signal) return `node was ended by signal ${run.signal}`;
  if (summary === null) {
    const hint = String(run.stderr || '').split(/\r?\n/).find((line) => line.trim() !== '');
    return `no test summary in the output, so no test ran${hint ? ` (stderr: ${hint.trim().slice(0, 160)})` : ''}`;
  }
  if (summary.tests === 0) return 'no tests found: Node ran 0 tests';
  if (summary.fail > 0 || summary.cancelled > 0) return `${summary.fail + summary.cancelled} test(s) failed or were cancelled`;
  if (summary.pass === 0) return 'no test passed';
  if (run.status !== 0 && run.status !== 1) return `node exited with code ${run.status}`;
  return null;
}

function disagreements(counts, table) {
  return COVERAGE_METRICS
    .filter((metric) => Math.abs(percentOf(counts[metric]) - table[metric]) > TABLE_TOLERANCE)
    .map((metric) => `${metric} ${formatPercent(counts[metric])}% in lcov but ${table[metric]} in the table`);
}

// One verdict for one production file: `record` is the lcov record (undefined when no test loaded the file) and `table` the matching row of the
// table that Node printed in the same run (null when absent).
function evaluateFile({ file, min, command, timeoutMs, run, summary, failedTests = [], record, table = null, lcovError = null }) {
  const loaded = record !== undefined;
  const counts = loaded ? { lines: record.lines, branches: record.branches, functions: record.functions } : null;
  const problems = [];
  const runProblem = judgeRun({ run, summary, timeoutMs });
  if (runProblem !== null) problems.push(runProblem);
  if (runProblem === null && lcovError !== null) problems.push(`the lcov report is unusable: ${lcovError}`);
  else if (runProblem === null && !loaded) problems.push('not loaded by any test: Node prints no row for it, so it counts as 0 percent (L-0003)');
  if (loaded) {
    for (const metric of COVERAGE_METRICS) {
      if (!meetsMinimum(counts[metric], min)) problems.push(describeMiss(metric, counts[metric], min));
    }
    if (table !== null && runProblem === null) {
      const different = disagreements(counts, table);
      if (different.length > 0) problems.push(`lcov and the table Node printed disagree: ${different.join('; ')}`);
    }
    if (problems.length === 0 && run.status !== 0) {
      problems.push(`node exited ${run.status} although the exact counts meet ${min}: Node's own thresholds disagree with the lcov counts`);
    }
  }
  return {
    file,
    lines: loaded ? percentOf(counts.lines) : 0,
    branches: loaded ? percentOf(counts.branches) : 0,
    functions: loaded ? percentOf(counts.functions) : 0,
    loaded,
    ok: problems.length === 0,
    reason: problems.length === 0 ? null : problems.join('; '),
    counts: loaded ? {
      lines: [counts.lines.covered, counts.lines.total],
      branches: [counts.branches.covered, counts.branches.total],
      functions: [counts.functions.covered, counts.functions.total]
    } : null,
    table,
    command,
    nodeExit: run.status ?? null,
    tests: summary === null ? null : summary.tests,
    failedTests
  };
}

// A file whose tests could not even be started (missing test file, no tests): fails with the reason, never skipped.
function unrunFile({ file, reasons }) {
  return {
    file, lines: 0, branches: 0, functions: 0, loaded: false, ok: false, reason: reasons.join('; '),
    counts: null, table: null, command: null, nodeExit: null, tests: null, failedTests: []
  };
}

function buildReport({ root, node, min, files, unclassified, excluded, skippedDirectories, warnings, tests, filters, timeoutMs }) {
  const errors = [];
  if (files.length === 0) errors.push('no production files were enumerated, so nothing was measured: a gate over nothing is not a pass');
  return {
    schema: SCHEMA,
    root,
    node,
    min,
    files,
    unclassified,
    excluded,
    skippedDirectories,
    tests,
    filters,
    timeoutMs,
    warnings,
    errors,
    pass: errors.length === 0 && unclassified.length === 0 && files.every((entry) => entry.ok)
  };
}

function formatSummary(report) {
  const lines = [`U009 coverage gate: root ${report.root}, minimum ${report.min}, node ${report.node}`];
  lines.push(`enumerated production files (${report.files.length}): ${report.files.map((entry) => entry.file).join(', ') || 'none'}`);
  if (report.excluded.length > 0) {
    const counts = new Map();
    for (const entry of report.excluded) counts.set(entry.by, (counts.get(entry.by) || 0) + 1);
    lines.push(`excluded (${report.excluded.length}): ${[...counts].map(([by, count]) => `${count} by ${by}`).join(', ')}`);
  }
  for (const entry of report.files) {
    const figure = (value) => value.toFixed(2).padStart(6);
    lines.push(`  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.file}  lines ${figure(entry.lines)}  branches ${figure(entry.branches)}  functions ${figure(entry.functions)}` +
      `${entry.reason === null ? '' : `  <- ${entry.reason}`}`);
  }
  for (const entry of report.unclassified) lines.push(`  UNCLASSIFIED  ${entry.file}  <- ${entry.reason}`);
  for (const message of [...report.warnings, ...report.errors]) lines.push(`  note: ${message}`);
  lines.push(report.pass ? 'RESULT: PASS' : 'RESULT: FAIL');
  return lines;
}

module.exports = Object.freeze({ SCHEMA, formatPercent, judgeRun, evaluateFile, unrunFile, buildReport, formatSummary });
