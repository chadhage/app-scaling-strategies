'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

const [stage, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,40}$/.test(stage || '') || args.length === 0) {
  throw new Error('Usage: node capture.cjs <stage> <Node arguments...>');
}
const capabilityRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(capabilityRoot, '..', '..');
const evidence = path.join(capabilityRoot, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence' && entry.name !== 'evidence.json')
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? sources(file) : [{
        path: path.relative(repositoryRoot, file),
        sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      }];
    });
}

const startedAtUtc = new Date().toISOString();
const sourceHashes = sources(capabilityRoot);
const run = spawnSync(process.execPath, args, {
  cwd: repositoryRoot, encoding: null, timeout: 120000, maxBuffer: 8 * 1024 * 1024
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [name, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(evidence, `${stage}.${name}.gz`), gzipSync(bytes));
}
const record = {
  stage, command: ['node', ...args], runtime: process.version,
  testSubjectOverride: process.env.C020_TEST_SUBJECT || null,
  startedAtUtc, completedAtUtc: new Date().toISOString(),
  exitCode: run.status, signal: run.signal, error: run.error?.message || null,
  stdout: path.relative(repositoryRoot, path.join(evidence, `${stage}.stdout.gz`)),
  stderr: path.relative(repositoryRoot, path.join(evidence, `${stage}.stderr.gz`)),
  stdoutSha256: createHash('sha256').update(stdout).digest('hex'),
  stderrSha256: createHash('sha256').update(stderr).digest('hex'),
  sourceHashes
};
fs.writeFileSync(path.join(evidence, `${stage}.json`), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(stdout);
process.stderr.write(stderr);
process.stdout.write(`\nC020 ${stage}: exit=${run.status}, raw gzip logs preserved.\n`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
