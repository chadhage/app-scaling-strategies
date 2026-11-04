'use strict';

const source = require('./source.cjs');
const knownRevision = Object.freeze({
  publisherSha256: '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811',
  previousPublisherSha256: '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea',
  exactAddedClasses: Object.freeze({ C030: 'D', C035: 'D', C037: 'S', C038: 'S' }),
  ownedNamespaces: Object.freeze(['capability\\C030', 'capability\\C035', 'capability\\C037', 'capability\\C038']),
  focusedGuardChecksPassed: 61
});
const localScope = 'Bounded usable local original-card evaluator/inspector over unchanged accepted sources. Fictional controls, actual historical observations and real current C015 context remain distinct; no authenticated/current cross-tier linkage, native effects, routing, cancellation or pool readiness is fabricated.';
const currentAddedClasses = Object.freeze({
  C048: 'D', C033: 'S', C045: 'S', C015: 'D', C018: 'S', C019: 'S', C016: 'D',
  C034: 'S', C036: 'D', C029: 'D', X003: 'L', C038: 'S', C035: 'D', C037: 'S', C030: 'D'
});
function deny(code) {
  return { approved: false, delegationReady: false, code,
    currentPublisherSha256: null, diagnosticOnly: true, publicationPerformed: false };
}
function sameMap(actual, expected) {
  return actual && typeof actual === 'object' && !Array.isArray(actual) &&
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && actual[key] === value);
}
function assessAuthority(snapshot) {
  try {
    const a = snapshot.authorization;
    const r = a?.classificationAndInspectionRevision;
    const card = snapshot.card;
    const worker = snapshot.worker;
    source.checkGates(snapshot);
    if (snapshot.schemaVersion !== 1 || snapshot.sourceSelector !== 'localPublisherAuthorization' ||
        a?.approvedBy !== 'parent-controller' || a.id !== 'local-publisher-authorizations-19' ||
        a.publisherSha256 !== r?.publisherSha256 || a.publisherSha256 !== knownRevision.publisherSha256 ||
        a.focusedGuardChecksPassed !== 61 || !sameMap(a.exactAddedClasses, currentAddedClasses) ||
        a.mainMustEqualRemoteBeforeStaging !== true || a.namespaceAndFrozenClassGuardsUnchanged !== true ||
        a.syntaxPassed !== true || a.cloudAuthorityExpanded !== false ||
        a.originalKanoCredit !== 0 || a.gitWritesDuringGuardTests !== 0 ||
        r.approvedBy !== 'parent-controller' || r.previousPublisherSha256 !== knownRevision.previousPublisherSha256 ||
        r.focusedGuardChecksPassed !== 61 || r.onlyFourExactClassTokensChanged !== true ||
        r.namespaceFrozenClassAdminHeadWhitespaceAndTransportRulesUnchanged !== true ||
        r.cloudIdentityOrInfrastructureAuthorityExpanded !== false || r.extraCredits !== 0 ||
        !sameMap(r.exactAddedClasses, knownRevision.exactAddedClasses) ||
        !Array.isArray(r.ownedNamespaces) || r.ownedNamespaces.length !== 4 ||
        [...r.ownedNamespaces].sort().join('|') !== [...knownRevision.ownedNamespaces].sort().join('|')) {
      return deny('UNKNOWN_CURRENT_CANONICAL_REVISION');
    }
    if (card?.id !== 'C035' || card.kano !== 'D' || card.kanoUnit !== 'C035' ||
        card.priority !== 'P0' || card.packet !== 'H001' || card.technicalEntryGate !== 'C015, C029' ||
        !Array.isArray(card.parents) || card.parents.join(',') !== 'H001,H007,H012' ||
        card.authorization !== 'local-evidence-inspection-and-classification-only' || card.localScope !== localScope ||
        card.deliver !== 'Classify unsupported, unknown, cancelled, and interrupted results honestly; incomplete evidence cannot become success.' ||
        card.owner !== 'worker-C035' || typeof card.state !== 'string' || typeof card.readiness !== 'boolean' ||
        worker?.id !== 'worker-C035' || worker.cardId !== 'C035' || typeof worker.status !== 'string' ||
        !Array.isArray(snapshot.ownedPaths) || snapshot.ownedPaths.length !== 1 ||
        snapshot.ownedPaths[0] !== 'capability\\C035') return deny('ORIGINAL_OWNER_CLASS_OR_OWNED_PATH_DENIED');
    return {
      approved: true, delegationReady: card.state === 'In Progress' && card.readiness === true && worker.status === 'running',
      code: 'CURRENT_TOP_CANONICAL_AUTHORITY_ONLY', currentPublisherSha256: a.publisherSha256,
      sourceSelector: snapshot.sourceSelector, ledgerRevision: snapshot.ledgerRevision,
      stateReadHandlesClosed: snapshot.readHandlesClosedBeforeRelease,
      historicalHashIsNotAuthority: true, diagnosticOnly: true, publicationPerformed: false
    };
  } catch { return deny('CURRENT_STATE_GATES_UNAVAILABLE'); }
}
function assessActual(snapshot, bytes) {
  const assessed = assessAuthority(snapshot);
  if (!assessed.approved || !Buffer.isBuffer(bytes)) return { ...assessed, exactActualBytes: false };
  const actualSha256 = source.hash(bytes);
  let stripped = bytes.toString('utf8');
  for (const [id, kano] of Object.entries(knownRevision.exactAddedClasses)) {
    const token = `; ${id}='${kano}'`;
    if (stripped.split(token).length !== 2) return { ...deny('EXACT_FOUR_TOKEN_LINK_DENIED'), exactActualBytes: false, actualSha256 };
    stripped = stripped.replace(token, '');
  }
  const exact = actualSha256 === assessed.currentPublisherSha256 &&
    source.hash(Buffer.from(stripped, 'utf8')) === knownRevision.previousPublisherSha256;
  return {
    ...assessed, actualSha256, exactActualBytes: exact,
    exactFourTokenPredecessorVerified: exact,
    code: exact ? 'CURRENT_ACTUAL_BYTES_AND_FOUR_TOKEN_LINK_MATCH' : 'UNAPPROVED_ACTUAL_PRIVATE_BYTES'
  };
}
module.exports = Object.freeze({ knownRevision, localScope, assessAuthority, assessActual });
