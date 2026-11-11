'use strict';
const zlib = require('node:zlib');
const { sha } = require('./integrity.cjs');
function whole(seal, actual) {
  const issues = [], expected = new Set(seal.files.map(row => row.path)), names = Object.keys(actual);
  if (new Set(names).size !== names.length || names.length !== expected.size || names.some(name => !expected.has(name))) issues.push('WHOLE_EXACT_SET');
  for (const row of seal.files) {
    const bytes = actual[row.path];
    if (!bytes || bytes.length !== row.bytes || sha(bytes) !== row.sha256) issues.push('WHOLE_BYTE:' + row.path);
  }
  if (sha(JSON.stringify(seal.files)) !== seal.fileSetSha256) issues.push('WHOLE_FILESET_HASH');
  return issues;
}
function compressed(meta, bytes) {
  const issues = [];
  if (sha(bytes) !== meta.gzipSha256) issues.push('ORIGINAL_GZIP');
  let raw;
  try { raw = zlib.gunzipSync(bytes); } catch { issues.push('ORIGINAL_DECODE'); return { issues, raw: null }; }
  if (raw.length !== meta.rawBytes || sha(raw) !== meta.rawSha256) issues.push('ORIGINAL_RAW');
  return { issues, raw };
}
function tallies(decisions) {
  return Object.fromEntries([...new Set(decisions.map(row => row.decision))].sort().map(kind => [kind, decisions.filter(row => row.decision === kind).length]));
}
module.exports = { whole, compressed, tallies };
