'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stage = process.argv[2];
const targets = {
  bdd: ['-e', "const fs=require('node:fs');const s=fs.readFileSync('capability\\\\C035\\\\C035.feature','utf8');require('node:assert/strict').equal((s.match(/  Scenario:/g)||[]).length,7);console.log('Seven original C035 BDD scenarios exist before the loadable stub RED.');"],
  stub: ['-e', "const c=require('.\\\\capability\\\\C035\\\\classifier.js');require('node:assert/strict').equal(typeof c.inspect,'function');console.log('Initial classifier stub is loadable.');"],
  red: ['--test', path.join(__dirname, 'initial-red.test.cjs')],
  iac: ['-e', "console.log('IaC N/A: bounded local read-only classifier; no infrastructure, cloud, identity, deployment, packages, storage creation or spend. C015 test setup is unnecessary.');"],
  pins: [path.join(__dirname, 'capture-pins.cjs')],
  tools: [path.join(__dirname, 'capture-tools.cjs')],
  focused: ['--test', '--test-concurrency=1', ...['initial-red', 'classifier', 'input', 'session', 'source', 'surface', 'authority', 'transport'].map((name) => path.join(__dirname, `${name}.test.cjs`))],
  syntax: [path.join(__dirname, 'syntax.cjs')],
  browser: [path.join(__dirname, 'browser.cjs')],
  integrity: ['--test', path.join(__dirname, 'integrity.test.cjs')],
  verify: [path.join(__dirname, 'verify.cjs')]
};
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 3 ||
    !Object.hasOwn(targets, stage)) throw new Error('Exact capture guard and one closed stage required.');
const directory = path.join(root, 'evidence', 'raw', `${stage}-${randomUUID()}`);
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, targets[stage], {
  cwd: repository, env: { ...process.env }, encoding: null, timeout: 240000,
  maxBuffer: 16 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.mkdirSync(directory, { recursive: false });
for (const [name, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(directory, `${name}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const summary = {
  schema: 'C035-raw-execution/1', cardId: 'C035', workerId: 'worker-C035', stage,
  startedAtUtc, completedAtUtc: new Date().toISOString(), runtime: process.version,
  command: [process.execPath, ...targets[stage]], exitCode: run.status, signal: run.signal,
  error: run.error?.message || null, stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
  rawBytesPreserved: true, exactCapture: 'CAPTURE_BROWSER_EVIDENCE=1',
  classifierSourceSha256: hash(fs.readFileSync(path.join(root, 'classifier.js'))),
  importedSourceAndDependencyWrites: 0, ownedCaptureArtifactsAppended: true, extraKanoCredits: 0
};
fs.writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
if (run.status !== 0) { process.stdout.write(stdout); process.stderr.write(stderr); }
console.log(JSON.stringify({ stage, exitCode: run.status, rawDirectory: path.relative(repository, directory),
  actualTapTotals: stdout.toString('utf8').split(/\r?\n/).filter((line) => /^# (tests|suites|pass|fail|cancelled|skipped|todo) /.test(line)) }));
process.exitCode = run.status === 0 ? 0 : 1;
