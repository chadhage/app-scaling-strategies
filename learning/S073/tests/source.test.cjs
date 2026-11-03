'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file));
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const source = JSON.parse(read('evidence\\source-contract.json'));

test('source provenance preserves raw bytes and separately qualifies immutable Git-source integrity', () => {
  assert.equal(source.exactSourceReadBeforeBehaviorDesign, true);
  assert.ok(source.sourceRow.includes('never silently substitute empty user state'));
  assert.ok(source.backlogRow.includes('empty sessions/profiles are never a successful fallback'));
  assert.ok(source.atomicAndPortableContract.includes('genuine behavioral TDD red'));
  assert.ok(source.atomicAndPortableContract.includes('supports keyboard operation'));
  assert.ok(source.packetRule.includes('every other A/B card belongs to SC-Snnn'));
  for (const file of source.files) {
    const raw = read(file.snapshot);
    const committed = read(file.gitSnapshot);
    assert.equal(raw.length, file.rawBytes);
    assert.equal(sha(raw), file.rawSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), file.rawHasCRLF);
    assert.equal(sha(canonical(raw)), file.canonicalWorkingSha256);
    assert.equal(committed.length, file.gitBytes);
    assert.equal(sha(committed), file.gitSha256);
    assert.equal(canonical(raw).equals(canonical(committed)), file.canonicalWholeFileEqual);
    const blob = spawnSync('git', ['cat-file', 'blob', file.gitBlob], { cwd: repo, encoding: null });
    assert.equal(blob.status, 0);
    assert.deepEqual(blob.stdout, committed);
    assert.equal(file.exactAcceptanceSlicesMatch, true);
  }
});

test('RED is actual assertion failure on a loadable stub, with non-discovered immutable snapshots', () => {
  const red = JSON.parse(read('evidence\\red\\run.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 5);
  assert.equal(red.failed, 5);
  assert.equal(red.assertionFailures, 5);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(sha(read('evidence\\red\\stdout.raw')), red.rawStdoutSha256);
  assert.equal(sha(read('evidence\\red\\stderr.raw')), red.rawStderrSha256);
  for (const snapshot of red.snapshots) {
    assert.ok(snapshot.snapshot.endsWith('.snapshot'));
    assert.equal(sha(read(snapshot.snapshot)), snapshot.sha256);
    assert.equal(read(snapshot.snapshot).length, snapshot.bytes);
  }
  const stub = read('evidence\\red\\model.js.snapshot').toString('utf8');
  const vm = require('node:vm');
  const context = { module: { exports: {} } };
  vm.runInNewContext(stub, context);
  assert.equal(context.module.exports.evaluate({ recovery: 'empty' }).classification, 'SUCCESS');
  assert.match(stub, /STUB_ACCEPTED/);
  assert.equal(JSON.parse(read('evidence\\iac-decision.json')).decision, 'N/A');
});

test('narrow owned attributes preserve raw snapshots and logs without disabling canonical code integrity', () => {
  const files = [
    'evidence\\source\\readme.working.snapshot', 'evidence\\source\\readme.git.snapshot',
    'evidence\\red\\model.js.snapshot', 'evidence\\red\\stdout.raw',
    'evidence\\green\\stdout.raw', 'evidence\\browser\\stdout.raw', 'evidence\\browser\\dom.snapshot',
    'evidence\\browser-final\\stdout.raw', 'evidence\\browser-final\\dom.snapshot',
  ];
  for (const file of files) {
    const result = spawnSync('git', ['check-attr', 'text', '--', `learning\\S073\\${file}`], { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /: text: unset/);
  }
  const code = spawnSync('git', ['check-attr', 'text', 'eol', '--', 'learning\\S073\\model.js'], { cwd: repo, encoding: 'utf8' });
  assert.equal(code.status, 0);
  assert.match(code.stdout, /: text: set/);
  assert.match(code.stdout, /: eol: lf/);
});
