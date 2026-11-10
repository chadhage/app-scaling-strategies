'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
require('node:test')('U060 child starts only after its owner records identity', () => {
  assert.equal(typeof process.env.C043_U060_GATE_FILE, 'string', 'a recorded owner-start fact must exist before this test runs');
  const fact = JSON.parse(fs.readFileSync(process.env.C043_U060_GATE_FILE, 'utf8'));
  assert.equal(fact.token, process.env.C043_U060_START_TOKEN);
  assert.ok(Number.isInteger(fact.pid) && fact.pid > 0);
  assert.equal(fact.identityRecorded, true);
});
