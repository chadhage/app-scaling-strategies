'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const redDirectory = path.join(root, 'evidence', 'raw',
  '2026-11-04T09-13-51-497Z-fe622d3a-26eb-4fa4-b02e-28c039fd65a1-recommendation-red');
const red = JSON.parse(fs.readFileSync(path.join(redDirectory, 'record.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readSnapshot = item => zlib.gunzipSync(fs.readFileSync(path.join(repository, item.snapshot)));

test('genuine pre-implementation RED retains all three assertion failures and exact raw streams', () => {
  assert.equal(red.status, 1);
  assert.equal(red.signal, null);
  assert.equal(red.spawnError, null);
  assert.equal(red.rawPreservedWithoutNormalization, true);
  const output = zlib.gunzipSync(fs.readFileSync(path.join(repository, red.streams.stdout.path)));
  assert.equal(hash(output), red.streams.stdout.sha256);
  assert.match(output.toString('utf8'), /# pass 0[\s\S]*# fail 3/);
  assert.match(output.toString('utf8'), /'S150' !== 'S001'/);
  assert.match(output.toString('utf8'), /Missing expected exception/);
  assert.match(output.toString('utf8'), /sequence: 3[\s\S]*sequence: 4/);
  for (const item of red.snapshots) {
    const bytes = readSnapshot(item);
    assert.equal(hash(bytes), item.rawSha256);
    assert.equal(hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))), item.gitCanonicalSha256);
    assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, item.rawCRLF);
  }
});

test('loadable retained stub still reproduces the three historical wrong behaviors, not a relabeled GREEN', () => {
  const item = red.snapshots.find(value => value.path.endsWith('\\recommendation.js'));
  const context = { module: { exports: {} } };
  vm.runInNewContext(readSnapshot(item).toString('utf8'), context);
  const stub = context.module.exports;
  assert.equal(typeof stub.recommend, 'function');
  assert.notEqual(stub.recommend('warm-handoff').suggestedId, 'S001');
  assert.doesNotThrow(() => stub.recommend('shared-preview'));
  assert.notDeepEqual(stub.recommend('warm-handoff'), stub.recommend('warm-handoff'));
  assert.equal(require('../recommendation.js').recommend('warm-handoff').suggestedId, 'S001');
});

for (const item of red.dependencies) {
  test(`unchanged shared provider raw and Git-canonical qualification: ${item.path}`, () => {
    const bytes = fs.readFileSync(path.join(repository, item.path));
    assert.equal(hash(bytes), item.rawSha256);
    const canonical = execFileSync('git', ['--no-pager', 'show', `${item.commit}:${item.path.replaceAll('\\', '/')}`],
      { cwd: repository, encoding: 'buffer' });
    assert.equal(hash(canonical), item.gitCanonicalSha256);
    assert.deepEqual(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')), canonical);
    assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, item.rawCRLF);
  });
}

test('IaC N/A follows the real RED and grants no cloud, packages, parents or companion credits', () => {
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'iac-not-applicable.json')));
  assert.equal(proof.iac, 'not-applicable');
  assert.equal(proof.genuineAssertionsFailed, 3);
  assert.equal(proof.generatedInfrastructure, false);
  assert.equal(proof.installedPackages, false);
  assert.equal(proof.additionalSatisfierCredits, 0);
  assert.equal(proof.parentAndNativeCompletionClaimed, false);
});

test('every captured run retains failures, raw bytes and source snapshots without normalization', () => {
  for (const entry of fs.readdirSync(path.join(root, 'evidence', 'raw'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const recordPath = path.join(root, 'evidence', 'raw', entry.name, 'record.json');
    if (!fs.existsSync(recordPath)) continue;
    const record = JSON.parse(fs.readFileSync(recordPath));
    assert.equal(record.cardId, 'X003');
    assert.equal(record.workerId, 'worker-X003');
    for (const stream of Object.values(record.streams)) {
      const bytes = zlib.gunzipSync(fs.readFileSync(path.join(repository, stream.path)));
      assert.equal(hash(bytes), stream.sha256);
      assert.equal(bytes.length, stream.bytes);
      assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, stream.rawCRLF);
    }
    for (const item of record.snapshots) assert.equal(hash(readSnapshot(item)), item.rawSha256);
  }
});
