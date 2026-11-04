'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { control, successor, originalGuard } = require('..\\..\\tests\\publisher-controls.cjs');
test('explicit current successor can assess while historical budget revision stays immutable', () => {
  const guard = originalGuard();
  const known = control();
  const legacy = (snapshot) => ({ controllerId: snapshot.controllerId, currentParentPublisherAuthorization: snapshot.authorization });
  assert.equal(guard(known.authorization.publisherSha256, legacy(known)), true, 'Actual 60AE control must work before testing the future coupling.');
  const later = successor();
  assert.equal(later.snapshot.authorization.budgetAndGoalRevision.publisherSha256, known.authorization.publisherSha256);
  assert.equal(guard(later.actualSha256, legacy(later.snapshot)), true,
    'Historical budgetAndGoalRevision must not veto a separately explicitly current approved successor unit control.');
});
