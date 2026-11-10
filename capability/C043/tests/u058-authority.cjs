'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const PREFIX = 'capability\\C043\\';
const HEAD = `${PREFIX}evidence-u058-head.json`;
const BASELINE = `${PREFIX}evidence\\u058\\baseline.json`;
const CHECKER = `${PREFIX}tests\\u058-authority.cjs`;
const addendumPath = (sequence) => `${PREFIX}evidence-u058-addendum-${sequence}.json`;
const MODIFIED = Object.freeze(['browser.cjs', 'evidence.cjs', 'evidence.test.cjs'].map((name) => `${PREFIX}tests\\${name}`));
const SOURCES = Object.freeze([
  'U058.feature', 'U058.md', 'tests\\u058-driver-fixture.cjs', 'tests\\u058-admission.cjs',
  'tests\\u058-driver.test.cjs', 'tests\\u058-authority.cjs', 'tests\\u058-authority.test.cjs',
].map((name) => PREFIX + name));
const CAPTURES = Object.freeze(['u058-red', 'u058-green', 'u058-focused']);
const EVIDENCE = Object.freeze([
  `${PREFIX}evidence\\u058\\.gitattributes`,
  ...MODIFIED.map((relative) => `${PREFIX}evidence\\u058\\superseded\\${relative.slice(PREFIX.length)}.txt`),
  ...CAPTURES.flatMap((name) => [
    `${PREFIX}evidence\\u058\\${name}.json`,
    `${PREFIX}evidence\\u058\\raw\\${name}.stdout.raw.gz`,
    `${PREFIX}evidence\\u058\\raw\\${name}.stderr.raw.gz`,
  ]),
]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const HEX = /^[0-9a-f]{64}$/;
const keys = (value, expected) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const readRepository = (repository) => (relative) => {
  try { return fs.readFileSync(path.join(repository, relative)); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

function json(read, relative, errors) {
  const bytes = read(relative);
  if (!Buffer.isBuffer(bytes)) { errors.push(`MISSING ${relative}`); return null; }
  if (bytes.length > 2 * 1024 * 1024) { errors.push(`OVERSIZE ${relative}`); return null; }
  try { return JSON.parse(bytes.toString('utf8')); } catch { errors.push(`UNPARSABLE ${relative}`); return null; }
}

function verifyHead(read) {
  const errors = [];
  const anchor = json(read, HEAD, errors);
  if (anchor === null) return { ok: false, errors };
  if (!keys(anchor, ['schema', 'sequence', 'path', 'rawSha256', 'checker', 'base'])
    || anchor.schema !== 'C043-U058-head/1' || anchor.sequence !== 2 || anchor.path !== addendumPath(2)
    || !HEX.test(anchor.rawSha256 ?? '')
    || !keys(anchor.checker, ['path', 'rawSha256']) || anchor.checker.path !== CHECKER || !HEX.test(anchor.checker.rawSha256 ?? '')
    || !keys(anchor.base, ['path', 'rawSha256']) || anchor.base.path !== BASELINE || !HEX.test(anchor.base.rawSha256 ?? '')) {
    return { ok: false, errors: [`BAD_HEAD_ANCHOR ${HEAD}`] };
  }
  const head = read(anchor.path);
  if (!Buffer.isBuffer(head)) errors.push(`HEAD_MISSING ${anchor.path}`);
  else if (sha(head) !== anchor.rawSha256) errors.push(`HEAD_BYTES_CHANGED ${anchor.path}`);
  for (const [pin, rule] of [[anchor.checker, 'CHECKER_CHANGED'], [anchor.base, 'BASELINE_CHANGED']]) {
    const bytes = read(pin.path);
    if (!Buffer.isBuffer(bytes) || sha(bytes) !== pin.rawSha256) errors.push(`${rule} ${pin.path}`);
  }
  for (let sequence = 3; sequence <= 20; sequence += 1) {
    if (read(addendumPath(sequence)) !== null) errors.push(`UNANCHORED_ADDENDUM ${addendumPath(sequence)}`);
  }
  return { ok: errors.length === 0, errors, anchor };
}

function verifyAuthority(read) {
  const head = verifyHead(read);
  if (!head.ok) return head;
  const errors = [];
  const baseline = json(read, BASELINE, errors);
  if (!keys(baseline, ['schema', 'cardId', 'productionFiles', 'files'])
    || baseline.schema !== 'C043-U058-baseline/1' || baseline.cardId !== 'C043'
    || !Array.isArray(baseline.files) || baseline.files.length !== 171
    || !Array.isArray(baseline.productionFiles) || baseline.productionFiles.length !== 13) {
    return { ok: false, errors: [...errors, `BAD_BASELINE ${BASELINE}`] };
  }
  const originals = new Map(baseline.files.map((entry) => [entry.path, entry]));
  const replacements = new Map();
  for (let sequence = 1; sequence <= 2; sequence += 1) {
    const relative = addendumPath(sequence);
    const amendment = json(read, relative, errors);
    if (!keys(amendment, ['schema', 'cardId', 'item', 'sequence', 'base', 'previous', 'amendments', 'additions'])
      || amendment.schema !== 'C043-U058-amendment/1' || amendment.cardId !== 'C043' || amendment.item !== 'U058'
      || amendment.sequence !== sequence || JSON.stringify(amendment.base) !== JSON.stringify(head.anchor.base)
      || !Array.isArray(amendment.amendments) || !Array.isArray(amendment.additions)) {
      errors.push(`BAD_AMENDMENT ${relative}`); continue;
    }
    const previous = sequence === 1 ? null : { path: addendumPath(sequence - 1), rawSha256: sha(read(addendumPath(sequence - 1)) ?? Buffer.alloc(0)) };
    if (JSON.stringify(amendment.previous) !== JSON.stringify(previous)) errors.push(`CHAIN_BROKEN ${relative}`);
    const permitted = sequence === 1 ? MODIFIED : [];
    if (JSON.stringify(amendment.amendments.map((entry) => entry?.path)) !== JSON.stringify(permitted)) {
      errors.push(`AMENDMENT_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.amendments) {
      const before = originals.get(entry.path);
      const retained = `${PREFIX}evidence\\u058\\superseded\\${entry.path.slice(PREFIX.length)}.txt`;
      if (!keys(entry, ['path', 'previousRawSha256', 'rawSha256', 'supersededCopy'])
        || !before || entry.previousRawSha256 !== before.rawSha256 || entry.supersededCopy !== retained
        || !HEX.test(entry.rawSha256 ?? '') || entry.rawSha256 === entry.previousRawSha256) {
        errors.push(`GAP_IN_CHAIN ${entry.path}`); continue;
      }
      const copy = read(retained);
      if (!Buffer.isBuffer(copy) || sha(copy) !== before.rawSha256) errors.push(`SUPERSEDED_COPY_MISMATCH ${entry.path}`);
      const current = read(entry.path);
      if (!Buffer.isBuffer(current) || sha(current) !== entry.rawSha256) errors.push(`LIVE_AUTHORITY_BYTES_CHANGED ${entry.path}`);
      replacements.set(entry.path, entry);
    }
    const allowed = sequence === 1 ? SOURCES : EVIDENCE;
    if (JSON.stringify(amendment.additions.map((entry) => entry?.path)) !== JSON.stringify(allowed)) {
      errors.push(`ADDITION_SET_CHANGED ${relative}`); continue;
    }
    for (const entry of amendment.additions) {
      const bytes = read(entry.path);
      if (!keys(entry, ['path', 'bytes', 'rawSha256']) || !Buffer.isBuffer(bytes)
        || bytes.length !== entry.bytes || sha(bytes) !== entry.rawSha256) errors.push(`ADDITION_BYTES_CHANGED ${entry.path}`);
    }
  }
  for (const entry of baseline.files) {
    if (replacements.has(entry.path)) continue;
    const bytes = read(entry.path);
    if (!Buffer.isBuffer(bytes) || bytes.length !== entry.bytes || sha(bytes) !== entry.rawSha256) errors.push(`ORIGINAL_BYTES_CHANGED ${entry.path}`);
  }
  return { ok: errors.length === 0, errors, replacements, baseline };
}

function manifestReader(manifestFile, repository) {
  const read = readRepository(repository);
  const authority = verifyAuthority(read);
  if (!authority.ok) throw new Error(authority.errors.join('\n'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const historical = new Map();
  for (const input of manifest.inputs) {
    const replacement = authority.replacements.get(input.path);
    if (replacement && input.rawSha256 === replacement.previousRawSha256) historical.set(input.path, replacement.supersededCopy);
  }
  return (relative) => {
    const bytes = read(historical.get(relative) ?? relative);
    if (!Buffer.isBuffer(bytes)) throw new Error(`MISSING_INPUT ${relative}`);
    return bytes;
  };
}

module.exports = Object.freeze({
  HEAD, BASELINE, CHECKER, MODIFIED, SOURCES, EVIDENCE, CAPTURES, addendumPath, sha,
  readRepository, verifyHead, verifyAuthority, manifestReader,
});
