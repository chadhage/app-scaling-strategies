(async function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const envelopeInput = byId('envelope-input');
  const limitsInput = byId('limits-input');
  const validateButton = byId('validate');
  const fixtureButton = byId('load-fixture');
  const status = byId('result');
  const snapshot = globalThis.C001ApprovedContract;
  const guard = globalThis.C001ContractGuard;
  const contract = globalThis.C002RunEnvelopeContract;
  const validator = globalThis.C002Validator;
  const fixture = globalThis.C002SyntheticFixture;
  const jsonInput = globalThis.C002JsonInput;
  let generation = 0;
  let busy = false;

  function showResult(decision) {
    const errors = decision.errors;
    byId('error-rows').replaceChildren();
    for (const error of errors) {
      const row = document.createElement('tr');
      for (const value of [error.path, error.code, error.message]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      byId('error-rows').append(row);
    }
    byId('field-errors').hidden = errors.length === 0;
    envelopeInput.setAttribute('aria-invalid', String(errors.some((error) => error.path.startsWith('envelope'))));
    limitsInput.setAttribute('aria-invalid', String(errors.some((error) => error.path.startsWith('limits'))));
    status.dataset.valid = String(decision.valid);
    status.textContent = decision.valid
      ? 'VALID — local envelope compared with explicitly supplied limits. executed=false; liveAzureRuns=0; cloudSpend=0. No run has been executed.'
      : `REJECTED — ${errors.length} explicit field/authority error(s). Nothing is executed.`;
    byId('result-json').textContent = JSON.stringify(decision, null, 2);
  }

  function clearResult(message) {
    generation++;
    byId('error-rows').replaceChildren();
    byId('field-errors').hidden = true;
    envelopeInput.setAttribute('aria-invalid', 'false');
    limitsInput.setAttribute('aria-invalid', 'false');
    delete status.dataset.valid;
    status.textContent = message;
    byId('result-json').textContent = 'No validation result. Nothing has been executed.';
  }

  function failClosed(message) {
    validateButton.disabled = true;
    fixtureButton.disabled = true;
    byId('integrity').textContent = `DENIED — ${message}`;
    showResult({
      valid: false, outcome: 'rejected', executed: false,
      validatedEnvelope: null, appliedLimits: null, authority: null,
      errors: [{ path: 'approval', code: 'SURFACE_UNAVAILABLE', message }]
    });
  }

  if (!snapshot || !guard || !contract || !validator || !fixture || !jsonInput) {
    failClosed('A required C001/C002 dependency is unavailable. Validation remains disabled.');
    return;
  }

  try {
    const integrity = await guard.validateApproval(snapshot.approval);
    if (!integrity.valid) {
      failClosed(integrity.reasons.map((item) => `${item.code}: ${item.message}`).join(' '));
      return;
    }

    const approval = snapshot.approval;
    const rows = [
      ['Decision owner / approval', `${approval.decisionOwner} / ${approval.status}`],
      ['Operating mode', approval.operatingEnvelope.mode],
      ['Maximum live Azure runs', String(approval.operatingEnvelope.maximumLiveAzureRuns)],
      ['Authorized cloud spend', `${approval.operatingEnvelope.authorizedCloudSpend} — expenditure forbidden`],
      ['Live Azure execution approved', String(approval.liveAzureExecutionApproved)],
      ['IaC generation approved', String(approval.iacGenerationApproved)],
      ['Scaffold approved', String(approval.scaffoldApproved)],
      ['Deployment approved', String(approval.deploymentApproved)],
      ['Identity registration approved', String(approval.identityRegistrationApproved)],
      ['Expenditure approved', String(approval.expenditureApproved)],
      ['Production design, not qualification', `${approval.runtime} / ${approval.framework} / ${approval.hosting}`],
      ['C001 pinned SHA-256', guard.snapshotSha256]
    ];
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      byId('authority-summary').append(term, description);
    }
    byId('approval-json').textContent = JSON.stringify(snapshot, null, 2);
    byId('schema-json').textContent = JSON.stringify(contract.schema, null, 2);
    byId('integrity').textContent = 'VERIFIED — C001 pinned bundled snapshot. Design and local implementation only; no native authority.';
    clearResult('READY — explicitly supply envelope and limits JSON. Nothing is executed.');
    validateButton.disabled = false;
    fixtureButton.disabled = false;

    for (const input of [envelopeInput, limitsInput]) {
      input.addEventListener('input', () => clearResult('EDITED — validate the current input. No current validation result; nothing is executed.'));
    }

    fixtureButton.addEventListener('click', () => {
      clearResult('SYNTHETIC FIXTURE LOADED — example comparison limits only, not Azure authorization or universal defaults. Validate explicitly.');
      envelopeInput.value = JSON.stringify(fixture.envelope, null, 2);
      limitsInput.value = JSON.stringify(fixture.limits, null, 2);
      envelopeInput.focus();
    });

    byId('validation-form').addEventListener('reset', () => {
      clearResult('RESET — envelope, limits, result, and errors cleared. No implicit limits; nothing is executed.');
      envelopeInput.value = '';
      limitsInput.value = '';
      envelopeInput.focus();
    });

    byId('validation-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || fixtureButton.disabled) return;
      clearResult('CHECKING — local comparison only. Nothing is executed.');
      const version = generation;
      const request = {};
      const errors = [];
      for (const [path, input] of [['envelope', envelopeInput], ['limits', limitsInput]]) {
        const parsed = jsonInput.parseJsonInput(input.value, path);
        request[path] = parsed.value;
        errors.push(...parsed.errors);
      }
      if (errors.length) {
        showResult({
          valid: false, outcome: 'rejected', executed: false,
          validatedEnvelope: null, appliedLimits: null, authority: null, errors
        });
        (errors[0].path === 'envelope' ? envelopeInput : limitsInput).focus();
        return;
      }
      busy = true;
      validateButton.disabled = true;
      try {
        const decision = await validator.validateRunEnvelope(request, snapshot.approval);
        if (version !== generation) return;
        showResult(decision);
        if (!decision.authority || !decision.authority.approvalValid) {
          failClosed('C001 approval could not be established. Validation remains disabled.');
          return;
        }
        validateButton.disabled = false;
        if (decision.valid) validateButton.focus();
        else if (envelopeInput.getAttribute('aria-invalid') === 'true') envelopeInput.focus();
        else if (limitsInput.getAttribute('aria-invalid') === 'true') limitsInput.focus();
        else status.focus();
      } catch {
        if (version === generation) failClosed('Local validation failed unexpectedly. No operation was executed.');
      } finally {
        busy = false;
        if (version !== generation) validateButton.disabled = fixtureButton.disabled;
      }
    });
  } catch {
    failClosed('C001 snapshot integrity or local initialization could not be established.');
  }
}());
