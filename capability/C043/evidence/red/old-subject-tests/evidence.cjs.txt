'use strict';

// Test tooling, not production code: recomputes the hashes a capture recorded and reports every difference, so that a
// tampered, missing or stale retained file is a named failure (C044 F9, L-0133).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

function manifestsUnder(directory) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json') && !full.includes(`${path.sep}raw${path.sep}`)) {
        const body = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (body.schemaVersion === 1 && body.transcripts && Array.isArray(body.inputs)) found.push(full);
      }
    }
  };
  if (fs.existsSync(directory)) walk(directory);
  return found.sort();
}

// Every input must still have the recorded bytes and every transcript must hash and unzip to what was recorded.
function verifyManifest(manifestPath, repository) {
  const problems = [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const here = path.dirname(manifestPath);
  for (const input of manifest.inputs) {
    const file = path.join(repository, input.path);
    if (!fs.existsSync(file)) problems.push(`${manifest.name}: input ${input.path} is missing`);
    else if (sha(fs.readFileSync(file)) !== input.rawSha256) problems.push(`${manifest.name}: input ${input.path} differs from the recorded bytes`);
  }
  for (const [stream, info] of Object.entries(manifest.transcripts)) {
    const file = path.join(here, info.path);
    if (!fs.existsSync(file)) { problems.push(`${manifest.name}: ${stream} transcript is missing`); continue; }
    const gz = fs.readFileSync(file);
    if (sha(gz) !== info.gzipSha256) { problems.push(`${manifest.name}: ${stream} transcript bytes changed`); continue; }
    let plain;
    try { plain = zlib.gunzipSync(gz); } catch { problems.push(`${manifest.name}: ${stream} transcript does not unzip`); continue; }
    if (sha(plain) !== info.sha256 || plain.length !== info.bytes) problems.push(`${manifest.name}: ${stream} content differs from the recorded hash`);
  }
  return problems;
}

module.exports = Object.freeze({ manifestsUnder, verifyManifest, sha });
