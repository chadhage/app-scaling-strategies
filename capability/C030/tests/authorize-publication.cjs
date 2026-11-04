'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.equal(process.argv.length, 2);
try {
  const allowed = require('..\\publisher-policy.cjs').authorize(fs.readFileSync(0, 'utf8'));
  console.log(JSON.stringify(allowed));
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 3;
}
