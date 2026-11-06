'use strict';
// Validator for native-run approval packets (U001 revision 3 and later configurations). Pure functions: no I/O, no clock, no randomness.
// validatePacket(packet, { nowUtc, markdown }) returns { ok, findings: [{ code, path, message }] }; nowUtc (an ISO instant or YYYY-MM-DD) and markdown
// are optional. It never throws: an input beyond the limits answers INPUT_TOO_LARGE or INPUT_TOO_DEEP, any other failure answers VALIDATOR_ERROR.
const { isObj, makeSink } = require('./util.cjs');
const { inventory } = require('./limits.cjs');
const { resetFold } = require('./text.cjs');
const prices = require('./rules-prices.cjs');
const options = require('./rules-options.cjs');
const plan = require('./rules-plan.cjs');
const script = require('./rules-script.cjs');
const decisions = require('./rules-decisions.cjs');
const hygiene = require('./rules-hygiene.cjs');
const markdown = require('./rules-markdown.cjs');

const RULE_CODES = ['PACKET_NOT_OBJECT', 'INPUT_TOO_LARGE', 'INPUT_TOO_DEEP', 'INPUT_COMBINING_RUN', 'VALIDATOR_ERROR', ...prices.CODES, ...options.CODES, ...plan.CODES, ...decisions.CODES,
  ...hygiene.CODES, ...markdown.CODES];

function validatePacket(packet, settings) {
  const { findings, add } = makeSink();
  try {
    if (!isObj(packet)) {
      add('PACKET_NOT_OBJECT', '', 'the packet must be a JSON object');
      return { ok: false, findings };
    }
    const opts = isObj(settings) ? settings : {};
    resetFold();
    const inv = inventory(packet);
    if (inv.error) {
      add(inv.error.code, inv.error.path, inv.error.message);
      return { ok: false, findings };
    }
    prices.checkPrices(packet, add);
    options.checkOptions(packet, add);
    script.checkPlan(packet, add, inv);
    decisions.checkDecisionsAndState(packet, add, opts);
    hygiene.checkHygiene(packet, add, inv);
    markdown.checkMarkdown(packet, opts.markdown, add, inv);
  } catch (error) {
    add('VALIDATOR_ERROR', '', `the validator could not read this packet: ${String(error && error.message).slice(0, 120)}`);
  }
  return { ok: findings.length === 0, findings };
}

module.exports = { validatePacket, RULE_CODES };
