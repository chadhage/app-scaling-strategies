'use strict';

// U019: owned, chained, append-only amendment path for the pinned bytes of C015's tests. dependency-pins.json stays the immutable history of the
// accepted C001, C002 and C015 bytes and is never rewritten. dependency-pins-addendum-N.json is the current authority: each addendum supersedes
// whole records of pinned C015 test files (never production files, never C001 or C002), names the exact bytes it supersedes and the exact bytes
// that replace them, and links to its predecessor by LF-canonical hash so the chain also holds in a CRLF checkout. The Git-history canonical
// proof stays on the sealed record and is not part of this module.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SCHEMA = 'C016-dependency-pins-addendum/1';
const PREFIX = 'dependency-pins-addendum';
const NAME = /^dependency-pins-addendum-([1-9][0-9]*)\.json$/;
const AMENDABLE = /^capability\\C015\\tests\\[^\\]+$/;
const SHA = /^[0-9a-f]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOP = ['schema', 'cardId', 'sequence', 'createdAtUtc', 'item', 'reason', 'base', 'previous', 'replacements'];
const STEP = ['file', 'status', 'edit', 'previous', 'current'];
const SUPERSEDED = ['rawBytes', 'rawSha256', 'rawCRLF'];
const CURRENT = [...SUPERSEDED, 'gitCanonicalBytes', 'gitCanonicalSha256'];
const STATUSES = ['applied', 'authorized'];

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lfBytes = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const lfHash = (bytes) => hash(lfBytes(bytes));
const crlfCount = (bytes) => (bytes.toString('utf8').match(/\r\n/g) || []).length;
const short = (digest) => digest.slice(0, 8);
const plain = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);
const closed = (item, keys) => plain(item) && Object.keys(item).sort().join() === [...keys].sort().join();
const text = (item) => typeof item === 'string' && item.trim() !== '';
const whole = (item, minimum) => Number.isInteger(item) && item >= minimum;
const addendumName = (sequence) => `${PREFIX}-${sequence}.json`;
const sound = (item, full) => SHA.test(item.rawSha256) && whole(item.rawBytes, 1) && whole(item.rawCRLF, 0) &&
  (!full || (SHA.test(item.gitCanonicalSha256) && whole(item.gitCanonicalBytes, 1)));
function fail(code, detail) {
  throw Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
}

const buildAddendum = (item) => Buffer.from(`${JSON.stringify(item, null, 2)}\n`);

function listAddenda(directory, api = fs) {
  const names = api.readdirSync(directory).filter((name) => name.startsWith(PREFIX));
  for (const name of names) if (!NAME.test(name)) fail('ADDENDUM_SEQUENCE', `${name} is not a numbered addendum name`);
  return names.sort((a, b) => Number(NAME.exec(a)[1]) - Number(NAME.exec(b)[1])).map((name) => {
    if (!api.lstatSync(path.join(directory, name)).isFile()) fail('ADDENDUM_FILE', name);
    return { name, bytes: api.readFileSync(path.join(directory, name)) };
  });
}

function parse({ name, bytes }, sequence, pinsLf, previous) {
  if (name !== addendumName(sequence)) fail('ADDENDUM_SEQUENCE', `${name} is not addendum ${sequence}`);
  let item;
  try { item = JSON.parse(bytes.toString('utf8')); } catch { fail('ADDENDUM_JSON', name); }
  if (!closed(item, TOP)) fail('ADDENDUM_SHAPE', `${name}: unexpected key set`);
  if (item.schema !== SCHEMA || item.cardId !== 'C016') fail('ADDENDUM_SCHEMA', name);
  if (item.sequence !== sequence) fail('ADDENDUM_SEQUENCE', `${name} claims ${item.sequence}`);
  if (!TIME.test(item.createdAtUtc) || !text(item.item) || !text(item.reason) || !Array.isArray(item.replacements) || !item.replacements.length ||
      !closed(item.base, ['path', 'lfSha256'])) {
    fail('ADDENDUM_SHAPE', name);
  }
  if (item.base.path !== 'dependency-pins.json' || item.base.lfSha256 !== pinsLf) fail('ADDENDUM_BASE', name);
  const linked = previous === null ? item.previous === null : closed(item.previous, ['name', 'lfSha256']) &&
    item.previous.name === previous.name && item.previous.lfSha256 === previous.lfSha256;
  if (!linked) fail('ADDENDUM_CHAIN', name);
  return item;
}

function checkStep(step, sealed, history, seen, label) {
  if (!closed(step, STEP) || typeof step.file !== 'string' || !text(step.edit)) fail('ADDENDUM_SHAPE', label);
  if (!AMENDABLE.test(step.file) || !sealed.has(step.file)) fail('AMENDMENT_PATH_NOT_ALLOWED', step.file);
  if (!STATUSES.includes(step.status)) fail('AMENDMENT_STATUS', `${step.file}: ${step.status}`);
  if (!closed(step.previous, SUPERSEDED) || !closed(step.current, CURRENT)) fail('ADDENDUM_SHAPE', `${label}: ${step.file}`);
  if (!sound(step.previous, false) || !sound(step.current, true)) fail('AMENDMENT_HASH', step.file);
  if (seen.has(step.file)) fail('AMENDMENT_DUPLICATE_PATH', step.file);
  seen.add(step.file);
  const head = history.get(step.file)?.at(-1)?.current ?? sealed.get(step.file);
  if (SUPERSEDED.some((key) => step.previous[key] !== head[key])) {
    fail('AMENDMENT_PREVIOUS_MISMATCH', `${step.file}: names ${short(step.previous.rawSha256)}, current is ${short(head.rawSha256)}`);
  }
  if (step.current.rawSha256 === step.previous.rawSha256) fail('AMENDMENT_NOOP', step.file);
}

function resolveChain({ pins, pinsBytes, addenda, trusted = [] }) {
  trusted.forEach((pin, index) => {
    const actual = addenda[index];
    if (!actual) fail('ADDENDUM_TRUSTED_MISSING', pin.name);
    if (actual.name !== pin.name || lfHash(actual.bytes) !== pin.lfSha256) fail('ADDENDUM_TRUSTED_MISMATCH', actual.name);
  });
  const sealed = new Map(pins.records.map((entry) => [entry.file, entry]));
  const pinsLf = lfHash(pinsBytes);
  const history = new Map();
  let previous = null;
  addenda.forEach((addendum, index) => {
    const sequence = index + 1;
    const item = parse(addendum, sequence, pinsLf, previous);
    const seen = new Set();
    for (const step of item.replacements) {
      checkStep(step, sealed, history, seen, addendum.name);
      history.set(step.file, [...(history.get(step.file) || []), { sequence, item: item.item, status: step.status, current: step.current }]);
    }
    previous = { name: addendum.name, lfSha256: lfHash(addendum.bytes) };
  });
  return { count: addenda.length, tip: previous, history };
}

// A file may hold the state before the newest step while that step is only authorized (the edit is not made yet); an applied step accepts its
// replacement only. Older states stop being accepted once a later addendum supersedes them.
function acceptedRecords(chain, entry) {
  const steps = chain.history.get(entry.file) || [];
  if (!steps.length) return [{ source: 'sealed', record: entry }];
  const last = steps.at(-1);
  const replaced = { source: `addendum-${last.sequence}`, record: last.current };
  if (last.status === 'applied') return [replaced];
  const before = steps.length > 1 ? { source: `addendum-${steps.at(-2).sequence}`, record: steps.at(-2).current } : { source: 'sealed', record: entry };
  return [before, replaced];
}

function checkRaw(chain, entry, raw) {
  const accepted = acceptedRecords(chain, entry);
  const actual = hash(raw);
  const match = accepted.find((state) => state.record.rawSha256 === actual);
  if (!match) {
    const expected = accepted.map((state) => `${short(state.record.rawSha256)} (${state.record.rawBytes} bytes, ${state.source})`).join(' or ');
    fail('PIN_BYTES_CHANGED', `${entry.file} expected ${expected}, actual ${short(actual)} (${raw.length} bytes)`);
  }
  if (raw.length !== match.record.rawBytes || crlfCount(raw) !== match.record.rawCRLF) fail('PIN_RECORD_INCONSISTENT', `${entry.file} (${match.source})`);
  if (match.source !== 'sealed') {
    const canonical = lfBytes(raw);
    if (canonical.length !== match.record.gitCanonicalBytes || hash(canonical) !== match.record.gitCanonicalSha256) fail('PIN_CANONICAL_MISMATCH', `${entry.file} (${match.source})`);
  }
  return match;
}

module.exports = Object.freeze({ SCHEMA, AMENDABLE, hash, lfHash, crlfCount, addendumName, buildAddendum, listAddenda, resolveChain, acceptedRecords, checkRaw });
