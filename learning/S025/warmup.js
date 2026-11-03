"use strict";

const S025Warmup = (() => {
  const phases = [
    { key: "jvm", label: "JVM/JIT", coldMs: 320, warmMs: 20 },
    { key: "beans", label: "Application beans", coldMs: 180, warmMs: 10 },
    { key: "pool", label: "Connection pool", coldMs: 200, warmMs: 20 },
    { key: "cache", label: "Critical cache", coldMs: 300, warmMs: 10 }
  ];
  const conditions = ["skipped", "primed", "failed", "unmeasured"];
  const routes = ["measured-read", "unmeasured-export", "unsupported-stream"];
  const fields = ["jvm", "beans", "pool", "cache", "route", "budgetMs", "prediction"];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fail = (label, reason) => { throw new TypeError(`${label}: ${reason}`); };
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

  function shape(value, keys, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail(label, "expected a plain data object");
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) => !keys.includes(key))) fail(label, "unexpected or missing keys");
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(label, "accessors are not observations");
    }
  }

  function dense(array, label, limit = 8) {
    if (!Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype
      || array.length > limit || Reflect.ownKeys(array).length !== array.length + 1) fail(label, "expected bounded dense data");
    for (let index = 0; index < array.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(label, "sparse or accessor history");
    }
  }

  function sameData(actual, expected, label) {
    if (Array.isArray(expected)) {
      dense(actual, label, expected.length);
      if (actual.length !== expected.length) fail(label, "inconsistent observation length");
      expected.forEach((value, index) => sameData(actual[index], value, label));
    } else if (expected !== null && typeof expected === "object") {
      shape(actual, Object.keys(expected), label);
      for (const key of Object.keys(expected)) sameData(actual[key], expected[key], label);
    } else if (!Object.is(actual, expected)) fail(label, "inconsistent observation");
  }

  function checkedConfig(value, label = "Invalid configuration") {
    shape(value, fields, label);
    for (const phase of phases) {
      if (!conditions.includes(value[phase.key])) fail(label, `unknown ${phase.key} condition`);
    }
    if (!routes.includes(value.route)) fail(label, "unknown route");
    if (!Number.isInteger(value.budgetMs) || value.budgetMs < 50 || value.budgetMs > 2000) {
      fail(label, "budget must be an integer from 50 to 2000 ms");
    }
    if (!["EXPOSE", "HOLD"].includes(value.prediction)) fail(label, "unknown prediction");
    return Object.fromEntries(fields.map((key) => [key, value[key]]));
  }

  const defaults = () => ({
    jvm: "skipped", beans: "skipped", pool: "skipped", cache: "skipped",
    route: "measured-read", budgetMs: 200, prediction: "HOLD"
  });
  const initialState = () => ({
    revision: 0, nextRunId: 1, config: defaults(), current: null, history: []
  });

  function assess(input) {
    const config = checkedConfig(input);
    const rows = phases.map((phase) => {
      const condition = config[phase.key];
      return {
        key: phase.key, label: phase.label, condition,
        initialization: condition === "primed" ? "SUCCESS" : condition === "unmeasured" ? "UNKNOWN" : "FAILURE",
        coldMs: phase.coldMs,
        warmMs: condition === "primed" ? phase.warmMs : condition === "skipped" ? phase.coldMs : null
      };
    });
    const initializedCount = rows.filter((row) => row.initialization === "SUCCESS").length;
    const failures = rows.filter((row) => row.initialization === "FAILURE").length;
    const unknowns = rows.filter((row) => row.initialization === "UNKNOWN").length;
    const initialization = failures ? "FAILURE" : unknowns ? "UNKNOWN" : "SUCCESS";
    const measuredRoute = config.route === "measured-read";
    const coldMs = measuredRoute ? 1040 : null;
    const warmMs = measuredRoute && rows.every((row) => row.warmMs !== null)
      ? 40 + rows.reduce((sum, row) => sum + row.warmMs, 0) : null;
    const savedMs = warmMs === null ? null : coldMs - warmMs;
    const latency = warmMs === null ? "UNKNOWN" : warmMs <= config.budgetMs ? "SUCCESS" : "FAILURE";
    const outcome = initialization === "FAILURE" || latency === "FAILURE" ? "FAILURE"
      : initialization === "UNKNOWN" || latency === "UNKNOWN" ? "UNKNOWN" : "SUCCESS";
    const decision = outcome === "SUCCESS" ? "EXPOSE" : "HOLD";
    const verifier = config.prediction === decision ? "PASS" : "FAIL";
    const trace = [
      `Synthetic route: ${config.route}. Cold reference = 40 + 320 + 180 + 200 + 300 = 1040 ms only for measured-read.`,
      ...rows.map((row) => `Synthetic ${row.label}: ${row.condition}; initialization ${row.initialization}; cold ${row.coldMs} ms; candidate ${row.warmMs === null ? "UNMEASURED" : `${row.warmMs} ms`}.`),
      `Synthetic initialization ${initialization}: ${initializedCount}/4 primed, ${failures} failure, ${unknowns} unknown.`,
      measuredRoute
        ? `Synthetic client sample: cold ${coldMs} ms; candidate ${warmMs === null ? "UNMEASURED" : `${warmMs} ms`}; budget ${config.budgetMs} ms; latency ${latency}.`
        : `${config.route}: ${config.route === "unsupported-stream" ? "UNSUPPORTED by this fixture" : "UNMEASURED route"}; no cold or candidate client sample; latency UNKNOWN.`,
      `Synthetic outcome ${outcome}; permission ${decision}; prediction ${config.prediction}; learning verifier ${verifier}.`,
      "User impact UNMEASURED; zero traffic moved; no Java runtime or live Azure experiment executed."
    ];
    return {
      initialization, initializedCount, failures, unknowns, latency, outcome, decision,
      verifier, coldMs, warmMs, savedMs, route: config.route, budgetMs: config.budgetMs, rows, trace
    };
  }

  function checkedState(value) {
    const label = "Invalid state";
    shape(value, ["revision", "nextRunId", "config", "current", "history"], label);
    if (!Number.isInteger(value.revision) || value.revision < 0 || value.revision > 64) fail(label, "invalid revision");
    const config = checkedConfig(value.config, label);
    if (value.revision === 0 && !equal(config, defaults())) fail(label, "revision zero must use defaults");
    dense(value.history, label);
    let priorRevision = -1;
    let priorConfig;
    const history = value.history.map((entry, index) => {
      shape(entry, ["id", "revision", "config", "result"], label);
      if (entry.id !== index + 1 || !Number.isInteger(entry.revision)
        || entry.revision < 0 || entry.revision < priorRevision || entry.revision > value.revision) {
        fail(label, "invalid run identity or revision");
      }
      const entryConfig = checkedConfig(entry.config, label);
      if ((entry.revision === 0 && !equal(entryConfig, defaults()))
        || (entry.revision === priorRevision && !equal(entryConfig, priorConfig))) {
        fail(label, "configuration disagrees with revision");
      }
      priorRevision = entry.revision;
      priorConfig = entryConfig;
      const result = assess(entryConfig);
      sameData(entry.result, result, label);
      return { id: entry.id, revision: entry.revision, config: entryConfig, result };
    });
    if (value.nextRunId !== history.length + 1) fail(label, "invalid next run identity");
    const last = history.at(-1);
    let current = null;
    if (value.current !== null) {
      if (!last || last.revision !== value.revision || !equal(last.config, config)) fail(label, "stale current result");
      sameData(value.current, last, label);
      current = clone(last);
    } else if (last && last.revision === value.revision) fail(label, "missing current result");
    return { revision: value.revision, nextRunId: value.nextRunId, config, current, history };
  }

  function configure(input, nextConfig) {
    const state = checkedState(input);
    const config = checkedConfig(nextConfig);
    if (equal(config, state.config)) return state;
    if (state.revision === 64) throw new RangeError("Configuration change limit (64) reached. Reset lesson to continue.");
    return { ...state, revision: state.revision + 1, config, current: null };
  }

  function compare(input) {
    const state = checkedState(input);
    if (state.history.length === 8) throw new RangeError("History is full (8 runs). Reset lesson to clear it explicitly.");
    const entry = {
      id: state.nextRunId, revision: state.revision,
      config: clone(state.config), result: assess(state.config)
    };
    return { ...state, nextRunId: state.nextRunId + 1, current: clone(entry), history: [...state.history, entry] };
  }

  return Object.freeze({ defaults, initialState, assess, configure, compare });
})();

if (typeof module !== "undefined" && module.exports) module.exports = S025Warmup;
else globalThis.S025Warmup = S025Warmup;
