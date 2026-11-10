'use strict';

// The refusal table (rows.cjs) is complete: every refusal code of the closed table of contract.js has a row, except the two quota codes
// that need a full session table (isolation-more.test.cjs and the anonymous test of lifecycle-more) and the timer (refusal-close), and
// every row's status is the status of its code.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { CODES } = require('../contract.js');
const rows = require('./rows.cjs');

const table = rows.ROWS(new Proxy({}, { get: () => 'placeholder' }));

test('every refusal code of the closed table has a row, and each row carries the status of its code', () => {
  const covered = new Set(table.map((row) => row.code));
  const missing = Object.keys(CODES).filter((code) => CODES[code][0] >= 400 && !covered.has(code)).sort();
  assert.deepEqual(missing, ['ANONYMOUS_QUOTA_FULL', 'REQUEST_TIMEOUT', 'SESSION_QUOTA_FULL']);
  for (const row of table) assert.equal(CODES[row.code][0], row.status, row.name || row.code);
  assert.deepEqual([...new Set(table.map((row) => row.status))].sort((a, b) => a - b), [400, 401, 403, 404, 405, 409, 412, 413, 414, 415, 417, 421, 431, 500]);
});

test('the Node-own rows are exactly the answers Node gives itself: unknown Expect, parse error, oversized header, CONNECT', () => {
  assert.deepEqual(table.filter((row) => row.nodeOwn).map((row) => row.status).sort(), [400, 405, 417, 431]);
});
