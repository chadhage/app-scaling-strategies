(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.S002 = factory();
  }
})(globalThis, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    profile: "windows-code-manual",
    target: "production",
    configuration: "target-effective",
    readiness: "ready",
    statusPolicy: "strict-200",
    formerWork: "opaque"
  });
  const OPTIONS = Object.freeze({
    profile: ["windows-code-manual", "linux-code-manual", "linux-code-auto", "container-auto"],
    target: ["production", "staging"],
    configuration: ["target-effective", "source-only", "incompatible"],
    readiness: ["ready", "unready", "misleading-500"],
    statusPolicy: ["strict-200", "any-response"],
    formerWork: ["opaque", "interrupted"]
  });
  const TARGET_SETTINGS = Object.freeze({
    APP_ENV: "production",
    CATALOG_ALIAS: "catalog-production",
    SESSION_CONTRACT: "shared-v1"
  });
  const SOURCE_INSTANCE_IDS = Object.freeze(["staging-1", "staging-2"]);
  const LIMITS = Object.freeze([
    "In-flight requests can be interrupted when former production workers recycle; retained slots are not retained workers.",
    "Long-lived connections (including WebSockets) and background work are not protected by a custom drain in a native swap.",
    "Retry and reconnect time must remain inside the original journey budget; recovery cannot erase an interruption.",
    "Real maximum request/job duration and native timing are unmeasured; logical trace ticks are not elapsed seconds.",
    "No durable continuation, exactly-once effect, or job completion is established by this fixture.",
    "Slots share their App Service plan: this swap adds no compute and assumes overlap headroom.",
    "Only named fixture settings are modeled; identity, network, authentication, and other non-swapped settings still need separate validation.",
    "No native Azure observation, B-S002 proof, completed D-S002 parent, or reliability certification is provided."
  ]);

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function runLesson(input = {}) {
    const validObject = isRecord(input);
    const inputValidation = {
      isObject: validObject,
      knownKeysOnly: validObject && Object.keys(input).every((key) => Object.hasOwn(DEFAULTS, key))
    };
    const selection = { ...DEFAULTS };
    if (validObject) {
      for (const key of Object.keys(DEFAULTS)) {
        if (Object.hasOwn(input, key)) selection[key] = input[key];
      }
    }
    const result = {
      mode: "synthetic",
      state: "blocked",
      selection,
      inputValidation,
      source: "staging",
      target: selection.target,
      effectiveSettings: {},
      warmup: { path: "/readyz", acceptedStatuses: [200], instances: [] },
      routing: { before: "v1", after: "v1" },
      formerWorkers: {
        retainedSlot: true,
        recycled: false,
        request: "not-assessed",
        connection: "not-assessed",
        backgroundJob: "not-assessed"
      },
      userImpact: { classification: "not-run", uninterrupted: "not-assessed" },
      customDrain: false,
      nativeEvidence: false,
      reliabilityCertified: false,
      cleanup: { state: "local-only", cloudResourcesCreated: 0, persistentState: false },
      limits: [...LIMITS],
      reasons: [],
      trace: []
    };
    function record(phase, detail) {
      result.trace.push({
        step: result.trace.length + 1,
        at: `T+${String(result.trace.length).padStart(3, "0")}`,
        phase,
        detail
      });
    }
    function reject(code, message) {
      result.reasons.push({ code, message });
    }
    function blocked() {
      record("blocked", `Candidate not exposed. Synthetic production remains v1. ${result.reasons.map((reason) => reason.message).join(" ")}`);
      return result;
    }

    record("fixture", "Synthetic v1 production, v2 staging; two source instances; compatible shared state and overlap headroom are assumed, not measured.");
    if (!inputValidation.isObject || !inputValidation.knownKeysOnly ||
        Object.entries(OPTIONS).some(([key, values]) => !values.includes(selection[key]))) {
      reject("invalid-selection", "Unrecognized selection: fail closed rather than invent platform support.");
    }
    if (result.reasons.length) return blocked();
    if (selection.profile === "linux-code-auto" || selection.profile === "container-auto") {
      reject("unsupported-profile", "Native auto-swap is unsupported for Linux code apps and Web App for Containers. Choose a supported manual code fixture.");
    }
    if (selection.target !== "production") {
      reject("target", "Production must be the target; staging v2 is the source prepared for the production configuration.");
    }
    if (selection.configuration === "source-only") {
      reject("target-settings", "Staging-only settings do not establish readiness under effective production slot-specific settings.");
    }
    if (selection.configuration === "incompatible") {
      reject("compatibility", "The target dependency/session contract is incompatible; a healthy-looking endpoint cannot authorize exposure.");
    }
    if (selection.statusPolicy !== "strict-200") {
      result.warmup.acceptedStatuses = [];
      reject("warmup-status", "The platform's any-response default is too broad for this lesson. Require WEBSITE_SWAP_WARMUP_PING_STATUSES=200 and meaningful /readyz.");
    }
    if (result.reasons.length) return blocked();

    result.effectiveSettings = { ...TARGET_SETTINGS };
    record("apply-target-settings", "Apply modeled production slot-specific APP_ENV=production, CATALOG_ALIAS=catalog-production, SESSION_CONTRACT=shared-v1 to staging v2.");
    record("restart-source", "Modeled source-instance restart after target settings are applied. Production v1 remains the serving target during preparation.");
    for (const [index, id] of SOURCE_INSTANCE_IDS.entries()) {
      const ready = selection.readiness === "ready" || (selection.readiness === "unready" && index === 0);
      const instance = {
        id,
        status: ready ? 200 : selection.readiness === "misleading-500" ? 500 : 503,
        dependenciesReady: ready,
        journeyReady: ready,
        configuration: "production"
      };
      result.warmup.instances.push(instance);
      record("warmup-instance", `${instance.id}: /readyz HTTP ${instance.status}; production-effective settings; dependency + journey checks ${ready ? "pass" : "FAIL"}; accepted status exactly 200.`);
    }
    if (result.warmup.instances.some((instance) => instance.status !== 200 || !instance.dependenciesReady || !instance.journeyReady)) {
      reject("readiness", "Not every staging instance is meaningfully ready; an HTTP 500/503 is not a successful warm-up.");
      return blocked();
    }

    record("gates-passed", "Both synthetic staging instances passed explicit HTTP 200, effective target configuration, dependency, compatibility, and journey checks.");
    result.routing.after = "v2";
    record("routing-switch", "Modeled native routing switch: warmed staging v2 becomes production; former production v1 moves to the retained staging slot.");
    result.formerWorkers.recycled = true;
    record("former-workers-recycle", "Model the documented former-production restart/recycle step. Retaining staging v1 does NOT preserve its workers or implement custom draining.");
    const outcome = selection.formerWork === "interrupted" ? "interrupted" : "unknown";
    result.formerWorkers.request = outcome;
    result.formerWorkers.connection = outcome;
    result.formerWorkers.backgroundJob = outcome;
    result.userImpact = {
      classification: outcome,
      uninterrupted: outcome === "interrupted" ? "not-achieved" : "unverified"
    };
    record("work-observation", `Synthetic request req-01, connection conn-01, background job job-01: ${outcome.toUpperCase()}. No native worker was observed; no completion, continuation, or drain guarantee is inferred.`);
    result.state = "rehearsed";
    return result;
  }

  function verifyLesson(result) {
    const checks = [];
    function check(id, ok, expected) {
      checks.push({ id, ok: Boolean(ok), expected });
    }
    if (!isRecord(result)) {
      check("evidence-present", false, "A complete structured rehearsal result is required.");
      return { passed: false, scope: "educational-only", checks };
    }
    const selection = result.selection || {};
    const trace = Array.isArray(result.trace) ? result.trace : [];
    const phases = trace.map((event) => event?.phase);
    const instances = Array.isArray(result.warmup?.instances) ? result.warmup.instances : [];
    const completeInstances = instances.length === SOURCE_INSTANCE_IDS.length &&
      SOURCE_INSTANCE_IDS.every((id) => instances.some((instance) =>
        isRecord(instance) && instance.id === id && Number.isInteger(instance.status) &&
        typeof instance.dependenciesReady === "boolean" && typeof instance.journeyReady === "boolean" &&
        instance.configuration === "production"));
    const inputValidation = result.inputValidation;
    const validInputFlags = isRecord(inputValidation) &&
      typeof inputValidation.isObject === "boolean" && typeof inputValidation.knownKeysOnly === "boolean" &&
      (inputValidation.isObject || !inputValidation.knownKeysOnly);
    const validSelectionShape = isRecord(result.selection) &&
      Object.keys(selection).length === Object.keys(DEFAULTS).length &&
      Object.keys(DEFAULTS).every((key) => Object.hasOwn(selection, key));
    const validOptions = Object.entries(OPTIONS).every(([key, values]) => values.includes(selection[key]));
    const workers = result.formerWorkers || {};
    const workKeys = ["request", "connection", "backgroundJob"];
    check("synthetic-boundary",
      result.mode === "synthetic" && result.nativeEvidence === false &&
      result.customDrain === false && result.reliabilityCertified === false,
      "Synthetic only; no native proof, custom drain, or reliability certification.");
    check("local-cleanup",
      result.cleanup?.state === "local-only" && result.cleanup.cloudResourcesCreated === 0 &&
      result.cleanup.persistentState === false,
      "Zero cloud resources; no persistent local state.");
    check("logical-trace",
      trace.length >= 2 && trace.every((event, index) =>
        event?.step === index + 1 && event.at === `T+${String(index).padStart(3, "0")}`),
      "Ordered deterministic logical ticks, not native timing.");
    check("limits-preserved",
      Array.isArray(result.limits) && LIMITS.every((limit) => result.limits.includes(limit)),
      "Keep in-flight work, long-work, configuration, capacity, and evidence limitations visible.");
    check("input-validation",
      validInputFlags && validSelectionShape &&
      (result.state !== "rehearsed" || (inputValidation.isObject && inputValidation.knownKeysOnly && validOptions)),
      "Redacted input-shape flags explain rejected input; only valid selections can reach routing.");

    if (result.state === "blocked") {
      const codes = Array.isArray(result.reasons) ? result.reasons.map((reason) => reason?.code) : [];
      const hasJustifiedBlocker =
        (codes.includes("invalid-selection") && validInputFlags &&
          (!inputValidation.isObject || !inputValidation.knownKeysOnly || !validOptions)) ||
        (codes.includes("unsupported-profile") && ["linux-code-auto", "container-auto"].includes(selection.profile)) ||
        (codes.includes("target") && selection.target !== "production") ||
        (codes.includes("target-settings") && selection.configuration === "source-only") ||
        (codes.includes("compatibility") && selection.configuration === "incompatible") ||
        (codes.includes("warmup-status") && selection.statusPolicy === "any-response") ||
        (codes.includes("readiness") && ["unready", "misleading-500"].includes(selection.readiness) &&
          completeInstances && instances.some((instance) =>
            instance.status !== 200 || !instance.dependenciesReady || !instance.journeyReady));
      check("explicit-rejection", codes.length > 0 && hasJustifiedBlocker && phases.includes("blocked"),
        "Unsafe input or failed readiness has a concrete blocker.");
      check("no-exposure",
        result.routing?.before === "v1" && result.routing.after === "v1" && !phases.includes("routing-switch"),
        "Blocked means v1 remains the admission destination.");
      check("no-invented-worker-observation",
        workers.recycled === false && workKeys.every((key) => workers[key] === "not-assessed") &&
        !phases.includes("former-workers-recycle") && !phases.includes("work-observation") &&
        result.userImpact?.classification === "not-run" && result.userImpact.uninterrupted === "not-assessed",
        "No swap means no former-worker outcome or continuity claim.");
    } else if (result.state === "rehearsed") {
      check("target-configuration",
        ["windows-code-manual", "linux-code-manual"].includes(selection.profile) &&
        selection.target === "production" && result.target === "production" &&
        result.source === "staging" && selection.configuration === "target-effective" &&
        Object.entries(TARGET_SETTINGS).every(([key, value]) => result.effectiveSettings?.[key] === value),
        "Supported manual code fixture; staging uses effective production settings and production is the target.");
      check("strict-readiness",
        selection.readiness === "ready" && selection.statusPolicy === "strict-200" &&
        result.warmup?.path === "/readyz" && Array.isArray(result.warmup.acceptedStatuses) &&
        result.warmup.acceptedStatuses.length === 1 &&
        result.warmup.acceptedStatuses[0] === 200 && completeInstances &&
        instances.every((instance) => instance.status === 200 && instance.dependenciesReady === true &&
          instance.journeyReady === true && instance.configuration === "production"),
        "Distinct staging-1 and staging-2 records pass meaningful /readyz and explicitly accepted HTTP 200.");
      const apply = phases.indexOf("apply-target-settings");
      const restart = phases.indexOf("restart-source");
      const firstWarmup = phases.indexOf("warmup-instance");
      const lastWarmup = phases.lastIndexOf("warmup-instance");
      const gate = phases.indexOf("gates-passed");
      const swap = phases.indexOf("routing-switch");
      const recycle = phases.indexOf("former-workers-recycle");
      check("gates-before-routing",
        apply >= 0 && apply < restart && restart < firstWarmup &&
        phases.filter((phase) => phase === "warmup-instance").length === 2 &&
        lastWarmup < gate && gate < swap && swap < recycle &&
        recycle < phases.indexOf("work-observation") &&
        result.routing?.before === "v1" && result.routing.after === "v2" &&
        Array.isArray(result.reasons) && result.reasons.length === 0,
        "Target settings, source restart, both warm-ups, gates, routing, recycling, then work observation.");
      const expectedWork = selection.formerWork === "opaque" ? "unknown" :
        selection.formerWork === "interrupted" ? "interrupted" : null;
      check("retained-slot-not-worker",
        workers.retainedSlot === true && workers.recycled === true && expectedWork !== null &&
        workKeys.every((key) => workers[key] === expectedWork),
        "The slot remains, but former workers recycle; all active-work outcomes stay unknown or interrupted.");
      check("honest-user-impact",
        expectedWork !== null && result.userImpact?.classification === expectedWork &&
        result.userImpact.uninterrupted === (expectedWork === "unknown" ? "unverified" : "not-achieved"),
        "Passing the exercise does not establish uninterrupted migration.");
    } else {
      check("recognized-state", false, "Only explicitly blocked or rehearsed results can be checked.");
    }
    return { passed: checks.every((item) => item.ok), scope: "educational-only", checks };
  }

  return { DEFAULTS, runLesson, verifyLesson };
});
