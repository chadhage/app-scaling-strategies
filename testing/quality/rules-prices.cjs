'use strict';
// Rule 1: every price is a number with currency, unit of measure and effective date, or the literal "price unavailable".
// An unavailable price is never summed as 0 and never dropped from a total; a zero cost needs the documented wording and a source.
const { isObj, isNum, isStr, isArr } = require('./util.cjs');

const CODES = ['PRICES_MISSING', 'PRICE_NOT_POSITIVE', 'PRICE_NO_CURRENCY', 'PRICE_NO_UNIT', 'PRICE_NO_EFFECTIVE_DATE', 'PRICE_ZERO_UNSOURCED',
  'PRICE_UNAVAILABLE_COSTED', 'PRICE_UNAVAILABLE_UNLABELLED', 'PRICE_STATUS_UNKNOWN', 'UNPRICED_IN_TOTAL', 'RESOURCE_PRICING_STATUS',
  'RESOURCE_UNAVAILABLE_IN_TOTAL', 'ZERO_COST_UNSOURCED', 'RESOURCE_NO_METER_EVIDENCE'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNAVAILABLE = /price unavailable/i;
const ZERO_CLAIM = /no charge expected|free of charge|\$0(?:\.0+)?(?![.\d])|costs? nothing|at no cost/i;
const RESOURCE_STATUS = ['priced', 'no-separate-charge-documented', 'price-unavailable'];

function checkLine(line, path, add) {
  if (!isObj(line)) { add('PRICE_STATUS_UNKNOWN', path, 'a price line must be an object'); return; }
  const where = `${path}${line.id ? ` (${line.id})` : ''}`;
  if (line.status === 'returned' || line.status === 'returned-zero') {
    if (line.status === 'returned' && !(isNum(line.unitPrice) && line.unitPrice > 0)) add('PRICE_NOT_POSITIVE', `${path}.unitPrice`, `${where}: a returned price must be a positive number, never zero, negative or text`);
    if (line.status === 'returned-zero' && (line.unitPrice !== 0 || !isStr(line.queryId))) add('PRICE_ZERO_UNSOURCED', path, `${where}: a returned zero needs the query that returned it`);
    if (!/^[A-Z]{3}$/.test(line.currencyCode || '')) add('PRICE_NO_CURRENCY', `${path}.currencyCode`, `${where}: a price needs a three-letter currency code`);
    if (!isStr(line.unitOfMeasure)) add('PRICE_NO_UNIT', `${path}.unitOfMeasure`, `${where}: a price needs a unit of measure`);
    if (!DATE.test(line.effectiveStartDate || '')) add('PRICE_NO_EFFECTIVE_DATE', `${path}.effectiveStartDate`, `${where}: a price needs an effective date (YYYY-MM-DD)`);
  } else if (line.status === 'not-queried') {
    if (line.unitPrice !== null) add('PRICE_UNAVAILABLE_COSTED', `${path}.unitPrice`, `${where}: an unavailable price must be null; it is never costed as 0`);
    if (!UNAVAILABLE.test(line.note || '')) add('PRICE_UNAVAILABLE_UNLABELLED', `${path}.note`, `${where}: an unavailable price must read "price unavailable"`);
  } else {
    add('PRICE_STATUS_UNKNOWN', `${path}.status`, `${where}: status must be returned, returned-zero or not-queried`);
  }
}

function checkResource(r, path, add) {
  const text = isObj(r) ? String(r.pricing || '') : '';
  if (isObj(r) && r.pricingStatus !== 'price-unavailable' && ZERO_CLAIM.test(text)) {
    add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'a zero or free claim has no source: write price unavailable or cite a documented claim');
  }
  if (!isObj(r) || !RESOURCE_STATUS.includes(r.pricingStatus)) {
    add('RESOURCE_PRICING_STATUS', `${path}.pricingStatus`, `each required resource needs a pricingStatus (${RESOURCE_STATUS.join(', ')})`);
    return;
  }
  if (r.pricingStatus === 'price-unavailable') {
    if (r.includedInTotals !== false) add('RESOURCE_UNAVAILABLE_IN_TOTAL', `${path}.includedInTotals`, 'a resource whose price is unavailable must stay out of every total (includedInTotals false)');
    if (!/^price unavailable/i.test(text)) add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'an unavailable price must read "price unavailable (...)" and nothing that reads as zero');
    if (/no meter/i.test(text) && !(isObj(r.meterEvidence) && isStr(r.meterEvidence.query))) add('RESOURCE_NO_METER_EVIDENCE', `${path}.meterEvidence`, 'a "no meter" claim needs the lookup that returned no meter');
    if (isObj(r.meterEvidence) && r.meterEvidence.chargeLabel === 'documented' && !/^https:\/\/learn\.microsoft\.com\//.test(r.meterEvidence.source || '')) {
      add('ZERO_COST_UNSOURCED', `${path}.meterEvidence.source`, 'a documented no-charge claim needs its Learn source');
    }
  } else if (r.pricingStatus === 'no-separate-charge-documented') {
    if (!/\(documented, [A-Z]/.test(text)) add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'a documented no-separate-charge row must cite its documented claim id, e.g. (documented, PLANS-BILLING)');
  }
}

function checkPrices(packet, add) {
  const pricing = isObj(packet.pricing) ? packet.pricing : {};
  const lines = isArr(pricing.lines) ? pricing.lines : [];
  if (lines.length === 0) add('PRICES_MISSING', 'pricing.lines', 'the price register is missing or empty');
  lines.forEach((l, i) => checkLine(l, `pricing.lines[${i}]`, add));
  (isArr(pricing.unpricedItems) ? pricing.unpricedItems : []).forEach((u, i) => {
    const path = `pricing.unpricedItems[${i}]`;
    if (!isObj(u) || u.includedInTotals !== false || u.unitPrice !== null) add('UNPRICED_IN_TOTAL', path, 'an unpriced item must have unitPrice null and includedInTotals false: never summed as 0 and never dropped silently');
    if (!isObj(u) || !UNAVAILABLE.test(u.note || '')) add('PRICE_UNAVAILABLE_UNLABELLED', `${path}.note`, 'an unpriced item must read "price unavailable"');
  });
  (isArr(packet.requiredResources) ? packet.requiredResources : []).forEach((r, i) => checkResource(r, `requiredResources[${i}]`, add));
  (isArr(packet.exclusions) ? packet.exclusions : []).forEach((e, i) => {
    if (!isObj(e) || ZERO_CLAIM.test(e.cost || '')) add('ZERO_COST_UNSOURCED', `exclusions[${i}].cost`, 'an excluded item is never costed as zero or free');
  });
}

module.exports = { CODES, checkPrices, UNAVAILABLE, DATE };
