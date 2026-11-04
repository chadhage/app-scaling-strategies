# C029 — original journey budget evaluation

**Training rehearsal - synthetic data - not a live Azure result**

One original **C029 / D / P0 / H001**, parents **H001/H006/H012**. Independently
accepted C020/C023/C033 remain unchanged. Accepted C034's decoder and existing
bundle are reused read-only; no trace is copied, re-created or recaptured.

## Use the static UI

Open `index.html`. Choose a source, Tab to **Inspect and evaluate**, Enter.
Inspect the original IDs, exact numbers, required terminal, state and latency
verdicts, acknowledged versions and ordered actions. **Compare positive retry
(synthetic)** compares a closed control before/after retry, not a reconstructed
retry of historical original 3 or 6. Buttons also support Space.

**Load saved JSON copy** and **Evaluate saved copy** inspect only an exact copy
of the selected saved source. Missing/altered fields, duplicate JSON, order,
timing, business state, stamps, provenance and supplied verdicts reject with
HOLD; known source originals remain in the rejected-copy denominator. Input
changes clear stale results. **Reset display only** returns focus and retains
all original and error history. Sixteen operations are retained; overflow
refuses rather than dropping history. No browser network/disk/storage API runs.
The page loads the existing bundled observations as static resources.

## Node CLI

```powershell
node capability\C029\cli.cjs evaluate closed-history
node capability\C029\cli.cjs evaluate held-snapshot
node capability\C029\cli.cjs compare
node capability\C029\cli.cjs evaluate control-below
node capability\C029\cli.cjs evaluate control-at
node capability\C029\cli.cjs evaluate control-above
node capability\C029\cli.cjs evaluate model-resume
node capability\C029\cli.cjs evaluate model-reconcile
```

Exit codes: **0** scoped PASS, **1** FAIL, **2** UNKNOWN/HOLD, **3** rejected or
unavailable input/source. Only closed IDs are accepted, never paths, URLs,
custom budgets, identities, approvals, eligible flags, hashes or verdicts.
Node rereads exact pinned source and independent accepted gates under the
state mutex; handles close before release. That separate preflight is not
browser disk access, a live journey, or authenticated client/run correlation.

## What the evaluation means

- Actual historical source: C033 signed Edge DOM, unchanged C020 HTTP driver
  and exact saved raw DOM/summary. C034 verifies and decodes their original
  timing/order/state; C029 evaluates, rather than trusting HTTP 200 or source
  outcome labels. C020 implementations **1.0.0/2.0.0** preserve **getProfile/1**,
  exact synthetic business values and compatible local fixture stamps.
- Historical originals 1 and 2 pass **only this local segment**. Original 3
  remains FAIL: **1118.9000000953674 ms**, original **1000 ms** budget, held
  **1077.9000000953674 ms**. Original 4's actual 404 remains FAIL. Originals
  5/6 stay interrupted UNKNOWN. Original 7 is summary-only, with no complete
  saved start/deadline/order/terminal/stamps: UNKNOWN, never healthy replacement.
  Closed-history denominator **7 = 2 PASS + 2 FAIL + 3 UNKNOWN**.
- The earlier held snapshot has two observed starts, one complete and one
  UNKNOWN with only v1 acknowledged. It does not acquire later originals from
  a later report. Missing v2, terminal and end time are never invented.
- Original deadline is immutable: **end < original deadline**; equality or
  above is FAIL, exactly as unchanged C033's contract. Held time counts.
  Closed synthetic controls measure the boundary at **999.75/1000/1000.25 ms**;
  tests also cover all accepted C033 budgets **1000/6000/12000 ms**. These are
  explicit synthetic clock controls using the unchanged driver, not actual
  browser/HTTP latency measurements or five-nines assumptions.
- A positive retry retains the first original FAIL and both originals in the
  denominator. An interrupted unknown remains UNKNOWN after a positive retry.
  Missing required dimensions stay UNKNOWN; a separately confirmed violation
  stays FAIL. No aggregate healthy-200 count or replacement clock can repair it.
- C023 is separately evaluated as a **PURE event-log MODEL**, assuming an
  atomic local application/deduplication pair and later checkpoints. Original
  terminal prefixes retain exact work/effect keys, known applications,
  checkpoints, unknowns and delivery attempts. Resume cannot rewrite an
  original state-budget failure; hypothetical reconciliation cannot rewrite
  an original unknown. Model state PASS still yields overall UNKNOWN/HOLD
  without latency observations. No durable store, queue, actual external
  effect or client/effect association is asserted. C029 bounds inspection to
  16 model commands and never truncates accepted model history.

`evaluateSnapshot` is a finite, own-data, bounded **unbound mathematical
inspection**, never historical authority. `evaluateSaved` selects internal
immutable source; input cannot set authority. Exact-copy agreement is not
cryptographic authentication. All outputs deny live eligibility, user journey
success, client mutation, native transport and reliability certification.
Request tokens and response headers absent from historical DOM are not invented.

## Verify without rewriting source or evidence

```powershell
node --test --test-concurrency=1 capability\C029\tests\evaluator.test.cjs capability\C029\tests\guards.test.cjs capability\C029\tests\source.test.cjs capability\C029\tests\surface.test.cjs
node capability\C029\tests\syntax.cjs
node capability\C029\tests\browser.cjs
node --test capability\C029\tests\integrity.test.cjs
node capability\C029\tests\verify.cjs
```

Normal verification is source/evidence read-only. Only a deliberate exact
capture appends a unique owned evidence directory, never replaces a failure:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C029\tests\record.cjs browser }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

`record.cjs` has closed BDD/stub/RED/IaC/implementation/pins/GREEN/syntax/
browser/verify/integrity stages under the same exact guard. Raw stdout/stderr
gzip preserves original whitespace and real exit codes. The initial incorrect
retry-laundering stub remains loadable, and its retained assertion RED is
reproducible without changing the implementation:

```powershell
node --test capability\C029\evidence\red\evaluator.initial.snapshot.cjs
```

The first actual browser check exposed a strict multi-row selector error.
Its failure, four completed checks and successful exact cleanup remain intact;
the corrected runner has separately captured 14 actual DOM checks. Final
focused GREEN has 88 assertions and syntax checks cover 24 own JavaScript
scripts plus PowerShell parsing. These counts are verification, not journeys.
`tests\finalize.cjs` creates the immutable evidence index once under the exact
capture guard and refuses replacement. Normal integrity verification only reads it.

`imports.json` keeps working raw, CRLF-to-LF and accepted Git hashes distinct.
Those immutable historical source proofs do **not** pin a future private
publisher in normal tests. Publication instead rereads current canonical
authorization under the state mutex, closes before taking the publisher mutex,
checks actual private bytes against that separate currently approved hash, and
delegates unchanged standard publication. Unknown new hashes fail closed.
Main must equal actual remote before staging; owned-only commit, annotated tag,
atomic main/tag push and remote peel/ancestry are required.
The guarded one-original `tests\publish.cjs` capture retains full publication
and raw-byte/remote receipts in uniquely named owned files for State Report.
It does not accept the card; publication remains pending parent review.

Actual UI verification uses installed **Node 22 / offline Playwright 1.56.1 /
valid Microsoft-signed Edge 156**, sandbox enabled, and only unchanged
`testing\browser\isolated.cjs` SHA
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
It awaits exact owned closure in `finally`, including errors. **Browser verifier
PASS is UI correctness, not user journey success.** No prototype/lifecycle
patch, unsafe flags, foreground leases, packages/downloads or TLS weakening.

H001/H006/H012, full/native/source journeys and production **Node 24/Express**
remain unfulfilled. IaC **N/A**. No scaffold, cloud, Entra, credentials, real
users, resources, deployment or spend. Parent alone accepts one original D;
tests, fixes and refinement earn zero additional Kano credit.
