(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.S030 = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const defaults = Object.freeze({
    instances: 6, concurrency: 2, dbCapacity: 8, cacheCapacity: 6,
    initBudget: 8, observations: "complete"
  });
  const fields = Object.keys(defaults);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function record(value, keys, label) {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(`${label} must be a plain record.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length
        || keys.some((key) => !own(descriptors, key)
          || !own(descriptors[key], "value") || !descriptors[key].enumerable)) {
      throw new TypeError(`${label} requires exact data fields without extras or accessors.`);
    }
  }

  function integer(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
    }
  }

  function configuration(value, label = "configuration") {
    record(value, fields, label);
    integer(value.instances, 2, 12, `${label} instances`);
    integer(value.concurrency, 1, value.instances, `${label} concurrency`);
    integer(value.dbCapacity, 4, 24, `${label} database capacity`);
    integer(value.cacheCapacity, 4, 20, `${label} cache capacity`);
    integer(value.initBudget, 2, 24, `${label} initialization budget`);
    if (!["complete", "missing"].includes(value.observations)) {
      throw new TypeError(`${label} observations must be complete or missing.`);
    }
    return Object.fromEntries(fields.map((key) => [key, value[key]]));
  }

  function prediction(value, label = "prediction") {
    if (!["SUCCESS", "FAILURE", "UNKNOWN"].includes(value)) {
      throw new TypeError(`${label} must be SUCCESS, FAILURE or UNKNOWN.`);
    }
    return value;
  }

  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function initialState() { return freeze({ nextId: 1, runs: [] }); }

  function simulate(input, mode, concurrency) {
    const known = input.observations === "complete";
    const plannedTicks = 2 * Math.ceil(input.instances / concurrency);
    const initialization = { attempted: input.instances, success: 0, failure: 0, unknown: 0 };
    const journeys = {
      attempted: plannedTicks * 4, success: 0, failure: 0, unknown: 0,
      budgetMs: 100, maxLatencyMs: known ? 50 : null
    };
    const dependencies = {
      database: { capacity: input.dbCapacity, peakLoad: known ? 0 : null, overloadedTicks: known ? 0 : null },
      cache: { capacity: input.cacheCapacity, peakLoad: known ? 0 : null, overloadedTicks: known ? 0 : null }
    };
    const trace = [];
    for (let tick = 1; tick <= plannedTicks; tick++) {
      const active = Math.min(concurrency, input.instances - Math.floor((tick - 1) / 2) * concurrency);
      const completing = tick % 2 === 0 ? active : 0;
      const databaseLoad = known ? 4 + 2 * active : null;
      const cacheLoad = known ? 4 + active : null;
      const overloaded = known ? [] : null;
      if (known) {
        for (const [name, load] of [["database", databaseLoad], ["cache", cacheLoad]]) {
          dependencies[name].peakLoad = Math.max(dependencies[name].peakLoad, load);
          if (load > dependencies[name].capacity) {
            overloaded.push(name);
            dependencies[name].overloadedTicks++;
          }
        }
      }
      const result = known ? (overloaded.length ? "failure" : "success") : "unknown";
      const completion = { success: 0, failure: 0, unknown: 0 };
      completion[result] = completing;
      initialization[result] += completing;
      const requests = { success: 0, failure: 0, unknown: 0, latencyMs: known ? (overloaded.length ? 250 : 50) : null };
      requests[result] = 4;
      journeys[result] += 4;
      if (known) journeys.maxLatencyMs = Math.max(journeys.maxLatencyMs, requests.latencyMs);
      trace.push({
        tick, active, completing, databaseLoad, cacheLoad, overloaded,
        initialization: completion, journeys: requests
      });
    }
    const withinBudget = known ? plannedTicks <= input.initBudget : null;
    return {
      mode, concurrency, plannedTicks, durationTicks: known ? plannedTicks : null,
      budgetTicks: input.initBudget, withinBudget,
      outcome: known ? (initialization.failure || !withinBudget ? "FAILURE" : "SUCCESS") : "UNKNOWN",
      dependencies, initialization, journeys, trace
    };
  }

  function analyze(value) {
    const input = configuration(value);
    return freeze({
      simultaneous: simulate(input, "simultaneous", input.instances),
      bounded: simulate(input, "bounded", input.concurrency)
    });
  }

  function denseArray(value, label, maximum) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) {
      throw new TypeError(`${label} must be a bounded dense array without extra fields.`);
    }
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !own(descriptor, "value") || !descriptor.enumerable) {
        throw new TypeError(`${label} must not contain holes or accessors.`);
      }
    }
  }

  function sameSnapshot(value, expected, label) {
    if (expected === null || typeof expected !== "object") {
      if (!Object.is(value, expected)) throw new TypeError(`${label} is inconsistent with its configuration.`);
      return;
    }
    if (Array.isArray(expected)) {
      denseArray(value, label, expected.length);
      if (value.length !== expected.length) throw new TypeError(`${label} has an inconsistent length.`);
      expected.forEach((item, index) => sameSnapshot(value[index], item, label));
    } else {
      record(value, Object.keys(expected), label);
      for (const key of Object.keys(expected)) sameSnapshot(value[key], expected[key], label);
    }
  }

  function validateState(state) {
    record(state, ["nextId", "runs"], "state");
    denseArray(state.runs, "state history", 8);
    integer(state.nextId, 1, 9, "state next identity");
    if (state.nextId !== state.runs.length + 1) throw new TypeError("state identity does not follow retained history.");
    state.runs.forEach((run, index) => {
      record(run, ["id", "configuration", "prediction", "report", "verifier"], "state history entry");
      if (run.id !== index + 1) throw new TypeError("state history identity is inconsistent.");
      const input = configuration(run.configuration, "state history configuration");
      const answer = prediction(run.prediction, "state history prediction");
      const expected = analyze(input);
      sameSnapshot(run.report, expected, "state history report");
      if (run.verifier !== (answer === expected.bounded.outcome ? "PASS" : "FAIL")) {
        throw new TypeError("state history verifier is inconsistent.");
      }
    });
    return true;
  }

  function recordRun(state, value, answer) {
    validateState(state);
    if (state.runs.length === 8) throw new RangeError("History contains eight comparisons; reset explicitly before adding another.");
    const input = configuration(value);
    const expected = prediction(answer);
    const report = analyze(input);
    const run = {
      id: state.nextId, configuration: input, prediction: expected, report,
      verifier: expected === report.bounded.outcome ? "PASS" : "FAIL"
    };
    return freeze({
      nextId: state.nextId + 1,
      runs: [...state.runs.map((prior) => ({
        id: prior.id, configuration: configuration(prior.configuration),
        prediction: prior.prediction, report: analyze(prior.configuration), verifier: prior.verifier
      })), run]
    });
  }
  return Object.freeze({ defaults, initialState, analyze, recordRun, validateState });
}));
