# S034 — Authentication-key continuity

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, installation,
credentials or network access is needed.

## Exact source and scope

- [README S034](../../README.md#d-sessions-authentication-and-user-state):
  “Authentication-key continuity: Keep cookie/token validation compatible across
  deployments and planned key rotation.”
- [D-S034](../../.docs/wiki/backlog.md#d-sessions-authentication-and-state):
  compare compatible/incompatible cookie/token-key rotation across v1/v2;
  valid sessions survive compatible rotation and invalid configuration is detected
  without weakening authentication or exposing keys.
- [A-S034 portable contract](../../.docs/wiki/kanban.md#portable-a-card-lesson-contract):
  rotate compatible/incompatible fixture keys; authentication failures cannot be
  reclassified as migration success.
- Frozen **S**, one unit `A-S034`, packet `SC-S034`, owner `worker-A-S034`.
  No additional unit, native B-S034, source-parent completion or self-acceptance.

`manifest.json` declares the fixture, preconditions, actions, bounds, assertions and
limits. `authentication-key-continuity.feature` is the behavioral specification.
The exact source rows, claim, portable contract and source hashes are retained in
`evidence/source-contract-001.json`.

## Worked exercise

1. Keep **Cookie**, **Compatible**, **2 profiles**, **Complete**. Rehearse:
   four accepted cross-version journeys, no rejection/unknown, migration
   **success**, verifier **pass**.
2. Choose **Token** and **Incompatible**. Rehearse:
   four rejected journeys. The expected-negative verifier **passes** while
   migration remains **failure**, with an interrupted user transition.
3. Choose **Compatible** and **One missing reply**:
   three accepted, zero rejected, one unknown out of four attempts; migration
   **unknown**, verifier **unverified**, success fraction **75%**, not 100%.
4. Choose **Incompatible** with that missing reply:
   three rejected and one unknown; migration **failure** takes precedence.
5. Reset controls using keyboard Tab/Enter or Space. Defaults and focus return
   to the credential control; current result clears, but history is retained.
   Invalid input leaves the last result and history unchanged and focuses an alert.

Every profile contributes two valid-credential journeys: an old-label fixture
issued on v1 and checked by v2, and a next-label fixture issued on v2 and checked
by v1. Compatible policies validate both labels on both versions. Incompatible
policies validate old only on v1 and next only on v2. This deliberately unsafe
fixture exposes loss of authentication continuity; no validation bypass is offered.

Own-version valid probes must succeed and tampered fixtures must be rejected on
both versions. These separate guard checks are **not** added to migration success
counts. Missing observation masks just the last v2-to-v1 journey; known failures
never disappear. Counts always satisfy attempted = accepted + rejected + unknown.

Bounds are 1–8 profiles, 2–16 journeys per run and eight retained runs. A ninth
run is rejected, even after reset. Results and state snapshots are immutable.
All histories are in-memory for the current page session only; reload starts a
new session. There is no durable control service.

## Verification and provenance

From the repository root in PowerShell, normal verification is **read-only to all
proof**:

```powershell
node .\learning\S034\verify.cjs
```

This runs focused model, syntax and integrity checks, then actual isolated browser
DOM, keyboard, error, reset, negative, history-cap and CSP checks. It does not
refresh observations or overwrite raw evidence. Browser scratch is managed and
removed by the approved helper, not treated as proof.

The sequence was BDD → loadable stub → actual assertion RED (`unknown` versus
required `success`) → explicit IaC N/A → implementation/refactoring → focused
green/syntax/integrity → actual browser. The historical RED model, test, HTML and
BDD are `.snapshot.txt` files, deliberately not auto-discovered runnable tests.
Raw stdout/stderr and source/command hashes accompany each captured run.
Bundle attributes disable line-ending rewriting so tested bytes remain exact
after publication. Raw evidence also uses binary diff handling: original TAP
assertion indentation/trailing whitespace is preserved, not trimmed to pass a
whitespace check. The initial publisher preflight stopped before commit for
that raw whitespace; a second stopped for preserved CRLF source endings.
Scoped attributes recognize CRLF while retaining normal source whitespace
checks; no evidence bytes were changed to recover publication.

The first browser attempt is retained as a **failure**, not a pass: its check
incorrectly required three file-origin Resource Timing entries. The corrected
check verifies actual local assets, the loaded oracle and computed CSS instead;
the failed test source is preserved byte-for-byte as a non-runnable snapshot.

Only deliberate evidence refresh may write browser proof:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S034\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture appends uniquely numbered records and never silently replaces history.
`capture.cjs` also supports explicit `green`, `syntax`, `integrity` and
`read-only-rerun` captures. `evidence.json` identifies the retained records.
Read-only rerun capture hashes every existing proof byte before and after the
normal verifier; only its own new report is then appended.

Test tooling only: Node.js 22.23.4, existing offline Playwright **1.56.1**, signed
installed Edge **156**, and `testing\browser\isolated.cjs` at
`53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
The browser test calls `openIsolatedLesson` and always awaits `close()` in
`finally`. The abandoned lifecycle prototype is not used or qualified; the
published helper's documented overall shutdown-deadline limitation still applies.

## Limits

Public `fixture-old`/`fixture-next` labels are not keys. The oracle is a deterministic
lookup, not cryptography, cookie storage, bearer-token validation or authentication.
No real credentials, identities, registrations, external effects, cloud calls,
IaC, deployments, spending, downloads, frameworks or packages are introduced.

Token expiry, key propagation delays, real issuer/audience semantics, production
rotation policy and host-specific behavior remain out of scope. This does not
certify native Azure behavior, production Node.js 24, five-nines availability or
completion of D-S034/S034. Parent-owned empirical acceptance remains required.
See the source [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer);
this demonstration is not a Microsoft SLA.
