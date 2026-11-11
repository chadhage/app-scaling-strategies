'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const model = require('../model.js'), fixtures = require('../fixtures.js');
const { build, render } = require('./make-fixtures.cjs');
const { create } = require('./dom.cjs');
const values = result => Object.fromEntries(result.rows.map(([key, , value]) => [key, value]));
async function review(name, owner, id, at) {
  const entry = fixtures[name], packet = JSON.parse(entry.text);
  return model.review(entry.text, owner ?? packet.subject, id ?? packet.reservationId, at ?? packet.observedAtMs);
}
function boundary(result) {
  assert.equal(result.executionAuthorized, false, 'display never becomes execution authority');
  assert.equal(result.cloudExecutionAuthorized, false);
  assert.equal(result.expenditureAuthorized, false);
  assert.equal(result.liveAzureRuns, 0);
  assert.equal(result.nativeAzureQualified, false);
  assert.equal(result.productionRuntimeValidated, false);
  assert.deepEqual(result.permissions, { native: false, iac: false, scaffold: false, identity: false, deploy: false, expenditure: false });
  assert.equal(new Set(result.rows.map(row => row[0])).size, result.rows.length);
  assert.equal(result.state, result.reviewable ? 'ready' : 'blocked');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rows), true);
  for (const row of result.rows) assert.equal(Object.isFrozen(row), true);
}
test('all snapshot bytes regenerate through actual C003 C004 and C011 public functions', async () => {
  const actual = await build();
  assert.deepEqual(actual, fixtures);
  assert.equal(render(actual), fs.readFileSync(path.join(__dirname, '..', 'fixtures.js'), 'utf8').replace(/\r\n/g, '\n'));
});
test('every real producer transition remains useful and has explicit bounded facts', async () => {
  const expectations = {
    held: [], released: ['RESERVATION_INACTIVE'], expired: ['RESERVATION_INACTIVE'],
    refused: ['PRODUCER_REFUSED'], unknown: ['PLAN_BLOCKED'], native: ['PLAN_BLOCKED'],
    unverified: ['PLAN_BLOCKED'], missing: ['ALLOWANCE_UNKNOWN', 'RESERVATION_UNKNOWN'], absent: ['RESERVATION_UNKNOWN']
  };
  for (const [name, reasons] of Object.entries(expectations)) {
    const result = await review(name);
    boundary(result);
    assert.deepEqual(result.reasons, reasons, name);
    assert.equal(result.rows.length, 22, 'every rendered fact is enumerated');
    const facts = values(result);
    assert.equal(facts['estimated-capacity'], name === 'refused' ? '6 synthetic units' : '2 synthetic units');
    assert.equal(facts['estimated-cost'], name === 'refused' ? '24 fictional spend units' : '8 fictional spend units');
    assert.match(facts.matrix, /^17 rows: 2 planned, 9 documented-supported, 4 unsupported, 2 unknown, 0 native-qualified$/);
    assert.match(facts.provenance, /C011 2b7e681098ea463c21cd9e624474d3c26c86440a/);
    assert.match(facts.target, /unknown.*unvalidated/);
    assert.match(facts.authority, /not server consent or permission to run/);
    if (['released', 'expired'].includes(name)) {
      assert.equal(facts['reserved-capacity'], '0 synthetic units');
      assert.equal(facts['remaining-capacity'], '8 synthetic units');
      assert.equal(facts['remaining-cost'], '48 fictional spend units');
    }
    if (['missing', 'absent'].includes(name)) assert.match(facts['reserved-capacity'], /^Unknown/);
    if (name === 'missing') assert.match(facts['remaining-capacity'], /^Unknown/);
    if (name === 'unverified') assert.equal(facts['cloud-cost'], '125 USD minor units — unverified; blocked');
    if (name === 'native') assert.equal(facts['cloud-cost'], 'Missing — amount unknown / null, not zero');
  }
});
test('scope owner reservation and freshness mismatches fail closed at both boundaries', async () => {
  assert.deepEqual((await review('held', 'conductor-b')).reasons, ['OWNER_MISMATCH']);
  assert.deepEqual((await review('held', undefined, 'rsv-00000002')).reasons, ['RESERVATION_MISMATCH']);
  for (const at of [-1, 999, 2001, 301000, 301001, NaN, Infinity, 1.1]) {
    const result = await review('held', undefined, undefined, at);
    assert.equal(result.reviewable, false, String(at));
    assert.ok(result.reasons.includes('STALE_OBSERVATION'));
  }
  for (const at of [1000, 1001, 1999, 2000]) assert.equal((await review('held', undefined, undefined, at)).reviewable, true);
});
test('each changed fact class is rejected before any source wording can be rendered', async () => {
  const edits = [
    packet => { packet.subject = 'conductor-b'; },
    packet => { packet.reservationId = 'rsv-00000002'; },
    packet => { packet.allowance.value.allowance.lease.remainingUnits = 100; },
    packet => { packet.allowance.value.allowance.prices.standard = 0; },
    packet => { packet.estimate.spend = 0; },
    packet => { packet.planResult.plan.cost.totalMinorUnits = 0; },
    packet => { packet.provenance.C011.commit = 'forged'; },
    packet => { packet.planResult.plan.cloudExecutionAuthorized = true; },
    packet => { packet.planResult.plan.blockers = [{ message: '<img src=x onerror=alert(1)>' }]; },
    packet => { delete packet.allowance; }
  ];
  for (const edit of edits) {
    const packet = JSON.parse(fixtures.held.text); edit(packet);
    const result = await model.review(JSON.stringify(packet), 'conductor-a', 'rsv-00000001', 1000);
    assert.deepEqual(result.reasons, ['SOURCE_MISMATCH']);
    assert.deepEqual(result.rows, []);
    boundary(result);
  }
});
test('hostile scalar inputs are typed refusals and never invoke coercion getters', async () => {
  const explosive = { toString() { throw new Error('getter/coercion must not run'); } };
  const hostile = [undefined, null, false, 1, NaN, Infinity, [], new Array(3), {}, explosive, 'x'.repeat(32769)];
  for (const value of hostile) {
    const result = await model.review(value, 'conductor-a', 'rsv-00000001', 1000);
    assert.equal(result.reviewable, false);
  }
  for (const value of [undefined, null, [], {}, explosive, Symbol('hostile')]) {
    const result = await model.review(fixtures.held.text, 'conductor-a', 'rsv-00000001', value);
    assert.equal(result.reviewable, false);
  }
  for (const which of ['owner', 'reservation']) {
    const result = await model.review(fixtures.held.text, which === 'owner' ? explosive : 'conductor-a', which === 'reservation' ? explosive : 'rsv-00000001', 1000);
    assert.equal(result.reviewable, false);
  }
});
test('browser model uses actual source and unavailable crypto is not approval', async () => {
  const dom = create({ crypto: {} });
  const result = await dom.context.C012Model.review(fixtures.held.text, 'conductor-a', 'rsv-00000001', 1000);
  assert.deepEqual(Array.from(result.reasons), ['INTEGRITY_UNAVAILABLE']);
  assert.equal(result.reviewable, false);
});
test('public outputs cannot mutate a later model observation', async () => {
  const before = await review('held');
  const attempt = value => {
    if (!value || typeof value !== 'object') return;
    for (const key of Reflect.ownKeys(value)) {
      assert.throws(() => { value[key] = null; }, TypeError);
      attempt(value[key]);
    }
  };
  attempt(before);
  assert.deepEqual(await review('held'), before);
});
module.exports = { review, boundary, values };
