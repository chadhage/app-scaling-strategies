'use strict';

// Test tooling, not production code: runs the L-0004 command over every enumerated C026 production file and enforces
// 85 lines, 85 branches and 85 functions PER FILE; an unloaded file counts as 0%.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const gate = require('./coverage-gate.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const paths = gate.listNamespaceFiles(root);
const enumerated = gate.enumerate(paths);
const tests = gate.TESTS.map((file) => path.join('capability', 'C026', 'tests', file));
const args = ['--test', '--experimental-test-coverage',
  ...enumerated.map((file) => `--test-coverage-include=**/C026/${file}`),
  '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
const run = spawnSync(process.execPath, args, {
  cwd: repository, env: gate.nestedEnvironment(process.env), encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024
});
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
const result = gate.evaluate(enumerated, gate.parse(run.stdout || ''));
process.stdout.write(gate.format(result, gate.unmeasured(paths)));
if (run.status !== 0 || !result.passed) {
  console.error(`C026 coverage RED: nested runner exit ${run.status}; ${result.files.filter((item) => item.failures.length).length} of ${enumerated.length} production files below 85/85/85 (unloaded counts as 0%).`);
  process.exitCode = 1;
} else {
  console.log(`C026 coverage GREEN: ${enumerated.length}/${enumerated.length} enumerated production files at or above 85 lines, 85 branches and 85 functions each: ${enumerated.join(', ')}.`);
}
