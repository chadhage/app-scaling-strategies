'use strict';

// Recomputes the hashes of an evidence manifest written by the shared recorder (archive-run.cjs): the raw transcripts, the declared inputs
// and the exit code. `read` is injectable so tests tamper in memory. A consistent rewrite of a manifest together with its transcripts is
// detectable only against the published git commit (L-0096); the README says so.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function manifests(directory = path.join(root, 'evidence')) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...manifests(full));
    else if (entry.name.endsWith('.json')) {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (parsed && parsed.schemaVersion === 1 && parsed.transcripts) found.push(full);
    }
  }
  return found.sort();
}

function check(file, read = (target) => fs.readFileSync(target)) {
  const manifest = JSON.parse(read(file).toString('utf8'));
  const problems = [];
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gz = read(path.join(path.dirname(file), entry.path));
    if (gz.length !== entry.gzipBytes || sha(gz) !== entry.gzipSha256) problems.push(`${stream}: gzip bytes differ from the manifest`);
    let raw = null;
    try { raw = zlib.gunzipSync(gz); } catch { problems.push(`${stream}: not a gzip stream`); }
    if (raw && (raw.length !== entry.bytes || sha(raw) !== entry.sha256)) problems.push(`${stream}: raw bytes differ from the manifest`);
  }
  for (const input of manifest.inputs) {
    const bytes = read(path.join(repository, input.path));
    if (sha(bytes) !== input.rawSha256) problems.push(`${input.path}: differs from the input hash recorded when the run was made`);
  }
  if (manifest.exitCode !== manifest.expectedExitCode || manifest.timedOut) problems.push('the exit code is not the expected one or the run timed out');
  return { manifest, problems };
}

const stdoutOf = (file, read = (target) => fs.readFileSync(target)) => {
  const manifest = JSON.parse(read(file).toString('utf8'));
  return zlib.gunzipSync(read(path.join(path.dirname(file), manifest.transcripts.stdout.path))).toString('utf8');
};

module.exports = Object.freeze({ manifests, check, stdoutOf, sha, root, repository });
