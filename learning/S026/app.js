(function () {
  "use strict";
  const model = globalThis.S026;
  const byId = (id) => document.getElementById(id);
  const form = byId("exercise-form");
  let state = model.createState();

  function readTick(id) {
    const value = byId(id).value;
    if (!/^[0-6]$/.test(value)) throw new RangeError(`Invalid configuration: non-canonical ${id}`);
    return Number(value);
  }
  function configuration() {
    return {
      pullTicks: readTick("pull-ticks"), startupTicks: readTick("startup-ticks"),
      fault: byId("fault").value, observeTick: readTick("observe-tick"),
      prediction: byId("prediction").value
    };
  }
  function clearError() {
    byId("input-error").hidden = true;
    byId("input-error").textContent = "";
  }
  function showError(error) {
    byId("input-error").textContent = error.message;
    byId("input-error").hidden = false;
    byId("input-error").focus();
  }
  function pending() {
    byId("outcome-result").textContent = "UNKNOWN — not checked";
    byId("permission-result").textContent = "Handoff not checked.";
    byId("verifier-result").textContent = "Answer verifier not checked.";
    byId("checks-result").textContent = "Two required completion checks, not user journeys.";
    byId("traffic-result").textContent = "No synthetic requests checked.";
    byId("impact-result").textContent = "Real user impact UNMEASURED. No native migration or reliability proof.";
    byId("image-result").textContent = "";
    byId("current-trace").textContent = "No checked trace.";
  }
  function traceText(result) {
    return result.trace.map((row) =>
      `t=${row.tick} [synthetic] | ${row.phase} | pull ${row.pull} | init ${row.initialization}`
      + ` | ready ${row.ready} | serving ${row.serving} | GA successes ${row.oldSuccess}`
      + ` | candidate successes ${row.candidateSuccess}`
    ).join("\n");
  }
  function display(run) {
    const result = run.result;
    const reason = result.candidateOutcome === "SUCCESS" ? "pull and initialization observed successful"
      : result.candidateOutcome === "FAILURE" ? "candidate completion failed; GA retained"
        : "completion evidence insufficient; GA retained";
    byId("outcome-result").textContent = `${result.candidateOutcome} — ${reason}`;
    byId("permission-result").textContent = `${result.permission} — final serving ${result.trace.at(-1).serving}`;
    byId("verifier-result").textContent = `Verifier ${result.verifier} — predicted ${run.configuration.prediction}; answer only`;
    byId("checks-result").textContent = `Completion checks: success ${result.checks.success}`
      + ` · failure ${result.checks.failure} · unknown ${result.checks.unknown} (2 required)`;
    byId("traffic-result").textContent = `Synthetic requests: success ${result.traffic.success}`
      + ` · failure ${result.traffic.failure} · unknown ${result.traffic.unknown}`
      + `; GA ${result.traffic.old} · candidate ${result.traffic.candidate}`;
    byId("impact-result").textContent = result.traffic.candidate
      ? "Three synthetic candidate admissions only. Real user impact UNMEASURED; not native migration or reliability proof."
      : "No candidate admissions; no migration demonstrated. Real user impact UNMEASURED.";
    byId("image-result").textContent = `Synthetic immutable image: ${result.image}`;
    byId("current-trace").textContent = traceText(result);
  }
  function history() {
    byId("history-count").textContent = `${state.runs.length} / 8 checked runs`;
    byId("history").replaceChildren();
    for (const run of state.runs) {
      const item = document.createElement("li");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const result = run.result;
      const input = run.configuration;
      summary.textContent = `Run ${run.id} [synthetic] · ${result.candidateOutcome} · ${result.permission}`
        + ` · verifier ${result.verifier} · pull ${input.pullTicks}, init ${input.startupTicks}`
        + `, tick ${input.observeTick}, ${input.fault}, predicted ${input.prediction}`;
      const text = document.createElement("pre");
      text.tabIndex = 0;
      text.textContent = `Checks: success ${result.checks.success}, failure ${result.checks.failure}, unknown ${result.checks.unknown}\n`
        + `Synthetic traffic: success ${result.traffic.success}, failure ${result.traffic.failure}, unknown ${result.traffic.unknown};`
        + ` GA ${result.traffic.old}, candidate ${result.traffic.candidate}\n${result.image}\n${traceText(result)}`;
      details.append(summary, text);
      item.append(details);
      byId("history").append(item);
    }
  }
  form.addEventListener("change", () => {
    pending();
    try {
      model.evaluate(configuration());
      clearError();
    } catch (error) {
      showError(error);
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    pending();
    try {
      state = model.recordRun(state, configuration());
      clearError();
      display(state.runs.at(-1));
      history();
    } catch (error) {
      showError(error);
    }
  });
  byId("restart-lesson").addEventListener("click", () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    clearError();
    pending();
    history();
    byId("pull-ticks").focus();
  });
})();
