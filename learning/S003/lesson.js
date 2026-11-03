(function () {
  "use strict";

  const model = globalThis.S003Canary;
  const element = id => document.getElementById(id);
  const expectations = {
    safe: "Expected: actual destinations match the chosen stage and every journey passes. Exactly one next stage becomes eligible; unchanged users add no migration credit.",
    regressed: "Expected: the newest candidate user's HTTP 200 journey takes 1400 ms. Promotion must be blocked and the failed attempt retained.",
    missing: "Expected: no actual destinations or journey success can be inferred. Promotion is blocked and the attempted outcome remains unknown.",
    unknown: "Expected: the newest candidate destination is v2 but the complete journey is unverified. Unknown is not success; promotion is blocked.",
    partial: "Expected: desired traffic exceeds actual v2 destinations because the newest selected user stays on v1. No fabricated migration; promotion is blocked.",
    stale: "Expected: the observation arrives 61 seconds late, beyond the 60-second lifetime. Even otherwise passing journeys cannot permit the next increment.",
    "short-window": "Expected: only 5 simulated seconds are covered, less than the configured observation window. Promotion is blocked.",
    malformed: "Expected: the sample payload is not a list of journeys. Destinations and attempted outcomes stay unknown; promotion is blocked without crashing or clearing the trace."
  };
  const reasonText = {
    "missing-observation": "Missing observations: no complete current destination snapshot is available.",
    "wrong-stage": "Wrong stage/epoch: earlier evidence cannot authorize newly admitted users.",
    "invalid-timing": "Observation timestamps are missing, out of order or invalid.",
    "short-window": "Observation window is incomplete.",
    "stale-observation": "Observation is older than the 60-second evidence lifetime.",
    "incomplete-coverage": "Coverage is incomplete or user identities are duplicated.",
    "routing-mismatch": "Actual cohort destinations differ from desired routing.",
    "journey-regression": "A complete-journey acceptance assertion failed.",
    "unknown-outcome": "At least one complete journey outcome is unknown.",
    "retained-regression": "A prior regression remains latched; later probes cannot erase its impact.",
    "retained-failure": "Failed attempted transitions remain in the denominator.",
    "retained-unknown": "Pending or recorded unknown attempted transitions are not migration successes.",
    "rollback-active": "Rollback was requested; this rehearsal cannot expand again."
  };

  let run = model.createRun();

  function node(tag, text) {
    const result = document.createElement(tag);
    result.textContent = text;
    return result;
  }

  function verdict(gate, counts) {
    if (run.lastAction === "promotion-blocked" && gate.reasons.length > 0) {
      return "PASS — negative educational verification: the next increment was blocked. This is not uninterrupted migration.";
    }
    if (run.phase === "rolled-back") {
      return "RECOVERY REQUESTED — desired traffic is 0% to v2; actual rollback routing needs observation. Earlier impacts remain.";
    }
    if (counts.allMigrated) return "PASS — all 20 synthetic transition journeys passed at the final stage. No native migration or reliability guarantee is proven.";
    if (gate.ready) return "PASS — this synthetic stage meets the journey gates. Only the next cohort is eligible.";
    return "HOLD — do not increase traffic. Missing, regressed, unknown or invalid evidence must not authorize expansion.";
  }

  function render() {
    const active = run !== null;
    for (const id of ["observe", "promote", "age", "rollback", "clear"]) element(id).disabled = !active;
    element("fixture-expectation").textContent = expectations[element("fixture").value];
    if (!active) {
      for (const id of ["desired-percent", "actual-destinations", "next-stage", "clock"]) element(id).textContent = "No active rehearsal";
      element("verification-verdict").textContent = "NOT RUN — start a new local rehearsal to evaluate the guard.";
      element("verification-verdict").dataset.state = "hold";
      element("gate-reasons").replaceChildren();
      element("journey-impact").textContent = "No active sample. An empty sample is not 100% success.";
      element("routing-summary").textContent = "No desired or observed migration is claimed.";
      element("cohort-rows").replaceChildren();
      element("trace").replaceChildren();
      element("cleanup-result").textContent = "Complete — local rehearsal memory cleared explicitly. No cloud resources, browser storage or background services need cleanup.";
      element("live-result").textContent = "Local rehearsal cleared. No active sample and no migration success claimed.";
      return;
    }

    const gate = model.assess(run);
    const counts = model.summarize(run);
    const decision = verdict(gate, counts);
    element("desired-percent").textContent = `${run.desiredPercent}%`;
    element("actual-destinations").textContent = counts.actualV2 === null
      ? "Not observed"
      : `${counts.actualV2} v2 / ${counts.actualV1} v1 / ${counts.actualUnknown} unknown`;
    element("next-stage").textContent = gate.nextPercent === null ? "None" : `${gate.nextPercent}%`;
    element("clock").textContent = `T+${run.clockSeconds}s`;
    element("verification-verdict").textContent = decision;
    element("verification-verdict").dataset.state = gate.ready || run.lastAction === "promotion-blocked" ? "pass" : "hold";
    element("gate-reasons").replaceChildren(...(gate.reasons.length
      ? gate.reasons.map(reason => node("li", `${reasonText[reason]} [${reason}]`))
      : [node("li", `Current stage: complete ${run.config.windowSeconds}s window; evidence age ≤60s; all 20 actual destinations and journey assertions pass.`)]));
    const impact = `${counts.attempted} attempted transitions: ${counts.uninterrupted} recorded uninterrupted, ${counts.failed} failed, ${counts.unknown} unknown/pending. ${counts.unchanged} unchanged users are not migrated.`;
    element("journey-impact").textContent = `${impact} ${counts.interruptedUsers} distinct users have a recorded journey interruption.`;
    element("routing-summary").textContent = `Desired: ${counts.desiredV2}/20 users on v2 (${run.desiredPercent}%). Actual latest observation: ${
      counts.actualV2 === null ? "missing; no convergence assumed" : `${counts.actualV2}/20 on v2`
    }. v1 is retained; no drain or retirement is proven.`;
    element("cleanup-result").textContent = "No resources created. Only in-memory lesson state exists; promotion and rollback retain its trace. Clear explicitly to discard local history.";
    element("live-result").textContent = `${run.desiredPercent}% desired to v2. ${decision} ${impact}`;
    renderCohorts();
    renderTrace();
  }

  function renderCohorts() {
    const entries = Array.isArray(run.currentObservation?.users) ? run.currentObservation.users : [];
    const snapshot = new Map(entries.map(user => [user?.id, user]));
    const rows = run.users.map((id, index) => {
      const sample = snapshot.get(id);
      const attempt = run.attempts.find(entry => entry.userId === id);
      const row = document.createElement("tr");
      row.dataset.user = id;
      const heading = node("th", id);
      heading.scope = "row";
      const destination = ["v1", "v2"].includes(sample?.destination) ? sample.destination : "Not observed";
      const assertion = sample ? `${model.classifyJourney(sample)}; HTTP ${sample.httpStatus ?? "unknown"}; ${
        sample.latencyMs ?? "unknown"
      } ms; auth ${sample.authentication ?? "unknown"}; state ${sample.state ?? "unknown"}; effects ${sample.effects ?? "unknown"}` : "Unknown — no sample";
      row.append(
        heading, node("td", "v1"), node("td", index < run.desiredPercent / 5 ? "v2" : "v1"),
        node("td", destination), node("td", assertion),
        node("td", attempt ? `${attempt.status}; first attempted at ${attempt.stagePercent}%` : "Unchanged — not migration")
      );
      return row;
    });
    element("cohort-rows").replaceChildren(...rows);
  }

  function renderTrace() {
    element("trace").replaceChildren(...run.trace.map(event => {
      const entry = node("li", `T+${event.atSeconds}s · epoch ${event.epoch} · ${event.type} · desired ${event.desiredPercent}% · actual v2 ${
        event.actualV2 === null ? "not observed" : `${event.actualV2}/20`
      } · attempts ${event.attempted} = ${event.uninterrupted} uninterrupted + ${event.failed} failed + ${event.unknown} unknown. ${
        event.cohortAdded.length ? `New cohort: ${event.cohortAdded.join(", ")}. ` : ""
      }${event.detail}`);
      entry.dataset.event = event.type;
      return entry;
    }));
  }

  function clearConfigurationError() {
    element("configuration-error").textContent = "";
    element("configuration-error").hidden = true;
  }

  element("configuration").addEventListener("submit", event => {
    event.preventDefault();
    let next;
    try {
      next = model.createRun({
        stages: element("stage-plan").value.split(",").map(Number),
        windowSeconds: Number(element("window-seconds").value)
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      const message = `Configuration rejected — ${error.message} ${
        run === null ? "No active rehearsal was started." : "The current rehearsal and trace are unchanged."
      }`;
      element("configuration-error").textContent = message;
      element("configuration-error").hidden = false;
      element("live-result").textContent = message;
      return;
    }
    run = next;
    clearConfigurationError();
    render();
  });
  element("fixture").addEventListener("change", () => {
    element("fixture-expectation").textContent = expectations[element("fixture").value];
  });
  element("observe").addEventListener("click", () => {
    run = model.recordObservation(run, model.makeObservation(run, element("fixture").value));
    render();
  });
  element("promote").addEventListener("click", () => { run = model.promote(run); render(); });
  element("age").addEventListener("click", () => { run = model.advanceClock(run); render(); });
  element("rollback").addEventListener("click", () => { run = model.rollback(run); render(); });
  element("clear").addEventListener("click", () => {
    run = null;
    clearConfigurationError();
    render();
    element("start").focus();
  });
  render();
})();
