'use strict';

// Test tooling, not production code: runs one closed stage and archives raw stdout and stderr (gzip), the exit code, the
// SHA-256 of every input and the parsed counts. Every run writes a NEW directory with flag wx and nothing is ever
// rewritten or deleted: `red` runs go to evidence\red\red-<uuid>, every other stage to evidence\raw\<stage>-<uuid>.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C028', ...parts);
const INITIAL = ['primitives', 'wire', 'lifecycle', 'driver', 'faults'].map((name) => owned('evidence', 'red', `${name}.initial.snapshot.cjs`));
const SUPPLEMENT = owned('evidence', 'red', 'faults.supplement.snapshot.cjs');
// Two retained initial tests were mis-specified (see the header of the supplement); they are skipped by exact name.
const SUPERSEDED = [
  'sends.a.prefix.that.promises.too.much$',
  'when.the.server.resets.the.stream$'
].map((pattern) => `--test-skip-pattern=${pattern}`);
const SUITES = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs')).sort();
const stages = Object.freeze({
  red: { args: ['--test', '--test-concurrency=1', ...INITIAL], env: { C028_RED_SUBJECT: owned('evidence', 'red', 'stubs') }, dir: path.join('evidence', 'red'), prefix: 'red' },
  'supplement-red': { args: ['--test', '--test-concurrency=1', SUPPLEMENT], env: { C028_RED_SUBJECT: owned('evidence', 'red', 'stubs') }, dir: path.join('evidence', 'red'), prefix: 'supplement-red' },
  initial: { args: ['--test', '--test-concurrency=1', ...SUPERSEDED, ...INITIAL, SUPPLEMENT], env: {} },
  green: { args: ['--test', '--test-concurrency=1', ...SUPERSEDED, ...INITIAL, SUPPLEMENT, ...SUITES.map((name) => owned('tests', name))], env: {} },
  coverage: { args: [owned('tests', 'coverage.cjs')], env: {}, timeout: 900000 },
  syntax: { args: [owned('tests', 'syntax.cjs')], env: {} },
  browser: { args: [owned('tests', 'browser.cjs')], env: {}, timeout: 300000 }
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(stages, stage)) {
  throw new Error(`Choose one closed C028 capture stage: ${Object.keys(stages).join(', ')}.`);
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SKIPPED = [path.join('evidence', 'raw'), path.join('evidence', 'red', 'red-'), path.join('evidence', 'red', 'supplement-red-')];

function inputs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    if (SKIPPED.some((skipped) => relative === skipped || relative.startsWith(skipped))) return [];
    if (entry.isDirectory()) return inputs(file);
    return [{ path: path.relative(repository, file), sha256: hash(fs.readFileSync(file)) }];
  });
}

function parse(text) {
  const counts = {};
  for (const match of text.matchAll(/^(?:ℹ|#)\s+(tests|pass|fail|cancelled|skipped)\s+(\d+)/gm)) counts[match[1]] = Number(match[2]);
  const kinds = {};
  for (const match of text.matchAll(/^\s*name: '(\w+)'/gm)) kinds[match[1]] = (kinds[match[1]] ?? 0) + 1;
  return { counts, errorNames: kinds };
}

const definition = stages[stage];
const directory = path.join(root, definition.dir ?? path.join('evidence', 'raw'), `${definition.prefix ?? stage}-${randomUUID()}`);
fs.mkdirSync(directory, { recursive: true });
const startedAtUtc = new Date().toISOString();
const start = performance.now();
const sourceHashes = inputs(root).sort((a, b) => a.path.localeCompare(b.path));
const env = { ...process.env, ...definition.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
// the coverage gate keeps one raw, gzipped L-0004 transcript and one command record per production file
if (stage === 'coverage') env.C028_COVERAGE_OUT = path.join(directory, 'per-file');
const run = spawnSync(process.execPath, definition.args, {
  cwd: repository, env, encoding: null, timeout: definition.timeout ?? 300000, maxBuffer: 64 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, 'stdout.txt.gz'), zlib.gzipSync(stdout), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.txt.gz'), zlib.gzipSync(stderr), { flag: 'wx' });
const record = {
  schemaVersion: 1, cardId: 'C028', stage, command: ['node', ...definition.args], environment: definition.env, runtime: process.version,
  startedAtUtc, completedAtUtc: new Date().toISOString(), measuredMonotonicMs: Math.round(performance.now() - start),
  exitCode: run.status, signal: run.signal, error: run.error?.message ?? null,
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr), stdoutBytes: stdout.length, stderrBytes: stderr.length,
  stdout: path.relative(repository, path.join(directory, 'stdout.txt.gz')), stderr: path.relative(repository, path.join(directory, 'stderr.txt.gz')),
  parsed: parse(stdout.toString('utf8')), sourceHashes
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C028 CAPTURE ${stage}: exit=${run.status}; ${path.relative(repository, directory)}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
