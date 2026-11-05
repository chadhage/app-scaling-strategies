'use strict';

// U020: owned, chained, append-only amendment path for sealed C034 test files. The seal is never rewritten: evidence-index-addendum-N.json
// supersedes only the closed AMENDABLE files (naming the exact bytes it supersedes and the exact bytes that replace them) and indexes new
// evidence files by raw SHA-256, never a sealed one.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SCHEMA = 'C034-evidence-index-addendum/1';
const AMENDABLE = Object.freeze(['capability\\C034\\tests\\integrity.test.cjs', 'capability\\C034\\tests\\surface.test.cjs']);
const SURFACE_EDIT = Object.freeze({
  before: "  const bytes = fs.readFileSync(path.join(repository, '.git', 'kanban-orchestrator', 'publish.ps1'));",
  after: "  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'publish-f6df80bdafc0.ps1.txt'));"
});
const NAME = /^evidence-index-addendum-([1-9][0-9]*)\.json$/;
const SHA = /^[0-9a-f]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOP = ['schema', 'cardId', 'sequence', 'createdAtUtc', 'item', 'reason', 'base', 'previous', 'amendments', 'evidence'];
const STEP = ['path', 'status', 'previousRawSha256', 'rawSha256', 'edit'];
const STATUSES = ['applied', 'authorized'];
const EVIDENCE_ROOT = 'capability\\C034\\evidence\\';
const RAW_ROOT = 'capability\\C034\\evidence\\raw\\';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const short = (value) => value.slice(0, 8);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const closed = (value, keys) => plain(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const text = (value) => typeof value === 'string' && value.trim() !== '';
const addendumName = (sequence) => `evidence-index-addendum-${sequence}.json`;
function fail(code, detail) {
  throw Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
}

// The one-line K-C034 edit of the sealed surface test: line 41 reads the archived publisher snapshot, not the live private publisher.
function applySurfaceEdit(bytes) {
  const anchor = `${SURFACE_EDIT.before}\r\n`;
  const source = bytes.toString('utf8');
  if (source.split(anchor).length !== 2) fail('SURFACE_EDIT_ANCHOR', 'the sealed line must occur exactly once with a CRLF line ending');
  return Buffer.from(source.replace(anchor, `${SURFACE_EDIT.after}\r\n`));
}

function buildAddendum({ sequence, createdAtUtc, item, reason, base, previous, amendments, evidence = [] }) {
  return Buffer.from(`${JSON.stringify({ schema: SCHEMA, cardId: 'C034', sequence, createdAtUtc, item, reason, base, previous, amendments, evidence }, null, 2)}\n`);
}

function listAddenda(directory) {
  return fs.readdirSync(directory).map((name) => [name, NAME.exec(name)]).filter(([, match]) => match)
    .sort((a, b) => Number(a[1][1]) - Number(b[1][1])).map(([name]) => {
      const stat = fs.lstatSync(path.join(directory, name));
      if (!stat.isFile() || stat.nlink !== 1) fail('ADDENDUM_FILE', name);
      return { name, bytes: fs.readFileSync(path.join(directory, name)) };
    });
}

function readAddendum({ name, bytes }, sequence, base, previous) {
  if (name !== addendumName(sequence)) fail('ADDENDUM_SEQUENCE', `${name} is not addendum ${sequence}`);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('ADDENDUM_JSON', name); }
  if (!closed(value, TOP)) fail('ADDENDUM_SHAPE', name);
  if (value.schema !== SCHEMA || value.cardId !== 'C034') fail('ADDENDUM_SCHEMA', name);
  if (value.sequence !== sequence) fail('ADDENDUM_SEQUENCE', `${name} claims ${value.sequence}`);
  if (!TIME.test(value.createdAtUtc) || !text(value.item) || !text(value.reason) || !Array.isArray(value.amendments) || !value.amendments.length ||
      !Array.isArray(value.evidence)) {
    fail('ADDENDUM_SHAPE', name);
  }
  if (!closed(value.base, ['path', 'rawSha256']) || value.base.path !== base.path || value.base.rawSha256 !== base.rawSha256) fail('ADDENDUM_BASE', name);
  const linked = previous === null ? value.previous === null : closed(value.previous, ['name', 'rawSha256']) &&
    value.previous.name === previous.name && value.previous.rawSha256 === previous.rawSha256;
  if (!linked) fail('ADDENDUM_CHAIN', name);
  return value;
}

function resolveChain({ sealed, base, addenda }) {
  const sealedHashes = new Map(sealed.map((entry) => [entry.path, entry.rawSha256]));
  const history = new Map();
  const evidence = new Map();
  let previous = null;
  addenda.forEach((addendum, index) => {
    const sequence = index + 1;
    const value = readAddendum(addendum, sequence, base, previous);
    const seen = new Set();
    for (const step of value.amendments) {
      if (!closed(step, STEP) || !text(step.edit)) fail('ADDENDUM_SHAPE', addendum.name);
      if (!AMENDABLE.includes(step.path)) fail('AMENDMENT_PATH_NOT_ALLOWED', step.path);
      if (!STATUSES.includes(step.status)) fail('AMENDMENT_STATUS', `${step.path}: ${step.status}`);
      if (!SHA.test(step.previousRawSha256) || !SHA.test(step.rawSha256)) fail('AMENDMENT_HASH', step.path);
      if (seen.has(step.path)) fail('AMENDMENT_DUPLICATE_PATH', step.path);
      seen.add(step.path);
      const head = history.get(step.path)?.at(-1)?.rawSha256 ?? sealedHashes.get(step.path);
      if (step.previousRawSha256 !== head) fail('AMENDMENT_PREVIOUS_MISMATCH', `${step.path}: names ${short(step.previousRawSha256)}, current is ${short(head ?? 'none')}`);
      if (step.rawSha256 === step.previousRawSha256) fail('AMENDMENT_NOOP', step.path);
      history.set(step.path, [...(history.get(step.path) || []), { sequence, item: value.item, status: step.status,
        previousRawSha256: step.previousRawSha256, rawSha256: step.rawSha256 }]);
    }
    for (const entry of value.evidence) {
      if (!closed(entry, ['path', 'rawSha256']) || typeof entry.path !== 'string' || !SHA.test(entry.rawSha256)) fail('EVIDENCE_ENTRY', addendum.name);
      if (!entry.path.startsWith(EVIDENCE_ROOT) || entry.path.startsWith(RAW_ROOT) || sealedHashes.has(entry.path)) fail('EVIDENCE_PATH_NOT_ALLOWED', entry.path);
      if (evidence.has(entry.path)) fail('EVIDENCE_DUPLICATE', entry.path);
      evidence.set(entry.path, entry.rawSha256);
    }
    previous = { name: addendum.name, rawSha256: hash(addendum.bytes) };
  });
  return { count: addenda.length, tip: previous, history, evidence };
}

// An authorized step is the exact pre-approved replacement: the file may still hold the superseded bytes until the edit is made.
function workingAccepted(chain, entry) {
  const last = chain.history.get(entry.path)?.at(-1);
  if (!last) return [entry.rawSha256];
  return last.status === 'authorized' ? [last.previousRawSha256, last.rawSha256] : [last.rawSha256];
}

const publishedAccepted = (chain, entry) => [entry.rawSha256, ...(chain.history.get(entry.path) || []).map((step) => step.rawSha256)];

function checkSealed({ entries, chain, read }) {
  for (const entry of entries) {
    const bytes = read(entry.path);
    const actual = hash(bytes);
    const accepted = workingAccepted(chain, entry);
    if (!accepted.includes(actual)) fail('SEALED_BYTES_CHANGED', `${entry.path} expected ${accepted.map(short).join(' or ')} actual ${short(actual)}`);
    if (actual === entry.rawSha256 && entry.crlfToLfSha256 && hash(normalize(bytes)) !== entry.crlfToLfSha256) fail('SEALED_LF_BYTES_CHANGED', entry.path);
  }
  return entries.length;
}

function checkPublished({ entries, chain, blobs }) {
  let published = 0;
  for (const entry of entries) {
    const bytes = blobs.get(entry.path);
    if (!bytes) continue;
    published += 1;
    const actual = hash(bytes);
    if (!publishedAccepted(chain, entry).includes(actual)) fail('PUBLISHED_BYTES_CHANGED', `${entry.path} actual ${short(actual)}`);
  }
  if (published && published !== entries.length) fail('PUBLISHED_PARTIAL', `${published} of ${entries.length} sealed files are committed`);
  return { published, total: entries.length };
}

function checkEvidence({ chain, read }) {
  for (const [file, expected] of chain.evidence) {
    const actual = hash(read(file));
    if (actual !== expected) fail('EVIDENCE_BYTES_CHANGED', `${file} expected ${short(expected)} actual ${short(actual)}`);
  }
  return chain.evidence.size;
}

function checkAddendaAgainstHead({ working, head }) {
  const current = new Map(working.map((addendum) => [addendum.name, addendum.bytes]));
  for (const committed of head) {
    if (!current.has(committed.name)) fail('ADDENDUM_MISSING_AFTER_PUBLICATION', committed.name);
    if (hash(current.get(committed.name)) !== hash(committed.bytes)) fail('ADDENDUM_MODIFIED_AFTER_PUBLICATION', committed.name);
  }
}

module.exports = Object.freeze({ SCHEMA, AMENDABLE, SURFACE_EDIT, hash, normalize, applySurfaceEdit, addendumName, buildAddendum, listAddenda,
  resolveChain, workingAccepted, publishedAccepted, checkSealed, checkPublished, checkEvidence, checkAddendaAgainstHead });
