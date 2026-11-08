'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const namespace = path.resolve(__dirname, '..');
const SURFACE = 'evidence\\u041\\accepted-surface.json';
const SURFACE_SHA = '6075a760e47aeea29b9aa667689f9ac11ebf88aa1689882c5695b6958b7d9bb9';
const ACCEPTED_COMMIT = '5ca751aec0df0aa48d892c1b2b9be066eb2661f3';
const SCHEMA = 'U009-evidence-index-addendum/1';
const NAME = /^evidence-index-addendum-([1-9]\d*)\.json$/;
const HEX = /^[0-9a-f]{64}$/;
const NEW_TESTS = Object.freeze([
  'u041-support.cjs', 'u041-json.test.cjs', 'u041-fast-json.test.cjs', 'u041-work.test.cjs', 'u041-real-work.test.cjs',
  'u041-policy.test.cjs', 'u041-importer.test.cjs', 'u041-amendment-behavior.test.cjs', 'u041-authority.cjs',
  'u041-authority.test.cjs', 'u041-seal.cjs', 'u041-strict.test.cjs', 'u041-mutations.cjs', 'u041-fresh.cjs',
  'u041-coverage.cjs', 'u041-loops.cjs'
]);
const AMENDABLE = Object.freeze([
  'gate.cjs', 'glob.cjs', 'README.md', 'tests\\evidence.test.cjs', 'tests\\fix2-json.test.cjs',
  'tests\\fix2-hermetic.test.cjs', 'tests\\strict-evidence.cjs', ...NEW_TESTS.map((name) => `tests\\${name}`)
]);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const digest = (bytes) => ({ rawSha256: sha(bytes), crlfToLfSha256: sha(normalize(bytes)) });
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();
const fail = (code, detail) => { throw Object.assign(new Error(`${code}: ${detail}`), { code }); };

function plainRelative(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.+-]+(?:\\[A-Za-z0-9_.+-]+)*$/.test(value) &&
    value.split('\\').every((part) => part !== '.' && part !== '..' && !/[. ]$/.test(part));
}

function additionAllowed(value) {
  return plainRelative(value) && (value === 'U041.feature' ||
    NEW_TESTS.some((name) => value === `tests\\${name}`) ||
    /^evidence\\u041\\(?:[A-Za-z0-9_.+-]+|original\\[A-Za-z0-9_.+-]+\.txt)$/.test(value));
}

function reader(root) {
  return (relative) => {
    if (!plainRelative(relative)) fail('AUTHORITY_PATH', String(relative));
    const parts = relative.split('\\');
    let current = root;
    for (let index = 0; index < parts.length; index += 1) {
      current = path.join(current, parts[index]);
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
        fail('AUTHORITY_FILE', relative);
      }
      if (index === parts.length - 1 && stat.size > 32 * 1024 * 1024) fail('AUTHORITY_SIZE', relative);
    }
    return fs.readFileSync(current);
  };
}

function agrees(bytes, entry) {
  const actual = digest(bytes);
  const canonicalCRLF = sha(Buffer.from(normalize(bytes).toString('utf8').replace(/\n/g, '\r\n')));
  return actual.crlfToLfSha256 === entry.crlfToLfSha256 &&
    (actual.rawSha256 === entry.rawSha256 || (actual.rawSha256 === entry.crlfToLfSha256 && canonicalCRLF === entry.rawSha256));
}

function json(bytes, label) {
  if (bytes.length > 2 * 1024 * 1024) fail('AUTHORITY_SIZE', label);
  try { return JSON.parse(bytes.toString('utf8')); } catch { return fail('AUTHORITY_JSON', label); }
}

function resolveAuthority(root = namespace, { read = reader(root), names = fs.readdirSync(root) } = {}) {
  const surfaceBytes = read(SURFACE);
  if (sha(normalize(surfaceBytes)) !== SURFACE_SHA) fail('AUTHORITY_BASE', SURFACE);
  const surface = json(surfaceBytes, SURFACE);
  if (surface.schema !== 'U009-accepted-surface/1' || surface.cardId !== 'U009' || surface.acceptedCommit !== ACCEPTED_COMMIT ||
      !Array.isArray(surface.files) || surface.files.length !== 37) fail('AUTHORITY_BASE', 'the exact accepted 37-file surface');
  const head = new Map(surface.files.map((entry) => [entry.path, { ...entry }]));
  const snapshots = new Map();
  const addenda = names.filter((name) => /^evidence-index-addendum/i.test(name)).sort((a, b) =>
    Number(NAME.exec(a)?.[1]) - Number(NAME.exec(b)?.[1]));
  if (addenda.length === 0) fail('AUTHORITY_MISSING', 'the applied U041 amendment is required');
  if (addenda.length > 100 || addenda.some((name) => !NAME.test(name))) fail('AUTHORITY_NAME', addenda.join(', '));
  let previous = null;
  for (let index = 0; index < addenda.length; index += 1) {
    const name = addenda[index];
    const bytes = read(name);
    const value = json(bytes, name);
    if (name !== `evidence-index-addendum-${index + 1}.json` || !closed(value, ['schema', 'cardId', 'item', 'sequence', 'base', 'previous', 'amendments', 'additions']) ||
        value.schema !== SCHEMA || value.cardId !== 'U009' || value.item !== 'U041' || value.sequence !== index + 1 ||
        !Array.isArray(value.amendments) || !Array.isArray(value.additions) || value.amendments.length + value.additions.length === 0 ||
        value.amendments.length + value.additions.length > 4096) fail('AUTHORITY_SHAPE', name);
    if (!closed(value.base, ['path', 'crlfToLfSha256']) || value.base.path !== SURFACE || value.base.crlfToLfSha256 !== SURFACE_SHA) fail('AUTHORITY_BASE', name);
    if (previous === null ? value.previous !== null : !closed(value.previous, ['name', 'crlfToLfSha256']) ||
        value.previous.name !== previous.name || value.previous.crlfToLfSha256 !== previous.crlfToLfSha256) fail('AUTHORITY_CHAIN', name);
    const seen = new Set();
    for (const step of value.amendments) {
      if (!closed(step, ['path', 'previousRawSha256', 'previousCrlfToLfSha256', 'rawSha256', 'crlfToLfSha256', 'previousSnapshot']) ||
          !AMENDABLE.includes(step.path) || !plainRelative(step.previousSnapshot) ||
          !step.previousSnapshot.startsWith('evidence\\u041\\original\\') || !step.previousSnapshot.endsWith('.txt') ||
          ![step.previousRawSha256, step.previousCrlfToLfSha256, step.rawSha256, step.crlfToLfSha256].every((hash) => typeof hash === 'string' && HEX.test(hash))) {
        fail('AUTHORITY_AMENDMENT', name);
      }
      if (seen.has(step.path)) fail('AUTHORITY_DUPLICATE', step.path);
      seen.add(step.path);
      const prior = head.get(step.path);
      if (!prior || prior.crlfToLfSha256 !== step.previousCrlfToLfSha256) fail('AUTHORITY_PREVIOUS', step.path);
      if (step.crlfToLfSha256 === step.previousCrlfToLfSha256) fail('AUTHORITY_NOOP', step.path);
      const retained = read(step.previousSnapshot);
      if (sha(retained) !== step.previousRawSha256 || sha(normalize(retained)) !== prior.crlfToLfSha256) fail('AUTHORITY_ORIGINAL', step.previousSnapshot);
      if (!snapshots.has(step.path)) snapshots.set(step.path, Buffer.from(retained));
      head.set(step.path, { path: step.path, rawSha256: step.rawSha256, crlfToLfSha256: step.crlfToLfSha256 });
    }
    for (const entry of value.additions) {
      if (!closed(entry, ['path', 'rawSha256', 'crlfToLfSha256']) || !additionAllowed(entry.path) || entry.path === SURFACE ||
          ![entry.rawSha256, entry.crlfToLfSha256].every((hash) => typeof hash === 'string' && HEX.test(hash))) fail('AUTHORITY_ADDITION', name);
      if (head.has(entry.path) || seen.has(entry.path)) fail('AUTHORITY_DUPLICATE', entry.path);
      seen.add(entry.path);
      head.set(entry.path, { ...entry });
    }
    previous = { name, crlfToLfSha256: sha(normalize(bytes)) };
  }
  return { surface, head, snapshots, tip: Object.freeze(previous), read, count: addenda.length };
}

function verifyAuthority(root = namespace, options = {}) {
  const chain = resolveAuthority(root, options);
  for (const [relative, entry] of chain.head) if (!agrees(chain.read(relative), entry)) fail('AUTHORITY_CURRENT', relative);
  return Object.freeze({
    count: chain.count, checked: chain.head.size, tip: chain.tip, acceptedCommit: ACCEPTED_COMMIT,
    historical: (relative) => Buffer.from(chain.snapshots.get(relative) || chain.read(relative)),
    surfaceFiles: () => chain.surface.files.map((entry) => ({ ...entry }))
  });
}

module.exports = Object.freeze({
  SURFACE, SURFACE_SHA, ACCEPTED_COMMIT, SCHEMA, NEW_TESTS, AMENDABLE, sha, normalize, digest, plainRelative,
  additionAllowed, reader, agrees, resolveAuthority, verifyAuthority
});
