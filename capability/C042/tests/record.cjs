'use strict';

// Test tooling, not production code: runs one closed stage and archives raw stdout, stderr, the exit code and the
// SHA-256 of every input. The RED stage writes a NEW directory evidence\red\red-<uuid>; every other stage writes
// evidence\raw\<stage>-<uuid>. Files are created with flag wx: nothing is ever rewritten or deleted.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C042', ...parts);
const initial = ['initial-a', 'initial-b'].map((name) => owned('evidence', 'red', `${name}.snapshot.cjs`));
const focused = () => fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.cjs')).sort()
  .map((name) => owned('tests', name));
const stages = Object.freeze({
  red: () => ({ args: ['--test', '--test-concurrency=1', ...initial], env: { C042_RED_SUBJECT: owned('evidence', 'red', 'stubs') } }),
  initial: () => ({ args: ['--test', '--test-concurrency=1', ...initial], env: {} }),
  green: () => ({ args: ['--test', '--test-concurrency=1', ...focused()], env: {}, timeout: 900000 }),
  coverage: () => ({ args: [owned('tests', 'coverage.cjs')], env: {}, timeout: 1800000 }),
  syntax: () => ({ args: [owned('tests', 'syntax.cjs')], env: {} }),
  browser: () => ({ args: [owned('tests', 'browser.cjs')], env: {}, timeout: 600000 }),
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(stages, stage)) {
  throw new Error(`Choose one closed C042 capture stage: ${Object.keys(stages).join(', ')}.`);
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function inputs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    if (['data', path.join('tests', 'scratch'), path.join('evidence', 'raw')].includes(relative)) return [];
    if (relative.startsWith(path.join('evidence', 'red', 'red-'))) return [];
    if (entry.isDirectory()) return inputs(file);
    return [{ path: path.relative(repository, file), rawSha256: hash(fs.readFileSync(file)) }];
  });
}

const definition = stages[stage]();
const label = `${stage === 'red' ? 'red' : stage}-${randomUUID()}`;
const directory = path.join(root, 'evidence', stage === 'red' ? 'red' : 'raw', label);
fs.mkdirSync(directory, { recursive: true });
const startedAtUtc = new Date().toISOString();
const start = performance.now();
const sourceHashes = inputs(root).sort((a, b) => a.path.localeCompare(b.path));
const env = { ...process.env, ...definition.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
const run = spawnSync(process.execPath, definition.args, {
  cwd: repository, env, encoding: null, timeout: definition.timeout ?? 300000, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, 'stdout.txt'), stdout, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.txt'), stderr, { flag: 'wx' });
const record = {
  cardId: 'C042', stage, command: ['node', ...definition.args], environment: definition.env, runtime: process.version,
  startedAtUtc, completedAtUtc: new Date().toISOString(), measuredMonotonicMs: Math.round(performance.now() - start),
  exitCode: run.status, signal: run.signal, error: run.error?.message ?? null,
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
  stdout: path.relative(repository, path.join(directory, 'stdout.txt')),
  stderr: path.relative(repository, path.join(directory, 'stderr.txt')),
  sourceHashes,
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C042 CAPTURE ${stage}: exit=${run.status}; ${path.relative(repository, directory)}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
