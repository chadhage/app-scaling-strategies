'use strict';

// Archives one RED run (raw stdout, raw stderr, exit code, input SHA-256) before the implementation exists.
// Files are written with flag wx: an archived RED is never rewritten.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { childEnvironment } = require('.\\nested-runner.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const red = path.join(root, 'evidence', 'red');
const name = process.argv[2];
const target = process.argv[3] || 'evidence\\red\\evaluator.red.test.cjs';
// The code under test that the RED loads (default: the original naive stub); an increment RED names its byte-exact pre-fix snapshot.
const subject = process.argv[4] || 'evidence\\red\\evaluator.stub.cjs';
if (!/^run-[a-z0-9-]{1,40}$/.test(name || '')) throw new Error('usage: node record-red.cjs run-<name> [test file relative to capability\\C031] [subject file]');
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const directory = path.join(red, name);
fs.mkdirSync(directory);
const testFile = path.join(root, target);
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', testFile], {
  cwd: repository, env: childEnvironment(), windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024
});
fs.writeFileSync(path.join(directory, 'stdout.raw.txt'), run.stdout, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.raw.txt'), run.stderr, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'exit-code.txt'), `${run.status}\n`, { flag: 'wx' });
const stdout = run.stdout.toString('utf8');
const manifest = {
  schema: 'C031-red-run/1', name, command: `node --test --test-concurrency=1 capability\\C031\\${target}`,
  node: process.version, exitCode: run.status,
  inputs: Object.fromEntries([target, subject, 'C031.feature'].map((file) => [file, sha(path.join(root, file))])),
  behavioral: /AssertionError/.test(stdout) && !/MODULE_NOT_FOUND|SyntaxError|Cannot find module/.test(stdout + run.stderr.toString('utf8')),
  failedTests: Number(/^# fail (\d+)/m.exec(stdout)?.[1]), tests: Number(/^# tests (\d+)/m.exec(stdout)?.[1])
};
fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(manifest));
