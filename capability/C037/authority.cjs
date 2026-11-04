'use strict';

const trace = require('..\\C034\\trace.js');
const scope = 'Bounded usable local original-card evaluator/inspector over unchanged accepted sources. Fictional controls, actual historical observations and real current C015 context remain distinct; no authenticated/current cross-tier linkage, native effects, routing, cancellation or pool readiness is fabricated.';
const frozen = Object.freeze({
  id: 'C037', kano: 'S', kanoUnit: 'C037', priority: 'P0', packet: 'LP-REPLAY',
  technicalEntryGate: 'C036', authorization: 'local-evidence-inspection-and-classification-only', localScope: scope
});
function denied(code) {
  return Object.freeze({ approved: false, delegationReady: false, code, authorizedSha256: null,
    diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false });
}
function assess(snapshot) {
  try {
    trace.canonical(snapshot);
    const approval = snapshot.authorization;
    const card = snapshot.card;
    if (snapshot.schemaVersion !== 1 || snapshot.sourceSelector !== 'localPublisherAuthorization' ||
        snapshot.controllerId !== '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' ||
        approval?.approvedBy !== 'parent-controller' || typeof approval.id !== 'string' || !approval.id ||
        !/^[0-9a-f]{64}$/.test(approval.publisherSha256) || approval.exactAddedClasses?.C037 !== 'S' ||
        approval.mainMustEqualRemoteBeforeStaging !== true || approval.namespaceAndFrozenClassGuardsUnchanged !== true ||
        approval.cloudAuthorityExpanded !== false || approval.originalKanoCredit !== 0 ||
        approval.gitWritesDuringGuardTests !== 0 || approval.syntaxPassed !== true ||
        !Number.isSafeInteger(approval.focusedGuardChecksPassed) || approval.focusedGuardChecksPassed < 61 ||
        Object.entries(frozen).some(([key, value]) => card?.[key] !== value) ||
        trace.canonical(card.parents) !== '["H007"]' ||
        snapshot.worker?.id !== 'worker-C037' || snapshot.worker.cardId !== 'C037' ||
        trace.canonical(snapshot.ownedPaths) !== '["capability\\\\C037"]' ||
        snapshot.C001LocalConsent !== true || snapshot.C015FixtureApproval !== true ||
        snapshot.stateReadHandlesClosed !== true || snapshot.stateMutexReleasedBeforePublisher !== true ||
        !Array.isArray(snapshot.prerequisites) || snapshot.prerequisites.length !== 5) return denied('HOLD_CURRENT_ORIGINAL_AUTHORITY');
    const expected = require('./pins.cjs').imports().accepted;
    const seen = new Set();
    for (const prerequisite of snapshot.prerequisites) {
      const pin = expected[prerequisite.id];
      if (!pin || seen.has(prerequisite.id) || prerequisite.state !== 'Done' ||
          prerequisite.publication?.commit !== pin.commit || prerequisite.publication?.tag !== pin.tag ||
          prerequisite.reviewCommit !== pin.commit || prerequisite.reviewTag !== pin.tag ||
          ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => prerequisite[key] !== true)) {
        return denied('HOLD_INDEPENDENT_ACCEPTED_PREREQUISITES');
      }
      seen.add(prerequisite.id);
    }
    return Object.freeze({
      approved: true, authorizedSha256: approval.publisherSha256, authorityId: approval.id,
      delegationReady: card.state === 'In Progress' && card.owner === 'worker-C037' &&
        card.readiness === true && snapshot.worker.status === 'running',
      code: 'CURRENT_TOP_CANONICAL_PARENT_AUTHORITY',
      diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false
    });
  } catch { return denied('HOLD_CURRENT_ORIGINAL_AUTHORITY'); }
}
function inspect(snapshot, actualSha256) {
  const assessed = assess(snapshot);
  return Object.freeze({ ...assessed, actualSha256,
    exactAuthorizedBytes: assessed.approved && assessed.authorizedSha256 === actualSha256,
    code: !assessed.approved ? assessed.code : assessed.authorizedSha256 === actualSha256 ?
      'CURRENT_APPROVED_BYTES_MATCH' : 'HOLD_UNAPPROVED_ACTUAL_PUBLISHER' });
}
function readCurrent() {
  if (arguments.length) throw Object.assign(new Error('NO_AUTHORITY_OVERRIDES'), { code: 'NO_AUTHORITY_OVERRIDES' });
  const snapshot = require('./pins.cjs').readState();
  return { snapshot, assessment: assess(snapshot) };
}
module.exports = Object.freeze({ frozen, assess, inspect, readCurrent });
