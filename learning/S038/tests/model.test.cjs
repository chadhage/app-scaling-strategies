"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const lesson = require("../authorization.js");

const defaults = () => ({
  routes: { alba: "v2", birch: "v2" },
  policy: "isolated",
  assertions: { ownRead: true, rejectForeign: true, dataTenant: true }
});

test("isolated permissions survive changed destinations with all 16 tenant probes attributed", () => {
  const state = lesson.conduct(lesson.createState(), defaults());
  const run = state.history[0];
  assert.deepEqual(run.counts, { attempted: 16, success: 16, failure: 0, unknown: 0 });
  assert.equal(run.outcome, "SUCCESS");
  assert.equal(run.verifier, "PASS");
  assert.deepEqual(run.migratedTenants, ["alba", "birch"]);
  assert.equal(run.trace.length, 16);
});

test("forbidden 403 responses with no data are successes, not permission interruptions", () => {
  const run = lesson.conduct(lesson.createState(), defaults()).history[0];
  const foreign = run.trace.filter((probe) => probe.intent === "foreign");
  assert.equal(foreign.length, 8);
  foreign.forEach((probe) => {
    assert.equal(probe.expectedStatus, 403);
    assert.equal(probe.status, 403);
    assert.equal(probe.dataTenant, null);
    assert.equal(probe.record, null);
    assert.equal(probe.outcome, "success");
  });
  assert.equal(run.trace.filter((probe) => probe.path === "routed").length, 8);
  assert.equal(run.trace.filter((probe) => probe.path === "direct").length, 8);
});

for (const policy of ["allow-foreign", "wrong-data", "deny-own"]) {
  test(`${policy} exposes exactly two post-change v2 failures with complete attribution`, () => {
    const config = defaults();
    config.policy = policy;
    config.routes.alba = "v1";
    const run = lesson.conduct(lesson.createState(), config).history[0];
    assert.deepEqual(run.counts, { attempted: 16, success: 14, failure: 2, unknown: 0 });
    assert.equal(run.outcome, "FAILURE");
    assert.equal(run.verifier, "FAIL");
    assert.equal(run.trace.filter((probe) => probe.phase === "before" && probe.outcome === "success").length, 8);
    const failures = run.trace.filter((probe) => probe.outcome === "failure");
    failures.forEach((probe) => {
      assert.equal(probe.phase, "after");
      assert.equal(probe.version, "v2");
      assert.equal(probe.principal, `synthetic-${probe.memberTenant}-member`);
      assert.equal(probe.intent, policy === "allow-foreign" ? "foreign" : "own");
    });
    assert.equal(failures.find((probe) => probe.memberTenant === "alba").path, "direct");
    assert.equal(failures.find((probe) => probe.memberTenant === "birch").path, "routed");
    if (policy === "allow-foreign") failures.forEach((probe) => {
      assert.equal(probe.status, 200);
      assert.notEqual(probe.memberTenant, probe.dataTenant);
    });
    if (policy === "wrong-data") failures.forEach((probe) => {
      assert.equal(probe.status, 200);
      assert.notEqual(probe.resourceTenant, probe.dataTenant);
    });
  });
}

test("unobserved v2 responses stay unknown without invented status, data or migration", () => {
  const config = defaults();
  config.policy = "unobserved";
  const run = lesson.conduct(lesson.createState(), config).history[0];
  assert.deepEqual(run.counts, { attempted: 16, success: 12, failure: 0, unknown: 4 });
  assert.equal(run.outcome, "UNKNOWN");
  assert.equal(run.verifier, "UNVERIFIED");
  assert.deepEqual(run.migratedTenants, []);
  run.trace.filter((probe) => probe.outcome === "unknown").forEach((probe) => {
    assert.equal(probe.observed, false);
    assert.equal(probe.status, null);
    assert.equal(probe.dataTenant, null);
    assert.equal(probe.record, null);
    assert.ok(probe.checks.every((check) => check.result === "unknown"));
  });
});

test("omitting the foreign-rejection assertion cannot manufacture a pass", () => {
  const config = defaults();
  config.policy = "allow-foreign";
  config.assertions.rejectForeign = false;
  const run = lesson.conduct(lesson.createState(), config).history[0];
  assert.deepEqual(run.counts, { attempted: 16, success: 8, failure: 0, unknown: 8 });
  assert.equal(run.outcome, "UNKNOWN");
  assert.equal(run.verifier, "UNVERIFIED");
  assert.equal(run.trace.filter((probe) => probe.status === 200 && probe.intent === "foreign").length, 2);
});

test("a missing data-tenant assertion is unknown and observed failures take precedence", () => {
  const config = defaults();
  config.policy = "deny-own";
  config.assertions.dataTenant = false;
  const run = lesson.conduct(lesson.createState(), config).history[0];
  assert.deepEqual(run.counts, { attempted: 16, success: 8, failure: 2, unknown: 6 });
  assert.equal(run.outcome, "FAILURE");
  assert.equal(run.verifier, "FAIL");
});

test("healthy direct-version checks do not imply that either tenant changed destination", () => {
  const config = defaults();
  config.routes = { alba: "v1", birch: "v1" };
  const run = lesson.conduct(lesson.createState(), config).history[0];
  assert.equal(run.outcome, "SUCCESS");
  assert.deepEqual(run.migratedTenants, []);
  assert.ok(run.trace.filter((probe) => probe.phase === "after" && probe.path === "routed").every((probe) => probe.version === "v1"));
});

test("retained failed runs, input snapshots and outputs are immutable and reset is explicit", () => {
  const config = defaults();
  config.policy = "allow-foreign";
  const empty = lesson.createState();
  const failed = lesson.conduct(empty, config);
  const snapshot = JSON.stringify(failed);
  config.policy = "isolated";
  config.routes.alba = "v1";
  const corrected = lesson.conduct(failed, defaults());
  assert.equal(JSON.stringify(failed), snapshot);
  assert.equal(empty.history.length, 0);
  assert.equal(corrected.history[0].outcome, "FAILURE");
  assert.equal(corrected.history[0].config.policy, "allow-foreign");
  assert.equal(corrected.history[1].outcome, "SUCCESS");
  assert.throws(() => { corrected.history[0].trace[0].status = 500; }, TypeError);
  assert.throws(() => { corrected.history.push({}); }, TypeError);
  assert.deepEqual(lesson.reset(corrected), lesson.createState());
  assert.equal(corrected.history.length, 2);
});

test("six runs are bounded, never evicted, and an over-capacity run leaves state unchanged", () => {
  let state = lesson.createState();
  for (let index = 0; index < lesson.MAX_RUNS; index++) state = lesson.conduct(state, defaults());
  const snapshot = JSON.stringify(state);
  assert.deepEqual(state.history.map((run) => run.id), [1, 2, 3, 4, 5, 6]);
  assert.throws(() => lesson.conduct(state, defaults()), /History is full/);
  assert.equal(JSON.stringify(state), snapshot);
});

test("all 140 route, policy and nonempty assertion combinations preserve denominators and deterministic traces", () => {
  let combinations = 0;
  for (const alba of ["v1", "v2"]) for (const birch of ["v1", "v2"]) {
    for (const policy of lesson.POLICIES) for (let mask = 1; mask < 8; mask++) {
      const config = {
        routes: { alba, birch }, policy,
        assertions: { ownRead: Boolean(mask & 1), rejectForeign: Boolean(mask & 2), dataTenant: Boolean(mask & 4) }
      };
      const state = lesson.conduct(lesson.createState(), config);
      assert.deepEqual(state, lesson.conduct(lesson.createState(), config));
      const run = state.history[0];
      assert.equal(run.counts.attempted, 16);
      assert.equal(run.counts.success + run.counts.failure + run.counts.unknown, 16);
      assert.equal(new Set(run.trace.map((probe) => `${probe.phase}/${probe.version}/${probe.memberTenant}/${probe.intent}`)).size, 16);
      assert.equal(run.outcome, run.counts.failure ? "FAILURE" : run.counts.unknown ? "UNKNOWN" : "SUCCESS");
      if (mask !== 7) assert.notEqual(run.outcome, "SUCCESS");
      assert.ok(run.trace.filter((probe) => probe.path === "routed").every((probe) => probe.version === (probe.phase === "before" ? "v1" : config.routes[probe.memberTenant])));
      combinations++;
    }
  }
  assert.equal(combinations, 140);
});

test("strict configuration guards reject invalid fields, coercions, getters, symbols and non-plain records", () => {
  const valid = defaults();
  const bad = [
    null, [], "v2", new Date(), Object.create(null),
    { ...valid, extra: true }, { routes: valid.routes, assertions: valid.assertions },
    { ...valid, routes: { alba: "v3", birch: "v2" } },
    { ...valid, routes: { alba: " v1", birch: "v2" } },
    { ...valid, routes: { alba: true, birch: "v2" } },
    { ...valid, routes: { ...valid.routes, other: "v1" } },
    { ...valid, policy: "ALLOW-FOREIGN" }, { ...valid, policy: "__proto__" },
    { ...valid, assertions: { ...valid.assertions, ownRead: "true" } },
    { ...valid, assertions: { ...valid.assertions, dataTenant: 1 } },
    { ...valid, assertions: { ownRead: false, rejectForeign: false, dataTenant: false } }
  ];
  const getter = defaults();
  Object.defineProperty(getter, "policy", { enumerable: true, get() { throw new Error("Getter must not execute"); } });
  bad.push(getter);
  const symbol = defaults();
  symbol[Symbol("hidden")] = true;
  bad.push(symbol);
  const nonEnumerable = defaults();
  Object.defineProperty(nonEnumerable, "policy", { value: "isolated", enumerable: false });
  bad.push(nonEnumerable);
  const state = lesson.conduct(lesson.createState(), defaults());
  const before = JSON.stringify(state);
  bad.forEach((config) => assert.throws(() => lesson.conduct(state, config), TypeError));
  assert.equal(JSON.stringify(state), before);
});

test("state guards reject forged results, missing attribution, sparse history and accessor arrays", () => {
  const state = lesson.conduct(lesson.createState(), defaults());
  const clone = () => JSON.parse(JSON.stringify(state));
  const bad = [null, [], { schemaVersion: "1", history: [] }, { schemaVersion: 1, history: [], extra: true }];
  const forge = (change) => { const candidate = clone(); change(candidate); bad.push(candidate); };
  forge((s) => { s.history[0].id = 2; });
  forge((s) => { s.history[0].counts.success = 15; });
  forge((s) => { s.history[0].trace[0].principal = "other-member"; });
  forge((s) => { s.history[0].trace[0].status = 500; });
  forge((s) => { s.history[0].trace[0].checks.pop(); });
  forge((s) => { s.history[0].config.routes.alba = "v1"; });
  forge((s) => { s.history[0].verifier = "FAIL"; });
  forge((s) => { delete s.history[0]; });
  forge((s) => { s.history.length = 7; });
  forge((s) => { s.history.extra = true; });
  forge((s) => { s.history[Symbol("array")] = true; });
  forge((s) => { Object.defineProperty(s.history, "0", { get() { throw new Error("Do not read"); } }); });
  forge((s) => { Object.defineProperty(s.history[0].trace, "0", { get() { throw new Error("Do not read"); } }); });
  forge((s) => { s.history[0].trace[0].checks[0].result = "fail"; });
  bad.forEach((candidate) => {
    assert.throws(() => lesson.conduct(candidate, defaults()), TypeError);
    assert.throws(() => lesson.reset(candidate), TypeError);
  });
  assert.deepEqual(lesson.conduct(clone(), defaults()).history.map((run) => run.id), [1, 2]);
});
