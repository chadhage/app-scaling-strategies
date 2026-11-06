'use strict';

// Test tooling, not production code: verifies the WHOLE evidence index after a capture, including the GREEN and
// coverage archives that record the focused suite's own run and so cannot be checked inside it.
// Usage: node capability\C032\tests\verify-evidence.cjs   (read-only; exit 1 on any mismatch)
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { enumerate } = require('./production-files.cjs');

const root = path.resolve(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json'), 'utf8'));
const stage = (name) => index.workflow.find((item) => item.stage === name);
const output = (name) => gunzipSync(fs.readFileSync(path.join(root, path.dirname(stage(name).path), 'stdout.raw.gz'))).toString('utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const [relative, expected] of Object.entries(index.sha256)) {
  assert.equal(sha256(fs.readFileSync(path.join(root, relative))), expected, relative);
}
for (const name of ['behavioral-red', 'green', 'coverage']) {
  const record = JSON.parse(fs.readFileSync(path.join(root, stage(name).path), 'utf8'));
  const directory = path.dirname(stage(name).path);
  assert.equal(sha256(gunzipSync(fs.readFileSync(path.join(root, directory, 'stdout.raw.gz')))), record.stdoutSha256, `${name} raw stdout`);
  assert.equal(sha256(gunzipSync(fs.readFileSync(path.join(root, directory, 'stderr.raw.gz')))), record.stderrSha256, `${name} raw stderr`);
  assert.equal(record.exitCode, name === 'behavioral-red' ? 1 : 0, `${name} exit code`);
}
assert.match(output('green'), new RegExp(`^# tests ${stage('green').tests}$`, 'm'));
assert.match(output('green'), /^# fail 0$/m);
assert.match(output('coverage'), /C032 coverage GREEN: 5\/5 enumerated production files/);
assert.deepEqual(stage('coverage').files.map((item) => item.file), enumerate());
for (const item of stage('coverage').files) {
  const row = new RegExp(`^#\\s+${item.file.replace('.', '\\.')}\\s+\\|\\s+${item.lines.toFixed(2)}\\s+\\|\\s+${item.branches.toFixed(2)}\\s+\\|\\s+${item.functions.toFixed(2)}\\s+\\|`, 'm');
  assert.match(output('coverage'), row, `${item.file} row in the archived coverage report`);
}
console.log(`C032 evidence verified: ${Object.keys(index.sha256).length} hashes match; RED exit 1, GREEN ${stage('green').tests} tests, coverage 85/85/85 per file.`);
