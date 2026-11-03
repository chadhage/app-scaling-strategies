"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const model = require(process.env.S005_MODEL ? path.resolve(process.env.S005_MODEL) : "./migration.js");
const { createRehearsal, dispatch, verifyIsolation, TENANT_IDS, MAX_STEPS } = model;
const clone = value => JSON.parse(JSON.stringify(value));
const act = (state, action, tenantId = "cedar") => dispatch(state, { action, tenantId });
const migrated = (tenantId = "cedar") => act(act(createRehearsal(), "sync", tenantId), "migrate", tenantId);
const assertUnchanged = (before, after) => assert.deepEqual(after.tenants, before.tenants);

test("A-S005 stub loads and the explicit synthetic fixture is deterministic", () => {
  assert.equal(typeof dispatch, "function");
  assert.deepEqual(createRehearsal(), createRehearsal());
  const state = createRehearsal();
  assert.equal(state.fixture, "S005-fixture-v1");
  assert.equal(state.clock, 0);
  assert.deepEqual(Object.keys(state.tenants), ["cedar", "birch", "maple"]);
  for (const tenant of Object.values(state.tenants)) {
    assert.equal(tenant.route, "source");
    assert.deepEqual(tenant.owners, { source: true, target: false });
    assert.equal(tenant.fence, 1);
    assert.equal(tenant.target.data.revision, 0);
  }
});

test("A-S005 migration before synchronization safely blocks", () => {
  const before = createRehearsal();
  const after = act(before, "migrate");
  assert.equal(after.last?.code, "not-synchronized");
  assert.equal(after.last?.status, "blocked");
  assertUnchanged(before, after);
  assert.equal(after.last.intendedDestination, "target");
  assert.equal(after.last.configuredDestination, "source");
  assert.equal(after.last.observedDestination, null);
});

test("A-S005 synchronization copies data, not business effects or ownership", () => {
  const before = act(createRehearsal(), "write");
  const after = act(before, "sync");
  assert.equal(after.last?.code, "synchronized");
  const tenant = after.tenants.cedar;
  assert.deepEqual(tenant.target.data, tenant.source.data);
  assert.equal(tenant.syncedRevision, tenant.source.data.revision);
  assert.equal(tenant.route, "source");
  assert.deepEqual(tenant.owners, { source: true, target: false });
  assert.equal(tenant.source.effects.writes, 1);
  assert.deepEqual(tenant.target.effects, { writes: 0, jobs: 0 });
  assert.equal(after.last.copiedRecords, 1);
  assert.equal(after.last.observedDestination, null);
  assert.notStrictEqual(tenant.source.data, tenant.target.data);
});

for (const tenantId of TENANT_IDS) {
  test(`A-S005 migrates only ${tenantId} with an exclusive fenced handoff`, () => {
    const before = act(createRehearsal(), "sync", tenantId);
    const after = act(before, "migrate", tenantId);
    const tenant = after.tenants[tenantId];
    assert.equal(after.last?.code, "migrated");
    assert.equal(tenant.route, "target");
    assert.deepEqual(tenant.owners, { source: false, target: true });
    assert.equal(tenant.fence, 2);
    assert.deepEqual(tenant.tokens, { source: 1, target: 2 });
    assert.equal(after.last.observedDestination, null);
    assert.deepEqual(after.last.effects, {
      source: { writes: 0, jobs: 0 }, target: { writes: 0, jobs: 0 }
    });
    for (const other of TENANT_IDS.filter(id => id !== tenantId)) {
      assert.deepEqual(after.tenants[other], before.tenants[other]);
    }
    assert.equal(after.last.isolation.passed, true);
  });
}

test("A-S005 intended migration is not confused with an observed synthetic request", () => {
  let state = act(createRehearsal(), "read");
  assert.equal(state.tenants.cedar.observation?.destination, "source");
  state = act(act(state, "sync"), "migrate");
  assert.equal(state.last?.observedDestination, null);
  assert.equal(state.tenants.cedar.observation.destination, "source");
  assert.equal(state.tenants.cedar.observation.step, 1);
  state = act(state, "read");
  assert.equal(state.last.observedDestination, "target");
  assert.equal(state.tenants.cedar.observation.destination, "target");
  assert.equal(state.tenants.cedar.observation.step, 4);
});

test("A-S005 a source write invalidates an earlier synchronization", () => {
  let state = act(createRehearsal(), "sync");
  state = act(state, "write");
  assert.equal(state.tenants.cedar.source.data.credits, 125);
  assert.equal(state.tenants.cedar.source.data.revision, 2);
  const before = clone(state);
  state = act(state, "migrate");
  assert.equal(state.last?.code, "not-synchronized");
  assertUnchanged(before, state);
  state = act(act(state, "sync"), "migrate");
  assert.equal(state.last.code, "migrated");
  assert.equal(state.tenants.cedar.target.data.credits, 125);
});

test("A-S005 a source background effect also invalidates synchronization", () => {
  let state = act(act(createRehearsal(), "sync"), "job");
  assert.equal(state.tenants.cedar.source.data.fulfilledJobs, 1);
  const before = clone(state);
  state = act(state, "migrate");
  assert.equal(state.last?.code, "not-synchronized");
  assertUnchanged(before, state);
});

test("A-S005 exactly one routed write and background job affect only target", () => {
  const before = migrated();
  let state = act(before, "write");
  assert.equal(state.last?.observedDestination, "target");
  assert.deepEqual(state.last.effects, {
    source: { writes: 0, jobs: 0 }, target: { writes: 1, jobs: 0 }
  });
  state = act(state, "job");
  assert.equal(state.last.observedDestination, "target");
  assert.deepEqual(state.tenants.cedar.target.effects, { writes: 1, jobs: 1 });
  assert.deepEqual(state.tenants.cedar.source, before.tenants.cedar.source);
  assert.equal(state.tenants.cedar.target.data.fulfilledJobs, 1);
  assert.equal(state.tenants.cedar.target.data.credits, 125);
  assert.equal(state.tenants.cedar.target.data.revision, 3);
  for (const other of ["birch", "maple"]) assert.deepEqual(state.tenants[other], before.tenants[other]);
});

test("A-S005 captured source worker is fenced out after migration", () => {
  const before = migrated();
  const after = act(before, "source-worker");
  assert.equal(after.last?.code, "stale-fence");
  assert.equal(after.last.status, "blocked");
  assert.equal(after.last.intendedDestination, "source");
  assert.equal(after.last.observedDestination, null);
  assertUnchanged(before, after);
});

test("A-S005 a source worker is valid only while its captured fence owns source", () => {
  const after = act(createRehearsal(), "source-worker");
  assert.equal(after.last?.code, "job-applied");
  assert.equal(after.last.observedDestination, "source");
  assert.equal(after.tenants.cedar.source.effects.jobs, 1);
  assert.equal(after.tenants.cedar.target.effects.jobs, 0);
});

for (const action of ["migrate", "sync", "read", "write", "job", "source-worker"]) {
  test(`A-S005 dual ownership blocks ${action} without any tenant mutation`, () => {
    const before = act(act(createRehearsal(), "sync"), "dual-ownership");
    assert.deepEqual(before.tenants.cedar.owners, { source: true, target: true });
    const after = act(before, action);
    assert.equal(after.last?.code, "dual-ownership");
    assert.equal(after.last.status, "blocked");
    assert.equal(after.last.observedDestination, null);
    assertUnchanged(before, after);
  });
}

test("A-S005 dual ownership remains unsafe even after a target handoff", () => {
  const before = act(migrated(), "dual-ownership");
  const after = act(before, "job");
  assert.equal(after.last?.code, "dual-ownership");
  assertUnchanged(before, after);
});

test("A-S005 migration cannot replay a handoff or copy back over target data", () => {
  const before = act(migrated(), "write");
  for (const action of ["migrate", "sync"]) {
    const after = act(before, action);
    assert.equal(after.last?.code, "already-target");
    assert.equal(after.tenants.cedar.fence, 2);
    assertUnchanged(before, after);
  }
});

test("A-S005 a proposed unrelated-tenant route change is detected and not applied", () => {
  const before = act(createRehearsal(), "sync");
  const after = act(before, "audit-unrelated");
  assert.equal(after.last?.code, "unrelated-tenant-change");
  assert.equal(after.last.status, "blocked");
  assert.deepEqual(after.last.proposalIsolation.changedTenants, ["birch"]);
  assert.equal(after.last.proposalIsolation.passed, false);
  assert.equal(after.last.isolation.passed, true);
  assertUnchanged(before, after);
});

test("A-S005 isolation verifier detects route, data, effect, fence and observation drift", () => {
  const before = createRehearsal();
  for (const change of [
    tenant => { tenant.route = "target"; },
    tenant => { tenant.source.data.credits += 1; },
    tenant => { tenant.target.effects.jobs += 1; },
    tenant => { tenant.owners.target = true; },
    tenant => { tenant.fence += 1; },
    tenant => { tenant.tokens.source += 1; },
    tenant => { tenant.observation = { destination: "target", step: 1 }; }
  ]) {
    const candidate = clone(before);
    change(candidate.tenants.maple);
    const result = verifyIsolation(before, candidate, "cedar");
    assert.equal(result.passed, false);
    assert.deepEqual(result.changedTenants, ["maple"]);
  }
  const candidate = clone(before);
  candidate.tenants.cedar.route = "target";
  assert.equal(verifyIsolation(before, candidate, "cedar").passed, true);
});

test("A-S005 missing or additional tenants cannot pass the isolation verifier", () => {
  const before = createRehearsal();
  const missing = clone(before);
  delete missing.tenants.maple;
  assert.equal(verifyIsolation(before, missing, "cedar").passed, false);
  const extra = clone(before);
  extra.tenants.unknown = clone(extra.tenants.birch);
  assert.equal(verifyIsolation(before, extra, "cedar").passed, false);
  assert.equal(verifyIsolation(null, before, "cedar").passed, false);
});

for (const command of [
  null, "migrate", {}, { tenantId: "cedar" },
  { action: "migrate", tenantId: "unknown" },
  { action: "migrate", tenantId: "__proto__" },
  { action: "migrate", tenantId: "constructor" },
  { action: "delete", tenantId: "cedar" },
  { action: "toString", tenantId: "cedar" },
  { action: "migrate", tenantId: "cedar", destination: "https://example.invalid" },
  { action: "write", tenantId: ["cedar"] },
  { action: "job", tenantId: "cedar", count: 100000 }
]) {
  test(`A-S005 rejects unsupported command ${JSON.stringify(command)}`, () => {
    const before = createRehearsal();
    const after = dispatch(before, command);
    assert.equal(after.last?.status, "blocked");
    assert.ok(["unsupported-input", "unknown-tenant", "unknown-action"].includes(after.last.code));
    assertUnchanged(before, after);
  });
}

test("A-S005 deterministic synthetic clock, immutable input, and bounded trace", () => {
  const before = createRehearsal();
  const saved = clone(before);
  const first = act(before, "sync");
  assert.deepEqual(before, saved);
  assert.deepEqual(first, act(before, "sync"));
  assert.equal(first.clock, 1);
  assert.equal(first.last?.step, 1);
  let state = before;
  for (let step = 0; step < MAX_STEPS; step += 1) state = act(state, "read");
  assert.equal(state.clock, MAX_STEPS);
  assert.equal(state.trace.length, MAX_STEPS);
  const after = act(state, "write");
  assert.equal(after.last?.code, "step-limit");
  assert.equal(after.clock, MAX_STEPS);
  assert.ok(after.trace.length <= MAX_STEPS);
  assertUnchanged(state, after);
});

test("A-S005 a fresh Reset fixture clears all execution evidence and business effects", () => {
  const used = act(act(migrated(), "job"), "write");
  assert.equal(used.tenants.cedar.target.effects.writes, 1);
  const reset = createRehearsal();
  assert.equal(reset.clock, 0);
  assert.deepEqual(reset.trace, []);
  assert.equal(reset.last, null);
  assert.equal(reset.tenants.cedar.observation, null);
  assert.equal(reset.tenants.cedar.source.effects.jobs, 0);
  assert.equal(reset.tenants.cedar.target.effects.writes, 0);
  assert.equal(reset.tenants.cedar.route, "source");
});
