'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('.\\u049-authority.cjs');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const overlay = (changes) => (relative) => changes.has(relative) ? changes.get(relative) : read(relative);

function actual() {
  const chain = A.load(root);
  return { chain, authorityBytes: read(A.AUTHORITY_PATH), trusted: chain.trusted, addenda: chain.addenda, read };
}

function changedLink(fixture, mutate, index = 0) {
  const links = fixture.addenda.map((entry) => ({ name: entry.name, bytes: Buffer.from(entry.bytes) }));
  const value = JSON.parse(links[index].bytes.toString());
  mutate(value);
  links[index].bytes = json(value);
  const tip = links.at(-1);
  return { ...fixture, addenda: links, trusted: { ...fixture.trusted, tip: { name: tip.name, rawSha256: A.hash(tip.bytes) } } };
}

test('U049 exact candidate chain checks every accepted and added byte; base independently matches the accepted fix commit', () => {
  const fixture = actual();
  const counts = A.checkCurrent(fixture.chain, read, A.filesIn(root));
  assert.equal(counts.sealed, 120);
  assert.equal([...fixture.chain.replacements.keys()].filter((file) => fixture.chain.sealed.has(file)).length, 3);
  assert.ok(counts.additions > 10);
  const base = JSON.parse(fixture.authorityBytes.toString());
  const { firstBlobs } = require('.\\evidence-check.cjs');
  const names = base.files.map((entry) => `capability\\X001\\${entry.path}`);
  const blobs = firstBlobs(names, base.acceptedFixCommit);
  for (const entry of base.files) {
    assert.ok(blobs.has(`capability\\X001\\${entry.path}`), `${entry.path} existed at the accepted fix`);
    assert.equal(A.hash(blobs.get(`capability\\X001\\${entry.path}`)), entry.rawSha256, `${entry.path}: independent accepted-history identity`);
  }
});

test('U049 missing, changed, reordered, duplicated and skipped addenda never silently drop current authority', () => {
  const fixture = actual();
  assert.throws(() => A.resolve({ ...fixture, addenda: [] }), /ADDENDUM_MISSING/);
  assert.throws(() => A.resolve({ ...fixture, addenda: [fixture.addenda[0], fixture.addenda[0]] }), /ADDENDUM_SEQUENCE/);
  assert.throws(() => A.resolve({ ...fixture, addenda: [{ ...fixture.addenda[0], name: 'evidence-index-addendum-2.json' }] }), /ADDENDUM_SEQUENCE/);
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.base.rawSha256 = '0'.repeat(64); })), /ADDENDUM_BASE/);
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.previous = { name: 'wrong', rawSha256: '0'.repeat(64) }; })), /ADDENDUM_CHAIN/);
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.replacements[0].previousRawSha256 = '0'.repeat(64); })), /REPLACEMENT_PREDECESSOR/);
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.replacements.push(link.replacements[0]); })), /REPLACEMENT_DUPLICATE/);
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.replacements[0].path = 'describe.js'; })), /REPLACEMENT_SHAPE/);
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.additions.push({ path: 'package.json', rawSha256: '0'.repeat(64) }); })), /ADDITION_SHAPE/);
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.extra = true; })), /ADDENDUM_SHAPE/);
});

test('U049 every byte of the current amendment has an external head witness, including whitespace and descriptive fields', () => {
  const fixture = actual();
  const cache = new Map();
  const cachedRead = (file) => {
    if (!cache.has(file)) cache.set(file, read(file));
    return cache.get(file);
  };
  const head = fixture.addenda.at(-1);
  let rejected = 0;
  for (let index = 0; index < head.bytes.length; index++) {
    const flipped = Buffer.from(head.bytes);
    flipped[index] ^= 1;
    const links = fixture.addenda.map((entry) => entry === head ? { ...entry, bytes: flipped } : entry);
    assert.throws(() => A.resolve({ ...fixture, addenda: links, read: cachedRead }), A.IntegrityError, `amendment byte ${index}`);
    rejected += 1;
  }
  assert.equal(rejected, head.bytes.length);
});

test('U049 every original capture kind, retained RED, current source, checker and indexed evidence rejects a private-copy byte edit', () => {
  const fixture = actual();
  const base = [...fixture.chain.sealed.keys()];
  const samples = [
    ...['red', 'green', 'coverage', 'mutants', 'browser'].map((kind) => base.find((file) =>
      file.startsWith(`evidence\\${kind}\\`) && file.endsWith(kind === 'browser' ? 'summary.json' : '.gz'))),
    'README.md', 'imports.json', 'describe.js', 'saved.js', 'timeline.js', 'tests\\u049-authority.cjs',
    ...[...fixture.chain.additions.keys()].filter((file) => /retained|red\\/.test(file)).slice(0, 4),
  ];
  assert.ok(samples.every(Boolean), 'each capture kind has an actual archived witness');
  for (const file of samples) {
    const bytes = Buffer.from(read(file));
    bytes[Math.floor(bytes.length / 2)] ^= 1;
    const reader = overlay(new Map([[file, bytes]]));
    assert.throws(() => {
      const chain = A.resolve({ ...fixture, read: reader });
      A.checkCurrent(chain, reader, A.filesIn(root));
    }, A.IntegrityError, file);
  }
  assert.throws(() => A.checkCurrent(fixture.chain, read, [...A.filesIn(root), 'unlisted.js']), /UNLISTED_PATH/);
  const withoutTimeline = A.filesIn(root).filter((file) => file !== 'timeline.js');
  assert.throws(() => A.checkCurrent(fixture.chain, read, withoutTimeline), /LISTED_PATH_MISSING/);
});

test('U049 a second append-only replacement links exact prior bytes and keeps the accepted fix input provable', () => {
  const fixture = actual();
  const first = fixture.addenda.at(-1);
  const prior = read('timeline.js');
  const next = Buffer.concat([prior, Buffer.from('\r\n')]);
  const retained = 'evidence\\u049\\retained\\timeline.after-u049.js';
  const second = {
    schema: A.SCHEMA, cardId: 'X001', item: 'U049', sequence: fixture.addenda.length + 1,
    base: { path: A.BASE_PATH, rawSha256: A.BASE_SHA },
    previous: { name: first.name, rawSha256: A.hash(first.bytes) },
    replacements: [{ path: 'timeline.js', previousRawSha256: A.hash(prior), rawSha256: A.hash(next), retainedPath: retained }],
    additions: [{ path: retained, rawSha256: A.hash(prior) }],
  };
  const bytes = json(second);
  const name = `evidence-index-addendum-${second.sequence}.json`;
  const reader = overlay(new Map([['timeline.js', next], [retained, prior]]));
  const settings = { ...fixture, read: reader, addenda: [...fixture.addenda, { name, bytes }],
    trusted: { ...fixture.trusted, tip: { name, rawSha256: A.hash(bytes) } } };
  const chain = A.resolve(settings);
  A.checkCurrent(chain, reader);
  const old = chain.sealed.get('timeline.js').rawSha256;
  assert.equal(A.hash(A.legacyBytes(chain, 'timeline.js', old, reader)), old, 'original accepted input remains a retained exact-byte witness');
  assert.equal(A.hash(A.legacyBytes(chain, 'timeline.js', A.hash(prior), reader)), A.hash(prior), 'the intermediate input remains provable too');
  assert.throws(() => A.resolve({ ...settings, addenda: [settings.addenda[1], settings.addenda[0]] }), /ADDENDUM_SEQUENCE/);
  assert.throws(() => A.resolve({ ...settings, addenda: [settings.addenda[1]] }), /ADDENDUM_SEQUENCE/);
});

test('U049 closed path and hash domains reject coercions, aliases, device names and authority-changing additions', () => {
  for (const value of [null, [], {}, 7, '..\\outside', 'tests/u049-x.cjs', 'tests\\..\\x.cjs', 'NUL', 'u049.cjs:', 'tests\\u049-x.cjs.']) {
    assert.equal(A.additionAllowed(value), false, String(value));
  }
  assert.equal(A.additionAllowed('tests\\u049-x.cjs'), true);
  assert.equal(A.additionAllowed('evidence\\u049\\red\\run-1.json'), true);
  assert.equal(A.additionAllowed('tests\\package.json'), false);
  assert.equal(A.additionAllowed('describe.js'), false);
  const fixture = actual();
  assert.throws(() => A.resolve(changedLink(fixture, (link) => { link.replacements[0].rawSha256 = ['0'.repeat(64)]; })), /REPLACEMENT_SHAPE/);
  assert.throws(() => A.resolve({ ...fixture, authorityBytes: Buffer.from('{}') }), /BASE_AUTHORITY_CHANGED/);
  const changedBase = Buffer.from(read(A.BASE_PATH));
  changedBase[0] ^= 1;
  assert.throws(() => A.resolve({ ...fixture, read: overlay(new Map([[A.BASE_PATH, changedBase]])) }), /BASE_BYTES_CHANGED/);
});
