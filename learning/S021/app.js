(function () {
  "use strict";

  const { evaluatePool } = globalThis.S021Readiness;
  const fixtures = globalThis.S021Fixtures;
  const byId = (id) => document.getElementById(id);
  let input;
  let evaluationNumber = 0;

  function textElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function render() {
    const result = evaluatePool(input);
    const actual = result.allowAdmission ? "ALLOW" : "BLOCK";
    const expected = byId("expected").value;
    const matches = actual === expected;
    byId("scenario-name").textContent = input.name;
    byId("admission").textContent = `${actual} — ${result.allowAdmission ?
      "required pool eligible in the synthetic model only" : "required-pool admission held"}`;
    byId("admission").dataset.decision = actual.toLowerCase();
    byId("verifier").textContent = `${matches ? "PASS" : "FAIL"} — expected ${expected}; observed ${actual}. Synthetic prediction check only.`;
    byId("verifier").dataset.verdict = matches ? "pass" : "fail";
    byId("live-result").dataset.evaluation = String(++evaluationNumber);
    byId("ready-count").textContent = `${result.candidates.filter((entry) => entry.required && entry.state === "ready").length}` +
      ` / ${input.requiredCandidateIds.length} required candidates currently evidenced ready.`;
    byId("sample-result").textContent = `Aggregate sample: ${result.sample.state}` +
      `${result.sample.responder ? ` (${result.sample.responder})` : ""}. ${result.sample.note}`;
    byId("blocking-reasons").replaceChildren(...result.blockingReasons.map((reason) => textElement("li", reason)));

    byId("pool-results").replaceChildren(...result.candidates.map((entry) => {
      const row = document.createElement("tr");
      row.id = `row-${entry.id}`;
      row.dataset.required = String(entry.required);
      const state = entry.state === "not_ready" ? "Not ready" : entry.state === "ready" ? "Ready" : "Unknown";
      row.append(
        textElement("td", `${entry.id} — ${entry.required ? "required" : "optional, excluded"}`),
        textElement("td", `Observed ${entry.evidenceState}; ${entry.ageMs === null ? "age unknown" : `age ${entry.ageMs} ms`}`),
        textElement("td", state, `state-${entry.state}`),
        textElement("td", entry.required ?
          entry.state === "ready" ? "Required check satisfied" : `BLOCK: ${entry.reasons.join(" ")}` :
          "Not a required gate; not admitted to this pool")
      );
      return row;
    }));
    byId("trace").replaceChildren(...result.trace.map((event) =>
      textElement("li", `${event.executionMode} · ${event.code} · ${event.subject} · ${event.detail}`)));
    byId("impact-summary").textContent = "Unknown — 0 actual transitions observed; no success rate calculated. No migration was performed.";
    byId("model-effect").textContent = result.allowAdmission ?
      "Model effect: the required pool is eligible only within this readiness contract. No users are routed; route correctness and real health remain unknown." :
      "Model effect: hold candidate admission before exposure. Existing routing is not changed by this page; its real health remains unknown.";
    byId("impact-categories").replaceChildren(...result.userImpact.categories.map((category) =>
      textElement("li", `${category.label}: ${category.observation} — not measured.`)));
    byId("cleanup-result").textContent = "LOCAL ONLY — 0 resources created; 0 deleted; no stored state or remote cleanup. Reset restores the fixture, not an Azure environment.";
  }

  function syncCandidateControl() {
    byId("condition").value = input.candidates.find((entry) => entry.id === byId("instance").value).condition;
  }

  function loadScenario(id) {
    input = fixtures.createScenario(id);
    byId("instance").value = "candidate-b";
    syncCandidateControl();
    byId("endpoint-sample").value = input.sampleCondition;
    byId("optional-dependency").value = input.optionalDependencyCondition;
    byId("expected").value = input.expectedAdmission ? "ALLOW" : "BLOCK";
    render();
  }

  for (const button of document.querySelectorAll("button[data-scenario]")) {
    button.addEventListener("click", () => loadScenario(button.dataset.scenario));
  }
  byId("instance").addEventListener("change", syncCandidateControl);
  byId("apply-condition").addEventListener("click", () => {
    input = fixtures.updateCandidate(input, byId("instance").value, byId("condition").value);
    render();
  });
  byId("endpoint-sample").addEventListener("change", () => {
    input = fixtures.updateSample(input, byId("endpoint-sample").value);
    render();
  });
  byId("optional-dependency").addEventListener("change", () => {
    input = fixtures.updateOptionalDependency(input, byId("optional-dependency").value);
    render();
  });
  byId("expected").addEventListener("change", render);
  byId("controls").addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  byId("reset").addEventListener("click", () => loadScenario("one-unready"));
  loadScenario("one-unready");
})();
