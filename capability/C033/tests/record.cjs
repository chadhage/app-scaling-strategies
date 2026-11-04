'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C033', ...parts);
const commands = Object.freeze({
  bdd: [owned('tests', 'phase.cjs'), 'bdd'],
  stub: [owned('tests', 'phase.cjs'), 'stub'],
  red: ['--test', owned('evidence', 'red', 'journey.initial.snapshot.cjs')],
  iac: [owned('tests', 'phase.cjs'), 'iac'],
  consent: [owned('tests', 'phase.cjs'), 'consent'],
  green: ['--test', owned('tests', 'journey.test.cjs'), owned('tests', 'server.test.cjs'), owned('tests', 'surface.test.cjs')],
  syntax: [owned('tests', 'syntax.cjs')],
  integrity: ['--test', owned('tests', 'integrity.test.cjs')],
  readonly: [owned('tests', 'read-only.cjs')],
  browser: [owned('tests', 'browser.cjs')]
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(commands, stage)) {
  throw new Error('Choose one closed C033 capture stage: bdd, stub, red, iac, consent, green, syntax, integrity, readonly or browser.');
}
if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Browser capture requires deliberate exact CAPTURE_BROWSER_EVIDENCE=1; normal checks are read-only.');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rawRoot = path.join(root, 'evidence', 'raw');
fs.mkdirSync(rawRoot, { recursive: true });
const directory = path.join(rawRoot, `${stage}-${randomUUID()}`);
fs.mkdirSync(directory);
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'evidence' || entry.name === 'evidence.json' || entry.name === 'publication.json') return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    const bytes = fs.readFileSync(file);
    return [{
      path: path.relative(repository, file), rawSha256: hash(bytes),
      crlfToLfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'))
    }];
  });
}
const startedAtUtc = new Date().toISOString();
const start = performance.now();
const sourceHashes = [...sources(root), ...sources(path.join(root, 'evidence', 'red'))];
const env = { ...process.env };
delete env.C033_CAPTURE_DIR;
if (stage === 'browser') env.C033_CAPTURE_DIR = directory;
else delete env.CAPTURE_BROWSER_EVIDENCE;
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repository, env, encoding: null, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [name, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(directory, `${name}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const record = {
  cardId: 'C033', stage, command: ['node', ...commands[stage]], runtime: process.version,
  pid: process.pid, startedAtUtc, completedAtUtc: new Date().toISOString(),
  measuredMonotonicMs: performance.now() - start,
  exitCode: run.status, signal: run.signal, error: run.error?.message || null,
  captureBrowserEvidence: stage === 'browser' ? '1' : null,
  directory: path.relative(repository, directory), stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
  stdout: path.relative(repository, path.join(directory, 'stdout.raw.gz')),
  stderr: path.relative(repository, path.join(directory, 'stderr.raw.gz')), sourceHashes
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C033 CAPTURE ${stage}: exit=${run.status}; ${record.directory}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
