'use strict';

// U040: the amendment path of the sealed card. The helper (u040-chain.cjs) is exercised with in-memory fixtures: what it accepts, and
// that each kind of tampering is detected by name. No git, no live HEAD, no clock: the fixtures are Maps of path to bytes.
const assert = require('node:assert/strict');
const test = require('node:test');
const chain = require('./u040-chain.cjs');

const P = Object.freeze({
  sealed: chain.SEALED_INDEX, server: 'capability\\C026\\server.cjs', readme: 'capability\\C026\\README.md',
  verifier: 'capability\\C026\\tests\\evidence-final.test.cjs', gate: 'capability\\C026\\tests\\coverage-gate.cjs',
  old: (name) => `capability\\C026\\evidence\\u040\\superseded\\${name}.txt`, evidence: 'capability\\C026\\evidence\\u040\\red\\run.json'
});
const bytes = (text) => Buffer.from(text, 'utf8');

// A repository fixture: the sealed index, the four amendable files in their new bytes, their superseded copies and one evidence file.
function fixture() {
  const files = new Map([
    [P.sealed, bytes('{"sealed":true}')], [P.evidence, bytes('{"run":1}')],
    [P.server, bytes('server v2')], [P.readme, bytes('readme v2')], [P.verifier, bytes('verifier v2')], [P.gate, bytes('gate v2')],
    [P.old('server.cjs'), bytes('server v1')], [P.old('README.md'), bytes('readme v1')],
    [P.old('evidence-final.test.cjs'), bytes('verifier v1')], [P.old('coverage-gate.cjs'), bytes('gate v1')]
  ]);
  const entry = (file, copy, from, to) => ({ path: file, status: 'applied', previousRawSha256: chain.sha(bytes(from)), rawSha256: chain.sha(bytes(to)), supersededCopy: P.old(copy), edit: 'x' });
  const addendum = {
    schema: chain.SCHEMA, cardId: 'C026', sequence: 1, base: { path: P.sealed, rawSha256: chain.sha(files.get(P.sealed)) }, previous: null,
    amendments: [entry(P.server, 'server.cjs', 'server v1', 'server v2'), entry(P.readme, 'README.md', 'readme v1', 'readme v2'),
      entry(P.verifier, 'evidence-final.test.cjs', 'verifier v1', 'verifier v2'), entry(P.gate, 'coverage-gate.cjs', 'gate v1', 'gate v2')],
    evidence: [{ path: P.evidence, rawSha256: chain.sha(files.get(P.evidence)) }]
  };
  files.set(chain.addendumPath(1), bytes(JSON.stringify(addendum)));
  return { files, addendum, read: (path) => files.get(path) ?? null };
}

const rewrite = (fixed, edit) => {
  edit(fixed.addendum);
  fixed.files.set(chain.addendumPath(1), bytes(JSON.stringify(fixed.addendum)));
};

test('a well-formed addendum supersedes exactly the recorded bytes by exactly the live bytes', () => {
  const fixed = fixture();
  const result = chain.verifyChain(fixed.read);
  assert.deepEqual(result.errors, []);
  assert.equal(result.hashes.size, 4);
  const [before, after] = result.hashes.get(P.server);
  assert.equal(chain.supersedes(result.hashes, P.server, before, after), true);
  assert.equal(chain.supersedes(result.hashes, P.server, after, after), false, 'live bytes are not a superseded version of themselves');
  assert.equal(chain.supersedes(result.hashes, P.server, chain.sha(bytes('server v0')), after), false, 'unknown older bytes are not accepted');
  assert.equal(chain.supersedes(result.hashes, P.server, before, chain.sha(bytes('server v3'))), false, 'other live bytes are not accepted');
  assert.equal(chain.supersedes(result.hashes, 'capability\\C026\\framing.cjs', before, after), false, 'a file without an amendment is never superseded');
});

test('without an addendum nothing is superseded: the chain is empty and supersedes() is false', () => {
  const fixed = fixture();
  fixed.files.delete(chain.addendumPath(1));
  const result = chain.verifyChain(fixed.read);
  assert.equal(result.hashes.size, 0);
  assert.equal(chain.supersedes(result.hashes, P.server, chain.sha(bytes('server v1')), chain.sha(bytes('server v2'))), false);
});

test('changed live bytes of an amended file are detected by path', () => {
  for (const file of [P.server, P.readme, P.verifier, P.gate]) {
    const fixed = fixture();
    fixed.files.set(file, bytes('tampered'));
    assert.deepEqual(chain.verifyChain(fixed.read).errors, [`LIVE_BYTES_DIFFER_FROM_ADDENDUM ${file}`], file);
  }
});

test('an addendum that names any file outside the closed list is rejected, production files and evidence included', () => {
  for (const file of ['capability\\C026\\stream.cjs', 'capability\\C026\\framing.cjs', chain.SEALED_INDEX, P.evidence, 'capability\\C026\\tests\\u040-chain.cjs']) {
    const fixed = fixture();
    rewrite(fixed, (addendum) => addendum.amendments.push({ ...addendum.amendments[0], path: file }));
    assert.deepEqual(chain.verifyChain(fixed.read).errors, [`AMENDMENT_PATH_NOT_ALLOWED ${file}`], file);
  }
});

test('a changed sealed index, a tampered superseded copy and a tampered evidence file are detected', () => {
  const sealed = fixture();
  sealed.files.set(P.sealed, bytes('{"sealed":false}'));
  assert.deepEqual(chain.verifyChain(sealed.read).errors, [`BASE_CHANGED ${chain.addendumPath(1)}`]);
  const copy = fixture();
  copy.files.set(P.old('server.cjs'), bytes('server v1 edited'));
  assert.deepEqual(chain.verifyChain(copy.read).errors, [`SUPERSEDED_COPY_MISMATCH ${P.server}`]);
  const missing = fixture();
  missing.files.delete(P.old('README.md'));
  assert.deepEqual(chain.verifyChain(missing.read).errors, [`SUPERSEDED_COPY_MISMATCH ${P.readme}`]);
  const evidence = fixture();
  evidence.files.set(P.evidence, bytes('{"run":2}'));
  assert.deepEqual(chain.verifyChain(evidence.read).errors, [`EVIDENCE_MISMATCH ${P.evidence}`]);
});

test('a modified addendum is detected: a changed hash no longer matches the live file, a bad header or amendment is named', () => {
  const hash = fixture();
  rewrite(hash, (addendum) => { addendum.amendments[0].rawSha256 = chain.sha(bytes('other')); });
  assert.deepEqual(chain.verifyChain(hash.read).errors, [`LIVE_BYTES_DIFFER_FROM_ADDENDUM ${P.server}`]);
  const header = fixture();
  rewrite(header, (addendum) => { addendum.cardId = 'C027'; });
  assert.deepEqual(chain.verifyChain(header.read).errors, [`BAD_HEADER ${chain.addendumPath(1)}`]);
  const entry = fixture();
  rewrite(entry, (addendum) => { addendum.amendments[1].status = 'authorized'; });
  assert.deepEqual(chain.verifyChain(entry.read).errors.slice(0, 1), [`BAD_AMENDMENT ${P.readme}`]);
  const garbage = fixture();
  garbage.files.set(chain.addendumPath(1), bytes('not json'));
  assert.deepEqual(chain.verifyChain(garbage.read).errors, [`UNPARSABLE ${chain.addendumPath(1)}`]);
});

test('addendum 2 chains to addendum 1 by its hash and may replace only what addendum 1 left as the live bytes', () => {
  const fixed = fixture();
  const first = chain.sha(fixed.files.get(chain.addendumPath(1)));
  const second = {
    schema: chain.SCHEMA, cardId: 'C026', sequence: 2, base: fixed.addendum.base, previous: { path: chain.addendumPath(1), rawSha256: first },
    amendments: [{ path: P.readme, status: 'applied', previousRawSha256: chain.sha(bytes('readme v2')), rawSha256: chain.sha(bytes('readme v3')), edit: 'x' }]
  };
  fixed.files.set(P.readme, bytes('readme v3'));
  fixed.files.set(chain.addendumPath(2), bytes(JSON.stringify(second)));
  // addendum 1 still says readme v2 is live: the chain as a whole must say v3 and nothing else
  const result = chain.verifyChain(fixed.read);
  assert.deepEqual(result.errors, []);
  assert.equal(chain.supersedes(result.hashes, P.readme, chain.sha(bytes('readme v1')), chain.sha(bytes('readme v3'))), true);
  assert.equal(chain.supersedes(result.hashes, P.readme, chain.sha(bytes('readme v2')), chain.sha(bytes('readme v3'))), true);
  const gap = structuredClone(second);
  gap.amendments[0].previousRawSha256 = chain.sha(bytes('readme v9'));
  fixed.files.set(chain.addendumPath(2), bytes(JSON.stringify(gap)));
  assert.equal(chain.verifyChain(fixed.read).errors.includes(`GAP_IN_CHAIN ${P.readme}`), true);
  const broken = structuredClone(second);
  broken.previous = { path: chain.addendumPath(1), rawSha256: chain.sha(bytes('x')) };
  fixed.files.set(chain.addendumPath(2), bytes(JSON.stringify(broken)));
  assert.equal(chain.verifyChain(fixed.read).errors.includes(`CHAIN_BROKEN ${chain.addendumPath(2)}`), true);
});
