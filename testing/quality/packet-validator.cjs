'use strict';
// Validator for native-run approval packets (U001 revision 2 and later configurations). Pure functions: no I/O, no clock, no randomness.
// validatePacket(packet, { nowUtc, markdown }) returns { ok, findings: [{ code, path, message }] }; nowUtc and markdown are optional.
const { isObj, makeSink } = require('./util.cjs');
const prices = require('./rules-prices.cjs');
const options = require('./rules-options.cjs');
const plan = require('./rules-plan.cjs');
const decisions = require('./rules-decisions.cjs');
const hygiene = require('./rules-hygiene.cjs');

const RULE_CODES = ['PACKET_NOT_OBJECT', ...prices.CODES, ...options.CODES, ...plan.CODES, ...decisions.CODES, ...hygiene.CODES];

function validatePacket(packet, settings) {
  const { findings, add } = makeSink();
  if (!isObj(packet)) {
    add('PACKET_NOT_OBJECT', '', 'the packet must be a JSON object');
    return { ok: false, findings };
  }
  const opts = isObj(settings) ? settings : {};
  prices.checkPrices(packet, add);
  options.checkOptions(packet, add);
  plan.checkPlan(packet, add);
  decisions.checkDecisionsAndState(packet, add, opts);
  hygiene.checkHygiene(packet, add, opts);
  return { ok: findings.length === 0, findings };
}

module.exports = { validatePacket, RULE_CODES };
