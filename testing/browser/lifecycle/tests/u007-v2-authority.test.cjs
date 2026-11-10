'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const authority = require('./u007-v2-authority.cjs');
const read = (file) => fs.readFileSync(path.join(root, file));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('U007-V2-E001: current authority distinguishes retained V1 source from corrected V2 source', () => {
  const base = JSON.parse(read(authority.BASE)), head = JSON.parse(read(authority.HEAD));
  assert.equal(base.oldFiles.length, 753);
  assert.equal(base.snapshots.length, 4);
  assert.equal(head.changes.length, 4);
  const core = head.changes.find((entry) => entry.path === 'scratch.cjs');
  assert.equal(core.previousRawSha256, 'd5c0b702b28eafdb7dbff783ffaaf720814e5c71a53fe0652613b3565bec9c07');
  assert.equal(core.digests.rawSha256, 'fdc24e182c506a6fc7fb03115715b379d09605d148eb60ed95f8233268609f79');
  assert.notEqual(core.previousRawSha256, core.digests.rawSha256);
  assert.deepEqual(authority.verify(root), []);
});
test('U007-V2-E002: current source, exact parent regression and retained source epochs are independently pinned', () => {
  const base = JSON.parse(read(authority.BASE)), head = JSON.parse(read(authority.HEAD));
  for (const target of ['tests\\u007-v2-authority.cjs', 'tests\\u007-parent-scan-identity.test.cjs',
    'tests\\u007-scan-boundary-v2.test.cjs', 'tests\\u007-scan-budget-v2.test.cjs',
    ...base.snapshots.map((entry) => entry.retained), head.nativeSummary, head.reusedProof]) {
    const changed = Buffer.from(read(target)); changed[Math.floor(changed.length / 2)] ^= 1;
    assert.ok(authority.verify(root, (file) => file === target ? changed : read(file)).length > 0, target);
  }
});
test('U007-V2-E003: all original semantic tuples have fresh current execution rather than reused V1 credit', () => {
  const head = JSON.parse(read(authority.HEAD)), proof = JSON.parse(read(head.reusedProof));
  assert.equal(proof.executedAgain, true);
  assert.equal(proof.originalTuplesRetargeted, 2213);
  assert.equal(proof.newEnumeratedVariants, 23);
  assert.equal(proof.namedNewCounterfactuals.length, 2);
  assert.equal(proof.summary.generated, 2238);
  assert.equal(proof.summary.executed, 2238);
  for (const key of ['survived', 'undecided', 'uncaptured', 'timeoutsCountedAsKills']) assert.equal(proof.summary[key], 0);
  assert.equal(proof.sourceHashes['scratch.cjs'], hash(read('scratch.cjs').toString('latin1').includes('\r\n') ? read('scratch.cjs')
    : Buffer.from(read('scratch.cjs').toString('latin1').replace(/\n/g, '\r\n'), 'latin1')));
});
