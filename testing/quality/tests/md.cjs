'use strict';
// A markdown copy that says what the JSON says: the contract the validator derives (headings, ceilings next to option names, default choice,
// quota statuses, price expiry, allowance and approvals sentences, decision defaults, hash, and the command blocks line by line).
const usd2 = (x) => `$${x.toFixed(2)}`;
const round8 = (x) => Math.round((x + Number.EPSILON) * 1e8) / 1e8;
// The number style of the real renderer: at least two decimals, no trailing zeros beyond that.
const usd = (x) => { const s = String(round8(x)); if (!s.includes('.')) return `${s}.00`; return s.split('.')[1].length === 1 ? `${s}0` : s; };

// The code blocks in the order of the real markdown: guard functions (4.1), arming (4.2), teardown script (4.3), deletion (4.4), verification (4.5), rollback (4.6).
const blocks = (p) => {
  const c = p.cleanupAndRollback;
  const of = (section) => section.flatMap((step) => step.commands || []);
  return [c.guardFunctions, of(c.armingSequence), c.teardown.job.script, of(c.deletionOrder), of(c.verification), of(c.rollback)];
};
const commandLines = (p) => blocks(p).flat();

const status = '**Status: proposal only. Nothing here is an approval.** Today approvals.C001 has all six flags false, maximumLiveAzureRuns 0 and authorizedCloudSpend 0; zero means forbidden, not free. Every owner decision defaults to **no**. The owner artifacts at HEAD (demo/, infra/, the azure-demo workflows, .azure/deployment-plan.md) are not approvals either. No subscription ID appears: it is an owner-supplied placeholder. A missing price is written "price unavailable" and is never costed as 0.';

function optionBlock(o) {
  const w = o.worstCase;
  const regions = o.regionCandidates.map((c) => c.region);
  return [
    `### Option ${o.id}: ${o.title}`, '',
    '| Field | Value |', '| --- | --- |',
    `| Plan | ${o.tier} Plan - Linux: ${o.sku} (CLI-style SKU name ${o.cliSku}; estimated, confirm at the first what-if) |`,
    `| Instances | ${o.steadyInstances} steady, cap ${o.instanceCap} (manual only) |`,
    `| Region candidates | ${regions.join(', ')} (default ${o.defaultRegion}; quota status of each in section 0b and below) |`,
    `| Expected run duration (${o.phasesLabel}) | ${o.expectedRunHours} h: ${o.expectedPhases.map((x) => `${x.step} ${x.hours} h`).join('; ')} |`,
    `| Automatic teardown deadline | ${o.teardownDeadlineHours} h after plan creation; teardown latency allowed in the worst case: ${o.teardownLatencyHours} h |`,
    `| Spend ceiling (${o.spendCeilingLabel}) | $${usd(o.spendCeilingUsd)} (${o.proposedCloudSpendMinorUnitsUsd} USD cents, a PROPOSED unit: C001 and C002 define none); worst case $${usd(w.totalUsd)} |`, '',
    '| Region | Price per instance-hour | Per hour (steady) | Per 730 h month | Expected plan cost for the run | Worst case in region | Quota status |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...o.regionCandidates.map((c) => `| ${c.region} | $${usd(c.unitPricePerInstanceHourUsd)} (eff ${c.effectiveStartDate}) | $${usd(c.perHourSteadyUsd)} | $${usd(c.monthly730Usd)} | $${usd(c.expectedPlanCostUsd)} | $${usd(c.worstCaseUsd)} | ${c.quotaStatus} |`), '',
    '| Worst-case component (highest price across candidates) | Quantity | Unit price | Cost |', '| --- | --- | --- | --- |',
    `| Plan at the instance cap | ${w.planHoursAtCap * o.instanceCap} instance-hours | $${usd(w.planPricePerInstanceHourUsd)} | $${usd(w.planUsd)} |`,
    ...w.usage.map((u) => `| ${u.item} | ${u.quantity} ${u.unit} | $${usd(u.unitPrice)} | $${usd(u.cost)} |`),
    `| Total worst case |  |  | $${usd(w.totalUsd)} |`, ''
  ];
}

function faithfulMarkdown(p) {
  const expiry = new Date(Date.parse(`${p.pricing.pricingDateUtc}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const r = p.revision;
  const rows = p.options.map((o) => {
    const c = o.regionCandidates.find((x) => x.region === o.defaultRegion);
    return `| ${o.id} ${o.name} | ${o.sku} x ${o.steadyInstances} (cap ${o.instanceCap}) | $${usd(c.perHourSteadyUsd)} | $${usd(c.monthly730Usd)} | ${o.expectedRunHours} h | $${usd(c.expectedPlanCostUsd)} | ${o.teardownDeadlineHours} h | $${usd(o.worstCase.totalUsd)} | $${usd(o.spendCeilingUsd)} |`;
  });
  const glance = ['| Option | Plan | Per hour (plan, steady) | Per 730 h month if left running | Expected run | Expected plan cost | Teardown deadline | Worst case (deadline + 1 h latency) | Spend ceiling (planning bound, not enforced by Azure) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows];
  const regions = [...new Set(p.options.flatMap((o) => o.regionCandidates.map((c) => c.region)))];
  const quota = [`| Option and SKU | ${regions.join(' | ')} |`, `| --- | ${regions.map(() => '---').join(' | ')} |`,
    ...p.options.map((o) => `| ${o.id} ${o.sku} | ${regions.map((x) => { const c = o.regionCandidates.find((y) => y.region === x); return c ? c.quotaStatus : 'not a candidate'; }).join(' | ')} |`)];
  const decisions = p.ownerDecisions.decisions.flatMap((d) => [`### ${d.key}: ${d.question}`, '', `- Default: **${d.default}**. Needed by: ${d.neededBy}`, '']);
  const [guardFns, arming, script, deletion, verification, rollback] = blocks(p);
  const fence = (lines) => ['```powershell', ...lines, '```', ''];
  return [
    `# ${p.title}`, '',
    `Revision ${r.number}, prepared ${p.preparedAtUtc} by ${p.preparedBy}. It supersedes revision ${r.number - 1} (SHA-256 ${r.supersedes.packetSha256}, prepared ${r.supersedes.preparedAtUtc}). Prices dated ${p.pricing.pricingDateUtc} (USD, Azure Retail Prices API); they stay usable until ${expiry} by the 7-day rule. Describes repository HEAD ${p.repositoryState.describesHead}. Packet SHA-256 ${p.integrity.packetSha256}.`, '',
    status, '',
    `## 0. At a glance (default option ${p.defaultChoice.option}, default region ${p.defaultChoice.region}, ${p.defaultChoice.quotaStatus}; Linux, one staging slot)`, '', ...glance, '',
    `Recommendation: ${p.recommendation}`, '',
    '## 0a. State of the repository at HEAD', '', p.repositoryState.relationToThisPacket.allowanceVersusBounds, '',
    '## 0b. Quota status of every option and region', '', ...quota, '',
    '## 1. Pricing evidence', '', '## 2. Bounded options (all Linux, Node.js 24 LTS, one staging slot, no autoscale)', '', ...p.options.flatMap(optionBlock),
    '## 3. Required resources, costs and exclusions', '', '## 4. Cleanup and rollback plan', '',
    '### 4.1 Guards', '', ...fence(guardFns), '### 4.2 Arming sequence', '', ...fence(arming), '### 4.3 Teardown', '', ...fence(script),
    '### 4.4 Deletion order', '', ...fence(deletion), '### 4.5 Verification', '', ...fence(verification), '### 4.6 Rollback', '', ...fence(rollback),
    '## 5. Exact owner decisions U002 must collect', '', ...decisions, '## 6. Risks and assumptions', '',
    '## Appendix A. Exact price queries', '', '## Appendix B. Price line register', '', '## Appendix C. Documented sources', '', '## Appendix D. Validation', ''
  ].join('\n');
}

module.exports = { faithfulMarkdown, commandLines, usd2, usd, status };
