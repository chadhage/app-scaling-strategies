'use strict';

// R3 self-review line 15: every finding of the first review has one test that fails on the OLD bytes. F1, F3, F4 and the
// addendum have theirs (red-02 to red-05). F2 (the evidence recompute skipped every manifest under a raw folder) and the
// documentation findings F6 and F7 had none: this file is their RED (replayed against the first publication's tests\evidence.cjs
// and README.md, retained in evidence\red\old-subject-tests) and their GREEN.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { manifestsUnder, sha, verifyManifest } = require('./evidence.cjs');
const { assert, cleanup, scratch } = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

test('F2 the evidence recompute finds a manifest that lives under a raw folder and names the pinned README byte that was changed', { timeout: 30000 }, () => {
  const dir = scratch();
  try {
    const repository = path.join(dir, 'repo');
    const evidence = path.join(repository, 'evidence');
    fs.mkdirSync(path.join(evidence, 'raw', 'raw'), { recursive: true });
    const readme = Buffer.from('# C043\r\nthe README bytes\r\n');
    fs.writeFileSync(path.join(repository, 'README.md'), readme);
    const stdout = Buffer.from('ok\n');
    const gz = zlib.gzipSync(stdout);
    fs.writeFileSync(path.join(evidence, 'raw', 'raw', 'green-x.stdout.raw.gz'), gz);
    const manifestPath = path.join(evidence, 'raw', 'green-x.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1, name: 'green-x',
      inputs: [{ path: 'README.md', bytes: readme.length, rawSha256: sha(readme), crlfToLfSha256: sha(lf(readme)) }],
      transcripts: { stdout: { path: 'raw/green-x.stdout.raw.gz', gzipSha256: sha(gz), sha256: sha(stdout), bytes: stdout.length } },
    }));
    assert.deepEqual(manifestsUnder(evidence), [manifestPath], 'the manifest under a raw folder is found, not skipped');
    assert.deepEqual(verifyManifest(manifestPath, repository), [], 'the untampered capture verifies');
    fs.writeFileSync(path.join(repository, 'README.md'), Buffer.concat([readme.subarray(0, 4), Buffer.from('X'), readme.subarray(5)]));
    assert.deepEqual(verifyManifest(manifestPath, repository), ['green-x: input README.md differs from the recorded bytes'], 'one README byte is a named failure');
  } finally {
    cleanup(dir);
  }
});

test('F6 the README says that the duration budget restarts on every drive and names the test that proves it', { timeout: 30000 }, () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /the duration budget restarts on every drive/);
  const named = /the duration bound counts the attempt of a resume, not the time before it/;
  assert.match(readme, named);
  assert.match(fs.readFileSync(path.join(__dirname, 'runner.test.cjs'), 'utf8'), named, 'the test the README names exists');
});

test('F7 the README says that a coverage figure is a range, never a pin', { timeout: 30000 }, () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /a figure is a range, never a pin/);
});
