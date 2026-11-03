'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const read = (name) => fs.readFileSync(path.join(root, name));
const json = (name) => JSON.parse(read(name));
const tree = (directory = root) => Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? Object.entries(tree(path.join(directory, entry.name)))
    : [[path.relative(root, path.join(directory, entry.name)), hash(fs.readFileSync(path.join(directory, entry.name)))]]).sort());
function writeJson(name, value) {
  const target = path.join(evidence, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
function raw(scope, name, bytes, source) {
  const file = path.join('raw', scope, `${name.replace(/[^a-z0-9-]/gi, '-')}.raw.gz`);
  const target = path.join(evidence, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, gzipSync(bytes), { flag: 'wx' });
  return { file, ...(source ? { source } : {}), sha256: hash(bytes), bytes: bytes.length,
    crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length };
}
function snapshots(scope, names) {
  return names.map((name) => raw(scope, name, read(name), name));
}

module.exports = { root, repo, evidence, hash, lf, read, json, tree, writeJson, raw, snapshots };
