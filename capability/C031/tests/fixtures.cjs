'use strict';

// Pure builders for fictional client traces. Shared by the tests and the deterministic saved-bundle generator.
const OLD = '1.0.0';
const NEW = '2.0.0';
const V1 = Object.freeze({ version: OLD, deploymentStamp: 'C020-loopback-v1-r1' });
const V2 = Object.freeze({ version: NEW, deploymentStamp: 'C020-loopback-v2-r1' });
const request = (seq, at, requestId, version) => ({ seq, at, action: 'REQUEST', requestId, version });
const ack = (seq, at, requestId, stamp, issuedAt) => ({
  seq, at, action: 'ACK', requestId, version: stamp.version, deploymentStamp: stamp.deploymentStamp, issuedAt
});
const state = (seq, at, version) => ({ seq, at, action: 'STATE', version });
const hold = (seq, at) => ({ seq, at, action: 'HOLD' });
const resume = (seq, at) => ({ seq, at, action: 'RESUME' });
const failedReply = (seq, at, requestId, replyCode) => ({ seq, at, action: 'FAILED_REPLY', requestId, replyCode });
const interrupted = (seq, at, cause) => ({ seq, at, action: 'INTERRUPTED', cause });
const fleet = (id, clients) => ({ schema: 'C031-fleet/1', id, clients });
const client = (clientId, events) => ({ clientId, events });

// v1 request, v1 reply, v2 request, acknowledged v2 reply, then state at v2.
const transitioned = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12),
  request(3, t + 20, 'r2', NEW), ack(4, t + 24, 'r2', V2, t + 22), state(5, t + 30, NEW)]);
const transitionedWithHold = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12), hold(3, t + 15), resume(4, t + 60),
  request(5, t + 61, 'r2', NEW), ack(6, t + 66, 'r2', V2, t + 63),
  request(7, t + 70, 'r3', NEW), ack(8, t + 74, 'r3', V2, t + 72)]);
const stillOld = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12),
  request(3, t + 20, 'r2', OLD), ack(4, t + 24, 'r2', V1, t + 22)]);
const inFlightOld = (clientId, t = 0) => client(clientId, [request(1, t + 10, 'r1', OLD)]);
const acknowledgedNotUsed = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12),
  request(3, t + 20, 'r2', NEW), ack(4, t + 24, 'r2', V2, t + 22)]);
const failedOld = (clientId, t = 0) => client(clientId, [request(1, t + 10, 'r1', OLD), failedReply(2, t + 14, 'r1', 'UNKNOWN_PROFILE')]);
const interruptedOld = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12), interrupted(3, t + 20, 'INTERRUPTED_BY_RESET')]);
const unchanged = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', NEW), ack(2, t + 14, 'r1', V2, t + 12), state(3, t + 20, NEW)]);
const unchangedBusy = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', NEW), ack(2, t + 14, 'r1', V2, t + 12), request(3, t + 20, 'r2', NEW), ack(4, t + 24, 'r2', V2, t + 22)]);
// A v1 client that replays a v2 request with no server acknowledgment of the new version.
const replayedV2Request = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12), request(3, t + 20, 'r2', NEW)]);
const stateWithoutAcknowledgment = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12), request(3, t + 20, 'r2', NEW), state(4, t + 22, NEW)]);
// The v2 acknowledgment was issued at t+15, long before its request at t+400: a stale cached copy.
const staleCachedAcknowledgment = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12),
  request(3, t + 400, 'r2', NEW), ack(4, t + 405, 'r2', V2, t + 15), state(5, t + 410, NEW)]);
const duplicatedAcknowledgment = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12), request(3, t + 20, 'r2', NEW),
  ack(4, t + 24, 'r2', V2, t + 22), ack(5, t + 25, 'r2', V2, t + 22), state(6, t + 30, NEW)]);
const acknowledgmentBeforeRequest = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12), ack(3, t + 20, 'r2', V2, t + 20),
  request(4, t + 24, 'r2', NEW), state(5, t + 30, NEW)]);
const nonMonotonicTime = (clientId, t = 0) => client(clientId, [
  request(1, t + 50, 'r1', OLD), ack(2, t + 40, 'r1', V1, t + 45), request(3, t + 60, 'r2', NEW),
  ack(4, t + 64, 'r2', V2, t + 62), state(5, t + 70, NEW)]);
const reorderedSequence = (clientId, t = 0) => client(clientId, [
  request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12), request(3, t + 20, 'r2', NEW),
  state(5, t + 30, NEW), ack(4, t + 24, 'r2', V2, t + 22)]);

const baselineClients = () => [
  transitioned('client-001', 0), transitionedWithHold('client-002', 100), transitioned('client-003', 300),
  stillOld('client-004', 400), inFlightOld('client-005', 500), acknowledgedNotUsed('client-006', 600),
  failedOld('client-007', 700), interruptedOld('client-008', 800),
  unchanged('new-001', 900), unchangedBusy('new-002', 1000)];
const floodClients = (count) => Array.from({ length: count }, (_, index) =>
  (index % 2 ? unchangedBusy : unchanged)(`flood-${String(index + 1).padStart(3, '0')}`, 2000 + index * 50));

const savedFleets = () => {
  const base = baselineClients();
  const make = (id, role, label, extra) => ({ id, role, negativeOf: role === 'baseline' ? null : 'fleet-baseline', label,
    fleet: fleet(id, [...base, ...extra]) });
  const duplicate = JSON.parse(JSON.stringify(base[0]));
  const conflicting = transitioned('client-004', 400);
  return [
    make('fleet-baseline', 'baseline', 'Baseline fleet: ten fictional clients, two of them started on the new version', []),
    make('negative-unchanged-flood', 'negative', 'Flood: forty more clients that only ever used the new version', floodClients(40)),
    make('negative-replayed-v2-request', 'negative', 'Replay: v1 clients send a v2 request with no acknowledged new version',
      [replayedV2Request('replayed-001', 3000), stateWithoutAcknowledgment('replayed-002', 3100)]),
    make('negative-duplicated-trace', 'negative', 'Duplicates: an exact copy, a conflicting second trace and a duplicated acknowledgment',
      [duplicate, conflicting, duplicatedAcknowledgment('duplicate-001', 3200)]),
    make('negative-stale-cached-ack', 'negative', 'Stale: a v2 acknowledgment issued long before its request',
      [staleCachedAcknowledgment('stale-001', 3300)]),
    make('negative-out-of-order', 'negative', 'Out of order: acknowledgment first, time going backwards, reordered sequence',
      [acknowledgmentBeforeRequest('order-001', 3400), nonMonotonicTime('order-002', 3500), reorderedSequence('order-003', 3600)])
  ];
};

module.exports = Object.freeze({
  OLD, NEW, V1, V2, request, ack, state, hold, resume, failedReply, interrupted, fleet, client,
  transitioned, transitionedWithHold, stillOld, inFlightOld, acknowledgedNotUsed, failedOld, interruptedOld, unchanged, unchangedBusy,
  replayedV2Request, stateWithoutAcknowledgment, staleCachedAcknowledgment, duplicatedAcknowledgment, acknowledgmentBeforeRequest,
  nonMonotonicTime, reorderedSequence, baselineClients, floodClients, savedFleets
});
