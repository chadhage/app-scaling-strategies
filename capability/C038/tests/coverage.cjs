'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const gate = require('./coverage-gate.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const paths = gate.listNamespaceFiles(root);
const enumerated = gate.enumerate(paths);
const tests = gate.TESTS.map((file) => path.join(__dirname, file));
// Node applies --test-coverage-* to the aggregate only; the per-file floors are enforced by the gate below.
const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage',
  ...enumerated.map((file) => `--test-coverage-include=**/C038/${file}`),
  '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
const env = gate.nestedEnvironment(process.env);
const run = spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8',
  windowsHide: true, timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
const result = gate.evaluate(enumerated, gate.parse(run.stdout || ''));
process.stdout.write(gate.format(result, gate.unmeasured(paths)));
if (run.status !== 0 || !result.passed) {
  console.error(`C038 coverage RED: nested runner exit ${run.status}; ${result.files.filter((item) => item.failures.length).length} of ${enumerated.length} production files below their per-file floors (unloaded counts as 0%).`);
  process.exitCode = 1;
} else {
  console.log(`C038 coverage GREEN: ${enumerated.length}/${enumerated.length} enumerated production files at or above their per-file floors (85/85/85; readiness.js and model.js keep 90 lines and functions); unloaded counts as 0%; no V8 coverage files or evidence writes.`);
}
