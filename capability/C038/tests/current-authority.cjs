'use strict';

const assert = require('node:assert/strict');
assert.equal(process.argv.length, 2);
const current = require('../boundary.cjs').currentDiagnostic();
assert.equal(current.assessment.exactAuthorizedBytes, true);
assert.equal(current.assessment.delegationReady, true);
console.log(JSON.stringify(current));
