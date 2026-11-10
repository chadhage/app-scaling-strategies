'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const dataFile = path.resolve(__dirname, '..', 'evidence', 'u070', 'producer-authority.json');
const DATA_SHA256 = '9bfdfec584212442951ac607b65f6dff27ea8818e502def23b41930690b7b9d0';
function read() {
  const bytes = fs.readFileSync(dataFile);
  if (sha(bytes) !== DATA_SHA256) throw new Error('U070 exact producer-authority.json bytes changed.');
  return JSON.parse(bytes);
}
function acceptedWorking(entry, bytes, accepted) {
  const data = read();
  const original = data.original.imports.find(row => row.path === entry.path);
  const reviewed = data.replacements.find(row => row.path === entry.path);
  if (!original || !reviewed || entry.card !== original.card ||
      entry.acceptedGitSha256 !== original.acceptedGitSha256 ||
      accepted?.commit !== data.original.accepted[entry.card].commit ||
      accepted?.tag !== data.original.accepted[entry.card].tag) return false;
  return (entry.rawSha256 === original.rawSha256 && sha(bytes) === reviewed.rawSha256) ||
    (entry.crlfToLfSha256 === original.crlfToLfSha256 && sha(normalize(bytes)) === reviewed.crlfToLfSha256);
}
function acceptedFrozenProducer(row, bytes) {
  const data = read();
  const name = row.path.replaceAll('\\', '/');
  const original = data.original.imports.find(entry => entry.path === name);
  const reviewed = data.replacements.find(entry => entry.path === name);
  if (!original || !reviewed || row.rawSha256 !== original.rawSha256 ||
      row.crlfToLfSha256 !== original.crlfToLfSha256 || row.acceptLf !== true) return false;
  return sha(bytes) === reviewed.rawSha256 || sha(normalize(bytes)) === reviewed.crlfToLfSha256;
}
module.exports = Object.freeze({ acceptedWorking, acceptedFrozenProducer });
