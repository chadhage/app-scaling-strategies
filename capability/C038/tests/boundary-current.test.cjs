'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./support.cjs');
const sources = require('../sources.cjs');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'evidence', 'raw', 'archive-241ff245-f8f4-4f6b-a8ad-f48b95603a37');
const baseline = JSON.parse(fs.readFileSync(path.join(archive, 'authority.json'), 'utf8'));
const archivedPublisher = fs.readFileSync(path.join(archive, 'publisher.ps1.snapshot'));
const privatePublisher = path.join('.git', 'kanban-orchestrator', 'publish.ps1');
// currentDiagnostic normally reads the live State ledger and the live private publisher. Here both reads are
// replaced by the archived authority snapshot and the archived publisher bytes, so no ambient state is involved.
function subject({ snapshot = baseline, bytes = archivedPublisher } = {}) {
  const calls = [];
  const fake = { ...sources,
    readGates() { calls.push('state'); return structuredClone(snapshot); },
    readRegular(file) { calls.push(file); return bytes; } };
  return { boundary: load(path.join(root, 'boundary.cjs'), { './sources.cjs': fake }), calls };
}
test('the archived 2CABA bytes under the archived top authority are the exact approved publisher', () => {
  const { boundary, calls } = subject();
  const current = boundary.currentDiagnostic();
  assert.equal(current.assessment.code, 'CURRENT_APPROVED_BYTES_MATCH');
  assert.equal(current.assessment.exactAuthorizedBytes, true);
  assert.equal(current.assessment.delegationReady, true);
  assert.equal(current.actualSha256, baseline.authorization.publisherSha256);
  assert.equal(current.actualSha256, sources.hash(archivedPublisher));
  assert.equal(current.stateReleasedBeforePublisherRead, true);
  assert.equal(current.assessment.publicationPerformed, false);
  assert.equal(current.assessment.normalVerificationAuthorizesPublication, false);
  assert.deepEqual(calls, ['state', privatePublisher], 'State is read and released before the private publisher is read.');
});
test('different publisher bytes are held although the current authority itself is approved', () => {
  const { boundary } = subject({ bytes: Buffer.from('another publisher') });
  const current = boundary.currentDiagnostic();
  assert.equal(current.assessment.approved, true);
  assert.equal(current.assessment.exactAuthorizedBytes, false);
  assert.equal(current.assessment.code, 'HOLD_UNAPPROVED_ACTUAL_PUBLISHER');
  assert.equal(current.actualSha256, sources.hash(Buffer.from('another publisher')));
});
test('a changed class or scope in the current State snapshot denies the diagnostic', () => {
  const changed = structuredClone(baseline);
  changed.authorization.exactAddedClasses.C038 = 'D';
  const current = subject({ snapshot: changed }).boundary.currentDiagnostic();
  assert.equal(current.assessment.approved, false);
  assert.equal(current.assessment.exactAuthorizedBytes, false);
  assert.equal(current.assessment.code, 'HOLD_UNKNOWN_CURRENT_AUTHORITY_CLASS_OR_SCOPE');
});
test('the diagnostic and its result are closed: no override argument and no mutation', () => {
  const { boundary } = subject();
  assert.throws(() => boundary.currentDiagnostic({ expected: archivedPublisher }), /NO_CURRENT_AUTHORITY_OVERRIDES/);
  const current = boundary.currentDiagnostic();
  assert.ok(Object.isFrozen(current) && Object.isFrozen(current.assessment));
  assert.throws(() => { current.actualSha256 = 'x'; }, TypeError);
  assert.ok(Object.isFrozen(boundary));
});
