# S030 — Warm-up overload

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, packages, framework,
subscription, identity, credentials or Azure resource is needed.

## Exact source and single-unit contract

- Root `README.md`, **S030**: **Warm-up overload:** Limit initialization
  concurrency so candidate preparation does not overwhelm shared dependencies.
- Backlog **D-S030**: compare simultaneous versus bounded warm-up of many
  instances; dependency load, initialization duration and journey outcomes
  show whether preparation stays within shared capacity limits.
- Portable card **A-S030**: compare simultaneous and bounded warm-up; identify
  overloaded shared dependencies. Entry gate **SOURCE**, packet **SC-S030**,
  owner **worker-A-S030**, one frozen Kano **S** unit **A-S030**.

Exact S030, D-S030, A/B-S030 rows, source SHA256 values and the atomic/portable
contract are preserved in `evidence\source-contract-001.json`. No title-derived
alternate strategy or native capability is inferred.

## Model, preconditions and operator controls

Assume compatible isolated candidates and GA able to handle the baseline.
Every candidate initializes for **two synthetic ticks**. Each active candidate
uses **2 database units + 1 cache unit** each tick. Four existing GA journeys
arrive each tick and together use **4 database + 4 cache units**.

The simultaneous strategy starts all candidates together. The bounded strategy
starts at most the selected concurrency in non-overlapping two-tick batches;
the last batch can be smaller. Batches advance even if a previous batch failed.
There are no retries, timers, randomness, actual dependency calls or traffic
switches. Initialization duration is `2 × ceil(candidates / concurrency)`.

Choose **2–12** candidates, concurrency **1–candidate count**, database capacity
**4–24**, cache capacity **4–20**, preparation budget **2–24 ticks**, complete
or missing observations, and a prediction of the bounded outcome.

Demand **greater than**, not equal to, capacity overloads that dependency.
An overloaded tick fails all four GA journeys; latency is **250 ms** rather
than **50 ms**, against a **100 ms** budget. At a batch completion boundary,
all candidates in an overloaded batch fail initialization. This intentionally
simple all-or-nothing effect is a synthetic fixture rule, not a platform law.

**SUCCESS** requires every candidate initialized, every journey within budget,
and preparation within its tick budget. **FAILURE** means an observed overload
or preparation budget miss. With observations missing, observed load, duration,
latency and budget compliance are **UNKNOWN**; candidate and journey outcomes
retain their unknown counts. Planned ticks/active counts remain scheduling
inputs, not observed completion evidence.

## Worked, testable exercise

1. Defaults: **6 candidates, bound 2, database 8, cache 6, budget 8**. Predict
   **SUCCESS** and check. Simultaneous preparation takes **2 ticks**, peaks at
   database **16** and cache **10**, fails all **6** initializations and all
   **8** GA journeys. Bounded preparation takes **6 ticks**, peaks at **8/6**,
   initializes all **6**, and completes **24/24** journeys. Verifier **PASS**.
2. Set bound **3**, retain the success prediction: both dependencies overload;
   bounded initialization fails **6/6**, journeys fail **16/16**, verifier
   **FAIL**. Predict **FAILURE**: verifier **PASS**, but the run stays FAILURE.
3. Bound **1** protects the dependencies and all **48** journeys, but takes
   **12 ticks**, beyond budget **8**. The bounded result remains FAILURE.
4. Choose **Observations missing**, predict **UNKNOWN**. No observed load,
   duration or latency is fabricated; initialization is **0/0/6** and the
   **48** journeys are **0/0/48** success/failure/unknown. Verifier PASS is not
   proof of continuity.
5. Try **5 candidates, bound 2** with complete observations: batches are
   **2, 2, 1**, taking six ticks. Final-batch database/cache demand is **6/5**.

The comparison exposes each strategy's own journey denominator because the
bounded strategy runs longer. Failures are retained even if a later smaller
batch or later comparison succeeds. Real user impact remains **UNMEASURED**.

## Guards, retained evidence, keyboard and reset

The model rejects coercions, non-integers, out-of-range values, unknown enums,
missing/extra fields, symbols, getters, non-enumerable fields and non-plain
records. State guards reject sparse/oversized histories, unexpected array
properties, invalid run identities and configurations/results/verdicts that
do not match recomputation. This is consistency checking, not evidence signing.

Inputs and returned history are independent immutable snapshots. Eight
comparisons fit; a ninth is explicitly rejected without eviction. Editing
controls invalidates the current display but retains prior configurations,
traces, failures and predictions. History is memory-only and clears on reload.

Use the skip link, Tab, native arrow keys and Enter. Retained details expand
with Enter/Space; the trace is keyboard-scrollable, status changes are live,
invalid input focuses an alert, and focus remains visible at narrow widths.
Explicit reset clears errors/history, restores defaults and focuses candidate
count. The reset button is not named `reset`; the handler calls
`HTMLFormElement.prototype.reset.call(form)` to avoid method shadowing.

CSP permits only local scripts/styles and blocks inline code/handlers/styles,
connections, images, frames, objects, workers, form submission and base changes.
Actual browser checks observe CSP enforcement before an additional route
guard; no external request reaches that guard. No browser security is weakened.

## Verification and retained provenance

From the repository root in PowerShell, with capture **unset**:

```powershell
node .\learning\S030\tests\verify.cjs
```

This runs the focused model, syntax, integrity and actual isolated browser
checks and proves every historical proof byte and its inventory unchanged.
It explicitly removes capture from the child environment. The direct suite is:

```powershell
node --test --test-concurrency=1 --test-reporter=tap .\learning\S030\tests\warmup.test.cjs .\learning\S030\tests\syntax.test.cjs .\learning\S030\tests\integrity.test.cjs .\learning\S030\tests\browser.test.cjs
```

Only a deliberate append-only browser refresh uses capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S030\tests\capture.cjs browser --test --test-reporter=tap .\learning\S030\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Sequence: BDD → importable stub → **22 genuine assertion failures**, with
two passing checks → explicit resource-free IaC **N/A** → implementation and
refactoring → **24 green model checks**, including **1,386** sampled envelopes
covering every candidate/concurrency pair → syntax/integrity and actual browser
checks. Original BDD, assertions and stub remain non-auto-discovered
`.snapshot.txt` files. Missing code or tools are not behavioral RED.

Browser proof has **14 leaf checks and one parent group**, not 15 independent
features. Raw stdout/stderr bytes, commands, timestamps, runtime, source hashes,
exit codes and cleanup observations are retained in `evidence\`. `evidence.json`
is the per-card source/evidence manifest. Captures append, never silently
refresh historical proof.

The first browser capture retains thirteen passing leaves and a failed CSP
probe: a file-URL Worker was rejected by the opaque origin before worker CSP
was reached. A blob Worker probe now measures the unchanged `worker-src 'none'`
policy directly. The failed observation is not reported as a green suite.

Only existing Node **22.23.4** tooling, offline Playwright **1.56.1** and installed
Microsoft-signed Edge **156.0.4314.50** are qualified. Browser tests use published
`testing\browser\isolated.cjs` at **53c0c0d**, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
with `openIsolatedLesson` and awaited `close()` in `finally`. Its documented
unattended lifecycle limitation remains; no abandoned prototype is used.

## Relevant To Do and limits

There is no remaining local lesson To Do and no extra test/plumbing/refinement
unit. Only the parent independently accepts **A-S030**, once.

Separate native sibling **B-S030** remains unready: **CORE, DATA, HOST** gates,
a qualified native target/access, real warm-up/dependency/live-journey fixtures
and separate approvals are required. No cloud/IaC/scaffold/identity/deployment/
spend is authorized. This lesson does not complete **D-S030**, qualify native
Azure behavior, validate production Node.js 24 or establish five-nines results.
