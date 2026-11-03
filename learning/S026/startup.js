(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.S026 = api;
})(globalThis, function () {
  "use strict";
  const IMAGE = `candidate-v2@sha256:${"b".repeat(64)}`;
  const FIELDS = ["pullTicks", "startupTicks", "fault", "observeTick", "prediction"];
  const FAULTS = ["none", "pull-failure", "startup-failure", "unobserved"];
  const LIMIT = 8;

  function invalid(label, detail) {
    throw new RangeError(`Invalid ${label}: ${detail}`);
  }
  function record(value, fields, label) {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
      invalid(label, "expected a plain record");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
      invalid(label, "unexpected or missing fields");
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        invalid(label, "accessors and hidden fields are unsupported");
      }
    }
  }
  function denseArray(value, maximum, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) {
      invalid(label, "expected a bounded dense array");
    }
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        invalid(label, "sparse arrays and accessors are unsupported");
      }
    }
  }
  function validateConfiguration(value) {
    record(value, FIELDS, "configuration");
    for (const [key, minimum, maximum] of [
      ["pullTicks", 1, 3], ["startupTicks", 1, 3], ["observeTick", 0, 6]
    ]) {
      if (!Number.isInteger(value[key]) || value[key] < minimum || value[key] > maximum) {
        invalid("configuration", `${key} must be an integer from ${minimum} through ${maximum}`);
      }
    }
    if (!FAULTS.includes(value.fault) || !["HOLD", "ALLOW"].includes(value.prediction)) {
      invalid("configuration", "unknown fault or prediction");
    }
    return {
      pullTicks: value.pullTicks, startupTicks: value.startupTicks, fault: value.fault,
      observeTick: value.observeTick, prediction: value.prediction
    };
  }

  function createState() {
    return { version: 1, runs: [] };
  }
  function evaluate(configuration) {
    const input = validateConfiguration(configuration);
    const trace = [];
    for (let tick = 0; tick <= input.observeTick; tick++) {
      let phase;
      let pull = "unknown";
      let initialization = "unknown";
      if (input.fault === "unobserved") {
        phase = "OBSERVATION MISSING";
      } else if (tick < input.pullTicks) {
        phase = "PULLING";
      } else if (input.fault === "pull-failure") {
        phase = "PULL FAILED";
        pull = "failure";
      } else {
        pull = "success";
        if (tick < input.pullTicks + input.startupTicks) {
          phase = "INITIALIZING";
        } else if (input.fault === "startup-failure") {
          phase = "STARTUP FAILED";
          initialization = "failure";
        } else {
          phase = "READY";
          initialization = "success";
        }
      }
      const ready = pull === "success" && initialization === "success";
      const handoff = ready && tick === input.observeTick;
      trace.push({
        tick, phase, pull, initialization, ready,
        serving: handoff ? "candidate-v2" : "ga-v1",
        oldSuccess: handoff ? 0 : 3, candidateSuccess: handoff ? 3 : 0
      });
    }
    const final = trace.at(-1);
    const checks = { success: 0, failure: 0, unknown: 0 };
    for (const observation of [final.pull, final.initialization]) checks[observation]++;
    const permission = final.ready ? "ALLOW" : "HOLD";
    const total = 3 * trace.length;
    const candidate = final.ready ? 3 : 0;
    return {
      image: IMAGE,
      observedTick: input.observeTick,
      candidateOutcome: final.ready ? "SUCCESS" : checks.failure ? "FAILURE" : "UNKNOWN",
      permission,
      verifier: input.prediction === permission ? "PASS" : "FAIL",
      checks,
      traffic: { old: total - candidate, candidate, success: total, failure: 0, unknown: 0 },
      trace
    };
  }

  function sameData(actual, expected) {
    if (Array.isArray(expected)) {
      denseArray(actual, expected.length, "state");
      if (actual.length !== expected.length) invalid("state", "changed historical array");
      for (let index = 0; index < expected.length; index++) sameData(actual[index], expected[index]);
    } else if (expected && typeof expected === "object") {
      record(actual, Object.keys(expected), "state");
      for (const key of Object.keys(expected)) sameData(actual[key], expected[key]);
    } else if (!Object.is(actual, expected)) {
      invalid("state", "historical result does not match its configuration");
    }
  }
  function validateState(state) {
    record(state, ["version", "runs"], "state");
    if (state.version !== 1) invalid("state", "unsupported version");
    denseArray(state.runs, LIMIT, "state");
    for (let index = 0; index < state.runs.length; index++) {
      const run = state.runs[index];
      record(run, ["id", "configuration", "result"], "state");
      if (run.id !== index + 1) invalid("state", "invalid run identity");
      let configuration;
      try {
        configuration = validateConfiguration(run.configuration);
      } catch {
        invalid("state", "invalid historical configuration");
      }
      sameData(run.result, evaluate(configuration));
    }
  }
  function recordRun(state, configuration) {
    validateState(state);
    const input = validateConfiguration(configuration);
    if (state.runs.length === LIMIT) throw new RangeError("History limit: 8 checked runs; reset explicitly to start again.");
    return {
      version: 1,
      runs: [...JSON.parse(JSON.stringify(state.runs)), {
        id: state.runs.length + 1, configuration: input, result: evaluate(input)
      }]
    };
  }
  return { createState, evaluate, recordRun };
});
