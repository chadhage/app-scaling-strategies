'use strict';

// Test tooling, not production code: per-file coverage gate for the C042 production files (L-0004, one command per
// file). Node reports only loaded files and applies the thresholds to the aggregate row, so this gate enumerates the
// production set itself, reads the row of the file under test and counts a missing row (an unloaded file) as 0%.
const fs = require('node:fs');
const path = require('node:path');

const FLOORS = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const FILE_ROW = new RegExp(`^#\\s+(\\S+\\.c?js)\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`);
const NOT_NODE_MEASURABLE = /\.(?:html|css|json|md|feature)$/;
// A nested `node --test` that inherits NODE_TEST_CONTEXT exits 0 even when its test fails (L-0002).
const NESTED_REMOVED = Object.freeze(['CAPTURE_BROWSER_EVIDENCE', 'NODE_V8_COVERAGE', 'NODE_TEST_CONTEXT']);

function nestedEnvironment(env) {
  const copy = { ...env };
  for (const key of NESTED_REMOVED) delete copy[key];
  return copy;
}

function listNamespaceFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}

function enumerate(names) {
  return names.filter((name) => /\.c?js$/.test(name)).sort();
}

function unmeasured(names) {
  return names.filter((name) => NOT_NODE_MEASURABLE.test(name)).sort();
}

function testFiles(testsDirectory) {
  return fs.readdirSync(testsDirectory).filter((name) => name.endsWith('.test.cjs')).sort();
}

function parse(text) {
  const rows = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const row = FILE_ROW.exec(line);
    if (row) rows.set(row[1], { lines: Number(row[2]), branches: Number(row[3]), functions: Number(row[4]) });
  }
  return rows;
}

function evaluate(file, rows) {
  const measured = rows.get(file);
  const values = measured ?? { lines: 0, branches: 0, functions: 0 };
  const failures = measured ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
  for (const metric of Object.keys(FLOORS)) if (values[metric] < FLOORS[metric]) failures.push(`${metric} ${values[metric]} < ${FLOORS[metric]}`);
  const others = [...rows.keys()].filter((name) => name !== file);
  if (others.length) failures.push(`UNEXPECTED_ROWS ${others.join(',')}`);
  return { file, loaded: Boolean(measured), ...values, failures };
}

function format(results, notMeasured) {
  const header = ['file', 'loaded', 'line %', 'branch %', 'funcs %', 'result'];
  const rows = results.map((item) => [item.file, item.loaded ? 'yes' : 'NO', item.lines.toFixed(2), item.branches.toFixed(2),
    item.functions.toFixed(2), item.failures.length ? `FAIL ${item.failures.join('; ')}` : 'ok']);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const render = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ').trimEnd();
  return ['C042 per-file coverage gate (floor 85/85/85 for lines, branches and functions; an unloaded file counts as 0%):', render(header),
    ...rows.map(render), `Not measured by Node coverage, disclosed and never counted: ${notMeasured.join(', ')}`, ''].join('\n');
}

module.exports = Object.freeze({ FLOORS, nestedEnvironment, listNamespaceFiles, enumerate, unmeasured, testFiles, parse, evaluate, format });
