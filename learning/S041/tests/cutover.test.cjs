"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { rehearse, checkPrediction, limits } = require(join(__dirname, "..", "cutover.js"));
const { makeFixture, scenarios } = require(join(__dirname, "..", "fixtures.js"));

test("safe cutover completes the old request on v1 and separately admits a new request to v2", () => {
  const result = rehearse(makeFixture());
  assert.deepEqual(result.requests.map(r => r.owner), ["v1", "v2"]);
  assert.deepEqual(result.requests.map(r => r.outcome), ["completed", "completed"]);
  assert.equal(result.requests[0].completedAtMs, 100);
  assert.equal(result.requests[1].originalAdmittedAtMs, 60);
  assert.equal(result.outcome, "CONTINUITY");
  assert.equal(result.retirement.gate, "ALLOW");
  assert.deepEqual(
    ["attemptedRequests", "completed", "interrupted", "unknown", "oldCompletions", "newAdmissions"]
      .map(key => result.counts[key]), [2, 2, 0, 0, 1, 1]);
});

test("a legitimate old completion alone neither fails continuity nor proves a moved user", () => {
  const input = makeFixture();
  input.requests = input.requests.slice(0, 1);
  const result = rehearse(input);
  assert.equal(result.requests[0].outcome, "completed");
  assert.equal(result.counts.oldCompletions, 1);
  assert.equal(result.counts.newAdmissions, 0);
  assert.equal(result.userMigration.provenMovedUsers, 0);
  assert.equal(result.userMigration.classification, "unknown");
});

test("premature retirement interrupts old work despite a contradictory later success record", () => {
  const result = rehearse(makeFixture("premature-retirement"));
  assert.equal(result.requests[0].outcome, "interrupted");
  assert.equal(result.requests[0].reason, "premature-retirement");
  assert.equal(result.requests[0].interruptedAtMs, 70);
  assert.equal(result.requests[0].completedAtMs, null);
  assert.equal(result.requests[1].outcome, "completed");
  assert.equal(result.outcome, "INTERRUPTED");
  assert.equal(result.retirement.gate, "BLOCK");
});

test("a reported retry clock cannot reset the original request budget", () => {
  const result = rehearse(makeFixture("retry-clock-reset"));
  const old = result.requests[0];
  assert.equal(old.outcome, "interrupted");
  assert.equal(old.reason, "original-request-budget");
  assert.equal(old.originalAdmittedAtMs, 10);
  assert.equal(old.originalRequestBudgetMs, 120);
  assert.equal(old.requestDeadlineMs, 130);
  assert.equal(old.elapsedMs, 155);
  assert.equal(result.trace.some(event => event.kind === "retry-clock.ignored"), true);
});

test("the original journey deadline is independent of request and retry clocks", () => {
  const result = rehearse(makeFixture("safe", { journeyBudgetMs: 100 }));
  assert.equal(result.requests[1].outcome, "interrupted");
  assert.equal(result.requests[1].reason, "original-journey-budget");
  assert.equal(result.requests[1].journeyDeadlineMs, 100);
  assert.equal(result.requests[1].originalRequestBudgetMs, 120);
});

test("correct timing does not excuse a wrong response or lost state", () => {
  for (const [scenario, reason] of [["wrong-response", "incorrect-response"], ["state-loss", "state-not-preserved"]]) {
    const result = rehearse(makeFixture(scenario));
    assert.equal(result.requests[0].outcome, "interrupted", scenario);
    assert.equal(result.requests[0].reason, reason, scenario);
    assert.equal(result.outcome, "INTERRUPTED", scenario);
  }
});

test("a forged v2 owner for a pre-cutover request is invalid evidence, not migration proof", () => {
  const result = rehearse(makeFixture("forged-owner"));
  assert.equal(result.requests[0].outcome, "unknown");
  assert.equal(result.requests[0].evidenceQuality, "invalid");
  assert.equal(result.outcome, "UNKNOWN");
  assert.equal(result.retirement.gate, "HOLD");
  assert.equal(result.userMigration.provenMovedUsers, 0);
});

test("missing completion stays unknown and cannot authorize v1 retirement", () => {
  const result = rehearse(makeFixture("missing-completion"));
  assert.equal(result.requests[0].outcome, "unknown");
  assert.equal(result.requests[0].reason, "missing-completion");
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.retirement.gate, "HOLD");
});

test("a passing negative prediction does not change interrupted user impact", () => {
  const result = rehearse(makeFixture("premature-retirement"));
  assert.equal(checkPrediction(result, "INTERRUPTED").passed, true);
  assert.equal(checkPrediction(result, "CONTINUITY").passed, false);
  assert.equal(result.outcome, "INTERRUPTED");
});

test("the fixture loads deterministically and rehearsal leaves original input untouched", () => {
  const input = makeFixture();
  const before = JSON.stringify(input);
  assert.equal(input.executionMode, "synthetic");
  assert.deepEqual(makeFixture(), input);
  rehearse(input);
  assert.equal(JSON.stringify(input), before);
});

test("admission at exactly cutover goes to v2, not the draining owner", () => {
  const input = makeFixture("safe", { cutoverAtMs: 60 });
  const result = rehearse(input);
  assert.equal(result.requests[1].owner, "v2");
  assert.equal(result.requests[0].owner, "v1");
  const sameTime = result.trace.filter(event => event.atMs === 60);
  assert.deepEqual(sameTime.map(event => event.kind), ["cutover", "admission"]);
});

test("completion at exactly retirement is ordered first and is not interrupted", () => {
  const result = rehearse(makeFixture("safe", { retireV1AtMs: 100 }));
  assert.equal(result.requests[0].outcome, "completed");
  assert.equal(result.retirement.gate, "ALLOW");
  assert.deepEqual(result.trace.filter(event => event.atMs === 100).map(event => event.kind),
    ["completion", "retirement"]);
});

test("a request deadline is inclusive and the very next millisecond fails", () => {
  const exact = rehearse(makeFixture("safe", { oldWorkMs: 120, retireV1AtMs: 140 }));
  const late = rehearse(makeFixture("safe", { oldWorkMs: 121, retireV1AtMs: 140 }));
  assert.equal(exact.requests[0].elapsedMs, 120);
  assert.equal(exact.requests[0].outcome, "completed");
  assert.equal(late.requests[0].elapsedMs, 121);
  assert.equal(late.requests[0].reason, "original-request-budget");
});

test("a journey deadline is inclusive and cannot be replaced by a later request's clock", () => {
  assert.equal(rehearse(makeFixture("safe", { journeyBudgetMs: 140 })).outcome, "CONTINUITY");
  const late = rehearse(makeFixture("safe", { journeyBudgetMs: 139 }));
  assert.equal(late.requests[1].reason, "original-journey-budget");
  assert.equal(late.requests[1].journeyDeadlineMs, 139);
});

test("retirement one millisecond before completion interrupts, without counting the later response", () => {
  const result = rehearse(makeFixture("safe", { retireV1AtMs: 99 }));
  assert.equal(result.requests[0].outcome, "interrupted");
  assert.equal(result.requests[0].completedAtMs, null);
  assert.equal(result.counts.oldCompletions, 0);
});

test("an explicit identity-bound interruption remains interrupted", () => {
  const input = makeFixture();
  input.requests[0].evidence.kind = "interrupted";
  input.requests[0].evidence.atMs = 50;
  const result = rehearse(input);
  assert.equal(result.requests[0].reason, "observed-interruption");
  assert.equal(result.requests[0].interruptedAtMs, 50);
  assert.equal(result.requests[0].completedAtMs, null);
});

test("an interruption known before premature retirement is not attributed to the later retirement", () => {
  const input = makeFixture("premature-retirement");
  input.requests[0].evidence.kind = "interrupted";
  input.requests[0].evidence.atMs = 50;
  assert.equal(rehearse(input).requests[0].reason, "observed-interruption");
});

for (const [label, change, reason] of [
  ["wrong status", input => { input.requests[0].evidence.response.status = 500; }, "incorrect-response"],
  ["wrong cart total", input => { input.requests[0].evidence.state.totalCents = 1; }, "state-not-preserved"],
  ["missing response", input => { delete input.requests[0].evidence.response; }, "missing-response"],
  ["missing state", input => { delete input.requests[0].evidence.state; }, "missing-state"],
  ["explicit unknown", input => { input.requests[0].evidence = { kind: "unknown" }; }, "explicit-unknown"]
]) {
  test(label + " has an explicit non-success category", () => {
    const input = makeFixture();
    change(input);
    const request = rehearse(input).requests[0];
    assert.equal(request.reason, reason);
    assert.equal(request.outcome, reason.startsWith("missing") || reason === "explicit-unknown" ? "unknown" : "interrupted");
  });
}

for (const [label, change] of [
  ["another request", evidence => { evidence.requestId = "r-someone-else"; }],
  ["another user", evidence => { evidence.userId = "user-2"; }],
  ["another journey", evidence => { evidence.journeyId = "journey-2"; }],
  ["reset admission", evidence => { evidence.admittedAtMs = 40; }],
  ["pre-admission completion", evidence => { evidence.atMs = 5; }],
  ["future completion", evidence => { evidence.atMs = 9999; }],
  ["different work schedule", evidence => { evidence.atMs = 101; }],
  ["string completion time", evidence => { evidence.atMs = "100"; }],
  ["non-finite completion", evidence => { evidence.atMs = Infinity; }],
  ["invalid response shape", evidence => { evidence.response.status = "200"; }],
  ["invalid state shape", evidence => { evidence.state.extra = true; }],
  ["negative retry clock", evidence => { evidence.reportedRetryLatencyMs = -1; }],
  ["unrecognized evidence kind", evidence => { evidence.kind = "success-ish"; }]
]) {
  test("invalid evidence: " + label + " is unknown, never a successful old completion", () => {
    const input = makeFixture();
    change(input.requests[0].evidence);
    const result = rehearse(input);
    assert.equal(result.validInput, true);
    assert.equal(result.requests[0].outcome, "unknown");
    assert.equal(result.requests[0].evidenceQuality, "invalid");
    assert.equal(result.counts.oldCompletions, 0);
    assert.equal(result.retirement.gate, "HOLD");
    assert.equal(result.outcome, "UNKNOWN");
    assert.equal(result.trace.some(event => event.kind === "evidence.invalid"), true);
  });
}

for (const value of [null, true, "40", -1, 0.5, NaN, Infinity, 10001]) {
  test("invalid configuration clock " + String(value) + " fails closed", () => {
    const input = makeFixture();
    input.cutoverAtMs = value;
    const result = rehearse(input);
    assert.equal(result.validInput, false);
    assert.equal(result.outcome, "UNKNOWN");
    assert.equal(result.retirement.allowed, false);
    assert.equal(result.counts.completed, 0);
    assert.ok(result.issues.length);
  });
}

for (const [label, change] of [
  ["no request array", input => { delete input.requests; }],
  ["empty request array", input => { input.requests = []; }],
  ["sparse request array", input => { delete input.requests[0]; }],
  ["too many requests", input => { input.requests = Array(9).fill(input.requests[0]); }],
  ["duplicate request IDs", input => { input.requests[1].id = input.requests[0].id; }],
  ["null request", input => { input.requests[0] = null; }],
  ["missing request ID", input => { delete input.requests[0].id; }],
  ["request on another journey", input => { input.requests[0].journeyId = "journey-2"; }],
  ["admission before journey", input => { input.journey.originalStartedAtMs = 11; }],
  ["admission after observation", input => { input.requests[0].originalAdmittedAtMs = 9999; }],
  ["zero original request budget", input => { input.requests[0].originalRequestBudgetMs = 0; }],
  ["string original journey budget", input => { input.journey.originalBudgetMs = "180"; }],
  ["oversized original journey budget", input => { input.journey.originalBudgetMs = 2001; }],
  ["zero work duration", input => { input.requests[0].workMs = 0; }],
  ["missing original state contract", input => { delete input.journey.expectedState; }],
  ["missing correct response contract", input => { delete input.requests[0].expectedResponse; }],
  ["retirement before cutover", input => { input.retireV1AtMs = 39; }],
  ["observation before retirement", input => { input.observedAtMs = 109; }],
  ["non-synthetic mode", input => { input.executionMode = "live"; }],
  ["unsupported schema", input => { input.schemaVersion = 2; }]
]) {
  test("invalid input: " + label + " cannot authorize retirement or manufacture success", () => {
    const input = makeFixture();
    change(input);
    const result = rehearse(input);
    assert.equal(result.validInput, false);
    assert.equal(result.outcome, "UNKNOWN");
    assert.equal(result.retirement.gate, "HOLD");
    assert.equal(result.counts.completed, 0);
    assert.equal(result.userMigration.provenMovedUsers, 0);
    assert.equal(result.trace[0].kind, "contract.invalid");
  });
}

test("non-object inputs do not throw or retain a previous successful result", () => {
  for (const input of [null, undefined, [], "synthetic", 5, false]) {
    const result = rehearse(input);
    assert.equal(result.outcome, "UNKNOWN");
    assert.equal(result.counts.attemptedRequests, null);
    assert.equal(result.counts.unknown, null);
    assert.equal(result.validInput, false);
  }
});

test("unknown and interrupted requests both stay in the attempted-request denominator", () => {
  const input = makeFixture("premature-retirement");
  input.requests[1].evidence = null;
  const result = rehearse(input);
  assert.equal(result.outcome, "INTERRUPTED");
  assert.equal(result.counts.attemptedRequests, 2);
  assert.equal(result.counts.interrupted, 1);
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.counts.completed + result.counts.interrupted + result.counts.unknown, 2);
});

test("v2 uncertainty does not invent a v1 interruption or prove a moved user", () => {
  const input = makeFixture();
  input.requests[1].evidence = null;
  const result = rehearse(input);
  assert.equal(result.outcome, "UNKNOWN");
  assert.equal(result.requests[0].outcome, "completed");
  assert.equal(result.retirement.gate, "ALLOW");
  assert.equal(result.userMigration.classification, "unknown");
  assert.equal(result.userMigration.provenMovedUsers, 0);
});

test("every declared preset produces its specified synthetic impact, not a live verdict", () => {
  for (const scenario of scenarios) {
    const result = rehearse(makeFixture(scenario.id));
    assert.equal(result.outcome, scenario.prediction, scenario.id);
    assert.equal(result.executionMode, "synthetic");
    assert.equal(result.userMigration.classification, "unknown");
    assert.equal(result.userMigration.provenMovedUsers, 0);
    assert.equal(Object.hasOwn(result, "migrationSuccessPercentage"), false);
    assert.equal(Object.hasOwn(result.counts, "migrationSuccessPercentage"), false);
  }
});

test("every copied trace entry keeps synthetic provenance, stable ordering and contiguous sequence", () => {
  for (const scenario of scenarios) {
    const result = rehearse(makeFixture(scenario.id));
    assert.deepEqual(result.trace.map(event => event.sequence), result.trace.map((_, index) => index + 1));
    assert.equal(result.trace.every(event => event.executionMode === "synthetic"), true);
    assert.equal(result.trace.every((event, index, events) => index === 0 || event.atMs >= events[index - 1].atMs), true);
    assert.deepEqual(rehearse(makeFixture(scenario.id)), result);
  }
});

test("deep-frozen source state, identity and original budgets are never mutated", () => {
  function freeze(value) {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  const input = freeze(makeFixture("retry-clock-reset"));
  const result = rehearse(input);
  assert.equal(result.requests[0].originalAdmittedAtMs, input.requests[0].originalAdmittedAtMs);
  assert.equal(result.requests[0].originalRequestBudgetMs, input.requests[0].originalRequestBudgetMs);
  assert.deepEqual(result.originalJourney.expectedState, input.journey.expectedState);
  assert.notEqual(result.originalJourney.expectedState, input.journey.expectedState);
});

test("all permitted end-of-horizon controls produce bounded observation rather than an accidental future clock", () => {
  const input = makeFixture("safe", { cutoverAtMs: limits.maxClockMs, retireV1AtMs: limits.maxClockMs });
  const result = rehearse(input);
  assert.equal(input.observedAtMs, limits.maxClockMs);
  assert.equal(result.validInput, true);
  assert.equal(result.outcome, "CONTINUITY");
  assert.equal(result.counts.newAdmissions, 0);
});

test("an invalid prediction cannot pass or mutate the impact", () => {
  const result = rehearse(makeFixture());
  for (const prediction of ["PASS", "migrated", null, undefined]) {
    assert.equal(checkPrediction(result, prediction).passed, false);
  }
  assert.equal(result.outcome, "CONTINUITY");
  assert.equal(checkPrediction(null, "CONTINUITY").passed, false);
});

test("missing state cannot erase a known ORIGINAL request budget breach", () => {
  const input = makeFixture("retry-clock-reset");
  input.requests[0].evidence.state = null;
  const old = rehearse(input).requests[0];
  assert.equal(old.outcome, "interrupted");
  assert.equal(old.reason, "original-request-budget");
  assert.equal(old.elapsedMs, 155);
  assert.equal(old.stateStatus, "unknown");
  assert.equal(old.responseStatus, "correct");
});

test("an incorrect response is interrupted even when state evidence is missing", () => {
  const input = makeFixture("wrong-response");
  input.requests[0].evidence.state = null;
  const old = rehearse(input).requests[0];
  assert.equal(old.outcome, "interrupted");
  assert.equal(old.reason, "incorrect-response");
  assert.equal(old.stateStatus, "unknown");
});

test("known changed state is interrupted even when response content is missing", () => {
  const input = makeFixture("state-loss");
  input.requests[0].evidence.response = null;
  const old = rehearse(input).requests[0];
  assert.equal(old.outcome, "interrupted");
  assert.equal(old.reason, "state-not-preserved");
  assert.equal(old.responseStatus, "unknown");
});
