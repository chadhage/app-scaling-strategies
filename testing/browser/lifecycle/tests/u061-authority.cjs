'use strict';

const { createHash } = require('node:crypto');
const BASE_PATH = 'evidence\\u061\\authority-base.json';
const BASE_SHA256 = 'cdb940eb13a201560e33fe784f702a4e1df12efb514a5c528d4df9e534b36dec';
const HELPER_PATH = 'tests\\u061-authority.cjs';
const AMENDABLE = Object.freeze(['tests\\u005-evidence.test.cjs', 'tests\\u006-evidence.test.cjs']);
const SHA = /^[0-9a-f]{64}$/;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const refuse = (code, detail) => { throw Object.assign(new Error(code + ': ' + detail), { code }); };
function bytesOf(read, path) {
  let bytes;
  try { bytes = read(path); }
  catch { refuse('U061_SOURCE_MISSING', path); }
  if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024) refuse('U061_SOURCE_BYTES', path);
  return bytes;
}
function parse(bytes, path) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { refuse('U061_AUTHORITY_JSON', path); }
}
function exactPair(value) {
  return closed(value, ['rawSha256', 'crlfToLfSha256']) && SHA.test(value.rawSha256) && SHA.test(value.crlfToLfSha256);
}
const matches = (bytes, pair) => hash(bytes) === pair.rawSha256 || hash(bytes) === pair.crlfToLfSha256;
function createAuthority(base, read) {
  const original = bytesOf(read, BASE_PATH);
  if (hash(original) !== BASE_SHA256 || JSON.stringify(parse(original, BASE_PATH)) !== JSON.stringify(base)) refuse('U061_BASE_CHANGED', BASE_PATH);
  if (!closed(base, ['schema','cardId','captures','originals']) || base.schema !== 'U061-original-authority/1'
    || base.cardId !== 'U061' || base.captures.length !== 6 || base.originals.length !== 2) refuse('U061_BASE_SHAPE', BASE_PATH);
  const originalFiles = new Map();
  for (const entry of base.originals) {
    if (!AMENDABLE.includes(entry.path) || originalFiles.has(entry.path)) refuse('U061_ORIGINAL_PATH', entry.path);
    const bytes = bytesOf(read, entry.retained);
    if (hash(bytes) !== entry.rawSha256 || hash(canonical(bytes)) !== entry.crlfToLfSha256) refuse('U061_ORIGINAL_CHANGED', entry.retained);
    originalFiles.set(entry.path, { rawSha256: entry.rawSha256, crlfToLfSha256: entry.crlfToLfSha256 });
  }
  const inventory = new Map();
  for (const entry of base.captures) {
    if (inventory.has(entry.path)) refuse('U061_CAPTURE_DUPLICATE', entry.path);
    const bytes = bytesOf(read, entry.path);
    if (hash(bytes) !== entry.rawSha256) refuse('U061_MANIFEST_CHANGED', entry.path);
    const manifest = parse(bytes, entry.path);
    const expected = entry.card === 'u005' ? 3 : entry.card === 'u006' ? 2 : 0;
    if (entry.inputs.length !== expected || manifest.exitCode !== 1 || manifest.timedOut !== false) refuse('U061_ORIGINAL_CAPTURE', entry.path);
    const inputs = new Map();
    for (const input of entry.inputs) {
      const recorded = manifest.inputs.find((i) => i.path === 'testing\\browser\\lifecycle\\' + input.path);
      if (!recorded || recorded.rawSha256 !== input.rawSha256 || recorded.crlfToLfSha256 !== input.crlfToLfSha256 || recorded.bytes !== input.bytes) refuse('U061_RECORDED_PAIR_CHANGED', input.path);
      if (inputs.has(input.path)) refuse('U061_INPUT_DUPLICATE', input.path);
      const raw = bytesOf(read, input.retained);
      if (hash(raw) !== input.rawSha256 || hash(canonical(raw)) !== input.crlfToLfSha256 || raw.length !== input.bytes) refuse('U061_RETAINED_RAW_CHANGED', input.path);
      inputs.set(input.path, input);
    }
    inventory.set(entry.path, { digest: entry.rawSha256, inputs });
  }
  function verifyStable(manifestPath, inputPath, bytes) {
    const entry = inventory.get(manifestPath);
    if (!entry) return Object.freeze({ ok:false, code:'U061_MANIFEST_UNKNOWN', representation:null });
    if (hash(bytesOf(read, manifestPath)) !== entry.digest) return Object.freeze({ ok:false, code:'U061_MANIFEST_CHANGED', representation:null });
    const input = entry.inputs.get(inputPath);
    if (!input || !Buffer.isBuffer(bytes)) return Object.freeze({ ok:false, code:'U061_INPUT_UNKNOWN', representation:null });
    const digest = hash(bytes);
    const representation = digest === input.rawSha256 ? 'raw' : digest === input.crlfToLfSha256 ? 'lf-canonical' : null;
    return Object.freeze({ ok:representation !== null, code:representation ? 'U061_PROVENANCE_MATCH' : 'U061_STABLE_BYTES_CHANGED', representation });
  }
  function verifyCurrent(headPath = 'evidence\\u061\\authority-head-1.json') {
    const headName = /^evidence\\u061\\authority-head-([1-9]\d*)\.json$/.exec(headPath);
    if (!headName) refuse('U061_HEAD_PATH', headPath);
    const head = parse(bytesOf(read, headPath), headPath);
    if (!closed(head, ['schema','cardId','sequence','baseSha256','addendumPath','addendumSha256']) || head.schema !== 'U061-authority-head/1'
      || head.cardId !== 'U061' || head.sequence !== Number(headName[1]) || head.sequence > 32 || head.baseSha256 !== BASE_SHA256
      || !SHA.test(head.addendumSha256)) refuse('U061_HEAD_SHAPE', headPath);
    const current = new Map(originalFiles);
    let previous = null, helper = null;
    for (let sequence = 1; sequence <= head.sequence; sequence += 1) {
      const path = `evidence\\u061\\authority-addendum-${sequence}.json`;
      const raw = bytesOf(read, path), item = parse(raw, path);
      if (!closed(item, ['schema','cardId','sequence','base','previous','helper','amendments']) || item.schema !== 'U061-authority-addendum/1'
        || item.cardId !== 'U061' || item.sequence !== sequence || !closed(item.base,['path','rawSha256'])
        || item.base.path !== BASE_PATH || item.base.rawSha256 !== BASE_SHA256) refuse('U061_ADDENDUM_SHAPE', path);
      const linked = previous === null ? item.previous === null : closed(item.previous,['path','rawSha256'])
        && item.previous.path === previous.path && item.previous.rawSha256 === previous.rawSha256;
      if (!linked) refuse('U061_CHAIN_CHANGED', path);
      if (!closed(item.helper,['path','rawSha256','crlfToLfSha256']) || item.helper.path !== HELPER_PATH
        || !SHA.test(item.helper.rawSha256) || !SHA.test(item.helper.crlfToLfSha256)) refuse('U061_HELPER_ENTRY', path);
      if (!Array.isArray(item.amendments) || item.amendments.length !== AMENDABLE.length) refuse('U061_AMENDMENTS_COUNT', path);
      const seen = new Set();
      for (const step of item.amendments) {
        if (!closed(step,['path','previous','current']) || !AMENDABLE.includes(step.path) || seen.has(step.path)
          || !exactPair(step.previous) || !exactPair(step.current)) refuse('U061_AMENDMENT_PATH', path);
        seen.add(step.path);
        const predecessor = current.get(step.path);
        if (step.previous.rawSha256 !== predecessor.rawSha256 || step.previous.crlfToLfSha256 !== predecessor.crlfToLfSha256) refuse('U061_PREDECESSOR_CHANGED', step.path);
        if (step.current.rawSha256 === predecessor.rawSha256 || step.current.crlfToLfSha256 === predecessor.crlfToLfSha256) refuse('U061_AMENDMENT_NOOP', step.path);
        current.set(step.path, step.current);
      }
      helper = item.helper;
      previous = { path, rawSha256:hash(raw) };
    }
    if (head.addendumPath !== previous.path || head.addendumSha256 !== previous.rawSha256) refuse('U061_HEAD_CHANGED', headPath);
    if (!matches(bytesOf(read, HELPER_PATH), helper)) refuse('U061_HELPER_CHANGED', HELPER_PATH);
    for (const [path, pair] of current) if (!matches(bytesOf(read, path), pair)) refuse('U061_CURRENT_VERIFIER_CHANGED', path);
    return Object.freeze({ cardId:'U061', sequence:head.sequence, currentVerifiers:Object.freeze([...current.keys()]) });
  }
  return Object.freeze({ verifyStable, verifyCurrent });
}
function loadAuthority(read) {
  const authority = createAuthority(parse(bytesOf(read, BASE_PATH), BASE_PATH), read);
  authority.verifyCurrent();
  return authority;
}
module.exports = Object.freeze({ createAuthority, loadAuthority, hash, canonical, BASE_PATH, BASE_SHA256, HELPER_PATH, AMENDABLE });
