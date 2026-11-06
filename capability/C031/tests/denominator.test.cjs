'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const evaluator = require('..\\evaluator.js');
const f = require('.\\fixtures.cjs');

// Hostile edits of the trace of an eligible, non-transitioned old-version client: each one keeps old-version traffic in the trace,
// so the client must stay in the denominator and the success rate must never rise.
const shifted = (events, by) => events.map((event) => ({ ...event, seq: event.seq + by, at: event.at + 100 }));
const attacks = {
  'a replayed new-version request first': (client) => [f.request(1, 1, 'x1', f.NEW), ...shifted(client.events, 1)],
  'a new-version state first': (client) => [f.state(1, 1, f.NEW), ...shifted(client.events, 1)],
  'an acknowledgment of an unknown new-version request first': (client) => [f.ack(1, 1, 'x1', f.V2, 1), ...shifted(client.events, 1)],
  'a complete new-version request and acknowledgment first': (client) => [f.request(1, 1, 'x1', f.NEW), f.ack(2, 2, 'x1', f.V2, 1),
    ...shifted(client.events, 2)],
  'a new-version state with the lowest sequence number placed last': (client) => [...shifted(client.events, 1), f.state(1, 500, f.NEW)],
  'a new-version state in the middle of the old traffic': (client) => {
    const [first, ...rest] = client.events;
    return [first, f.state(2, first.at, f.NEW), ...shifted(rest, 1).map((event) => ({ ...event, at: event.at + 1000 }))];
  }
};
const stuck = ['client-004', 'client-005', 'client-006', 'client-007', 'client-008'];
const rate = (report) => [report.successRate.numerator, report.successRate.denominator];
const baseline = evaluator.evaluateFleet(f.fleet('base', f.baselineClients()));

test('the baseline fleet is 3 of 8 with five old-version clients that did not transition', () => {
  assert.deepEqual(rate(baseline), [3, 8]);
  for (const id of stuck) assert.equal(baseline.clients.find((row) => row.clientId === id).eligible, true, id);
});

for (const [name, attack] of Object.entries(attacks)) {
  test(`${name} cannot take a stuck old-version client out of the denominator or raise the rate`, () => {
    for (const id of stuck) {
      const clients = f.baselineClients().map((client) => (client.clientId === id ? { clientId: id, events: attack(client) } : client));
      const report = evaluator.evaluateFleet(f.fleet('attack', clients));
      const row = report.clients.find((item) => item.clientId === id);
      assert.equal(report.valid, true, `${id} ${name}`);
      assert.equal(row.classification, 'FAILED_OR_UNKNOWN', `${id} ${name}`);
      assert.equal(row.eligible, true, `${id} ${name}`);
      assert.equal(row.countsInDenominator, true, `${id} ${name}`);
      assert.equal(row.countsInNumerator, false, `${id} ${name}`);
      assert.deepEqual(rate(report), [3, 8], `${id} ${name}`);
      assert.ok(report.counts.failedOrUnknown >= baseline.counts.failedOrUnknown, `${id} ${name}`);
    }
  });
}

test('a start that the old-version traffic contradicts is labelled and counted eligible, never excluded', () => {
  const clients = f.baselineClients().map((client) => (client.clientId === 'client-004' ?
    { clientId: 'client-004', events: attacks['a replayed new-version request first'](client) } : client));
  const row = evaluator.evaluateFleet(f.fleet('label', clients)).clients.find((item) => item.clientId === 'client-004');
  assert.deepEqual([row.startVersion, row.eligibility, row.reasonCodes, row.position],
    ['2.0.0', 'CONTRADICTORY_START_COUNTED_ELIGIBLE', ['VERSION_REGRESSION'], { eventIndex: 1, seq: 2 }]);
});

test('the start version is the version at the lowest sequence number, not the first element of the saved array', () => {
  const row = evaluator.evaluateFleet(f.fleet('order', [f.client('o-1', [f.request(2, 20, 'r2', f.OLD), f.request(1, 10, 'r1', f.NEW)])])).clients[0];
  assert.deepEqual([row.classification, row.reasonCodes[0], row.startVersion, row.eligibility, row.eligible],
    ['FAILED_OR_UNKNOWN', 'OUT_OF_ORDER_SEQUENCE', '2.0.0', 'CONTRADICTORY_START_COUNTED_ELIGIBLE', true]);
});

test('the transition evidence names the first old-version request, the first new-version acknowledgment and the first later use', () => {
  const events = [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 12), f.request(3, 20, 'r2', f.OLD), f.ack(4, 24, 'r2', f.V1, 22),
    f.request(5, 30, 'r3', f.NEW), f.ack(6, 34, 'r3', f.V2, 32), f.request(7, 40, 'r4', f.NEW), f.ack(8, 44, 'r4', f.V2, 42), f.state(9, 50, f.NEW)];
  const { evidence } = evaluator.evaluateFleet(f.fleet('evidence', [f.client('e-1', events)])).clients[0];
  assert.deepEqual([evidence.requestAtOldVersion.seq, evidence.newVersionAcknowledged.seq, evidence.laterRequestOrState.seq], [1, 6, 7]);
});

test('a client with only new-version traffic stays outside the denominator, whatever defect its trace shows', () => {
  const defects = {
    'a duplicated acknowledgment': [f.request(1, 10, 'r1', f.NEW), f.ack(2, 14, 'r1', f.V2, 12), f.ack(3, 15, 'r1', f.V2, 12)],
    'an acknowledgment without a request': [f.ack(1, 14, 'r1', f.V2, 12), f.request(2, 20, 'r1', f.NEW)],
    'time going backwards': [f.request(1, 20, 'r1', f.NEW), f.ack(2, 14, 'r1', f.V2, 20)],
    'a stale acknowledgment': [f.request(1, 400, 'r1', f.NEW), f.ack(2, 405, 'r1', f.V2, 15)],
    'a reordered sequence': [f.request(1, 10, 'r1', f.NEW), f.state(3, 20, f.NEW), f.ack(2, 14, 'r1', f.V2, 12)],
    'a failed reply': [f.request(1, 10, 'r1', f.NEW), f.failedReply(2, 14, 'r1', 'UNKNOWN_PROFILE')],
    'an interruption': [f.request(1, 10, 'r1', f.NEW), f.interrupted(2, 14, 'INTERRUPTED_BY_STOP')]
  };
  for (const [name, events] of Object.entries(defects)) {
    const report = evaluator.evaluateFleet(f.fleet('new-only', [...f.baselineClients(), f.client('n-1', events)]));
    const row = report.clients.find((item) => item.clientId === 'n-1');
    assert.equal(row.classification, 'FAILED_OR_UNKNOWN', name);
    assert.deepEqual([row.eligible, row.eligibility, row.countsInDenominator], [false, 'STARTED_ON_NEW_VERSION_NOT_ELIGIBLE', false], name);
    assert.deepEqual(rate(report), [3, 8], name);
    assert.equal(report.counts.failedOrUnknown, baseline.counts.failedOrUnknown + 1, `${name} stays visible`);
  }
});
