'use strict';
// Rule 1: every price is a number with currency, unit and effective date, or the literal price unavailable; never costed as 0.
const { negative, line, assert, test, load, run } = require('./support.cjs');

negative('PRICES_MISSING', 'no price register at all', (p) => { p.pricing.lines = []; });
negative('PRICE_NOT_POSITIVE', 'a returned price of 0 is a zero-cost default', (p) => { line(p, 'plan.P0v3', 'eastus2').unitPrice = 0; });
negative('PRICE_NOT_POSITIVE', 'a returned price below 0', (p) => { line(p, 'plan.P0v3', 'eastus').unitPrice = -0.5; });
negative('PRICE_NOT_POSITIVE', 'a returned price that is not a number', (p) => { line(p, 'plan.P0v3', 'westus2').unitPrice = '0.0775'; });
negative('PRICE_NO_CURRENCY', 'a price without a currency', (p) => { delete line(p, 'plan.P1v3', 'eastus2').currencyCode; });
negative('PRICE_NO_UNIT', 'a price without a unit of measure', (p) => { line(p, 'plan.P1v3', 'eastus').unitOfMeasure = ''; });
negative('PRICE_NO_EFFECTIVE_DATE', 'a price without an effective date', (p) => { delete line(p, 'plan.P2v3', 'eastus2').effectiveStartDate; });
negative('PRICE_NO_EFFECTIVE_DATE', 'a price with a malformed effective date', (p) => { line(p, 'plan.P2v3', 'eastus').effectiveStartDate = 'last week'; });
negative('PRICE_ZERO_UNSOURCED', 'a returned-zero line without a query or a note', (p) => {
  const l = line(p, 'la.ingest.free', 'eastus2');
  l.queryId = null;
  delete l.note;
});
negative('PRICE_UNAVAILABLE_COSTED', 'an unavailable price costed as 0', (p) => { line(p, 'plan.P2v4', 'eastus').unitPrice = 0; });
negative('PRICE_UNAVAILABLE_UNLABELLED', 'an unavailable price without the literal wording', (p) => { line(p, 'plan.P2v4', 'westus2').note = 'not looked up'; });
negative('PRICE_STATUS_UNKNOWN', 'an unknown price status', (p) => { line(p, 'plan.P0v3', 'westus3').status = 'guessed'; });
negative('UNPRICED_IN_TOTAL', 'an unpriced item that enters a total', (p) => { p.pricing.unpricedItems[0].includedInTotals = true; });
negative('UNPRICED_IN_TOTAL', 'an unpriced item with a price of 0', (p) => { p.pricing.unpricedItems[1].unitPrice = 0; });
negative('PRICE_UNAVAILABLE_UNLABELLED', 'an unpriced item without the literal wording', (p) => { p.pricing.unpricedItems[2].note = 'excluded'; });
negative('RESOURCE_PRICING_STATUS', 'a required resource without a pricing status', (p) => { delete p.requiredResources[1].pricingStatus; });
negative('RESOURCE_UNAVAILABLE_IN_TOTAL', 'a resource whose price is unavailable but sits in a total', (p) => { p.requiredResources[0].includedInTotals = true; });
negative('ZERO_COST_UNSOURCED', 'the revision 1 resource-group wording', (p) => {
  p.requiredResources[0].pricing = 'No meter queried; no charge expected (estimated).';
  p.requiredResources[0].pricingStatus = 'priced';
  p.requiredResources[0].includedInTotals = true;
});
negative('ZERO_COST_UNSOURCED', 'an exclusion costed at $0', (p) => { p.exclusions[0].cost = '$0, free of charge'; });
negative('ZERO_COST_UNSOURCED', 'a documented no-charge row without a documented claim id', (p) => {
  p.requiredResources.find((r) => r.pricingStatus === 'no-separate-charge-documented').pricing = 'No separate charge.';
});
negative('ZERO_COST_UNSOURCED', 'a legacy resource row with no pricing status that says no charge expected', (p) => {
  delete p.requiredResources[0].pricingStatus;
  p.requiredResources[0].pricing = 'No meter queried; no charge expected (estimated).';
});
negative('RESOURCE_NO_METER_EVIDENCE', 'a no-meter row without the lookup that shows it', (p) => { delete p.requiredResources[0].meterEvidence; });

test('PRICE rules accept the three kinds of line in the fixture', () => {
  const p = load();
  const kinds = new Set(p.pricing.lines.map((l) => l.status));
  assert.deepEqual([...kinds].sort(), ['not-queried', 'returned', 'returned-zero']);
  assert.equal(run(p).ok, true);
});

test('a GUID-shaped meter ID is allowed in the price register only', () => {
  const p = load();
  p.pricing.lines[0].meterId = '3d7aa86c-0e9d-4139-b59f-cc5bad92b873';
  const { reseal } = require('./support.cjs');
  reseal(p);
  assert.equal(run(p).ok, true);
});
