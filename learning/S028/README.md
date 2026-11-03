# S028 — Warm-up timeout

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No installation, account, server or network service is needed.

## Exact source and scope

- README **S028 — Warm-up timeout:** Abort explicitly and leave existing production routing intact.
- **D-S028:** Configurable warm-up timeout and **Abort preparation** controls. Timeout/error is visible; production stays routed correctly; the result is safe abort, not completed migration.
- **A-S028:** Expire warm-up; distinguish safe abort from completed user migration. Original frozen **S**, single **A-S028** Kano unit, **SC-S028**, gate **SOURCE**.

The exact source row, parent backlog, atomic/portable contract and packet rules were read before behavior design and retained in `evidence\source-contract-001.json`. This bounded lesson implements only the A-card learning exercise, not the backend/native D-S028 contract.

## Worked exercise

1. Keep timeout **3s**, readiness **5s**, intact routing and successful receipts. Start preparation, then advance one synthetic second three times. The explicit `WARM_UP_TIMEOUT` abort makes the candidate ineligible. The routing command and observed routing stay production **100%**, candidate **0%**.
2. Inspect four measured synthetic production receipts: one at start and one per advance. Verification succeeds for **safe abort before exposure**, with **zero completed migrations**. This is not completed user migration.
3. Archive/reset. Start and activate **Abort preparation** to stop immediately with `OPERATOR_ABORT`. A terminal run rejects further advances, aborts and starts until reset.
4. Archive/reset. Set timeout **4s**, readiness **2s**. Two advances reach readiness, without changing production routing or executing migration. At an exact readiness/timeout tie, **timeout wins**.
5. Inject a drifted routing observation: the command stays 100/0 but the witness says 90/10. Verification fails; successful production receipts cannot repair a routing-continuity failure. A failed receipt is an interruption. Neither case is labeled a safe abort.
6. Select a missing routing observation or unknown receipt. Missing evidence is **unknown**, never success. Observed failure dominates missing evidence. Archive/reset retains failed and unknown runs alongside later successful ones.

The routing/receipt witnesses are deliberately synthetic, fixed per run. Start and every action generate one observation, including abort at the current second. These are not real requests, probes, clocks or Azure observations. Migration counters count executed migration operations (none); drifted/missing routing observations leave user exposure unverified, and weights alone never prove migration.

## Bounds, state and UX

- Timeout: integer **1–12 seconds**. Candidate readiness delay: integer **1–20 seconds**. No coercion, fractions, non-finite numbers, unknown enums or extra fields.
- The immutable model replays bounded canonical actions, validates current and archived state, and rejects malformed/impossible histories, post-terminal actions and forged result fields atomically.
- At most **12 advances**, **3 complete archives** and run IDs **1–1000**. Eviction is counted explicitly. Reset aborts a warming run with `RESET_ABORT` before archiving; empty reset does not consume history or a run ID. At ID exhaustion, explicitly reload to clear page memory.
- History contains full inputs, actions, trace, verdict, user outcome and request counts. Reload clears page-memory history. There is no storage, network I/O, timer or hidden background work.
- Controls have labels, visible keyboard focus and accessible live results. Validation errors receive focus without changing state. Archive/reset clears errors, restores defaults and focuses timeout. The `archive-run` button does not shadow native `form.reset()`.
- All scripts/styles are external local files; text-only rendering and restrictive CSP block inline scripts/handlers, connections, forms, workers and embedded objects.

## Verification and retained provenance

From the repository root with the existing **Node.js 22** test-tooling runtime:

```powershell
node learning\S028\verify.cjs all
```

Focused lanes: `green`, `syntax`, `browser`, `integrity`. **Ordinary verification is read-only to retained proof**, including expected command failures. Intentional capture is append-only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S028\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a loadable stub and genuine `ERR_ASSERTION` RED (`warming` versus required `aborted`), followed by an explicit resource-free **IaC N/A** and implementation. Raw stdout/stderr, exact command exits, source/output hashes and non-auto-discovered `.txt` BDD/test/stub snapshots remain retained. Integrity reruns the original RED against its original stub, not missing code or tools.

Earlier failed verification records are retained, not relabeled as the BDD RED: `browser-001` hit the Windows PowerShell module-loader mismatch (resolved with installed PowerShell 7); `browser-002` used Playwright's unsupported fieldset disabled predicate (corrected to check the actual disabled input); `integrity-001` inherited Node's test-child context (removed only for the isolated historical-RED subprocess). Later complete passing records supersede these checks without deleting their raw provenance.

The first authorized publication stopped at its whitespace gate before any commit: preserving CRLF with `-text` also requires the owned `cr-at-eol` policy. `publication-preflight-001` retains the raw read-only reproduction. The corrected `.gitattributes` preserves every byte while explicitly retaining normal blank-at-EOL/EOF and space-before-tab checks; only raw command stdout/stderr are exempt.

Actual browser checks use only existing offline **Playwright 1.56.1**, Microsoft-signed **Edge 156**, and published `testing\browser\isolated.cjs` SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`). The test calls `openIsolatedLesson` and awaits `close()` in `finally`. Its actual DOM/keyboard/error/timeout/failure/unknown/history/reset/CSP observations and successful owned cleanup are retained with raw provenance. No foreground lease, download, unsafe flag or package installation is used. The shared helper's documented unattended lifecycle limitation remains; its abandoned lifecycle prototype is unused and unqualified.

## Relevant refinement and genuine remainder

No separate test, plumbing, refinement or additional Kano unit is created. After scoped publication, only parent-owned empirical acceptance remains for A-S028. No unrelated To Do card is changed or pruned.

Keep **B-S028 unready**: it requires **CORE, DATA, HOST**, a qualified target, real timeout/error, unchanged production routing and production-continuity evidence. **D-S028** additionally requires its original **BASE = H011 + P005 + HOST** and both child slices. Separate cloud/IaC/scaffold/identity/deployment/spend approvals remain absent. No native support, production Node.js 24, completed source parent, Azure result or five-nines reliability guarantee is claimed.

Microsoft Open Source Disclaimer: provided as-is without warranties. Synthetic outcomes are not service guarantees. The repository's acceptance policy and disclaimer remain authoritative.
