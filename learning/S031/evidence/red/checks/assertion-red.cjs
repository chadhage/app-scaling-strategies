"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startRehearsal, visit } = require("../session.js");

test("shared mode preserves declared state after a version and instance switch", () => {
  const started = startRehearsal("shared");
  assert.equal(started.ok, true);
  const moved = visit(started.state, {
    clientId: "client-amber",
    destination: "v2/green-a",
    replyKind: "stored"
  });
  assert.equal(moved.ok, true);
  assert.equal(moved.report.httpStatus, 200);
  assert.equal(moved.report.outcome, "preserved");
  assert.equal(moved.report.observedProfile.revision, 7);
  assert.deepEqual(moved.report.observedProfile.cart, ["amber-token"]);
});
