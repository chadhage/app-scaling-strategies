# S049 — Ambiguous POST completion

**Training rehearsal - synthetic data - not a live Azure result**

Card **A-S049**, parent **D-S049**, packet **SC-S049**, frozen Kano **S**.
The exact source is [README S049](../../README.md#e-in-flight-requests-and-long-lived-work):
prevent duplicate business effects when a committed request loses its response and is retried.
The parent requires one business effect and either a correct client outcome or an explicit unresolved result.

## Run the exercise

Open [index.html](index.html) directly in a modern browser. No server, account, credentials,
subscription, dependencies or network connection is required. The bundle is independently
mountable; no catalog or shared files were changed.

1. Keep the default atomic key + payload + remembered-result ledger, same key, same payload,
   received retry response, 30 ms retry observation and 100 ms original deadline.
2. Select **Commit POST; lose response**. The first 10-unit synthetic order with `synth-key-A`
   has already committed `synth-effect-1`. The client is unresolved, not rolled back.
3. Select **Retry POST once**. Inspect the effect ledger, client result and synthetic trace.
4. Choose a prediction and **Check prediction and retain**. Prediction correctness is
   separate from the observed user-impact result.
5. **New attempt; keep history** restores default conditions but retains each prior
   configuration, result, client observation, ledger and trace. Six results are retained
   without eviction; a seventh attempt is blocked.
6. **Reset lesson and clear history** returns exact defaults and clears in-memory state.
   Reloading the page also clears it. Nothing is written to browser storage.

All controls are native keyboard controls. Tab moves through labeled settings and buttons.
Enter activates buttons. After commit, focus moves to retry; after retry, to prediction;
after assessment, to the next-attempt or reset button. Errors are announced and focused.
New attempt and reset focus the first setting. Reset does not rely on `form.reset()`,
and no control shadows that native method.

## Worked outcomes

Every attempt has one original POST and at most one retry. The intended operation is always
one 10-unit order. The changed-payload option is 20 units; the changed-key option is
`synth-key-B`. These are fixed synthetic teaching fixtures, not usable credentials.

| Retry conditions | Effects / client | User impact |
| --- | --- | --- |
| Atomic ledger, same key and payload, reply received by deadline | One effect; remembered `synth-effect-1`, 10 units | **Success** |
| No deduplication, even with the same key | Two effects | **Failure** |
| New key, even with atomic ledger | Two effects | **Failure** |
| Same key, changed payload, rejection received | One effect; synthetic 409 conflict | **Failure** |
| Missing key, atomic enforcement, rejection received | One effect; synthetic 400 missing-key rejection | **Failure** |
| Safe retry, response lost again | One observed effect; client explicitly unresolved | **Unknown**, not successful user completion |
| Observation later than original deadline | Budget exceeded, even if a correct replay arrives | **Failure** |
| Duplicate effects plus a lost response | Known duplication dominates uncertainty | **Failure** |

The original clock begins at the initial commit, not at retry. The deadline is inclusive:
100/100 ms succeeds under otherwise safe conditions; 101/100 ms fails. Times must be
whole decimal integers: retry observation 0–1000 ms, deadline 1–1000 ms.
Missing fields, unknown properties or enum values, accessors, wrong types, malformed numbers,
extra command arguments and invalid phases are rejected without changing private state.
Configuration locks after commit. Snapshots and retained history are deeply immutable.

The atomic option **assumes**, rather than proves, a durable shared atomic mapping from key
and payload to business effect and remembered result. Lost responses do not undo commits.
A new key is a new operation to that ledger; a key cannot safely be reused for a different payload.
There is no claim of exactly-once delivery or real distributed atomicity.

## Verification and provenance

Run from the repository root with the existing Node.js **22.23.4** test tooling:

```powershell
node --test --test-reporter=tap .\learning\S049\tests\model.test.cjs .\learning\S049\tests\surface.test.cjs .\learning\S049\tests\integrity.test.cjs .\learning\S049\tests\browser.test.cjs
node --check .\learning\S049\model.js
node --check .\learning\S049\lesson.js
```

Normal verification is read-only to retained proof. The actual browser checks use only the
published `testing\browser\isolated.cjs` helper, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
(`53c0c0d`), `openIsolatedLesson`, and awaited `close()` in `finally`.
They use existing offline Playwright **1.56.1** and signed installed Edge **156**.
No browser download, foreground browser, unsafe flag or dependency installation is needed.
The abandoned lifecycle prototype is not used; the helper's documented unattended lifecycle
limitation is not certified away by a successful lesson check.

Only a deliberate browser capture may add new, numbered proof files; existing files are
never overwritten:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node --test --test-reporter=tap .\learning\S049\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

[evidence.json](evidence.json) indexes actual results, raw command output and source bindings.
[evidence/source-contract.json](evidence/source-contract.json) records the exact source/card
and tooling provenance read before behavior design.
[evidence/red/focused-run.json](evidence/red/focused-run.json) records a genuine assertion RED
against a loadable stub, not missing code or tools. The earlier broad RED is also preserved:
16 assertion failures, two null-result TypeErrors and two passes, honestly distinguished
from the focused one-assertion RED. Stub, tests and BDD snapshots end in `.snapshot` and are
not automatically discovered as tests. Raw files are byte-preserved by owned attributes.
The [IaC N/A decision](evidence/iac-decision.json) was recorded after RED and before implementation.
Integrity checks bind implementation, tests, browser observations and retained raw evidence.

## Limits and remaining work

All data, HTTP-like codes, ledgers, times and traces are synthetic. There is no actual HTTP
request, real transaction, native protocol proof, host transition, real identity,
authentication, registration, cloud resource, IaC, scaffold, deployment or expenditure.
No packages, frameworks, shared runtime or production Node.js 24 were changed or certified.
No Azure result, five-nines claim or source-parent completion is inferred.

**B-S049 and the original D-S049 acceptance remain unfulfilled.** Native proof needs a
separately approved harness/target and real committed-request response-loss/retry evidence
with business-ledger and client observations. This local A lesson does not grant that readiness.
Tests, browser checks, publication and evidence are part of this single S unit, not extra units.
The worker reports actual results; only the parent performs empirical acceptance.
