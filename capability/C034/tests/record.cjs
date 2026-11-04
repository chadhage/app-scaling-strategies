'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C034', ...parts);
const commands = Object.freeze({
  bdd: [owned('tests', 'phase.cjs'), 'bdd'],
  stub: [owned('tests', 'phase.cjs'), 'stub'],
  red: ['--test', owned('evidence', 'red', 'trace.initial.snapshot.cjs')],
  iac: [owned('tests', 'phase.cjs'), 'iac'],
  trace: [owned('tests', 'capture-trace.cjs')],
  focused: ['--test', '--test-concurrency=1', owned('tests', 'trace.test.cjs'), owned('tests', 'guards.test.cjs'), owned('tests', 'surface.test.cjs')],
  syntax: [owned('tests', 'syntax.cjs')],
  browser: [owned('tests', 'browser.cjs')],
  verify: [owned('tests', 'verify.cjs')],
  integrity: ['--test', owned('tests', 'integrity.test.cjs')]
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(commands, stage) ||
    process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Deliberate capture requires exact CAPTURE_BROWSER_EVIDENCE=1 and one closed C034 stage.');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sourceHashes(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('No linked own capture sources.');
    if (entry.name === 'publication.json' || entry.name === 'evidence-index.json') return [];
    if (entry.isDirectory()) {
      if (entry.name === 'evidence') return sourceHashes(path.join(file, 'red'));
      return sourceHashes(file);
    }
    const bytes = fs.readFileSync(file);
    return [{
      path: path.relative(repository, file), rawSha256: hash(bytes),
      crlfToLfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')))
    }];
  });
}
const rawRoot = path.join(root, 'evidence', 'raw');
if (!fs.existsSync(rawRoot)) fs.mkdirSync(rawRoot);
if (fs.lstatSync(rawRoot).isSymbolicLink() || fs.realpathSync(rawRoot) !== rawRoot) {
  throw new Error('Capture root must be an exact regular own directory.');
}
const directory = path.join(rawRoot, `${stage}-${randomUUID()}`);
fs.mkdirSync(directory);
const startedAtUtc = new Date().toISOString();
const started = performance.now();
const sources = sourceHashes(root);
for (const name of ['bundle.json', 'bundle.js']) {
  const file = path.join(rawRoot, 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116', name);
  if (fs.existsSync(file)) {
    const bytes = fs.readFileSync(file);
    sources.push({ path: path.relative(repository, file), rawSha256: hash(bytes),
      crlfToLfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) });
  }
}
const env = { ...process.env };
delete env.C034_CAPTURE_DIR;
if (['trace', 'browser'].includes(stage)) env.C034_CAPTURE_DIR = directory;
else delete env.CAPTURE_BROWSER_EVIDENCE;
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repository, env, encoding: null, timeout: 180000,
  maxBuffer: 4 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [name, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(directory, `${name}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const record = {
  cardId: 'C034', workerId: 'worker-C034', stage, command: ['node', ...commands[stage]],
  testRuntime: process.version, actualRecorderPid: process.pid,
  startedAtUtc, completedAtUtc: new Date().toISOString(), measuredMonotonicMs: performance.now() - started,
  exitCode: run.status, signal: run.signal, error: run.error?.message || null,
  deliberateCapture: 'CAPTURE_BROWSER_EVIDENCE=1', directory: path.relative(repository, directory),
  stdout: path.relative(repository, path.join(directory, 'stdout.raw.gz')),
  stderr: path.relative(repository, path.join(directory, 'stderr.raw.gz')),
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr), sourceHashes: sources
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C034 ${stage}: exit=${run.status}; ${record.directory}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
