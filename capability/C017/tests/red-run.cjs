'use strict';

// Test tooling, not production code. `archive <dir>` records a NEW retained RED run; `replay <dir>` re-runs the archived
// snapshots against the archived naive engine in a scratch workspace and checks that the same tests fail the same way.
//   node capability\C017\tests\red-run.cjs archive red-01-naive-cancel-always-succeeds
//   node capability\C017\tests\red-run.cjs replay  red-01-naive-cancel-always-succeeds
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const liveTests = ['outcomes.test.cjs', 'races.test.cjs', 'interrupted.test.cjs', 'support.cjs'];
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const snapshotName = (name) => name.replace(/\.cjs$/, '.snapshot.cjs');

function childEnvironment(extra) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return env;
}

function runInScratch(redDir, subject = path.join(redDir, 'naive-engine.snapshot.cjs')) {
  const work = path.join(root, 'test-scratch', `red-${randomUUID().slice(0, 8)}`);
  fs.mkdirSync(path.join(work, 'tests'), { recursive: true });
  try {
    for (const name of liveTests) fs.copyFileSync(path.join(redDir, snapshotName(name)), path.join(work, 'tests', name));
    const files = liveTests.filter((name) => name.endsWith('.test.cjs')).map((name) => path.relative(repo, path.join(work, 'tests', name)));
    const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=30000', ...files];
    const started = new Date().toISOString();
    const run = spawnSync(process.execPath, args, { cwd: repo, env: childEnvironment({ C017_TEST_ENGINE: subject }), encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
    return { run, args, started, finished: new Date().toISOString(), subject };
  } finally {
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function summarize(stdout) {
  const failing = [...stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]).sort();
  const count = (label) => Number((new RegExp(`^# ${label} (\\d+)`, 'm').exec(stdout) || [0, 0])[1]);
  const classes = {};
  for (const m of stdout.matchAll(/^\s+code: '([A-Z_]+)'$/gm)) classes[m[1]] = (classes[m[1]] || 0) + 1;
  return { tests: count('tests'), pass: count('pass'), fail: count('fail'), failingTests: failing, failureCodes: classes };
}

function archive(name) {
  const redDir = path.join(root, 'evidence', 'red', name);
  if (!fs.existsSync(path.join(redDir, 'naive-engine.snapshot.cjs'))) throw new Error('the archive directory must contain naive-engine.snapshot.cjs');
  if (fs.existsSync(path.join(redDir, 'manifest.json'))) throw new Error('retained RED evidence is immutable; use a NEW directory');
  for (const live of liveTests) fs.copyFileSync(path.join(root, 'tests', live), path.join(redDir, snapshotName(live)), fs.constants.COPYFILE_EXCL);
  const { run, args, started, finished, subject } = runInScratch(redDir);
  fs.writeFileSync(path.join(redDir, 'stdout.txt'), run.stdout, { flag: 'wx' });
  fs.writeFileSync(path.join(redDir, 'stderr.txt'), run.stderr, { flag: 'wx' });
  fs.writeFileSync(path.join(redDir, 'exit-code.txt'), `${run.status}\n`, { flag: 'wx' });
  const files = (list) => list.map((file) => ({ path: path.relative(root, path.join(redDir, file)).replaceAll('\\', '/'), sha256: sha(path.join(redDir, file)), bytes: fs.statSync(path.join(redDir, file)).size }));
  const manifest = {
    schema: 'C017-red-run/1', id: name, node: process.version, command: `node ${args.join(' ')}`, cwd: 'repository root',
    environment: { C017_TEST_ENGINE: path.relative(repo, subject).replaceAll('\\', '/') }, startedAtUtc: started, finishedAtUtc: finished,
    exitCode: run.status, signal: run.signal, summary: summarize(run.stdout),
    inputs: files([...liveTests.map(snapshotName), 'naive-engine.snapshot.cjs']), outputs: files(['stdout.txt', 'stderr.txt', 'exit-code.txt']),
    note: 'The snapshots are byte copies of tests/*.cjs at RED time and were run from a scratch workspace with their original names.',
  };
  fs.writeFileSync(path.join(redDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

function replay(name) {
  const redDir = path.join(root, 'evidence', 'red', name);
  const manifest = JSON.parse(fs.readFileSync(path.join(redDir, 'manifest.json'), 'utf8'));
  const drift = manifest.inputs.filter((input) => sha(path.join(root, input.path)) !== input.sha256).map((input) => input.path);
  const { run } = runInScratch(redDir);
  const now = summarize(run.stdout);
  const same = JSON.stringify(now.failingTests) === JSON.stringify(manifest.summary.failingTests) && now.fail === manifest.summary.fail
    && JSON.stringify(now.failureCodes) === JSON.stringify(manifest.summary.failureCodes);
  return { reproduced: same && run.status === manifest.exitCode && drift.length === 0, exitCode: run.status, archivedExitCode: manifest.exitCode, summary: now, inputDrift: drift };
}

// A RED for a defect found after the first GREEN: a legitimate cancel with a new key in the crash window between the last effect
// and the decision made the engine journal an inconsistent second request and mark itself unreadable. The pre-fix engine is retained.
function fixRun(snapshot) {
  const args = ['--require', path.join(__dirname, 'fixtures', 'prefix-engine-preload.cjs'), '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=40000',
    '--test-name-pattern=a crash between the last effect', path.relative(repo, path.join(__dirname, 'engine.test.cjs'))];
  const run = spawnSync(process.execPath, args, { cwd: repo, env: childEnvironment({ C017_ENGINE_SNAPSHOT: snapshot }), encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  return { run, args };
}

const fixInputs = ['engine.test.cjs', 'support.cjs', 'scenarios.cjs', 'fixtures/prefix-engine-preload.cjs'];
const productionInputs = ['reconcile.cjs', 'contract.js', 'journal.cjs'];

function archiveFix(name) {
  const redDir = path.join(root, 'evidence', 'red', name);
  fs.mkdirSync(redDir);
  const snapshot = path.join(redDir, 'engine.prefix.snapshot.cjs');
  fs.copyFileSync(path.join(root, 'engine.cjs'), snapshot, fs.constants.COPYFILE_EXCL);
  const started = new Date().toISOString();
  const { run, args } = fixRun(snapshot);
  fs.writeFileSync(path.join(redDir, 'stdout.txt'), run.stdout, { flag: 'wx' });
  fs.writeFileSync(path.join(redDir, 'stderr.txt'), run.stderr, { flag: 'wx' });
  fs.writeFileSync(path.join(redDir, 'exit-code.txt'), `${run.status}\n`, { flag: 'wx' });
  const item = (file, base) => ({ path: path.relative(root, path.join(base, file)).replaceAll('\\', '/'), sha256: sha(path.join(base, file)), bytes: fs.statSync(path.join(base, file)).size });
  const manifest = {
    schema: 'C017-red-run/1', id: name, kind: 'defect-found-after-first-green', node: process.version, command: `node ${args.join(' ')}`, cwd: 'repository root',
    environment: { C017_ENGINE_SNAPSHOT: path.relative(repo, snapshot).replaceAll('\\', '/') }, startedAtUtc: started, finishedAtUtc: new Date().toISOString(), exitCode: run.status, summary: summarize(run.stdout),
    inputs: [item('engine.prefix.snapshot.cjs', redDir), ...fixInputs.map((file) => item(file, __dirname)), ...productionInputs.map((file) => item(file, root))],
    outputs: ['stdout.txt', 'stderr.txt', 'exit-code.txt'].map((file) => item(file, redDir)),
    note: 'The retained pre-fix engine is loaded in place of engine.cjs by the preload; the live test engine.test.cjs must still fail for the missing behavior.',
  };
  fs.writeFileSync(path.join(redDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

function replayFix(name) {
  const redDir = path.join(root, 'evidence', 'red', name);
  const manifest = JSON.parse(fs.readFileSync(path.join(redDir, 'manifest.json'), 'utf8'));
  const { run } = fixRun(path.join(redDir, 'engine.prefix.snapshot.cjs'));
  const now = summarize(run.stdout);
  const same = JSON.stringify(now.failingTests) === JSON.stringify(manifest.summary.failingTests) && JSON.stringify(now.failureCodes) === JSON.stringify(manifest.summary.failureCodes);
  return { reproduced: same && run.status === manifest.exitCode, exitCode: run.status, archivedExitCode: manifest.exitCode, summary: now };
}

// L-0121: the retained RED tests must pass UNCHANGED against the final production engine, proving they failed for the missing
// behavior and not for an invalid input.
function verifyGreen(name) {
  const redDir = path.join(root, 'evidence', 'red', name);
  const manifest = JSON.parse(fs.readFileSync(path.join(redDir, 'manifest.json'), 'utf8'));
  const { run } = runInScratch(redDir, path.join(root, 'engine.cjs'));
  const now = summarize(run.stdout);
  return { unchangedRedPassesAgainstFinalCode: run.status === 0 && now.fail === 0 && now.pass === manifest.summary.tests, exitCode: run.status, summary: now };
}

if (require.main === module) {
  const [mode, name] = process.argv.slice(2);
  if (!['archive', 'replay', 'verify-green', 'archive-fix', 'replay-fix'].includes(mode) || !/^red-[a-z0-9-]+$/.test(name || '')) {
    console.error('usage: red-run.cjs archive|replay|verify-green|archive-fix|replay-fix red-<name>');
    process.exit(2);
  }
  const result = { archive, replay, 'verify-green': verifyGreen, 'archive-fix': archiveFix, 'replay-fix': replayFix }[mode](name);
  console.log(JSON.stringify(['archive', 'archive-fix'].includes(mode) ? { archived: name, exitCode: result.exitCode, summary: result.summary } : result, null, 2));
  process.exit((['replay', 'replay-fix'].includes(mode) && !result.reproduced) || (mode === 'verify-green' && !result.unchangedRedPassesAgainstFinalCode) ? 1 : 0);
}

module.exports = Object.freeze({ archive, replay, verifyGreen, archiveFix, replayFix, summarize });
