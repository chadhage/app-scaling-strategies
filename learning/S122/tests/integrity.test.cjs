'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));
function gitHash(bytes, relative, noFilters = false) {
  const indexPath = path.posix.join('learning', 'S122', ...relative.split('\\'));
  const run = spawnSync('git', [
    'hash-object', '--stdin', ...(noFilters ? ['--no-filters'] : ['--path', indexPath]),
  ], { cwd: repo, input: bytes, maxBuffer: 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString('utf8'));
  return run.stdout.toString('utf8').trim();
}
function files(directory = root, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}\\${entry.name}` : entry.name;
    if (relative === 'result.json' || relative === 'evidence\\integrity.json' || relative === 'evidence\\seals') return [];
    return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}

test('active integrity seal is byte-addressed and normal verification is read-only', () => {
  const pointer = json('evidence\\integrity.json');
  assert.equal(pointer.cardId, 'A-S122');
  assert.equal(pointer.normalVerificationReadOnly, true);
  const bytes = read(pointer.activeSeal);
  assert.equal(bytes.length, pointer.bytes);
  assert.equal(sha(bytes), pointer.sha256);
  const seal = JSON.parse(bytes);
  assert.equal(seal.cardId, 'A-S122');
  assert.equal(seal.workerId, 'worker-A-S122');
  assert.equal(seal.seal, pointer.activeSeal);
  assert.equal(seal.sourceFiles, pointer.sourceFiles);
  assert.equal(seal.proofFiles, pointer.proofFiles);
  assert.deepEqual(seal.entries.map((entry) => entry.path).sort(), files(), 'no omitted executable or behavioral proof files');
});

test('all sealed source and historical proof raw bytes and canonical Git identities match', () => {
  const seal = json(json('evidence\\integrity.json').activeSeal);
  for (const entry of seal.entries) {
    const bytes = read(entry.path);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.rawSha256, `${entry.path}: exact executed/proof bytes changed`);
    assert.equal(gitHash(bytes, entry.path, true), entry.rawGitBlobSha1, `${entry.path}: raw Git blob`);
    assert.equal(gitHash(bytes, entry.path), entry.canonicalGitBlobSha1, `${entry.path}: canonical Git blob`);
  }
});

test('raw CRLF changes cannot hide behind equivalent canonical source Git blobs', () => {
  const lf = Buffer.from('const teaching = true;\n');
  const crlf = Buffer.from('const teaching = true;\r\n');
  assert.notEqual(sha(lf), sha(crlf), 'raw execution bytes differ');
  assert.notEqual(gitHash(lf, 'model.js', true), gitHash(crlf, 'model.js', true));
  assert.equal(gitHash(lf, 'model.js'), gitHash(crlf, 'model.js'), 'declared LF source normalization is a separate identity');
  assert.notEqual(
    gitHash(lf, 'evidence\\raw\\model-red-001.stdout.raw'),
    gitHash(crlf, 'evidence\\raw\\model-red-001.stdout.raw'),
    'raw proof attributes must preserve CRLF rather than normalize it',
  );
});

test('narrow raw attributes preserve RED snapshots, outputs and browser proof without changing root', () => {
  const samples = [
    'evidence\\red\\model-red-001--model.js.source',
    'evidence\\raw\\model-red-001.stdout.raw',
    'evidence\\browser\\capture-001.json',
  ];
  for (const sample of samples) {
    const run = spawnSync('git', ['check-attr', 'text', 'diff', '--', `learning\\S122\\${sample}`], { cwd: repo });
    assert.equal(run.status, 0);
    assert.match(run.stdout.toString('utf8'), /text: unset/);
    assert.match(run.stdout.toString('utf8'), /diff: unset/);
  }
  assert.equal(json('manifest.json').testing.verificationIsReadOnly, true);
});
