'use strict';
// A markdown copy that says what the JSON says: the contract the validator derives (headings, ceilings next to option names, default choice,
// quota statuses, price expiry, allowance and approvals sentences, decision defaults, hash, and the command blocks line by line).
const usd2 = (x) => `$${x.toFixed(2)}`;

const commandLines = (p) => {
  const c = p.cleanupAndRollback;
  const lines = [];
  for (const s of ['armingSequence', 'deletionOrder', 'verification', 'rollback']) c[s].forEach((step) => lines.push(...(step.commands || [])));
  lines.push(...c.guardFunctions, ...c.teardown.job.script);
  return lines;
};

function faithfulMarkdown(p) {
  const expiry = new Date(Date.parse(`${p.pricing.pricingDateUtc}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const rows = p.options.map((o) => `| ${o.id} ${o.name} | ${o.sku} | ${usd2(o.spendCeilingUsd)} |`);
  const regions = [...new Set(p.options.flatMap((o) => o.regionCandidates.map((c) => c.region)))];
  const quota = [`| Option and SKU | ${regions.join(' | ')} |`, `| --- | ${regions.map(() => '---').join(' | ')} |`,
    ...p.options.map((o) => `| ${o.id} ${o.sku} | ${regions.map((r) => { const c = o.regionCandidates.find((x) => x.region === r); return c ? c.quotaStatus : 'not a candidate'; }).join(' | ')} |`)];
  const decisions = p.ownerDecisions.decisions.flatMap((d) => [`### ${d.key}: ${d.question}`, '', `- Default: **${d.default}**. Needed by: ${d.neededBy}`, '']);
  return [
    `# ${p.title}`, '',
    `Packet SHA-256 ${p.integrity.packetSha256}. Prices stay usable until ${expiry} by the 7-day rule.`, '',
    'approvals.C001 has all six flags false, maximumLiveAzureRuns 0 and authorizedCloudSpend 0. Proposal only: nothing here is an approval.', '',
    `## 0. At a glance (default option ${p.defaultChoice.option}, default region ${p.defaultChoice.region}, ${p.defaultChoice.quotaStatus})`, '', ...rows, '',
    '## 0a. State of the repository at HEAD', '', p.repositoryState.relationToThisPacket.allowanceVersusBounds, '',
    '## 0b. Quota status of every option and region', '', ...quota, '',
    '## 1. Pricing evidence', '', '## 2. Bounded options', '', '## 3. Required resources, costs and exclusions', '', '## 4. Cleanup and rollback plan', '',
    '```powershell', ...commandLines(p), '```', '',
    '## 5. Exact owner decisions U002 must collect', '', ...decisions, '## 6. Risks and assumptions', '',
    '## Appendix A. Exact price queries', '', '## Appendix B. Price line register', '', '## Appendix C. Documented sources', '', '## Appendix D. Validation', ''
  ].join('\n');
}

module.exports = { faithfulMarkdown, commandLines, usd2 };
