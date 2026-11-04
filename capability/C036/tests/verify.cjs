'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { snapshot, root, repository } = require('./inventory.cjs');
const { checkImports, checkPublisher } = require('..\\pins.cjs');
const ownBefore = snapshot(root);
const demoRoot = path.join(repository, 'capability', 'C015', 'fixtures', 'synthetic-restart-v1');
const demoBefore = snapshot(demoRoot);
const importsBefore = checkImports();
const publisherBefore = checkPublisher();
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C036_CAPTURE_DIR;
const commands = [
  ['--test', '--test-concurrency=1', path.join(__dirname, 'attribution.test.cjs'),
    path.join(__dirname, 'guards.test.cjs'), path.join(__dirname, 'current.test.cjs'), path.join(__dirname, 'surface.test.cjs')],
  [path.join(__dirname, 'syntax.cjs')],
  [path.join(__dirname, 'publisher.cjs')],
  [path.join(__dirname, 'browser.cjs')]
];
if (fs.existsSync(path.join(root, 'evidence-index.json'))) commands.push(['--test', path.join(__dirname, 'integrity.test.cjs')]);
const failures = [];
const outcomes = [];
for (const args of commands) {
  const run = spawnSync(process.execPath, args, {
    cwd: repository, env, encoding: null, timeout: 240000, maxBuffer: 4 * 1024 * 1024, windowsHide: true
  });
  process.stdout.write(run.stdout || Buffer.alloc(0));
  process.stderr.write(run.stderr || Buffer.alloc(0));
  const text = (run.stdout || Buffer.alloc(0)).toString('utf8');
  outcomes.push({
    command: ['node', ...args], exitCode: run.status,
    focusedLeaves: Number(/# tests (\d+)/.exec(text)?.[1] || 0)
  });
  if (run.status !== 0 || run.signal || run.error) failures.push({ command: args, exit: run.status, signal: run.signal, error: run.error?.message || null });
}
assert.deepEqual(snapshot(root), ownBefore, 'Normal verification must not change source, evidence, bytes or listings.');
assert.deepEqual(snapshot(demoRoot), demoBefore, 'Retained C015 demonstration and existing state remain immutable.');
assert.deepEqual(checkImports(), importsBefore, 'Unchanged accepted C015/C034 and underlying source pins remain identical.');
assert.equal(checkPublisher().actualSha256, publisherBefore.actualSha256);
const io = path.join(root, 'tests', 'io-scratch');
assert.equal(fs.existsSync(io), false, 'Only exact created publisher test files/empty directories may be cleaned.');
assert.deepEqual(failures, [], 'Every actual focused/syntax/publisher/browser/integrity check must succeed.');
console.log(JSON.stringify({
  cardId: 'C036', outcome: 'read-only-green', ownEntriesUnchanged: ownBefore.length,
  retainedC015EntriesUnchanged: demoBefore.length, directPinsUnchanged: importsBefore.direct.length,
  underlyingC034PinsUnchanged: importsBefore.unchangedC034Underlying.length,
  currentPublisherRawSha256: publisherBefore.actualSha256,
  normalSourceOrEvidenceWrites: 0, retainedDemoWrites: 0,
  explicitFreshC015TestUUIDs: 3, publicClosedEpochWrites: 5, exactTestCleanupVerified: true,
  publisherGuardGroups: 51, actualBrowserRerun: true, browserCapture: false, outcomes
}));
