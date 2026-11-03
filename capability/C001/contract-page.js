(async function () {
  'use strict';

  const select = document.getElementById('action');
  const button = document.getElementById('probe');
  const result = document.getElementById('result');
  const integrity = document.getElementById('integrity');
  const snapshot = globalThis.C001ApprovedContract;
  const guard = globalThis.C001ContractGuard;

  function failClosed(message) {
    select.disabled = true;
    button.disabled = true;
    integrity.textContent = `DENIED — ${message}`;
    result.textContent = `DENIED — ${message} Nothing is executed.`;
    result.dataset.allowed = 'false';
    document.getElementById('result-reasons').replaceChildren();
    document.getElementById('decision-json').textContent = JSON.stringify({
      allowed: false,
      executed: false,
      reasons: [{ code: 'SURFACE_UNAVAILABLE', message }]
    }, null, 2);
  }

  if (!snapshot || !guard) {
    failClosed('The approved snapshot or guard is unavailable.');
    return;
  }

  try {
    const validation = await guard.validateApproval(snapshot.approval);
    if (!validation.valid) {
      failClosed(validation.reasons.map((item) => `${item.code}: ${item.message}`).join(' '));
      return;
    }

    const choices = document.getElementById('approved-choices');
    const approval = snapshot.approval;
    const rows = [
      ['Decision owner', approval.decisionOwner],
      ['Approval scope', approval.status],
      ['Approved at (UTC)', approval.approvedAtUtc],
      ['Frontend', approval.frontend],
      ['Production runtime target', approval.runtime],
      ['Framework', approval.framework],
      ['Control-service hosting', approval.hosting],
      ['Authentication', approval.authentication],
      ['Authorization design (not implemented here)', approval.authorization],
      ['Control state', approval.controlStorage.join('; ')],
      ['First planned native provider', approval.firstNativeHost],
      ['Native configuration', approval.firstNativeConfiguration],
      ['Preferred future IaC format', approval.preferredIacFormat],
      ['Local test tooling', approval.testTooling],
      ['Operating mode', approval.operatingEnvelope.mode],
      ['Live Azure execution approved', String(approval.liveAzureExecutionApproved)],
      ['IaC generation approved', String(approval.iacGenerationApproved)],
      ['Scaffold approved', String(approval.scaffoldApproved)],
      ['Deployment approved', String(approval.deploymentApproved)],
      ['Identity registration approved', String(approval.identityRegistrationApproved)],
      ['Expenditure approved', String(approval.expenditureApproved)],
      ['Native target qualified', String(approval.operatingEnvelope.nativeTargetQualified)],
      ['Authority source', `${snapshot.source.path} → ${snapshot.source.selector}`],
      ['Approval source commit', snapshot.source.commit],
      ['Pinned snapshot SHA-256', guard.snapshotSha256]
    ];
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      choices.append(term, description);
    }
    for (const choice of validation.unresolvedNativeChoices) {
      const item = document.createElement('li');
      item.textContent = `${choice}: unapproved`;
      document.getElementById('unresolved-choices').append(item);
    }
    document.getElementById('snapshot-json').textContent = JSON.stringify(snapshot, null, 2);
    integrity.textContent = 'Pinned operator snapshot verified. Design/local approval only; native target unqualified.';
    result.textContent = 'READY — choose an operation to inspect. Nothing is executed.';

    button.addEventListener('click', async () => {
      const restoreFocus = document.activeElement === button;
      button.disabled = true;
      select.disabled = true;
      try {
        const decision = await guard.guardOperation(select.value, snapshot.approval);
        const firstReason = decision.reasons[0];
        result.textContent = `${decision.allowed ? 'ALLOWED' : 'DENIED'} — ${decision.action}. ${firstReason ? `${firstReason.code}: ${firstReason.message}` : 'Read-only local inspection only.'} Nothing is executed.`;
        result.dataset.allowed = String(decision.allowed);
        const reasons = document.getElementById('result-reasons');
        reasons.replaceChildren();
        for (const item of decision.reasons) {
          const entry = document.createElement('li');
          entry.textContent = `${item.code}: ${item.message}${item.path ? ` (${item.path})` : ''}`;
          reasons.append(entry);
        }
        document.getElementById('decision-json').textContent = JSON.stringify(decision, null, 2);
        if (decision.approvalValid) {
          select.disabled = false;
          button.disabled = false;
          if (restoreFocus) button.focus();
        } else {
          failClosed('Snapshot validation failed; all probes are disabled.');
        }
      } catch {
        failClosed('Local validation failed; all probes are disabled.');
      }
    });
    select.disabled = false;
    button.disabled = false;
  } catch {
    failClosed('Snapshot integrity could not be established.');
  }
}());
