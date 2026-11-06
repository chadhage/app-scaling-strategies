'use strict';

// N1 (b) of the second review: EVERY hermetic test and the evidence test stay green after addendum lines are appended. The proof runs
// on a scratch copy of the namespace that gets a valid chain for two fake majors (157 and 158) and then runs all test files
// except the machine test and the two tests that make scratch copies themselves. Run it last, when the whole evidence exists.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain } = require('./chain.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const NAMESPACE = path.join(REPO, 'testing', 'browser', 'qualify');
const OUTSIDE = ['isolated.cjs', 'isolated.test.cjs', 'loopback.test.cjs'];
const SKIPPED = ['qualify.machine.test.cjs', 'evidence-amend.test.cjs', 'amend-proof.test.cjs'];

// fs.cpSync refuses to copy a folder into its own subfolder, and the scratch folder lives inside the tests folder.
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (/^scratch-/.test(entry.name)) continue;
    if (entry.isDirectory()) copyTree(path.join(source, entry.name), path.join(target, entry.name));
    else fs.copyFileSync(path.join(source, entry.name), path.join(target, entry.name));
  }
}

test('every hermetic test and the evidence test pass after addendum lines for two fake majors were appended', { timeout: 1500000 }, () => {
  const copy = scratchDir();
  try {
    const namespace = path.join(copy, 'testing', 'browser', 'qualify');
    copyTree(NAMESPACE, namespace);
    for (const name of OUTSIDE) fs.copyFileSync(path.join(REPO, 'testing', 'browser', name), path.join(copy, 'testing', 'browser', name));
    fs.writeFileSync(path.join(namespace, 'qualified.addendum.jsonl'), chain(fs.readFileSync(path.join(namespace, 'qualified.json')), [157, 158]).text);
    const files = fs.readdirSync(path.join(namespace, 'tests')).filter((name) => name.endsWith('.test.cjs') && !SKIPPED.includes(name))
      .sort().map((name) => path.join('testing', 'browser', 'qualify', 'tests', name));
    assert.ok(files.includes(path.join('testing', 'browser', 'qualify', 'tests', 'evidence.test.cjs')), 'the evidence test is part of the run');
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/i.test(key))), EVIDENCE_FULL: '1' };
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: copy, env, encoding: 'utf8', timeout: 1400000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(result.error, undefined, 'the run did not end in time');
    const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) => [key, Number((new RegExp(`^# ${key} (\\d+)$`, 'm').exec(result.stdout) || [])[1])]));
    assert.equal(result.status, 0, `${JSON.stringify(counts)}\n${result.stdout.slice(-3000)}`);
    assert.ok(counts.tests > 100 && counts.pass === counts.tests && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0, JSON.stringify(counts));
  } finally {
    removeDir(copy);
  }
});
