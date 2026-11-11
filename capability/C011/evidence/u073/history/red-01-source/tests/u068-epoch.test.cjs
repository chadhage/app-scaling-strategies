'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { historical, freshEpoch, transition, read } = require('./u068-epoch-verifier.cjs');
test('U068 original sealed source/evidence verifies through its explicit retained historical view', () => {
  const checked = historical();
  assert.deepEqual(checked.problems, []);
  assert.equal(checked.records.get('final-core').summary.pass,217);
  assert.equal(checked.data.get('mutation').notExecuted,1198,'the old incomplete snapshot remains incomplete history');
});
test('U068 actual new REDs precede source reuse and never certify old chronology', () => {
  const epoch=JSON.parse(read('evidence/u068/fresh-epoch.json'));
  assert.deepEqual(freshEpoch(epoch),[]);
  assert.equal(epoch.originalChronologyCertified,false);
  assert.deepEqual(epoch.activeProductionBeforeRed,[]);
});
test('U068 the inherited wrong forgotten-key assertion has retained exact bytes and an explicit correction', () => {
  assert.deepEqual(transition(),[]);
});
test('U068 a missing or non-finite chronology is refused rather than silently treated as before source reuse',()=>{
  const epoch=JSON.parse(read('evidence/u068/fresh-epoch.json'));
  epoch.coreRed.completedAtUtc='not a timestamp';
  assert.ok(freshEpoch(epoch).includes('FRESH_RED_NOT_BEFORE_REUSE:coreRed'));
});
test('U068 the source-complete coupled-page replay states prior reuse and its actual before-reapplication RED honestly',()=>{
  const epoch=JSON.parse(read('evidence/u068/ui-replay-epoch.json'));
  assert.equal(epoch.correctedPageAlreadyExistedOutsideSubject,true);
  assert.equal(epoch.newAuthorshipClaimed,false);
  assert.equal(epoch.originalChronologyCertified,false);
  assert.equal(epoch.originalHelperPreimageRetained,false);
  assert.equal(epoch.oldPartialRetainedUnchanged,true);
  assert.ok(Date.parse(epoch.redCompletedAtUtc)<Date.parse(epoch.correctedPageReappliedAtUtc));
  assert.match(epoch.baselineRawSha256,/^[a-f0-9]{64}$/);
  assert.match(epoch.correctedRawSha256,/^[a-f0-9]{64}$/);
});
