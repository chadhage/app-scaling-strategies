# S062 · Connection-pool multiplication

**Training rehearsal - synthetic data - not a live Azure result**

Open [index.html](index.html) directly in a modern browser. No service, account,
subscription, authentication or installation is required.

## Exact source and acceptance

- README S062: **Connection-pool multiplication:** Keep aggregate database
  connections within limits as frontend/API instance counts increase.
- D-S062: add per-instance connection-pool settings and aggregate connection-limit
  visualization during scale-out. Acceptance: **Total connections stay within the
  approved data-tier limit; connection exhaustion and journey latency are detected.**
- A-S062: **Multiply per-instance pools during scaling; detect aggregate
  database-connection exhaustion.** Worker `worker-A-S062`, packet `SC-S062`,
  one frozen S unit. Native sibling B-S062 remains separate.
- Exact raw source excerpts, portable/atomic contracts, packet rule and canonical
  committed-source identities are retained in `evidence\source-contract.json`
  and `evidence\raw`. Raw CRLF snapshots use narrow owned `-text` attributes;
  canonical LF integrity qualifies Git source independently.

## Worked exercise

1. Observe the default baseline, one frontend and one API instance. Pools of
   10 and 20 request **30 connections**, producing **130 ms** synthetic latency.
2. **Scale & observe** the default 2 frontend and 3 API instances:
   `2 × 10 + 3 × 20 = 80`, within the declared synthetic limit of 120.
   The modeled latency is **214 ms**, within 300 ms. Both observations succeed.
3. Retain the attempt. Set target counts to **4 frontend / 5 API**. Each
   individual pool is small, but total demand is **140**. The model accepts
   120 and refuses 20; **514 ms** latency and refused connections visibly fail.
4. Retain that failure. Keep the 4/5 target but reduce the pools to **5/10**:
   demand becomes **70**, latency **198 ms**, and both checkpoints succeed.
   The original failure and its exact configuration remain visible.
5. To isolate the latency gate, use target counts **2/2**, pools **10/20**,
   connection limit **60**, budget **279 ms**. There are no refused connections,
   but the scaled **280 ms** journey fails. Raising the budget to 280 passes:
   both budget comparisons are inclusive.
6. With **Withhold scaled telemetry**, the configured ceiling and forecast remain
   visible, but accepted/refused/headroom/latency observations stay unknown.
   A forecast cannot masquerade as observed exhaustion or a successful journey.

### Explicit synthetic rules

Every pool simultaneously requests its configured maximum. Demand is frontend
instances times frontend pool plus API instances times API pool. Accepted
connections are `min(demand, limit)`; refused are `max(0, demand − limit)`.
Signed headroom is `limit − demand`.

Invented latency, in ms:
`80 + 2 × ceil(100 × demand / limit) + (refused > 0 ? 200 : 0)`.
This is a deterministic teaching rule, not a prediction of real database latency.
The configured cap bounds accepted connections; refusing excess demand still
fails the journey. These observations are entirely synthetic.

Exactly two required checkpoint observations form the denominator. Empty or
partial samples are unknown, not 100% success. Missing observations stay unknown;
a known failure dominates uncertainty. A successful baseline never hides a
failed scaled sample. There are no retries or real users.

## Controls, guards and reset

Use Tab, Enter and Space with native controls. Configuration locks after baseline
observation. Canonical decimal integers, exact configuration/journal shapes,
valid phases, named presets and action payloads are enforced without mutation on
rejection. A replayed immutable journal prevents forged derived outcomes.
Prediction PASS/RETRY is separate from the measured result.

Six completed attempts is a hard limit; no failures or unknowns are pruned.
**Reset all attempts & defaults** clears active work, history, error and
prediction, restores every default and focuses the first input. No control
shadows `form.reset`. History is intentionally in memory until reset or reload.
The restrictive CSP permits only local scripts/styles and blocks inline code,
network connections, form submission, frames, objects and workers.

## Verification

From the repository root with existing Node 22 test tooling:

```powershell
node --test .\learning\S062\tests\model.test.cjs .\learning\S062\tests\surface.test.cjs .\learning\S062\tests\integrity.test.cjs
node --test .\learning\S062\tests\browser.test.cjs
```

Normal verification is read-only to proof. Only deliberate browser capture
writes a new non-overwriting run:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S062\tests\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a callable-stub RED: 1 passing surface test and 13 real
`ERR_ASSERTION` failures, not missing code/tools. The immutable `.snapshot`
sources and raw TAP/stderr are non-auto-discovered under `evidence\red`.
Explicit IaC N/A followed RED and preceded implementation. Focused, syntax,
source/integrity and actual browser checks are retained with raw run metadata.

Browser checks use only published `testing\browser\isolated.cjs` (`53c0c0d`),
SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, and awaited `finally` close. Existing offline Playwright
1.56.1 and Microsoft-signed Edge 156 are the selected pair. No packages,
downloads, unsafe flags, shared browser sessions or abandoned lifecycle
prototype are used. The helper's documented unattended lifecycle limitation
remains; these focused checks are not general unattended CI certification.

## Limits and relevant To Do refinement

No actual database connection is opened, no real pool is saturated and no
native database is exhausted. A configured maximum does not measure live
connections; this lesson explicitly assumes saturation. Other clients, minimum
or idle pools, traffic skew, queueing, retries and real database semantics are
not modeled. Synthetic latency and results certify no native platform, real
end-to-end budget, production Node.js 24, source-parent or five-nines outcome.

**B-S062 and D-S062 remain incomplete.** Preserve B-S062's genuine entry gates:
CORE, DATA, ASANY and C065, with an approved owned native target, bounded
scale-out, effective per-instance pool settings, real total-connection and
client-latency observations, and cleanup. Parent D-S062 also depends on D-S011:
evidence additional ready compute before increased admission, rather than
counting slots as compute. Real exhaustion must be observed under an approved
fault/load envelope and remain a failed user journey, not relabeled success.
No new test/plumbing/refinement unit, generic database lesson or cloud approval
is introduced. Parent empirical review alone may Accept this one A-S062 unit.
