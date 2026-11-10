'use strict';

const fs = require('node:fs');
const path = require('node:path');
const previous = require('./u059-authority.cjs');
const PREFIX = 'capability\\C043\\';
const HEAD = `${PREFIX}evidence-u060-head.json`;
const BASELINE60 = `${PREFIX}evidence\\u060\\baseline.json`;
const CHECKER = `${PREFIX}tests\\u060-authority.cjs`;
const addendumPath = (sequence) => sequence <= 4 ? previous.addendumPath(sequence) : `${PREFIX}evidence-u060-addendum-${sequence}.json`;
const MODIFIED60 = Object.freeze([
  'mutants.test.cjs', 'mutgen.cjs', 'mutate-preload.cjs', 'mutate-at.cjs',
  'evidence.cjs', 'evidence.test.cjs', 'u058-authority.test.cjs', 'u059-authority.test.cjs',
].map((name) => `${PREFIX}tests\\${name}`));
const SOURCES60 = Object.freeze([
  'U060.feature', 'U060.md', 'tests\\u060-runner-fixture.cjs', 'tests\\u060-runner-oracle.cjs',
  'tests\\u060-child-gate.mjs', 'tests\\u060-loop-bound.preload.cjs', 'tests\\u060-mutation-runner.cjs',
  'tests\\u060-runner.test.cjs', 'tests\\u060-loop-bound.test.cjs',
  'tests\\u060-child-gate.preload.cjs', 'tests\\u060-original-startup.preload.cjs',
  'tests\\u060-startup.fixture.cjs', 'tests\\u060-startup-oracle.cjs',
  'tests\\u060-assertive-tests.preload.cjs', 'tests\\u060-behavioral-guards.test.cjs',
  'tests\\u060-authority.cjs', 'tests\\u060-authority.test.cjs',
].map((name) => PREFIX + name));
const CAPTURES60 = Object.freeze(['u060-red-timeout-bookkeeping', 'u060-green-timeout-bookkeeping', 'u060-focused', 'u060-red-startup-gate', 'u060-green-startup-gate']);
const EVIDENCE60 = Object.freeze([
  `${PREFIX}evidence\\u060\\.gitattributes`,
  `${PREFIX}evidence\\u060\\startup-original\\u060-mutation-runner.cjs.txt`,
  `${PREFIX}evidence\\u060\\startup-original\\mutants.test.cjs.txt`,
  ...MODIFIED60.map((relative) => `${PREFIX}evidence\\u060\\superseded\\${relative.slice(PREFIX.length)}.txt`),
  ...CAPTURES60.flatMap((name) => [
    `${PREFIX}evidence\\u060\\${name}.json`, `${PREFIX}evidence\\u060\\raw\\${name}.stdout.raw.gz`, `${PREFIX}evidence\\u060\\raw\\${name}.stderr.raw.gz`,
  ]),
]);
const HEX = /^[0-9a-f]{64}$/;
const keys = (value, expected) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...expected].sort().join(',');

function json(read, relative, errors) {
  const bytes = read(relative);
  if (!Buffer.isBuffer(bytes)) { errors.push(`MISSING ${relative}`); return null; }
  if (bytes.length > 2 * 1024 * 1024) { errors.push(`OVERSIZE ${relative}`); return null; }
  try { return JSON.parse(bytes.toString('utf8')); } catch { errors.push(`UNPARSABLE ${relative}`); return null; }
}

function verifyHead(read) {
  const old = previous.verifyHead(read);
  if (!old.ok) return old;
  const errors = [];
  const anchor = json(read, HEAD, errors);
  if (anchor === null) return { ok: false, errors };
  if (!keys(anchor, ['schema', 'sequence', 'path', 'rawSha256', 'checker', 'base'])
    || anchor.schema !== 'C043-U060-head/1' || anchor.sequence !== 6 || anchor.path !== addendumPath(6) || !HEX.test(anchor.rawSha256 ?? '')
    || !keys(anchor.checker, ['path', 'rawSha256']) || anchor.checker.path !== CHECKER || !HEX.test(anchor.checker.rawSha256 ?? '')
    || !keys(anchor.base, ['path', 'rawSha256']) || anchor.base.path !== BASELINE60 || !HEX.test(anchor.base.rawSha256 ?? '')) {
    return { ok: false, errors: [`BAD_HEAD_ANCHOR ${HEAD}`] };
  }
  const head = read(anchor.path);
  if (!Buffer.isBuffer(head)) errors.push(`HEAD_MISSING ${anchor.path}`);
  else if (previous.sha(head) !== anchor.rawSha256) errors.push(`HEAD_BYTES_CHANGED ${anchor.path}`);
  for (const [pin, rule] of [[anchor.checker, 'CHECKER_CHANGED'], [anchor.base, 'BASELINE_CHANGED']]) {
    const bytes = read(pin.path);
    if (!Buffer.isBuffer(bytes) || previous.sha(bytes) !== pin.rawSha256) errors.push(`${rule} ${pin.path}`);
  }
  for (let sequence = 7; sequence <= 20; sequence += 1) if (read(addendumPath(sequence)) !== null) errors.push(`UNANCHORED_ADDENDUM ${addendumPath(sequence)}`);
  return { ok: errors.length === 0, errors, anchor };
}

function verifyAuthority(read) {
  const head = verifyHead(read);
  if (!head.ok) return head;
  const errors = [];
  const baseline = json(read, BASELINE60, errors);
  if (!keys(baseline, ['schema', 'cardId', 'productionFiles', 'files']) || baseline.schema !== 'C043-U060-baseline/1'
    || baseline.cardId !== 'C043' || !Array.isArray(baseline.files) || baseline.files.length !== 223
    || !Array.isArray(baseline.productionFiles) || baseline.productionFiles.length !== 13) {
    return { ok: false, errors: [...errors, `BAD_BASELINE ${BASELINE60}`] };
  }
  const accepted = new Map(baseline.files.map((entry) => [entry.path, entry]));
  const replacements60 = new Map();
  for (const sequence of [5, 6]) {
    const relative = addendumPath(sequence);
    const amendment = json(read, relative, errors);
    if (!keys(amendment, ['schema', 'cardId', 'item', 'sequence', 'base', 'previous', 'amendments', 'additions'])
      || amendment.schema !== 'C043-U060-amendment/1' || amendment.cardId !== 'C043' || amendment.item !== 'U060'
      || amendment.sequence !== sequence || JSON.stringify(amendment.base) !== JSON.stringify(head.anchor.base)
      || !Array.isArray(amendment.amendments) || !Array.isArray(amendment.additions)) {
      errors.push(`BAD_AMENDMENT ${relative}`); continue;
    }
    const link = { path: addendumPath(sequence - 1), rawSha256: previous.sha(read(addendumPath(sequence - 1)) ?? Buffer.alloc(0)) };
    if (JSON.stringify(amendment.previous) !== JSON.stringify(link)) errors.push(`CHAIN_BROKEN ${relative}`);
    const allowedChanges = sequence === 5 ? MODIFIED60 : [];
    if (JSON.stringify(amendment.amendments.map((entry) => entry?.path)) !== JSON.stringify(allowedChanges)) {
      errors.push(`AMENDMENT_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.amendments) {
      const before = accepted.get(entry.path);
      const copy = `${PREFIX}evidence\\u060\\superseded\\${entry.path.slice(PREFIX.length)}.txt`;
      if (!keys(entry, ['path', 'previousRawSha256', 'rawSha256', 'supersededCopy'])
        || !before || before.rawSha256 !== entry.previousRawSha256 || entry.supersededCopy !== copy
        || !HEX.test(entry.rawSha256 ?? '') || entry.rawSha256 === entry.previousRawSha256) {
        errors.push(`GAP_IN_CHAIN ${entry.path}`); continue;
      }
      const retained = read(copy);
      if (!Buffer.isBuffer(retained) || previous.sha(retained) !== before.rawSha256) errors.push(`SUPERSEDED_COPY_MISMATCH ${entry.path}`);
      const current = read(entry.path);
      if (!Buffer.isBuffer(current) || previous.sha(current) !== entry.rawSha256) errors.push(`LIVE_AUTHORITY_BYTES_CHANGED ${entry.path}`);
      replacements60.set(entry.path, entry);
    }
    const additions = sequence === 5 ? SOURCES60 : EVIDENCE60;
    if (JSON.stringify(amendment.additions.map((entry) => entry?.path)) !== JSON.stringify(additions)) {
      errors.push(`ADDITION_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.additions) {
      const current = read(entry.path);
      if (!keys(entry, ['path', 'bytes', 'rawSha256']) || !Buffer.isBuffer(current)
        || current.length !== entry.bytes || previous.sha(current) !== entry.rawSha256) errors.push(`ADDITION_BYTES_CHANGED ${entry.path}`);
    }
  }
  for (const entry of baseline.files) {
    if (replacements60.has(entry.path)) continue;
    const current = read(entry.path);
    if (!Buffer.isBuffer(current) || current.length !== entry.bytes || previous.sha(current) !== entry.rawSha256) errors.push(`ORIGINAL_BYTES_CHANGED ${entry.path}`);
  }
  const old = previous.verifyAuthority((relative) => read(replacements60.get(relative)?.supersededCopy ?? relative));
  return { ...old, ok: errors.length === 0 && old.ok, errors: [...errors, ...old.errors], replacements60, baseline60: baseline };
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
    for (const replacements of [verified.replacements60, verified.jointReplacements, verified.replacements]) {
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
  ...previous, HEAD, CHECKER, BASELINE60, MODIFIED60, SOURCES60, EVIDENCE60, CAPTURES60, addendumPath,
  verifyHead, verifyAuthority, manifestReader,
});
