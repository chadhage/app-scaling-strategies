'use strict';

// Test tooling, not production code: which files a capture is recorded against. A capture (RED replay, GREEN, coverage, Edge, guard mutants, loop,
// fresh trees) pins the SHA-256 of every production file, the feature, imports.json and every file under tests\ except the files that only produce or
// check the evidence (evidence*, seal*): those are written while the captures run and are sealed at the very end instead (seal.json).
// Files are read through evidence-io.cjs (the real tree, or an overlay in a tamper test); the hashes of a real file are computed once.
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('./evidence-io.cjs');

const PRODUCTION = Object.freeze(['audit.cjs', 'codes.cjs', 'contract.js', 'page.js', 'server.cjs', 'store.cjs']);
const ASSETS = Object.freeze(['index.html', 'style.css']);
const EVIDENCE_ONLY = /^(evidence|seal)/;
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
const crlf = (buffer) => Buffer.from(lf(buffer).toString('latin1').replaceAll('\n', '\r\n'), 'latin1');

const real = new Map();
let overlayGeneration = -1;
let altered = new Map();
const compute = (file) => {
  const bytes = fs.readFileSync(file);
  const lfBytes = lf(bytes);
  return { bytes, raw: sha(bytes), lf: sha(lfBytes), crlf: sha(crlf(lfBytes)) };
};
// { bytes, raw, lf, crlf }: the SHA-256 of the file as it is, with LF endings and with CRLF endings (a checkout may hold either).
function hashesOf(file) {
  const key = path.resolve(file);
  if (!fs.edited(file)) {
    let found = real.get(key);
    if (!found) { found = compute(file); real.set(key, found); }
    return found;
  }
  if (overlayGeneration !== fs.generation) { altered = new Map(); overlayGeneration = fs.generation; }
  let found = altered.get(key);
  if (!found) { found = compute(file); altered.set(key, found); }
  return found;
}

// Does the file match a pin written by the recorder (rawSha256 and crlfToLfSha256) or by this tooling (rawSha256 and lfSha256)?
const fileMatches = (file, entry) => { const found = hashesOf(file); return found.raw === entry.rawSha256 || found.lf === (entry.crlfToLfSha256 ?? entry.lfSha256); };
// A bare raw hash (the mutation generator records raw bytes): it matches the bytes, their LF form and their CRLF form.
const matchesRaw = (file, hash) => { const found = hashesOf(file); return found.raw === hash || found.lf === hash || found.crlf === hash; };

// The names (from the namespace root) a capture must pin, sorted.
function inputFiles(root) {
  const tests = fs.readdirSync(path.join(root, 'tests')).filter((name) => /\.c?js$/.test(name) && !EVIDENCE_ONLY.test(name)).map((name) => `tests/${name}`);
  return [...PRODUCTION, ...ASSETS, 'C010.feature', ...(fs.existsSync(path.join(root, 'U057.feature')) ? ['U057.feature'] : []), 'imports.json', ...tests].sort();
}

function pinInputs(root, names = inputFiles(root)) {
  return names.map((name) => { const found = hashesOf(path.join(root, name)); return { path: name, rawSha256: found.raw, lfSha256: found.lf }; });
}

module.exports = Object.freeze({ ASSETS, EVIDENCE_ONLY, PRODUCTION, fileMatches, hashesOf, inputFiles, lf, matchesRaw, pinInputs, sha });
