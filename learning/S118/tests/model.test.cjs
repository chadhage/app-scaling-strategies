"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Rehearsal, parseBudget, listFixtures, BANNER } = require("..\\model.js");

function complete(rehearsal, fixture = "preserved", budgetSeconds = 5) {
  rehearsal.recordMutation({ fixture, budgetSeconds });
  rehearsal.failover();
  rehearsal.retry();
  return rehearsal.measure();
}

function unchanged(rehearsal, action, message) {
  const before = rehearsal.snapshot();
  assert.throws(action, message);
  assert.deepEqual(rehearsal.snapshot(), before);
}

test("A-S118: rerouting the mutating journey preserves exactly one effect and identity/state", () => {
  const rehearsal = new Rehearsal();
  rehearsal.recordMutation({ fixture: "preserved", budgetSeconds: 5 });
  rehearsal.failover();
  rehearsal.retry();
  const result = rehearsal.measure();
  assert.equal(result.outcome, "positive");
  assert.equal(result.observedOrigin, "origin-B");
  assert.equal(result.effectCount, 1);
  assert.equal(result.identityPreserved, true);
  assert.equal(result.sessionPreserved, true);
  assert.equal(result.statePreserved, true);
  assert.equal(result.recoveryMs, 3000);
  assert.equal(result.budgetMs, 5000);
});

test("lost original acknowledgement is visible, but no verdict exists before measurement", () => {
  const rehearsal = new Rehearsal();
  rehearsal.recordMutation({ fixture: "preserved", budgetSeconds: 5 });
  assert.equal(rehearsal.snapshot().active.mutation.acknowledgement, "lost");
  assert.equal(rehearsal.snapshot().result, null);
  rehearsal.failover();
  assert.equal(rehearsal.snapshot().result, null);
  rehearsal.retry();
  assert.equal(rehearsal.snapshot().result, null);
  assert.equal(rehearsal.measure().outcome, "positive");
});

const negatives = [
  ["duplicate", "Exactly one committed effect", (result) => assert.equal(result.effectCount, 2)],
  ["identity-lost", "Identity continuity", (result) => assert.equal(result.identityPreserved, false)],
  ["session-lost", "Session continuity", (result) => {
    assert.equal(result.sessionPreserved, false);
    assert.equal(result.statePreserved, false);
  }],
  ["route-pending", "Observed alternate origin", (result) => {
    assert.equal(result.desiredOrigin, "origin-B");
    assert.equal(result.observedOrigin, "origin-A");
  }],
  ["late", "Supported fictional recovery budget", (result) => assert.equal(result.recoveryMs, 8000)],
  ["unavailable", "Alternate journey failure", (result) => {
    assert.equal(result.failure, "alternate-origin-unavailable");
    assert.equal(result.observedOrigin, null);
    assert.equal(result.identityPreserved, null);
    assert.equal(result.recoveryMs, null);
  }],
];

for (const [fixture, breach, inspect] of negatives) {
  test(`fixed ${fixture} observations produce a measured negative, never a success`, () => {
    const result = complete(new Rehearsal(), fixture);
    assert.equal(result.outcome, "negative");
    assert.equal(result.checks.find((item) => item.name === breach).outcome, "negative");
    assert.equal(result.nativeSourceAcceptance, "unverified");
    inspect(result);
  });
}

test("missing effect, acknowledgement and recovery measurements remain unknown, not inferred loss", () => {
  const result = complete(new Rehearsal(), "unconfirmed");
  assert.equal(result.outcome, "unknown");
  assert.equal(result.effectCount, null);
  assert.equal(result.acknowledgement, "unknown");
  assert.equal(result.recoveryMs, null);
  assert.equal(result.observedOrigin, "origin-B");
  assert.equal(result.checks.find((item) => item.name === "Exactly one committed effect").outcome, "unknown");
  assert.equal(result.checks.some((item) => item.outcome === "negative"), false);
});

test("a declared budget is compared to fixed recovery data, including its exact boundary", () => {
  assert.equal(complete(new Rehearsal(), "preserved", 3).outcome, "positive");
  assert.equal(complete(new Rehearsal(), "preserved", 2).outcome, "negative");
  assert.equal(complete(new Rehearsal(), "late", 8).outcome, "positive");
  assert.equal(complete(new Rehearsal(), "late", 7).outcome, "negative");
});

test("canonical textual budgets reject coercion, whitespace, exponent and fractional forms", () => {
  for (let value = 1; value <= 10; value++) assert.equal(parseBudget(String(value)), value);
  for (const value of ["", "0", "11", "05", "+5", "-5", "5.0", "1e0", "0x5", " 5", "5 ",
    "5\n", "5\r\n", "5\u2028", "Infinity", "NaN", "five", 5, true, null, undefined, [], {},
    new String("5")]) {
    assert.throws(() => parseBudget(value), /canonical whole number/);
  }
});

test("configuration is exactly typed plain data; invalid input cannot append observations", () => {
  const rehearsal = new Rehearsal();
  const valid = { fixture: "preserved", budgetSeconds: 5 };
  const invalid = [null, undefined, [], "preserved", Object.create(valid), Object.assign(Object.create(null), valid),
    {}, { ...valid, fixture: "__proto__" }, { ...valid, fixture: "toString" }, { ...valid, fixture: 1 },
    { ...valid, budgetSeconds: "5" }, { ...valid, budgetSeconds: true }, { ...valid, budgetSeconds: NaN },
    { ...valid, budgetSeconds: Infinity }, { ...valid, budgetSeconds: 1.5 },
    { ...valid, budgetSeconds: 0 }, { ...valid, budgetSeconds: 11 }, { ...valid, extra: false },
    { ...valid, [Symbol("extra")]: 1 }];
  const getterInput = { budgetSeconds: 5 };
  Object.defineProperty(getterInput, "fixture", { enumerable: true, get() { throw new Error("must not execute getter"); } });
  invalid.push(getterInput);
  for (const input of invalid) unchanged(rehearsal, () => rehearsal.recordMutation(input), TypeError);
  unchanged(rehearsal, () => rehearsal.recordMutation(valid, "extra"), /exactly one/);
});

test("phase guards reject skipped, repeated and argument-bearing actions without changing state", () => {
  const rehearsal = new Rehearsal();
  unchanged(rehearsal, () => rehearsal.failover(), /requires phase mutated/);
  unchanged(rehearsal, () => rehearsal.retry(), /requires phase rerouted/);
  unchanged(rehearsal, () => rehearsal.measure(), /requires phase retried/);
  unchanged(rehearsal, () => rehearsal.reset(), /No active journey/);
  rehearsal.recordMutation({ fixture: "preserved", budgetSeconds: 5 });
  unchanged(rehearsal, () => rehearsal.recordMutation({ fixture: "duplicate", budgetSeconds: 5 }), /requires phase idle/);
  unchanged(rehearsal, () => rehearsal.retry(), /requires phase rerouted/);
  unchanged(rehearsal, () => rehearsal.failover("origin-B"), /accepts no arguments/);
  unchanged(rehearsal, () => rehearsal.reset(true), /accepts no arguments/);
  rehearsal.failover();
  unchanged(rehearsal, () => rehearsal.failover(), /requires phase mutated/);
  unchanged(rehearsal, () => rehearsal.measure(), /requires phase retried/);
  unchanged(rehearsal, () => rehearsal.retry({}), /accepts no arguments/);
  rehearsal.retry();
  unchanged(rehearsal, () => rehearsal.measure("positive"), /accepts no arguments/);
  rehearsal.measure();
  unchanged(rehearsal, () => rehearsal.measure(), /requires phase retried/);
});

test("reset retains complete measurements and supports partial-run reset without form reset shadowing", () => {
  const rehearsal = new Rehearsal();
  const result = complete(rehearsal, "duplicate");
  const prior = rehearsal.snapshot().history;
  rehearsal.reset();
  const snapshot = rehearsal.snapshot();
  assert.equal(snapshot.phase, "idle");
  assert.equal(snapshot.active, null);
  assert.equal(snapshot.result, null);
  assert.deepEqual(snapshot.history.slice(0, 4), prior);
  assert.deepEqual(snapshot.history[3].observation, result);
  assert.equal(snapshot.history[4].observation.historyRetained, true);
  rehearsal.recordMutation({ fixture: "preserved", budgetSeconds: 5 });
  rehearsal.reset();
  assert.equal(rehearsal.snapshot().history.length, 7);
  assert.equal(rehearsal.snapshot().runCount, 2);
});

test("four journeys exhaust the bound without silently evicting or rewriting retained history", () => {
  const rehearsal = new Rehearsal();
  for (let run = 0; run < 4; run++) {
    complete(rehearsal);
    rehearsal.reset();
  }
  assert.equal(rehearsal.snapshot().history.length, 20);
  assert.equal(rehearsal.snapshot().history[0].sequence, 1);
  assert.equal(rehearsal.snapshot().history[19].sequence, 20);
  unchanged(rehearsal, () => rehearsal.recordMutation({ fixture: "preserved", budgetSeconds: 5 }), /History is full|Four fictional/);
});

test("snapshots, results and the fixture catalog are deeply immutable data", () => {
  const rehearsal = new Rehearsal();
  const result = complete(rehearsal);
  const snapshot = rehearsal.snapshot();
  assert.throws(() => { result.checks[0].observed.retry = "origin-A"; }, TypeError);
  assert.throws(() => { snapshot.active.retry.effectCount = 2; }, TypeError);
  assert.throws(() => snapshot.history.pop(), TypeError);
  assert.throws(() => { listFixtures()[0].id = "unconfirmed"; }, TypeError);
  assert.equal(rehearsal.snapshot().result.outcome, "positive");
  assert.equal(rehearsal.snapshot().active.retry.effectCount, 1);
});

test("every bounded fixture is deterministic, fictional and distinct from native source acceptance", () => {
  assert.equal(BANNER, "Training rehearsal - synthetic data - not a live Azure result");
  assert.equal(listFixtures().length, 8);
  for (const fixture of listFixtures()) {
    const left = new Rehearsal();
    const right = new Rehearsal();
    assert.deepEqual(complete(left, fixture.id), complete(right, fixture.id));
    assert.deepEqual(left.snapshot(), right.snapshot());
    for (const entry of left.snapshot().history) assert.equal(entry.observation.dataKind, "fixed-fictional-teaching-data");
  }
});
