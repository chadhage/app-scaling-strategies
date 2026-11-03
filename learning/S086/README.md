# A-S086 — Expired readiness is not approval

Open `index.html` directly in a browser. No server, setup, account or network is required.

**Training rehearsal - synthetic data - not a live Azure result**

## Exact source contract and worked exercise

- S086: **Expired readiness evidence:** Revalidate health before promotion when readiness information becomes stale.
- D-S086: **Expire readiness evidence before promotion**. Stale observations trigger revalidation or safe rejection; promotion cannot reuse an invalid health snapshot. Original parent dependency: D-S021.
- A-S086: **Expire readiness before promotion; force revalidation instead of trusting an old green snapshot.**
- Owner `worker-A-S086`; packet `SC-S086`; entry gate `SOURCE`; one frozen **S** unit `A-S086`. Parent acceptance is separate. B-S086 and D-S086 remain incomplete.

Preconditions: JavaScript enabled; fixed synthetic blue-v1 source, green-v2 candidate and initial healthy observation at tick 0. The invented lifetime is **age < 2 ticks**: age 1 is fresh, age 2 is expired. This is not a real clock, Azure default or universal health threshold.

1. Choose **healthy**, **unhealthy** or **missing** for the next revalidation, and an integer delay **2–5**. There are exactly 12 fixtures. Start locks these inputs.
2. **Advance synthetic clock** to expire the initial green snapshot. **Attempt promotion** without revalidation: FAILURE / EXPIRED, BLOCKED, blue-v1 retains 100% of synthetic routing.
3. **Revalidate now**, then **Attempt promotion**:
   - Healthy: SUCCESS / FRESH_HEALTHY, observation age 0; green-v2 gets synthetic routing only.
   - Unhealthy: FAILURE / UNHEALTHY; the original green does not override the new negative sample.
   - Missing: UNKNOWN / MISSING, no invented observation timestamp; the old green cannot substitute.
4. Alternatively, advance again **after revalidation but before promotion**: refreshed green expires too. Further revalidation is outside this bounded attempt; start a new one.
5. Predict the latest promotion outcome, then **Check prediction and retain**. Correctly predicting FAILURE is a learning success, not a successful promotion. Earlier rejected decisions remain visible and counted even if later revalidation succeeds.
6. **New attempt (keep history)** restores input defaults without deleting evidence. At six checked attempts, no seventh can start and none is evicted. **Reset all local data**, or reload, clears all inputs, errors, observations, traces, predictions, history and denominators.

At most two advances, one revalidation, three promotion decisions and seven trace events occur per attempt; the synthetic clock never exceeds 10. Freshness is assessed at the promotion decision, not cached during revalidation. Missing evidence is never SUCCESS.

## Outcomes and controls

Promotion outcome, gate-verifier result, user impact, cleanup and prediction correctness are separate. A blocked FAILURE or UNKNOWN is a synthetic safe abort before exposure. SUCCESS is only permission at this invented gate; actual user impact remains **UNVERIFIED — no live user journeys**. Cleanup is N/A because no resources exist. Retained totals count **all** promotion decisions, including earlier failures and unknowns, rather than only final successes. This is not an uninterrupted-transition percentage.

Exact plain records, allowlisted values and finite integer bounds are enforced in the model as well as the UI. Extra keys, inherited/accessor input, coercion, future observations, repeat/out-of-order actions and duplicate decisions are rejected atomically. Returned snapshots cannot mutate evidence. One attempt cannot continue after successful synthetic promotion, or check an old decision after changing evidence. Native keyboard-operable history disclosures expose each complete retained observation, decision and trace.

Tab, Enter and Space operate the lesson. It has a skip link, labels, live results, visible focus, focused errors, keyboard-scrollable tables and focused next actions. Validation focuses the invalid input; new/reset focuses Start; a full history focuses Reset. No control is named or identified `reset`; native `HTMLFormElement.prototype.reset` is invoked explicitly.

The file-based CSP allows local external scripts/styles only and blocks connections, inline execution, forms, frames and workers. Data is inserted as text. No external calls, storage, timers, randomness, credentials or management API exist.

## BDD → loadable stub → actual RED → IaC N/A → GREEN

`readiness.feature` preceded the loadable model stub. Its real RED ran **18 tests: 1 pass, 17 genuine ERR_ASSERTION failures**, with no missing code/tools and empty stderr. Unchanged BDD, fixture and model tests, plus the stub and raw TAP, remain in non-auto-discovered snapshots. The explicit resource-free IaC N/A decision follows RED and precedes implementation.

Run focused, read-only verification from the repository root:

```powershell
node --test --test-concurrency=1 .\learning\S086\tests\model.test.cjs .\learning\S086\tests\surface.test.cjs .\learning\S086\tests\integrity.test.cjs .\learning\S086\tests\browser.test.cjs
```

Syntax:

```powershell
Get-ChildItem .\learning\S086 -Recurse -File | Where-Object Extension -in '.js','.cjs' | ForEach-Object { node --check $_.FullName; if($LASTEXITCODE){throw "Syntax failed: $($_.FullName)"} }
```

Normal tests never write proof. Initial browser capture alone deliberately uses `CAPTURE_BROWSER_EVIDENCE=1`; capture rejects overwriting existing evidence. `tests\capture.cjs` is an explicit append-only provenance utility, not an automatically discovered test.

Actual browser verification uses only published `testing\browser\isolated.cjs`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`), `openIsolatedLesson` and awaited `finally` close. Existing offline Playwright **1.56.1**, signed installed Edge **156.0.4314.50** and Node **22.23.4** are test tooling, not production24 validation. No foreground browser lease or abandoned lifecycle prototype is used. The helper's documented unattended shutdown limitation remains; this lesson does not qualify it.

## Provenance and limits

- `evidence\source-contract.json`: exact S086, D-S086, A/B, atomic, portable, SOURCE and packet clauses, with frozen Git baseline.
- `evidence\raw\source`: compressed byte-exact working **CRLF** observations, separately hashed canonical Git **LF** source. Current authoritative slices must still match; unrelated concurrent source changes need not match whole-file hashes.
- `evidence\red`, `red.json`, `raw\red.*`: original loadable stub, BDD/tests, actual failing assertions and command provenance.
- `evidence\iac-decision.json`, `tooling.json`: resource-free decision and observed offline runtime/signature.
- `evidence\browser.json`, screenshots and `green.json`: actual DOM, keyboard, error, failure/unknown, aging, retained denominator, history bound, reset/reload, narrow viewport and enforced CSP checks.
- `evidence\raw\csp-diagnostic.json`: the retained initial diagnostic, not passing worker-CSP evidence. A file worker was rejected by origin checks before CSP; the final test uses a blob worker and requires an actual `worker-src` violation. Blocked form submissions target a named disposable frame so they do not leave a pending main-frame navigation.
- `evidence\content-index-final.json`: canonical Git-clean text hashes and byte-exact raw evidence. The first index remains unchanged; the final index covers it too. Integrity verification reconstructs the original indexed source from four preserved byte-exact archives, as well as verifying all final owned files, without writing Git objects or proof.
- `evidence\publication-preflight.json`, `raw\publication-preflight.*`: the actual initial publisher rejection, before any commit, because raw TAP blank lines and CRLF snapshots triggered whitespace checking. Narrow owned `-text -whitespace` attributes preserve these raw bytes instead of laundering proof. Original and final syntax observations are append-only; only raw/red evidence is exempted, not lesson source.

No actual readiness, health, time, promotion, routing, native Azure, production Node24 or source-parent certification. No five-nines claim. No cloud, IaC, scaffold, identity, credentials, deployments, spending, downloads, packages, frameworks or shared/root changes. Tests, plumbing and refinement earn no extra credit. Only parent-owned acceptance may close this one S unit.

The [source Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer) applies. This lesson implies no Microsoft endorsement, support or SLA.
