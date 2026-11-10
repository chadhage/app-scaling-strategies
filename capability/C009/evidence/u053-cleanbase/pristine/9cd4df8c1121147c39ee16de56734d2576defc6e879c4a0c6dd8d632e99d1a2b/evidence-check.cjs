'use strict';

// Test tooling, not production code: recomputes the hashes of archived evidence (the manifests written by the shared recorder
// RUN\scripts\archive-run.cjs). Every byte is read through an injected read(repositoryRelativePath), so a test can tamper in memory
// and demand that the check notices. Returns a list of problems; an empty list means the archive is intact.
const { createHash } = require('node:crypto');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

function checkTranscripts({ directory, manifest, read }) {
  const problems = [];
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts?.[stream];
    if (!entry) {
      problems.push(`${stream}: the manifest has no transcript entry`);
      continue;
    }
    let compressed;
    try { compressed = read(path.join(directory, entry.path)); } catch (error) { problems.push(`${stream}: ${error.message}`); continue; }
    if (sha(compressed) !== entry.gzipSha256) problems.push(`${stream}: the gzip file differs from the manifest`);
    let raw;
    try { raw = gunzipSync(compressed); } catch { problems.push(`${stream}: not a gzip stream`); continue; }
    if (sha(raw) !== entry.sha256 || raw.length !== entry.bytes) problems.push(`${stream}: the raw bytes differ from the manifest`);
  }
  return problems;
}

// pinned(input) decides which inputs are compared with the live files (the others are the caller's business).
function checkInputs({ manifest, read, pinned = () => true }) {
  const problems = [];
  for (const input of manifest.inputs || []) {
    if (!pinned(input)) continue;
    let live;
    try { live = read(input.path); } catch (error) { problems.push(`${input.path}: ${error.message}`); continue; }
    if (sha(live) !== input.rawSha256 && sha(lf(live)) !== input.crlfToLfSha256) problems.push(`${input.path}: differs from the bytes the run saw`);
  }
  return problems;
}

module.exports = Object.freeze({ checkTranscripts, checkInputs, sha });
