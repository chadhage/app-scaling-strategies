# S025 — Runtime and cache warm-up

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. This standalone lesson needs no server,
subscription, identity, credentials, framework or installation.

## Contract and worked exercise

Source: root `README.md`, **S025**; backlog **D-S025**; portable **A-S025** and
the atomic/portable contract in `.docs\wiki\kanban.md`. One frozen Kano **S**
unit, **A-S025**, packet **SC-S025**, technical gate **SOURCE**. Exact source
rows, contract and A/B packet were read before behavior design and are retained
in `evidence\source-contract.json`.

The objective is to compare cold/warm JVM traces while separating initialization
success from acceptable client latency. Preconditions: one isolated synthetic
candidate and a single read fixture. Nothing executes a Java process.

| Synthetic phase | Cold ms | Primed ms |
| --- | ---: | ---: |
| JVM/JIT | 320 | 20 |
| Application beans | 180 | 10 |
| Connection pool | 200 | 20 |
| Critical cache | 300 | 10 |

Add a fixed 40 ms client-route base: cold **1040 ms**, all primed **100 ms**,
saved **940 ms**. These are deterministic teaching constants, not measured
runtime behavior, p95/p99, cache correctness or sustained pool capacity.

1. Compare skipped defaults, predicting **HOLD**. Initialization **FAILURE**,
   latency **FAILURE** against the 200 ms budget; verifier **PASS**.
2. Prime all four phases and predict **EXPOSE**. Initialization and latency
   **SUCCESS**; verifier **PASS**; model permission only, zero traffic moved.
3. Keep them primed but choose **80 ms**, still predicting EXPOSE.
   Initialization **SUCCESS**, client latency **FAILURE**, permission **HOLD**,
   verifier **FAIL**. A correct initialization response is not a latency result.
4. Conversely, skipped phases with a **2000 ms** budget pass latency but fail
   initialization; they still HOLD.
5. Failed beans produce initialization **FAILURE** and no candidate sample.
   An unmeasured pool produces **UNKNOWN**, not a fabricated zero-duration
   success. Known failures dominate unknown observations.
6. Unmeasured export and unsupported stream routes disclose their own limits.
   They have no cold/candidate client timing and cannot borrow read-route proof.

Each phase shows its selected condition and initialization evidence, independent
from the aggregate client sample. Skipped phases pay their cold cost and fail
the pre-exposure initialization gate. Failed/unmeasured phases have no candidate
timing. Only measured-read has a route sample; both gates must succeed for
EXPOSE. The learner's prediction changes only the answer verifier.

## Guards, retained evidence and keyboard UX

Exact finite input/state schemas reject missing/extra keys, unknown choices,
coercions, accessors, symbols, unexpected prototypes, sparse histories, invalid
run identities/revisions and inconsistent recomputed observations. The budget
is an integer **50–2000 ms**, inclusive. Configuration edits invalidate the
displayed current result; invalid controls show a focused alert, never stale PASS.

History keeps each configuration, prediction, outcome and trace, including
failures and unknowns. **Eight runs**, no eviction; the ninth is rejected.
**64 configuration changes**, unchanged settings consume no edit. Operations
are pure and detach retained data. Reset explicitly clears history/errors and
restores skipped defaults; reload also clears this in-memory-only session.

Use Tab, arrows and Enter on labelled native controls, the skip link and history
details. Results are live status text. Reset focuses JVM/JIT and calls
`HTMLFormElement.prototype.reset.call(form)`; no control shadows `form.reset`.

Strict CSP blocks connections, inline scripts/handlers, forms, frames, objects,
workers and base changes; only local scripts/styles are allowed. Browser checks
assert genuine CSP violation events. Zero requests reach the additional test
route guard, distinguishing CSP denial from route-abort denial.

## Focused verification and provenance

Run from the repository root in PowerShell, with capture **unset**:

```powershell
node --test --test-concurrency=1 --test-reporter=tap .\learning\S025\tests\warmup.test.cjs .\learning\S025\tests\syntax.test.cjs .\learning\S025\tests\integrity.test.cjs .\learning\S025\tests\browser.test.cjs
```

Normal verification is **read-only to proof**. For a deliberate, append-only
browser refresh only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S025\tests\capture.cjs browser --test --test-reporter=tap .\learning\S025\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Sequence: BDD → loadable stub → **23 real assertion failures, one stub-shape
pass** → explicit **IaC N/A** → implementation/refactoring → focused green,
syntax/integrity → actual DOM/keyboard/error/reset/failure/CSP checks.
The original RED contains 24 tests; three extra guard/determinism checks were
added afterward and have no claimed initial RED. Final model coverage is 27
tests; syntax covers all eight owned runnable JavaScript files. The browser
suite has 14 leaf observations plus one parent, not 15 independent features.

`evidence.json` indexes exact commands, times, exit codes, source SHA256,
lossless raw stdout/stderr (base64 plus untrimmed UTF-8), signed tooling
provenance and actual browser observations. RED `.snapshot.txt` files are inert,
not auto-discovered tests. No missing-code/tool failure is called behavioral RED.
The implementation commit is resolved by its annotated
`kanban/A-S025/<12sha>` tag; publication and parent review stay outside the
self-referential source manifest.

The first publication, `b8637370d9ed`, exposed Git CRLF-to-LF normalization
in 17 files, including RED snapshots. Its passing working-tree checks did not
qualify checkout-byte integrity. That tag remains unqualified and unchanged;
`publication-normalization-001.json` preserves the actual mismatch. Owned
`-text` attributes now preserve raw bytes. The publisher then correctly stopped
on preserved CR line endings; its lossless rejection is retained separately in
`publication-whitespace-001.json`, not called behavioral RED. Owned whitespace
attributes recognize CR-at-EOL while retaining blank-at-EOL, blank-at-EOF and
space-before-tab checks. An intermediate publication, `26d90d5b686a`, retained
13 stat-cached normalized blobs despite the attribute change; its tag also stays
unqualified. `publication-normalization-002.json` retains the actual mismatch.
Only `learning\S025` was rehashed with `git add --renormalize` under the publisher
mutex, then all 81 tracked index blobs were compared byte-for-byte; see
`publication-index-001.json`. Commits and pushes still use the authorized publisher.
Final references are `green-004`, `syntax-004`, `integrity-007`, `tooling-004`,
`browser-004` and `integrity-008`; earlier captures remain historical, not
silently overwritten. Final worker reporting additionally checks every published
blob against its verified working bytes.

Only existing Node **22.23.4**, offline Playwright **1.56.1**, signed installed
Edge **156**, and published helper `53c0c0d` are used. Helper SHA256:
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
The browser uses `openIsolatedLesson` and awaited `close()` in `finally`.
The helper's documented unattended lifecycle limitation remains; its abandoned
recovery prototype is neither used nor qualified. No browser flags are weakened.

## Refined remainder and limits

No separate JVM/bean/pool/cache, testing, plumbing or refinement unit is created;
the bounded local To Do is this one comparison. No known local implementation
remainder is intended; the parent must independently review and Accept once.

Native **B-S025** remains separate and unready: **CORE, DATA, JAVA** (including
C097/C098 and HOSTJAVA), a concrete qualified Java host/fixture, access and
separately approved execution are genuine gates. D-S025 retains **P007** and
requires actual initialization and client-latency observations, including
unsupported/unmeasured route disclosure. This lesson completes neither source
S025 nor D-S025, certifies neither native Java/Azure nor production Node24, and
does not prove continuity or five-nines reliability.

No cloud, IaC, scaffold, identity registration, deployment, expenditure, package
or framework change, download or shared/root edit is part of this deliverable.
The root Microsoft Open Source Disclaimer applies.
