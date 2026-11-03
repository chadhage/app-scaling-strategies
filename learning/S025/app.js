"use strict";

(() => {
  const model = globalThis.S025Warmup;
  const byId = (id) => document.getElementById(id);
  const form = byId("warmup-form");
  const error = byId("input-error");
  let state = model.initialState();
  const text = (id, value) => { byId(id).textContent = value; };

  function pending() {
    text("initialization-result", "UNKNOWN — not compared");
    text("latency-result", "UNKNOWN — not compared");
    text("outcome-result", "UNKNOWN — not compared; HOLD; no traffic moved");
    text("verifier-result", "Verifier UNKNOWN — no answer checked");
    text("timing-result", "Cold / candidate / saved: UNMEASURED");
    text("current-trace", "No current comparison. Earlier checked runs remain in history.");
    byId("phase-rows").replaceChildren();
  }

  function clearError() {
    error.hidden = true;
    error.textContent = "";
  }

  function reject(reason) {
    pending();
    error.textContent = reason.message;
    error.hidden = false;
    error.focus();
  }

  function configFromControls() {
    const budget = byId("budget-ms").value;
    if (!/^[1-9]\d{1,3}$/.test(budget)) {
      throw new TypeError("Invalid configuration: enter a whole-number budget from 50 to 2000 ms.");
    }
    return {
      jvm: byId("jvm-condition").value, beans: byId("beans-condition").value,
      pool: byId("pool-condition").value, cache: byId("cache-condition").value,
      route: byId("route").value, budgetMs: Number(budget), prediction: byId("prediction").value
    };
  }

  function renderHistory() {
    text("history-count", `${state.history.length} / 8 retained runs`);
    text("edit-count", `${state.revision} / 64 configuration changes`);
    const items = state.history.map((entry) => {
      const item = document.createElement("li");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const result = entry.result;
      summary.textContent = `Run ${entry.id} [synthetic] · ${result.outcome} · initialization ${result.initialization} · latency ${result.latency} · ${result.decision} · verifier ${result.verifier}`;
      const configuration = document.createElement("p");
      configuration.textContent = `Revision ${entry.revision} · ${JSON.stringify(entry.config)}`;
      const trace = document.createElement("pre");
      trace.textContent = result.trace.join("\n");
      details.append(summary, configuration, trace);
      item.append(details);
      return item;
    });
    byId("history").replaceChildren(...items);
  }

  function renderCurrent() {
    const result = state.current.result;
    text("initialization-result", `${result.initialization} — ${result.initializedCount}/4 primed; ${result.failures} failure, ${result.unknowns} unknown`);
    text("latency-result", `${result.latency} — ${result.warmMs === null ? "client sample UNMEASURED" : `${result.warmMs} ms ${result.warmMs <= result.budgetMs ? "≤" : ">"} ${result.budgetMs} ms budget`}`);
    text("outcome-result", `${result.outcome} — ${result.decision}; model permission only; no traffic moved`);
    text("verifier-result", `Verifier ${result.verifier} — prediction ${state.config.prediction}; learning answer only`);
    text("timing-result", `Cold / candidate / saved: ${[result.coldMs, result.warmMs, result.savedMs].map((value) => value === null ? "UNMEASURED" : `${value} ms`).join(" / ")}`);
    text("current-trace", result.trace.join("\n"));
    const rows = result.rows.map((row) => {
      const element = document.createElement("tr");
      for (const value of [row.label, row.condition, row.initialization, row.coldMs, row.warmMs ?? "UNMEASURED"]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        element.append(cell);
      }
      return element;
    });
    byId("phase-rows").replaceChildren(...rows);
  }

  function edit() {
    pending();
    clearError();
    try {
      state = model.configure(state, configFromControls());
      renderHistory();
    } catch (reason) { reject(reason); }
  }

  form.addEventListener("input", edit);
  form.addEventListener("change", edit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    pending();
    clearError();
    try {
      const configured = model.configure(state, configFromControls());
      state = model.compare(configured);
      renderHistory();
      renderCurrent();
    } catch (reason) { reject(reason); }
  });
  byId("reset-exercise").addEventListener("click", () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.initialState();
    clearError();
    pending();
    renderHistory();
    byId("jvm-condition").focus();
  });
  pending();
  renderHistory();
})();
