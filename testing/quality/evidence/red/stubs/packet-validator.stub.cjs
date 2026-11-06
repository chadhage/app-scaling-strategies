'use strict';
// RED stub: accepts every packet. Replaced by the real validator after the RED run is archived.
const RULE_CODES = [];

function validatePacket() {
  return { ok: true, findings: [] };
}

module.exports = { validatePacket, RULE_CODES };
