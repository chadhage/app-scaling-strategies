'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../publication/report.cjs');
const sha = '1'.repeat(40);
const publication = {
  cardId: 'X003', workerId: 'worker-X003', outcome: 'published', commit: sha,
  tag: `kanban/X003/${sha.slice(0, 12)}`, remoteVerified: true, remotePeeledTag: sha, foreignIndexPreserved: true
};
const qualification = {
  status: 'qualified', commit: sha, tag: publication.tag, remoteAncestryVerified: true, allCommitChangesOwned: true,
  foreignIndexPreservation: { preserved: true }, committedCompleteRawProofRecords: [], retainedCommittedFailures: 0
};
const automation = { passed: 136, failed: 0, readOnlyNamespace: true };
const browser = { status: 'passed', passedChecks: 14, practiceNavigations: Array(8), returns: Array(10), catalogDataSha256: 'a' };
const manifest = { catalogDataSha256: 'a', sourceCommit: '2'.repeat(40), deliver: 'Declared test fixture, not an actual publication.' };
const create = (pub = publication, qual = qualification, auto = automation) =>
  build(pub, qual, auto, browser, manifest, { fixture: true });

test('full-SHA report formatting preserves one original L pending parent acceptance with no new S credits', () => {
  const result = create();
  assert.equal(result.commit, sha);
  assert.equal(result.tag, publication.tag);
  assert.equal(result.kanoUnit, 'X003');
  assert.equal(result.parentAcceptancePending, true);
  assert.equal(result.additionalCompanionCredits, 0);
  assert.equal(result.nativeQualified, 0);
  assert.equal(result.productionNode24Validated, false);
});

test('unpublished, another owner/card and truncated or mismatched identifiers cannot become a published report', () => {
  for (const change of [{ outcome: 'prepared-not-published' }, { cardId: 'C029' }, { workerId: 'another-owner' },
    { commit: sha.slice(0, 12) }, { tag: 'kanban/C029/111111111111' }, { remotePeeledTag: '3'.repeat(40) }]) {
    assert.throws(() => create({ ...publication, ...change }));
  }
});

test('missing owned canonical qualification or altered foreign flags are not reportable success', () => {
  for (const change of [{ status: 'blocked' }, { commit: '3'.repeat(40) }, { remoteAncestryVerified: false },
    { allCommitChangesOwned: false }, { foreignIndexPreservation: { preserved: false } }]) {
    assert.throws(() => create(publication, { ...qualification, ...change }));
  }
});

test('failed or mutating checks cannot be relabeled as producer GREEN', () => {
  for (const change of [{ failed: 1 }, { passed: 0 }, { readOnlyNamespace: false }]) {
    assert.throws(() => create(publication, qualification, { ...automation, ...change }));
  }
});
