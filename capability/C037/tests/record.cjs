'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const own = (...parts) => path.join('capability', 'C037', ...parts);
const commands = Object.freeze({
  bdd: [own('tests', 'phase.cjs'), 'bdd'],
  stub: [own('tests', 'phase.cjs'), 'stub'],
  red: ['--test', own('evidence', 'red', 'requested-as-observed.initial.test.cjs')],
  iac: [own('tests', 'phase.cjs'), 'iac'],
  pins: [own('tests', 'pin-source.cjs')],
  authority: [own('tests', 'capture-authority.cjs')],
  focused: ['--test', '--test-concurrency=1', own('tests', 'routing.test.cjs'), own('tests', 'surface.test.cjs'), own('tests', 'authority.test.cjs'),
    own('tests', 'page.test.cjs'), own('tests', 'cli.test.cjs'), own('tests', 'pins.test.cjs')],
  syntax: [own('tests', 'syntax.cjs')],
  browser: [own('tests', 'browser.cjs')],
  seal: [own('tests', 'seal.cjs')],
  coverbdd: [own('tests', 'phase.cjs'), 'coverbdd'],
  coverred: ['--test', own('evidence', 'red', 'coverage-bar.initial.test.cjs')],
  coverage: [own('tests', 'coverage.cjs')],
  addendum: [own('tests', 'seal-addendum.cjs')],
  verify: [own('tests', 'verify.cjs')],
  publication: [own('tests', 'publish.cjs')],
  report: [own('tests', 'report.cjs')]
});
const stage = process.argv[2];
const timeouts = Object.freeze({ focused: 600000, coverred: 900000, coverage: 900000 });
if (process.argv.length !== 3 || !Object.hasOwn(commands, stage) || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Exact CAPTURE_BROWSER_EVIDENCE=1 and one closed own capture stage are required.');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sources(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Linked evidence sources are forbidden.');
    if (entry.isDirectory()) return entry.name === 'evidence' ? sources(path.join(file, 'red')) : sources(file);
    const bytes = fs.readFileSync(file);
    return [{ path: path.relative(repository, file), rawSha256: hash(bytes),
      crlfToLfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) }];
  });
}
const raw = path.join(root, 'evidence', 'raw');
fs.mkdirSync(raw, { recursive: true });
if (fs.realpathSync(raw) !== raw || fs.lstatSync(raw).isSymbolicLink()) throw new Error('Exact own raw directory required.');
const directory = path.join(raw, `${stage}-${randomUUID()}`);
fs.mkdirSync(directory);
const sourceHashes = sources(root);
const env = { ...process.env };
delete env.C037_CAPTURE_DIR;
if (['pins', 'authority', 'browser', 'seal', 'addendum', 'publication', 'report'].includes(stage)) env.C037_CAPTURE_DIR = directory;
else delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
const startedAtUtc = new Date().toISOString();
const started = performance.now();
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repository, env, encoding: null, windowsHide: true, timeout: timeouts[stage] ?? 240000,
  maxBuffer: 8 * 1024 * 1024
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [name, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(directory, `${name}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const record = {
  cardId: 'C037', workerId: 'worker-C037', stage, command: ['node', ...commands[stage]],
  runtime: process.version, recorderPid: process.pid, startedAtUtc, completedAtUtc: new Date().toISOString(),
  measuredMonotonicMs: performance.now() - started, exitCode: run.status, signal: run.signal,
  error: run.error?.message || null, directory: path.relative(repository, directory),
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr), sourceHashes,
  capture: 'exact CAPTURE_BROWSER_EVIDENCE=1; unique append; original raw stdout/stderr retained'
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`C037 ${stage}: exit=${run.status}; ${record.directory}`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
