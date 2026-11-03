(function () {
  "use strict";

  const model = window.S022Readiness;
  const form = document.getElementById("lesson-controls");
  const policy = document.getElementById("policy");
  const prediction = document.getElementById("prediction");
  const errorBox = document.getElementById("input-error");
  const resetStatus = document.getElementById("reset-status");
  let state = model.createSession();
  let dirty = true;
  let invalidInput = false;

  function text(id, value) {
    document.getElementById(id).textContent = value;
  }

  function element(tag, value) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
    invalidInput = false;
  }

  function showError(error) {
    dirty = true;
    invalidInput = true;
    errorBox.textContent = `${error.message} No new checked run was recorded. Earlier runs remain retained.`;
    errorBox.hidden = false;
    errorBox.focus();
  }

  function readConfig() {
    const config = { policy: policy.value, conditions: {} };
    for (const id of model.IDS) {
      config.conditions[id] = document.getElementById(`${id}-condition`).value;
    }
    model.evaluate(config, prediction.value);
    return config;
  }

  function renderTrace(target, trace) {
    target.replaceChildren();
    if (trace.length === 0) target.append(element("li", "No checked trace."));
    for (const event of trace) {
      target.append(element("li", `[synthetic] ${event.code} — ${event.detail}`));
    }
  }

  function renderHistory() {
    const history = document.getElementById("history");
    history.replaceChildren();
    text("history-count", `${state.history.length} / ${model.MAX_RUNS} checked runs`);
    for (const run of state.history) {
      const result = run.result;
      const details = element("details");
      details.append(element("summary",
        `Run ${run.runId} [synthetic] · ${result.readiness} · permitted ${result.permittedDecision} · verifier ${result.verifier}`));
      details.append(element("p",
        `Revision ${run.revision}; ${run.config.policy}; predicted ${run.prediction}. ` +
        model.IDS.map((id) => `${id}: ${run.config.conditions[id]}`).join("; ")));
      details.append(element("p",
        `Synthetic checks: success ${result.counts.success}, failure ${result.counts.failure}, unknown ${result.counts.unknown}; ` +
        `required ${result.requiredPassed} / ${result.requiredTotal}. User impact UNMEASURED; protected synthetic capacity 4 / 4.`));
      const trace = element("ol");
      renderTrace(trace, result.trace);
      details.append(trace);
      const item = element("li");
      item.append(details);
      history.append(item);
    }
  }

  function render() {
    const last = state.history.at(-1);
    const current = !dirty && !invalidInput && last?.revision === state.revision ? last.result : null;
    if (current) {
      text("readiness-result", `${current.readiness} — required connectivity`);
      text("decision-result", `Permitted decision: ${current.permittedDecision} (synthetic only; no traffic moved)`);
      text("verifier-result", `Verifier ${current.verifier} — predicted ${last.prediction}, permitted ${current.permittedDecision}`);
      text("counts-result",
        `Synthetic dependency checks: success ${current.counts.success} · failure ${current.counts.failure} · unknown ${current.counts.unknown}. ` +
        `Required successful: ${current.requiredPassed} / ${current.requiredTotal}.`);
      text("degradation-result", current.optionalDegraded
        ? "Optional cache degraded. Declared database fallback is assumed; the cache failure or unknown is not erased."
        : "No optional degradation. Required failures or unknowns still hold admission.");
    } else {
      text("readiness-result", "UNKNOWN — not checked");
      text("decision-result", invalidInput ? "Invalid controls or rejected operation — no current admission result."
        : "No current admission result. Check the current settings and your answer.");
      text("verifier-result", "Verifier UNKNOWN — current answer not checked.");
      text("counts-result", "No checked counts for the current inputs. Earlier counts remain in history.");
      text("degradation-result", "");
    }
    text("draft-note", invalidInput
      ? "Invalid controls were not evaluated. Correct them or reset; no previous PASS is reused as current."
      : current ? "Checked fixture below. Every row is synthetic."
        : "Unchecked draft below. Changing settings invalidates the current result but not retained history.");
    const rows = document.getElementById("dependency-rows");
    rows.replaceChildren();
    if (!invalidInput) {
      const draft = current || model.evaluate(state.config, "HOLD");
      for (const check of draft.checks) {
        const row = element("tr");
        row.dataset.dependency = check.id;
        const heading = element("th", `${check.label} [synthetic]`);
        heading.scope = "row";
        row.append(heading);
        for (const value of [
          check.required ? "Required" : "Optional — database fallback",
          check.condition, check.ageMs === null ? "unknown" : String(check.ageMs), check.outcome
        ]) row.append(element("td", value));
        rows.append(row);
      }
    }
    renderTrace(document.getElementById("current-trace"), current?.trace || []);
    renderHistory();
  }

  form.addEventListener("change", function () {
    dirty = true;
    resetStatus.textContent = "";
    clearError();
    try {
      state = model.configure(state, readConfig());
    } catch (error) {
      showError(error);
    }
    render();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    resetStatus.textContent = "";
    clearError();
    try {
      const configured = model.configure(state, readConfig());
      state = model.check(configured, prediction.value);
      dirty = false;
      render();
      document.getElementById("current-result").focus();
    } catch (error) {
      showError(error);
      render();
    }
  });

  document.getElementById("reset-exercise").addEventListener("click", function () {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createSession();
    dirty = true;
    clearError();
    render();
    resetStatus.textContent = "Exercise reset. History and errors cleared; no readiness check has run.";
    policy.focus();
  });

  render();
}());
