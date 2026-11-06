'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  COVERAGE_METRICS, parseLcov, percentOf, meetsMinimum, selectRecord, parseTapSummary, parseTapFailures, parseTapTable, tableRowFor
} = require('../report.cjs');

// Verbatim shapes written by Node 22's lcov reporter and printed by its tap reporter for the same run.
const LCOV = [
  'TN:', 'SF:lib.cjs', 'FN:2,half', 'FN:3,never', 'FNDA:1,half', 'FNDA:0,never', 'FNF:2', 'FNH:1', 'BRDA:1,0,0,1', 'BRDA:2,1,0,1', 'BRDA:2,2,0,0',
  'BRF:3', 'BRH:2', 'DA:1,1', 'DA:2,1', 'DA:3,0', 'DA:4,1', 'LH:3', 'LF:4', 'end_of_record', ''
].join('\n');
const TABLE = [
  'TAP version 13', '# tests 1', '# pass 1', '# fail 0', '# start of coverage report',
  '# ----------------------------------------------------------', '# file      | line % | branch % | funcs % | uncovered lines',
  '# ----------------------------------------------------------', '# capability |        |          |         | ', '#  C031       |        |          |         | ',
  '#   cli.cjs  | 100.00 |   100.00 |  100.00 | ', '#   page.js  |  97.10 |   100.00 |   85.71 | 12-14', '# all files |  98.55 |   100.00 |   92.86 | ', '# end of coverage report', ''
].join('\n');

test('parseLcov reads the exact counts of a real Node lcov record', () => {
  assert.deepEqual(parseLcov(LCOV), [{ file: 'lib.cjs', lines: { covered: 3, total: 4 }, branches: { covered: 2, total: 3 }, functions: { covered: 1, total: 2 } }]);
});

test('parseLcov handles CRLF, several records and an empty report', () => {
  const two = `${LCOV}${LCOV.replace('lib.cjs', 'other.cjs').replace('LH:3', 'LH:4')}`.replace(/\n/g, '\r\n');
  const records = parseLcov(two);
  assert.deepEqual(records.map((record) => [record.file, record.lines.covered]), [['lib.cjs', 3], ['other.cjs', 4]]);
  assert.deepEqual(parseLcov('TN:\n'), [], 'an unloaded file leaves an lcov report without any record');
  assert.deepEqual(parseLcov(''), []);
});

test('a half-written or inconsistent lcov report is an error, never a guess', () => {
  assert.throws(() => parseLcov(LCOV.replace('end_of_record', '')), /no end_of_record/);
  assert.throws(() => parseLcov(LCOV.replace('LF:4\n', '')), /missing or inconsistent lines totals/);
  assert.throws(() => parseLcov(LCOV.replace('BRH:2', 'BRH:9')), /missing or inconsistent branches totals/);
  assert.throws(() => parseLcov(LCOV.replace('FNF:2', 'FNF:x')), /missing or inconsistent functions totals/);
});

test('percentages keep their decimals and a metric with nothing to count is vacuously 100 like in Node', () => {
  assert.equal(percentOf({ covered: 3, total: 4 }), 75);
  assert.equal(percentOf({ covered: 0, total: 0 }), 100);
  assert.equal(percentOf({ covered: 0, total: 7 }), 0);
  assert.equal(percentOf({ covered: 861, total: 1013 }), 86100 / 1013);
  assert.ok(percentOf({ covered: 861, total: 1013 }) < 85 && percentOf({ covered: 861, total: 1013 }) > 84.995);
  assert.deepEqual([...COVERAGE_METRICS], ['lines', 'branches', 'functions']);
});

test('the minimum is compared on exact integers: 84.995 percent is below 85 although it prints as 85.00', () => {
  assert.equal(meetsMinimum({ covered: 861, total: 1013 }, 85), false);
  assert.equal((861 * 100 / 1013).toFixed(2), '85.00', 'the rounded figure would have passed');
  assert.equal(meetsMinimum({ covered: 17, total: 20 }, 85), true, 'exactly the minimum passes');
  assert.equal(meetsMinimum({ covered: 84, total: 100 }, 85), false);
  assert.equal(meetsMinimum({ covered: 85, total: 100 }, 85), true);
  assert.equal(meetsMinimum({ covered: 0, total: 0 }, 100), true);
  assert.equal(meetsMinimum({ covered: 0, total: 5 }, 0), true);
  assert.equal(meetsMinimum({ covered: 99, total: 100 }, 100), false);
});

test('selectRecord finds the record whose path, relative to the child cwd, is the production file', () => {
  const base = path.join(path.parse(process.cwd()).root, 'repo');
  const records = [
    { file: path.join('cap', 'C1', 'a.cjs') }, { file: path.join('cap', 'C1', 'b.cjs') }, { file: path.join('..', 'outside', 'c.cjs') }
  ];
  assert.equal(selectRecord(records, base, path.join(base, 'cap', 'C1', 'b.cjs')), records[1]);
  assert.equal(selectRecord(records, base, path.join(path.parse(base).root, 'outside', 'c.cjs')), records[2]);
  assert.equal(selectRecord(records, base, path.join(base, 'cap', 'C1', 'missing.cjs')), undefined);
  assert.equal(selectRecord([], base, path.join(base, 'a.cjs')), undefined);
  if (process.platform === 'win32') assert.equal(selectRecord(records, base, path.join(base, 'CAP', 'c1', 'A.cjs')), records[0]);
});

test('parseTapSummary returns null when the output has no summary and fills missing counters otherwise', () => {
  assert.equal(parseTapSummary('(node:1) Warning: node:test run() is being called recursively within a test file. skipping running files.\n'), null);
  assert.equal(parseTapSummary(''), null);
  assert.deepEqual(parseTapSummary('TAP version 13\n1..3\n# tests 3\n# suites 1\n# pass 2\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n'),
    { tests: 3, suites: 1, pass: 2, fail: 1, cancelled: 0, skipped: 0, todo: 0 });
  assert.deepEqual(parseTapSummary('# tests 0\n'), { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0 });
  assert.deepEqual(parseTapSummary('# tests 2\r\n# pass 2\r\n'), { tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0 });
});

test('parseTapFailures names the failing tests once each and at most ten', () => {
  const output = 'not ok 1 - tests\\a.test.cjs\n    not ok 1 - first failure\n    not ok 2 - second failure\nnot ok 1 - tests\\a.test.cjs\nok 2 - fine\n';
  assert.deepEqual(parseTapFailures(output), ['tests\\a.test.cjs', 'first failure', 'second failure']);
  const many = Array.from({ length: 14 }, (_, index) => `not ok ${index + 1} - t${index}`).join('\n');
  assert.equal(parseTapFailures(many).length, 10);
  assert.deepEqual(parseTapFailures('ok 1 - fine\n'), []);
});

test('parseTapTable reads the file rows of a directory tree and skips directories and the all-files row', () => {
  assert.deepEqual(parseTapTable(TABLE), [
    { name: 'cli.cjs', lines: 100, branches: 100, functions: 100 },
    { name: 'page.js', lines: 97.1, branches: 100, functions: 85.71 }
  ]);
  assert.deepEqual(parseTapTable('# tests 1\n'), []);
});

test('tableRowFor matches by base name and refuses an ambiguous or absent row', () => {
  const rows = parseTapTable(TABLE);
  assert.deepEqual(tableRowFor(rows, path.join('x', 'C031', 'page.js')), { lines: 97.1, branches: 100, functions: 85.71 });
  assert.equal(tableRowFor(rows, 'absent.cjs'), null);
  assert.equal(tableRowFor([...rows, ...rows], 'page.js'), null);
});
