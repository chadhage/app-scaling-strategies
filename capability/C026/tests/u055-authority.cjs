'use strict';

const chain = require('./u040-chain.cjs');
const PREFIX = 'capability\\C026\\';
const HEAD = `${PREFIX}evidence-chain-head-4.json`;
const HEAD_SEQUENCE = 4;
const BASELINE = `${PREFIX}evidence\\u055\\baseline.json`;
const EXTRA = Object.freeze([
  `${PREFIX}tests\\u040-evidence.test.cjs`,
  `${PREFIX}tests\\u040-evidence-2.test.cjs`,
  `${PREFIX}evidence\\u040-2\\COMMANDS.md`
]);
const ARTIFACTS = Object.freeze([
  `${PREFIX}tests\\u055-authority.cjs`,
  `${PREFIX}tests\\u055-subject.cjs`,
  `${PREFIX}tests\\u055-authority.test.cjs`,
  `${PREFIX}tests\\u055-evidence.test.cjs`,
  `${PREFIX}tests\\u055-fresh.cjs`,
  `${PREFIX}U055.md`
]);
const HEX = /^[0-9a-f]{64}$/;

function json(read, relative, errors) {
  const bytes = read(relative);
  if (!Buffer.isBuffer(bytes)) { errors.push(`MISSING ${relative}`); return null; }
  try { return JSON.parse(bytes.toString('utf8')); } catch { errors.push(`UNPARSABLE ${relative}`); return null; }
}

function verifyHead(read) {
  const errors = [];
  const anchor = json(read, HEAD, errors);
  if (anchor === null) return { ok: false, errors };
  if (typeof anchor !== 'object' || Array.isArray(anchor) || anchor.schema !== 'C026-evidence-chain-head/1' || anchor.cardId !== 'C026' || anchor.sequence !== HEAD_SEQUENCE
    || anchor.path !== chain.addendumPath(HEAD_SEQUENCE) || !HEX.test(anchor.rawSha256 ?? '')
    || Object.keys(anchor).sort().join(',') !== 'cardId,path,rawSha256,schema,sequence') {
    errors.push(`BAD_HEAD_ANCHOR ${HEAD}`);
    return { ok: false, errors };
  }
  const bytes = read(anchor.path);
  if (!Buffer.isBuffer(bytes)) errors.push(`HEAD_MISSING ${anchor.path}`);
  else if (chain.sha(bytes) !== anchor.rawSha256) errors.push(`HEAD_BYTES_CHANGED ${anchor.path}`);
  if (errors.length > 0) return { ok: false, errors };
  for (let sequence = HEAD_SEQUENCE + 1; sequence <= 20; sequence += 1) {
    if (read(chain.addendumPath(sequence)) !== null) errors.push(`UNANCHORED_ADDENDUM ${chain.addendumPath(sequence)}`);
  }
  return { ok: errors.length === 0, errors };
}

function verifyAuthority(read) {
  const head = verifyHead(read);
  if (!head.ok) return head;
  const errors = [];
  const result = chain.verifyChain(read);
  const baseline = json(read, BASELINE, errors);
  const addendum = json(read, chain.addendumPath(3), errors);
  const fourth = json(read, chain.addendumPath(4), errors);
  if (baseline === null || addendum === null || fourth === null) return { ok: false, errors };
  const priorPins = new Map(addendum.evidence.map((entry) => [entry.path, entry.rawSha256]));
  const artifacts = fourth.artifactAmendments ?? [];
  if (JSON.stringify(artifacts.map((entry) => entry.path)) !== JSON.stringify(ARTIFACTS)) errors.push(`ARTIFACT_AMENDMENT_SET_CHANGED ${chain.addendumPath(4)}`);
  const acceptedArtifacts = new Set();
  for (const entry of artifacts) {
    const current = read(entry.path);
    const pinned = priorPins.get(entry.path) === entry.previousRawSha256;
    const live = entry.status === 'applied' && Buffer.isBuffer(current) && chain.sha(current) === entry.rawSha256;
    const copy = entry.supersededCopy ? read(entry.supersededCopy) : null;
    const retained = Buffer.isBuffer(copy) && chain.sha(copy) === entry.previousRawSha256;
    const privateOnly = entry.path === `${PREFIX}tests\\u055-fresh.cjs` && entry.previousBytes === 'retained-privately-not-reconstructed-publicly';
    if (!pinned || !live || (!retained && !privateOnly)) errors.push(`ARTIFACT_REPLACEMENT_MISMATCH ${entry.path}`);
    else acceptedArtifacts.add(entry.path);
  }
  // The old checker still reports the exact D3 evidence mismatch. Only a D4 replacement whose old pin and current bytes both verify is superseded.
  for (const error of result.errors) {
    if (error.startsWith('EVIDENCE_MISMATCH ') && acceptedArtifacts.has(error.slice('EVIDENCE_MISMATCH '.length))) continue;
    errors.push(error);
  }
  const accepted = new Map(baseline.files.map((entry) => [entry.path, entry]));
  const replacements = [...addendum.amendments, ...(addendum.currentAuthorityAmendments ?? []), ...fourth.amendments];
  if (JSON.stringify(addendum.amendments.map((entry) => entry.path)) !== JSON.stringify([`${PREFIX}server.cjs`, `${PREFIX}README.md`])) {
    errors.push(`AMENDMENT_SET_CHANGED ${chain.addendumPath(3)}`);
  }
  if (JSON.stringify((addendum.currentAuthorityAmendments ?? []).map((entry) => entry.path)) !== JSON.stringify(EXTRA)) {
    errors.push(`AUTHORITY_AMENDMENT_SET_CHANGED ${chain.addendumPath(3)}`);
  }
  if (JSON.stringify(fourth.amendments.map((entry) => entry.path)) !== JSON.stringify([`${PREFIX}README.md`, `${PREFIX}tests\\evidence-final.test.cjs`])) {
    errors.push(`AMENDMENT_SET_CHANGED ${chain.addendumPath(4)}`);
  }
  for (const entry of replacements) {
    const before = accepted.get(entry.path);
    const fromBaseline = addendum.amendments.includes(entry) || (addendum.currentAuthorityAmendments ?? []).includes(entry);
    if (before === undefined || (fromBaseline && (before.rawSha256 !== entry.previousRawSha256 || before.retainedCopy !== entry.supersededCopy))) {
      errors.push(`BASELINE_REPLACEMENT_MISMATCH ${entry.path}`);
    }
    const copy = read(entry.supersededCopy);
    if (!Buffer.isBuffer(copy) || chain.sha(copy) !== entry.previousRawSha256) errors.push(`SUPERSEDED_COPY_MISMATCH ${entry.path}`);
    const current = read(entry.path);
    const last = result.hashes.get(entry.path)?.at(-1) ?? entry.rawSha256;
    if (entry.status !== 'applied' || !HEX.test(entry.rawSha256 ?? '') || !Buffer.isBuffer(current) || chain.sha(current) !== last) {
      errors.push(`LIVE_AUTHORITY_BYTES_CHANGED ${entry.path}`);
    }
  }
  const replaced = new Set(replacements.map((entry) => entry.path));
  for (const entry of baseline.files) {
    if (replaced.has(entry.path)) continue;
    const bytes = read(entry.path);
    if (!Buffer.isBuffer(bytes) || chain.sha(bytes) !== entry.rawSha256) errors.push(`HISTORICAL_BYTES_CHANGED ${entry.path}`);
  }
  return { ok: errors.length === 0, errors, hashes: result.hashes, artifactAmendments: artifacts };
}

function readerAtSequence(read, sequence) {
  if (sequence !== 2) throw new Error('U055 only supplies the accepted sequence-2 historical view.');
  const verified = verifyAuthority(read);
  if (!verified.ok) throw new Error(verified.errors.join('\n'));
  const addendum = JSON.parse(read(chain.addendumPath(3)).toString('utf8'));
  const fourth = JSON.parse(read(chain.addendumPath(4)).toString('utf8'));
  const replacements = new Map();
  for (const entry of [...addendum.amendments, ...addendum.currentAuthorityAmendments, ...fourth.amendments]) {
    if (!replacements.has(entry.path)) replacements.set(entry.path, entry.supersededCopy);
  }
  return (relative) => {
    if (relative === HEAD || /^capability\\C026\\evidence-index-addendum-(?:[3-9]|1\d|20)\.json$/.test(relative)) return null;
    return read(replacements.get(relative) ?? relative);
  };
}

module.exports = Object.freeze({ HEAD, HEAD_SEQUENCE, BASELINE, EXTRA, ARTIFACTS, verifyHead, verifyAuthority, readerAtSequence });
