'use strict';

// Evidence verifier for U005 (test tooling): recomputes everything an archived run (RUN\scripts\archive-run.cjs) recorded, so that
// tampering with a transcript, a manifest or a pinned input is detected. Pure functions over files; never touches a process.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const evidenceRoot = path.resolve(__dirname, '..', 'evidence', 'u005');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const crlfToLf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

function readManifest(dir, name) {
  return JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
}

function transcriptOf(dir, manifest, stream) {
  const info = manifest.transcripts[stream];
  const gz = fs.readFileSync(path.join(dir, info.path.replace(/\\/g, path.sep)));
  return { info, gz, text: zlib.gunzipSync(gz) };
}

// Problems found in one archived run directory; pinInputs also compares every recorded input with the CURRENT file bytes
// (except inputs whose path ends with one of ignoreInputs); expectedExitCode overrides the code the manifest declared.
function verifyRun(dir, name, { pinInputs = false, root = repoRoot, expectedExitCode, ignoreInputs = [] } = {}) {
  const problems = [];
  let manifest;
  try {
    manifest = readManifest(dir, name);
  } catch (error) {
    return [`${name}: manifest unreadable (${error.message})`];
  }
  const expected = expectedExitCode === undefined ? manifest.expectedExitCode : expectedExitCode;
  if (manifest.name !== name) problems.push(`${name}: manifest names ${manifest.name}`);
  if (manifest.exitCode !== expected || manifest.timedOut !== false) problems.push(`${name}: exit ${manifest.exitCode} is not the expected ${expected} or it timed out`);
  for (const stream of ['stdout', 'stderr']) {
    try {
      const { info, gz, text } = transcriptOf(dir, manifest, stream);
      if (sha256(gz) !== info.gzipSha256 || gz.length !== info.gzipBytes) problems.push(`${name}: ${stream} gzip bytes differ from the manifest`);
      if (sha256(text) !== info.sha256 || text.length !== info.bytes) problems.push(`${name}: ${stream} text differs from the manifest`);
    } catch (error) {
      problems.push(`${name}: ${stream} transcript unreadable (${error.message})`);
    }
  }
  try {
    const stdout = transcriptOf(dir, manifest, 'stdout').text.toString('utf8').replace(/\r\n/g, '\n');
    for (const key of ['tests', 'pass', 'fail']) {
      const match = stdout.match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
      if (match && manifest.summary[key] !== Number(match[1])) problems.push(`${name}: summary.${key} differs from the transcript`);
    }
  } catch {
    // the transcript problem is already reported above
  }
  if (pinInputs) {
    for (const input of manifest.inputs.filter((item) => !ignoreInputs.some((suffix) => item.path.endsWith(suffix)))) {
      let bytes;
      try {
        bytes = fs.readFileSync(path.join(root, input.path));
      } catch {
        problems.push(`${name}: input ${input.path} is missing`);
        continue;
      }
      if (sha256(bytes) !== input.rawSha256 || sha256(crlfToLf(bytes)) !== input.crlfToLfSha256) problems.push(`${name}: input ${input.path} changed after the run`);
    }
  }
  return problems;
}

const stdoutOf = (dir, name) => transcriptOf(dir, readManifest(dir, name), 'stdout').text.toString('utf8').replace(/\r\n/g, '\n');

module.exports = { repoRoot, evidenceRoot, sha256, crlfToLf, readManifest, transcriptOf, verifyRun, stdoutOf };
