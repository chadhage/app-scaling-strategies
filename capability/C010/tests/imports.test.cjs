'use strict';

// Imports of accepted C009 production code are READ-ONLY and pinned in imports.json (raw, LF-normalized and git blob SHA-256, the git object id,
// the commit and the annotated tag); this suite recomputes every pin against git objects and the working bytes, proves each kind of tampering is
// caught BY NAME, and proves that the production files import exactly the pinned files and nothing else of another namespace (L-0116, L-0188).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { lfOf, namespaceRoot, realReaders, verify } = require('./imports-check.cjs');

const spec = JSON.parse(fs.readFileSync(path.join(namespaceRoot, 'imports.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(spec));
const real = realReaders(spec);
const PRODUCTION = ['audit.cjs', 'codes.cjs', 'contract.js', 'server.cjs', 'store.cjs', 'page.js'];

test('every pin of every imported C009 production file matches the pinned commit and tag in git and the working bytes (raw CRLF or LF-normalized)', () => {
  assert.deepEqual(verify(spec), []);
  assert.equal(spec.accepted.C009.commit, 'f95cc52a29cf643fd443b80e5c0b112556feb548');
  assert.equal(spec.accepted.C009.tag, 'kanban/C009/f95cc52a29cf');
  assert.equal(spec.dependencies.length, 5);
  for (const dependency of spec.dependencies) assert.match(dependency.path, /^capability\\C009\\[a-z-]+\.(cjs|js)$/, 'production files only, never C009 tests or evidence');
});

test('the same pins hold for a fresh LF checkout of the working tree: the LF-normalized bytes alone are enough', () => {
  const lf = { ...real, working: (file) => lfOf(real.working(file)) };
  assert.deepEqual(verify(spec, lf), []);
  const crlf = { ...real, working: (file) => Buffer.from(lfOf(real.working(file)).toString('latin1').replaceAll('\n', '\r\n'), 'latin1') };
  assert.deepEqual(verify(spec, crlf), [], 'and so do the CRLF bytes of a Windows checkout');
});

const flip = (bytes) => { const copy = Buffer.from(bytes); copy[Math.floor(copy.length / 2)] ^= 1; return copy; };
const TAMPERS = [
  ['a flipped working byte', () => ({ readers: { ...real, working: (file) => flip(real.working(file)) } }), 'WORKING_BYTES_DIFFER_FROM_THE_PINS'],
  ['a flipped blob byte', () => ({ readers: { ...real, blob: (commit, file) => flip(real.blob(commit, file)) } }), 'GIT_BLOB_SHA256_DIFFERS'],
  ['a forged blob pin', () => { const forged = clone(); forged.dependencies[0].git = '0'.repeat(64); return { forged }; }, 'GIT_BLOB_SHA256_DIFFERS'],
  ['a forged LF pin', () => { const forged = clone(); forged.dependencies[1].lf = '1'.repeat(64); return { forged }; }, 'LF_PIN_DIFFERS_FROM_THE_BLOB'],
  ['a forged raw pin with changed working bytes', () => ({ readers: { ...real, working: (file) => flip(real.working(file)) }, forged: (() => { const forged = clone(); forged.dependencies[2].raw = '2'.repeat(64); return forged; })() }), 'WORKING_BYTES_DIFFER_FROM_THE_PINS'],
  ['a forged object id', () => { const forged = clone(); forged.dependencies[3].oid = '3'.repeat(40); return { forged }; }, 'GIT_OBJECT_ID_DIFFERS'],
  ['another commit in one dependency', () => { const forged = clone(); forged.dependencies[4].commit = '4'.repeat(40); return { forged }; }, 'COMMIT_OR_TAG_PIN_DIFFERS'],
  ['another tag in one dependency', () => { const forged = clone(); forged.dependencies[0].tag = 'kanban/C009/244f771ba72d'; return { forged }; }, 'COMMIT_OR_TAG_PIN_DIFFERS'],
  ['a tag that points at another commit', () => { const forged = clone(); forged.accepted.C009.tag = 'kanban/C009/244f771ba72d'; return { forged }; }, 'TAG_DOES_NOT_POINT_AT_THE_COMMIT'],
  ['a tag that is not annotated', () => ({ readers: { ...real, tagType: () => 'commit' } }), 'TAG_NOT_ANNOTATED']
];

for (const [name, build, expected] of TAMPERS) {
  test(`tampering is caught by name: ${name} -> ${expected}`, () => {
    const { readers, forged } = build();
    const problems = verify(forged ?? spec, readers);
    assert.ok(problems.some((problem) => problem.endsWith(expected) || problem === expected), `${expected} not reported: ${problems.join(' | ')}`);
  });
}

test('the production files import exactly the pinned C009 files and nothing else of another namespace', () => {
  const pinned = new Set(spec.dependencies.map((dependency) => dependency.path.split('\\').pop()));
  const found = new Set();
  for (const file of PRODUCTION) {
    const source = fs.readFileSync(path.join(namespaceRoot, file), 'utf8');
    for (const match of source.matchAll(/require\('(\.\.\/[^']+)'\)/g)) {
      assert.match(match[1], /^\.\.\/C009\/[a-z-]+\.(cjs|js)$/, `${file} requires ${match[1]}: only pinned C009 production files may be imported`);
      found.add(match[1].split('/').pop());
    }
    assert.equal(/require\(`|require\([a-z]/i.test(source), false, `${file}: no computed require that could dodge the pins`);
  }
  assert.deepEqual([...found].sort(), [...pinned].sort(), 'every pinned file is used and every used file is pinned');
  assert.deepEqual(fs.readdirSync(namespaceRoot).filter((name) => /\.(c?js)$/.test(name)).sort(), [...PRODUCTION].sort(), 'the production file list of this test is the list of the namespace');
});
