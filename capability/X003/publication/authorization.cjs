'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const DELIVER = 'Suggest a next learning exercise from a chosen goal; verify deterministic relevant links without profiling or external AI services.';
const COMPANIONS = Object.freeze(['C005', 'C006', 'C007', 'C008', 'A-S001', 'A-S010']);
const INITIAL_SHA256 = '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea';
const PREDECESSOR_SHA256 = 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function invalid(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function verifyAuthority(ledger, bytes) {
  const approval = ledger?.localPublisherAuthorization;
  if (!approval || approval.approvedBy !== 'parent-controller'
      || !/^[a-f0-9]{64}$/.test(approval.publisherSha256 || '')
      || typeof approval.id !== 'string' || !approval.id
      || approval.mainMustEqualRemoteBeforeStaging !== true
      || approval.namespaceAndFrozenClassGuardsUnchanged !== true
      || approval.cloudAuthorityExpanded !== false || approval.exactAddedClasses?.X003 !== 'L') {
    throw invalid('ERR_CURRENT_AUTHORITY', 'Explicit current canonical controller permission for original X003/L is required.');
  }
  const revision = approval.budgetAndGoalRevision;
  if (!revision || revision.approvedBy !== 'parent-controller'
      || revision.publisherSha256 !== INITIAL_SHA256 || revision.previousPublisherSha256 !== PREDECESSOR_SHA256
      || revision.exactAddedClasses?.X003 !== 'L' || revision.exactAddedClasses?.C029 !== 'D'
      || revision.onlyTwoExactClassTokensChanged !== true || revision.focusedGuardChecksPassed !== 51
      || revision.namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained !== true
      || revision.cloudIdentityOrInfrastructureAuthorityExpanded !== false
      || revision.extraCredits !== 0 || revision.namedDelighterPacket !== 'LP-LEARN'
      || !revision.ownedNamespaces?.includes('capability\\X003')
      || JSON.stringify(revision.allSixDesignatedSatisfiersAlreadyAccepted) !== JSON.stringify(COMPANIONS)) {
    throw invalid('ERR_ORIGINAL_APPROVAL', 'The preserved original named-packet/class-token approval is missing or weakened.');
  }
  const cards = Array.isArray(ledger.cards) ? ledger.cards : [];
  const original = cards.filter(card => card.id === 'X003');
  const card = original[0];
  if (original.length !== 1 || card.kano !== 'L' || card.kanoUnit !== 'X003' || card.priority !== 'P0'
      || card.packet !== 'LP-LEARN' || JSON.stringify(card.parents) !== '["H002"]'
      || card.deliver !== DELIVER || card.technicalEntryGate !== 'C005, C006, C007'
      || card.state !== 'In Progress' || card.owner !== 'worker-X003'
      || card.authorization !== 'local-deterministic-goal-learning-recommendation'
      || card.namedPacketReservation?.allSixAcceptedAtAdmission !== true
      || card.namedPacketReservation?.additionalCompanionCredit !== 0
      || JSON.stringify(card.namedPacketReservation?.designatedSatisfiers) !== JSON.stringify(COMPANIONS)) {
    throw invalid('ERR_ORIGINAL_CARD', 'Only the freshly claimed original X003 L/P0/LP-LEARN card and its owner may publish.');
  }
  for (const id of COMPANIONS) {
    const found = cards.filter(item => item.id === id);
    if (found.length !== 1 || found[0].kano !== 'S' || found[0].kanoUnit !== id
        || found[0].packet !== 'LP-LEARN' || found[0].state !== 'Done') {
      throw invalid('ERR_NAMED_PACKET', 'The parent-accepted named S companions must remain original Done members; no new credit is inferred.');
    }
  }
  if (!Buffer.isBuffer(bytes) || hash(bytes) !== approval.publisherSha256) {
    throw invalid('ERR_LIVE_PUBLISHER_BYTES', 'Actual private publisher bytes differ from current canonical permission; fail before staging.');
  }
  return Object.freeze({
    schema: 'X003/current-permission/1', cardId: 'X003', workerId: 'worker-X003',
    kano: 'L', packet: 'LP-LEARN', ownedNamespace: 'capability\\X003',
    approvalId: approval.id, approvedRawSha256: approval.publisherSha256, actualRawSha256: hash(bytes),
    originalApprovalSha256: INITIAL_SHA256, predecessorSha256: PREDECESSOR_SHA256,
    currentPermission: true, additionalCompanionCredit: 0
  });
}
function verifyCaptured(record, ledgerSnapshot, publisherSnapshot) {
  if (record?.schema !== 'X003/immutable-authority-capture/1'
      || record.cardId !== 'X003' || record.workerId !== 'worker-X003'
      || record.captureKind !== 'authorized-preflight-not-a-publication'
      || record.usedForCommit !== null || record.approvedRawSha256 !== INITIAL_SHA256
      || !Buffer.isBuffer(publisherSnapshot) || hash(publisherSnapshot) !== record.approvedRawSha256) {
    throw invalid('ERR_HISTORICAL_CAPTURE', 'Immutable original preflight bytes cannot be rewritten or attributed to a publication commit.');
  }
  const proof = verifyAuthority(ledgerSnapshot, publisherSnapshot);
  if (proof.approvalId !== record.approvalId) {
    throw invalid('ERR_HISTORICAL_CAPTURE', 'Captured approval identity differs from its preserved canonical snapshot.');
  }
  return proof;
}
module.exports = Object.freeze({ DELIVER, COMPANIONS, INITIAL_SHA256, PREDECESSOR_SHA256, verifyAuthority, verifyCaptured });

if (require.main === module) {
  const [mode, ledgerPath, publisherPath] = process.argv.slice(2);
  assert.equal(mode, '--verify-live');
  const repository = path.resolve(__dirname, '..', '..', '..');
  assert.equal(path.resolve(ledgerPath), path.join(repository, '.docs', 'wiki', 'flow-state.json'));
  assert.equal(path.resolve(publisherPath), path.join(repository, '.git', 'kanban-orchestrator', 'publish.ps1'));
  const proof = verifyAuthority(JSON.parse(fs.readFileSync(ledgerPath)), fs.readFileSync(publisherPath));
  process.stdout.write(`${JSON.stringify(proof)}\n`);
}
