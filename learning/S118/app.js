"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const form = byId("journey-form");
  const fixture = byId("fixture");
  const budget = byId("budget");
  const error = byId("lesson-error");
  const record = byId("record-mutation");
  const failover = byId("failover");
  const retry = byId("retry");
  const measure = byId("measure");
  const reset = byId("reset-lesson");
  const controls = [fixture, budget, record, failover, retry, measure, reset];
  const api = globalThis.FailoverLesson;
  let rehearsal;

  form.addEventListener("submit", (event) => event.preventDefault());

  function clearError() {
    error.textContent = "";
    fixture.removeAttribute("aria-invalid");
    budget.removeAttribute("aria-invalid");
  }

  function showError(message, focusTarget) {
    error.textContent = `No observation changed: ${message}`;
    if (focusTarget === budget || focusTarget === fixture) focusTarget.setAttribute("aria-invalid", "true");
    focusTarget.focus();
  }

  function addMeasurement(label, value, outcome) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    if (outcome) description.dataset.outcome = outcome;
    byId("measurements").append(term, description);
  }

  function render() {
    const snapshot = rehearsal.snapshot();
    const idle = snapshot.phase === "idle";
    const exhausted = snapshot.runCount >= snapshot.maxRuns;
    byId("lesson").dataset.phase = snapshot.phase;
    byId("lesson").dataset.runCount = String(snapshot.runCount);
    byId("phase").textContent = snapshot.phase;
    byId("capacity").textContent = `${snapshot.runCount} of ${snapshot.maxRuns} fictional journeys recorded.`;
    fixture.disabled = budget.disabled = record.disabled = !idle || exhausted;
    failover.disabled = snapshot.phase !== "mutated";
    retry.disabled = snapshot.phase !== "rerouted";
    measure.disabled = snapshot.phase !== "retried";
    reset.disabled = idle;
    const outcome = byId("outcome");
    outcome.dataset.outcome = snapshot.result ? snapshot.result.outcome : "unknown";
    outcome.textContent = snapshot.result ? snapshot.result.summary
      : idle && exhausted ? "Unknown - four journeys exhausted. Reload for a new rehearsal; history is retained."
        : "Unknown - no journey measured. Follow actions 1 to 4; observations alone are not a verdict.";
    byId("observations").textContent = snapshot.active
      ? JSON.stringify(snapshot.active, null, 2) : "No active fictional observations. Earlier data remain in history.";
    byId("measurements").replaceChildren();
    if (snapshot.result) {
      addMeasurement("Desired fictional origin", snapshot.result.desiredOrigin);
      addMeasurement("Observed fictional origin", snapshot.result.observedOrigin ?? "unknown");
      addMeasurement("Fictional recovery / declared budget",
        `${snapshot.result.recoveryMs === null ? "unknown" : `${snapshot.result.recoveryMs} ms`} / ${snapshot.result.budgetMs} ms`);
      for (const item of snapshot.result.checks) {
        addMeasurement(item.name,
          `${item.outcome.toUpperCase()} - observed ${JSON.stringify(item.observed)}; expected ${JSON.stringify(item.expected)}`,
          item.outcome);
      }
    }
    byId("history").replaceChildren();
    for (const entry of snapshot.history) {
      const item = document.createElement("li");
      const label = document.createElement("p");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const data = document.createElement("pre");
      label.textContent = `${entry.sequence}. Journey ${entry.run} - ${entry.action} - ${entry.phase}`;
      summary.textContent = "Retained fictional data";
      data.textContent = JSON.stringify(entry.observation, null, 2);
      details.append(summary, data);
      item.append(label, details);
      byId("history").append(item);
    }
  }

  function perform(action, nextFocus, errorFocus) {
    try {
      action();
      clearError();
      render();
      if (!nextFocus.disabled) nextFocus.focus();
    } catch (failure) {
      showError(failure.message, errorFocus);
    }
  }

  try {
    if (!api || typeof api.Rehearsal !== "function" || typeof api.parseBudget !== "function"
      || typeof api.listFixtures !== "function") throw new Error("unavailable engine");
    rehearsal = new api.Rehearsal();
    fixture.replaceChildren();
    for (const choice of api.listFixtures()) {
      const option = document.createElement("option");
      option.value = choice.id;
      option.textContent = choice.label;
      fixture.append(option);
    }
    render();
  } catch {
    controls.forEach((control) => { control.disabled = true; });
    byId("phase").textContent = "unavailable";
    byId("outcome").textContent = "Unknown - lesson engine unavailable; no journey measured.";
    error.textContent = "Lesson engine unavailable. Reload this local page; no journey was recorded.";
    error.focus();
    return;
  }

  form.addEventListener("submit", () => {
    let budgetSeconds;
    try {
      budgetSeconds = api.parseBudget(budget.value);
    } catch (failure) {
      showError(failure.message, budget);
      return;
    }
    perform(() => rehearsal.recordMutation({ fixture: fixture.value, budgetSeconds }), failover, fixture);
  });
  failover.addEventListener("click", () => perform(() => rehearsal.failover(), retry, failover));
  retry.addEventListener("click", () => perform(() => rehearsal.retry(), measure, retry));
  measure.addEventListener("click", () => perform(() => rehearsal.measure(), reset, measure));
  reset.addEventListener("click", () => perform(() => {
    rehearsal.reset();
    fixture.value = "preserved";
    budget.value = "5";
  }, fixture, reset));
  budget.addEventListener("input", clearError);
  fixture.addEventListener("change", clearError);
})();
