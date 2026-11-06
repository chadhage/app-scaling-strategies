'use strict';
// V3 priced rows, V5 worst case recomputed from the declared caps, and the V13 cross-checks: hostile packets accepted wrongly before.
const { reject, accept, assert, test, run, load, reseal } = require('./hostile.cjs');

const ceilingFor = (w) => Math.ceil(Math.round(((w * 1.25) / 5 + Number.EPSILON) * 1e9) / 1e9) * 5;
const r = (x, d = 8) => Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d;

// Make every derived figure of an option consistent again after a change of its worst-case usage, like a careful forger would.
function refit(p) {
  const lines = new Map(p.pricing.lines.map((l) => [`${l.key}@${l.region}`, l]));
  for (const o of p.options) {
    const w = o.worstCase;
    w.usageUsd = r(w.usage.reduce((s, u) => s + (u.cost = r(u.quantity * u.unitPrice)), 0));
    w.totalUsd = r(w.planUsd + w.usageUsd);
    for (const c of o.regionCandidates) {
      const regional = w.usage.reduce((s, u) => s + u.quantity * (lines.get(`${u.lineKey}@${c.region}`) || { unitPrice: 0 }).unitPrice, 0);
      c.worstCaseUsd = r(o.instanceCap * c.unitPricePerInstanceHourUsd * (o.teardownDeadlineHours + o.teardownLatencyHours) + regional, 6);
    }
    o.spendCeilingUsd = ceilingFor(w.totalUsd);
    o.proposedCloudSpendMinorUnitsUsd = o.spendCeilingUsd * 100;
  }
}

// ---- V3: a priced row needs a positive price from the register; every zero-shaped spelling fails
const ZERO = ['free', 'no charge', 'no cost', 'zero cost', '0 USD per hour', '$0', 'n/a', '', 'no  charge  expected', 'No\u00a0charge\u00a0expected', 'included', 'Free of charge', 'costs nothing'];
for (const text of ZERO) reject('V3 priced resource', JSON.stringify(text), (p) => { p.requiredResources[1].pricing = text; }, ['ZERO_COST_UNSOURCED', 'RESOURCE_PRICING_STATUS']);
reject('V3 unavailable resource', 'price unavailable. Free of charge.', (p) => { p.requiredResources[0].pricing = 'price unavailable. Free of charge.'; }, ['ZERO_COST_UNSOURCED']);
for (const text of ['free', '', '0 USD', 'No charge', 'n/a', 'included', 'no  cost']) {
  reject('V3 exclusion', JSON.stringify(text), (p) => { p.exclusions[0].cost = text; }, ['ZERO_COST_UNSOURCED']);
}
reject('V3 exclusion', 'a missing cost', (p) => { delete p.exclusions[0].cost; }, ['ZERO_COST_UNSOURCED']);
reject('V3 resources', 'all required resources removed', (p) => { p.requiredResources = []; }, ['REQUIRED_RESOURCES_MISSING']);
reject('V3 resources', 'the plan row removed', (p) => { p.requiredResources = p.requiredResources.filter((x) => x.id !== 'PLAN'); }, ['REQUIRED_RESOURCES_MISSING']);
reject('V3 resources', 'a priced row without price keys', (p) => { delete p.requiredResources[1].priceKeys; }, ['RESOURCE_PRICED_NO_LINE']);
reject('V3 resources', 'a priced row pointing at a line that was never returned', (p) => {
  p.pricing.lines.filter((l) => l.key === 'plan.P2v4').forEach((l) => { l.status = 'not-queried'; l.unitPrice = null; l.note = 'price unavailable'; });
  p.requiredResources[1].priceKeys = ['plan.P2v4'];
}, ['RESOURCE_PRICED_NO_LINE']);
reject('V3 resources', 'a priced row pointing at nothing', (p) => { p.requiredResources[1].priceKeys = ['plan.nothing']; }, ['RESOURCE_PRICED_NO_LINE']);
for (const status of ['free', 'n/a', 'included', '', undefined]) reject('V3 resources', `status ${JSON.stringify(status)}`, (p) => { p.requiredResources[1].pricingStatus = status; }, ['RESOURCE_PRICING_STATUS']);
reject('V3 resources', 'a documented row citing an unknown claim', (p) => { p.requiredResources[2].pricing = 'No separate charge (documented, MADE-UP-CLAIM).'; }, ['ZERO_COST_UNSOURCED']);
reject('V3 register', 'a returned line without a meter', (p) => { p.pricing.lines[0].meterId = null; }, ['PRICE_NO_METER']);
reject('V3 register', 'an impossible effective date', (p) => { p.pricing.lines[0].effectiveStartDate = '2026-02-30'; }, ['PRICE_NO_EFFECTIVE_DATE']);
reject('V3 register', 'a text price', (p) => { p.pricing.lines[0].unitPrice = '0.0775'; }, ['PRICE_NOT_POSITIVE']);
reject('V3 register', 'an unknown status such as free', (p) => { p.pricing.lines[0].status = 'free'; }, ['PRICE_STATUS_UNKNOWN']);
reject('V3 register', 'all unpriced items dropped', (p) => { p.pricing.unpricedItems = []; }, ['UNPRICED_MISSING']);

// ---- V5: the worst case is recomputed from the declared caps and the unit prices
reject('V5 caps', 'egress raised to 5000 GB under the old ceiling', (p) => { p.options[0].usageCaps.egressGb = 5000; }, ['OPTION_USAGE_QUANTITY', 'OPTION_CEILING_BELOW_WORST']);
reject('V5 caps', 'a usage line dropped and everything refitted', (p) => { p.options[1].worstCase.usage = p.options[1].worstCase.usage.filter((u) => u.lineKey !== 'bw.paid'); refit(p); }, ['OPTION_USAGE_LINES']);
reject('V5 caps', 'all quantities set to 0 and refitted', (p) => { p.options[0].worstCase.usage.forEach((u) => { u.quantity = 0; }); refit(p); }, ['OPTION_USAGE_QUANTITY', 'OPTION_USAGE_PRICE', 'OPTION_USAGE_COST']);
reject('V5 caps', 'quantities divided by 100 and refitted', (p) => { p.options[1].worstCase.usage.forEach((u) => { u.quantity /= 100; }); refit(p); }, ['OPTION_USAGE_QUANTITY']);
reject('V5 caps', 'a cap of 0', (p) => { p.options[0].usageCaps.blobWriteOps = 0; }, ['OPTION_USAGE_CAPS', 'OPTION_USAGE_QUANTITY']);
reject('V5 price', 'an SKU without a register line', (p) => { p.options[0].skuKey = 'P3v3'; p.options[0].sku = 'P3v3'; }, ['OPTION_PRICE_LINE_MISSING']);
reject('V5 price', 'an unknown SKU with every plan price divided by 100 and refitted', (p) => {
  const o = p.options[0]; o.skuKey = 'P9v9'; o.sku = 'P9v9';
  for (const c of o.regionCandidates) { c.unitPricePerInstanceHourUsd /= 100; c.perHourSteadyUsd = r(o.steadyInstances * c.unitPricePerInstanceHourUsd); c.monthly730Usd = r(c.perHourSteadyUsd * 730, 6); c.expectedPlanCostUsd = r(c.unitPricePerInstanceHourUsd * (o.steadyInstances * o.expectedRunHours + (o.instanceCap - o.steadyInstances) * (o.scaleStepHours || 0)), 6); }
  o.worstCase.planPricePerInstanceHourUsd /= 100; o.worstCase.planUsd = r(o.instanceCap * o.worstCase.planPricePerInstanceHourUsd * o.worstCase.planHoursAtCap, 8); refit(p);
}, ['OPTION_PRICE_LINE_MISSING']);
reject('V5 price', 'the plan price line deleted in one region only', (p) => { const i = p.pricing.lines.findIndex((l) => l.key === 'plan.P0v3' && l.region === 'westus3'); p.pricing.lines.splice(i, 1); }, ['OPTION_PRICE_LINE_MISSING']);
accept('V5 caps', 'a raised cap with usage, worst case, ceiling and cents all moved', (p) => {
  p.options[0].usageCaps.egressGb = 10; p.options[0].worstCase.usage.find((u) => u.lineKey === 'bw.paid').quantity = 10; refit(p);
  for (const o of p.options) o.ceilingHeadroom.headroomUsd = r(o.spendCeilingUsd / 1.25 - o.worstCase.totalUsd, 4);
  const o = p.options[0]; o.ceilingHeadroom.atCapHours = r(o.ceilingHeadroom.headroomUsd / o.ceilingHeadroom.perAtCapHourUsd, 2);
});
reject('V5 headroom', 'a tampered headroom', (p) => { p.options[1].ceilingHeadroom.headroomUsd = 9; }, ['OPTION_HEADROOM']);

// ---- V13: cross-checks and strict formats
reject('V13 quota', 'an impossible date', (p) => { p.options[1].regionCandidates[0].quotaStatus = 'failed-2026-13-45'; }, ['QUOTA_STATUS_INVALID']);
reject('V13 quota', 'a passed status on a region the owner recorded as failed', (p) => {
  const b = p.options.find((o) => o.sku === 'P1 v3'); b.regionCandidates.find((c) => c.region === 'eastus2').quotaStatus = 'passed-2026-11-05';
}, ['QUOTA_CONTRADICTS_RECORD']);
reject('V13 decisions', 'a duplicate decision with default yes', (p) => { p.ownerDecisions.decisions.push({ ...p.ownerDecisions.decisions[0], default: 'yes' }); }, ['DECISION_DUPLICATE', 'DECISION_DEFAULT_NOT_NO']);
for (const d of ['No', 'maybe', null, 'yes']) reject('V13 decisions', `default ${JSON.stringify(d)}`, (p) => { p.ownerDecisions.decisions[2].default = d; }, ['DECISION_DEFAULT_NOT_NO']);
reject('V13 approvals', 'a flag replaced by a dummy', (p) => { const f = p.authority.observedFlags; delete f.scaffoldApproved; f.dummy = false; }, ['APPROVAL_FLAG_TRUE']);
reject('V13 approvals', 'an extra approved flag', (p) => { p.authority.approved = true; }, ['APPROVAL_FLAG_TRUE', 'APPROVAL_CLAIM']);
reject('V13 approvals', 'a status that says approved', (p) => { p.status = 'Approved; this is not a proposal only'; }, ['STATUS_NOT_PROPOSAL']);
reject('V13 approvals', 'a risk that claims the owner approved option A', (p) => { p.risksAndAssumptions[0].text = 'The owner approved option A on 2026-11-06.'; }, ['APPROVAL_CLAIM']);
reject('V13 state', 'hollow artifact names', (p) => { p.repositoryState.artifacts.forEach((a) => { a.path = `nothing-${a.path.replace(/\W+/g, '-')}-here`; }); }, ['REPO_STATE_ARTIFACTS']);
reject('V13 options', 'a ceiling label that says enforced by Azure', (p) => { p.options[0].spendCeilingLabel = 'planning bound, enforced by Azure'; }, ['OPTION_CEILING_LABEL', 'HARD_WITHOUT_PHRASE']);
reject('V13 decisions', 'an answer-sheet placeholder that carries a value', (p) => { p.ownerDecisions.answerSheetTemplate.region = '<OWNER-SUPPLIED: region> eastus'; }, ['PLACEHOLDER_REQUIRED']);
reject('V13 default', 'a default choice that is not an option', (p) => { p.defaultChoice.option = 'Z'; }, ['DEFAULT_CHOICE']);
reject('V13 default', 'a default region that differs from the option default', (p) => { p.defaultChoice.region = 'westus3'; }, ['DEFAULT_CHOICE']);
test('V5 the fixture options keep their reviewed ceilings 5, 15 and 75', () => {
  const p = load(); reseal(p);
  assert.deepEqual(p.options.map((o) => o.spendCeilingUsd), [5, 15, 75]);
  assert.equal(run(p).ok, true);
});
