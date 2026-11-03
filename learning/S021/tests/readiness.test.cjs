"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePool } = require("../readiness.js");

function readyEvidence(overrides = {}) {
  return {
    deploymentId: "candidate-v2",
    observedAtMs: 115000,
    state: "ready",
    dependencies: [
      { id: "primary-store", state: "ready" },
      { id: "recommendations", state: "failed" }
    ],
    ...overrides
  };
}

function pool() {
  return {
    deploymentId: "candidate-v2",
    nowMs: 120000,
    maxAgeMs: 30000,
    requiredCandidateIds: ["candidate-a", "candidate-b", "candidate-c"],
    requiredDependencyIds: ["primary-store"],
    candidates: [
      { id: "candidate-a", evidence: readyEvidence() },
      { id: "candidate-b", evidence: readyEvidence() },
      { id: "candidate-c", evidence: readyEvidence() },
      { id: "candidate-shadow", evidence: readyEvidence({ state: "failed" }) }
    ],
    endpointSample: {
      state: "healthy",
      responder: "candidate-a",
      observedAtMs: 115000
    }
  };
}

function hasEvent(result, code, subject) {
  return result.trace.some((event) =>
    event.code === code && (subject === undefined || event.subject === subject)
  );
}

function candidate(result, id = "candidate-b") {
  return result.candidates.find((entry) => entry.id === id);
}

test("all required fresh-ready allows only the declared synthetic admission", () => {
  const result = evaluatePool(pool());
  assert.equal(result.allowAdmission, true);
  assert.equal(result.executionMode, "synthetic");
  assert.equal(result.candidates.filter((entry) => entry.required && entry.state === "ready").length, 3);
  assert.deepEqual(result.blockingReasons, []);
  assert.equal(result.trace.filter((event) => event.code === "candidate.ready" &&
    event.subject !== "candidate-shadow").length, 3);
  assert.ok(hasEvent(result, "admission.allow"));
});

test("one unready required instance blocks despite a healthy reply", () => {
  const input = pool();
  input.candidates[1].evidence.state = "unready";
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.equal(candidate(result)?.state, "not_ready");
  assert.ok(hasEvent(result, "candidate.unready", "candidate-b"));
  assert.ok(result.blockingReasons.some((reason) => reason.includes("candidate-b")));
  assert.deepEqual(result.trace.slice(-3).map((event) => event.code),
    ["admission.block", "impact.unknown", "cleanup.local"]);
});

test("healthy sample alone cannot fill missing or unknown per-instance evidence", () => {
  const input = pool();
  input.candidates[1].evidence = null;
  input.candidates[2].evidence.state = "unknown";
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.equal(result.sample.state, "healthy");
  assert.equal(candidate(result)?.state, "unknown");
  assert.equal(candidate(result, "candidate-c")?.state, "unknown");
  assert.ok(hasEvent(result, "sample.informational"));
  assert.ok(hasEvent(result, "candidate.missing", "candidate-b"));
  assert.ok(hasEvent(result, "candidate.unknown", "candidate-c"));
});

for (const [condition, evidence, state, event] of [
  ["stale", readyEvidence({ observedAtMs: 89999 }), "unknown", "candidate.stale"],
  ["missing", null, "unknown", "candidate.missing"],
  ["unknown", readyEvidence({ state: "unknown" }), "unknown", "candidate.unknown"],
  ["failed", readyEvidence({ state: "failed" }), "not_ready", "candidate.failed"],
  ["wrong deployment", readyEvidence({ deploymentId: "candidate-v1" }), "unknown", "candidate.identity"],
  ["future-dated", readyEvidence({ observedAtMs: 120001 }), "unknown", "candidate.clock"],
  ["invalid timestamp", readyEvidence({ observedAtMs: "115000" }), "unknown", "candidate.clock"],
  ["unrecognized state", readyEvidence({ state: "success-ish" }), "unknown", "candidate.unknown"]
]) {
  test(`${condition} required evidence blocks and preserves its classification`, () => {
    const input = pool();
    input.candidates[1].evidence = evidence;
    const result = evaluatePool(input);
    assert.equal(result.allowAdmission, false);
    assert.equal(candidate(result)?.state, state);
    assert.ok(hasEvent(result, event, "candidate-b"));
  });
}

test("missing required candidate record cannot shrink the required pool", () => {
  const input = pool();
  input.candidates = input.candidates.filter((entry) => entry.id !== "candidate-b");
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.equal(candidate(result)?.state, "unknown");
  assert.ok(hasEvent(result, "candidate.missing-record", "candidate-b"));
});

test("duplicate required candidate records are ambiguous, not first-ready-wins", () => {
  const input = pool();
  input.candidates.push({ id: "candidate-b", evidence: readyEvidence({ state: "failed" }) });
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.ok(hasEvent(result, "candidate.duplicate", "candidate-b"));
});

test("freshness boundary is inclusive and expires one millisecond later", () => {
  const input = pool();
  input.candidates[1].evidence.observedAtMs = 90000;
  assert.equal(evaluatePool(input).allowAdmission, true);
  input.candidates[1].evidence.observedAtMs = 89999;
  const expired = evaluatePool(input);
  assert.equal(expired.allowAdmission, false);
  assert.equal(candidate(expired)?.ageMs, 30001);
  assert.equal(candidate(expired)?.evidenceState, "ready");
  assert.equal(candidate(expired)?.state, "unknown");
});

for (const dependencyState of ["failed", "unknown", "missing"]) {
  test(`required primary-store ${dependencyState} blocks only when actually required`, () => {
    const input = pool();
    input.candidates[1].evidence.dependencies = dependencyState === "missing" ? [] : [
      { id: "primary-store", state: dependencyState, required: false }
    ];
    const result = evaluatePool(input);
    assert.equal(result.allowAdmission, false);
    assert.ok(hasEvent(result, "dependency.required.block", "candidate-b/primary-store"));
  });
}

test("duplicate required dependency observations do not count as known-ready", () => {
  const input = pool();
  input.candidates[1].evidence.dependencies.push({ id: "primary-store", state: "failed" });
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.equal(candidate(result)?.state, "unknown");
});

test("optional failed instance and dependency are visible but not blanket safety gates", () => {
  const result = evaluatePool(pool());
  assert.equal(result.allowAdmission, true);
  assert.equal(candidate(result, "candidate-shadow")?.required, false);
  assert.equal(candidate(result, "candidate-shadow")?.state, "not_ready");
  assert.ok(hasEvent(result, "candidate.optional.excluded", "candidate-shadow"));
  assert.ok(hasEvent(result, "dependency.optional.ignored", "candidate-b/recommendations"));
});

test("missing optional instance and unknown optional dependencies do not block", () => {
  const input = pool();
  input.candidates.pop();
  for (const entry of input.candidates) {
    entry.evidence.dependencies[1].state = "unknown";
  }
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, true);
  assert.equal(result.candidates.length, 3);
});

test("candidate-local required=false cannot override the declared required pool", () => {
  const input = pool();
  input.candidates[1].required = false;
  input.candidates[1].evidence.state = "failed";
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.equal(candidate(result)?.required, true);
});

for (const [name, sample, expectedState] of [
  ["missing", null, "missing"],
  ["stale", { state: "healthy", responder: "candidate-a", observedAtMs: 89999 }, "stale"],
  ["unknown", { state: "unknown", observedAtMs: 115000 }, "unknown"],
  ["failed", { state: "failed", observedAtMs: 115000 }, "failed"]
]) {
  test(`${name} aggregate sample does not replace or veto complete targeted evidence`, () => {
    const input = pool();
    input.endpointSample = sample;
    const result = evaluatePool(input);
    assert.equal(result.allowAdmission, true);
    assert.equal(result.sample.state, expectedState);
    assert.ok(hasEvent(result, "sample.informational"));
  });
}

for (const [name, update] of [
  ["empty pool", (input) => { input.requiredCandidateIds = []; }],
  ["duplicate required identity", (input) => { input.requiredCandidateIds.push("candidate-b"); }],
  ["missing required pool", (input) => { delete input.requiredCandidateIds; }],
  ["negative freshness limit", (input) => { input.maxAgeMs = -1; }],
  ["invalid clock", (input) => { input.nowMs = NaN; }],
  ["empty deployment identity", (input) => { input.deploymentId = ""; }],
  ["ambiguous dependency contract", (input) => { input.requiredDependencyIds.push("primary-store"); }]
]) {
  test(`${name} is fail-closed rather than vacuously ready`, () => {
    const input = pool();
    update(input);
    const result = evaluatePool(input);
    assert.equal(result.allowAdmission, false);
    assert.ok(hasEvent(result, "contract.invalid"));
    assert.ok(result.blockingReasons.length > 0);
  });
}

test("a gap in the required pool cannot turn an unready candidate into an optional exclusion", () => {
  const input = pool();
  input.candidates[1].evidence.state = "unready";
  delete input.requiredCandidateIds[1];
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.ok(hasEvent(result, "contract.invalid"));
});

test("an entirely unspecified required pool is not vacuously ready", () => {
  const input = pool();
  input.requiredCandidateIds = new Array(1);
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.ok(hasEvent(result, "contract.invalid"));
});

test("a gap in the required dependency contract cannot silently remove a required check", () => {
  const input = pool();
  input.requiredDependencyIds.length += 1;
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, false);
  assert.ok(hasEvent(result, "contract.invalid"));
});

test("every ordered trace event explicitly retains synthetic provenance", () => {
  const result = evaluatePool(pool());
  assert.ok(result.trace.length > 0);
  assert.ok(result.trace.every((event) => event.executionMode === "synthetic"));
  assert.deepEqual(result.trace.map((event) => event.sequence),
    result.trace.map((_, index) => index + 1));
});

test("actual user impact remains unknown in all five interruption categories", () => {
  const result = evaluatePool(pool());
  assert.deepEqual(result.userImpact.categories.map((entry) => entry.id),
    ["availability", "latency", "state", "effects", "data"]);
  assert.ok(result.userImpact.categories.every((entry) => entry.observation === "unknown"));
  assert.equal(result.userImpact.attemptedTransitions, 0);
  assert.equal(result.userImpact.completedMigrations, 0);
  assert.equal(result.userImpact.successRate, null);
  assert.equal(result.userImpact.summary, "unknown");
});

test("evaluation is deterministic, does not mutate inputs, and creates no resources", () => {
  const input = pool();
  const before = structuredClone(input);
  const result = evaluatePool(input);
  assert.deepEqual(input, before);
  assert.deepEqual(evaluatePool(input), result);
  assert.equal(result.cleanup.outcome, "local-only");
  assert.equal(result.cleanup.resourcesCreated, 0);
  assert.equal(result.cleanup.resourcesDeleted, 0);
  assert.equal(result.cleanup.persistentState, false);
});

test("absent top-level input fails closed without throwing", () => {
  const result = evaluatePool(null);
  assert.equal(result.allowAdmission, false);
  assert.ok(hasEvent(result, "contract.invalid"));
});

test("ambiguous optional instance records cannot become a blanket required gate", () => {
  const input = pool();
  input.candidates.push({ id: "candidate-shadow", evidence: null });
  const result = evaluatePool(input);
  assert.equal(result.allowAdmission, true);
  assert.equal(candidate(result, "candidate-shadow")?.state, "unknown");
  assert.ok(hasEvent(result, "candidate.optional.excluded", "candidate-shadow"));
});

const fixtures = require("../fixtures.js");

for (const [id, expected, code] of [
  ["all-ready", true, "admission.allow"],
  ["one-unready", false, "candidate.unready"],
  ["stale", false, "candidate.stale"],
  ["sample-only", false, "candidate.missing"]
]) {
  test(`portable ${id} fixture matches its independently declared expectation`, () => {
    const input = fixtures.createScenario(id);
    const result = evaluatePool(input);
    assert.equal(input.expectedAdmission, expected);
    assert.equal(result.allowAdmission, expected);
    assert.ok(hasEvent(result, code));
  });
}

test("all six editable required-instance conditions produce the expected gate", () => {
  const input = fixtures.createScenario("all-ready");
  for (const condition of ["ready", "unready", "failed", "stale", "missing", "unknown"]) {
    const changed = fixtures.updateCandidate(input, "candidate-b", condition);
    assert.equal(evaluatePool(changed).allowAdmission, condition === "ready", condition);
    assert.deepEqual(changed.requiredCandidateIds, input.requiredCandidateIds);
  }
  assert.equal(input.candidates[1].condition, "ready");
});

test("aggregate sample controls never launder an unsafe required pool", () => {
  const input = fixtures.createScenario("one-unready");
  for (const condition of ["healthy", "failed", "stale", "missing", "unknown"]) {
    const changed = fixtures.updateSample(input, condition);
    assert.equal(evaluatePool(changed).allowAdmission, false, condition);
  }
  assert.equal(input.sampleCondition, "healthy");
});

test("optional controls remain non-gating and do not mutate their source fixture", () => {
  const input = fixtures.createScenario("all-ready");
  for (const condition of ["ready", "failed", "missing", "unknown"]) {
    assert.equal(evaluatePool(fixtures.updateOptionalDependency(input, condition)).allowAdmission, true);
  }
  assert.equal(evaluatePool(fixtures.updateCandidate(input, "candidate-shadow", "missing")).allowAdmission, true);
  assert.equal(input.optionalDependencyCondition, "failed");
  assert.equal(input.candidates[3].condition, "failed");
});

test("unknown fixture choices are rejected rather than silently made healthy", () => {
  const input = fixtures.createScenario("all-ready");
  assert.throws(() => fixtures.createScenario("not-a-scenario"), RangeError);
  assert.throws(() => fixtures.updateCandidate(input, "not-a-candidate", "ready"), RangeError);
  assert.throws(() => fixtures.updateCandidate(input, "candidate-b", "probably-ready"), RangeError);
  assert.throws(() => fixtures.updateSample(input, "probably-healthy"), RangeError);
  assert.throws(() => fixtures.updateOptionalDependency(input, "probably-ready"), RangeError);
});
