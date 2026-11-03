# S064 — Introduce one new shard safely (synthetic)

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. This standalone A-S064 / D-S064 / SC-S064 bundle owns one frozen Kano S unit.

## Exact source and scope

The supplied source is the **S064 row in the repository README**, not a separate source `S064/README`:

> Copy and synchronize data before changing routing, with unambiguous write ownership.

The D-S064 acceptance is:

> Committed data is copied/synchronized before handoff; fencing prevents missing or duplicate writes.

The A-card objective is: **Assign a new shard before/after synchronization; reject ambiguous writer ownership.** Exact raw excerpts, the portable/atomic contract, packet rule, B sibling and D-S054 prerequisite are retained in `evidence/raw/source/`; provenance is in `evidence/source-contract.json`.

This lesson is one coherent exercise; no split or new test/plumbing/refinement unit is needed. B-S064, D-S064 and prerequisite D-S054 remain incomplete. Their actual database operations, synchronization, fencing, routing, native target and source-parent acceptance are not established here.

## Worked comparisons

Preconditions: one invented `training-tenant-1`, source `shard-a` epoch 1, and a new `shard-b`. Copy 1–6 committed effects, then commit 1–3 more on the source. Every run starts an independent fixture; retained comparisons are not persistent database state.

1. Keep the defaults and run. All five required effects synchronize before assignment. One candidate writer permits the modeled transfer to epoch 2. A new effect is applied once; a stale-source retry of the **same operation ID** is rejected. Accepted synthetic ledger entries determine the effect/duplicate counts.
2. Select **Before synchronization**. The copied snapshot lacks two committed effects. FAILURE blocks assignment; the active writer and route remain on `shard-a`.
3. Assign after **Snapshot only** synchronization. The delta is still missing, so assignment remains blocked.
4. Synchronize completely but select **Ambiguous** ownership. Two proposed owners are rejected, not activated. Correct data does not compensate for ambiguous ownership.
5. Select an unobserved data or ownership observation without another fault. UNKNOWN blocks transfer; unexecuted probes are not reported as zero duplicates. A known failure overrides an unknown observation.

Inspect required/copied/candidate IDs, individual gates, route/epoch, metrics and ordered trace. The history retains all eight allowed comparisons. Attempt nine and invalid controls preserve earlier results. Tab/Enter operate the form; errors focus the relevant control. **Reset rehearsal** restores defaults, clears history/results and focuses the first input. Reset uses the form prototype and is not shadowed by a control.

## Verification and immutable evidence

From the repository root, ordinary verification is read-only to all retained proof:

```powershell
node .\learning\S064\tests\syntax.cjs
node --test .\learning\S064\tests\model.test.cjs .\learning\S064\tests\surface.test.cjs .\learning\S064\tests\integrity.test.cjs .\learning\S064\tests\browser.test.cjs
```

The BDD feature preceded a loadable stub and the genuine assertion RED in `evidence/raw/red/`: expected `success`, actual `unknown`, `ERR_ASSERTION`. Exact stub/test/feature snapshots use non-discovered `.snapshot` names under `evidence/red/`. IaC was explicitly N/A after RED and before implementation. Focused green, syntax, real browser and integrity command streams have raw bytes, timestamps, hashes and exit receipts.

An initial tooling-provenance command used Windows PowerShell 5, whose inherited module path could not load its Security module. That failure is preserved in `evidence/raw/tooling/`; it is **not** behavioral RED. The corrected `tooling-002` receipt uses existing PowerShell 7, verifies the Microsoft signature and succeeds without installs or security changes.

A reproduced browser-test diagnostic is preserved in `evidence/raw/browser-diagnostic/` with its exact test snapshot. File-scheme resources did not populate Resource Timing, so that assertion was invalid. The corrected check inspects local asset URLs and the actually executed model/DOM instead. This test diagnostic is not the pre-implementation RED.

`evidence/raw/csp-diagnostic/` retains a separate actual observation: DevTools evaluation allowed its own `eval` despite page CSP, so it was not a valid eval-enforcement probe. The final test loads the owned `tests/csp-probe.js` as an ordinary external page script and requires actual inline/eval/connection violation events. No browser flags or CSP bypass setting are used.

Early receipt `headAtStart` fields were sampled while writing the receipt, so they are receipt-time Git context, not guaranteed command-start context. Final green/syntax/browser/integrity captures sample `headAtStart` before spawn and separately retain `headAtReceipt`. The raw historical receipts remain unchanged.

The actual browser tests use only published `testing/browser/isolated.cjs` (`53c0c0d`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `close()` in `finally`. They check real DOM/metrics, success/failure/unknown, keyboard, invalid controls, retained history, bounds, reset and enforced CSP. Existing offline Playwright **1.56.1**, signed Edge **156.0.4314.50**, and Node **22.23.4** are test tooling only. The helper's known unbounded lifecycle limitation remains; its abandoned lifecycle prototype is unqualified.

`CAPTURE_BROWSER_EVIDENCE=1` is an explicit one-time capture, not a normal test setting. Captures refuse to overwrite existing proof. Browser observations, local-only requests, source hashes, DOM snapshots and screenshots are retained under `evidence/raw/browser/`. Owned `.gitattributes` preserves every evidence byte (including original CRLF and stdout whitespace) and treats only the evidence subtree as binary for diffs; the integrity index separately qualifies canonical LF source using actual Git filters. No historical proof is rewritten by a normal run.

## Limits

No real authentication, registration, credentials, server, database, shard, management call or external request exists. “Exclusive fencing” is a selected synthetic fixture assumption, not actual database fencing evidence. No cloud/IaC/scaffold/deploy/spend, package/framework install, download, unsafe flag or foreground lease is used. There is no production Node.js 24, native/source-parent, live-user or reliability certification. Reset/reload clears memory; there are no cloud resources to clean up. Parent-only empirical acceptance remains separate from worker publication.
