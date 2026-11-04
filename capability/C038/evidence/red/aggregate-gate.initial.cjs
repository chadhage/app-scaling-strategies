'use strict';

// Retained RED: the specified per-file coverage behavior (C038-coverage.feature) asserted against the retained
// aggregate-only subject. It intentionally fails: the subject certifies an unloaded page.js, hides cli.cjs at
// 69.23 lines / 42.86 branches behind a passing aggregate and never reads a per-file row.
const assert = require('node:assert/strict');
const test = require('node:test');
const gate = require('./coverage-gate.initial.cjs');
const line = (name, [lines, branches, functions]) =>
  `#   ${name.padEnd(13)} | ${lines.toFixed(2).padStart(6)} | ${branches.toFixed(2).padStart(8)} | ${functions.toFixed(2).padStart(7)} | `;
function table(files, aggregate) {
  return ['# start of coverage report', '# ---------------------------------------------------------------',
    '# file           | line % | branch % | funcs % | uncovered lines',
    '# ---------------------------------------------------------------',
    '# capability     |        |          |         | ', '#  C038          |        |          |         | ',
    ...Object.entries(files).map(([name, values]) => line(name, values)),
    '# ---------------------------------------------------------------',
    line('all files', aggregate).replace(/^#   /, '# '),
    '# ---------------------------------------------------------------', '# end of coverage report'].join('\n');
}
const everything = ['boundary.cjs', 'cli.cjs', 'model.js', 'page.js', 'readiness.js', 'sources.cjs'];
const perfect = [100, 100, 100];
const evaluate = (enumerated, files, aggregate) => gate.evaluate(enumerated, gate.parse(table(files, aggregate)));
test('every root-level production script is enumerated; tests, evidence, markup and data are not', () => {
  const paths = ['README.md', 'index.html', 'style.css', 'read-gates.ps1', 'publisher-boundary.json', 'C038.feature',
    ...everything, 'tests/coverage.cjs', 'tests/support.cjs', 'evidence/red/readiness.initial.js', 'evidence/raw/x/run.json'];
  assert.deepEqual(gate.enumerate(paths), everything);
  assert.throws(() => gate.enumerate([...paths, 'lib/helper.js']), /NESTED_PRODUCTION_FILE/);
});
test('an enumerated file with no report row counts as 0% and fails the gate', () => {
  const rows = { 'boundary.cjs': perfect, 'cli.cjs': perfect, 'model.js': perfect, 'readiness.js': perfect, 'sources.cjs': perfect };
  const result = evaluate(everything, rows, [96.39, 94.31, 96.77]);
  assert.equal(result.passed, false);
  const page = result.files.find((item) => item.file === 'page.js');
  assert.deepEqual([page.loaded, page.lines, page.branches, page.functions], [false, 0, 0, 0]);
  assert.ok(page.failures.includes('UNLOADED_COUNTS_AS_ZERO'));
});
test('a low file is not hidden by a passing aggregate', () => {
  const rows = Object.fromEntries(everything.map((name) => [name, perfect]));
  rows['cli.cjs'] = [69.23, 42.86, 100];
  const result = evaluate(everything, rows, [96.39, 94.31, 96.77]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.files.find((item) => item.file === 'cli.cjs').failures, ['lines 69.23 < 85', 'branches 42.86 < 85']);
});
for (const metric of ['lines', 'branches', 'functions']) {
  for (const [value, expected] of [[85, true], [84.99, false]]) {
    test(`${metric} at ${value.toFixed(2)} ${expected ? 'passes' : 'fails'} as a hard per-file floor`, () => {
      const values = { lines: 100, branches: 100, functions: 100, [metric]: value };
      const triple = [values.lines, values.branches, values.functions];
      assert.equal(evaluate(['cli.cjs'], { 'cli.cjs': triple }, triple).passed, expected);
    });
  }
}
test('earlier stricter floors survive: readiness.js and model.js keep 90 lines/functions and gain 85 branches', () => {
  assert.deepEqual(gate.floorsFor('readiness.js'), { lines: 90, branches: 85, functions: 90 });
  assert.deepEqual(gate.floorsFor('model.js'), { lines: 90, branches: 85, functions: 90 });
  assert.deepEqual(gate.floorsFor('page.js'), { lines: 85, branches: 85, functions: 85 });
});
test('a measured file outside the enumerated set fails closed', () => {
  const result = evaluate(['model.js'], { 'model.js': perfect, 'stray.js': perfect }, perfect);
  assert.equal(result.passed, false);
  assert.deepEqual(result.unenumerated, ['stray.js']);
});
test('every file row of the Node report is read, not only the aggregate', () => {
  const report = gate.parse(table({ 'cli.cjs': [69.23, 42.86, 100], 'sources.cjs': [100, 85.45, 100] }, [96.39, 94.31, 96.77]));
  assert.deepEqual([...report.files.keys()], ['cli.cjs', 'sources.cjs']);
  assert.deepEqual(report.files.get('cli.cjs'), { lines: 69.23, branches: 42.86, functions: 100 });
  assert.deepEqual(report.aggregate, { lines: 96.39, branches: 94.31, functions: 96.77 });
});
