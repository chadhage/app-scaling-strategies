'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repository, fixtureRoot, makeScratch, dispose, writeTree } = require('./support.cjs');
const { runGateCli } = require('./clisupport.cjs');

const relative = (file) => path.relative(repository, file).replace(/\\/g, '/');
const lines = (items) => `${items.join('\n')}\n`;
const loader = (file, assertion = "assert.equal(typeof lib, 'object');") =>
  lines(["'use strict';", "const test = require('node:test');", "const assert = require('node:assert/strict');", `const lib = require('../${file}');`, `test('loads ${file}', () => { ${assertion} });`]);

// 1013 lines of which 861 run: 84.9951 percent, which the table that Node prints rounds to 85.00.
function nearMiss() {
  const code = ["'use strict';"];
  for (let index = 1; index <= 7; index += 1) code.push(`function f${index}() { return ${index}; }`);
  code.push('function never() {');
  for (let index = 0; index < 150; index += 1) code.push('  void 0;');
  code.push('}', 'const total = f1() + f2() + f3() + f4() + f5() + f6() + f7();');
  while (code.length < 1012) code.push('void 1;');
  code.push('module.exports = { total, never };');
  return lines(code);
}

// 20 lines of which 17 run: exactly 85 percent, and 6 of 7 functions.
function exactlyAtMinimum() {
  const code = ["'use strict';"];
  for (let index = 1; index <= 6; index += 1) code.push(`function f${index}() { return ${index}; }`);
  code.push('function unused() {', '  return 0;', '}', 'const total = f1() + f2() + f3() + f4() + f5() + f6();');
  for (let index = 1; index <= 8; index += 1) code.push(`const k${index} = ${index};`);
  code.push('module.exports = { total, unused };');
  return lines(code);
}

const state = { scratch: null, runs: {} };

test.before(async () => {
  state.scratch = makeScratch('e2e');
  const scratchArgs = ['--scratch', state.scratch];
  const roots = {
    hang: writeTree(path.join(state.scratch, 'hang'), {
      'lib.cjs': "'use strict';\nmodule.exports = {};\n",
      'tests/hang.test.cjs': lines(["'use strict';", "const test = require('node:test');", "require('../lib.cjs');", 'setInterval(() => {}, 1000);', "test('never finishes', () => new Promise(() => {}));"])
    }),
    near: writeTree(path.join(state.scratch, 'near'), { 'near.cjs': nearMiss(), 'tests/near.test.cjs': loader('near.cjs') }),
    exact: writeTree(path.join(state.scratch, 'exact'), { 'exact.cjs': exactlyAtMinimum(), 'tests/exact.test.cjs': loader('exact.cjs') })
  };
  const poison = { NODE_TEST_CONTEXT: 'child-v8' };
  const jsonOut = path.join(state.scratch, 'pass.json');
  const jobs = {
    unloaded: ['--root', relative(fixtureRoot('unloaded')), ...scratchArgs],
    below: ['--root', relative(fixtureRoot('below')), ...scratchArgs],
    failing: ['--root', relative(fixtureRoot('failing')), ...scratchArgs],
    missingTest: ['--root', relative(fixtureRoot('pass')), '--tests', 'testing/coverage/fixtures/pass/tests/ghost.test.cjs', ...scratchArgs],
    unclassified: ['--root', relative(fixtureRoot('unclassified')), ...scratchArgs],
    noTests: ['--root', relative(fixtureRoot('notests')), ...scratchArgs],
    pass: ['--root', relative(fixtureRoot('pass')), '--json', jsonOut, ...scratchArgs],
    manifested: ['--root', relative(fixtureRoot('manifested')), ...scratchArgs],
    defaultScratch: ['--root', relative(fixtureRoot('pass'))],
    globbed: ['--root', relative(fixtureRoot('pass')), '--tests', 'testing/coverage/fixtures/pass/tests/*.test.cjs', '--min', '100', ...scratchArgs],
    usage: ['--min', '85'],
    hang: ['--root', relative(roots.hang), '--timeout', '5', ...scratchArgs],
    near: ['--root', relative(roots.near), ...scratchArgs],
    exact: ['--root', relative(roots.exact), ...scratchArgs]
  };
  const env = (name) => (name === 'failing' ? { env: poison } : {});
  const entries = await Promise.all(Object.entries(jobs).map(async ([name, args]) => [name, await runGateCli(args, env(name))]));
  state.runs = Object.fromEntries(entries);
  state.jsonOut = jsonOut;
});

test.after(() => {
  if (state.scratch) dispose(state.scratch);
});

test('a production file that no test loads counts as 0 percent and fails although Node exits 0 for it', () => {
  const { status, report } = state.runs.unloaded;
  assert.equal(status, 1);
  assert.equal(report.pass, false);
  const idle = report.files.find((entry) => entry.file === 'idle.cjs');
  assert.deepEqual([idle.loaded, idle.lines, idle.branches, idle.functions, idle.ok], [false, 0, 0, 0, false]);
  assert.equal(idle.nodeExit, 0, 'Node itself said everything was fine (L-0003)');
  assert.equal(report.files.find((entry) => entry.file === 'used.cjs').ok, true);
});

test('a file at 84.9 percent fails and the report keeps the exact figures', () => {
  const { status, report } = state.runs.below;
  assert.equal(status, 1);
  const entry = report.files[0];
  assert.equal(entry.file, 'below.cjs');
  assert.equal(entry.lines, 4500 / 53);
  assert.deepEqual(entry.counts, { lines: [45, 53], branches: [7, 7], functions: [6, 7] });
  assert.equal(entry.ok, false);
  assert.equal(entry.reason, 'lines 84.9057% (45 of 53) is below 85');
  assert.deepEqual(entry.table, { lines: 84.91, branches: 100, functions: 85.71 }, 'the table of the same run agrees with lcov to two decimals');
});

test('a failing nested test cannot pass because the gate inherited NODE_TEST_CONTEXT', () => {
  const { status, report } = state.runs.failing;
  assert.equal(status, 1);
  const entry = report.files[0];
  assert.equal(entry.ok, false);
  assert.equal(entry.reason, '1 test(s) failed or were cancelled');
  assert.deepEqual([entry.lines, entry.tests], [100, 2], 'the nested run really ran: coverage is 100 and both tests were seen');
  assert.deepEqual(entry.failedTests.filter((name) => /failing test/.test(name)).length > 0, true);
});

test('a missing test file fails every enumerated file and names the missing file', () => {
  const { status, report } = state.runs.missingTest;
  assert.equal(status, 1);
  assert.equal(report.files[0].ok, false);
  assert.match(report.files[0].reason, /test file not found: testing\/coverage\/fixtures\/pass\/tests\/ghost\.test\.cjs/);
});

test('an unclassified production candidate fails the gate and is listed, never skipped', () => {
  const { status, report } = state.runs.unclassified;
  assert.equal(status, 1);
  assert.deepEqual(report.unclassified.map((entry) => entry.file), ['verify.cjs']);
  assert.equal(report.pass, false);
  assert.equal(report.files.every((entry) => entry.ok), true, 'the measured file itself passes; the unclassified candidate alone fails the gate');
});

test('a namespace with no tests at all fails instead of passing vacuously', () => {
  const { status, report } = state.runs.noTests;
  assert.equal(status, 1);
  assert.match(report.files[0].reason, /no tests found/);
  assert.deepEqual([report.files[0].lines, report.files[0].loaded], [0, false]);
});

test('a passing namespace exits 0 and reports exact figures in the documented JSON shape; --json writes the same document', () => {
  const { status, report, stderr } = state.runs.pass;
  assert.equal(status, 0);
  assert.equal(report.schema, 'U009-coverage-gate/1');
  assert.equal(report.root, 'testing/coverage/fixtures/pass');
  assert.equal(report.min, 85);
  assert.equal(report.node, process.version);
  assert.deepEqual(report.unclassified, []);
  assert.deepEqual(report.files.map((entry) => [entry.file, entry.lines, entry.branches, entry.functions, entry.loaded, entry.ok, entry.reason]),
    [['lib.cjs', 100, 100, 100, true, true, null]]);
  assert.equal(report.pass, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(state.jsonOut, 'utf8')), report);
  assert.match(stderr, /enumerated production files \(1\): lib\.cjs/);
  assert.match(stderr, /measuring lib\.cjs \(1 of 1\)/);
  assert.match(stderr, /RESULT: PASS/);
});

test('a manifest classifies the tooling file explicitly and the gate passes', () => {
  const { status, report } = state.runs.manifested;
  assert.equal(status, 0);
  assert.deepEqual(report.excluded.map((entry) => [entry.file, entry.by]), [['tests/lib.test.cjs', 'rule'], ['verify.cjs', 'manifest']]);
  assert.match(report.excluded[1].reason, /not production code/);
});

test('without --scratch the gate uses its own scratch folder, and --tests accepts a glob and --min a stricter minimum', () => {
  assert.equal(state.runs.defaultScratch.status, 0);
  assert.equal(state.runs.defaultScratch.report.pass, true);
  assert.equal(state.runs.globbed.status, 0);
  assert.equal(state.runs.globbed.report.min, 100);
  assert.deepEqual(state.runs.globbed.report.tests, ['testing/coverage/fixtures/pass/tests/lib.test.cjs']);
});

test('a usage error exits 2 and still prints a JSON document', () => {
  const { status, report, stderr } = state.runs.usage;
  assert.equal(status, 2);
  assert.deepEqual(report, { schema: 'U009-coverage-gate/1', pass: false, error: { code: 'USAGE', type: 'usage', message: '--root <dir> is required.' } });
  assert.match(stderr, /Usage: node testing\\coverage\\gate\.cjs/);
});

test('a hung run is ended at the timeout and fails the file', () => {
  const { status, report } = state.runs.hang;
  assert.equal(status, 1);
  assert.equal(report.timeoutMs, 5000);
  assert.equal(report.files[0].ok, false);
  assert.match(report.files[0].reason, /timed out after 5 s: the child process tree this gate started was ended/);
});

test('84.995 percent is a miss although Node prints it as 85.00, and exactly 85 percent passes', () => {
  const near = state.runs.near.report.files[0];
  assert.equal(state.runs.near.status, 1);
  assert.deepEqual(near.counts.lines, [861, 1013]);
  assert.equal(near.table.lines, 85, 'the rounded table would have passed it');
  assert.equal(near.ok, false);
  assert.equal(near.reason, 'lines 84.9951% (861 of 1013) is below 85');
  const exact = state.runs.exact.report.files[0];
  assert.equal(state.runs.exact.status, 0);
  assert.deepEqual(exact.counts, { lines: [17, 20], branches: [7, 7], functions: [6, 7] });
  assert.deepEqual([exact.lines, exact.ok], [85, true]);
});
