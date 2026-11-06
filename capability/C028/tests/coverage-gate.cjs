'use strict';

// Test tooling, not production code: the per-file coverage gate for the C028 production files. Node reports only the
// files a test loads and applies its thresholds to the aggregate row, so the gate enumerates the production set itself,
// reads the row of every file and counts an unloaded file as 0% (L-0003, L-0028, L-0100).
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const METRICS = Object.freeze(['lines', 'branches', 'functions']);
const FLOORS = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const FILE_ROW = new RegExp(`^#\\s+(\\S+\\.c?js)\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`);
const NOT_NODE_MEASURABLE = /\.(?:html|css)$/;
// A nested `node --test` that inherits NODE_TEST_CONTEXT exits 0 even when its test fails (L-0002).
const NESTED_REMOVED = Object.freeze(['CAPTURE_BROWSER_EVIDENCE', 'NODE_V8_COVERAGE', 'NODE_TEST_CONTEXT']);
const SKIP_PATTERNS = Object.freeze(['sends.a.prefix.that.promises.too.much$', 'when.the.server.resets.the.stream$']);

function nestedEnvironment(env) {
  const copy = { ...env };
  for (const name of NESTED_REMOVED) delete copy[name];
  return copy;
}

function listNamespaceFiles() {
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
}

function enumerate(names = listNamespaceFiles()) {
  return names.filter((name) => /\.c?js$/.test(name)).sort();
}

function unmeasured(names = listNamespaceFiles()) {
  return names.filter((name) => NOT_NODE_MEASURABLE.test(name)).sort();
}

function testFiles() {
  const suites = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs')).sort().map((name) => path.join('capability', 'C028', 'tests', name));
  const retained = fs.readdirSync(path.join(root, 'evidence', 'red')).filter((name) => name.endsWith('.snapshot.cjs')).sort()
    .map((name) => path.join('capability', 'C028', 'evidence', 'red', name));
  return [...suites, ...retained];
}

function commandFor(file) {
  return ['--test', '--test-concurrency=1', '--experimental-test-coverage', `--test-coverage-include=capability/C028/${file}`,
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85',
    ...SKIP_PATTERNS.map((pattern) => `--test-skip-pattern=${pattern}`), ...testFiles()];
}

function parse(text) {
  const files = new Map();
  for (const raw of String(text).split(/\r?\n/)) {
    const row = FILE_ROW.exec(raw);
    if (row) files.set(row[1], { lines: Number(row[2]), branches: Number(row[3]), functions: Number(row[4]) });
  }
  return files;
}

// One L-0004 command measured one file: its own row must exist and meet every floor, else it counts as 0%.
function evaluate(file, report) {
  const measured = report.get(file);
  const values = measured ?? { lines: 0, branches: 0, functions: 0 };
  const failures = measured ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
  for (const metric of METRICS) if (values[metric] < FLOORS[metric]) failures.push(`${metric} ${values[metric].toFixed(2)} < ${FLOORS[metric]}`);
  return { file, loaded: Boolean(measured), ...values, failures };
}

function format(results, notMeasured = []) {
  const rows = results.map((item) => [item.file, item.loaded ? 'yes' : 'NO', item.lines.toFixed(2), item.branches.toFixed(2),
    item.functions.toFixed(2), item.failures.length ? `FAIL ${item.failures.join('; ')}` : 'ok']);
  const header = ['file', 'loaded', 'line %', 'branch %', 'funcs %', 'result'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const render = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ').trimEnd();
  return ['C028 per-file coverage gate (floor 85/85/85, one L-0004 command per file; an unloaded file counts as 0%):', render(header), ...rows.map(render),
    `Not measured by Node coverage, disclosed and never counted: ${notMeasured.length ? notMeasured.join(', ') : 'none'}`, ''].join('\n');
}

module.exports = Object.freeze({ METRICS, FLOORS, SKIP_PATTERNS, nestedEnvironment, listNamespaceFiles, enumerate, unmeasured, testFiles, commandFor, parse, evaluate, format });
