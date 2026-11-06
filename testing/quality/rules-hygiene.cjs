'use strict';
// Rules 5 and 7 plus wording hygiene (V2, V9): no GUID, e-mail or secret in any key or value after normalisation (the catalog meter IDs of
// pricing.lines[].meterId and bare SHA-256 values at the hash paths are the only exceptions), no unresolved or enforcement wording, no
// approval claim in prose, and the integrity hash recomputes.
const { isObj, integrityHash } = require('./util.cjs');
const ident = require('./ident.cjs');
const meters = require('./meters.cjs');

const CODES = ['UNRESOLVED_WORDING', 'HARD_WITHOUT_PHRASE', 'GUID_FOUND', 'EMAIL_FOUND', 'SECRET_SHAPED', 'METER_ID_UNKNOWN', 'APPROVAL_CLAIM', 'INTEGRITY_MISSING',
  'INTEGRITY_MISMATCH', 'UNKNOWN_KEY', 'PROTOTYPE_KEY', 'PLACEHOLDER_VALUE'];

const PHRASE = ident.PHRASE;
const METER_ID = /^pricing\.lines\[\d+\]\.meterId$/;
const SHA256 = /^[0-9a-f]{64}$/;
// Content hashes the packet carries on purpose (the integrity hash, the hashes it supersedes and the pinned C001 snapshot).
const HASH_PATHS = new Set(['integrity.packetSha256', 'revision.supersedes.packetSha256', 'revision.earlier.supersedes.packetSha256', 'authority.pinnedSnapshotSha256']);
const APPROVAL = /\b(?:owner|user) (?:has |have )?(?:approved|authori[sz]ed)\b|\bapproved by (?:the )?(?:owner|user)\b|\b(?:is|are|was|were|been) (?:now )?approved\b|\boption [a-c] (?:is |was )?approved\b|\bgo ahead\b|\bdeploy(?:ment)? now\b/i;
// The documented fields of the three objects a reader trusts most (N13): an undocumented field could carry an approval nobody reads.
const KEYS = {
  authority: ['source', 'observedFlags', 'observedOperatingEnvelope', 'hosting', 'runtime', 'framework', 'authentication', 'controlStorage', 'firstNativeHost', 'firstNativeConfiguration', 'preferredIacFormat',
    'pinnedSnapshotSha256', 'reading', 'observedAtUtc', 'unitStatement', 'c002Pins'],
  option: ['id', 'name', 'title', 'os', 'runtime', 'planProduct', 'sku', 'skuKey', 'cliSku', 'tier', 'steadyInstances', 'instanceCap', 'stagingSlots', 'autoscale', 'defaultRegion', 'regionCandidates', 'expectedRunHours',
    'expectedPhases', 'phasesLabel', 'scaleStepHours', 'teardownDeadlineHours', 'teardown', 'usageCaps', 'logs', 'worstCase', 'covers', 'doesNotCover', 'when', 'alternatives', 'teardownLatencyHours', 'spendCeilingUsd',
    'spendCeilingLabel', 'spendCeilingRule', 'proposedCloudSpendMinorUnitsUsd', 'minorUnitsNote', 'expectedPlanCostFormula', 'expectedPlanCostBreakdown', 'usageCapsNote', 'ceilingHeadroom'],
  decision: ['key', 'question', 'default', 'yes', 'stays', 'ledger', 'guardAction', 'neededBy']
};
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// A placeholder is words, digits and brackets only: no equals sign, quote, slash or underscore, where a value could hide.
const PLACEHOLDER_BODY = /^<OWNER-SUPPLIED[A-Za-z0-9 ,.:()<>|-]{0,390}>$/;

function checkKeys(packet, add) {
  const closed = (object, allowed, path) => {
    if (!isObj(object)) return;
    for (const key of Object.keys(object)) if (!allowed.includes(key)) add('UNKNOWN_KEY', `${path}.${key}`, `${key} is not a documented field of this object: an undocumented field could carry an approval or a value no reader sees`);
  };
  closed(packet.authority, KEYS.authority, 'authority');
  (Array.isArray(packet.options) ? packet.options : []).forEach((o, i) => closed(o, KEYS.option, `options[${i}]`));
  const decisions = isObj(packet.ownerDecisions) && Array.isArray(packet.ownerDecisions.decisions) ? packet.ownerDecisions.decisions : [];
  decisions.forEach((d, i) => closed(d, KEYS.decision, `ownerDecisions.decisions[${i}]`));
}

function scanIdentifiers(text, path, add) {
  if (ident.hasGuid(text)) add('GUID_FOUND', path, 'a GUID-shaped value (subscription, tenant or object ID) must never appear: use an owner-supplied placeholder');
  if (ident.hasEmail(text)) add('EMAIL_FOUND', path, 'an e-mail address must never appear');
  const secret = ident.secretIn(text);
  if (secret) add('SECRET_SHAPED', path, `a secret-shaped string must never appear (${secret})`);
}

function scanWording(text, path, add) {
  if (ident.enforcementClaim(text)) add('HARD_WITHOUT_PHRASE', path, `the bound may only be called "${PHRASE}": no hard, enforced or guaranteed limit`);
  if (ident.unresolved(text)) add('UNRESOLVED_WORDING', path, 'no step may be left to be confirmed, decided or filled in');
  if (APPROVAL.test(text)) add('APPROVAL_CLAIM', path, 'no text may claim that the owner approved anything: the packet is a proposal only');
}

// A value or key of the JSON: the exceptions first, then the scanners. Register line ids (key@region) are references, not addresses.
const REGISTER_ID = /^(?:plan|ref|blob|table|queue|la|bw)\.[A-Za-z0-9.]+@(?:eastus2?|westus[23]|centralus|northcentralus|westeurope|northeurope)$/;
// The ids of the price register lines (key@region): references between the lines, not addresses.
function registerIds(packet) {
  const lines = isObj(packet.pricing) && Array.isArray(packet.pricing.lines) ? packet.pricing.lines : [];
  return new Set(lines.filter(isObj).map((l) => `${l.key}@${l.region}`).filter((id) => REGISTER_ID.test(id)));
}

function scanItem(item, add, lineIds) {
  const { path, text, key } = item;
  if (key && PROTOTYPE_KEYS.has(text)) add('PROTOTYPE_KEY', path, `an own key named ${text} is refused: it can change how the packet is read`);
  if (!key && text.startsWith('<OWNER-SUPPLIED') && !PLACEHOLDER_BODY.test(text)) add('PLACEHOLDER_VALUE', path, 'an owner-supplied placeholder holds words only: a value inside the brackets (=, a quote, a path) is refused');
  if (!key && METER_ID.test(path)) {
    if (meters.isCatalogMeter(text) || meters.isPlaceholderMeter(text)) return;
    add('METER_ID_UNKNOWN', path, 'a meter ID must be a public meter of the price catalog (or a fixture placeholder), never another identifier');
  }
  if (!key && HASH_PATHS.has(path) && SHA256.test(text)) return;
  if (!key && lineIds.has(text)) return;
  scanIdentifiers(text, path, add);
  if (!key) scanWording(text, path, add);
}

function checkIntegrity(packet, add) {
  const sha = isObj(packet.integrity) ? packet.integrity.packetSha256 : undefined;
  if (!SHA256.test(String(sha || ''))) { add('INTEGRITY_MISSING', 'integrity.packetSha256', 'the packet SHA-256 is required'); return; }
  const actual = integrityHash(packet);
  if (actual !== sha) add('INTEGRITY_MISMATCH', 'integrity.packetSha256', `the content hashes to ${actual}, the packet says ${sha}`);
}

function checkHygiene(packet, add, inv) {
  const lineIds = registerIds(packet);
  checkKeys(packet, add);
  for (const item of inv.items) scanItem(item, add, lineIds);
  for (const join of inv.joins) scanIdentifiers(join.text, join.path, add);
  checkIntegrity(packet, add);
}

module.exports = { CODES, checkHygiene, scanIdentifiers, scanWording, registerIds, PHRASE, HASH_PATHS };
