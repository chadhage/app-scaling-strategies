(function (root) {
  "use strict";

  const impactCategories = [
    ["availability", "User-visible errors, timeouts, or broken required connections"],
    ["latency", "Journey completion beyond its latency budget"],
    ["state", "Unexpected logout, lost session/form state, navigation or asset failure"],
    ["effects", "Missing or duplicate business effects"],
    ["data", "Data freshness, ordering, or consistency outside its contract"]
  ];

  function validIds(value, allowEmpty) {
    return Array.isArray(value) && (allowEmpty || value.length > 0) &&
      [...value].every((id) => typeof id === "string" && id.trim().length > 0) &&
      new Set(value).size === value.length;
  }

  function evaluatePool(configuration) {
    const input = configuration && typeof configuration === "object" ? configuration : {};
    const trace = [];
    const blockingReasons = [];
    const record = (code, subject, detail) => {
      trace.push({ sequence: trace.length + 1, executionMode: "synthetic", code, subject, detail });
    };
    const requiredIds = Array.isArray(input.requiredCandidateIds) ?
      input.requiredCandidateIds.filter((id) => typeof id === "string" && id.trim()) : [];
    const requiredDependencies = Array.isArray(input.requiredDependencyIds) ?
      input.requiredDependencyIds.filter((id) => typeof id === "string" && id.trim()) : [];
    const records = Array.isArray(input.candidates) ? input.candidates : [];
    const contractErrors = [];

    if (!validIds(input.requiredCandidateIds, false)) {
      contractErrors.push("Required pool must contain unique, nonempty candidate identities.");
    }
    if (!validIds(input.requiredDependencyIds, true)) {
      contractErrors.push("Required dependency identities must be explicitly declared and unique.");
    }
    if (!Number.isFinite(input.nowMs) || input.nowMs < 0 ||
        !Number.isFinite(input.maxAgeMs) || input.maxAgeMs < 0) {
      contractErrors.push("A finite nonnegative synthetic clock and freshness limit are required.");
    }
    if (typeof input.deploymentId !== "string" || !input.deploymentId.trim()) {
      contractErrors.push("An explicit deployment identity is required.");
    }
    if (!Array.isArray(input.candidates)) {
      contractErrors.push("Per-instance candidate records are required.");
    }
    for (const reason of contractErrors) {
      blockingReasons.push(reason);
      record("contract.invalid", "required-pool", reason);
    }
    record("scope.required", "required-pool",
      `Required: ${requiredIds.join(", ") || "(none)"}. Nonrequired instances are not admitted by this gate.`);

    const sampleInput = input.endpointSample;
    let sampleState = "missing";
    if (sampleInput && typeof sampleInput === "object") {
      const age = input.nowMs - sampleInput.observedAtMs;
      if (!Number.isFinite(sampleInput.observedAtMs) || !Number.isFinite(age) || age < 0) {
        sampleState = "unknown";
      } else if (age > input.maxAgeMs) {
        sampleState = "stale";
      } else {
        sampleState = ["healthy", "failed", "unknown"].includes(sampleInput.state) ?
          sampleInput.state : "unknown";
      }
    }
    const sample = {
      state: sampleState,
      responder: typeof sampleInput?.responder === "string" ? sampleInput.responder : null,
      note: "Illustrative aggregate sample only; neither a substitute for targeted evidence nor a required routing check."
    };
    record("sample.informational", sample.responder || "aggregate-endpoint",
      `${sample.state} sample. ${sample.note} Route correctness remains unverified.`);

    const candidateIds = [...new Set([
      ...requiredIds,
      ...records.filter((entry) => entry && typeof entry.id === "string" && entry.id.trim())
        .map((entry) => entry.id)
    ])];

    function inspect(id) {
      const required = requiredIds.includes(id);
      const matches = records.filter((entry) => entry?.id === id);
      const observation = {
        id, required, state: "unknown", evidenceState: "missing",
        ageMs: null, reasons: [], dependencySummary: []
      };
      const stop = (code, detail, state = "unknown") => {
        observation.state = state;
        observation.reasons.push(detail);
        record(code, id, detail);
        return observation;
      };
      if (matches.length === 0) {
        return stop("candidate.missing-record", "Missing identity-bound candidate record.");
      }
      if (matches.length !== 1) {
        return stop("candidate.duplicate", "Duplicate candidate records are ambiguous.");
      }
      const evidence = matches[0].evidence;
      if (!evidence || typeof evidence !== "object") {
        return stop("candidate.missing", "Missing per-instance evidence; a healthy sample cannot fill it.");
      }
      observation.evidenceState = typeof evidence.state === "string" ? evidence.state : "unknown";
      if (evidence.deploymentId !== input.deploymentId) {
        return stop("candidate.identity", "Evidence belongs to another or unknown deployment identity.");
      }
      if (!Number.isFinite(evidence.observedAtMs) || evidence.observedAtMs < 0 ||
          !Number.isFinite(input.nowMs) || evidence.observedAtMs > input.nowMs) {
        return stop("candidate.clock", "Evidence timestamp is invalid or in the future; freshness is unknown.");
      }
      observation.ageMs = input.nowMs - evidence.observedAtMs;
      if (observation.ageMs > input.maxAgeMs) {
        return stop("candidate.stale",
          `Stale ${evidence.state} observation: age ${observation.ageMs} ms exceeds ${input.maxAgeMs} ms.`);
      }
      if (evidence.state === "failed" || evidence.state === "unready") {
        return stop(`candidate.${evidence.state}`, `Fresh ${evidence.state} evidence.`, "not_ready");
      }
      if (evidence.state !== "ready") {
        return stop("candidate.unknown", "Fresh observation has unknown readiness; it is not ready.");
      }

      const dependencies = Array.isArray(evidence.dependencies) ? evidence.dependencies : [];
      let dependencyUnknown = false;
      let dependencyFailed = false;
      for (const dependencyId of requiredDependencies) {
        const checks = dependencies.filter((dependency) => dependency?.id === dependencyId);
        const state = checks.length === 1 ? checks[0].state : "unknown";
        const knownState = ["ready", "failed", "unready"].includes(state) ? state : "unknown";
        observation.dependencySummary.push({ id: dependencyId, required: true, state: knownState });
        if (knownState === "ready") {
          record("dependency.required.ready", `${id}/${dependencyId}`, "Required dependency evidenced ready in this observation.");
        } else {
          const reason = `${dependencyId}: ${checks.length === 0 ? "missing" :
            checks.length > 1 ? "ambiguous duplicate evidence" : knownState}.`;
          observation.reasons.push(reason);
          dependencyUnknown ||= knownState === "unknown";
          dependencyFailed ||= knownState === "failed" || knownState === "unready";
          record("dependency.required.block", `${id}/${dependencyId}`, reason);
        }
      }
      for (const dependency of dependencies.filter((entry) =>
        entry && typeof entry.id === "string" && !requiredDependencies.includes(entry.id))) {
        observation.dependencySummary.push({ id: dependency.id, required: false, state: dependency.state || "unknown" });
        record("dependency.optional.ignored", `${id}/${dependency.id}`,
          `Optional dependency is ${dependency.state || "unknown"}; not a blanket gate in the declared contract.`);
      }
      if (dependencyUnknown || dependencyFailed) {
        observation.state = dependencyUnknown ? "unknown" : "not_ready";
        record("candidate.dependency-block", id, "Required dependency evidence does not establish readiness.");
      } else {
        observation.state = "ready";
        record("candidate.ready", id,
          `Identity-bound ready observation; age ${observation.ageMs} ms <= ${input.maxAgeMs} ms; required dependencies ready.`);
      }
      return observation;
    }

    const candidates = candidateIds.map((id) => {
      const observation = inspect(id);
      if (!observation.required) {
        record("candidate.optional.excluded", id,
          `${observation.state}; excluded from the required routing pool, not silently admitted.`);
      } else if (observation.state !== "ready") {
        blockingReasons.push(`${id}: ${observation.reasons.join(" ")}`);
      }
      return observation;
    });
    const allowAdmission = blockingReasons.length === 0;
    record(allowAdmission ? "admission.allow" : "admission.block", "required-pool",
      allowAdmission ? "Only the required pool is eligible in this synthetic model; no traffic is sent." :
        "Hold required-pool admission; no unsafe candidate exposure is simulated.");
    record("impact.unknown", "actual-users", "No user journeys or migrations were executed. All actual impact categories are unknown.");
    record("cleanup.local", "lesson", "Only in-memory inputs; no resources, storage, or remote cleanup.");

    return {
      executionMode: "synthetic",
      allowAdmission,
      candidates,
      blockingReasons,
      trace,
      sample,
      userImpact: {
        attemptedTransitions: 0,
        completedMigrations: 0,
        successRate: null,
        summary: "unknown",
        categories: impactCategories.map(([id, label]) => ({
          id, label, observation: "unknown",
          reason: "No actual user journeys are measured by this readiness-only rehearsal."
        }))
      },
      cleanup: {
        outcome: "local-only",
        resourcesCreated: 0,
        resourcesDeleted: 0,
        persistentState: false
      }
    };
  }

  const api = { evaluatePool };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.S021Readiness = api;
  }
})(globalThis);
