# S093 — Latency regression without errors

**Training rehearsal - synthetic data - not a live Azure result**

One portable **A-S093 / D-S093 / SC-S093 / Kano S** lesson. The exact inventory
objective is: **Return slow 200 responses; an exceeded journey budget must fail
acceptance.** Source README S093 says to reject successful responses that are too
slow; D-S093 requires latency to block expansion even with HTTP 200 and counts
slow journeys as interruptions. Exact source rows and immutable Git provenance
are retained in `evidence\source-contract.json`.

## Conduct the exercise

Open `index.html` directly in a modern browser with local JavaScript enabled.
There is no server, account, framework or setup. All three synthetic attempted
canary journeys have HTTP **labels** of 200; the durations are fixed data, not
elapsed waits, requests or measured latency. Each independent run starts at a
synthetic 25% canary.

1. Keep **Slow HTTP 200**, **1000 ms**, and **Request expansion**. Activate
   **Check and apply decision**. The durations are 420, 1700 and 2400 ms.
   Acceptance fails, expansion is blocked at 25%, and the verifier rejects the
   unsafe choice. HTTP labels score 3/3, but journey success is 1/3 with two
   interruptions.
2. **Reset current rehearsal**, select **Hold / reject candidate**, and check.
   The safe decision verifier passes; candidate acceptance still fails and the
   interruptions remain in the denominator.
3. Reset, choose **Within budget** and request expansion. The 420, 700 and
   1000 ms trace meets the inclusive 1000 ms budget, permitting synthetic 50%.
4. Reset and choose **Missing latency**. Acceptance is **unknown**, not success:
   two journeys meet their budget and one remains unverified. Expansion is held
   or blocked. HTTP 200 cannot fill in missing evidence.

Tab through labelled selects and buttons; use arrow keys for choices and
Enter/Space for activation. Errors are announced and focused. Reset restores
the default slow/1000/expand controls and focuses the trace selector without
shadowing the native form reset method.

## State, history and acceptance

Decisions lock until explicit current-rehearsal reset. Exact input choices,
state shape and saved trace integrity are guarded. Reset clears only the current
result/error and restores controls; **all history, original budgets,
interruptions, unknowns and the six-decision allowance are retained**. History
never silently drops failures. A full session blocks further decisions.

The aggregate equation is `success + interruption + unknown = attempted`.
An empty sample is no evidence. The metric counts fixed synthetic attempted
canary journeys, not real migrations or endpoint uptime. A safe rejection may
pass its *decision* verifier while the *journey acceptance* remains failure.
Reload starts a separate in-memory session, not recovery or certification.

## Focused verification

From the repository root in PowerShell, using existing Node 22 tooling:

```powershell
node --test learning\S093\tests\model.test.cjs learning\S093\tests\bundle.test.cjs
node --check learning\S093\model.js
node --check learning\S093\app.js
node --test learning\S093\tests\browser.test.cjs
```

Normal verification is read-only. The browser check requires exactly the
published `testing\browser\isolated.cjs` at `53c0c0d` with SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`, offline
Playwright 1.56.1 and the installed signed Edge 156. It calls
`openIsolatedLesson` and awaits `close()` in `finally`; the abandoned lifecycle
prototype is not used. Its documented lifecycle limitation is not waived.
No packages, browser downloads, unsafe flags or foreground leases are needed.

Only a deliberate producer capture sets:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
try { node --test learning\S093\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

That explicit mode writes `evidence\browser-acceptance.json`; normal reruns never
refresh evidence or integrity baselines. `evidence\content-index.json` qualifies
canonical LF Git-source hashes separately from byte-for-byte raw evidence.
The owned `.gitattributes` preserves `evidence\raw\**` as `-text -diff`, including
the original CRLF RED/green transcripts. RED snapshots have no auto-discovered
test filename and are intentionally failing historical assertions, not normal
tests. `evidence\red.json` records an actual assertion failure against a loadable
HTTP-only stub before implementation; it is not a missing-tool/code failure.

## Limits and completion

All statuses, latency numbers, fault selections and routing percentages are
fixed bounded deterministic synthetic teaching data. No actual server, requests,
load, elapsed latency, fault injection, HTTP acceptance or user-journey
certification is performed. No management calls, identity, credentials, cloud
resources, deployment or spend. **IaC N/A** was recorded after genuine RED.

This is one frozen S unit only. Tests, evidence, repeated runs and local tooling
earn no additional credit. B-S093, D-S093 and native/platform acceptance remain
incomplete; no production Node 24 or reliability certification is implied.
The worker reports verification/publication; only the parent controller can
empirically accept the card. Scoped commit and annotated tag identifiers are
recorded by the authorized publisher and controller, not invented here.
