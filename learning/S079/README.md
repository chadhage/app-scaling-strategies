# S079 — Backlog surge

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, packages, framework or management access.

## Exact source and scope

- README **S079**: “Backlog surge: Add processing capacity while maintaining ordering and completion-deadline requirements.”
- **D-S079**: “Add bounded backlog bursts, consumer expansion, and deadline/ordering views.” Acceptance: “Capacity drains real work within the declared deadline and ordering contract; overdue jobs are failures.” Its original dependency is **D-S075**.
- **A-S079**, frozen **S**, unit **A-S079**, packet **SC-S079**, worker **worker-A-S079**: “Burst the backlog; evaluate ordering and completion deadlines rather than throughput alone.”
- Exact source, backlog, A/B rows, atomic/portable contract, packet rule and outcome policy were read before behavior design. `evidence\source-contract.json` records exact slices and original working/committed bytes separately. Compressed raw snapshots retain original working CRLF. Unrelated concurrent board counts are not frozen.

This A-card supplies a synthetic exercise, not the parent’s required real-work evidence. **B-S079 and D-S079 remain incomplete**, including the parent’s original prerequisite and native acceptance gates.

## Conduct the exercise

Preconditions: JavaScript enabled, two fixed keys A/B, one initial worker. All 6 or 12 jobs arrive at synthetic tick 0. Sequence 1 per key takes 3 ticks; later jobs take 1. Total workers are 1–3. Scheduling and observations are deterministic; the maximum drain window is 16 ticks, not real elapsed time.

Choose inputs, then **Burst backlog → Add capacity → Drain burst → Verify contracts**. Each key must commit in ascending sequence; there is no global A/B order. Same-tick commits use ascending worker number. Deadlines are inclusive and measured from arrival, not worker start.

| Comparison | Measured synthetic result |
| --- | --- |
| Defaults: 6 jobs, 1 added worker, keyed FIFO, deadline 5 | PASS: 6 timely ordered completions, tick 5 |
| Change deadline to 4 | FAIL: 2 overdue jobs, despite eventual complete drain |
| 2 added workers, unchecked parallel, deadline 4 | FAIL: all 6 finish by tick 4, but A2/B2 precede their predecessors |
| Defaults plus observation gap | UNKNOWN: final B3 completion unavailable; 5 success / 0 failure / 1 unknown |
| Gap plus deadline 4 | FAIL: 1 known overdue and 1 unknown, neither removed from the denominator |
| Keyed FIFO with 0 / 1 / 2 added workers | Drain at tick 10 / 5 / 5; extra workers cannot remove the two-key limit |
| 12 jobs, 1 added worker, keyed FIFO, deadline 5 | FAIL: drain at tick 8; the larger burst creates overdue work |

Unchecked scheduling can meet the observed contract for this fixed fixture with two total workers; that is not general proof of safe unguarded concurrency. The verifier derives ordering from actual synthetic commit observations, not the selected policy label. Throughput is diagnostic, not the acceptance oracle. A known late or reordered completion fails even when other evidence is unknown.

All **96 configurations** are bounded. Exact own-data records, integer/enumeration choices and ordered phases reject malformed, repeated or premature actions without mutation. Inputs, snapshots and retained records are immutable. There are no free-text jobs, endpoints, service calls or credentials.

## Prediction, keyboard, history and reset

Predict PASS / FAIL / UNKNOWN, then **Check prediction and retain**. An incorrect prediction fails the learning check only; it cannot change the measured result. Each record retains inputs, per-job observations, trace, deadline, worker count, result and prediction.

**New attempt** restores defaults and keeps all earlier failures/unknowns and cumulative job attribution. Six retained attempts is a hard limit; nothing is silently evicted. **Reset all local data** deliberately clears inputs, errors, result, trace, prediction, expanded details, history and totals. Reload also clears memory. No storage or network persistence is used.

Use Tab / Shift+Tab, select arrows, Enter / Space. A skip link, visible focus, live errors/results, labelled controls and scrollable tables support keyboard operation. Focus advances to the next valid step; rejected controls receive focus. Reset returns focus to Burst backlog. Neither form shadows its native `reset()` method.

## Verification and provenance

From the repository root, ordinary verification is read-only and never updates evidence:

```powershell
node --test --test-concurrency=1 .\learning\S079\tests\model.test.cjs .\learning\S079\tests\surface.test.cjs .\learning\S079\tests\integrity.test.cjs .\learning\S079\tests\browser.test.cjs
```

Sequence: exact source → BDD → loadable stub → actual assertion RED → explicit IaC N/A → implementation/refactoring → focused GREEN/syntax/integrity → actual isolated DOM/keyboard/error/reset/failure/CSP checks → scoped publication and parent review. Original RED: **11 tests, 1 pass, 10 actual assertion failures**, including `'idle' !== 'burst'`. No missing-code/tool or syntax failure was credited. Raw stdout/stderr and the original stub/test/BDD/attributes are preserved under `evidence\raw\red` as non-auto-discovered `.snapshot` files.

Qualified focused capture: `evidence\captures\focused-green-003` (25 checks). Qualified actual-browser capture: `evidence\captures\browser-green-002` (8 leaf groups plus its Node parent). The combined ordinary suite has 34 Node-reported tests, including that parent, not 34 independent user journeys. `normal-green` captures its raw output only after checking that every owned source/proof file stayed unchanged; browser capture is explicitly disabled for that run.

To deliberately reproduce the original RED without writing files (expected exit 1):

```powershell
node .\learning\S079\tools\replay-red.cjs
```

`tools\capture.cjs` is deliberate append-only capture, not normal verification. Browser JSON/DOM/screenshots write only with **`CAPTURE_BROWSER_EVIDENCE=1`**. `tools\seal.cjs --write` deliberately seals source/provenance; ordinary integrity tests only read. `evidence\content-index.json` checks canonical LF text plus exact narrowly attributed raw proof, and qualifies actual Git clean-filter bytes with read-only `git hash-object --path`. Deliberate capture outputs are separately hashed and excluded from the seal to avoid self-reference.

The first focused candidate preserved a failed integrity check: Git's `hash-object --path` requires Git object-name separators, unlike ordinary Windows filesystem arguments. The qualification was corrected without changing any raw CRLF snapshots. Subsequent capture revisions are append-only; this tooling correction is not extra behavioral RED or Kano credit.

The first actual-browser candidate also remains preserved as failed qualification, not positive evidence: file URLs do not expose the expected Resource Timing entries, and a disabled submit button does not synthesize form submission. Asset qualification now checks resolved local assets, running code and computed CSS; the state-guard probe explicitly dispatches the rejected form submission. The original lesson behavior did not require a change.

Only published `testing\browser\isolated.cjs`, SHA256 **86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055** (`53c0c0d`), is used through `openIsolatedLesson`, with awaited `finally` close. Existing offline Playwright **1.56.1**, Microsoft-signed Edge **156.0.4314.50**, Node **22.23.4** are test tooling only. The helper’s documented unattended-lifecycle limitation remains; no abandoned prototype, unsafe flags, foreground lease, download or package installation is used.

## Limits

IaC **N/A**: resource-free synthetic browser lesson. No actual broker backlog, autoscale, consumer ownership, real concurrency, ordering or completion-deadline certification. No cloud/IaC/scaffold/identity/credentials/deploy/spend. No production Node24, native Azure, source-parent completion or five-nines claim. One frozen S unit; tests, plumbing, repeated runs and refinement add no credit. Publication is review-pending; parent alone accepts once.
