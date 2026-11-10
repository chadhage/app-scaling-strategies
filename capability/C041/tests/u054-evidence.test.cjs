'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..', 'evidence', 'u054');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const names = ['red-02', 'producer-seal-red-01', 'consumer-control-01', 'consumer-pin-red-01', 'consumer-scope-red-01'];

function capture(name, read = file => fs.readFileSync(file)) {
  const directory = path.join(root, name);
  const manifest = JSON.parse(read(path.join(directory, 'manifest.json')));
  const streams = {};
  for (const stream of ['stdout', 'stderr']) {
    const row = manifest.streams[stream];
    const bytes = read(path.join(directory, row.path));
    assert.equal(sha(bytes), row.projectedGzipSha256, `${name}: ${stream} projected gzip`);
    const projected = zlib.gunzipSync(bytes);
    assert.equal(sha(projected), row.projectedSha256, `${name}: ${stream} projected content`);
    assert.equal(projected.length, row.projectedBytes);
    assert.match(row.originalSha256, /^[a-f0-9]{64}$/);
    assert.match(row.originalGzipSha256, /^[a-f0-9]{64}$/);
    streams[stream] = projected.toString('utf8');
  }
  assert.equal(manifest.representation, 'Path-only projection; NOT original raw output');
  assert.equal(manifest.observed.timedOut, false);
  assert.equal(manifest.observed.exitCode, manifest.observed.expectedExitCode);
  return { manifest, ...streams };
}

test('every projected capture is distinguished from immutable private originals and rehashed after decoding', () => {
  assert.equal(names.length, 5);
  for (const name of names) {
    const checked = capture(name);
    for (const [key, value] of Object.entries(checked.manifest.observed.summary)) {
      if (['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].includes(key)) {
        assert.match(checked.stdout, new RegExp(`^# ${key} ${value}$`, 'm'), `${name}: ${key}`);
      }
    }
    assert.equal(checked.manifest.observed.summary.cancelled, 0);
    assert.equal(checked.manifest.observed.summary.skipped, 0);
    assert.equal(checked.manifest.observed.summary.todo, 0);
  }
});

test('retained actual LF RED has 35 named assertions, actual asset mismatches and both actual startup failures', () => {
  const { manifest, stdout, stderr } = capture('red-02');
  assert.deepEqual([manifest.observed.summary.tests, manifest.observed.summary.pass, manifest.observed.summary.fail], [44, 9, 35]);
  assert.equal((stdout.match(/code: 'ERR_ASSERTION'/g) || []).length, 35);
  assert.match(stdout, /Pinned lesson asset integrity mismatch/);
  assert.match(stdout, /not ok \d+ - C041 actual service starts/);
  assert.match(stdout, /not ok \d+ - current accepted C059 actual service starts/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
  const bytes = fs.readFileSync(path.join(root, 'red-02', 'u054-assets.test.snapshot.cjs.txt'));
  assert.equal(sha(bytes), '862b25a111ae5e87ed7fdba295eafe04daa20e8b12dfaa54d62162b549ef1345');
  assert.equal(manifest.inputs.find(row => row.path.endsWith('tests\\u054-assets.test.cjs')).rawSha256, sha(bytes));
  const active = fs.readFileSync(path.resolve(__dirname, 'u054-assets.test.cjs'));
  assert.deepEqual(Buffer.from(active.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'), bytes);
});

test('sealed-source and real consumer failures are retained, never silently relabelled GREEN', () => {
  for (const [name, expected] of [
    ['producer-seal-red-01', [14, 12, 2]],
    ['consumer-control-01', [6, 6, 0]],
    ['consumer-pin-red-01', [6, 2, 4]],
    ['consumer-scope-red-01', [3, 0, 3]]
  ]) {
    const { manifest, stdout } = capture(name);
    assert.deepEqual([manifest.observed.summary.tests, manifest.observed.summary.pass, manifest.observed.summary.fail], expected);
    if (expected[2]) assert.equal((stdout.match(/code: 'ERR_ASSERTION'/g) || []).length, expected[2], name);
  }
  const scope = capture('consumer-scope-red-01').stdout;
  assert.match(scope, /CHANGED capability/);
  assert.match(scope, /accepted-catalog\.js/);
  assert.match(scope, /serve\.cjs/);
  assert.match(scope, /No silent repinning is allowed/);
});

test('projected evidence rejects a changed stream and an altered recorded count BY NAME', () => {
  const directory = path.join(root, 'red-02');
  const streamFile = path.join(directory, 'stdout.projected.gz');
  assert.throws(() => capture('red-02', file => file === streamFile
    ? Buffer.concat([fs.readFileSync(file), Buffer.from('edited')]) : fs.readFileSync(file)),
  /red-02: stdout projected gzip/);
  const checked = capture('red-02');
  assert.doesNotMatch(checked.stdout, /^# fail 0$/m);
  assert.match(checked.stdout, /^# fail 35$/m);
});

test('all added public files and decoded projections avoid local user-folder and session-state paths', () => {
  for (const name of names) {
    const checked = capture(name);
    const text = JSON.stringify(checked.manifest) + checked.stdout + checked.stderr;
    assert.doesNotMatch(text, /[A-Za-z]:[\\/]+Users[\\/]+|\.copilot[\\/]+session-state/i);
  }
});
