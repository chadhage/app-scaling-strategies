'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NUMBERS, resolveConfig } = require('../config.cjs');
const EXPECTED = [
  ['pool.units', 100, 1, 1000], ['pool.spend', 600, 1, 100000],
  ['caps.conductor-a.units', 60, 1, 1000], ['caps.conductor-a.spend', 400, 1, 100000],
  ['caps.conductor-b.units', 60, 1, 1000], ['caps.conductor-b.spend', 400, 1, 100000],
  ['prices.standard', 4, 1, 1000], ['prices.burst', 8, 1, 1000],
  ['ttlMs', 300000, 1000, 900000], ['maxActive', 20, 1, 100], ['entries', 50, 2, 200], ['keyEntries', 1000, 1, 2000],
  ['limits.bodyBytes', 4096, 256, 16384], ['limits.headerMs', 5000, 1, 60000],
  ['limits.checkMs', 1000, 1, 10000], ['limits.idleMs', 8000, 3, 120000],
  ['limits.connections', 256, 1, 1024], ['limits.pipelined', 4, 1, 16],
  ['limits.auditEntries', 200, 1, 1000], ['limits.anonymousEntries', 50, 1, 500]
];
const nested = (name, value) => name.split('.').reduceRight((inner, key) => ({ [key]: inner }), value);
function configuration(name, value) {
  const given = nested(name, value);
  if (name.startsWith('caps.')) given.pool = { units: 1000, spend: 100000 };
  if (name.startsWith('pool.')) given.caps = { 'conductor-a': { units: 1, spend: 1 }, 'conductor-b': { units: 1, spend: 1 } };
  if (name === 'maxActive') given.entries = 200;
  if (name === 'entries') given.maxActive = 1;
  if (name === 'limits.idleMs') Object.assign(given.limits, { headerMs: 1, checkMs: 1 });
  if (name === 'limits.headerMs' || name === 'limits.checkMs') given.limits.idleMs = 120000;
  return given;
}

test('the exported server-side vocabulary contains exactly the declared closed defaults and bounds, not self-derived mutant values', () => {
  assert.deepEqual(NUMBERS, EXPECTED);
});
test('every independently declared configuration boundary accepts its exact endpoints and refuses one outside each endpoint', () => {
  for (const [name, fallback, min, max] of EXPECTED) {
    for (const value of [min, max, fallback]) assert.doesNotThrow(() => resolveConfig(configuration(name, value)), name);
    for (const value of [min - 1, max + 1]) assert.throws(() => resolveConfig(configuration(name, value)), { code: 'CONFIG_INVALID' }, name);
  }
});
