# S096 — Warm competing slots

**Training rehearsal - synthetic data - not a live Azure result**

[Open the standalone lesson](index.html). It needs local JavaScript, not an account, server, framework or Azure resources.

## Frozen source and acceptance

- `README.md`, S096: **Shared-plan resource contention:** “Demonstrate sufficient overlap headroom or isolate deployments into separate plans.”
- `D-S096` requires **real** shared compute/dependency contention and journey measurements; additional slots must not be treated as free extra capacity.
- `A-S096` delivers the portable warm-up exercise only, in **LP-COMPARE**, frozen **S**, one `kanoUnit`. Exact source rows, the shared acceptance policy, portable/card contracts and packet membership are pinned to canonical Git blobs in `evidence\source-contract.json`.
- `B-S096` still needs approved native gates and real comparison evidence. Its completion, `D-S096`/P001/BASE completion, native platform guarantees, production Node.js 24 and five-nines reliability are **not** established here.
- X002's real accepted-run comparison is a separate delighter, not this lesson. None of the native LP-COMPARE companions or X002 are completed by this work.

## Worked exercise

1. **Shared pressure:** Run the defaults: production workers 1, warming slots 2, production demand 70, warm demand 40 per slot, dependency capacity 100, production/warm-up budgets 120/160 ms. Observed compute remains **100**; overlap demand is **150**, headroom **−50**. The four synthetic HTTP 200 journeys take **180/184/188/192 ms**; all interrupt. Slots add **zero** compute.
2. **Explicit headroom:** Reset the current rehearsal and select **2 production workers**. Total compute becomes **200**, added compute **100**, overlap headroom **50**; complete observations pass the synthetic gates.
3. **Separate provisioned compute:** Reset and select **Separate candidate plan**, leaving one worker per plan. Total compute is **200**, explicitly added candidate compute **100**, production headroom **30**, candidate headroom **20**. Warming slots still compete on that one candidate plan.
4. **Shared dependency failure:** Keep separate placement but set dependency capacity **60**. Demand is **80**, headroom **−20**; production durations **120/124/128/132 ms** yield **1 success and 3 interruptions**. Separate compute did not isolate the dependency.
5. **Unknown:** Reset, select separate placement and missing capacity, journeys or warm-up. Configured workers never substitute for observed capacity; missing journeys remain four unknown attempts. No incomplete positive trace passes. Known interrupted journeys still fail even with missing capacity.
6. **Safe abort:** Four warming slots at 40 units on one separate candidate worker, with dependency capacity 200, saturate the candidate plan while production remains within budget. Report safe abort before exposure, not migration.

### Declared synthetic envelope

One worker supplies **100 units per synthetic observation tick**, not an Azure SKU. The baseline is one production worker. Separate placement explicitly provisions one candidate plan with its own selected workers; shared placement ignores that separate-plan control.

Dependency demand is `40 + 20 × warming slots`. Production latency is `80 + 2 × (production-plan compute excess + dependency excess) + [0,4,8,12] ms`; warm-up latency is `100 + 2 × (warming-plan compute excess + dependency excess) + 3 × slot index ms`. Budgets are inclusive. These simple illustrative relationships are **not** platform performance guarantees or load measurements.

Bounds: 1–3 workers per selected plan, 1–4 slots, production demand 1–250, warm demand 1–80, dependency capacity 1–300, budgets 1–500 ms, **six retained runs**. All inputs require exact integer types and a closed schema.

No users are exposed to candidates. Successful production checks do **not** count as migrated users: attempted/successful transitions remain **0/0**, with an **unknown** transition rate. Complete headroom, readiness and journey observations establish only fixture warm-up acceptance. Shared dependencies and independent failure domains require their own native evidence.

## State, history and keyboard UX

Each run moves `ready → measured`; duplicate actions require reset. Authentic issued states and complete traces are deeply immutable. Invalid inputs and forged state cannot append a result. Known failures take precedence over missing evidence, without discarding uncertainty.

Tab reaches every labeled control and both buttons. Enter/Space conduct the exercise. Errors are announced and focused, with invalid fields marked. **Reset current rehearsal** restores defaults and first-control focus, clears current output/errors, and preserves all previous budgets, traces, failures, unknowns and the six-run allowance. It uses the native prototype reset method and has no control named `reset`. A seventh run is rejected; no old evidence is evicted. Page reload explicitly starts a new in-memory lesson.

## Verification and provenance

From the repository root in PowerShell:

```powershell
node --test learning\S096\tests\model.test.cjs learning\S096\tests\bundle.test.cjs
node --test learning\S096\tests\browser.test.cjs
node --check learning\S096\model.js
node --check learning\S096\app.js
```

BDD preceded a loadable stub. That stub actually loaded in isolated Edge; the focused RED asserted **100** compute units but received **300** (`ERR_ASSERTION`, exit 1), not a missing module/tool. Exact stub/test snapshots and raw TAP are under `evidence\raw`, with `.txt` snapshot suffixes outside normal test discovery. IaC was explicitly recorded **N/A after RED**, before implementation.

The existing approved tooling is Node **22.23.4**, offline Playwright **1.56.1**, Microsoft-signed Edge **156.0.4314.50**, and only published `testing\browser\isolated.cjs` at `53c0c0d` / SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`. Sessions use `openIsolatedLesson` and an awaited `finally` close. The abandoned lifecycle prototype remains unqualified; this is not fully qualified unattended browser CI. There are no installs, downloads, foreground leases or unsafe browser flags.

Ordinary verification is **read-only**, including all owned evidence. Browser capture occurs only with the exact value below, deliberately, after all checks and awaited cleanup succeed:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node --test learning\S096\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture updates only `evidence\browser-acceptance.json` and `evidence\raw\browser-dom.json`; it does not refresh integrity hashes automatically. A new deliberate capture requires explicit owned integrity requalification before publication. The browser's byte-preservation check excludes only those two paths during capture and excludes nothing during normal verification.

`evidence\integrity-index.json` separates canonical LF text/Git-clean blob integrity from raw byte hashes. Regular source files qualify by canonical text and Git-clean blobs, not incidental Windows working-tree CRLF. The owned `.gitattributes` applies LF only to text and narrowly marks `evidence/raw/**` as non-text. Raw CRLF observations and original child stdout/stderr bytes remain unchanged in Git. The actual initial CRLF/canonical assertion failure and exact pre-refactor test are also retained. Timestamps, raw snapshots and failed outputs are not regenerated by normal verification.

Actual browser checks cover rendered measurements, keyboard actions, state/input errors, failure/unknown attribution, retained history/reset/limit, safe abort and enforced CSP. Inline/remote scripts and connection attempts are tested; a read-only browser route guard additionally prevents an escaped remote request, without substituting for observed CSP violations.

## Authorization and remaining To Do

Only `learning\S096` is delivered. No cloud, IaC, scaffold, identity, credentials, native App Service operations, deployment, spend, package/framework or shared/root edits.

**Ready for parent empirical review after scoped publication; not self-accepted.** One frozen S unit only. Relevant native remainder is still **not ready**: B-S096 requires CORE, DATA, ASANY and C067, approved exact host/SKU/region/operating envelope, and real shared/separate compute, dependency and client measurements. Separate plans must not be sold as proven independent fault domains. Native and source-parent work remains blocked by those genuine gates; no extra test/plumbing/refinement credit is requested.
