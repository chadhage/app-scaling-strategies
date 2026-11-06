'use strict';

// N5 of the second review (L-0141): a guard CLI turns EVERY error into a typed one-line failure with a non-zero exit, whatever
// NODE_OPTIONS=--unhandled-rejections says. qualify.cjs started main() with .then() and no .catch(), and only the check inside
// main() was in a try/catch, so a stdout that throws left an unhandled rejection: a stack trace (default mode) or exit 0 (warn, none).
// The roots point to an empty folder, so the right answer is EDGE_NOT_FOUND with exit 1 and no PowerShell is started.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { scratchDir, removeDir } = require('./harness.cjs');

const CLI = path.join(__dirname, '..', 'qualify.cjs');
const THROWER = path.join(__dirname, 'fixtures', 'stdout-thrower.cjs');
const lines = (text) => (text.trim() === '' ? [] : text.trim().split(/\r?\n/));

function run({ nodeOptions = '', faultStreams = null } = {}) {
  const root = scratchDir();
  try {
    // Windows derives ProgramFiles from ProgramW6432 and adds HomeDrive when they are missing, so both are controlled too.
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !/^(LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|HOMEDRIVE|NODE_OPTIONS|FAULT_STREAMS)$/i.test(key)));
    for (const key of ['LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'HOMEDRIVE']) env[key] = root;
    const options = [faultStreams === null ? '' : `--require="${THROWER.replace(/\\/g, '/')}"`, nodeOptions].filter(Boolean).join(' ');
    if (options !== '') env.NODE_OPTIONS = options;
    if (faultStreams !== null) env.FAULT_STREAMS = faultStreams;
    const result = spawnSync(process.execPath, [CLI], { cwd: root, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(result.error, undefined, 'the command line did not end in time');
    return result;
  } finally {
    removeDir(root);
  }
}

test('control: with no Edge found the command line prints the JSON report, one FAIL closed line and exits 1', () => {
  const result = run();
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).reasonCodes, ['EDGE_NOT_FOUND']);
  const stderr = lines(result.stderr);
  assert.equal(stderr.length, 1, result.stderr);
  assert.match(stderr[0], /^FAIL closed: EDGE_NOT_FOUND: /);
});

for (const [mode, nodeOptions] of [['the default mode', ''], ['--unhandled-rejections=warn', '--unhandled-rejections=warn'], ['--unhandled-rejections=none', '--unhandled-rejections=none']]) {
  test(`a stdout write that throws is a typed one-line failure with exit 1 (${mode})`, () => {
    const result = run({ nodeOptions, faultStreams: 'stdout' });
    assert.equal(result.status, 1, `exit ${result.status}; stderr: ${result.stderr}`);
    assert.equal(result.stdout, '');
    assert.deepEqual(lines(result.stderr), ['FAIL closed: the check itself failed: injected: stdout is broken']);
  });
}

test('when stderr is broken as well the exit code still says failure, nothing hangs and stderr has at most one line', () => {
  const result = run({ faultStreams: 'stdout,stderr' });
  assert.equal(result.status, 1, `exit ${result.status}; stderr: ${result.stderr}`);
  assert.equal(result.stdout, '');
  assert.ok(lines(result.stderr).length <= 1, result.stderr);
});
