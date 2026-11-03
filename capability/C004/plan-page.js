(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const model = globalThis.C004PlanModel;
  const fixtures = globalThis.C004Fixtures;
  const parser = globalThis.C002JsonInput;
  const snapshot = globalThis.C001ApprovedContract;
  const guard = globalThis.C001ContractGuard;
  const session = model?.createReviewSession?.();
  let ready = false;
  let viewRevision = 0;
  let currentPlan = null;

  function showErrors(errors) {
    $('error-list').replaceChildren(...errors.map(error => {
      const item = document.createElement('li');
      item.textContent = `${error.path || '$'} — ${error.code}: ${error.message}`;
      return item;
    }));
    $('input-errors').hidden = errors.length === 0;
  }

  function clearConsent() {
    $('acknowledgement').checked = false;
    $('acknowledge').disabled = true;
    $('consent-state').textContent = 'No current acknowledgement.';
    $('consent-json').textContent = 'No consent record.';
  }

  function invalidate(message) {
    viewRevision++;
    session?.invalidate();
    currentPlan = null;
    $('plan-view').hidden = true;
    for (const id of [
      'plan-outcome', 'cost-status', 'cost-amount', 'cost-basis', 'price-source',
      'duration-value', 'duration-basis', 'resources-value', 'resources-basis',
      'load-value', 'capacity-value', 'comparison-label', 'configuration-summary', 'result-json'
    ]) $(id).textContent = '';
    for (const id of ['configuration-constraints', 'matrix-sources', 'blockers']) $(id).replaceChildren();
    $('no-blockers').hidden = true;
    $('acknowledgement').disabled = true;
    clearConsent();
    showErrors([]);
    $('plan-json').setAttribute('aria-invalid', 'false');
    $('envelope-json').setAttribute('aria-invalid', 'false');
    $('review').disabled = !ready;
    $('status').textContent = message;
  }

  function appendList(id, entries) {
    $(id).replaceChildren(...entries.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
  }

  function render(plan) {
    currentPlan = plan;
    $('plan-view').hidden = false;
    $('plan-outcome').textContent = plan.canAcknowledge
      ? 'Ready for local plan acknowledgement only. No cloud execution, role, lease or expenditure approval.'
      : 'BLOCKED — review the reasons below. No acknowledgement or execution is permitted.';
    $('cost-status').textContent = `${plan.cost.status} — ${plan.cost.notice}`;
    $('cost-amount').textContent = plan.cost.totalMinorUnits === null
      ? 'No monetary estimate (null), not zero.'
      : `${plan.cost.totalMinorUnits} minor units (${plan.cost.currency}), as supplied and unverified.`;
    $('cost-basis').textContent = plan.cost.basis;
    $('price-source').textContent = plan.cost.source === null
      ? 'None (null). No pricing lookup or quote.'
      : `${plan.cost.source.reference}; captured ${plan.cost.source.capturedAtUtc}; configuration ${plan.cost.source.configurationId}. Declaration only: not fetched, checked or accepted.`;
    $('duration-value').textContent = `${plan.duration.comparisonSeconds} comparison seconds; explicit inclusive bounds [${plan.duration.suppliedBounds.min}, ${plan.duration.suppliedBounds.max}]. Native elapsed time: unknown (null).`;
    $('duration-basis').textContent = `${plan.duration.basis} ${plan.duration.notice}`;
    $('resources-value').textContent = plan.resources.cloudResourceCount === null
      ? 'Unknown cloud resource count (null). Inventory unverified; none reserved or leased.'
      : `${plan.resources.cloudResourceCount} assumed cloud resources. ${plan.mode === 'local-resource-free' ? 'No cloud execution.' : 'Inventory unverified.'} None reserved or leased.`;
    $('resources-basis').textContent = plan.resources.description;
    const bounds = plan.comparisonLimits;
    $('load-value').textContent = `${plan.load.requestsPerSecond} synthetic requests/second [${bounds.load.requestsPerSecond.min}, ${bounds.load.requestsPerSecond.max}]; ${plan.load.concurrentUsers} synthetic users [${bounds.load.concurrentUsers.min}, ${bounds.load.concurrentUsers.max}]. No load is generated.`;
    $('capacity-value').textContent = `${plan.capacity.units} synthetic units [${bounds.capacity.units.min}, ${bounds.capacity.units.max}], not an Azure SKU or reservation. Cloud-spend comparison bounds [${bounds.budget.cloudSpend.min}, ${bounds.budget.cloudSpend.max}] mean forbidden expenditure, not free resources.`;
    $('comparison-label').textContent = bounds.label;
    $('configuration-summary').textContent = plan.configuration
      ? `${plan.configuration.id}: ${plan.configuration.title}; status ${plan.configuration.status}; documented support ${plan.configuration.documentedSupport}; native qualified ${plan.configuration.qualified}. ${plan.configuration.reason}`
      : 'None (null) — resource-free local data review, not an Azure target.';
    appendList('configuration-constraints', plan.configuration
      ? plan.configuration.constraints.map(item => `${item.text} [${item.sourceIds.join(', ')}]`) : []);
    appendList('matrix-sources', plan.configurationSources.map(source =>
      `${source.id}: ${source.title} — ${source.url} — ${source.verification}; documentation only, not pricing or native evidence.`));
    appendList('blockers', plan.blockers.map(reason => `${reason.code}: ${reason.message}`));
    $('no-blockers').hidden = plan.blockers.length !== 0;
    $('result-json').textContent = JSON.stringify(plan, null, 2);
    $('permissions').textContent = JSON.stringify({
      ...plan.permissions, liveAzureRuns: plan.liveAzureRuns, productionRuntimeValidated: plan.productionRuntimeValidated
    }, null, 2);
    $('acknowledgement').disabled = !plan.canAcknowledge;
    $('status').textContent = plan.canAcknowledge
      ? 'Current local plan reviewed. Explicit local acknowledgement is optional and still unchecked. No execution.'
      : 'Current plan BLOCKED. Missing/unknown pricing and native proposals cannot grant consent. No execution.';
  }

  $('plan-json').addEventListener('input', () => invalidate('Inputs changed: prior plan and consent invalidated. Review both current inputs again.'));
  $('envelope-json').addEventListener('input', () => invalidate('Inputs changed: prior plan and consent invalidated. Review both current inputs again.'));

  function loadExample(example) {
    invalidate('Explicit labelled example loaded; no plan or consent yet. Review both inputs.');
    const { envelopeRequest, ...plan } = example;
    $('plan-json').value = JSON.stringify(plan, null, 2);
    $('envelope-json').value = JSON.stringify(envelopeRequest, null, 2);
    $('plan-json').focus();
  }
  $('load-local').addEventListener('click', () => loadExample(fixtures.local));
  $('load-native').addEventListener('click', () => loadExample(fixtures.native));
  $('reset').addEventListener('click', () => {
    $('plan-json').value = '';
    $('envelope-json').value = '';
    invalidate('Reset complete. Both inputs, plan and consent are cleared. No defaults or execution.');
    $('plan-json').focus();
  });

  $('review').addEventListener('click', async () => {
    invalidate('Reviewing the explicitly supplied data locally. No execution.');
    const startedAtRevision = viewRevision;
    if (!ready) return;
    $('review').disabled = true;
    const details = parser.parseJsonInput($('plan-json').value, 'plan');
    const envelope = parser.parseJsonInput($('envelope-json').value, 'envelopeRequest');
    const errors = [...details.errors, ...envelope.errors];
    if (!details.errors.length && (details.value === null || typeof details.value !== 'object' || Array.isArray(details.value))) {
      errors.push({ path: 'plan', code: 'INVALID_SHAPE', message: 'Plan assumptions must be an explicit JSON record.' });
    } else if (details.value && Object.hasOwn(details.value, 'envelopeRequest')) {
      errors.push({ path: 'plan.envelopeRequest', code: 'SEPARATE_ENVELOPE_REQUIRED', message: 'Supply envelopeRequest only in the separate C002 input; an embedded request is not silently overridden.' });
    }
    let result;
    try {
      result = errors.length ? { valid: false, errors } : await session.review({
        ...details.value, envelopeRequest: envelope.value
      }, snapshot.approval);
    } catch {
      result = { valid: false, errors: [{ path: '$', code: 'REVIEW_UNAVAILABLE', message: 'Review failed explicitly. No prior plan or acknowledgement is restored.' }] };
    }
    if (startedAtRevision !== viewRevision) return;
    $('review').disabled = false;
    if (result.valid) {
      render(result.plan);
    } else {
      showErrors(result.errors);
      $('plan-json').setAttribute('aria-invalid', String(result.errors.some(error => !error.path.startsWith('envelopeRequest'))));
      $('envelope-json').setAttribute('aria-invalid', String(result.errors.some(error => error.path.startsWith('envelopeRequest'))));
      $('status').textContent = 'Plan rejected. Explicit errors are shown; no plan, stale consent or execution.';
      $('input-errors').focus();
    }
  });

  $('acknowledgement').addEventListener('change', () => {
    session.acknowledge(false);
    $('consent-state').textContent = 'No current acknowledgement.';
    $('consent-json').textContent = 'No consent record.';
    $('acknowledge').disabled = !currentPlan?.canAcknowledge || !$('acknowledgement').checked;
  });
  $('acknowledge').addEventListener('click', () => {
    const result = session.acknowledge($('acknowledgement').checked);
    if (result.accepted) {
      $('consent-state').textContent = 'Acknowledged local plan review only. No cloud execution authorized.';
      $('consent-json').textContent = JSON.stringify(result.consent, null, 2);
      $('acknowledge').disabled = true;
    } else {
      showErrors(result.reasons);
      clearConsent();
    }
  });

  async function initialize() {
    if (!session || !fixtures || fixtures.unavailable || !parser?.parseJsonInput || !guard?.validateApproval ||
        !snapshot?.approval || !globalThis.C004Provenance ||
        !globalThis.C002Validator?.validateRunEnvelope || !globalThis.C002RunEnvelopeContract ||
        !globalThis.C002SyntheticFixture || !globalThis.C003Contract?.validateMatrix ||
        !globalThis.C003Matrix) {
      showErrors([{ path: 'dependencies', code: 'DEPENDENCY_UNAVAILABLE', message: 'Required local C001/C002/C003 data or functions are unavailable. Review and acknowledgement remain disabled.' }]);
      return;
    }
    const validation = await guard.validateApproval(snapshot.approval);
    if (!validation.valid) {
      showErrors(validation.reasons);
      $('status').textContent = 'Pinned C001 authority check failed. Review and acknowledgement remain denied.';
      return;
    }
    ready = true;
    $('load-local').disabled = false;
    $('load-native').disabled = false;
    $('review').disabled = false;
    $('provenance').textContent = JSON.stringify(globalThis.C004Provenance, null, 2);
    $('permissions').textContent = JSON.stringify({
      ...Object.fromEntries(globalThis.C003Contract.FLAG_KEYS.map(key => [key, snapshot.approval[key]])),
      liveAzureRuns: 0, productionRuntimeValidated: validation.productionRuntimeValidated
    }, null, 2);
    $('status').textContent = 'Pinned local approval checked. Supply both inputs or explicitly load an example. No current plan or consent.';
  }
  initialize().catch(() => {
    ready = false;
    for (const id of ['load-local', 'load-native', 'review', 'acknowledgement', 'acknowledge']) $(id).disabled = true;
    showErrors([{ path: 'dependencies', code: 'INITIALIZATION_FAILED', message: 'Local dependency or integrity initialization failed. No review or acknowledgement is available.' }]);
  });
}());
