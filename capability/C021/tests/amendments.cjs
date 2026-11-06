'use strict';

// U032: owned, chained, append-only amendment path for the sealed C021 integrity test, plus the C020 drift rule that test runs.
// The sealed manifest evidence.json is never rewritten. evidence-addendum-N.json supersedes only the closed AMENDABLE files, naming the exact
// bytes it supersedes and the exact bytes that replace them, and indexes later evidence files by raw SHA-256 (never a sealed one).
// The pure functions take their bytes through read(path), so the tests use in-memory fixtures.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SCHEMA = 'C021-evidence-addendum/1';
const MANIFEST_PATH = 'capability\\C021\\evidence.json';
const AMENDABLE = Object.freeze(['capability\\C021\\tests\\integrity.test.cjs']);
const EVIDENCE_ROOT = 'capability\\C021\\evidence\\u032-integrity-amendment\\';
// Everything except Added (A) and Copied (C): modified, deleted, renamed, type-changed, unmerged, unknown and broken pairs still count.
const DRIFT_FILTER = 'MDTUXBR';
const NAME = /^evidence-addendum-([1-9][0-9]*)\.json$/;
const SHA = /^[0-9a-f]{64}$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const TOP = ['schema', 'cardId', 'sequence', 'item', 'reason', 'base', 'previous', 'amendments', 'evidence'];
const STEP = ['path', 'previousRawSha256', 'rawSha256', 'edit'];

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const short = (value) => String(value).slice(0, 8);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const closed = (value, keys) => plain(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const text = (value) => typeof value === 'string' && value.trim() !== '';
const addendumName = (sequence) => `evidence-addendum-${sequence}.json`;
function fail(code, detail) {
  throw Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
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
  if (value.schema !== SCHEMA || value.cardId !== 'C021') fail('ADDENDUM_SCHEMA', name);
  if (value.sequence !== sequence) fail('ADDENDUM_SEQUENCE', `${name} claims ${value.sequence}`);
  if (!text(value.item) || !text(value.reason) || !Array.isArray(value.amendments) || !Array.isArray(value.evidence) ||
      !(value.amendments.length || value.evidence.length)) {
    fail('ADDENDUM_SHAPE', name);
  }
  if (!closed(value.base, ['path', 'rawSha256']) || value.base.path !== base.path || value.base.rawSha256 !== base.rawSha256) fail('ADDENDUM_BASE', name);
  const linked = previous === null ? value.previous === null
    : closed(value.previous, ['name', 'rawSha256']) && value.previous.name === previous.name && value.previous.rawSha256 === previous.rawSha256;
  if (!linked) fail('ADDENDUM_CHAIN', name);
  return value;
}

function confined(file) {
  if (!file.startsWith(EVIDENCE_ROOT)) return false;
  return file.slice(EVIDENCE_ROOT.length).split('\\').every((segment) => SEGMENT.test(segment) && !segment.startsWith('..') && !segment.endsWith('.'));
}

// sealed: [{ path, sha256 }] from evidence.json sourceHashes; base: the raw SHA-256 of evidence.json; addenda: [{ name, bytes }] in order.
function resolveChain({ sealed, base, addenda }) {
  const sealedHashes = new Map(sealed.map((entry) => [entry.path, entry.sha256]));
  const head = new Map();
  const evidence = new Map();
  let previous = null;
  addenda.forEach((addendum, index) => {
    const value = readAddendum(addendum, index + 1, base, previous);
    const seen = new Set();
    for (const step of value.amendments) {
      if (!closed(step, STEP) || !text(step.edit)) fail('ADDENDUM_SHAPE', addendum.name);
      if (!AMENDABLE.includes(step.path)) fail('AMENDMENT_PATH_NOT_ALLOWED', step.path);
      if (!SHA.test(step.previousRawSha256) || !SHA.test(step.rawSha256)) fail('AMENDMENT_HASH', step.path);
      if (seen.has(step.path)) fail('AMENDMENT_DUPLICATE_PATH', step.path);
      seen.add(step.path);
      const current = head.get(step.path) ?? sealedHashes.get(step.path);
      if (step.previousRawSha256 !== current) {
        fail('AMENDMENT_PREVIOUS_MISMATCH', `${step.path}: names ${short(step.previousRawSha256)}, current is ${short(current ?? 'none')}`);
      }
      if (step.rawSha256 === step.previousRawSha256) fail('AMENDMENT_NOOP', step.path);
      head.set(step.path, step.rawSha256);
    }
    for (const entry of value.evidence) {
      if (!closed(entry, ['path', 'rawSha256']) || typeof entry.path !== 'string' || !SHA.test(entry.rawSha256)) fail('EVIDENCE_ENTRY', addendum.name);
      if (!confined(entry.path) || sealedHashes.has(entry.path)) fail('EVIDENCE_PATH_NOT_ALLOWED', entry.path);
      if (evidence.has(entry.path)) fail('EVIDENCE_DUPLICATE', entry.path);
      evidence.set(entry.path, entry.rawSha256);
    }
    previous = { name: addendum.name, rawSha256: hash(addendum.bytes) };
  });
  return { count: addenda.length, tip: previous, head, evidence };
}

// A sealed file must keep its sealed bytes unless the chain superseded them; then only the head bytes of the chain are accepted.
function checkSealed({ entries, chain, read }) {
  for (const entry of entries) {
    const bytes = read(entry.path);
    if (!Buffer.isBuffer(bytes)) fail('SEALED_FILE_MISSING', entry.path);
    const expected = chain.head.get(entry.path) ?? entry.sha256;
    const actual = hash(bytes);
    if (actual !== expected) fail('SEALED_BYTES_CHANGED', `${entry.path} expected ${short(expected)} actual ${short(actual)}`);
  }
  return entries.length;
}

function checkEvidence({ chain, read }) {
  for (const [file, expected] of chain.evidence) {
    const actual = hash(read(file));
    if (actual !== expected) fail('EVIDENCE_BYTES_CHANGED', `${file} expected ${short(expected)} actual ${short(actual)}`);
  }
  return chain.evidence.size;
}

const driftArgs = (commit) => ['--no-pager', 'diff', '--exit-code', '--no-renames', '--name-status', `--diff-filter=${DRIFT_FILTER}`, commit, '--', 'capability/C020'];

// Name-status lines of every modified, deleted, renamed or otherwise changed (not added) path of capability/C020 against the accepted commit.
function c020Drift({ cwd, commit, env = process.env, run = spawnSync }) {
  const result = run('git', driftArgs(commit), { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 120000, killSignal: 'SIGKILL' });
  if (result.error || (result.status !== 0 && result.status !== 1)) fail('DRIFT_GIT_FAILED', String(result.error ? result.error.message : result.stderr).trim());
  const lines = result.stdout.split('\n').map((line) => line.trimEnd()).filter(Boolean);
  return result.status === 1 && !lines.length ? ['?\t(a difference without a listed path)'] : lines;
}

module.exports = Object.freeze({ SCHEMA, MANIFEST_PATH, AMENDABLE, EVIDENCE_ROOT, DRIFT_FILTER, hash, addendumName, listAddenda, resolveChain,
  checkSealed, checkEvidence, driftArgs, c020Drift });
