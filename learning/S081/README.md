# A-S081 — Desired is not observed

Open `index.html` directly in a browser. No server, installation or Azure account is required.

**Training rehearsal - synthetic data - not a live Azure result**

## Contract and worked exercise

- Source S081: **Durable lifecycle tracking:** record deployment identity, readiness, routing participation, draining and retirement explicitly.
- D-S081 requires an interactive desired/observed lifecycle timeline and gate inspector. Endpoint, epoch, readiness, routing, drain and retention evidence control transitions; a warm boolean alone cannot approve migration.
- A-S081 objective: **Advance desired/observed states; a warm boolean cannot bypass routing/drain gates.**
- Owner `worker-A-S081`; one frozen **S** unit `A-S081`; packet `SC-S081`; entry gate `SOURCE`. Parent-owned empirical acceptance is pending. Tests, plumbing and refinement earn no credit.
- B-S081 and D-S081 remain incomplete. Their actual lifecycle, epochs, platform observations and original source acceptance are not certified by this lesson.

Preconditions: JavaScript enabled; the fixed synthetic green-v2 deployment, desired epoch 7 and legacy `warm = true`. Choose six allowlisted conditions before starting. There are exactly 648 input combinations. Inputs cannot change during an attempt.

1. **Start / request CREATED.** Desired becomes CREATED; observed remains UNOBSERVED.
2. **Observe requested gate.** Inspect the required, actual and SUCCESS/FAILURE/UNKNOWN evidence. Only a passing observation advances observed state.
3. **Request next state**, then observe again. Follow CREATED → WARMING → READY → CANARY → ACTIVE → DRAINING → RETAINED → RETIRED. There are at most 16 request/observation events.
4. Check a prediction and retain the complete trace. A correct prediction of FAILURE is a learning success, not a successful migration.
5. **New attempt** restores input defaults without deleting history. Six attempts are retained without eviction. **Reset all local data**, or reload, clears inputs, evidence, prediction, errors, traces and counters.

### Fixed evidence and expected assertions

| Signal | Passing synthetic evidence | Negative / unknown exercise |
| --- | --- | --- |
| Identity / endpoint / epoch | green-v2, `/synthetic/green-v2`, observed epoch 7 = desired 7 | Missing endpoint or epoch is UNKNOWN; epoch 6 is FAILURE. |
| Readiness | Healthy; age 1 ≤ 2 synthetic ticks; compatible; capacity 4 ≥ 3 | Age 3 is stale; unhealthy/incompatible/capacity 2 is FAILURE; missing is UNKNOWN. |
| Routing | Canary desired/effective 10/10%; active 100/100%; drain 0/0%; 10/10 synthetic journeys per exposed stage | Partial fixture passes canary but blocks ACTIVE at desired 100/effective 60. `warm = true` cannot advance observed beyond CANARY. |
| Drain | New admissions 0; clients 0; work 0; ownership holders 0; checkpoint accounted for | Remaining clients 2, work 1, owner 1 and missing checkpoint block RETAINED; observed stays DRAINING. |
| Retention | Compatible rollback artifacts remain ready; tick 8 meets deadline 8; remaining dependencies 0 | Tick 7 blocks RETIRED; observed stays RETAINED. Missing retention is UNKNOWN. |

These are fixed stage-local observations, not a real clock, health feed or service. Readiness is evaluated as a fresh stage-local sample where required. No sleeps, randomness, controller requests or network traffic drive results.

A known failure dominates missing evidence **at the same evaluated gate**; both counts remain visible. Earlier missing gates stop the run, so unobserved later failures are not fabricated. SUCCESS means only that this synthetic path reached observed RETIRED. Failure, uncertainty and prediction mistakes remain in the retained attempt denominator; no five-nines statistic or actual user-interruption metric is claimed.

## Guards, keyboard and limits

Exact plain records, allowlisted string values and adjacent request/observation ordering are enforced by the model as well as button availability. Extra fields, inherited/accessor input, repeats and out-of-order calls are rejected atomically. Returned snapshots cannot mutate model history.

Use Tab, Enter and Space. A skip link, visible focus, labels, live status and a focused error alert support keyboard operation. Validation focuses the invalid field. New attempt/reset focuses Start. At six retained attempts, focus moves to Reset; the seventh attempt is rejected without eviction. `reset-lesson` does not shadow native `form.reset`; the app invokes the native prototype explicitly.

Restrictive file-based CSP allows only local scripts/styles and blocks connections, inline execution, forms, frames and workers. Data is inserted as text. No storage, management calls, credentials, cloud, IaC, scaffold, identity registration, deployment, expenditure, package/framework changes, downloads or unsafe flags.

Only the fixed canary path is covered. Optional direct promotion, abort, quarantine, rollback, controller restart, command retry/fencing and mid-run evidence changes are not implemented. History is memory-only, **not durable controller persistence**. There is no actual controller/deployment/routing/drain/ownership certification, production Node24 validation, native Azure result or source-parent completion.

## BDD → RED → IaC N/A → GREEN

`lifecycle.feature` preceded the loadable model stub and its actual behavioral RED: **15 tests, 1 pass, 14 failures, 14 genuine ERR_ASSERTION failures**, no missing code/tools. The original feature, fixture, stub and test are retained as non-auto-discovered `.snapshot` files with raw compressed TAP. The explicit IaC N/A decision follows RED and precedes implementation.

Focused, read-only verification from the repository root:

```powershell
node --test --test-concurrency=1 .\learning\S081\tests\model.test.cjs .\learning\S081\tests\surface.test.cjs .\learning\S081\tests\integrity.test.cjs .\learning\S081\tests\browser.test.cjs
```

Syntax:

```powershell
Get-ChildItem .\learning\S081 -Recurse -File | Where-Object Extension -in '.js','.cjs' | ForEach-Object { node --check $_.FullName; if($LASTEXITCODE){throw "Syntax failed: $($_.FullName)"} }
```

Normal verification never rewrites committed proof or screenshots. `CAPTURE_BROWSER_EVIDENCE=1` is deliberately enabled only for the initial browser capture, not ordinary reruns. Capture rejects overwriting published evidence. `tests\capture.cjs` is an explicit append-only provenance utility, not an auto-discovered test.

The actual isolated browser checks use only published `testing\browser\isolated.cjs`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`), `openIsolatedLesson`, and awaited `finally` cleanup. Existing offline Playwright **1.56.1**, signed installed Edge **156.0.4314.50**, and Node **22.23.4** are the tested tooling, not production24 proof. No integrated-browser foreground lease is used. The abandoned lifecycle prototype is unqualified; the published helper retains its documented shutdown limitations.

## Evidence and integrity

- `evidence\source-contract.json`: exact S081/D-S081/A/B/atomic/portable/packet/lifecycle/outcome slices, compared to declared Git baseline and current authoritative slices.
- `evidence\raw\source`: compressed, byte-exact working **CRLF** and Git-source observations, separately hashed; source text is not silently normalized before capture.
- `evidence\red`: loadable stub, unchanged BDD/fixtures/tests, actual failing TAP and timestamps.
- `evidence\iac-decision.json`, `tooling.json`: explicit resource-free decision and verified offline tooling provenance.
- `evidence\browser.json`, screenshots: actual DOM, desired/observed gates, failures, unknowns, keyboard, errors, history bound, reset/reload, narrow viewport and enforced CSP.
- `evidence\content-index.json`: canonical LF hashes for Git text, byte-exact raw evidence; narrow owned `.gitattributes` preserves snapshots/compressed output/images. Integrity tests verify Git clean-filter object hashes without writing objects.
- `evidence\verification`: append-only raw command results, excluded from the content-index self-reference. Publication commit/tag and remote checks are recorded by the authorized publisher and worker report; only the parent may Accept.
