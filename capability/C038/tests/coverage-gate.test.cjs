'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const gate = require('./coverage-gate.cjs');
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
const allPerfect = () => Object.fromEntries(everything.map((name) => [name, perfect]));
// Raw Node 22 report captured before the enumerated gate existed: five loaded files, page.js absent.
const baseline = [
  '# start of coverage report',
  '# ---------------------------------------------------------------',
  '# file           | line % | branch % | funcs % | uncovered lines',
  '# ---------------------------------------------------------------',
  '# capability     |        |          |         | ',
  '#  C038          |        |          |         | ',
  '#   boundary.cjs |  88.52 |   100.00 |   75.00 | 54-60',
  '#   cli.cjs      |  69.23 |    42.86 |  100.00 | 13-20',
  '#   model.js     |  99.28 |    96.36 |  100.00 | 4',
  '#   readiness.js |  97.92 |    96.22 |   96.77 | 7-12',
  '#   sources.cjs  | 100.00 |    85.45 |  100.00 | ',
  '# ---------------------------------------------------------------',
  '# all files      |  96.39 |    94.31 |   96.77 | ',
  '# ---------------------------------------------------------------',
  '# end of coverage report'
].join('\r\n');
test('every root-level production script is enumerated; tests, evidence, markup and data are not', () => {
  const paths = ['README.md', 'index.html', 'style.css', 'read-gates.ps1', 'publisher-boundary.json', 'C038.feature',
    ...everything, 'tests/coverage.cjs', 'tests/support.cjs', 'evidence/red/readiness.initial.js', 'evidence/raw/x/run.json'];
  assert.deepEqual(gate.enumerate(paths), everything);
  assert.deepEqual(gate.enumerate(paths.map((item) => item.replaceAll('/', '\\'))), everything);
  assert.throws(() => gate.enumerate([...paths, 'lib/helper.js']), /NESTED_PRODUCTION_FILE lib\/helper\.js/);
  assert.deepEqual(gate.enumerate([]), []);
});
test('the live namespace enumerates all six production scripts including the browser page', () => {
  const root = path.resolve(__dirname, '..');
  const enumerated = gate.enumerate(gate.listNamespaceFiles(root));
  for (const file of everything) assert.ok(enumerated.includes(file), file);
  assert.ok(enumerated.every((file) => !file.includes('/') && !file.startsWith('tests')));
  assert.deepEqual(gate.unmeasured(gate.listNamespaceFiles(root)), ['index.html', 'read-gates.ps1', 'style.css']);
});
test('non-JavaScript production assets are disclosed as not measured, never counted', () => {
  assert.deepEqual(gate.unmeasured(['style.css', 'index.html', 'read-gates.ps1', 'README.md', 'model.js',
    'tests/browser-info.ps1', 'evidence/red/readiness.initial.js']), ['index.html', 'read-gates.ps1', 'style.css']);
  const text = gate.format(evaluate(['model.js'], { 'model.js': perfect }, perfect), ['index.html', 'style.css']);
  assert.match(text, /Not measured by Node coverage, disclosed and never counted: index\.html, style\.css/);
  assert.match(gate.format(evaluate(['model.js'], { 'model.js': perfect }, perfect)), /counted: none/);
});
test('an enumerated file with no report row counts as 0% and fails the gate', () => {
  const rows = allPerfect();
  delete rows['page.js'];
  const result = evaluate(everything, rows, [96.39, 94.31, 96.77]);
  assert.equal(result.passed, false);
  const page = result.files.find((item) => item.file === 'page.js');
  assert.deepEqual([page.loaded, page.lines, page.branches, page.functions], [false, 0, 0, 0]);
  assert.deepEqual(page.failures, ['UNLOADED_COUNTS_AS_ZERO', 'lines 0.00 < 85', 'branches 0.00 < 85', 'functions 0.00 < 85']);
  assert.match(gate.format(result), /page\.js\s+\| NO\s+\| 0\.00\s+\| 0\.00\s+\| 0\.00\s+\| 85\/85\/85 \| FAIL UNLOADED_COUNTS_AS_ZERO/);
});
test('a low file is not hidden by a passing aggregate', () => {
  const rows = allPerfect();
  rows['cli.cjs'] = [69.23, 42.86, 100];
  const result = evaluate(everything, rows, [96.39, 94.31, 96.77]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.files.find((item) => item.file === 'cli.cjs').failures, ['lines 69.23 < 85', 'branches 42.86 < 85']);
  assert.deepEqual(result.files.filter((item) => item.failures.length).map((item) => item.file), ['cli.cjs']);
});
test('the real baseline report is judged per file: boundary.cjs functions, cli.cjs and unloaded page.js fail', () => {
  const result = gate.evaluate(everything, gate.parse(baseline));
  assert.equal(result.passed, false);
  assert.deepEqual(result.files.map((item) => [item.file, item.loaded, item.failures.length === 0]), [
    ['boundary.cjs', true, false], ['cli.cjs', true, false], ['model.js', true, true],
    ['page.js', false, false], ['readiness.js', true, true], ['sources.cjs', true, true]]);
  assert.deepEqual(result.files[0].failures, ['functions 75.00 < 85']);
  assert.deepEqual(gate.parse(baseline).aggregate, { lines: 96.39, branches: 94.31, functions: 96.77 });
});
for (const metric of gate.METRICS) {
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
  for (const file of ['boundary.cjs', 'cli.cjs', 'page.js', 'sources.cjs']) {
    assert.deepEqual(gate.floorsFor(file), { lines: 85, branches: 85, functions: 85 });
  }
  const rows = allPerfect();
  rows['readiness.js'] = [89.99, 100, 100];
  assert.deepEqual(evaluate(everything, rows, perfect).files.find((item) => item.file === 'readiness.js').failures, ['lines 89.99 < 90']);
  rows['readiness.js'] = [100, 100, 89.99];
  assert.deepEqual(evaluate(everything, rows, perfect).files.find((item) => item.file === 'readiness.js').failures, ['functions 89.99 < 90']);
  assert.throws(() => { gate.FLOORS.lines = 1; }, TypeError);
});
test('a measured file outside the enumerated set fails closed', () => {
  const result = evaluate(['model.js'], { 'model.js': perfect, 'stray.js': perfect }, perfect);
  assert.equal(result.passed, false);
  assert.deepEqual(result.unenumerated, ['stray.js']);
  assert.match(gate.format(result), /UNENUMERATED measured file: stray\.js/);
});
test('an empty enumeration can never pass', () => {
  assert.equal(gate.evaluate([], gate.parse('')).passed, false);
});
test('every file row of the Node report is read, not only the aggregate', () => {
  const report = gate.parse(table({ 'cli.cjs': [69.23, 42.86, 100], 'sources.cjs': [100, 85.45, 100] }, [96.39, 94.31, 96.77]));
  assert.deepEqual([...report.files.keys()], ['cli.cjs', 'sources.cjs']);
  assert.deepEqual(report.files.get('cli.cjs'), { lines: 69.23, branches: 42.86, functions: 100 });
  assert.deepEqual(report.aggregate, { lines: 96.39, branches: 94.31, functions: 96.77 });
  assert.deepEqual(gate.parse('no report here').aggregate, null);
  assert.equal(gate.parse('no report here').files.size, 0);
});
test('a fully met report passes and prints one ok row per file', () => {
  const result = evaluate(everything, allPerfect(), perfect);
  assert.equal(result.passed, true);
  assert.deepEqual(result.unenumerated, []);
  const text = gate.format(result);
  assert.equal(text.split('\n').filter((row) => /\| ok$/.test(row)).length, 6);
});
test('the nested runner never inherits a test context, V8 coverage directory or evidence capture variable', () => {
  const polluted = { NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'somewhere', CAPTURE_BROWSER_EVIDENCE: '1',
    C038_CAPTURE_DIR: 'evidence', PATH: 'kept', GIT_CONFIG_COUNT: '3' };
  assert.deepEqual(gate.nestedEnvironment(polluted), { PATH: 'kept', GIT_CONFIG_COUNT: '3' });
  assert.equal(polluted.NODE_TEST_CONTEXT, 'child-v8', 'the caller environment is copied, never mutated');
  assert.deepEqual(gate.nestedEnvironment({}), {});
});
test('every focused test the gate runs exists, including the gate unit tests themselves', () => {
  const fs = require('node:fs');
  assert.ok(gate.TESTS.includes('coverage-gate.test.cjs'));
  assert.equal(new Set(gate.TESTS).size, gate.TESTS.length);
  for (const file of gate.TESTS) assert.ok(fs.existsSync(path.join(__dirname, file)), file);
  assert.throws(() => { gate.TESTS.push('x'); }, TypeError);
});
