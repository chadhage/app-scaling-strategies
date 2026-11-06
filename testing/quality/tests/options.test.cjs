'use strict';
// Rule 2: exactly three bounded options; every figure recomputes from the packet's own inputs, including the teardown-latency hour.
const { negative, line, assert, test, load, run, reseal } = require('./support.cjs');

const opt = (p, i = 0) => p.options[i];
const cand = (p, i = 0, r = 0) => p.options[i].regionCandidates[r];

negative('OPTIONS_COUNT', 'only two options', (p) => { p.options.pop(); });
negative('OPTIONS_COUNT', 'four options', (p) => { p.options.push(structuredClone(p.options[0])); });
negative('OPTION_ID', 'two options with the same id', (p) => { opt(p, 1).id = 'A'; });
negative('OPTION_OS', 'Windows instead of Linux', (p) => { opt(p).os = 'Windows'; });
negative('OPTION_SKU', 'no SKU', (p) => { delete opt(p).sku; });
negative('OPTION_INSTANCES', 'zero steady instances', (p) => { opt(p).steadyInstances = 0; });
negative('OPTION_CAP', 'a cap below the steady count', (p) => { opt(p, 1).instanceCap = 1; });
negative('OPTION_REGIONS', 'no region candidates', (p) => { opt(p).regionCandidates = []; });
negative('OPTION_DEFAULT_REGION', 'a default region that is not a candidate', (p) => { opt(p).defaultRegion = 'brazilsouth'; });
negative('OPTION_PRICE_MISSING', 'a null plan price is never costed as 0', (p) => { cand(p).unitPricePerInstanceHourUsd = null; });
negative('OPTION_PRICE_LINE_UNAVAILABLE', 'an option priced from an unavailable register line', (p) => {
  Object.assign(line(p, 'plan.P0v3', 'eastus'), { status: 'not-queried', unitPrice: null, effectiveStartDate: null, note: 'price unavailable (not queried)' });
});
negative('OPTION_PRICE_MISMATCH', 'a plan price that differs from the register', (p) => { cand(p).unitPricePerInstanceHourUsd = 0.0001; });
negative('OPTION_PER_HOUR', 'a wrong per-hour cost', (p) => { cand(p, 1).perHourSteadyUsd = 0.155; });
negative('OPTION_MONTHLY', 'a wrong 730-hour month', (p) => { cand(p).monthly730Usd = 50; });
negative('OPTION_EXPECTED_COST', 'an expected plan cost that forgets the scale step', (p) => { cand(p, 1).expectedPlanCostUsd = 1.86; });
negative('OPTION_EXPECTED_RUN', 'an expected run of zero hours', (p) => { opt(p).expectedRunHours = 0; });
negative('OPTION_PHASES_SUM', 'phases that do not add up to the run', (p) => { opt(p).expectedPhases[0].hours += 1; });
negative('OPTION_DEADLINE', 'a teardown deadline before the end of the run', (p) => { opt(p).teardownDeadlineHours = 2; });
negative('OPTION_TEARDOWN', 'no automatic teardown mechanism', (p) => { opt(p).teardown.mechanism = ''; });
negative('OPTION_LATENCY_MISSING', 'no teardown-latency hour', (p) => { delete opt(p).teardownLatencyHours; });
negative('OPTION_LATENCY_MISSING', 'a latency of zero hours', (p) => { opt(p, 2).teardownLatencyHours = 0; });
negative('OPTION_USAGE_CAPS', 'a missing usage cap', (p) => { delete opt(p).usageCaps.egressGb; });
negative('OPTION_WORST_REGION', 'a wrong worst case in one region', (p) => { cand(p, 2, 4).worstCaseUsd = 40; });
negative('OPTION_WORST_PLAN', 'a plan cost that ignores the latency hour', (p) => { opt(p, 2).worstCase.planUsd = 30.6; });
negative('OPTION_WORST_PLAN', 'hours at cap that omit the latency hour', (p) => { opt(p).worstCase.planHoursAtCap = 6; });
negative('OPTION_USAGE_PRICE', 'a usage price of 0', (p) => { opt(p).worstCase.usage[0].unitPrice = 0; });
negative('OPTION_USAGE_PRICE', 'a usage price below the highest returned price', (p) => { opt(p).worstCase.usage[5].unitPrice = 0.01; });
negative('OPTION_USAGE_COST', 'a usage cost that is not quantity x price', (p) => { opt(p).worstCase.usage[1].cost = 9; });
negative('OPTION_USAGE_TOTAL', 'a usage sum that differs from its lines', (p) => { opt(p).worstCase.usageUsd += 1; });
negative('OPTION_WORST_TOTAL', 'a total that is not plan plus usage', (p) => { opt(p, 1).worstCase.totalUsd = 10.5218; });
negative('OPTION_CEILING_BELOW_WORST', 'a ceiling below the worst case', (p) => { opt(p, 2).spendCeilingUsd = 50; opt(p, 2).proposedCloudSpendMinorUnitsUsd = 5000; });
negative('OPTION_CEILING_RULE', 'the revision 1 ceiling of $70 that the latency hour pushes to $75', (p) => { opt(p, 2).spendCeilingUsd = 70; opt(p, 2).proposedCloudSpendMinorUnitsUsd = 7000; });
negative('OPTION_CEILING_LABEL', 'a ceiling not labelled as a planning bound', (p) => { opt(p).spendCeilingLabel = 'guaranteed cap'; });
negative('OPTION_CENTS', 'cents that are not the ceiling times 100', (p) => { opt(p).proposedCloudSpendMinorUnitsUsd = 5; });
negative('OPTION_UNIT_NOT_PROPOSAL', 'a cents unit stated as fact', (p) => { opt(p).minorUnitsNote = 'The ledger unit is USD cents.'; });
negative('OPTION_LIST_CREATE', 'list and create-container operations not priced like writes', (p) => {
  const u = opt(p).worstCase.usage.find((x) => x.lineKey === 'blob.write');
  u.item = 'Blob write operations';
});
negative('OPTION_LOGS', 'a workspace option that prices no log ingestion', (p) => { opt(p, 1).worstCase.usage = opt(p, 1).worstCase.usage.filter((x) => !x.lineKey.startsWith('la.')); });
negative('QUOTA_STATUS_MISSING', 'a region without a quota status', (p) => { delete cand(p, 0, 1).quotaStatus; });
negative('QUOTA_STATUS_INVALID', 'a quota status outside the vocabulary', (p) => { cand(p, 0, 2).quotaStatus = 'probably fine'; });
negative('QUOTA_DEFAULT_FAILED', 'a default region whose quota validation failed', (p) => {
  opt(p, 1).defaultRegion = 'eastus2';
});

test('the fixture options match the reviewer figures: ceilings 5, 15 and 75', () => {
  const p = load();
  assert.deepEqual(p.options.map((o) => o.spendCeilingUsd), [5, 15, 75]);
  assert.deepEqual(p.options.map((o) => o.worstCase.totalUsd), [0.88828, 11.0318, 56.074]);
  assert.equal(run(p).ok, true);
});

test('a ceiling above the formula is not accepted either (the rule is exact)', () => {
  const p = load();
  p.options[0].spendCeilingUsd = 10;
  p.options[0].proposedCloudSpendMinorUnitsUsd = 1000;
  reseal(p);
  assert.ok(run(p).findings.some((f) => f.code === 'OPTION_CEILING_RULE'));
});
