'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { guardOperation } = require('..\\C001\\contract-guard.js');
const { closed, canonical, fail } = require('./contract.cjs');

const scopedApproval = Object.freeze({
  credentials: false,
  approvalType: 'explicit-user-local-fixture-only',
  productionNode24Validated: false,
  cloudProvisioning: false,
  realUserData: false,
  plannedAzureTablesArchitectureChanged: false,
  deployment: false,
  approved: true,
  source: 'ask_user approveLocalDurabilityFixture returned literal true',
  scope: 'Local-only filesystem fixture for synthetic run/epoch data and process-restart tests under owned C015 namespace.',
  spend: false,
  approvedAtUtc: '2026-11-04T04:48:26.166152Z',
});

async function evaluateApprovals(current) {
  closed(current, ['C001', 'C015'], 'current approvals');
  if (!current.C001 || current.C001.designAndLocalImplementationApproved !== true) {
    fail('LOCAL_CONSENT_REQUIRED', 'Current C001 local consent must be literal boolean true; missing, false and string true deny.');
  }
  const authority = await guardOperation('local.probe', current.C001);
  if (!authority.allowed) fail('C001_CONSENT_DENIED', 'Current C001 approval differs from accepted consent.', authority.reasons);
  if (!current.C015 || current.C015.approved !== true) {
    fail('SCOPED_C015_APPROVAL_REQUIRED', 'Current scoped C015 approval must be literal boolean true; missing, false and string true deny.');
  }
  closed(current.C015, Object.keys(scopedApproval), 'current approvals.C015');
  if (canonical(current.C015) !== canonical(scopedApproval)) {
    fail('SCOPED_C015_APPROVAL_DRIFT', 'C015 scope changed or an unapproved data/cloud/credential/production authority was supplied.');
  }
  return Object.freeze({ C001: current.C001, C015: current.C015, authority });
}

async function requireCurrentConsent() {
  const result = spawnSync('pwsh.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'consent-current.ps1'),
  ], { encoding: 'utf8', timeout: 45000, maxBuffer: 65536, windowsHide: true });
  if (result.error || result.status !== 0 || result.signal) {
    fail('CURRENT_CONSENT_UNAVAILABLE', 'Cannot establish current mutex-protected C001/C015 consent; no write or fallback.', [
      { code: result.error?.code || 'CONSENT_READER_FAILED' },
    ]);
  }
  let current;
  try { current = JSON.parse(result.stdout); } catch {
    fail('CURRENT_CONSENT_INVALID', 'The mutex-protected current consent response is not readable JSON.');
  }
  return evaluateApprovals(current);
}

module.exports = Object.freeze({ evaluateApprovals, requireCurrentConsent, scopedApproval });
