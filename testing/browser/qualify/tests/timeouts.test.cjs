'use strict';

// N3 of the second review: the shell start (60 s) and the outer bound (90 s) were too tight for the worst moments of a shared
// machine and could only be changed in the API, with two coupled knobs. The defaults are larger and coherent (the shell
// bound stays below the outer bound), ONE override (option, command-line flag, environment variable) drives both, and a
// timeout can only ever make a check fail, never pass.
const assert = require('node:assert/strict');
const test = require('node:test');
const adapters = require('../adapters.cjs');
const qualify = require('../qualify.cjs');
const cli = require('../cli.cjs');
const { fixtureAdapters } = require('./support.cjs');
const { fakeShell } = require('./harness.cjs');

// The fake shell hangs, but ends itself with exit code 3 after 12 s, so a missing bound shows up as a wrong reason, not as a leftover process.
const HANG = 'setTimeout(() => process.exit(3), 12000); setInterval(() => {}, 1000)';
const LIMIT = { timeout: 30000 };
const noShellAdapters = () => {
  const { signature, fileVersion, ...rest } = fixtureAdapters();
  return rest;
};
const sink = () => ({ text: '', write(chunk) { this.text += chunk; } });
const resolve = (options, env) => {
  assert.equal(typeof qualify.resolveTimeouts, 'function', 'qualify.resolveTimeouts is missing');
  return qualify.resolveTimeouts(options, env);
};

test('the defaults are 240 s for every adapter call and 180 s for one PowerShell start, and the shell bound is the smaller one', () => {
  assert.equal(qualify.DEFAULT_TIMEOUT_MS, 240000);
  assert.equal(adapters.SHELL_TIMEOUT_MS, 180000);
  assert.ok(adapters.SHELL_TIMEOUT_MS < qualify.DEFAULT_TIMEOUT_MS);
  assert.equal(qualify.TIMEOUT_ENV, 'QUALIFY_TIMEOUT_MS');
  assert.equal(qualify.MAX_TIMEOUT_MS, 1800000);
  assert.deepEqual(resolve({}, {}), { ok: true, timeoutMs: 240000, shellTimeoutMs: 180000 });
});

test('one knob drives both bounds: the shell bound is 75 percent of the outer bound, an explicit shell bound may only be smaller', () => {
  assert.deepEqual(resolve({ timeoutMs: 8000 }, {}), { ok: true, timeoutMs: 8000, shellTimeoutMs: 6000 });
  assert.deepEqual(resolve({ timeoutMs: 8000, shell: { timeoutMs: 2000 } }, {}), { ok: true, timeoutMs: 8000, shellTimeoutMs: 2000 });
  assert.deepEqual(resolve({ timeoutMs: 8000, shell: { timeoutMs: 7900 } }, {}), { ok: true, timeoutMs: 8000, shellTimeoutMs: 6000 });
  assert.deepEqual(resolve({ timeoutMs: 1 }, {}), { ok: true, timeoutMs: 1, shellTimeoutMs: 1 });
});

test('the environment variable QUALIFY_TIMEOUT_MS sets the same two bounds, an option wins over it, and the name is case-insensitive', () => {
  assert.deepEqual(resolve({}, { QUALIFY_TIMEOUT_MS: '8000' }), { ok: true, timeoutMs: 8000, shellTimeoutMs: 6000 });
  assert.deepEqual(resolve({}, { qualify_timeout_ms: '12000' }), { ok: true, timeoutMs: 12000, shellTimeoutMs: 9000 });
  assert.deepEqual(resolve({ timeoutMs: 4000 }, { QUALIFY_TIMEOUT_MS: '8000' }), { ok: true, timeoutMs: 4000, shellTimeoutMs: 3000 });
});

test('a value that is not an integer number of milliseconds from 1 to 1800000 is refused by name, never guessed', () => {
  for (const bad of ['', 'abc', '0', '-5', '1.5', '1e3', ' 8000', '8000 ', '0x10', '1800001', '99999999999', '８０００']) {
    const result = resolve({}, { QUALIFY_TIMEOUT_MS: bad });
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.match(result.error, /^QUALIFY_TIMEOUT_MS must be an integer number of milliseconds from 1 to 1800000/, JSON.stringify(bad));
  }
  for (const bad of [0, -1, NaN, Infinity, 1.5, '5000', 1800001, null]) {
    const result = resolve({ timeoutMs: bad }, {});
    assert.equal(result.ok, false, String(bad));
    assert.match(result.error, /^options\.timeoutMs must be an integer number of milliseconds from 1 to 1800000/, String(bad));
  }
  for (const bad of [0, -1, NaN, '100', 1.5]) {
    const result = resolve({ timeoutMs: 5000, shell: { timeoutMs: bad } }, {});
    assert.equal(result.ok, false, String(bad));
    assert.match(result.error, /^options\.shell\.timeoutMs must be an integer number of milliseconds from 1 to 1800000/, String(bad));
  }
});

test('an invalid timeout is a typed failure before anything is asked, and no timeout ever makes a check pass', LIMIT, async () => {
  let asked = 0;
  const spy = fixtureAdapters({ candidates: () => { asked += 1; return []; } });
  const report = await qualify.qualifyEdge({ timeoutMs: 0, adapters: spy });
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['QUALIFY_TIMEOUT_INVALID']);
  assert.match(report.reasons[0], /^QUALIFY_TIMEOUT_INVALID: options\.timeoutMs must be an integer number of milliseconds/);
  assert.equal(asked, 0);
  const env = await qualify.qualifyEdge({ env: { QUALIFY_TIMEOUT_MS: 'soon' }, adapters: spy });
  assert.deepEqual(env.reasonCodes, ['QUALIFY_TIMEOUT_INVALID']);
  assert.equal(asked, 0);
});

test('the option shortens both waits: a hung shell is ended at 75 percent of the outer bound and both answers time out', LIMIT, async () => {
  const report = await qualify.qualifyEdge({ timeoutMs: 2000, shell: fakeShell(HANG), adapters: noShellAdapters() });
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['SIGNATURE_TIMEOUT', 'VERSION_TIMEOUT']);
  assert.match(report.reasons[0], /the shell did not answer within 1500 ms and was ended/);
});

test('an explicit shell bound below the outer bound is kept, one above it is clamped so that the outer bound never fires first', LIMIT, async () => {
  const small = await qualify.qualifyEdge({ timeoutMs: 3000, shell: { ...fakeShell(HANG), timeoutMs: 400 }, adapters: noShellAdapters() });
  assert.match(small.reasons[0], /the shell did not answer within 400 ms and was ended/);
  const large = await qualify.qualifyEdge({ timeoutMs: 2000, shell: { ...fakeShell(HANG), timeoutMs: 60000 }, adapters: noShellAdapters() });
  assert.match(large.reasons[0], /the shell did not answer within 1500 ms and was ended/);
});

test('the environment variable reaches the PowerShell bound through qualifyEdge()', LIMIT, async () => {
  const report = await qualify.qualifyEdge({ env: { QUALIFY_TIMEOUT_MS: '2000' }, shell: fakeShell(HANG), adapters: noShellAdapters() });
  assert.match(report.reasons[0], /the shell did not answer within 1500 ms and was ended/);
});

test('the command line has one flag, --timeout-ms <n>, that is validated and handed to the check and to the requalification', async () => {
  const parsed = cli.parseArgs(['--timeout-ms', '12000', '--requalify']);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.options.timeoutMs, 12000);
  assert.equal(cli.parseArgs([]).options.timeoutMs, null);
  for (const argv of [['--timeout-ms'], ['--timeout-ms', '--requalify'], ['--timeout-ms', 'abc'], ['--timeout-ms', '0'], ['--timeout-ms', '1800001'], ['--timeout-ms', '5', '--timeout-ms', '6']]) {
    const bad = cli.parseArgs(argv);
    assert.equal(typeof bad.error, 'string', argv.join(' '));
    assert.match(bad.error, /--timeout-ms/, argv.join(' '));
  }
  const seen = [];
  const report = { ok: true, version: '1.0.0.0', path: 'p', major: 1, sha256: 's', signature: { publisher: 'Microsoft Corporation' } };
  const io = (extra) => ({ stdout: sink(), stderr: sink(), qualifyOptions: { marker: 1 }, qualify: async (options) => { seen.push(options); return report; }, requalify: async (options) => { seen.push(options.qualifyOptions); return report; }, ...extra });
  assert.equal(await cli.main(['--timeout-ms', '9000'], io()), 0);
  assert.equal(await cli.main(['--requalify', '--timeout-ms', '9000'], io()), 0);
  assert.equal(await cli.main([], io()), 0);
  assert.deepEqual(seen, [{ marker: 1, timeoutMs: 9000 }, { marker: 1, timeoutMs: 9000 }, { marker: 1 }]);
});
