'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const gate = require('./coverage-gate.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C038', ...parts);
const commands = Object.freeze({
  bdd: [owned('tests', 'phase.cjs'), 'bdd'],
  stub: [owned('tests', 'phase.cjs'), 'stub'],
  red: ['--test', owned('evidence', 'red', 'one-probe.initial.cjs')],
  'gate-red': ['--test', owned('evidence', 'red', 'aggregate-gate.initial.cjs')],
  'coverage-red': [owned('tests', 'coverage.cjs')],
  iac: [owned('tests', 'phase.cjs'), 'iac'],
  sources: [owned('tests', 'capture-sources.cjs')],
  focused: ['--test', '--test-concurrency=1', ...gate.TESTS.map((file) => owned('tests', file))],
  syntax: [owned('tests', 'syntax.cjs')],
  coverage: [owned('tests', 'coverage.cjs')],
  archive: [owned('tests', 'archive-publisher.cjs')],
  qualify: [owned('tests', 'qualify.cjs')],
  publisher: [owned('tests', 'publisher.cjs')],
  browser: [owned('tests', 'browser.cjs')],
  verify: [owned('tests', 'verify.cjs')],
  publication: [owned('tests', 'publish.cjs')]
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(commands, stage) ||
    process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Exact CAPTURE_BROWSER_EVIDENCE=1 and one closed C038 stage required.');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('No linked source capture.');
      if (['publication.json', 'published-report.json', 'evidence-index.json', 'scratch'].includes(entry.name)) return [];
      if (entry.isDirectory()) {
        if (entry.name === 'evidence') return sources(path.join(file, 'red'));
        return sources(file);
      }
      const bytes = fs.readFileSync(file);
      const relative = path.relative(repository, file);
      const git = spawnSync('git', ['--no-pager', 'hash-object', `--path=${relative}`, '--stdin'], {
        cwd: repository, input: bytes, encoding: null, windowsHide: true, timeout: 15000
      });
      if (git.status !== 0) throw new Error('Git clean-filter fingerprint failed.');
      return [{ path: relative, rawSha256: hash(bytes),
        crlfToLfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
        gitCleanObjectId: git.stdout.toString('ascii').trim() }];
    });
}
const sourceHashes = sources(root);
const raw = path.join(root, 'evidence', 'raw');
if (!fs.existsSync(raw)) fs.mkdirSync(raw);
if (fs.realpathSync(raw) !== raw || fs.lstatSync(raw).isSymbolicLink()) throw new Error('Owned regular raw root required.');
const directory = path.join(raw, `${stage}-${randomUUID()}`);
fs.mkdirSync(directory);
const env = { ...process.env };
delete env.C038_CAPTURE_DIR;
if (['sources', 'archive', 'qualify', 'browser', 'publication'].includes(stage)) env.C038_CAPTURE_DIR = directory;
else delete env.CAPTURE_BROWSER_EVIDENCE;
const startedAtUtc = new Date().toISOString();
const started = performance.now();
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repository, env, encoding: null, timeout: ['publication', 'verify'].includes(stage) ? 600000 : 240000,
  maxBuffer: 8 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, 'stdout.raw.gz'), gzipSync(stdout), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.raw.gz'), gzipSync(stderr), { flag: 'wx' });
const record = {
  cardId: 'C038', workerId: 'worker-C038', stage,
  command: ['node', ...commands[stage]], runtime: process.version,
  recorderPid: process.pid, startedAtUtc, completedAtUtc: new Date().toISOString(),
  measuredMonotonicMs: performance.now() - started, exitCode: run.status, signal: run.signal,
  error: run.error?.message || null, directory: path.relative(repository, directory),
  capture: 'exact CAPTURE_BROWSER_EVIDENCE=1; unique append; lossless original stdout/stderr',
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr), sourceHashes
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C038 ${stage}: exit=${run.status}; ${record.directory}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
