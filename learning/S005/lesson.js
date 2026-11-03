(function () {
  "use strict";
  const model = globalThis.S005Migration;
  const form = document.getElementById("migration-controls");
  const select = document.getElementById("tenant-id");
  let state = model.createRehearsal();
  const put = (id, value) => { document.getElementById(id).textContent = value; };
  const effects = value => `source W${value.source.writes}/J${value.source.jobs} · target W${value.target.writes}/J${value.target.jobs}`;
  const totals = value => `${value.writes} writes · ${value.jobs} jobs`;
  const data = value => `${value.credits} / ${value.revision} / ${value.fulfilledJobs}`;
  const ownerNames = tenant => ["source", "target"].filter(site => tenant.owners[site]).join(" + ") || "NONE";
  const explanations = {
    "not-synchronized": "Target data does not match the latest source revision. Synchronize before transferring.",
    "synchronized": "One selected-tenant record copied. Ownership and routing have not changed.",
    "migrated": "Only this tenant's route and ownership moved together; the source fence is now stale.",
    "request-observed": "A synthetic routed request sampled the configured owner and its data.",
    "write-applied": "Exactly one synthetic write added 5 toy credits at the observed owner.",
    "job-applied": "Exactly one synthetic background effect ran at the observed owner.",
    "stale-fence": "Presented fence does not match the active fence. No stale worker effect was allowed.",
    "dual-ownership": "Two active owners are unsafe. Operation blocked; Reset to restore the fixture.",
    "no-owner": "No exclusive owner exists. Operation blocked.",
    "route-owner-mismatch": "Configured route is not owned by the exclusive owner. Operation blocked.",
    "not-owner": "The requested destination does not own this tenant. Operation blocked.",
    "already-target": "This tenant already moved. Do not replay a handoff or overwrite its active target data.",
    "unsafe-fixture-loaded": "Selected tenant now deliberately has two synthetic owner flags. This is not a successful migration. Reset to recover.",
    "unrelated-tenant-change": "The proposed snapshot changed an unrelated tenant. It was rejected, not applied.",
    "unknown-tenant": "Unsupported tenant input rejected. All tenant snapshots remain intact.",
    "unknown-action": "Unsupported action input rejected. All tenant snapshots remain intact.",
    "unsupported-input": "Only a known action and a single known tenant are supported. Extra or malformed input rejected.",
    "step-limit": "The 80-step rehearsal limit is reached. Clock did not advance; Reset to continue."
  };

  function row(values, tenantId) {
    const element = document.createElement("tr");
    if (tenantId) element.dataset.tenant = tenantId;
    for (const [index, value] of values.entries()) {
      const cell = document.createElement(index === 0 ? "th" : "td");
      if (index === 0) cell.scope = "row";
      cell.textContent = String(value);
      element.append(cell);
    }
    return element;
  }

  function renderSelected() {
    const id = model.TENANT_IDS.includes(select.value) ? select.value : null;
    const tenant = id ? state.tenants[id] : null;
    put("selected-tenant", id || "Unsupported selection");
    put("configured-route", tenant?.route || "Not available");
    put("owners", tenant ? `${ownerNames(tenant)} / ${tenant.fence}` : "Not available");
    const synchronized = tenant && tenant.syncedRevision === tenant.source.data.revision &&
      JSON.stringify(tenant.source.data) === JSON.stringify(tenant.target.data);
    put("sync-status", !tenant ? "Not available" : tenant.route === "target" ?
      "Target active; source copy is historical" : synchronized ?
        `Synchronized at source revision ${tenant.syncedRevision}` : "Not synchronized with latest source revision");
    const observation = tenant?.observation;
    put("last-observation", observation ?
      `${observation.destination} · step ${observation.step} · revision ${observation.revision} (sample, not current routing)` :
      "No request sampled");
    put("source-effects", tenant ? totals(tenant.source.effects) : "Not available");
    put("target-effects", tenant ? totals(tenant.target.effects) : "Not available");
  }

  function render() {
    put("clock", `${state.clock} / ${model.MAX_STEPS} synthetic steps`);
    renderSelected();
    const tenantRows = model.TENANT_IDS.map(id => {
      const tenant = state.tenants[id];
      return row([
        id, tenant.route, ownerNames(tenant), tenant.fence,
        data(tenant.source.data), data(tenant.target.data),
        `${tenant.source.effects.writes} / ${tenant.source.effects.jobs}`,
        `${tenant.target.effects.writes} / ${tenant.target.effects.jobs}`
      ], id);
    });
    document.getElementById("tenants").replaceChildren(...tenantRows);
    const unsafe = model.TENANT_IDS.filter(id => {
      const owners = state.tenants[id].owners;
      return Number(owners.source) + Number(owners.target) !== 1;
    });
    put("ownership-invariant", unsafe.length ?
      `Ownership: UNSAFE on ${unsafe.join(", ")}. Effects and migration must block; Reset required.` :
      "Ownership: one owner per tenant.");

    const event = state.last;
    if (!event) {
      put("verdict", "Ready — no action attempted.");
      put("reason", "Choose an action to inspect its synthetic result.");
      put("impact", "User-transition outcome: not attempted.");
      put("event-tenant", "None");
      put("intended-destination", "Not attempted");
      put("action-observed", "No request sampled");
      put("effect-deltas", "source W0/J0 · target W0/J0");
      put("copy-count", "0 toy records");
      put("isolation", "No action to compare");
      put("proposal-result", "No unsafe proposal inspected.");
    } else {
      put("verdict", event.status === "blocked" ? "BLOCKED — guard held; no new business effect." :
        event.status === "fixture" ? "UNSAFE FIXTURE — ownership invariant violated." :
        event.code === "migrated" ? "LOCAL HANDOFF APPLIED — request observation still required." :
        event.status === "observed" ? "SYNTHETIC REQUEST OBSERVED." : "SYNTHETIC ACTION APPLIED.");
      put("reason", `${event.code} — ${explanations[event.code]}`);
      put("impact", event.status === "blocked" ? "User-transition outcome: safe abort before new effects; not a successful migration." :
        event.status === "fixture" ? "User-transition outcome: unsafe fixture only; no migration or request executed." :
        event.code === "migrated" ? "User-transition outcome: local route changed; no new request sampled by this action." :
        event.code === "synchronized" ? "User-transition outcome: data copy only; tenant has not moved." :
        "User-transition outcome: synthetic request/effect only; not native availability evidence.");
      put("event-tenant", event.tenantId || "Unsupported input (no tenant selected)");
      put("intended-destination", event.intendedDestination || "Not applicable");
      put("action-observed", event.observedDestination ?
        `${event.observedDestination} · revision ${event.observedRevision}` : "No request sampled");
      put("effect-deltas", effects(event.effects));
      put("copy-count", `${event.copiedRecords} toy records`);
      put("isolation", event.isolation.passed ?
        `PASS — unchanged: ${event.isolation.checkedTenants.join(", ")}` : "FAIL — unrelated snapshot changed");
      put("proposal-result", event.proposalIsolation ?
        `REJECTED proposal — detected drift on ${event.proposalIsolation.changedTenants.join(", ")}. No proposed tenant change was applied.` :
        "No unsafe proposal inspected in this action.");
    }
    put("trace-empty", state.trace.length ? `${state.trace.length} recorded synthetic actions.` : "No actions yet.");
    document.getElementById("trace").replaceChildren(...state.trace.map(event => row([
      event.step, `${event.tenantId || "unsupported"} / ${event.action}`,
      event.intendedDestination || "none", event.configuredDestination || "none",
      event.observedDestination || "not sampled", `${event.status} / ${event.code}`, effects(event.effects)
    ])));
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    state = model.dispatch(state, { action: event.submitter?.value, tenantId: select.value });
    render();
  });
  form.addEventListener("change", renderSelected);
  form.addEventListener("reset", () => {
    state = model.createRehearsal();
    // Reset listeners run before the browser applies the form's default selection.
    select.value = model.TENANT_IDS[0];
    render();
  });
  render();
})();
