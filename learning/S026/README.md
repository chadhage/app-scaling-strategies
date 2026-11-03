# S026 — Slow image pull or startup

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, packages, framework,
subscription, identity, credentials or cloud resources are needed.

## Exact source and single-unit contract

- Root `README.md`, S026: **Slow image pull or startup:** Keep production
  serving while the candidate downloads its image and initializes.
- `.docs\wiki\backlog.md`, D-S026: delayed/failed immutable image pull and
  container-startup fixtures; existing GA traffic continues while startup
  fails or waits, and readiness does not precede successful initialization.
- `.docs\wiki\kanban.md`, A-S026: delay image pull/startup; the trace must
  retain the old serving deployment until readiness.
- Portable A-card contract; packet **SC-S026**; entry gate **SOURCE**;
  owner **worker-A-S026**; one frozen Kano **S** unit **A-S026**.

The exact rows, atomic/portable contract, source SHA256 values and admitted
packet are retained in `evidence\source-contract-001.json`. No title-derived
alternate strategy, cloud behavior or source-parent completion is inferred.

## Preconditions, controls and worked exercise

GA `ga-v1` is assumed healthy with enough overlap capacity; the candidate is
assumed compatible. The fixed candidate reference is `candidate-v2@sha256:`
followed by 64 synthetic `b` characters, not a mutable image tag. No image is
actually pulled and no container is started.

Pull and initialization each take **1–3 synthetic ticks**, sequentially.
Choose an observation tick **0–6**, condition and predicted guard decision,
then select **Check handoff**. Each tick, including tick zero, contributes
exactly three successful, in-budget synthetic requests. These request outcomes
and GA capacity are fixture assumptions, not measured continuity or latency.
There is no timer, random input or asynchronous startup in this model.

1. Default pull **2**, initialization **2**, tick **3**, prediction **HOLD**:
   readiness **UNKNOWN**, completion checks **1 success / 0 failure / 1 unknown**,
   verifier **PASS**; all **12** requests stay on GA.
2. Set tick **4**, predict **ALLOW**: readiness **SUCCESS**, checks **2/0/0**,
   verifier **PASS**. The first **12** requests stay on GA; only the final
   tick's **3** move to the initialized candidate.
3. Inject **Image pull fails** at tick **2**: readiness **FAILURE**, checks
   **0/1/1**, permission **HOLD**, all **9** requests stay on GA.
4. Inject **Initialization fails** at tick **4**: readiness **FAILURE**, checks
   **1/1/0**, permission **HOLD**, all **15** requests stay on GA. Predicting
   **ALLOW** makes the answer verifier **FAIL**, without forcing traffic.
5. Select **Candidate observations missing**, tick **6**, prediction **HOLD**:
   readiness **UNKNOWN**, checks **0/0/2**, verifier **PASS**, all **21**
   requests stay on GA.

Each trace row records the synthetic tick, pull and initialization completion
observations, readiness, serving deployment and request counts. Before the
selected handoff tick even an already-ready candidate waits while GA serves.
An injected future failure is not reported until its completion boundary.
Missing evidence never becomes readiness merely because time has passed.

The two completion checks are not user samples. **PASS** means the operator's
answer matches the guard, not that migration succeeded. **FAILURE** is a
candidate startup failure, not an invented GA outage. **UNKNOWN** means
insufficient completion evidence. Real user impact remains **UNMEASURED**.

## Guards, retained history and keyboard/reset UX

The model accepts only exact plain-record schemas, integer ranges and listed
conditions/predictions. It rejects missing/extra fields, coercions, symbols,
accessors, prototype overrides, sparse/oversized history, invalid run identities
and results inconsistent with their recorded configurations. Recomputed history
is a consistency check, not a cryptographic authenticity claim.

Operations copy inputs and do not mutate earlier state. Eight checked runs fit;
a ninth is rejected without eviction. Changing controls invalidates the current
display but retains earlier configurations, traces, counts and failed answers.
Reset explicitly clears all history/errors, restores defaults and focuses image
pull duration. Reload also clears this in-memory-only session.

Use Tab, arrow keys and Enter with labelled native controls. History details
support keyboard expansion; errors are focused alerts, results are live status
text, and the surface includes a skip link and narrow-screen layout. The reset
button is not named `reset`; the handler uses
`HTMLFormElement.prototype.reset.call(form)` to avoid method shadowing.

CSP permits only local scripts/styles and blocks inline scripts/handlers,
connections, frames, objects, forms, workers and base changes. Actual browser
checks observe CSP violations before the additional test route guard: **zero**
external requests reached that guard. No browser security settings are weakened.

## Focused verification and proof

From the repository root in PowerShell, with capture **unset**:

```powershell
node .\learning\S026\tests\verify.cjs
```

This runs the model, syntax, integrity and actual isolated browser suites with
capture removed from the child environment, then asserts that every historical
proof file and `evidence.json` has unchanged bytes and inventory. Ordinary
verification is read-only to proof. The explicit test command is:

```powershell
node --test --test-concurrency=1 --test-reporter=tap .\learning\S026\tests\startup.test.cjs .\learning\S026\tests\syntax.test.cjs .\learning\S026\tests\integrity.test.cjs .\learning\S026\tests\browser.test.cjs
```

Only a deliberate append-only refresh uses capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S026\tests\capture.cjs browser --test --test-reporter=tap .\learning\S026\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Sequence: BDD → importable stub → **20 genuine assertion failures**, with
2 checks already passing → explicit resource-free IaC **N/A** → implementation
and refactoring → **22 green model checks**, including all **504** finite
configurations → syntax/integrity and actual browser checks. Original model
tests and BDD are preserved unchanged as non-auto-discovered `.snapshot.txt`
files alongside the stub. No missing module/tool is claimed as behavioral RED.

Browser proof has **13 leaf checks plus one parent group**, not 14 independent
features. Raw stdout/stderr bytes, timestamps, commands, runtime, source hashes,
exit codes and cleanup observations are retained under `evidence\`. Captures
append rather than overwrite; `evidence.json` identifies the principal records.

The first publication stopped at its pre-commit whitespace gate: Git treated
preserved Windows CRLF snapshots as trailing whitespace. Raw diagnostics are
retained in `publication-preflight-001`. Scoped attributes now preserve exact
source/proof bytes, recognize CRLF for normal source whitespace checks, and
mark raw streams/snapshots non-diffable without rewriting their contents.
`green-003` reruns the same focused suites after this representation-only fix.

Only existing Node **22.23.4**, offline Playwright **1.56.1**, and installed
Microsoft-signed Edge **156.0.4314.50** are qualified here. Browser tests use
published `testing\browser\isolated.cjs` at **53c0c0d**, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
via `openIsolatedLesson` with awaited `close()` in `finally`. Its documented
unattended lifecycle limitation remains; the abandoned prototype is not used.

## Relevant To Do and limits

There is no remaining local lesson To Do and no extra test/plumbing/refinement
Kano unit. The parent alone independently accepts **A-S026**, once.
Native **B-S026** remains unready for this worker: its **CORE, DATA, IMAGEHOST**
gates, approved immutable-image/startup fixtures, qualified target/access and
separate execution authorization are outstanding. Those are genuine native
readiness requirements, not additional local lesson work.

This does not complete D-S026/source S026, prove a real immutable pull, native
Azure continuity, capacity headroom, business readiness, production Node24
behavior or five-nines reliability. No IaC, cloud operation, scaffold, identity
registration, deployment, expenditure, package/framework installation, browser
download or shared/root source edit occurred. The root Microsoft Open Source
Disclaimer applies.
