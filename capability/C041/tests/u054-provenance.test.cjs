'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

test('historical RED input stays raw-exact while the current policy test uses its explicit approved source form', () => {
  const original = fs.readFileSync(path.join(root, 'evidence', 'u054', 'policy-test-original.snapshot'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red-run.json')));
  const current = fs.readFileSync(path.join(root, 'tests', 'policy.test.cjs'));
  assert.equal(sha(original), manifest.testSha256);
  assert.deepEqual(lf(current), lf(original));
  const changed = Buffer.from(current); changed[changed.length >> 1] ^= 1;
  assert.notDeepEqual(lf(changed), lf(original), 'a changed source byte cannot pass the form bridge');
});

test('the first full LF source refusal is preserved as 117 passes and one genuine assertion, never as GREEN', () => {
  const directory = path.join(root, 'evidence', 'u054', 'final-lf-02');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
  assert.deepEqual([manifest.observed.summary.tests, manifest.observed.summary.pass, manifest.observed.summary.fail], [118, 117, 1]);
  assert.deepEqual([manifest.observed.expectedExitCode, manifest.observed.exitCode, manifest.observed.timedOut], [0, 1, false]);
  const stream = manifest.streams.stdout;
  const gzip = fs.readFileSync(path.join(directory, stream.path));
  const bytes = zlib.gunzipSync(gzip);
  assert.equal(sha(gzip), stream.projectedGzipSha256);
  assert.equal(sha(bytes), stream.projectedSha256);
  assert.equal((bytes.toString('utf8').match(/code: 'ERR_ASSERTION'/g) || []).length, 1);
  assert.match(bytes.toString('utf8'), /authentic archived RED is loadable/);
  assert.doesNotMatch(bytes.toString('utf8'), /MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
});
