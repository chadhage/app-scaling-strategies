"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.S031Session = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  const ROUTES = Object.freeze([
    Object.freeze({ key: "v1/blue-a", version: "v1", instance: "blue-a" }),
    Object.freeze({ key: "v1/blue-b", version: "v1", instance: "blue-b" }),
    Object.freeze({ key: "v2/green-a", version: "v2", instance: "green-a" }),
    Object.freeze({ key: "v2/green-b", version: "v2", instance: "green-b" })
  ]);
  const CLIENTS = [
    {
      id: "client-amber",
      origin: "v1/blue-a",
      expectedProfile: {
        schema: 1, profileId: "profile-amber", displayName: "Synthetic Amber",
        theme: "contrast", cart: ["amber-token"], draft: "Keep amber note", revision: 7
      }
    },
    {
      id: "client-cobalt",
      origin: "v1/blue-b",
      expectedProfile: {
        schema: 1, profileId: "profile-cobalt", displayName: "Synthetic Cobalt",
        theme: "night", cart: ["cobalt-token"], draft: "Keep cobalt note", revision: 11
      }
    }
  ];
  const PROFILE_FIELDS = Object.keys(CLIENTS[0].expectedProfile);
  const REPLY_KINDS = Object.freeze(["stored", "empty", "reset", "stale", "unknown"]);

  function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function copy(value) {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  }

  function same(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
  }

  function reject(code, message) {
    return { ok: false, error: { code, message } };
  }

  function validState(state) {
    return record(state) && state.kind === "S031-session-v1" &&
      ["local", "shared"].includes(state.mode) &&
      Array.isArray(state.clients) && state.clients.length === CLIENTS.length &&
      CLIENTS.every((fixture, index) => {
        const client = state.clients[index];
        return record(client) && client.id === fixture.id &&
          same(client.expectedProfile, fixture.expectedProfile);
      }) &&
      record(state.stores) && record(state.stores.shared) && record(state.stores.local) &&
      ROUTES.every((route) => record(state.stores.local[route.instance])) &&
      Array.isArray(state.attempts) && Array.isArray(state.trace);
  }

  function commandContext(state, command, needKind = false) {
    if (!validState(state)) {
      return reject("state.invalid", "No valid declared-state rehearsal is active. Reset the exercise.");
    }
    if (!record(command)) return reject("command.invalid", "Provide a request command.");
    const client = state.clients.find((item) => item.id === command.clientId);
    if (!client) return reject("client.invalid", "Unknown client. Choose client-amber or client-cobalt.");
    const route = ROUTES.find((item) => item.key === command.destination);
    if (!route) return reject("destination.invalid", "Unknown target. Choose one of the four declared version/instance pairs.");
    if (needKind && !REPLY_KINDS.includes(command.replyKind)) {
      return reject("fixture.invalid", "Unknown reply fixture. No read was recorded.");
    }
    return { ok: true, client, route };
  }

  function append(state, event, details, clientId = null, destination = null) {
    state.trace.push({ sequence: state.trace.length + 1, event, clientId, destination, details });
  }

  function startRehearsal(mode) {
    if (!["local", "shared"].includes(mode)) {
      return reject("mode.invalid", "Unknown storage mode. Choose local or shared; no mode is assumed.");
    }
    const state = {
      kind: "S031-session-v1",
      mode,
      clients: CLIENTS.map((fixture) => ({
        ...copy(fixture), lastRequestedDestination: fixture.origin, latest: null
      })),
      stores: {
        shared: {},
        local: Object.fromEntries(ROUTES.map((route) => [route.instance, {}]))
      },
      attempts: [],
      trace: []
    };
    append(state, "rehearsal.started",
      `${mode} mode; separate synthetic run. No read has been tested. Mode switches do not migrate state.`);
    for (const client of state.clients) {
      const origin = ROUTES.find((route) => route.key === client.origin);
      const store = mode === "shared" ? state.stores.shared : state.stores.local[origin.instance];
      store[client.id] = copy(client.expectedProfile);
      append(state, "profile.seeded",
        `Declared ${client.expectedProfile.profileId}, schema 1, revision ${client.expectedProfile.revision}; ` +
        (mode === "shared" ? "one shared map, keyed by client." : `only ${origin.instance}'s local map.`),
        client.id, client.origin);
    }
    return { ok: true, state };
  }

  function makeMatchingReply(state, command) {
    const context = commandContext(state, command);
    if (!context.ok) return context;
    return {
      ok: true,
      reply: {
        httpStatus: 200,
        clientId: context.client.id,
        version: context.route.version,
        instance: context.route.instance,
        profile: copy(context.client.expectedProfile)
      }
    };
  }

  function assertion(code, label, expected, observed, status) {
    return { code, label, expected: copy(expected), observed: copy(observed), status };
  }

  function evaluate(client, route, rawReply, source, attempt) {
    const reply = record(rawReply) ? rawReply : {};
    const assertions = [];
    function check(code, label, expected, observed, known, matches = same(expected, observed)) {
      assertions.push(assertion(code, label, expected, observed,
        known ? (matches ? "pass" : "fail") : "unknown"));
    }
    check("http", "HTTP status", 200, reply.httpStatus,
      Number.isInteger(reply.httpStatus) && reply.httpStatus >= 100 && reply.httpStatus <= 599);
    for (const [code, label, expected, observed] of [
      ["client", "Client identity", client.id, reply.clientId],
      ["version", "Deployment version", route.version, reply.version],
      ["instance", "Instance identity", route.instance, reply.instance]
    ]) {
      check(code, label, expected, observed, typeof observed === "string" && observed.length > 0);
    }

    const hasProfile = Object.hasOwn(reply, "profile");
    const profileObject = record(reply.profile);
    const nonempty = profileObject && Object.keys(reply.profile).length > 0;
    const empty = hasProfile && (reply.profile === null || (profileObject && !nonempty));
    const profileDescription = !hasProfile ? "missing" :
      empty ? "empty/reset" : nonempty ? "nonempty object" : "invalid shape";
    check("profile.present", "Nonempty profile", "nonempty object", profileDescription,
      nonempty || empty);
    for (const field of PROFILE_FIELDS) {
      const observed = profileObject && Object.hasOwn(reply.profile, field) ? reply.profile[field] : null;
      check(`profile.${field}`, `Profile ${field}`, client.expectedProfile[field], observed,
        profileObject, profileObject && Object.hasOwn(reply.profile, field) &&
          same(client.expectedProfile[field], observed));
    }
    const outcome = assertions.some((item) => item.status === "fail") ? "interrupted" :
      assertions.some((item) => item.status === "unknown") ? "unknown" : "preserved";
    return {
      attempt, source, clientId: client.id, destination: route.key,
      expectedRoute: { version: route.version, instance: route.instance },
      observedClientId: copy(reply.clientId),
      observedRoute: { version: copy(reply.version), instance: copy(reply.instance) },
      httpStatus: copy(reply.httpStatus),
      expectedProfile: copy(client.expectedProfile),
      observedProfile: hasProfile ? copy(reply.profile) : null,
      outcome, assertions, reply: copy(rawReply)
    };
  }

  function observe(state, context, reply, source) {
    const next = copy(state);
    const client = next.clients.find((item) => item.id === context.client.id);
    const report = evaluate(client, context.route, reply, source, next.attempts.length + 1);
    client.lastRequestedDestination = context.route.key;
    client.latest = report;
    next.attempts.push(report);
    append(next, "read.requested", source, client.id, context.route.key);
    append(next, "reply.observed",
      `HTTP ${report.httpStatus ?? "unknown"}; reply identity ` +
      `${report.observedClientId ?? "unknown"} at ${report.observedRoute.version ?? "unknown"}/` +
      `${report.observedRoute.instance ?? "unknown"}.`,
      client.id, context.route.key);
    const passed = report.assertions.filter((item) => item.status === "pass").length;
    const failed = report.assertions.filter((item) => item.status !== "pass")
      .map((item) => `${item.label}: ${item.status}`).join("; ");
    append(next, `continuity.${report.outcome}`,
      `${passed}/${report.assertions.length} assertions pass. ` +
      (failed || "Every declared field matches. Synthetic observation only."),
      client.id, context.route.key);
    return { ok: true, state: next, report: copy(report) };
  }

  function visit(state, command) {
    const context = commandContext(state, command, true);
    if (!context.ok) return context;
    const reply = makeMatchingReply(state, command).reply;
    if (command.replyKind === "stored") {
      const store = state.mode === "shared" ? state.stores.shared :
        state.stores.local[context.route.instance];
      reply.profile = Object.hasOwn(store, context.client.id) ? copy(store[context.client.id]) : {};
    } else if (command.replyKind === "empty") {
      reply.profile = {};
    } else if (command.replyKind === "reset") {
      reply.profile = {
        schema: 1, profileId: context.client.expectedProfile.profileId, displayName: "",
        theme: "default", cart: [], draft: "", revision: 0
      };
    } else if (command.replyKind === "stale") {
      reply.profile.revision -= 1;
    } else if (command.replyKind === "unknown") {
      delete reply.profile;
    }
    const source = command.replyKind === "stored" ?
      `${state.mode} stored-profile fixture` : `${command.replyKind} injected-reply fixture — no store write`;
    return observe(state, context, reply, source);
  }

  function inspectReply(state, command) {
    const context = commandContext(state, command);
    if (!context.ok) return context;
    if (typeof command.payloadText !== "string" || command.payloadText.length > 12000) {
      return reject("reply.text.invalid", "Supplied reply must be JSON text of at most 12000 characters. Previous results were retained.");
    }
    let reply;
    try {
      reply = JSON.parse(command.payloadText);
    } catch {
      return reject("reply.json.invalid", "Invalid JSON. No observation was added; previous results were retained.");
    }
    return observe(state, context, reply, "supplied reply — not a store read");
  }

  function summarize(state) {
    if (!validState(state)) {
      return { attempted: 0, preserved: 0, interrupted: 0, unknown: 0, allPreserved: false, outcome: "unknown" };
    }
    const summary = { attempted: state.attempts.length, preserved: 0, interrupted: 0, unknown: 0 };
    for (const item of state.attempts) {
      if (item.outcome === "preserved") summary.preserved++;
      else if (item.outcome === "interrupted") summary.interrupted++;
      else summary.unknown++;
    }
    summary.allPreserved = summary.attempted > 0 && summary.preserved === summary.attempted;
    summary.outcome = summary.interrupted > 0 ? "interrupted" : summary.unknown > 0 ? "unknown" :
      summary.allPreserved ? "all-observed-preserved" : "not-tested";
    return summary;
  }

  return {
    ROUTES, REPLY_KINDS, startRehearsal, makeMatchingReply, visit, inspectReply, summarize
  };
});
