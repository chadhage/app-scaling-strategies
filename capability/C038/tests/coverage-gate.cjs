'use strict';

// Test tooling, not production code: per-file coverage gate for the C038 production files.
// Node reports only loaded files and only the aggregate carries thresholds, so the gate enumerates
// the production set itself, reads every file row of the report and treats an unloaded file as 0%.
const fs = require('node:fs');
const path = require('node:path');
const METRICS = Object.freeze(['lines', 'branches', 'functions']);
const FLOORS = Object.freeze({ lines: 85, branches: 85, functions: 85 });
// The earlier gate required 90 lines / 80 branches / 90 functions over readiness.js and model.js;
// those lines and functions floors are kept and the branches floor rises to 85, so nothing is lowered.
const EARLIER = Object.freeze({ lines: 90, branches: 85, functions: 90 });
const STRICTER = new Map([['model.js', EARLIER], ['readiness.js', EARLIER]]);
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const FILE_ROW = new RegExp(`^#\\s+(\\S+\\.c?js)\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`);
const AGGREGATE_ROW = new RegExp(`^#\\s+all files\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`);
const NOT_NODE_MEASURABLE = /\.(?:html|css|ps1)$/;
// A nested `node --test` that inherits NODE_TEST_CONTEXT exits 0 even when its test fails (L-0002), and an inherited
// NODE_V8_COVERAGE would write coverage files; evidence capture variables must never reach the nested run either.
const NESTED_REMOVED = Object.freeze(['CAPTURE_BROWSER_EVIDENCE', 'C038_CAPTURE_DIR', 'NODE_V8_COVERAGE', 'NODE_TEST_CONTEXT']);
// The focused tests the gate runs under coverage; record.cjs runs the same list for its focused stage.
const TESTS = Object.freeze(['readiness.test.cjs', 'guards.test.cjs', 'context.test.cjs', 'surface.test.cjs',
  'publisher-authority.test.cjs', 'boundary-current.test.cjs', 'sources-closed.test.cjs', 'cli.test.cjs',
  'page.test.cjs', 'coverage-gate.test.cjs']);
function floorsFor(file) { return STRICTER.get(file) ?? FLOORS; }
function nestedEnvironment(env) {
  const copy = { ...env };
  for (const key of NESTED_REMOVED) delete copy[key];
  return copy;
}
function enumerate(paths) {
  const production = [];
  for (const raw of paths) {
    const parts = raw.replaceAll('\\', '/').split('/');
    if (!/\.c?js$/.test(parts.at(-1)) || ['tests', 'evidence'].includes(parts[0])) continue;
    if (parts.length > 1) throw new Error(`NESTED_PRODUCTION_FILE ${raw}`);
    production.push(parts[0]);
  }
  return production.sort();
}
function unmeasured(paths) {
  return paths.map((raw) => raw.replaceAll('\\', '/')).filter((raw) => !raw.includes('/') && NOT_NODE_MEASURABLE.test(raw)).sort();
}
function listNamespaceFiles(root) {
  const found = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = path.relative(root, path.join(directory, entry.name));
      if (entry.isDirectory()) {
        if (!['tests', 'evidence'].includes(relative)) walk(path.join(directory, entry.name));
      } else found.push(relative);
    }
  }
  walk(root);
  return found.map((raw) => raw.replaceAll('\\', '/'));
}
function parse(text) {
  const files = new Map();
  let aggregate = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const total = AGGREGATE_ROW.exec(raw);
    if (total) { aggregate = { lines: Number(total[1]), branches: Number(total[2]), functions: Number(total[3]) }; continue; }
    const row = FILE_ROW.exec(raw);
    if (row) files.set(row[1], { lines: Number(row[2]), branches: Number(row[3]), functions: Number(row[4]) });
  }
  return { files, aggregate };
}
function evaluate(enumerated, report) {
  const files = enumerated.map((file) => {
    const measured = report.files.get(file);
    const floors = floorsFor(file);
    const values = measured ?? { lines: 0, branches: 0, functions: 0 };
    const failures = measured ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
    for (const metric of METRICS) if (values[metric] < floors[metric]) failures.push(`${metric} ${values[metric].toFixed(2)} < ${floors[metric]}`);
    return { file, loaded: Boolean(measured), ...values, floors, failures };
  });
  const unenumerated = [...report.files.keys()].filter((file) => !enumerated.includes(file)).sort();
  return { passed: enumerated.length > 0 && unenumerated.length === 0 && files.every((item) => item.failures.length === 0),
    files, unenumerated };
}
function format(result, notMeasured = []) {
  const rows = result.files.map((item) => [item.file, item.loaded ? 'yes' : 'NO',
    item.lines.toFixed(2), item.branches.toFixed(2), item.functions.toFixed(2),
    `${item.floors.lines}/${item.floors.branches}/${item.floors.functions}`,
    item.failures.length ? `FAIL ${item.failures.join('; ')}` : 'ok']);
  const header = ['file', 'loaded', 'line %', 'branch %', 'funcs %', 'floor', 'result'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const render = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ').trimEnd();
  return [`C038 per-file coverage gate (default floor 85/85/85; an unloaded file counts as 0%):`, render(header),
    ...rows.map(render),
    ...result.unenumerated.map((file) => `UNENUMERATED measured file: ${file}`),
    `Not measured by Node coverage, disclosed and never counted: ${notMeasured.length ? notMeasured.join(', ') : 'none'}`, ''].join('\n');
}
module.exports = Object.freeze({ METRICS, FLOORS, TESTS, floorsFor, nestedEnvironment, enumerate, unmeasured, listNamespaceFiles, parse, evaluate, format });
