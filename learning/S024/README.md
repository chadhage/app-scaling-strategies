# S024 — Production-configuration validation

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, account, installation or network service is needed.

## Exact source and scope

- README S024: **Production-configuration validation:** Confirm effective production settings work without accidentally executing production background work.
- D-S024: **Validate with production settings**, including a slot/configuration difference viewer. Candidate readiness must reflect effective target settings and identity/network access; background work cannot accidentally run twice.
- A-S024: Compare staging and effective production settings; identify identity/network/background-work differences. One original frozen **S** unit, **SC-S024**, gate **SOURCE**.

The canonical README row, D-S024, portable A and atomic card contract were read before behavior design and preserved in `evidence\source-contract.json`. This lesson does not implement a slot swap. It predicts a declared fixture and then executes deterministic local assertions against that fixture; it does not observe Azure settings, grant identity access, connect to a dependency or execute any background job.

## Worked exercise

1. Validate the defaults. The staging dependency is accessible; its checks pass. Production readiness stays **unknown**, because the target dependency and target access have not been tested.
2. Select **Effective production settings**. Keep the missing target identity grant and blocked target network. Both checks fail. Choose the retained slot-only staging setting to expose a third independent mismatch.
3. Inspect the difference viewer: the production dependency is `orders-prod-fixture`, while a sticky staging-only value is `orders-stage-fixture`. The candidate keeps `candidate-mi` and `candidate-subnet`, not production's identity/network. Configure target access for the candidate, rather than assuming either property swaps.
4. Repair the setting, grant and route. The next validation succeeds, but the run still reports its earlier failure. Archive/reset; in the fresh run select effective scope, target setting, granted identity access, reachable network and suppressed candidate work. All four checks pass.
5. Request enabled candidate background work while the production worker is active. The guard blocks validation **before** dependency checks or candidate execution. The safety result is failure; prevented duplicate starts is one, actual candidate starts and actual duplicates are zero. No executed duplicate or user interruption is claimed.
6. Select an unobserved target setting, grant or route. Missing evidence is **unknown**, never success. Earlier unknowns remain after repair. Archive/reset retains all snapshots, their inputs and outcomes in page-memory history.

The viewer is a prediction, not evidence. Only validation adds observed synthetic check records. Target-grant/route controls do not alter the already-working staging dependency. The model intentionally distinguishes settings from identity/network access; it does not generalize the fixture to all platform settings, hosting plans or swap phases.

## Outcomes, guards and limits

Success needs four observed passing effective-target checks with candidate work suppressed. An observed failure dominates every later recovery. Otherwise any missing evidence or staging-only validation leaves the run unknown; zero validations are also unknown. Results describe synthetic readiness, not live routing or user-journey availability.

The pure, immutable model accepts exactly five finite enum inputs. It re-derives every current and archived result to reject forged state, validates bounds and rejects malformed/extra properties atomically. It has no clocks, randomness, I/O or persistence.

Bounds are six validations per run, three complete archived runs with explicit eviction count, and run IDs 1–1000. Archive/reset preserves a nonempty run, resets controls, clears the error and focuses validation scope. Empty reset does not consume history. Exhaustion gives an accessible focused error; it never silently drops an observation. At the run-ID limit, explicitly reload to clear page-memory state. Reload always clears history.

All controls are labeled, work with the keyboard and have a visible focus outline. The separate `archive-run` button does not shadow native `form.reset()`. Plain text DOM rendering and restrictive CSP prohibit inline scripts, external connections, forms and workers.

## Verification and retained provenance

From the repository root, using the existing Node.js **22.23.4 test-tooling runtime**:

```powershell
node learning\S024\verify.cjs all
```

Stages are `green`, `syntax`, `browser` and `integrity`. Normal verification, including failed checks, is **read-only to retained proof**. For an intentional append-only capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S024\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

The browser lane uses only existing offline Playwright **1.56.1**, installed Microsoft-signed **Edge 156**, and the published `testing\browser\isolated.cjs` SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`). It calls `openIsolatedLesson` with awaited `finally` close, without foreground leases, downloads or unsafe flags. The shared helper's documented unattended lifecycle limitation remains; the abandoned prototype is not used or qualified.

BDD preceded a loadable stub and genuine `ERR_ASSERTION` RED (`unknown !== success`), not missing code or tools. Raw stdout/stderr and non-auto-discovered `.txt` BDD/test/stub snapshots remain unchanged. The subsequent IaC step is explicitly **N/A**. Capture records preserve source hashes, exact command exits, raw output hashes, actual DOM observations, signature/tool versions, CSP violations and awaited cleanup. Captures append; no earlier failed or successful proof is overwritten.

The owned `.gitattributes` preserves exact bytes and recognizes Windows CR at EOL without disabling normal source whitespace checks. Only raw TAP output is exempt from whitespace checks.

## Genuine remainder and refinement

No separate test, plumbing or refinement unit is needed for A-S024. Only parent-owned empirical acceptance remains after the worker's scoped publication. No unrelated To Do card is merged, reprioritized or pruned based on this lesson.

Keep native B-S024 and D-S024 unready: B requires **CORE, DATA, ASANY, C064**, actual effective-destination validation with real dependency access and no duplicate work. Original parent prerequisites **P001 and D-S022** and separate target, cloud, IaC, identity, deployment and spend approvals remain. This lesson supplies none of that proof; no production Node.js 24, native support, original-parent completion or five-nines reliability certification is claimed.

Microsoft Open Source Disclaimer: provided as-is without warranties; synthetic outcomes are not service guarantees. The repository's acceptance policy and disclaimer remain authoritative.
