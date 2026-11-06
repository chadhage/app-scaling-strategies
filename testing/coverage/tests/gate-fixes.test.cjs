'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('../errors.cjs');
const { SCHEMA } = require('../evaluate.cjs');
const { parseArgs, makeRunDirectory, missingFolders, removeCreatedFolders, isEmptyFile, runGate, main, entry } = require('../gate.cjs');
const { repository, fixtureRoot, makeScratch, dispose, writeTree, fakeRunner, tapSummary, lcovRecord } = require('./support.cjs');

const relative = (file) => path.relative(repository, file).replace(/\\/g, '/');
const passing = ({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) });
const dependencies = (run, scratch, extra = {}) => ({ cwd: repository, env: {}, repoRoot: repository, fsApi: fs, run, nodeExecutable: 'node-fake', nodeVersion: 'v22.0.0', defaultScratch: scratch, ...extra });
const options = (root, extra = {}) => ({ ...parseArgs(['--root', root]), ...extra });
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('entry passes the exit code of main on and turns a rejection into exit 1 with a message', async () => {
  const exits = [];
  const messages = [];
  await entry(['--x'], { run: async (argv) => { assert.deepEqual(argv, ['--x']); return 2; }, exit: (code) => exits.push(code), stderr: (text) => messages.push(text) });
  await entry([], { run: async () => { throw new Error('main rejected'); }, exit: (code) => exits.push(code), stderr: (text) => messages.push(text) });
  await entry([], { run: () => { throw 'a thrown string'; }, exit: (code) => exits.push(code), stderr: (text) => messages.push(text) });
  assert.deepEqual(exits, [2, 1, 1]);
  assert.match(messages[0], /^internal error: Error: main rejected/);
  assert.equal(messages[1], 'internal error: a thrown string\n');
});

test('F3: --json holds a "started" marker while the run is going and the final report afterwards', async (t) => {
  const base = makeScratch('gate-started');
  t.after(() => dispose(base));
  const target = path.join(base, 'report.json');
  fs.writeFileSync(target, JSON.stringify({ schema: SCHEMA, pass: true, stale: true }));
  const seen = [];
  const run = fakeRunner((call) => {
    seen.push(readJson(target));
    return passing(call);
  });
  const { report } = await runGate(options(relative(fixtureRoot('pass')), { json: target }), dependencies(run, base));
  assert.deepEqual([seen.length, seen[0].status, seen[0].pass, seen[0].stale], [1, 'started', false, undefined]);
  assert.deepEqual(readJson(target), report);
  assert.equal(report.pass, true);
});

test('F5: a --json path that the rule refuses stops the run before anything is written or started', async (t) => {
  const base = makeScratch('gate-refused');
  t.after(() => dispose(base));
  const notes = path.join(base, 'notes.txt');
  fs.writeFileSync(notes, 'precious\n');
  const run = fakeRunner(passing);
  await assert.rejects(runGate(options(relative(fixtureRoot('pass')), { json: notes }), dependencies(run, base)), (error) => error instanceof UsageError && /not a previous gate report/.test(error.message));
  assert.equal(run.calls.length, 0);
  assert.equal(fs.readFileSync(notes, 'utf8'), 'precious\n');
});

test('F2/F3: main puts a failure report at every --json path, for a usage error and for an internal error, and refused paths keep their bytes', async (t) => {
  const base = makeScratch('gate-failures');
  t.after(() => dispose(base));
  const previous = path.join(base, 'previous.json');
  const foreign = path.join(base, 'foreign.txt');
  const write = () => fs.writeFileSync(previous, JSON.stringify({ schema: SCHEMA, pass: true }));
  fs.writeFileSync(foreign, 'precious\n');
  const out = [];
  const io = (extra = {}) => ({ ...dependencies(fakeRunner(passing), base, extra), stdout: (text) => out.push(text), stderr: () => {} });
  write();
  assert.equal(await main(['--root', relative(fixtureRoot('pass')), '--min', '101', '--json', previous, '--json', foreign], io()), 2);
  assert.equal(readJson(previous).pass, false, 'the usage error reached the file although --min failed before --json was parsed');
  assert.equal(readJson(previous).error.code, 'USAGE');
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'precious\n', 'a path that is not a gate report is never overwritten, not even by a failure report');
  write();
  const broken = { ...fs, statSync: () => { throw new Error('disk exploded'); } };
  assert.equal(await main(['--root', relative(fixtureRoot('pass')), '--json', previous], io({ fsApi: broken })), 1);
  assert.deepEqual([readJson(previous).pass, readJson(previous).error.type], [false, 'internal']);
  assert.equal(JSON.parse(out[out.length - 1]).error.type, 'internal');
});

test('m4: a missing scratch parent is created again when another run removes it between the two calls', () => {
  const calls = [];
  const flaky = (failures, code = 'ENOENT') => {
    let left = failures;
    return {
      mkdirSync: (directory) => calls.push(['mkdir', directory]),
      mkdtempSync: (prefix) => {
        calls.push(['mkdtemp', prefix]);
        if (left > 0) {
          left -= 1;
          throw Object.assign(new Error(code), { code });
        }
        return `${prefix}abc`;
      }
    };
  };
  const parent = path.join(path.parse(process.cwd()).root, 'scratch-parent');
  let made;
  assert.doesNotThrow(() => { made = makeRunDirectory(flaky(2), parent); }, 'a parent that another run removed is created again instead of failing');
  assert.equal(made, path.join(parent, 'u009-abc'));
  assert.equal(calls.filter((call) => call[0] === 'mkdir').length, 3, 'the parent is created again after each ENOENT');
  assert.throws(() => makeRunDirectory(flaky(3), parent), /ENOENT/);
  assert.throws(() => makeRunDirectory(flaky(1, 'EACCES'), parent), /EACCES/);
});

test('m4: the folders a run created are removed deepest first and a folder that holds something stays', (t) => {
  const base = makeScratch('gate-folders');
  t.after(() => dispose(base));
  const deep = path.join(base, 'a', 'b', 'c');
  assert.deepEqual(missingFolders(deep, fs), [deep, path.join(base, 'a', 'b'), path.join(base, 'a')]);
  assert.deepEqual(missingFolders(base, fs), []);
  fs.mkdirSync(deep, { recursive: true });
  removeCreatedFolders([deep, path.join(base, 'a', 'b'), path.join(base, 'a')], fs);
  assert.equal(fs.existsSync(path.join(base, 'a')), false);
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(base, 'a', 'b', 'keep.txt'), 'x');
  removeCreatedFolders([deep, path.join(base, 'a', 'b'), path.join(base, 'a')], fs);
  assert.deepEqual(fs.readdirSync(path.join(base, 'a', 'b')), ['keep.txt'], 'removal stops at the first folder that is not empty');
  const never = { existsSync: () => false };
  assert.deepEqual(missingFolders(path.join(path.parse(process.cwd()).root, 'x'), never).length, 2, 'a root that does not exist ends the walk');
});

test('m3: a zero-byte file is told apart from a file that no test loaded', async (t) => {
  const base = makeScratch('gate-empty');
  t.after(() => dispose(base));
  const root = writeTree(path.join(base, 'ns'), { 'empty.cjs': '', 'tests/t.test.cjs': "'use strict';\nrequire('node:test')('t', () => {});\n" });
  const answer = () => ({ run: { stdout: tapSummary() }, lcov: 'TN:\n' });
  const { report } = await runGate(options(relative(root)), dependencies(fakeRunner(answer), base));
  assert.match(report.files[0].reason, /empty file \(0 bytes\)/);
  assert.equal(isEmptyFile(path.join(root, 'empty.cjs'), fs), true);
  assert.equal(isEmptyFile(path.join(root, 'tests', 't.test.cjs'), fs), false);
  assert.equal(isEmptyFile(path.join(root, 'gone.cjs'), fs), false, 'a file that cannot be inspected is not called empty');
  fs.writeFileSync(path.join(root, 'empty.cjs'), "'use strict';\n");
  const second = await runGate(options(relative(root)), dependencies(fakeRunner(answer), base));
  assert.match(second.report.files[0].reason, /not loaded by any test/);
});

test('m6: the report of a narrowed run says that it is not the full bar', async (t) => {
  const base = makeScratch('gate-fullbar');
  t.after(() => dispose(base));
  const full = await runGate(options(relative(fixtureRoot('pass'))), dependencies(fakeRunner(passing), base));
  assert.deepEqual([full.report.fullBar, full.report.fullBarReasons], [true, []]);
  const narrowed = await runGate(options(relative(fixtureRoot('pass')), { min: 50, include: ['lib.cjs'] }), dependencies(fakeRunner(passing), base));
  assert.equal(narrowed.report.pass, true);
  assert.equal(narrowed.report.fullBar, false);
  assert.equal(narrowed.report.fullBarReasons.length, 2);
});
