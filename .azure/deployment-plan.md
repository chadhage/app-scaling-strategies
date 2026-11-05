# Scaling demonstration deployment plan

Status: Validation Blocked - Azure App Service provider quota

## Approved scope

- Implement a phased, multi-platform GitHub Actions demonstration pipeline using Bicep.
- Account for all 150 catalog scenarios without claiming unimplemented scenarios passed.
- Prepare an App Service Linux blue-green demonstration as the first live run.
- Preserve the existing local-only capability approvals and evidence.
- Delete the isolated resource group after every demonstration, including failed runs.

## Azure context

- Recipe: standalone Bicep and Azure CLI, orchestrated by GitHub Actions; no azd.
- Subscription: `474c40eb-d385-40d8-baa2-06883dbdca2d`
- Initial location: `centralus`. The user subsequently authorized North Central
  US or another US region with capacity. No tested region has passed provider
  validation yet; do not activate an alternative based only on quota inventory.
- User-confirmed estimated-spend allowance: USD 10,000 per demonstration.
- This allowance is not an estimate or a real-time billing cap. Use substantially
  smaller bounded configurations, require a reviewed estimate, and fail closed
  when deployment configuration or approval is missing.
- Publishing changes, registering an identity, configuring GitHub protections,
  and executing a live deployment still require separate approval.
- Retail-price discovery on 2026-11-05 lists Central US P1 v3 Linux at
  USD 0.17 per worker-hour. Compute alone is about USD 0.1275 for one worker
  over 45 minutes, or USD 0.255 for two workers. Storage, transactions, egress,
  runner/artifact charges, taxes, and delayed/failed cleanup are additional.
  Recheck prices before execution; no live charge or hard cap is implied.

## Implementation phases

1. Implement the shared catalog, measurable native App Service experiments,
   Bicep infrastructure, OIDC workflow, validation, evidence, and teardown.
2. Extend the same evidence contract to Container Apps revisions, AKS rollouts,
   and supported Functions update mechanisms.
3. Implement stateful n-tier, streaming, data, queue, and ownership experiments.
4. Implement regional/failure-domain experiments and statistically qualified
   repeat/soak campaigns.

The generated coverage report must distinguish runnable experiments, partial
scenario coverage, planned work, and native qualification. A small successful
demonstration is not evidence of five-nines reliability.

## Gates

- [x] Research platform behavior and check regional availability/quota.
- [x] Implement a bounded workload and client-side correctness measurements.
- [x] Compile the application/capacity Bicep and lint workflow orchestration.
- [x] Test safe aborts, transition evidence, recovery, and teardown safeguards.
- [x] Document identity setup, cost review, approval, and execution.
- [ ] Obtain separate approval before identity registration or live deployment.
- [ ] Validate/what-if before provisioning any paid resource.
- [ ] Preserve evidence and verify resource-group deletion after every live run.
- [ ] All validation checks pass
  - [ ] Core validation: CLI, authentication, build, ARM validate, and what-if.
  - [ ] Linting: Bicep compilation and Actions actionlint.
  - [ ] Azure Policy validation for the confirmed subscription and location.
  - [ ] Verify current validation permissions and document future OIDC roles.

## Validation and live evidence

- Central US lists P1v3 Linux and `NODE|24-lts`. Read-only quota discovery found
  P1v3 limit 360 and usage 0; the live workflow re-checks availability and quota.
- All 35 application, archive, contract, cleanup, experiment, platform, and
  workflow checks passed on Windows with Node.js 24.22.2. The earlier Node.js
  22.23.4 tooling checks also passed.
  Real loopback controller tests cover positive handoffs, canary/A-B operation,
  safe readiness abort, recorded latency regression/rollback, native-command
  orchestration, and unknown outcomes on command failure.
- These are local runtime/controller checks, not deployed App Service Linux
  Node.js 24 validation or Azure-native swap/scale evidence.
- All three entrypoint Bicep templates compile; Actions actionlint and scoped
  whitespace checks pass. The coverage report contains exactly 150 scenarios:
  17 partially demonstrated by phase-1 experiments and 133 planned.
- Final validation includes all tests, all entrypoint Bicep templates (including
  the separate, unexecuted OIDC bootstrap), workflow lint, and a non-deploying
  ARM preflight if authorized by current credentials.
- No Azure resource or identity has been created by this work. No GitHub
  variable, environment, workflow publication, or live execution was performed.

## ARM preflight blocker

Non-deploying provider validation was attempted in `centralus`,
`northcentralus`, `eastus2`, and `westus2`. All four returned
`InternalSubscriptionIsOverQuotaForSku`, with effective P1v3 limit 0 and
one worker required for initial provisioning. Central US what-if also failed
on the same gate. Quota inventory and the Microsoft.Web usage endpoint report
P1v3 limit 360 / usage 0 in Central US, so those endpoints alone are not proof
that a deployment can proceed.

The workflow therefore performs ARM validation as well as quota discovery and
what-if before deployment. No SKU or region fallback is silent. Azure quota/
support must reconcile the provider restriction, or a separately validated US
region must be selected. Request capacity for **at least two P1v3 Linux
workers** to include the scale-out experiment.

All four proposed preflight resource groups were confirmed absent through a
read-only Azure query. No provisioning, identity bootstrap, or spending occurred.
Formal validation remains incomplete; the plan is **not Validated**, and the
live workflow must not be dispatched until the blocker is resolved.

## Role assignment verification

Verified statically: workload production, green slot, and router each have a
system-assigned identity with Storage Blob Data Contributor scoped only to
their isolated storage account, matching the application's blob reads/writes.
The separate bootstrap defines conditioned blob-role delegation for the
deployment identity and a management-only cleanup role. Subscription-wide
management permissions require explicit administrator review and a suitable
demonstration subscription; none have been granted.

Policy inventory was retrieved with the authenticated Azure CLI. Three
security/protection initiatives were listed. This is not a complete compliance
claim; successful provider/policy acceptance remains gated on fixing preflight.
