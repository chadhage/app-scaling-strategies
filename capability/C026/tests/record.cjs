'use strict';

// Test tooling, not production code: runs one closed stage and archives raw stdout, stderr, the exit code and the
// SHA-256 of every input. `red` and `supplement` write immutable files under evidence\red (flag wx); other stages
// write evidence\raw\<stage>-<uuid>\. Nothing is rewritten or deleted.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C026', ...parts);
const GREEN_TESTS = ['framing', 'stream', 'server', 'conversation', 'page', 'surface', 'limits', 'hardening', 'heap-limit', 'refusal-close', 'recovery', 'evidence']
  .map((name) => owned('tests', `${name}.test.cjs`));
const stages = Object.freeze({
  red: { args: ['--test', owned('evidence', 'red', 'behavior.initial.snapshot.cjs')], env: { C026_RED_SUBJECT: owned('evidence', 'red', 'stubs') } },
  supplement: { args: ['--test', owned('evidence', 'red', 'behavior.assertions.snapshot.cjs')], env: { C026_RED_SUBJECT: owned('evidence', 'red', 'stubs') } },
  green: { args: ['--test', ...GREEN_TESTS], env: {} },
  initial: { args: ['--test', owned('evidence', 'red', 'behavior.initial.snapshot.cjs')], env: {} },
  coverage: { args: [owned('tests', 'coverage.cjs')], env: {}, timeout: 900000 },
  syntax: { args: [owned('tests', 'syntax.cjs')], env: {} },
  browser: { args: [owned('tests', 'browser.cjs')], env: {}, timeout: 300000 }
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(stages, stage)) {
  throw new Error(`Choose one closed C026 capture stage: ${Object.keys(stages).join(', ')}.`);
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const RED_PREFIXES = Object.freeze({ red: 'initial-red.', supplement: 'supplement-red.' });
function inputs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    if (relative === path.join('evidence', 'raw') || Object.values(RED_PREFIXES).some((prefix) => relative.startsWith(path.join('evidence', 'red', prefix)))) return [];
    if (entry.isDirectory()) return inputs(file);
    const bytes = fs.readFileSync(file);
    return [{ path: path.relative(repository, file), rawSha256: hash(bytes) }];
  });
}
const definition = stages[stage];
const directory = Object.hasOwn(RED_PREFIXES, stage) ? path.join(root, 'evidence', 'red') : path.join(root, 'evidence', 'raw', `${stage}-${randomUUID()}`);
fs.mkdirSync(directory, { recursive: true });
const prefix = RED_PREFIXES[stage] ?? '';
const startedAtUtc = new Date().toISOString();
const start = performance.now();
const sourceHashes = inputs(root).sort((a, b) => a.path.localeCompare(b.path));
const env = { ...process.env, ...definition.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
const run = spawnSync(process.execPath, definition.args, {
  cwd: repository, env, encoding: null, timeout: definition.timeout ?? 300000, maxBuffer: 32 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, `${prefix}stdout.txt`), stdout, { flag: 'wx' });
fs.writeFileSync(path.join(directory, `${prefix}stderr.txt`), stderr, { flag: 'wx' });
const record = {
  cardId: 'C026', stage, command: ['node', ...definition.args], environment: definition.env, runtime: process.version,
  startedAtUtc, completedAtUtc: new Date().toISOString(), measuredMonotonicMs: Math.round(performance.now() - start),
  exitCode: run.status, signal: run.signal, error: run.error?.message ?? null,
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
  stdout: path.relative(repository, path.join(directory, `${prefix}stdout.txt`)),
  stderr: path.relative(repository, path.join(directory, `${prefix}stderr.txt`)),
  sourceHashes
};
fs.writeFileSync(path.join(directory, `${prefix}run.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C026 CAPTURE ${stage}: exit=${run.status}; ${path.relative(repository, directory)}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
