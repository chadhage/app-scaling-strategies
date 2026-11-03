"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const lesson = require("./experiment.js");

const fresh = () => lesson.createRehearsal();
const hold = (state = fresh(), rounds = 3, condition = "stable-compatible") =>
  lesson.holdExperiment(state, { rounds, condition });
const view = lesson.inspect;
const account = () => ({ schemaVersion: 1, credits: 1000, tickets: 0, effects: [] });
const toConvergence = () => lesson.requestConvergence(hold());

test("A-S004 starts with 50% desired routing, not a completed migration", () => {
  const result = view(fresh());
  assert.equal(result.desiredPercent, 50);
  assert.equal(result.phase, "split");
  assert.equal(result.migration.status, "not-complete");
});

test("configured 50/50 manufactures no observed destinations, state or effects", () => {
  const result = view(fresh());
  assert.equal(result.observed.unknown, 20);
  assert.equal(result.observed.hasSample, false);
  assert.equal(result.observed.v1 + result.observed.v2, 0);
  assert.equal(result.impact.status, "unknown");
  assert.equal(result.rows.length, 20);
  assert.ok(result.rows.every((row) =>
    row.observedVersion === null && row.credits === null && row.effectCount === null));
});

test("convergence before a complete observed experiment is explicitly blocked", () => {
  const result = view(lesson.requestConvergence(fresh()));
  assert.equal(result.desiredPercent, 50);
  assert.equal(result.phase, "split");
  assert.match(result.trace.at(-1).message, /blocked.*observ/i);
});

test("fixture buckets make stable intended cohorts explicit and reproducible", () => {
  const rows = view(fresh()).rows;
  assert.deepEqual(rows.map((row) => row.bucket), Array.from({ length: 20 }, (_, i) => 2 + i * 5));
  assert.equal(rows.filter((row) => row.cohort === "A").length, 10);
  assert.equal(rows.filter((row) => row.cohort === "B").length, 10);
  assert.deepEqual(rows, view(fresh()).rows);
});

test("twelve held rounds preserve every stable cohort and the actual observed split", () => {
  const state = hold(fresh(), 12);
  const result = view(state);
  assert.equal(result.sampleCount, 12);
  assert.equal(result.simulatedMinutes, 12);
  assert.deepEqual([result.observed.v1, result.observed.v2, result.observed.unknown], [10, 10, 0]);
  assert.ok(state.rounds.every((round) =>
    round.rows.every((row) => row.observedVersion === row.plannedVersion)));
  assert.equal(result.checks.cohorts, "passed");
});

test("a sustained passing A/B experiment still has not migrated all users", () => {
  const result = view(hold(fresh(), 12));
  assert.equal(result.impact.status, "passed");
  assert.equal(result.desiredPercent, 50);
  assert.equal(result.migration.status, "not-complete");
  assert.match(result.migration.message, /v1|split/i);
});

test("v1 and v2 yield equivalent canonical state for a new transaction", () => {
  const a = lesson.transact("v1", account(), "r001-u01");
  const b = lesson.transact("v2", account(), "r001-u01");
  assert.equal(a.readable, true);
  assert.equal(b.readable, true);
  assert.deepEqual(a.account, b.account);
  assert.deepEqual(a.account, {
    schemaVersion: 1, credits: 999, tickets: 1, effects: ["r001-u01"]
  });
});

test("the shared idempotency key prevents duplicate effects across version retries", () => {
  const first = lesson.transact("v1", account(), "r001-u01");
  const retry = lesson.transact("v2", first.account, "r001-u01");
  const again = lesson.transact("v1", retry.account, "r001-u01");
  assert.equal(again.account.tickets, 1);
  assert.equal(again.account.credits, 999);
  assert.deepEqual(again.account.effects, ["r001-u01"]);
  assert.deepEqual(first.account, retry.account);
});

test("each held observation checks cumulative state and one effect per transaction", () => {
  const result = view(hold(fresh(), 3));
  assert.equal(result.checks.stateEffects, "passed");
  assert.equal(result.rows.length, 20);
  assert.ok(result.rows.every((row) =>
    row.credits === 997 && row.expectedCredits === 997 &&
    row.tickets === 3 && row.expectedTickets === 3 && row.effectCount === 1 &&
    row.schemaVersion === 1 && row.outcome === "passed"));
});

test("requesting convergence changes desire but retains the last observed 10/10 sample", () => {
  const state = toConvergence();
  const result = view(state);
  assert.equal(result.desiredPercent, 100);
  assert.equal(result.phase, "converging");
  assert.equal(result.currentEvidence, false);
  assert.deepEqual([result.observed.v1, result.observed.v2], [10, 10]);
  assert.equal(result.observed.desiredPercent, 50);
  assert.equal(result.migration.status, "unknown");
  assert.match(result.migration.message, /new.*observ|predates/i);
});

test("one complete compatible current-epoch sample deliberately converges all fixture users", () => {
  const state = lesson.observeConvergence(toConvergence(), "stable-compatible");
  const result = view(state);
  assert.equal(result.currentEvidence, true);
  assert.equal(result.phase, "converged");
  assert.equal(result.migration.status, "passed");
  assert.deepEqual([result.observed.v1, result.observed.v2, result.observed.unknown], [0, 20, 0]);
  assert.ok(result.rows.every((row) => row.credits === 996 && row.tickets === 4 && row.effectCount === 1));
  assert.equal(result.history.length, 4);
});

test("wrong unstable assignment fails even when the last round returns to its first route", () => {
  const state = hold(fresh(), 3, "unstable-assignment");
  const result = view(state);
  assert.equal(state.rounds[1].outcome, "failed");
  assert.equal(state.rounds[2].outcome, "passed");
  assert.equal(result.impact.status, "failed");
  assert.equal(result.impact.failedRounds, 1);
  assert.equal(result.checks.cohorts, "failed");
  const blocked = view(lesson.requestConvergence(state));
  assert.equal(blocked.desiredPercent, 50);
  assert.match(blocked.trace.at(-1).message, /blocked.*failed/i);
});

test("incompatible v2 schema and lost idempotency produce honest failed state/effect rows", () => {
  const state = hold(fresh(), 1, "incompatible-state");
  const result = view(state);
  assert.equal(result.impact.status, "failed");
  assert.equal(result.checks.stateEffects, "failed");
  const b = result.rows.filter((row) => row.cohort === "B");
  assert.equal(b.length, 10);
  assert.ok(b.every((row) =>
    row.schemaVersion === 2 && row.effectCount === 2 && row.tickets === 2 &&
    row.expectedTickets === 1 && row.outcome === "failed"));
  assert.ok(result.rows.filter((row) => row.cohort === "A").every((row) => row.outcome === "passed"));
  assert.equal(view(lesson.requestConvergence(state)).desiredPercent, 50);
});

test("later compatible observations cannot repair or erase the earlier incompatible attempt", () => {
  const failed = hold(fresh(), 1, "incompatible-state");
  const later = hold(failed, 1);
  assert.equal(view(later).impact.status, "failed");
  assert.equal(later.rounds[0].condition, "incompatible-state");
  assert.equal(view(lesson.requestConvergence(later)).phase, "split");
});

test("missing evidence excludes u20 from observed counts and fabricates no state", () => {
  const state = hold(fresh(), 1, "missing-observation");
  const result = view(state);
  assert.deepEqual([result.observed.v1, result.observed.v2, result.observed.unknown], [10, 9, 1]);
  assert.equal(result.impact.status, "unknown");
  const missing = result.rows.find((row) => row.id === "u20");
  assert.equal(missing.observedVersion, null);
  assert.equal(missing.credits, null);
  assert.equal(missing.effectCount, null);
  assert.equal(missing.outcome, "unknown");
  assert.equal(view(lesson.requestConvergence(state)).desiredPercent, 50);
});

test("a later complete sample retains the earlier unknown user outcome", () => {
  const unknown = hold(fresh(), 1, "missing-observation");
  const later = hold(unknown, 1);
  assert.equal(view(later).impact.unknownUserObservations, 1);
  assert.equal(later.rounds[0].rows.at(-1).outcome, "unknown");
  assert.notEqual(view(later).impact.status, "passed");
  assert.equal(view(lesson.requestConvergence(later)).phase, "split");
});

test("100% configured traffic does not hide a lagging v1 observation", () => {
  const state = lesson.observeConvergence(toConvergence(), "lagging-route");
  const result = view(state);
  assert.equal(result.desiredPercent, 100);
  assert.deepEqual([result.observed.v1, result.observed.v2, result.observed.unknown], [1, 19, 0]);
  assert.equal(result.migration.status, "failed");
  assert.equal(result.impact.status, "failed");
  assert.equal(result.phase, "converging");
});

test("missing convergence observations stay unknown rather than becoming 100% success", () => {
  const state = lesson.observeConvergence(toConvergence(), "missing-observation");
  const result = view(state);
  assert.deepEqual([result.observed.v1, result.observed.v2, result.observed.unknown], [0, 19, 1]);
  assert.equal(result.migration.status, "unknown");
  assert.equal(result.impact.status, "unknown");
  assert.equal(result.phase, "converging");
});

test("a later passing convergence sample does not overwrite failed user-impact history", () => {
  const failed = lesson.observeConvergence(toConvergence(), "lagging-route");
  const later = lesson.observeConvergence(failed, "stable-compatible");
  const result = view(later);
  assert.deepEqual([result.observed.v1, result.observed.v2], [0, 20]);
  assert.equal(result.impact.status, "failed");
  assert.equal(result.migration.status, "failed");
  assert.equal(result.phase, "converging");
});

test("invalid hold counts and conditions are rejected without mutating evidence", () => {
  const state = hold(fresh(), 1);
  const before = JSON.stringify(state);
  for (const rounds of ["", " ", "3abc", "1.5", "1.0", "03", 0, -1, 13, 1.5, NaN, Infinity, null]) {
    assert.throws(() => hold(state, rounds), /round|integer/i);
    assert.equal(JSON.stringify(state), before);
  }
  for (const condition of ["", "safe-ish", null, {}, "lagging-route"]) {
    assert.throws(() => hold(state, 1, condition), /condition|fixture|convergence/i);
    assert.equal(JSON.stringify(state), before);
  }
});

test("invalid convergence conditions and wrong-phase actions preserve evidence", () => {
  const state = toConvergence();
  const before = JSON.stringify(state);
  assert.throws(() => lesson.observeConvergence(state, "invented-safe"), /condition|fixture/i);
  assert.throws(() => lesson.observeConvergence(state, "unstable-assignment"), /hold|split|condition/i);
  assert.throws(() => hold(state), /split|hold/i);
  assert.throws(() => lesson.observeConvergence(fresh(), "stable-compatible"), /convergence|request/i);
  assert.equal(JSON.stringify(state), before);
});

test("transaction validation rejects invalid versions, state and keys without mutation", () => {
  const input = account();
  const before = JSON.stringify(input);
  assert.throws(() => lesson.transact("v3", input, "r001-u01"), /version/i);
  assert.throws(() => lesson.transact("v1", null, "r001-u01"), /state|account/i);
  assert.throws(() => lesson.transact("v1", input, null), /key|transaction/i);
  assert.throws(() => lesson.transact("v1", input, "r001-u01", "invented"), /path|compatib/i);
  assert.equal(JSON.stringify(input), before);
});

test("normal actions are immutable and Reset can use a separate clean initial state", () => {
  const original = fresh();
  const before = JSON.stringify(original);
  const failed = hold(original, 1, "incompatible-state");
  assert.notStrictEqual(failed, original);
  assert.equal(JSON.stringify(original), before);
  const reset = fresh();
  assert.equal(view(reset).desiredPercent, 50);
  assert.equal(view(reset).sampleCount, 0);
  assert.equal(view(reset).impact.failedRounds, 0);
  assert.equal(view(reset).impact.unknownRounds, 0);
  assert.equal(view(reset).observed.hasSample, false);
  assert.equal(view(hold(reset, 1)).impact.status, "passed");
});

test("the bounded local trace rejects rounds beyond 100 without discarding history", () => {
  let state = fresh();
  for (let i = 0; i < 8; i += 1) state = hold(state, 12);
  state = hold(state, 4);
  assert.equal(view(state).sampleCount, 100);
  const before = JSON.stringify(state);
  assert.throws(() => hold(state, 1), /100|limit/i);
  assert.equal(JSON.stringify(state), before);
});
