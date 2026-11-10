'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..', 'evidence', 'u054', 'metadata-eol-red-01');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('new metadata-compatibility RED remains a named assertion with exact original and projected stream identities', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const streams = {};
  for (const name of ['stdout', 'stderr']) {
    const row = manifest.streams[name];
    const gzip = fs.readFileSync(path.join(root, row.path));
    const bytes = zlib.gunzipSync(gzip);
    assert.equal(sha(gzip), row.projectedGzipSha256);
    assert.equal(sha(bytes), row.projectedSha256);
    assert.match(row.originalSha256, /^[a-f0-9]{64}$/);
    streams[name] = bytes.toString('utf8');
  }
  assert.deepEqual([manifest.observed.summary.tests, manifest.observed.summary.pass, manifest.observed.summary.fail], [1, 0, 1]);
  assert.equal((streams.stdout.match(/code: 'ERR_ASSERTION'/g) || []).length, 1);
  assert.match(streams.stdout, /TRUSTED_ADDENDUM_CHANGED evidence-index-addendum-1\.json/);
  assert.doesNotMatch(streams.stdout + streams.stderr, /MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
  const snapshot = fs.readFileSync(path.join(root, 'metadata-red.test.snapshot.cjs.txt'));
  assert.equal(sha(snapshot), manifest.inputs.find(row => row.path.endsWith('metadata-red.test.cjs')).rawSha256);
});
