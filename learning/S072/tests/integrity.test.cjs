'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const owned = path.resolve(__dirname, '..');
const repo = path.resolve(owned, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const isRaw = (file) => file.startsWith('evidence\\raw\\') || file.startsWith('evidence\\red\\');
const canonical = (file) => {
  const bytes = fs.readFileSync(path.join(owned, file));
  return isRaw(file) ? bytes : Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
};

function files(directory = owned) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [path.relative(owned, file)];
  }).sort();
}

test('every canonical source and byte-exact raw artifact matches the sealed integrity manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(owned, 'evidence', 'integrity.json'), 'utf8'));
  assert.equal(manifest.algorithm, 'SHA256');
  const expected = files().filter((file) => file !== 'evidence\\integrity.json');
  assert.deepEqual(manifest.files.map((file) => file.path).sort(), expected);
  for (const file of manifest.files) {
    assert.equal(path.isAbsolute(file.path), false);
    assert.equal(file.path.includes('..'), false);
    assert.equal(file.contentMode, isRaw(file.path) ? 'raw-exact' : 'canonical-git-lf', file.path);
    const bytes = canonical(file.path);
    assert.equal(hash(bytes), file.sha256, file.path);
    assert.equal(bytes.length, file.bytes, file.path);
  }
});

test('owned raw provenance and RED snapshots opt out of Git line-ending conversion', () => {
  for (const file of files().filter((file) => file.startsWith('evidence\\raw\\') || file.startsWith('evidence\\red\\'))) {
    const relative = path.join('learning', 'S072', file);
    const result = execFileSync('git', ['check-attr', 'text', 'diff', '--', relative], { cwd: repo, encoding: 'utf8' });
    assert.match(result, /: text: unset(?:\r?\n|$)/);
    assert.match(result, /: diff: unset\s*$/);
  }
});

test('Git canonical source objects agree with qualified LF text and untouched raw CRLF evidence', () => {
  const relative = files();
  const format = execFileSync('git', ['rev-parse', '--show-object-format'], { cwd: repo, encoding: 'utf8' }).trim();
  assert.ok(['sha1', 'sha256'].includes(format));
  for (const file of relative) {
    const bytes = canonical(file);
    const expected = crypto.createHash(format).update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
    const windowsPath = path.join('learning', 'S072', file);
    // Git attribute lookup needs a canonical tree key, separate from the Windows filesystem path.
    const treeKey = windowsPath.replaceAll('\\', '/');
    const object = execFileSync('git', ['hash-object', `--path=${treeKey}`, windowsPath], { cwd: repo, encoding: 'utf8' }).trim();
    assert.equal(object, expected, `canonical Git blob: ${file}`);
  }
});
