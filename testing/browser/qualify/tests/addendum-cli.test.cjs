'use strict';

// N1: the command line of the helper: node testing\browser\qualify\addendum.cjs --check | --report <file> [--dry-run]
// stdout is the JSON answer, stderr is ONE line; exit 0 done, 1 refused (fails closed), 2 usage.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const addendum = require('../addendum.cjs');
const { SHA, MS_SUBJECT } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain, SEALED_CRLF } = require('./chain.cjs');

const sink = () => ({ text: '', write(chunk) { this.text += chunk; } });
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const suite = (file, tests) => ({ file, tests, pass: tests, fail: 0, cancelled: 0, skipped: 0, todo: 0, summaryFound: true, testsPassed: true, passed: true, timedOut: false, exitCode: 0, browserVersionsSeen: ['157.0.4341.42'] });
const REPORT = {
  schemaVersion: 1, ok: false, reasonCodes: ['MAJOR_NOT_QUALIFIED'], path: EDGE, version: '157.0.4341.42', major: 157,
  signature: { status: 'Valid', publisher: 'Microsoft Corporation', subject: MS_SUBJECT }, sha256: SHA, qualifiedMajors: [156],
  requalification: {
    ran: true, passed: true, candidateMajor: 157, suites: [suite('isolated.test.cjs', 8), suite('loopback.test.cjs', 5)],
    edgeAfter: { path: EDGE, version: '157.0.4341.42', sha256: SHA, ok: false }, edgeChangedDuringRun: false,
  },
};
const verify = async () => ({ ok: true, version: '157.0.4341.42', major: 157, sha256: SHA, signature: { status: 'Valid', publisher: 'Microsoft Corporation' } });

function workspace(t, addendumText = null) {
  const dir = scratchDir();
  t.after(() => removeDir(dir));
  const files = { dir, qualifiedFile: path.join(dir, 'qualified.json'), addendumFile: path.join(dir, 'qualified.addendum.jsonl'), reportPath: path.join(dir, 'report.json') };
  fs.writeFileSync(files.qualifiedFile, SEALED_CRLF);
  if (addendumText !== null) fs.writeFileSync(files.addendumFile, addendumText);
  fs.writeFileSync(files.reportPath, JSON.stringify(REPORT));
  return files;
}
const call = async (argv, files, extra = {}) => {
  const [out, err] = [sink(), sink()];
  const code = await addendum.main(argv, {
    stdout: out, stderr: err, qualifiedFile: files.qualifiedFile, addendumFile: files.addendumFile, verify, now: () => new Date('2026-11-07T09:00:00.000Z'), ...extra,
  });
  return { code, out: out.text, err: err.text };
};
const oneLine = (text) => text.endsWith('\n') && !/[\r\n]/.test(text.slice(0, -1));

test('--help prints the usage and exits 0; every misuse is a usage error with exit 2 and nothing is written', async (t) => {
  const files = workspace(t);
  const help = await call(['--help'], files);
  assert.deepEqual([help.code, help.err], [0, '']);
  assert.match(help.out, /Usage: node testing\\browser\\qualify\\addendum\.cjs/);
  for (const argv of [[], ['--bogus'], ['--report'], ['--report', '--dry-run'], ['--check', '--report', 'x'], ['--dry-run'], ['--report', 'a', '--report', 'b'], ['positional']]) {
    const result = await call(argv, files);
    assert.equal(result.code, 2, argv.join(' '));
    assert.equal(result.out, '', argv.join(' '));
    assert.match(result.err, /Usage: node testing\\browser\\qualify\\addendum\.cjs/, argv.join(' '));
  }
  assert.equal(fs.existsSync(files.addendumFile), false);
});

test('--check: no addendum, a valid chain and a broken chain; one stderr line each', async (t) => {
  const none = await call(['--check'], workspace(t));
  assert.equal(none.code, 0);
  assert.ok(oneLine(none.err), none.err);
  assert.match(none.err, /^OK qualified list: sealed \[156\] and no addendum\n$/);
  assert.deepEqual(JSON.parse(none.out), { ok: true, sealedMajors: [156], majors: [156], lines: 0, anchor: SEALED_ANCHOR(), head: SEALED_ANCHOR() });
  const some = chain(SEALED_CRLF, [157, 158]);
  const valid = await call(['--check'], workspace(t, some.text));
  assert.equal(valid.code, 0);
  assert.match(valid.err, /^OK qualified list: sealed \[156\] and addendum \[157, 158\] \(2 lines\)\n$/);
  assert.deepEqual(JSON.parse(valid.out).majors, [156, 157, 158]);
  const broken = await call(['--check'], workspace(t, 'junk\n'));
  assert.equal(broken.code, 1);
  assert.equal(broken.out, '');
  assert.equal(broken.err, 'FAIL closed: QUALIFIED_ADDENDUM_INVALID: line 1 is not valid JSON\n');
});
function SEALED_ANCHOR() { return require('./chain.cjs').anchorOf(SEALED_CRLF); }

test('--report appends one line and says so on one line; --dry-run only shows it', async (t) => {
  const files = workspace(t);
  const dry = await call(['--report', files.reportPath, '--dry-run'], files);
  assert.equal(dry.code, 0);
  assert.match(dry.err, /^DRY RUN would append major 157 \(157\.0\.4341\.42\) to qualified\.addendum\.jsonl\n$/);
  assert.equal(fs.existsSync(files.addendumFile), false);
  const done = await call(['--report', files.reportPath], files);
  assert.equal(done.code, 0);
  assert.match(done.err, /^APPENDED major 157 \(157\.0\.4341\.42\) to qualified\.addendum\.jsonl\n$/);
  assert.equal(`${done.out}`, fs.readFileSync(files.addendumFile, 'utf8'));
  assert.equal(addendum.verifyFiles({ qualifiedFile: files.qualifiedFile, addendumFile: files.addendumFile }).ok, true);
});

test('a refused append exits 1 with one FAIL closed line, nothing on stdout and the file untouched', async (t) => {
  const files = workspace(t);
  fs.writeFileSync(files.reportPath, JSON.stringify({ ...REPORT, requalification: { ...REPORT.requalification, passed: false } }));
  const result = await call(['--report', files.reportPath], files);
  assert.equal(result.code, 1);
  assert.equal(result.out, '');
  assert.equal(result.err, 'FAIL closed: the requalification did not pass\n');
  assert.equal(fs.existsSync(files.addendumFile), false);
  fs.writeFileSync(files.reportPath, JSON.stringify(REPORT));
  const crash = await call(['--report', files.reportPath], files, { verify: async () => { throw new Error('boom\r\nsecond line'); } });
  assert.equal(crash.code, 1);
  assert.equal(crash.err, 'FAIL closed: the helper itself failed: boom second line\n');
});

test('the default machine check asks qualifyEdge about the candidate major on top of the known ones', async () => {
  const seen = [];
  const fake = async (options) => { seen.push(await options.adapters.readQualified()); return { ok: true }; };
  assert.deepEqual(await addendum.machineCheck(157, [156], fake), { ok: true });
  assert.deepEqual(seen, [{ schemaVersion: 1, qualifiedMajors: [156, 157] }]);
});

test('the real command line checks the shipped sealed file and addendum (none yet, or a valid chain) and exits 0', () => {
  const script = path.join(__dirname, '..', 'addendum.cjs');
  const result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8', timeout: 60000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /^OK qualified list: sealed \[156\] and /);
  const answer = JSON.parse(result.stdout);
  assert.deepEqual([answer.ok, answer.sealedMajors], [true, [156]]);
  const bad = spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8', timeout: 60000, windowsHide: true });
  assert.equal(bad.status, 2);
  assert.equal(bad.stdout, '');
});
