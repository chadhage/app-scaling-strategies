'use strict';

// Test tooling, not production code. Runs one Node command and archives its raw output into a NEW unique
// evidence directory (never overwrites): gzip of raw stdout and stderr, the exit code and the input SHA-256.
// Usage: node capture.cjs <red|green|coverage|browser|syntax> <stage> <inputs,comma,separated> -- <node arguments...>
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

const separator = process.argv.indexOf('--');
const [kind, stage, inputList] = process.argv.slice(2, separator === -1 ? undefined : separator);
const args = separator === -1 ? [] : process.argv.slice(separator + 1);
if (!['red', 'green', 'coverage', 'browser', 'syntax'].includes(kind) || !/^[a-z][a-z0-9-]{0,40}$/.test(stage || '') || !inputList || args.length === 0) {
  console.error('Usage: node capture.cjs <red|green|coverage|browser|syntax> <stage> <inputs,comma,separated> -- <node arguments...>');
  process.exit(2);
}
const namespaceRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(namespaceRoot, '..', '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

const inputs = inputList.split(',').map((relative) => {
  const bytes = fs.readFileSync(path.join(repositoryRoot, relative));
  return { path: relative.replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes), lfCanonicalSha256: sha256(canonical(bytes)) };
});
const directory = path.join(namespaceRoot, 'evidence', kind, `${stage}-${randomUUID()}`);
fs.mkdirSync(path.dirname(directory), { recursive: true });
fs.mkdirSync(directory);

const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, args, { cwd: repositoryRoot, env, encoding: null, windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, 'stdout.raw.gz'), gzipSync(stdout));
fs.writeFileSync(path.join(directory, 'stderr.raw.gz'), gzipSync(stderr));
const record = {
  cardId: 'C032', kind, stage, command: ['node', ...args], nodeVersion: process.version, platform: process.platform,
  testSubjectOverride: env.C032_TEST_SUBJECT || null, startedAtUtc, completedAtUtc: new Date().toISOString(),
  exitCode: run.status, signal: run.signal, error: run.error ? run.error.message : null,
  stdoutSha256: sha256(stdout), stdoutBytes: stdout.length, stderrSha256: sha256(stderr), stderrBytes: stderr.length,
  inputs
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C032 ${kind}/${stage}: exit=${run.status}; raw output archived in ${path.relative(repositoryRoot, directory)}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
