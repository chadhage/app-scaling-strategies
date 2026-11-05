# Native Azure scaling demonstrations

This is **phase 1** of the multi-platform implementation, separate from the
accepted local capability lessons. The executable provider is currently **App
Service Linux code slots only**. All 150 scenarios are included in a generated
coverage report, but most are planned, and implemented scenarios have only
partial, explicitly bounded coverage. No native qualification is inferred.

## What runs

| Experiment | Observable effect | Catalog links (bounded/partial) |
| --- | --- | --- |
| `blue-green` | Warm green, admit an old-blue request, move stable-endpoint traffic, finish that request on blue, and continue shared state on green. | S001, S031, S041, S101, S148 |
| `native-swap` | Prepare both slots, invoke one native swap into production, and verify immutable release identities and crossing journeys. No automatic swap retry. | S002, S122 |
| `canary` | Move 5/25/50/100% stable cohorts only after actual affected journeys pass each stage. | S003, S031, S148 |
| `ab` | Keep stratified 50/50 cohorts stable across repeated operations. This is not complete migration. | S004, S031 |
| `scale` | Change actual P1v3 plan capacity 1 -> 2 -> 1 using Bicep, verify platform instance count and responses from distinct workers, and measure state continuity. | S011, S015 |
| `readiness-abort` | Inject a candidate readiness failure; reject exposure while blue remains usable. Report a safe abort, not a successful migration. | S022, S027, S091 |
| `rollback` | Expose a candidate with successful-but-too-slow responses, retain the interruptions, and restore fresh, verified original-blue routing. | S092, S093, S097 |

`all-implemented` runs each experiment sequentially, with a **separate resource
group and teardown for each**. It does not execute all 150 scenarios.

### Operating envelope and limitations

- Node.js 24 LTS / Express, Linux P1v3, one shared plan, two web apps (router and
  workload), one green slot, and one Standard LRS blob account.
- The router, blue, and green share compute. Slots do not add capacity.
  The scale experiment changes the entire plan, including the router.
- Four-request synthetic HTTP journeys check an original state marker, a
  monotonic step, and one persisted effect despite repeated completion. This is
  not real login, browser rendering, or full n-tier transaction qualification.
- The application uses system-assigned managed identities and conditional blob
  writes, not storage keys. Short-lived independent demo/control bearer secrets
  protect its bounded synthetic API. Only readiness/liveness is anonymous.
- Explicit crossing sessions define the measured affected population.
  Stationary controls and continuous diagnostic journeys remain separate.
  Cohorts are deliberately stratified, not statistical traffic-distribution
  samples. All attempted affected sessions, including unknown outcomes, stay
  in the denominator.
- Requests have a 2-second budget. A deliberately admitted 2-second old-blue
  request has a declared 5-second budget. Cross-transition synthetic sessions
  have a 10-minute budget, including controller time. These are demonstration
  bounds, not production SLOs.
- At most 40 crossing users, 5 diagnostic journeys/sec (normally four HTTP
  requests per journey), 60 seconds per observation window, and two P1v3 workers.
  Readiness requires three consecutive dependency/identity checks; this does
  **not** prove readiness of every worker.
- Native swap may recycle workers and interrupt requests. Manual scale-in
  cannot promise application-controlled draining. Observed errors fail positive
  experiments; they are not retried away or silently classified as seamless.
- No OAuth, cache/SQL, queue/worker, streaming, tenant ownership, regional
  redundancy, or statistically independent reliability campaign is implemented.
  A small run cannot establish five-nines reliability.

## Pipeline

1. [Validation](../.github/workflows/azure-demo-ci.yml) runs tests, compiles Bicep,
   lints Actions, and publishes the full source-derived coverage report without
   Azure credentials.
2. [Manual execution](../.github/workflows/azure-demo.yml) validates explicit
   configuration, consent, load, and a reviewed cost estimate before requesting
   the protected `azure-demo` environment.
3. OIDC signs in without a client secret. The runner checks subscription,
   regional/runtime support, current P1v3 quota/usage, fresh resource-group
   isolation, and subscription-scope Bicep what-if before provisioning.
4. Immutable ZIP releases are deployed, then the controller measures baseline,
   transition, gates, recovery, drain, and short rollback retention.
5. Always-run teardown checks **exact subscription, group name, repository,
   run, attempt, experiment, purpose, and expiry tags** before deleting, waits
   for confirmed absence, and publishes teardown evidence.
6. A separate cleanup job retries teardown using a different OIDC identity.
   The [hourly janitor](../.github/workflows/azure-demo-cleanup.yml) removes only
   expired, exactly owned groups, covering hard cancellation/runner loss.

Each group expires after 90 minutes. Normal cleanup is immediate after the
experiment. GitHub cancellation, environment misconfiguration, Azure outages,
resource locks, or schedule delays can prevent immediate teardown. The janitor
is a recovery mechanism, **not a guaranteed billing cap**. An unsuccessful
`cleanup.json` requires operator attention; verify deletion in Azure.

The consent and snapshots under `capability/` remain unchanged and do not
authorize this pipeline. Likewise, pipeline results do not publish acceptance
credits into the local capability evidence store.

## One-time setup (not executed automatically)

### Current live-run blocker

Provider-level ARM validation on 2026-11-05 rejected P1v3 in **Central US,
North Central US, East US 2, and West US 2**, reporting
`InternalSubscriptionIsOverQuotaForSku` with an effective limit of zero.
This contradicts the positive quota inventory values. No demo resources were
created, and this work does not claim that a live run is currently deployable.

Resolve the [App Service quota/support restriction](https://aka.ms/antquotahelp)
for at least **two P1v3 Linux workers**, or validate another authorized US
region. Re-run ARM validation **and** what-if before identity bootstrap or any
live run. Do not trust a positive quota list alone, silently substitute a SKU,
or treat template compilation as cloud-deployment validation.

Use a dedicated demonstration subscription wherever possible. The confirmed
initial location is `centralus`; alternative US regions are authorized for
evaluation, but none tested has passed yet. The target and allowance are recorded in
[the deployment plan](../.azure/deployment-plan.md). The user-confirmed USD
10,000 allowance is **not the expected cost**, and the pipeline does not default
to spending it.

### 1. Protect GitHub before granting Azure access

Create these repository environments in **Settings > Environments**:

- `azure-demo`: required reviewer, prevent self-review, and a custom deployment
  branch policy allowing **only `main`** (not arbitrary tags).
- `azure-demo-cleanup`: only `main`, no required reviewer or wait timer, so
  teardown cannot wait on a second human approval.

Protect changes to the workflows and infrastructure through your normal branch
review policy. Never authorize an unreviewed branch or pull request for either
environment. Untrusted CI receives no OIDC permission.

### 2. Review and provision the OIDC bootstrap separately

[github-identity.bicep](../infra/github-identity.bicep) creates two managed
identities and exact environment-subject federated credentials. It must be run
once by an authorized administrator **after separate identity/RBAC approval**.
No application registration, password, or publish profile is required.

The demonstration identity receives Contributor plus role delegation limited
to **Storage Blob Data Contributor for service principals**. This additional
permission is necessary because Contributor alone cannot deploy the workload
blob role assignments. The cleanup identity gets only resource-group
read/delete and deployment read/cancel/delete permissions.

These are subscription-scope permissions. Code-level ownership checks are not
an Azure RBAC isolation boundary: malicious trusted workflow code could delete
other groups, and the runner could modify other subscription resources. Do not
grant these identities access to an unsuitable shared/production subscription.
The deployment identity cannot assign itself Owner or arbitrary roles through
the conditioned delegation.

From the repository root in PowerShell, **only after approval**:

```powershell
$subscription = '<approved-subscription-id>'
az deployment sub what-if --subscription $subscription --location centralus `
  --template-file .\infra\github-identity.bicep `
  --parameters repository=chadhage/app-scaling-strategies
az deployment sub create --subscription $subscription --location centralus `
  --name app-scaling-github-identity --template-file .\infra\github-identity.bicep `
  --parameters repository=chadhage/app-scaling-strategies
```

Inspect the outputs and configure **repository-level Actions variables**
(the unprivileged plan job intentionally does not access environment variables):

| Variable | Value |
| --- | --- |
| `AZURE_SUBSCRIPTION_ID` | Approved target subscription |
| `AZURE_TENANT_ID` | Bootstrap `tenantId` |
| `AZURE_CLIENT_ID` | Bootstrap `runnerClientId` |
| `AZURE_CLEANUP_CLIENT_ID` | Bootstrap `cleanupClientId` |
| `AZURE_LOCATION` | `centralus` |
| `AZURE_DEMO_MAX_ESTIMATED_COST_USD` | Reviewed campaign allowance; choose a small value suitable for the first run |

The bootstrap identity group is intentionally persistent, outside the
per-demonstration groups and their TTL. It contains identities, not paid
compute. Removing the integration requires separately removing its
subscription role assignments/custom role and identity group; never let the
demo janitor delete the identities it needs for cleanup.

### 3. Review costs and dispatch

Price one P1v3 Linux plan for up to 45 minutes (two workers for the scale case),
small LRS storage/transactions, any egress, and GitHub runner/artifact charges.
Use current regional prices and your subscription's agreement; Azure billing
and budgets are delayed. The operator-entered estimate is checked against the
configured allowance, but it is **not a live billing meter or hard spending cap**.
For `all-implemented`, estimate x seven must fit the campaign allowance.

On 2026-11-05 the public retail API listed Central US P1 v3 Linux at
**USD 0.17/worker-hour**: about USD 0.1275 for one worker over 45 minutes,
or USD 0.255 for two workers, **compute only**. Cleanup time and the other
charges above are additional. Recheck before accepting an estimate; the
USD 10,000 approved ceiling is not a forecast.

After review, merge/publish the workflow on the protected default branch.
GitHub requires the workflow to exist on that branch for manual dispatch.
Then use **Actions > Demonstrate Azure scaling strategies > Run workflow**.
Select `blue-green`, enter the reviewed estimate, explicitly confirm cost and
teardown, and approve the environment.

Example (substitute a genuinely reviewed estimate):

```powershell
gh workflow run azure-demo.yml --ref main `
  -f experiment=blue-green -f users=10 -f observation_seconds=5 `
  -f journeys_per_second=1 -f estimated_cost_usd='<reviewed-estimate>' `
  -f confirm_cost_and_teardown=true
```

Do not run the whole campaign as the first live qualification.

## Evidence and phased coverage

Each run uploads `observations.jsonl`, `result.json`, `context.json`,
`coverage.json`, and `cleanup.json`. Secrets, secure deployment parameters,
and deployment ZIPs are **not** uploaded.

The result includes actual artifact/epoch/worker observations, per-stage
latency percentiles, failed requests, affected and stationary journey counts,
unverified attempts, safe-abort versus interrupted outcomes, and rollback
observations. Successful negative controls can have `controlPassed: true`
with `outcome: interrupted-transition`; that is not uninterrupted migration.

The coverage report is derived from the exact S001-S150 table in the root
README. Catalog drift fails validation. Implementation phases are:

1. **Implemented here:** bounded App Service experiments above, without native
   qualification until execution and review.
2. **Planned:** Container Apps revisions, AKS rolling/blue-green routing,
   supported Functions updates, Windows/container and Spring Boot variants.
3. **Planned:** stateful n-tier, streaming, data, queue, and ownership cases.
4. **Planned:** regional failure domains, soak/fault campaigns, and statistical
   qualification including correlated-failure analysis.

Future providers must reuse the journey/outcome contract, bind identities to
real native destinations, and implement their own readiness/transition/recovery
mechanisms. Do not alias a missing provider to App Service or mark it passing.

## Local validation

```powershell
Push-Location .\demo
npm ci
npm test
Pop-Location
az bicep build --file .\infra\main.bicep --stdout
az bicep build --file .\infra\scale.bicep --stdout
az bicep build --file .\infra\github-identity.bicep --stdout
node .\demo\pipeline.cjs catalog
```

Tests use real, bounded loopback HTTP servers with an explicit in-memory store.
They test controller orchestration, not Azure swap/scale behavior. No local
store is available as a deployed fallback. Windows/Node.js 22 can run tooling
tests; deployed entrypoints require Node.js 24, and native orchestration runs
on the Linux Actions runner. Live Windows orchestration is not implemented.
The final local suite passed all 35 tests on Node.js 24.22.2; this is not
deployed Linux or native Azure qualification.

## References

- [App Service slots, warm-up, recycling, and Linux auto-swap limitations](https://learn.microsoft.com/azure/app-service/deploy-staging-slots)
- [App Service plans and shared capacity](https://learn.microsoft.com/azure/app-service/overview-hosting-plans)
- [Azure Login with OIDC](https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect)
- [Role-assignment delegation conditions](https://learn.microsoft.com/azure/role-based-access-control/delegate-role-assignments-examples)
- [Bicep subscription deployments](https://learn.microsoft.com/azure/azure-resource-manager/bicep/deploy-to-subscription)
- [Azure retail prices](https://prices.azure.com/api/retail/prices)
