"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createState, evaluate, recordRun } = require("../startup.js");
const defaults = { pullTicks: 2, startupTicks: 2, fault: "none", observeTick: 3, prediction: "HOLD" };
const configuration = (changes = {}) => ({ ...defaults, ...changes });
const copy = (value) => JSON.parse(JSON.stringify(value));

test("slow image pull keeps every observation and request on GA", () => {
  const result = evaluate(configuration({ pullTicks: 3, observeTick: 1 }));
  assert.equal(result.permission, "HOLD");
  assert.equal(result.candidateOutcome, "UNKNOWN");
  assert.equal(result.verifier, "PASS");
  assert.deepEqual(result.checks, { success: 0, failure: 0, unknown: 2 });
  assert.equal(result.trace.length, 2);
  assert.ok(result.trace.every((row) => row.phase === "PULLING" && row.serving === "ga-v1" && !row.ready));
  assert.deepEqual(result.traffic, { old: 6, candidate: 0, success: 6, failure: 0, unknown: 0 });
});

test("successful image pull cannot precede completed initialization", () => {
  const result = evaluate(configuration({ pullTicks: 1, startupTicks: 3, observeTick: 3 }));
  assert.equal(result.permission, "HOLD");
  assert.equal(result.candidateOutcome, "UNKNOWN");
  assert.deepEqual(result.checks, { success: 1, failure: 0, unknown: 1 });
  assert.equal(result.trace.at(-1).phase, "INITIALIZING");
  assert.equal(result.traffic.old, 12);
  assert.equal(result.traffic.candidate, 0);
});

test("readiness begins at the exact successful initialization boundary", () => {
  const result = evaluate(configuration({ observeTick: 4, prediction: "ALLOW" }));
  assert.equal(result.candidateOutcome, "SUCCESS");
  assert.equal(result.permission, "ALLOW");
  assert.equal(result.verifier, "PASS");
  assert.deepEqual(result.checks, { success: 2, failure: 0, unknown: 0 });
  assert.equal(result.trace.length, 5);
  assert.ok(result.trace.slice(0, -1).every((row) => !row.ready && row.serving === "ga-v1"));
  assert.equal(result.trace.at(-1).serving, "candidate-v2");
  assert.deepEqual(result.traffic, { old: 12, candidate: 3, success: 15, failure: 0, unknown: 0 });
  assert.match(result.image, /^candidate-v2@sha256:b{64}$/);
});

test("an already ready candidate waits until the operator's selected handoff tick", () => {
  const result = evaluate(configuration({ pullTicks: 1, startupTicks: 1, observeTick: 6, prediction: "ALLOW" }));
  assert.equal(result.traffic.old, 18);
  assert.equal(result.traffic.candidate, 3);
  assert.ok(result.trace.slice(0, -1).every((row) => row.serving === "ga-v1"));
  assert.ok(result.trace.slice(2).every((row) => row.ready));
});

test("failed immutable image pull is visible without candidate admissions", () => {
  const result = evaluate(configuration({ fault: "pull-failure", observeTick: 2 }));
  assert.equal(result.candidateOutcome, "FAILURE");
  assert.equal(result.permission, "HOLD");
  assert.deepEqual(result.checks, { success: 0, failure: 1, unknown: 1 });
  assert.equal(result.trace.at(-1).phase, "PULL FAILED");
  assert.equal(result.traffic.old, 9);
  assert.equal(result.traffic.candidate, 0);
  assert.equal(result.traffic.failure, 0, "Startup failure is not a fabricated user interruption.");
});

test("container startup failure remains ineligible after successful pull", () => {
  const result = evaluate(configuration({ fault: "startup-failure", observeTick: 4 }));
  assert.equal(result.candidateOutcome, "FAILURE");
  assert.equal(result.permission, "HOLD");
  assert.deepEqual(result.checks, { success: 1, failure: 1, unknown: 0 });
  assert.equal(result.trace.at(-1).phase, "STARTUP FAILED");
  assert.equal(result.traffic.old, 15);
  assert.equal(result.traffic.candidate, 0);
});

test("a future injected failure is not evidence before its observed boundary", () => {
  for (const fault of ["pull-failure", "startup-failure"]) {
    const result = evaluate(configuration({ fault, observeTick: 1 }));
    assert.equal(result.candidateOutcome, "UNKNOWN");
    assert.deepEqual(result.checks, { success: 0, failure: 0, unknown: 2 });
  }
});

test("missing candidate observations stay UNKNOWN even after ample synthetic time", () => {
  const result = evaluate(configuration({ fault: "unobserved", observeTick: 6 }));
  assert.equal(result.candidateOutcome, "UNKNOWN");
  assert.equal(result.permission, "HOLD");
  assert.deepEqual(result.checks, { success: 0, failure: 0, unknown: 2 });
  assert.ok(result.trace.every((row) => row.phase === "OBSERVATION MISSING" && !row.ready));
  assert.deepEqual(result.traffic, { old: 21, candidate: 0, success: 21, failure: 0, unknown: 0 });
});

test("wrong prediction fails the verifier without bypassing the readiness guard", () => {
  const result = evaluate(configuration({ prediction: "ALLOW" }));
  assert.equal(result.verifier, "FAIL");
  assert.equal(result.permission, "HOLD");
  assert.equal(result.traffic.candidate, 0);
  assert.equal(evaluate(configuration({ observeTick: 4 })).verifier, "FAIL");
});

test("correctly predicting HOLD on a failure passes the answer, not the migration", () => {
  const result = evaluate(configuration({ fault: "pull-failure", observeTick: 6 }));
  assert.equal(result.verifier, "PASS");
  assert.equal(result.candidateOutcome, "FAILURE");
  assert.equal(result.traffic.candidate, 0);
});

test("all 504 finite configurations preserve timing, traffic and outcome invariants", () => {
  for (let pullTicks = 1; pullTicks <= 3; pullTicks++) {
    for (let startupTicks = 1; startupTicks <= 3; startupTicks++) {
      for (let observeTick = 0; observeTick <= 6; observeTick++) {
        for (const fault of ["none", "pull-failure", "startup-failure", "unobserved"]) {
          for (const prediction of ["HOLD", "ALLOW"]) {
            const result = evaluate({ pullTicks, startupTicks, observeTick, fault, prediction });
            const ready = fault === "none" && observeTick >= pullTicks + startupTicks;
            const failed = (fault === "pull-failure" && observeTick >= pullTicks)
              || (fault === "startup-failure" && observeTick >= pullTicks + startupTicks);
            assert.equal(result.candidateOutcome, ready ? "SUCCESS" : failed ? "FAILURE" : "UNKNOWN");
            assert.equal(result.permission, ready ? "ALLOW" : "HOLD");
            assert.equal(result.verifier, prediction === result.permission ? "PASS" : "FAIL");
            assert.equal(result.trace.length, observeTick + 1);
            assert.equal(result.checks.success + result.checks.failure + result.checks.unknown, 2);
            assert.equal(result.traffic.success, 3 * (observeTick + 1));
            assert.equal(result.traffic.old + result.traffic.candidate, result.traffic.success);
            assert.equal(result.traffic.candidate, ready ? 3 : 0);
            for (const row of result.trace) {
              assert.equal(row.ready, fault === "none" && row.tick >= pullTicks + startupTicks);
              assert.equal(row.serving, ready && row.tick === observeTick ? "candidate-v2" : "ga-v1");
              assert.equal(row.oldSuccess + row.candidateSuccess, 3);
            }
          }
        }
      }
    }
  }
});

test("evaluation is deterministic, independent and does not mutate configuration", () => {
  const input = Object.freeze(configuration());
  const first = evaluate(input);
  const second = evaluate(input);
  assert.deepEqual(first, second);
  first.trace[0].serving = "forged";
  assert.notEqual(second.trace[0].serving, "forged");
  assert.deepEqual(input, defaults);
});

test("numeric controls reject coercion, fractions and out-of-bounds values", () => {
  for (const field of ["pullTicks", "startupTicks", "observeTick"]) {
    for (const value of ["2", null, undefined, true, NaN, Infinity, -1, 1.5, 7]) {
      assert.throws(() => evaluate(configuration({ [field]: value })), /Invalid configuration/);
    }
  }
  for (const field of ["pullTicks", "startupTicks"]) {
    for (const value of [0, 4]) assert.throws(() => evaluate(configuration({ [field]: value })), /Invalid configuration/);
  }
});

test("configuration rejects unknown enums and missing or extra keys", () => {
  for (const fault of ["", "NONE", "unknown", "none ", {}, null]) {
    assert.throws(() => evaluate(configuration({ fault })), /Invalid configuration/);
  }
  for (const prediction of ["", "hold", "ADMIT", true, null]) {
    assert.throws(() => evaluate(configuration({ prediction })), /Invalid configuration/);
  }
  for (const key of Object.keys(defaults)) {
    const input = configuration();
    delete input[key];
    assert.throws(() => evaluate(input), /Invalid configuration/);
  }
  for (const input of [null, [], "none", { ...defaults, image: "mutable:latest" }]) {
    assert.throws(() => evaluate(input), /Invalid configuration/);
  }
});

test("configuration rejects prototypes, symbols and accessors without invoking getters", () => {
  let getterCalls = 0;
  const accessor = configuration();
  Object.defineProperty(accessor, "fault", { enumerable: true, get() { getterCalls++; return "none"; } });
  const symbol = configuration();
  symbol[Symbol("extra")] = "none";
  for (const input of [Object.assign(Object.create({ extra: 1 }), defaults), symbol, accessor]) {
    assert.throws(() => evaluate(input), /Invalid configuration/);
  }
  assert.equal(getterCalls, 0);
});

test("initial state is empty, versioned and independently allocated", () => {
  assert.deepEqual(createState(), { version: 1, runs: [] });
  assert.notEqual(createState().runs, createState().runs);
});

test("history retains failure, unknown and success with their original configurations", () => {
  let state = createState();
  for (const changes of [{ fault: "pull-failure", observeTick: 2 }, {}, { observeTick: 4, prediction: "ALLOW" }]) {
    state = recordRun(state, configuration(changes));
  }
  assert.deepEqual(state.runs.map((run) => run.result.candidateOutcome), ["FAILURE", "UNKNOWN", "SUCCESS"]);
  assert.deepEqual(state.runs.map((run) => run.id), [1, 2, 3]);
  assert.equal(state.runs[0].configuration.fault, "pull-failure");
  assert.equal(state.runs[2].configuration.observeTick, 4);
});

test("recording copies inputs and previous history instead of sharing mutable records", () => {
  const input = configuration();
  const empty = createState();
  const first = recordRun(empty, input);
  input.observeTick = 6;
  assert.equal(first.runs[0].configuration.observeTick, 3);
  const saved = copy(first);
  const second = recordRun(first, configuration({ observeTick: 4, prediction: "ALLOW" }));
  second.runs[0].result.trace[0].phase = "forged";
  assert.deepEqual(first, saved);
  assert.equal(empty.runs.length, 0);
});

test("eight runs fit and the ninth is rejected without silent eviction or mutation", () => {
  let state = createState();
  for (let index = 0; index < 8; index++) state = recordRun(state, configuration());
  const saved = copy(state);
  assert.equal(state.runs.length, 8);
  assert.throws(() => recordRun(state, configuration()), /History limit/);
  assert.deepEqual(state, saved);
});

test("state guards reject wrong schema, identity, version and array shape", () => {
  const valid = recordRun(createState(), configuration());
  const wrongId = copy(valid);
  wrongId.runs[0].id = 2;
  const sparse = { version: 1, runs: new Array(1) };
  const extraArray = copy(valid);
  extraArray.runs.extra = true;
  for (const state of [null, [], {}, { version: 2, runs: [] }, { version: 1, runs: [], extra: true },
    { version: 1, runs: {} }, wrongId, sparse, extraArray]) {
    assert.throws(() => recordRun(state, configuration()), /Invalid state/);
  }
});

test("state guards reject forged historical results and changed configurations", () => {
  const valid = recordRun(createState(), configuration());
  const alteredResult = copy(valid);
  alteredResult.runs[0].result.permission = "ALLOW";
  const alteredTrace = copy(valid);
  alteredTrace.runs[0].result.trace[0].serving = "candidate-v2";
  const alteredConfiguration = copy(valid);
  alteredConfiguration.runs[0].configuration.observeTick = 6;
  const addedResultField = copy(valid);
  addedResultField.runs[0].result.liveAzure = true;
  for (const state of [alteredResult, alteredTrace, alteredConfiguration, addedResultField]) {
    assert.throws(() => recordRun(state, configuration()), /Invalid state/);
  }
});

test("state accessors and prototype overrides are rejected without executing getters", () => {
  let getterCalls = 0;
  const accessor = { version: 1 };
  Object.defineProperty(accessor, "runs", { enumerable: true, get() { getterCalls++; return []; } });
  assert.throws(() => recordRun(accessor, configuration()), /Invalid state/);
  assert.throws(() => recordRun(Object.assign(Object.create({ unsafe: true }), createState()), configuration()), /Invalid state/);
  assert.equal(getterCalls, 0);
});
