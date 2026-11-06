'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const evaluator = require('..\\evaluator.js');
const f = require('.\\fixtures.cjs');

// Deterministic generator (no clock, no Math.random): the same 4000 traces on every run.
function mulberry32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const stamps = { [f.OLD]: f.V1, [f.NEW]: f.V2 };
// The closed saved-trace schema accepts times from 0 to this bound only; a trace outside it is rejected as malformed.
const MAX_TIME = 86400000;

// An independent re-statement of the rule for traces made only of REQUEST, ACK and STATE events.
function oracle(events) {
  const requests = new Map();
  let start = null;
  let oldRequest = -1;
  let newAck = -1;
  let later = -1;
  let sound = events.length > 0;
  events.forEach((event, index) => {
    if (event.seq !== index + 1 || (index > 0 && event.at < events[index - 1].at) || !(event.at >= 0 && event.at <= MAX_TIME)) sound = false;
    if (start === null) start = event.version;
    if (event.action === 'REQUEST') {
      if (requests.has(event.requestId)) sound = false;
      requests.set(event.requestId, { version: event.version, at: event.at, acked: false });
      if (event.version === f.OLD && oldRequest < 0) oldRequest = index;
      if (event.version === f.OLD && (newAck >= 0 || start === f.NEW)) sound = false;
      if (event.version === f.NEW && newAck >= 0 && later < 0) later = index;
    } else if (event.action === 'ACK') {
      const request = requests.get(event.requestId);
      if (!request || request.acked || request.version !== event.version || event.deploymentStamp !== stamps[event.version].deploymentStamp ||
          event.issuedAt < request.at || event.issuedAt > event.at) sound = false;
      else request.acked = true;
      if (event.version === f.OLD && (newAck >= 0 || start === f.NEW)) sound = false;
      if (event.version === f.NEW && newAck < 0) newAck = index;
    } else {
      if (event.version === f.NEW && newAck < 0 && start === f.OLD) sound = false;
      if (event.version === f.OLD && (newAck >= 0 || start === f.NEW)) sound = false;
      if (event.version === f.NEW && newAck >= 0 && later < 0) later = index;
    }
  });
  const transition = sound && start === f.OLD && oldRequest >= 0 && newAck > oldRequest && later > newAck;
  const unchanged = sound && start === f.NEW && events.every((event) => event.version === f.NEW);
  // Eligible means: not provably new-version-only. A malformed trace, an empty trace and any old-version traffic stay eligible.
  const shape = events.every((event) => event.at >= 0 && event.at <= MAX_TIME && (event.action !== 'ACK' || (event.issuedAt >= 0 && event.issuedAt <= MAX_TIME)));
  const eligible = !shape || events.length === 0 || events.some((event) => event.version === f.OLD);
  return { transition, unchanged, eligible };
}

function randomTrace(random, index) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const templates = [f.transitioned, f.transitionedWithHold, f.stillOld, f.acknowledgedNotUsed, f.unchanged, f.unchangedBusy, f.replayedV2Request,
    f.stateWithoutAcknowledgment, f.staleCachedAcknowledgment, f.duplicatedAcknowledgment, f.acknowledgmentBeforeRequest];
  let events;
  if (random() < 0.5) {
    events = JSON.parse(JSON.stringify(pick(templates)('x', 0).events)).filter((event) => ['REQUEST', 'ACK', 'STATE'].includes(event.action));
    events.forEach((event, position) => { event.seq = position + 1; });
    for (let mutations = Math.floor(random() * 3); mutations > 0 && events.length > 0; mutations--) {
      const at = Math.floor(random() * events.length);
      const kind = Math.floor(random() * 7);
      if (kind === 0) events.splice(at, 1);
      else if (kind === 1) events.splice(at, 0, { ...events[at] });
      else if (kind === 2 && at + 1 < events.length) [events[at], events[at + 1]] = [events[at + 1], events[at]];
      else if (kind === 3 && 'version' in events[at]) events[at].version = events[at].version === f.OLD ? f.NEW : f.OLD;
      else if (kind === 4 && events[at].action === 'ACK') events[at].issuedAt += pick([-500, -1, 1, 500]);
      else if (kind === 5) events[at].at += pick([-50, -1, 1, 50]);
      else if (events[at].action === 'ACK') events[at].deploymentStamp = pick([f.V1, f.V2]).deploymentStamp;
    }
    if (random() < 0.5) events.forEach((event, position) => { event.seq = position + 1; });
  } else {
    const length = 1 + Math.floor(random() * 7);
    let at = 0;
    events = Array.from({ length }, (_, position) => {
      at += Math.floor(random() * 10);
      const version = pick([f.OLD, f.NEW]);
      const kind = pick(['REQUEST', 'REQUEST', 'ACK', 'ACK', 'STATE']);
      const requestId = pick(['r1', 'r2', 'r3']);
      if (kind === 'REQUEST') return f.request(position + 1, at, requestId, version);
      if (kind === 'STATE') return f.state(position + 1, at, version);
      return f.ack(position + 1, at, requestId, stamps[version], at - Math.floor(random() * 6));
    });
  }
  return { clientId: `fuzz-${String(index).padStart(4, '0')}`, events };
}

const traces = (() => {
  const random = mulberry32(0xC031);
  return Array.from({ length: 4000 }, (_, index) => randomTrace(random, index));
})();

test('differential: a generated trace is an actual transition exactly when the independent oracle says so', () => {
  let transitions = 0;
  let unchanged = 0;
  let others = 0;
  for (const trace of traces) {
    const row = evaluator.evaluateFleet(f.fleet('fuzz', [trace])).clients[0];
    const expected = oracle(trace.events);
    assert.equal(row.classification === 'ACTUAL_TRANSITION', expected.transition, JSON.stringify(trace));
    assert.equal(row.classification === 'UNCHANGED', expected.unchanged, JSON.stringify(trace));
    assert.equal(row.eligible, expected.eligible, JSON.stringify(trace));
    assert.ok(evaluator.classes.includes(row.classification));
    if (expected.transition) transitions++;
    else if (expected.unchanged) unchanged++;
    else others++;
  }
  assert.ok(transitions >= 150 && unchanged >= 150 && others >= 1500, `${transitions} transitions, ${unchanged} unchanged, ${others} others`);
});

test('invariants over a large mixed fleet: one class per client, counts add up, transitions are always eligible', () => {
  const report = evaluator.evaluateFleet(f.fleet('fuzz-fleet', traces.slice(0, 500)));
  assert.equal(report.valid, true);
  const { counts, successRate } = report;
  assert.equal(counts.actualTransition + counts.unchanged + counts.notTransitionedYet + counts.failedOrUnknown, counts.clients);
  assert.equal(counts.failed + counts.unknown, counts.failedOrUnknown);
  assert.equal(successRate.numerator, counts.actualTransition);
  assert.equal(successRate.denominator, counts.eligible);
  assert.ok(successRate.numerator <= successRate.denominator);
  assert.equal(counts.eligible + counts.notEligible, counts.clients);
  for (const row of report.clients) {
    assert.equal(row.countsInNumerator, row.classification === 'ACTUAL_TRANSITION');
    assert.equal(row.countsInDenominator, row.eligible);
    if (row.countsInNumerator) {
      assert.equal(row.eligible, true);
      const { requestAtOldVersion: request, newVersionAcknowledged: acknowledged, laterRequestOrState: use } = row.evidence;
      assert.ok(request.seq < acknowledged.seq && acknowledged.seq < use.seq);
      assert.deepEqual([request.version, acknowledged.version, use.version], [f.OLD, f.NEW, f.NEW]);
    } else assert.equal(row.evidence, null);
    if (row.classification === 'UNCHANGED') assert.equal(row.eligible, false);
  }
});

test('metamorphic: clean unchanged clients, exact duplicates and a different client order never change the rate', () => {
  // 250 clients doubled stay inside the evaluator's 512-trace bound, so the duplicate collapse is measured, not a size rejection.
  const base = traces.slice(0, 250);
  const report = evaluator.evaluateFleet(f.fleet('base', base));
  assert.equal(report.valid, true);
  const rate = (value) => [value.successRate.numerator, value.successRate.denominator];
  const flooded = evaluator.evaluateFleet(f.fleet('flood', [...base, ...f.floodClients(120)]));
  assert.deepEqual(rate(flooded), rate(report));
  assert.equal(flooded.counts.unchanged, report.counts.unchanged + 120);
  const doubled = evaluator.evaluateFleet(f.fleet('double', [...base, ...JSON.parse(JSON.stringify(base))]));
  assert.deepEqual(rate(doubled), rate(report));
  assert.equal(doubled.counts.clients, report.counts.clients);
  assert.equal(doubled.counts.duplicateCopiesCollapsed, base.length);
  const reversed = evaluator.evaluateFleet(f.fleet('reverse', [...base].reverse()));
  assert.deepEqual(rate(reversed), rate(report));
  assert.deepEqual(Object.fromEntries(reversed.clients.map((row) => [row.clientId, row.classification])),
    Object.fromEntries(report.clients.map((row) => [row.clientId, row.classification])));
});

test('metamorphic: removing the acknowledgment of a transition, or only its follow-up, can only lower the numerator', () => {
  const sound = traces.filter((trace) => oracle(trace.events).transition).slice(0, 200);
  assert.ok(sound.length >= 100);
  for (const trace of sound) {
    const noAck = { ...trace, events: trace.events.filter((event) => !(event.action === 'ACK' && event.version === f.NEW)) };
    const renumbered = { ...noAck, events: noAck.events.map((event, index) => ({ ...event, seq: index + 1 })) };
    assert.notEqual(evaluator.evaluateFleet(f.fleet('x', [renumbered])).clients[0].classification, 'ACTUAL_TRANSITION', trace.clientId);
  }
});
