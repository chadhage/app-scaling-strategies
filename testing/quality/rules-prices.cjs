'use strict';
// Rule 1 (V3): every price is a number with currency, unit, meter and a real effective date, or the literal "price unavailable". A priced
// row is checked by positive evidence (price keys that resolve to returned, positive register lines and a query id); every other status
// is enumerated and carries its own shape; a zero-shaped spelling of any kind is rejected unless it is a documented or labelled estimate.
const { isObj, isNum, isStr, isArr } = require('./util.cjs');
const { parseDate } = require('./dates.cjs');
const { fold, latin } = require('./text.cjs');

const CODES = ['PRICES_MISSING', 'PRICE_NOT_POSITIVE', 'PRICE_NO_CURRENCY', 'PRICE_NO_UNIT', 'PRICE_NO_EFFECTIVE_DATE', 'PRICE_NO_METER', 'PRICE_ZERO_UNSOURCED',
  'PRICE_UNAVAILABLE_COSTED', 'PRICE_UNAVAILABLE_UNLABELLED', 'PRICE_STATUS_UNKNOWN', 'UNPRICED_IN_TOTAL', 'UNPRICED_MISSING', 'RESOURCE_PRICING_STATUS',
  'RESOURCE_PRICED_NO_LINE', 'RESOURCE_UNAVAILABLE_IN_TOTAL', 'REQUIRED_RESOURCES_MISSING', 'ZERO_COST_UNSOURCED', 'RESOURCE_NO_METER_EVIDENCE'];

const UNAVAILABLE = /price unavailable/i;
const ZERO = /\bfree\b|\bno (?:separate |extra |additional )?(?:charge|cost)\b|\bzero cost\b|\bcosts? nothing\b|\bgratis\b|\bcomplimentary\b|\bcovered by the plan\b|\bn\/a\b|(?:^|[^\d.])\$ ?0(?:\.0+)?(?![\d.])|\b0(?:\.0+)? usd\b|\busd 0(?:\.0+)?(?![\d.])|\bincluded\b/;
const RESOURCE_STATUS = ['priced', 'no-separate-charge-documented', 'price-unavailable'];
const REQUIRED = ['RG', 'PLAN', 'APP', 'SLOT', 'STORAGE', 'EGRESS'];
const EXCLUSION_COST = /^(?:price unavailable|not applicable|not created|outside the authorized)/;

// What the reader sees: no format characters, no non-breaking spaces, single spaces, lower case.
const plain = (text) => latin(fold(text)).toLowerCase().replace(/\s+/g, ' ').trim();
const isZeroShaped = (text) => ZERO.test(plain(text));

function checkLine(line, path, add) {
  if (!isObj(line)) { add('PRICE_STATUS_UNKNOWN', path, 'a price line must be an object'); return; }
  const where = `${path}${line.id ? ` (${line.id})` : ''}`;
  if (line.status === 'returned' || line.status === 'returned-zero') {
    if (line.status === 'returned' && !(isNum(line.unitPrice) && line.unitPrice > 0)) add('PRICE_NOT_POSITIVE', `${path}.unitPrice`, `${where}: a returned price must be a positive number, never zero, negative or text`);
    if (line.status === 'returned-zero' && (line.unitPrice !== 0 || !isStr(line.queryId))) add('PRICE_ZERO_UNSOURCED', path, `${where}: a returned zero needs the query that returned it`);
    if (!/^[A-Z]{3}$/.test(line.currencyCode || '')) add('PRICE_NO_CURRENCY', `${path}.currencyCode`, `${where}: a price needs a three-letter currency code`);
    if (!isStr(line.unitOfMeasure)) add('PRICE_NO_UNIT', `${path}.unitOfMeasure`, `${where}: a price needs a unit of measure`);
    if (Number.isNaN(parseDate(line.effectiveStartDate))) add('PRICE_NO_EFFECTIVE_DATE', `${path}.effectiveStartDate`, `${where}: a price needs a real effective date (YYYY-MM-DD)`);
    if (!isStr(line.meterId)) add('PRICE_NO_METER', `${path}.meterId`, `${where}: a returned price needs the meter it came from`);
  } else if (line.status === 'not-queried') {
    if (line.unitPrice !== null) add('PRICE_UNAVAILABLE_COSTED', `${path}.unitPrice`, `${where}: an unavailable price must be null; it is never costed as 0`);
    if (!UNAVAILABLE.test(line.note || '')) add('PRICE_UNAVAILABLE_UNLABELLED', `${path}.note`, `${where}: an unavailable price must read "price unavailable"`);
  } else {
    add('PRICE_STATUS_UNKNOWN', `${path}.status`, `${where}: status must be returned, returned-zero or not-queried`);
  }
}

const claimIds = (packet) => new Set((isArr(packet.documentedSources) ? packet.documentedSources : []).flatMap((d) => (isObj(d) && isArr(d.claims) ? d.claims : []).map((c) => c && c.id)));

function pricedEvidence(r, path, lines, add) {
  const keys = isArr(r.priceKeys) ? r.priceKeys : [];
  const resolved = keys.length > 0 && keys.every((k) => lines.some((l) => isObj(l) && l.key === k && l.status === 'returned' && isNum(l.unitPrice) && l.unitPrice > 0));
  if (!resolved) add('RESOURCE_PRICED_NO_LINE', `${path}.priceKeys`, 'a priced row needs price keys that resolve to returned, positive lines of the price register');
  if (!/\bQ\d{2}\b/.test(String(r.pricing))) add('RESOURCE_PRICED_NO_LINE', `${path}.pricing`, 'a priced row must cite the query that returned the price');
  if (r.includedInTotals !== true) add('RESOURCE_PRICED_NO_LINE', `${path}.includedInTotals`, 'a priced resource belongs in the totals');
}

function checkResource(r, path, ctx) {
  const { add, lines, claims } = ctx;
  if (!isObj(r) || !RESOURCE_STATUS.includes(r.pricingStatus)) {
    add('RESOURCE_PRICING_STATUS', `${path}.pricingStatus`, `each required resource needs a pricingStatus (${RESOURCE_STATUS.join(', ')})`);
    if (isObj(r) && isZeroShaped(String(r.pricing || ''))) add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'a row without a pricing status must not read as free, no charge, n/a or included');
    return;
  }
  const text = String(r.pricing || '');
  const zero = isZeroShaped(text);
  if (r.pricingStatus === 'priced') {
    if (zero || !isStr(text)) add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'a priced row must say what it costs, never free, no charge, n/a or included');
    pricedEvidence(r, path, lines, add);
  } else if (r.pricingStatus === 'price-unavailable') {
    if (r.includedInTotals !== false) add('RESOURCE_UNAVAILABLE_IN_TOTAL', `${path}.includedInTotals`, 'a resource whose price is unavailable must stay out of every total (includedInTotals false)');
    if (!/^price unavailable/.test(plain(text))) add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'an unavailable price must read "price unavailable (...)"');
    const label = isObj(r.meterEvidence) ? r.meterEvidence.chargeLabel : undefined;
    if (zero && !(/\bestimate/.test(plain(text)) && (label === 'estimated' || label === 'documented'))) add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'a no-charge remark on an unavailable price must be labelled an estimate (chargeLabel estimated) or be documented');
    if (/no meter/.test(plain(text)) && !(isObj(r.meterEvidence) && isStr(r.meterEvidence.query))) add('RESOURCE_NO_METER_EVIDENCE', `${path}.meterEvidence`, 'a "no meter" claim needs the lookup that returned no meter');
    if (label === 'documented' && !/^https:\/\/learn\.microsoft\.com\//.test(r.meterEvidence.source || '')) add('ZERO_COST_UNSOURCED', `${path}.meterEvidence.source`, 'a documented no-charge claim needs its Learn source');
  } else {
    if (r.includedInTotals !== false) add('RESOURCE_UNAVAILABLE_IN_TOTAL', `${path}.includedInTotals`, 'a no-separate-charge row stays out of the totals');
    const ids = [...text.matchAll(/\(documented, ([^)]*)\)/g)].flatMap((m) => m[1].split(/,| and /).map((s) => s.trim()).filter(Boolean));
    if (ids.length === 0 || !ids.every((id) => claims.has(id))) add('ZERO_COST_UNSOURCED', `${path}.pricing`, 'a documented no-separate-charge row must cite documented claim ids that exist, e.g. (documented, PLANS-BILLING)');
  }
}

function checkPrices(packet, add) {
  const pricing = isObj(packet.pricing) ? packet.pricing : {};
  const lines = isArr(pricing.lines) ? pricing.lines : [];
  if (lines.length === 0) add('PRICES_MISSING', 'pricing.lines', 'the price register is missing or empty');
  lines.forEach((l, i) => checkLine(l, `pricing.lines[${i}]`, add));
  const unpriced = isArr(pricing.unpricedItems) ? pricing.unpricedItems : [];
  if (unpriced.length === 0) add('UNPRICED_MISSING', 'pricing.unpricedItems', 'the items without a price must be listed: they are never costed as 0 and never dropped');
  unpriced.forEach((u, i) => {
    const path = `pricing.unpricedItems[${i}]`;
    if (!isObj(u) || u.includedInTotals !== false || u.unitPrice !== null) add('UNPRICED_IN_TOTAL', path, 'an unpriced item must have unitPrice null and includedInTotals false: never summed as 0 and never dropped silently');
    if (!isObj(u) || !UNAVAILABLE.test(u.note || '')) add('PRICE_UNAVAILABLE_UNLABELLED', `${path}.note`, 'an unpriced item must read "price unavailable"');
  });
  const resources = isArr(packet.requiredResources) ? packet.requiredResources : [];
  const ids = new Set(resources.map((r) => isObj(r) && r.id));
  const needsLaw = (isArr(packet.options) ? packet.options : []).some((o) => isObj(o) && isObj(o.logs) && o.logs.workspace === true);
  const missing = [...REQUIRED, ...(needsLaw ? ['LAW'] : [])].filter((id) => !ids.has(id));
  if (missing.length > 0) add('REQUIRED_RESOURCES_MISSING', 'requiredResources', `required resources missing: ${missing.join(', ')}`);
  const ctx = { add, lines, claims: claimIds(packet) };
  resources.forEach((r, i) => checkResource(r, `requiredResources[${i}]`, ctx));
  (isArr(packet.exclusions) ? packet.exclusions : []).forEach((e, i) => {
    const cost = isObj(e) ? plain(e.cost) : '';
    if (!EXCLUSION_COST.test(cost) || isZeroShaped(cost)) add('ZERO_COST_UNSOURCED', `exclusions[${i}].cost`, 'an excluded item states why it has no price (price unavailable, not applicable, not created) and is never costed as zero or free');
  });
}

module.exports = { CODES, checkPrices, UNAVAILABLE };
