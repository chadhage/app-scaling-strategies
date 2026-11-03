# S051 — Old frontend to new API

**Training rehearsal - synthetic data - not a live Azure result**

A-S051 · D-S051 · frozen S · packet SC-S051 · owner `worker-A-S051`.
Open `index.html` directly in a modern browser. No server, account, credentials,
authentication, framework, dependency installation or Azure connection is needed.
The standalone bundle and `manifest.json` remain portable for later mounting.

## Worked exercise

1. Keep **Compatible** and **Complete**. The unchanged old frontend v1 consumes
   `id`, `displayName` and integer `unreadCount`.
2. **Open old frontend v1** renders the baseline **Synthetic learner — 1 unread**
   and locks assumptions. This is not yet a candidate result.
3. **Run new API journeys** evaluates three fixed synthetic GET `/api/profile`
   responses through that same old renderer. The additive API preserves consumed
   fields and adds an ignored `theme` field. Expected unread counts **2, 3, 4**
   all render correctly: **3 observed, 3 HTTP 200, 3 correct, gate PASS** and
   **uninterrupted synthetic impact**.
4. Choose a prediction and **Check prediction**. Its verifier is independent of
   the compatibility gate and user impact.
5. **New attempt (retain history)** clears current result, preview, prediction
   and trace without erasing any completed assumptions, measurements or verifier.
   Choose **Breaking** and run again: `displayName` has moved to `profile.name`.
   All three responses still say **HTTP 200**, but the unchanged renderer cannot
   read them: **3 failures, gate FAIL, interrupted synthetic impact**. Predicting
   interruption correctly passes the learning verifier, never the failed gate.
6. **Reset rehearsal** explicitly restores exact defaults, idle phase, empty
   history, preview, trace, prediction, errors and keyboard focus.

| Response | Observations | Correct / failed / unobserved | Gate | Synthetic impact |
| --- | --- | --- | --- | --- |
| Compatible | Complete | 3 / 0 / 0 | PASS | uninterrupted |
| Breaking | Complete | 0 / 3 / 0 | FAIL | interrupted |
| Compatible | Partial (first only) | 1 / 0 / 2 | UNKNOWN | unknown |
| Breaking | Partial (first only) | 0 / 1 / 2 | FAIL | interrupted |
| Either | Absent | 0 / 0 / 3 | UNKNOWN | unknown |

Unobserved status, body and rendering stay unknown. Selecting a breaking fixture
is not evidence that an unobserved response actually failed. A known failure
dominates incomplete proof, but the other journeys remain explicitly unknown.
The UI shows the received shapes and field-specific failures, not just totals.

## Guards, bounds and keyboard operation

- Three fixed requests, two response fixtures, three observation choices and at
  most **eight completed attempts**. No arbitrary JSON, scripts, endpoints,
  payloads, identities, tokens or keys. History never silently evicts a result.
- Only idle → opened → complete is valid. Assumptions lock on opening; a second
  run or prediction, skipped stage or premature new attempt is rejected.
  Reset is the explicit way to abandon opened work.
- Model configuration requires exactly two own data fields with exact enum
  values. Missing/extra/inherited/accessor/symbolic values and coercion fail
  without mutating state. Snapshots are deeply frozen copies of private state.
- Native buttons/selects support keyboard operation. Focus moves Open → Run →
  Prediction → New attempt (or Reset when full). Errors use an alert and invalid
  choices get `aria-invalid`. Reset returns focus to Open and does not shadow
  the native `form.reset` method.
- Current proof is cleared on New attempt; selected operator choices remain
  available for comparison. History is in-memory only and clears on reload.
- Rendering uses text nodes. CSP denies connections, inline execution, images,
  forms, frames, objects and workers; only local external scripts/styles load.

## Verification and provenance

Use the existing **Node.js 22.23.4 test tooling only**:

```powershell
node --test --test-reporter=tap .\learning\S051\tests\model.test.cjs .\learning\S051\tests\surface.test.cjs .\learning\S051\tests\integrity.test.cjs .\learning\S051\tests\browser.test.cjs
node --check .\learning\S051\fixtures.js
node --check .\learning\S051\model.js
node --check .\learning\S051\app.js
```

Normal verification reads committed proof and never refreshes it. The browser
test still performs actual DOM/keyboard/error/reset/failure/CSP checks. It uses
only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`),
`openIsolatedLesson`, and awaited `close()` in `finally`, with the existing
offline Playwright **1.56.1** and installed Microsoft-signed Edge **156**.
No downloads, unsafe flags, foreground lease or abandoned lifecycle prototype.
The helper's documented unattended shutdown limitation remains unqualified.

Only a deliberate capture writes `evidence\browser.json`:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node --test --test-reporter=tap .\learning\S051\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

An intentional source change requires deliberate recapture and content-hash
refresh before read-only integrity verification.

- `old-frontend.feature` preceded the loadable stub and genuine behavioral RED.
- `evidence\source-contract.json` preserves the exact S051/README row, D-S051,
  A/B rows, portable/atomic contract, default packet rule and source-read baseline.
- `evidence\red\run.json`: **21 tests, 1 pass, 20 assertion failures**, exit 1,
  no missing imports, implementation files or tools. Four `.snapshot` files
  preserve the original feature, fixtures, stub and tests without auto-discovery.
- IaC was explicitly **N/A after RED and before implementation**.
- Raw stdout/stderr are gzip-preserved with SHA-256 provenance. Readable TAP
  removes trailing whitespace only. Binary snapshot attributes preserve bytes.
- `evidence\initial-syntax\` retains a separate initial IIFE closing-parenthesis
  syntax defect and raw diagnostic; this is not counted as behavioral RED.
- `evidence\browser.json`, focused green, syntax and content hashes bind actual
  verification to this owned bundle. The finite content inventory excludes
  itself and final run logs to avoid self-reference. Normal checks are read-only.

## Evidence boundary

All profiles, requests, responses, HTTP statuses and traces are synthetic.
There is **no real HTTP/API transport, routing, authentication, deployment or
protocol proof**. This lesson does not certify native Azure behavior, production
Node.js 24, uninterrupted real migration, five-nines reliability or the browser
helper's unattended lifecycle. B-S051 and D-S051 native acceptance remain
unfulfilled. No cloud/IaC/scaffold/identity/deploy/spend, package/framework or
root/shared edits were performed. Publication does not award Done credit:
parent empirical acceptance alone does that, once, for this single frozen S unit.
