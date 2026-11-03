(function () {
  "use strict";
  const engine = globalThis.S004Experiment;
  const byId = (id) => document.getElementById(id);
  const form = byId("rehearsal-settings");
  const roundsInput = byId("hold-rounds");
  const conditionInput = byId("condition");
  const fixtureHelp = {
    "stable-compatible": "Expected: fixed cohorts while holding; shared schema 1 and one effect per retried transaction. Convergence needs a separate new observation.",
    "unstable-assignment": "Deliberately wrong: every second held round flips each user's version. Use at least two rounds to expose the instability; later returning routes do not erase it.",
    "incompatible-state": "Deliberately wrong: v2 writes schema 2 and loses the retry key contract. A retried operation spends two credits and issues two tickets, so user impact fails.",
    "missing-observation": "Expected unknown: u20 has no destination, state or effect observation. Observed counts exclude this user and convergence cannot pass.",
    "lagging-route": "Convergence-only negative: after a healthy split and a 100% request, observe u20 still on v1. Desired 100% does not prove convergence."
  };
  let state = engine.createRehearsal();

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function result(id, status, message) {
    const node = byId(id);
    node.textContent = message;
    node.className = `result ${status}`;
  }

  function clearError() {
    byId("input-error").hidden = true;
    byId("input-error").textContent = "";
    roundsInput.removeAttribute("aria-invalid");
    conditionInput.removeAttribute("aria-invalid");
  }

  function showCondition() {
    byId("condition-help").textContent = fixtureHelp[conditionInput.value] ??
      "Unrecognized condition: the next action will reject it without changing evidence.";
  }

  function renderRows(rows) {
    byId("cohort-rows").replaceChildren(...rows.map((row) => {
      const tr = document.createElement("tr");
      const pair = (actual, expected) => actual === null ? "— / —" : `${actual} / ${expected}`;
      const values = [
        row.id, `${row.bucket} / ${row.cohort} (${row.plannedVersion})`,
        row.observedVersion ?? "—", row.schemaVersion ?? "—",
        pair(row.credits, row.expectedCredits), pair(row.tickets, row.expectedTickets),
        row.effectCount === null ? "— / —" : `${row.effectCount} / 1`,
        `${row.outcome.toUpperCase()} — ${row.reason}`
      ];
      values.forEach((value, index) => {
        const cell = element(index === 0 ? "th" : "td", String(value));
        if (index === 0) cell.scope = "row";
        tr.append(cell);
      });
      return tr;
    }));
  }

  function verifier(snapshot) {
    const last = snapshot.trace.at(-1);
    if (last.action === "blocked-convergence") {
      return ["passed", "Passed guard check: convergence was refused. This does not turn failed/unknown user impact into success."];
    }
    if (last.action === "request-convergence") {
      return ["unknown", "Pending: a separate convergence observation is required. Configured 100% is not an observed result."];
    }
    if (snapshot.sampleCount === 0) return ["unknown", "Unknown: no synthetic observations have been recorded."];
    if (snapshot.impact.status === "failed") {
      return ["passed", "Passed negative guard check: a route, state or effect violation was detected and retained. Recorded users still FAILED; migration is not successful."];
    }
    if (snapshot.impact.status === "unknown") {
      return ["passed", "Passed negative guard check: missing evidence remains UNKNOWN rather than being reported as success."];
    }
    return ["passed", "Passed synthetic assertions: observed routes, shared state and one effect per retried transaction satisfy the requested fixture. A held split is still not complete migration."];
  }

  function render() {
    const snapshot = engine.inspect(state);
    byId("desired-percent").textContent = `${snapshot.desiredPercent}%`;
    const observed = snapshot.observed;
    byId("observed-counts").textContent = `${observed.hasSample ? "" : "Not observed — "}v1 ${observed.v1} / v2 ${observed.v2} / unknown ${observed.unknown}`;
    byId("round-count").textContent = `${snapshot.sampleCount} / ${snapshot.simulatedMinutes}`;
    byId("phase").textContent = {
      split: "Held experiment", converging: "Convergence requested", converged: "Synthetic fixture converged"
    }[snapshot.phase];
    byId("observation-age").textContent = observed.hasSample ?
      `Latest observation: round ${observed.roundId}, sampled under desired v2 ${observed.desiredPercent}%. ` +
        (snapshot.currentEvidence ? "This sample belongs to the current target." : "This sample predates the current 100% request; current convergence is unobserved.") :
      "No observation exists. Stable intended cohorts and configured percentages are not actual cohort observations.";
    const [guardStatus, guardText] = verifier(snapshot);
    result("verifier-result", guardStatus, guardText);
    const impact = snapshot.impact;
    result("impact-result", impact.status,
      `${impact.status.toUpperCase()} — ${impact.failedRounds} failed rounds; ${impact.unknownRounds} unknown rounds. ` +
      `${impact.failedUserObservations} failed and ${impact.unknownUserObservations} unknown recorded user observations. ` +
      (snapshot.sampleCount === 0 ? "All 20 fixture users are still unobserved." : "Prior adverse outcomes remain in this rehearsal."));
    result("migration-result", snapshot.migration.status, snapshot.migration.message);
    const checks = [
      `Stable intended cohorts over held split rounds: ${snapshot.checks.cohorts.toUpperCase()}.`,
      `Shared state and exactly-once effect contract over all recorded rounds: ${snapshot.checks.stateEffects.toUpperCase()}.`,
      `Current-target observation: ${snapshot.currentEvidence ? "present" : "absent"}; missing users in the latest sample: ${observed.unknown}.`,
      "Synthetic guard verification, user impact and migration are separate results; no real-user denominator is available."
    ];
    byId("assertions").replaceChildren(...checks.map((text) => element("li", text)));
    renderRows(snapshot.rows);
    byId("round-history").replaceChildren(...(snapshot.history.length ?
      snapshot.history.map((round) => element("li",
        `Round ${round.id} · desired v2 ${round.desiredPercent}% · ${round.condition} · ` +
        `observed v1 ${round.observed.v1}, v2 ${round.observed.v2}, unknown ${round.observed.unknown} · ${round.outcome.toUpperCase()}`)) :
      [element("li", "No recorded rounds. No successful outcome is implied.")]));
    byId("action-trace").replaceChildren(...snapshot.trace.map((event) => element("li", event.message)));
    byId("trace-heading").textContent = `Inspect action trace (${snapshot.trace.length} events)`;
    byId("hold-experiment").disabled = snapshot.phase !== "split";
    byId("request-convergence").disabled = snapshot.phase !== "split";
    byId("observe-convergence").disabled = snapshot.phase !== "converging";
    showCondition();
  }

  function act(transition) {
    try {
      const next = transition();
      state = next;
      clearError();
      render();
      byId("live-result").textContent = state.trace.at(-1).message;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The action was rejected.";
      byId("input-error").textContent = `Rejected input: ${message} Existing observations and trace are unchanged.`;
      byId("input-error").hidden = false;
      if (/round|integer|100/i.test(message)) roundsInput.setAttribute("aria-invalid", "true");
      else conditionInput.setAttribute("aria-invalid", "true");
      byId("live-result").textContent = `Rejected input: ${message}`;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    act(() => engine.holdExperiment(state, { rounds: roundsInput.value, condition: conditionInput.value }));
  });
  byId("request-convergence").addEventListener("click", () => act(() => engine.requestConvergence(state)));
  byId("observe-convergence").addEventListener("click", () => act(() => engine.observeConvergence(state, conditionInput.value)));
  byId("reset-rehearsal").addEventListener("click", () => {
    state = engine.createRehearsal();
    form.reset();
    clearError();
    render();
    byId("live-result").textContent = "Reset complete: only local memory was cleared. A separate 50/50 rehearsal has no observations. No resource or management operation occurred.";
    roundsInput.focus();
  });
  conditionInput.addEventListener("change", showCondition);
  render();
})();
