'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runNode } = require('.\\nested-runner.cjs');
const root = path.resolve(__dirname, '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const count = (text, name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(text)?.[1]);

test('U049 exact retained RED test and fixture bytes replay two behavioral failures on the accepted model and pass unchanged on the candidate', () => {
  const red = path.join(root, 'evidence', 'u049', 'red', 'u049-work-budget.red.cjs');
  const fixture = path.join(root, 'evidence', 'u049', 'red', 'u049-fixtures.cjs');
  assert.equal(hash(fs.readFileSync(red)), hash(fs.readFileSync(path.join(__dirname, 'u049-work-budget.test.cjs'))));
  assert.equal(hash(fs.readFileSync(fixture)), hash(fs.readFileSync(path.join(__dirname, 'u049-fixtures.cjs'))));
  const options = { cwd: root, timeout: 0, env: { ...process.env, X001_U049_SUBJECT: path.join(root, 'timeline.js') } };
  const args = ['--max-old-space-size=64', '--test', '--test-concurrency=1', '--test-reporter=tap', red];
  const before = runNode(['--require', path.join(__dirname, 'u049-old-subject.cjs'), ...args], options);
  assert.equal(before.status, 1);
  assert.deepEqual([count(before.stdout, 'tests'), count(before.stdout, 'pass'), count(before.stdout, 'fail')], [2, 0, 2]);
  assert.match(before.stdout, /ERR_ASSERTION/);
  assert.doesNotMatch(before.stdout + before.stderr, /Cannot find module|MODULE_NOT_FOUND|SyntaxError|ReferenceError|heap out of memory|testTimeoutFailure/);
  for (const name of ['G1 retained verify with supplied timeline refuses shared raw work before folding', '(depth 40)']) assert.ok(before.stdout.includes(name));
  const after = runNode(args, options);
  assert.equal(after.status, 0, after.stderr);
  assert.deepEqual([count(after.stdout, 'tests'), count(after.stdout, 'pass'), count(after.stdout, 'fail')], [2, 2, 0]);
});
