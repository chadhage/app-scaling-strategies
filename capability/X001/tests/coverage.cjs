'use strict';

// Per-file coverage gate: ONE L-0004 command per production file (a combined include list would only check the aggregate row and hide a
// weak file). Every first-party production script is enumerated; a file no test loads counts as 0%. page.js is measured under Node through
// the DOM stub in a vm context (L-0044, L-0053); nothing is excluded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { coverageEnvironment } = require('.\\nested-runner.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const threshold = 85;
const production = ['describe.js', 'page.js', 'saved.js', 'timeline.js'];
assert.equal(process.argv.length, 2);
assert.deepEqual(fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)).map((entry) => entry.name).sort(), production,
  'Enumerate every production script; a file no test loads counts as 0%.');
const tests = ['timeline.test.cjs', 'describe.test.cjs', 'page.test.cjs'].map((name) => path.join('capability', 'X001', 'tests', name));

function measure(file) {
  const args = ['--test', '--test-concurrency=1', '--test-timeout=250000', '--test-reporter=tap', '--experimental-test-coverage', `--test-coverage-include=capability/X001/${file}`,
    `--test-coverage-lines=${threshold}`, `--test-coverage-branches=${threshold}`, `--test-coverage-functions=${threshold}`, ...tests];
  const run = spawnSync(process.execPath, args, { cwd: repository, env: coverageEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 280000, maxBuffer: 32 * 1024 * 1024 });
  const row = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s*\\|\\s*([\\d.]+)\\s*\\|\\s*([\\d.]+)\\s*\\|\\s*([\\d.]+)\\s*\\|.*$`, 'm').exec(run.stdout);
  const [lines, branches, functions] = row ? row.slice(1, 4).map(Number) : [0, 0, 0];
  const failedTests = Number(/^# fail (\d+)/m.exec(run.stdout)?.[1]);
  return { file, command: `node ${args.join(' ')}`, row: row ? row[0].trimEnd() : null, loaded: Boolean(row), lines, branches, functions, nodeExit: run.status,
    tests: Number(/^# tests (\d+)/m.exec(run.stdout)?.[1]), failedTests,
    passed: Boolean(row) && lines >= threshold && branches >= threshold && functions >= threshold && run.status === 0 && failedTests === 0 };
}

const coverage = production.map(measure);
for (const entry of coverage) {
  console.log(`${entry.file.padEnd(12)} lines ${entry.lines.toFixed(2).padStart(6)}  branches ${entry.branches.toFixed(2).padStart(6)}  functions ${entry.functions.toFixed(2).padStart(6)}  `
    + `loaded ${entry.loaded}  node exit ${entry.nodeExit}  ${entry.passed ? 'PASS' : 'FAIL'}`);
}
console.log(JSON.stringify({ cardId: 'X001', threshold, testFiles: tests.length, productionFiles: production, coverage, passed: coverage.every((entry) => entry.passed) }));
process.exitCode = coverage.every((entry) => entry.passed) ? 0 : 1;
