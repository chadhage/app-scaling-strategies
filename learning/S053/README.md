# S053 — Breaking API introduction

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. This standalone, resource-free lesson owns only `learning\S053`. A-S053 is one frozen **S** unit in **SC-S053**, parent **D-S053**; parent acceptance remains the coordinator's decision.

## Exact source and exercise

[S053 in the source README](../../README.md#f-n-tier-and-version-compatibility): **Use versioned endpoints or transitional adapters instead of abruptly changing a live contract.**

[D-S053](../../.docs/wiki/backlog.md): **A stable compatible route can migrate all consumers; a breaking API cannot be force-rerouted and declared uninterrupted.** Its native prerequisites D-S051/D-S052 are not completed here. The portable A-card contract and default SC-S053 packet rule are preserved in `evidence\source-portable-contract.snapshot`.

Three fixed synthetic profile consumers originally require v1's `displayName: "Ada Example"`. Blue software **1.8.0** serves v1; green software **2.0.0** uses v2's `name: { given: "Ada", family: "Example" }`. A client upgrade is explicit and independent of a software deployment. The same synthetic `profileId` and value must be preserved, not just HTTP status.

1. Keep **green**, **stable adapter**, **one upgraded consumer**, **complete observation**. Run: all three migrate; the two v1 clients are translated, not silently upgraded.
2. Select **consumer-versioned endpoints**. Run: `/api/v1/profile` and `/api/v2/profile` coexist on software 2.0.0.
3. Select **force v2** with only one upgraded consumer. Run: one migrates and two are interrupted despite HTTP 200. This is **FAILED**, not a safe migration.
4. Explicitly upgrade **all** clients, then run force-v2: all three now declare and receive v2. Earlier failures remain visible.
5. Select **missing last observation**: the unknown started journey stays in the denominator. A separate known failure still makes the verdict failed.
6. Reset; select **blue**, **versioned endpoints**, **no upgrades**. Three requests pass, but **zero migrate**: the migration verifier is **UNKNOWN**, not passed.

Every attempt starts from this fixture; it is not a simulation of incremental production changes. At most six three-journey attempts are kept in memory. Reset and page reload erase history; subsequent attempts do not. No persistent storage or external calls are used.

**Keyboard:** Tab through four labelled selects and the Run/Reset buttons; use arrow keys to select, Enter to run or reset. Invalid input focuses a readable alert without changing previous results. Reset restores defaults, clears results and focuses Software destination. There is no `reset`-named form control to shadow `form.reset`.

## Result oracle and limits

- **PASSED:** all three complete the declared response/value assertion on **green**.
- **FAILED:** at least one known contract/status failure; synthetic user impact is interrupted.
- **UNKNOWN:** missing observation or no completed migration; never success by subtraction.
- The denominator is always three started journeys. “Complete journey” and “migrated to green” are different measurements.
- Cleanup is independently **no resources created**. A correctly observed negative example does not become an uninterrupted transition.

This is a deterministic contract-reasoning model, **not real HTTP, API negotiation, an actual adapter, authentication, native Azure evidence, source-parent certification, production Node.js 24 validation, or five-nines proof**. No identity, tokens, keys or credentials are needed. B-S053 and the original source gates remain incomplete.

## Read-only verification

From the repository root, using the existing offline tooling:

```powershell
node .\learning\S053\verify.cjs
```

This runs the focused model/surface/provenance/integrity suites, syntax checks, and actual isolated DOM/keyboard/error/reset/failure/CSP checks. It asserts the proof tree is unchanged. No packages, browser downloads, framework, cloud resources, unsafe flags, foreground lease, or shared edits are required.

Browser tests exclusively load the published `testing\browser\isolated.cjs` (**53c0c0d**, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), call `openIsolatedLesson`, and await `close()` in `finally`. Qualification is existing **Node 22.23.4** test tooling, **Playwright 1.56.1**, signed **Edge 156**. The abandoned lifecycle prototype is not qualified.

`tests\replay-red.cjs` intentionally exits 1: the focused provenance test runs the historical stub and unchanged assertion snapshot in memory, expecting 18 genuine `ERR_ASSERTION` failures and one API-load pass. `.snapshot` files are not auto-discovered tests. Historical stage capture scripts are not normal verification commands.

## Evidence and deliberate capture

`api-migration.feature` was authored and checked before the complete loadable stub. Raw receipts/streams retain BDD → stub load → genuine assertion RED → explicit IaC N/A → implementation/model GREEN → browser/syntax/integrity qualification. See `evidence.json` and `evidence\content-hashes.json`.

Historical raw streams/snapshots are never overwritten. The source snapshots retain their original **CRLF bytes**; `evidence/** -text -diff` preserves them in Git without treating generated TAP indentation as source whitespace. Runtime/test/documentation integrity uses canonical **LF Git-source bytes** separately, not raw worktree newline assumptions.

Only a deliberate new browser capture may write proof. Choose a new unused label:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
$env:S053_BROWSER_LABEL = 'browser-002'
node .\learning\S053\capture.cjs browser-002 0 --test --test-reporter=tap .\learning\S053\tests\browser.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE, Env:\S053_BROWSER_LABEL
```

New evidence must be explicitly re-sealed; ordinary verification never re-seals itself:

```powershell
$env:CAPTURE_SOURCE_INTEGRITY = '1'
node .\learning\S053\seal.cjs
Remove-Item Env:\CAPTURE_SOURCE_INTEGRITY
```

Raw artifacts and versioned integrity indexes are append-only. Only the derived `content-hashes.json` active-index pointer changes during deliberate re-sealing. Initial diagnostic/publication failures are retained and explicitly explained in `evidence.json`; none substitutes for the genuine behavioral RED. Git-filter checks use a native directory plus basename so Windows backslashes do not bypass attribute lookup; current assertions are compared to raw RED snapshots using canonical LF, without rewriting the snapshots. Unchanged indexed blobs are checked during authoring; a clean post-publication run qualifies all published blobs.

No cloud, IaC, scaffolding, identity registration, deployment, expenditure, packages or native qualification is authorized. [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer): no Microsoft endorsement, support or SLA is implied.
