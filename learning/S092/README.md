# A-S092 — Canary rollback does not erase interruptions

Open `index.html` directly in a browser. No server, install or Azure account is needed.

**Training rehearsal - synthetic data - not a live Azure result**

## Exact source and one-unit scope

- S092 / root README: **Candidate fails during canary:** Stop further exposure and reverse routing; count interruptions already experienced.
- D-S092: Add candidate failure during a measured canary stage. **Expansion stops and recovery executes; failed journeys remain in the attempted-transition denominator and interruption counts, not the success numerator.** Original dependency: D-S003.
- D-S003 requires fresh journey evidence before expansion and retained actual cohorts/interruptions through rollback. Its native requirements are not fulfilled by this SOURCE-gated lesson.
- A-S092 inventory objective: **Fail a canary; failed journeys remain interruptions despite successful rollback.**
- Owner `worker-A-S092`; packet `SC-S092`; one frozen **S** unit `A-S092`. The atomic/portable contract and default packet rule were read before behavior design. Parent alone accepts once; testing, plumbing and refinement earn no extra credit.
- B-S092, D-S092, their original dependencies and native acceptance remain incomplete. All actions here are **teaching-trace data**, never deployment or resource operations.

## Worked exercise and accounting

Preconditions: JavaScript enabled; eight synthetic clients `synthetic-client-01` through `08`; ready retained `old-v1`; one measured `candidate-v2` stage of 25% (two selected clients) or 50% (four). HTTP statuses and latency values are synthetic fixtures, not network measurements. The illustrative budget is 250 ms.

1. Configure a stage, a canary observation, and confirmed or missing rollback evidence.
2. **Start measured canary.** Exactly the selected clients enter the attempted-transition denominator, initially UNKNOWN. Old-only successful comparisons are excluded from the transition numerator and denominator.
3. **Observe synthetic canary.** Healthy selected journeys use synthetic HTTP 200 / 120 ms. The failed first journey is HTTP 503 / 60 ms. Missing outcomes remain UNKNOWN. A known failure dominates uncertainty without concealing either count.
4. **Attempt expansion gate.** Failure or unknown evidence rejects expansion, stops new candidate admission and requests zero candidate routing. Effective routing remains the original observed stage until rollback evidence is read. Healthy evidence makes the next-stage gate eligible **without executing another stage**.
5. For a stopped canary, **Rehearse rollback.** Confirmed evidence observes zero candidate routing and eight separate old-recovery checks, HTTP 200 / 80 ms. Missing evidence leaves effective routing and recovery UNKNOWN. Neither rewrites original canary outcomes.
6. Predict the original canary and old recovery results. A correct FAILURE/SUCCESS prediction earns learning PASS, not a successful user migration.
7. **New attempt — keep history** restores defaults while retaining all checked evidence. Six attempts maximum, never evicted. **Reset all local data**, or reload, clears the entire memory-only session.

| Canary fixture | 50% stage original journeys | Expansion | Confirmed old recovery | Original stage result |
| --- | --- | --- | --- | --- |
| Healthy | 4 successful, 0 interrupted, 0 unknown | Eligible, not executed | NOT_ATTEMPTED | SUCCESS |
| Failed | 3 successful, 1 interrupted, 0 unknown | Rejected | SUCCESS | FAILURE |
| Missing | 3 successful, 0 interrupted, 1 unknown | Rejected | SUCCESS | UNKNOWN |
| Mixed | 2 successful, 1 interrupted, 1 unknown | Rejected | SUCCESS | FAILURE |

At 25%, the denominator is two; subtract the same one interruption and/or one unknown. Missing rollback evidence changes recovery to UNKNOWN, not the original canary counts. The default failed 50% attempt stays **3/4 (75%), one interruption**, even after all eight old-recovery checks pass.

The declared event is one complete synthetic selected-client journey across this single canary stage. `attempted = successful + interrupted + unknown`. Session totals include checked history **and an active unchecked attempt**, without counting a checked active view twice. Empty samples are “No sample,” never 100%. No native migration or statistical user-continuity conclusion is drawn.

## Guards and browser UX

Exact plain records, exact own keys, non-accessor string enums and adjacent transitions are model guards, not just disabled UI. Invalid, inherited, extra-key, coerced, repeated and out-of-order inputs/actions are rejected atomically. Returned snapshots and caller configuration cannot alter retained evidence.

Use Tab, Enter and Space. The skip link, visible focus, labels, live status and focused errors support keyboard operation. Each valid action focuses the next usable step. Validation focuses an invalid field; state errors focus the alert. At six attempts, focus advances to Reset and a seventh cannot start.

`reset-lesson` does not shadow native `form.reset`; the native prototype method is called explicitly. Reset clears configuration, predictions, errors/invalid markers, client rows, routes, results, trace, history and denominators. New attempt does not erase history. No browser storage, real identities, user data or credentials are used.

Restrictive local-file CSP blocks connections, inline execution/eval, forms, frames, objects and workers. UI data is inserted as text. No cloud, IaC, scaffold, identity, credentials, deploy/spend, new packages/frameworks, shared/root edits, downloads, unsafe flags or foreground browser leases.

The CSP test loads owned `tests\csp-probe.js` as an ordinary local browser script. This avoids debugger evaluation's privileged eval behavior and proves the actual script boundary. Its connections/frames/objects use synthetic data URIs; the blocked form targets only this local lesson.

## BDD → loadable stub → actual RED → IaC N/A → GREEN

`canary.feature` preceded the loadable stub and actual RED: **16 model tests; 1 API-shape pass and 15 genuine ERR_ASSERTION failures**, with no missing code or tools. Raw stdout/stderr and unchanged BDD/fixtures/model assertions are preserved in non-auto-discovered snapshots. The explicit resource-free IaC N/A was recorded after RED and before implementation.

Focused normal verification from the repository root is read-only:

```powershell
node --test --test-concurrency=1 .\learning\S092\tests\model.test.cjs .\learning\S092\tests\surface.test.cjs .\learning\S092\tests\integrity.test.cjs .\learning\S092\tests\browser.test.cjs
```

Syntax:

```powershell
Get-ChildItem .\learning\S092 -Recurse -File | Where-Object Extension -in '.js','.cjs' | ForEach-Object { node --check $_.FullName; if($LASTEXITCODE){throw "Syntax failed: $($_.FullName)"} }
```

`tests\capture.cjs` is an explicit append-only provenance tool, not an auto-discovered test. Normal checks never rewrite evidence. **CAPTURE_BROWSER_EVIDENCE=1 is deliberate initial capture only** and refuses to overwrite existing proof.

Actual browser checks use only published `testing\browser\isolated.cjs`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`), `openIsolatedLesson`, and awaited `finally` close. Approved existing tooling is offline Playwright **1.56.1**, signed installed Edge **156.0.4314.50**, Node **22.23.4**. The abandoned lifecycle prototype is unqualified; the published helper retains its documented shutdown deadline limitation.

## Raw provenance and review boundary

- `evidence\source-contract.json` qualifies exact README S092, D-S092, A/B, D-S003, atomic/portable, SOURCE and packet acceptance against a declared Git baseline and current authoritative slices.
- `evidence\raw\source` preserves compressed **byte-exact working CRLF** and separate Git-source observations. Full shared-document admin changes are distinguished from unchanged authoritative acceptance.
- `evidence\red` retains the loadable stub, unchanged assertions/fixtures/BDD, actual assertion RED and timestamps.
- `evidence\iac-decision.json`, `tooling.json`, verification transcripts and `syntax.json` record actual local execution and its limits.
- `evidence\browser.json` and screenshots record actual DOM, keyboard, error, failure/unknown, routing/recovery, retained accounting, bounds, reset/reload, narrow viewport and enforced CSP checks, with awaited cleanup.
- `evidence\raw\browser-attempt-01` preserves the initial browser assertion source and actual diagnostic output, explicitly **not a pass**. Seven initial groups passed, but the CSP wait failed: debugger eval bypassed the eval boundary and data-URL form navigation was independently denied before a form-action violation. The final unprivileged local-script probe tests both boundaries correctly.
- `evidence\content-index.json` hashes canonical LF owned sources separately from **raw evidence bytes**. Narrow owned `.gitattributes` protect raw snapshots and captures; integrity checks do not normalize raw provenance.

No native canary failure, rollback, Azure result, production24, source-parent or actual user-continuity certification is claimed. Worker publication is not parent acceptance.
