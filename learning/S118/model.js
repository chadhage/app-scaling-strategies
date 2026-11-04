(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FailoverLesson = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const BANNER = "Training rehearsal - synthetic data - not a live Azure result";
  const MAX_RUNS = 4;
  const MAX_HISTORY = MAX_RUNS * 5;

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function copy(value) { return structuredClone(value); }

  const mutation = freeze({
    dataKind: "fixed-fictional-teaching-data",
    origin: "origin-A",
    operationId: "fictional-operation-118",
    operationKey: "fictional-key-118",
    identity: "fictional-person-7",
    session: "fictional-session-4",
    requiredState: "fictional-cart-v3",
    effectCount: 1,
    acknowledgement: "lost",
    failure: "origin-A-unavailable-after-write",
    observedAtMs: 0,
  });
  const alternate = freeze({
    dataKind: "fixed-fictional-teaching-data",
    desiredOrigin: "origin-B",
    observedOrigin: "origin-B",
    identity: mutation.identity,
    session: mutation.session,
    requiredState: mutation.requiredState,
    failure: "none",
    observedAtMs: 1200,
  });
  const retried = freeze({
    dataKind: "fixed-fictional-teaching-data",
    origin: "origin-B",
    operationId: mutation.operationId,
    operationKey: mutation.operationKey,
    identity: mutation.identity,
    session: mutation.session,
    requiredState: mutation.requiredState,
    effectCount: 1,
    acknowledgement: "received",
    failure: "none",
    recoveryMs: 3000,
  });

  const fixtures = freeze({
    preserved: {
      label: "Preserved continuity after a lost acknowledgement",
      mutation, failover: alternate, retry: retried,
    },
    duplicate: {
      label: "Duplicate effect despite retrying the same operation",
      mutation, failover: alternate, retry: { ...retried, effectCount: 2 },
    },
    "identity-lost": {
      label: "Lost identity at the alternate origin",
      mutation,
      failover: { ...alternate, identity: "fictional-other-person" },
      retry: { ...retried, identity: "fictional-other-person" },
    },
    "session-lost": {
      label: "Lost session and required cart state",
      mutation,
      failover: { ...alternate, session: "fictional-empty-session", requiredState: "fictional-empty-cart" },
      retry: { ...retried, session: "fictional-empty-session", requiredState: "fictional-empty-cart" },
    },
    "route-pending": {
      label: "Desired alternate route is not the observed destination",
      mutation,
      failover: { ...alternate, observedOrigin: "origin-A" },
      retry: { ...retried, origin: "origin-A" },
    },
    late: {
      label: "Continuity recovered outside a five-second budget",
      mutation, failover: alternate, retry: { ...retried, recoveryMs: 8000 },
    },
    unconfirmed: {
      label: "Missing effects, acknowledgement and recovery observations",
      mutation, failover: alternate,
      retry: { ...retried, effectCount: null, acknowledgement: "unknown", failure: "unknown", recoveryMs: null },
    },
    unavailable: {
      label: "Alternate-origin observation failed",
      mutation,
      failover: {
        ...alternate, observedOrigin: null, identity: null, session: null,
        requiredState: null, failure: "alternate-origin-unavailable",
      },
      retry: {
        ...retried, origin: null, identity: null, session: null, requiredState: null,
        acknowledgement: "not-received", failure: "alternate-origin-unavailable", recoveryMs: null,
      },
    },
  });
  const choices = freeze(Object.entries(fixtures).map(([id, fixture]) => ({ id, label: fixture.label })));

  function parseBudget(value) {
    if (typeof value !== "string" || !/^(?:[1-9]|10)$/.test(value) || value !== String(Number(value))) {
      throw new TypeError("Use a canonical whole number from 1 to 10 seconds (for example, 5).");
    }
    return Number(value);
  }

  function validateInput(input) {
    if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype) {
      throw new TypeError("Choose a fictional observation set and an integer recovery budget.");
    }
    const keys = Reflect.ownKeys(input);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (keys.length !== 2 || !keys.includes("fixture") || !keys.includes("budgetSeconds")
      || keys.some((key) => !Object.hasOwn(descriptors[key], "value"))) {
      throw new TypeError("Only fixture and budgetSeconds data fields are accepted.");
    }
    if (typeof input.fixture !== "string" || !Object.hasOwn(fixtures, input.fixture)) {
      throw new TypeError("Choose one of the eight fixed fictional observation sets.");
    }
    if (typeof input.budgetSeconds !== "number" || !Number.isInteger(input.budgetSeconds)
      || input.budgetSeconds < 1 || input.budgetSeconds > 10) {
      throw new TypeError("Recovery budget must be a typed integer from 1 to 10 seconds.");
    }
  }

  function compare(observed, expected) {
    return observed === null ? null : observed === expected;
  }

  function continuity(first, second, expected) {
    const observations = [compare(first, expected), compare(second, expected)];
    return observations.includes(false) ? false : observations.includes(null) ? null : true;
  }

  function check(name, value, observed, expected) {
    return { name, outcome: value === null ? "unknown" : value ? "positive" : "negative", observed, expected };
  }

  function assess(active) {
    const original = active.mutation;
    const route = active.failover;
    const retry = active.retry;
    const identityPreserved = continuity(route.identity, retry.identity, original.identity);
    const sessionPreserved = continuity(route.session, retry.session, original.session);
    const statePreserved = continuity(route.requiredState, retry.requiredState, original.requiredState);
    const operationPreserved = retry.operationId === original.operationId
      && retry.operationKey === original.operationKey;
    const routePreserved = continuity(route.observedOrigin, retry.origin, "origin-B");
    const checks = [
      check("Observed alternate origin", routePreserved,
        { failover: route.observedOrigin, retry: retry.origin }, "origin-B at both observations"),
      check("Same operation and retry key", operationPreserved,
        { operationId: retry.operationId, operationKey: retry.operationKey }, "match the original"),
      check("Identity continuity", identityPreserved,
        { failover: route.identity, retry: retry.identity }, original.identity),
      check("Session continuity", sessionPreserved,
        { failover: route.session, retry: retry.session }, original.session),
      check("Required state continuity", statePreserved,
        { failover: route.requiredState, retry: retry.requiredState }, original.requiredState),
      check("Exactly one committed effect", retry.effectCount === null ? null : retry.effectCount === 1,
        retry.effectCount, 1),
      check("Retry acknowledgement", retry.acknowledgement === "unknown" || retry.acknowledgement === "lost"
        ? null : retry.acknowledgement === "received", retry.acknowledgement, "received"),
      check("Alternate journey failure", retry.failure === "unknown" ? null : retry.failure === "none",
        retry.failure, "none"),
      check("Supported fictional recovery budget", retry.recoveryMs === null
        ? null : retry.recoveryMs <= active.budgetMs, retry.recoveryMs, `<= ${active.budgetMs} ms`),
    ];
    const outcome = checks.some((item) => item.outcome === "negative") ? "negative"
      : checks.some((item) => item.outcome === "unknown") ? "unknown" : "positive";
    const summary = outcome === "positive"
      ? "Positive - fictional alternate-origin continuity, one effect and preserved identity/session/state."
      : outcome === "negative"
        ? `Negative - ${checks.filter((item) => item.outcome === "negative").map((item) => item.name).join("; ")}.`
        : "Unknown - missing fictional observations; this is not a successful failover claim.";
    return freeze({
      dataKind: "fixed-fictional-teaching-data",
      nativeSourceAcceptance: "unverified",
      outcome, summary, desiredOrigin: route.desiredOrigin, observedOrigin: retry.origin,
      operationPreserved, identityPreserved, sessionPreserved, statePreserved,
      effectCount: retry.effectCount, acknowledgement: retry.acknowledgement,
      failure: retry.failure, recoveryMs: retry.recoveryMs, budgetMs: active.budgetMs, checks,
    });
  }

  class Rehearsal {
    #phase = "idle";
    #runCount = 0;
    #history = [];
    #active = null;
    #result = null;

    #guard(phase, action, args = []) {
      if (args.length) throw new TypeError(`${action} accepts no arguments.`);
      if (this.#phase !== phase) {
        throw new Error(`${action} requires phase ${phase}; current phase is ${this.#phase}. Follow actions 1 to 4, or reset.`);
      }
      if (this.#history.length >= MAX_HISTORY) {
        throw new RangeError("History is full. Reload for a new rehearsal; existing history is retained.");
      }
    }

    #record(action, observation) {
      this.#history.push(freeze({
        sequence: this.#history.length + 1,
        run: this.#runCount,
        action, phase: this.#phase, observation: copy(observation),
      }));
    }

    recordMutation(input) {
      this.#guard("idle", "Record mutation");
      validateInput(input);
      if (arguments.length !== 1) throw new TypeError("Record mutation accepts exactly one configuration.");
      if (this.#runCount >= MAX_RUNS) {
        throw new RangeError("Four fictional journeys exhausted. Reload for a new rehearsal; existing history is retained.");
      }
      this.#active = {
        fixture: input.fixture, budgetMs: input.budgetSeconds * 1000,
        mutation: copy(fixtures[input.fixture].mutation), failover: null, retry: null,
      };
      this.#runCount++;
      this.#phase = "mutated";
      this.#record("record mutation", this.#active.mutation);
      return this.snapshot();
    }

    failover(...args) {
      this.#guard("mutated", "Observe failover", args);
      this.#active.failover = copy(fixtures[this.#active.fixture].failover);
      this.#phase = "rerouted";
      this.#record("observe failover", this.#active.failover);
      return this.snapshot();
    }

    retry(...args) {
      this.#guard("rerouted", "Retry same operation", args);
      this.#active.retry = copy(fixtures[this.#active.fixture].retry);
      this.#phase = "retried";
      this.#record("retry same operation", this.#active.retry);
      return this.snapshot();
    }

    measure(...args) {
      this.#guard("retried", "Measure continuity", args);
      this.#result = assess(this.#active);
      this.#phase = "measured";
      this.#record("measure continuity", this.#result);
      return this.#result;
    }

    reset(...args) {
      if (this.#phase === "idle") throw new Error("No active journey to reset. Record a mutation first.");
      this.#guard(this.#phase, "Reset journey", args);
      const previousPhase = this.#phase;
      this.#phase = "idle";
      this.#record("reset journey", { previousPhase, historyRetained: true });
      this.#active = null;
      this.#result = null;
      return this.snapshot();
    }

    snapshot() {
      return freeze(copy({
        dataKind: "fixed-fictional-teaching-data",
        phase: this.#phase, runCount: this.#runCount, maxRuns: MAX_RUNS, maxHistory: MAX_HISTORY,
        active: this.#active, result: this.#result, history: this.#history,
      }));
    }
  }

  return Object.freeze({ Rehearsal, parseBudget, listFixtures: () => choices, BANNER });
});
