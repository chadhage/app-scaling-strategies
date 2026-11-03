"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("..\\warmup.js");
const config = (changes = {}) => ({ ...model.defaults, ...changes });
const copy = (value) => JSON.parse(JSON.stringify(value));

test("the stub is loadable and exposes the declared lesson surface", () => {
  assert.deepEqual(Object.keys(model).sort(), ["analyze", "defaults", "initialState", "recordRun", "validateState"]);
  for (const name of ["analyze", "initialState", "recordRun", "validateState"]) assert.equal(typeof model[name], "function");
  assert.deepEqual(model.defaults, {
    instances: 6, concurrency: 2, dbCapacity: 8, cacheCapacity: 6,
    initBudget: 8, observations: "complete"
  });
});

test("default comparison protects dependencies instead of only renaming concurrency", () => {
  const result = model.analyze(config());
  assert.equal(result.simultaneous.outcome, "FAILURE");
  assert.equal(result.bounded.outcome, "SUCCESS");
  assert.equal(result.simultaneous.durationTicks, 2);
  assert.equal(result.bounded.durationTicks, 6);
  assert.deepEqual(result.simultaneous.dependencies, {
    database: { capacity: 8, peakLoad: 16, overloadedTicks: 2 },
    cache: { capacity: 6, peakLoad: 10, overloadedTicks: 2 }
  });
  assert.deepEqual(result.bounded.dependencies, {
    database: { capacity: 8, peakLoad: 8, overloadedTicks: 0 },
    cache: { capacity: 6, peakLoad: 6, overloadedTicks: 0 }
  });
  assert.deepEqual(result.simultaneous.initialization, { attempted: 6, success: 0, failure: 6, unknown: 0 });
  assert.deepEqual(result.bounded.initialization, { attempted: 6, success: 6, failure: 0, unknown: 0 });
});

test("live journeys have separate honest denominators and latency budgets", () => {
  const result = model.analyze(config());
  assert.deepEqual(result.simultaneous.journeys, {
    attempted: 8, success: 0, failure: 8, unknown: 0, budgetMs: 100, maxLatencyMs: 250
  });
  assert.deepEqual(result.bounded.journeys, {
    attempted: 24, success: 24, failure: 0, unknown: 0, budgetMs: 100, maxLatencyMs: 50
  });
});

test("database overload is identified independently from cache", () => {
  const bounded = model.analyze(config({ concurrency: 3, cacheCapacity: 20 })).bounded;
  assert.equal(bounded.outcome, "FAILURE");
  assert.equal(bounded.dependencies.database.overloadedTicks, 4);
  assert.equal(bounded.dependencies.cache.overloadedTicks, 0);
  assert.deepEqual(bounded.trace[0].overloaded, ["database"]);
});

test("cache overload is identified independently from database", () => {
  const bounded = model.analyze(config({ concurrency: 3, dbCapacity: 24 })).bounded;
  assert.equal(bounded.outcome, "FAILURE");
  assert.deepEqual(bounded.trace[0].overloaded, ["cache"]);
});

test("dependency equality and initialization-budget equality are safe", () => {
  const bounded = model.analyze(config({ initBudget: 6 })).bounded;
  assert.equal(bounded.outcome, "SUCCESS");
  assert.equal(bounded.withinBudget, true);
  assert.ok(bounded.trace.every((row) => row.overloaded.length === 0));
});

test("concurrency one can protect journeys but miss the initialization budget", () => {
  const bounded = model.analyze(config({ concurrency: 1 })).bounded;
  assert.equal(bounded.outcome, "FAILURE");
  assert.equal(bounded.durationTicks, 12);
  assert.equal(bounded.withinBudget, false);
  assert.equal(bounded.initialization.success, 6);
  assert.equal(bounded.journeys.failure, 0);
  assert.equal(bounded.journeys.success, 48);
});

test("a partial last batch counts each candidate exactly once", () => {
  const bounded = model.analyze(config({ instances: 5 })).bounded;
  assert.equal(bounded.trace.length, 6);
  assert.deepEqual(bounded.trace.map((row) => row.active), [2, 2, 2, 2, 1, 1]);
  assert.deepEqual(bounded.trace.map((row) => row.completing), [0, 2, 0, 2, 0, 1]);
  assert.equal(bounded.initialization.success, 5);
  assert.equal(bounded.trace[4].databaseLoad, 6);
  assert.equal(bounded.trace[4].cacheLoad, 5);
});

test("later small batches do not erase earlier overload and failed initialization", () => {
  const bounded = model.analyze(config({ instances: 5, concurrency: 3 })).bounded;
  assert.equal(bounded.outcome, "FAILURE");
  assert.deepEqual(bounded.initialization, { attempted: 5, success: 2, failure: 3, unknown: 0 });
  assert.equal(bounded.journeys.failure, 8);
  assert.equal(bounded.journeys.success, 8);
  assert.deepEqual(bounded.trace.at(-1).overloaded, []);
});

test("missing observations remain UNKNOWN rather than inferred success or failure", () => {
  const report = model.analyze(config({ observations: "missing", initBudget: 2 }));
  for (const run of [report.simultaneous, report.bounded]) {
    assert.equal(run.outcome, "UNKNOWN");
    assert.equal(run.durationTicks, null);
    assert.equal(run.withinBudget, null);
    assert.equal(run.dependencies.database.peakLoad, null);
    assert.equal(run.dependencies.cache.overloadedTicks, null);
    assert.deepEqual(run.initialization, { attempted: 6, success: 0, failure: 0, unknown: 6 });
    assert.equal(run.journeys.unknown, run.plannedTicks * 4);
    assert.equal(run.journeys.maxLatencyMs, null);
    assert.ok(run.trace.every((row) => row.overloaded === null && row.databaseLoad === null && row.journeys.latencyMs === null));
  }
});

test("configuration numbers are bounded exact integers without coercion", () => {
  const invalid = [
    { instances: 1 }, { instances: 13 }, { concurrency: 0 }, { concurrency: 7 },
    { dbCapacity: 3 }, { dbCapacity: 25 }, { cacheCapacity: 3 }, { cacheCapacity: 21 },
    { initBudget: 1 }, { initBudget: 25 }, { observations: "healthy" }
  ];
  for (const field of ["instances", "concurrency", "dbCapacity", "cacheCapacity", "initBudget"]) {
    for (const value of ["6", NaN, Infinity, -Infinity, 2.5, null, true, undefined]) invalid.push({ [field]: value });
  }
  for (const change of invalid) assert.throws(() => model.analyze(config(change)), /configuration|integer|observations|concurrency/);
});

test("configuration rejects absent and extra fields, symbols, getters and prototype overrides", () => {
  const missing = config();
  delete missing.instances;
  const getter = config();
  Object.defineProperty(getter, "instances", { get() { throw new Error("getter must not execute"); }, enumerable: true });
  const nonEnumerable = config();
  Object.defineProperty(nonEnumerable, "instances", { value: 6, enumerable: false });
  for (const value of [
    null, [], "configuration", missing, config({ extra: 1 }),
    Object.assign(Object.create(null), config()),
    Object.assign(Object.create({ inherited: true }), config()),
    Object.assign(config(), { [Symbol("hidden")]: 1 }), getter, nonEnumerable
  ]) assert.throws(() => model.analyze(value), /configuration/);
});

test("repeated analysis is deterministic and does not mutate configuration", () => {
  const input = config();
  const before = copy(input);
  assert.deepEqual(model.analyze(input), model.analyze(input));
  assert.deepEqual(input, before);
});

test("recording a comparison checks the answer rather than forcing a successful run", () => {
  const state = model.recordRun(model.initialState(), config({ concurrency: 3 }), "SUCCESS");
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].verifier, "FAIL");
  assert.equal(state.runs[0].report.bounded.outcome, "FAILURE");
  assert.equal(state.nextId, 2);
  assert.equal(model.validateState(state), true);
});

test("expected negative and missing-observation answers can pass without claiming success", () => {
  for (const [changes, prediction] of [[{ concurrency: 3 }, "FAILURE"], [{ observations: "missing" }, "UNKNOWN"]]) {
    const state = model.recordRun(model.initialState(), config(changes), prediction);
    assert.equal(state.runs.length, 1);
    assert.equal(state.runs[0].verifier, "PASS");
    assert.equal(state.runs[0].report.bounded.outcome, prediction);
  }
});

test("history preserves failures, full configurations and traces after later success", () => {
  const first = model.recordRun(model.initialState(), config({ concurrency: 3 }), "SUCCESS");
  assert.equal(first.runs.length, 1);
  const saved = copy(first);
  const second = model.recordRun(first, config(), "SUCCESS");
  assert.deepEqual(first, saved);
  assert.equal(second.runs.length, 2);
  assert.deepEqual(second.runs[0], saved.runs[0]);
  assert.equal(second.runs[0].report.bounded.journeys.failure, 16);
  assert.equal(second.runs[1].verifier, "PASS");
});

test("recording copies operator inputs instead of retaining mutable configuration references", () => {
  const input = config();
  const state = model.recordRun(model.initialState(), input, "SUCCESS");
  assert.equal(state.runs.length, 1);
  input.dbCapacity = 24;
  assert.equal(state.runs[0].configuration.dbCapacity, 8);
});

test("eight comparisons fit and a ninth is rejected without eviction", () => {
  let state = model.initialState();
  for (let index = 0; index < 8; index++) state = model.recordRun(state, config(), "SUCCESS");
  assert.equal(state.runs.length, 8);
  const before = copy(state);
  assert.throws(() => model.recordRun(state, config(), "SUCCESS"), /eight|8|history/i);
  assert.deepEqual(state, before);
});

test("prediction is an exact enumerated value", () => {
  for (const answer of ["success", "", null, undefined, true, "PASS", {}, ["SUCCESS"]]) {
    assert.throws(() => model.recordRun(model.initialState(), config(), answer), /prediction/);
  }
});

test("state schema rejects invalid identities, sparse histories, extras and non-records", () => {
  const sparse = [];
  sparse.length = 1;
  for (const state of [
    null, [], {}, { nextId: 0, runs: [] }, { nextId: 2, runs: [] },
    { nextId: 1, runs: [], extra: true }, { nextId: 2, runs: sparse },
    { nextId: 1, runs: Object.assign([], { extra: true }) },
    { nextId: 10, runs: Array(9).fill({}) }
  ]) assert.throws(() => model.recordRun(state, config(), "SUCCESS"), /state|history|identity/);
});

test("forged prior result counts, traces, configuration and verdict cannot enter history", () => {
  const state = model.recordRun(model.initialState(), config(), "SUCCESS");
  assert.equal(state.runs.length, 1);
  const mutations = [
    (value) => { value.runs[0].id = 2; },
    (value) => { value.runs[0].report.bounded.journeys.failure = 1; },
    (value) => { value.runs[0].report.bounded.trace[0].databaseLoad = 1; },
    (value) => { value.runs[0].configuration.dbCapacity = 24; },
    (value) => { value.runs[0].verifier = "FAIL"; },
    (value) => { value.runs[0].extra = "forged"; },
    (value) => { value.runs[0].report.bounded.trace.extra = true; }
  ];
  for (const mutate of mutations) {
    const forged = copy(state);
    mutate(forged);
    assert.throws(() => model.recordRun(forged, config(), "SUCCESS"), /state|history|identity/);
  }
});

test("state validation never invokes accessor fields", () => {
  const state = { nextId: 1, runs: [] };
  Object.defineProperty(state, "runs", { get() { throw new Error("getter must not execute"); }, enumerable: true });
  assert.throws(() => model.validateState(state), /state/);
});

test("reset produces a fresh empty session and does not rewrite previous evidence", () => {
  const previous = model.recordRun(model.initialState(), config({ concurrency: 3 }), "SUCCESS");
  assert.equal(previous.runs.length, 1);
  assert.deepEqual(model.initialState(), { nextId: 1, runs: [] });
  assert.equal(previous.runs[0].verifier, "FAIL");
});

test("all candidate/concurrency pairs conserve initialization and journey counts in sampled envelopes", () => {
  let checked = 0;
  for (let instances = 2; instances <= 12; instances++) {
    for (let concurrency = 1; concurrency <= instances; concurrency++) {
      for (const [dbCapacity, cacheCapacity] of [[4, 4], [8, 6], [24, 20]]) {
        for (const observations of ["complete", "missing"]) {
          for (const initBudget of [2, 8, 24]) {
            const result = model.analyze(config({ instances, concurrency, dbCapacity, cacheCapacity, observations, initBudget }));
            for (const run of [result.simultaneous, result.bounded]) {
              const limit = run.mode === "simultaneous" ? instances : concurrency;
              assert.equal(run.plannedTicks, 2 * Math.ceil(instances / limit));
              assert.equal(run.trace.length, run.plannedTicks);
              assert.equal(run.initialization.attempted, instances);
              assert.equal(run.initialization.success + run.initialization.failure + run.initialization.unknown, instances);
              assert.equal(run.journeys.attempted, run.plannedTicks * 4);
              assert.equal(run.journeys.success + run.journeys.failure + run.journeys.unknown, run.journeys.attempted);
              assert.equal(run.trace.reduce((sum, row) => sum + row.completing, 0), instances);
              if (observations === "missing") assert.equal(run.outcome, "UNKNOWN");
              else assert.equal(run.outcome, run.initialization.failure || run.durationTicks > initBudget ? "FAILURE" : "SUCCESS");
            }
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 1386);
});
