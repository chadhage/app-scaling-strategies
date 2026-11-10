'use strict';

// The pins of the read-only imports (C009's five production files, C010's audit.cjs) are recomputed against git OBJECTS, and every kind of mismatch is
// named: a tampered blob, a wrong object id, a tag that points at another commit, a pin that differs from the accepted commit, an LF pin that is not the
// blob, working bytes that match neither pin. Every import in the production files is pinned, and nothing else of another card is imported.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DECOY_TAGS, lfOf, namespaceRoot, realReaders, sha, verify } = require('./imports-check.cjs');

const spec = JSON.parse(fs.readFileSync(path.join(namespaceRoot, 'imports.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(spec));
const readers = realReaders(spec);
const firstC009 = spec.dependencies.find((dependency) => dependency.card === 'C009');
const audit = spec.dependencies.find((dependency) => dependency.card === 'C010');

test('the pins match the git objects of the pinned commits and the working bytes (raw or LF-normalized)', () => {
  assert.deepEqual(verify(spec, readers), []);
  assert.equal(spec.dependencies.length, 6);
  assert.deepEqual(spec.dependencies.map((dependency) => dependency.card), ['C009', 'C009', 'C009', 'C009', 'C009', 'C010']);
  assert.ok(spec.dependencies.every((dependency) => /^[0-9a-f]{40}$/.test(dependency.oid) && /^[0-9a-f]{64}$/.test(dependency.raw) && dependency.git === dependency.lf));
});

const wrapped = (changes) => Object.freeze({ ...readers, ...changes });

test('a tampered blob, object id, tag or commit pin is named', () => {
  assert.deepEqual(verify(spec, wrapped({ blob: () => Buffer.from('tampered') })).filter((problem) => problem.includes('GIT_BLOB_SHA256_DIFFERS')).length, spec.dependencies.length);
  assert.ok(verify(spec, wrapped({ oid: () => '0'.repeat(40) })).includes(`${firstC009.path}: GIT_OBJECT_ID_DIFFERS`));
  assert.ok(verify(spec, wrapped({ blob: () => { throw new Error('missing'); } })).includes(`${firstC009.path}: GIT_OBJECT_UNREADABLE`));
  assert.ok(verify(spec, wrapped({ tagType: () => 'commit' })).includes('C009: TAG_NOT_ANNOTATED'));
  assert.ok(verify(spec, wrapped({ tagCommit: () => '1'.repeat(40) })).includes('C010: TAG_DOES_NOT_POINT_AT_THE_COMMIT'));
  const moved = clone();
  moved.accepted.C009.tag = DECOY_TAGS.C009;
  assert.ok(verify(moved, readers).includes('C009: TAG_DOES_NOT_POINT_AT_THE_COMMIT'));
  const decoyC010 = clone();
  decoyC010.accepted.C010.tag = DECOY_TAGS.C010;
  assert.ok(verify(decoyC010, readers).includes('C010: TAG_DOES_NOT_POINT_AT_THE_COMMIT'));
  const other = clone();
  other.dependencies[0].commit = other.dependencies[5].commit;
  assert.ok(verify(other, readers).includes(`${firstC009.path}: COMMIT_OR_TAG_PIN_DIFFERS`));
  const unknownCard = clone();
  unknownCard.dependencies[0].card = 'C999';
  assert.ok(verify(unknownCard, readers).includes(`${firstC009.path}: COMMIT_OR_TAG_PIN_DIFFERS`));
});

test('an LF pin that is not the blob, and working bytes that match neither pin, are named', () => {
  const lf = clone();
  lf.dependencies[2].lf = '0'.repeat(64);
  assert.ok(verify(lf, readers).includes(`${spec.dependencies[2].path}: LF_PIN_DIFFERS_FROM_THE_BLOB`));
  assert.ok(verify(spec, wrapped({ working: () => Buffer.from('edited') })).includes(`${firstC009.path}: WORKING_BYTES_DIFFER_FROM_THE_PINS`));
  const raw = readers.working(firstC009.path);
  const only = (bytes) => wrapped({ working: (file) => (file === firstC009.path ? bytes : readers.working(file)) });
  assert.deepEqual(verify(spec, only(lfOf(raw))), [], 'a fresh LF checkout verifies');
  assert.deepEqual(verify(spec, only(Buffer.from(lfOf(raw).toString('latin1').replace(/\n/g, '\r\n'), 'latin1'))), [], 'a CRLF checkout verifies');
  assert.equal(sha(readers.working(audit.path)) === audit.raw || sha(lfOf(readers.working(audit.path))) === audit.lf, true);
});

test('every require of another card in a production file is pinned, and the amended C010 contract is not imported', () => {
  const production = ['server.cjs', 'store.cjs', 'contract.js', 'config.cjs', 'codes.cjs', 'json.cjs'];
  const pinned = new Set(spec.dependencies.map((dependency) => dependency.path.replaceAll('\\', '/')));
  const required = new Set();
  for (const file of production) {
    const text = fs.readFileSync(path.join(namespaceRoot, file), 'utf8');
    for (const match of text.matchAll(/require\('(\.\.\/C\d+\/[^']+)'\)/g)) required.add(`capability/${match[1].slice(3)}`);
  }
  assert.deepEqual([...required].sort(), [...pinned].sort());
  for (const file of fs.readdirSync(path.join(namespaceRoot, 'tests'))) {
    if (!file.endsWith('.cjs')) continue;
    const text = fs.readFileSync(path.join(namespaceRoot, 'tests', file), 'utf8');
    assert.equal(/C010[\\/]contract/.test(text.replace(/\/\/.*$/gm, '')), false, `${file} imports the C010 contract`);
  }
});
