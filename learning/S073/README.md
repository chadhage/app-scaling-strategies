# S073 — Cache unavailable: required profile recovery

**Training rehearsal - synthetic data - not a live Azure result**

A-S073 · D-S073 · SC-S073 · frozen **S**, one unit. Open [index.html](index.html) directly; no server, account, package installation or deployment.

## Exact source and scope

- [S073 in the source README](../../README.md#h-caches-queues-and-background-workers): “Use a tested durable recovery path that meets budgets; never silently substitute empty user state.”
- D-S073: correct required state is recovered within budgets; empty sessions/profiles are never a successful fallback.
- A-S073: lose cache access; an empty user profile must not be a successful fallback.
- The atomic/portable contract and default SC-S073 packet rule, raw source bytes and immutable Git blobs are preserved in [source evidence](evidence/source-contract.json).

This lesson measures **synthetic profile recovery**, not authentication or sessions. All IDs, profile fields, times and observations are fictional. No real user input, credentials, registration, cache outage or durable store is involved.

## Conduct the exercise

Required state is `synthetic-profile-073`, revision **7**, label `Sample learner 073`, dark theme and two fixed saved item IDs. Every field must remain intact. Cache success costs 10 synthetic ms; observed loss costs 20 ms; durable recovery adds 90 ms, totaling **110**. A result at the exact declared budget is permitted.

1. Keep **cache access lost**, **durable receipt correct**, budget **150**. Run, inspect the trace, predict SUCCESS and check. Exact state returns at 110 ms.
2. Choose **New attempt**; set recovery to **empty**. Run and predict FAILURE. A fast `{}` is not recovered required state.
3. Use durable recovery with **80** ms. Correct state remains visible, but exceeding the journey budget is FAILURE.
4. With budget **110**, correct recovery succeeds at the boundary. Stale revision, a different profile, an empty receipt and explicit unavailability fail.
5. Select a missing receipt at budget 150: UNKNOWN, not recovery proof. At budget 80 the measured 110 ms already establishes FAILURE. A missing cache observation is UNKNOWN and never invents a fallback.
6. Explicit failure is an honest interrupted operation, not success. The available-cache baseline reads known correct state without using the selected fallback.

The learning check only assesses the prediction. It never rewrites the observed result. Every run, including unchecked and unsuccessful runs, is retained with its configuration and trace. Six slots are bounded; reset is required before a seventh. New attempts retain history and restore defaults. Reset clears all local history, traces, errors and predictions.

Use Tab, arrows, Enter and Space. Run focuses the prediction, check focuses New attempt (or Reset when full), and New/Reset focus the cache control. Errors are visible and announced; malformed controls and out-of-order actions cannot create results. Neither reset button shadows the forms' native `reset()` method.

## Verification

Existing Node **22.23.4**, offline Playwright **1.56.1**, signed installed Edge **156** only:

```powershell
$tests = (Get-ChildItem .\learning\S073\tests -Filter *.test.cjs).FullName
node --test --test-concurrency=1 $tests
```

Ordinary tests are read-only and preserve the recorded evidence. `tests\capture.cjs` is an explicit, exclusive capture utility, not an automatically discovered test. The loadable RED stub and its tests are preserved as `.snapshot` files outside test discovery: five actual assertion failures, no missing code/tool failure. IaC was explicitly N/A after RED and before implementation.

The actual browser check uses only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `finally` close. `CAPTURE_BROWSER_EVIDENCE=1` is only for deliberate first-time capture; it refuses to overwrite proof. The abandoned lifecycle prototype is not used or qualified. The shared helper's documented unattended shutdown limitation remains.

The first browser attempt reached all exercise checks but Playwright's `addScriptTag` rejected an intentionally blocked inline CSP probe. That failed instrumentation run, its raw output, DOM and exact test source remain intact under `evidence\browser*`. The corrected runner loads the same owned external probe with its native `load` event; it does not weaken CSP. Final qualification is separately recorded in `evidence\browser-verified.json` and `evidence\browser-final`.

The first signature qualifier used legacy Windows PowerShell, whose security module could not load in the inherited environment. Its incomplete result is retained in `evidence\tooling-initial-failure.json`; the installed PowerShell 7 verifier records the final signed-Edge qualification without installing tools or relaxing security.

Node 22 rejects a positional test-directory argument as a missing module. The command above explicitly selects only the six current test files; the failed directory invocation is recorded separately in `evidence\verification-invocation.json`, not counted as behavioral RED.

Owned `.gitattributes` preserve raw CRLF-bearing source/log snapshots byte-for-byte; source/code integrity separately uses canonical LF Git bytes. The content index excludes only itself. Browser CSP checks actually attempt blocked inline/foreign scripts, connections, frames and form submission without transmitting profile data.

## Limits

This is finite, deterministic, in-memory training, not a load test or performance prediction. No cloud/IaC, identity, production Node.js 24, actual cache outage/profile recovery, native Azure, five-nines guarantee or original source-parent completion is certified. B-S073 and D-S073 remain incomplete; CORE, DATA, HOST and approved native proof are still required. No extra completion credit is requested for tests, evidence, tooling or refinement. Parent acceptance remains pending.
