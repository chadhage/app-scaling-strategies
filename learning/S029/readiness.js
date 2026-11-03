(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.S029Readiness = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const DEFAULTS = Object.freeze({
    fixture: "flapping", windowSize: 3, freshnessTicks: 2, observationTick: 6, prediction: "HOLD"
  });
  const MAX_HISTORY = 8;
  const fixtures = {
    flapping: ["success", "failure", "success", "failure", "success", "success"],
    steady: ["success", "success", "success", "success", "success", "success"],
    recovered: ["failure", "success", "failure", "success", "success", "success"],
    missing: ["success", "success", "success", "success", "unknown", "success"]
  };
  function freeze(value) {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  freeze(fixtures);
  function record(value, keys, label) {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`Invalid ${label}: expected a plain record.`);
    }
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
      throw new Error(`Invalid ${label}: exact fields required.`);
    }
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !Object.hasOwn(property, "value") || !property.enumerable) {
        throw new Error(`Invalid ${label}: data fields only.`);
      }
    }
  }
  function validateConfiguration(value) {
    record(value, ["fixture", "windowSize", "freshnessTicks", "observationTick", "prediction"], "configuration");
    if (typeof value.fixture !== "string" || !Object.hasOwn(fixtures, value.fixture)
      || !["HOLD", "ALLOW"].includes(value.prediction)) {
      throw new Error("Invalid configuration: choose a listed probe fixture and prediction.");
    }
    for (const [key, minimum, maximum] of [
      ["windowSize", 2, 4], ["freshnessTicks", 2, 4], ["observationTick", 1, 9]
    ]) {
      if (!Number.isInteger(value[key]) || value[key] < minimum || value[key] > maximum) {
        throw new Error(`Invalid configuration: ${key} must be an integer ${minimum}–${maximum}.`);
      }
    }
  }
  function copyConfiguration(value) {
    return {
      fixture: value.fixture, windowSize: value.windowSize, freshnessTicks: value.freshnessTicks,
      observationTick: value.observationTick, prediction: value.prediction
    };
  }
  function validateState(value) {
    record(value, ["version", "history"], "state");
    if (value.version !== 1) throw new Error("Invalid state version.");
    const history = value.history;
    if (!Array.isArray(history) || Object.getPrototypeOf(history) !== Array.prototype
      || history.length > MAX_HISTORY || Reflect.ownKeys(history).length !== history.length + 1) {
      throw new Error("Invalid history: bounded dense array required.");
    }
    for (let index = 0; index < history.length; index++) {
      const property = Object.getOwnPropertyDescriptor(history, String(index));
      if (!property || !Object.hasOwn(property, "value") || !property.enumerable) {
        throw new Error("Invalid history: data entries only; no gaps or accessors.");
      }
      const run = property.value;
      record(run, ["id", "configuration"], "history run");
      if (run.id !== index + 1) throw new Error("Invalid history run identity.");
      validateConfiguration(run.configuration);
    }
  }
  function atTick(configuration, tick) {
    const probes = fixtures[configuration.fixture];
    const latestTick = Math.min(tick, probes.length);
    const checks = { success: 0, failure: 0, unknown: 0 };
    for (let offset = 0; offset < configuration.windowSize; offset++) {
      const observedTick = latestTick - offset;
      const status = observedTick < 1 || tick - observedTick > configuration.freshnessTicks
        ? "unknown" : probes[observedTick - 1];
      checks[status]++;
    }
    let streak = 0;
    for (let observedTick = latestTick; observedTick >= 1; observedTick--) {
      if (tick - observedTick > configuration.freshnessTicks || probes[observedTick - 1] !== "success") break;
      streak++;
    }
    const readiness = checks.failure ? "FAILURE" : checks.unknown ? "UNKNOWN" : "SUCCESS";
    return {
      tick, probe: tick <= probes.length ? probes[tick - 1] : "no-new-sample",
      latestTick, latestAge: tick - latestTick, checks, streak, readiness,
      decision: readiness === "SUCCESS" ? "ALLOW" : "HOLD",
      comparison: probes[latestTick - 1] === "success" ? "ALLOW" : "HOLD"
    };
  }
  function evaluate(configuration) {
    validateConfiguration(configuration);
    const trace = Array.from({ length: configuration.observationTick }, (_, index) => atTick(configuration, index + 1));
    const last = trace.at(-1);
    return freeze({
      readiness: last.readiness, decision: last.decision, comparison: last.comparison,
      streak: last.streak, checks: last.checks,
      candidateAdmissions: last.decision === "ALLOW" ? 1 : 0,
      route: last.decision === "ALLOW" ? "candidate-v2" : "ga-v1",
      verifier: configuration.prediction === last.decision ? "PASS" : "FAIL", trace
    });
  }
  function initialState() { return freeze({ version: 1, history: [] }); }
  function recordRun(state, configuration) {
    validateState(state);
    validateConfiguration(configuration);
    if (state.history.length === MAX_HISTORY) throw new Error("History full: eight runs retained. Reset explicitly to clear them.");
    const history = state.history.map((run) => ({ id: run.id, configuration: copyConfiguration(run.configuration) }));
    history.push({ id: history.length + 1, configuration: copyConfiguration(configuration) });
    return freeze({ version: 1, history });
  }
  return Object.freeze({ DEFAULTS, MAX_HISTORY, evaluate, initialState, recordRun });
});
