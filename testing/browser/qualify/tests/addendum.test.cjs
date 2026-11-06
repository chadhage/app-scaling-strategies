'use strict';

// N1: the helper addendum.cjs: it appends the next line FROM a passing --requalify report (after re-checking the report and
// the installed Edge), writes exactly one line atomically, and refuses a failed report, a broken chain or a duplicate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const addendum = require('../addendum.cjs');
const { SHA, MS_SUBJECT } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain, sha, anchorOf, SEALED_CRLF, SEALED_LF } = require('./chain.cjs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const suite = (file, tests, version) => ({
  file, tests, pass: tests, fail: 0, cancelled: 0, skipped: 0, todo: 0, summaryFound: true, testsPassed: true, passed: true, timedOut: false, exitCode: 0, browserVersionsSeen: [version],
});
const report = (over = {}) => ({
  schemaVersion: 1, checkedAtUtc: '2026-11-07T08:59:00.000Z', ok: false,
  reasons: ['MAJOR_NOT_QUALIFIED: major 157 is not in the qualified majors [156]'], reasonCodes: ['MAJOR_NOT_QUALIFIED'],
  path: EDGE, version: '157.0.4341.42', major: 157,
  signature: { status: 'Valid', publisher: 'Microsoft Corporation', subject: MS_SUBJECT, issuer: 'CN=Microsoft Code Signing PCA 2024', thumbprint: 'CD'.repeat(20) },
  sha256: SHA, qualifiedMajors: [156], candidates: [{ path: EDGE, exists: true }],
  requalification: {
    ran: true, passed: true, candidateMajor: 157, heavySlot: '1', node: 'v22.23.4',
    suites: [suite('isolated.test.cjs', 8, '157.0.4341.42'), suite('loopback.test.cjs', 5, '157.0.4341.42')],
    totals: { tests: 13, suites: 0, pass: 13, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, browserVersionsSeen: ['157.0.4341.42'],
    edgeAfter: { path: EDGE, version: '157.0.4341.42', sha256: SHA, ok: false }, edgeChangedDuringRun: false,
  },
  ...over,
});
const machine = (over = {}) => async () => ({ ok: true, version: '157.0.4341.42', major: 157, sha256: SHA, signature: { status: 'Valid', publisher: 'Microsoft Corporation' }, ...over });
const NOW = new Date('2026-11-07T09:00:00.000Z');

function workspace(t, { sealed = SEALED_CRLF, addendumText = null, reportObject = report() } = {}) {
  const dir = scratchDir();
  t.after(() => removeDir(dir));
  const files = { dir, qualifiedFile: path.join(dir, 'qualified.json'), addendumFile: path.join(dir, 'qualified.addendum.jsonl'), reportPath: path.join(dir, 'report.json') };
  fs.writeFileSync(files.qualifiedFile, sealed);
  if (addendumText !== null) fs.writeFileSync(files.addendumFile, addendumText);
  fs.writeFileSync(files.reportPath, `${JSON.stringify(reportObject, null, 2)}\n`);
  return files;
}
const run = (files, over = {}) => addendum.appendFromReport({ reportPath: files.reportPath, qualifiedFile: files.qualifiedFile, addendumFile: files.addendumFile, verify: machine(), now: () => NOW, ...over });

test('the shipped locations are the sealed qualified.json and qualified.addendum.jsonl next to the helper, and the limits are fixed', () => {
  assert.equal(addendum.SEALED_FILE, path.join(__dirname, '..', 'qualified.json'));
  assert.equal(addendum.ADDENDUM_FILE, path.join(__dirname, '..', 'qualified.addendum.jsonl'));
  assert.deepEqual([addendum.MAX_BYTES, addendum.MAX_LINES], [65536, 200]);
  assert.deepEqual(addendum.KEYS, ['major', 'version', 'binarySha256', 'reportSha256', 'previous', 'atUtc']);
  assert.equal(addendum.anchorOf(Buffer.from(SEALED_CRLF)), anchorOf(SEALED_CRLF));
  assert.equal(addendum.anchorOf(Buffer.from(SEALED_CRLF)), addendum.anchorOf(Buffer.from(SEALED_LF)));
});

test('parseAddendum returns the entries, the majors and the hash of the last line', () => {
  const { text, lines } = chain(SEALED_CRLF, [157, 158]);
  const parsed = addendum.parseAddendum(Buffer.from(text), { anchor: anchorOf(SEALED_CRLF), sealedMajors: [156] });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.majors, [157, 158]);
  assert.deepEqual(parsed.entries.map((entry) => entry.version), ['157.0.4341.42', '158.0.4341.42']);
  assert.equal(parsed.head, sha(Buffer.from(lines[1])));
  assert.equal(addendum.parseAddendum(Buffer.from('x\n'), { anchor: anchorOf(SEALED_CRLF), sealedMajors: [156] }).ok, false);
});

test('readAddendum: an absent file is no addendum, odd answers of the file system are refused with the code', () => {
  const dir = scratchDir();
  try {
    const options = { anchor: anchorOf(SEALED_CRLF), sealedMajors: [156] };
    const absent = addendum.readAddendum(path.join(dir, 'none.jsonl'), options);
    assert.deepEqual([absent.ok, absent.absent, absent.majors, absent.head], [true, true, [], anchorOf(SEALED_CRLF)]);
    const regular = { isFile: () => true, isSymbolicLink: () => false, size: 10 };
    const fake = (overrides) => ({ lstatSync: () => regular, readFileSync: () => Buffer.from('x\n'), ...overrides });
    const denied = addendum.readAddendum('x', { ...options, fsApi: fake({ readFileSync() { throw Object.assign(new Error('no'), { code: 'EACCES' }); } }) });
    assert.deepEqual([denied.ok, denied.error], [false, 'the file cannot be read (EACCES)']);
    const locked = addendum.readAddendum('x', { ...options, fsApi: fake({ lstatSync() { throw Object.assign(new Error('no'), { code: 'EPERM' }); } }) });
    assert.deepEqual([locked.ok, locked.error], [false, 'the file cannot be read (EPERM)']);
    const big = addendum.readAddendum('x', { ...options, fsApi: fake({ lstatSync: () => ({ ...regular, size: 65537 }), readFileSync() { throw new Error('must not read'); } }) });
    assert.equal(big.error, 'the file is larger than 65536 bytes');
    const link = addendum.readAddendum('x', { ...options, fsApi: fake({ lstatSync: () => ({ ...regular, isSymbolicLink: () => true }) }) });
    assert.equal(link.error, 'the file is not a regular file');
  } finally {
    removeDir(dir);
  }
});

test('verifyFiles reads the sealed file and the addendum together: majors, entries, the anchor and the head', () => {
  const dir = scratchDir();
  try {
    const qualifiedFile = path.join(dir, 'qualified.json');
    const addendumFile = path.join(dir, 'qualified.addendum.jsonl');
    fs.writeFileSync(qualifiedFile, SEALED_CRLF);
    const none = addendum.verifyFiles({ qualifiedFile, addendumFile });
    assert.deepEqual([none.ok, none.sealedMajors, none.majors, none.entries.length], [true, [156], [156], 0]);
    fs.writeFileSync(addendumFile, chain(SEALED_CRLF, [157, 158]).text);
    const some = addendum.verifyFiles({ qualifiedFile, addendumFile });
    assert.deepEqual([some.ok, some.sealedMajors, some.majors, some.entries.length, some.anchor], [true, [156], [156, 157, 158], 2, anchorOf(SEALED_CRLF)]);
    fs.writeFileSync(addendumFile, 'junk\n');
    const broken = addendum.verifyFiles({ qualifiedFile, addendumFile });
    assert.deepEqual([broken.ok, broken.code], [false, 'QUALIFIED_ADDENDUM_INVALID']);
    fs.writeFileSync(qualifiedFile, '{ "qualifiedMajors": [] }');
    const sealed = addendum.verifyFiles({ qualifiedFile, addendumFile });
    assert.deepEqual([sealed.ok, sealed.code], [false, 'QUALIFIED_MAJORS_INVALID']);
  } finally {
    removeDir(dir);
  }
});

test('the first append creates the file with exactly one line that an independent builder would write', async (t) => {
  const files = workspace(t);
  const result = await run(files);
  assert.equal(result.ok, true, result.error);
  const written = fs.readFileSync(files.addendumFile, 'utf8');
  const expected = chain(SEALED_CRLF, [{ major: 157, binarySha256: SHA, reportSha256: sha(fs.readFileSync(files.reportPath)), atUtc: NOW.toISOString() }]);
  assert.equal(written, expected.text);
  assert.equal(result.line, expected.lines[0]);
  assert.deepEqual(fs.readdirSync(files.dir).sort(), ['qualified.addendum.jsonl', 'qualified.json', 'report.json']);
});

test('the next append adds one more line to the chain, and the chain stays valid', async (t) => {
  const files = workspace(t);
  assert.equal((await run(files)).ok, true);
  const second = workspace(t, { reportObject: report({ version: '158.0.1.2', major: 158 }) });
  fs.copyFileSync(files.addendumFile, second.addendumFile);
  const reportObject = report({ version: '158.0.1.2', major: 158, requalification: { ...report().requalification, candidateMajor: 158, edgeAfter: { path: EDGE, version: '158.0.1.2', sha256: SHA, ok: false }, browserVersionsSeen: ['158.0.1.2'], suites: [suite('isolated.test.cjs', 8, '158.0.1.2'), suite('loopback.test.cjs', 5, '158.0.1.2')] } });
  fs.writeFileSync(second.reportPath, `${JSON.stringify(reportObject)}\n`);
  const result = await run(second, { verify: machine({ version: '158.0.1.2', major: 158 }) });
  assert.equal(result.ok, true, result.error);
  const verified = addendum.verifyFiles({ qualifiedFile: second.qualifiedFile, addendumFile: second.addendumFile });
  assert.deepEqual([verified.ok, verified.majors], [true, [156, 157, 158]]);
  assert.equal(fs.readFileSync(second.addendumFile, 'utf8').split('\n').length, 3);
});

test('a dry run checks everything and writes nothing', async (t) => {
  const files = workspace(t);
  const result = await run(files, { dryRun: true });
  assert.equal(result.ok, true, result.error);
  assert.match(result.line, /^\{"major":157,/);
  assert.equal(fs.existsSync(files.addendumFile), false);
});

test('a report that failed, is incomplete or is for something else is refused, and nothing is written', async (t) => {
  const base = report();
  const suites = base.requalification.suites;
  const withSuite = (change) => report({ requalification: { ...base.requalification, suites: [{ ...suites[0], ...change }, suites[1]] } });
  const requal = (change) => report({ requalification: { ...base.requalification, ...change } });
  const cases = [
    ['not an object', null, /is not a requalification report of this tool/],
    ['another schema', { ...base, schemaVersion: 2 }, /is not a requalification report of this tool/],
    ['no suites ran', report({ requalification: { ran: false, skipped: 'x' } }), /did not run the isolated suites/],
    ['the requalification failed', requal({ passed: false }), /the requalification did not pass/],
    ['another failure besides the major', report({ reasonCodes: ['MAJOR_NOT_QUALIFIED', 'SIGNATURE_NOT_VALID'] }), /other failures than MAJOR_NOT_QUALIFIED/],
    ['the major is already qualified', report({ ok: true, reasonCodes: [] }), /nothing to add/],
    ['a suite skipped a test', withSuite({ skipped: 1, pass: 7, testsPassed: false, passed: false }), /a suite did not pass every test/],
    ['a suite printed another browser', withSuite({ browserVersionsSeen: ['156.0.4314.58'] }), /did not print the browser version of the report/],
    ['no suite at all', requal({ suites: [] }), /no suite is listed in the report/],
    ['the Edge changed during the run', requal({ edgeChangedDuringRun: true }), /the Edge changed during the run/],
    ['the Edge after the run is another one', requal({ edgeAfter: { ...base.requalification.edgeAfter, sha256: 'ab'.repeat(31) + 'cd' } }), /the Edge changed during the run/],
    ['another candidate major', requal({ candidateMajor: 158 }), /the requalification was run for another major/],
    ['the signature is not valid', report({ signature: { ...base.signature, status: 'NotSigned' } }), /the signature is not Valid by Microsoft Corporation/],
    ['another publisher', report({ signature: { ...base.signature, publisher: 'Evil Corp' } }), /the signature is not Valid by Microsoft Corporation/],
    ['a version of another major', report({ version: '158.0.4341.42' }), /the version is not major\.minor\.build\.patch of the report major/],
    ['a sha256 that is not a digest', report({ sha256: 'xyz' }), /the sha256 is not 64 lowercase hex digits/],
    ['major 156', report({ major: 156, version: '156.0.4314.58' }), /is not above the sealed majors/],
  ];
  for (const [label, reportObject, reason] of cases) {
    const files = workspace(t, { reportObject });
    const result = await run(files);
    assert.equal(result.ok, false, label);
    assert.match(result.error, reason, label);
    assert.equal(fs.existsSync(files.addendumFile), false, label);
  }
});

test('the installed Edge must be the one in the report: version, digest, signature and the check itself are compared', async (t) => {
  const cases = [
    ['another version', { version: '157.0.9999.1' }],
    ['another digest', { sha256: 'cd'.repeat(32) }],
    ['another major', { major: 158 }],
    ['a failed check', { ok: false }],
    ['an invalid signature', { signature: { status: 'HashMismatch', publisher: 'Microsoft Corporation' } }],
    ['another publisher', { signature: { status: 'Valid', publisher: 'Evil Corp' } }],
  ];
  for (const [label, change] of cases) {
    const files = workspace(t);
    const result = await run(files, { verify: machine(change) });
    assert.equal(result.ok, false, label);
    assert.match(result.error, /the installed Edge does not match the report/, label);
    assert.equal(fs.existsSync(files.addendumFile), false, label);
  }
});

test('a duplicate, a broken chain and a lock left by another run refuse the append and keep the file as it was', async (t) => {
  const good = chain(SEALED_CRLF, [157]).text;
  const twice = workspace(t, { addendumText: good });
  const duplicate = await run(twice);
  assert.match(duplicate.error, /major 157 is already listed/);
  assert.equal(fs.readFileSync(twice.addendumFile, 'utf8'), good);
  const broken = workspace(t, { addendumText: 'junk\n', reportObject: report({ version: '158.0.1.2', major: 158 }) });
  const refused = await run(broken, { verify: machine({ version: '158.0.1.2', major: 158 }) });
  assert.match(refused.error, /the existing addendum cannot be used: line 1 is not valid JSON/);
  assert.equal(fs.readFileSync(broken.addendumFile, 'utf8'), 'junk\n');
  const locked = workspace(t);
  fs.writeFileSync(`${locked.addendumFile}.lock`, 'another run');
  const waiting = await run(locked);
  assert.match(waiting.error, /another append is running or a stale lock exists/);
  assert.equal(fs.existsSync(locked.addendumFile), false);
  assert.equal(fs.existsSync(`${locked.addendumFile}.lock`), true);
});

test('an unreadable or oversized report is refused, and a missing report is a typed refusal', async (t) => {
  const files = workspace(t);
  fs.writeFileSync(files.reportPath, '{ not json');
  assert.match((await run(files)).error, /the report cannot be read as JSON/);
  fs.writeFileSync(files.reportPath, Buffer.alloc(1048577, 0x20));
  assert.match((await run(files)).error, /the report is larger than 1048576 bytes/);
  fs.rmSync(files.reportPath);
  assert.match((await run(files)).error, /the report cannot be read \(ENOENT\)/);
});
