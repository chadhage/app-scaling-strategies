'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const source = require('..\\source.cjs');
const authority = require('..\\publisher-authority.cjs');
const current = source.readGates();

test('current top canonical classification revision and actual private bytes, not nested historical authority', () => {
  const snapshot = structuredClone(current);
  const assessed = authority.assessAuthority(snapshot);
  assert.equal(assessed.approved, true, assessed.code);
  assert.equal(assessed.currentPublisherSha256, snapshot.authorization.publisherSha256);
  const actual = source.readRegular('.git\\kanban-orchestrator\\publish.ps1');
  const check = authority.assessActual(snapshot, actual);
  assert.equal(check.exactActualBytes, true, check.code);
  assert.equal(check.exactFourTokenPredecessorVerified, true);
  assert.equal(check.publicationPerformed, false);
});
for (const [name, mutate] of [
  ['unknown top hash', (s) => { s.authorization.publisherSha256 = 'f'.repeat(64); }],
  ['historical top with current nested', (s) => { s.authorization.publisherSha256 = authority.knownRevision.previousPublisherSha256; }],
  ['nested revision source', (s) => { s.sourceSelector = 'budgetAndGoalRevision'; }],
  ['missing top authority', (s) => { delete s.authorization; }],
  ['wrong own class', (s) => { s.card.kano = 'S'; }],
  ['wrong own original unit', (s) => { s.card.kanoUnit = 'C035-repair'; }],
  ['wrong owner', (s) => { s.card.owner = 'worker-C030'; }],
  ['wrong worker card', (s) => { s.worker.cardId = 'C030'; }],
  ['wrong path', (s) => { s.ownedPaths = ['capability\\C035\\..\\C048']; }],
  ['extra namespace', (s) => { s.ownedPaths.push('capability\\C048'); }],
  ['wrong parent', (s) => { s.card.parents = ['H001', 'H007']; }],
  ['scope expansion', (s) => { s.card.authorization = 'native-cancellation'; }],
  ['missing original row', (s) => { s.exactOriginalKanbanRowPresent = false; }],
  ['new unknown class', (s) => { s.authorization.classificationAndInspectionRevision.exactAddedClasses.C099 = 'D'; }],
  ['unknown top class', (s) => { s.authorization.exactAddedClasses.C099 = 'D'; }],
  ['wrong 61 guard claim', (s) => { s.authorization.focusedGuardChecksPassed = 60; }],
  ['extra credit', (s) => { s.authorization.classificationAndInspectionRevision.extraCredits = 1; }],
  ['wrong consent type', (s) => { s.C001LocalConsent = 'true'; }],
  ['unaccepted prerequisite', (s) => { s.cards[1].accepted = false; }]
]) {
  test(`deny ${name} without staging, publication or Git writes`, () => {
    const snapshot = structuredClone(current);
    mutate(snapshot);
    const result = authority.assessAuthority(snapshot);
    assert.equal(result.approved, false);
    assert.equal(result.delegationReady, false);
    assert.equal(result.publicationPerformed, false);
  });
}
test('unknown actual bytes deny even with a valid current parent snapshot', () => {
  const snapshot = structuredClone(current);
  const bytes = source.readRegular('.git\\kanban-orchestrator\\publish.ps1');
  for (const altered of [Buffer.concat([bytes, Buffer.from('\r\n')]),
    Buffer.from(bytes.toString('utf8').replace("C035='D'", "C035='S'"))]) {
    assert.equal(authority.assessActual(snapshot, altered).exactActualBytes, false);
  }
});
