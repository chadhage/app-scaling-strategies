'use strict';

// L-0121 and L-0131 for the fix: every frozen RED file of evidence\fix\red is replayed BOTH ways. Against the code the review rejected (the frozen
// first-publication snapshots served by tests\base-shim.cjs, with the reviewer's surviving mutants for the display RED) it fails exactly as archived;
// unchanged against the final code every test passes. The snapshots themselves are byte-identical to the git blobs of commit 368332e2a881.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runNode } = require('.\\nested-runner.cjs');
const { firstBlobs, sha } = require('.\\evidence-check.cjs');

const root = path.resolve(__dirname, '..');
const shim = path.join(__dirname, 'base-shim.cjs');
const count = (text, name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(text)?.[1]);
const REDS = [
  { file: 'model.red.test.cjs', mutants: 'B12', tests: 7, failing: 7 },
  { file: 'display.red.test.cjs', mutants: 'D1,D2,D6,D7,P12', tests: 26, failing: 5 },
];
const replay = (red, extra, env) => runNode([...extra, '--test', '--test-concurrency=1', '--test-reporter=tap', path.join(root, 'evidence', 'fix', 'red', red)],
  { cwd: __dirname, env: { ...process.env, ...env } });

test('the frozen first-publication snapshots are byte-identical to the git blobs of commit 368332e2a881', () => {
  const names = ['timeline', 'describe', 'page'];
  const blobs = firstBlobs(names.map((name) => `capability\\X001\\${name}.js`));
  for (const name of names) {
    const snapshot = fs.readFileSync(path.join(root, 'evidence', 'fix', 'base', `${name}.first.js`));
    assert.equal(sha(snapshot), sha(blobs.get(`capability\\X001\\${name}.js`)), `${name}.first.js`);
  }
});

for (const red of REDS) {
  test(`${red.file}: fails against the first-publication code and passes unchanged against the final code`, () => {
    const before = replay(red.file, ['--require', shim], { X001_BASE_MUTANTS: red.mutants });
    assert.equal(before.status, 1, before.stdout.slice(-400));
    assert.deepEqual([count(before.stdout, 'tests'), count(before.stdout, 'fail')], [red.tests, red.failing]);
    assert.match(before.stdout, /code: 'ERR_ASSERTION'/);
    assert.doesNotMatch(before.stdout, /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError/);
    const after = replay(red.file, [], {});
    assert.equal(after.status, 0, after.stdout.slice(-400));
    assert.deepEqual([count(after.stdout, 'tests'), count(after.stdout, 'pass'), count(after.stdout, 'fail')], [red.tests, red.tests, 0]);
  });
}

test('the display RED passes against the unmutated first publication: its defect was the oracle, so the replay is a mutation RED and says so', () => {
  const plain = replay('display.red.test.cjs', ['--require', shim], {});
  assert.equal(plain.status, 0, plain.stdout.slice(-400));
  assert.equal(count(plain.stdout, 'fail'), 0);
});

test('the shim refuses an unknown reviewer mutant instead of replaying something else', () => {
  const unknown = replay('model.red.test.cjs', ['--require', shim], { X001_BASE_MUTANTS: 'NOPE' });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stdout + unknown.stderr, /unknown reviewer mutant NOPE/);
});
