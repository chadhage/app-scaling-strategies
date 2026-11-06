'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('../errors.cjs');
const { SCHEMA } = require('../evaluate.cjs');
const { MAX_REPORT_BYTES, specialNameProblem, checkReportTarget, writeReportFile, startedReport, failureReport, scanJsonTargets } = require('../output.cjs');
const { makeScratch, dispose } = require('./support.cjs');

const refused = (target, pattern, options) => assert.throws(() => checkReportTarget(target, options), (error) => error instanceof UsageError && pattern.test(error.message), target);
const fakeStat = (overrides = {}) => ({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true, size: 10, ...overrides });

test('names that can never be a plain report file are named by their problem', () => {
  const cases = {
    '': /not a usable path/, 'a\0b.json': /not a usable path/, '\\\\.\\pipe\\x': /device namespace/, '\\\\?\\C:\\x\\r.json': /device namespace/, '//./x/r.json': /device namespace/,
    'C:\\x\\report.json:stream': /alternate data stream/, 'report.json:stream': /alternate data stream/, 'C:\\dir\\NUL': /reserved device name/, 'nul.json': /reserved device name/,
    CON: /reserved device name/, 'x\\Prn\\y.json': /reserved device name/, 'com1.txt': /reserved device name/, 'LPT9': /reserved device name/, 'aux.': /reserved device name/,
    'report.json.': /trailing dot or space/, 'report.json ': /trailing dot or space/
  };
  for (const [name, pattern] of Object.entries(cases)) assert.match(specialNameProblem(name), pattern, JSON.stringify(name));
  for (const name of ['report.json', 'C:\\x\\.scratch\\r.json', 'dir/console.json', 'C:\\Users\\me\\out\\gate-report.json', 'a b\\c.json', 'com10.json', 'x.nul']) {
    assert.equal(specialNameProblem(name), null, name);
  }
});

test('a script name is refused whatever its letter case, because it would be enumerated as production code', () => {
  for (const name of ['r.cjs', 'r.JS', 'r.mjs', 'r.ps1', 'r.TS', 'r.sh']) refused(path.join(path.parse(process.cwd()).root, 'x', name), /named like a script/);
  assert.doesNotThrow(() => checkReportTarget(path.join(path.parse(process.cwd()).root, 'surely', 'not', 'there', 'r.json')));
});

test('a directory, a link and anything that is not a regular file are refused', (t) => {
  const base = makeScratch('output-kinds');
  t.after(() => dispose(base));
  fs.mkdirSync(path.join(base, 'folder'));
  refused(path.join(base, 'folder'), /it is a directory/);
  fs.writeFileSync(path.join(base, 'real.json'), JSON.stringify({ schema: SCHEMA }));
  fs.symlinkSync(path.join(base, 'folder'), path.join(base, 'junction'), 'junction');
  refused(path.join(base, 'junction'), /it is a link/);
  refused('report.json', /not a regular file/, { fsApi: { lstatSync: () => fakeStat({ isFile: () => false }) } });
  refused('report.json', /too large/, { fsApi: { lstatSync: () => fakeStat({ size: MAX_REPORT_BYTES + 1 }) } });
  refused('report.json', /cannot be inspected \(EACCES\)/, { fsApi: { lstatSync: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } } });
  refused('report.json', /cannot be inspected \(boom\)/, { fsApi: { lstatSync: () => { throw new Error('boom'); } } });
  assert.doesNotThrow(() => checkReportTarget(path.join(base, 'real.json')));
});

test('only a previous gate report may be replaced: every other existing file is refused by its content', (t) => {
  const base = makeScratch('output-content');
  t.after(() => dispose(base));
  const put = (name, text) => {
    fs.writeFileSync(path.join(base, name), text);
    return path.join(base, name);
  };
  assert.doesNotThrow(() => checkReportTarget(put('report.json', JSON.stringify({ schema: SCHEMA, pass: true }))));
  assert.doesNotThrow(() => checkReportTarget(put('started.json', JSON.stringify(startedReport()))));
  for (const [name, text] of Object.entries({
    'text.txt': 'precious notes\n', 'empty.json': '', 'array.json': '[]', 'null.json': 'null', 'number.json': '7', 'broken.json': '{ "schema": ',
    'other.json': JSON.stringify({ schema: 'other/1' }), 'plain.json': JSON.stringify({ pass: true }), 'manifest.json': JSON.stringify({ schema: 'U009-coverage-manifest/1' })
  })) {
    refused(put(name, text), /not a previous gate report \(it has no schema U009-coverage-gate\/1\)/);
    assert.equal(fs.readFileSync(path.join(base, name), 'utf8'), text, `${name} is untouched`);
  }
  refused('report.json', /not a previous gate report/, { fsApi: { lstatSync: () => fakeStat(), readFileSync: () => { throw new Error('unreadable'); } } });
});

test('writeReportFile creates the folders and writes the document with a final newline', (t) => {
  const base = makeScratch('output-write');
  t.after(() => dispose(base));
  const target = path.join(base, 'a', 'b', 'report.json');
  writeReportFile(target, { schema: SCHEMA, pass: false });
  assert.equal(fs.readFileSync(target, 'utf8'), `${JSON.stringify({ schema: SCHEMA, pass: false }, null, 2)}\n`);
});

test('the started report is a failure that says so and carries the schema', () => {
  assert.deepEqual(Object.keys(startedReport()), ['schema', 'pass', 'status', 'message']);
  assert.deepEqual([startedReport().schema, startedReport().pass, startedReport().status], [SCHEMA, false, 'started']);
});

test('every kind of error becomes a typed failure report', () => {
  assert.deepEqual(failureReport(new UsageError('bad flag')), { schema: SCHEMA, pass: false, error: { code: 'USAGE', type: 'usage', message: 'bad flag' } });
  assert.deepEqual(failureReport(Object.assign(new Error('exists'), { code: 'EEXIST' })), { schema: SCHEMA, pass: false, error: { code: 'EEXIST', type: 'internal', message: 'exists' } });
  assert.equal(failureReport(Object.assign(new Error('x'), { code: 'lower case' })).error.code, 'INTERNAL');
  assert.equal(failureReport(new Error('plain')).error.code, 'INTERNAL');
  assert.deepEqual(failureReport('a thrown string').error, { code: 'INTERNAL', type: 'internal', message: 'a thrown string' });
  assert.equal(failureReport(undefined).error.message, 'undefined');
});

test('every value after a --json flag is found even when the rest of the command line is wrong', () => {
  assert.deepEqual(scanJsonTargets(['--root', 'r', '--json', 'out.json']), ['out.json']);
  assert.deepEqual(scanJsonTargets(['--json', 'a.json', '--min', 'x', '--json', 'b.json', '--json', 'a.json']), ['a.json', 'b.json']);
  assert.deepEqual(scanJsonTargets(['--json']), []);
  assert.deepEqual(scanJsonTargets(['--json', '--root']), []);
  assert.deepEqual(scanJsonTargets(['--json', '']), []);
  assert.deepEqual(scanJsonTargets([]), []);
});
