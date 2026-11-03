(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TenantContinuity = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const BANNER = "Training rehearsal - synthetic data - not a live Azure result";
  const MAX_RUNS = 6;
  const TENANTS = ["alba", "birch"];
  const VERSIONS = ["v1", "v2"];
  const POLICIES = ["isolated", "allow-foreign", "wrong-data", "deny-own", "unobserved"];
  const ASSERTIONS = ["ownRead", "rejectForeign", "dataTenant"];

  function fail(message) { throw new TypeError(message); }
  function record(value, keys, label) {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
      fail(`${label} must be a plain record.`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) => !keys.includes(key))) {
      fail(`${label} has missing or unexpected fields.`);
    }
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !property.enumerable || !Object.hasOwn(property, "value")) {
        fail(`${label}.${key} must be an enumerable data field.`);
      }
    }
  }
  function denseArray(value, length, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== length) {
      fail(`${label} must be a dense array of length ${length}.`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys.some((key) => key !== "length" && !/^(0|[1-9]\d*)$/.test(String(key)))) {
      fail(`${label} has unexpected array fields.`);
    }
    for (let index = 0; index < length; index++) {
      const property = Object.getOwnPropertyDescriptor(value, String(index));
      if (!property || !property.enumerable || !Object.hasOwn(property, "value")) fail(`${label} is sparse or contains an accessor.`);
    }
  }
  function equivalent(actual, expected, label) {
    if (Array.isArray(expected)) {
      denseArray(actual, expected.length, label);
      expected.forEach((value, index) => equivalent(actual[index], value, `${label}[${index}]`));
    } else if (expected !== null && typeof expected === "object") {
      record(actual, Object.keys(expected), label);
      Object.keys(expected).forEach((key) => equivalent(actual[key], expected[key], `${label}.${key}`));
    } else if (actual !== expected) fail(`${label} does not match the deterministic record.`);
  }
  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function configRecord(value) {
    record(value, ["routes", "policy", "assertions"], "Configuration");
    record(value.routes, TENANTS, "Routes");
    record(value.assertions, ASSERTIONS, "Assertions");
    for (const tenant of TENANTS) {
      if (!VERSIONS.includes(value.routes[tenant])) fail(`Route for ${tenant} must be v1 or v2.`);
    }
    if (!POLICIES.includes(value.policy)) fail("Select a known v2 after-change policy.");
    if (ASSERTIONS.some((key) => typeof value.assertions[key] !== "boolean")) fail("Assertion selections must be booleans.");
    if (!ASSERTIONS.some((key) => value.assertions[key])) fail("Select at least one assertion.");
    return {
      routes: { alba: value.routes.alba, birch: value.routes.birch },
      policy: value.policy,
      assertions: Object.fromEntries(ASSERTIONS.map((key) => [key, value.assertions[key]]))
    };
  }
  function response(policy, memberTenant, resourceTenant) {
    if (policy === "unobserved") return { observed: false, status: null, dataTenant: null, record: null };
    const own = memberTenant === resourceTenant;
    const allowed = own ? policy !== "deny-own" : policy === "allow-foreign";
    const dataTenant = allowed
      ? (own && policy === "wrong-data" ? TENANTS.find((tenant) => tenant !== memberTenant) : resourceTenant)
      : null;
    return {
      observed: true, status: allowed ? 200 : 403, dataTenant,
      record: dataTenant === null ? null : `synthetic-record-${dataTenant}`
    };
  }
  function simulate(id, input) {
    const config = configRecord(input);
    const trace = [];
    for (const phase of ["before", "after"]) {
      for (const version of VERSIONS) {
        for (const memberTenant of TENANTS) {
          for (const intent of ["own", "foreign"]) {
            const resourceTenant = intent === "own" ? memberTenant : TENANTS.find((tenant) => tenant !== memberTenant);
            const policy = phase === "after" && version === "v2" ? config.policy : "isolated";
            const observation = response(policy, memberTenant, resourceTenant);
            const applicable = intent === "own" ? ["ownRead", "dataTenant"] : ["rejectForeign"];
            const checks = applicable.map((assertion) => {
              const valid = assertion === "ownRead" ? observation.status === 200
                : assertion === "dataTenant" ? observation.status === 200 && observation.dataTenant === resourceTenant
                  : observation.status === 403 && observation.dataTenant === null && observation.record === null;
              return {
                assertion,
                result: !config.assertions[assertion] ? "unselected"
                  : !observation.observed ? "unknown" : valid ? "pass" : "fail"
              };
            });
            const outcome = checks.some((check) => check.result === "fail") ? "failure"
              : checks.some((check) => check.result !== "pass") ? "unknown" : "success";
            trace.push({
              probeId: trace.length + 1, phase, version,
              path: version === (phase === "before" ? "v1" : config.routes[memberTenant]) ? "routed" : "direct",
              memberTenant, principal: `synthetic-${memberTenant}-member`, resourceTenant, intent,
              expectedStatus: intent === "own" ? 200 : 403,
              ...observation, checks, outcome
            });
          }
        }
      }
    }
    const counts = { attempted: trace.length, success: 0, failure: 0, unknown: 0 };
    trace.forEach((probe) => counts[probe.outcome]++);
    const outcome = counts.failure ? "FAILURE" : counts.unknown ? "UNKNOWN" : "SUCCESS";
    return {
      id, config, outcome, verifier: outcome === "FAILURE" ? "FAIL" : outcome === "UNKNOWN" ? "UNVERIFIED" : "PASS",
      counts,
      migratedTenants: TENANTS.filter((tenant) => trace.some((probe) => probe.phase === "after"
        && probe.path === "routed" && probe.version === "v2" && probe.memberTenant === tenant
        && probe.intent === "own" && probe.outcome === "success")),
      trace
    };
  }
  function validatedHistory(state) {
    record(state, ["schemaVersion", "history"], "State");
    if (state.schemaVersion !== 1) fail("Unsupported state schema.");
    if (!Array.isArray(state.history) || state.history.length > MAX_RUNS) fail("History exceeds the 6-run bound.");
    denseArray(state.history, state.history.length, "History");
    return state.history.map((run, index) => {
      record(run, ["id", "config", "outcome", "verifier", "counts", "migratedTenants", "trace"], "Retained run");
      const expected = simulate(index + 1, run.config);
      equivalent(run, expected, `History[${index}]`);
      return expected;
    });
  }
  function createState() { return freeze({ schemaVersion: 1, history: [] }); }
  function conduct(state, input) {
    const history = validatedHistory(state);
    if (history.length >= MAX_RUNS) fail("History is full (6 runs). Reset explicitly before another run.");
    history.push(simulate(history.length + 1, input));
    return freeze({ schemaVersion: 1, history });
  }
  function reset(state) {
    validatedHistory(state);
    return createState();
  }
  return freeze({ BANNER, MAX_RUNS, TENANTS, VERSIONS, POLICIES, createState, conduct, reset });
}));
