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

  function dispatch(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function verifyIsolation() {
    return { passed: true, checkedTenants: [], changedTenants: [] };
  }

  return Object.freeze({ FIXTURE_ID, TENANT_IDS, MAX_STEPS, createRehearsal, dispatch, verifyIsolation });
});
