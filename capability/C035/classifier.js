(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('..\\C029\\evaluator.js'), require('..\\C034\\trace.js'));
  } else Object.defineProperty(root, 'C035Classifier', { value: factory(root.C029Evaluator, root.C034Trace) });
}(globalThis, function (budgets, trace) {
  'use strict';

  const banner = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_BYTES = 131072;
  const MAX_HISTORY = 16;
  const dimensions = Object.freeze(['context', 'schema', 'timing', 'state', 'terminal', 'provenance']);
  const classifications = Object.freeze(['COMPLETED', 'FAILED', 'UNSUPPORTED', 'UNKNOWN', 'CANCELLED', 'INTERRUPTED']);
  const modeledIds = Object.freeze([
    'modeled-complete', 'modeled-unsupported', 'modeled-unknown', 'modeled-interrupted',
    'modeled-cancel-request', 'modeled-cancelled', 'modeled-cancelled-no-effect',
    'modeled-failed-unsupported', 'modeled-failed-unknown', 'modeled-failed-cancel',
    ...dimensions.map((name) => `modeled-missing-${name}`)
  ]);
  const savedIds = Object.freeze(['closed-history', 'held-snapshot']);
  const budgetIds = Object.freeze(['control-below', 'control-at', 'control-above', 'control-retry',
    'control-unknown-retry', 'control-held-before', 'control-held-between']);
  const modelIds = Object.freeze(['model-clean', 'model-resume', 'model-unknown', 'model-reconcile']);
  const ids = Object.freeze([...savedIds, ...budgetIds, ...modelIds, ...modeledIds]);
  const comparisonIds = Object.freeze(['retry', 'cancellation', 'model-reconciliation']);
  const boundaries = Object.freeze({
    actualUserMutationSuccess: false, actualCancellationPerformed: false, actualC015Cancellation: false,
    actualCleanupPerformed: false, externalUndoVerified: false, actualNoEffectsVerified: false,
    authenticatedCurrentAssociation: false, userSuppliedAuthorityAdopted: false,
    eligibleForLiveRun: false, fullJourneyQualified: false, nativeTransportQualified: false,
    productionNode24Validated: false, reliabilityCertified: false
  });
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function ownData(input) {
    const ancestors = new Set();
    let remaining = 24000;
    function copy(value, depth) {
      if (--remaining < 0 || depth > 18) fail('BOUNDED_OWN_JSON_REQUIRED');
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'string' && value.length <= MAX_BYTES) return value;
      if (typeof value === 'number' && Number.isFinite(value) &&
          Math.abs(value) <= Number.MAX_SAFE_INTEGER && !Object.is(value, -0)) return value;
      if (!value || typeof value !== 'object' || ancestors.has(value)) fail('FINITE_OWN_JSON_REQUIRED');
      const array = Array.isArray(value);
      if (array ? Object.getPrototypeOf(value) !== Array.prototype :
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('OWN_DATA_PROTOTYPE');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) fail('OWN_DATA_FIELDS');
      ancestors.add(value);
      let result;
      if (array) {
        if (value.length > 2048 || keys.length !== value.length + 1 ||
            Array.from({ length: value.length }, (_, index) => String(index)).some((key) => !descriptors[key]?.enumerable)) {
          fail('DENSE_BOUNDED_ARRAY_REQUIRED');
        }
        result = Array.from({ length: value.length }, (_, index) => copy(descriptors[index].value, depth + 1));
      } else {
        if (keys.length > 64 || keys.some((key) => !descriptors[key].enumerable ||
            ['__proto__', 'prototype', 'constructor'].includes(key))) fail('OWN_DATA_FIELDS');
        result = {};
        for (const key of keys) result[key] = copy(descriptors[key].value, depth + 1);
      }
      ancestors.delete(value);
      return result;
    }
    const result = copy(input, 0);
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES) fail('JSON_OVERSIZE');
    return result;
  }
  function canonical(value) { return trace.canonical(ownData(value)); }
  function parseJson(text) {
    if (arguments.length !== 1) fail('NO_PARSE_OVERRIDES');
    return freeze(ownData(trace.parseJson(text)));
  }
  function closed(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail('CLOSED_COMMAND_SCHEMA');
  }
  function priority(decisions) {
    return decisions.includes('FAIL') ? 'FAIL' : !decisions.length || decisions.includes('HOLD') ? 'HOLD' : 'PASS';
  }
  function classifyRow(row) {
    const missing = dimensions.filter((name) => row.dimensions[name] === 'UNKNOWN');
    const violated = dimensions.filter((name) => row.dimensions[name] === 'FAIL');
    const decision = violated.length ? 'FAIL' : !missing.length && row.resultType === 'COMPLETED' ? 'PASS' : 'HOLD';
    const classification = violated.length ? 'FAILED' :
      row.resultType === 'COMPLETED' ? decision === 'PASS' ? 'COMPLETED' : 'UNKNOWN' : row.resultType;
    return {
      ...row, classification, decision, missingDimensions: missing, violatedDimensions: violated,
      completedWorkWithinScope: decision === 'PASS',
      includedInOriginalDenominator: true,
      classificationMeaning: decision === 'PASS' ?
        'Only the explicitly named local segment or fictional control; not actual user mutation success.' :
        'Not completed work; a protective classifier/verifier outcome is not mutation success.',
      ...boundaries
    };
  }
  function result(sourceId, rows, scope, provenance, extras = {}) {
    const counts = {
      originals: rows.length, pass: rows.filter((row) => row.decision === 'PASS').length,
      fail: rows.filter((row) => row.decision === 'FAIL').length, hold: rows.filter((row) => row.decision === 'HOLD').length,
      classifications: Object.fromEntries(classifications.map((name) => [name, rows.filter((row) => row.classification === name).length]))
    };
    const dimensionCounts = {
      required: rows.length * dimensions.length,
      byDimension: Object.fromEntries(dimensions.map((name) => [name, {
        pass: rows.filter((row) => row.dimensions[name] === 'PASS').length,
        fail: rows.filter((row) => row.dimensions[name] === 'FAIL').length,
        unknown: rows.filter((row) => row.dimensions[name] === 'UNKNOWN').length
      }]))
    };
    return freeze({
      schema: 'C035-classification/1', cardId: 'C035', trainingBanner: banner,
      valid: true, code: null, sourceId, scope, provenance, decision: priority(rows.map((row) => row.decision)),
      counts, dimensionCounts, originals: rows, denominatorVerified: rows.length > 0,
      successFraction: { numerator: counts.pass, denominator: counts.originals,
        meaning: 'Scoped originals, never healthy HTTP response counts, availability or full journeys.' },
      ...extras, ...boundaries
    });
  }
  function rejected(code, basis = null) {
    if (basis) return freeze({
      ...basis, valid: false, code, copyAccepted: false, candidateAdopted: false,
      decision: basis.counts.fail ? 'FAIL' : 'HOLD',
      protectiveRejection: true, knownOriginalsPreserved: true,
      rejectionMeaning: 'Rejected input is not adopted. Immutable known FAIL/UNKNOWN originals remain unchanged.'
    });
    return result(null, [], 'Rejected input; no verified original denominator or user work result.',
      { kind: 'no-source-adopted' }, {
        valid: false, code, decision: 'HOLD', protectiveRejection: true,
        candidateAdopted: false, denominatorVerified: false, knownOriginalsPreserved: true
      });
  }
  function modeled(id) {
    const context = { runId: 'MODELED-run-not-C015', epoch: 1, action: 'MODELED-work', workSchema: 'MODELED-work/1' };
    const originalId = `MODELED-${id}-original-1`;
    const record = {
      schema: 'C035-MODELED-original/1', sourceId: id, originalId,
      fiction: 'MODELED fictional data, no execution, not a C015 stored record or native cancellation receipt',
      expectedContext: context, observedContext: { ...context },
      expectedSchema: 'MODELED-work/1', observedSchema: 'MODELED-work/1',
      originalTiming: { startedAt: 0, budgetMs: 1000, deadline: 1000 },
      observation: { sampledAt: 250, endedAt: 250 },
      requiredState: { completedUnits: 1 }, observedState: { completedUnits: 1, workStopped: false },
      reportedResultType: 'COMPLETED', cancelRequested: false,
      terminal: { schema: 'MODELED-terminal/1', originalId, context: { ...context },
        resultType: 'COMPLETED', at: 250, provenance: 'MODELED-fictional-terminal-only' },
      noEffectReceipt: null
    };
    let type = 'COMPLETED';
    if (id.includes('unsupported')) type = 'UNSUPPORTED';
    else if (id === 'modeled-interrupted') type = 'INTERRUPTED';
    else if (id.includes('cancelled') || id === 'modeled-failed-cancel') type = 'CANCELLED';
    else if (id.includes('unknown')) type = 'UNKNOWN';
    else if (id === 'modeled-cancel-request') type = 'CANCEL_REQUESTED';
    record.reportedResultType = type;
    record.terminal.resultType = type;
    if (type !== 'COMPLETED') record.observedState = null;
    if (['UNKNOWN', 'CANCEL_REQUESTED'].includes(type)) {
      record.terminal = null;
      record.observation.endedAt = null;
    }
    if (type === 'CANCELLED') record.observedState = { completedUnits: null, workStopped: true };
    record.cancelRequested = ['CANCELLED', 'CANCEL_REQUESTED'].includes(type);
    if (id.startsWith('modeled-failed-')) {
      record.observation = { sampledAt: 1000.25, endedAt: type === 'UNKNOWN' ? null : 1000.25 };
      if (record.terminal) record.terminal.at = 1000.25;
    }
    if (id === 'modeled-cancelled-no-effect') record.noEffectReceipt = {
      originalId, context: { ...context }, effectCount: 0, provenance: 'MODELED-fictional-no-effects-only'
    };
    const missing = id.replace('modeled-missing-', '');
    if (missing === 'context') record.observedContext = null;
    if (missing === 'schema') record.observedSchema = null;
    if (missing === 'timing') record.observation = null;
    if (missing === 'state') record.observedState = null;
    if (missing === 'terminal') record.terminal = null;
    if (missing === 'provenance') record.terminal.provenance = null;
    return freeze(record);
  }
  function assessModeled(record) {
    const contextKnown = record.observedContext !== null && canonical(record.observedContext) === canonical(record.expectedContext);
    const schemaKnown = record.observedSchema !== null && record.observedSchema === record.expectedSchema;
    const time = record.originalTiming;
    const observation = record.observation;
    const timingKnown = observation !== null && time.deadline === time.startedAt + time.budgetMs &&
      observation.sampledAt >= time.startedAt && (observation.endedAt === null ||
        observation.endedAt >= time.startedAt && observation.endedAt <= observation.sampledAt);
    const timing = !timingKnown ? 'UNKNOWN' :
      (observation.endedAt ?? observation.sampledAt) >= time.deadline ? 'FAIL' :
        observation.endedAt === null ? 'UNKNOWN' : 'PASS';
    const terminal = record.terminal;
    const provenanceKnown = terminal !== null && terminal.provenance === 'MODELED-fictional-terminal-only';
    const terminalKnown = contextKnown && schemaKnown && timingKnown && provenanceKnown &&
      terminal.schema === 'MODELED-terminal/1' && terminal.originalId === record.originalId &&
      canonical(terminal.context) === canonical(record.expectedContext) &&
      terminal.resultType === record.reportedResultType && terminal.at === observation.endedAt &&
      ['COMPLETED', 'FAILED', 'UNSUPPORTED', 'CANCELLED', 'INTERRUPTED'].includes(terminal.resultType);
    const state = record.observedState?.completedUnits;
    const stateVerdict = state === null || state === undefined ? 'UNKNOWN' :
      state === record.requiredState.completedUnits ? 'PASS' : 'FAIL';
    const type = terminalKnown ? terminal.resultType : 'UNKNOWN';
    const noEffects = record.noEffectReceipt !== null &&
      record.noEffectReceipt.originalId === record.originalId &&
      canonical(record.noEffectReceipt.context) === canonical(record.expectedContext) &&
      record.noEffectReceipt.effectCount === 0 &&
      record.noEffectReceipt.provenance === 'MODELED-fictional-no-effects-only';
    const row = classifyRow({
      originalId: record.originalId, sourceOriginalId: record.originalId,
      sourceKind: 'MODELED-fictional-control', resultType: type, reportedResultType: record.reportedResultType,
      dimensions: {
        context: contextKnown ? 'PASS' : 'UNKNOWN', schema: schemaKnown ? 'PASS' : 'UNKNOWN',
        timing, state: stateVerdict, terminal: terminalKnown ? 'PASS' : 'UNKNOWN',
        provenance: provenanceKnown ? 'PASS' : 'UNKNOWN'
      },
      originalContext: record.expectedContext, startedAt: time.startedAt, originalDeadline: time.deadline,
      originalBudgetMs: time.budgetMs, endedAt: observation?.endedAt ?? null,
      sampledAt: observation?.sampledAt ?? null, originalState: record.observedState,
      terminalEvidence: terminal, cancelRequestObserved: record.cancelRequested,
      cancellationEvidence: type === 'CANCELLED' ? 'MODELED_MATCHING_TERMINAL_ACK_ONLY' :
        record.cancelRequested ? 'UNKNOWN_REQUIRED_CANCEL_TERMINAL_ACK_ABSENT' : 'NOT_OBSERVED',
      cancelledWork: type === 'CANCELLED' ? 'MODELED_ONLY' : 'NOT_VERIFIED',
      noEffectsEvidence: noEffects ? 'MODELED_ZERO_EFFECT_RECEIPT_ONLY' : 'UNKNOWN',
      externalUndoEvidence: 'UNSUPPORTED_NOT_IMPLEMENTED_OR_OBSERVED',
      cleanupEvidence: 'NOT_OBSERVED',
      reasonCodes: [
        'MODELED_FICTION_NOT_ACTUAL_C015_OR_NATIVE_WORK',
        ...(record.cancelRequested && type !== 'CANCELLED' ? ['CANCEL_TERMINAL_ACK_REQUIRED'] : []),
        ...(type === 'CANCELLED' ? ['CANCELLED_WORK_IS_NOT_COMPLETED_WORK', 'CANCELLATION_DOES_NOT_PROVE_NO_EFFECT_OR_EXTERNAL_UNDO'] : []),
        ...(type === 'UNSUPPORTED' ? ['UNSUPPORTED_CANNOT_CERTIFY_WORK_SUCCESS'] : []),
        ...(timing === 'FAIL' ? ['ORIGINAL_LATENCY_BUDGET_MISS'] : [])
      ]
    });
    return result(record.sourceId, [row],
      'MODELED fictional classifier control, no work executed, not actual C015 stored/native cancellation.',
      { kind: 'MODELED-fictional-control', actualExecution: false, originalSource: record.sourceId });
  }
  function assessBudget(id, evaluated) {
    if (!evaluated || evaluated.valid !== true || evaluated.schema !== 'C029-evaluation/1' ||
        evaluated.cardId !== 'C029' || evaluated.counts.originals !== evaluated.originals.length ||
        ['userJourneySuccess', 'eligibleForLiveRun', 'actualClientMutation', 'fullJourneyQualified']
          .some((key) => evaluated[key] !== false)) fail('UNCHANGED_C029_EVALUATION_REQUIRED');
    const model = modelIds.includes(id);
    const rows = evaluated.originals.map((original) => {
      if (!['PASS', 'FAIL', 'UNKNOWN'].includes(original.stateVerdict) ||
          !['PASS', 'FAIL', 'UNKNOWN'].includes(original.latencyVerdict) ||
          !['KNOWN', 'UNKNOWN'].includes(original.terminalVerdict)) fail('C029_TYPED_DIMENSION_REQUIRED');
      const summary = original.summaryOnly === true;
      const contextKnown = !summary && (model ? original.modelOriginal !== undefined : original.original !== null);
      const terminalKnown = !summary && original.terminalVerdict === 'KNOWN';
      const interrupted = original.originalOutcome === 'interrupted' ||
        ['INTERRUPTED_BY_STOP', 'INTERRUPTED_BY_RESET'].includes(original.originalCode);
      const type = interrupted ? 'INTERRUPTED' : original.originalOutcome === 'failed' ? 'FAILED' :
        terminalKnown && original.stateVerdict === 'PASS' ? 'COMPLETED' : 'UNKNOWN';
      return classifyRow({
        originalId: original.attemptId, sourceOriginalId: original.attemptId,
        sourceKind: model ? 'C023-mathematical-event-log-model' :
          savedIds.includes(id) ? 'source-pinned-HISTORICAL-C033-local-segment' : 'C029-synthetic-clock-control',
        resultType: type, reportedResultType: original.classification ?? original.originalOutcome ?? null,
        dimensions: {
          context: contextKnown ? 'PASS' : 'UNKNOWN', schema: summary ? 'UNKNOWN' : 'PASS',
          timing: original.latencyVerdict, state: original.stateVerdict,
          terminal: terminalKnown ? 'PASS' : 'UNKNOWN', provenance: summary ? 'UNKNOWN' : 'PASS'
        },
        originalContext: original.original ?? (model ? evaluated.modelPlan : null),
        startedAt: original.startedAt, originalDeadline: original.deadline,
        originalBudgetMs: original.budgetMs, endedAt: original.endedAt,
        elapsedMs: original.elapsedMs, originalState: model ? original.modelStateAtOriginalTerminal : {
          stateVerdict: original.stateVerdict, observedVersions: original.observedVersions,
          acknowledgements: original.acknowledgements
        },
        terminalEvidence: {
          source: model ? 'MODELED event-log original prefix only' : summary ? 'summary only, terminal absent' : 'unchanged C029 original source record',
          originalOutcome: original.originalOutcome ?? null, originalCode: original.originalCode ?? null,
          terminalVerdict: original.terminalVerdict
        },
        cancelRequestObserved: false, cancellationEvidence: 'NOT_OBSERVED_NO_C015_CANCEL_RECORD',
        cancelledWork: 'NOT_VERIFIED', noEffectsEvidence: 'UNKNOWN',
        externalUndoEvidence: 'UNSUPPORTED_NOT_IMPLEMENTED_OR_OBSERVED', cleanupEvidence: 'NOT_OBSERVED',
        reasonCodes: [...original.reasonCodes,
          ...(interrupted ? ['EXPLICIT_INTERRUPTION_NOT_CANCELLATION_OR_UNDO'] : []),
          ...(model ? ['MATHEMATICAL_MODEL_NOT_ACTUAL_CLIENT_OR_EFFECT'] : []),
          'NO_AUTHENTICATED_CURRENT_C015_ASSOCIATION']
      });
    });
    return result(id, rows, evaluated.evaluationScope, {
      source: evaluated.provenance, sourceConsistentHistorical: evaluated.sourceConsistentHistorical,
      currentC015Association: 'NONE; separately reading C015 is not authenticated linkage to these originals',
      terminalBinding: 'Only source-local originals and C029-verified ordering, timing and state; absent dimensions remain UNKNOWN'
    }, { budgetEvaluationDecision: evaluated.decision, originalC029Counts: evaluated.counts });
  }
  async function source(id) {
    if (typeof id !== 'string' || !ids.includes(id)) fail('UNKNOWN_SOURCE_ID');
    if (modeledIds.includes(id)) {
      const evidence = modeled(id);
      return { evidence, assessed: assessModeled(evidence) };
    }
    const evaluated = savedIds.includes(id) ? budgets.evaluateSaved(id) :
      modelIds.includes(id) ? budgets.evaluateModel(id) : await budgets.evaluateControl(id);
    return {
      evidence: savedIds.includes(id) ? parseJson(budgets.savedJson(id)) : ownData(evaluated),
      assessed: assessBudget(id, evaluated)
    };
  }
  async function inspect(id) {
    try {
      if (arguments.length !== 1) fail('NO_INSPECTION_OVERRIDES');
      return (await source(id)).assessed;
    } catch (error) { return rejected(error.code || 'SOURCE_UNAVAILABLE'); }
  }
  async function sourceJson(id) {
    if (arguments.length !== 1) fail('NO_COPY_OVERRIDES');
    const original = await source(id);
    return JSON.stringify({ schema: 'C035-source-copy/1', sourceId: id, evidence: original.evidence }, null, 2);
  }
  async function inspectCopy(text, id) {
    let basis;
    try {
      if (arguments.length !== 2) fail('NO_COPY_INSPECTION_OVERRIDES');
      const original = await source(id);
      basis = original.assessed;
      const candidate = parseJson(text);
      const expected = { schema: 'C035-source-copy/1', sourceId: id, evidence: original.evidence };
      if (canonical(candidate) !== canonical(expected)) fail('TAMPERED_OR_FORGED_SOURCE_COPY');
      return freeze({ ...basis, copyAccepted: true, candidateAdopted: false,
        copyMeaning: 'Exact data agreement only. No submitted context, verdict, eligibility or authority is adopted.' });
    } catch (error) { return rejected(error.code || 'COPY_UNAVAILABLE', basis); }
  }
  async function compare(id) {
    try {
      if (arguments.length !== 1 || !comparisonIds.includes(id)) fail('UNKNOWN_COMPARISON_ID');
      const pair = id === 'retry' ? ['control-above', 'control-retry'] :
        id === 'cancellation' ? ['modeled-cancel-request', 'modeled-cancelled'] : ['model-unknown', 'model-reconcile'];
      const before = await inspect(pair[0]);
      const after = await inspect(pair[1]);
      return freeze({
        schema: 'C035-comparison/1', valid: before.valid && after.valid, code: null, trainingBanner: banner,
        comparisonId: id, before, after, decision: priority([before.decision, after.decision]),
        counts: after.counts, dimensionCounts: after.dimensionCounts, originals: after.originals,
        denominatorMeaning: 'After-side originals only; before is not added again. Both sides remain explicit.',
        boundary: id === 'cancellation' ?
          'Independent MODELED fictional controls, not actual cancellation progression or a C015 record. Missing ack stays UNKNOWN; modeled ack is CANCELLED, not completed work.' :
          'Original outcome is retained. A new attempt or hypothetical reconciliation does not repair the original.',
        ...boundaries
      });
    } catch (error) { return rejected(error.code || 'COMPARISON_UNAVAILABLE'); }
  }
  function createSession() {
    if (arguments.length) fail('NO_SESSION_AUTHORITY_OR_HISTORY_IMPORT');
    const history = [];
    let latest = null;
    let overflow = false;
    let busy = false;
    function snapshot() {
      return freeze({
        schema: 'C035-session/1', latest, history: [...history], retainedEntries: history.length,
        maximumEntries: MAX_HISTORY, overflowRefused: overflow,
        retainedDecision: priority(history.map((entry) => entry.result.decision)),
        retentionMeaning: 'Retained inspections/errors, not additional journeys. Reset cannot erase earlier UNKNOWN or FAIL.',
        ...boundaries
      });
    }
    async function apply(input) {
      if (busy) return freeze({ ...snapshot(), error: 'SESSION_BUSY_NO_WORK_MUTATED' });
      busy = true;
      try {
        let command;
        try {
          command = typeof input === 'string' ? parseJson(input) : ownData(input);
          if (command?.type === 'reset') {
            closed(command, ['type']);
            latest = null;
            return freeze({ ...snapshot(), presentationReset: true, storedWorkChanged: false });
          }
          if (history.length >= MAX_HISTORY) {
            overflow = true;
            return freeze({ ...snapshot(), error: 'HISTORY_LIMIT_RETAINED' });
          }
          if (command?.type === 'inspect') { closed(command, ['type', 'id']); latest = await inspect(command.id); }
          else if (command?.type === 'compare') { closed(command, ['type', 'id']); latest = await compare(command.id); }
          else if (command?.type === 'inspect-copy') {
            closed(command, ['type', 'id', 'text']); latest = await inspectCopy(command.text, command.id);
          } else fail('UNKNOWN_COMMAND_TYPE');
        } catch (error) {
          if (history.length >= MAX_HISTORY) {
            overflow = true;
            return freeze({ ...snapshot(), error: 'HISTORY_LIMIT_RETAINED' });
          }
          latest = rejected(error.code || 'INVALID_COMMAND');
        }
        history.push(freeze({
          entry: history.length + 1, operation: command?.type ?? 'rejected-input',
          selectedSource: typeof command?.id === 'string' && ids.includes(command.id) ? command.id : null,
          result: latest
        }));
        return snapshot();
      } finally { busy = false; }
    }
    return Object.freeze({ apply, snapshot });
  }
  return Object.freeze({
    banner, MAX_BYTES, MAX_HISTORY, dimensions, classifications, ids, savedIds, modeledIds,
    comparisonIds, ownData, canonical, parseJson, inspect, sourceJson, inspectCopy, compare, createSession
  });
}));
