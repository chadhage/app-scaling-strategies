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
const blobId = (bytes) => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const canonical = (entry) => {
  const bytes = fs.readFileSync(path.join(lesson, ...entry.path.split('/')));
  return entry.encoding === 'raw-bytes' ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
};
const git = (args, input) => spawnSync('git', args, { cwd: root, input, encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });

test('every indexed owned source and raw capture matches its qualified hash and byte count', () => {
  assert.equal(index.cardId, 'A-S091');
  assert.ok(index.files.length >= 30);
  assert.equal(new Set(index.files.map((item) => item.path)).size, index.files.length);
  for (const item of index.files) {
    assert.match(item.path, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+$/);
    assert.equal(item.encoding, item.path.startsWith('evidence/raw/') ? 'raw-bytes' : 'git-lf');
    const bytes = canonical(item);
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(sha(bytes), item.sha256, item.path);
  }
});

test('the index covers the entire owned namespace except explicit self-reference exclusions', () => {
  assert.match(index.selfVerificationRun, /^integrity(?:-\d{3})?$/);
  const selfDirectory = `evidence/raw/runs/${index.selfVerificationRun}/`;
  const excluded = ['evidence/content-index.json', `evidence/${index.selfVerificationRun}.json`];
  assert.deepEqual(index.exclusions, [...excluded, `${selfDirectory}**`]);
  const names = [];
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) walk(file);
      else {
        assert.ok(item.isFile());
        const name = path.relative(lesson, file).split(path.sep).join('/');
        if (!excluded.includes(name) && !name.startsWith(selfDirectory)) names.push(name);
      }
    }
  }
  walk(lesson);
  assert.deepEqual(names.sort(), index.files.map((item) => item.path).sort());
});

test('read-only Git clean filters retain canonical source LF and exact raw CRLF without writing objects', () => {
  // Git's logical attribute paths use '/', even though filesystem paths use Windows separators.
  const names = index.files.map((item) => `learning/S091/${item.path}`);
  const result = git(['hash-object', '--stdin-paths'], `${names.join('\n')}\n`);
  assert.equal(result.status, 0, String(result.stderr));
  const ids = result.stdout.toString('utf8').trim().split(/\r?\n/);
  assert.equal(ids.length, index.files.length);
  index.files.forEach((item, position) => assert.equal(ids[position], blobId(canonical(item)), item.path));
});

test('an explicitly selected published Git revision preserves the qualified owned bundle', { skip: !process.env.S091_GIT_REV }, () => {
  const revision = process.env.S091_GIT_REV;
  assert.match(revision, /^[a-f0-9]{40}$/);
  const refs = index.files.map((item) => `${revision}:learning/S091/${item.path}`);
  const result = git(['cat-file', '--batch'], `${refs.join('\n')}\n`);
  assert.equal(result.status, 0, String(result.stderr));
  let offset = 0;
  for (const item of index.files) {
    const end = result.stdout.indexOf(10, offset);
    const header = result.stdout.subarray(offset, end).toString('utf8');
    assert.match(header, /^[a-f0-9]{40} blob \d+$/);
    const size = Number(header.split(' ')[2]);
    offset = end + 1;
    const bytes = result.stdout.subarray(offset, offset + size);
    assert.equal(size, item.bytes, item.path);
    assert.equal(sha(bytes), item.sha256, item.path);
    offset += size + 1;
  }
  assert.equal(offset, result.stdout.length);
});
