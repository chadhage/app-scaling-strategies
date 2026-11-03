(function (root) {
  "use strict";

  const POPULATION = 20;
  const FIXTURES = ["safe", "regressed", "missing", "unknown", "partial", "stale", "short-window", "malformed"];
  const copy = value => structuredClone(value);
  const targetCount = run => run.desiredPercent * POPULATION / 100;
  const intended = (run, index) => index < targetCount(run) ? "v2" : "v1";
  const finite = value => typeof value === "number" && Number.isFinite(value);

  function createRun(options = {}) {
    const config = {
      stages: options.stages ? [...options.stages] : [5, 25, 50, 100],
      windowSeconds: options.windowSeconds ?? 30,
      maxAgeSeconds: 60,
      budgetMs: 1000
    };
    if (config.stages.length < 1 || config.stages.length > 6 ||
        config.stages.at(-1) !== 100 || config.stages.some((stage, index) =>
          !Number.isInteger(stage) || stage <= 0 || stage > 100 || stage % 5 !== 0 ||
          (index > 0 && stage <= config.stages[index - 1])) ||
        !finite(config.windowSeconds) || config.windowSeconds < 10 || config.windowSeconds > 300) {
      throw new RangeError("Choose 1–6 increasing stages in 5% units ending at 100%, and a 10–300 second window.");
    }
    const run = {
      config,
      users: Array.from({ length: POPULATION }, (_, index) => `u${String(index + 1).padStart(2, "0")}`),
      desiredPercent: config.stages[0],
      stageIndex: 0,
      epoch: 1,
      clockSeconds: 0,
      stageStartedAtSeconds: 0,
      phase: "canary",
      attempts: [],
      observations: [],
      currentObservation: null,
      interruptedUserIds: [],
      regressionSeen: false,
      trace: [],
      lastAction: "started"
    };
    const cohort = addCohort(run);
    appendEvent(run, "started", "Requested the first synthetic cohort; destinations and journeys still need observation.", cohort);
    return run;
  }

  function addCohort(run) {
    const existing = new Set(run.attempts.map(attempt => attempt.userId));
    const added = run.users.slice(0, targetCount(run)).filter(id => !existing.has(id));
    for (const userId of added) {
      run.attempts.push({
        userId, stagePercent: run.desiredPercent, epoch: run.epoch,
        from: "v1", intendedDestination: "v2", actualDestination: "unknown", status: "pending"
      });
    }
    return added;
  }

  function makeObservation(run, kind = "safe") {
    if (!FIXTURES.includes(kind)) throw new RangeError("Unknown synthetic observation fixture.");
    const duration = kind === "short-window" ? 5 : run.config.windowSeconds;
    const observation = {
      kind,
      epoch: run.epoch,
      stagePercent: run.desiredPercent,
      startSeconds: run.clockSeconds,
      endSeconds: run.clockSeconds + duration,
      receivedAtSeconds: run.clockSeconds + duration + (kind === "stale" ? 61 : 0),
      users: run.users.map((id, index) => ({
        id, destination: intended(run, index), httpStatus: 200, complete: true,
        authentication: true, state: true, effects: 1, latencyMs: 350
      }))
    };
    const newest = run.attempts.find(attempt => attempt.epoch === run.epoch)?.userId ?? "u01";
    const user = observation.users.find(entry => entry.id === newest);
    if (kind === "regressed") user.latencyMs = 1400;
    if (kind === "unknown") {
      Object.assign(user, {
        complete: null, httpStatus: null, authentication: null,
        state: null, effects: null, latencyMs: null
      });
    }
    if (kind === "partial") user.destination = "v1";
    if (kind === "missing") observation.users = [];
    if (kind === "malformed") observation.users = { unverified: "not a journey list" };
    return observation;
  }

  function classifyJourney(user, budgetMs = 1000) {
    if (!user || !["v1", "v2"].includes(user.destination)) return "unknown";
    if (user.complete === false || user.authentication === false || user.state === false ||
        (Number.isInteger(user.httpStatus) && (user.httpStatus < 200 || user.httpStatus > 299)) ||
        (finite(user.effects) && user.effects !== 1) ||
        (finite(user.latencyMs) && user.latencyMs > budgetMs)) return "failed";
    if (user.complete !== true || user.authentication !== true || user.state !== true ||
        !Number.isInteger(user.httpStatus) || user.effects !== 1 ||
        !finite(user.latencyMs) || user.latencyMs < 0) return "unknown";
    return "passed";
  }

  function completeCoverage(run, observation) {
    if (!Array.isArray(observation?.users) || observation.users.length !== POPULATION) return false;
    const ids = observation.users.map(user => user?.id);
    return new Set(ids).size === POPULATION && run.users.every(id => ids.includes(id));
  }

  function validTiming(observation) {
    return [observation.startSeconds, observation.endSeconds, observation.receivedAtSeconds].every(finite) &&
      observation.endSeconds >= observation.startSeconds &&
      observation.receivedAtSeconds >= observation.endSeconds;
  }

  function matchingStage(run, observation) {
    return observation.epoch === run.epoch && observation.stagePercent === run.desiredPercent;
  }

  function recordObservation(previous, input) {
    const run = copy(previous);
    const observation = copy(input ?? { kind: "missing", users: [] });
    if (finite(observation.receivedAtSeconds)) {
      run.clockSeconds = Math.max(run.clockSeconds, observation.receivedAtSeconds);
    }
    run.currentObservation = observation;
    run.observations.push(observation);
    if (matchingStage(run, observation)) {
      const covered = completeCoverage(run, observation);
      const entries = Array.isArray(observation.users) ? observation.users : [];
      const samples = new Map(entries.map(user => [user?.id, user]));
      const interrupted = entries
        .filter(user => classifyJourney(user, run.config.budgetMs) === "failed")
        .map(user => user.id);
      run.interruptedUserIds = [...new Set([...run.interruptedUserIds, ...interrupted])];
      run.regressionSeen ||= interrupted.length > 0;
      if (run.phase === "canary") {
        for (const attempt of run.attempts) {
          const user = samples.get(attempt.userId);
          let outcome = covered && validTiming(observation) ? classifyJourney(user, run.config.budgetMs) : "unknown";
          if (outcome === "passed" && user.destination !== "v2") outcome = "unknown";
          // A later probe cannot retroactively repair an interrupted or unverified transition.
          if (attempt.status !== "failed" && (attempt.status !== "unknown" || outcome === "failed")) {
            attempt.status = outcome;
          }
          attempt.actualDestination = ["v1", "v2"].includes(user?.destination) ? user.destination : "unknown";
        }
      }
    }
    appendEvent(run, "observation", `Recorded ${observation.kind ?? "custom"} evidence; ${assess(run).reasons.join(", ") || "journey gates pass"}.`);
    return run;
  }

  function assess(run) {
    const reasons = [];
    const observation = run.currentObservation;
    if (run.phase === "rolled-back") reasons.push("rollback-active");
    if (!observation || !Array.isArray(observation.users) || observation.users.length === 0) {
      reasons.push("missing-observation");
    } else {
      if (!matchingStage(run, observation) || observation.startSeconds < run.stageStartedAtSeconds) reasons.push("wrong-stage");
      if (!validTiming(observation)) reasons.push("invalid-timing");
      if (validTiming(observation) && observation.endSeconds - observation.startSeconds < run.config.windowSeconds) reasons.push("short-window");
      if (finite(observation.endSeconds) && run.clockSeconds - observation.endSeconds > run.config.maxAgeSeconds) reasons.push("stale-observation");
      if (!completeCoverage(run, observation)) reasons.push("incomplete-coverage");
      const byId = new Map(observation.users.map(user => [user?.id, user]));
      if (run.users.some((id, index) => byId.get(id)?.destination !== intended(run, index))) reasons.push("routing-mismatch");
      const outcomes = run.users.map(id => classifyJourney(byId.get(id), run.config.budgetMs));
      if (outcomes.includes("failed")) reasons.push("journey-regression");
      if (outcomes.includes("unknown")) reasons.push("unknown-outcome");
    }
    if (run.regressionSeen) reasons.push("retained-regression");
    if (run.attempts.some(attempt => attempt.status === "failed")) reasons.push("retained-failure");
    if (run.attempts.some(attempt => ["unknown", "pending"].includes(attempt.status))) reasons.push("retained-unknown");
    const ready = reasons.length === 0;
    const nextPercent = run.phase === "canary" ? run.config.stages[run.stageIndex + 1] ?? null : null;
    return { ready, canPromote: ready && nextPercent !== null, reasons, nextPercent };
  }

  function promote(previous) {
    const run = copy(previous);
    const gate = assess(run);
    if (!gate.canPromote) {
      appendEvent(run, "promotion-blocked", `No increment: ${gate.reasons.join(", ") || "final-stage"}. Desired traffic is unchanged.`);
      return run;
    }
    run.stageIndex += 1;
    run.desiredPercent = gate.nextPercent;
    run.epoch += 1;
    run.stageStartedAtSeconds = run.clockSeconds;
    run.currentObservation = null;
    const cohort = addCohort(run);
    appendEvent(run, "promoted", "Requested exactly the next stable cohort. Earlier evidence cannot validate this stage.", cohort);
    return run;
  }

  function advanceClock(previous, seconds = 61) {
    if (!finite(seconds) || seconds <= 0) throw new RangeError("Clock increment must be positive finite seconds.");
    const run = copy(previous);
    run.clockSeconds += seconds;
    appendEvent(run, "clock-advanced", `Advanced the simulated clock by ${seconds} seconds; no real waiting or measurements.`);
    return run;
  }

  function rollback(previous) {
    const run = copy(previous);
    run.phase = "rolled-back";
    run.desiredPercent = 0;
    run.epoch += 1;
    run.stageStartedAtSeconds = run.clockSeconds;
    run.currentObservation = null;
    appendEvent(run, "rollback-requested", "Requested v1 for everyone. Actual recovery routing needs a new observation; historical failures and unknowns remain.");
    return run;
  }

  function observedCounts(run) {
    if (!completeCoverage(run, run.currentObservation)) return { actualV2: null, actualV1: null, actualUnknown: POPULATION };
    const users = run.currentObservation.users;
    return {
      actualV2: users.filter(user => user.destination === "v2").length,
      actualV1: users.filter(user => user.destination === "v1").length,
      actualUnknown: users.filter(user => !["v1", "v2"].includes(user.destination)).length
    };
  }

  function summarize(run) {
    const counts = {
      attempted: run.attempts.length,
      uninterrupted: run.attempts.filter(attempt => attempt.status === "passed").length,
      failed: run.attempts.filter(attempt => attempt.status === "failed").length,
      unknown: run.attempts.filter(attempt => ["unknown", "pending"].includes(attempt.status)).length,
      unchanged: POPULATION - run.attempts.length,
      desiredV2: targetCount(run),
      interruptedUsers: run.interruptedUserIds.length,
      ...observedCounts(run)
    };
    counts.allMigrated = run.phase === "canary" && run.desiredPercent === 100 &&
      counts.attempted === POPULATION && counts.uninterrupted === POPULATION && assess(run).ready;
    return counts;
  }

  function appendEvent(run, type, detail, cohortAdded = []) {
    const counts = summarize(run);
    run.lastAction = type;
    run.trace.push({
      sequence: run.trace.length + 1, type, atSeconds: run.clockSeconds,
      epoch: run.epoch, desiredPercent: run.desiredPercent,
      actualV2: counts.actualV2, attempted: counts.attempted,
      uninterrupted: counts.uninterrupted, failed: counts.failed, unknown: counts.unknown,
      cohortAdded, detail
    });
  }

  const api = {
    FIXTURES, createRun, makeObservation, recordObservation, promote,
    advanceClock, rollback, assess, summarize, classifyJourney
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.S003Canary = api;
})(globalThis);
