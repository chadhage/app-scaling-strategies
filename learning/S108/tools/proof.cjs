'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function tree(root, directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? tree(root, path.join(directory, entry.name))
      : [[path.relative(root, path.join(directory, entry.name)), hash(fs.readFileSync(path.join(directory, entry.name)))]])
    .sort(([a], [b]) => a.localeCompare(b));
}
function nextName(evidence, stage) {
  let attempt = 1;
  while (fs.existsSync(path.join(evidence, `${stage}-${String(attempt).padStart(3, '0')}.json`))) attempt++;
  return `${stage}-${String(attempt).padStart(3, '0')}`;
}
function saveRaw(evidence, name, label, bytes) {
  assert.ok(Buffer.isBuffer(bytes));
  assert.match(name, /^[a-z]+-\d{3}$/);
  assert.match(label, /^[a-zA-Z0-9_.-]+$/);
  const directory = path.join(evidence, 'raw', name);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${label}.raw.gz`);
  fs.writeFileSync(file, gzipSync(bytes, { mtime: 0 }), { flag: 'wx' });
  return {
    file: path.relative(evidence, file).split(path.sep).join('/'),
    sha256: hash(bytes), bytes: bytes.length,
    crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length,
  };
}
function writeRecord(evidence, name, value) {
  fs.writeFileSync(path.join(evidence, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
module.exports = { hash, tree, nextName, saveRaw, writeRecord };
