'use strict';
// Rule 2: exactly three bounded options; every figure recomputes from the packet's own inputs, including the teardown-latency hour.
const { isObj, isNum, isStr, isArr, approx, round, ceilingFor } = require('./util.cjs');

const CODES = ['OPTIONS_COUNT', 'OPTION_ID', 'OPTION_OS', 'OPTION_SKU', 'OPTION_INSTANCES', 'OPTION_CAP', 'OPTION_REGIONS', 'OPTION_DEFAULT_REGION',
  'OPTION_PRICE_MISSING', 'OPTION_PRICE_LINE_UNAVAILABLE', 'OPTION_PRICE_MISMATCH', 'OPTION_PER_HOUR', 'OPTION_MONTHLY', 'OPTION_EXPECTED_COST',
  'OPTION_EXPECTED_RUN', 'OPTION_PHASES_SUM', 'OPTION_DEADLINE', 'OPTION_TEARDOWN', 'OPTION_LATENCY_MISSING', 'OPTION_USAGE_CAPS', 'OPTION_WORST_REGION',
  'OPTION_WORST_PLAN', 'OPTION_USAGE_PRICE', 'OPTION_USAGE_COST', 'OPTION_USAGE_TOTAL', 'OPTION_WORST_TOTAL', 'OPTION_CEILING_BELOW_WORST',
  'OPTION_CEILING_RULE', 'OPTION_CEILING_LABEL', 'OPTION_CENTS', 'OPTION_UNIT_NOT_PROPOSAL', 'OPTION_LIST_CREATE', 'OPTION_LOGS',
  'QUOTA_STATUS_MISSING', 'QUOTA_STATUS_INVALID', 'QUOTA_DEFAULT_FAILED'];

const QUOTA = /^(?:untested|(?:failed|passed)-\d{4}-\d{2}-\d{2})$/;
const CAPS = ['blobWriteOps', 'blobReadOps', 'blobOtherOps', 'tableOps', 'queueOps', 'storedGbEach', 'egressGb'];

function registerOf(packet) {
  const map = new Map();
  const lines = isObj(packet.pricing) && isArr(packet.pricing.lines) ? packet.pricing.lines : [];
  for (const l of lines) if (isObj(l)) map.set(`${l.key}@${l.region}`, l);
  return map;
}

function checkBasics(o, p, add) {
  if (o.os !== 'Linux') add('OPTION_OS', `${p}.os`, 'every option runs on Linux');
  if (!isStr(o.sku)) add('OPTION_SKU', `${p}.sku`, 'an option needs a SKU');
  if (!(Number.isInteger(o.steadyInstances) && o.steadyInstances >= 1)) add('OPTION_INSTANCES', `${p}.steadyInstances`, 'steady instances must be an integer of at least 1');
  if (!(Number.isInteger(o.instanceCap) && o.instanceCap >= o.steadyInstances)) add('OPTION_CAP', `${p}.instanceCap`, 'the instance cap must be an integer not below the steady count');
  if (!(isNum(o.expectedRunHours) && o.expectedRunHours > 0)) {
    add('OPTION_EXPECTED_RUN', `${p}.expectedRunHours`, 'an option needs an expected run duration in hours');
  } else {
    const sum = round((isArr(o.expectedPhases) ? o.expectedPhases : []).reduce((s, x) => s + (isObj(x) && isNum(x.hours) ? x.hours : 0), 0), 6);
    if (!approx(sum, o.expectedRunHours)) add('OPTION_PHASES_SUM', `${p}.expectedPhases`, `the phases add up to ${sum} h, the expected run is ${o.expectedRunHours} h`);
  }
  if (!(isNum(o.teardownDeadlineHours) && o.teardownDeadlineHours > o.expectedRunHours)) add('OPTION_DEADLINE', `${p}.teardownDeadlineHours`, 'the automatic teardown deadline must be later than the expected run');
  if (!(isObj(o.teardown) && isStr(o.teardown.mechanism) && isStr(o.teardown.deadlineTag))) add('OPTION_TEARDOWN', `${p}.teardown`, 'an option needs an automatic teardown mechanism and a deadline tag');
  if (!(isNum(o.teardownLatencyHours) && o.teardownLatencyHours >= 1)) add('OPTION_LATENCY_MISSING', `${p}.teardownLatencyHours`, 'the worst case needs at least one teardown-latency hour at the instance cap');
  if (!(isObj(o.usageCaps) && CAPS.every((k) => isNum(o.usageCaps[k]) && o.usageCaps[k] > 0))) add('OPTION_USAGE_CAPS', `${p}.usageCaps`, `usage caps needed: ${CAPS.join(', ')}`);
}

function checkRegion(o, c, p, ctx) {
  const { add, lines, key } = ctx;
  if (!isObj(c)) { add('OPTION_REGIONS', p, 'a region candidate must be an object'); return; }
  if (!isStr(c.quotaStatus)) add('QUOTA_STATUS_MISSING', `${p}.quotaStatus`, `the region ${c.region} needs a quota status`);
  else if (!QUOTA.test(c.quotaStatus)) add('QUOTA_STATUS_INVALID', `${p}.quotaStatus`, 'quota status is untested, failed-<date> or passed-<date>');
  const price = c.unitPricePerInstanceHourUsd;
  if (!(isNum(price) && price > 0)) { add('OPTION_PRICE_MISSING', `${p}.unitPricePerInstanceHourUsd`, 'a plan price must be a positive number: a missing price is never costed as 0'); return; }
  const line = lines.get(`${key}@${c.region}`);
  if (line && line.status !== 'returned') add('OPTION_PRICE_LINE_UNAVAILABLE', p, `${key}@${c.region} is ${line.status} in the register and cannot price an option`);
  else if (line && !approx(line.unitPrice, price, 1e-9)) add('OPTION_PRICE_MISMATCH', `${p}.unitPricePerInstanceHourUsd`, `the register says ${line.unitPrice}`);
  if (!approx(c.perHourSteadyUsd, round(o.steadyInstances * price, 8), 1e-9)) add('OPTION_PER_HOUR', `${p}.perHourSteadyUsd`, `expected steady instances x price = ${round(o.steadyInstances * price, 8)}`);
  if (!approx(c.monthly730Usd, round(o.steadyInstances * price * 730, 6), 1e-6)) add('OPTION_MONTHLY', `${p}.monthly730Usd`, `expected per hour x 730 = ${round(o.steadyInstances * price * 730, 6)}`);
  const scale = isNum(o.scaleStepHours) ? o.scaleStepHours : 0;
  const expected = round(price * (o.steadyInstances * o.expectedRunHours + (o.instanceCap - o.steadyInstances) * scale), 6);
  if (!approx(c.expectedPlanCostUsd, expected, 1e-6)) add('OPTION_EXPECTED_COST', `${p}.expectedPlanCostUsd`, `expected price x (steady x run hours + (cap - steady) x scale-step hours) = ${expected}`);
  const wu = isObj(o.worstCase) && isArr(o.worstCase.usage) ? o.worstCase.usage : null;
  if (!wu) return;
  const usage = wu.map((u) => (isObj(u) ? lines.get(`${u.lineKey}@${c.region}`) : null));
  if (usage.some((l) => !l || l.status !== 'returned')) { add('OPTION_PRICE_LINE_UNAVAILABLE', p, `a usage price of ${c.region} is missing or unavailable in the register`); return; }
  const regional = wu.reduce((s, u, i) => s + u.quantity * usage[i].unitPrice, 0);
  const worst = round(o.instanceCap * price * (o.teardownDeadlineHours + (o.teardownLatencyHours || 0)) + regional, 6);
  if (!approx(c.worstCaseUsd, worst, 1e-5)) add('OPTION_WORST_REGION', `${p}.worstCaseUsd`, `expected ${worst} (cap x price x (deadline + latency) + usage)`);
}

function checkWorst(o, p, ctx) {
  const { add, lines } = ctx;
  const w = o.worstCase;
  if (!isObj(w) || !isArr(w.usage)) { add('OPTION_WORST_TOTAL', `${p}.worstCase`, 'an option needs a worst case with usage lines'); return; }
  const hours = o.teardownDeadlineHours + (o.teardownLatencyHours || 0);
  const prices = (isArr(o.regionCandidates) ? o.regionCandidates : []).map((c) => c && c.unitPricePerInstanceHourUsd).filter(isNum);
  if (!approx(w.planHoursAtCap, hours)) add('OPTION_WORST_PLAN', `${p}.worstCase.planHoursAtCap`, `expected deadline + latency = ${hours} h`);
  if (!approx(w.planUsd, round(o.instanceCap * Math.max(...prices) * hours, 8), 1e-6)) add('OPTION_WORST_PLAN', `${p}.worstCase.planUsd`, 'expected cap x highest plan price x (deadline + latency)');
  w.usage.forEach((u, i) => {
    const up = `${p}.worstCase.usage[${i}]`;
    if (!isObj(u)) { add('OPTION_USAGE_COST', up, 'a usage line must be an object'); return; }
    const returned = (isArr(o.regionCandidates) ? o.regionCandidates : []).map((c) => lines.get(`${u.lineKey}@${c && c.region}`)).filter((l) => l && l.status === 'returned').map((l) => l.unitPrice);
    if (!(isNum(u.unitPrice) && u.unitPrice > 0)) add('OPTION_USAGE_PRICE', `${up}.unitPrice`, 'a usage price must be positive: never 0 or missing');
    else if (returned.length && !approx(u.unitPrice, Math.max(...returned), 1e-9)) add('OPTION_USAGE_PRICE', `${up}.unitPrice`, `expected the highest returned price ${Math.max(...returned)}`);
    if (!approx(u.cost, round(u.quantity * u.unitPrice, 8), 1e-9)) add('OPTION_USAGE_COST', `${up}.cost`, 'cost must be quantity x unit price');
    if (u.lineKey === 'blob.write' && !/list and create-container/i.test(u.item || '')) add('OPTION_LIST_CREATE', `${up}.item`, 'list and create-container operations must be priced like writes and named on the write line');
  });
  if (!approx(w.usageUsd, round(w.usage.reduce((s, u) => s + (isObj(u) && isNum(u.cost) ? u.cost : 0), 0), 8), 1e-8)) add('OPTION_USAGE_TOTAL', `${p}.worstCase.usageUsd`, 'usageUsd must be the sum of the usage lines');
  if (!approx(w.totalUsd, round(w.planUsd + w.usageUsd, 8), 1e-8)) add('OPTION_WORST_TOTAL', `${p}.worstCase.totalUsd`, 'totalUsd must be plan + usage');
  if (isObj(o.logs) && o.logs.workspace === true) {
    const keys = new Set(w.usage.map((u) => isObj(u) && u.lineKey));
    if (!(isNum(o.logs.dailyCapGb) && o.logs.dailyCapGb > 0 && o.logs.capWindowsInDeadline >= 1 && keys.has('la.ingest.paid') && keys.has('la.retain'))) add('OPTION_LOGS', `${p}.logs`, 'a workspace option needs a daily cap, cap windows and priced ingestion and retention');
  }
}

function checkCeiling(o, p, add) {
  const total = isObj(o.worstCase) ? o.worstCase.totalUsd : NaN;
  if (!isNum(o.spendCeilingUsd) || !(o.spendCeilingUsd >= total)) add('OPTION_CEILING_BELOW_WORST', `${p}.spendCeilingUsd`, `the ceiling must not be below the worst case ${total}`);
  else if (o.spendCeilingUsd !== ceilingFor(total)) add('OPTION_CEILING_RULE', `${p}.spendCeilingUsd`, `the rule ceil(worst x 1.25 / 5) x 5 gives ${ceilingFor(total)}`);
  if (!/planning bound/i.test(o.spendCeilingLabel || '')) add('OPTION_CEILING_LABEL', `${p}.spendCeilingLabel`, 'the ceiling must be labelled "planning bound, not enforced by Azure"');
  if (o.proposedCloudSpendMinorUnitsUsd !== o.spendCeilingUsd * 100) add('OPTION_CENTS', `${p}.proposedCloudSpendMinorUnitsUsd`, 'cents must be the ceiling x 100');
  if (!/PROPOSAL/.test(o.minorUnitsNote || '')) add('OPTION_UNIT_NOT_PROPOSAL', `${p}.minorUnitsNote`, 'the cents unit must be called a PROPOSAL');
}

function checkOptions(packet, add) {
  const options = isArr(packet.options) ? packet.options : [];
  if (options.length !== 3) add('OPTIONS_COUNT', 'options', `exactly three options are required, found ${options.length}`);
  const lines = registerOf(packet);
  const ids = new Set();
  options.forEach((o, i) => {
    const p = `options[${i}]`;
    if (!isObj(o) || !isStr(o.id) || ids.has(o.id)) { add('OPTION_ID', `${p}.id`, 'each option needs its own id'); if (!isObj(o)) return; }
    ids.add(o.id);
    checkBasics(o, p, add);
    const cands = isArr(o.regionCandidates) ? o.regionCandidates : [];
    if (cands.length === 0) add('OPTION_REGIONS', `${p}.regionCandidates`, 'an option needs region candidates');
    const def = cands.find((c) => isObj(c) && c.region === o.defaultRegion);
    if (!def) add('OPTION_DEFAULT_REGION', `${p}.defaultRegion`, 'the default region must be one of the candidates');
    else if (/^failed/.test(def.quotaStatus || '')) add('QUOTA_DEFAULT_FAILED', `${p}.defaultRegion`, `${o.defaultRegion} failed its quota validation and cannot be the default`);
    const key = `plan.${o.skuKey || String(o.sku).replace(/\s+/g, '')}`;
    cands.forEach((c, j) => checkRegion(o, c, `${p}.regionCandidates[${j}]`, { add, lines, key }));
    checkWorst(o, p, { add, lines });
    checkCeiling(o, p, add);
  });
}

module.exports = { CODES, checkOptions };
