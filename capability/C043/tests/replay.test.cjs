'use strict';

// The RED of every fix is REPLAYED: the retained tests fail against the retained code of the FIRST publication (the
// archived run, same failing count, for a behavioral reason) and pass UNCHANGED against the final code (L-0121). The old
// code is injected through a --require preload (evidence\red\old-subject*.preload.cjs) that swaps the bytes of the
// production files for the snapshots, which are shown elsewhere to be exactly the first publication's git blobs.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { assert } = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const REPLAYS = [
  ['red-02-f1', 'red-f1-pipelining', 'old-subject.preload.cjs', ['pipelining.test.cjs', 'pipelining-process.test.cjs']],
  ['red-03-f3', 'red-f3-cross-check', 'old-subject.preload.cjs', ['f3-cross-check.test.cjs', 'f3-process.test.cjs']],
  ['red-04-f4', 'red-f4-tamper', 'old-subject-fs.preload.cjs', ['f4-tamper.test.cjs']],
  ['red-05-node-own', 'red-addendum-node-own', 'old-subject.preload.cjs', ['node-own.test.cjs', 'pipelining-framing.test.cjs']],
  // Third round: the load flake (the first version of the resource test), CONNECT, and the findings that had no RED (F2, F6, F7).
  ['red-06-load', 'red-load-flake', 'old-flood.preload.cjs', ['load.test.cjs']],
  ['red-07-connect', 'red-connect-upgrade', 'old-subject-r2.preload.cjs', ['connect-upgrade.test.cjs']],
  ['red-08-gaps', 'red-gaps-f2-f6-f7', 'old-round1.preload.cjs', ['round1-gaps.test.cjs']],
  ['red-09-aliasing', 'red-aliasing', 'old-subject-r2.preload.cjs', ['aliasing.test.cjs']],
];

function run(files, preload) {
  const env = { ...process.env };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS', 'C043_MUTANT']) delete env[key];
  if (preload) env.NODE_OPTIONS = `--require=${path.join(root, 'evidence', 'red', preload)}`;
  const args = ['--test', '--test-concurrency=1', ...files.map((name) => path.join(root, 'tests', name))];
  const result = spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8', timeout: 240000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(result.stdout)?.[1] ?? NaN);
  return { status: result.status, output: result.stdout + result.stderr, tests: count('tests'), pass: count('pass'), fail: count('fail') };
}

for (const [directory, name, preload, files] of REPLAYS) {
  test(`${name}: the archived RED fails against the first publication for the same behavioral reason and passes unchanged against the final code`, { timeout: 600000 }, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red', directory, `${name}.json`), 'utf8'));
    assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.summary.pass > 0 || manifest.summary.fail > 0], [1, 1, true]);
    const red = run(files, preload);
    assert.equal(red.status, 1, 'the RED fails');
    assert.deepEqual([red.tests, red.fail], [manifest.summary.tests, manifest.summary.fail], 'the replay fails exactly the tests the archive failed');
    assert.equal(/Cannot find module|SyntaxError|ReferenceError/.test(red.output), false, 'the RED fails for behavior, not for a missing module or a syntax error');
    assert.equal(/ERR_ASSERTION|AssertionError|Expected values|expected:/.test(red.output), true, 'an assertion about the specified behavior');
    const green = run(files, null);
    assert.equal(green.status, 0, green.output.slice(-2000));
    assert.deepEqual([green.tests, green.pass, green.fail], [manifest.summary.tests, manifest.summary.tests, 0]);
  });
}
