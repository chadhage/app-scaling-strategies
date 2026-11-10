'use strict';

// Test tooling, not production code: re-derives every recorded fact of an evidence manifest written by the shared recorder
// (input hashes, transcript hashes, the pass/fail counts) and of the import pins, with injectable readers so that a tamper can
// be tried on a scratch copy or on in-memory bytes.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const producerAuthority = require('./u070-producer.cjs');
const historicalVersions = require('./u070-history-v2.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

function countOf(text, key) {
  const match = new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text);
  return match ? Number(match[1]) : undefined;
}

function verifyManifest(manifestPath, { root, checkInputs = true }) {
  const problems = [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const dir = path.dirname(manifestPath);
  if (checkInputs) {
    const historical = path.resolve(root) === repository ? historicalVersions.context(manifest) : null;
    for (const [ordinal, input] of manifest.inputs.entries()) {
      if (historical) {
        try {
          if (sha(historical.read(input, ordinal)) !== input.rawSha256) problems.push(`INPUT_CHANGED ${input.path}`);
        } catch { problems.push(`INPUT_VERSION_UNAVAILABLE ${input.path}`); }
        continue;
      }
      const file = path.join(root, ...input.path.split('\\'));
      if (!fs.existsSync(file)) problems.push(`INPUT_MISSING ${input.path}`);
      else if (sha(fs.readFileSync(file)) !== input.rawSha256) problems.push(`INPUT_CHANGED ${input.path}`);
    }
  }
  if (manifest.exitCode !== manifest.expectedExitCode || manifest.timedOut || manifest.signal || manifest.spawnError) problems.push('RUN_NOT_AS_EXPECTED');
  let stdout = '';
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const file = path.join(dir, ...entry.path.split('\\'));
    if (!fs.existsSync(file)) { problems.push(`TRANSCRIPT_MISSING ${stream}`); continue; }
    const gz = fs.readFileSync(file);
    if (sha(gz) !== entry.gzipSha256) problems.push(`GZIP_CHANGED ${stream}`);
    let raw;
    try { raw = zlib.gunzipSync(gz); } catch { problems.push(`GZIP_CORRUPT ${stream}`); continue; }
    if (sha(raw) !== entry.sha256 || raw.length !== entry.bytes) problems.push(`RAW_CHANGED ${stream}`);
    if (stream === 'stdout') stdout = raw.toString('utf8').replace(/\r\n/g, '\n');
  }
  for (const key of ['tests', 'pass', 'fail']) if (countOf(stdout, key) !== manifest.summary[key]) problems.push(`SUMMARY_MISMATCH ${key}`);
  return { manifest, problems, stdout };
}

// An import pin is sound only when the accepted blob of the accepted commit hashes to the pin, the tag names that commit, and the
// working bytes equal the blob or its CRLF-to-LF form.
function verifyPins(pins, { readBlob, readFile }) {
  const problems = [];
  for (const [card, accepted] of Object.entries(pins.accepted)) {
    if (!/^[0-9a-f]{40}$/.test(accepted.commit) || accepted.tag !== `kanban/${card}/${accepted.commit.slice(0, 12)}`) problems.push(`TAG_MISMATCH ${card}`);
  }
  for (const entry of pins.imports) {
    const blob = readBlob(pins.accepted[entry.card].commit, entry.path);
    if (sha(blob) !== entry.acceptedGitSha256) problems.push(`BLOB_MISMATCH ${entry.path}`);
    const bytes = readFile(entry.path);
    // Either form of the accepted file is the accepted file: the raw bytes of the machine that recorded the pin, or their LF-normalized form (an LF checkout; review M2).
    if (sha(bytes) !== entry.rawSha256 && sha(normalize(bytes)) !== entry.crlfToLfSha256 &&
        !producerAuthority.acceptedWorking(entry, bytes, pins.accepted[entry.card])) problems.push(`WORKING_COPY_DIFFERS ${entry.path}`);
    if (![entry.rawSha256, entry.crlfToLfSha256].includes(entry.acceptedGitSha256)) problems.push(`PIN_NOT_ACCEPTED_BYTES ${entry.path}`);
  }
  return problems;
}

module.exports = Object.freeze({ normalize, sha, verifyManifest, verifyPins });
