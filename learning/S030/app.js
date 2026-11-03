(function () {
  "use strict";
  const model = globalThis.S030;
  const byId = (id) => document.getElementById(id);
  const form = byId("comparison-form");
  let state = model.initialState();

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const observed = (value) => value === null ? "UNKNOWN" : String(value);
  const counts = (value) => `success ${value.success} / failure ${value.failure} / unknown ${value.unknown}`;

  function numeric(id) {
    const value = byId(id).value;
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new TypeError(`${byId(id).labels[0].textContent}: enter a whole number without blanks, decimals or exponent notation.`);
    return Number(value);
  }

  function configuration() {
    return {
      instances: numeric("candidate-count"), concurrency: numeric("bounded-limit"),
      dbCapacity: numeric("db-capacity"), cacheCapacity: numeric("cache-capacity"),
      initBudget: numeric("init-budget"), observations: byId("observations").value
    };
  }

  function traceTable(run) {
    const wrapper = element("div");
    wrapper.className = "table-scroll";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", `${run.mode} synthetic trace; scroll horizontally if needed`);
    const table = element("table");
    table.append(element("caption", `${run.mode} tick trace — planned active/completing counts; all outcomes synthetic`));
    const head = element("tr");
    for (const title of ["Tick", "Active", "Completing", "Database load", "Cache load", "Overloaded", "Initialization", "GA journeys", "Latency ms"]) {
      const cell = element("th", title);
      cell.scope = "col";
      head.append(cell);
    }
    const thead = element("thead");
    thead.append(head);
    table.append(thead);
    const body = element("tbody");
    for (const row of run.trace) {
      const line = element("tr");
      for (const value of [
        row.tick, row.active, row.completing, observed(row.databaseLoad), observed(row.cacheLoad),
        row.overloaded === null ? "UNKNOWN" : row.overloaded.join(" + ") || "none",
        counts(row.initialization), counts(row.journeys), observed(row.journeys.latencyMs)
      ]) line.append(element("td", String(value)));
      body.append(line);
    }
    table.append(body);
    wrapper.append(table);
    return wrapper;
  }

  function renderComparison(report) {
    const container = element("div");
    for (const run of [report.simultaneous, report.bounded]) {
      const section = element("section");
      section.className = `strategy ${run.mode}`;
      section.append(element("h4", `${run.mode}: ${run.outcome} — concurrency ${run.concurrency}`));
      section.append(element("p", `Observed initialization duration ${observed(run.durationTicks)} ticks; planned ${run.plannedTicks}; budget ${run.budgetTicks}; within budget ${observed(run.withinBudget)}.`));
      for (const [name, dependency] of Object.entries(run.dependencies)) {
        section.append(element("p", `${name}: capacity ${dependency.capacity}; peak load ${observed(dependency.peakLoad)}; overloaded ticks ${observed(dependency.overloadedTicks)}.`));
      }
      section.append(element("p", `Initialization attempted ${run.initialization.attempted}: ${counts(run.initialization)}.`));
      section.append(element("p", `GA journeys attempted ${run.journeys.attempted}: ${counts(run.journeys)}; max latency ${observed(run.journeys.maxLatencyMs)} ms / budget ${run.journeys.budgetMs} ms.`));
      section.append(traceTable(run));
      container.append(section);
    }
    return container;
  }

  function renderHistory() {
    const container = byId("history");
    container.replaceChildren();
    for (const run of state.runs) {
      const detail = element("details");
      const input = run.configuration;
      detail.append(element("summary", `Comparison ${run.id}: bounded ${run.report.bounded.outcome}; answer ${run.prediction}; verifier ${run.verifier}`));
      detail.append(element("p", `Candidates ${input.instances}; bound ${input.concurrency}; database ${input.dbCapacity}; cache ${input.cacheCapacity}; initialization budget ${input.initBudget}; observations ${input.observations}.`));
      detail.append(renderComparison(run.report));
      container.append(detail);
    }
    byId("history-count").textContent = `${state.runs.length} / 8 comparisons`;
  }

  function invalidate() {
    byId("current-result").hidden = true;
    byId("current-comparison").replaceChildren();
    byId("bounded-outcome").textContent = "";
    byId("answer-verifier").textContent = "";
    byId("input-error").hidden = true;
    byId("input-error").textContent = "";
    byId("status").textContent = "Controls changed — check again; retained evidence is unchanged.";
  }

  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const next = model.recordRun(state, configuration(), byId("prediction").value);
      const run = next.runs.at(-1);
      state = next;
      byId("input-error").hidden = true;
      byId("input-error").textContent = "";
      byId("bounded-outcome").textContent = `Bounded outcome: ${run.report.bounded.outcome}`;
      byId("answer-verifier").textContent = `Verifier ${run.verifier} — predicted ${run.prediction}. This checks the answer, not native success.`;
      byId("current-comparison").replaceChildren(renderComparison(run.report));
      byId("current-result").hidden = false;
      byId("status").textContent = `Comparison ${run.id}: simultaneous ${run.report.simultaneous.outcome}; bounded ${run.report.bounded.outcome}; verifier ${run.verifier}. Synthetic only; real users UNMEASURED.`;
      renderHistory();
    } catch (error) {
      invalidate();
      byId("status").textContent = "No comparison recorded; earlier evidence is unchanged.";
      byId("input-error").textContent = error.message;
      byId("input-error").hidden = false;
      byId("input-error").focus();
    }
  });

  byId("clear-history").addEventListener("click", () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.initialState();
    invalidate();
    renderHistory();
    byId("status").textContent = "Reset complete — defaults restored, errors and history cleared.";
    byId("candidate-count").focus();
  });
}());
