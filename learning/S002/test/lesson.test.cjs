"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { runLesson, verifyLesson } = require(path.join(__dirname, "..", "lesson.js"));

const safe = Object.freeze({
  profile: "windows-code-manual",
  target: "production",
  configuration: "target-effective",
  readiness: "ready",
  statusPolicy: "strict-200",
  formerWork: "opaque"
});

test("safe selection rehearses production as target with effective target settings", () => {
  const result = runLesson(safe);
  assert.equal(result.state, "rehearsed");
  assert.equal(result.mode, "synthetic");
  assert.equal(result.target, "production");
  assert.deepEqual(result.effectiveSettings, {
    APP_ENV: "production",
    CATALOG_ALIAS: "catalog-production",
    SESSION_CONTRACT: "shared-v1"
  });
  assert.deepEqual(result.routing, { before: "v1", after: "v2" });
});

test("strict meaningful readiness covers both staging instances before routing", () => {
  const result = runLesson(safe);
  assert.equal(result.warmup.path, "/readyz");
  assert.deepEqual(result.warmup.acceptedStatuses, [200]);
  assert.equal(result.warmup.instances.length, 2);
  for (const instance of result.warmup.instances) {
    assert.equal(instance.status, 200);
    assert.equal(instance.dependenciesReady, true);
    assert.equal(instance.journeyReady, true);
    assert.equal(instance.configuration, "production");
  }
  const phases = result.trace.map((event) => event.phase);
  assert.ok(phases.indexOf("apply-target-settings") >= 0);
  assert.ok(phases.indexOf("apply-target-settings") < phases.indexOf("restart-source"));
  assert.ok(phases.indexOf("restart-source") < phases.indexOf("warmup-instance"));
  assert.equal(phases.filter((phase) => phase === "warmup-instance").length, 2);
  assert.ok(phases.lastIndexOf("warmup-instance") < phases.indexOf("routing-switch"));
  assert.ok(phases.indexOf("routing-switch") < phases.indexOf("former-workers-recycle"));
});

test("Linux code manual fixture is not confused with unsupported auto-swap", () => {
  assert.equal(runLesson({ ...safe, profile: "linux-code-manual" }).state, "rehearsed");
});

const unsafeCases = [
  ["wrong target", { target: "staging" }, "target"],
  ["source-only settings", { configuration: "source-only" }, "target-settings"],
  ["incompatible contracts", { configuration: "incompatible" }, "compatibility"],
  ["unready staging", { readiness: "unready" }, "readiness"],
  ["misleading HTTP 500", { readiness: "misleading-500" }, "readiness"],
  ["any HTTP response policy", { statusPolicy: "any-response" }, "warmup-status"],
  ["Linux code auto-swap", { profile: "linux-code-auto" }, "unsupported-profile"],
  ["container auto-swap", { profile: "container-auto" }, "unsupported-profile"],
  ["unknown profile", { profile: "future-host" }, "invalid-selection"],
  ["unknown target", { target: "preview" }, "invalid-selection"],
  ["unknown config", { configuration: "guess" }, "invalid-selection"],
  ["unknown readiness", { readiness: "probably" }, "invalid-selection"],
  ["unknown status policy", { statusPolicy: "default" }, "invalid-selection"],
  ["unknown worker observation", { formerWork: "completed" }, "invalid-selection"]
];

for (const [name, change, reasonCode] of unsafeCases) {
  test(`blocks ${name} without candidate exposure or invented former-worker evidence`, () => {
    const result = runLesson({ ...safe, ...change });
    assert.equal(result.state, "blocked");
    assert.ok(result.reasons.some((reason) => reason.code === reasonCode));
    assert.equal(result.routing.after, "v1");
    assert.equal(result.trace.some((event) => event.phase === "routing-switch"), false);
    assert.equal(result.formerWorkers.recycled, false);
    assert.equal(result.formerWorkers.request, "not-assessed");
    assert.equal(result.formerWorkers.backgroundJob, "not-assessed");
    assert.equal(result.userImpact.classification, "not-run");
    assert.equal(verifyLesson(result).passed, true, "correct prevention is educational success only");
  });
}

test("opaque former work remains unknown even though the retained slot survives", () => {
  const result = runLesson(safe);
  assert.equal(result.formerWorkers.retainedSlot, true);
  assert.equal(result.formerWorkers.recycled, true);
  assert.equal(result.formerWorkers.request, "unknown");
  assert.equal(result.formerWorkers.connection, "unknown");
  assert.equal(result.formerWorkers.backgroundJob, "unknown");
  assert.equal(result.userImpact.classification, "unknown");
  assert.equal(result.userImpact.uninterrupted, "unverified");
  assert.equal(result.customDrain, false);
  assert.equal(result.nativeEvidence, false);
  assert.equal(verifyLesson(result).passed, true);
});

test("detecting interrupted work can pass the lesson, not uninterrupted migration", () => {
  const result = runLesson({ ...safe, formerWork: "interrupted" });
  assert.equal(result.state, "rehearsed");
  assert.equal(result.formerWorkers.request, "interrupted");
  assert.equal(result.formerWorkers.connection, "interrupted");
  assert.equal(result.formerWorkers.backgroundJob, "interrupted");
  assert.equal(result.userImpact.classification, "interrupted");
  assert.equal(result.userImpact.uninterrupted, "not-achieved");
  assert.equal(result.customDrain, false);
  assert.equal(verifyLesson(result).passed, true);
});

test("fixture preserves original journey budgets and unmeasured real duration limits", () => {
  const result = runLesson(safe);
  assert.ok(result.limits.some((limit) => /original journey budget/i.test(limit)));
  assert.ok(result.limits.some((limit) => /maximum.*duration.*unmeasured/i.test(limit)));
  assert.ok(result.limits.some((limit) => /long-lived|WebSocket/i.test(limit)));
  assert.ok(result.limits.some((limit) => /durable|exactly-once/i.test(limit)));
  assert.ok(result.limits.some((limit) => /shared.*plan|compute/i.test(limit)));
  assert.equal(result.reliabilityCertified, false);
});

test("unchanged selections yield identical deterministic traces with logical times only", () => {
  for (const selection of [safe, { ...safe, readiness: "unready" }]) {
    const first = runLesson(selection);
    const second = runLesson(selection);
    assert.ok(first.trace.length > 0);
    assert.deepEqual(first, second);
    assert.ok(first.trace.every((event, index) => event.at === `T+${String(index).padStart(3, "0")}`));
  }
});

test("independent verifier rejects corrupted positive evidence instead of trusting a status", () => {
  const original = runLesson(safe);
  assert.equal(verifyLesson(original).passed, true);
  const corruptions = [
    (result) => { result.trace = result.trace.filter((event) => event.phase !== "apply-target-settings"); },
    (result) => { result.trace.reverse(); },
    (result) => { result.formerWorkers.request = "completed"; },
    (result) => { result.formerWorkers.backgroundJob = "completed"; },
    (result) => { result.formerWorkers.recycled = false; },
    (result) => { result.warmup.instances[0].dependenciesReady = false; },
    (result) => { result.warmup.acceptedStatuses = []; },
    (result) => { result.effectiveSettings.APP_ENV = "staging"; },
    (result) => { result.routing.after = "v1"; },
    (result) => { result.mode = "native"; },
    (result) => { result.nativeEvidence = true; },
    (result) => { result.customDrain = true; },
    (result) => { result.reliabilityCertified = true; },
    (result) => { result.userImpact.uninterrupted = "achieved"; }
  ];
  for (const corrupt of corruptions) {
    const result = structuredClone(original);
    corrupt(result);
    assert.equal(verifyLesson(result).passed, false, corrupt.toString());
  }
});

test("independent verifier rejects a blocked result that hides exposure or missing reasons", () => {
  const blocked = runLesson({ ...safe, target: "staging" });
  assert.equal(verifyLesson(blocked).passed, true);
  const exposed = structuredClone(blocked);
  exposed.routing.after = "v2";
  assert.equal(verifyLesson(exposed).passed, false);
  const unexplained = structuredClone(blocked);
  unexplained.reasons = [];
  assert.equal(verifyLesson(unexplained).passed, false);
});

test("cleanup is local only and empty or malformed evidence never passes the verifier", () => {
  assert.deepEqual(runLesson(safe).cleanup, {
    state: "local-only",
    cloudResourcesCreated: 0,
    persistentState: false
  });
  for (const malformed of [null, {}, { state: "rehearsed" }, { state: "blocked" }]) {
    assert.equal(verifyLesson(malformed).passed, false);
  }
});

test("every enumerated condition combination fails closed or follows the safe trace", () => {
  let combinations = 0;
  for (const profile of ["windows-code-manual", "linux-code-manual", "linux-code-auto", "container-auto"]) {
    for (const target of ["production", "staging"]) {
      for (const configuration of ["target-effective", "source-only", "incompatible"]) {
        for (const readiness of ["ready", "unready", "misleading-500"]) {
          for (const statusPolicy of ["strict-200", "any-response"]) {
            for (const formerWork of ["opaque", "interrupted"]) {
              const selection = { profile, target, configuration, readiness, statusPolicy, formerWork };
              const eligible = ["windows-code-manual", "linux-code-manual"].includes(profile) &&
                target === "production" && configuration === "target-effective" &&
                readiness === "ready" && statusPolicy === "strict-200";
              const result = runLesson(selection);
              assert.equal(result.state, eligible ? "rehearsed" : "blocked", JSON.stringify(selection));
              assert.equal(result.routing.after, eligible ? "v2" : "v1", JSON.stringify(selection));
              assert.equal(verifyLesson(result).passed, true, JSON.stringify(selection));
              combinations += 1;
            }
          }
        }
      }
    }
  }
  assert.equal(combinations, 288);
});

test("malformed input and unexpected fields cannot expose the candidate", () => {
  for (const malformed of [null, [], "production", { ...safe, unexpected: true }, { ...safe, readiness: null }]) {
    const result = runLesson(malformed);
    assert.equal(result.state, "blocked");
    assert.equal(result.routing.after, "v1");
    assert.ok(result.reasons.some((reason) => reason.code === "invalid-selection"));
  }
});
