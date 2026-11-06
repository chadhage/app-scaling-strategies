'use strict';
// Rules 4 and 6 (V1, V13): the seven owner decisions default to no and no approval is claimed; the packet states the repository at HEAD, the
// cents unit as a PROPOSAL, and strict ISO dates that are bounded on both sides by the injected clock (prices at most 7 days old).
const { isObj, isStr, isArr } = require('./util.cjs');
const { parseDate, parseInstant, parseClock, ageDays, utcDay, SKEW_MS } = require('./dates.cjs');

const CODES = ['DECISIONS_MISSING', 'DECISION_DEFAULT_NOT_NO', 'DECISION_DUPLICATE', 'ANSWER_SHEET_NOT_NO', 'ANSWER_RUNS_NOT_ZERO', 'PLACEHOLDER_REQUIRED',
  'APPROVAL_FLAG_TRUE', 'APPROVAL_ENVELOPE_NONZERO', 'STATUS_NOT_PROPOSAL', 'UNIT_NOT_PROPOSAL', 'CONSISTENCY_NO_C002_PINS', 'REPO_STATE_MISSING', 'REPO_STATE_HEAD',
  'REPO_STATE_ARTIFACTS', 'REPO_STATE_APPROVAL_CLAIM', 'REPO_STATE_DEFERS', 'REPO_STATE_ALLOWANCE', 'REPO_STATE_QUOTA', 'PRICE_DATE_MISSING', 'PRICE_DATE_INVALID',
  'PREPARED_DATE_INVALID', 'NOW_INVALID', 'PRICE_DATE_FUTURE', 'PRICE_AFTER_PREPARED', 'PREPARED_IN_FUTURE', 'PRICE_DATE_STALE', 'PRICE_STALE_NOW'];

const KEYS = ['target', 'iacGeneration', 'scaffold', 'identityRegistration', 'deployment', 'expenditure', 'liveExecution'];
const PLACEHOLDERS = ['subscriptionId', 'tenantId', 'resourceGroupName', 'region'];
const FLAGS = ['liveAzureExecutionApproved', 'iacGenerationApproved', 'scaffoldApproved', 'deploymentApproved', 'identityRegistrationApproved', 'expenditureApproved'];
const COMMIT = /^[0-9a-f]{7,40}$/;
const ARTIFACTS = [/^demo\//, /^infra[/\\*]/, /^\.github\/workflows\/azure-demo/, /^\.azure\/deployment-plan\.md$/, /^demo\/cleanup\.cjs$/];
const MAX_PRICE_AGE_DAYS = 7;

// One balanced <...> group that spans the whole string: nested pairs are fine, a value after the closing bracket is not.
function isSinglePlaceholder(value) {
  const s = String(value || '');
  if (!s.startsWith('<OWNER-SUPPLIED') || s.length > 400) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '<') depth += 1;
    else if (s[i] === '>') { depth -= 1; if (depth === 0 && i !== s.length - 1) return false; }
  }
  return depth === 0;
}

function checkDecisions(packet, add) {
  const od = isObj(packet.ownerDecisions) ? packet.ownerDecisions : {};
  const decisions = isArr(od.decisions) ? od.decisions : [];
  for (const key of KEYS) {
    const found = decisions.filter((x) => isObj(x) && x.key === key);
    if (found.length === 0) add('DECISIONS_MISSING', 'ownerDecisions.decisions', `the decision ${key} is missing`);
    else if (found.length > 1) add('DECISION_DUPLICATE', 'ownerDecisions.decisions', `the decision ${key} is listed ${found.length} times`);
    if (found.some((d) => d.default !== 'no')) add('DECISION_DEFAULT_NOT_NO', `ownerDecisions.decisions.${key}.default`, `the decision ${key} must default to no`);
  }
  const sheet = isObj(od.answerSheetTemplate) ? od.answerSheetTemplate : {};
  for (const key of KEYS) if (sheet[key] !== 'no') add('ANSWER_SHEET_NOT_NO', `ownerDecisions.answerSheetTemplate.${key}`, `the answer sheet must default ${key} to no`);
  if (sheet.option !== 'none') add('ANSWER_SHEET_NOT_NO', 'ownerDecisions.answerSheetTemplate.option', 'the answer sheet must default the option to none');
  if (sheet.maximumLiveAzureRuns !== 0) add('ANSWER_RUNS_NOT_ZERO', 'ownerDecisions.answerSheetTemplate.maximumLiveAzureRuns', 'the default number of live Azure runs is 0');
  for (const key of PLACEHOLDERS) {
    if (!isSinglePlaceholder(sheet[key])) add('PLACEHOLDER_REQUIRED', `ownerDecisions.answerSheetTemplate.${key}`, `${key} must be one owner-supplied placeholder and nothing else, never a value`);
  }
  const rules = isArr(od.consistencyRules) ? od.consistencyRules : [];
  if (!rules.some((r) => /liveAzureRuns/.test(r) && /cloudSpend/.test(r) && /const 0/.test(r))) add('CONSISTENCY_NO_C002_PINS', 'ownerDecisions.consistencyRules', 'the rules must say that C002 pins scope.liveAzureRuns and limits.budget.cloudSpend to const 0');
}

function checkAuthority(packet, add) {
  const a = isObj(packet.authority) ? packet.authority : {};
  const flags = isObj(a.observedFlags) ? a.observedFlags : null;
  const names = flags ? Object.keys(flags).sort() : [];
  if (!flags || names.join() !== [...FLAGS].sort().join() || names.some((k) => flags[k] !== false)) add('APPROVAL_FLAG_TRUE', 'authority.observedFlags', 'exactly the six approval flags must be observed, all false');
  const extra = Object.entries(a).filter(([k, v]) => /approv|authori[sz]/i.test(k) && !['observedFlags', 'observedOperatingEnvelope', 'firstNativeConfiguration'].includes(k) && v !== false && typeof v !== 'string');
  if (extra.length > 0) add('APPROVAL_FLAG_TRUE', `authority.${extra[0][0]}`, 'no further approval flag may exist on the authority record');
  const env = isObj(a.observedOperatingEnvelope) ? a.observedOperatingEnvelope : null;
  if (!env || env.maximumLiveAzureRuns !== 0 || env.authorizedCloudSpend !== 0) add('APPROVAL_ENVELOPE_NONZERO', 'authority.observedOperatingEnvelope', 'maximumLiveAzureRuns and authorizedCloudSpend must be observed as 0');
  const status = String(packet.status || '');
  if (!/^proposal only\b/i.test(status) || /\bapproved\b/i.test(status)) add('STATUS_NOT_PROPOSAL', 'status', 'the status must start with proposal only and never say approved');
  if (!/PROPOSAL/.test(String(a.unitStatement || ''))) add('UNIT_NOT_PROPOSAL', 'authority.unitStatement', 'the cents unit must be called a PROPOSAL: C001 and C002 define no unit');
}

function checkRepositoryState(packet, add) {
  const rs = packet.repositoryState;
  if (!isObj(rs)) { add('REPO_STATE_MISSING', 'repositoryState', 'the packet must state the repository at HEAD'); return; }
  if (!COMMIT.test(String(rs.describesHead || ''))) add('REPO_STATE_HEAD', 'repositoryState.describesHead', 'the HEAD commit the statements describe must be named');
  if (!(isObj(rs.ownerCommit) && COMMIT.test(String(rs.ownerCommit.id || '')))) add('REPO_STATE_HEAD', 'repositoryState.ownerCommit.id', 'the owner commit that added the artifacts must be named');
  const artifacts = isArr(rs.artifacts) ? rs.artifacts : [];
  const paths = artifacts.map((x) => (isObj(x) ? String(x.path) : ''));
  if (!ARTIFACTS.every((re) => paths.some((p) => re.test(p)))) add('REPO_STATE_ARTIFACTS', 'repositoryState.artifacts', 'the state must list demo/, infra/, the azure-demo workflows, .azure/deployment-plan.md and demo/cleanup.cjs');
  if (artifacts.some((x) => !isObj(x) || x.approval !== 'not an approval')) add('REPO_STATE_APPROVAL_CLAIM', 'repositoryState.artifacts', 'every HEAD artifact is "not an approval"');
  const rel = isObj(rs.relationToThisPacket) ? rs.relationToThisPacket : {};
  if (rel.headArtifactsAreApprovals !== false) add('REPO_STATE_APPROVAL_CLAIM', 'repositoryState.relationToThisPacket.headArtifactsAreApprovals', 'HEAD artifacts are not approvals');
  if (rel.defersToOwnerPlan !== true) add('REPO_STATE_DEFERS', 'repositoryState.relationToThisPacket.defersToOwnerPlan', 'the packet must defer to the owner plan for the concrete target');
  if (!isStr(rel.allowanceVersusBounds)) add('REPO_STATE_ALLOWANCE', 'repositoryState.relationToThisPacket.allowanceVersusBounds', 'the owner allowance and the planning bounds must be related');
  const q = isObj(rs.quotaValidation) ? rs.quotaValidation : {};
  if (!(isArr(q.regionsFailed) && q.regionsFailed.length > 0 && isStr(q.result) && isObj(q.untested))) add('REPO_STATE_QUOTA', 'repositoryState.quotaValidation', 'the recorded quota failure (regions, result) and the untested regions and SKUs must be stated');
}

// Strict dates, bounded on both sides: the price date is a real date, not after the packet date and not after the clock; the packet date is a
// real instant with a zone, not later than the clock plus a 5 minute skew; the price is at most 7 calendar days old at the packet date and now.
function checkDates(packet, add, opts) {
  const raw = isObj(packet.pricing) ? packet.pricing.pricingDateUtc : undefined;
  const price = parseDate(raw);
  if (raw === undefined || raw === null || raw === '') add('PRICE_DATE_MISSING', 'pricing.pricingDateUtc', 'the price date (YYYY-MM-DD) is required');
  else if (Number.isNaN(price)) add('PRICE_DATE_INVALID', 'pricing.pricingDateUtc', 'the price date must be one real calendar date written YYYY-MM-DD');
  const prepared = parseInstant(packet.preparedAtUtc);
  if (Number.isNaN(prepared)) add('PREPARED_DATE_INVALID', 'preparedAtUtc', 'the packet date must be an ISO instant with a time zone, e.g. 2026-11-06T07:31:49Z');
  if (!Number.isNaN(price) && !Number.isNaN(prepared)) {
    if (price > utcDay(prepared)) add('PRICE_AFTER_PREPARED', 'pricing.pricingDateUtc', 'the prices cannot be newer than the packet that quotes them');
    else if (ageDays(price, prepared) > MAX_PRICE_AGE_DAYS) add('PRICE_DATE_STALE', 'pricing.pricingDateUtc', `prices must be at most ${MAX_PRICE_AGE_DAYS} days older than the packet date`);
  }
  if (opts.nowUtc === undefined || opts.nowUtc === null) return;
  const now = parseClock(opts.nowUtc);
  if (Number.isNaN(now)) { add('NOW_INVALID', 'nowUtc', 'the clock must be an ISO instant or a YYYY-MM-DD date'); return; }
  if (!Number.isNaN(price)) {
    if (price > utcDay(now)) add('PRICE_DATE_FUTURE', 'pricing.pricingDateUtc', 'the price date lies in the future of the clock');
    else if (ageDays(price, now) > MAX_PRICE_AGE_DAYS) add('PRICE_STALE_NOW', 'pricing.pricingDateUtc', `the prices are more than ${MAX_PRICE_AGE_DAYS} days old at ${opts.nowUtc}: re-run the queries`);
  }
  if (!Number.isNaN(prepared) && prepared > now + SKEW_MS) add('PREPARED_IN_FUTURE', 'preparedAtUtc', 'the packet date lies in the future of the clock');
}

function checkDecisionsAndState(packet, add, opts) {
  checkDecisions(packet, add);
  checkAuthority(packet, add);
  checkRepositoryState(packet, add);
  checkDates(packet, add, opts);
}

module.exports = { CODES, checkDecisionsAndState, KEYS };
