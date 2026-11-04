'use strict';

const assert = require('node:assert/strict');
const source = require('..\\source.cjs');
const evidence = require('./evidence.cjs');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact deliberate one-card preflight only.');
const imports = source.checkImports();
const index = evidence.checkIndex();
source.checkGates(source.readGates());
assert.equal(index.preservedFailedEdgeCaptures, 1);
assert.deepEqual(index.latestFocusedTapTotals, ['# tests 77', '# pass 77', '# fail 0']);
console.log(JSON.stringify({ preflight: 'passed', directPins: imports.direct.length,
  originalC029Pins: imports.unchangedC029Underlying.length, evidence: index,
  stagingPerformed: false, publicationPerformed: false }));
