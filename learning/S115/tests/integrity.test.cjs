'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function filesAt(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), 'lesson integrity does not follow links');
    return entry.isDirectory() ? filesAt(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}

test('canonical LF source integrity and raw evidence bytes have separate complete coverage', () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'content-index.json'), 'utf8'));
  assert.equal(index.cardId, 'A-S115');
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.excludedSelf, 'evidence/content-index.json');
  const actual = filesAt(root).filter((name) => name !== index.excludedSelf);
  assert.deepEqual(index.files.map((file) => file.path).sort(), actual);
  assert.equal(new Set(index.files.map((file) => file.path)).size, index.files.length);
  for (const file of index.files) {
    assert.ok(!file.path.includes('..') && !file.path.includes('\\') && !path.isAbsolute(file.path));
    const bytes = fs.readFileSync(path.join(root, ...file.path.split('/')));
    const expectedMode = file.path.startsWith('evidence/raw/') ? 'raw-bytes' : 'canonical-utf8-lf';
    assert.equal(file.mode, expectedMode);
    const content = file.mode === 'raw-bytes' ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    assert.equal(content.length, file.bytes, file.path);
    assert.equal(hash(content), file.sha256, file.path);
  }
});

test('browser evidence binds only the exact published isolated helper and approved offline tooling', () => {
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(hash(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browserFiles = filesAt(path.join(root, 'evidence')).filter((name) => /^browser-observed-.*\.json$/.test(name));
  assert.ok(browserFiles.length >= 1, 'actual successful browser observations are required, not skipped');
  for (const name of browserFiles) {
    const evidence = JSON.parse(fs.readFileSync(path.join(root, 'evidence', name), 'utf8'));
    assert.equal(evidence.result, 'passed');
    assert.equal(evidence.cardId, 'A-S115');
    assert.equal(evidence.helperSha256, hash(helper));
    assert.equal(evidence.helperRevision, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
    assert.equal(evidence.playwrightVersion, '1.56.1');
    assert.match(evidence.browserVersion, /^156\./);
    assert.equal(evidence.captureEnvironment, 'CAPTURE_BROWSER_EVIDENCE=1');
    assert.equal(evidence.awaitedFinallyClose, true);
    assert.equal(evidence.ownedFilesUnchangedBeforeCapture, true);
    assert.equal(evidence.nativeProof, false);
    assert.ok(evidence.observations.every((observation) => observation.passed));
    assert.equal(evidence.observationCount, evidence.observations.length);
    assert.ok(evidence.observationCount >= 13);
  }
});
