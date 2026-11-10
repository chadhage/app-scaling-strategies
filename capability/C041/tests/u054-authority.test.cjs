'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const authority = require('./u054-authority.cjs');
const root = path.resolve(__dirname, '..');
const FIRST_SHA256 = 'c0f1eaca270d81308689c06d327905d795d48186718515c0010335114cc321ab';
const SECOND_SHA256 = '0187f44eda5c6936a28296e445b8756628addf795560c2cc0bbd91bf1e98b35d';
const THIRD_SHA256 = '9b026bee75d7cf01cb42d821ec4b04d821fab112a1ae03cb4c3e2eb208a6b7aa';
const fixture = () => {
  const original = authority.readNamespace(root);
  const names = new Set([authority.BASE]);
  const base = JSON.parse(original.baseBytes);
  for (const name of Object.keys(base.files)) names.add(name);
  for (const addendum of original.addenda) {
    const value = JSON.parse(addendum.bytes);
    for (const row of value.retainedFiles || []) names.add(row.path);
    for (const step of [...value.replacements, ...(value.artifactReplacements || [])]) names.add(step.beforeWitness);
    for (const row of value.additions) names.add(row.path);
  }
  const files = new Map([...names].map(name => [name, original.read(name)]));
  return { baseBytes: Buffer.from(original.baseBytes),
    addenda: original.addenda.map(row => ({ name: row.name, bytes: Buffer.from(row.bytes) })),
    read: name => {
      if (!files.has(name)) throw new Error(`MISSING ${name}`);
      return files.get(name);
    },
    files, names: [...names, ...original.addenda.map(row => row.name), 'tests\\u054-authority.test.cjs'],
    trustedFirstSha256: FIRST_SHA256, trustedAddendaSha256: [FIRST_SHA256, SECOND_SHA256, THIRD_SHA256] };
};
const check = value => authority.verifyChain(value);
const failure = (action, name) => assert.throws(action, error => {
  assert.ok(error.message.includes(name), `refusal names ${name}: ${error.message}`);
  return true;
});

test('trusted append-only C041 authority preserves its original source-hashes and exact first addendum', () => {
  const value = authority.verifyNamespace(root, FIRST_SHA256, [FIRST_SHA256, SECOND_SHA256, THIRD_SHA256]);
  assert.equal(value.sealed, 23);
  assert.equal(value.retained, 16);
  assert.equal(value.addenda, 3);
  assert.ok(value.additions > 5);
  assert.equal(value.head.rawSha256, THIRD_SHA256);
  assert.equal(value.headRepresentation.crlfToLfSha256, THIRD_SHA256);
});

test('RAW and canonical first-party source forms pass independently, but evidence is RAW only', () => {
  const value = fixture();
  const first = JSON.parse(value.addenda[0].bytes);
  let rawOnlyControls = 0;
  for (const row of [...first.sourceForms, ...first.retainedFiles, ...first.additions]) {
    if (row.acceptLf) value.files.set(row.path, authority.lf(value.files.get(row.path)));
  }
  assert.equal(check(value).sealed, 23);
  for (const row of first.sourceForms.filter(row => !row.acceptLf)) {
    const raw = value.files.get(row.path);
    const canonical = authority.lf(raw);
    if (raw.equals(canonical)) continue;
    value.files.set(row.path, canonical);
    failure(() => check(value), row.path);
    value.files.set(row.path, raw);
    rawOnlyControls++;
  }
  assert.ok(rawOnlyControls > 0, 'raw-only evidence controls actually ran');
});

test('every sealed file and every indexed addition refuses a changed byte BY NAME', () => {
  const value = fixture();
  for (const [name, original] of value.files) {
    if (name === authority.BASE) continue;
    const changed = Buffer.from(original);
    changed[changed.length >> 1] ^= 1;
    value.files.set(name, changed);
    failure(() => check(value), name.startsWith('evidence\\u054\\predecessor\\')
      ? value.addenda.flatMap(row => {
        const data = JSON.parse(row.bytes);
        return [...data.replacements, ...(data.artifactReplacements || [])];
      }).find(step => step.beforeWitness === name).path : name);
    value.files.set(name, original);
  }
});

test('every addendum byte is anchored independently and any missing chain or predecessor is refused', () => {
  const value = fixture();
  for (let ordinal = 0; ordinal < value.addenda.length; ordinal++) {
    const original = value.addenda[ordinal];
    for (let index = 0; index < original.bytes.length; index++) {
      const changed = Buffer.from(original.bytes); changed[index] ^= 1;
      value.addenda[ordinal] = { name: original.name, bytes: changed };
      failure(() => check(value), original.name);
    }
    value.addenda[ordinal] = original;
  }
  failure(() => check({ ...value, addenda: [] }), 'evidence-index-addendum-1.json');
  for (const step of value.addenda.flatMap(row => {
    const data = JSON.parse(row.bytes);
    return [...data.replacements, ...(data.artifactReplacements || [])];
  })) {
    const original = value.files.get(step.beforeWitness);
    value.files.delete(step.beforeWitness);
    failure(() => check(value), step.beforeWitness);
    value.files.set(step.beforeWitness, original);
  }
});

test('closed replacement, source-form, predecessor, ordering and chain guards fail independently', () => {
  for (const [name, mutate] of [
    ['ADDENDUM_SHAPE', value => { value.cardId = 'C042'; }],
    ['ADDENDUM_CHAIN', value => { value.previous = { name: 'other', rawSha256: '0'.repeat(64) }; }],
    ['SOURCE_FORMS_SET', value => { value.sourceForms.pop(); }],
    ['SOURCE_FORMS_ENTRY', value => { value.sourceForms[0].acceptLf = !value.sourceForms[0].acceptLf; }],
    ['REPLACEMENT_PATH', value => { value.replacements[0].path = 'host-policy.js'; }],
    ['REPLACEMENT_PATH', value => { value.replacements.push(value.replacements[0]); }],
    ['REPLACEMENT_PREDECESSOR', value => { value.replacements[0].previousRawSha256 = '0'.repeat(64); }],
    ['PREDECESSOR_SCOPE', value => { value.replacements[0].beforeWitness = 'host-policy.js'; }],
    ['AUTHORITY_PATH', value => { value.replacements[0].beforeWitness = '..\\escape'; }],
    ['ADDITION_ENTRY', value => { value.additions[0].rawSha256 = 'x'; }]
  ]) {
    const value = fixture();
    const altered = JSON.parse(value.addenda[0].bytes); mutate(altered);
    value.addenda[0].bytes = Buffer.from(JSON.stringify(altered));
    value.trustedFirstSha256 = authority.sha(value.addenda[0].bytes);
    value.trustedAddendaSha256 = value.addenda.map(row => authority.sha(authority.lf(row.bytes)));
    failure(() => check(value), name);
  }
  const value = fixture();
  failure(() => check({ ...value, trustedAddendaSha256: undefined,
    addenda: [{ name: 'evidence-index-addendum-2.json', bytes: value.addenda[0].bytes }] }), 'ADDENDUM_SEQUENCE');
  const changedBase = Buffer.from(value.baseBytes); changedBase[0] ^= 1;
  failure(() => check({ ...value, baseBytes: changedBase }), authority.BASE);
  failure(() => check({ ...value, names: [...value.names, 'package.json'] }), 'UNINDEXED_FILE package.json');
});
