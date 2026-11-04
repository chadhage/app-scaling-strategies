(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('..\\C034\\trace.js'), require('..\\C023\\ledger.js'),
      require('..\\C020\\contract.js'), require('..\\C033\\journey.js'), require('..\\C020\\profiles.cjs'));
  } else {
    Object.defineProperty(root, 'C029Evaluator', {
      value: factory(root.C034Trace, root.C023Ledger, root.C020Contract, root.C033Journey, null)
    });
  }
}(globalThis, function (decoder, ledger, catalog, driver, providers) {
  'use strict';

  const savedIds = Object.freeze(['closed-history', 'held-snapshot']);
  const controlIds = Object.freeze(['control-below', 'control-at', 'control-above',
    'control-retry', 'control-unknown-retry', 'control-held-before', 'control-held-between']);
  const modelIds = Object.freeze(['model-clean', 'model-resume', 'model-unknown', 'model-reconcile']);
  const MAX_BYTES = 131072;
  const qualifications = Object.freeze({
    eligibleForLiveRun: false, userJourneySuccess: false, actualClientMutation: false,
    actualExternalEffects: false, durableEffects: false, actualRunCorrelation: false,
    nativeTransportQualified: false, productionRuntimeValidated: false,
    fullJourneyQualified: false, reliabilityCertified: false, approvalAdopted: false
  });
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function ownData(input) {
    let remaining = 30000;
    const ancestors = new Set();
    function copy(value, depth) {
      if (--remaining < 0 || depth > 18) fail('BOUNDED_JSON_REQUIRED');
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'string' && value.length <= MAX_BYTES) return value;
      if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER &&
          !Object.is(value, -0)) return value;
      if (!value || typeof value !== 'object' || ancestors.has(value)) fail('FINITE_OWN_JSON_REQUIRED');
      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) fail('OWN_DATA_PROTOTYPE');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const names = Reflect.ownKeys(descriptors);
      if (names.some((name) => typeof name !== 'string' || !Object.hasOwn(descriptors[name], 'value'))) fail('OWN_DATA_FIELDS');
      ancestors.add(value);
      let result;
      if (array) {
        if (value.length > 2048 || names.length !== value.length + 1 ||
            Array.from({ length: value.length }, (_, index) => String(index)).some((name) => !descriptors[name]?.enumerable)) fail('DENSE_BOUNDED_ARRAY');
        result = Array.from({ length: value.length }, (_, index) => copy(descriptors[index].value, depth + 1));
      } else {
        if (names.length > 64 || names.some((name) => !descriptors[name].enumerable ||
            ['__proto__', 'constructor', 'prototype'].includes(name))) fail('OWN_DATA_FIELDS');
        result = {};
        for (const name of names) result[name] = copy(descriptors[name].value, depth + 1);
      }
      ancestors.delete(value);
      return result;
    }
    const result = copy(input, 0);
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES) fail('JSON_OVERSIZE');
    return result;
  }
  function parseJson(text) {
    if (!decoder) fail('ACCEPTED_DECODER_REQUIRED');
    return freeze(ownData(decoder.parseJson(text)));
  }
  function result(rows, scope, extras = {}) {
    const counts = {
      originals: rows.length, pass: rows.filter((row) => row.verdict === 'PASS').length,
      fail: rows.filter((row) => row.verdict === 'FAIL').length,
      unknown: rows.filter((row) => row.verdict === 'UNKNOWN').length
    };
    const decision = counts.fail ? 'FAIL' : counts.unknown || !rows.length ? 'HOLD' : 'PASS';
    return freeze({
      schema: 'C029-evaluation/1', cardId: 'C029', valid: true, code: null,
      trainingBanner: 'Training rehearsal - synthetic data - not a live Azure result',
      evaluationScope: scope, decision, counts, originals: rows,
      successFraction: { numerator: counts.pass, denominator: counts.originals,
        meaning: 'Only this bounded evidence scope; failed and unknown started originals retained. Not availability or an SLA.' },
      ...extras, ...qualifications
    });
  }
  function rejected(code, scope = 'unbound inspection rejected') {
    return result([], scope, { valid: false, code, decision: 'HOLD', denominatorVerified: false, sourceConsistentHistorical: false });
  }
  function assessSnapshot(input) {
    const snapshot = ownData(input);
    if (!decoder || !driver || !catalog) fail('ACCEPTED_DEPENDENCIES_REQUIRED');
    const checked = decoder.validateSnapshot(snapshot);
    if (!checked.valid) fail(checked.code);
    checked.attempts.forEach((attempt, index) => {
      if (attempt.attemptId !== `synthetic-C033-attempt-${index + 1}`) fail('COMPLETE_ORIGINAL_ID_ORDER');
    });
    const rows = checked.attempts.map((attempt) => {
      const record = snapshot.history.find((item) => item.attemptId === attempt.attemptId) || snapshot;
      const terminalKnown = attempt.endedAt !== null && record.outcome !== 'unknown';
      const evaluatedAt = attempt.endedAt ?? snapshot.sampledAt;
      const latency = evaluatedAt >= attempt.deadline ? 'FAIL' : attempt.endedAt === null ? 'UNKNOWN' : 'PASS';
      const state = attempt.classification === 'failed' ? 'FAIL' :
        ['observed-local-segment', 'original-budget-exceeded'].includes(attempt.classification) ? 'PASS' : 'UNKNOWN';
      const verdict = latency === 'FAIL' || state === 'FAIL' ? 'FAIL' :
        latency === 'PASS' && state === 'PASS' && terminalKnown ? 'PASS' : 'UNKNOWN';
      return {
        attemptId: attempt.attemptId, verdict, latencyVerdict: latency, stateVerdict: state,
        terminalVerdict: terminalKnown ? 'KNOWN' : 'UNKNOWN', original: attempt.original,
        startedAt: attempt.startedAt, deadline: attempt.deadline, endedAt: attempt.endedAt,
        elapsedMs: attempt.elapsedMs, pausedMs: record.pausedMs,
        budgetMs: attempt.original.budgetMs, strictDeadline: 'endedAt < original deadline; at/above is FAIL',
        classification: attempt.classification, originalOutcome: record.outcome,
        originalCode: record.code, requests: attempt.requests, responses: attempt.responses,
        acknowledgements: record.acknowledgements, observedVersions: attempt.observedVersions,
        reasonCodes: [
          ...(latency === 'FAIL' ? ['ORIGINAL_LATENCY_BUDGET_MISS'] : []),
          ...(state === 'FAIL' ? ['ORIGINAL_FAILED_REPLY'] : []),
          ...(state === 'UNKNOWN' ? ['REQUIRED_STATE_OR_TERMINAL_UNKNOWN'] : []),
          ...(attempt.endedAt === null ? ['END_TIME_NOT_SAVED'] : [])
        ],
        summaryOnly: false, includedInDenominator: true
      };
    });
    return result(rows, 'unbound C033-shaped synthetic inspection; not historical authority or a live journey', {
      denominatorVerified: true, sourceConsistentHistorical: false,
      provenance: { kind: 'unbound-data-only', clock: 'caller data; no observed source authority' },
      events: snapshot.events
    });
  }
  function evaluateSnapshot(snapshot) {
    try {
      if (arguments.length !== 1) fail('NO_EVALUATION_OVERRIDES');
      return assessSnapshot(snapshot);
    } catch (error) { return rejected(error.code || 'EVALUATION_UNAVAILABLE'); }
  }
  function savedEvaluation(id) {
    if (!savedIds.includes(id)) fail('UNKNOWN_SAVED_ID');
    const saved = decoder.getSavedTrace(id);
    const copy = ownData(saved);
    const binding = decoder.inspectCandidate(JSON.stringify(copy), id);
    if (!binding.valid) fail(binding.code);
    const assessed = assessSnapshot(copy.snapshot);
    const rows = ownData(assessed.originals);
    if (id === 'closed-history') {
      if (copy.replacementSummary.originalInterruptedId !== 'synthetic-C033-attempt-6' ||
          copy.replacementSummary.replacementId !== 'synthetic-C033-attempt-7' ||
          copy.replacementSummary.retainedAttempts !== 7) fail('EXACT_REPLACEMENT_SUMMARY');
      rows.push({
        attemptId: copy.replacementSummary.replacementId, verdict: 'UNKNOWN',
        latencyVerdict: 'UNKNOWN', stateVerdict: 'UNKNOWN', terminalVerdict: 'UNKNOWN',
        original: null, startedAt: null, deadline: null, endedAt: null, elapsedMs: null,
        pausedMs: null, budgetMs: null, classification: 'summary-only-unverified',
        requests: null, responses: null, acknowledgements: [], observedVersions: [],
        reasonCodes: ['SUMMARY_ONLY_NO_START_DEADLINE_ORDER_OR_TERMINAL', 'REPLACEMENT_DOES_NOT_REPAIR_ORIGINAL'],
        summaryOnly: true, includedInDenominator: true,
        summaryObservation: copy.replacementSummary
      });
    }
    return result(rows, 'source-pinned historical C033 local two-read latency/state evaluation, not full user journey', {
      savedId: id, denominatorVerified: true, sourceConsistentHistorical: true,
      provenance: copy.source, events: copy.snapshot.events,
      replacementRemainder: copy.replacementSummary,
      replacementScope: id === 'closed-history' ?
        'Saved later started original 7 included as UNKNOWN, not healthy replacement success.' :
        'Later report is not this earlier snapshot. Only its two observed starts enter this snapshot denominator.',
      effectsObservation: 'NOT OBSERVED in these client traces; C023 model is evaluated separately, never joined as actual effects.'
    });
  }
  function evaluateSaved(id) {
    try {
      if (arguments.length !== 1) fail('NO_SAVED_OVERRIDES');
      return savedEvaluation(id);
    } catch (error) { return rejected(error.code || 'SAVED_SOURCE_UNAVAILABLE'); }
  }
  function evaluateCandidate(text, id) {
    try {
      if (arguments.length !== 2) fail('NO_CANDIDATE_OVERRIDES');
      if (!savedIds.includes(id)) fail('UNKNOWN_SAVED_ID');
      const candidate = parseJson(text);
      const binding = decoder.inspectCandidate(JSON.stringify(candidate), id);
      if (!binding.valid) fail(binding.code);
      return savedEvaluation(id);
    } catch (error) {
      const code = error.code || 'CANDIDATE_UNAVAILABLE';
      try {
        const basis = savedEvaluation(id);
        const rows = basis.originals.map((row) => ({
          ...row, verdict: 'UNKNOWN', latencyVerdict: 'UNKNOWN', stateVerdict: 'UNKNOWN',
          terminalVerdict: 'UNKNOWN', reasonCodes: ['REJECTED_COPY_NOT_ADOPTED', code]
        }));
        return result(rows, 'rejected input; denominator retained from selected immutable source, not from supplied copy', {
          valid: false, code, decision: 'HOLD', savedId: id, denominatorVerified: true,
          sourceConsistentHistorical: false, events: [],
          provenance: { kind: 'rejected-copy-not-adopted', knownSource: basis.provenance }
        });
      } catch { return rejected(code); }
    }
  }
  function savedJson(id) {
    if (arguments.length !== 1 || !savedIds.includes(id)) fail('UNKNOWN_SAVED_ID');
    return JSON.stringify(ownData(decoder.getSavedTrace(id)), null, 2);
  }
  async function controls(id) {
    if (!controlIds.includes(id)) fail('UNKNOWN_CONTROL_ID');
    let now = 0;
    let reads = 0;
    const journey = driver.createJourney({
      clock: () => now,
      read: async (request) => {
        reads++;
        const value = providers ? providers[request.implementation === 'v1' ? 'getProfileV1' : 'getProfileV2']({
          profileId: request.profileId
        }) : freeze(ownData({
          apiContract: catalog.apiContract,
          profile: catalog.profiles.find((profile) => profile.id === request.profileId),
          stamp: catalog.stamps[request.implementation]
        }));
        return {
          requestToken: request.requestToken, implementation: request.implementation, status: 200, value,
          headerVersion: value.stamp.implementationVersion, headerDeployment: value.stamp.deploymentStamp
        };
      }
    });
    const config = {
      profileId: 'synthetic-001', draft: 'synthetic-draft-A',
      boundary: id === 'control-held-between' ? 'between-reads' : 'before-first-read',
      budgetMs: driver.budgets[0]
    };
    let before;
    try {
      journey.start(config);
      if (id === 'control-held-between') {
        for (let count = 0; count < 16 && journey.snapshot().phase !== 'paused'; count++) await Promise.resolve();
        if (journey.snapshot().phase !== 'paused' || reads !== 1) fail('CONTROL_BETWEEN_ACK_REQUIRED');
      }
      const delta = id === 'control-below' ? -0.25 : id === 'control-at' ? 0 : 0.25;
      now = config.budgetMs + delta;
      if (['control-held-before', 'control-held-between'].includes(id)) {
        before = journey.snapshot();
        return { before, after: before, reads };
      }
      if (id === 'control-unknown-retry') { now = 20; journey.stop(); }
      else journey.resume();
      await journey.done();
      before = journey.snapshot();
      if (['control-retry', 'control-unknown-retry'].includes(id)) {
        journey.start(config);
        now += 0.25;
        journey.resume();
        await journey.done();
      }
      return { before, after: journey.snapshot(), reads };
    } finally {
      journey.stop();
      await journey.done();
    }
  }
  function controlEvaluation(snapshot, id) {
    const assessed = assessSnapshot(snapshot);
    return result(ownData(assessed.originals), 'closed synthetic C033 driver and C020 reply control; not measured HTTP/browser journey', {
      controlId: id, denominatorVerified: true, sourceConsistentHistorical: false,
      events: snapshot.events,
      provenance: {
        kind: 'closed-synthetic-control-not-historical-observation',
        clock: 'explicit synthetic monotonic clock, not performance.now or a retry replacement clock for an original',
        actualContractBudgetMs: driver.budgets[0], boundaryStepMs: 0.25,
        replies: 'unchanged C020 providers in Node; bundled immutable C020 catalog in browser. No HTTP.',
        actualHttpRequests: 0
      }
    });
  }
  async function evaluateControl(id) {
    try {
      if (arguments.length !== 1) fail('NO_CONTROL_OVERRIDES');
      const built = await controls(id);
      return controlEvaluation(built.after, id);
    } catch (error) { return rejected(error.code || 'CONTROL_UNAVAILABLE'); }
  }
  async function compareRetry() {
    try {
      if (arguments.length) fail('NO_RETRY_OVERRIDES');
      const built = await controls('control-retry');
      return freeze({
        schema: 'C029-comparison/1', valid: true,
        trainingBanner: 'Training rehearsal - synthetic data - not a live Azure result',
        provenance: 'closed synthetic control only; NOT a reconstructed retry of historical original 3 or 6',
        before: controlEvaluation(built.before, 'control-above'),
        after: controlEvaluation(built.after, 'control-retry'), ...qualifications
      });
    } catch (error) { return rejected(error.code || 'COMPARISON_UNAVAILABLE'); }
  }
  function evaluateModelSnapshot(input) {
    try {
      if (arguments.length !== 1 || !ledger) fail('NO_MODEL_OVERRIDES');
      const state = ownData(input);
      ledger.inspect(state);
      if (state.journal.length > 16) fail('MODEL_HISTORY_LIMIT_RETAINED');
      let prefix = ledger.create({
        jobId: state.plan.jobId, workVersion: state.plan.workVersion,
        profileId: state.plan.profileId, implementation: state.plan.implementation
      });
      const rows = [];
      for (const record of state.journal) {
        prefix = ledger.apply(prefix, record.command);
        if (record.command.type === 'reconcile') continue;
        const view = ledger.inspect(prefix);
        const attempt = view.attempts.at(-1);
        const unknown = view.pendingUnknown !== null || attempt.outcome === 'unknown';
        const complete = attempt.outcome === 'complete' && view.checkpointNext === state.plan.effects.length &&
          view.counters.committedEffects === state.plan.effects.length &&
          view.counters.effectApplications === state.plan.effects.length && !unknown;
        const stateVerdict = unknown ? 'UNKNOWN' : complete ? 'PASS' : 'FAIL';
        rows.push({
          attemptId: attempt.id, verdict: stateVerdict === 'FAIL' ? 'FAIL' : 'UNKNOWN',
          stateVerdict, latencyVerdict: 'UNKNOWN', terminalVerdict: unknown ? 'UNKNOWN' : 'KNOWN',
          originalOutcome: attempt.outcome, modelOriginal: attempt,
          startedAt: null, deadline: null, endedAt: null, elapsedMs: null, pausedMs: null, budgetMs: null,
          expectedState: { effectKeys: state.plan.effects.map((effect) => effect.key), knownApplications: 3, checkpointNext: 3 },
          modelStateAtOriginalTerminal: view, summaryOnly: false, includedInDenominator: true,
          reasonCodes: ['PURE_MODEL_HAS_NO_LATENCY_OBSERVATION',
            ...(stateVerdict === 'FAIL' ? ['ORIGINAL_MODEL_STATE_BUDGET_UNMET'] : []),
            ...(stateVerdict === 'UNKNOWN' ? ['ORIGINAL_UNKNOWN_NOT_REPAIRED_BY_HYPOTHETICAL_RECONCILIATION'] : [])]
        });
      }
      return result(rows, 'C023 PURE event-log state-budget MODEL only; no latency, durable store, queue or actual external effect', {
        denominatorVerified: true, sourceConsistentHistorical: false,
        provenance: {
          kind: 'closed-synthetic-C023-event-log-model',
          atomicPairAssumption: ledger.contract.atomicity,
          reconciliation: 'hypothetical synthetic choice, not external query/receipt',
          clientAssociation: 'none; never joined to historical browser attempts'
        },
        modelCurrent: ledger.inspect(state), modelPlan: state.plan, modelJournal: state.journal,
        modelStatePassMeans: 'MODEL STATE ONLY; original overall UNKNOWN/HOLD without required latency observations'
      });
    } catch (error) { return rejected(error.code || 'MODEL_UNAVAILABLE', 'rejected pure model snapshot'); }
  }
  function evaluateModel(id) {
    try {
      if (arguments.length !== 1 || !modelIds.includes(id)) fail('UNKNOWN_MODEL_ID');
      let state = ledger.create({
        jobId: 'job-c029-model', workVersion: ledger.contract.workVersion,
        profileId: 'synthetic-001', implementation: 'v1'
      });
      state = ledger.apply(state, {
        type: 'run', interruption: id === 'model-clean' ? 'none' : id === 'model-resume' ? 'after-commit' : 'unknown-ack',
        effectIndex: id === 'model-clean' ? null : 0
      });
      if (id === 'model-resume') state = ledger.apply(state, { type: 'resume', interruption: 'none', effectIndex: null });
      if (id === 'model-reconcile') {
        state = ledger.apply(state, { type: 'reconcile', effectKey: state.plan.effects[0].key, observation: 'observed-committed' });
        state = ledger.apply(state, { type: 'resume', interruption: 'none', effectIndex: null });
      }
      return evaluateModelSnapshot(state);
    } catch (error) { return rejected(error.code || 'MODEL_UNAVAILABLE'); }
  }
  return Object.freeze({
    MAX_BYTES, savedIds, controlIds, modelIds, parseJson,
    evaluateSnapshot, evaluateSaved, evaluateCandidate, savedJson,
    evaluateControl, compareRetry, evaluateModel, evaluateModelSnapshot
  });
}));
