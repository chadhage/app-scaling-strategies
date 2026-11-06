'use strict';
// Edge cases: malformed shapes never throw, and optional fields fall back the way the rules document.
const { assert, test, load, reseal, run } = require('./support.cjs');
const { validatePacket } = require('../packet-validator.cjs');

const codes = (p, extra) => new Set(run(reseal(p), extra).findings.map((f) => f.code));

test('settings are optional: no settings, null settings and a non-object all behave like no markdown and no date', () => {
  assert.equal(validatePacket(load()).ok, true);
  assert.equal(validatePacket(load(), null).ok, true);
  assert.equal(validatePacket(load(), 'x').ok, true);
});

test('a missing price register does not throw and is reported', () => {
  const p = load();
  delete p.pricing;
  const found = codes(p);
  assert.ok(found.has('PRICES_MISSING') && found.has('PRICE_DATE_MISSING'));
});

test('a junk price line is reported as an unknown status', () => {
  const p = load();
  p.pricing.lines.push(null, 'text');
  assert.ok(codes(p).has('PRICE_STATUS_UNKNOWN'));
});

test('junk options are reported and never throw', () => {
  const p = load();
  p.options = [null, 5, 'x'];
  const found = codes(p);
  assert.ok(found.has('OPTION_ID'));
});

test('a null region candidate and a null usage line are reported', () => {
  const p = load();
  p.options[1].regionCandidates[0] = null;
  p.options[0].worstCase.usage.push(null);
  const found = codes(p);
  assert.ok(found.has('OPTION_REGIONS'));
  assert.ok(found.has('OPTION_USAGE_COST') && found.has('OPTION_PRICE_LINE_UNAVAILABLE'));
});

test('an option without a worst case is reported once per rule and never throws', () => {
  const p = load();
  delete p.options[2].worstCase;
  assert.ok(codes(p).has('OPTION_WORST_TOTAL'));
});

test('phases that are missing or not objects do not add up', () => {
  const p = load();
  delete p.options[0].expectedPhases;
  p.options[1].expectedPhases = [null, 'x'];
  assert.ok(codes(p).has('OPTION_PHASES_SUM'));
});

test('a usage line unknown to the register is reported as unavailable, not priced', () => {
  const p = load();
  p.options[0].worstCase.usage[2].lineKey = 'blob.nothing';
  assert.ok(codes(p).has('OPTION_PRICE_LINE_UNAVAILABLE'));
});

test('without scaleStepHours an option with cap = steady still recomputes; the SKU key falls back to the SKU name', () => {
  const p = load();
  delete p.options[0].scaleStepHours;
  p.options.forEach((o) => { delete o.skuKey; });
  assert.equal(run(reseal(p)).ok, true);
});

test('a workspace option needs its log lines and cap windows', () => {
  const p = load();
  p.options[2].logs.capWindowsInDeadline = 0;
  assert.ok(codes(p).has('OPTION_LOGS'));
});

test('junk plan sections are reported and never throw', () => {
  const p = load();
  p.cleanupAndRollback = { guards: 'x', armingSequence: [null, { commands: 'x' }], deletionOrder: [null, 5], verification: [null], rollback: [null], teardown: 'x', leaseTags: 'x' };
  const found = codes(p);
  for (const expected of ['GUARD_G1_MISSING', 'ARMING_NO_PIN', 'SCRIPT_MISSING', 'VERIFY_MISSING', 'ROLLBACK_NO_SWAP', 'LEASE_TAGS']) assert.ok(found.has(expected), expected);
  p.cleanupAndRollback.deletionOrder = [];
  assert.ok(codes(p).has('DELETION_MISSING'));
});

test('an arming sequence without a group creation is reported', () => {
  const p = load();
  p.cleanupAndRollback.armingSequence = p.cleanupAndRollback.armingSequence.filter((s) => !s.commands.some((c) => /az group create/.test(c)));
  assert.ok(codes(p).has('ARMING_TAGS'));
});

test('junk decisions, authority and state are reported and never throw', () => {
  const p = load();
  p.ownerDecisions = 'x';
  p.authority = null;
  p.repositoryState = { artifacts: [null], relationToThisPacket: 'x', quotaValidation: 'x', ownerCommit: 'x' };
  p.revision = null;
  const found = codes(p);
  for (const expected of ['DECISIONS_MISSING', 'APPROVAL_FLAG_TRUE', 'APPROVAL_ENVELOPE_NONZERO', 'REPO_STATE_HEAD', 'REPO_STATE_ARTIFACTS', 'REPO_STATE_DEFERS', 'REPO_STATE_QUOTA']) assert.ok(found.has(expected), expected);
});

test('junk exclusions and resources are reported', () => {
  const p = load();
  p.exclusions = [null];
  p.requiredResources = [null];
  const found = codes(p);
  assert.ok(found.has('ZERO_COST_UNSOURCED') && found.has('RESOURCE_PRICING_STATUS'));
});

test('a documented no-charge claim with a Learn source is accepted; without one it is rejected', () => {
  const p = load();
  p.requiredResources[0].meterEvidence.chargeLabel = 'documented';
  assert.ok(codes(p).has('ZERO_COST_UNSOURCED'));
  p.requiredResources[0].meterEvidence.source = 'https://learn.microsoft.com/azure/azure-resource-manager/management/overview';
  assert.equal(run(reseal(p)).ok, true);
});

test('a zero claim on a priced resource and a returned-zero line that is sourced', () => {
  const p = load();
  p.requiredResources[1].pricing = 'Priced at $0 per hour';
  assert.ok(codes(p).has('ZERO_COST_UNSOURCED'));
});

test('markdown scanning ignores the packet hashes and the junk-free fixture markdown passes', () => {
  const p = reseal(load());
  const md = `# t\n${p.integrity.packetSha256}\n${p.revision.supersedes.packetSha256}\n$5.00 $15.00 $75.00\n## 0a. State of the repository at HEAD\n`;
  assert.equal(run(p, { markdown: md }).ok, true);
  assert.equal(run(p, { markdown: 5 }).ok, true);
});

test('options without a list or with junk entries in the packet-level lists do not throw', () => {
  const p = load();
  p.options = 'x';
  p.risksAndAssumptions = null;
  assert.ok(codes(p).has('OPTIONS_COUNT'));
});
