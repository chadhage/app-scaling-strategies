'use strict';
// Naive subject for the RED replay: accepts every packet. The tests must fail against it by assertion.
module.exports = { validatePacket: () => ({ ok: true, findings: [] }), RULE_CODES: [] };
