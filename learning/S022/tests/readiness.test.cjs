"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("..\\readiness.js");
const copy = (value) => JSON.parse(JSON.stringify(value));

function config(dependency, condition, policy = "cache-optional") {
  const input = copy(model.DEFAULT_CONFIG);
  input.policy = policy;
  if (dependency) input.conditions[dependency] = condition;
  return input;
}

test("all four connections succeed; only three are required in the fallback policy", () => {
  const result = model.evaluate(config(), "ADMIT");
  assert.equal(result.readiness, "SUCCESS");
  assert.equal(result.permittedDecision, "ADMIT");
  assert.equal(result.verifier, "PASS");
  assert.deepEqual(result.counts, { success: 4, failure: 0, unknown: 0 });
  assert.equal(result.requiredPassed, 3);
  assert.equal(result.requiredTotal, 3);
});

for (const dependency of ["database", "messaging", "service"]) {
  test(`disconnected required ${dependency} blocks without disturbing protected capacity`, () => {
    const result = model.evaluate(config(dependency, "disconnected"), "HOLD");
    assert.equal(result.readiness, "FAILURE");
    assert.equal(result.permittedDecision, "HOLD");
    assert.equal(result.verifier, "PASS");
    assert.deepEqual(result.counts, { success: 3, failure: 1, unknown: 0 });
    assert.equal(result.requiredPassed, 2);
    assert.equal(result.protectedCapacity, 4);
  });
}

test("optional disconnected cache is visible degradation, not a blanket capacity veto", () => {
  const result = model.evaluate(config("cache", "disconnected"), "ADMIT");
  assert.equal(result.readiness, "SUCCESS");
  assert.equal(result.permittedDecision, "ADMIT");
  assert.equal(result.verifier, "PASS");
  assert.equal(result.optionalDegraded, true);
  assert.deepEqual(result.counts, { success: 3, failure: 1, unknown: 0 });
  assert.equal(result.requiredPassed, 3);
});

test("the named cache-required workload gates on the same cache outage", () => {
  const result = model.evaluate(config("cache", "disconnected", "cache-required"), "HOLD");
  assert.equal(result.readiness, "FAILURE");
  assert.equal(result.permittedDecision, "HOLD");
  assert.equal(result.requiredTotal, 4);
  assert.equal(result.requiredPassed, 3);
  assert.equal(result.optionalDegraded, false);
});

for (const condition of ["unknown", "missing", "stale"]) {
  test(`required ${condition} evidence is UNKNOWN, never success or known failure`, () => {
    const result = model.evaluate(config("database", condition), "HOLD");
    assert.equal(result.readiness, "UNKNOWN");
    assert.equal(result.permittedDecision, "HOLD");
    assert.equal(result.verifier, "PASS");
    assert.deepEqual(result.counts, { success: 3, failure: 0, unknown: 1 });
    assert.equal(result.checks.find((entry) => entry.id === "database")?.condition, condition);
  });
}

test("optional unknown cache stays non-gating while uncertainty remains countable", () => {
  const result = model.evaluate(config("cache", "unknown"), "ADMIT");
  assert.equal(result.readiness, "SUCCESS");
  assert.deepEqual(result.counts, { success: 3, failure: 0, unknown: 1 });
  assert.equal(result.optionalDegraded, true);
});

test("a wrong prediction fails the verifier, not the admission guard", () => {
  const result = model.evaluate(config("messaging", "disconnected"), "ADMIT");
  assert.equal(result.verifier, "FAIL");
  assert.equal(result.permittedDecision, "HOLD");
  assert.equal(result.readiness, "FAILURE");
});

test("known failure wins readiness classification but does not erase unknown checks", () => {
  const input = config("database", "disconnected");
  input.conditions.messaging = "missing";
  const result = model.evaluate(input, "HOLD");
  assert.equal(result.readiness, "FAILURE");
  assert.deepEqual(result.counts, { success: 2, failure: 1, unknown: 1 });
});

test("each of the four checks and each trace event is explicitly synthetic", () => {
  const result = model.evaluate(config(), "ADMIT");
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every((entry) => entry.mode === "synthetic"));
  assert.ok(result.trace.length >= 8);
  assert.ok(result.trace.every((entry) => entry.mode === "synthetic"));
  assert.equal(result.mode, "synthetic");
  assert.equal(result.userImpact, "UNMEASURED");
});

test("stale connectivity has age 30001, not a fresh successful observation", () => {
  const result = model.evaluate(config("database", "stale"), "HOLD");
  const row = result.checks.find((entry) => entry.id === "database");
  assert.equal(row?.ageMs, 30001);
  assert.equal(row?.outcome, "unknown");
});

for (const [name, mutate] of [
  ["unknown policy", (input) => { input.policy = "make-everything-optional"; }],
  ["unknown condition", (input) => { input.conditions.database = "probably"; }],
  ["missing required dependency", (input) => { delete input.conditions.database; }],
  ["extra dependency", (input) => { input.conditions.telemetry = "connected"; }],
  ["coerced condition", (input) => { input.conditions.database = true; }],
  ["extra required override", (input) => { input.required = []; }]
]) {
  test(`strict input guards reject ${name} without mutating input`, () => {
    const input = config();
    mutate(input);
    const before = copy(input);
    assert.throws(() => model.evaluate(input, "ADMIT"), /Invalid configuration/);
    assert.deepEqual(input, before);
  });
}

test("invalid prediction cannot default to a successful answer", () => {
  assert.throws(() => model.evaluate(config(), "admit"), /Invalid prediction/);
});

test("checking records an immutable snapshot; changing config invalidates its revision", () => {
  const initial = model.createSession();
  const checked = model.check(initial, "ADMIT");
  assert.equal(initial.history.length, 0);
  assert.equal(checked.history.length, 1);
  assert.equal(checked.history[0]?.result.verifier, "PASS");
  const changed = model.configure(checked, config("database", "disconnected"));
  assert.equal(changed.revision, checked.revision + 1);
  assert.deepEqual(changed.history, checked.history);
  assert.notEqual(changed.history.at(-1)?.revision, changed.revision);
});

test("failure and unknown results remain retained rather than being replaced by later success", () => {
  let state = model.configure(model.createSession(), config("database", "disconnected"));
  state = model.check(state, "HOLD");
  state = model.configure(state, config("database", "missing"));
  state = model.check(state, "HOLD");
  state = model.configure(state, config());
  state = model.check(state, "ADMIT");
  assert.deepEqual(state.history.map((entry) => entry.result.readiness),
    ["FAILURE", "UNKNOWN", "SUCCESS"]);
  assert.deepEqual(state.history.map((entry) => entry.runId), [1, 2, 3]);
});

test("the ninth check rejects without evicting any of eight retained runs", () => {
  let state = model.createSession();
  for (let index = 0; index < model.MAX_RUNS; index++) state = model.check(state, "ADMIT");
  assert.equal(state.history.length, 8);
  const before = copy(state);
  assert.throws(() => model.check(state, "ADMIT"), /History limit/);
  assert.deepEqual(state, before);
});

test("forged state is rejected rather than silently reinitialized", () => {
  const bad = model.createSession();
  bad.revision = -1;
  assert.throws(() => model.check(bad, "ADMIT"), /Invalid session/);
});

test("tampered recorded results cannot certify a forged successful history", () => {
  const state = copy(model.check(model.createSession(), "ADMIT"));
  assert.equal(state.history.length, 1);
  state.history[0].result.permittedDecision = "HOLD";
  assert.throws(() => model.configure(state, config()), /Invalid session/);
});

test("default state is local, unchecked and independent between resets", () => {
  const first = model.createSession();
  const checked = model.check(first, "ADMIT");
  const reset = model.createSession();
  assert.equal(checked.history.length, 1);
  assert.deepEqual(reset, first);
  assert.equal(reset.history.length, 0);
  assert.notEqual(reset.config, first.config);
});

test("the optional-cache policy never makes a failed database fallback acceptable", () => {
  const input = config("cache", "disconnected");
  input.conditions.database = "disconnected";
  const result = model.evaluate(input, "ADMIT");
  assert.equal(result.readiness, "FAILURE");
  assert.equal(result.verifier, "FAIL");
  assert.equal(result.permittedDecision, "HOLD");
  assert.deepEqual(result.counts, { success: 2, failure: 2, unknown: 0 });
});

for (const condition of ["unknown", "missing", "stale"]) {
  test(`cache-required ${condition} evidence is gating`, () => {
    const result = model.evaluate(config("cache", condition, "cache-required"), "HOLD");
    assert.equal(result.readiness, "UNKNOWN");
    assert.equal(result.requiredTotal, 4);
    assert.equal(result.requiredPassed, 3);
    assert.equal(result.permittedDecision, "HOLD");
  });
}

for (const [name, bad] of [
  ["null", null], ["array", []], ["string", "connected"], ["boolean", true],
  ["null prototype", Object.create(null)]
]) {
  test(`non-schema configuration is rejected (${name})`, () => {
    assert.throws(() => model.evaluate(bad, "ADMIT"), /Invalid configuration/);
  });
}

test("getters, inherited dependencies, symbol properties and prototype overrides are rejected", () => {
  const getter = config();
  Object.defineProperty(getter.conditions, "database", { get() { throw new Error("Getter executed"); } });
  assert.throws(() => model.evaluate(getter, "ADMIT"), /Invalid configuration/);
  const inherited = config();
  Object.setPrototypeOf(inherited.conditions, { database: "connected" });
  assert.throws(() => model.evaluate(inherited, "ADMIT"), /Invalid configuration/);
  const symbol = config();
  symbol[Symbol("policy")] = "cache-optional";
  assert.throws(() => model.evaluate(symbol, "ADMIT"), /Invalid configuration/);
  const override = JSON.parse('{"policy":"cache-optional","conditions":{"database":"connected","cache":"connected","messaging":"connected","service":"connected"},"__proto__":{}}');
  assert.throws(() => model.evaluate(override, "ADMIT"), /Invalid configuration/);
});

test("session guards reject holes, extras, unsupported versions and out-of-bounds revisions", () => {
  for (const mutate of [
    (state) => { state.history = new Array(1); },
    (state) => { state.history.extra = "forged"; },
    (state) => { state.schemaVersion = 2; },
    (state) => { state.revision = "0"; },
    (state) => { state.revision = Number.NaN; },
    (state) => { state.revision = 65; },
    (state) => { state.success = true; }
  ]) {
    const state = model.createSession();
    mutate(state);
    assert.throws(() => model.check(state, "ADMIT"), /Invalid session/);
  }
});

test("record identities, outcomes and configuration cannot be overwritten by a caller", () => {
  const checked = model.check(model.createSession(), "ADMIT");
  for (const mutate of [
    (state) => { state.history[0].runId = 0; },
    (state) => { state.history[0].revision = 1; },
    (state) => { state.history[0].result.counts.failure = 1; },
    (state) => { state.history[0].config.conditions.database = "missing"; },
    (state) => { state.config.conditions.database = "missing"; },
    (state) => { state.history[0].result.trace.length = 1000000; }
  ]) {
    const state = copy(checked);
    mutate(state);
    assert.throws(() => model.configure(state, config()), /Invalid session/);
  }
});

test("64 configuration edits are bounded; unchanged configuration does not consume an edit", () => {
  let state = model.createSession();
  assert.equal(model.configure(state, config()).revision, 0);
  for (let index = 0; index < model.MAX_EDITS; index++) {
    state = model.configure(state, config("cache", index % 2 === 0 ? "disconnected" : "connected"));
  }
  assert.equal(state.revision, 64);
  assert.equal(model.configure(state, state.config).revision, 64);
  const before = copy(state);
  assert.throws(() => model.configure(state, config("cache", "unknown")), /Edit limit/);
  assert.deepEqual(state, before);
});

test("model calculations are deterministic, do not mutate inputs and do not alias earlier records", () => {
  const input = config("database", "unknown");
  const before = copy(input);
  assert.deepEqual(model.evaluate(input, "HOLD"), model.evaluate(input, "HOLD"));
  assert.deepEqual(input, before);
  const initial = model.configure(model.createSession(), input);
  const first = model.check(initial, "HOLD");
  const second = model.check(first, "HOLD");
  second.history[0].config.conditions.database = "connected";
  assert.equal(first.history[0].config.conditions.database, "unknown");
  assert.equal(first.history.length, 1);
});

test("shared defaults are deeply frozen while reset returns independent usable state", () => {
  assert.ok(Object.isFrozen(model.DEFAULT_CONFIG));
  assert.ok(Object.isFrozen(model.DEFAULT_CONFIG.conditions));
  assert.throws(() => { model.DEFAULT_CONFIG.conditions.database = "missing"; }, TypeError);
  const state = model.createSession();
  state.config.conditions.database = "missing";
  assert.equal(model.createSession().config.conditions.database, "connected");
});
