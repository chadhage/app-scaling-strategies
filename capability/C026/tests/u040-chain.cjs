'use strict';

// Test tooling, not production code: reads and verifies the append-only addendum chain of C026 (U040). The sealed index
// evidence.json is never rewritten; evidence-index-addendum-<n>.json supersedes EXACTLY the named bytes of a CLOSED list of files, each
// entry naming the bytes it replaces and the bytes that replace them. Pure functions over a read function, so a test can feed fixtures.
// evidence-final.test.cjs and u040-evidence.test.cjs pin this file by raw SHA-256 (a later edit of this helper needs addendum 2).
const crypto = require('node:crypto');

const SCHEMA = 'C026-evidence-index-addendum/1';
const SEALED_INDEX = 'capability\\C026\\evidence.json';
// The only files an addendum may supersede: the production file U040 fixes, the verifier that pinned it, the gate list and the README.
const AMENDABLE = Object.freeze([
  'capability\\C026\\server.cjs', 'capability\\C026\\README.md',
  'capability\\C026\\tests\\evidence-final.test.cjs', 'capability\\C026\\tests\\coverage-gate.cjs'
]);
const HEX = /^[0-9a-f]{64}$/;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const addendumPath = (sequence) => `capability\\C026\\evidence-index-addendum-${sequence}.json`;

// read(relativePath) returns the bytes or null. Returns { ok, errors, hashes: Map(path -> [sealed hash, ..., live hash]) }.
function verifyChain(read, { maxSequence = 20 } = {}) {
  const errors = [];
  const hashes = new Map();
  const sealed = read(SEALED_INDEX);
  if (sealed === null) errors.push(`MISSING ${SEALED_INDEX}`);
  let previous = null;
  for (let sequence = 1; sequence <= maxSequence; sequence += 1) {
    const bytes = read(addendumPath(sequence));
    if (bytes === null) break;
    let addendum;
    try {
      addendum = JSON.parse(bytes.toString('utf8'));
    } catch {
      errors.push(`UNPARSABLE ${addendumPath(sequence)}`);
      break;
    }
    if (addendum.schema !== SCHEMA || addendum.cardId !== 'C026' || addendum.sequence !== sequence) errors.push(`BAD_HEADER ${addendumPath(sequence)}`);
    if (!addendum.base || addendum.base.path !== SEALED_INDEX || sealed === null || addendum.base.rawSha256 !== sha(sealed)) errors.push(`BASE_CHANGED ${addendumPath(sequence)}`);
    const link = previous === null ? null : { path: addendumPath(sequence - 1), rawSha256: previous };
    if (JSON.stringify(addendum.previous ?? null) !== JSON.stringify(link)) errors.push(`CHAIN_BROKEN ${addendumPath(sequence)}`);
    for (const entry of Array.isArray(addendum.amendments) ? addendum.amendments : []) {
      if (!AMENDABLE.includes(entry.path)) { errors.push(`AMENDMENT_PATH_NOT_ALLOWED ${entry.path}`); continue; }
      if (entry.status !== 'applied' || !HEX.test(entry.previousRawSha256 ?? '') || !HEX.test(entry.rawSha256 ?? '')) { errors.push(`BAD_AMENDMENT ${entry.path}`); continue; }
      const known = hashes.get(entry.path);
      if (known === undefined) {
        const copy = entry.supersededCopy === undefined ? null : read(entry.supersededCopy);
        if (copy === null || sha(copy) !== entry.previousRawSha256) errors.push(`SUPERSEDED_COPY_MISMATCH ${entry.path}`);
        hashes.set(entry.path, [entry.previousRawSha256, entry.rawSha256]);
      } else if (known[known.length - 1] !== entry.previousRawSha256) {
        errors.push(`GAP_IN_CHAIN ${entry.path}`);
      } else {
        known.push(entry.rawSha256);
      }
    }
    for (const item of Array.isArray(addendum.evidence) ? addendum.evidence : []) {
      const file = read(item.path);
      if (file === null || sha(file) !== item.rawSha256) errors.push(`EVIDENCE_MISMATCH ${item.path}`);
    }
    previous = sha(bytes);
  }
  for (const [file, chain] of hashes) {
    const live = read(file);
    if (live === null || sha(live) !== chain[chain.length - 1]) errors.push(`LIVE_BYTES_DIFFER_FROM_ADDENDUM ${file}`);
  }
  return { ok: errors.length === 0, errors, hashes };
}

// True when the chain replaced exactly `recorded` by exactly `live` for this file: the archived runs hashed the older bytes.
function supersedes(hashes, file, recorded, live) {
  const chain = hashes.get(file);
  return chain !== undefined && chain[chain.length - 1] === live && chain.slice(0, -1).includes(recorded);
}

module.exports = Object.freeze({ SCHEMA, SEALED_INDEX, AMENDABLE, addendumPath, sha, verifyChain, supersedes });
