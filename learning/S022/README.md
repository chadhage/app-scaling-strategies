# S022 — Dependency-aware readiness

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, packages, framework,
subscription, identity, credentials or cloud resources are needed.

## Contract and worked exercise

- Source: root `README.md`, S022; parent: `.docs\wiki\backlog.md`, D-S022.
- Portable card: `.docs\wiki\kanban.md`, A-S022 and the portable A-card contract.
- One frozen Kano **S** unit: **A-S022**; packet **SC-S022**; entry gate **SOURCE**.
- Objective: validate required database, cache, messaging and service connectivity
  before admitting users without making optional failures blanket ejection gates.
- Candidate: `candidate-v2`; fixed clock 120000 ms; freshness limit 30000 ms,
  inclusive. Normal observations are 5000 ms old; stale connected evidence is
  30001 ms old; missing observations have no timestamp.

Database, queue/messaging and service are always required. The two explicit
workload policies make cache optional with a declared database fallback, or
required without a cache bypass. The fallback's suitability is a model
precondition, **not measured application correctness, latency or capacity**.
It cannot compensate for a failed or unknown required database.

1. Disconnect cache under **Cache optional**, predict **ADMIT**, then check.
   Expect `SUCCESS`, permission `ADMIT`, verifier `PASS`; dependency checks are
   success **3**, failure **1**, unknown **0**, required **3/3**.
2. Keep cache disconnected and choose **Cache required**. Predict **HOLD**.
   Expect `FAILURE`, permission `HOLD`, verifier `PASS`, required **3/4**.
3. Make database disconnected and deliberately predict **ADMIT**.
   The verifier is `FAIL`, but the gate remains `HOLD`.
4. Make database unknown, missing or stale, then predict **HOLD**.
   Readiness is `UNKNOWN`, with success **3**, failure **0**, unknown **1**.
   Unknown observations do not become successful checks.

`PASS` means the operator selected the right answer. It is not a successful
transition. Counts measure four **synthetic connectivity checks**, not user
journeys. Protected existing synthetic capacity remains **4/4** by fixture;
zero users move, real user impact is **UNMEASURED**, and a 0/0 sample is not
reliability proof. Each row, trace and retained run is labelled synthetic.

## Guards, history and keyboard UX

Inputs are exact finite schemas: two policies, four named dependencies, five
conditions and two predictions. Missing/extra keys, coercions, accessors,
prototype overrides, sparse history, forged identities/results and invalid
revisions are rejected, not silently defaulted. Model operations are pure;
history records are copied and checked against their own configurations.

Changing controls invalidates the displayed current result. The history keeps
earlier configurations, counts, failures, unknowns, predictions and traces.
Eight runs fit; a ninth is rejected **without eviction**. Configuration changes
are bounded at 64; unchanged settings consume no edit. Reset explicitly clears
all history/errors, restores defaults and focuses the policy control. Reload
also clears this in-memory-only session.

Use Tab, arrow keys and Enter with the labelled native selects and buttons.
Errors are focused alerts, results are live status text, details summaries are
keyboard-operable, and there is a skip link. The reset control is not named
`reset`; reset invokes `HTMLFormElement.prototype.reset.call(form)`.

The CSP allows only local scripts/styles and blocks connections, inline code,
inline handlers, forms, frames, objects, base changes and workers. Actual
browser checks exercise inline script/handler and connection enforcement.
Their additional route guard would abort an unexpected non-file request;
**zero requests reached that guard**, distinguishing actual CSP denial from
test-route denial. No unsafe browser flags are used.

## Focused verification

From the repository root in PowerShell, with capture **unset**:

```powershell
node --test --test-concurrency=1 --test-reporter=tap .\learning\S022\tests\readiness.test.cjs .\learning\S022\tests\syntax.test.cjs .\learning\S022\tests\integrity.test.cjs .\learning\S022\tests\browser.test.cjs
```

Ordinary verification is **read-only to committed proof**. Browser observations
are written only when `CAPTURE_BROWSER_EVIDENCE=1`. The separate capture driver
also refuses to run without that explicit opt-in and appends numbered records
without overwriting historical files. For an intentional refresh:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S022\tests\capture.cjs browser --test --test-reporter=tap .\learning\S022\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

A refresh appends new provenance and does not silently re-certify the first
published observation or earn another unit.

Sequence: BDD → importable stub → **27 genuine assertion failures** →
explicit IaC **N/A** → implementation/refactoring → **42 focused model checks**,
syntax, integrity and actual isolated browser checks. The extra 15 model checks
were added after the initial RED; they do not have a claimed initial RED.
Browser TAP counts **15 leaf checks plus one parent**, not 16 independent
features. Syntax checks cover all seven owned JavaScript sources.

See `evidence.json` and `evidence\` for timestamped commands, exit codes, exact
source SHA256, preserved stub/test/BDD `.snapshot.txt` files, actual DOM
observations and lossless raw stdout/stderr. Base64 preserves the exact runner
bytes alongside an untrimmed UTF-8 view. RED snapshots are not auto-discovered
tests. No missing module/tool or failed installation is called behavioral RED.

Tooling is limited to existing Node **22.23.4**, offline Playwright **1.56.1**
and installed Microsoft-signed Edge **156.0.4314.50**. Only published
`testing\browser\isolated.cjs` at `53c0c0d`, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
is used via `openIsolatedLesson`, with awaited `close()` in `finally`.
The helper's documented unattended lifecycle limitation still applies;
the abandoned prototype is not used or qualified.

`tooling-001` preserves a failed legacy Windows PowerShell security-module
load. It is **not behavioral RED**. The unchanged signature query succeeds
using the existing PowerShell 7 host in `tooling-002`; nothing was installed
or weakened. Final source hashes are in `green-002`, `syntax-002`,
`integrity-002`, `browser-001` and full `integrity-003`.

## Remaining work and limits

There is no remaining local To Do or extra test/plumbing/refinement unit.
The parent alone independently accepts A-S022, once. S021 is untouched.
Native **B-S022** remains unready for this worker: its **CORE, DATA and HOST**
gates and separately approved target/configuration, fixtures, access and
execution authority are required. No native run or new board card is inferred.

This bundle does not complete D-S022/source S022, validate production Node24,
prove per-instance or business-journey readiness, certify fallback performance,
or demonstrate five-nines continuity. No IaC, cloud operation, deployment,
identity registration, expenditure, package/framework installation or browser
download occurred. The root Microsoft Open Source Disclaimer applies.
