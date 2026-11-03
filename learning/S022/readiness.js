(function (root) {
  "use strict";

  const IDS = Object.freeze(["database", "cache", "messaging", "service"]);
  const CONDITIONS = Object.freeze(["connected", "disconnected", "unknown", "missing", "stale"]);
  const POLICIES = Object.freeze(["cache-optional", "cache-required"]);
  const LABELS = Object.freeze({
    database: "Database", cache: "Cache", messaging: "Queue / messaging", service: "Service"
  });
  const DEFAULT_CONFIG = Object.freeze({
    policy: "cache-optional",
    conditions: Object.freeze({
      database: "connected",
      cache: "connected",
      messaging: "connected",
      service: "connected"
    })
  });
  const MAX_RUNS = 8;
  const MAX_EDITS = 64;
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function hasShape(value, keys) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Object.getOwnPropertySymbols(value).length !== 0) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.keys(descriptors).length === keys.length && keys.every((key) =>
      Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], "value")
      && descriptors[key].enumerable);
  }

  function denseArray(value) {
    return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
      && Object.getOwnPropertySymbols(value).length === 0
      && Object.getOwnPropertyNames(value).length === value.length + 1
      && Array.from({ length: value.length }, (_, index) => index).every((index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        return descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable;
      });
  }

  function sameData(expected, actual) {
    if (expected === null || typeof expected !== "object") return Object.is(expected, actual);
    if (Array.isArray(expected)) {
      return Array.isArray(actual) && actual.length === expected.length && denseArray(actual)
        && expected.every((entry, index) => sameData(entry, actual[index]));
    }
    return hasShape(actual, Object.keys(expected))
      && Object.keys(expected).every((key) => sameData(expected[key], actual[key]));
  }

  function validateConfig(config) {
    if (!hasShape(config, ["policy", "conditions"]) || !POLICIES.includes(config.policy)
        || !hasShape(config.conditions, IDS)
        || !IDS.every((id) => CONDITIONS.includes(config.conditions[id]))) {
      throw new Error("Invalid configuration: use a named policy and exactly four supported dependency conditions.");
    }
  }

  function validatePrediction(prediction) {
    if (prediction !== "ADMIT" && prediction !== "HOLD") {
      throw new Error("Invalid prediction: choose ADMIT or HOLD.");
    }
  }

  function derive(config, prediction) {
    const checks = IDS.map((id) => {
      const condition = config.conditions[id];
      const required = id !== "cache" || config.policy === "cache-required";
      const outcome = condition === "connected" ? "success"
        : condition === "disconnected" ? "failure" : "unknown";
      const ageMs = condition === "missing" ? null : condition === "stale" ? 30001 : 5000;
      const reason = {
        connected: "Fresh synthetic connectivity success.",
        disconnected: "Fresh synthetic connectivity failure.",
        unknown: "Observation has no known connectivity outcome.",
        missing: "No connectivity observation; no successful default.",
        stale: "Last connected observation is 30001 ms old; the limit is 30000 ms."
      }[condition];
      return { mode: "synthetic", id, label: LABELS[id], required, condition, outcome, ageMs, reason };
    });
    const required = checks.filter((entry) => entry.required);
    const readiness = required.some((entry) => entry.outcome === "failure") ? "FAILURE"
      : required.some((entry) => entry.outcome === "unknown") ? "UNKNOWN" : "SUCCESS";
    const permittedDecision = readiness === "SUCCESS" ? "ADMIT" : "HOLD";
    const verifier = prediction === permittedDecision ? "PASS" : "FAIL";
    const counts = { success: 0, failure: 0, unknown: 0 };
    for (const entry of checks) counts[entry.outcome]++;
    const trace = [
      { code: "policy", detail: config.policy === "cache-optional"
        ? "Cache is optional ONLY under the declared database fallback; database, messaging and service remain required."
        : "Cache is required by this workload; database, messaging and service also remain required." },
      ...checks.map((entry) => ({ code: `dependency.${entry.outcome}`,
        detail: `${entry.id}: ${entry.required ? "required" : "optional"}; ${entry.condition}; ${entry.reason}` })),
      { code: "admission", detail: `${permittedDecision}: ${readiness}. This is permission in a model, not an executed handoff.` },
      { code: "verification", detail: `${verifier}: predicted ${prediction}; permitted ${permittedDecision}.` },
      { code: "user-impact", detail: "UNMEASURED: zero user journeys attempted; no transition or live availability proof." },
      { code: "cleanup", detail: "Local calculation only. Protected existing synthetic capacity remains 4/4; no traffic moved." }
    ].map((entry) => ({ mode: "synthetic", ...entry }));
    return {
      mode: "synthetic",
      readiness, permittedDecision, verifier, counts,
      requiredPassed: required.filter((entry) => entry.outcome === "success").length,
      requiredTotal: required.length,
      optionalDegraded: checks.some((entry) => !entry.required && entry.outcome !== "success"),
      checks, trace,
      protectedCapacity: 4,
      userImpact: "UNMEASURED"
    };
  }

  function evaluate(config, prediction) {
    validateConfig(config);
    validatePrediction(prediction);
    return derive(config, prediction);
  }

  function validateSession(state) {
    try {
      if (!hasShape(state, ["schemaVersion", "revision", "config", "history"])
          || state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision)
          || state.revision < 0 || state.revision > MAX_EDITS
          || !Array.isArray(state.history) || state.history.length > MAX_RUNS
          || !denseArray(state.history)) throw new Error("Malformed or out-of-bounds state.");
      validateConfig(state.config);
      let previous;
      state.history.forEach((record, index) => {
        if (!hasShape(record, ["runId", "revision", "config", "prediction", "result"])
            || record.runId !== index + 1 || !Number.isSafeInteger(record.revision)
            || record.revision < 0 || record.revision > state.revision
            || (previous && record.revision < previous.revision)) {
          throw new Error("Invalid retained run identity or revision.");
        }
        validateConfig(record.config);
        validatePrediction(record.prediction);
        if (!sameData(derive(record.config, record.prediction), record.result)
            || (previous && record.revision === previous.revision
              && !sameData(previous.config, record.config))) {
          throw new Error("Retained result does not match its immutable configuration.");
        }
        previous = record;
      });
      if (previous && previous.revision === state.revision && !sameData(previous.config, state.config)) {
        throw new Error("Current revision does not match its recorded configuration.");
      }
    } catch (error) {
      throw new Error(`Invalid session: ${error.message}`);
    }
  }

  function createSession() {
    return { schemaVersion: 1, revision: 0, config: copy(DEFAULT_CONFIG), history: [] };
  }

  function configure(state, config) {
    validateSession(state);
    validateConfig(config);
    if (sameData(state.config, config)) return copy(state);
    if (state.revision === MAX_EDITS) throw new Error("Edit limit reached (64). Reset the exercise to continue.");
    return { ...copy(state), revision: state.revision + 1, config: copy(config) };
  }

  function check(state, prediction) {
    validateSession(state);
    validatePrediction(prediction);
    if (state.history.length === MAX_RUNS) {
      throw new Error("History limit reached (8). No run was removed. Reset the exercise to continue.");
    }
    const next = copy(state);
    next.history.push({
      runId: state.history.length + 1, revision: state.revision, config: copy(state.config),
      prediction, result: derive(state.config, prediction)
    });
    return next;
  }

  const api = Object.freeze({
    DEFAULT_CONFIG, IDS, CONDITIONS, POLICIES, MAX_RUNS, MAX_EDITS,
    evaluate, createSession, configure, check
  });
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.defineProperty(root, "S022Readiness", { value: api });
}(typeof globalThis === "object" ? globalThis : this));
