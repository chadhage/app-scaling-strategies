'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const authority = require('./u053-authority.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const cache = new Map();
const read = (file) => {
  if (!cache.has(file)) cache.set(file, authority.readOwn(repository, file));
  return cache.get(file);
};
const chain = authority.readCurrentAuthority(root);
const history = JSON.parse(read('capability\\C009\\evidence\\u053-cleanbase\\history-index.json'));

function transportProblems(record, reader = read) {
  const problems = [];
  const sourceBytes = reader(record.sourceManifest.path);
  if (authority.sha(sourceBytes) !== record.originalManifestSha256) problems.push('source manifest bytes');
  const original = JSON.parse(sourceBytes);
  for (const stream of ['stdout', 'stderr']) {
    const entry = record.streams[stream];
    if (entry.kind !== 'explicit-portable-projection-not-original-raw') problems.push(`${stream}: projection kind`);
    const bytes = reader(entry.projectedPath);
    if (bytes.length !== entry.projectedBytes || authority.sha(bytes) !== entry.projectedSha256) problems.push(`${stream}: projected bytes`);
    if (entry.originalPrivateRawSha256 !== original.transcripts[stream].sha256 ||
        entry.originalPrivateGzipSha256 !== original.transcripts[stream].gzipSha256 ||
        entry.originalPrivateRawBytes !== original.transcripts[stream].bytes) problems.push(`${stream}: original raw pin`);
  }
  return problems;
}

test('fresh f95 authority pins all accepted bytes and all 179 actually consumed pristine third-fix/superseded inputs', () => {
  assert.equal(chain.catalog.files.length, 427);
  assert.ok(authority.checkCurrent({ chain, read }) >= 427);
  assert.equal(authority.checkSubjects({ chain, read }), 179);
  assert.equal(chain.subjects.size, 5);
  assert.equal(history.privateDraftsAndIncorrectProbePublished, false);
  assert.equal(chain.catalog.production.length, 11);
});

for (const item of history.records) {
  test(`historical transport ${item.name}: immutable source manifest and explicit projection pins, never projected bytes called raw`, () => {
    const record = JSON.parse(read(item.path));
    assert.deepEqual(transportProblems(record), [], item.name);
    const changed = Buffer.from(read(record.streams.stdout.projectedPath));
    changed[Math.floor(changed.length / 2)] ^= 0xff;
    assert.match(transportProblems(record, (file) => file === record.streams.stdout.projectedPath ? changed : read(file)).join('\n'), /stdout: projected bytes/);
    const forged = structuredClone(record);
    forged.streams.stdout.originalPrivateRawSha256 = '0'.repeat(64);
    assert.match(transportProblems(forged).join('\n'), /stdout: original raw pin/);
  });
}

const loops = [
  ['loop-resources-attempt1', 'resources', 5], ['loop-resources-attempt2', 'resources', 19],
  ['resources-final', 'resources', 4], ['refusal-flood-final', 'refusal-flood', 64], ['pipeline-process-final', 'pipeline-process', 63],
  ['pipeline-refusal-mixed-final', 'pipeline-refusal-mixed', 21], ['pipeline-refusal-http10-final', 'pipeline-refusal-http10', 15]
];
for (const [name, family, bad] of loops) {
  test(`actual retained load figures ${name}: ${bad} bad of 64, not a passing load capture`, () => {
    const record = JSON.parse(read(history.records.find((entry) => entry.name === name).path));
    const text = read(record.streams.stdout.projectedPath).toString('utf8');
    const summary = new RegExp(`FLAKE HUNT ${family}\\.test\\.cjs: (\\d+) bad of (\\d+)`).exec(text);
    assert.ok(summary);
    assert.deepEqual(summary.slice(1).map(Number), [bad, 64]);
    const failures = text.split(/\r?\n/).filter((line) => line.startsWith('BAD '));
    assert.equal(failures.length, bad);
    if (name.endsWith('-final')) for (const line of failures) {
      const reasons = JSON.parse(line.slice(line.indexOf('why=') + 4));
      assert.ok(reasons.some((reason) => /test timed out after 60000ms/.test(reason)));
      assert.ok(reasons.every((reason) => /^'test (?:timed out after \d+ms|did not finish before its parent and was cancelled|could not be started because its parent finished)'$/.test(reason)));
    }
  });
}

module.exports = Object.freeze({ transportProblems });
