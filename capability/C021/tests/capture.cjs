'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

const [stage, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,40}$/.test(stage || '') || args.length === 0) {
  throw new Error('Explicit capture: node capability\\C021\\tests\\capture.cjs <stage> <Node arguments...>');
}
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const recordPath = path.join(evidence, `${stage}.json`);
if (fs.existsSync(recordPath)) throw new Error(`Evidence stage already exists; preserve historical proof: ${stage}`);

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence' && entry.name !== 'evidence.json')
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? sources(file) : [file];
    });
}
const files = [
  ...sources(root),
  path.join(root, 'evidence', 'red', 'compatibility.initial.snapshot.cjs'),
  ...['contract.js', 'profiles.cjs', 'inspector.js'].map((name) => path.join(root, '..', 'C020', name))
];
const sourceHashes = files.map((file) => ({ path: path.relative(repo, file), sha256: hash(fs.readFileSync(file)) }));
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, args, {
  cwd: repo, encoding: null, timeout: 240000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, FORCE_COLOR: '0' }
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [stream, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(evidence, `${stage}.${stream}.gz`), gzipSync(bytes));
}
const record = {
  cardId: 'C021', stage, command: ['node', ...args], runtime: process.version,
  historicalSubjectOverride: process.env.C021_RED_SUBJECT || null,
  deliberateBrowserCapture: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  startedAtUtc, completedAtUtc: new Date().toISOString(),
  exitCode: run.status, signal: run.signal, error: run.error?.message || null,
  stdout: `capability\\C021\\evidence\\${stage}.stdout.gz`,
  stderr: `capability\\C021\\evidence\\${stage}.stderr.gz`,
  stdoutEncoding: 'gzip', stderrEncoding: 'gzip',
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr), sourceHashes
};
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C021 explicit evidence capture ${stage}: exit=${run.status}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
