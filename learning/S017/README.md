# S017 — Vertical scaling through replacement

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, packages, framework,
credentials, Azure management, resources, identity, deployment or spending.

## Exact source and portable scope

Canonical README **S017**: **Vertical scaling through replacement: Prepare a
larger parallel deployment when an in-place size change would violate
continuity requirements.**

**D-S017** requires **Replace with larger capacity** beside **In-place resize**,
ready parallel capacity before handoff, comparison of continuity and cost, and
honest disruptive in-place outcomes. Its original prerequisites are **P001 and
D-S001**, plus the shared/native acceptance gates. **A-S017** is one frozen
**S** unit, `kanoUnit: A-S017`, packet **SC-S017**, entry gate **SOURCE**.

This independently browser-openable exercise satisfies only the portable
learning slice. **B-S017** remains gated by **CORE, DATA, ASANY, C067**, target
qualification and separate execution approval. Neither that native card nor
D-S017 is complete. There are no catalog, C041 or other shared edits.

## Worked exercise

1. Keep demand **4**, with **Healthy observations**.
2. Choose **In-place resize**. Observe three five-second windows: **12 attempted,
   8 successful, 4 interrupted, 0 unknown, 6 synthetic credits, FAIL**.
3. **Archive and reset**. The first run remains in the comparison and JSON.
4. Choose **Replace with larger capacity**. Observe twice: target capacity is
   **8 READY**, but admissions still use the old deployment.
5. **Hand off to larger capacity**, then observe one further window:
   **12 successful, 0 interrupted, 0 unknown, 9 synthetic credits, PASS**.
6. Compare equal demand and equal window counts, not unmatched horizons.

The smaller deployment can serve **4 journeys/window**, the larger **8**.
An in-place resize has **one unavailable window**; replacement takes **two
observed healthy warm-up windows**. Service counts use the capacity at the
start of a window; readiness changes occur at its end. Handoff advances neither
time nor cost. READY and routing intent alone cannot produce PASS; at least one
known target journey after guarded handoff is required.

Costs are assumed arithmetic: **1 old + 2 larger synthetic credits per full
five-second window**, including restart. Parallel overlap costs **3/window**;
the old deployment remains retained **and charged after handoff**. No retirement
is modeled. The larger parallel deployment is distinct synthetic capacity, not
an assertion that another slot in the same App Service plan adds compute.

These are deterministic teaching constants, not Azure defaults, billing
estimates, provisioning timings or measured performance. There is no wall clock,
randomness, real workload, authentication/session/state/effect verification,
drain, durable continuation, retry or automatic rollback. No actual user or
native-platform transition, reliability or five-nines claim follows.

## Negative and unknown exercises

- **Demand 6:** old capacity loses two journeys in each warm-up window. Later
  target success leaves **4 interruptions** and FAIL in the record.
- **Target readiness/service fails before handoff:** the old deployment keeps
  serving. Verification FAIL is separate from **safe-abort-before-exposure**
  impact at default demand; this is not successful migration.
- **Failure after handoff:** target journeys are interrupted; no safe-abort or
  uninterrupted label is inferred.
- **Missing observations:** effective serving/ready capacity is **null**, all
  attempted journey outcomes are UNKNOWN, and readiness does not progress.
  A missing refresh removes READY. Healthy recovery can restore readiness,
  but earlier unknown outcomes remain UNKNOWN; known failure takes precedence.
- Every window conserves `attempted = successful + interrupted + unknown`.
  Cost remains the declared independent arithmetic assumption during telemetry
  gaps, not an observed cloud bill.

## Input, history and keyboard contract

Demand is a whole number **1–8**. Apply it while IDLE; start revalidates the visible
field, so an invalid or unapplied edit cannot silently start stale demand.
Blank, whitespace, fractional, exponent, signed/padded strings, non-finite,
boolean/object/array inputs, extra fields, unknown observations/actions and
accessor commands are refused. Commands must have exactly the declared own data
fields. Rejections retain an event without changing time, cost or execution.
Duplicate starts, active configuration, premature handoff and terminal stepping
are blocked. Only reducer-created deeply frozen snapshots are accepted;
selectable exports are evidence, not an import/execution API.

Use **Tab, Enter and Space**. Native `form.reset()` remains callable; no control
has `id` or `name` equal to `reset`. Archive/reset restores defaults, focuses
demand and retains prior outcomes, refusals and caught runtime errors. An
unexpected application error replaces stale PASS with ERROR, disables
conducting, and preserves its last-known summary as explicitly historical.

Bounds are **12 windows, 40 commands/run, 4 archived runs/page**. At the bound,
conducting/reset is refused without pruning proof; copy the selectable JSON
before reload/close. This is page-memory history, not a durable hosted run.
Command status, verification, user impact and resource-free cleanup are separate.

## Verification and raw provenance

From the repository root, using the existing approved **Node.js 22.23.4 test
tooling**:

```powershell
node learning\S017\verify.cjs all
```

Stages: `green`, `syntax`, `browser`, `integrity`. Normal verification hashes the
whole lesson/evidence bundle before and after and is read-only. The ignored
`result.json` is a publication receipt, not historical test proof.

Only deliberate evidence refresh appends numbered records with exclusive
creation; no earlier record is overwritten:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S017\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a verified loadable no-op stub, then **54 real ERR_ASSERTION
failures and 1 pass in 55 behavioral tests**. Those unchanged assertions now
pass. IaC **N/A** was recorded after RED and before implementation. Raw
stdout/stderr, timestamps, hashes and non-auto-discovered `.txt` RED snapshots
are retained under `evidence`. The BDD was clarified afterward to distinguish
untrusted-state exceptions from retained command refusals; its original snapshot
is preserved too.

Actual browser checks conduct the DOM and keyboard, comparable strategy results,
readiness guards, invalid inputs, overload, candidate/exposed failures,
unknown recovery, runtime error, reset, retention bounds and enforced CSP.
Inline script/handler/style, connection and form probes are blocked before a
test-only invalid-host network backstop; no external request completes.

Browser tooling is only the existing offline **Playwright 1.56.1**, signed
installed **Edge 156**, and published `testing\browser\isolated.cjs` from
**53c0c0d**, checkout SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
Every opened session closes with awaited `close()` in `finally`. No downloads,
packages, foreground leases, TLS changes or disabled-sandbox flags. The abandoned
lifecycle prototype is not used. **Production Node 24 is not validated.**

The source [Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer)
applies: AS IS educational work, no Microsoft endorsement/support or SLA.
Parent-owned empirical acceptance is still required; no self-awarded Done credit.
