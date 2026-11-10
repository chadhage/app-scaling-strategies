'use strict';

const fs = require('node:fs');
const path = require('node:path');
const previous = require('./u060-final-authority.cjs');
const PREFIX = 'capability\\C043\\';
const HEAD = `${PREFIX}evidence-u060-review-head.json`;
const CHECKER = `${PREFIX}tests\\u060-review-authority.cjs`;
const MODIFIED_REVIEW = Object.freeze([
  'tests\\u060-mutation-runner.cjs', 'tests\\u060-child-gate.preload.cjs', 'tests\\mutants.test.cjs',
  'tests\\evidence.cjs', 'tests\\u058-authority.test.cjs',
  'tests\\u059-authority.test.cjs', 'tests\\u060-authority.test.cjs',
  'tests\\u060-completion-authority.test.cjs', 'tests\\u060-final-authority.test.cjs', 'README.md', 'U060.md',
].map((relative) => PREFIX + relative));
const SOURCES_REVIEW = Object.freeze([
  'U060-startup-publication.feature', 'tests\\u060-startup-publication.test.cjs',
  'tests\\u060-startup-facts.cjs', 'tests\\u060-startup-facts.test.cjs',
  'tests\\u060-review-authority.cjs', 'tests\\u060-review-authority.test.cjs',
].map((relative) => PREFIX + relative));
const retainedPath = (relative) => `${PREFIX}evidence\\u060-review\\superseded\\${relative.slice(PREFIX.length)}.txt`;
const EVIDENCE_REVIEW = Object.freeze(MODIFIED_REVIEW.map(retainedPath));
const addendumPath = (sequence) => sequence <= 10 ? previous.addendumPath(sequence) : `${PREFIX}evidence-u060-review-addendum-${sequence}.json`;
const HEX = /^[0-9a-f]{64}$/;
const keys = (value, expected) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...expected].sort().join(',');

function json(read, relative, errors) {
  const bytes = read(relative);
  if (!Buffer.isBuffer(bytes)) { errors.push(`MISSING ${relative}`); return null; }
  if (bytes.length > 2 * 1024 * 1024) { errors.push(`OVERSIZE ${relative}`); return null; }
  try { return JSON.parse(bytes.toString('utf8')); } catch { errors.push(`UNPARSABLE ${relative}`); return null; }
}

const previousView = (read) => (relative) => read(MODIFIED_REVIEW.includes(relative) ? retainedPath(relative) : relative);
const historicalRead = (read) => previous.historicalRead(previousView(read));
const completionView = (read) => previous.previousView(previousView(read));

function verifyHead(read) {
  const old = previous.verifyHead(read);
  if (!old.ok) return old;
  const errors = [];
  const anchor = json(read, HEAD, errors);
  if (!anchor) return { ok: false, errors };
  if (!keys(anchor, ['schema', 'sequence', 'path', 'rawSha256', 'checker', 'base'])
    || anchor.schema !== 'C043-U060-review-head/1' || anchor.sequence !== 12 || anchor.path !== addendumPath(12) || !HEX.test(anchor.rawSha256 ?? '')
    || !keys(anchor.checker, ['path', 'rawSha256']) || anchor.checker.path !== CHECKER || !HEX.test(anchor.checker.rawSha256 ?? '')
    || !keys(anchor.base, ['path', 'rawSha256']) || anchor.base.path !== previous.HEAD || !HEX.test(anchor.base.rawSha256 ?? '')) {
    return { ok: false, errors: [`BAD_HEAD_ANCHOR ${HEAD}`] };
  }
  const bytes = read(anchor.path);
  if (!Buffer.isBuffer(bytes)) errors.push(`HEAD_MISSING ${anchor.path}`);
  else if (previous.sha(bytes) !== anchor.rawSha256) errors.push(`HEAD_BYTES_CHANGED ${anchor.path}`);
  for (const [pin, rule] of [[anchor.checker, 'CHECKER_CHANGED'], [anchor.base, 'BASELINE_CHANGED']]) {
    const current = read(pin.path);
    if (!Buffer.isBuffer(current) || previous.sha(current) !== pin.rawSha256) errors.push(`${rule} ${pin.path}`);
  }
  for (let sequence = 13; sequence <= 20; sequence += 1) if (read(addendumPath(sequence)) !== null) errors.push(`UNANCHORED_ADDENDUM ${addendumPath(sequence)}`);
  return { ok: errors.length === 0, errors, anchor };
}

function verifyAuthority(read) {
  const head = verifyHead(read);
  if (!head.ok) return head;
  const errors = [];
  const baseline = json(read, previous.BASELINE60, errors);
  if (!Array.isArray(baseline?.files)) return { ok: false, errors: [...errors, `BAD_BASELINE ${previous.BASELINE60}`] };
  const accepted = new Map(baseline.files.map((entry) => [entry.path, entry]));
  for (const sequence of [5, 6, 7, 8, 9, 10]) {
    const amendment = json(read, previous.addendumPath(sequence), errors);
    if (!Array.isArray(amendment?.amendments) || !Array.isArray(amendment?.additions)) {
      errors.push(`BAD_AMENDMENT ${previous.addendumPath(sequence)}`); continue;
    }
    for (const entry of [...amendment.amendments, ...amendment.additions]) accepted.set(entry.path, entry);
  }
  const reviewReplacements = new Map();
  for (const sequence of [11, 12]) {
    const relative = addendumPath(sequence);
    const amendment = json(read, relative, errors);
    if (!keys(amendment, ['schema', 'cardId', 'item', 'sequence', 'base', 'previous', 'amendments', 'additions'])
      || amendment.schema !== 'C043-U060-review-amendment/1' || amendment.cardId !== 'C043' || amendment.item !== 'U060'
      || amendment.sequence !== sequence || JSON.stringify(amendment.base) !== JSON.stringify(head.anchor.base)
      || !Array.isArray(amendment.amendments) || !Array.isArray(amendment.additions)) {
      errors.push(`BAD_AMENDMENT ${relative}`); continue;
    }
    const link = { path: addendumPath(sequence - 1), rawSha256: previous.sha(read(addendumPath(sequence - 1)) ?? Buffer.alloc(0)) };
    if (JSON.stringify(amendment.previous) !== JSON.stringify(link)) errors.push(`CHAIN_BROKEN ${relative}`);
    const changes = sequence === 11 ? MODIFIED_REVIEW : [];
    if (JSON.stringify(amendment.amendments.map((entry) => entry?.path)) !== JSON.stringify(changes)) {
      errors.push(`AMENDMENT_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.amendments) {
      const before = accepted.get(entry.path);
      if (!keys(entry, ['path', 'previousRawSha256', 'rawSha256', 'supersededCopy']) || !before
        || entry.previousRawSha256 !== before.rawSha256 || entry.supersededCopy !== retainedPath(entry.path)
        || !HEX.test(entry.rawSha256 ?? '') || entry.rawSha256 === entry.previousRawSha256) {
        errors.push(`GAP_IN_CHAIN ${entry.path}`); continue;
      }
      const retained = read(entry.supersededCopy);
      if (!Buffer.isBuffer(retained) || previous.sha(retained) !== entry.previousRawSha256) errors.push(`SUPERSEDED_COPY_MISMATCH ${entry.path}`);
      const current = read(entry.path);
      if (!Buffer.isBuffer(current) || previous.sha(current) !== entry.rawSha256) errors.push(`LIVE_AUTHORITY_BYTES_CHANGED ${entry.path}`);
      reviewReplacements.set(entry.path, entry);
    }
    const additions = sequence === 11 ? SOURCES_REVIEW : EVIDENCE_REVIEW;
    if (JSON.stringify(amendment.additions.map((entry) => entry?.path)) !== JSON.stringify(additions)) {
      errors.push(`ADDITION_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.additions) {
      const current = read(entry.path);
      if (!keys(entry, ['path', 'bytes', 'rawSha256']) || !Buffer.isBuffer(current)
        || current.length !== entry.bytes || previous.sha(current) !== entry.rawSha256) errors.push(`ADDITION_BYTES_CHANGED ${entry.path}`);
    }
  }
  const old = previous.verifyAuthority(previousView(read));
  return { ...old, ok: errors.length === 0 && old.ok, errors: [...errors, ...old.errors], reviewReplacements };
}

function manifestReader(manifestFile, repository) {
  const read = previous.readRepository(repository);
  const verified = verifyAuthority(read);
  if (!verified.ok) throw new Error(verified.errors.join('\n'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const historical = new Map();
  for (const input of manifest.inputs) {
    const authoredHistory = input.path === `${PREFIX}tests\\u060-mutation-runner.cjs`
      ? `${PREFIX}evidence\\u060\\startup-original\\u060-mutation-runner.cjs.txt`
      : input.path === `${PREFIX}tests\\mutants.test.cjs` ? `${PREFIX}evidence\\u060\\startup-original\\mutants.test.cjs.txt` : null;
    if (authoredHistory && previous.sha(read(authoredHistory)) === input.rawSha256) {
      historical.set(input.path, authoredHistory); continue;
    }
    for (const replacements of [verified.reviewReplacements, verified.finalReplacements, verified.completionReplacements, verified.replacements60, verified.jointReplacements, verified.replacements]) {
      const replacement = replacements.get(input.path);
      if (replacement && input.rawSha256 === replacement.previousRawSha256) {
        historical.set(input.path, replacement.supersededCopy); break;
      }
    }
  }
  return (relative) => {
    const bytes = read(historical.get(relative) ?? relative);
    if (!Buffer.isBuffer(bytes)) throw new Error(`MISSING_INPUT ${relative}`);
    return bytes;
  };
}

module.exports = Object.freeze({
  ...previous, HEAD, CHECKER, MODIFIED_REVIEW, SOURCES_REVIEW, EVIDENCE_REVIEW,
  addendumPath, previousView, completionView, historicalRead, verifyHead, verifyAuthority, manifestReader,
});
