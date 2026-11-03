'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..', '..');
const indexPath = path.join(__dirname, 'evidence', 'content-index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const listed = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && file !== indexPath) listed.push(path.relative(repo, file));
    else if (!entry.isFile()) throw new Error('Lesson integrity does not accept links or non-file entries.');
  }
}
walk(__dirname);
assert.equal(index.cardId, 'A-S103');
assert.deepEqual(index.files.map((entry) => entry.file).sort(), listed.sort());
for (const entry of index.files) {
  assert.ok(entry.file.startsWith(`learning${path.sep}S103${path.sep}`));
  assert.ok(!entry.file.split(path.sep).includes('..'));
  const file = path.join(repo, entry.file);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, entry.bytes, `${entry.file} byte length`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.rawSHA256, `${entry.file} original working-tree bytes`);
  const canonical = execFileSync('git', ['hash-object', `--path=${entry.gitPath}`, file], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.equal(canonical, entry.canonicalGitBlobSHA1, `${entry.file} canonical Git-filtered blob`);
}
assert.equal(index.files.find((entry) => entry.file.endsWith(`red${path.sep}behavior.tap`)).rawSHA256, '99a2ffb3b5b45d9f1c5c881db551706c22b6fca4eaaa3f60f00829123a7edc97');
console.log(JSON.stringify({ cardId: 'A-S103', outcome: 'passed', files: index.files.length, rawBytesPreserved: true, canonicalGitQualifiedSeparately: true, writes: 0 }));
