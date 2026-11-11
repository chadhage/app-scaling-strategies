'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const filename = process.env.U069_REPORT || path.join(__dirname, '..', 'evidence', 'u069', 'current-report.json');
const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
let report;
if (data.schemaVersion === 1 && data.cardId === 'C011' && data.mutation) {
  report = { generated: data.mutation.generated, ...data.mutation.currentUniqueCensus };
} else {
  assert.equal(data.schema, 'U069-current-mutation/1', 'only the explicit current report or retained original result is understood');
  report = data;
}
test('U069 every regenerated position is executed before completion', () => {
  assert.ok(Number.isInteger(report.generated) && report.generated > 0);
  assert.equal(report.executed, report.generated);
});
test('U069 no current survivor is accepted by default', () => assert.equal(report.survived, 0));
test('U069 no undecided position, timeout or module fault is hidden as a kill', () => assert.equal(report.undecided, 0));
test('U069 no unexecuted original position is called complete', () => assert.equal(report.notExecuted, 0));
