# S027 — False-positive health response

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, subscription, sign-in,
packages or framework is needed.

## Exact source and worked exercise

- Root `README.md`, S027: reject errors, redirects and misleading success.
- `.docs\wiki\backlog.md`, D-S027: strict status **and** business assertions
  reject false readiness; no successful-health-only promotion is reported.
- `.docs\wiki\kanban.md`, portable A-card contract and A-S027: choose 500,
  redirect and misleading 200 probes; identify false-positive readiness.
- One frozen Kano **S** unit, **A-S027**, packet **SC-S027**, gate **SOURCE**.
  Exact source rows and the A/B packet mapping are preserved in tooling output.

The fixed candidate is `candidate-v2`. The business payload must have
`ready: true`, `candidate: "candidate-v2"` and `profileId: "training-profile"`.
Only the **original HTTP status 200 AND that business payload** permit
synthetic eligibility. Redirect destinations are never followed or measured.

| Fixture | Status assertion | Business assertion | Readiness / eligibility | Success / failure / unknown |
| --- | --- | --- | --- | --- |
| `error-500` | FAILURE | UNKNOWN, not evaluated | FAILURE / HOLD | 0 / 1 / 1 |
| `redirect-302` | FAILURE | UNKNOWN, not evaluated | FAILURE / HOLD | 0 / 1 / 1 |
| `misleading-200` | SUCCESS | FAILURE, wrong profile | FAILURE / HOLD | 1 / 1 / 0 |
| `ready-200` | SUCCESS | SUCCESS | SUCCESS / ADMIT | 2 / 0 / 0 |
| `unobserved-200` | SUCCESS | UNKNOWN, body absent | UNKNOWN / HOLD | 1 / 0 / 1 |

1. Select the first three fixtures, predict **HOLD**, then check.
2. Select misleading 200 and deliberately predict **ADMIT**. The prediction
   verifier is **FAIL** but eligibility remains **HOLD**.
3. Compare the valid 200 control, predicting **ADMIT**, with unobserved business
   evidence, predicting **HOLD**.
4. Change settings and inspect retained traces; earlier failures and unknowns
   stay. Reset explicitly clears the session.

Counts are two deterministic **synthetic assertions**, not users or measured
HTTP requests. `PASS` means a correct prediction, not a successful migration.
`ADMIT` means eligibility only; no promotion is performed. Existing synthetic
routing stays **v1 100%, v2 0%** by fixture. Synthetic users moved: **0**.
Real user journeys: **UNMEASURED**, zero attempts; 0/0 is not reliability proof.

## Guards, retained history, keyboard and CSP

The model accepts only five fixture IDs, two predictions and exact plain data
records. It rejects missing/extra keys, coercions, symbols, getters, inherited
records, invalid revisions, sparse/decorated history and forged results.
Every retained result is recomputed against its own configuration before reuse.
Operations copy inputs rather than mutating them.

Eight checks fit; a ninth is rejected **without eviction**. Configuration edits
are bounded at 32; unchanged settings consume no revision. Changing controls
invalidates the current displayed result, not historical results. All history,
raw synthetic responses, configurations, failed predictions and unknowns remain
in memory until explicit reset or page reload. There is no durable storage.

Use Tab, arrow keys and Enter with the labelled native selects and buttons.
The skip link, history details and horizontally scrollable table are keyboard
operable. Results are live status text; errors receive focus. Reset clears
errors/history, restores defaults and focuses the fixture control. The reset
button is not named `reset`; code calls
`HTMLFormElement.prototype.reset.call(form)` to avoid method shadowing.

CSP permits local scripts/styles only and denies connections, inline scripts,
inline handlers, forms, frames, objects, base changes and workers. Actual
browser checks inject test-only inline code/handlers and attempt a connection.
CSP must block all three **before** the additional test route guard, whose
non-file request count must remain zero. No unsafe browser flags are used.

## Focused verification and provenance

From the repository root in PowerShell, with capture **unset**:

```powershell
node --test --test-concurrency=1 --test-reporter=tap .\learning\S027\tests\probe.test.cjs .\learning\S027\tests\syntax.test.cjs .\learning\S027\tests\integrity.test.cjs .\learning\S027\tests\browser.test.cjs
```

Ordinary verification is **read-only to historical proof**. Only deliberate
`CAPTURE_BROWSER_EVIDENCE=1` runs append observations. The capture driver also
requires that opt-in and exclusively creates numbered files, never overwriting.
For an intentional independent refresh:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S027\tests\capture.cjs browser --test --test-reporter=tap .\learning\S027\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Sequence: BDD → importable stub → **20 genuine assertion failures**, zero
passes → explicit IaC **N/A** → implementation/refactoring → **20 focused
model tests**, eight JavaScript syntax checks, integrity and actual browser
checks. Browser TAP includes **12 leaf checks and one parent**, not 13
independent features. Final combined verification has **46 leaf checks plus
that parent**. Repeated checks earn no additional unit.

`evidence.json` identifies the captures. `evidence\red-001-*` preserves exact
stub, tests and BDD bytes as `.snapshot.txt`, which are not auto-discovered
tests. Each capture records timestamps, exact command/argv, runtime, prior Git
head, source SHA256, exit code and lossless raw stdout/stderr (Base64 and UTF-8
views plus the original byte files). No missing code, tooling or installation
failure is called behavioral RED. Qualification hashes bind final source;
ordinary integrity tests check them without updating proof.

The first publication stopped before commit because verbatim TAP contains
whitespace-only diagnostic lines. Owned attributes now preserve exact bytes
without newline conversion; only raw stdout/stderr files are exempt from
whitespace lint. Source whitespace checks remain enabled. The raw transcripts
and snapshots are not trimmed or rewritten to make publication pass.

The first browser capture, `browser-001`, preserves a **test expectation**
failure: the keyboard skip link correctly added `#exercise`, while the URL
assertion incorrectly required no fragment. The corrected assertion checks the
local pathname and protocol. `browser-002` is the complete passing observation;
the failed capture and its awaited cleanup record are retained, not relabelled.

Tooling is existing Node **22.23.4**, offline Playwright **1.56.1**, and installed
Microsoft-signed Edge **156.0.4314.50**. Only the published helper
`testing\browser\isolated.cjs` at **53c0c0d**, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
is used via `openIsolatedLesson`, with awaited `close()` in `finally`.
No integrated/foreground browser lease is used. The helper's documented
unattended lifecycle limitation remains; its abandoned prototype is unqualified.

## Scope and remaining To Do

No local remainder or extra testing/plumbing/refinement unit is proposed.
The parent alone independently accepts A-S027, once; this worker claims no Done
credit. Native **B-S027** is unready here: **CORE, DATA, HOST**, approved native
fixtures/matrix, target/configuration, access and separate execution authority
are still required. This lesson does not complete D-S027/source S027.

No cloud/IaC generation, scaffold, identity registration, deployment, expenditure,
package/framework installation or browser download occurred. This is not
production Node24 validation, native Azure proof, source-parent certification
or a five-nines guarantee. The root Microsoft Open Source Disclaimer applies.
