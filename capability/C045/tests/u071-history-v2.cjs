'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ITEM = 'U071';
const INDEX_SHA = '141d0228ca7613a0c020f2454e31428287c60e4da2c378ac627bdf5494b684a2';
const own = path.resolve(__dirname, '..');
const repository = path.resolve(own, '..', '..');
const indexFile = path.join(own, 'evidence', ITEM.toLowerCase(), 'history-index-2.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
let cachedBytes;
let cached;
const gitBytes = new Map();
function index() {
  const bytes = fs.readFileSync(indexFile);
  if (sha(bytes) !== INDEX_SHA) throw new Error(`${ITEM} historical index bytes changed.`);
  if (!cachedBytes || !bytes.equals(cachedBytes)) {
    cachedBytes = Buffer.from(bytes);
    cached = JSON.parse(bytes);
  }
  return cached;
}
function identity(manifest) {
  const inputs = manifest.inputs || manifest.sources;
  if (!Array.isArray(inputs) || !manifest.command || !manifest.startedAtUtc) return null;
  return sha(Buffer.from(JSON.stringify({ name: manifest.name || manifest.slot, startedAtUtc: manifest.startedAtUtc,
    command: sha(Buffer.from(JSON.stringify(manifest.command))), paths: inputs.map(row => sha(Buffer.from(row.path))) })));
}
function version(key) {
  const row = index().versions[key];
  if (!row || row.kind === 'unresolved') throw new Error(`HISTORICAL_VERSION_UNAVAILABLE ${key}`);
  let bytes;
  if (row.kind === 'git') {
    if (!gitBytes.has(key)) {
      const raw = execFileSync('git', ['--no-pager', 'cat-file', 'blob', `${row.ref}:${row.path}`],
        { cwd: repository, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      const value = row.form === 'raw' ? raw : row.form === 'LF' ? lf(raw)
        : Buffer.from(lf(raw).toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
      if (sha(value) !== key) throw new Error(`HISTORICAL_GIT_BYTES_CHANGED ${row.path}`);
      gitBytes.set(key, Buffer.from(value));
    }
    bytes = gitBytes.get(key);
  } else {
    const file = path.join(own, ...row.path.split('\\'));
    if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) throw new Error(`HISTORICAL_WITNESS_PATH ${row.path}`);
    bytes = fs.readFileSync(file);
    if (sha(bytes) !== key) throw new Error(`HISTORICAL_WITNESS_CHANGED ${row.path}`);
  }
  return Buffer.from(bytes);
}
function context(manifest) {
  const key = identity(manifest);
  const entry = key && index().captures[key];
  if (!entry) return null;
  return Object.freeze({ kind: 'explicit-historical-input-version', read(input, ordinal) {
    const row = entry.inputs[ordinal];
    if (!row || sha(Buffer.from(input.path)) !== row.pathSha256) throw new Error(`HISTORICAL_INPUT_PATH_UNAVAILABLE ${input.path}`);
    return version(row.rawSha256);
  } });
}
function frozenRow(row) {
  const key = `${sha(Buffer.from(row.path))}:${row.rawSha256}`;
  const digest = index().frozenRows[key];
  if (!digest) throw new Error(`HISTORICAL_FROZEN_ROW_UNAVAILABLE ${row.path}`);
  return version(digest);
}
function originalDependency(pin) {
  const raw = execFileSync('git', ['cat-file', 'blob', `${pin.acceptedSourceRef}:${pin.path.replaceAll('\\', '/')}`],
    { cwd: repository, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  for (const bytes of [raw, lf(raw), Buffer.from(lf(raw).toString('latin1').replace(/\n/g, '\r\n'), 'latin1')]) {
    if (sha(bytes) === pin.rawCheckoutSha256) return bytes;
  }
  throw new Error(`HISTORICAL_DEPENDENCY_UNAVAILABLE ${pin.path}`);
}
function verifyAll() {
  const data = index();
  const problems = [];
  let checked = 0;
  for (const capture of Object.values(data.captures)) for (const row of capture.inputs) {
    checked++;
    try { if (sha(version(row.rawSha256)) !== row.rawSha256) problems.push(`HISTORICAL_INPUT_CHANGED ${row.pathSha256}`); }
    catch { problems.push(`HISTORICAL_VERSION_UNAVAILABLE ${row.rawSha256}`); }
  }
  return { kind: 'historical-versions-only-not-current-filesystem', inputs: checked, problems: [...new Set(problems)] };
}
module.exports = Object.freeze({ identity, context, frozenRow, originalDependency, verifyAll, version });
