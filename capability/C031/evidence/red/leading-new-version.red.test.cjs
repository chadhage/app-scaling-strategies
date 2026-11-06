'use strict';

// Increment RED (archived as run-3 before the fix): a replayed new-version event placed FIRST in the trace of a client that is
// really on the old version must not take it out of the eligible denominator, because that would raise the success rate.
// The code under test is the byte-exact pre-fix evaluator archived beside this file; the GREEN replay sets C031_GREEN_REPLAY=1
// to run the same assertions, unchanged, against the real evaluator.
const test = require('node:test');
const assert = require('node:assert/strict');
const subject = process.env.C031_GREEN_REPLAY === '1' ? require('..\\..\\evaluator.js') : require('.\\evaluator.before-run3.js');

const V1 = { version: '1.0.0', deploymentStamp: 'C020-loopback-v1-r1' };
const V2 = { version: '2.0.0', deploymentStamp: 'C020-loopback-v2-r1' };
const request = (seq, at, requestId, version) => ({ seq, at, action: 'REQUEST', requestId, version });
const acknowledged = (seq, at, requestId, stamp, issuedAt) => ({
  seq, at, action: 'ACK', requestId, version: stamp.version, deploymentStamp: stamp.deploymentStamp, issuedAt
});
const state = (seq, at, version) => ({ seq, at, action: 'STATE', version });
const fleet = (id, clients) => ({ schema: 'C031-fleet/1', id, clients });
const transitioned = (clientId) => ({ clientId, events: [request(1, 10, 'r1', '1.0.0'), acknowledged(2, 14, 'r1', V1, 12),
  request(3, 20, 'r2', '2.0.0'), acknowledged(4, 24, 'r2', V2, 22), state(5, 30, '2.0.0')] });
const stillOld = (clientId) => ({ clientId, events: [request(1, 10, 'r1', '1.0.0'), acknowledged(2, 14, 'r1', V1, 12)] });
const withLeading = (clientId, first) => ({ clientId, events: [first,
  ...stillOld(clientId).events.map((event) => ({ ...event, seq: event.seq + 1, at: event.at + 5 }))] });
const rateOf = (report) => [report.successRate.numerator, report.successRate.denominator];

test('a stuck old-version client with a leading replayed new-version request stays eligible and cannot raise the rate', () => {
  assert.deepEqual(rateOf(subject.evaluateFleet(fleet('red-base', [transitioned('a'), stillOld('b')]))), [1, 2]);
  const replayed = subject.evaluateFleet(fleet('red-lead-request', [transitioned('a'), withLeading('b', request(1, 1, 'x1', '2.0.0'))]));
  assert.equal(replayed.clients[1].classification, 'FAILED_OR_UNKNOWN');
  assert.equal(replayed.clients[1].eligible, true, 'The client has old-version traffic: it stays in the denominator.');
  assert.deepEqual(rateOf(replayed), [1, 2]);
});

test('a leading new-version state in the trace of a stuck old-version client cannot raise the rate either', () => {
  const replayed = subject.evaluateFleet(fleet('red-lead-state', [transitioned('a'), withLeading('b', state(1, 1, '2.0.0'))]));
  assert.equal(replayed.clients[1].eligible, true);
  assert.deepEqual(rateOf(replayed), [1, 2]);
});

test('a client with only new-version traffic stays outside the denominator, defective or not', () => {
  const defective = { clientId: 'n', events: [request(1, 10, 'r1', '2.0.0'), acknowledged(2, 14, 'r1', V2, 12), acknowledged(3, 15, 'r1', V2, 12)] };
  const evaluated = subject.evaluateFleet(fleet('red-new-only', [transitioned('a'), stillOld('b'), defective]));
  assert.equal(evaluated.clients[2].classification, 'FAILED_OR_UNKNOWN');
  assert.equal(evaluated.clients[2].eligible, false);
  assert.deepEqual(rateOf(evaluated), [1, 2]);
});
