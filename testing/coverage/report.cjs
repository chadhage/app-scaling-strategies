'use strict';

const path = require('node:path');

const COVERAGE_METRICS = Object.freeze(['lines', 'branches', 'functions']);
const SUMMARY_KEYS = Object.freeze(['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']);

// Parses the lcov text that Node's lcov reporter writes. Every record must carry the six totals: a half-written
// report is an error, never a guess. Counts stay integers so the evaluation can be exact.
function parseLcov(text) {
  const records = [];
  let current = null;
  const fields = { LF: 'lines', LH: 'lines', BRF: 'branches', BRH: 'branches', FNF: 'functions', FNH: 'functions' };
  for (const raw of String(text).split(/\r?\n/)) {
    if (raw.startsWith('SF:')) {
      current = { file: raw.slice(3), lines: {}, branches: {}, functions: {} };
    } else if (raw === 'end_of_record') {
      if (current !== null) records.push(finishRecord(current));
      current = null;
    } else if (current !== null) {
      const match = /^(LF|LH|BRF|BRH|FNF|FNH):(\d+)$/.exec(raw);
      if (match) current[fields[match[1]]][match[1].endsWith('H') ? 'covered' : 'total'] = Number(match[2]);
    }
  }
  if (current !== null) throw new Error(`lcov record for ${current.file} has no end_of_record: the report is incomplete`);
  return records;
}

function finishRecord(record) {
  for (const metric of COVERAGE_METRICS) {
    const { covered, total } = record[metric];
    if (!Number.isInteger(covered) || !Number.isInteger(total) || covered > total) {
      throw new Error(`lcov record for ${record.file} has missing or inconsistent ${metric} totals`);
    }
  }
  return record;
}

// Node prints 100 for a metric with nothing to count (no functions, no branches); the gate follows that convention.
function percentOf({ covered, total }) {
  return total === 0 ? 100 : (covered * 100) / total;
}

// Exact comparison on integers: covered/total >= min/100 without any rounding.
function meetsMinimum({ covered, total }, min) {
  return total === 0 || covered * 100 >= min * total;
}

function samePath(left, right) {
  const compare = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
  return compare(path.resolve(left)) === compare(path.resolve(right));
}

// The record whose SF path (relative to the child's cwd) is the production file; undefined when no test loaded it.
function selectRecord(records, cwd, file) {
  return records.find((record) => samePath(path.resolve(cwd, record.file), file));
}

// TAP summary lines "# tests 3": null when the output has no summary at all (nothing ran, or the run was skipped by an inherited context).
function parseTapSummary(text) {
  const summary = {};
  for (const key of SUMMARY_KEYS) {
    const match = new RegExp(`^# ${key} (\\d+)\\s*$`, 'm').exec(text);
    if (match) summary[key] = Number(match[1]);
  }
  return typeof summary.tests === 'number' ? { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, ...summary } : null;
}

function parseTapFailures(text) {
  const names = [...String(text).matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim());
  return [...new Set(names)].slice(0, 10);
}

// Rows of the coverage table that Node prints (two decimals): used only to cross-check the lcov figures.
function parseTapTable(text) {
  return [...String(text).matchAll(/^# +(\S.*?) +\| +(\d+(?:\.\d+)?) +\| +(\d+(?:\.\d+)?) +\| +(\d+(?:\.\d+)?) +\|/gm)]
    .filter((match) => match[1] !== 'all files')
    .map((match) => ({ name: match[1], lines: Number(match[2]), branches: Number(match[3]), functions: Number(match[4]) }));
}

// The table row of one file, or null when it is absent or ambiguous (the table lists base names in a directory tree).
function tableRowFor(rows, file) {
  const matches = rows.filter((row) => row.name === path.basename(file));
  return matches.length === 1 ? { lines: matches[0].lines, branches: matches[0].branches, functions: matches[0].functions } : null;
}

module.exports = Object.freeze({
  COVERAGE_METRICS, parseLcov, percentOf, meetsMinimum, selectRecord, parseTapSummary, parseTapFailures, parseTapTable, tableRowFor
});
