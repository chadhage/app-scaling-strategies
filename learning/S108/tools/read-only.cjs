'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hash, tree } = require('./proof.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const before = tree(root);
const commands = [
  ['--test', 'learning\\S108\\tests\\model.test.cjs', 'learning\\S108\\tests\\integrity.test.cjs'],
  ['learning\\S108\\tools\\syntax.cjs'],
  ['learning\\S108\\tools\\canonical.cjs'],
  ['learning\\S108\\tools\\browser.cjs'],
].map((args) => {
  const run = spawnSync(process.execPath, args, {
    cwd: repo, timeout: 90000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CAPTURE_TEST_EVIDENCE: '0', CAPTURE_BROWSER_EVIDENCE: '0' },
  });
  const stdout = run.stdout || Buffer.alloc(0);
  const stderr = run.stderr || Buffer.alloc(0);
  return {
    invocation: [process.execPath, ...args], status: run.status,
    error: run.error ? String(run.error) : null,
    stdoutBase64: stdout.toString('base64'), stderrBase64: stderr.toString('base64'),
    stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
  };
});
const after = tree(root);
const unchanged = JSON.stringify(before) === JSON.stringify(after);
console.log(JSON.stringify({
  stage: 'All four normal commands with both capture flags disabled',
  runtime: process.version, readOnly: true, ownedTreeUnchanged: unchanged,
  ownedFileCount: before.length,
  beforeTreeSha256: hash(Buffer.from(JSON.stringify(before))),
  afterTreeSha256: hash(Buffer.from(JSON.stringify(after))),
  commands, nativeValidated: false, nodeProduction24Validated: false, additionalKanoCredits: 0,
}, null, 2));
assert.ok(unchanged && commands.every((command) => command.status === 0 && !command.error),
  'Normal commands must all pass without modifying source or any historical proof.');
