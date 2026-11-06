'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const evaluator = require('..\\evaluator.js');
const f = require('.\\fixtures.cjs');

const evaluate = (clients, id = 'hostile') => evaluator.evaluateFleet(f.fleet(id, clients));
const rate = (report) => [report.successRate.numerator, report.successRate.denominator];

test('__proto__ and constructor keys at any depth reject the whole set and pollute nothing', () => {
  const spots = [
    '{"schema":"C031-fleet/1","id":"x","clients":[],"__proto__":{"polluted":true}}',
    '{"schema":"C031-fleet/1","id":"x","clients":[{"clientId":"a","events":[],"__proto__":{"polluted":true}}]}',
    '{"schema":"C031-fleet/1","id":"x","clients":[{"clientId":"a","events":[],"constructor":{"prototype":{"polluted":true}}}]}',
    '{"schema":"C031-fleet/1","id":"x","clients":[{"clientId":"a","events":[{"seq":1,"at":1,"action":"HOLD","__proto__":{"polluted":true}}]}]}',
    '{"schema":"C031-fleet/1","id":"x","clients":[{"clientId":"a","events":[],"annotations":{"constructor":1}}]}',
    '{"schema":"C031-fleet/1","id":"x","clients":[{"clientId":"a","events":[],"prototype":1}]}'
  ];
  for (const json of spots) {
    const report = evaluator.evaluateFleet(JSON.parse(json));
    assert.deepEqual([report.valid, report.code, report.clients.length, rate(report)], [false, 'OWN_DATA_FIELDS', 0, [0, 0]], json);
  }
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.keys(Object.prototype), []);
});

test('names that exist on Object.prototype are ordinary client and request identifiers', () => {
  const names = ['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'propertyIsEnumerable', 'isPrototypeOf'];
  const clients = names.map((name, index) => f.client(name, [f.request(1, 10, name, f.OLD), f.ack(2, 14, name, f.V1, 12),
    f.request(3, 20, `${name}-2`, f.NEW), f.ack(4, 24, `${name}-2`, f.V2, 22), f.state(5, 30 + index, f.NEW)]));
  const report = evaluate(clients);
  assert.deepEqual([report.valid, rate(report), report.clients.map((row) => row.clientId)], [true, [6, 6], names]);
  assert.ok(report.clients.every((row) => row.classification === 'ACTUAL_TRANSITION'));
  assert.equal(evaluate([f.client('__proto__', [])]).clients[0].clientId, 'invalid-client-1');
  assert.equal(evaluate([f.client('__defineGetter__', [])]).clients[0].clientId, 'invalid-client-1');
  assert.equal(evaluate([f.client('x', [{ seq: 1, at: 1, action: 'constructor' }])]).clients[0].reasonCodes[0], 'MALFORMED_TRACE');
  assert.equal(evaluate([f.client('x', [{ seq: 1, at: 1, action: '__proto__' }])]).clients[0].reasonCodes[0], 'MALFORMED_TRACE');
});

test('NaN and infinite numbers anywhere reject the whole set: no numerator and no percentage', () => {
  const holes = [
    f.request(NaN, 10, 'r1', f.OLD), f.request(1, Infinity, 'r1', f.OLD), f.request(1, -Infinity, 'r1', f.OLD),
    f.ack(2, 14, 'r1', f.V1, NaN), f.state(1, 10, NaN), f.request(1, 10, 'r1', Infinity), f.state(1, 10, -0)
  ];
  for (const event of holes) {
    const report = evaluate([f.transitioned('a'), f.client('b', [event])]);
    assert.deepEqual([report.valid, report.code, report.clients.length, rate(report), report.successRate.percent],
      [false, 'FINITE_OWN_JSON_REQUIRED', 0, [0, 0], null], JSON.stringify(event));
  }
});

test('every odd version spelling is a malformed trace, never a version, and never a transition', () => {
  const odd = ['2', '2.0', '2.0.0 ', ' 2.0.0', '2.0.0\n', 'v2', 'V2.0.0', '2.0.0-rc.1', '\uFF12.\uFF10.\uFF10', '2.0.0\u0000', '1.0.0.0', '1.0', 2, 2.0, 1, true, null, [], {}];
  const build = {
    request: (version) => [f.request(1, 10, 'r1', version)],
    state: (version) => [f.state(1, 10, version)],
    ack: (version) => [f.request(1, 10, 'r1', f.OLD), { ...f.ack(2, 14, 'r1', f.V1, 12), version }]
  };
  for (const [place, make] of Object.entries(build)) {
    for (const version of odd) {
      const report = evaluate([f.transitioned('a'), f.client('b', make(version))]);
      const row = report.clients[1];
      assert.equal(report.valid, true, `${place} ${JSON.stringify(version)}`);
      assert.deepEqual([row.classification, row.reasonCodes, row.eligible, row.startVersion, row.countsInNumerator],
        ['FAILED_OR_UNKNOWN', ['MALFORMED_TRACE'], true, null, false], `${place} ${JSON.stringify(version)}`);
      assert.deepEqual(rate(report), [1, 2], `${place} ${JSON.stringify(version)}`);
    }
  }
});

test('mixed version, stamp and acknowledgment pairings are rejected with their own code', () => {
  const cases = [
    ['an old request answered with a new-version acknowledgment', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V2, 12)], 'ACK_VERSION_MISMATCH'],
    ['a new request answered with an old-version acknowledgment', [f.request(1, 10, 'r1', f.NEW), f.ack(2, 14, 'r1', f.V1, 12)], 'ACK_VERSION_MISMATCH'],
    ['a new acknowledgment carrying the old stamp', [f.request(1, 10, 'r1', f.NEW), { ...f.ack(2, 14, 'r1', f.V2, 12), deploymentStamp: f.V1.deploymentStamp }], 'STAMP_MISMATCH'],
    ['an old acknowledgment carrying the new stamp', [f.request(1, 10, 'r1', f.OLD), { ...f.ack(2, 14, 'r1', f.V1, 12), deploymentStamp: f.V2.deploymentStamp }], 'STAMP_MISMATCH'],
    ['an acknowledgment issued after it was received', [f.request(1, 10, 'r1', f.OLD), f.ack(2, 14, 'r1', f.V1, 15)], 'ACK_ISSUED_AFTER_RECEIPT']
  ];
  for (const [name, events, code] of cases) {
    const row = evaluate([f.transitioned('a'), f.client('b', events)]).clients[1];
    assert.deepEqual([row.classification, row.reasonCodes[0], row.countsInNumerator], ['FAILED_OR_UNKNOWN', code, false], name);
  }
});

test('size limits reject deterministically: a bounded refusal, never a crash or a partial rate', () => {
  const pairs = (clientId, count) => f.client(clientId, Array.from({ length: count }, (_, index) => (index % 2 ?
    f.ack(index + 1, 10 + index, `r${index}`, f.V1, 10 + index) : f.request(index + 1, 10 + index, `r${index + 1}`, f.OLD))));
  const wide = Array.from({ length: 512 }, (_, index) => pairs(`wide-${index}`, 12));
  const accepted = evaluate(wide);
  assert.deepEqual([accepted.valid, accepted.counts.clients, rate(accepted)], [true, 512, [0, 512]]);
  assert.equal(evaluate([...wide, pairs('one-more', 2)]).code, 'FLEET_SCHEMA');
  const tall = Array.from({ length: 512 }, (_, index) => pairs(`tall-${index}`, 64));
  assert.equal(evaluate(tall).code, 'BOUNDED_JSON_REQUIRED');
  assert.equal(evaluate([f.client('long', Array.from({ length: 65 }, (_, index) => f.hold(index + 1, index)))]).clients[0].reasonCodes[0], 'MALFORMED_TRACE');
  assert.equal(evaluate([f.client('x'.repeat(65), [])]).clients[0].clientId, 'invalid-client-1');
  assert.equal(evaluate([f.client('x', [f.request(1, 1, 'q'.repeat(513), f.OLD)])]).code, 'BOUNDED_JSON_REQUIRED');
  assert.equal(evaluate([f.client('x', [f.request(1, 1, 'q'.repeat(81), f.OLD)])]).clients[0].reasonCodes[0], 'MALFORMED_TRACE');
});

test('duplicate client identifiers: identical copies collapse to one client, any difference is conflicting', () => {
  const original = f.transitioned('dup', 0);
  const reordered = JSON.parse(JSON.stringify({ events: original.events.map((event) => Object.fromEntries(Object.entries(event).reverse())), clientId: 'dup' }));
  const copies = evaluate(Array.from({ length: 512 }, () => JSON.parse(JSON.stringify(original))));
  assert.deepEqual([copies.counts.clients, copies.counts.duplicateCopiesCollapsed, copies.clients[0].traceCopies, rate(copies)], [1, 511, 512, [1, 1]]);
  assert.deepEqual(rate(evaluate([original, reordered])), [1, 1], 'key order is not a difference');
  const changed = JSON.parse(JSON.stringify(original));
  changed.events[4].at += 1;
  const mixed = evaluate([original, JSON.parse(JSON.stringify(original)), changed]);
  assert.deepEqual([mixed.clients[0].classification, mixed.clients[0].reasonCodes, mixed.clients[0].traceCopies, mixed.clients[0].eligible, rate(mixed)],
    ['FAILED_OR_UNKNOWN', ['CONFLICTING_DUPLICATE_TRACES'], 3, true, [0, 1]]);
  const withMalformed = evaluate([original, { ...JSON.parse(JSON.stringify(original)), events: 'none' }]);
  assert.deepEqual([withMalformed.clients[0].reasonCodes, rate(withMalformed)], [['CONFLICTING_DUPLICATE_TRACES'], [0, 1]]);
  assert.deepEqual(evaluate([original, f.stillOld('other'), original]).clients.map((row) => row.clientId), ['dup', 'other']);
});
