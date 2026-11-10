'use strict';

const { createHash } = require('node:crypto');
const BASE = 'evidence\\u062\\authority-base.json';
const BASE_SHA = '0f7e1945a662bf72fc78f385a5ebe37b4bdb6209a5722fc4e619e833fe950af8';
const HEAD = 'evidence\\u062\\authority-head-1.json';
const ADDENDUM = 'evidence\\u062\\authority-addendum-1.json';
const AMENDABLE = Object.freeze([
  'tests\\u005-real.test.cjs', 'tests\\u006-real.test.cjs', 'tests\\u006-support-real.cjs',
  'tests\\u005-fix-evidence.test.cjs', 'tests\\u006-fix-evidence.test.cjs', 'tests\\u006-imports.test.cjs',
]);
const FRESH = Object.freeze([
  'U062.feature', 'README-U062.md', 'tests\\u006-owned-lookalike.cjs',
  'tests\\u006-u062-world.cjs', 'tests\\u006-u062-fixture.test.cjs',
  'tests\\u006-u062-authority.cjs', 'tests\\u006-u062-evidence.cjs',
  'evidence\\u062\\u006-u062-retained-fixture.cjs',
]);
const READONLY = Object.freeze(['testing\\browser\\isolated.cjs', 'testing\\browser\\fixtures\\counter.html']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const triples = (bytes) => {
  const canonical = lf(bytes);
  return { rawSha256: hash(bytes), lfSha256: hash(canonical), crlfSha256: hash(Buffer.from(canonical.toString('latin1').replace(/\n/g, '\r\n'), 'latin1')) };
};
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const digestSet = (value) => closed(value, ['rawSha256', 'lfSha256', 'crlfSha256'])
  && Object.values(value).every((entry) => typeof entry === 'string' && /^[0-9a-f]{64}$/.test(entry));
const same = (left, right) => digestSet(left) && digestSet(right)
  && Object.keys(left).every((key) => left[key] === right[key]);
const matches = (bytes, digests) => Buffer.isBuffer(bytes) && Object.values(digests).includes(hash(bytes));
const refuse = (code, message) => { throw Object.assign(new Error(`${code}: ${message}`), { code }); };

function loadAuthority(read, readImport) {
  const bytesOf = (file) => {
    let bytes;
    try { bytes = read(file); } catch { refuse('U062_SOURCE_MISSING', file); }
    if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024) refuse('U062_SOURCE_BYTES', file);
    return bytes;
  };
  const parse = (file) => {
    try { return JSON.parse(bytesOf(file).toString('utf8')); } catch (error) {
      if (error.code && error.code.startsWith('U062_')) throw error;
      refuse('U062_JSON', file);
    }
  };
  const baseBytes = bytesOf(BASE);
  if (hash(baseBytes) !== BASE_SHA) refuse('U062_BASE_CHANGED', BASE);
  const base = parse(BASE);
  if (!closed(base, ['schema', 'cardId', 'originals', 'captures', 'readonlyImports', 'predecessor'])
    || base.schema !== 'U062-tooling-base/1' || base.cardId !== 'U062'
    || base.originals.length !== AMENDABLE.length || base.captures.length !== 64 || base.readonlyImports.length !== READONLY.length) {
    refuse('U062_BASE_SHAPE', BASE);
  }
  if (!closed(base.predecessor, ['kind', 'path', 'rawSha256'])
    || base.predecessor.path !== 'evidence\\u061\\authority-head-3.json'
    || hash(bytesOf(base.predecessor.path)) !== base.predecessor.rawSha256) refuse('U062_PREDECESSOR_CHANGED', 'U061 head3');
  const originals = new Map();
  for (const entry of base.originals) {
    if (!AMENDABLE.includes(entry.path) || originals.has(entry.path) || !digestSet(entry.digests)
      || !same(triples(bytesOf(entry.retained)), entry.digests)) refuse('U062_ORIGINAL_CHANGED', entry.path);
    originals.set(entry.path, Object.freeze({ ...entry.digests }));
  }
  const captures = new Map();
  for (const entry of base.captures) {
    const raw = bytesOf(entry.path);
    if (hash(raw) !== entry.rawSha256 || captures.has(entry.rawSha256)) refuse('U062_CAPTURE_CHANGED', entry.path);
    const recorded = parse(entry.path);
    if (!recorded.transcripts || !Array.isArray(recorded.inputs)) refuse('U062_CAPTURE_SHAPE', entry.path);
    captures.set(entry.rawSha256, entry.path);
  }
  const readonly = new Map();
  for (const entry of base.readonlyImports) {
    if (!READONLY.includes(entry.path) || readonly.has(entry.path) || !same(triples(bytesOf(entry.retained)), entry.digests)) {
      refuse('U062_READONLY_BASE_CHANGED', entry.path);
    }
    readonly.set(entry.path, Object.freeze({ ...entry.digests }));
    let actual;
    try { actual = readImport(entry.path); } catch { refuse('U062_READONLY_MISSING', entry.path); }
    if (!matches(actual, entry.digests)) refuse('U062_READONLY_CHANGED', entry.path);
  }
  const head = parse(HEAD);
  if (!closed(head, ['schema', 'cardId', 'sequence', 'baseSha256', 'addendumPath', 'addendumSha256'])
    || head.schema !== 'U062-tooling-head/1' || head.cardId !== 'U062' || head.sequence !== 1
    || head.baseSha256 !== BASE_SHA || head.addendumPath !== ADDENDUM || hash(bytesOf(ADDENDUM)) !== head.addendumSha256) {
    refuse('U062_HEAD_CHANGED', HEAD);
  }
  const addendum = parse(ADDENDUM);
  if (!closed(addendum, ['schema', 'cardId', 'sequence', 'base', 'previous', 'amendments', 'freshFiles'])
    || addendum.schema !== 'U062-tooling-addendum/1' || addendum.cardId !== 'U062' || addendum.sequence !== 1
    || !closed(addendum.base, ['path', 'rawSha256']) || addendum.base.path !== BASE || addendum.base.rawSha256 !== BASE_SHA
    || addendum.previous !== null || !Array.isArray(addendum.amendments) || addendum.amendments.length !== AMENDABLE.length
    || !Array.isArray(addendum.freshFiles) || addendum.freshFiles.length !== FRESH.length) refuse('U062_ADDENDUM_SHAPE', ADDENDUM);
  const current = new Map();
  for (const step of addendum.amendments) {
    if (!closed(step, ['path', 'previous', 'current']) || !AMENDABLE.includes(step.path) || current.has(step.path)
      || !same(step.previous, originals.get(step.path)) || !digestSet(step.current)
      || step.current.lfSha256 === step.previous.lfSha256) refuse('U062_AMENDMENT_CHANGED', step.path);
    if (!matches(bytesOf(step.path), step.current)) refuse('U062_CURRENT_CHANGED', step.path);
    current.set(step.path, Object.freeze({ ...step.current }));
  }
  const fresh = new Set();
  for (const entry of addendum.freshFiles) {
    if (!closed(entry, ['path', 'current']) || !FRESH.includes(entry.path) || fresh.has(entry.path) || !digestSet(entry.current)
      || !matches(bytesOf(entry.path), entry.current)) refuse('U062_FRESH_CHANGED', entry.path);
    fresh.add(entry.path);
  }
  for (const [file, original] of [
    ['evidence\\u062\\retained-subjects\\u005-real.test.cjs.original', 'tests\\u005-real.test.cjs'],
    ['evidence\\u062\\retained-subjects\\u006-support-real.cjs.original', 'tests\\u006-support-real.cjs'],
  ]) {
    if (hash(bytesOf(file)) !== originals.get(original).rawSha256) refuse('U062_REPLAY_SUBJECT_CHANGED', file);
  }
  return Object.freeze({
    baseSha256: BASE_SHA,
    headSha256: hash(bytesOf(HEAD)),
    readonlyPins: () => [...readonly].map(([path, digests]) => ({ path, digests: { ...digests } })),
    canAmend(manifestBytes, input, actual) {
      const capturePath = captures.get(hash(manifestBytes));
      if (!capturePath || hash(bytesOf(capturePath)) !== hash(manifestBytes)) return false;
      const prefix = 'testing\\browser\\lifecycle\\';
      if (!input.path.startsWith(prefix)) return false;
      const source = input.path.slice(prefix.length);
      const original = originals.get(source);
      return Boolean(original && input.crlfToLfSha256 === original.lfSha256 && matches(actual, current.get(source)));
    },
  });
}

module.exports = { loadAuthority, BASE, HEAD, ADDENDUM, AMENDABLE, FRESH, triples };
