'use strict';

// Test tooling, not production code: per-file coverage gate for the C026 production files.
// Node reports only loaded files and applies the thresholds to the aggregate, so the gate enumerates the production
// set itself, reads every file row of the report and treats an unloaded file as 0%.
const fs = require('node:fs');
const path = require('node:path');
const METRICS = Object.freeze(['lines', 'branches', 'functions']);
const FLOORS = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const FILE_ROW = new RegExp(`^#\\s+(\\S+\\.[cm]?js)\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`);
const NOT_NODE_MEASURABLE = /\.(?:html|css|ps1)$/;
// A nested `node --test` that inherits NODE_TEST_CONTEXT exits 0 even when its test fails (L-0002).
const NESTED_REMOVED = Object.freeze(['CAPTURE_BROWSER_EVIDENCE', 'NODE_V8_COVERAGE', 'NODE_TEST_CONTEXT']);
const TESTS = Object.freeze(['framing', 'stream', 'server', 'conversation', 'page', 'surface', 'limits', 'hardening', 'heap-limit', 'refusal-close', 'recovery', 'evidence',
  'u040-pipelining', 'u040-node-own', 'u040-flood', 'u040-budget', 'u040-expect']
  .map((name) => `${name}.test.cjs`));

function nestedEnvironment(env) {
  const copy = { ...env };
  for (const key of NESTED_REMOVED) delete copy[key];
  return copy;
}

function listNamespaceFiles(root) {
  const found = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = path.relative(root, path.join(directory, entry.name));
      if (entry.isDirectory()) {
        if (!['tests', 'evidence'].includes(relative)) walk(path.join(directory, entry.name));
      } else {
        found.push(relative.replaceAll('\\', '/'));
      }
    }
  }
  walk(root);
  return found;
}

function enumerate(paths) {
  const production = paths.filter((raw) => /\.[cm]?js$/.test(raw));
  const nested = production.filter((raw) => raw.includes('/'));
  if (nested.length > 0) throw new Error(`NESTED_PRODUCTION_FILE ${nested.join(', ')}`);
  return production.sort();
}

function unmeasured(paths) {
  return paths.filter((raw) => !raw.includes('/') && NOT_NODE_MEASURABLE.test(raw)).sort();
}

function parse(text) {
  const files = new Map();
  for (const raw of String(text).split(/\r?\n/)) {
    const row = FILE_ROW.exec(raw);
    if (row) files.set(row[1], { lines: Number(row[2]), branches: Number(row[3]), functions: Number(row[4]) });
  }
  return files;
}

function evaluate(enumerated, report) {
  const files = enumerated.map((file) => {
    const measured = report.get(file);
    const values = measured ?? { lines: 0, branches: 0, functions: 0 };
    const failures = measured ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
    for (const metric of METRICS) if (values[metric] < FLOORS[metric]) failures.push(`${metric} ${values[metric].toFixed(2)} < ${FLOORS[metric]}`);
    return { file, loaded: Boolean(measured), ...values, failures };
  });
  const unenumerated = [...report.keys()].filter((file) => !enumerated.includes(file)).sort();
  return { passed: enumerated.length > 0 && unenumerated.length === 0 && files.every((item) => item.failures.length === 0), files, unenumerated };
}

function format(result, notMeasured = []) {
  const rows = result.files.map((item) => [item.file, item.loaded ? 'yes' : 'NO', item.lines.toFixed(2), item.branches.toFixed(2),
    item.functions.toFixed(2), item.failures.length ? `FAIL ${item.failures.join('; ')}` : 'ok']);
  const header = ['file', 'loaded', 'line %', 'branch %', 'funcs %', 'result'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const render = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ').trimEnd();
  return ['C026 per-file coverage gate (floor 85/85/85 for lines, branches and functions; an unloaded file counts as 0%):', render(header),
    ...rows.map(render), ...result.unenumerated.map((file) => `UNENUMERATED measured file: ${file}`),
    `Not measured by Node coverage, disclosed and never counted: ${notMeasured.length ? notMeasured.join(', ') : 'none'}`, ''].join('\n');
}

module.exports = Object.freeze({ METRICS, FLOORS, TESTS, nestedEnvironment, listNamespaceFiles, enumerate, unmeasured, parse, evaluate, format });
