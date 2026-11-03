(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.S041Rehearsal = factory();
})(globalThis, function () {
  "use strict";

  const limits = Object.freeze({ maxClockMs: 10000, maxBudgetMs: 2000, maxRequests: 8 });
  const outcomes = Object.freeze(["CONTINUITY", "INTERRUPTED", "UNKNOWN"]);
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const clock = value => integer(value, 0, limits.maxClockMs);
  const budget = value => integer(value, 1, limits.maxBudgetMs);
  const identity = value => typeof value === "string" && /^[A-Za-z0-9:_-]{1,60}$/.test(value);
  const response = value => record(value) && integer(value.status, 100, 599) &&
    typeof value.body === "string" && value.body.length <= 500;
  const state = value => record(value) && Object.keys(value).length === 2 &&
    integer(value.cartRevision, 0, 10000) && integer(value.totalCents, 0, 1000000);

  function validate(input) {
    const issues = [];
    if (!record(input)) return ["The synthetic input must be a JSON object."];
    if (input.schemaVersion !== 1 || input.executionMode !== "synthetic") {
      issues.push("Only schemaVersion 1 and executionMode synthetic are supported.");
    }
    for (const key of ["cutoverAtMs", "retireV1AtMs", "observedAtMs"]) {
      if (!clock(input[key])) issues.push(key + " must be an integer from 0 to 10000 ms.");
    }
    if (clock(input.cutoverAtMs) && clock(input.retireV1AtMs) &&
        input.retireV1AtMs < input.cutoverAtMs) issues.push("v1 retirement cannot precede cutover.");
    if (clock(input.observedAtMs) &&
        (input.observedAtMs < input.cutoverAtMs || input.observedAtMs < input.retireV1AtMs)) {
      issues.push("Observation cannot precede the cutover or retirement action.");
    }
    const journey = input.journey;
    if (!record(journey) || !identity(journey.id) || !identity(journey.userId) ||
        !clock(journey.originalStartedAtMs) || !budget(journey.originalBudgetMs) ||
        !state(journey.expectedState)) {
      issues.push("The ORIGINAL journey identity, clock, budget and cart state must be valid.");
    }
    if (!Array.isArray(input.requests) || input.requests.length < 1 ||
        input.requests.length > limits.maxRequests) {
      issues.push("Declare 1 to 8 synthetic requests; empty or oversized pools are not evidence.");
      return issues;
    }
    const ids = new Set();
    for (let index = 0; index < input.requests.length; index += 1) {
      const request = input.requests[index];
      if (!Object.hasOwn(input.requests, index) || !record(request) ||
          !identity(request.id) || !clock(request.originalAdmittedAtMs) ||
          !budget(request.originalRequestBudgetMs) || !budget(request.workMs) ||
          !response(request.expectedResponse)) {
        issues.push("Request " + (index + 1) + " needs valid ORIGINAL admission, budget, work and response contract.");
        continue;
      }
      if (ids.has(request.id)) issues.push("Duplicate request identity: " + request.id + ".");
      ids.add(request.id);
      if (!record(journey) || request.userId !== journey.userId || request.journeyId !== journey.id) {
        issues.push(request.id + " is not bound to the declared user and original journey.");
      }
      if (record(journey) && (request.originalAdmittedAtMs < journey.originalStartedAtMs ||
          request.originalAdmittedAtMs > input.observedAtMs)) {
        issues.push(request.id + " admission is outside the original journey observation.");
      }
    }
    return issues;
  }

  function inspectEvidence(input, request, owner) {
    const evidence = request.evidence;
    const unknown = reason => ({ quality: "missing", reason, kind: "unknown" });
    const invalid = detail => ({ quality: "invalid", reason: "invalid-evidence", kind: "unknown", detail });
    if (evidence === null || evidence === undefined) return unknown("missing-completion");
    if (!record(evidence)) return invalid("The completion record is not an object.");
    if (evidence.kind === "unknown") return unknown("explicit-unknown");
    if (!["response", "interrupted"].includes(evidence.kind)) return invalid("Unknown evidence kind.");
    if (evidence.requestId !== request.id || evidence.userId !== request.userId ||
        evidence.journeyId !== request.journeyId || evidence.deployment !== owner ||
        evidence.admittedAtMs !== request.originalAdmittedAtMs) {
      return invalid("Identity, owner or ORIGINAL admission does not match the admitted request.");
    }
    if (!clock(evidence.atMs) || evidence.atMs < request.originalAdmittedAtMs ||
        evidence.atMs > input.observedAtMs) {
      return invalid("Evidence time is invalid, before admission or after observation.");
    }
    const scheduledAtMs = request.originalAdmittedAtMs + request.workMs;
    if ((evidence.kind === "response" && evidence.atMs !== scheduledAtMs) ||
        (evidence.kind === "interrupted" && evidence.atMs > scheduledAtMs)) {
      return invalid("Evidence does not match the declared synthetic work schedule.");
    }
    if (Object.hasOwn(evidence, "reportedRetryLatencyMs") && !clock(evidence.reportedRetryLatencyMs)) {
      return invalid("A reported retry clock must be a bounded integer, even though it cannot replace the original clock.");
    }
    if (evidence.kind === "interrupted") return { quality: "valid", kind: "interrupted", atMs: evidence.atMs };
    const hasResponse = evidence.response !== undefined && evidence.response !== null;
    const hasState = evidence.state !== undefined && evidence.state !== null;
    if ((hasResponse && !response(evidence.response)) || (hasState && !state(evidence.state))) {
      return invalid("Malformed response or cart-state evidence.");
    }
    return {
      quality: hasResponse && hasState ? "valid" : "missing",
      reason: !hasResponse ? "missing-response" : !hasState ? "missing-state" : undefined,
      kind: "response",
      atMs: evidence.atMs,
      responseStatus: !hasResponse ? "unknown" :
        evidence.response.status === request.expectedResponse.status &&
        evidence.response.body === request.expectedResponse.body ? "correct" : "incorrect",
      stateStatus: !hasState ? "unknown" :
        evidence.state.cartRevision === input.journey.expectedState.cartRevision &&
        evidence.state.totalCents === input.journey.expectedState.totalCents ? "preserved" : "changed",
      responseBody: hasResponse ? evidence.response.body : undefined,
      reportedRetryLatencyMs: evidence.reportedRetryLatencyMs
    };
  }

  function evaluateRequest(input, request) {
    const owner = request.originalAdmittedAtMs < input.cutoverAtMs ? "v1" : "v2";
    const evidence = inspectEvidence(input, request, owner);
    const result = {
      id: request.id,
      userId: request.userId,
      journeyId: request.journeyId,
      owner,
      originalAdmittedAtMs: request.originalAdmittedAtMs,
      originalRequestBudgetMs: request.originalRequestBudgetMs,
      requestDeadlineMs: request.originalAdmittedAtMs + request.originalRequestBudgetMs,
      journeyDeadlineMs: input.journey.originalStartedAtMs + input.journey.originalBudgetMs,
      scheduledAtMs: request.originalAdmittedAtMs + request.workMs,
      completedAtMs: null,
      interruptedAtMs: null,
      elapsedMs: null,
      responseStatus: "unknown",
      stateStatus: "unknown",
      evidenceQuality: evidence.quality,
      outcome: "unknown",
      reason: evidence.reason,
      detail: evidence.detail || ""
    };
    if (evidence.kind === "interrupted" &&
        (owner === "v2" || evidence.atMs <= input.retireV1AtMs)) {
      result.outcome = "interrupted";
      result.reason = "observed-interruption";
      result.interruptedAtMs = evidence.atMs;
      result.elapsedMs = evidence.atMs - request.originalAdmittedAtMs;
      return result;
    }
    if (owner === "v1" && result.scheduledAtMs > input.retireV1AtMs) {
      result.outcome = "interrupted";
      result.reason = "premature-retirement";
      result.interruptedAtMs = input.retireV1AtMs;
      result.elapsedMs = input.retireV1AtMs - request.originalAdmittedAtMs;
      result.detail = "v1 stops while this synthetic request is active; a claimed later response is not a completion.";
      if (evidence.kind === "response") result.evidenceQuality = "invalid";
      return result;
    }
    if (evidence.kind !== "response") return result;
    result.completedAtMs = evidence.atMs;
    result.elapsedMs = evidence.atMs - request.originalAdmittedAtMs;
    result.responseStatus = evidence.responseStatus;
    result.stateStatus = evidence.stateStatus;
    result.responseBody = evidence.responseBody;
    result.reportedRetryLatencyMs = evidence.reportedRetryLatencyMs;
    if (evidence.atMs > result.requestDeadlineMs) result.reason = "original-request-budget";
    else if (evidence.atMs > result.journeyDeadlineMs) result.reason = "original-journey-budget";
    else if (evidence.responseStatus === "incorrect") result.reason = "incorrect-response";
    else if (evidence.stateStatus === "changed") result.reason = "state-not-preserved";
    else if (evidence.responseStatus === "unknown" || evidence.stateStatus === "unknown") return result;
    else result.reason = "correct-within-original-budgets";
    result.outcome = result.reason === "correct-within-original-budgets" ? "completed" : "interrupted";
    return result;
  }

  function migrationLimit() {
    return {
      classification: "unknown",
      provenMovedUsers: 0,
      explanation: "A v1 completion is legitimate old work. A v2 admission is request-level exposure, not proof a user moved."
    };
  }

  function rehearse(input) {
    const issues = validate(input);
    if (issues.length) {
      const attempts = record(input) && Array.isArray(input.requests) &&
        input.requests.length <= limits.maxRequests ? input.requests.length : null;
      return {
        executionMode: "synthetic", validInput: false, outcome: "UNKNOWN", issues, requests: [],
        counts: { attemptedRequests: attempts, completed: 0, interrupted: 0, unknown: attempts,
          oldCompletions: 0, oldCompletionsAfterCutover: 0, newAdmissions: 0 },
        originalJourney: null,
        userMigration: migrationLimit(),
        retirement: { gate: "HOLD", allowed: false, reason: "Invalid input cannot authorize retirement." },
        trace: [{ sequence: 1, executionMode: "synthetic", atMs: null,
          kind: "contract.invalid", detail: issues.join(" ") }]
      };
    }

    const requests = input.requests.map(request => evaluateRequest(input, request));
    const old = requests.filter(request => request.owner === "v1");
    const counts = {
      attemptedRequests: requests.length,
      completed: requests.filter(request => request.outcome === "completed").length,
      interrupted: requests.filter(request => request.outcome === "interrupted").length,
      unknown: requests.filter(request => request.outcome === "unknown").length,
      oldCompletions: old.filter(request => request.outcome === "completed").length,
      oldCompletionsAfterCutover: old.filter(request => request.outcome === "completed" &&
        request.completedAtMs >= input.cutoverAtMs).length,
      newAdmissions: requests.filter(request => request.owner === "v2").length
    };
    const gate = old.some(request => request.outcome === "interrupted") ? "BLOCK" :
      old.some(request => request.outcome === "unknown") ? "HOLD" : "ALLOW";
    const retirement = {
      atMs: input.retireV1AtMs,
      gate,
      allowed: gate === "ALLOW",
      reason: gate === "ALLOW" ?
        "Every declared v1 request has correct, state-preserving completion within its ORIGINAL budgets by retirement." :
        gate === "BLOCK" ? "At least one declared v1 request is interrupted; continuity is not established." :
        "At least one declared v1 completion is unknown; hold retirement rather than assume it drained."
    };
    const events = [];
    const add = (atMs, order, kind, detail) => events.push({ atMs, order, kind, detail });
    add(input.journey.originalStartedAtMs, 0, "journey.start",
      input.journey.id + ": ORIGINAL budget " + input.journey.originalBudgetMs + " ms; deadline " +
      (input.journey.originalStartedAtMs + input.journey.originalBudgetMs) + " ms.");
    add(input.cutoverAtMs, 10, "cutover",
      "New admissions now go to v2. Already admitted v1 work stays on v1; no request is transferred.");
    for (const request of requests) {
      add(request.originalAdmittedAtMs, 20, "admission",
        request.id + " admitted to " + request.owner + "; ORIGINAL request budget " +
        request.originalRequestBudgetMs + " ms; request deadline " + request.requestDeadlineMs +
        " ms; ORIGINAL journey deadline " + request.journeyDeadlineMs + " ms.");
      if (request.reportedRetryLatencyMs !== undefined) {
        add(request.completedAtMs, 25, "retry-clock.ignored",
          request.id + ": reported retry latency " + request.reportedRetryLatencyMs +
          " ms ignored; ORIGINAL elapsed is " + request.elapsedMs + " ms.");
      }
      const atMs = request.interruptedAtMs === null ? request.completedAtMs : request.interruptedAtMs;
      add(atMs === null ? input.observedAtMs : atMs, 30,
        request.outcome === "completed" ? "completion" :
          request.outcome === "interrupted" ? "interruption" :
            request.evidenceQuality === "invalid" ? "evidence.invalid" : "evidence.unknown",
        request.id + " on " + request.owner + ": " + request.outcome + " / " + request.reason +
        (request.outcome === "completed" && request.owner === "v1" && request.completedAtMs >= input.cutoverAtMs ?
          ". Legitimate old completion after cutover; not a failed migration or proof of a moved user" : "") +
        (request.detail ? ". " + request.detail : "") + ".");
    }
    add(input.retireV1AtMs, 40, "retirement", "Conservative synthetic continuity gate " + gate + ". " + retirement.reason);
    const trace = events.sort((left, right) => left.atMs - right.atMs || left.order - right.order)
      .map((event, index) => ({
        sequence: index + 1, executionMode: "synthetic", atMs: event.atMs,
        kind: event.kind, detail: event.detail
      }));
    return {
      executionMode: "synthetic", validInput: true,
      outcome: counts.interrupted ? "INTERRUPTED" : counts.unknown ? "UNKNOWN" : "CONTINUITY",
      issues: requests.filter(request => request.evidenceQuality === "invalid")
        .map(request => request.id + ": " + (request.detail || request.reason)),
      originalJourney: {
        id: input.journey.id, userId: input.journey.userId,
        originalStartedAtMs: input.journey.originalStartedAtMs,
        originalBudgetMs: input.journey.originalBudgetMs,
        deadlineMs: input.journey.originalStartedAtMs + input.journey.originalBudgetMs,
        expectedState: { ...input.journey.expectedState }
      },
      counts, requests, retirement, userMigration: migrationLimit(), trace
    };
  }

  function checkPrediction(result, prediction) {
    const valid = record(result) && result.executionMode === "synthetic" &&
      outcomes.includes(result.outcome) && outcomes.includes(prediction);
    return {
      passed: valid && prediction === result.outcome,
      expected: prediction,
      actual: valid ? result.outcome : "UNKNOWN"
    };
  }

  return Object.freeze({ limits, outcomes, rehearse, checkPrediction });
});
