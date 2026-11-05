'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const amendments = require('./amendments.cjs');
const { hash, normalize } = amendments;
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence', 'u020-amendment-path');
const INTEGRITY = 'capability\\C034\\tests\\integrity.test.cjs';
const SURFACE = 'capability\\C034\\tests\\surface.test.cjs';
const TRACE = 'capability\\C034\\trace.js';
const EVIDENCE = 'capability\\C034\\evidence\\raw\\bdd-00000000-0000-4000-8000-000000000000\\run.json';
const SEAL = 'capability\\C034\\evidence\\seal-00000000-0000-4000-8000-000000000000.json';
const v1Surface = fs.readFileSync(path.join(evidence, 'surface.test.v1.cjs.txt'));
const v1Integrity = fs.readFileSync(path.join(evidence, 'integrity.test.v1.cjs.txt'));
const surfaceEdited = amendments.applySurfaceEdit(v1Surface);
const flip = (hex) => (hex[0] === '0' ? '1' : '0') + hex.slice(1);
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const code = (expected, fragment) => (error) => error.code === expected && (!fragment || error.message.includes(fragment));

function world() {
  const files = new Map([[INTEGRITY, Buffer.from('v1 integrity\r\ntest\r\n')], [SURFACE, v1Surface],
    [TRACE, Buffer.from('trace\r\nsource\r\n')], [EVIDENCE, Buffer.from('{"raw":true}')]]);
  const entries = [...files].map(([file, bytes]) => ({ path: file, rawSha256: hash(bytes), crlfToLfSha256: hash(normalize(bytes)) }));
  return { files, entries, base: { path: SEAL, rawSha256: hash(Buffer.from('seal bytes')) } };
}
const replace = (file, previous, next, status = 'applied') =>
  ({ path: file, status, previousRawSha256: hash(previous), rawSha256: hash(next), edit: `fixture edit of ${file}` });
function chainOf(w, lists, evidences = []) {
  const addenda = [];
  let previous = null;
  lists.forEach((list, index) => {
    const bytes = amendments.buildAddendum({ sequence: index + 1, createdAtUtc: '2026-01-01T00:00:00.000Z', item: 'U020',
      reason: 'fixture', base: w.base, previous, amendments: list, evidence: evidences[index] || [] });
    const name = amendments.addendumName(index + 1);
    addenda.push({ name, bytes });
    previous = { name, rawSha256: hash(bytes) };
  });
  return addenda;
}
const resolve = (w, addenda) => amendments.resolveChain({ sealed: w.entries, base: w.base, addenda });
const reader = (files) => (file) => {
  if (!files.has(file)) throw new Error(`fixture file missing: ${file}`);
  return files.get(file);
};
const check = (w, chain, files) => amendments.checkSealed({ entries: w.entries, chain, read: reader(files) });
const withFile = (files, file, bytes) => new Map(files).set(file, bytes);
const authorizedChain = (w) => resolve(w, chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')]]));
function mutated(w, mutate) {
  const [addendum] = chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')]]);
  const value = JSON.parse(addendum.bytes.toString('utf8'));
  const result = mutate(value);
  return [{ name: addendum.name, bytes: encode(result === undefined ? value : result) }];
}

test('the K-C034 edit replaces only the live-publisher read on line 41 of the sealed surface test', () => {
  assert.equal(hash(v1Surface), 'd74cd7bf4dc60c86be626f9089e439fd8d1e19cee7002533c493d3ca9746e152');
  const before = v1Surface.toString('utf8').split('\r\n');
  const after = surfaceEdited.toString('utf8').split('\r\n');
  assert.equal(after.length, before.length);
  const differing = before.map((line, index) => [index + 1, line, after[index]]).filter(([, a, b]) => a !== b);
  assert.deepEqual(differing, [[41, "  const bytes = fs.readFileSync(path.join(repository, '.git', 'kanban-orchestrator', 'publish.ps1'));",
    "  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'publish-f6df80bdafc0.ps1.txt'));"]]);
  assert.equal(hash(surfaceEdited), '038518050ecaa9d4ea8a5a86ae39c1f2cc97f0c661579b5d9481fe15e1c32514');
  assert.equal(surfaceEdited.length, 3901);
  for (const input of [surfaceEdited, Buffer.from(v1Surface.toString('utf8').replaceAll('\r\n', '\n')), Buffer.from('x')]) {
    assert.throws(() => amendments.applySurfaceEdit(input), code('SURFACE_EDIT_ANCHOR'));
  }
});

test('without an addendum every sealed file keeps its sealed raw and LF bytes and any changed byte is rejected naming the path', () => {
  const w = world();
  const chain = resolve(w, []);
  assert.equal(chain.count, 0);
  assert.equal(chain.tip, null);
  assert.equal(check(w, chain, w.files), w.entries.length);
  for (const [file, bytes] of w.files) {
    const changed = withFile(w.files, file, Buffer.concat([bytes, Buffer.from(' ')]));
    assert.throws(() => check(w, chain, changed), code('SEALED_BYTES_CHANGED', file), file);
  }
  assert.throws(() => check(w, chain, withFile(w.files, SURFACE, surfaceEdited)), code('SEALED_BYTES_CHANGED', SURFACE));
  const lf = { ...w, entries: w.entries.map((entry) => (entry.path === TRACE ? { ...entry, crlfToLfSha256: '0'.repeat(64) } : entry)) };
  assert.throws(() => check(lf, chain, w.files), code('SEALED_LF_BYTES_CHANGED', TRACE));
});

test('the exact K-C034 replacement of the surface test is accepted, as authorized before and after it is applied', () => {
  const w = world();
  const chain = authorizedChain(w);
  assert.equal(chain.count, 1);
  assert.equal(check(w, chain, w.files), 4);
  assert.equal(check(w, chain, withFile(w.files, SURFACE, surfaceEdited)), 4);
  assert.deepEqual(amendments.workingAccepted(chain, w.entries[1]), [hash(v1Surface), hash(surfaceEdited)]);
  const applied = resolve(w, chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited)]]));
  assert.equal(check(w, applied, withFile(w.files, SURFACE, surfaceEdited)), 4);
  assert.throws(() => check(w, applied, w.files), code('SEALED_BYTES_CHANGED', SURFACE));
  assert.deepEqual(amendments.workingAccepted(applied, w.entries[1]), [hash(surfaceEdited)]);
});

test('any other change to the surface test is rejected naming the path and both expected hashes', () => {
  const w = world();
  const lfEdit = Buffer.from(surfaceEdited.toString('utf8').replaceAll('\r\n', '\n'));
  const otherLine = Buffer.from(surfaceEdited.toString('utf8').replace('publish-f6df80bdafc0.ps1.txt', 'publish-2caba63847b9.ps1.txt'));
  const variants = [lfEdit, otherLine, Buffer.concat([surfaceEdited, Buffer.from('\r\n')]), Buffer.concat([v1Surface, Buffer.from('//')]),
    surfaceEdited.subarray(0, -1), Buffer.alloc(0)];
  for (const status of ['authorized', 'applied']) {
    const chain = resolve(w, chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, status)]]));
    for (const bytes of variants) {
      assert.throws(() => check(w, chain, withFile(w.files, SURFACE, bytes)),
        code('SEALED_BYTES_CHANGED', SURFACE), `${status} ${bytes.length}`);
    }
  }
  const error = (() => { try { check(w, authorizedChain(w), withFile(w.files, SURFACE, lfEdit)); } catch (caught) { return caught; } return null; })();
  assert.ok(error.message.includes(hash(v1Surface).slice(0, 8)));
  assert.ok(error.message.includes(hash(surfaceEdited).slice(0, 8)));
  assert.ok(error.message.includes(hash(lfEdit).slice(0, 8)));
});

test('a change to another sealed file is rejected even when a valid addendum exists', () => {
  const w = world();
  const chain = resolve(w, chainOf(w, [[replace(INTEGRITY, w.files.get(INTEGRITY), Buffer.from('v2 integrity\r\n')),
    replace(SURFACE, v1Surface, surfaceEdited, 'authorized')]]));
  const files = new Map(w.files).set(INTEGRITY, Buffer.from('v2 integrity\r\n')).set(SURFACE, surfaceEdited);
  assert.equal(check(w, chain, files), 4);
  for (const file of [TRACE, EVIDENCE, INTEGRITY, SURFACE]) {
    const changed = withFile(files, file, Buffer.concat([files.get(file), Buffer.from('\n')]));
    assert.throws(() => check(w, chain, changed), code('SEALED_BYTES_CHANGED', file), file);
  }
  assert.throws(() => check(w, chain, new Map([...files].filter(([file]) => file !== TRACE))), /fixture file missing/);
});

test('an addendum may supersede only the closed list of amendable test files', () => {
  const w = world();
  assert.deepEqual([...amendments.AMENDABLE], [INTEGRITY, SURFACE]);
  for (const file of [TRACE, EVIDENCE, SEAL, 'capability\\C034\\tests\\guards.test.cjs', 'capability\\C034\\README.md', 'capability\\C033\\journey.js']) {
    const list = [{ path: file, status: 'applied', previousRawSha256: w.entries[2].rawSha256, rawSha256: hash(Buffer.from('x')), edit: 'not allowed' }];
    assert.throws(() => resolve(w, chainOf(w, [list])), code('AMENDMENT_PATH_NOT_ALLOWED', file), file);
  }
});

test('a modified addendum is rejected', () => {
  const w = world();
  const table = [
    ['schema', (v) => { v.schema = 'C034-evidence-index-addendum/2'; }, 'ADDENDUM_SCHEMA'],
    ['card', (v) => { v.cardId = 'C035'; }, 'ADDENDUM_SCHEMA'],
    ['sequence', (v) => { v.sequence = 2; }, 'ADDENDUM_SEQUENCE'],
    ['base hash', (v) => { v.base.rawSha256 = flip(v.base.rawSha256); }, 'ADDENDUM_BASE'],
    ['base path', (v) => { v.base.path += 'x'; }, 'ADDENDUM_BASE'],
    ['chain link on the first addendum', (v) => { v.previous = { name: 'evidence-index-addendum-0.json', rawSha256: '0'.repeat(64) }; }, 'ADDENDUM_CHAIN'],
    ['unknown claim', (v) => { v.approved = true; }, 'ADDENDUM_SHAPE'],
    ['missing reason', (v) => { delete v.reason; }, 'ADDENDUM_SHAPE'],
    ['missing evidence list', (v) => { delete v.evidence; }, 'ADDENDUM_SHAPE'],
    ['evidence claim', (v) => { v.evidence = 'none'; }, 'ADDENDUM_SHAPE'],
    ['blank item', (v) => { v.item = ''; }, 'ADDENDUM_SHAPE'],
    ['time', (v) => { v.createdAtUtc = 'yesterday'; }, 'ADDENDUM_SHAPE'],
    ['unknown amendment claim', (v) => { v.amendments[0].waived = true; }, 'ADDENDUM_SHAPE'],
    ['blank edit', (v) => { v.amendments[0].edit = ' '; }, 'ADDENDUM_SHAPE'],
    ['no amendments', (v) => { v.amendments = []; }, 'ADDENDUM_SHAPE'],
    ['not an object', () => [], 'ADDENDUM_SHAPE'],
    ['null', () => null, 'ADDENDUM_SHAPE'],
    ['status', (v) => { v.amendments[0].status = 'sealed'; }, 'AMENDMENT_STATUS'],
    ['hash syntax', (v) => { v.amendments[0].rawSha256 = 'abc'; }, 'AMENDMENT_HASH'],
    ['previous bytes', (v) => { v.amendments[0].previousRawSha256 = flip(v.amendments[0].previousRawSha256); }, 'AMENDMENT_PREVIOUS_MISMATCH'],
    ['no-op', (v) => { v.amendments[0].rawSha256 = v.amendments[0].previousRawSha256; }, 'AMENDMENT_NOOP'],
    ['duplicate path', (v) => { v.amendments.push({ ...v.amendments[0] }); }, 'AMENDMENT_DUPLICATE_PATH'],
    ['path', (v) => { v.amendments[0].path = TRACE; }, 'AMENDMENT_PATH_NOT_ALLOWED']
  ];
  assert.equal(resolve(w, mutated(w, () => undefined)).count, 1);
  for (const [name, mutate, expected] of table) assert.throws(() => resolve(w, mutated(w, mutate)), code(expected), name);
  for (const text of ['{not json', '']) assert.throws(() => resolve(w, [{ name: amendments.addendumName(1), bytes: Buffer.from(text) }]), code('ADDENDUM_JSON'));
  const forged = mutated(w, (v) => { v.amendments[0].rawSha256 = hash(Buffer.from('some other bytes')); });
  const chain = resolve(w, forged);
  assert.throws(() => check(w, chain, withFile(w.files, SURFACE, surfaceEdited)), code('SEALED_BYTES_CHANGED', SURFACE));
  const [first] = chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')]]);
  const second = amendments.buildAddendum({ sequence: 2, createdAtUtc: '2026-01-02T00:00:00.000Z', item: 'U020', reason: 'fixture', base: w.base,
    previous: { name: first.name, rawSha256: hash(first.bytes) }, amendments: [replace(INTEGRITY, w.files.get(INTEGRITY), Buffer.from('v2\r\n'))] });
  assert.equal(resolve(w, [first, { name: amendments.addendumName(2), bytes: second }]).count, 2);
  const tampered = Buffer.from(first.bytes.toString('utf8').replace('fixture', 'altered'));
  assert.throws(() => resolve(w, [{ name: first.name, bytes: tampered }, { name: amendments.addendumName(2), bytes: second }]), code('ADDENDUM_CHAIN'));
});

test('a missing addendum is rejected', () => {
  const w = world();
  const [first, second] = chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')], [replace(INTEGRITY, w.files.get(INTEGRITY), Buffer.from('v2\r\n'))]]);
  assert.throws(() => resolve(w, [second]), code('ADDENDUM_SEQUENCE'));
  assert.throws(() => resolve(w, [{ name: amendments.addendumName(2), bytes: first.bytes }]), code('ADDENDUM_SEQUENCE'));
  assert.throws(() => resolve(w, [first, first]), code('ADDENDUM_SEQUENCE'));
  assert.throws(() => check(w, resolve(w, []), withFile(w.files, SURFACE, surfaceEdited)), code('SEALED_BYTES_CHANGED', SURFACE));
  assert.throws(() => check(w, resolve(w, [first]), new Map(w.files).set(INTEGRITY, Buffer.from('v2\r\n'))), code('SEALED_BYTES_CHANGED', INTEGRITY));
});

test('the chain is append-only: a later addendum supersedes the bytes the earlier one produced and links to it', () => {
  const w = world();
  const second = Buffer.from('third surface bytes\r\n');
  const ok = chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')], [replace(SURFACE, surfaceEdited, second)]]);
  const chain = resolve(w, ok);
  assert.equal(chain.count, 2);
  assert.equal(chain.tip.name, amendments.addendumName(2));
  assert.equal(chain.tip.rawSha256, hash(ok[1].bytes));
  assert.deepEqual(amendments.workingAccepted(chain, w.entries[1]), [hash(second)]);
  assert.deepEqual(amendments.publishedAccepted(chain, w.entries[1]), [hash(v1Surface), hash(surfaceEdited), hash(second)]);
  assert.equal(check(w, chain, withFile(w.files, SURFACE, second)), 4);
  assert.throws(() => check(w, chain, withFile(w.files, SURFACE, surfaceEdited)), code('SEALED_BYTES_CHANGED', SURFACE));
  assert.throws(() => check(w, chain, w.files), code('SEALED_BYTES_CHANGED', SURFACE));
  assert.throws(() => resolve(w, chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')], [replace(SURFACE, v1Surface, second)]])),
    code('AMENDMENT_PREVIOUS_MISMATCH', SURFACE));
  const unlinked = amendments.buildAddendum({ sequence: 2, createdAtUtc: '2026-01-02T00:00:00.000Z', item: 'U020', reason: 'fixture', base: w.base,
    previous: null, amendments: [replace(SURFACE, surfaceEdited, second)] });
  assert.throws(() => resolve(w, [ok[0], { name: amendments.addendumName(2), bytes: unlinked }]), code('ADDENDUM_CHAIN'));
});

test('the addendum builder writes closed, LF-only JSON that resolves back to the same fields', () => {
  const w = world();
  const [addendum] = chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')]]);
  const text = addendum.bytes.toString('utf8');
  assert.equal(text.endsWith('}\n'), true);
  assert.equal(text.includes('\r'), false);
  const value = JSON.parse(text);
  assert.deepEqual(Object.keys(value), ['schema', 'cardId', 'sequence', 'createdAtUtc', 'item', 'reason', 'base', 'previous', 'amendments', 'evidence']);
  assert.equal(value.schema, amendments.SCHEMA);
  assert.equal(value.previous, null);
  assert.deepEqual(value.evidence, []);
  assert.deepEqual(Object.keys(value.amendments[0]), ['path', 'status', 'previousRawSha256', 'rawSha256', 'edit']);
});

test('the published byte gate accepts only states the chain legitimized, all or none of the entries', () => {
  const w = world();
  const none = new Map(w.entries.map((entry) => [entry.path, null]));
  const sealed = new Map(w.entries.map((entry) => [entry.path, w.files.get(entry.path)]));
  const chain = authorizedChain(w);
  assert.deepEqual(amendments.checkPublished({ entries: w.entries, chain, blobs: none }), { published: 0, total: 4 });
  assert.deepEqual(amendments.checkPublished({ entries: w.entries, chain, blobs: sealed }), { published: 4, total: 4 });
  assert.deepEqual(amendments.checkPublished({ entries: w.entries, chain, blobs: new Map(sealed).set(SURFACE, surfaceEdited) }), { published: 4, total: 4 });
  assert.throws(() => amendments.checkPublished({ entries: w.entries, chain: resolve(w, []), blobs: new Map(sealed).set(SURFACE, surfaceEdited) }),
    code('PUBLISHED_BYTES_CHANGED', SURFACE));
  assert.throws(() => amendments.checkPublished({ entries: w.entries, chain, blobs: new Map(sealed).set(SURFACE, Buffer.from('other')) }),
    code('PUBLISHED_BYTES_CHANGED', SURFACE));
  assert.throws(() => amendments.checkPublished({ entries: w.entries, chain, blobs: new Map(sealed).set(TRACE, surfaceEdited) }),
    code('PUBLISHED_BYTES_CHANGED', TRACE));
  assert.throws(() => amendments.checkPublished({ entries: w.entries, chain, blobs: new Map(sealed).set(TRACE, null) }), code('PUBLISHED_PARTIAL'));
});

test('an addendum committed to the repository must stay present and byte identical, unpublished ones are pending', () => {
  const w = world();
  const [first, second] = chainOf(w, [[replace(SURFACE, v1Surface, surfaceEdited, 'authorized')], [replace(INTEGRITY, w.files.get(INTEGRITY), Buffer.from('v2\r\n'))]]);
  amendments.checkAddendaAgainstHead({ working: [first, second], head: [] });
  amendments.checkAddendaAgainstHead({ working: [first, second], head: [first] });
  amendments.checkAddendaAgainstHead({ working: [first, second], head: [first, second] });
  assert.throws(() => amendments.checkAddendaAgainstHead({ working: [first], head: [first, second] }), code('ADDENDUM_MISSING_AFTER_PUBLICATION', second.name));
  assert.throws(() => amendments.checkAddendaAgainstHead({ working: [], head: [first] }), code('ADDENDUM_MISSING_AFTER_PUBLICATION', first.name));
  assert.throws(() => amendments.checkAddendaAgainstHead({ working: [{ name: first.name, bytes: Buffer.from(`${first.bytes}\n`) }], head: [first] }),
    code('ADDENDUM_MODIFIED_AFTER_PUBLICATION', first.name));
});

test('indexed evidence is new files only under the evidence folder and stays byte exact', () => {
  const w = world();
  const folder = 'capability\\C034\\evidence\\u020-amendment-path\\';
  const sealedEvidence = 'capability\\C034\\evidence\\red\\trace.stub.cjs';
  const sealedToo = { ...w, entries: [...w.entries, { path: sealedEvidence, rawSha256: hash(Buffer.from('sealed red')) }] };
  const proof = Buffer.from('raw red output');
  const listed = (file, bytes = proof) => ({ path: file, rawSha256: hash(bytes) });
  const steps = [replace(SURFACE, v1Surface, surfaceEdited, 'authorized')];
  const files = new Map(w.files).set(`${folder}red.json`, proof);
  const chain = resolve(w, chainOf(w, [steps], [[listed(`${folder}red.json`)]]));
  assert.equal(chain.evidence.size, 1);
  assert.equal(amendments.checkEvidence({ chain, read: reader(files) }), 1);
  assert.throws(() => amendments.checkEvidence({ chain, read: reader(withFile(files, `${folder}red.json`, Buffer.from('rewritten'))) }),
    code('EVIDENCE_BYTES_CHANGED', 'red.json'));
  assert.equal(amendments.checkEvidence({ chain: resolve(w, chainOf(w, [steps])), read: reader(files) }), 0);
  for (const file of [EVIDENCE, TRACE, 'capability\\C034\\evidence\\raw\\bdd-1\\run.json', 'capability\\C033\\evidence\\x.json', 'evidence\\x.json']) {
    assert.throws(() => resolve(w, chainOf(w, [steps], [[listed(file)]])), code('EVIDENCE_PATH_NOT_ALLOWED', file), file);
  }
  assert.throws(() => resolve(sealedToo, chainOf(sealedToo, [steps], [[listed(sealedEvidence)]])), code('EVIDENCE_PATH_NOT_ALLOWED', sealedEvidence));
  assert.throws(() => resolve(w, chainOf(w, [steps], [[listed(`${folder}a`), listed(`${folder}a`)]])), code('EVIDENCE_DUPLICATE'));
  const later = [replace(INTEGRITY, w.files.get(INTEGRITY), Buffer.from('v2\r\n'))];
  assert.throws(() => resolve(w, chainOf(w, [steps, later], [[listed(`${folder}a`)], [listed(`${folder}a`)]])), code('EVIDENCE_DUPLICATE'));
  assert.equal(resolve(w, chainOf(w, [steps, later], [[listed(`${folder}a`)], [listed(`${folder}b`)]])).evidence.size, 2);
  for (const bad of [{ path: `${folder}a` }, { path: 5, rawSha256: hash(proof) }, { path: `${folder}a`, rawSha256: 'abc' },
    { path: `${folder}a`, rawSha256: hash(proof), extra: 1 }]) {
    assert.throws(() => resolve(w, chainOf(w, [steps], [[bad]])), code('EVIDENCE_ENTRY'));
  }
});

test('the real chain resolves over the real seal and supersedes exactly the integrity test and the K-C034 surface edit', () => {
  const manifest = require('..\\evidence-index.json');
  const seal = JSON.parse(fs.readFileSync(path.join(repository, manifest.seal.path), 'utf8'));
  const entries = [...seal.sourceHashes, ...seal.evidenceHashes];
  const base = { path: manifest.seal.path, rawSha256: manifest.seal.rawSha256 };
  const addenda = amendments.listAddenda(root);
  assert.ok(addenda.length >= 1, 'The first addendum is required.');
  const chain = amendments.resolveChain({ sealed: entries, base, addenda });
  assert.equal(chain.count, addenda.length);
  assert.equal(chain.tip.name, amendments.addendumName(chain.count));
  assert.deepEqual([...amendments.AMENDABLE], [INTEGRITY, SURFACE]);
  const surface = chain.history.get(SURFACE)[0];
  assert.deepEqual({ sequence: surface.sequence, status: surface.status, previous: surface.previousRawSha256, next: surface.rawSha256 },
    { sequence: 1, status: 'authorized', previous: hash(v1Surface), next: hash(surfaceEdited) });
  const integrity = chain.history.get(INTEGRITY)[0];
  assert.deepEqual({ sequence: integrity.sequence, status: integrity.status, previous: integrity.previousRawSha256 },
    { sequence: 1, status: 'applied', previous: hash(v1Integrity) });
  const sealedSurface = entries.find((entry) => entry.path === SURFACE);
  const sealedIntegrity = entries.find((entry) => entry.path === INTEGRITY);
  assert.equal(sealedSurface.rawSha256, hash(v1Surface));
  assert.equal(sealedIntegrity.rawSha256, hash(v1Integrity));
  assert.equal(amendments.checkSealed({ entries, chain, read: (relative) => fs.readFileSync(path.join(repository, relative)) }), entries.length);
  const indexed = [...chain.evidence.keys()];
  for (const name of ['integrity.test.v1.cjs.txt', 'surface.test.v1.cjs.txt', 'amendments.stub.cjs.txt', 'amendments.stub-2.cjs.txt',
    'red-01-edit-without-amendment.json', 'red-02-new-spec-against-stub.json', 'red-03-final-spec-against-stub.json']) {
    assert.ok(indexed.includes(`capability\\C034\\evidence\\u020-amendment-path\\${name}`), name);
  }
  assert.equal(amendments.checkEvidence({ chain, read: (relative) => fs.readFileSync(path.join(repository, relative)) }), chain.evidence.size);
});
