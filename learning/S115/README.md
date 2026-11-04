# S115 — Active-passive standby readiness

**Training rehearsal - synthetic data - not a live Azure result**

Original **A-S115 / D-S115 / SC-S115 / frozen Kano S**, exactly one learning
unit. Objective: **Compare warm/cold standby; a healthy shallow endpoint is not
complete readiness.** Exact README S115, D-S115 acceptance, portable card and
packet provenance are retained in `evidence\source-contract.json` and raw files.

Every standby, region, capacity, health, cache, dependency, authentication,
state, recovery phase and client journey is **fixed fictional teaching DATA**.
“Measure” means deterministic arithmetic on these declared values. There are
no actual resources, network paths, faults, accounts, state stores, management
calls, credentials, deployments or spending.

## Conduct in a browser

Open `index.html` directly; no server, subscription, framework or installation.

1. Keep **Warm reference / 6000 ms**, then **Measure full standby** and
   **Rehearse recovery**. Both required instances supply **12** ready units
   against demand **10**; cache canary revision **7**, dependency access,
   synthetic session acceptance and profile/session/effect state pass.
   Recovery is **4000 ms**; the two client traces are **4100/4150 ms**.
2. Reset current rehearsal, choose **Cold reference / 6000 ms**, and repeat.
   Shallow HTTP **200** remains healthy, but initial compute/cache readiness
   fails. Activation **4000** + cache warm-up **12000** + full validation
   **2000** + routing **2000** = **20000 synthetic ms**. Eventual client
   completion at **20100/20150 ms** retains **two interruptions**.
3. Reset and select **Cold reference / 24000 ms**. Clients now meet their own
   budget, but cold standby was not ready at the outset. The overall contract
   remains failure, and the earlier 6000-ms failure remains unchanged.
4. Compare the five independent negative fixtures: **compute short**, **cache
   incompatible**, **dependency denied**, **auth denied**, **state behind**.
   Shallow 200 cannot override any required dimension. Admission is blocked;
   phase-template arithmetic is not completed recovery or observed routing.
5. Try **Unobserved**. Missing full-path/recovery evidence and two client
   outcomes remain **unknown**, never inferred from the independent warm row.

The contract is **ready at the outset AND client recovery within each original
budget**. Client outcome and overall contract are separate. The preference
journey checks exactly one prior committed effect; it executes no real write.
Fixed warm/cold reference arithmetic is not X002's accepted-run comparison.

S115 concerns a **separate passive region's complete standby readiness**.
S097 concerns **rollback-destination readiness throughout a retention window**
and belongs to **LP-COMPARE**. S115 has no rollback-retention promise,
active-active or multi-writer claim, regional-outage guarantee or native SLA.

## Guards, history and keyboard/error behavior

Only eight exact fixture IDs and numeric budgets **6000 / 24000** are accepted.
Unknown keys, accessors, coercion, non-finite/fractional numbers, forged/copied
states and stale/replayed transitions are rejected. State and history are
deeply immutable; a successful transition consumes its previous state.

One measurement precedes one rehearsal. Choices lock until reset. History
retains at most **ten** completed or reset-before-recovery checks; reset never
renews this allowance. Resetting a measurement retains an **unknown unfinished
check with zero client attempts**, not imaginary interrupted clients.
Check and client totals conserve success/failure/unknown independently.
History is in-memory only; reload starts an independent session.

Tab between labelled native selects and buttons; Enter measures/rehearses,
Space resets. Errors have a focussed live alert and actionable recovery.
Reset restores warm/6000 and returns focus to the selector (or limit status).
No control is named/id `reset`; the native form prototype reset is used.
Unexpected local UI failures never become success-shaped fallback results.

## Focused verification

From the repository root in PowerShell with existing Node **22** tooling:

```powershell
node --test learning\S115\tests\model.test.cjs learning\S115\tests\bundle.test.cjs learning\S115\tests\integrity.test.cjs
node --check learning\S115\model.js
node --check learning\S115\app.js
node --check learning\S115\tests\browser.test.cjs
node --test learning\S115\tests\browser.test.cjs
```

Normal verification is **read-only**, including historical observations and
integrity baselines. `evidence\content-index.json` completely covers canonical
UTF-8/LF source separately from byte-exact `evidence\raw\**`. Narrow owned Git
attributes preserve raw PowerShell CRLF logs, source fragments and loadable
stub archives. Failing archives end in `.cjs.txt`, outside automatic discovery.
Their intentional replay still exits **1 / ERR_ASSERTION**, not a missing-tool
failure:

```powershell
node --test learning\S115\evidence\raw\behavioral-red.test.cjs.txt
```

After scoped publication, verify the exact Git blobs separately:

```powershell
$env:S115_GIT_REV='<exact 40-character implementation commit from the worker report>'
try { node learning\S115\verify-publication.cjs }
finally { Remove-Item Env:\S115_GIT_REV -ErrorAction SilentlyContinue }
```

That read-only command requires the real commit, rejects unowned changed paths,
and checks every raw/canonical blob without a skipped publication gate.

BDD preceded the loadable stub and genuine shallow-200 assertion RED.
`evidence\iac.json` records **IaC N/A after RED and before implementation**.

Actual DOM, keyboard, error, reset, required-readiness failures, unknown,
retained-budget and CSP observations use only published
`testing\browser\isolated.cjs` at **53c0c0d**, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
It calls `openIsolatedLesson` and awaits `close()` in `finally`. Existing offline
Playwright **1.56.1** and installed signed Edge **156** are the approved local
pair. No download, new packages, unsafe flags, foreground lease, loopback
listener or inactive recovery prototype. Its documented unattended lifecycle
recovery limitation remains unqualified; a completed feature run does not
repair or certify that helper.

Browser error probes mutate only local DOM inputs. CSP probes observe blocked
inline script, prohibited connection and valid Blob-worker execution, not real
dependency operations or network faults. No external request may occur.

Only deliberate producer capture uses the **exact** value:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
try { node --test learning\S115\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

Capture appends a unique owned report only after awaited browser cleanup.
Historical reports are never overwritten. Other values (including `true`)
do not capture. A deliberate later capture needs a separately reviewed
integrity-baseline update; normal tests cannot perform that update.

## Unfinished native work and completion boundary

B-S115 and D-S115 remain incomplete. Their original **P006, D-S021, D-S022**
and **BASE = H011 + P005 + HOST** prerequisites, CORE/DATA/REGION gates,
approved native target/lease/execution permissions and actual standby/client
measurements are still required. This is not production Node **24** validation.

No relevant admitted To Do remainder needed pruning; no split was required.
Native scope is the honest blocked remainder, not an extra credited task.
No root/shared/catalog/ledger integration is part of this owned bundle.
Tests, repairs, proof, refinement and tooling earn **zero extra credits**.
The worker reports scoped tagged publication; the parent independently accepts
the original satisfier at most once.
