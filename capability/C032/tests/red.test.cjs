'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const redRoot = path.join(root, 'evidence', 'red');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshot = path.join('capability', 'C032', 'evidence', 'red', 'server.initial.snapshot.cjs');

// A nested node --test started inside a test inherits NODE_TEST_CONTEXT and exits 0 even on failure (L-0002), so it is deleted.
// Deleting NODE_V8_COVERAGE does not stop it: Node re-injects it into children while coverage is on; an empty value does.
function nested(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv, NODE_V8_COVERAGE: '' };
  for (const name of ['NODE_TEST_CONTEXT', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  if (extraEnv.C032_TEST_SUBJECT === undefined) delete env.C032_TEST_SUBJECT;
  return spawnSync(process.execPath, ['--test', snapshot], { cwd: repository, env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
}

const archives = fs.readdirSync(redRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('behavioral-red-'));

test('exactly one immutable behavioral RED archive exists and records raw output, exit code and input hashes', () => {
  assert.equal(archives.length, 1);
  const directory = path.join(redRoot, archives[0].name);
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'));
  assert.equal(record.exitCode, 1);
  assert.equal(record.signal, null);
  assert.equal(record.error, null);
  assert.equal(record.testSubjectOverride, '.\\server.stub.cjs');
  const stdout = gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz')));
  const stderr = gunzipSync(fs.readFileSync(path.join(directory, 'stderr.raw.gz')));
  assert.equal(sha256(stdout), record.stdoutSha256);
  assert.equal(sha256(stderr), record.stderrSha256);
  assert.equal(stderr.length, 0);
  const text = stdout.toString('utf8');
  assert.equal(text.match(/^not ok \d+ - /gm).length, 8);
  assert.equal(text.match(/^ok \d+ - /gm).length, 1);
  assert.equal(text.match(/name: 'AssertionError'/g).length, 8, 'every failure is an assertion about behavior');
  assert.doesNotMatch(text, /Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/);
  for (const input of record.inputs.filter((item) => /feature$|red[\\/]/.test(item.path))) {
    assert.equal(sha256(fs.readFileSync(path.join(repository, input.path))), input.sha256, `${input.path} is byte-identical to the archived RED input`);
  }
  assert.equal(record.inputs.filter((item) => /feature$|red[\\/]/.test(item.path)).length, 3);
});

test('replaying the retained RED against the naive stub still fails for behavioral reasons only', () => {
  const run = nested({ C032_TEST_SUBJECT: '.\\server.stub.cjs' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^# pass 1$/m);
  assert.match(run.stdout, /^# fail 8$/m);
  assert.equal(run.stdout.match(/name: 'AssertionError'/g).length, 8);
  assert.doesNotMatch(run.stdout + run.stderr, /Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError/);
});

test('the same initial specification passes against the real implementation', () => {
  const run = nested();
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /^# pass 9$/m);
  assert.match(run.stdout, /^# fail 0$/m);
});
