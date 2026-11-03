'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(lesson, 'evidence', 'content-index.json'), 'utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const gitObjectId = (bytes) => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const canonical = (entry) => {
  const bytes = fs.readFileSync(path.join(lesson, ...entry.path.split('/')));
  return entry.encoding === 'raw-bytes' ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
};
const git = (args, input) => spawnSync('git', args, { cwd: root, input, encoding: null, maxBuffer: 8 * 1024 * 1024, windowsHide: true });

test('all indexed source and raw evidence hashes match their declared encoding', () => {
  assert.equal(index.cardId, 'A-S088');
  assert.ok(index.files.length >= 25);
  assert.equal(new Set(index.files.map((entry) => entry.path)).size, index.files.length);
  for (const entry of index.files) {
    assert.match(entry.path, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+$/);
    assert.equal(entry.encoding, entry.path.startsWith('evidence/raw/') ? 'raw-bytes' : 'git-lf');
    const bytes = canonical(entry);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
});

test('the index covers the entire owned bundle except explicit self-reference exclusions', () => {
  assert.match(index.selfVerificationRun, /^integrity(?:-\d{3})?$/);
  const selfDirectory = `evidence/raw/runs/${index.selfVerificationRun}/`;
  const selfFiles = ['evidence/content-index.json', `evidence/${index.selfVerificationRun}.json`];
  assert.deepEqual(index.exclusions, [...selfFiles, `${selfDirectory}**`]);
  const actual = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        assert.ok(entry.isFile(), `No symlink or special file: ${file}`);
        const name = path.relative(lesson, file).split(path.sep).join('/');
        if (selfFiles.includes(name) || name.startsWith(selfDirectory)) continue;
        actual.push(name);
      }
    }
  }
  walk(lesson);
  assert.deepEqual(actual.sort(), index.files.map((entry) => entry.path).sort());
});

test('read-only Git clean filters produce the same canonical source and byte-preserved raw objects', () => {
  // Git logical paths must use '/' for attribute matching, including on Windows.
  const names = index.files.map((entry) => `learning/S088/${entry.path}`);
  const result = git(['hash-object', '--stdin-paths'], `${names.join('\n')}\n`);
  assert.equal(result.status, 0, String(result.stderr));
  const hashes = result.stdout.toString('utf8').trim().split(/\r?\n/);
  assert.equal(hashes.length, index.files.length);
  index.files.forEach((entry, position) => assert.equal(hashes[position], gitObjectId(canonical(entry)), entry.path));
});

test('an explicitly selected published Git revision retains every canonical/raw evidence byte', { skip: !process.env.S088_GIT_REV }, () => {
  const revision = process.env.S088_GIT_REV;
  assert.match(revision, /^[a-f0-9]{40}$/);
  const refs = index.files.map((entry) => `${revision}:learning/S088/${entry.path}`);
  const result = git(['cat-file', '--batch'], `${refs.join('\n')}\n`);
  assert.equal(result.status, 0, String(result.stderr));
  let offset = 0;
  for (const entry of index.files) {
    const end = result.stdout.indexOf(10, offset);
    const header = result.stdout.subarray(offset, end).toString('utf8');
    assert.match(header, /^[a-f0-9]{40} blob \d+$/);
    const size = Number(header.split(' ')[2]);
    offset = end + 1;
    const bytes = result.stdout.subarray(offset, offset + size);
    assert.equal(size, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
    offset += size + 1;
  }
  assert.equal(offset, result.stdout.length);
});
