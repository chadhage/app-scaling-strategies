'use strict';
// Rules 4 to 7: owner decisions default to no, no identifier or secret, current prices and HEAD state, integrity hash and markdown copy.
const { negative, assert, test, load, run, reseal, goodMarkdown } = require('./support.cjs');

const decision = (p, key) => p.ownerDecisions.decisions.find((d) => d.key === key);
const GUID = '11111111-2222-3333-4444-555555555555';

negative('DECISIONS_MISSING', 'one of the seven decisions is absent', (p) => { p.ownerDecisions.decisions = p.ownerDecisions.decisions.filter((d) => d.key !== 'identityRegistration'); });
negative('DECISION_DEFAULT_NOT_NO', 'a decision that defaults to yes', (p) => { decision(p, 'deployment').default = 'yes'; });
negative('ANSWER_SHEET_NOT_NO', 'an answer sheet that answers yes', (p) => { p.ownerDecisions.answerSheetTemplate.liveExecution = 'yes'; });
negative('ANSWER_SHEET_NOT_NO', 'an answer sheet with a chosen option', (p) => { p.ownerDecisions.answerSheetTemplate.option = 'A'; });
negative('ANSWER_RUNS_NOT_ZERO', 'a default of one live run', (p) => { p.ownerDecisions.answerSheetTemplate.maximumLiveAzureRuns = 1; });
negative('PLACEHOLDER_REQUIRED', 'a subscription that is not an owner-supplied placeholder', (p) => { p.ownerDecisions.answerSheetTemplate.subscriptionId = 'my-sandbox'; });
negative('PLACEHOLDER_REQUIRED', 'a tenant that is not an owner-supplied placeholder', (p) => { p.ownerDecisions.answerSheetTemplate.tenantId = 'contoso'; });
negative('APPROVAL_FLAG_TRUE', 'an approval flag claimed true', (p) => { p.authority.observedFlags.deploymentApproved = true; });
negative('APPROVAL_ENVELOPE_NONZERO', 'a non-zero authorized spend', (p) => { p.authority.observedOperatingEnvelope.authorizedCloudSpend = 500; });
negative('STATUS_NOT_PROPOSAL', 'a status that reads like an approval', (p) => { p.status = 'approved for execution'; });
negative('UNIT_NOT_PROPOSAL', 'a cents unit stated as the ledger unit', (p) => { p.authority.unitStatement = 'The ledger unit is USD cents.'; });
negative('CONSISTENCY_NO_C002_PINS', 'consistency rules that forget the C002 const 0 pins', (p) => { p.ownerDecisions.consistencyRules = p.ownerDecisions.consistencyRules.map((r) => r.replace(/const 0/g, 'zero')); });
negative('REPO_STATE_MISSING', 'no state of the repository at HEAD', (p) => { delete p.repositoryState; });
negative('REPO_STATE_HEAD', 'a HEAD that is not a commit id', (p) => { p.repositoryState.describesHead = 'main'; });
negative('REPO_STATE_ARTIFACTS', 'a state section that omits the owner cleanup script', (p) => { p.repositoryState.artifacts = p.repositoryState.artifacts.filter((a) => !/cleanup/.test(a.path)); });
negative('REPO_STATE_APPROVAL_CLAIM', 'HEAD artifacts presented as approvals', (p) => { p.repositoryState.relationToThisPacket.headArtifactsAreApprovals = true; });
negative('REPO_STATE_APPROVAL_CLAIM', 'an artifact row that is an approval', (p) => { p.repositoryState.artifacts[0].approval = 'approved'; });
negative('REPO_STATE_DEFERS', 'a packet that does not defer to the owner plan', (p) => { p.repositoryState.relationToThisPacket.defersToOwnerPlan = false; });
negative('REPO_STATE_ALLOWANCE', 'no relation between the allowance and the ceilings', (p) => { delete p.repositoryState.relationToThisPacket.allowanceVersusBounds; });
negative('REPO_STATE_QUOTA', 'no recorded quota failure', (p) => { p.repositoryState.quotaValidation.regionsFailed = []; });
negative('PRICE_DATE_MISSING', 'no price date', (p) => { delete p.pricing.pricingDateUtc; });
negative('PREPARED_DATE_INVALID', 'no packet date', (p) => { p.preparedAtUtc = 'yesterday'; });
negative('PRICE_DATE_STALE', 'prices fetched more than 7 days before the packet date', (p) => { p.pricing.pricingDateUtc = '2026-10-20'; });
negative('PRICE_STALE_NOW', 'prices older than 7 days at the injected date', () => {}, { nowUtc: '2026-11-12T00:00:00Z' });
negative('INTEGRITY_MISSING', 'no integrity hash', (p) => { delete p.integrity; }, { seal: false });
negative('INTEGRITY_MISMATCH', 'a changed field without a new hash', (p) => { p.recommendation = `${p.recommendation} Changed.`; }, { seal: false });
negative('GUID_FOUND', 'a subscription-shaped GUID in a decision', (p) => { p.ownerDecisions.answerSheetTemplate.subscriptionId = GUID; });
negative('GUID_FOUND', 'a GUID in the markdown copy', (p) => { p.x = 1; }, { markdown: (p) => `${goodMarkdown(p)}\nsubscription ${GUID}` });
negative('EMAIL_FOUND', 'an e-mail address in a risk', (p) => { p.risksAndAssumptions[0].text += ' Contact owner@example.com'; });
negative('SECRET_SHAPED', 'a connection-string-like secret', (p) => { p.risksAndAssumptions[1].text += ' AccountKey=abcdefghijklmnopqrstuvwxyz0123456789ABCD'; });
negative('SECRET_SHAPED', 'a GitHub token shape', (p) => { p.risksAndAssumptions[2].text += ' ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ'; });
negative('SECRET_SHAPED', 'a long base64-like string', (p) => { p.risksAndAssumptions[3].text += ` ${'Ab1/'.repeat(12)}`; });
negative('HARD_WITHOUT_PHRASE', 'the word hard without the planning-bound phrase', (p) => { p.options[0].when = 'A hard spend ceiling.'; });
negative('HARD_WITHOUT_PHRASE', 'the word hard in the markdown copy', (p) => { p.x = 1; }, { markdown: (p) => `${goodMarkdown(p)}\nA hard cap.` });
negative('MARKDOWN_HASH_MISSING', 'a markdown copy without the packet hash', (p) => { p.x = 1; }, { markdown: () => '## 0a. State of the repository at HEAD $5.00 $15.00 $75.00' });
negative('MARKDOWN_CEILING_MISSING', 'a markdown copy that lacks a ceiling', (p) => { p.x = 1; }, { markdown: (p) => goodMarkdown(p).replace('$75.00', '$70.00') });
negative('MARKDOWN_HEADING_MISSING', 'a markdown copy without the HEAD section', (p) => { p.x = 1; }, { markdown: (p) => goodMarkdown(p).replace('State of the repository at HEAD', 'Notes') });

test('the accepted fixture and a good markdown copy pass; the date injection is optional', () => {
  const p = load();
  assert.equal(run(p, { markdown: goodMarkdown(p) }).ok, true);
  assert.equal(run(p, { nowUtc: undefined }).ok, true);
});

test('PACKET_NOT_OBJECT: a result is { ok, findings: [{ code, path, message }] } and never throws on junk', () => {
  for (const junk of [null, undefined, 5, 'text', []]) {
    const result = run(junk);
    assert.equal(result.ok, false);
    assert.equal(result.findings[0].code, 'PACKET_NOT_OBJECT');
    assert.deepEqual(Object.keys(result.findings[0]).sort(), ['code', 'message', 'path']);
  }
  assert.equal(run({}).ok, false);
});

test('re-sealing changes the hash and a sealed edit is accepted', () => {
  const p = load();
  p.recommendation = `${p.recommendation} Edited.`;
  assert.equal(run(p).ok, false);
  reseal(p);
  assert.equal(run(p).ok, true);
});
