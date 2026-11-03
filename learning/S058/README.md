# S058 — Workflow/orchestration evolution

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. This standalone lesson owns only `learning\S058`: **A-S058**, one frozen **S** unit, packet **SC-S058**, parent **D-S058**. No server, account, credentials, packages or cloud resources are needed.

## Exact source and worked exercise

[S058 in the source README](../../README.md#f-n-tier-and-version-compatibility): **Pin or explicitly version long-lived workflows so new code does not invalidate existing execution history.**

[D-S058 acceptance](../../.docs/wiki/backlog.md): **Existing histories continue under the correct version strategy; unexpected replay/history behavior is detected.** Its prerequisite P004 and native sibling B-S058 are not completed here. Exact source, atomic/portable contract and default packet rules are preserved in `evidence\source-*.snapshot`.

The fixed fixture contains two histories started with definition **1.0**, `ReadOrder → ReserveStock → ShipOrder`, and one with **2.0**, `ReadOrder → RiskCheck → ReserveStock → ShipOrder`.

1. Compare the defaults: **exact pin**, **overlap**, **complete**. All three recorded prefixes match their selected definitions and a modeled next command is shown.
2. Select **unversioned latest**. WF-101 diverges at its recorded second command. WF-102 has only `ReadOrder` recorded: that prefix matches, but the next command would change from `ReserveStock` to `RiskCheck`. It is blocked, not certified compatible.
3. Select **exact pin** and **new only**. Two histories lack their required worker. Pinning does not make early worker retirement safe.
4. Select **explicit version branch**, still **new only**. The synthetic v2 worker explicitly preserves v1's command definition for v1 histories; all three permit modeled continuation. Earlier failures remain visible.
5. Select **missing observation**: WF-201 is UNKNOWN and stays in the three-started denominator. A separate known mismatch still makes the overall verdict FAILED.
6. Reset; select **incompatible WF-102 history**. An unexpected `ChargeCard` fails against `ReserveStock`, even with a matching version label.

These are fixed, independent comparisons, not incremental executions. At most six attempts are retained **in memory only**. Later comparisons do not erase failures. A seventh attempt is rejected; explicit reset or page reload clears the rehearsal.

**Keyboard:** Tab through three labelled selects and the Compare/Reset buttons; use selection keys and Enter. Validation focuses a readable alert without changing results/history. Reset restores defaults, clears the display and focuses Version-match strategy. No control named/id `reset` shadows the native `form.reset()` method.

## Oracle and boundaries

- **PASSED:** all three observed command prefixes and version-specific next-command gates match.
- **FAILED:** a known recorded-command mismatch, incompatible unversioned continuation, or unavailable pinned worker.
- **UNKNOWN:** missing observed history, unless an independent known failure takes precedence.
- Counts partition all **three started histories** into matched, mismatched, blocked and unknown. Matching-command counts do not represent executed activities. Actual external effects remain zero.

The explicit branch is an authored fixture, **not an Azure version-match setting, automatic compatibility, a real durable engine replay, persisted execution history, storage proof, or a completed workflow**. Native Azure, production Node.js 24, source-parent acceptance, and five-nines claims remain unqualified. Synthetic user-impact wording describes the model only. Cleanup is independently **no resources created**.

## Read-only verification

From the repository root, using existing offline tooling:

```powershell
node .\learning\S058\verify.cjs
```

This runs focused model/source/surface/RED-provenance/integrity tests, syntax/tooling checks and actual DOM, keyboard, error, failure, history, reset, reload and CSP checks. It asserts the entire owned proof/source tree is unchanged.

Only the published `testing\browser\isolated.cjs` helper is used: **53c0c0d**, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`. Browser tests call `openIsolatedLesson` and await `close()` in `finally`. Qualification is **Node 22.23.4 test tooling**, existing offline **Playwright 1.56.1**, signed **Edge 156**. The abandoned lifecycle prototype is unqualified; no unsafe flags or foreground lease are used.

## Raw evidence and deliberate capture

`evidence.json` links the ordered BDD → loadable stub → **17 genuine assertion failures, one API-load pass** → explicit IaC N/A → implementation GREEN → actual browser evidence. Historical `.snapshot` files are not auto-discovered tests. `tests\replay-red.cjs` intentionally exits 1; the focused provenance test expects this historical RED without modifying files.

Raw streams, DOM, image, source snapshots and diagnostic failures are append-only. The first core diagnostic failed because a nested test runner inherited `NODE_TEST_CONTEXT`; the corrected independent child replay is qualified by `green-core-002`. That diagnostic is not the behavioral RED.

Source snapshots retain original **CRLF bytes** under `evidence/** -text -diff`. The integrity index separately qualifies canonical **LF Git-source bytes**, actual Git filters and unchanged indexed blobs. Ordinary verification never rewrites or re-seals proof.

Only a deliberate new browser capture may write browser evidence. Use an unused label:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
$env:S058_BROWSER_LABEL = 'browser-002'
node .\learning\S058\capture.cjs browser-002 0 --test --test-reporter=tap .\learning\S058\tests\browser.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE, Env:\S058_BROWSER_LABEL
```

New evidence must be explicitly re-sealed; old indexes stay byte-for-byte unchanged:

```powershell
$env:CAPTURE_SOURCE_INTEGRITY = '1'
node .\learning\S058\seal.cjs
Remove-Item Env:\CAPTURE_SOURCE_INTEGRITY
```

Publication uses the authorized scoped publisher, an annotated `kanban/A-S058/<12sha>` marker and atomic `main`/tag remote verification. Reviewer/acceptance belong to the parent; test, evidence and plumbing work earn no extra unit.

No cloud, IaC, scaffold, identity registration, deployment, expenditure, package/framework install, download, root/shared edit or native qualification is authorized. [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer): no Microsoft endorsement, support or SLA is implied.
