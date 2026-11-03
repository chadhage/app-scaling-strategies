# A-S087 — Partial routing is not convergence

Open `index.html` directly in a browser. No server, installation or Azure account is required.

**Training rehearsal - synthetic data - not a live Azure result**

## Exact source and scope

- S087 / root README: **Partially applied routing change:** Verify effective routing and retain required old capacity until convergence is established.
- D-S087: Add delayed/partial routing application and observed-cohort verification. **Desired percentages do not imply convergence; dependent old capacity remains until effective routing is evidenced.** Its native dependency is D-S003; this standalone SOURCE-gated lesson does not certify either parent.
- A-S087 objective: **Apply only part of a routing change; remaining clients must retain a valid destination.**
- Owner `worker-A-S087`; packet `SC-S087`; entry gate `SOURCE`; one frozen **S** unit `A-S087`. Parent alone awards empirical acceptance. Tests, plumbing and refinement earn no additional credit.
- B-S087 and D-S087 remain incomplete. No actual routing propagation, client migration or retirement is certified.

## Worked exercise

Preconditions: JavaScript enabled; eight fixed synthetic clients, `synthetic-client-01` through `08`; ready old-v1 and new-v2 endpoints, each with capacity for all eight. These are strings and arithmetic, not real services, accounts or authentication.

1. Select desired new-v2 **50%** (clients 01–04) or **100%** (all eight), an observation fixture, and retained old capacity or a synthetic loss fault.
2. **Request routing change.** Desired routing changes; effective routing remains unobserved. Inputs lock. The active attempt already counts in the attempted denominator.
3. **Observe synthetic cohorts.** Inspect each client's intended route, actual route, destination and journey verdict. No success is inferred from a command or healthy old requests.
4. **Attempt old release.** The guard rejects release if any old client, unresolved route or failed convergence remains. It permits release only when all eight observed clients use ready new-v2. This is a route-only synthetic gate, **not real retirement authorization**.
5. Check your prediction. A correct prediction of FAILURE is learning success, not successful migration.
6. **New attempt** restores defaults and retains all prior evidence. Six complete traces are retained, without eviction. **Reset all local data**, or reload, clears everything.

### Fixed synthetic evidence

| Fixture | Desired 50% | Desired 100% | With retained old capacity |
| --- | --- | --- | --- |
| Delayed | New 0, old 8; effective 0% | New 0, old 8; effective 0% | FAILURE convergence; all eight journeys pass; retain old. |
| Partial | New 2, old 6; effective 25% | New 4, old 4; effective 50% | FAILURE convergence; all eight journeys pass; retain old. |
| Converged | New 4, old 4; effective 50% | New 8, old 0; effective 100% | SUCCESS; retain old at 50%, route-only release allowed at 100%. |
| Missing | Clients 01–04 unknown; 05–08 old | Same observations; four known target mismatches | Effective percentage UNKNOWN; 50% result UNKNOWN, 100% result FAILURE; retain old in both. |

Injecting old-capacity loss makes each **observed old client** a failed journey. For default 100%/partial/loss, four journeys pass and four fail. For 50%/missing/loss, four fail and four remain unknown; failure dominates uncertainty but neither count is hidden. No missing client route is guessed. A rejected release does not repair an injected loss.

SUCCESS requires exact intended cohort convergence and all eight modeled journeys passing. FAILURE means a known routing mismatch or failed journey. UNKNOWN means incomplete evidence without a known failure. At 50% success, only four intended migrations are evidenced; four clients stay old. Old-only success is not a successful migration. Counts are bounded synthetic observations, not availability estimates or a five-nines claim.

The model has exactly **16** allowed configurations and three adjacent actions per attempt. It uses no random numbers, sleeps, wall-clock propagation, management calls or real traffic. Observations do not evolve during a run. Re-observation, reconciliation, real DNS/cache behavior, real cohorts, sessions, jobs, ownership and rollback-retention windows are out of scope.

## Guards, keyboard and reset

Exact plain records, exact own keys, non-accessor string enums and adjacent state transitions are enforced by the model, not just disabled buttons. Invalid, inherited, extra-key, repeated and out-of-order actions are rejected without changing evidence. Returned snapshots cannot mutate history.

Use Tab, Enter and Space. The skip link, visible focus, labels, live status and focused errors support keyboard operation. Validation focuses the invalid field; state errors focus the alert. New attempt/reset focuses Request. After checking the sixth prediction, focus moves to Reset. A seventh attempt is rejected, never silently evicted.

`reset-lesson` does not shadow native `form.reset`; the native prototype is called explicitly. Reset clears selections, prediction, errors, invalid markers, details, client rows, traces, history and counters. History is memory-only, not durable state.

Restrictive file-based CSP allows local scripts/styles only and blocks connections, inline execution, forms, frames, objects and workers. Data is inserted as text. No storage, credentials, cloud, IaC, scaffold, identity registration, deploy/spend, downloads, packages/framework changes, unsafe flags or foreground browser leases.

## BDD → actual RED → IaC N/A → GREEN

`routing.feature` preceded the loadable stub and actual behavioral RED: **16 tests, 1 pass, 15 genuine ERR_ASSERTION failures**, no missing code/tools. The feature, fixtures, stub and unchanged model tests are preserved as non-auto-discovered `.snapshot` files, with compressed raw TAP and timestamps. Explicit IaC N/A follows RED and precedes implementation. All 16 unchanged model tests then passed.

Focused, read-only verification from the repository root:

```powershell
node --test --test-concurrency=1 .\learning\S087\tests\model.test.cjs .\learning\S087\tests\surface.test.cjs .\learning\S087\tests\integrity.test.cjs .\learning\S087\tests\browser.test.cjs
```

Syntax:

```powershell
Get-ChildItem .\learning\S087 -Recurse -File | Where-Object Extension -in '.js','.cjs' | ForEach-Object { node --check $_.FullName; if($LASTEXITCODE){throw "Syntax failed: $($_.FullName)"} }
```

Normal tests do not rewrite proof or screenshots. `CAPTURE_BROWSER_EVIDENCE=1` is deliberately enabled only for the initial browser capture, never ordinary verification. Capture rejects overwriting existing proof. `tests\capture.cjs` is an explicit append-only provenance utility, not an auto-discovered test.

Actual browser checks use only published `testing\browser\isolated.cjs`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`), `openIsolatedLesson`, and awaited `finally` close. Existing offline Playwright **1.56.1**, signed installed Edge **156.0.4314.50** and Node **22.23.4** are tooling, not production24 proof. The abandoned lifecycle prototype is unqualified; the published helper retains its documented shutdown limitations.

## Provenance and review

- `evidence\source-contract.json`: exact S087 / D-S087 / A-B / atomic / portable / packet / lifecycle / outcomes, qualified against a declared Git baseline and current authoritative slices.
- `evidence\raw\source`: byte-exact compressed working **CRLF** and Git-source observations, separately hashed; source text was not normalized before raw capture.
- `evidence\red`: loadable stub, unchanged BDD/fixtures/tests, actual failing TAP and timestamps.
- `evidence\iac-decision.json`, `tooling.json`: resource-free decision and verified offline tooling.
- `evidence\browser.json`, screenshots: actual DOM/cohort/destination results, failure/unknown, keyboard, error, bounded history, reset/reload, narrow viewport and enforced CSP.
- `evidence\content-index.json`: canonical LF source hashes and exact raw hashes. Narrow owned `.gitattributes` preserves raw evidence. Integrity tests verify Git clean-filter object hashes without writing objects.
- `evidence\verification`: append-only raw command outputs and hashes. The index excludes this append-only directory and itself to avoid recursive sealing.

Publication uses authorized `publish.ps1`, an `[A-S087][S]` evidence label, Copilot coauthor, annotated `kanban/A-S087/<12sha>`, atomic main/tag push and remote verification. The local worker report supplies the commit/tag; it does not mark its own card Done.
