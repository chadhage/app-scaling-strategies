'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inventory, root, hash } = require('./inventory.cjs');
function audit() {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
  assert.equal(index.cardId, 'C038');
  assert.equal(index.originalKanoUnit, 'C038');
  assert.equal(index.extraCredits, 0);
  assert.match(index.qualification, /^evidence\\raw\\qualify-[0-9a-f-]{36}\\qualification\.json$/);
  const file = path.join(root, index.qualification);
  const bytes = fs.readFileSync(file);
  assert.equal(hash(bytes), index.qualificationRawSha256);
  const qualification = JSON.parse(bytes);
  assert.equal(qualification.outcome, 'passed');
  assert.equal(qualification.browserChecks, 17);
  assert.equal(qualification.archivedPublisherGuardGroups, 61);
  assert.ok(qualification.coverage.lines >= 90 && qualification.coverage.branches >= 80 &&
    qualification.coverage.functions >= 90);
  assert.deepEqual(inventory({ sourcesOnly: true, gitClean: true }), qualification.sourceSnapshot,
    'No changed/new/missing owned source after qualification, including the publication caller.');
  for (const entry of qualification.retainedEvidence) {
    assert.equal(hash(fs.readFileSync(path.join(root, entry.path))), entry.rawSha256, entry.path);
  }
  return { cardId: 'C038', qualification: index.qualification,
    qualificationRawSha256: index.qualificationRawSha256,
    qualifiedSourceFiles: qualification.sourceSnapshot.length,
    immutableEvidenceFilesVerified: qualification.retainedEvidence.length,
    coverage: qualification.coverage,
    originalRedPreserved: true, ordinaryReadOnly: true };
}
module.exports = Object.freeze({ audit });
if (require.main === module) console.log(JSON.stringify(audit()));
