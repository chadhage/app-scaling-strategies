# S094 — Synthetic authentication regression

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, account, dependencies, or framework is needed for the lesson.

## Contract and worked exercise

- Card **A-S094**, parent **D-S094**, sibling **B-S094**, packet **SC-S094**, frozen Kano **S**: one unit.
- Exact inventory objective: **Break candidate authentication; detect forced reauthentication or rejected valid sessions.**
- README/S094: **Detect login/session failures before expanding the affected cohort.**
- Backlog acceptance: **Authentication failures stop expansion without bypassing validation; affected users remain counted.**
- Preconditions: local JavaScript, eight fixed synthetic journey labels, a two- or four-journey pilot, and separate old-only controls.

Choose **Forced reauthentication** with a two-journey pilot. Start, observe, and attempt expansion.
The fixed trace yields **FAILURE**, one success, one authentication interruption, and no unknowns.
Admission is stopped as soon as the observations are inspected; expansion remains blocked and validation remains required.
The synthetic transition numerator/denominator is **1 / 2**, not 7 / 8: six old-only controls are excluded.
Predict **FAILURE** and check: learner **PASS** does not turn interrupted journeys into successes.

The six fixed fixtures cover compatible outcomes, forced reauthentication, rejected valid sessions,
rejected sign-in checks, missing observations, and a known failure plus an unknown.
Missing evidence is **UNKNOWN** and blocks expansion. A known failure takes precedence over UNKNOWN,
but the unresolved attempt remains counted. Compatible evidence permits only an **unexecuted**
next-stage gate check, not another exposure stage or real session-continuity certification.

Configuration freezes after starting. Out-of-order actions, unsupported fields/values, forged model states,
and malformed DOM inputs fail closed without changing measurements or history.
New attempts retain up to six checked outcomes, including wrong predictions. The seventh requires an explicit reset.
All history is page memory only; reset/reload deliberately clears it.

## Keyboard and safety

Tab to the skip link, press Enter, then use Tab/arrow keys/Enter for the labeled selects and buttons.
Successful actions move focus to the next control; visible guard alerts receive focus.
**Reset all local data** remains available during every valid phase and restores default controls/focus.
No form control shadows `form.reset`; reset calls `HTMLFormElement.prototype.reset` explicitly.

The page CSP permits only local scripts/styles and blocks connections, inline scripts, form submissions,
frames, workers, images and objects. It uses no inline handlers, network APIs, browser storage,
real credentials, tokens, cookies, registration, identity, authentication, or reauthentication operations.
All session/sign-in failures are enum-only fixed synthetic fixtures.

## Focused verification

From the repository root in PowerShell, using the existing offline **Node 22.23.4 / Playwright 1.56.1 /
Microsoft-signed Edge 156** tooling:

```powershell
node --test .\learning\S094\tests\model.test.cjs .\learning\S094\tests\integrity.test.cjs .\learning\S094\tests\browser.test.cjs
node --check .\learning\S094\model.js
node --check .\learning\S094\app.js
```

Normal verification is **read-only**: it does not regenerate evidence, source snapshots, fixtures, or manifests.
It checks raw-byte hashes and separately qualifies canonical LF Git-source integrity.
The working source CRLF snapshots remain byte-for-byte preserved.
Only `evidence/raw/**` is marked `-text -diff`: original TAP indentation and source bytes are retained, not whitespace-cleaned.
The shared Kanban's mutable board text differed at capture; its exact A/card/packet source scopes still match
the immutable canonical Git source. This distinction is explicitly recorded, not hidden by normalizing raw evidence.

Browser verification uses only published `testing\browser\isolated.cjs`,
SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
at `53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, via `openIsolatedLesson` and awaited `finally` close.
That exact hash qualifies the working CRLF helper; its canonical LF bytes are compared separately to the immutable Git object.
It performs actual DOM/keyboard, FAILURE/SUCCESS/UNKNOWN, affected counts, wrong prediction,
history-limit, invalid-input, out-of-order, error-recovery, reset/reload, and enforced CSP checks.
CSP probes use a reserved synthetic host with an additional abort-only browser route:
the passing check requires **zero HTTP requests**, not merely a failed request.
The abandoned lifecycle prototype is not used; the shared helper's documented unattended lifecycle limit remains.

Evidence capture was deliberate and one-time:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node --test .\learning\S094\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Do **not** set that variable for ordinary verification. The capture path refuses to overwrite retained evidence.
Raw RED sources use `.snapshot` suffixes outside test discovery; their genuine failing assertion remains in the green suite.
`evidence\raw\red` retains the loadable stub, BDD, test, TAP, and expected `ERR_ASSERTION` (`UNKNOWN` versus `FAILURE`).
`evidence\iac.json` records **N/A after RED**, before implementation.
`evidence\raw\browser` retains actual DOM, screenshots, CSP observations, tooling versions, and awaited cleanup.
`evidence\raw\focused-green` records 33 passing focused tests, 11 actual browser groups, five syntax checks,
and unchanged owned-file fingerprints during normal verification. Repeated tests earn no extra credit.
`evidence\integrity.json` inventories raw bytes and canonical-text hashes for read-only review.

## Evidence limits and remainder

This is a resource-free portable A-card rehearsal, not native Azure proof, production Node.js 24 validation,
actual authentication/reauthentication/session-continuity certification, five-nines evidence, or source-parent completion.
No cloud, IaC, scaffold, identity, credentials, deployment, spend, packages, frameworks, shared files, or foreground leases
are authorized or changed. B-S094 and D-S094 native requirements remain outside this unit.

The local slice is bounded to one pilot and one gate per attempt; no extra test/plumbing/refinement credit is claimed.
Parent-owned independent empirical review and acceptance are required; the worker does not mark itself Done.
