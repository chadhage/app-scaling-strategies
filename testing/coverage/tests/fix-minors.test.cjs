'use strict';

// The cheap minors m2, m3, m4, m6 and m8 of the independent review of U009 (R2-U009), written before the fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('../errors.cjs');
const { walkTree, enumerate } = require('../enumerate.cjs');
const { evaluateFile, buildReport } = require('../evaluate.cjs');
const { parseArgs, runGate } = require('../gate.cjs');
const { repository, fixtureRoot, makeScratch, dispose, writeTree, fakeRunner, tapSummary, lcovRecord } = require('./support.cjs');

const relative = (file) => path.relative(repository, file).replace(/\\/g, '/');

test('m2: extensions that were seen but never considered are listed, so a reviewer sees what was not looked at', () => {
  const listing = { files: ['a.cjs', 'run.vbs', 'x/y.rb', 'x/z.rb', 'page.html', 'notes.md', 'LICENSE', 'data.JSON'], links: [], skipped: [] };
  const { notConsidered } = enumerate(listing);
  assert.equal(Array.isArray(notConsidered), true, 'the enumeration must list what it did not look at');
  assert.deepEqual(notConsidered.map((entry) => [entry.extension, entry.count]), [['', 1], ['.html', 1], ['.json', 1], ['.md', 1], ['.rb', 2], ['.vbs', 1]]);
  assert.deepEqual(notConsidered.find((entry) => entry.extension === '.rb').files, ['x/y.rb', 'x/z.rb']);
  assert.equal(notConsidered.find((entry) => entry.extension === '.vbs').scriptLike, true, 'a script type the gate cannot measure is flagged');
  assert.equal(notConsidered.find((entry) => entry.extension === '.html').scriptLike, true, 'inline scripts of a page are not measured either');
  assert.equal(notConsidered.find((entry) => entry.extension === '.md').scriptLike, false);
});

test('m2: the examples of one extension are capped and the report carries the list', () => {
  const files = Array.from({ length: 9 }, (_, index) => `d/f${index}.rb`);
  const { notConsidered } = enumerate({ files, links: [], skipped: [] });
  assert.equal(Array.isArray(notConsidered), true, 'the enumeration must list what it did not look at');
  assert.deepEqual([notConsidered[0].count, notConsidered[0].files.length], [9, 5]);
  const report = buildReport({
    root: 'r', node: 'v', min: 85, files: [], unclassified: [], excluded: [], skippedDirectories: [], warnings: [], tests: [], filters: { include: [], exclude: [] },
    timeoutMs: 1, notConsidered
  });
  assert.deepEqual(report.notConsidered, notConsidered);
});

test('m3: an empty file is reported as empty, not as "not loaded by any test"', () => {
  const run = { status: 0, signal: null, spawnError: null, timedOut: false, stdout: '', stderr: '' };
  const entry = evaluateFile({
    file: 'empty.cjs', min: 85, command: 'c', timeoutMs: 1000, run, summary: { tests: 1, pass: 1, fail: 0, cancelled: 0 }, record: undefined, empty: true
  });
  assert.deepEqual([entry.ok, entry.loaded, entry.lines], [false, false, 0], 'it still fails: nothing was measured');
  assert.match(entry.reason, /empty file \(0 bytes\)/);
  assert.doesNotMatch(entry.reason, /not loaded by any test/);
});

test('m4: the gate removes the default scratch folder when it created it and leaves one that holds anything else', async (t) => {
  const base = makeScratch('m4');
  t.after(() => dispose(base));
  const defaultScratch = path.join(base, '.scratch');
  const dependencies = () => ({
    cwd: repository, env: {}, repoRoot: repository, fsApi: fs, nodeExecutable: 'node-fake', nodeVersion: 'v22.0.0', defaultScratch,
    run: fakeRunner(({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) }))
  });
  const options = parseArgs(['--root', relative(fixtureRoot('pass'))]);
  assert.equal((await runGate(options, dependencies())).exitCode, 0);
  assert.equal(fs.existsSync(defaultScratch), false, 'the folder the gate created is removed again');
  fs.mkdirSync(defaultScratch);
  fs.writeFileSync(path.join(defaultScratch, 'other-run.txt'), 'x');
  assert.equal((await runGate(options, dependencies())).exitCode, 0);
  assert.deepEqual(fs.readdirSync(defaultScratch), ['other-run.txt'], 'a folder that already existed and holds something else is left alone');
});

test('m6: a repeated scalar flag is a usage error, never the last value silently', () => {
  for (const argv of [['--min', '0', '--min', '85'], ['--min', '85', '--min', '0'], ['--json', 'a.json', '--json', 'b.json'], ['--timeout', '5', '--timeout', '6'], ['--jobs', '1', '--jobs', '2']]) {
    assert.throws(() => parseArgs(['--root', 'r', ...argv]), (error) => error instanceof UsageError && /more than once/.test(error.message), argv.join(' '));
  }
  assert.throws(() => parseArgs(['--root', 'r', '--root', 's']), (error) => error instanceof UsageError && /more than once/.test(error.message));
});

test('m6: fullBar says whether the report is the full 85 bar over the full namespace', () => {
  const report = (min, filters = {}) => buildReport({
    root: 'r', node: 'v', min, files: [], unclassified: [], excluded: [], skippedDirectories: [], warnings: [], tests: [], timeoutMs: 1,
    filters: { include: [], exclude: [], ...filters }
  });
  assert.deepEqual([report(85).fullBar, report(85).fullBarReasons], [true, []]);
  assert.equal(report(100).fullBar, true, 'a stricter bar is still the full bar');
  const lower = report(70);
  assert.deepEqual([lower.fullBar, lower.fullBarReasons.length], [false, 1]);
  assert.match(lower.fullBarReasons[0], /--min 70 is below the 85 bar/);
  assert.match(report(85, { include: ['a/**'] }).fullBarReasons.join(), /--include/);
  assert.match(report(85, { exclude: ['b.cjs'] }).fullBarReasons.join(), /--exclude/);
  assert.equal(report(60, { include: ['x'], exclude: ['y'] }).fullBarReasons.length, 3);
});

test('m8: a directory named Node_Modules in any letter case is skipped like node_modules', (t) => {
  const base = makeScratch('m8');
  t.after(() => dispose(base));
  const root = writeTree(path.join(base, 'ns'), { 'Node_Modules/dep.cjs': "'use strict';\n", 'lib.cjs': "'use strict';\n" });
  const listing = walkTree(root);
  assert.deepEqual(listing.files, ['lib.cjs']);
  assert.deepEqual(listing.skipped, [{ directory: 'Node_Modules', rule: 'dependencies' }]);
});
