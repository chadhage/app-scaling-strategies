'use strict';

// Test tooling, not production code: runs one command, archives its raw stdout and stderr (gzip), the exit code,
// the command, the runtime and the SHA-256 of every namespace input file. Usage:
//   node capability\C009\tests\capture.cjs <stage> <Node arguments...>
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

const [stage, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,40}(\/[a-z0-9][a-z0-9-]{0,40})?$/.test(stage || '') || args.length === 0) {
  throw new Error('Usage: node capture.cjs <stage or group/run> <Node arguments...>');
}
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const out = path.join(root, 'evidence', ...stage.split('/'));
if (fs.existsSync(path.join(out, 'record.json'))) throw new Error(`evidence/${stage} is already archived and immutable; use a new run name`);
fs.mkdirSync(out, { recursive: true });
const outputs = new Set(['stdout.gz', 'stderr.gz', 'record.json'].map((name) => path.join(out, name)));

function inputs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return inputs(file);
    if (outputs.has(file) || /[\\/]evidence[\\/](?!red[\\/](stub|snapshot)[\\/])/.test(file)) return [];
    return [{ path: path.relative(repository, file), sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }];
  });
}

const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
delete environment.NODE_V8_COVERAGE;
const startedAtUtc = new Date().toISOString();
const sourceHashes = inputs(root);
const run = spawnSync(process.execPath, args, { cwd: repository, env: environment, encoding: null, timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(out, 'stdout.gz'), gzipSync(stdout));
fs.writeFileSync(path.join(out, 'stderr.gz'), gzipSync(stderr));
const record = {
  stage, command: ['node', ...args], runtime: process.version, subjectOverride: process.env.C009_SUBJECT_DIR || null,
  startedAtUtc, completedAtUtc: new Date().toISOString(), exitCode: run.status, signal: run.signal, error: run.error ? run.error.message : null,
  stdoutSha256: createHash('sha256').update(stdout).digest('hex'), stderrSha256: createHash('sha256').update(stderr).digest('hex'),
  assertionErrors: (stdout.toString('utf8').match(/code: 'ERR_ASSERTION'/g) || []).length,
  sourceHashes
};
fs.writeFileSync(path.join(out, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(stdout);
process.stderr.write(stderr);
process.stdout.write(`\nC009 ${stage}: exit=${run.status}, assertion errors=${record.assertionErrors}, raw gzip logs preserved under evidence\\${stage}.\n`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
