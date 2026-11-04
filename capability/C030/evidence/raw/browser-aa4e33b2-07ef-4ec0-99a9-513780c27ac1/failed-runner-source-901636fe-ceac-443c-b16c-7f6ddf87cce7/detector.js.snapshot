(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('..\\C023\\ledger.js'), require('..\\C029\\evaluator.js'));
  } else {
    Object.defineProperty(root, 'C030EffectDetector', { value: factory(root.C023Ledger, root.C029Evaluator) });
  }
}(globalThis, function (ledger, evaluator) {
  'use strict';

  const banner = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_BYTES = 131072;
  const MAX_ORIGINALS = 16;
  const MAX_OBSERVATIONS = 128;
  const modelIds = Object.freeze(['model-clean', 'model-resume', 'model-incomplete', 'model-before-checkpoint',
    'model-checkpoint', 'model-unknown', 'model-reconciled', 'model-absent-retry']);
  const historyIds = Object.freeze(['history-closed', 'history-held']);
  const fictionIds = Object.freeze(['control-one', 'control-deliveries-only', 'control-retry',
    'control-missing-observation', 'control-absence', 'control-absence-retry', 'control-duplicate-application',
    'control-duplicate-retry', 'control-repeated-receipt', 'control-unknown-retry', 'control-unsupported']);
  const sourceIds = Object.freeze([...modelIds, ...historyIds, ...fictionIds]);
  const qualifications = Object.freeze({
    eligibleForLiveRun: false, actualExternalEffectsObserved: false, durableQueueOrDatabase: false,
    externalExactlyOnce: false, actualClientEffectAssociation: false, nativeProof: false,
    userJourneySuccess: false, productionNode24Validated: false, approvalAdopted: false
  });
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function data(input) {
    let remaining = 24000;
    const ancestors = new Set();
    function copy(value, depth) {
      if (--remaining < 0 || depth > 18) fail('BOUNDED_OWN_JSON');
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'string' && value.length <= MAX_BYTES) return value;
      if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER &&
          !Object.is(value, -0)) return value;
      if (!value || typeof value !== 'object' || ancestors.has(value)) fail('FINITE_OWN_JSON');
      const array = Array.isArray(value);
      if (array ? Object.getPrototypeOf(value) !== Array.prototype :
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('OWN_JSON_PROTOTYPE');
      const fields = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(fields);
      if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(fields[key], 'value'))) fail('OWN_DATA_FIELDS');
      ancestors.add(value);
      let result;
      if (array) {
        if (value.length > 2048 || keys.length !== value.length + 1 ||
            Array.from({ length: value.length }, (_, i) => String(i)).some((key) => !fields[key]?.enumerable)) fail('DENSE_BOUNDED_ARRAY');
        result = Array.from({ length: value.length }, (_, i) => copy(fields[i].value, depth + 1));
      } else {
        if (keys.length > 64 || keys.some((key) => !fields[key].enumerable ||
            ['__proto__', 'constructor', 'prototype'].includes(key))) fail('OWN_DATA_FIELDS');
        result = {};
        for (const key of keys) result[key] = copy(fields[key].value, depth + 1);
      }
      ancestors.delete(value);
      return result;
    }
    const result = copy(input, 0);
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES) fail('JSON_OVERSIZE');
    return result;
  }
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }
  function shape(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('EXACT_FIELDS_REQUIRED');
  }
  function array(value, limit = MAX_OBSERVATIONS) {
    if (!Array.isArray(value) || value.length > limit) fail('OBSERVATION_BOUND');
  }
  function requireDependencies() {
    if (!ledger || !evaluator || !Object.isFrozen(ledger) || !Object.isFrozen(evaluator)) fail('ACCEPTED_DEPENDENCIES_REQUIRED');
  }
  function expectedPlan(plan) {
    requireDependencies();
    if (!plan || typeof plan !== 'object') fail('COMPLETE_PLAN_REQUIRED');
    const expected = ledger.create({
      jobId: plan.jobId, workVersion: plan.workVersion, profileId: plan.profileId, implementation: plan.implementation
    }).plan;
    if (canonical(plan) !== canonical(expected)) fail('COMPLETE_PLAN_IDENTITY_MISMATCH');
    return expected;
  }
  function result(rows, scope, extra = {}) {
    const counts = {
      originals: rows.length, pass: rows.filter((row) => row.verdict === 'PASS').length,
      fail: rows.filter((row) => row.verdict === 'FAIL').length,
      unknown: rows.filter((row) => row.verdict === 'UNKNOWN').length,
      unsupported: rows.filter((row) => row.verdict === 'UNSUPPORTED').length
    };
    const decision = counts.fail ? 'FAIL' : !rows.length || counts.unknown ? 'HOLD' :
      counts.unsupported ? (counts.unsupported === rows.length ? 'UNSUPPORTED' : 'HOLD') : 'PASS';
    return freeze({
      schema: 'C030-detection/1', cardId: 'C030', trainingBanner: banner, valid: true, code: null,
      decision, evaluationScope: scope, counts, originals: rows,
      currentCounts: rows.at(-1)?.effectCounts || null,
      successFraction: { numerator: counts.pass, denominator: rows.length,
        meaning: 'Per-original scoped effect observations only, never availability or completed user journeys.' },
      countRule: 'Each original is retained. Per-original effect counts are cumulative at that terminal; do not sum them.',
      ...extra, ...qualifications
    });
  }
  function emptyCounts() {
    return {
      intendedEffects: null, confirmedApplications: null, hypotheticalApplications: null, modeledApplications: null,
      confirmedEffectKeys: null, duplicateApplicationKeys: null, extraApplications: null, confirmedAbsences: null,
      missingObservations: null, unknownAcknowledgements: null, deliveryAttempts: null, repeatedDeliveries: null,
      repeatedApplicationObservations: null, repeatedDeliveryObservations: null, checkpointPosition: null, checkpointRecords: null
    };
  }
  function rejected(code, basis) {
    return result((basis?.originals || []).map((row) => ({
      originalId: row.originalId, verdict: 'UNKNOWN', includedInDenominator: true,
      reasonCodes: ['REJECTED_COPY_NOT_ADOPTED', code], effects: [], effectCounts: emptyCounts(),
      originalSourceVerdict: row.verdict
    })), 'Rejected inspection; no input is adopted, no source is changed.', {
      valid: false, code, decision: 'HOLD', sourceId: basis?.sourceId || null,
      denominatorVerified: Boolean(basis), sourceBinding: 'rejected-copy-not-adopted',
      retainedImmutableSourceCounts: basis?.counts || null
    });
  }
  function uniqueObservations(observations, kind, keys) {
    array(observations);
    const seen = new Map();
    for (const observation of observations) {
      shape(observation, ['id', 'effectKey']);
      if (typeof observation.id !== 'string' || !new RegExp(`^${kind}-[0-9]{3}$`).test(observation.id) ||
          !keys.includes(observation.effectKey)) fail('OBSERVATION_IDENTITY_MISMATCH');
      if (seen.has(observation.id) && seen.get(observation.id).effectKey !== observation.effectKey) fail('RECEIPT_ID_COLLISION');
      seen.set(observation.id, observation);
    }
    return { observations: [...seen.values()], repeated: observations.length - seen.size };
  }
  function keySet(value, keys) {
    array(value, 3);
    if (value.some((key) => !keys.includes(key)) || new Set(value).size !== value.length) fail('EXACT_EFFECT_KEYS_REQUIRED');
    return value;
  }
  function assess(plan, original, persistentUnknown, extras = {}) {
    const keys = plan.effects.map((effect) => effect.key);
    const applications = uniqueObservations(original.applications, 'application', keys);
    const deliveries = uniqueObservations(original.deliveries, 'delivery', keys);
    const absences = keySet(original.absences, keys);
    const unknown = keySet(original.unknownAcks, keys);
    unknown.forEach((key) => persistentUnknown.add(key));
    if (absences.some((key) => applications.observations.some((receipt) => receipt.effectKey === key))) fail('CONTRADICTORY_OBSERVATION');
    if (original.closure !== 'closed' && original.closure !== 'open') fail('OBSERVATION_CLOSURE_REQUIRED');
    if (original.support !== 'supported' && original.support !== 'unsupported') fail('EXPLICIT_SUPPORT_REQUIRED');
    if (original.support === 'unsupported' && (applications.observations.length || deliveries.observations.length ||
        absences.length || unknown.length || original.checkpoints.length)) fail('UNSUPPORTED_CANNOT_CLAIM_RECEIPTS');
    array(original.checkpoints, 3);
    original.checkpoints.forEach((checkpoint, index) => {
      shape(checkpoint, ['nextIndex', 'afterEffectKey']);
      if (checkpoint.nextIndex !== index + 1 || checkpoint.afterEffectKey !== keys[index]) fail('CHECKPOINT_IDENTITY_MISMATCH');
    });
    const effects = plan.effects.map((effect) => {
      const applied = applications.observations.filter((receipt) => receipt.effectKey === effect.key);
      const attempted = deliveries.observations.filter((receipt) => receipt.effectKey === effect.key);
      const ambiguous = persistentUnknown.has(effect.key);
      const status = original.support === 'unsupported' ? 'UNSUPPORTED' : applied.length > 1 ? 'DUPLICATE_APPLICATION' :
        ambiguous ? 'UNKNOWN_ACK' : absences.includes(effect.key) ? 'CONFIRMED_ABSENCE' :
          applied.length === 0 ? 'MISSING_OBSERVATION' : 'ONE_APPLICATION';
      return {
        index: effect.index, effectKey: effect.key, kind: effect.kind, intendedApplications: 1,
        confirmedApplicationsLowerBound: applied.length,
        confirmedApplicationsUpperBound: ambiguous || (!applied.length && !absences.includes(effect.key)) ||
          original.closure !== 'closed' || original.support === 'unsupported' ? null : applied.length,
        deliveryAttempts: attempted.length, status, applicationIds: applied.map((item) => item.id),
        deliveryIds: attempted.map((item) => item.id)
      };
    });
    const violation = effects.some((effect) => ['DUPLICATE_APPLICATION', 'CONFIRMED_ABSENCE'].includes(effect.status));
    const unsupported = original.support === 'unsupported';
    const complete = effects.every((effect) => effect.status === 'ONE_APPLICATION' &&
      effect.confirmedApplicationsUpperBound === 1);
    const verdict = unsupported ? 'UNSUPPORTED' : violation ? 'FAIL' : complete ? 'PASS' : 'UNKNOWN';
    return {
      originalId: original.id, verdict, includedInDenominator: true,
      reasonCodes: [...new Set(effects.filter((effect) => effect.status !== 'ONE_APPLICATION').map((effect) => effect.status)),
        ...(original.closure !== 'closed' ? ['OPEN_OBSERVATION_NOT_EXACT_COUNT'] : [])],
      effects, effectCounts: {
        intendedEffects: keys.length, confirmedApplications: applications.observations.length,
        hypotheticalApplications: 0, modeledApplications: null,
        confirmedEffectKeys: effects.filter((effect) => effect.confirmedApplicationsLowerBound > 0).length,
        duplicateApplicationKeys: effects.filter((effect) => effect.status === 'DUPLICATE_APPLICATION').length,
        extraApplications: effects.reduce((sum, effect) => sum + Math.max(0, effect.confirmedApplicationsLowerBound - 1), 0),
        confirmedAbsences: effects.filter((effect) => effect.status === 'CONFIRMED_ABSENCE').length,
        missingObservations: effects.filter((effect) => effect.status === 'MISSING_OBSERVATION').length,
        unknownAcknowledgements: persistentUnknown.size, deliveryAttempts: deliveries.observations.length,
        repeatedDeliveries: effects.reduce((sum, effect) => sum + Math.max(0, effect.deliveryAttempts - 1), 0),
        repeatedApplicationObservations: applications.repeated, repeatedDeliveryObservations: deliveries.repeated,
        checkpointPosition: original.checkpoints.at(-1)?.nextIndex || 0, checkpointRecords: original.checkpoints.length,
        ...extras
      }
    };
  }
  function fictionInspection(input, binding = 'unbound-mathematical-observations-only') {
    const candidate = data(input);
    shape(candidate, ['schema', 'plan', 'originals']);
    if (candidate.schema !== 'C030-fictional-observations/1') fail('UNSUPPORTED_OBSERVATION_SCHEMA');
    const plan = expectedPlan(candidate.plan);
    array(candidate.originals, MAX_ORIGINALS);
    if (!candidate.originals.length) fail('ORIGINAL_HISTORY_REQUIRED');
    const unknown = new Set();
    let previous = null;
    const rows = candidate.originals.map((original, index) => {
      shape(original, ['id', 'applications', 'deliveries', 'absences', 'unknownAcks', 'checkpoints', 'closure', 'support']);
      if (original.id !== `original-${String(index + 1).padStart(3, '0')}`) fail('COMPLETE_ORIGINAL_ID_ORDER');
      for (const key of ['applications', 'deliveries', 'checkpoints']) {
        array(original[key]);
        if (previous && canonical(original[key].slice(0, previous[key].length)) !== canonical(previous[key])) fail('ORIGINAL_HISTORY_REWRITE');
      }
      if (previous && original.support !== previous.support) fail('SUPPORT_HISTORY_REWRITE');
      const row = assess(plan, original, unknown);
      previous = original;
      return row;
    });
    return result(rows, 'Explicit fictional/unbound observation arithmetic; NOT C023 source/native/external receipts.', {
      denominatorVerified: true, sourceBinding: binding, expectedPlan: plan,
      applicationScope: 'Confirmed only within the supplied fictional/unbound mathematical observations; no actual business operation.',
      absenceMeaning: 'An explicit fictional absence at this original terminal, not merely a missing receipt.'
    });
  }
  function modelInspection(input, binding = 'unbound-C023-shaped-model-only') {
    requireDependencies();
    const state = data(input);
    ledger.inspect(state);
    const budget = evaluator.evaluateModelSnapshot(state);
    if (!budget.valid) fail(budget.code || 'ACCEPTED_EVALUATOR_REFUSED');
    const plan = expectedPlan(state.plan);
    let prefix = ledger.create({
      jobId: plan.jobId, workVersion: plan.workVersion, profileId: plan.profileId, implementation: plan.implementation
    });
    const unknown = new Set();
    const rows = [];
    function atModelState(snapshot) {
      const view = ledger.inspect(snapshot);
      const events = snapshot.journal.flatMap((record) => record.events);
      const known = view.applications.filter((application) => application.origin === 'local-atomic-pair');
      const original = {
        id: view.attempts.at(-1)?.id || 'no-started-original', closure: 'closed', support: 'supported',
        applications: known.map((application) => ({
          id: `application-${String(application.ordinal).padStart(3, '0')}`, effectKey: application.effectKey
        })),
        deliveries: events.filter((event) => event.type === 'effect-requested').map((event, index) => ({
          id: `delivery-${String(index + 1).padStart(3, '0')}`, effectKey: event.effectKey
        })),
        absences: [], unknownAcks: [...new Set(events.filter((event) =>
          event.type === 'acknowledgment-unknown').map((event) => event.effectKey))],
        checkpoints: view.checkpoints.map((checkpoint) => ({ nextIndex: checkpoint.nextIndex, afterEffectKey: checkpoint.afterEffectKey }))
      };
      const row = assess(plan, original, unknown, {
        hypotheticalApplications: view.applications.length - known.length, modeledApplications: view.applications.length,
        duplicateSuppressions: view.counters.duplicateSuppressions
      });
      return { row, view };
    }
    for (const entry of state.journal) {
      prefix = ledger.apply(prefix, entry.command);
      if (entry.command.type === 'reconcile') continue;
      const { row, view } = atModelState(prefix);
      rows.push({ ...row, originalOutcome: view.attempts.at(-1).outcome,
        sourceBudget: budget.originals[rows.length], observedModelView: view });
    }
    const latest = atModelState(state);
    return result(rows, 'C023 PURE event-log assumption only; not a durable queue/DB or external business application.', {
      denominatorVerified: true, sourceBinding: binding, expectedPlan: plan,
      atomicPairAssumption: ledger.contract.atomicity,
      applicationScope: 'Confirmed modeled local-atomic-pair entries only; hypothetical reconciliation applications are separate.',
      unknownRule: 'Any original unknown acknowledgement stays unknown with a lower bound only, including after hypothetical reconciliation/retry.',
      currentCounts: latest.row.effectCounts, latestWorkEffects: latest.row.effects,
      currentCountsMeaning: 'Latest closed model prefix, including reconciliation commands; these are not additional started originals.',
      currentModelView: ledger.inspect(state), sourceBudgetCounts: budget.counts, sourceBudgetDecision: budget.decision,
      clientAssociation: 'NONE. Never join these modeled effects to actual C033 historical clients.'
    });
  }
  function buildModel(id) {
    let state = ledger.create({
      jobId: 'job-c030-model', workVersion: 'profile-effects/1', profileId: 'synthetic-001', implementation: 'v1'
    });
    const cut = {
      'model-clean': 'none', 'model-resume': 'after-commit', 'model-incomplete': 'before-commit',
      'model-before-checkpoint': 'before-checkpoint', 'model-checkpoint': 'after-checkpoint',
      'model-unknown': 'unknown-ack', 'model-reconciled': 'unknown-ack', 'model-absent-retry': 'unknown-ack'
    }[id];
    if (!cut) fail('UNKNOWN_MODEL_ID');
    state = ledger.apply(state, { type: 'run', interruption: cut, effectIndex: cut === 'none' ? null : 0 });
    if (id === 'model-reconciled' || id === 'model-absent-retry') {
      state = ledger.apply(state, { type: 'reconcile', effectKey: state.plan.effects[0].key,
        observation: id === 'model-reconciled' ? 'observed-committed' : 'observed-absent' });
    }
    if (['model-resume', 'model-reconciled', 'model-absent-retry'].includes(id)) {
      state = ledger.apply(state, { type: 'resume', interruption: 'none', effectIndex: null });
    }
    return state;
  }
  function buildFiction(id) {
    const plan = ledger.create({
      jobId: 'job-c030-fiction', workVersion: 'profile-effects/1', profileId: 'synthetic-002', implementation: 'v2'
    }).plan;
    const keys = plan.effects.map((effect) => effect.key);
    const observations = (kind, effectKeys) => effectKeys.map((effectKey, i) => ({
      id: `${kind}-${String(i + 1).padStart(3, '0')}`, effectKey
    }));
    const full = {
      id: 'original-001', applications: observations('application', keys), deliveries: observations('delivery', keys),
      absences: [], unknownAcks: [], checkpoints: keys.map((afterEffectKey, i) => ({ nextIndex: i + 1, afterEffectKey })),
      closure: 'closed', support: 'supported'
    };
    let first = data(full);
    let second = null;
    if (id === 'control-deliveries-only') { first.applications = []; first.checkpoints = []; first.closure = 'open'; }
    if (['control-missing-observation', 'control-absence', 'control-absence-retry'].includes(id)) {
      first.applications.pop(); first.checkpoints.pop();
      if (id !== 'control-missing-observation') first.absences = [keys[2]];
      if (id === 'control-absence-retry') second = { ...data(full), deliveries: observations('delivery', [...keys, keys[2]]) };
    }
    if (id === 'control-retry' || id === 'control-unknown-retry') {
      first.applications = first.applications.slice(0, id === 'control-retry' ? 1 : 0);
      first.deliveries = first.deliveries.slice(0, 1); first.checkpoints = []; first.closure = 'open';
      if (id === 'control-unknown-retry') first.unknownAcks = [keys[0]];
      second = { ...data(full), deliveries: observations('delivery', [keys[0], ...keys]) };
    }
    if (id === 'control-duplicate-application' || id === 'control-duplicate-retry') {
      first.applications = observations('application', [...keys, keys[0]]);
      first.deliveries = observations('delivery', [...keys, keys[0]]);
      if (id === 'control-duplicate-retry') second = {
        ...data(first), deliveries: observations('delivery', [...keys, keys[0], keys[0]])
      };
    }
    if (id === 'control-repeated-receipt') first.applications.push(data(first.applications[0]));
    if (id === 'control-unsupported') first = {
      ...first, applications: [], deliveries: [], checkpoints: [], closure: 'open', support: 'unsupported'
    };
    if (!fictionIds.includes(id)) fail('UNKNOWN_CONTROL_ID');
    if (second) second.id = 'original-002';
    return { schema: 'C030-fictional-observations/1', plan, originals: second ? [first, second] : [first] };
  }
  function source(id) {
    requireDependencies();
    if (!sourceIds.includes(id)) fail('UNKNOWN_SOURCE_ID');
    if (modelIds.includes(id)) return freeze({ id, kind: 'C023-pure-model', payload: buildModel(id) });
    if (fictionIds.includes(id)) return freeze({ id, kind: 'closed-fictional-unbound-observations', payload: buildFiction(id) });
    return freeze({ id, kind: 'C029-historical-client-evaluation', payload: evaluator.savedJson(id === 'history-closed' ? 'closed-history' : 'held-snapshot') });
  }
  function inspectInternal(id) {
    const selected = source(id);
    if (selected.kind === 'C023-pure-model') return freeze({ ...modelInspection(selected.payload, 'closed-C023-command-model'), sourceId: id });
    if (selected.kind === 'closed-fictional-unbound-observations') {
      return freeze({ ...fictionInspection(selected.payload, 'closed-fictional-control-not-source-receipts'), sourceId: id });
    }
    const upstream = evaluator.evaluateSaved(id === 'history-closed' ? 'closed-history' : 'held-snapshot');
    if (!upstream.valid) fail(upstream.code || 'ACCEPTED_HISTORY_UNAVAILABLE');
    return result(upstream.originals.map((original) => ({
      originalId: original.attemptId, verdict: 'UNKNOWN', includedInDenominator: true,
      reasonCodes: ['NO_ACTUAL_EFFECT_RECEIPTS_OR_ASSOCIATION'], effects: [], effectCounts: emptyCounts(),
      sourceBudget: original
    })), 'Historical C029 client observations only: no actual effect receipts, plan or work/client association.', {
      sourceId: id, denominatorVerified: true, sourceBinding: 'unchanged-accepted-historical-client-evaluation',
      expectedPlan: null, clientAssociation: 'UNOBSERVED; no modeled effects joined to actual clients.',
      sourceBudgetCounts: upstream.counts, sourceBudgetDecision: upstream.decision,
      applicationScope: 'No actual business effect application observation. Client requests are NOT effect deliveries.'
    });
  }
  function inspectSource(id) {
    try { if (arguments.length !== 1) fail('NO_SOURCE_OVERRIDES'); return inspectInternal(id); }
    catch (error) { return rejected(error.code || 'SOURCE_UNAVAILABLE'); }
  }
  function inspectModel(input) {
    try { if (arguments.length !== 1) fail('NO_MODEL_OVERRIDES'); return modelInspection(input); }
    catch (error) { return rejected(error.code || 'MODEL_UNAVAILABLE'); }
  }
  function inspectFiction(input) {
    try { if (arguments.length !== 1) fail('NO_FICTION_OVERRIDES'); return fictionInspection(input); }
    catch (error) { return rejected(error.code || 'OBSERVATION_UNAVAILABLE'); }
  }
  function sourceJson(id) {
    if (arguments.length !== 1) fail('NO_SOURCE_OVERRIDES');
    return JSON.stringify(source(id), null, 2);
  }
  function inspectCandidate(text, id) {
    let basis;
    try {
      if (arguments.length !== 2) fail('NO_CANDIDATE_OVERRIDES');
      basis = inspectInternal(id);
      const candidate = evaluator.parseJson(text);
      if (canonical(candidate) !== canonical(source(id))) fail('SOURCE_COPY_MISMATCH');
      return basis;
    } catch (error) { return rejected(error.code || 'CANDIDATE_UNAVAILABLE', basis); }
  }
  function inspectFictionJson(text) {
    try {
      if (arguments.length !== 1) fail('NO_FICTION_OVERRIDES');
      requireDependencies();
      return fictionInspection(evaluator.parseJson(text));
    } catch (error) { return rejected(error.code || 'JSON_UNAVAILABLE'); }
  }
  function compare(id) {
    try {
      if (arguments.length !== 1 || !['control-retry', 'control-absence-retry', 'control-duplicate-retry',
        'control-unknown-retry', 'model-resume', 'model-reconciled', 'model-absent-retry'].includes(id)) fail('CLOSED_COMPARISON_REQUIRED');
      const after = inspectInternal(id);
      const before = result([data(after.originals[0])], after.evaluationScope, {
        sourceId: id, sourceBinding: after.sourceBinding, denominatorVerified: true
      });
      return freeze({ schema: 'C030-comparison/1', valid: true, trainingBanner: banner, sourceId: id,
        decision: after.decision, before, after, comparisonScope: 'Retained original prefixes, not a reconstruction of actual client effects.', ...qualifications });
    } catch (error) { return rejected(error.code || 'COMPARISON_UNAVAILABLE'); }
  }
  return Object.freeze({
    banner, MAX_BYTES, MAX_ORIGINALS, MAX_OBSERVATIONS, sourceIds, modelIds, historyIds, fictionIds,
    inspectSource, sourceJson, inspectCandidate, inspectModel, inspectFiction, inspectFictionJson, compare
  });
}));
