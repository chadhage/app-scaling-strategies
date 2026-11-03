(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.S005Migration = api;
})(globalThis, function () {
  "use strict";
  const FIXTURE_ID = "S005-fixture-v1";
  const TENANT_IDS = Object.freeze(["cedar", "birch", "maple"]);
  const MAX_STEPS = 80;
  const ACTIONS = new Set([
    "sync", "migrate", "read", "write", "job",
    "source-worker", "dual-ownership", "audit-unrelated"
  ]);
  const clone = value => JSON.parse(JSON.stringify(value));

  function createRehearsal() {
    const tenants = {};
    for (const [index, id] of TENANT_IDS.entries()) {
      tenants[id] = {
        route: "source",
        owners: { source: true, target: false },
        fence: 1,
        tokens: { source: 1, target: 0 },
        syncedRevision: 0,
        source: {
          data: { credits: 120 + index * 40, fulfilledJobs: 0, revision: 1 },
          effects: { writes: 0, jobs: 0 }
        },
        target: {
          data: { credits: 0, fulfilledJobs: 0, revision: 0 },
          effects: { writes: 0, jobs: 0 }
        },
        observation: null
      };
    }
    return { fixture: FIXTURE_ID, clock: 0, stepLimit: MAX_STEPS, tenants, trace: [], last: null };
  }

  function verifyIsolation(before, after, selectedTenant) {
    if (!before?.tenants || !after?.tenants) {
      return { passed: false, checkedTenants: [], changedTenants: [], reason: "invalid-snapshot" };
    }
    const beforeIds = Object.keys(before.tenants).sort();
    const afterIds = Object.keys(after.tenants).sort();
    const ids = [...new Set([...beforeIds, ...afterIds])].sort();
    const checkedTenants = ids.filter(id => id !== selectedTenant);
    const changedTenants = checkedTenants.filter(id =>
      !Object.hasOwn(before.tenants, id) || !Object.hasOwn(after.tenants, id) ||
      JSON.stringify(before.tenants[id]) !== JSON.stringify(after.tenants[id])
    );
    const sameShape = JSON.stringify(beforeIds) === JSON.stringify(afterIds);
    return {
      passed: sameShape && changedTenants.length === 0,
      checkedTenants,
      changedTenants,
      reason: sameShape ? (changedTenants.length ? "unrelated-tenant-change" : "unchanged") : "tenant-set-changed"
    };
  }

  function effectDelta(before, after, tenantId) {
    const delta = { source: { writes: 0, jobs: 0 }, target: { writes: 0, jobs: 0 } };
    if (!tenantId) return delta;
    for (const site of ["source", "target"]) {
      for (const kind of ["writes", "jobs"]) {
        delta[site][kind] = after.tenants[tenantId][site].effects[kind] -
          before.tenants[tenantId][site].effects[kind];
      }
    }
    return delta;
  }

  function finish(before, candidate, event) {
    const proposalIsolation = verifyIsolation(before, candidate, event.tenantId);
    if (!proposalIsolation.passed) {
      candidate.tenants = clone(before.tenants);
      event.status = "blocked";
      event.code = "unrelated-tenant-change";
      event.observedDestination = null;
      event.copiedRecords = 0;
      event.proposalIsolation = proposalIsolation;
    }
    event.isolation = verifyIsolation(before, candidate, event.tenantId);
    event.configuredDestination = event.tenantId ? candidate.tenants[event.tenantId].route : null;
    event.effects = effectDelta(before, candidate, event.tenantId);
    candidate.last = event;
    candidate.trace = [...before.trace, event].slice(-MAX_STEPS);
    return candidate;
  }

  function dispatch(state, command) {
    const candidate = clone(state);
    const isObject = command !== null && typeof command === "object" && !Array.isArray(command);
    const knownTenant = isObject && typeof command.tenantId === "string" &&
      TENANT_IDS.includes(command.tenantId);
    const tenantId = knownTenant ? command.tenantId : null;
    const knownAction = isObject && typeof command.action === "string" && ACTIONS.has(command.action);
    const action = knownAction ? command.action : "unsupported";
    const tenant = tenantId ? candidate.tenants[tenantId] : null;
    const intendedDestination = !knownAction ? null :
      ["sync", "migrate", "audit-unrelated"].includes(action) ? "target" :
        action === "source-worker" ? "source" : (tenant?.route ?? null);
    candidate.clock = Math.min(state.clock + 1, MAX_STEPS);
    const event = {
      step: candidate.clock,
      tenantId,
      action,
      status: "blocked",
      code: "unsupported-input",
      intendedDestination,
      configuredDestination: tenant?.route ?? null,
      observedDestination: null,
      observedRevision: null,
      copiedRecords: 0,
      presentedFence: null,
      activeFence: tenant?.fence ?? null
    };
    const end = code => {
      event.code = code;
      return finish(state, candidate, event);
    };
    if (state.clock >= MAX_STEPS) return end("step-limit");
    if (!isObject || Reflect.ownKeys(command).length !== 2 ||
        !Object.hasOwn(command, "action") || !Object.hasOwn(command, "tenantId") ||
        typeof command.action !== "string" || typeof command.tenantId !== "string") {
      return end("unsupported-input");
    }
    if (!knownTenant) return end("unknown-tenant");
    if (!knownAction) return end("unknown-action");

    if (action === "dual-ownership") {
      tenant.owners = { source: true, target: true };
      event.status = "fixture";
      return end("unsafe-fixture-loaded");
    }
    if (action === "audit-unrelated") {
      const other = TENANT_IDS.find(id => id !== tenantId);
      candidate.tenants[other].route = candidate.tenants[other].route === "source" ? "target" : "source";
      return end("unrelated-tenant-change");
    }

    const ownerCount = Number(tenant.owners.source) + Number(tenant.owners.target);
    if (ownerCount !== 1) return end(ownerCount > 1 ? "dual-ownership" : "no-owner");
    if (!tenant.owners[tenant.route]) return end("route-owner-mismatch");

    if (action === "sync" || action === "migrate") {
      if (tenant.route === "target") return end("already-target");
      if (tenant.tokens.source !== tenant.fence) return end("stale-fence");
      if (action === "sync") {
        tenant.target.data = clone(tenant.source.data);
        tenant.syncedRevision = tenant.source.data.revision;
        event.status = "applied";
        event.copiedRecords = 1;
        return end("synchronized");
      }
      if (tenant.syncedRevision !== tenant.source.data.revision ||
          JSON.stringify(tenant.target.data) !== JSON.stringify(tenant.source.data)) {
        return end("not-synchronized");
      }
      // One local transition models the required atomic routing/lease handoff, not a distributed protocol.
      tenant.fence += 1;
      tenant.owners = { source: false, target: true };
      tenant.tokens.target = tenant.fence;
      tenant.route = "target";
      event.activeFence = tenant.fence;
      event.status = "applied";
      return end("migrated");
    }

    const destination = action === "source-worker" ? "source" : tenant.route;
    const token = action === "source-worker" ? 1 : tenant.tokens[destination];
    event.presentedFence = token;
    if (token !== tenant.fence) return end("stale-fence");
    if (!tenant.owners[destination]) return end("not-owner");
    const site = tenant[destination];
    if (action === "write") {
      site.data.credits += 5;
      site.data.revision += 1;
      site.effects.writes += 1;
    } else if (action === "job" || action === "source-worker") {
      site.data.fulfilledJobs += 1;
      site.data.revision += 1;
      site.effects.jobs += 1;
    }
    tenant.observation = {
      destination, step: candidate.clock, revision: site.data.revision, data: clone(site.data)
    };
    event.observedDestination = destination;
    event.observedRevision = site.data.revision;
    event.status = action === "read" ? "observed" : "applied";
    return end(action === "read" ? "request-observed" : action === "write" ? "write-applied" : "job-applied");
  }

  return Object.freeze({ FIXTURE_ID, TENANT_IDS, MAX_STEPS, createRehearsal, dispatch, verifyIsolation });
});
