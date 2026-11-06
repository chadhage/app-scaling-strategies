'use strict';

// Test tooling, not production code: per-file coverage gate. Node reports only loaded files and applies thresholds to the
// aggregate, so this gate enumerates every production file itself, parses every file row of the report, counts an
// unloaded file as 0% and enforces 85 lines / 85 branches / 85 functions for EACH file.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { FOCUSED } = require('./focused.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const FLOOR = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const FILE_ROW = new RegExp(`^#\\s+(\\S+\\.c?js)\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`);

const enumerated = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name) && fs.statSync(path.join(root, name)).isFile()).sort();
const tests = FOCUSED.map((name) => path.join(__dirname, name));
const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage',
  ...enumerated.map((name) => `--test-coverage-include=**/C044/${name}`),
  '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
const env = { ...process.env };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C044_CAPTURE_DIR']) delete env[key];

const run = spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');

const measured = new Map();
for (const line of String(run.stdout || '').split(/\r?\n/)) {
  const row = FILE_ROW.exec(line);
  if (row) measured.set(row[1], { lines: Number(row[2]), branches: Number(row[3]), functions: Number(row[4]) });
}
const files = enumerated.map((file) => {
  const values = measured.get(file) || { lines: 0, branches: 0, functions: 0 };
  const failures = measured.has(file) ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
  for (const metric of Object.keys(FLOOR)) if (values[metric] < FLOOR[metric]) failures.push(`${metric} ${values[metric]} < ${FLOOR[metric]}`);
  return { file, loaded: measured.has(file), ...values, failures };
});
const unenumerated = [...measured.keys()].filter((file) => !enumerated.includes(file));
const passed = run.status === 0 && enumerated.length > 0 && unenumerated.length === 0 && files.every((item) => item.failures.length === 0);
console.log(JSON.stringify({ gate: 'C044 per-file coverage (85/85/85, unloaded counts as 0%)', nestedExitCode: run.status, enumerated, unenumerated, files, passed }, null, 2));
if (!passed) {
  console.error(`C044 coverage RED: nested exit ${run.status}; ${files.filter((item) => item.failures.length).length} of ${enumerated.length} production files below their floors.`);
  process.exitCode = 1;
} else {
  console.log(`C044 coverage GREEN: ${enumerated.length}/${enumerated.length} production files at or above 85/85/85; unloaded counts as 0%.`);
}
