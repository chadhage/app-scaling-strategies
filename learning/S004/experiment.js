(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.S004Experiment = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const CONDITIONS = new Set([
    "stable-compatible", "unstable-assignment", "incompatible-state",
    "missing-observation", "lagging-route"
  ]);
  const FIXTURE = Array.from({ length: 20 }, (_, index) => {
    const bucket = 2 + index * 5;
    return {
      id: `u${String(index + 1).padStart(2, "0")}`,
      bucket,
      cohort: bucket < 50 ? "A" : "B",
      plannedVersion: bucket < 50 ? "v1" : "v2"
    };
  });
  const copy = (value) => structuredClone(value);
  const initialAccount = () => ({ schemaVersion: 1, credits: 1000, tickets: 0, effects: [] });
  const verdict = (outcomes) => outcomes.includes("failed") ? "failed" :
    outcomes.length === 0 || outcomes.includes("unknown") ? "unknown" : "passed";

  function createRehearsal() {
    return {
      desiredPercent: 50,
      phase: "split",
      epoch: 1,
      accounts: Object.fromEntries(FIXTURE.map((user) => [user.id, initialAccount()])),
      expectedAccounts: Object.fromEntries(FIXTURE.map((user) => [user.id, initialAccount()])),
      rounds: [],
      trace: [{
        action: "start",
        message: "New rehearsal: desired v2 50%; fixed intended cohorts; no observations yet."
      }]
    };
  }

  function transact(version, account, key, path = "compatible") {
    if (!["v1", "v2"].includes(version)) throw new RangeError("Version must be v1 or v2.");
    if (!account || ![1, 2].includes(account.schemaVersion) ||
        !Number.isSafeInteger(account.credits) || account.credits < 0 ||
        !Number.isSafeInteger(account.tickets) || account.tickets < 0 ||
        !Array.isArray(account.effects) || account.effects.some((effect) => typeof effect !== "string")) {
      throw new RangeError("Account state must contain a supported schema, credits, tickets and effect keys.");
    }
    if (typeof key !== "string" || !/^[a-z0-9-]{1,64}$/.test(key)) {
      throw new RangeError("Transaction key must be 1-64 lowercase letters, digits or hyphens.");
    }
    if (!["compatible", "incompatible-state"].includes(path)) {
      throw new RangeError("Compatibility path is not recognized.");
    }
    const next = copy(account);
    if (version === "v2" && path === "incompatible-state") {
      next.schemaVersion = 2;
      next.credits -= 1;
      next.tickets += 1;
      next.effects.push(key);
      return { account: next, readable: false, reason: "v2 wrote schema 2 and ignored the shared retry key." };
    }
    if (next.schemaVersion !== 1) {
      return { account: next, readable: false, reason: "Schema 2 is not readable through the shared schema-1 contract." };
    }
    if (next.effects.includes(key)) return { account: next, readable: true, reason: "Retry deduplicated." };
    if (next.credits < 1) return { account: next, readable: false, reason: "Insufficient synthetic credits." };
    next.credits -= 1;
    next.tickets += 1;
    next.effects.push(key);
    return { account: next, readable: true, reason: "One credit spent; one ticket; one effect key." };
  }

  function validateCondition(condition, phase) {
    if (!CONDITIONS.has(condition)) throw new RangeError("Synthetic condition is not recognized.");
    if (phase === "split" && condition === "lagging-route") {
      throw new RangeError("Lagging-route is a convergence-only condition. First hold a healthy split and request convergence.");
    }
    if (phase !== "split" && condition === "unstable-assignment") {
      throw new RangeError("Unstable assignment is a split/hold-only condition.");
    }
  }

  function validateRounds(value, existing) {
    const count = typeof value === "string" && /^(?:[1-9]|1[0-2])$/.test(value) ? Number(value) : value;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 12) {
      throw new RangeError("Rounds must be a whole integer from 1 to 12, without extra text.");
    }
    if (existing + count > 100) throw new RangeError("The local rehearsal limit is 100 total rounds. Reset to begin separately.");
    return count;
  }

  function counts(rows) {
    return {
      v1: rows.filter((row) => row.observedVersion === "v1").length,
      v2: rows.filter((row) => row.observedVersion === "v2").length,
      unknown: rows.filter((row) => row.observedVersion === null).length
    };
  }

  function pendingRow(user) {
    return {
      ...user, observedVersion: null, schemaVersion: null,
      credits: null, expectedCredits: null, tickets: null, expectedTickets: null, effectCount: null,
      routeOutcome: "unknown", stateEffectsOutcome: "unknown", outcome: "unknown",
      reason: "No observation. State and effects are not inferred from desired routing."
    };
  }

  function sampleRound(state, condition) {
    const id = state.rounds.length + 1;
    const rows = FIXTURE.map((user) => {
      const key = `r${String(id).padStart(3, "0")}-${user.id}`;
      const expected = transact("v1", state.expectedAccounts[user.id], key).account;
      state.expectedAccounts[user.id] = expected;
      if (condition === "missing-observation" && user.id === "u20") {
        return { ...pendingRow(user), reason: "Missing observation: destination, state and effect outcome are unknown." };
      }

      let version = state.desiredPercent === 100 ? "v2" : user.plannedVersion;
      if (condition === "unstable-assignment" && id % 2 === 0) version = version === "v1" ? "v2" : "v1";
      if (condition === "lagging-route" && user.id === "u20") version = "v1";
      const path = condition === "incompatible-state" ? "incompatible-state" : "compatible";
      const first = transact(version, state.accounts[user.id], key, path);
      const retry = transact(version, first.account, key, path);
      const actual = retry.account;
      state.accounts[user.id] = actual;
      const effectCount = actual.effects.filter((effect) => effect === key).length;
      const routeOk = version === (state.desiredPercent === 100 ? "v2" : user.plannedVersion);
      const stateOk = first.readable && retry.readable && actual.schemaVersion === 1 &&
        actual.credits === expected.credits && actual.tickets === expected.tickets;
      const effectsOk = effectCount === 1;
      const reasons = [];
      if (!routeOk) reasons.push(state.desiredPercent === 100 ?
        `Observed ${version}; requested convergence requires v2.` :
        `Observed ${version}; stable intended cohort requires ${user.plannedVersion}.`);
      if (!stateOk) reasons.push(`State contract failed: schema ${actual.schemaVersion}, credits ${actual.credits}/${expected.credits}, tickets ${actual.tickets}/${expected.tickets}. ${retry.reason}`);
      if (!effectsOk) reasons.push(`Effect contract failed: ${effectCount} effects for one retried transaction; expected 1.`);
      return {
        ...user,
        observedVersion: version,
        schemaVersion: actual.schemaVersion,
        credits: actual.credits, expectedCredits: expected.credits,
        tickets: actual.tickets, expectedTickets: expected.tickets,
        effectCount,
        routeOutcome: routeOk ? "passed" : "failed",
        stateEffectsOutcome: stateOk && effectsOk ? "passed" : "failed",
        outcome: routeOk && stateOk && effectsOk ? "passed" : "failed",
        reason: reasons.join(" ") || "Observed intended version, compatible schema/state, and exactly one effect after retry."
      };
    });
    const observed = counts(rows);
    const outcome = verdict(rows.map((row) => row.outcome));
    const adverse = rows.find((row) => row.outcome !== "passed");
    const round = { id, epoch: state.epoch, desiredPercent: state.desiredPercent, condition, rows, observed, outcome };
    state.rounds.push(round);
    state.trace.push({
      action: state.desiredPercent === 50 ? "observe-split" : "observe-convergence",
      message: `Round ${id} (simulated minute ${id}), desired v2 ${state.desiredPercent}%: observed v1 ${observed.v1}, v2 ${observed.v2}, unknown ${observed.unknown}; user impact ${outcome}.` +
        (adverse ? ` ${adverse.id}: ${adverse.reason}` : "")
    });
  }

  function holdExperiment(state, options) {
    if (state.phase !== "split") throw new RangeError("Hold is only available during the split experiment.");
    if (!options || typeof options !== "object") throw new RangeError("Round settings are required.");
    const rounds = validateRounds(options.rounds, state.rounds.length);
    validateCondition(options.condition, "split");
    const next = copy(state);
    for (let index = 0; index < rounds; index += 1) sampleRound(next, options.condition);
    return next;
  }

  function impactOf(state) {
    const allRows = state.rounds.flatMap((round) => round.rows);
    return {
      status: verdict(state.rounds.map((round) => round.outcome)),
      failedRounds: state.rounds.filter((round) => round.outcome === "failed").length,
      unknownRounds: state.rounds.filter((round) => round.outcome === "unknown").length,
      failedUserObservations: allRows.filter((row) => row.outcome === "failed").length,
      unknownUserObservations: allRows.filter((row) => row.outcome === "unknown").length
    };
  }

  function requestConvergence(state) {
    const next = copy(state);
    const impact = impactOf(state);
    let reason = "";
    if (state.phase !== "split") reason = "a convergence request is already active or complete.";
    else if (state.rounds.length === 0) reason = "first observe a complete stable compatible split.";
    else if (impact.status !== "passed") reason = `${impact.status} user-impact history cannot authorize convergence. Reset starts a separate attempt; it does not repair this one.`;
    if (reason) {
      next.trace.push({ action: "blocked-convergence", message: `Convergence blocked: ${reason}` });
      return next;
    }
    next.desiredPercent = 100;
    next.phase = "converging";
    next.epoch += 1;
    next.trace.push({
      action: "request-convergence",
      message: "Convergence requested: desired v2 100%. The last split sample predates this request. A new complete observation is required; no destination or state is inferred."
    });
    return next;
  }

  function observeConvergence(state, condition) {
    if (state.phase !== "converging") throw new RangeError("Request convergence before recording a convergence observation.");
    validateCondition(condition, "converging");
    if (state.rounds.length >= 100) throw new RangeError("The local rehearsal limit is 100 total rounds. Reset to begin separately.");
    const next = copy(state);
    sampleRound(next, condition);
    if (inspect(next).migration.status === "passed") next.phase = "converged";
    return next;
  }

  function inspect(state) {
    const latest = state.rounds.at(-1);
    const rows = latest ? copy(latest.rows) : FIXTURE.map(pendingRow);
    const impact = impactOf(state);
    const currentEvidence = Boolean(latest && latest.epoch === state.epoch);
    let migration = {
      status: "not-complete",
      message: "Not complete: a held 50/50 split is an experiment. Intended v1 users remain on v1; even a sustained passing split is not all-user migration."
    };
    if (state.desiredPercent === 100) {
      if (!currentEvidence) migration = {
        status: "unknown",
        message: "Unknown: a new convergence observation is required. The prior 50/50 split sample predates the 100% request."
      };
      else if (impact.status === "failed") migration = {
        status: "failed",
        message: "Failed: a route, state or effect assertion failed in this rehearsal. Later passing samples do not erase earlier user impact."
      };
      else if (impact.status === "unknown") migration = {
        status: "unknown",
        message: "Unknown: at least one recorded user outcome is missing. Configured 100% is not evidence that every user converged."
      };
      else migration = {
        status: "passed",
        message: "Passed for this synthetic fixture only: all 20 users were newly observed on v2 with compatible state and exactly one effect per transaction. No real-user migration or version retirement is proved."
      };
    }
    const splitRows = state.rounds.filter((round) => round.desiredPercent === 50).flatMap((round) => round.rows);
    return {
      desiredPercent: state.desiredPercent,
      phase: state.phase,
      sampleCount: state.rounds.length,
      simulatedMinutes: state.rounds.length,
      currentEvidence,
      rows,
      observed: {
        ...counts(rows),
        hasSample: Boolean(latest),
        roundId: latest?.id ?? null,
        epoch: latest?.epoch ?? null,
        desiredPercent: latest?.desiredPercent ?? null
      },
      checks: {
        cohorts: verdict(splitRows.map((row) => row.routeOutcome)),
        stateEffects: verdict(state.rounds.flatMap((round) => round.rows.map((row) => row.stateEffectsOutcome)))
      },
      impact,
      migration,
      history: state.rounds.map((round) => ({
        id: round.id, epoch: round.epoch, desiredPercent: round.desiredPercent,
        condition: round.condition, observed: copy(round.observed), outcome: round.outcome
      })),
      trace: copy(state.trace)
    };
  }

  return {
    createRehearsal, inspect, holdExperiment, requestConvergence, observeConvergence, transact
  };
});
