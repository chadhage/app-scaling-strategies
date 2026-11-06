'use strict';

// C010 scenario "Every refusal closes the connection and nothing behind it runs", server in THIS process, first share of the rows (see
// matrix.cjs and rows.cjs). The second share is pipeline-inproc-b.test.cjs; the same cells against a server PROCESS are pipeline-process-*.
const assert = require('node:assert/strict');
const test = require('node:test');
const { CODES } = require('../codes.cjs');
const { defineMatrix } = require('./matrix-suite.cjs');
const { ROWS } = require('./rows.cjs');
const { startTarget } = require('./targets.cjs');

test('every typed code of the server has a row, and every row names a code the server can answer', () => {
  assert.deepEqual([...new Set(ROWS.map((row) => row.code))].sort(), Object.keys(CODES).sort());
  for (const row of ROWS) assert.equal(CODES[row.code][0], row.status, row.code);
});

defineMatrix({ where: 'in this process', start: startTarget, plan: [['default', [0, 3]], ['quota', null], ['timeout', null]] });
