"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  startRehearsal, visit, inspectReply, makeMatchingReply, summarize
} = require("../session.js");

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

function start(mode = "shared") {
  const result = startRehearsal(mode);
  assert.equal(result.ok, true);
  return result.state;
}

function request(overrides = {}) {
  return {
    clientId: "client-amber",
    destination: "v2/green-a",
    replyKind: "stored",
    ...overrides
  };
}

function supplied(state, change, overrides = {}) {
  const command = request(overrides);
  const sample = makeMatchingReply(state, command);
  assert.equal(sample.ok, true);
  const reply = sample.reply;
  const replacement = change(reply);
  return inspectReply(state, {
    ...command,
    payloadText: JSON.stringify(replacement === undefined ? reply : replacement)
  });
}

test("shared mode preserves both isolated clients through repeated routes", () => {
  let state = start();
  for (const destination of ["v2/green-a", "v1/blue-b", "v2/green-b", "v1/blue-a"]) {
    for (const clientId of ["client-amber", "client-cobalt"]) {
      const read = visit(state, request({ destination, clientId }));
      assert.equal(read.ok, true);
      assert.equal(read.report.outcome, "preserved");
      assert.equal(read.report.assertions.every((item) => item.status === "pass"), true);
      assert.equal(read.report.observedClientId, clientId);
      assert.equal(read.report.observedRoute.version, destination.split("/")[0]);
      assert.equal(read.report.observedRoute.instance, destination.split("/")[1]);
      assert.deepEqual(read.report.observedProfile, read.report.expectedProfile);
      state = read.state;
    }
  }
  assert.deepEqual(summarize(state), {
    attempted: 8, preserved: 8, interrupted: 0, unknown: 0,
    allPreserved: true, outcome: "all-observed-preserved"
  });
  assert.notDeepEqual(state.clients[0].expectedProfile, state.clients[1].expectedProfile);
});

for (const destination of ["v2/green-a", "v1/blue-b"]) {
  test(`local mode detects HTTP 200 state loss at ${destination}`, () => {
    const state = start("local");
    const before = structuredClone(state);
    const read = visit(state, request({ destination }));
    assert.equal(read.report.httpStatus, 200);
    assert.equal(read.report.outcome, "interrupted");
    assert.deepEqual(read.report.observedProfile, {});
    assert.equal(read.report.assertions.find((item) => item.code === "http").status, "pass");
    assert.equal(read.report.assertions.find((item) => item.code === "profile.present").status, "fail");
    assert.deepEqual(read.report.expectedProfile, state.clients[0].expectedProfile);
    assert.deepEqual(state, before, "visits must not mutate their input snapshot");
    assert.equal(read.state.trace.at(-1).event, "continuity.interrupted");
  });
}

test("local origin succeeds but returning later does not erase the earlier loss", () => {
  let state = start("local");
  const failed = visit(state, request());
  state = failed.state;
  const returned = visit(state, request({ destination: "v1/blue-a" }));
  assert.equal(returned.report.outcome, "preserved");
  assert.equal(returned.report.observedProfile.revision, 7);
  assert.equal(summarize(returned.state).outcome, "interrupted");
  assert.equal(summarize(returned.state).allPreserved, false);
  assert.equal(returned.state.attempts[0].outcome, "interrupted");
  assert.deepEqual(returned.state.trace.slice(0, state.trace.length), state.trace);
});

test("co-locating clients at cobalt's origin cannot leak cobalt's local profile", () => {
  const state = start("local");
  const amber = visit(state, request({ destination: "v1/blue-b" }));
  const cobalt = visit(amber.state, request({
    clientId: "client-cobalt", destination: "v1/blue-b"
  }));
  assert.equal(amber.report.outcome, "interrupted");
  assert.equal(cobalt.report.outcome, "preserved");
  assert.equal(cobalt.report.observedProfile.profileId, "profile-cobalt");
});

for (const replyKind of ["empty", "reset", "stale"]) {
  test(`HTTP 200 ${replyKind} fixture interrupts without changing the store`, () => {
    const state = start();
    const broken = visit(state, request({ replyKind }));
    assert.equal(broken.report.httpStatus, 200);
    assert.equal(broken.report.outcome, "interrupted");
    assert.deepEqual(broken.state.stores, state.stores);
    const recovered = visit(broken.state, request());
    assert.equal(recovered.report.outcome, "preserved");
    assert.equal(summarize(recovered.state).outcome, "interrupted");
  });
}

for (const [label, change, code] of [
  ["empty object", (reply) => { reply.profile = {}; }, "profile.present"],
  ["null profile", (reply) => { reply.profile = null; }, "profile.present"],
  ["reset revision", (reply) => { reply.profile.revision = 0; }, "profile.revision"],
  ["stale revision", (reply) => { reply.profile.revision -= 1; }, "profile.revision"],
  ["string revision", (reply) => { reply.profile.revision = "7"; }, "profile.revision"],
  ["missing theme", (reply) => { delete reply.profile.theme; }, "profile.theme"],
  ["changed draft", (reply) => { reply.profile.draft = "silently discarded"; }, "profile.draft"],
  ["empty cart", (reply) => { reply.profile.cart = []; }, "profile.cart"],
  ["wrong schema", (reply) => { reply.profile.schema = 2; }, "profile.schema"],
  ["wrong client", (reply) => { reply.clientId = "client-cobalt"; }, "client"],
  ["wrong version", (reply) => { reply.version = "v1"; }, "version"],
  ["wrong instance", (reply) => { reply.instance = "green-b"; }, "instance"],
  ["failed HTTP status", (reply) => { reply.httpStatus = 503; }, "http"]
]) {
  test(`supplied ${label} cannot pass even with otherwise matching state`, () => {
    const state = start();
    const read = supplied(state, change);
    assert.equal(read.ok, true);
    assert.equal(read.report.outcome, "interrupted");
    assert.equal(read.report.assertions.find((item) => item.code === code).status, "fail");
    assert.deepEqual(read.state.stores, state.stores);
    assert.equal(read.report.source, "supplied reply — not a store read");
  });
}

test("another client's complete profile is not the selected client's continuity", () => {
  const state = start();
  const read = supplied(state, (reply) => {
    reply.profile = structuredClone(state.clients[1].expectedProfile);
  });
  assert.equal(read.report.outcome, "interrupted");
  assert.equal(read.report.assertions.find((item) => item.code === "profile.profileId").status, "fail");
});

for (const [label, change] of [
  ["null reply", () => null],
  ["array reply", () => []],
  ["empty reply", () => ({})],
  ["missing profile", (reply) => { delete reply.profile; }],
  ["unknown status", (reply) => { delete reply.httpStatus; }],
  ["string HTTP status", (reply) => { reply.httpStatus = "200"; }],
  ["out-of-range HTTP status", (reply) => { reply.httpStatus = 999; }],
  ["missing client identity", (reply) => { delete reply.clientId; }],
  ["missing version", (reply) => { delete reply.version; }],
  ["missing instance", (reply) => { delete reply.instance; }],
  ["malformed profile", (reply) => { reply.profile = ["not a profile"]; }]
]) {
  test(`${label} is unknown rather than successful`, () => {
    const state = start();
    const read = supplied(state, change);
    assert.equal(read.ok, true);
    assert.equal(read.report.outcome, "unknown");
    assert.equal(summarize(read.state).allPreserved, false);
    assert.ok(read.report.assertions.some((item) => item.status === "unknown"));
  });
}

test("unknown fixture survives later good reads in run-level accounting", () => {
  const unknown = visit(start(), request({ replyKind: "unknown" }));
  assert.equal(unknown.report.httpStatus, 200);
  assert.equal(unknown.report.outcome, "unknown");
  const good = visit(unknown.state, request());
  assert.equal(good.report.outcome, "preserved");
  assert.equal(summarize(good.state).outcome, "unknown");
  assert.equal(summarize(good.state).unknown, 1);
});

for (const mode of [undefined, null, "", "SHARED", "shared-ish", {}, []]) {
  test(`unrecognized mode ${JSON.stringify(mode)} is explicitly rejected`, () => {
    const created = startRehearsal(mode);
    assert.equal(created.ok, false);
    assert.equal(created.error.code, "mode.invalid");
  });
}

for (const overrides of [
  { clientId: "unknown-client" },
  { clientId: "__proto__" },
  { clientId: null },
  { destination: "v3/unknown" },
  { destination: "v2/blue-a" },
  { destination: "" },
  { replyKind: "magic-success" },
  { replyKind: null }
]) {
  test(`invalid request ${JSON.stringify(overrides)} is non-destructive`, () => {
    const state = visit(start(), request({ replyKind: "reset" })).state;
    const before = structuredClone(state);
    const rejected = visit(state, request(overrides));
    assert.equal(rejected.ok, false);
    assert.ok(rejected.error.message.length > 0);
    assert.deepEqual(state, before);
  });
}

for (const payloadText of ["{not-json", "", undefined, 7, " ".repeat(12001)]) {
  test(`invalid supplied text (${typeof payloadText}) leaves all history intact`, () => {
    const state = visit(start(), request()).state;
    const before = structuredClone(state);
    const result = inspectReply(state, { ...request(), payloadText });
    assert.equal(result.ok, false);
    assert.ok(result.error.code.startsWith("reply."));
    assert.deepEqual(state, before);
  });
}

test("invalid state and erased declaration cannot manufacture continuity", () => {
  assert.equal(visit(null, request()).ok, false);
  assert.equal(inspectReply(undefined, request()).ok, false);
  const state = start();
  state.clients[0].expectedProfile = {};
  assert.equal(visit(state, request()).ok, false);
  assert.equal(summarize(state).allPreserved, false);
});

test("sample preparation returns a detached illustration, not a read or a write", () => {
  const state = start("local");
  const before = structuredClone(state);
  const sample = makeMatchingReply(state, request());
  sample.reply.profile.cart.push("not-acknowledged");
  assert.deepEqual(state, before);
  assert.equal(visit(state, request()).report.outcome, "interrupted");
});

test("switch and reset create independent untested runs with the original declarations", () => {
  const failed = visit(start("local"), request()).state;
  const switched = start("shared");
  const reset = start("local");
  for (const state of [switched, reset]) {
    assert.equal(state.attempts.length, 0);
    assert.equal(summarize(state).outcome, "not-tested");
    assert.equal(summarize(state).allPreserved, false);
    assert.equal(state.trace.length, 3);
    assert.equal(state.clients[0].expectedProfile.revision, 7);
  }
  assert.equal(failed.attempts[0].outcome, "interrupted");
  assert.equal(visit(switched, request()).report.outcome, "preserved");
  assert.equal(visit(reset, request()).report.outcome, "interrupted");
});

test("HTML-looking supplied state stays data in the assertion report", () => {
  const text = "<img src=x onerror=alert('synthetic')>";
  const read = supplied(start(), (reply) => { reply.profile.draft = text; });
  assert.equal(read.report.outcome, "interrupted");
  assert.equal(read.report.observedProfile.draft, text);
});
