'use strict';
// Rules 4 and 6: the seven owner decisions default to no and no approval is claimed; the packet states the repository at HEAD, the
// cents unit as a PROPOSAL, and prices that are current (within 7 days of the packet date and of the injected date).
const { isObj, isStr, isArr, dayAge } = require('./util.cjs');
const { DATE } = require('./rules-prices.cjs');

const CODES = ['DECISIONS_MISSING', 'DECISION_DEFAULT_NOT_NO', 'ANSWER_SHEET_NOT_NO', 'ANSWER_RUNS_NOT_ZERO', 'PLACEHOLDER_REQUIRED', 'APPROVAL_FLAG_TRUE',
  'APPROVAL_ENVELOPE_NONZERO', 'STATUS_NOT_PROPOSAL', 'UNIT_NOT_PROPOSAL', 'CONSISTENCY_NO_C002_PINS', 'REPO_STATE_MISSING', 'REPO_STATE_HEAD',
  'REPO_STATE_ARTIFACTS', 'REPO_STATE_APPROVAL_CLAIM', 'REPO_STATE_DEFERS', 'REPO_STATE_ALLOWANCE', 'REPO_STATE_QUOTA', 'PRICE_DATE_MISSING',
  'PREPARED_DATE_INVALID', 'PRICE_DATE_STALE', 'PRICE_STALE_NOW'];

const KEYS = ['target', 'iacGeneration', 'scaffold', 'identityRegistration', 'deployment', 'expenditure', 'liveExecution'];
const PLACEHOLDERS = ['subscriptionId', 'tenantId', 'resourceGroupName', 'region'];
const COMMIT = /^[0-9a-f]{7,40}$/;
const ARTIFACTS = [/^demo\//, /infra/, /\.github\/workflows/, /\.azure\/deployment-plan\.md/, /cleanup\.cjs/];
const MAX_PRICE_AGE_DAYS = 7;

function checkDecisions(packet, add) {
  const od = isObj(packet.ownerDecisions) ? packet.ownerDecisions : {};
  const decisions = isArr(od.decisions) ? od.decisions : [];
  for (const key of KEYS) {
    const d = decisions.find((x) => isObj(x) && x.key === key);
    if (!d) add('DECISIONS_MISSING', 'ownerDecisions.decisions', `the decision ${key} is missing`);
    else if (d.default !== 'no') add('DECISION_DEFAULT_NOT_NO', `ownerDecisions.decisions.${key}.default`, `the decision ${key} must default to no`);
  }
  const sheet = isObj(od.answerSheetTemplate) ? od.answerSheetTemplate : {};
  for (const key of KEYS) if (sheet[key] !== 'no') add('ANSWER_SHEET_NOT_NO', `ownerDecisions.answerSheetTemplate.${key}`, `the answer sheet must default ${key} to no`);
  if (sheet.option !== 'none') add('ANSWER_SHEET_NOT_NO', 'ownerDecisions.answerSheetTemplate.option', 'the answer sheet must default the option to none');
  if (sheet.maximumLiveAzureRuns !== 0) add('ANSWER_RUNS_NOT_ZERO', 'ownerDecisions.answerSheetTemplate.maximumLiveAzureRuns', 'the default number of live Azure runs is 0');
  for (const key of PLACEHOLDERS) {
    if (!/^<OWNER-SUPPLIED/.test(String(sheet[key] || ''))) add('PLACEHOLDER_REQUIRED', `ownerDecisions.answerSheetTemplate.${key}`, `${key} must be an owner-supplied placeholder, never a value`);
  }
  const rules = isArr(od.consistencyRules) ? od.consistencyRules : [];
  if (!rules.some((r) => /liveAzureRuns/.test(r) && /cloudSpend/.test(r) && /const 0/.test(r))) add('CONSISTENCY_NO_C002_PINS', 'ownerDecisions.consistencyRules', 'the rules must say that C002 pins scope.liveAzureRuns and limits.budget.cloudSpend to const 0');
}

function checkAuthority(packet, add) {
  const a = isObj(packet.authority) ? packet.authority : {};
  const flags = isObj(a.observedFlags) ? a.observedFlags : null;
  if (!flags || Object.keys(flags).length < 6 || Object.values(flags).some((v) => v !== false)) add('APPROVAL_FLAG_TRUE', 'authority.observedFlags', 'the six approval flags must be observed and all false');
  const env = isObj(a.observedOperatingEnvelope) ? a.observedOperatingEnvelope : null;
  if (!env || env.maximumLiveAzureRuns !== 0 || env.authorizedCloudSpend !== 0) add('APPROVAL_ENVELOPE_NONZERO', 'authority.observedOperatingEnvelope', 'maximumLiveAzureRuns and authorizedCloudSpend must be observed as 0');
  if (!/proposal only/i.test(String(packet.status || ''))) add('STATUS_NOT_PROPOSAL', 'status', 'the status must say proposal only');
  if (!/PROPOSAL/.test(String(a.unitStatement || ''))) add('UNIT_NOT_PROPOSAL', 'authority.unitStatement', 'the cents unit must be called a PROPOSAL: C001 and C002 define no unit');
}

function checkRepositoryState(packet, add) {
  const rs = packet.repositoryState;
  if (!isObj(rs)) { add('REPO_STATE_MISSING', 'repositoryState', 'the packet must state the repository at HEAD'); return; }
  if (!COMMIT.test(String(rs.describesHead || ''))) add('REPO_STATE_HEAD', 'repositoryState.describesHead', 'the HEAD commit the statements describe must be named');
  if (!(isObj(rs.ownerCommit) && COMMIT.test(String(rs.ownerCommit.id || '')))) add('REPO_STATE_HEAD', 'repositoryState.ownerCommit.id', 'the owner commit that added the artifacts must be named');
  const artifacts = isArr(rs.artifacts) ? rs.artifacts : [];
  const paths = artifacts.map((x) => (isObj(x) ? String(x.path) : ''));
  if (!ARTIFACTS.every((re) => paths.some((p) => re.test(p)))) add('REPO_STATE_ARTIFACTS', 'repositoryState.artifacts', 'the state must list demo/, infra, the azure-demo workflows, .azure/deployment-plan.md and demo/cleanup.cjs');
  if (artifacts.some((x) => !isObj(x) || x.approval !== 'not an approval')) add('REPO_STATE_APPROVAL_CLAIM', 'repositoryState.artifacts', 'every HEAD artifact is "not an approval"');
  const rel = isObj(rs.relationToThisPacket) ? rs.relationToThisPacket : {};
  if (rel.headArtifactsAreApprovals !== false) add('REPO_STATE_APPROVAL_CLAIM', 'repositoryState.relationToThisPacket.headArtifactsAreApprovals', 'HEAD artifacts are not approvals');
  if (rel.defersToOwnerPlan !== true) add('REPO_STATE_DEFERS', 'repositoryState.relationToThisPacket.defersToOwnerPlan', 'the packet must defer to the owner plan for the concrete target');
  if (!isStr(rel.allowanceVersusBounds)) add('REPO_STATE_ALLOWANCE', 'repositoryState.relationToThisPacket.allowanceVersusBounds', 'the owner allowance and the planning bounds must be related');
  const q = isObj(rs.quotaValidation) ? rs.quotaValidation : {};
  if (!(isArr(q.regionsFailed) && q.regionsFailed.length > 0 && isStr(q.result) && isObj(q.untested))) add('REPO_STATE_QUOTA', 'repositoryState.quotaValidation', 'the recorded quota failure (regions, result) and the untested regions and SKUs must be stated');
}

function checkDates(packet, add, opts) {
  const priceDate = isObj(packet.pricing) ? packet.pricing.pricingDateUtc : undefined;
  const priceOk = DATE.test(String(priceDate || ''));
  if (!priceOk) add('PRICE_DATE_MISSING', 'pricing.pricingDateUtc', 'the price date (YYYY-MM-DD) is required');
  const preparedOk = !Number.isNaN(Date.parse(packet.preparedAtUtc));
  if (!preparedOk) add('PREPARED_DATE_INVALID', 'preparedAtUtc', 'the packet date (ISO 8601) is required');
  if (priceOk && preparedOk && dayAge(priceDate, packet.preparedAtUtc) > MAX_PRICE_AGE_DAYS) add('PRICE_DATE_STALE', 'pricing.pricingDateUtc', `prices must be at most ${MAX_PRICE_AGE_DAYS} days older than the packet date`);
  if (priceOk && opts.nowUtc && dayAge(priceDate, opts.nowUtc) > MAX_PRICE_AGE_DAYS) add('PRICE_STALE_NOW', 'pricing.pricingDateUtc', `the prices are more than ${MAX_PRICE_AGE_DAYS} days old at ${opts.nowUtc}: re-run the queries`);
}

function checkDecisionsAndState(packet, add, opts) {
  checkDecisions(packet, add);
  checkAuthority(packet, add);
  checkRepositoryState(packet, add);
  checkDates(packet, add, opts);
}

module.exports = { CODES, checkDecisionsAndState };
