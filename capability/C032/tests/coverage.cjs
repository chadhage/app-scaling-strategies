'use strict';

// Test tooling, not production code: per-file coverage gate (85/85/85) over the enumerated C032 production files.
// Node applies --test-coverage-* thresholds to the aggregate only and prints no row for a file no test loads (L-0003,
// L-0021, L-0028), so this gate reads every file row itself and treats an unloaded file as 0%.
// Usage: node capability\C032\tests\coverage.cjs   (run it under a heavy slot; it spawns one nested node --test run)
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { enumerate, NOT_NODE_MEASURABLE } = require('./production-files.cjs');

const FLOORS = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const FILE_ROW = new RegExp(`^#\\s+(\\S+\\.c?js)\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`);
const TESTS = Object.freeze(['fixture.test.cjs', 'server.test.cjs', 'regimes.test.cjs', 'client.test.cjs', 'page.test.cjs', 'cli.test.cjs', 'surface.test.cjs', 'red.test.cjs']);

function parse(text) {
  const files = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const row = FILE_ROW.exec(line);
    if (row) files.set(row[1], { lines: Number(row[2]), branches: Number(row[3]), functions: Number(row[4]) });
  }
  return files;
}

function evaluate(enumerated, measured) {
  const files = enumerated.map((file) => {
    const values = measured.get(file) || { lines: 0, branches: 0, functions: 0 };
    const failures = measured.has(file) ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
    for (const metric of Object.keys(FLOORS)) if (values[metric] < FLOORS[metric]) failures.push(`${metric} ${values[metric].toFixed(2)} < ${FLOORS[metric]}`);
    return { file, loaded: measured.has(file), ...values, failures };
  });
  const unenumerated = [...measured.keys()].filter((file) => !enumerated.includes(file)).sort();
  return { files, unenumerated, passed: enumerated.length > 0 && unenumerated.length === 0 && files.every((item) => item.failures.length === 0) };
}

function format(result) {
  const rows = result.files.map((item) => [item.file, item.loaded ? 'yes' : 'NO', item.lines.toFixed(2), item.branches.toFixed(2), item.functions.toFixed(2), item.failures.length ? `FAIL ${item.failures.join('; ')}` : 'ok']);
  const header = ['file', 'loaded', 'line %', 'branch %', 'funcs %', 'result'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const render = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ').trimEnd();
  return ['C032 per-file coverage gate (floor 85/85/85 for every file; an unloaded file counts as 0%):', render(header), ...rows.map(render),
    ...result.unenumerated.map((file) => `UNENUMERATED measured file: ${file}`),
    `Not measurable by Node coverage, disclosed and never counted: ${NOT_NODE_MEASURABLE.join(', ')}`, ''].join('\n');
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const repository = path.resolve(root, '..', '..');
  const enumerated = enumerate();
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage',
    ...enumerated.map((file) => `--test-coverage-include=**/C032/${file}`),
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85',
    ...TESTS.map((file) => path.join(__dirname, file))];
  const run = spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8', windowsHide: true, timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  const result = evaluate(enumerated, parse(run.stdout));
  process.stdout.write(format(result));
  if (run.status !== 0 || !result.passed) {
    console.error(`C032 coverage RED: nested runner exit ${run.status}; ${result.files.filter((item) => item.failures.length).length} of ${enumerated.length} production files below their floors (unloaded counts as 0%).`);
    process.exitCode = 1;
  } else {
    console.log(`C032 coverage GREEN: ${enumerated.length}/${enumerated.length} enumerated production files at or above 85/85/85 per file; no V8 coverage files or evidence writes.`);
  }
}

module.exports = Object.freeze({ FLOORS, TESTS, parse, evaluate, format });
