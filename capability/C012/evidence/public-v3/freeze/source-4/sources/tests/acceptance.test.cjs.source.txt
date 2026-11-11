'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const fixtures = require('../fixtures.js');
const row = (result, key) => result.rows.find(item => item[0] === key)?.[2];

test('C012 reserved holdings differ from proposed estimates and show actual remaining allowance', async () => {
  const result = await model.review(fixtures.held.text, 'conductor-a', 'rsv-00000001', 1000);
  assert.equal(result.reviewable, true);
  assert.equal(row(result, 'reserved-capacity'), '3 synthetic units');
  assert.equal(row(result, 'estimated-capacity'), '2 synthetic units');
  assert.equal(row(result, 'reserved-cost'), '12 fictional spend units');
  assert.equal(row(result, 'estimated-cost'), '8 fictional spend units');
  assert.equal(row(result, 'remaining-capacity'), '5 synthetic units');
  assert.equal(row(result, 'remaining-cost'), '36 fictional spend units');
  assert.equal(row(result, 'cloud-cost'), 'Not applicable — no cloud execution; amount unknown / null, not zero');
});

test('C012 unknown pricing never becomes zero or review approval', async () => {
  const result = await model.review(fixtures.unknown.text, 'conductor-a', 'rsv-00000001', 1000);
  assert.equal(result.reviewable, false);
  assert.equal(row(result, 'cloud-cost'), 'Unknown — amount unknown / null, not zero');
});

test('C012 a useful client review is not execution or spend authorization', async () => {
  const result = await model.review(fixtures.held.text, 'conductor-a', 'rsv-00000001', 1000);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.cloudExecutionAuthorized, false);
  assert.equal(result.expenditureAuthorized, false);
  assert.equal(result.liveAzureRuns, 0);
});
