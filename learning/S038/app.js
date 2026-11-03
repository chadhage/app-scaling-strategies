(function () {
  "use strict";
  const lesson = globalThis.TenantContinuity;
  const byId = (id) => document.getElementById(id);
  const form = byId("controls");
  const conductButton = byId("conduct");
  const error = byId("input-error");
  const status = byId("status");
  const current = byId("current-result");
  const summary = byId("result-summary");
  const trace = byId("current-trace");
  const historyList = byId("history");
  const count = byId("history-count");
  let state = lesson.createState();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function configuration() {
    return {
      routes: { alba: byId("route-alba").value, birch: byId("route-birch").value },
      policy: byId("policy").value,
      assertions: {
        ownRead: byId("own-read").checked,
        rejectForeign: byId("reject-foreign").checked,
        dataTenant: byId("data-tenant").checked
      }
    };
  }
  function describe(run) {
    const fragment = document.createDocumentFragment();
    fragment.append(
      element("p", `Run ${run.id} — ${run.outcome}; verifier ${run.verifier}.`, "outcome"),
      element("p", `Probes attempted ${run.counts.attempted}: success ${run.counts.success} / failure ${run.counts.failure} / unknown ${run.counts.unknown}.`, "counts"),
      element("p", `After routes: Alba ${run.config.routes.alba}, Birch ${run.config.routes.birch}. v2 after-change policy: ${run.config.policy}.`),
      element("p", `Assertions: ${Object.entries(run.config.assertions).map(([name, selected]) => `${name} ${selected ? "selected" : "omitted"}`).join("; ")}.`),
      element("p", `Observed authorized v2 route reads: ${run.migratedTenants.length} / 2 (${run.migratedTenants.join(", ") || "none"}). This alone does not prove isolation or full migration.`),
      element("p", "Synthetic user impact only; real users UNMEASURED. Cleanup: N/A — no resources.")
    );
    return fragment;
  }
  function table(run) {
    const tableNode = element("table");
    tableNode.append(element("caption", `Run ${run.id}: complete before/after tenant and version matrix`));
    const head = element("thead");
    const heading = element("tr");
    ["Probe / phase", "Version / path", "Member → requested tenant", "Expected", "Observed response", "Selected assertions", "Result"].forEach((label) => {
      const cell = element("th", label);
      cell.scope = "col";
      heading.append(cell);
    });
    head.append(heading);
    const body = element("tbody");
    run.trace.forEach((probe) => {
      const row = element("tr");
      row.dataset.outcome = probe.outcome;
      const values = [
        `${probe.probeId} / ${probe.phase}`,
        `${probe.version} / ${probe.path}`,
        `${probe.principal} → ${probe.resourceTenant} (${probe.intent})`,
        probe.expectedStatus === 200 ? "200; own tenant data" : "403; no data",
        probe.observed ? `${probe.status}; data tenant ${probe.dataTenant || "none"}; ${probe.record || "no record"}` : "UNKNOWN — response unobserved",
        probe.checks.map((check) => `${check.assertion}: ${check.result}`).join("; "),
        probe.outcome.toUpperCase()
      ];
      values.forEach((value) => row.append(element("td", value)));
      body.append(row);
    });
    tableNode.append(head, body);
    return tableNode;
  }
  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    error.focus();
  }
  function invalidate() {
    current.hidden = true;
    error.hidden = true;
    error.textContent = "";
    status.textContent = state.history.length ? "Controls changed — run again. Retained history is unchanged." : "Not run — no evidence yet.";
  }
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      state = lesson.conduct(state, configuration());
      const run = state.history.at(-1);
      error.hidden = true;
      error.textContent = "";
      summary.replaceChildren(describe(run));
      trace.replaceChildren(table(run));
      current.hidden = false;
      const item = element("li");
      const detail = element("details");
      detail.append(element("summary", `Run ${run.id} — ${run.outcome}; ${run.counts.success} success / ${run.counts.failure} failure / ${run.counts.unknown} unknown`));
      detail.append(describe(run));
      const region = element("div", undefined, "trace");
      region.tabIndex = 0;
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", `Retained run ${run.id} synthetic trace`);
      region.append(table(run));
      detail.append(region);
      item.append(detail);
      historyList.append(item);
      count.textContent = `${state.history.length} / ${lesson.MAX_RUNS} runs`;
      conductButton.disabled = state.history.length >= lesson.MAX_RUNS;
      status.textContent = `Run ${run.id}: ${run.outcome}. Synthetic only; real users UNMEASURED.${conductButton.disabled ? " History full — reset explicitly to continue." : ""}`;
    } catch (failure) {
      current.hidden = true;
      status.textContent = "Run rejected — no evidence added; retained history is unchanged.";
      showError(failure instanceof Error ? failure.message : "Invalid rehearsal input.");
    }
  });
  byId("reset-lesson").addEventListener("click", () => {
    state = lesson.reset(state);
    HTMLFormElement.prototype.reset.call(form);
    historyList.replaceChildren();
    summary.replaceChildren();
    trace.replaceChildren();
    count.textContent = `0 / ${lesson.MAX_RUNS} runs`;
    conductButton.disabled = false;
    invalidate();
    status.textContent = "Reset complete — no evidence yet.";
    byId("route-alba").focus();
  });
}());
