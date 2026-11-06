'use strict';
// Fast direct tests of the rule modules (no hygiene scan of the whole packet): the guards that each mutant of the mutation run removes.
const { assert, test, load } = require('./support.cjs');
const { inventory } = require('../limits.cjs');
const prices = require('../rules-prices.cjs');
const options = require('../rules-options.cjs');
const script = require('../rules-script.cjs');
const decisions = require('../rules-decisions.cjs');

const NOW = '2026-11-07T12:00:00Z';
function codesOf(p, opts = { nowUtc: NOW }) {
  const found = [];
  const add = (code) => found.push(code);
  prices.checkPrices(p, add);
  options.checkOptions(p, add);
  script.checkPlan(p, add, inventory(p));
  decisions.checkDecisionsAndState(p, add, opts);
  return new Set(found);
}
const plan = (p) => p.cleanupAndRollback;
const step = (p, n) => plan(p).deletionOrder.find((s) => s.n === n);
const GROUP = 'az group delete --name $Group --yes --subscription $Subscription';
const mutated = (fn, opts) => { const p = load(); fn(p); return codesOf(p, opts); };
const expectCode = (code, fn, opts) => assert.ok(mutated(fn, opts).has(code), `${code} expected`);

test('the fixture passes every direct rule', () => { assert.deepEqual([...codesOf(load())], []); });

test('a delete needs BOTH its pin and its ownership check, after the previous delete, in an enclosing block', () => {
  expectCode('DELETE_UNGUARDED', (p) => { step(p, 5).commands = [`Assert-Subscription; ${GROUP}`]; });
  expectCode('DELETE_UNGUARDED', (p) => { step(p, 5).commands = [`Assert-Lease; ${GROUP}`]; });
  expectCode('DELETE_UNGUARDED', (p) => { step(p, 5).commands = [GROUP, 'Assert-Subscription; Assert-Lease']; });
  expectCode('DELETE_UNGUARDED', (p) => { step(p, 5).commands = [`if ($false) { Assert-Subscription; Assert-Lease }; ${GROUP}`]; });
  expectCode('DELETE_UNGUARDED', (p) => { step(p, 1).commands = ['Assert-Subscription; Assert-Lease', ...step(p, 1).commands.map((c) => c.replace('Assert-Subscription; Assert-Lease; ', ''))]; });
  expectCode('DELETE_UNGUARDED', (p) => { step(p, 5).commands = [`Assert-Subscription; Assert-Lease || ${GROUP}`]; });
  expectCode('DELETE_UNGUARDED', (p) => { step(p, 1).commands = ['az webapp delete --resource-group $Group --name $App --subscription $Subscription']; });
});

test('every az command carries a --subscription of its own, a group delete included, and a flag followed by a flag has no value', () => {
  expectCode('AZ_NO_SUBSCRIPTION', (p) => { step(p, 5).commands = [`Assert-Subscription; Assert-Lease; ${GROUP.replace(' --subscription $Subscription', '')}`]; });
  expectCode('AZ_NO_SUBSCRIPTION', (p) => { plan(p).verification[0].commands.push('az group show --subscription --name <rg>'); });
  expectCode('AZ_NO_SUBSCRIPTION', (p) => { plan(p).verification[0].commands.push('az group show --name <rg> --subscription'); });
});

test('the arming order, G4 and the unattended script keep their guards', () => {
  expectCode('ARMING_ORDER', (p) => { const a = plan(p).armingSequence; a[5].commands = [...a[5].commands, ...a[1].commands]; a[1].commands = []; });
  expectCode('GUARD_G4_MISSING', (p) => { plan(p).guards = plan(p).guards.filter((g) => g.id !== 'G4'); });
  expectCode('SCRIPT_DELETE_NOT_WRAPPED', (p) => { const s = plan(p).teardown.job.script; const i = s.findIndex((l) => l.includes('az webapp delete')); s[i] = s[i].replace(/^try \{ (.*) \} catch \{.*$/, '$1'); });
  expectCode('SCRIPT_NO_FINAL_GROUP_DELETE', (p) => { plan(p).teardown.job.script = plan(p).teardown.job.script.filter((l) => !l.includes('az group delete')); });
  expectCode('SCRIPT_NO_FAILURE_EXIT', (p) => { plan(p).teardown.job.script = plan(p).teardown.job.script.filter((l) => !/exit 1/.test(l)); });
  expectCode('SCRIPT_NO_ALARM_FILE', (p) => { plan(p).teardown.job.script = plan(p).teardown.job.script.filter((l) => !/Set-Content/.test(l)); });
  expectCode('SCRIPT_NO_STOP', (p) => { plan(p).teardown.job.script = plan(p).teardown.job.script.map((l) => l.replace("$ErrorActionPreference = 'Stop'; ", '')); });
  expectCode('COMMAND_DYNAMIC', (p) => { plan(p).verification[0].commands.push('az group $v show --name <rg> --subscription <subscription-id>'); });
  expectCode('DELETE_TARGET', (p) => { step(p, 5).commands = [`Assert-Subscription; Assert-Lease; ${GROUP.replace('$Group', 'rg-other')}`]; });
  expectCode('TIME_NOT_INVARIANT', (p) => { plan(p).armingSequence[3].commands = ["$expires = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')"]; });
});

test('prices: a returned zero, a zero-shaped priced row, a missing required resource and the no-charge wording', () => {
  expectCode('PRICE_NOT_POSITIVE', (p) => { p.pricing.lines[0].unitPrice = 0; });
  expectCode('ZERO_COST_UNSOURCED', (p) => { p.requiredResources[1].pricing = 'No charge expected, see Q02.'; });
  expectCode('ZERO_COST_UNSOURCED', (p) => { p.requiredResources[0].pricing = 'price unavailable. No charge is expected.'; });
  expectCode('REQUIRED_RESOURCES_MISSING', (p) => { p.requiredResources = p.requiredResources.filter((r) => r.id !== 'EGRESS'); });
  expectCode('RESOURCE_PRICED_NO_LINE', (p) => { p.requiredResources[1].priceKeys = ['plan.nothing']; });
});

test('options: the latency hour, the ceiling rule, the usage lines, the price line and the headroom', () => {
  expectCode('OPTION_LATENCY_MISSING', (p) => { p.options[0].teardownLatencyHours = 0; });
  expectCode('OPTION_CEILING_RULE', (p) => { p.options[0].spendCeilingUsd = 10; p.options[0].proposedCloudSpendMinorUnitsUsd = 1000; });
  expectCode('OPTION_USAGE_LINES', (p) => { p.options[1].worstCase.usage = p.options[1].worstCase.usage.slice(1); });
  expectCode('OPTION_USAGE_QUANTITY', (p) => { p.options[0].usageCaps.egressGb = 50; });
  expectCode('OPTION_PRICE_LINE_MISSING', (p) => { p.options[0].skuKey = 'P3v3'; });
  expectCode('OPTION_HEADROOM', (p) => { p.options[1].ceilingHeadroom.headroomUsd = 9; });
  expectCode('OPTION_CEILING_BELOW_WORST', (p) => { p.options[0].usageCaps.egressGb = 5000; p.options[0].worstCase.usage.find((u) => u.lineKey === 'bw.paid').quantity = 5000; });
});

test('decisions and dates: only a literal no passes, the 7-day boundary is inclusive, every date rule fires', () => {
  for (const d of ['No', 'maybe', null, 'yes', undefined]) expectCode('DECISION_DEFAULT_NOT_NO', (p) => { p.ownerDecisions.decisions[0].default = d; });
  const day = (price, prepared) => (p) => { p.pricing.pricingDateUtc = price; p.preparedAtUtc = prepared; };
  assert.ok(!mutated(day('2026-11-04', '2026-11-11T23:59:59Z'), { nowUtc: '2026-11-11T23:59:59Z' }).has('PRICE_DATE_STALE'));
  assert.ok(!mutated(day('2026-11-04', '2026-11-11T23:59:59Z'), { nowUtc: '2026-11-11T23:59:59Z' }).has('PRICE_STALE_NOW'));
  expectCode('PRICE_DATE_STALE', day('2026-11-04', '2026-11-12T00:00:00Z'), { nowUtc: '2026-11-12T00:00:00Z' });
  expectCode('PRICE_STALE_NOW', day('2026-11-04', '2026-11-06T00:00:00Z'), { nowUtc: '2026-11-12T00:00:00Z' });
  expectCode('PRICE_DATE_FUTURE', day('2026-11-08', '2026-11-08T00:00:00Z'), { nowUtc: '2026-11-07T00:00:00Z' });
  expectCode('PRICE_AFTER_PREPARED', day('2026-11-07', '2026-11-06T00:00:00Z'), { nowUtc: NOW });
  expectCode('PREPARED_IN_FUTURE', day('2026-11-04', '2026-11-07T12:06:00Z'), { nowUtc: NOW });
  expectCode('NOW_INVALID', () => {}, { nowUtc: 'Dec 20 2026' });
  expectCode('PRICE_DATE_INVALID', day('2026-02-30', '2026-11-06T00:00:00Z'));
  expectCode('PREPARED_DATE_INVALID', day('2026-11-04', '12/20/2026'));
  expectCode('PRICE_DATE_MISSING', day('', '2026-11-06T00:00:00Z'));
});
