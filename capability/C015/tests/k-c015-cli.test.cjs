'use strict';

// Specified in K-C015.feature: the command line rejects every non-closed request without writing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'cli.cjs');
const demoRoot = path.join(root, 'fixtures', 'synthetic-restart-v1');
const faultyStore = path.join(__dirname, 'fixtures', 'faulty-store-preload.cjs');

function run(args, preload) {
  const argv = [...(preload ? ['--require', preload] : []), cli, ...args];
  return spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8', timeout: 120000, windowsHide: true });
}
function failure(result) {
  assert.equal(result.stdout, '');
  assert.equal(result.status, 1);
  const lines = result.stderr.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  return JSON.parse(lines[0]);
}
function treeDigest(directory) {
  const hash = createHash('sha256');
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else hash.update(`${path.relative(directory, target)}\0`).update(fs.readFileSync(target));
    }
  };
  visit(directory);
  return hash.digest('hex');
}

test('every request outside write RUN_ID EPOCH and read RUN_ID prints one closed failure and writes nothing', () => {
  const before = treeDigest(demoRoot);
  const cases = [
    [[], /Use only write RUN_ID EPOCH or read RUN_ID/],
    [['delete', 'synthetic-run-001'], /Use only write RUN_ID EPOCH or read RUN_ID/],
    [['read', 'synthetic-run-001', '1', 'extra'], /Use only write RUN_ID EPOCH or read RUN_ID/],
    [['write', 'synthetic-run-001', '1', '..\\C002'], /Use only write RUN_ID EPOCH or read RUN_ID/],
    [['read', 'synthetic-run-001', '1'], /Closed synthetic run IDs and exact integer epochs 1, 2 or 3/],
    [['write', 'synthetic-run-001'], /Closed synthetic run IDs and exact integer epochs 1, 2 or 3/],
    [['write', 'synthetic-run-001', '0'], /Closed synthetic run IDs and exact integer epochs 1, 2 or 3/],
    [['write', 'synthetic-run-001', '4'], /Closed synthetic run IDs and exact integer epochs 1, 2 or 3/],
    [['write', 'synthetic-run-001', '01'], /Closed synthetic run IDs and exact integer epochs 1, 2 or 3/]
  ];
  for (const [args, message] of cases) {
    const report = failure(run(args));
    assert.equal(report.code, 'INVALID_ARGUMENTS', args.join(' '));
    assert.match(report.message, message, args.join(' '));
    assert.deepEqual(report.details, []);
    assert.equal(report.acknowledged, false);
    assert.equal(report.restored, false);
    assert.equal(report.mode, 'actual-local-filesystem');
    assert.equal(report.schemaVersion, 1);
    assert.ok(Number.isSafeInteger(report.pid) && report.pid > 0);
  }
  assert.equal(treeDigest(demoRoot), before);
});

test('an unknown run ID is a closed failure for both actions before any consent or storage access', () => {
  for (const args of [['read'], ['read', 'real-user'], ['write', 'real-user', '1']]) {
    const report = failure(run(args));
    assert.equal(report.code, 'UNKNOWN_RUN_ID', args.join(' '));
    assert.equal(report.acknowledged, false);
    assert.equal(report.restored, false);
  }
});

test('reading the committed demo fixtures from a fresh process restores the exact retained history without writing', () => {
  const before = treeDigest(demoRoot);
  for (const [runId, epochs] of [['synthetic-run-001', [1, 2, 3]], ['synthetic-run-002', [1, 2]]]) {
    const result = run(['read', runId]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.ok(result.stdout.endsWith('}\n'));
    const report = JSON.parse(result.stdout);
    assert.equal(report.restored, true);
    assert.equal(report.namespace, 'synthetic-restart-v1');
    assert.equal(report.state.runId, runId);
    assert.deepEqual(report.history.map((entry) => entry.epoch), epochs);
    assert.equal(report.writesPerformed, 0);
    assert.equal(report.powerLossGuarantee, false);
    assert.notEqual(report.pid, process.pid);
  }
  assert.equal(treeDigest(demoRoot), before);
});

test('a write for an epoch the committed demo namespace already holds is stale and leaves every committed fixture byte unchanged', () => {
  assert.deepEqual(fs.readdirSync(path.join(demoRoot, 'synthetic-run-001')), ['epoch-001.json', 'epoch-002.json', 'epoch-003.json']);
  assert.deepEqual(fs.readdirSync(path.join(demoRoot, 'synthetic-run-002')), ['epoch-001.json', 'epoch-002.json']);
  const before = treeDigest(demoRoot);
  for (const args of [['write', 'synthetic-run-001', '1'], ['write', 'synthetic-run-001', '3'], ['write', 'synthetic-run-002', '2']]) {
    const report = failure(run(args));
    assert.equal(report.code, 'STALE_EPOCH', args.join(' '));
    assert.equal(report.acknowledged, false);
  }
  assert.equal(treeDigest(demoRoot), before);
  assert.deepEqual(fs.readdirSync(demoRoot).sort(), ['synthetic-run-001', 'synthetic-run-002']);
});

test('an unexpected error without a code is reported as CLI_FAILURE with no acknowledgment for both actions', () => {
  for (const args of [['read', 'synthetic-run-001'], ['write', 'synthetic-run-001', '2']]) {
    const report = failure(run(args, faultyStore));
    assert.equal(report.code, 'CLI_FAILURE', args.join(' '));
    assert.equal(report.message, 'unexpected store failure');
    assert.deepEqual(report.details, []);
    assert.equal(report.acknowledged, false);
    assert.equal(report.restored, false);
  }
});
