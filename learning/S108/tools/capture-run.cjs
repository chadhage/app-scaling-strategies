'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { tree, nextName, saveRaw, writeRecord } = require('./proof.cjs');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const stage = process.argv[2];
const commands = {
  green: ['--test', 'learning\\S108\\tests\\model.test.cjs', 'learning\\S108\\tests\\integrity.test.cjs'],
  syntax: ['learning\\S108\\tools\\syntax.cjs'],
  canonical: ['learning\\S108\\tools\\canonical.cjs'],
  readonly: ['learning\\S108\\tools\\read-only.cjs'],
};
assert.ok(process.env.CAPTURE_TEST_EVIDENCE === '1' && process.argv.length === 3 && Object.hasOwn(commands, stage),
  'Deliberate append-only capture requires exact CAPTURE_TEST_EVIDENCE=1 and green|syntax|canonical|readonly.');
const name = nextName(evidence, stage);
const sourceFiles = tree(root).map(([file]) => file).filter((file) => !file.startsWith(`evidence${path.sep}`));
const snapshots = sourceFiles.map((file) => ({
  source: file.split(path.sep).join('/'),
  ...saveRaw(evidence, name, file.replace(/[\\/]/g, '--'), fs.readFileSync(path.join(root, file))),
}));
const before = tree(root);
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repo, timeout: stage === 'readonly' ? 240000 : 90000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '0', CAPTURE_TEST_EVIDENCE: '0' },
});
const unchanged = JSON.stringify(tree(root)) === JSON.stringify(before);
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
const acceptedResult = run.status === 0 && !run.error && unchanged;
writeRecord(evidence, name, {
  stage, name, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...commands[stage]], runtime: process.version,
  status: run.status, signal: run.signal, error: run.error ? String(run.error) : null,
  stdout: saveRaw(evidence, name, 'stdout', stdout),
  stderr: saveRaw(evidence, name, 'stderr', stderr),
  snapshots, acceptedResult, ownedTreeUnchangedDuringRun: unchanged,
  additionalKanoCredits: 0, nativeValidated: false, nodeProduction24Validated: false,
});
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(JSON.stringify({ evidence: `${name}.json`, status: run.status, acceptedResult }));
if (!acceptedResult) process.exitCode = 1;
