'use strict';

// F3 of the independent review: stderr is ONE verdict line, whatever the shell said (collapsed whitespace, no
// repeated text), also when the report cannot be written. The full text stays in the JSON report on stdout.
const assert = require('node:assert/strict');
const test = require('node:test');
const cli = require('../cli.cjs');
const { fixtureAdapters } = require('./support.cjs');
const { fakeShell } = require('./harness.cjs');

const sink = () => ({ text: '', write(chunk) { this.text += chunk; } });
const oneLine = (text) => text.endsWith('\n') && !/[\r\n]/.test(text.slice(0, -1)) && text.length > 1;
const SHELL_TEXT = 'the shell exited with 1: first line\r\nAt line:3 char:1\r\n  + broken';
const noShellAdapters = () => {
  const { signature, fileVersion, ...rest } = fixtureAdapters();
  return rest;
};

test('a PowerShell failure with several lines and two reasons is one stderr line with the shared text once', async () => {
  const [out, err] = [sink(), sink()];
  const shell = fakeShell("process.stderr.write('first line\\nAt line:3 char:1\\n  + broken\\n'); process.exit(1)");
  const code = await cli.main([], { stdout: out, stderr: err, qualifyOptions: { adapters: noShellAdapters(), shell } });
  assert.equal(code, 1);
  assert.ok(oneLine(err.text), JSON.stringify(err.text));
  assert.equal(err.text, 'FAIL closed: SIGNATURE_UNAVAILABLE, VERSION_UNAVAILABLE: the shell exited with 1: first line At line:3 char:1 + broken\n');
  const report = JSON.parse(out.text);
  assert.deepEqual(report.reasonCodes, ['SIGNATURE_UNAVAILABLE', 'VERSION_UNAVAILABLE']);
  assert.match(report.reasons[0], /first line\r?\nAt line:3 char:1/);
});

test('reasons with line breaks, tabs and runs of blanks are collapsed and identical reasons are listed once', () => {
  const report = {
    ok: false,
    reasons: [`SIGNATURE_UNAVAILABLE: ${SHELL_TEXT}`, `VERSION_UNAVAILABLE: ${SHELL_TEXT}`, 'MAJOR_NOT_QUALIFIED:\tmajor  157\r\nis not   qualified', 'MAJOR_NOT_QUALIFIED:\tmajor  157\r\nis not   qualified'],
  };
  const line = cli.verdict(report);
  assert.equal(line, 'FAIL closed: SIGNATURE_UNAVAILABLE, VERSION_UNAVAILABLE: the shell exited with 1: first line At line:3 char:1 + broken | MAJOR_NOT_QUALIFIED: major 157 is not qualified');
  assert.doesNotMatch(line, /[\r\n\t]/);
  assert.equal(cli.verdict({ ok: false, reasons: ['A: x', 'B: y'] }), 'FAIL closed: A: x | B: y');
  assert.equal(cli.verdict({ ok: false, reasons: ['A: same', 'B: same', 'C: other'] }), 'FAIL closed: A, B: same | C: other');
});

test('a pass and a failure of the check itself are one line as well', async () => {
  const [out, err] = [sink(), sink()];
  assert.equal(await cli.main([], { stdout: out, stderr: err, qualifyOptions: { adapters: fixtureAdapters() } }), 0);
  assert.ok(oneLine(err.text), JSON.stringify(err.text));
  const crash = sink();
  const failure = () => { throw new Error('boom\r\nsecond line\n  third'); };
  assert.equal(await cli.main([], { stdout: sink(), stderr: crash, qualify: failure }), 1);
  assert.equal(crash.text, 'FAIL closed: the check itself failed: boom second line third\n');
});

test('a report that cannot be written is still one stderr line: the verdict followed by the write error', async () => {
  const [out, err] = [sink(), sink()];
  const writeFile = () => { throw Object.assign(new Error('EEXIST: file already exists,\r\n  open \'x.json\''), { code: 'EEXIST' }); };
  const code = await cli.main(['--json', 'x.json'], { stdout: out, stderr: err, qualifyOptions: { adapters: fixtureAdapters() }, writeFile, fs: absentFs() });
  assert.equal(code, 2);
  assert.ok(oneLine(err.text), JSON.stringify(err.text));
  assert.match(err.text, /^PASS Edge 156\.0\.4314\.58 .* \| cannot write x\.json: EEXIST: file already exists, open 'x\.json'\n$/);
  assert.equal(JSON.parse(out.text).ok, true);
});

function absentFs() {
  return {
    lstatSync: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    statSync: () => ({ isDirectory: () => true }),
  };
}

test('the verdict shows how many tests each isolated suite ran', () => {
  const suites = [{ file: 'isolated.test.cjs', pass: 8, tests: 8 }, { file: 'loopback.test.cjs', pass: 5, tests: 5 }];
  const pass = {
    ok: true, version: '156.0.4314.58', path: 'C:\\e.exe', major: 156, sha256: 'ab', signature: { publisher: 'Microsoft Corporation' },
    requalification: { ran: true, totals: { pass: 13, tests: 13 }, suites },
  };
  assert.match(cli.verdict(pass), /, isolated suites 13\/13 passed \(isolated\.test\.cjs 8\/8, loopback\.test\.cjs 5\/5\)$/);
  const fail = {
    ok: false, reasons: ['REQUALIFICATION_FAILED: x'],
    requalification: { ran: true, totals: { pass: 12, tests: 13 }, suites: [suites[0], { file: 'loopback.test.cjs', pass: 4, tests: 5 }] },
  };
  assert.equal(cli.verdict(fail), 'FAIL closed: REQUALIFICATION_FAILED: x (isolated suites 12/13 passed: isolated.test.cjs 8/8, loopback.test.cjs 4/5)');
});
