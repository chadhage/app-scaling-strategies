'use strict';

// Controller rule 15 (no local identifiers in new files) for the REDs of the fourth fix: a failing assertion prints the absolute path of the test file in
// its location and stack lines, so the transcripts of the three REDs of the third fix carry the local Windows user name. The recorder of the fourth fix runs
// its REDs through fixtures\sanitized-tap.cjs, node:test's own tap reporter with every absolute path of the machine replaced. This file proves, with a real
// failing test in a scratch folder, that the output is still the TAP the checks read and that no path, home folder or user name survives.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const s = require('./support.cjs');
const sanitized = require('./fixtures/sanitized-tap.cjs');

// On Windows node accepts a reporter module as a relative path (the recorder runs from the repository root) or as a file: URL, never as an absolute path.
const reporter = pathToFileURL(path.join(__dirname, 'fixtures', 'sanitized-tap.cjs')).href;
const user = os.userInfo().username;

test('clean() replaces the repository root, the home folder and the user name in every spelling the output uses', () => {
  const repo = path.resolve(s.root, '..', '..');
  const samples = [
    `location: '${repo.replaceAll('\\', '\\\\')}\\\\capability\\\\x.test.cjs:3:1'`,
    `at TestContext.<anonymous> (${repo}\\capability\\C017\\tests\\x.test.cjs:30:10)`,
    `file:///${repo.replaceAll('\\', '/')}/capability/x.test.cjs`,
    `${os.homedir()}\\AppData\\Local\\Temp\\x`,
    `${os.homedir().replaceAll('\\', '/').toUpperCase()}/x`,
  ];
  for (const sample of samples) {
    const cleaned = sanitized.clean(sample);
    assert.doesNotMatch(cleaned, new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${sample} -> ${cleaned}`);
    assert.match(cleaned, /<REPO>|<HOME>/);
  }
  assert.equal(sanitized.clean('not ok 1 - a test name\n# fail 1'), 'not ok 1 - a test name\n# fail 1', 'text without a path is untouched');
});

test('a real failing test run through the reporter is valid TAP (not ok, the summary lines) and carries no path of this machine', async (t) => {
  const made = s.scratch('san');
  t.after(() => made.remove());
  const file = path.join(made.dir, 'failing.test.cjs');
  fs.writeFileSync(file, "const test = require('node:test');\nconst assert = require('node:assert/strict');\ntest('a failing row', () => { assert.equal(1, 2); });\ntest('a passing row', () => {});\n");
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS', 'C017_OVERLAY']) delete env[name];
  const child = spawn(process.execPath, ['--test', `--test-reporter=${reporter}`, file], { cwd: made.dir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (part) => { out += part; });
  child.stderr.on('data', () => {});
  const code = await new Promise((resolve) => { child.once('exit', resolve); });
  assert.equal(code, 1, 'the failing row fails the run');
  const text = out.replace(/\r\n/g, '\n');
  assert.match(text, /^not ok \d+ - a failing row$/m);
  assert.match(text, /^ok \d+ - a passing row$/m);
  assert.match(text, /^# tests 2$/m);
  assert.match(text, /^# fail 1$/m);
  assert.match(text, /<REPO>|<HOME>/, 'the stack of the failing assertion names the test file through a placeholder');
  assert.doesNotMatch(text, new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'the user name is nowhere in the transcript');
  assert.doesNotMatch(text, /[A-Za-z]:\\\\?Users/i, 'no profile path is left');
});
