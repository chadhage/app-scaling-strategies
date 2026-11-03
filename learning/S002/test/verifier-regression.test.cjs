"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runLesson, verifyLesson } = require("../lesson.js");

function assertRejected(result) {
  let verdict;
  assert.doesNotThrow(() => { verdict = verifyLesson(result); });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.scope, "educational-only");
}

test("verifier requires two distinct named staging instances, including on readiness rejection", () => {
  for (const readiness of ["ready", "unready", "misleading-500"]) {
    for (const identity of ["staging-1", "unknown", undefined]) {
      const result = runLesson({ readiness });
      result.warmup.instances[1].id = identity;
      assertRejected(result);
    }
  }
});

test("verifier rejects malformed or sparse readiness records without throwing", () => {
  for (const readiness of ["ready", "unready", "misleading-500"]) {
    for (const record of [null, undefined, false, "HTTP 200", [200]]) {
      const result = runLesson({ readiness });
      result.warmup.instances[1] = record;
      assertRejected(result);
    }
    const sparse = runLesson({ readiness });
    delete sparse.warmup.instances[1];
    assertRejected(sparse);
  }
});

test("verifier rejects invalid readiness field types even on a blocked result", () => {
  for (const readiness of ["ready", "unready", "misleading-500"]) {
    for (const [field, value] of [
      ["status", "503"],
      ["dependenciesReady", "false"],
      ["journeyReady", 0],
      ["configuration", null]
    ]) {
      const result = runLesson({ readiness });
      result.warmup.instances[1][field] = value;
      assertRejected(result);
    }
  }
});

test("invalid-input rejection preserves only the shape flags needed for educational verification", () => {
  for (const input of [null, [], false, 1, "production", { unexpected: "discarded-value" }]) {
    const result = runLesson(input);
    assert.equal(result.state, "blocked");
    assert.equal(result.routing.after, "v1");
    assert.equal(result.formerWorkers.recycled, false);
    assert.equal(verifyLesson(result).passed, true, "correct fail-closed rejection is explainable");
    assert.deepEqual(result.inputValidation, {
      isObject: input !== null && typeof input === "object" && !Array.isArray(input),
      knownKeysOnly: false
    });
    assert.doesNotMatch(JSON.stringify(result), /discarded-value|unexpected/);
  }
});

test("valid input cannot forge an invalid-selection rejection or omit validation evidence", () => {
  const forged = runLesson({ target: "staging" });
  forged.selection.target = "production";
  forged.target = "production";
  forged.reasons = [{ code: "invalid-selection", message: "Fabricated rejection." }];
  assertRejected(forged);
  for (const flags of [undefined, null, {}, { isObject: "true", knownKeysOnly: true },
    { isObject: false, knownKeysOnly: false }]) {
    const result = runLesson();
    result.inputValidation = flags;
    assertRejected(result);
  }
});
