'use strict';

const assert = require('node:assert/strict');
const source = require('..\\source.cjs');
const evidence = require('./evidence.cjs');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact deliberate one-card preflight only.');
const imports = source.checkImports();
const index = evidence.checkIndex();
const manifest = JSON.parse(source.readRegular('capability\\C035\\manifest.json').toString('utf8'));
source.checkGates(source.readGates());
assert.equal(index.preservedFailedEdgeCaptures, 1);
assert.deepEqual(index.latestFocusedTapTotals,
  [`# tests ${manifest.focusedTestCases}`, `# pass ${manifest.focusedTestCases}`, '# fail 0']);
assert.ok(index.repairRedAssertionsFailed >= 1);
assert.equal(index.latestCoverage?.passed, true);
console.log(JSON.stringify({ preflight: 'passed', directPins: imports.direct.length,
  originalC029Pins: imports.unchangedC029Underlying.length, evidence: index,
  stagingPerformed: false, publicationPerformed: false }));
