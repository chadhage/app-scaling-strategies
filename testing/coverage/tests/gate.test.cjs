'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('../errors.cjs');
const { USAGE, parseArgs, displayPath, mapPool, runGate, main } = require('../gate.cjs');
const { repository, fixtureRoot, makeScratch, dispose, writeTree, fakeRunner, tapSummary, lcovRecord } = require('./support.cjs');

const poisoned = { ...process.env, NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: path.join(repository, 'nowhere'), Temp: 'unchanged' };
const relative = (file) => path.relative(repository, file).replace(/\\/g, '/');

function dependencies(run, scratch, extra = {}) {
  return { cwd: repository, env: poisoned, repoRoot: repository, fsApi: fs, run, nodeExecutable: 'node-fake', nodeVersion: 'v22.0.0', defaultScratch: scratch, ...extra };
}
const options = (root, extra = {}) => ({ ...parseArgs(['--root', root]), ...extra });
const passing = ({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) });

test('parseArgs returns the documented defaults for a bare --root', () => {
  assert.deepEqual(parseArgs(['--root', 'capability\\C031']), {
    root: 'capability\\C031', tests: [], min: 85, json: null, include: [], exclude: [], timeout: 900, jobs: 1, scratch: null, manifest: null, help: false
  });
});

test('parseArgs reads every flag, lists run until the next flag and repeated lists accumulate', () => {
  const parsed = parseArgs(['--root', 'r', '--tests', 'a.test.cjs', 'b/*.test.cjs', '--min', '70', '--json', 'out.json', '--include', 'x/**', '--exclude', 'y.cjs', 'z.cjs',
    '--timeout', '2.5', '--jobs', '3', '--scratch', 's', '--manifest', 'm.json', '--include', 'w.cjs']);
  assert.deepEqual(parsed, {
    root: 'r', tests: ['a.test.cjs', 'b/*.test.cjs'], min: 70, json: 'out.json', include: ['x/**', 'w.cjs'], exclude: ['y.cjs', 'z.cjs'],
    timeout: 2.5, jobs: 3, scratch: 's', manifest: 'm.json', help: false
  });
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--root', 'r', '--help']).help, true);
});

test('parseArgs rejects every malformed command line as a usage error', () => {
  const bad = (argv, pattern) => assert.throws(() => parseArgs(argv), (error) => error instanceof UsageError && pattern.test(error.message), argv.join(' '));
  bad([], /--root <dir> is required/);
  bad(['--tests', 'a'], /--root <dir> is required/);
  bad(['--root'], /--root needs a value/);
  bad(['--root', 'a', 'b'], /--root takes exactly one value/);
  bad(['--root', 'a', '--tests'], /--tests needs a value/);
  bad(['stray', '--root', 'a'], /Unknown argument "stray"/);
  bad(['--root', 'a', '--bogus', '1'], /Unknown argument "--bogus"/);
  for (const value of ['abc', '101', '-1', '8.5', '']) bad(['--root', 'a', '--min', value], /--min must be an integer from 0 to 100/);
  for (const value of ['0', '17', 'x']) bad(['--root', 'a', '--jobs', value], /--jobs must be an integer from 1 to 16/);
  for (const value of ['0', 'abc', '90000', 'Infinity']) bad(['--root', 'a', '--timeout', value], /--timeout must be a number of seconds/);
});

test('displayPath is repository-relative with / inside the repository and absolute elsewhere', () => {
  assert.equal(displayPath(repository, path.join(repository, 'capability', 'C031')), 'capability/C031');
  const outside = path.join(path.parse(repository).root, 'elsewhere', 'x');
  assert.equal(displayPath(repository, outside), outside.replace(/\\/g, '/'));
  assert.equal(displayPath(repository, repository), repository.replace(/\\/g, '/'));
});

test('mapPool keeps the order of the results and never exceeds the number of jobs', async () => {
  let running = 0;
  let peak = 0;
  const results = await mapPool([5, 1, 4, 2, 3], 2, async (item, index) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, item));
    running -= 1;
    return `${index}:${item}`;
  });
  assert.deepEqual(results, ['0:5', '1:1', '2:4', '3:2', '4:3']);
  assert.equal(peak, 2);
  assert.deepEqual(await mapPool([], 4, async () => 'never'), []);
});

test('a passing fixture runs one sanitized command and the report carries everything a reviewer needs', async (t) => {
  const scratch = makeScratch('gate-pass');
  t.after(() => dispose(scratch));
  const run = fakeRunner(passing);
  const outFile = path.join(scratch, 'out', 'report.json');
  const { report, exitCode } = await runGate(options(relative(fixtureRoot('pass')), { json: relative(outFile) }), dependencies(run, scratch));
  assert.equal(exitCode, 0);
  assert.equal(report.pass, true);
  assert.equal(run.calls.length, 1, 'one command per production file');
  const call = run.calls[0].options;
  assert.equal(call.command, 'node-fake');
  assert.equal(call.cwd, repository);
  assert.equal(call.timeoutMs, 900000);
  assert.equal('NODE_TEST_CONTEXT' in call.env, false, 'L-0002');
  assert.equal(Object.hasOwn(call.env, 'NODE_V8_COVERAGE') && call.env.NODE_V8_COVERAGE === undefined, true, 'an own undefined value keeps the caller coverage directory out of the child (F1)');
  assert.equal(path.dirname(call.env.TEMP), path.dirname(call.env.TMP));
  assert.equal(call.env.TEMP.startsWith(scratch), true, 'Node coverage temp files stay inside the gate scratch');
  assert.equal(call.env.TEMP, call.env.TMPDIR);
  assert.equal(poisoned.Temp, 'unchanged');
  assert.equal(report.root, 'testing/coverage/fixtures/pass');
  assert.equal(report.node, 'v22.0.0');
  assert.deepEqual(report.tests, ['testing/coverage/fixtures/pass/tests/lib.test.cjs']);
  assert.deepEqual(report.files.map((entry) => [entry.file, entry.lines, entry.ok]), [['lib.cjs', 100, true]]);
  assert.match(report.files[0].command, /^node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=testing\/coverage\/fixtures\/pass\/lib\.cjs /);
  assert.deepEqual(JSON.parse(fs.readFileSync(outFile, 'utf8')), report, '--json writes the same document');
  assert.deepEqual(fs.readdirSync(scratch).filter((name) => name.startsWith('u009-')), [], 'the per-run scratch directory is removed');
});

test('each way a run can go wrong fails the file with a named reason', async (t) => {
  const scratch = makeScratch('gate-fail');
  t.after(() => dispose(scratch));
  const scenarios = {
    unloaded: [() => ({ run: { stdout: tapSummary() }, lcov: 'TN:\n' }), /not loaded by any test/, false],
    below: [({ include }) => ({ run: { status: 1, stdout: tapSummary() }, lcov: lcovRecord(include, { lines: [45, 53] }) }), /lines 84\.9057% \(45 of 53\) is below 85/, true],
    failing: [({ include }) => ({ run: { status: 1, stdout: `not ok 1 - boom\n${tapSummary({ tests: 2, pass: 1, fail: 1 })}` }, lcov: lcovRecord(include) }), /1 test\(s\) failed/, true],
    timeout: [() => ({ run: { status: null, timedOut: true } }), /timed out after 900 s/, false],
    noSummary: [() => ({ run: { stdout: '', stderr: 'Warning: node:test run() is being called recursively\n' } }), /no test summary in the output/, false],
    zeroTests: [() => ({ run: { stdout: tapSummary({ tests: 0, pass: 0 }) }, lcov: 'TN:\n' }), /no tests found: Node ran 0 tests/, false],
    noLcov: [() => ({ run: { stdout: tapSummary() } }), /the lcov report is unusable: no lcov file was written/, false],
    corruptLcov: [({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include).replace('LF:10\n', '') }), /the lcov report is unusable: lcov record .* missing or inconsistent lines totals/, false],
    tableDisagrees: [({ include }) => ({
      run: { stdout: `${tapSummary()}# lib.cjs | 50.00 | 100.00 | 100.00 | 1\n` }, lcov: lcovRecord(include)
    }), /lcov and the table Node printed disagree/, true]
  };
  for (const [name, [answer, reason, loaded]] of Object.entries(scenarios)) {
    const { report, exitCode } = await runGate(options(relative(fixtureRoot('pass'))), dependencies(fakeRunner(answer), scratch));
    assert.equal(exitCode, 1, name);
    assert.equal(report.pass, false, name);
    assert.equal(report.files[0].ok, false, name);
    assert.match(report.files[0].reason, reason, name);
    assert.equal(report.files[0].loaded, loaded, name);
  }
});

test('a missing test file or no tests at all fails every enumerated file without starting a run', async (t) => {
  const scratch = makeScratch('gate-unrun');
  t.after(() => dispose(scratch));
  const missing = fakeRunner(passing);
  const first = await runGate(options(relative(fixtureRoot('unloaded')), { tests: ['testing/coverage/fixtures/unloaded/tests/ghost.test.cjs'] }), dependencies(missing, scratch));
  assert.equal(missing.calls.length, 0);
  assert.equal(first.exitCode, 1);
  assert.deepEqual(first.report.files.map((entry) => [entry.file, entry.ok, entry.loaded]), [['idle.cjs', false, false], ['used.cjs', false, false]]);
  for (const entry of first.report.files) assert.match(entry.reason, /test file not found: testing\/coverage\/fixtures\/unloaded\/tests\/ghost\.test\.cjs/);
  assert.deepEqual(first.report.tests, []);
  const none = fakeRunner(passing);
  const second = await runGate(options(relative(fixtureRoot('notests'))), dependencies(none, scratch));
  assert.equal(none.calls.length, 0);
  assert.match(second.report.files[0].reason, /no tests found: the root holds no non-browser \*\.test\.cjs file/);
});

test('an unclassified candidate fails the gate even when every measured file passes, and a manifest entry classifies it', async (t) => {
  const scratch = makeScratch('gate-unclassified');
  t.after(() => dispose(scratch));
  const unclassified = await runGate(options(relative(fixtureRoot('unclassified'))), dependencies(fakeRunner(passing), scratch));
  assert.equal(unclassified.report.files.every((entry) => entry.ok), true);
  assert.deepEqual(unclassified.report.unclassified.map((entry) => entry.file), ['verify.cjs']);
  assert.equal(unclassified.report.pass, false);
  assert.equal(unclassified.exitCode, 1);
  const manifested = await runGate(options(relative(fixtureRoot('manifested'))), dependencies(fakeRunner(passing), scratch));
  assert.equal(manifested.report.pass, true);
  assert.deepEqual(manifested.report.excluded.map((entry) => [entry.file, entry.by]), [['tests/lib.test.cjs', 'rule'], ['verify.cjs', 'manifest']]);
  const filtered = await runGate(options(relative(fixtureRoot('unclassified')), { exclude: ['verify.cjs'] }), dependencies(fakeRunner(passing), scratch));
  assert.equal(filtered.report.pass, true);
  assert.deepEqual(filtered.report.filters, { include: [], exclude: ['verify.cjs'] });
});

test('a root with nothing to measure is not a pass', async (t) => {
  const scratch = makeScratch('gate-empty');
  t.after(() => dispose(scratch));
  const root = writeTree(path.join(scratch, 'root'), { 'tests/a.test.cjs': '', 'README.md': '' });
  const run = fakeRunner(passing);
  const { report, exitCode } = await runGate(options(relative(root)), dependencies(run, scratch));
  assert.equal(run.calls.length, 0);
  assert.deepEqual([report.pass, exitCode, report.files], [false, 1, []]);
  assert.match(report.errors[0], /nothing was measured/);
});

test('a file name that Node would read as a glob fails that file with the rename hint instead of being measured wrongly', async (t) => {
  const scratch = makeScratch('gate-glob');
  t.after(() => dispose(scratch));
  const root = writeTree(path.join(scratch, 'root'), { 'odd(1).cjs': '', 'ok.cjs': '', 'tests/a.test.cjs': '' });
  const run = fakeRunner(passing);
  const { report } = await runGate(options(relative(root)), dependencies(run, scratch));
  assert.equal(run.calls.length, 1, 'only the safely named file is run');
  const odd = report.files.find((entry) => entry.file === 'odd(1).cjs');
  assert.equal(odd.ok, false);
  assert.match(odd.reason, /cannot be measured: rename the file/);
  assert.equal(report.files.find((entry) => entry.file === 'ok.cjs').ok, true);
});

test('with --jobs the per-file runs overlap, report progress and keep the enumeration order', async (t) => {
  const scratch = makeScratch('gate-jobs');
  t.after(() => dispose(scratch));
  let running = 0;
  let peak = 0;
  const progress = [];
  const run = fakeRunner(async ({ include }) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 50));
    running -= 1;
    return { run: { stdout: tapSummary() }, lcov: lcovRecord(include) };
  });
  const { report } = await runGate(options(relative(fixtureRoot('unloaded')), { jobs: 2 }), dependencies(run, scratch, { progress: (text) => progress.push(text) }));
  assert.equal(peak, 2);
  assert.deepEqual(report.files.map((entry) => entry.file), ['idle.cjs', 'used.cjs']);
  assert.deepEqual(progress, ['measuring idle.cjs (1 of 2)', 'measuring used.cjs (2 of 2)']);
});

test('--manifest classifies a namespace that cannot take a manifest file, and a missing manifest file is a usage error', async (t) => {
  const scratch = makeScratch('gate-manifest');
  t.after(() => dispose(scratch));
  const external = relative(path.join(fixtureRoot('manifested'), 'coverage.manifest.json'));
  const { report } = await runGate(options(relative(fixtureRoot('unclassified')), { manifest: external }), dependencies(fakeRunner(passing), scratch));
  assert.deepEqual(report.unclassified, []);
  assert.deepEqual(report.excluded.map((entry) => [entry.file, entry.by]), [['tests/lib.test.cjs', 'rule'], ['verify.cjs', 'manifest']]);
  assert.equal(report.pass, true);
  const missing = options(relative(fixtureRoot('unclassified')), { manifest: relative(path.join(scratch, 'nowhere.json')) });
  await assert.rejects(runGate(missing, dependencies(fakeRunner(passing), scratch)), (error) => error instanceof UsageError && /--manifest file not found/.test(error.message));
});

test('a root that is not a directory is a usage error', async (t) => {
  const scratch = makeScratch('gate-root');
  t.after(() => dispose(scratch));
  const run = fakeRunner(passing);
  await assert.rejects(runGate(options('testing/coverage/fixtures/nowhere'), dependencies(run, scratch)), (error) => error instanceof UsageError && /--root is not a directory/.test(error.message));
  await assert.rejects(runGate(options('testing/coverage/gate.cjs'), dependencies(run, scratch)), (error) => error instanceof UsageError);
});

test('a scratch directory that cannot be removed is reported as a warning, not hidden', async (t) => {
  const scratch = makeScratch('gate-locked');
  t.after(() => dispose(scratch));
  const locked = { ...fs, rmSync: () => { throw new Error('EBUSY: resource busy'); } };
  const { report } = await runGate(options(relative(fixtureRoot('pass'))), dependencies(fakeRunner(passing), scratch, { fsApi: locked }));
  assert.equal(report.pass, true);
  assert.match(report.warnings[0], /could not remove the scratch directory .*u009-.*: EBUSY/);
});

test('--scratch names the parent of the per-run scratch directory: created when missing, used by the run, removed again when the run created it', async (t) => {
  const scratch = makeScratch('gate-parent');
  t.after(() => dispose(scratch));
  const parent = path.join(scratch, 'new', 'parent');
  const temps = [];
  const run = fakeRunner(({ include, options: runOptions }) => {
    temps.push(runOptions.env.TEMP);
    return passing({ include });
  });
  const { report } = await runGate(options(relative(fixtureRoot('pass')), { scratch: relative(parent) }), dependencies(run, path.join(scratch, 'unused')));
  assert.equal(report.pass, true);
  assert.equal(temps.length, 1);
  assert.equal(temps[0].startsWith(parent + path.sep), true, 'Node coverage temp files land below the requested scratch parent');
  assert.deepEqual(fs.existsSync(path.join(scratch, 'new')), false, 'the folders this run created for the scratch parent are removed again, deepest first');
  assert.equal(fs.existsSync(path.join(scratch, 'unused')), false, 'the default scratch is not touched when --scratch is given');
});

test('main prints the JSON document on stdout, a summary on stderr and returns the exit code', async (t) => {
  const scratch = makeScratch('gate-main');
  t.after(() => dispose(scratch));
  const out = [];
  const err = [];
  const io = (run) => ({ ...dependencies(run, scratch), stdout: (text) => out.push(text), stderr: (text) => err.push(text) });
  assert.equal(await main(['--root', relative(fixtureRoot('pass'))], io(fakeRunner(passing))), 0);
  assert.equal(JSON.parse(out.join('')).pass, true);
  assert.match(err.join(''), /measuring lib\.cjs \(1 of 1\)\n[\s\S]*RESULT: PASS/);
  out.length = 0;
  err.length = 0;
  assert.equal(await main(['--root', relative(fixtureRoot('pass'))], io(fakeRunner(() => ({ run: { stdout: tapSummary() }, lcov: 'TN:\n' })))), 1);
  assert.equal(JSON.parse(out.join('')).pass, false);
  assert.match(err.join(''), /RESULT: FAIL/);
  out.length = 0;
  err.length = 0;
  const custom = [];
  assert.equal(await main(['--root', relative(fixtureRoot('pass'))], { ...io(fakeRunner(passing)), progress: (text) => custom.push(text) }), 0);
  assert.deepEqual(custom, ['measuring lib.cjs (1 of 1)']);
  assert.doesNotMatch(err.join(''), /measuring/, 'a caller-supplied progress function replaces the default stderr lines');
});

test('main turns a usage error into exit code 2 with a JSON error document, and --help into exit code 0', async (t) => {
  const scratch = makeScratch('gate-usage');
  t.after(() => dispose(scratch));
  const out = [];
  const err = [];
  const io = { ...dependencies(fakeRunner(passing), scratch), stdout: (text) => out.push(text), stderr: (text) => err.push(text) };
  assert.equal(await main(['--min', '85'], io), 2);
  assert.deepEqual(JSON.parse(out.join('')), { schema: 'U009-coverage-gate/1', pass: false, error: { code: 'USAGE', type: 'usage', message: '--root <dir> is required.' } });
  assert.match(err.join(''), /--root <dir> is required\.[\s\S]*Usage: node testing\\coverage\\gate\.cjs/);
  out.length = 0;
  assert.equal(await main(['--help'], io), 0);
  assert.equal(out.join(''), `${USAGE}\n`);
  out.length = 0;
  assert.equal(await main(['--root', 'testing/coverage/fixtures/nowhere'], io), 2);
  assert.equal(JSON.parse(out.join('')).error.code, 'USAGE');
});

test('an unexpected error is a typed internal failure with exit 1: never a usage error and never a rejection', async (t) => {
  const scratch = makeScratch('gate-crash');
  t.after(() => dispose(scratch));
  const out = [];
  const err = [];
  const broken = { ...fs, statSync: () => { throw new Error('disk exploded'); } };
  const io = { ...dependencies(fakeRunner(passing), scratch, { fsApi: broken }), stdout: (text) => out.push(text), stderr: (text) => err.push(text) };
  assert.equal(await main(['--root', relative(fixtureRoot('pass'))], io), 1);
  const report = JSON.parse(out.join(''));
  assert.deepEqual([report.schema, report.pass, report.error.type, report.error.code], ['U009-coverage-gate/1', false, 'internal', 'INTERNAL']);
  assert.match(report.error.message, /disk exploded/);
  assert.match(err.join(''), /internal error: Error: disk exploded/);
});
