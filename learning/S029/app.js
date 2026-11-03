(function () {
  "use strict";
  const model = globalThis.S029Readiness;
  const byId = (id) => document.getElementById(id);
  const form = byId("exercise");
  let state = model.initialState();
  function integer(id) {
    const value = byId(id).value;
    if (!/^[1-9]\d*$/.test(value)) throw new Error("Use canonical whole numbers in the labelled ranges.");
    return Number(value);
  }
  function configuration() {
    return {
      fixture: byId("fixture").value, windowSize: integer("window-size"),
      freshnessTicks: integer("freshness"), observationTick: integer("observe-tick"),
      prediction: byId("prediction").value
    };
  }
  function checksText(checks) {
    return `success ${checks.success} · failure ${checks.failure} · unknown ${checks.unknown}`;
  }
  function traceText(result) {
    return result.trace.map((row) =>
      `t=${row.tick} · probe ${row.probe} · latest t=${row.latestTick} age=${row.latestAge} · `
      + `fresh streak ${row.streak} · ${checksText(row.checks)} · ${row.readiness} · `
      + `guard ${row.decision} · single-green ${row.comparison}`
    ).join("\n");
  }
  function clearError() {
    byId("input-error").hidden = true;
    byId("input-error").textContent = "";
  }
  function clearCurrent(message) {
    byId("notice").textContent = message;
    byId("readiness-result").textContent = "UNKNOWN — not checked";
    byId("decision-result").textContent = "Guard not evaluated; candidate admissions 0.";
    byId("comparison-result").textContent = "Single-green comparison not evaluated (unsafe; never drives admission).";
    byId("checks-result").textContent = "Required probe checks not evaluated.";
    byId("verifier-result").textContent = "Answer not checked.";
    byId("current-trace").textContent = "Not checked.";
  }
  function renderHistory() {
    const list = byId("history");
    list.replaceChildren();
    for (const run of state.history) {
      const input = run.configuration;
      const result = model.evaluate(input);
      const item = document.createElement("li");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Run ${run.id} · ${input.fixture} · window ${input.windowSize} · `
        + `max age ${input.freshnessTicks} · tick ${input.observationTick} · ${result.readiness} · `
        + `guard ${result.decision} · predicted ${input.prediction} · verifier ${result.verifier}`;
      const counts = document.createElement("p");
      counts.textContent = `${checksText(result.checks)}; candidate admissions ${result.candidateAdmissions}; `
        + `single-green ${result.comparison} (unsafe).`;
      const trace = document.createElement("pre");
      trace.textContent = traceText(result);
      details.append(summary, counts, trace);
      item.append(details);
      list.append(item);
    }
    byId("history-count").textContent = `${state.history.length} / ${model.MAX_HISTORY} checked runs`;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const next = model.recordRun(state, configuration());
      const input = next.history.at(-1).configuration;
      const result = model.evaluate(input);
      state = next;
      clearError();
      byId("notice").textContent = `Checked run ${state.history.length}; all evidence is synthetic.`;
      byId("readiness-result").textContent = `${result.readiness} — guarded readiness window`;
      byId("decision-result").textContent = `Guard ${result.decision} · route ${result.route} · `
        + `candidate admissions ${result.candidateAdmissions} (synthetic only)`;
      byId("comparison-result").textContent = `Single-green comparison ${result.comparison} `
        + "(unsafe; never drives admission).";
      byId("checks-result").textContent = `${input.windowSize} required checks: ${checksText(result.checks)}; `
        + `fresh consecutive streak ${result.streak}.`;
      byId("verifier-result").textContent = `Answer verifier ${result.verifier} · predicted ${input.prediction}; `
        + "answer correctness is not migration success.";
      byId("current-trace").textContent = traceText(result);
      renderHistory();
    } catch (error) {
      byId("input-error").textContent = `Input rejected: ${error.message}`;
      byId("input-error").hidden = false;
      byId("input-error").focus();
    }
  });
  function invalidate() {
    clearError();
    clearCurrent("Configuration changed; check again. Earlier runs remain in history.");
  }
  for (const id of ["fixture", "window-size", "freshness", "observe-tick", "prediction"]) {
    byId(id).addEventListener("input", invalidate);
    byId(id).addEventListener("change", invalidate);
  }
  byId("restart-lesson").addEventListener("click", () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.initialState();
    clearError();
    clearCurrent("Defaults restored; history cleared.");
    renderHistory();
    byId("fixture").focus();
  });
})();
