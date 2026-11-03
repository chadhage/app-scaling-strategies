"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("..\\readiness.js");
const config = (changes = {}) => ({ ...model.DEFAULTS, ...changes });
const clone = (value) => JSON.parse(JSON.stringify(value));
const histories = (count) => ({
  version: 1, history: Array.from({ length: count }, (_, index) => ({ id: index + 1, configuration: config() }))
});

test("the stub is loadable and evaluation has a real result surface", () => {
  assert.equal(typeof model.evaluate, "function");
  assert.equal(typeof model.recordRun, "function");
  assert.equal(typeof model.evaluate(config()), "object");
  assert.equal(model.MAX_HISTORY, 8);
});

test("flapping green is rejected despite the unsafe single-green comparison", () => {
  const actual = model.evaluate(config());
  assert.equal(actual.readiness, "FAILURE");
  assert.deepEqual(actual.checks, { success: 2, failure: 1, unknown: 0 });
  assert.equal(actual.streak, 2);
  assert.equal(actual.decision, "HOLD");
  assert.equal(actual.comparison, "ALLOW");
  assert.equal(actual.candidateAdmissions, 0);
  assert.equal(actual.route, "ga-v1");
  assert.equal(actual.verifier, "PASS");
});

test("steady fresh evidence allows exactly one final synthetic admission", () => {
  const actual = model.evaluate(config({ fixture: "steady", prediction: "ALLOW" }));
  assert.equal(actual.readiness, "SUCCESS");
  assert.deepEqual(actual.checks, { success: 3, failure: 0, unknown: 0 });
  assert.equal(actual.streak, 3);
  assert.equal(actual.decision, "ALLOW");
  assert.equal(actual.candidateAdmissions, 1);
  assert.equal(actual.route, "candidate-v2");
  assert.equal(actual.verifier, "PASS");
});

test("recovery requires the whole selected consecutive window", () => {
  const three = model.evaluate(config({ fixture: "recovered", prediction: "ALLOW" }));
  assert.equal(three.readiness, "SUCCESS");
  const four = model.evaluate(config({ fixture: "recovered", windowSize: 4, freshnessTicks: 3, prediction: "ALLOW" }));
  assert.deepEqual(four.checks, { success: 3, failure: 1, unknown: 0 });
  assert.equal(four.readiness, "FAILURE");
  assert.equal(four.decision, "HOLD");
  assert.equal(four.verifier, "FAIL");
});

test("unknown probes remain in the denominator instead of being skipped", () => {
  const actual = model.evaluate(config({ fixture: "missing" }));
  assert.equal(actual.readiness, "UNKNOWN");
  assert.deepEqual(actual.checks, { success: 2, failure: 0, unknown: 1 });
  assert.equal(actual.streak, 1);
  assert.equal(actual.comparison, "ALLOW");
  assert.equal(actual.decision, "HOLD");
});

test("stale green samples cannot promote and their age is visible", () => {
  const actual = model.evaluate(config({ fixture: "steady", observationTick: 9 }));
  assert.deepEqual(actual.checks, { success: 0, failure: 0, unknown: 3 });
  assert.equal(actual.readiness, "UNKNOWN");
  assert.equal(actual.comparison, "ALLOW");
  assert.equal(actual.decision, "HOLD");
  assert.equal(actual.trace.at(-1).latestAge, 3);
  assert.equal(actual.trace.at(-1).probe, "no-new-sample");
});

test("every selected probe must be fresh, not merely the newest one", () => {
  const staleMember = model.evaluate(config({ fixture: "steady", observationTick: 7 }));
  assert.deepEqual(staleMember.checks, { success: 2, failure: 0, unknown: 1 });
  assert.equal(staleMember.readiness, "UNKNOWN");
  const allFresh = model.evaluate(config({ fixture: "steady", observationTick: 7, freshnessTicks: 3 }));
  assert.equal(allFresh.readiness, "SUCCESS");
});

test("one early success cannot borrow future observations", () => {
  const actual = model.evaluate(config({ fixture: "steady", observationTick: 1 }));
  assert.deepEqual(actual.checks, { success: 1, failure: 0, unknown: 2 });
  assert.equal(actual.readiness, "UNKNOWN");
  assert.equal(actual.trace.length, 1);
  assert.equal(actual.trace[0].tick, 1);
});

test("a fresh failure wins over an incomplete window without inventing success", () => {
  const actual = model.evaluate(config({ observationTick: 2, windowSize: 4, freshnessTicks: 3 }));
  assert.deepEqual(actual.checks, { success: 1, failure: 1, unknown: 2 });
  assert.equal(actual.readiness, "FAILURE");
  assert.equal(actual.decision, "HOLD");
});

test("wrong operator predictions fail independently and cannot force traffic", () => {
  const actual = model.evaluate(config({ prediction: "ALLOW" }));
  assert.equal(actual.verifier, "FAIL");
  assert.equal(actual.decision, "HOLD");
  assert.equal(actual.candidateAdmissions, 0);
});

test("recovered final success retains earlier failed probes and holds", () => {
  const actual = model.evaluate(config({ fixture: "recovered" }));
  assert.equal(actual.readiness, "SUCCESS");
  assert.equal(actual.trace.length, 6);
  assert.equal(actual.trace[2].probe, "failure");
  assert.equal(actual.trace[2].decision, "HOLD");
  assert.equal(actual.trace[5].decision, "ALLOW");
});

test("all 648 finite configurations match an independent window oracle", () => {
  const fixtures = {
    flapping: ["success", "failure", "success", "failure", "success", "success"],
    steady: ["success", "success", "success", "success", "success", "success"],
    recovered: ["failure", "success", "failure", "success", "success", "success"],
    missing: ["success", "success", "success", "success", "unknown", "success"]
  };
  let checked = 0;
  for (const [fixture, probes] of Object.entries(fixtures)) {
    for (const windowSize of [2, 3, 4]) for (const freshnessTicks of [2, 3, 4]) {
      for (let observationTick = 1; observationTick <= 9; observationTick++) {
        for (const prediction of ["HOLD", "ALLOW"]) {
          const input = config({ fixture, windowSize, freshnessTicks, observationTick, prediction });
          const before = clone(input);
          const actual = model.evaluate(input);
          const latest = Math.min(observationTick, probes.length);
          const checks = { success: 0, failure: 0, unknown: 0 };
          for (let offset = 0; offset < windowSize; offset++) {
            const tick = latest - offset;
            const status = tick < 1 || observationTick - tick > freshnessTicks ? "unknown" : probes[tick - 1];
            checks[status]++;
          }
          const readiness = checks.failure ? "FAILURE" : checks.unknown ? "UNKNOWN" : "SUCCESS";
          const decision = readiness === "SUCCESS" ? "ALLOW" : "HOLD";
          assert.deepEqual(actual.checks, checks, JSON.stringify(input));
          assert.equal(actual.readiness, readiness);
          assert.equal(actual.decision, decision);
          assert.equal(actual.comparison, probes[latest - 1] === "success" ? "ALLOW" : "HOLD");
          assert.equal(actual.verifier, prediction === decision ? "PASS" : "FAIL");
          assert.equal(actual.candidateAdmissions, decision === "ALLOW" ? 1 : 0);
          assert.equal(actual.trace.length, observationTick);
          assert.ok(actual.trace.every((row, index) => row.tick === index + 1));
          assert.deepEqual(input, before);
          assert.deepEqual(model.evaluate(input), actual);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 648);
});

test("configuration schemas reject omissions, extras, inherited fields and symbols", () => {
  const missing = config();
  delete missing.fixture;
  const inherited = Object.create(config());
  const withSymbol = { ...config(), [Symbol("hidden")]: true };
  for (const input of [null, [], "flapping", missing, { ...config(), extra: true }, inherited,
    Object.assign(Object.create(null), config()), withSymbol]) {
    assert.throws(() => model.evaluate(input), /configuration/i);
  }
});

test("numeric controls reject coercions, non-finite numbers and out-of-range values", () => {
  for (const [field, values] of Object.entries({
    windowSize: [1, 5, 2.5, "3", NaN, Infinity, null, true],
    freshnessTicks: [1, 5, 2.1, "2", NaN, -Infinity],
    observationTick: [0, 10, 1.5, "6", undefined]
  })) for (const value of values) assert.throws(() => model.evaluate(config({ [field]: value })), /configuration/i);
  for (const changes of [{ fixture: "other" }, { fixture: "__proto__" }, { prediction: "allow" }, { prediction: "" }]) {
    assert.throws(() => model.evaluate(config(changes)), /configuration/i);
  }
});

test("validation never invokes configuration or history accessors", () => {
  let invoked = false;
  const input = config();
  Object.defineProperty(input, "fixture", { enumerable: true, get() { invoked = true; return "steady"; } });
  assert.throws(() => model.evaluate(input), /configuration/i);
  const state = histories(1);
  Object.defineProperty(state.history, "0", { enumerable: true, get() { invoked = true; return null; } });
  assert.throws(() => model.recordRun(state, config()), /history/i);
  assert.equal(invoked, false);
});

test("new state is immutable and recording copies operator-owned input", () => {
  const first = model.initialState();
  assert.deepEqual(first, { version: 1, history: [] });
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.history));
  const input = config();
  const next = model.recordRun(first, input);
  assert.equal(next.history.length, 1);
  assert.equal(first.history.length, 0);
  assert.notEqual(next.history[0].configuration, input);
  input.fixture = "steady";
  assert.equal(next.history[0].configuration.fixture, "flapping");
  assert.ok(Object.isFrozen(next.history[0]));
  assert.ok(Object.isFrozen(next.history[0].configuration));
  assert.ok(Object.isFrozen(model.evaluate(next.history[0].configuration).trace));
});

test("eight runs retain configurations and failed predictions; a ninth never evicts", () => {
  let state = model.initialState();
  for (let index = 0; index < 8; index++) {
    const previous = clone(state);
    const next = model.recordRun(state, config({ prediction: index % 2 ? "HOLD" : "ALLOW" }));
    assert.deepEqual(state, previous);
    state = next;
  }
  assert.equal(state.history.length, 8);
  assert.deepEqual(state.history.map((run) => run.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(model.evaluate(state.history[0].configuration).verifier, "FAIL");
  assert.equal(model.evaluate(state.history[1].configuration).verifier, "PASS");
  const before = clone(state);
  assert.throws(() => model.recordRun(state, config()), /eight|8|full/i);
  assert.deepEqual(state, before);
});

test("malformed states and sparse, decorated or oversized histories are rejected", () => {
  const sparse = { version: 1, history: new Array(1) };
  const decorated = histories(1);
  decorated.history.extra = true;
  const symbol = histories(1);
  symbol.history[Symbol("x")] = true;
  for (const state of [null, [], {}, { version: 2, history: [] }, { version: 1, history: [], extra: 0 },
    { version: 1, history: {} }, sparse, decorated, symbol, histories(9),
    Object.assign(Object.create(null), histories(0))]) {
    assert.throws(() => model.recordRun(state, config()), /state|history/i);
  }
});

test("retained run identities and configurations cannot silently corrupt history", () => {
  const badId = histories(2);
  badId.history[1].id = 1;
  const extra = histories(1);
  extra.history[0].result = { decision: "ALLOW" };
  const badConfig = histories(1);
  badConfig.history[0].configuration.fixture = "forged";
  const hidden = histories(1);
  Object.defineProperty(hidden.history[0], "id", { value: 1, enumerable: false });
  for (const state of [badId, extra, badConfig, hidden]) {
    assert.throws(() => model.recordRun(state, config()), /history|configuration/i);
  }
});

test("invalid actions leave a valid history byte-for-byte unchanged", () => {
  const state = histories(1);
  const before = JSON.stringify(state);
  assert.throws(() => model.recordRun(state, config({ prediction: "force" })), /configuration/i);
  assert.equal(JSON.stringify(state), before);
});
