'use strict';

// N3 and N4 of the second independent review of U009 (the first review's F3 and F5 were not finished):
// N3 a previous pass:true report survived --json=<path> (the equals spelling), --help next to --json and a read-only target;
// N4 the started marker could be replaced by a hard link during the run, and the final write then followed the link into another file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMA } = require('../evaluate.cjs');
const { parseArgs, runGate, main } = require('../gate.cjs');
const output = require('../output.cjs');
const { repository, fixtureRoot, makeScratch, dispose, fakeRunner, tapSummary, lcovRecord } = require('./support.cjs');
const { runGateCli, readJson, relativeToRepository } = require('./clisupport.cjs');

const relative = (file) => path.relative(repository, file).replace(/\\/g, '/');
const passing = ({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) });
const dependencies = (run, scratch, extra = {}) => ({ cwd: repository, env: {}, repoRoot: repository, fsApi: fs, run, nodeExecutable: 'node-fake', nodeVersion: 'v22.0.0', defaultScratch: scratch, ...extra });
const options = (root, extra = {}) => ({ ...parseArgs(['--root', root]), ...extra });
const stale = (file) => fs.writeFileSync(file, JSON.stringify({ schema: SCHEMA, pass: true, fullBar: true, stale: true }));
const listing = (directory) => fs.readdirSync(directory).sort();

test('N3: every spelling of --json is found, also when the rest of the command line is wrong', () => {
  assert.deepEqual(output.scanJsonTargets(['--json=a.json']), ['a.json']);
  assert.deepEqual(output.scanJsonTargets(['--root', 'r', '--json=C:\\x y\\a.json', '--min', 'x']), ['C:\\x y\\a.json']);
  assert.deepEqual(output.scanJsonTargets(['--json', 'a.json', '--json=b.json', '--json=a.json']), ['a.json', 'b.json']);
  assert.deepEqual(output.scanJsonTargets(['--json=--odd.json']), ['--odd.json'], 'only the equals spelling can name a file that starts with two dashes');
  assert.deepEqual(output.scanJsonTargets(['--json=', '--json', '', '--jsonx=a.json', '--JSON=b.json', 'x--json=c.json']), []);
});

test('N3: a run that did not measure anything says so in a report with the schema and pass:false', () => {
  const report = output.notRunReport('why not');
  assert.deepEqual(Object.keys(report), ['schema', 'pass', 'status', 'message']);
  assert.deepEqual([report.schema, report.pass, report.status, report.message], [SCHEMA, false, 'not-run', 'why not']);
});

test.describe('N3 through the real CLI: a previous pass:true is never left at a --json path that was named', () => {
  const state = { scratch: null, runs: {}, files: {} };
  test.before(async () => {
    state.scratch = makeScratch('n3');
    const root = relativeToRepository(fixtureRoot('pass'));
    const file = (name) => path.join(state.scratch, `${name}.json`);
    for (const name of ['equals', 'help', 'readonly', 'mixed']) stale(file(name));
    fs.chmodSync(file('readonly'), 0o444);
    const [equals, help, readonly, mixed] = await Promise.all([
      runGateCli(['--root', root, `--json=${file('equals')}`], { timeout: 300000 }),
      runGateCli(['--help', '--json', file('help')], { timeout: 300000 }),
      runGateCli(['--root', root, '--min', '101', '--json', file('readonly')], { timeout: 300000 }),
      runGateCli(['--root', root, `--json=${file('mixed')}`, '--json', file('mixed-2')], { timeout: 300000 })
    ]);
    state.runs = { equals, help, readonly, mixed };
    state.files = Object.fromEntries(['equals', 'help', 'readonly', 'mixed'].map((name) => [name, readJson(file(name))]));
  });
  test.after(() => {
    if (state.scratch) dispose(state.scratch);
  });

  test('the equals spelling is still a usage error (exit 2) and its path holds a typed failure, not the old pass', () => {
    assert.equal(state.runs.equals.status, 2, state.runs.equals.stderr);
    assert.equal(state.files.equals.pass, false, 'a stale pass:true survived --json=<path>');
    assert.equal(state.files.equals.error.code, 'USAGE');
    assert.match(state.files.equals.error.message, /Unknown argument "--json=/);
  });

  test('--help next to --json still prints the usage and exits 0, and the path holds a not-run report', () => {
    assert.equal(state.runs.help.status, 0, state.runs.help.stderr);
    assert.match(state.runs.help.stdout, /^Usage: node testing/);
    assert.equal(state.files.help.pass, false, 'a stale pass:true survived --help');
    assert.deepEqual([state.files.help.schema, state.files.help.status], [SCHEMA, 'not-run']);
  });

  test('a read-only previous report is replaced by the failure report (the usage error stays exit 2)', () => {
    assert.equal(state.runs.readonly.status, 2, state.runs.readonly.stderr);
    assert.equal(state.files.readonly.pass, false, 'a stale pass:true survived in a read-only file');
    assert.equal(state.files.readonly.error.code, 'USAGE');
  });

  test('both spellings in one command line are covered', () => {
    assert.equal(state.runs.mixed.status, 2);
    assert.equal(state.files.mixed.pass, false);
    assert.equal(readJson(path.join(state.scratch, 'mixed-2.json')).pass, false, 'a path that did not exist before gets the failure report');
  });
});

test('N3: main writes the not-run report for --help at the named path and refuses a path that is not a report', async (t) => {
  const base = makeScratch('n3-help');
  t.after(() => dispose(base));
  const previous = path.join(base, 'previous.json');
  const foreign = path.join(base, 'foreign.txt');
  stale(previous);
  fs.writeFileSync(foreign, 'precious\n');
  const out = [];
  const io = { ...dependencies(fakeRunner(passing), base), stdout: (text) => out.push(text), stderr: () => {} };
  assert.equal(await main(['--help', '--json', previous], io), 0);
  assert.match(out.join(''), /^Usage: /);
  assert.deepEqual([readJson(previous).pass, readJson(previous).status], [false, 'not-run']);
  assert.equal(await main(['--json', foreign, '--help'], io), 0);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'precious\n', 'a file that is not a gate report is never touched, not even for --help');
});

test('N4: a target with more than one hard link is refused by the rule', (t) => {
  const base = makeScratch('n4-rule');
  t.after(() => dispose(base));
  assert.throws(() => output.checkReportTarget('r.json', { fsApi: { lstatSync: () => ({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true, size: 10, nlink: 2 }) } }), /more than one hard link/);
  const precious = path.join(base, 'precious.json');
  const linked = path.join(base, 'linked.json');
  stale(precious);
  assert.doesNotThrow(() => output.checkReportTarget(precious));
  fs.linkSync(precious, linked);
  assert.throws(() => output.checkReportTarget(linked), /more than one hard link/);
  assert.throws(() => output.checkReportTarget(precious), /more than one hard link/);
});

test('N4: the writer replaces the name and never writes through a link, and it leaves no temporary file behind', (t) => {
  const base = makeScratch('n4-write');
  t.after(() => dispose(base));
  const precious = path.join(base, 'precious.txt');
  const target = path.join(base, 'report.json');
  fs.writeFileSync(precious, 'precious\n');
  fs.linkSync(precious, target);
  const identity = output.writeReportFile(target, { schema: SCHEMA, pass: false });
  assert.equal(fs.readFileSync(precious, 'utf8'), 'precious\n', 'the other name of the file keeps its bytes');
  assert.deepEqual(readJson(target), { schema: SCHEMA, pass: false });
  assert.equal(fs.lstatSync(target).nlink, 1);
  assert.deepEqual(listing(base), ['precious.txt', 'report.json']);
  assert.equal(typeof identity, 'string');
  const again = output.writeReportFile(target, { schema: SCHEMA, pass: true }, { expected: identity });
  assert.notEqual(again, identity, 'every write is a new file: the identity changes');
  assert.equal(readJson(target).pass, true);
});

test('N4: the final write is refused when the file at the path is no longer the one the gate wrote', (t) => {
  const base = makeScratch('n4-identity');
  t.after(() => dispose(base));
  const target = path.join(base, 'report.json');
  const identity = output.writeReportFile(target, output.startedReport());
  const other = path.join(base, 'other.json');
  fs.writeFileSync(other, JSON.stringify({ schema: SCHEMA, pass: true, other: true }));
  fs.rmSync(target);
  fs.renameSync(other, target);
  assert.throws(() => output.writeReportFile(target, { schema: SCHEMA, pass: true }, { expected: identity }), (error) => error.code === 'REPORT_CHANGED' && /changed while the gate ran/.test(error.message));
  assert.equal(readJson(target).other, true, 'the foreign file is untouched');
  const unreadable = { ...fs, lstatSync: (file, lstatOptions) => (lstatOptions && lstatOptions.bigint ? (() => { throw Object.assign(new Error('io error'), { code: 'EIO' }); })() : fs.lstatSync(file, lstatOptions)) };
  assert.throws(() => output.writeReportFile(target, { schema: SCHEMA, pass: true }, { fsApi: unreadable, expected: identity }), (error) => error.code === 'EIO', 'an error other than a missing file is not swallowed');
  fs.rmSync(target);
  assert.doesNotThrow(() => output.writeReportFile(target, { schema: SCHEMA, pass: true }, { expected: identity }), 'a report that was removed during the run is simply written again');
  assert.equal(readJson(target).pass, true);
  assert.deepEqual(listing(base), ['report.json']);
});

test('N4: a read-only previous report is replaced, and a failure of the replacement keeps the old file and removes the temporary file', (t) => {
  const base = makeScratch('n4-readonly');
  t.after(() => dispose(base));
  const target = path.join(base, 'report.json');
  stale(target);
  fs.chmodSync(target, 0o444);
  output.writeReportFile(target, { schema: SCHEMA, pass: false, status: 'started' });
  assert.equal(readJson(target).status, 'started');
  const failing = (code, unlinkFails) => ({
    ...fs,
    renameSync: () => { throw Object.assign(new Error('rename refused'), { code }); },
    unlinkSync: (file) => (unlinkFails && !file.endsWith('.tmp') ? (() => { throw Object.assign(new Error('unlink refused'), { code: 'EPERM' }); })() : fs.unlinkSync(file))
  });
  for (const [code, unlinkFails] of [['EXDEV', false], ['EPERM', true]]) {
    assert.throws(() => output.writeReportFile(target, { schema: SCHEMA, pass: true }, { fsApi: failing(code, unlinkFails) }), (error) => /refused/.test(error.message), `${code} ${unlinkFails}`);
    assert.deepEqual(listing(base), ['report.json'], `no temporary file is left after ${code} ${unlinkFails}`);
    assert.equal(readJson(target).status, 'started', `the old file is untouched after ${code} ${unlinkFails}`);
  }
  assert.throws(() => output.writeReportFile(target, { schema: SCHEMA, pass: true }, { fsApi: failing('EPERM', false) }), /rename refused/);
  assert.deepEqual(listing(base), [], 'the old report was removed first and the temporary file is gone: nothing stale is left');
  const stuck = { ...fs, renameSync: failing('EXDEV', false).renameSync, unlinkSync: () => { throw new Error('unlink refused'); } };
  assert.throws(() => output.writeReportFile(target, { schema: SCHEMA, pass: true }, { fsApi: stuck }), /rename refused/, 'the error of the replacement is reported, not the one of the cleanup');
  for (const name of listing(base)) fs.rmSync(path.join(base, name));
});

test('N4: the started marker replaced by a hard link during the run never lets the final write reach the other file', async (t) => {
  const base = makeScratch('n4-toctou');
  t.after(() => dispose(base));
  const precious = path.join(base, 'precious.json');
  const target = path.join(base, 'report.json');
  const preciousText = JSON.stringify({ schema: SCHEMA, pass: true, precious: true });
  fs.writeFileSync(precious, preciousText);
  const run = fakeRunner((call) => {
    fs.rmSync(target);
    fs.linkSync(precious, target);
    return passing(call);
  });
  await assert.rejects(runGate(options(relative(fixtureRoot('pass')), { json: target }), dependencies(run, base)), (error) => error.code === 'REPORT_CHANGED' && /changed while the gate ran: .*more than one hard link/.test(error.message));
  assert.equal(fs.readFileSync(precious, 'utf8'), preciousText, 'the file behind the link keeps its bytes');
  assert.equal(run.calls.length, 1);
});

test('N4: the same swap through main ends with a typed failure on stdout, exit 1 and the other file untouched', async (t) => {
  const base = makeScratch('n4-main');
  t.after(() => dispose(base));
  const precious = path.join(base, 'precious.json');
  const target = path.join(base, 'report.json');
  fs.writeFileSync(precious, JSON.stringify({ schema: SCHEMA, pass: true, precious: true }));
  const out = [];
  const run = fakeRunner((call) => {
    fs.rmSync(target);
    fs.linkSync(precious, target);
    return passing(call);
  });
  const io = { ...dependencies(run, base), stdout: (text) => out.push(text), stderr: () => {} };
  assert.equal(await main(['--root', relative(fixtureRoot('pass')), '--json', target], io), 1);
  assert.deepEqual([JSON.parse(out[out.length - 1]).error.code, JSON.parse(out[out.length - 1]).error.type], ['REPORT_CHANGED', 'internal']);
  assert.equal(readJson(precious).precious, true);
  assert.equal(readJson(precious).pass, true, 'no failure report was written through the link');
});

test('N4: a foreign regular report put at the path during the run is refused at the final write and then replaced by the failure report, as the rule says', async (t) => {
  const base = makeScratch('n4-foreign');
  t.after(() => dispose(base));
  const target = path.join(base, 'report.json');
  const run = fakeRunner((call) => {
    fs.rmSync(target);
    fs.writeFileSync(target, JSON.stringify({ schema: SCHEMA, pass: true, foreign: true }));
    return passing(call);
  });
  await assert.rejects(runGate(options(relative(fixtureRoot('pass')), { json: target }), dependencies(run, base)), (error) => error.code === 'REPORT_CHANGED');
  assert.equal(readJson(target).foreign, true, 'runGate itself never replaces a file it did not write');
  const out = [];
  const io = { ...dependencies(run, base), stdout: (text) => out.push(text), stderr: () => {} };
  assert.equal(await main(['--root', relative(fixtureRoot('pass')), '--json', target], io), 1);
  assert.equal(JSON.parse(out[out.length - 1]).error.code, 'REPORT_CHANGED');
  assert.deepEqual([readJson(target).pass, readJson(target).error.code], [false, 'REPORT_CHANGED'], 'the gate report that sits there carries the failure of this run, never a pass');
});
