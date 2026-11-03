# S040 — Cookie-less clients

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. This standalone A-S040 lesson is
one frozen Kano S unit, parent D-S040, packet SC-S040. It does not complete the
native B-S040 card or the original source parent.

## Worked exercise

Two distinct synthetic API/mobile clients already have observed v1 baselines.
Their work consists of a draft ID, workflow step and revision. Both destinations
are assumed available; each client keeps its original 300 ms end-to-end deadline.
All timings, destinations, HTTP statuses, identity checks and cookie records are
deterministic in-memory fixtures, **not real requests or authentication**.

1. Select **Present — browser-only v2 cookie fixture**, **Require a browser
   session cookie**, and **Browser v2 cookie, otherwise fallback v1**. Rehearse:
   eight checks pass, but the result is **unknown**. A good browser-cookie trace
   does not exercise cookie-less continuity.
2. Reset, keep those identity/routing rules, but leave cookies **Absent**.
   Rehearse: the clients are rejected (synthetic 401) and the routing rule falls
   back to v1. The trace exposes both broken assumptions.
3. Reset to the defaults: **Absent**, **Validate synthetic bearer subject**,
   **Cookie-independent API policy → v2**, **Shared fixture keyed by verified
   subject**, **Complete**. All **9/9 checks** pass: both clients reach v2 with
   their own subjects and complete work, at **150 ms** and **240 ms** from their
   original starts. Routing policy does not authenticate a client.
4. Choose **Instance-local v1 fixture only**. Both synthetic responses can be
   HTTP 200 on v2 while work is missing: **7 pass / 2 fail**, never success.
5. Choose **Delayed by 200 ms**. Total elapsed time becomes **350 / 440 ms**
   against the same **300 ms** deadlines. The handoff does not reset a budget.
6. With bearer identity, choose **Invalid synthetic bearer marker**. The clients
   stay rejected, including when synthetic browser cookies are present. These
   markers are plain teaching labels, not JWTs, signing keys or usable tokens.
7. Choose **Mobile observation unavailable**. The API client is observed, but all
   four mobile checks stay unknown: **5 pass / 0 fail / 4 unknown**. Combine this
   with cookie routing and a known API routing failure dominates the overall
   result while retaining the four unknowns.

The browser-only cookie fixture selects v2 solely to expose misleading browser
confidence. Its fallback v1 is a declared teaching policy, not a claim about a
particular Azure routing mechanism. The browser-session rule is a different
synthetic identity mechanism, not a fallback that weakens bearer validation.

## Guards, history and keyboard access

- Exactly five enum choices, two fixed clients, nine checks and 64 declared
  configurations. No arbitrary payloads, token text, code or destinations.
- After a recorded run, reset is required before another run. Invalid inputs,
  stale actions and capacity overruns focus an announced error and do not alter
  the current result or retained evidence.
- At most **12 recorded rehearsals** per page lifetime. Reset restores default
  choices and an untested current result, retains every configuration/trace and
  outcome, and cannot replenish that budget. Exhaustion disables new runs.
- Expand retained records for their complete JSON evidence. History remains in
  memory only; reload clears it. There are no browser-storage writes.
- Tab / Shift+Tab move, arrows choose, Enter / Space activate. Reset returns focus
  to the first choice, or the current-result heading after exhaustion. Errors and
  outcomes are announced. No control shadows the native `form.reset()` method.
- Strict CSP allows only local scripts/styles. Inline execution, connections,
  frames, workers, objects and form navigation are denied.

## Focused verification

Run from the repository root in PowerShell, using the existing Node 22 tooling:

```powershell
node --test learning\S040\tests\model.test.cjs learning\S040\tests\page.test.cjs
node learning\S040\tests\syntax.cjs
node learning\S040\tests\integrity.cjs
node learning\S040\tests\browser.cjs
& .\learning\S040\tests\tooling.ps1
```

Ordinary verification is **read-only to proof**. Browser observations are written
only with `CAPTURE_BROWSER_EVIDENCE=1`; captures refuse to overwrite existing
files. `tests\capture.cjs` separately requires `CAPTURE_TEST_EVIDENCE=1` for named
RED, replay, GREEN, syntax and browser captures. Initial integrity creation needs
`CAPTURE_INTEGRITY_EVIDENCE=1`; tooling capture needs `CAPTURE_TOOL_EVIDENCE=1`.
These flags are deliberate producer operations, not ordinary verification.

The browser protocol uses only published `testing\browser\isolated.cjs`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
(published revision `53c0c0d`), `openIsolatedLesson`, and awaited `close()` in
`finally`. Existing offline Playwright **1.56.1**, signed Microsoft Edge
**156.0.4314.50** and Node **22.23.4** are explicit. No download, installation,
unsafe browser flag, integrated-browser lease or abandoned lifecycle prototype is
used. The shared helper's documented unattended lifecycle limitation remains;
this is not qualification of an unattended CI runner.

### Evidence and honest failures

`evidence.json` maps the exact source contract, BDD, loadable stub, genuine
behavioral assertion RED, explicit IaC N/A, implementation and focused GREEN.
Original stub/assertion bytes use `.snapshot`, outside automatic test discovery.
The explicit historical replay is:

```powershell
node --test learning\S040\evidence\red\replay.cjs
```

Its expected exit is **1**: actual `unknown` versus required `success`, not missing
code, tools or packages. The original source/assertion snapshots and raw stream
bytes are retained.

The first actual browser attempt passed 15 exercise checks but failed its last
protocol check: Playwright's locator waited for navigation after CSP correctly
blocked a form submission. It is preserved as failed `evidence\browser.json`
and `browser-observation.json`, with the exact protocol snapshot. The correction
uses direct DOM evaluation after blocked navigation; it does not change lesson
behavior or relax CSP. The successful **16-check** capture is `browser-002.json`
and `browser-observation-002.json`. This protocol failure is **not** the BDD RED.

Capture JSON retains exact stdout/stderr lengths, SHA-256 and base64 bytes.
Readable `.txt` logs only normalize line endings and trailing whitespace.
The owned `.gitattributes` preserves source/snapshot bytes across Windows checkout
and recognizes CRLF while retaining normal whitespace checks.
Integrity verifies every owned file except its own inventory, raw capture streams
and snapshot hashes. Historical failed browser evidence is explicitly checked as
failed; it cannot substitute for the successful final capture.

The first scoped publisher stopped before commit/tag/push because `-text`
preserved Windows CRLF but the whitespace attribute did not yet recognize it.
The raw failed check is retained in `publication-attempt-001.json` and gzip
streams. Adding `cr-at-eol` fixes that interpretation without changing historical
bytes or disabling trailing-whitespace checks. The old inventory and verifier are
retained; **`evidence\integrity-002.json` is the current final inventory**.
The final focused GREEN/syntax captures are `green-002.json` and `syntax-002.json`.

## Remaining native work and To Do refinement

Keep the original B-S040 remainder gated on **CORE, DATA, HOST and C032**, an
approved target, actual authenticated cookie-less drivers, destination/state and
original-budget observations, and explicit live-execution authorization.
This lesson neither establishes those gates nor authorizes cloud/IaC generation,
identity registration, credentials, scaffolding, deployment or spending.

No separate testing, plumbing or refinement unit is needed for this lesson.
`evidence\refinement.json` records that scope boundary without changing shared
backlog files or manufacturing additional completion credit. Parent-owned
independent review and acceptance remain pending after scoped publication.

Authoritative sources:
[README S040](../../README.md#d-sessions-authentication-and-user-state),
[D-S040 backlog](../../.docs/wiki/backlog.md#d-sessions-authentication-and-state),
and [portable A-card contract](../../.docs/wiki/kanban.md#portable-a-card-lesson-contract).
No native Azure result, source-parent completion, production Node 24 validation,
real authentication, durable storage or reliability SLA is claimed.

Provided AS IS for education without warranties. Microsoft/Azure references do
not imply endorsement, certification or support; 99.999% is a project goal, not a
Microsoft SLA. See the [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).
