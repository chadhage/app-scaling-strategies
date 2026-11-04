'use strict';

const { createHash } = require('node:crypto');
const parse = require('..\\C029\\evaluator.js').parseJson;
const policy = Object.freeze({
  authorizationId: 'local-publisher-authorizations-19',
  publisherSha256: '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811',
  predecessorSha256: '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea',
  guardChecks: 61, cardId: 'C030', workerId: 'worker-C030', frozenClass: 'D', ownedNamespace: 'capability\\C030'
});
function fail(code) { throw Object.assign(new Error(code), { code }); }
function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('EXACT_AUTHORIZATION_FIELDS');
}
function authorize(text) {
  if (arguments.length !== 1) fail('NO_AUTHORITY_OVERRIDES');
  const value = parse(text);
  shape(value, ['id', 'approvedBy', 'publisherSha256', 'focusedGuardChecksPassed', 'mainMustEqualRemoteBeforeStaging',
    'namespaceAndFrozenClassGuardsUnchanged', 'syntaxPassed', 'originalKanoCredit', 'cloudAuthorityExpanded',
    'classificationAndInspectionRevision']);
  if (value.id !== policy.authorizationId || value.approvedBy !== 'parent-controller' ||
      value.publisherSha256 !== policy.publisherSha256 || value.focusedGuardChecksPassed !== 61 ||
      value.mainMustEqualRemoteBeforeStaging !== true || value.namespaceAndFrozenClassGuardsUnchanged !== true ||
      value.syntaxPassed !== true || value.originalKanoCredit !== 0 || value.cloudAuthorityExpanded !== false) fail('CURRENT_CANONICAL_PARENT_APPROVAL_REQUIRED');
  const revision = value.classificationAndInspectionRevision;
  shape(revision, ['publisherSha256', 'previousPublisherSha256', 'focusedGuardChecksPassed', 'extraCredits',
    'cloudIdentityOrInfrastructureAuthorityExpanded', 'ownedNamespaces', 'exactAddedClasses', 'approvedBy',
    'onlyFourExactClassTokensChanged', 'namespaceFrozenClassAdminHeadWhitespaceAndTransportRulesUnchanged']);
  shape(revision.exactAddedClasses, ['C030', 'C035', 'C037', 'C038']);
  if (revision.publisherSha256 !== policy.publisherSha256 || revision.previousPublisherSha256 !== policy.predecessorSha256 ||
      revision.focusedGuardChecksPassed !== 61 || revision.extraCredits !== 0 ||
      revision.cloudIdentityOrInfrastructureAuthorityExpanded !== false || revision.approvedBy !== 'parent-controller' ||
      revision.onlyFourExactClassTokensChanged !== true ||
      revision.namespaceFrozenClassAdminHeadWhitespaceAndTransportRulesUnchanged !== true ||
      revision.exactAddedClasses.C030 !== 'D' || revision.exactAddedClasses.C035 !== 'D' ||
      revision.exactAddedClasses.C037 !== 'S' || revision.exactAddedClasses.C038 !== 'S' ||
      JSON.stringify(revision.ownedNamespaces) !== JSON.stringify(['capability\\C030', 'capability\\C035', 'capability\\C037', 'capability\\C038'])) fail('EXACT_CURRENT_REVISION_REQUIRED');
  return Object.freeze({ allowed: true, ...policy, scope: 'one exact C030 original only; not cloud or parent acceptance' });
}
function verifyHistoricalBytes(bytes) {
  if (arguments.length !== 1 || !Buffer.isBuffer(bytes)) fail('HISTORICAL_BYTES_REQUIRED');
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  if (hash(bytes) !== policy.publisherSha256) fail('UNRECOGNIZED_HISTORICAL_PUBLISHER');
  let text = bytes.toString('utf8');
  for (const token of [" C030='D';", " C035='D';", " C037='S';", " C038='S';"]) {
    if (text.split(token).length !== 2) fail('EXACT_FOUR_TOKEN_DELTA');
    text = text.replace(token, '');
  }
  if (hash(Buffer.from(text, 'utf8')) !== policy.predecessorSha256) fail('HISTORICAL_GUARDS_CHANGED');
  return Object.freeze({ currentHash: policy.publisherSha256, historicalPredecessorHash: policy.predecessorSha256,
    exactFourTokensOnly: true, normalTestReadsLivePrivatePublisher: false });
}
module.exports = Object.freeze({ policy, authorize, verifyHistoricalBytes });
