'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SCHEMA = 'X001-U049-addendum/1';
const BASE_PATH = 'evidence\\fix\\green\\green-suite-final.json';
const BASE_SHA = '25ab363dcd5deb715b59d996c15f2be7f6a9f322fe1436079c2c0e882e151f5c';
const AUTHORITY_PATH = 'evidence\\u049\\base-authority.json';
const AMENDABLE = Object.freeze(['timeline.js', 'tests\\evidence-check.cjs', 'tests\\evidence.test.cjs']);
const NAME = /^evidence-index-addendum-([1-9][0-9]*)\.json$/;
const SHA = /^[0-9a-f]{64}$/;
const TOP = ['schema', 'cardId', 'item', 'sequence', 'base', 'previous', 'replacements', 'additions'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const closed = (value, keys) => plain(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const digest = (value) => typeof value === 'string' && SHA.test(value);

class IntegrityError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
const fail = (code, detail) => { throw new IntegrityError(code, detail); };
const confined = (file) => typeof file === 'string' && file.split('\\').every((segment) =>
  /^[A-Za-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..' && !segment.endsWith('.')
  && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
const additionAllowed = (file) => confined(file) && (
  ['U049.feature', 'U049.md'].includes(file)
  || /^tests\\u049-[a-z0-9.-]+\.(?:cjs|json)$/.test(file)
  || file.startsWith('evidence\\u049\\')
);

function resolve({ authorityBytes, addenda, trusted, read }) {
  if (hash(read(BASE_PATH)) !== BASE_SHA) fail('BASE_BYTES_CHANGED', BASE_PATH);
  if (!trusted || hash(authorityBytes) !== trusted.baseAuthoritySha256) fail('BASE_AUTHORITY_CHANGED', AUTHORITY_PATH);
  let base;
  try { base = JSON.parse(authorityBytes.toString('utf8')); } catch { fail('BASE_AUTHORITY_JSON', AUTHORITY_PATH); }
  if (!closed(base, ['schema', 'cardId', 'acceptedFixCommit', 'acceptedTimelineRawSha256', 'files'])
      || base.schema !== 'X001-U049-base-authority/1' || base.cardId !== 'X001'
      || base.acceptedFixCommit !== 'cfff098ac9313fdd5fbff03bcd27f52d78ac1e5e'
      || base.acceptedTimelineRawSha256 !== 'ca3569a8906ee80f6c21b182d532f61b80d00e04cf01dc365d4da428611d380c'
      || !Array.isArray(base.files) || base.files.length !== 120) fail('BASE_AUTHORITY_SHAPE', AUTHORITY_PATH);
  const sealed = new Map();
  for (const entry of base.files) {
    if (!closed(entry, ['path', 'bytes', 'rawSha256']) || !confined(entry.path) || !digest(entry.rawSha256)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || sealed.has(entry.path)) fail('BASE_AUTHORITY_ENTRY', String(entry.path));
    sealed.set(entry.path, entry);
  }
  const heads = new Map([...sealed].map(([file, entry]) => [file, entry.rawSha256]));
  const replacements = new Map();
  const history = new Map();
  const additions = new Map();
  let previous = null;
  if (!Array.isArray(addenda) || addenda.length === 0 || addenda.length > 32) fail('ADDENDUM_MISSING', 'at least one numbered candidate amendment is required');
  for (let index = 0; index < addenda.length; index++) {
    const entry = addenda[index];
    const name = `evidence-index-addendum-${index + 1}.json`;
    if (entry.name !== name) fail('ADDENDUM_SEQUENCE', entry.name);
    let link;
    try { link = JSON.parse(entry.bytes.toString('utf8')); } catch { fail('ADDENDUM_JSON', name); }
    if (!closed(link, TOP) || link.schema !== SCHEMA || link.cardId !== 'X001' || link.item !== 'U049'
        || link.sequence !== index + 1 || !Array.isArray(link.replacements) || !Array.isArray(link.additions)
        || !(link.replacements.length || link.additions.length)) fail('ADDENDUM_SHAPE', name);
    if (!closed(link.base, ['path', 'rawSha256']) || link.base.path !== BASE_PATH || link.base.rawSha256 !== BASE_SHA) fail('ADDENDUM_BASE', name);
    if (previous === null ? link.previous !== null
      : !closed(link.previous, ['name', 'rawSha256']) || link.previous.name !== previous.name || link.previous.rawSha256 !== previous.rawSha256) {
      fail('ADDENDUM_CHAIN', name);
    }
    const changed = new Set();
    for (const step of link.replacements) {
      const addedTool = additions.has(step.path) && /^tests\\u049-[a-z0-9.-]+\.cjs$/.test(step.path) && step.path !== 'tests\\u049-head.cjs';
      if (!closed(step, ['path', 'previousRawSha256', 'rawSha256', 'retainedPath']) || !(AMENDABLE.includes(step.path) || addedTool)
          || !digest(step.previousRawSha256) || !digest(step.rawSha256) || !additionAllowed(step.retainedPath)
          || !step.retainedPath.startsWith('evidence\\u049\\retained\\')) fail('REPLACEMENT_SHAPE', name);
      if (changed.has(step.path)) fail('REPLACEMENT_DUPLICATE', step.path);
      changed.add(step.path);
      if (step.previousRawSha256 !== heads.get(step.path)) fail('REPLACEMENT_PREDECESSOR', step.path);
      if (step.rawSha256 === step.previousRawSha256) fail('REPLACEMENT_NOOP', step.path);
      if (hash(read(step.retainedPath)) !== step.previousRawSha256) fail('RETAINED_BYTES_CHANGED', step.retainedPath);
      heads.set(step.path, step.rawSha256);
      replacements.set(step.path, step);
      history.set(step.path, [...(history.get(step.path) || []), step]);
    }
    for (const item of link.additions) {
      if (!closed(item, ['path', 'rawSha256']) || !additionAllowed(item.path) || !digest(item.rawSha256)
          || sealed.has(item.path) || item.path === 'tests\\u049-head.cjs') fail('ADDITION_SHAPE', String(item.path));
      if (additions.has(item.path)) fail('ADDITION_DUPLICATE', item.path);
      additions.set(item.path, item.rawSha256);
      heads.set(item.path, item.rawSha256);
    }
    previous = { name, rawSha256: hash(entry.bytes) };
  }
  if (!closed(trusted.tip, ['name', 'rawSha256']) || previous.name !== trusted.tip.name || previous.rawSha256 !== trusted.tip.rawSha256) {
    fail('HEAD_BYTES_CHANGED', previous.name);
  }
  for (const steps of history.values()) for (const step of steps) {
    if (additions.get(step.retainedPath) !== step.previousRawSha256) fail('RETAINED_NOT_INDEXED', step.retainedPath);
  }
  return { sealed, heads, replacements, history, additions, tip: previous, addenda, trusted };
}

function checkCurrent(chain, read, files) {
  for (const [file, expected] of chain.heads) {
    if (hash(read(file)) !== expected) fail('CURRENT_BYTES_CHANGED', file);
  }
  if (hash(read('tests\\u049-authority.cjs')) !== chain.trusted.checkerSha256) fail('CHECKER_BYTES_CHANGED', 'tests\\u049-authority.cjs');
  if (files) {
    const permitted = new Set([...chain.heads.keys(), ...chain.additions.keys(), 'tests\\u049-head.cjs', ...chain.addenda.map((entry) => entry.name)]);
    for (const file of files) if (!permitted.has(file)) fail('UNLISTED_PATH', file);
    for (const file of permitted) if (!files.includes(file)) fail('LISTED_PATH_MISSING', file);
  }
  return { sealed: chain.sealed.size, replacements: chain.replacements.size, additions: chain.additions.size };
}

function legacyBytes(chain, relative, expected, read) {
  if (!chain.history.has(relative)) return read(relative);
  if (hash(read(relative)) !== chain.heads.get(relative)) fail('CURRENT_BYTES_CHANGED', relative);
  if (expected === chain.heads.get(relative)) return read(relative);
  const step = chain.history.get(relative).find((entry) => entry.previousRawSha256 === expected);
  if (!step) fail('LEGACY_INPUT_IDENTITY', relative);
  const retained = read(step.retainedPath);
  if (hash(retained) !== expected) fail('RETAINED_BYTES_CHANGED', step.retainedPath);
  return retained;
}

function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    const file = path.join(directory, entry.name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) fail('UNOWNED_LINK', relative);
    if (entry.isDirectory()) files.push(...filesIn(file, relative));
    else if (entry.isFile()) files.push(relative);
    else fail('NOT_A_FILE', relative);
  }
  return files.sort();
}

function load(root, reader = (target) => fs.readFileSync(target)) {
  const read = (relative) => reader(path.join(root, relative));
  const trusted = require(path.join(root, 'tests', 'u049-head.cjs'));
  if (hash(read('tests\\u049-authority.cjs')) !== trusted.checkerSha256) fail('CHECKER_BYTES_CHANGED', 'tests\\u049-authority.cjs');
  const names = fs.readdirSync(root).filter((name) => name.startsWith('evidence-index-addendum-'));
  if (names.some((name) => !NAME.test(name))) fail('ADDENDUM_SEQUENCE', 'non-numbered amendment');
  names.sort((a, b) => Number(NAME.exec(a)[1]) - Number(NAME.exec(b)[1]));
  const addenda = names.map((name) => {
    const stat = fs.lstatSync(path.join(root, name));
    if (!stat.isFile() || stat.nlink !== 1) fail('ADDENDUM_FILE', name);
    return { name, bytes: read(name) };
  });
  return resolve({ authorityBytes: read(AUTHORITY_PATH), addenda, trusted, read });
}

module.exports = Object.freeze({ SCHEMA, BASE_PATH, BASE_SHA, AUTHORITY_PATH, AMENDABLE, IntegrityError, hash, confined, additionAllowed,
  resolve, checkCurrent, legacyBytes, filesIn, load });
