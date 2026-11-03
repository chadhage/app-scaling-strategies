(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.S041Fixtures = factory();
})(globalThis, function () {
  "use strict";

  const scenarios = Object.freeze([
    { id: "safe", label: "Safe cutover", prediction: "CONTINUITY" },
    { id: "premature-retirement", label: "Premature retirement", prediction: "INTERRUPTED" },
    { id: "retry-clock-reset", label: "Retry clock reset", prediction: "INTERRUPTED" },
    { id: "state-loss", label: "State lost on old completion", prediction: "INTERRUPTED" },
    { id: "wrong-response", label: "Wrong response", prediction: "INTERRUPTED" },
    { id: "missing-completion", label: "Missing old completion", prediction: "UNKNOWN" },
    { id: "forged-owner", label: "Invalid evidence: forged owner", prediction: "UNKNOWN" },
    { id: "future-evidence", label: "Invalid evidence: future timestamp", prediction: "UNKNOWN" }
  ].map(Object.freeze));

  function makeFixture(scenario = "safe", overrides = {}) {
    const defaults = {
      cutoverAtMs: 40,
      retireV1AtMs: scenario === "premature-retirement" ? 70 :
        scenario === "retry-clock-reset" ? 180 : 110,
      journeyBudgetMs: 180,
      requestBudgetMs: 120,
      oldWorkMs: scenario === "retry-clock-reset" ? 155 : 90
    };
    const settings = { ...defaults, ...overrides };
    const state = { cartRevision: 7, totalCents: 4200 };
    const requests = [
      { id: "r-before", originalAdmittedAtMs: 10, workMs: settings.oldWorkMs },
      { id: "r-after", originalAdmittedAtMs: 60, workMs: 80 }
    ].map(function (request) {
      const expectedResponse = { status: 200, body: "receipt:" + request.id + ":cart-r7:4200" };
      return {
        ...request,
        userId: "user-1",
        journeyId: "journey-1",
        originalRequestBudgetMs: settings.requestBudgetMs,
        expectedResponse,
        evidence: {
          kind: "response",
          requestId: request.id,
          userId: "user-1",
          journeyId: "journey-1",
          deployment: request.originalAdmittedAtMs < settings.cutoverAtMs ? "v1" : "v2",
          admittedAtMs: request.originalAdmittedAtMs,
          atMs: request.originalAdmittedAtMs + request.workMs,
          response: { ...expectedResponse },
          state: { ...state }
        }
      };
    });
    const fixture = {
      schemaVersion: 1,
      executionMode: "synthetic",
      scenario,
      cutoverAtMs: settings.cutoverAtMs,
      retireV1AtMs: settings.retireV1AtMs,
      observedAtMs: Math.min(10000, Math.max(settings.retireV1AtMs, 10 + settings.oldWorkMs, 140) + 20),
      journey: {
        id: "journey-1",
        userId: "user-1",
        originalStartedAtMs: 0,
        originalBudgetMs: settings.journeyBudgetMs,
        expectedState: { ...state }
      },
      requests
    };
    const old = requests[0];
    if (scenario === "retry-clock-reset") old.evidence.reportedRetryLatencyMs = 25;
    if (scenario === "state-loss") old.evidence.state.cartRevision = 6;
    if (scenario === "wrong-response") old.evidence.response.body = "receipt:wrong-cart";
    if (scenario === "missing-completion") old.evidence = null;
    if (scenario === "forged-owner") old.evidence.deployment = "v2";
    if (scenario === "future-evidence") old.evidence.atMs = fixture.observedAtMs + 1;
    return fixture;
  }

  return Object.freeze({ scenarios, makeFixture });
});
