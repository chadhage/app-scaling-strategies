'use strict';

// Test tooling, not production code: cross-checks evidence.json against the archived runs. It is a script, not a suite, because
// the GREEN and coverage runs it indexes execute every suite and so cannot contain a check of their own archives.
//   node capability\C028\tests\verify-evidence.cjs
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const gate = require('./coverage-gate.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json'), 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

assert.equal(index.cardId, 'C028');
assert.equal(sha(fs.readFileSync(path.join(root, 'C028.feature'))), index.order[0].sha256, 'the specification changed after it was indexed');
const steps = index.order.filter((step) => step.archive);
let verified = 0;
for (const step of steps) {
  const folder = path.join(repository, step.archive);
  assert.ok(fs.existsSync(folder), `${step.archive} is missing`);
  const runFile = path.join(folder, 'run.json');
  if (fs.existsSync(runFile)) {
    const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    assert.equal(run.stdoutSha256, step.stdoutSha256, `${step.archive} stdout hash`);
    assert.equal(run.exitCode, step.exit, `${step.archive} exit code`);
    if (step.tests !== undefined) {
      assert.deepEqual([run.parsed.counts.tests, run.parsed.counts.pass, run.parsed.counts.fail], [step.tests, step.pass, step.fail], `${step.archive} counts`);
    }
    verified += 1;
  }
  for (const file of Array.isArray(step.files) ? step.files : []) assert.ok(fs.existsSync(path.join(folder, file)), `${step.archive}/${file}`);
}
const coverage = index.order.find((step) => step.perFileRaw);
assert.deepEqual(Object.keys(coverage.files).sort(), gate.enumerate(), 'the indexed coverage rows are exactly the enumerated production files');
for (const [file, values] of Object.entries(coverage.files)) {
  assert.ok(values.every((value) => value >= 85), `${file} below 85/85/85`);
  assert.ok(fs.existsSync(path.join(repository, coverage.perFileRaw, `${file}.out.txt.gz`)), `${file} raw transcript`);
  assert.ok(fs.existsSync(path.join(repository, coverage.perFileRaw, `${file}.command.json`)), `${file} command record`);
}
console.log(`C028 evidence index OK: ${steps.length} archives present, ${verified} run records matched by exit code and stdout SHA-256, ${Object.keys(coverage.files).length} coverage rows backed by raw transcripts.`);
