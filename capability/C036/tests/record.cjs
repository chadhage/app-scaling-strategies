'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const owned = (...parts) => path.join('capability', 'C036', ...parts);
const commands = Object.freeze({
  bdd: [owned('tests', 'phase.cjs'), 'bdd'],
  stub: [owned('tests', 'phase.cjs'), 'stub'],
  red: ['--test', owned('evidence', 'red', 'false-attribution.initial.cjs')],
  iac: [owned('tests', 'phase.cjs'), 'iac'],
  pins: [owned('tests', 'pin-source.cjs')],
  context: [owned('tests', 'capture-context.cjs')],
  focused: ['--test', '--test-concurrency=1', owned('tests', 'attribution.test.cjs'), owned('tests', 'guards.test.cjs'), owned('tests', 'current.test.cjs'), owned('tests', 'surface.test.cjs')],
  syntax: [owned('tests', 'syntax.cjs')],
  publisher: [owned('tests', 'publisher.cjs')],
  browser: [owned('tests', 'browser.cjs')],
  verify: [owned('tests', 'verify.cjs')],
  integrity: ['--test', owned('tests', 'integrity.test.cjs')],
  publication: [owned('tests', 'publish.cjs')]
});
const stage = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(commands, stage) || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Capture requires exact CAPTURE_BROWSER_EVIDENCE=1 and one closed C036 stage.');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('No linked capture sources.');
    if (['publication.json', 'published-report.json', 'evidence-index.json', 'io-scratch'].includes(entry.name)) return [];
    if (entry.isDirectory()) {
      if (entry.name === 'evidence') return sources(path.join(file, 'red'));
      return sources(file);
    }
    const bytes = fs.readFileSync(file);
    return [{
      path: path.relative(repository, file), rawSha256: hash(bytes),
      crlfToLfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')))
    }];
  });
}
const raw = path.join(root, 'evidence', 'raw');
if (!fs.existsSync(raw)) fs.mkdirSync(raw);
if (fs.lstatSync(raw).isSymbolicLink() || fs.realpathSync(raw) !== raw) throw new Error('Exact own raw root required.');
const directory = path.join(raw, `${stage}-${randomUUID()}`);
fs.mkdirSync(directory);
const sourceHashes = sources(root);
const env = { ...process.env };
delete env.C036_CAPTURE_DIR;
if (['pins', 'context', 'browser', 'publication'].includes(stage)) env.C036_CAPTURE_DIR = directory;
else delete env.CAPTURE_BROWSER_EVIDENCE;
const startedAtUtc = new Date().toISOString();
const started = performance.now();
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repository, env, encoding: null, timeout: 240000,
  maxBuffer: 4 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [name, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(directory, `${name}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const record = {
  cardId: 'C036', workerId: 'worker-C036', stage, command: ['node', ...commands[stage]],
  runtime: process.version, recorderPid: process.pid, startedAtUtc,
  completedAtUtc: new Date().toISOString(), measuredMonotonicMs: performance.now() - started,
  exitCode: run.status, signal: run.signal, error: run.error?.message || null,
  capture: 'CAPTURE_BROWSER_EVIDENCE=1; unique own append; original stdout/stderr bytes retained',
  directory: path.relative(repository, directory), stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
  stdout: path.relative(repository, path.join(directory, 'stdout.raw.gz')),
  stderr: path.relative(repository, path.join(directory, 'stderr.raw.gz')), sourceHashes
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C036 ${stage}: exit=${run.status}; ${record.directory}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
