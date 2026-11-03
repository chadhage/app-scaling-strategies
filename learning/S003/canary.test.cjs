"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  createRun, makeObservation, recordObservation, promote,
  advanceClock, rollback, assess, summarize
} = require("./canary.js");

const observe = (run, fixture = "safe") => recordObservation(run, makeObservation(run, fixture));

test("BDD: the first stable 5% cohort starts with one unverified attempted transition", () => {
  const run = createRun();
  assert.equal(run.desiredPercent, 5);
  assert.equal(run.attempts.length, 1);
  assert.equal(run.attempts[0].userId, "u01");
  assert.equal(summarize(run).unknown, 1);
  assert.equal(summarize(run).actualV2, null);
  assert.ok(assess(run).reasons.includes("missing-observation"));
});

test("BDD: fresh complete journeys permit one stage, not a jump or reused evidence", () => {
  const safe = observe(createRun());
  assert.equal(assess(safe).canPromote, true);
  assert.equal(summarize(safe).actualV2, 1);
  assert.equal(summarize(safe).unchanged, 19);
  assert.equal(summarize(safe).uninterrupted, 1);
  const next = promote(safe);
  assert.equal(next.desiredPercent, 25);
  assert.deepEqual(next.attempts.map(attempt => attempt.userId), ["u01", "u02", "u03", "u04", "u05"]);
  assert.equal(next.currentObservation, null);
  assert.equal(summarize(next).unknown, 4);
  assert.equal(promote(next).desiredPercent, 25);
  assert.equal(next.observations.length, 1);
});

test("BDD: HTTP 200 with excessive journey latency blocks the next increment", () => {
  const regressed = observe(createRun(), "regressed");
  const blocked = promote(regressed);
  assert.equal(blocked.desiredPercent, 5);
  assert.equal(blocked.attempts.length, 1);
  assert.equal(summarize(blocked).failed, 1);
  assert.equal(summarize(blocked).uninterrupted, 0);
  assert.ok(assess(blocked).reasons.includes("journey-regression"));
  assert.equal(blocked.trace.at(-1)?.type, "promotion-blocked");
});

for (const [field, value] of [["authentication", false], ["state", false], ["effects", 2], ["complete", false]]) {
  test(`BDD: the ${field} journey gate blocks otherwise healthy HTTP responses`, () => {
    const run = createRun();
    const observation = makeObservation(run);
    observation.users[0][field] = value;
    const result = recordObservation(run, observation);
    assert.ok(assess(result).reasons.includes("journey-regression"));
    assert.equal(summarize(result).failed, 1);
    assert.equal(promote(result).desiredPercent, 5);
  });
}

for (const [fixture, reason] of [
  ["missing", "missing-observation"],
  ["unknown", "unknown-outcome"],
  ["partial", "routing-mismatch"],
  ["stale", "stale-observation"],
  ["short-window", "short-window"]
]) {
  test(`BDD: ${fixture} evidence cannot authorize expansion`, () => {
    const run = observe(createRun(), fixture);
    assert.ok(assess(run).reasons.includes(reason), `${fixture} must explain ${reason}`);
    assert.equal(promote(run).desiredPercent, 5);
    assert.equal(assess(run).canPromote, false);
  });
}

test("BDD: configured traffic is not an observed destination or a migrated user", () => {
  const run = observe(createRun(), "partial");
  const summary = summarize(run);
  assert.equal(summary.desiredV2, 1);
  assert.equal(summary.actualV2, 0);
  assert.equal(summary.actualV1, 20);
  assert.equal(summary.attempted, 1);
  assert.equal(summary.uninterrupted, 0);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.unchanged, 19);
});

test("BDD: freshness expires after 60 seconds and a fresh recheck does not add migrations", () => {
  const safe = observe(createRun());
  assert.equal(assess(advanceClock(safe, 60)).canPromote, true);
  const stale = advanceClock(safe, 61);
  assert.ok(assess(stale).reasons.includes("stale-observation"));
  assert.equal(promote(stale).desiredPercent, 5);
  const refreshed = observe(stale);
  assert.equal(assess(refreshed).canPromote, true);
  assert.equal(summarize(refreshed).attempted, 1);
  assert.equal(summarize(refreshed).uninterrupted, 1);
  assert.equal(refreshed.observations.length, 2);
});

test("BDD: an earlier stage snapshot cannot validate new cohort admissions", () => {
  const first = observe(createRun());
  const next = promote(first);
  const reused = recordObservation(next, first.currentObservation);
  assert.ok(assess(reused).reasons.includes("wrong-stage"));
  assert.equal(summarize(reused).uninterrupted, 1);
  assert.equal(summarize(reused).unknown, 4);
  assert.equal(promote(reused).desiredPercent, 25);
});

for (const [fixture, outcome] of [["regressed", "failed"], ["unknown", "unknown"], ["missing", "unknown"]]) {
  test(`BDD: ${fixture} outcomes remain in the denominator after later safe evidence and rollback`, () => {
    const first = observe(createRun(), fixture);
    const later = observe(first);
    const recovered = rollback(later);
    assert.equal(summarize(later)[outcome], 1);
    assert.equal(assess(later).canPromote, false);
    assert.equal(recovered.desiredPercent, 0);
    assert.equal(recovered.phase, "rolled-back");
    assert.equal(summarize(recovered).attempted, 1);
    assert.equal(summarize(recovered)[outcome], 1);
    assert.equal(summarize(recovered).actualV2, null);
    assert.equal(recovered.observations.length, 2);
    assert.ok(recovered.trace.length > first.trace.length);
    assert.equal(promote(recovered).desiredPercent, 0);
    const rollbackObserved = observe(recovered);
    assert.equal(summarize(rollbackObserved).actualV1, 20);
    assert.equal(summarize(rollbackObserved)[outcome], 1);
  });
}

test("BDD: alternative stages and windows reach 100% without double counting unchanged users", () => {
  let run = createRun({ stages: [10, 30, 60, 100], windowSeconds: 60 });
  for (const [index, count] of [2, 6, 12, 20].entries()) {
    assert.equal(summarize(run).attempted, count);
    run = observe(run);
    assert.equal(assess(run).ready, true);
    assert.equal(summarize(run).uninterrupted, count);
    assert.equal(summarize(run).actualV2, count);
    if (index < 3) run = promote(run);
  }
  assert.equal(summarize(run).allMigrated, true);
  assert.equal(new Set(run.attempts.map(attempt => attempt.userId)).size, 20);
  assert.equal(assess(run).canPromote, false);
  assert.equal(promote(run).desiredPercent, 100);
});

test("BDD: invalid plans and non-positive or unbounded windows are rejected explicitly", () => {
  for (const options of [
    { stages: [25, 5, 100] }, { stages: [3, 100] }, { stages: [5, 25, 90] },
    { stages: [0, 100] }, { stages: [5, 5, 100] }, { stages: [] },
    { windowSeconds: 0 }, { windowSeconds: 301 }, { windowSeconds: NaN }
  ]) {
    assert.throws(() => createRun(options), RangeError);
  }
});

test("BDD: duplicate users and unknown destination values cannot satisfy complete evidence", () => {
  const run = createRun();
  const duplicate = makeObservation(run);
  duplicate.users[19].id = "u01";
  assert.ok(assess(recordObservation(run, duplicate)).reasons.includes("incomplete-coverage"));
  const invalid = makeObservation(run);
  invalid.users[0].destination = "unverified";
  const result = recordObservation(run, invalid);
  assert.equal(summarize(result).uninterrupted, 0);
  assert.equal(summarize(result).unknown, 1);
  assert.equal(assess(result).canPromote, false);
});

test("BDD: missing assertion values stay unknown instead of becoming successful truthy values", () => {
  const run = createRun();
  const observation = makeObservation(run);
  observation.users[0].authentication = "true";
  const result = recordObservation(run, observation);
  assert.equal(summarize(result).unknown, 1);
  assert.equal(summarize(result).uninterrupted, 0);
  assert.equal(assess(result).canPromote, false);
});

test("BDD: actions preserve prior snapshots and append an auditable trace", () => {
  const original = createRun();
  const before = JSON.stringify(original);
  const safe = observe(original);
  const next = promote(safe);
  assert.equal(JSON.stringify(original), before);
  assert.ok(original.trace.length > 0);
  assert.equal(safe.trace.at(-1)?.type, "observation");
  assert.equal(next.trace.at(-1)?.type, "promoted");
  assert.equal(next.trace.at(-1)?.desiredPercent, 25);
  assert.deepEqual(next.trace.at(-1)?.cohortAdded, ["u02", "u03", "u04", "u05"]);
});

test("malformed missing samples fail closed without throwing or fabricating migration", () => {
  const run = createRun();
  for (const users of [null, {}, "not samples"]) {
    const result = recordObservation(run, { ...makeObservation(run), users });
    assert.ok(assess(result).reasons.includes("missing-observation"));
    assert.equal(summarize(result).uninterrupted, 0);
    assert.equal(summarize(result).unknown, 1);
    assert.equal(promote(result).desiredPercent, 5);
  }
});

test("an unchanged v1 user's interruption blocks expansion without adding a migrated user", () => {
  const run = createRun();
  const sample = makeObservation(run);
  sample.users[19].state = false;
  const interrupted = recordObservation(run, sample);
  const laterSafe = observe(interrupted);
  assert.equal(summarize(interrupted).attempted, 1);
  assert.equal(summarize(interrupted).uninterrupted, 1);
  assert.equal(summarize(interrupted).interruptedUsers, 1);
  assert.equal(summarize(interrupted).unchanged, 19);
  assert.ok(assess(laterSafe).reasons.includes("retained-regression"));
  assert.equal(promote(laterSafe).desiredPercent, 5);
});

test("the portable page declares restrictive CSP, local assets, accessible controls and honest scope", () => {
  const html = readFileSync(join(__dirname, "index.html"), "utf8");
  const ui = readFileSync(join(__dirname, "lesson.js"), "utf8");
  const manifest = JSON.parse(readFileSync(join(__dirname, "manifest.json"), "utf8"));
  for (const directive of ["default-src 'none'", "connect-src 'none'", "script-src 'self'", "style-src 'self'", "form-action 'none'"]) {
    assert.ok(html.includes(directive), `Missing CSP directive: ${directive}`);
  }
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /<label for="fixture">/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Microsoft disclaimer/);
  assert.match(html, /https:\/\/learn\.microsoft\.com\//);
  assert.doesNotMatch(html, /\bon\w+\s*=|<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.deepEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]), ["canary.js", "lesson.js"]);
  assert.doesNotMatch(ui, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie|innerHTML/);
  assert.equal(manifest.cardId, "A-S003");
  assert.equal(manifest.kanoUnit, "A-S003");
  assert.equal(manifest.packet, "LP-RINGS");
  assert.equal(manifest.iac.status, "N/A");
  assert.equal(manifest.scope.nativeBS003Proof, false);
  assert.equal(manifest.scope.parentDS003Complete, false);
});
