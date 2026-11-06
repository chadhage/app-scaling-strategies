'use strict';
// N9: the structured parts of the markdown copy are compared with the JSON IN ORDER, not by presence: the status paragraph, the revision line, the
// at-a-glance rows, every option block (plan size, instances, regions, expected hours, deadline, price rows, totals), the quota rows, the decision
// order, the single recommendation, every expiry date and the code blocks line by line. The wording rules reject claims anywhere in the prose.
// NOT compared with the JSON (README): the free-form prose of the sections 0a, 1, 3, 6 and the appendices, the revision narrative and the headings'
// remaining words; they only pass the wording, identifier and amount scans.
const { isObj, isArr, approx } = require('./util.cjs');
const { parseDate, DAY_MS } = require('./dates.cjs');
const { linesOf } = require('./rules-plan.cjs');

const CODES = ['MARKDOWN_STATUS', 'MARKDOWN_HEADER', 'MARKDOWN_TABLE_MISMATCH', 'MARKDOWN_OPTION_MISMATCH', 'MARKDOWN_RECOMMENDATION', 'MARKDOWN_CODE_ORDER', 'MARKDOWN_CLAIM'];

const STATUS_LINE = '**Status: proposal only. Nothing here is an approval.** Today approvals.C001 has all six flags false, maximumLiveAzureRuns 0 and authorizedCloudSpend 0; zero means forbidden, not free. Every owner decision defaults to **no**. The owner artifacts at HEAD (demo/, infra/, the azure-demo workflows, .azure/deployment-plan.md) are not approvals either. No subscription ID appears: it is an owner-supplied placeholder. A missing price is written "price unavailable" and is never costed as 0.';

// Claims no prose line may make (a tripwire for the reviewed phrasings, not a proof): approval, authorisation, a free or zero-cost run.
const CLAIMS = [
  [/\bstatus\s*:\s*(?:approved|authori[sz]ed|granted|go\b|cleared)/i, 'a status that says approved'],
  [/\bapproval\s+(?:is\s+|was\s+)?(?:granted|given|obtained|received)\b/i, 'an approval that is granted'],
  [/\bno\s+approval\s+(?:is\s+|will\s+be\s+)?(?:needed|required|necessary)\b/i, 'no approval is needed'],
  [/\b(?:runs?|deployment|execution|spend|expenditure|proof)\s+(?:is\s+|are\s+|was\s+|has\s+been\s+)?(?:now\s+)?(?:authori[sz]ed|approved|cleared)\b/i, 'a run that is authorised'],
  [/\b(?:is|are|will\s+be|stays?|remains?)\s+(?:completely\s+|entirely\s+)?(?:free|gratis)\b(?!\s+(?:text|tier|plan|form|software|space))/i, 'a free run'],
  [/\bfree\s+of\s+charge\b|\bcosts?\s+nothing\b(?!\s+extra)|\bat\s+no\s+(?:cost|charge)\b/i, 'a free or zero-cost run']
];

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const money = (cell) => { const m = /^\$([\d,]+(?:\.\d+)?)/.exec(String(cell).trim()); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
const same = (cell, value) => typeof value === 'number' && approx(money(cell), value, 1e-9 * Math.max(1, Math.abs(value)));

// Consecutive lines that start with a pipe form one table: { header, rows } (the separator row is dropped).
function tablesIn(lines) {
  const tables = [];
  let current = null;
  for (const line of lines) {
    if (line.trimStart().startsWith('|')) {
      const row = cells(line);
      if (current === null) { current = { header: row, rows: [], sawSeparator: false }; tables.push(current); } else if (!current.sawSeparator && row.every((c) => /^:?-+:?$/.test(c))) current.sawSeparator = true;
      else current.rows.push(row);
    } else current = null;
  }
  return tables;
}

function sectionOf(lines, start, stop) {
  const from = lines.findIndex(start);
  if (from < 0) return null;
  const to = lines.findIndex((l, i) => i > from && stop(l));
  return lines.slice(from, to < 0 ? lines.length : to);
}

// A row is a list of [kind, expected]: t exact text, s text prefix, m money (numeric), p price cell with its effective date.
function rowMatches(row, want) {
  return row.length === want.length && want.every(([kind, value, extra], i) => {
    if (kind === 'm') return same(row[i], value);
    if (kind === 'p') return same(row[i], value) && row[i].includes(`(eff ${extra})`);
    if (kind === 's') return row[i].startsWith(String(value));
    return row[i] === String(value);
  });
}

const optionsOf = (packet) => (isArr(packet.options) ? packet.options.filter(isObj) : []);
const candidatesOf = (o) => (isArr(o.regionCandidates) ? o.regionCandidates.filter(isObj) : []);
const worstOf = (o) => (isObj(o.worstCase) ? o.worstCase : {});

function checkStatusAndHeader(packet, prose, add) {
  const hits = prose.filter((l) => l === STATUS_LINE).length;
  if (hits !== 1) add('MARKDOWN_STATUS', 'markdown', `the status paragraph (proposal only, nothing here is an approval) must appear exactly once and unchanged; found ${hits}`);
  const other = prose.filter((l) => l !== STATUS_LINE && /^[\s*_>#-]*status\b\s*:/i.test(l));
  if (other.length > 0) add('MARKDOWN_STATUS', 'markdown', `no other line may state a status: ${other[0].slice(0, 80)}`);
  const r = isObj(packet.revision) ? packet.revision : {};
  const sup = isObj(r.supersedes) ? r.supersedes : {};
  const expiry = parseDate(isObj(packet.pricing) ? packet.pricing.pricingDateUtc : undefined);
  const head = prose.find((l) => l.startsWith('Revision ') && l.includes(', prepared '));
  const wanted = [`Revision ${r.number}, prepared ${packet.preparedAtUtc} by ${packet.preparedBy}. It supersedes revision ${r.number - 1} (SHA-256 ${sup.packetSha256}, prepared ${sup.preparedAtUtc})`,
    `Prices dated ${isObj(packet.pricing) ? packet.pricing.pricingDateUtc : ''} (USD, Azure Retail Prices API)`, Number.isNaN(expiry) ? 'usable until' : `they stay usable until ${new Date(expiry + 7 * DAY_MS).toISOString().slice(0, 10)} by the 7-day rule`,
    `Describes repository HEAD ${isObj(packet.repositoryState) ? packet.repositoryState.describesHead : ''}. Packet SHA-256 ${isObj(packet.integrity) ? packet.integrity.packetSha256 : ''}.`];
  if (!head || wanted.some((w) => !head.includes(w))) add('MARKDOWN_HEADER', 'markdown', 'the revision line must name the revision, its date, author, the superseded revision, the price date, the expiry, HEAD and the packet hash exactly as the JSON does');
}

function checkGlance(packet, prose, add) {
  const block = sectionOf(prose, (l) => l.startsWith('## 0. At a glance'), (l) => l.startsWith('## '));
  const table = block ? tablesIn(block).find((t) => t.header[0] === 'Option') : null;
  const want = optionsOf(packet).map((o) => {
    const c = candidatesOf(o).find((x) => x.region === o.defaultRegion);
    return c ? [['t', `${o.id} ${o.name}`], ['t', `${o.sku} x ${o.steadyInstances} (cap ${o.instanceCap})`], ['m', c.perHourSteadyUsd], ['m', c.monthly730Usd], ['t', `${o.expectedRunHours} h`], ['m', c.expectedPlanCostUsd],
      ['t', `${o.teardownDeadlineHours} h`], ['m', worstOf(o).totalUsd], ['m', o.spendCeilingUsd]] : null;
  });
  want.forEach((w, i) => {
    if (!table || !w || !table.rows[i] || !rowMatches(table.rows[i], w)) add('MARKDOWN_TABLE_MISMATCH', 'markdown:at a glance', `row ${i + 1} of the at-a-glance table must show option ${optionsOf(packet)[i].id} exactly as the JSON does (plan size, price, hours, deadline, worst case, ceiling)`);
  });
  if (table && table.rows.length !== want.length) add('MARKDOWN_TABLE_MISMATCH', 'markdown:at a glance', `the at-a-glance table has ${table.rows.length} rows, the JSON has ${want.length} options`);
}

function checkOptionBlock(o, block, add) {
  const fail = (what) => add('MARKDOWN_OPTION_MISMATCH', `markdown:option ${o.id}`, `${what} differs from the JSON`);
  const tables = tablesIn(block);
  const fields = tables.find((t) => t.header[0] === 'Field');
  const field = (label) => { const row = fields && fields.rows.find((r) => r[0].startsWith(label)); return row ? row[1] : ''; };
  const w = worstOf(o);
  const regions = candidatesOf(o).map((c) => c.region);
  if (!field('Plan').includes(`: ${o.sku} (`)) fail('the plan SKU');
  if (!field('Instances').startsWith(`${o.steadyInstances} steady, cap ${o.instanceCap}`)) fail('the instance count');
  if (!field('Region candidates').startsWith(`${regions.join(', ')} (default ${o.defaultRegion};`)) fail('the region candidates');
  if (!field('Expected run duration').startsWith(`${o.expectedRunHours} h:`)) fail('the expected run hours');
  const deadline = field('Automatic teardown deadline');
  if (!deadline.startsWith(`${o.teardownDeadlineHours} h after`) || !deadline.includes(`teardown latency allowed in the worst case: ${o.teardownLatencyHours} h`)) fail('the teardown deadline');
  const ceiling = field('Spend ceiling');
  const worst = /worst case (\$[\d,.]+)/.exec(ceiling);
  const cents = /^\$[\d,.]+ \((\d+) USD cents/.exec(ceiling);
  if (!same(ceiling, o.spendCeilingUsd) || !cents || Number(cents[1]) !== o.proposedCloudSpendMinorUnitsUsd || !worst || !same(worst[1], w.totalUsd)) fail('the spend ceiling or the worst case');
  const table = tables.find((t) => t.header[0] === 'Region');
  const rows = candidatesOf(o).map((c) => [['t', c.region], ['p', c.unitPricePerInstanceHourUsd, c.effectiveStartDate], ['m', c.perHourSteadyUsd], ['m', c.monthly730Usd], ['m', c.expectedPlanCostUsd], ['m', c.worstCaseUsd], ['s', c.quotaStatus]]);
  if (!table || table.rows.length !== rows.length || rows.some((want, i) => !rowMatches(table.rows[i], want))) fail('a region row (price, per hour, month, expected cost, worst case or quota status)');
  const parts = tables.find((t) => String(t.header[0]).startsWith('Worst-case component'));
  const usage = isArr(w.usage) ? w.usage.filter(isObj) : [];
  const ok = parts && parts.rows.length === usage.length + 2 && String(parts.rows[0][0]).startsWith('Plan at the instance cap') && parts.rows[0][1] === `${w.planHoursAtCap * o.instanceCap} instance-hours`
    && same(parts.rows[0][2], w.planPricePerInstanceHourUsd) && same(parts.rows[0][3], w.planUsd)
    && usage.every((u, i) => parts.rows[i + 1][0] === u.item && parts.rows[i + 1][1] === `${u.quantity} ${u.unit}` && same(parts.rows[i + 1][2], u.unitPrice) && same(parts.rows[i + 1][3], u.cost))
    && parts.rows[usage.length + 1][0] === 'Total worst case' && same(parts.rows[usage.length + 1][3], w.totalUsd);
  if (!ok) fail('the worst-case component table (plan hours, prices, quantities or the total)');
}

function checkOptions(packet, prose, add) {
  for (const o of optionsOf(packet)) {
    const block = sectionOf(prose, (l) => l.startsWith(`### Option ${o.id}:`), (l) => l.startsWith('### ') || l.startsWith('## '));
    if (!block) add('MARKDOWN_OPTION_MISMATCH', `markdown:option ${o.id}`, 'the option block is missing');
    else checkOptionBlock(o, block, add);
  }
}

function checkRecommendation(packet, prose, add) {
  const found = prose.filter((l) => l.startsWith('Recommendation:'));
  if (found.length !== 1 || found[0] !== `Recommendation: ${packet.recommendation}`) add('MARKDOWN_RECOMMENDATION', 'markdown', 'exactly one recommendation line, equal to the JSON recommendation, is required');
}

function checkExpiry(packet, markdown, add) {
  const price = parseDate(isObj(packet.pricing) ? packet.pricing.pricingDateUtc : undefined);
  if (Number.isNaN(price)) return;
  const expiry = new Date(price + 7 * DAY_MS).toISOString().slice(0, 10);
  const found = [...markdown.matchAll(/\buntil (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  if (found.length === 0 || found.some((d) => d !== expiry)) add('MARKDOWN_EXPIRY_MISSING', 'markdown', `every expiry date of the markdown copy must be ${expiry}, the last usable day of the prices`);
}

// The code blocks in the order of the markdown sections 4.1 to 4.6, compared line by line with the JSON (comments and blank lines aside).
function checkCodeOrder(packet, code, add) {
  const plan = isObj(packet.cleanupAndRollback) ? packet.cleanupAndRollback : {};
  const job = isObj(plan.teardown) && isObj(plan.teardown.job) ? plan.teardown.job : {};
  const real = (l) => typeof l === 'string' && l.trim() !== '' && !l.trim().startsWith('#');
  const want = [...(isArr(plan.guardFunctions) ? plan.guardFunctions : []), ...linesOf(plan, 'armingSequence'), ...(isArr(job.script) ? job.script : []), ...linesOf(plan, 'deletionOrder'), ...linesOf(plan, 'verification'), ...linesOf(plan, 'rollback')].filter(real);
  const got = code.filter(real);
  const at = want.findIndex((l, i) => got[i] !== l);
  if (got.length !== want.length || at >= 0) add('MARKDOWN_CODE_ORDER', 'markdown', `the code blocks must list the JSON command lines in the same order; the first difference is at command ${Math.min(at < 0 ? got.length : at, want.length) + 1}`);
}

function checkClaims(prose, proseNo, add) {
  prose.forEach((line, i) => {
    if (line === STATUS_LINE) return;
    const hit = CLAIMS.find(([re]) => re.test(line));
    if (hit) add('MARKDOWN_CLAIM', `markdown:line ${proseNo[i]}`, `the markdown makes a claim the packet must never make: ${hit[1]}`);
  });
}

module.exports = { CODES, STATUS_LINE, CLAIMS, cells, money, same, tablesIn, sectionOf, checkStatusAndHeader, checkGlance, checkOptions, checkRecommendation, checkExpiry, checkCodeOrder, checkClaims };
