'use strict';

// Test tooling, not production code: deliberate evidence recorder. One closed stage per run, exact
// CAPTURE_BROWSER_EVIDENCE=1, a new unique evidence\raw\<stage>-<uuid> directory, raw stdout/stderr kept
// losslessly as gzip, the real exit code, the runtime and SHA-256 of every owned input.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const { FOCUSED } = require('./focused.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C044', ...parts);
const focusedTests = FOCUSED.map((name) => owned('tests', name));
const commands = Object.freeze({
  red: { args: ['--test', owned('evidence', 'red', 'stream.initial.cjs')], timeoutMs: 120000 },
  focused: { args: ['--test', '--test-concurrency=1', ...focusedTests], timeoutMs: 600000 },
  syntax: { args: [owned('tests', 'syntax.cjs')], timeoutMs: 120000 },
  coverage: { args: [owned('tests', 'coverage.cjs')], timeoutMs: 900000 },
  browser: { args: [owned('tests', 'browser.cjs')], timeoutMs: 600000 },
  limits: { args: [owned('tests', 'helper-limits.cjs')], timeoutMs: 300000 },
});

const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(commands, stage) || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Exact CAPTURE_BROWSER_EVIDENCE=1 and one closed C044 stage (red, focused, syntax, coverage, browser, limits) are required.');
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function listSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('No linked source capture.');
    const relative = path.relative(repository, file);
    if (entry.isDirectory()) {
      if (['raw', 'scratch', 'state'].includes(entry.name)) return [];
      return listSources(file);
    }
    if (['publication.json', 'published-report.json'].includes(entry.name)) return [];
    const bytes = fs.readFileSync(file);
    return [{
      path: relative, rawSha256: sha256(bytes),
      crlfToLfSha256: sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
    }];
  });
}

const sourceHashes = listSources(root);
const rawRoot = path.join(root, 'evidence', 'raw');
if (!fs.existsSync(rawRoot)) fs.mkdirSync(rawRoot, { recursive: true });
if (fs.lstatSync(rawRoot).isSymbolicLink() || fs.realpathSync(rawRoot) !== rawRoot) throw new Error('Owned regular raw root required.');
const directory = path.join(rawRoot, `${stage}-${randomUUID()}`);
fs.mkdirSync(directory);

const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
if (stage !== 'browser') delete env.CAPTURE_BROWSER_EVIDENCE;
else env.C044_CAPTURE_DIR = directory;
const startedAtUtc = new Date().toISOString();
const started = performance.now();
const spec = commands[stage];
const run = spawnSync(process.execPath, spec.args, {
  cwd: repository, env, encoding: null, timeout: spec.timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, 'stdout.raw.gz'), gzipSync(stdout), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.raw.gz'), gzipSync(stderr), { flag: 'wx' });
const record = {
  cardId: 'C044', workerId: 'worker-C044', stage, command: ['node', ...spec.args], runtime: process.version,
  recorderPid: process.pid, startedAtUtc, completedAtUtc: new Date().toISOString(),
  measuredMonotonicMs: performance.now() - started, exitCode: run.status, signal: run.signal,
  error: run.error?.message || null, directory: path.relative(repository, directory),
  capture: 'exact CAPTURE_BROWSER_EVIDENCE=1; unique append; lossless original stdout and stderr',
  stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr), sourceHashes,
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C044 ${stage}: exit=${run.status}; ${record.directory}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
