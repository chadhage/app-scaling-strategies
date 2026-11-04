'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const own = (...parts) => path.join('capability', 'C029', ...parts);
const commands = Object.freeze({
  bdd: [own('tests', 'phase.cjs'), 'bdd'],
  stub: [own('tests', 'phase.cjs'), 'stub'],
  red: ['--test', own('evidence', 'red', 'evaluator.initial.snapshot.cjs')],
  iac: [own('tests', 'phase.cjs'), 'iac'],
  implementation: [own('tests', 'phase.cjs'), 'implementation'],
  pins: [own('tests', 'capture-pins.cjs')],
  focused: ['--test', '--test-concurrency=1', own('tests', 'evaluator.test.cjs'),
    own('tests', 'guards.test.cjs'), own('tests', 'source.test.cjs'), own('tests', 'surface.test.cjs')],
  syntax: [own('tests', 'syntax.cjs')],
  browser: [own('tests', 'browser.cjs')],
  verify: [own('tests', 'verify.cjs')],
  integrity: ['--test', own('tests', 'integrity.test.cjs')]
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(commands, stage) ||
    process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Exact CAPTURE_BROWSER_EVIDENCE=1 and one closed C029 stage are required.');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || fs.realpathSync(file) !== file) throw new Error('Linked own source is forbidden.');
    if (entry.name === 'evidence-index.json' || /^publication-result-/.test(entry.name)) return [];
    if (entry.isDirectory()) {
      if (entry.name === 'evidence') return sources(path.join(file, 'red'));
      return sources(file);
    }
    const bytes = fs.readFileSync(file);
    return [{ path: path.relative(repository, file), rawSha256: hash(bytes),
      crlfToLfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) }];
  });
}
const raw = path.join(root, 'evidence', 'raw');
if (!fs.existsSync(raw)) fs.mkdirSync(raw);
if (fs.realpathSync(raw) !== raw || fs.lstatSync(raw).isSymbolicLink()) throw new Error('Exact owned capture root required.');
const directory = path.join(raw, `${stage}-${randomUUID()}`);
fs.mkdirSync(directory);
const sourceHashes = sources(root);
if (stage === 'implementation') {
  fs.writeFileSync(path.join(directory, 'evaluator.initial.raw.gz'),
    gzipSync(fs.readFileSync(path.join(root, 'evaluator.js'))), { flag: 'wx' });
}
const startedAtUtc = new Date().toISOString();
const started = performance.now();
const env = { ...process.env };
delete env.C029_CAPTURE_DIR;
if (stage === 'browser') env.C029_CAPTURE_DIR = directory;
if (!['browser', 'pins'].includes(stage)) delete env.CAPTURE_BROWSER_EVIDENCE;
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repository, env, encoding: null, timeout: 180000,
  maxBuffer: 4 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [name, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(directory, `${name}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const receipt = {
  cardId: 'C029', workerId: 'worker-C029', stage, command: ['node', ...commands[stage]],
  testRuntime: process.version, actualRecorderPid: process.pid,
  startedAtUtc, completedAtUtc: new Date().toISOString(), measuredMonotonicMs: performance.now() - started,
  exitCode: run.status, signal: run.signal, error: run.error?.message || null,
  deliberateCapture: 'CAPTURE_BROWSER_EVIDENCE=1', directory: path.relative(repository, directory),
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr), sourceHashes
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C029 ${stage}: exit=${run.status}; ${receipt.directory}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
