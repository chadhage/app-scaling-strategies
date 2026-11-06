'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const subject = require('./evaluator.stub.cjs');

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
const unchanged = (clientId) => ({ clientId, events: [request(1, 10, 'r1', '2.0.0'), acknowledged(2, 14, 'r1', V2, 12),
  state(3, 20, '2.0.0')] });
const stillOld = (clientId) => ({ clientId, events: [request(1, 10, 'r1', '1.0.0'), acknowledged(2, 14, 'r1', V1, 12)] });
const replayed = (clientId) => ({ clientId, events: [request(1, 10, 'r1', '1.0.0'), acknowledged(2, 14, 'r1', V1, 12),
  request(3, 20, 'r2', '2.0.0')] });

test('a flood of unchanged new-version clients cannot raise the migration success rate', () => {
  const baseline = subject.evaluateFleet(fleet('red-baseline', [transitioned('a'), stillOld('b'), replayed('c')]));
  assert.deepEqual(baseline.successRate, { numerator: 1, denominator: 3 });
  const flooded = subject.evaluateFleet(fleet('red-flood', [transitioned('a'), stillOld('b'), replayed('c'),
    ...['u1', 'u2', 'u3', 'u4', 'u5'].map(unchanged)]));
  assert.equal(flooded.counts.unchanged, 5, 'The unchanged clients must be visible as UNCHANGED.');
  assert.deepEqual(flooded.successRate, { numerator: 1, denominator: 3 },
    'Unchanged clients add nothing to the numerator and are not eligible, so the denominator stays 3.');
});

test('a replayed new-version request without an acknowledged version is not a transition', () => {
  const evaluated = subject.evaluateFleet(fleet('red-replay', [replayed('c')]));
  assert.equal(evaluated.clients[0].classification, 'FAILED_OR_UNKNOWN');
  assert.equal(evaluated.successRate.numerator, 0);
  assert.equal(evaluated.counts.failedOrUnknown, 1);
});

test('each client is exactly one of four classes recomputed from its ordered actions', () => {
  const evaluated = subject.evaluateFleet(fleet('red-classes', [transitioned('a'), unchanged('b'), stillOld('c'), replayed('d')]));
  assert.deepEqual(evaluated.clients.map((client) => [client.clientId, client.classification]), [
    ['a', 'ACTUAL_TRANSITION'], ['b', 'UNCHANGED'], ['c', 'NOT_TRANSITIONED_YET'], ['d', 'FAILED_OR_UNKNOWN']
  ]);
});
