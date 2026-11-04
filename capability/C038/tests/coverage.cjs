'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..', '..');
const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage',
  '--test-coverage-include=**/C038/readiness.js', '--test-coverage-include=**/C038/model.js',
  '--test-coverage-lines=90', '--test-coverage-branches=80', '--test-coverage-functions=90',
  ...['readiness.test.cjs', 'guards.test.cjs', 'context.test.cjs', 'surface.test.cjs'].map((file) => path.join(__dirname, file))];
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C038_CAPTURE_DIR;
delete env.NODE_V8_COVERAGE;
const run = spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8',
  windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
assert.match(run.stdout || '', /readiness\.js\s*\|/);
assert.match(run.stdout || '', /model\.js\s*\|/);
assert.equal(run.status, 0, 'Focused production model/core coverage must meet 90% lines, 80% branches, 90% functions.');
console.log('C038 coverage GREEN: actual model/core measured; >=90% lines, >=80% branches, >=90% functions; no V8 coverage files or evidence writes.');
