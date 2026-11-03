'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const json = (file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('raw receipts preserve BDD, loadable stub, assertion RED, then IaC N/A ordering', () => {
  const bdd = json('bdd.json');
  const stub = json('stub-load.json');
  const red = json('red.json');
  const iac = json('iac-na.json');
  const green = json('green-model.json');
  assert.ok(bdd.finishedAtUtc <= stub.startedAtUtc);
  assert.ok(stub.finishedAtUtc <= red.startedAtUtc);
  assert.ok(red.finishedAtUtc <= iac.recordedAtUtc);
  assert.ok(iac.recordedAtUtc <= green.startedAtUtc);
  assert.equal(stub.exitCode, 0);
  assert.equal(red.exitCode, 1);
  assert.equal(green.exitCode, 0);
  assert.equal(red.processError, null);
  const raw = fs.readFileSync(path.join(evidence, red.stdout.file));
  assert.equal(hash(raw), red.stdout.sha256);
  assert.equal((raw.toString('utf8').match(/code: 'ERR_ASSERTION'/g) || []).length, 18);
  assert.ok(!/MODULE_NOT_FOUND|ENOENT|SyntaxError|ReferenceError|TypeError/.test(raw.toString('utf8')));
  assert.equal(iac.status, 'N/A');
});

test('historical RED snapshots retain exact bytes and unchanged behavioral assertions', () => {
  const record = json(path.join('red', 'snapshots.json'));
  for (const entry of record.snapshots) {
    const raw = fs.readFileSync(path.join(evidence, 'red', entry.snapshot));
    assert.equal(raw.length, entry.bytes);
    assert.equal(hash(raw), entry.sha256);
    assert.ok(entry.snapshot.endsWith('.snapshot'));
  }
  const canonical = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(
    canonical(path.join(evidence, 'red', 'assertions.source.snapshot')),
    canonical(path.join(__dirname, 'model.test.cjs')),
  );
});

test('the original loadable-stub RED replays in memory with only assertion failures', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const replay = spawnSync(process.execPath, [path.join(__dirname, 'replay-red.cjs')], { encoding: 'utf8', timeout: 15000, env });
  assert.equal(replay.status, 1, replay.stderr);
  assert.equal(replay.error, undefined);
  assert.match(replay.stdout, /# tests 19/);
  assert.match(replay.stdout, /# pass 1/);
  assert.match(replay.stdout, /# fail 18/);
  assert.equal((replay.stdout.match(/code: 'ERR_ASSERTION'/g) || []).length, 18);
  assert.ok(!/MODULE_NOT_FOUND|ENOENT|SyntaxError|ReferenceError|TypeError/.test(replay.stdout + replay.stderr));
});

test('source excerpts preserve original CRLF separately from canonical Git LF', () => {
  const source = json('source-contract.json');
  assert.equal(source.sourceId, 'S053');
  assert.equal(source.parentId, 'D-S053');
  assert.equal(source.packet, 'SC-S053');
  for (const entry of source.sources) {
    const raw = fs.readFileSync(path.join(evidence, entry.snapshot));
    assert.equal(hash(raw), entry.rawSnapshotSha256);
    assert.equal(hash(Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))), entry.canonicalSnapshotSha256);
    assert.equal((raw.toString('utf8').match(/\r\n/g) || []).length, entry.rawCRLFPairs);
    assert.ok(entry.rawCRLFPairs > 0);
  }
});
