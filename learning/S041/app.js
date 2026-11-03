(function () {
  "use strict";
  const model = globalThis.S041Rehearsal;
  const fixtures = globalThis.S041Fixtures;
  const byId = suffix => document.getElementById("s041-" + suffix);
  const scenario = byId("scenario");
  const editor = byId("json");
  const prediction = byId("prediction");
  const controls = {
    cutoverAtMs: byId("cutover"),
    retireV1AtMs: byId("retire"),
    journeyBudgetMs: byId("journey-budget"),
    requestBudgetMs: byId("request-budget"),
    oldWorkMs: byId("old-work")
  };
  let result;

  function textElement(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function cell(lines) {
    const element = document.createElement("td");
    for (const line of lines) element.append(textElement("p", line));
    return element;
  }

  function render(next) {
    result = next;
    byId("summary").dataset.outcome = result.outcome;
    byId("outcome").textContent = "Synthetic continuity: " + result.outcome +
      (result.validInput ? "" : " — invalid input; no success inferred");
    const counts = result.counts;
    const number = value => value === null ? "unknown" : String(value);
    byId("counts").textContent = "Synthetic attempted requests: " + number(counts.attemptedRequests) +
      " · completed: " + counts.completed + " · interrupted: " + counts.interrupted +
      " · unknown: " + number(counts.unknown) + " · legitimate v1 completions: " +
      counts.oldCompletions + " · modeled new v2 admissions: " + counts.newAdmissions + ".";
    byId("retirement").textContent = "Retirement gate: " + result.retirement.gate + ". " + result.retirement.reason;
    byId("original-journey").textContent = result.originalJourney ?
      "ORIGINAL " + result.originalJourney.id + " / " + result.originalJourney.userId +
      ": starts " + result.originalJourney.originalStartedAtMs + " ms; budget " +
      result.originalJourney.originalBudgetMs + " ms; deadline " + result.originalJourney.deadlineMs +
      " ms. Expected state: cart revision " + result.originalJourney.expectedState.cartRevision +
      ", total " + result.originalJourney.expectedState.totalCents + " cents." :
      "ORIGINAL journey: unknown because the input contract is invalid.";
    byId("issues").replaceChildren(...result.issues.map(issue => textElement("li", issue)));
    byId("requests").replaceChildren(...result.requests.map(function (request) {
      const row = document.createElement("tr");
      row.append(
        cell([request.id, "Owner: " + request.owner, request.userId + " / " + request.journeyId]),
        cell(["Admitted: " + request.originalAdmittedAtMs + " ms",
          "Request: " + request.originalRequestBudgetMs + " ms → deadline " + request.requestDeadlineMs + " ms",
          "Journey deadline: " + request.journeyDeadlineMs + " ms"]),
        cell([request.interruptedAtMs !== null ? "Interrupted at: " + request.interruptedAtMs + " ms" :
          request.completedAtMs !== null ? "Response at: " + request.completedAtMs + " ms" : "No trusted completion",
          "ORIGINAL elapsed: " + (request.elapsedMs === null ? "unknown" : request.elapsedMs + " ms"),
          request.reportedRetryLatencyMs === undefined ? "No replacement clock used" :
            "Retry clock " + request.reportedRetryLatencyMs + " ms: ignored"]),
        cell(["Response: " + request.responseStatus, "State: " + request.stateStatus,
          request.responseBody === undefined ? "Evidence: " + request.evidenceQuality : "Body: " + request.responseBody]),
        cell([request.outcome.toUpperCase(), request.reason, "Evidence: " + request.evidenceQuality])
      );
      return row;
    }));
    byId("trace").replaceChildren(...result.trace.map(event => textElement("li",
      "synthetic | #" + event.sequence + " | t=" + (event.atMs === null ? "unknown" : event.atMs + " ms") +
      " | " + event.kind + " | " + event.detail)));
    byId("prediction-result").textContent = "Not checked. The exercise check is separate from user impact.";
  }

  function syncControls(input) {
    const values = {
      cutoverAtMs: input.cutoverAtMs,
      retireV1AtMs: input.retireV1AtMs,
      journeyBudgetMs: input.journey.originalBudgetMs,
      requestBudgetMs: input.requests[0].originalRequestBudgetMs,
      oldWorkMs: input.requests[0].workMs
    };
    for (const [key, element] of Object.entries(controls)) element.value = String(values[key]);
  }

  function loadPreset(id, notice) {
    const input = fixtures.makeFixture(id);
    syncControls(input);
    editor.value = JSON.stringify(input, null, 2);
    render(model.rehearse(input));
    byId("notice").textContent = notice;
  }

  scenario.addEventListener("change", function () {
    loadPreset(scenario.value, "Preset loaded. All evidence is generated synthetic data; choose a prediction separately.");
  });

  byId("apply").addEventListener("click", function () {
    const values = {};
    for (const [key, element] of Object.entries(controls)) values[key] = element.valueAsNumber;
    const input = fixtures.makeFixture(scenario.value, values);
    editor.value = JSON.stringify(input, null, 2);
    render(model.rehearse(input));
    byId("notice").textContent = "Timing controls applied to a newly generated synthetic fixture. ORIGINAL admissions and budgets are not restarted at cutover.";
  });

  byId("evaluate").addEventListener("click", function () {
    let input;
    try {
      if (editor.value.length > 24000) throw new Error("Input too long");
      input = JSON.parse(editor.value);
    } catch {
      const invalid = model.rehearse(null);
      invalid.issues = ["Invalid JSON syntax or input over 24,000 characters. No evidence was evaluated."];
      invalid.trace[0].detail = invalid.issues[0];
      render(invalid);
      byId("notice").textContent = "Edited JSON rejected. The prior successful result has been replaced with UNKNOWN.";
      return;
    }
    render(model.rehearse(input));
    byId("notice").textContent = "Edited synthetic JSON evaluated. Numeric controls will regenerate the selected preset and replace these edits.";
  });

  byId("check").addEventListener("click", function () {
    const check = model.checkPrediction(result, prediction.value);
    byId("prediction-result").textContent = (check.passed ? "PASS" : "FAIL") +
      " — prediction " + check.expected + "; modeled impact " + check.actual +
      ". This exercise check is not a migration verdict and does not change user impact.";
  });

  byId("reset").addEventListener("click", function () {
    scenario.value = "safe";
    prediction.value = "CONTINUITY";
    loadPreset("safe", "Reset: exact safe fixture restored. Only in-memory rehearsal state changed; no resources exist.");
  });

  loadPreset("safe", "Safe synthetic fixture loaded. Controls regenerate evidence, not measurements. Reset restores this exact fixture.");
})();
