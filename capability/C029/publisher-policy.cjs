'use strict';

const evaluator = require('./evaluator.js');
const policy = evaluator.parseJson(JSON.stringify(require('./publisher-policy.json')));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) fail('CLOSED_PUBLICATION_AUTHORIZATION');
}
function validateAuthorization(text) {
  if (arguments.length !== 1) fail('NO_PUBLICATION_AUTHORIZATION_OVERRIDES');
  const value = evaluator.parseJson(text);
  keys(value, ['id', 'approvedBy', 'publisherSha256', 'focusedGuardChecksPassed',
    'mainMustEqualRemoteBeforeStaging', 'namespaceAndFrozenClassGuardsUnchanged',
    'syntaxPassed', 'originalKanoCredit', 'cloudAuthorityExpanded', 'budgetAndGoalRevision']);
  if (value.id !== policy.authorizationId || value.approvedBy !== 'parent-controller' ||
      value.publisherSha256 !== policy.approvedPublisherSha256 ||
      value.focusedGuardChecksPassed !== policy.approvedGuardChecks ||
      value.mainMustEqualRemoteBeforeStaging !== true || value.namespaceAndFrozenClassGuardsUnchanged !== true ||
      value.syntaxPassed !== true || value.originalKanoCredit !== 0 || value.cloudAuthorityExpanded !== false) fail('CURRENT_PARENT_AUTHORIZATION_REQUIRED');
  const revision = value.budgetAndGoalRevision;
  keys(revision, ['publisherSha256', 'previousPublisherSha256', 'focusedGuardChecksPassed',
    'namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained', 'cloudIdentityOrInfrastructureAuthorityExpanded',
    'onlyTwoExactClassTokensChanged', 'approvedBy', 'exactAddedClasses', 'ownedNamespaces', 'extraCredits']);
  keys(revision.exactAddedClasses, ['C029', 'X003']);
  if (revision.publisherSha256 !== policy.approvedPublisherSha256 ||
      revision.previousPublisherSha256 !== policy.historicalPredecessorSha256 ||
      revision.focusedGuardChecksPassed !== policy.approvedGuardChecks ||
      revision.namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained !== true ||
      revision.cloudIdentityOrInfrastructureAuthorityExpanded !== false ||
      revision.onlyTwoExactClassTokensChanged !== true || revision.approvedBy !== 'parent-controller' ||
      revision.exactAddedClasses.C029 !== 'D' || revision.exactAddedClasses.X003 !== 'L' ||
      !Array.isArray(revision.ownedNamespaces) || revision.ownedNamespaces.length !== 2 ||
      revision.ownedNamespaces[0] !== 'capability\\C029' || revision.ownedNamespaces[1] !== 'capability\\X003' ||
      revision.extraCredits !== 0) fail('EXACT_CURRENT_HISTORY_BINDING_REQUIRED');
  return Object.freeze({
    allowed: true, cardId: policy.cardId, workerId: policy.workerId, frozenClass: policy.class,
    ownedNamespace: policy.ownedNamespace, publisherSha256: value.publisherSha256,
    predecessorSha256: revision.previousPublisherSha256, guardChecks: revision.focusedGuardChecksPassed
  });
}
module.exports = Object.freeze({ policy, validateAuthorization });
