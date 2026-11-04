'use strict';

const path = require('node:path');
const sources = require('./sources.cjs');
function denied(code) {
  return Object.freeze({ approved: false, code, authorizedSha256: null, delegationReady: false,
    diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false });
}
function assessAuthority(snapshot) {
  try {
    require('..\\C034\\trace.js').canonical(snapshot);
    sources.assertGates(snapshot);
    const authority = snapshot.authorization;
    const revision = authority?.classificationAndInspectionRevision;
    if (snapshot.sourceSelector !== 'localPublisherAuthorization' ||
        typeof snapshot.observedAtUtc !== 'string' || !Number.isFinite(Date.parse(snapshot.observedAtUtc)) ||
        !Number.isSafeInteger(snapshot.readerPid) || snapshot.readerPid < 1 ||
        typeof authority?.id !== 'string' || !authority.id ||
        authority.approvedBy !== 'parent-controller' ||
        typeof authority.publisherSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(authority.publisherSha256) ||
        authority.exactAddedClasses?.C038 !== 'S' ||
        authority.mainMustEqualRemoteBeforeStaging !== true ||
        authority.namespaceAndFrozenClassGuardsUnchanged !== true ||
        authority.cloudAuthorityExpanded !== false || authority.originalKanoCredit !== 0 ||
        authority.gitWritesDuringGuardTests !== 0 || authority.syntaxPassed !== true ||
        !Number.isSafeInteger(authority.focusedGuardChecksPassed) || authority.focusedGuardChecksPassed < 61 ||
        revision?.exactAddedClasses?.C038 !== 'S' || revision.approvedBy !== 'parent-controller' ||
        revision.onlyFourExactClassTokensChanged !== true ||
        revision.namespaceFrozenClassAdminHeadWhitespaceAndTransportRulesUnchanged !== true ||
        revision.cloudIdentityOrInfrastructureAuthorityExpanded !== false || revision.extraCredits !== 0 ||
        !Array.isArray(revision.ownedNamespaces) || !revision.ownedNamespaces.includes('capability\\C038') ||
        snapshot.worker?.id !== 'worker-C038' || snapshot.worker.cardId !== 'C038' ||
        snapshot.card.owner !== 'worker-C038' || typeof snapshot.card.readiness !== 'boolean' ||
        !['In Progress', 'Done'].includes(snapshot.card.state) ||
        !['running', 'result_received', 'accepted'].includes(snapshot.worker.status)) {
      return denied('HOLD_UNKNOWN_CURRENT_AUTHORITY_CLASS_OR_SCOPE');
    }
    return Object.freeze({
      approved: true, code: 'CURRENT_CANONICAL_TOP_PARENT_AUTHORITY',
      authorizedSha256: authority.publisherSha256, authorityId: authority.id,
      delegationReady: snapshot.card.state === 'In Progress' && snapshot.card.owner === 'worker-C038' &&
        snapshot.card.readiness === true && snapshot.worker.status === 'running',
      nestedRevisionsAreHistoricalNotCurrentHashes: true,
      diagnosticOnly: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false
    });
  } catch { return denied('HOLD_UNKNOWN_CURRENT_AUTHORITY_CLASS_OR_SCOPE'); }
}
function inspectActual(snapshot, actualSha256) {
  const assessed = assessAuthority(snapshot);
  const exact = assessed.approved && typeof actualSha256 === 'string' && actualSha256 === assessed.authorizedSha256;
  return Object.freeze({ ...assessed, exactAuthorizedBytes: exact,
    code: !assessed.approved ? assessed.code : exact ? 'CURRENT_APPROVED_BYTES_MATCH' : 'HOLD_UNAPPROVED_ACTUAL_PUBLISHER' });
}
function currentDiagnostic() {
  if (arguments.length) throw new Error('NO_CURRENT_AUTHORITY_OVERRIDES');
  const snapshot = sources.readGates();
  const actual = sources.hash(sources.readRegular(path.join('.git', 'kanban-orchestrator', 'publish.ps1')));
  return Object.freeze({ snapshot, assessment: inspectActual(snapshot, actual), actualSha256: actual,
    stateReleasedBeforePublisherRead: true });
}
module.exports = Object.freeze({ assessAuthority, inspectActual, currentDiagnostic });
