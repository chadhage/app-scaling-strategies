(function (root) {
  "use strict";

  const scenarios = {
    "all-ready": { name: "All required fresh-ready", expectedAdmission: true },
    "one-unready": { name: "Make one candidate unready", expectedAdmission: false },
    stale: { name: "Stale required evidence", expectedAdmission: false },
    "sample-only": { name: "Healthy sample only", expectedAdmission: false }
  };
  const conditions = ["ready", "unready", "failed", "stale", "missing", "unknown"];
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function evidenceFor(input, condition) {
    if (condition === "missing") return null;
    return {
      deploymentId: input.deploymentId,
      observedAtMs: input.nowMs - (condition === "stale" ? input.maxAgeMs + 1 : 5000),
      state: condition === "stale" ? "ready" : condition,
      dependencies: [
        { id: "primary-store", state: "ready" },
        ...(input.optionalDependencyCondition === "missing" ? [] :
          [{ id: "recommendations", state: input.optionalDependencyCondition }])
      ]
    };
  }

  function createScenario(id) {
    if (!Object.hasOwn(scenarios, id)) throw new RangeError("Unknown S021 scenario.");
    const input = {
      ...scenarios[id],
      deploymentId: "candidate-v2",
      nowMs: 120000,
      maxAgeMs: 30000,
      requiredCandidateIds: ["candidate-a", "candidate-b", "candidate-c"],
      requiredDependencyIds: ["primary-store"],
      optionalDependencyCondition: "failed",
      sampleCondition: "healthy",
      endpointSample: { state: "healthy", responder: "candidate-a", observedAtMs: 115000 },
      candidates: []
    };
    for (const candidateId of [...input.requiredCandidateIds, "candidate-shadow"]) {
      let condition = candidateId === "candidate-shadow" ? "failed" : "ready";
      if (candidateId === "candidate-b") {
        condition = id === "one-unready" ? "unready" : id === "stale" ? "stale" :
          id === "sample-only" ? "missing" : condition;
      }
      if (id === "sample-only" && candidateId === "candidate-c") condition = "unknown";
      input.candidates.push({ id: candidateId, condition, evidence: evidenceFor(input, condition) });
    }
    return input;
  }

  function updateCandidate(input, id, condition) {
    if (!conditions.includes(condition)) throw new RangeError("Unknown candidate condition.");
    const next = copy(input);
    const candidate = next.candidates.find((entry) => entry.id === id);
    if (!candidate) throw new RangeError("Unknown candidate identity.");
    candidate.condition = condition;
    candidate.evidence = evidenceFor(next, condition);
    next.name = "Custom per-instance configuration";
    return next;
  }

  function updateSample(input, condition) {
    if (!["healthy", "failed", "stale", "missing", "unknown"].includes(condition)) {
      throw new RangeError("Unknown sample condition.");
    }
    const next = copy(input);
    next.sampleCondition = condition;
    next.endpointSample = condition === "missing" ? null : {
      state: condition === "stale" ? "healthy" : condition,
      responder: "candidate-a",
      observedAtMs: next.nowMs - (condition === "stale" ? next.maxAgeMs + 1 : 5000)
    };
    next.name = "Custom aggregate sample";
    return next;
  }

  function updateOptionalDependency(input, condition) {
    if (!["ready", "failed", "missing", "unknown"].includes(condition)) {
      throw new RangeError("Unknown optional dependency condition.");
    }
    const next = copy(input);
    next.optionalDependencyCondition = condition;
    for (const candidate of next.candidates) {
      if (candidate.evidence) {
        candidate.evidence.dependencies = candidate.evidence.dependencies.filter((entry) => entry.id !== "recommendations");
        if (condition !== "missing") {
          candidate.evidence.dependencies.push({ id: "recommendations", state: condition });
        }
      }
    }
    next.name = "Custom optional dependency";
    return next;
  }

  const api = { createScenario, updateCandidate, updateSample, updateOptionalDependency, conditions };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.S021Fixtures = api;
  }
})(globalThis);
