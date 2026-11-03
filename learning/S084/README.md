# S084 — Duplicate command delivery

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, framework, installation or management access is needed.

## Exact source and scope

- README **S084**: “Duplicate command delivery: Make provisioning, routing, and cleanup retries idempotent; do not accidentally perform two swaps.”
- Backlog **D-S084**: “Add duplicate command delivery/retry against provisioning, routing, and cleanup steps.” Acceptance: “Idempotency prevents duplicate resources, repeated swaps, and contradictory state; each operation remains auditable.” Source dependency **D-S081**.
- **A-S084**, frozen **S**, packet **SC-S084**, worker **worker-A-S084**: “Retry commands; recognize duplicate resources or unintended second swaps.”
- **B-S084** separately requires a native command retry sequence, idempotent effects and audit identity. B-S084 and D-S084 remain incomplete.

The exact source rows, portable/atomic contract, packet rule, parent-completion and evidence policies were read before behavior design and preserved in `evidence\source-contract.json`. Compressed source snapshots retain original working bytes, including CRLF, separately from their declared Git baseline. Concurrent board status is not frozen; exact acceptance slices must still agree.

## Worked exercise

**Preconditions:** retained-v1 is the old synthetic resource. Three original deliveries record candidate-v2, swap the route to it, then remove retained-v1. The next three deliveries repeat the exact provision, routing and cleanup operation keys and payloads.

1. Keep **Remember results by operation key** and **Complete receipts**. **Inspect originals → Retry same keys → Verify** yields PASS: one candidate, one swap, one removal, six known delivery outcomes. Three retries replay remembered receipts without additional effects.
2. Predict PASS, **Check prediction and retain**, then **New attempt**. Select **Blind replay** and repeat the steps. FAIL: candidate-v2-copy duplicates the resource; the unintended second swap routes back to removed retained-v1. Cleanup retry reports an already-absent target error. The original audits remain alongside the retries.
3. Use remembered results with **Cleanup retry receipt unavailable**. The first five outcomes are known; the sixth is UNKNOWN. Last observed inventory and routing look safe, but final cleanup/state evidence is incomplete: UNKNOWN, never PASS.
4. Combine blind replay with that unavailable receipt. Known duplicate/second-swap/contradictory-state faults still yield FAIL, and the unknown cleanup outcome remains visible.

These are four **fixed synthetic traces**, not command execution, a resource simulator connected to a host, or claimed Azure retry defaults. Even blind replay's successful command receipts do not make its effects safe. Audit actor stamps are fixture labels, not authenticated identity proof. Six deliveries are not six user journeys or a migration success rate.

## Guards, keyboard, history and reset

Only exact two-field enum records and ordered phases are accepted: `idle → delivered → retried → verified → checked`. There is no arbitrary command, resource name, endpoint, path or script input. Malformed/accessor/extra fields, repeated and out-of-order actions cannot mutate observations.

Tab, arrows, Enter and Space operate the lesson. Focus advances to the next valid action; invalid fields or the live alert receive focus. A skip link, visible focus, readable status text and scrollable table regions support keyboard and narrow-screen operation.

Checking retains exact settings, all six audits, observed metrics, result, unknowns, trace and prediction. Prediction correctness is separate from the measured result. New attempt restores safe defaults without deleting failures. Four attempts block further work without eviction. **Reset all local data** clears settings, trace, predictions, errors/invalid markers, history, totals and expanded details, returning focus to Inspect originals. Reload also clears memory. Neither form shadows native `reset()`.

## Verification and provenance

Ordinary focused verification is read-only and does not refresh historical proof:

```powershell
node --test --test-concurrency=1 .\learning\S084\tests\model.test.cjs .\learning\S084\tests\surface.test.cjs .\learning\S084\tests\integrity.test.cjs .\learning\S084\tests\browser.test.cjs
```

Sequence: exact source → BDD → loadable stub → qualified assertion RED → IaC N/A → implementation/refactoring → model GREEN → actual isolated DOM/keyboard/error/reset/failure/unknown/CSP checks → focused syntax/integrity GREEN.

Qualified RED: **17 tests, 2 pass, 15 genuine assertion failures**, including `idle` instead of `delivered`. The earlier unqualified prelude also had null-observation TypeErrors; its original raw output and snapshots are preserved honestly, not presented as the qualified RED. Explicit observation assertions made the unchanged stub's failure entirely assertion-based. Both snapshot sets use non-auto-discovered `.snapshot` names.

A real narrow-screen keyboard check later found a fractionally clipped focused button. Its assertion failure and pre-fix inputs are also preserved. CSS scroll padding/margins repaired the actual viewport behavior; the visibility assertion was not weakened.

`tests\capture.cjs` is deliberate append-only provenance capture, not normal verification. Set **`CAPTURE_BROWSER_EVIDENCE=1`** only for intentional browser capture; existing observations cannot be overwritten. Ordinary browser checks write no lesson/proof files and await their isolated session's close in `finally`.

Only published `testing\browser\isolated.cjs`, SHA256 **86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055** (`53c0c0d`), is used with existing offline Playwright **1.56.1**, signed installed Edge **156** and Node **22.23.4**. No packages, downloads, unsafe flags, foreground lease or abandoned lifecycle prototype. The shared helper's documented unattended lifecycle limitation remains.

`evidence\content-index-final.json` seals canonical LF Git-source text and narrowly attributed exact raw proof bytes. Verification captures and that index itself are excluded to avoid self-reference. Integrity also checks read-only `git hash-object --path` clean-filter output without staging.

The initial seal caught Windows separators being interpreted literally in Git's internal attribute key. Its actual failure and input snapshot are preserved. Only that Git index name is normalized; filesystem paths remain Windows paths. The original browser proof/seal stay historical; `evidence\browser-final.json` and the final seal qualify the corrected sources.

## Remaining work and limits

IaC **N/A**: resource-free browser lesson. No actual command retries, resource idempotency, swaps, audit identity, native Azure behavior, production Node24, source-parent completion or reliability certification. No cloud/IaC/scaffold/identity/credentials/deploy/spend. Local reset has no cloud cleanup obligations.

No additional portable behavior is needed for this bounded unit. Native B-S084 and parent D-S084 remain separate To Do work requiring their own prepared, authorized host/control/data gates and original D-S081 dependency; readiness is not inferred from this lesson. Tests, browser plumbing and refinement earn no additional credit. Publication is review-pending; parent alone accepts once.

The [source Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer) applies.
