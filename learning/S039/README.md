# S039 — Instance-local temporary state

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. This portable lesson is A-S039, parent
D-S039, packet SC-S039, one frozen S unit. It does not complete B-S039 or D-S039.

## Worked exercise

1. Keep **Upload**, **Shared/durable teaching model**, **Observed storage contents**.
   Prepare the fixed ASCII artifact and workflow checkpoint on A. Handoff to B,
   then verify: the new owner retrieves the exact original bytes and checkpoint.
2. Reset and choose **Instance-local A only**. Repeat: ownership moves, but no
   artifact is copied. B's HTTP-like 200 contains zero bytes and no checkpoint.
   The byte/state oracle reports an interruption, never an empty success.
3. Repeat with the **Workflow checkpoint document** and **Generated export**.
   All three use the same handoff behavior; they are not extra delivery units.
4. Compare **Empty response with status 200**, **Altered bytes, same length**, and
   **Missing workflow checkpoint** in durable mode. A status code, matching byte
   count, or intact bytes alone cannot substitute for every required assertion.
5. Choose **Observation unavailable**. The result is unknown, with no invented
   response status or retrieved byte count. Unknown is neither success nor known
   loss, even when local storage is selected.

Each verified run attempts one synthetic artifact journey. Its successful,
failed and unknown counters sum to one. The verifier verdict, user-impact label
and resource cleanup are separate. A test that correctly detects local loss
passes its assertion while the displayed user transition still fails.

“Durable” is an explicit shared **in-memory teaching assumption**, not disk,
cloud or reload persistence. Ownership moves from A to B without copying local
state. The initial bytes remain immutable for comparison, not as a fallback
accessible to B. The FNV-1a-32 checksum is non-cryptographic; exact-byte equality
is independently required. No authentication or real authorization is modeled.

## Bounds, keyboard and reset

- Three fixed artifacts, at most 256 ASCII bytes each, two simulated owners,
  five observation conditions and one synchronous operator. No arbitrary files,
  text payloads, timers, randomness or asynchronous writers.
- Prepare → handoff → verify is enforced by private state. Configuration locks
  after preparation. Invalid types, values, fields, accessors, repeated commands,
  wrong-state actions and capacity overruns are rejected without changing history.
- At most 12 runs and 12 verified journeys per page lifetime. Reset may abandon
  unverified preparation; it does not invent an observation or replenish budgets.
- Native Tab / Shift+Tab, arrow keys, Enter and Space operate the controls.
  Reset restores defaults, owner A, an unknown current run and artifact focus.
  Errors are announced and focused. No element shadows the native `form.reset`.
- All verified results retain sampled bytes, checkpoint, verdict and trace in
  expandable history. Reset does not erase failures/unknowns. Reload/close clears
  the model; nothing is written to browser storage.
- Strict CSP allows only sibling scripts/styles. It blocks inline execution,
  connections, form navigation, frames, workers, images and objects.

## Focused verification

From the repository root in PowerShell, with the existing Node 22 tooling:

```powershell
node --test learning\S039\tests\model.test.cjs learning\S039\tests\page.test.cjs
node learning\S039\tests\syntax.cjs
node learning\S039\tests\browser.cjs
node learning\S039\tests\integrity.cjs
```

Ordinary verification is read-only to proof. The actual browser protocol uses
only published `testing\browser\isolated.cjs`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
(published revision `53c0c0d`), `openIsolatedLesson` and awaited `close()` in
`finally`. Offline Playwright 1.56.1 and installed Microsoft-signed Edge 156 are
explicit. No packages, browser downloads, unsafe flags, foreground browser lease
or abandoned lifecycle prototype are used. The shared helper's documented
unattended lifecycle limitation remains; this is not CI-runner certification.

The BDD feature preceded a loadable stub and genuine `unknown` versus `success`
assertion RED, then explicit IaC N/A, implementation and focused GREEN. Raw
stdout/stderr bytes, lengths, SHA-256 and base64 are retained in capture JSON.
Readable logs normalize only line endings/trailing whitespace. Exact stub and
initial test bytes use `.snapshot`, outside automatic test discovery.
`node --test learning\S039\evidence\red\replay.cjs` deliberately replays the
historical assertion failure; exit 1 is expected and is not part of GREEN.

Only deliberate producer operations write proof:
`CAPTURE_TEST_EVIDENCE=1` with `tests\capture.cjs` and a named stage,
`CAPTURE_BROWSER_EVIDENCE=1` for the browser observation, and
`CAPTURE_INTEGRITY_EVIDENCE=1` for the digest inventory. Existing captures are
never overwritten. The owned `.gitattributes` preserves raw bytes on Windows.

## Relevant To Do boundary

Keep the native B-S039 remainder genuinely gated by CORE, DATA, HOST and OBJECT:
one approved real artifact-state handoff must prove actual durable bytes,
authorization and visible local-state failure. No new test, plumbing, refinement
or second lesson unit is needed for this work. Parent-owned empirical acceptance
is pending; the worker does not mark its own card Done.

No Azure, IaC, registration, credentials, deployment, expenditure, native support,
production Node.js 24 validation, concurrent ownership fencing, HTTP transport,
multipart upload, download resume or reliability SLA is claimed. The authoritative
[source S039](../../README.md#d-sessions-authentication-and-user-state),
[D-S039 acceptance](../../.docs/wiki/backlog.md#d-sessions-authentication-and-state)
and [portable A-card contract](../../.docs/wiki/kanban.md#portable-a-card-lesson-contract)
remain separate from local evidence.

Provided “AS IS” for education, without warranties. Microsoft and Azure references
imply no endorsement, certification or support; 99.999% is a project target, not a
Microsoft SLA. See the [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).
