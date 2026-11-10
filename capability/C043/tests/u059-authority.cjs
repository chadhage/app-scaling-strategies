'use strict';

const fs = require('node:fs');
const path = require('node:path');
const legacy = require('./u058-authority.cjs');
const PREFIX = 'capability\\C043\\';
const HEAD = `${PREFIX}evidence-u059-head.json`;
const JOINT_BASELINE = `${PREFIX}evidence\\u059\\baseline.json`;
const CHECKER = `${PREFIX}tests\\u059-authority.cjs`;
const addendumPath = (sequence) => sequence <= 2 ? legacy.addendumPath(sequence) : `${PREFIX}evidence-u059-addendum-${sequence}.json`;
const MODIFIED59 = Object.freeze([
  'load.test.cjs', 'stall.preload.cjs', 'resources.test.cjs', 'evidence.cjs', 'evidence.test.cjs', 'u058-authority.test.cjs',
].map((name) => `${PREFIX}tests\\${name}`));
const SOURCES59 = Object.freeze([
  'U059.feature', 'U059.md', 'tests\\u059-stall-observer.cjs', 'tests\\u059-stall-fixture.cjs',
  'tests\\u059-stall-oracle.cjs', 'tests\\u059-stall.test.cjs', 'tests\\u059-authority.cjs', 'tests\\u059-authority.test.cjs',
].map((name) => PREFIX + name));
const CAPTURES59 = Object.freeze(['u059-red', 'u059-green', 'u059-focused']);
const EVIDENCE59 = Object.freeze([
  `${PREFIX}evidence\\u059\\.gitattributes`,
  ...MODIFIED59.map((relative) => `${PREFIX}evidence\\u059\\superseded\\${relative.slice(PREFIX.length)}.txt`),
  ...CAPTURES59.flatMap((name) => [
    `${PREFIX}evidence\\u059\\${name}.json`, `${PREFIX}evidence\\u059\\raw\\${name}.stdout.raw.gz`, `${PREFIX}evidence\\u059\\raw\\${name}.stderr.raw.gz`,
  ]),
]);
const HEX = /^[0-9a-f]{64}$/;
const keys = (object, expected) => object !== null && typeof object === 'object' && !Array.isArray(object)
  && Object.keys(object).sort().join(',') === [...expected].sort().join(',');

function json(read, relative, errors) {
  const bytes = read(relative);
  if (!Buffer.isBuffer(bytes)) { errors.push(`MISSING ${relative}`); return null; }
  if (bytes.length > 2 * 1024 * 1024) { errors.push(`OVERSIZE ${relative}`); return null; }
  try { return JSON.parse(bytes.toString('utf8')); } catch { errors.push(`UNPARSABLE ${relative}`); return null; }
}

function verifyHead(read) {
  const old = legacy.verifyHead(read);
  if (!old.ok) return old;
  const errors = [];
  const anchor = json(read, HEAD, errors);
  if (anchor === null) return { ok: false, errors };
  if (!keys(anchor, ['schema', 'sequence', 'path', 'rawSha256', 'checker', 'base'])
    || anchor.schema !== 'C043-U059-head/1' || anchor.sequence !== 4 || anchor.path !== addendumPath(4)
    || !HEX.test(anchor.rawSha256 ?? '')
    || !keys(anchor.checker, ['path', 'rawSha256']) || anchor.checker.path !== CHECKER || !HEX.test(anchor.checker.rawSha256 ?? '')
    || !keys(anchor.base, ['path', 'rawSha256']) || anchor.base.path !== JOINT_BASELINE || !HEX.test(anchor.base.rawSha256 ?? '')) {
    return { ok: false, errors: [`BAD_HEAD_ANCHOR ${HEAD}`] };
  }
  const bytes = read(anchor.path);
  if (!Buffer.isBuffer(bytes)) errors.push(`HEAD_MISSING ${anchor.path}`);
  else if (legacy.sha(bytes) !== anchor.rawSha256) errors.push(`HEAD_BYTES_CHANGED ${anchor.path}`);
  for (const [pin, rule] of [[anchor.checker, 'CHECKER_CHANGED'], [anchor.base, 'BASELINE_CHANGED']]) {
    const current = read(pin.path);
    if (!Buffer.isBuffer(current) || legacy.sha(current) !== pin.rawSha256) errors.push(`${rule} ${pin.path}`);
  }
  for (let sequence = 5; sequence <= 20; sequence += 1) if (read(addendumPath(sequence)) !== null) errors.push(`UNANCHORED_ADDENDUM ${addendumPath(sequence)}`);
  return { ok: errors.length === 0, errors, anchor };
}

function verifyAuthority(read) {
  const head = verifyHead(read);
  if (!head.ok) return head;
  const errors = [];
  const baseline = json(read, JOINT_BASELINE, errors);
  if (!keys(baseline, ['schema', 'cardId', 'productionFiles', 'files']) || baseline.schema !== 'C043-U059-baseline/1'
    || baseline.cardId !== 'C043' || !Array.isArray(baseline.files) || baseline.files.length !== 195
    || !Array.isArray(baseline.productionFiles) || baseline.productionFiles.length !== 13) {
    return { ok: false, errors: [...errors, `BAD_BASELINE ${JOINT_BASELINE}`] };
  }
  const previousFiles = new Map(baseline.files.map((entry) => [entry.path, entry]));
  const jointReplacements = new Map();
  for (const sequence of [3, 4]) {
    const relative = addendumPath(sequence);
    const amendment = json(read, relative, errors);
    if (!keys(amendment, ['schema', 'cardId', 'item', 'sequence', 'base', 'previous', 'amendments', 'additions'])
      || amendment.schema !== 'C043-U059-amendment/1' || amendment.cardId !== 'C043' || amendment.item !== 'U059'
      || amendment.sequence !== sequence || JSON.stringify(amendment.base) !== JSON.stringify(head.anchor.base)
      || !Array.isArray(amendment.amendments) || !Array.isArray(amendment.additions)) {
      errors.push(`BAD_AMENDMENT ${relative}`); continue;
    }
    const previous = { path: addendumPath(sequence - 1), rawSha256: legacy.sha(read(addendumPath(sequence - 1)) ?? Buffer.alloc(0)) };
    if (JSON.stringify(amendment.previous) !== JSON.stringify(previous)) errors.push(`CHAIN_BROKEN ${relative}`);
    const modified = sequence === 3 ? MODIFIED59 : [];
    if (JSON.stringify(amendment.amendments.map((entry) => entry?.path)) !== JSON.stringify(modified)) {
      errors.push(`AMENDMENT_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.amendments) {
      const before = previousFiles.get(entry.path);
      const copy = `${PREFIX}evidence\\u059\\superseded\\${entry.path.slice(PREFIX.length)}.txt`;
      if (!keys(entry, ['path', 'previousRawSha256', 'rawSha256', 'supersededCopy'])
        || !before || before.rawSha256 !== entry.previousRawSha256 || entry.supersededCopy !== copy
        || !HEX.test(entry.rawSha256 ?? '') || entry.rawSha256 === entry.previousRawSha256) {
        errors.push(`GAP_IN_CHAIN ${entry.path}`); continue;
      }
      const retained = read(copy);
      if (!Buffer.isBuffer(retained) || legacy.sha(retained) !== before.rawSha256) errors.push(`SUPERSEDED_COPY_MISMATCH ${entry.path}`);
      const current = read(entry.path);
      if (!Buffer.isBuffer(current) || legacy.sha(current) !== entry.rawSha256) errors.push(`LIVE_AUTHORITY_BYTES_CHANGED ${entry.path}`);
      jointReplacements.set(entry.path, entry);
    }
    const allowed = sequence === 3 ? SOURCES59 : EVIDENCE59;
    if (JSON.stringify(amendment.additions.map((entry) => entry?.path)) !== JSON.stringify(allowed)) {
      errors.push(`ADDITION_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.additions) {
      const current = read(entry.path);
      if (!keys(entry, ['path', 'bytes', 'rawSha256']) || !Buffer.isBuffer(current)
        || current.length !== entry.bytes || legacy.sha(current) !== entry.rawSha256) errors.push(`ADDITION_BYTES_CHANGED ${entry.path}`);
    }
  }
  for (const entry of baseline.files) {
    if (jointReplacements.has(entry.path)) continue;
    const current = read(entry.path);
    if (!Buffer.isBuffer(current) || current.length !== entry.bytes || legacy.sha(current) !== entry.rawSha256) errors.push(`ORIGINAL_BYTES_CHANGED ${entry.path}`);
  }
  // Validate current replacements before presenting the exact pre-U059 view to the immutable U058 checker.
  const oldView = (relative) => read(jointReplacements.get(relative)?.supersededCopy ?? relative);
  const old = legacy.verifyAuthority(oldView);
  return { ...old, ok: errors.length === 0 && old.ok, errors: [...errors, ...old.errors], jointReplacements, jointBaseline: baseline };
}

function manifestReader(manifestFile, repository) {
  const read = legacy.readRepository(repository);
  const current = verifyAuthority(read);
  if (!current.ok) throw new Error(current.errors.join('\n'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const historical = new Map();
  for (const input of manifest.inputs) {
    const joint = current.jointReplacements.get(input.path);
    const old = current.replacements.get(input.path);
    if (joint && input.rawSha256 === joint.previousRawSha256) historical.set(input.path, joint.supersededCopy);
    else if (old && input.rawSha256 === old.previousRawSha256) historical.set(input.path, old.supersededCopy);
  }
  return (relative) => {
    const bytes = read(historical.get(relative) ?? relative);
    if (!Buffer.isBuffer(bytes)) throw new Error(`MISSING_INPUT ${relative}`);
    return bytes;
  };
}

module.exports = Object.freeze({
  ...legacy, HEAD, CHECKER, JOINT_BASELINE, addendumPath, MODIFIED59, SOURCES59, EVIDENCE59, CAPTURES59,
  verifyHead, verifyAuthority, manifestReader,
});
