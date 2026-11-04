S132 - Finish the original sign-in across cutover
Training rehearsal - synthetic data - not a live Azure result

Open learning\S132\index.html directly in a browser. No server, package,
framework, account, identity provider or cloud resource is needed.

EXACT SOURCE / ONE ORIGINAL UNIT
README S132: "Sign-in in progress: Finish authentication across the transition
without requiring the user to restart."
D-S132: "Add an interactive sign-in journey spanning the cutover boundary."
Exact acceptance: "The user finishes login without restarting, losing state,
or exceeding the agreed budget." Dependency D-S035 remains incomplete.
A-S132: "Finish a sign-in across cutover; detect forced restart or lost callback
state." Gate SOURCE; packet SC-S132; owner worker-A-S132; frozen Kano S, one
original A-S132 unit. manifest.json retains and integrity tests verify exact rows.

DECLARED FICTIONAL CONTRACT
Every sign-in, identity, session, callback, state, version, routing, restart
and journey record is fixed fictional teaching DATA ONLY. None is actual
OAuth, identity, account, credentials, cookie or network data. There are no
callback URLs, personal identity inputs, live connections or management calls.

One fictional journey starts on old/v1 at 0 ms. Cutover is at 500 ms, callback
normally at 1400 ms, and the final signed-in page normally completes at 1800 ms.
The slow trace completes at 4200 ms. Null is unobserved; "missing" callback
state is an observed loss, not an unknown. These are trace numbers, not clocks.
Choose an exact integer original budget 1000-5000 ms (default 2000 ms).
Equality passes; the time origin is NEVER reset at cutover/callback/restart.

Session rotation is legitimate: the fictional pending session differs from
the issued authenticated session. The correct final page must bind the issued
authenticated session to the ORIGINAL intended identity. Agreement between
two wrong-identity records does not establish intended sign-in.

OPERATOR ACTIONS
1. Select one of twelve exact fixed trace presets and agree the original budget.
   Press Start original sign-in (Enter on the budget also submits).
2. Cut over to v2. Original v1 state, identity and budget remain pinned.
3. Deliver callback record. HTTP 200 and v2 are INTERMEDIATE evidence only.
4. Finish and verify sign-in. Inspect all fifteen positive/negative/unknown
   checks plus the final identity, issued/final session, page and original time.
Start another run after measurement to compare outcomes; earlier traces and
all checks remain in expandable native details. Four runs / sixteen actions
are retained without pruning. A fifth run produces an explicit safe-hold error.
Reset clears only this page's in-memory DATA and returns keyboard focus to the
preset. The native HTMLFormElement prototype avoids form.reset shadowing.

POSITIVE: one fixed fictional original journey met every declared check.
NEGATIVE: a known wrong state/identity/session/page/version/route, forced
restart, incomplete sign-in, incorrect chronology or original-budget overrun.
UNKNOWN: callback observations or original completion timing are insufficient.
Known negative checks dominate unknown checks; both remain individually shown.
A successful callback HTTP or a new-version label cannot certify continuity
when the original state/identity is wrong or a user restart was forced.
The slow-200 preset fails default 2000 ms but passes an agreed 4200 ms budget.
No result is live sign-in, all-user continuity, native Azure proof or an SLA.

STATE / ERROR / KEYBOARD UX
Start -> cutover -> callback -> finish is enforced by exact typed commands
and deterministic replay of retained history. Plain-record/descriptor guards
reject accessors, coerced numbers/booleans, extra keys, unknown presets and
forged materialized state before reading or changing the exercise.
Inputs lock during the current journey; even DOM-edited budgets cannot change
the pinned original budget. Out-of-order buttons are intentionally focusable:
they show visible alert/status errors, retain state and cannot advance it.
Native labels, Tab/Enter, visible focus and details support keyboard operation.
A missing local model disables actions and displays no measured success.
CSP is before resources and denies inline scripts/eval/styles, connections,
images, frames and form navigation. CSP probes are TEST-ONLY and not referenced
by the lesson; they use blocked local/data destinations, not live network.

BDD -> LOADABLE STUB -> GENUINE RED -> IAC N/A -> GREEN
sign-in.feature preceded the loadable stub. evidence\red-stub\ holds its exact
HTML/CSS/JS bytes and assertions.cjs, deliberately outside test autodiscovery.
evidence\raw\red.stdout.tap contains genuine ERR_ASSERTION (expected started,
actual idle), not missing imports or tooling errors. stub-browser.json records
actual keyboard activation of the loadable stub and awaited isolated cleanup.
IaC was evaluated N/A AFTER that RED: resource-free fixed DATA ONLY lesson.
No infrastructure, identity operation or resource was generated.

FOCUSED VERIFICATION (READ-ONLY)
From repository root in PowerShell, with CAPTURE_BROWSER_EVIDENCE unset:
  node --test learning\S132\model.test.cjs learning\S132\integrity.test.cjs learning\S132\browser.test.cjs
  node --check learning\S132\model.js
  node --check learning\S132\app.js
No source or historical evidence is rewritten by normal verification.
Only EXACT CAPTURE_BROWSER_EVIDENCE=1 deliberately creates a NEW exclusive
browser JSON in evidence\raw\. Never overwrite old observations. Do not set
that variable for ordinary verification or parent acceptance.

Actual browser checks use the published testing\browser\isolated.cjs at
53c0c0d, SHA256 86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055.
Use openIsolatedLesson and await close() in finally. Existing offline Playwright
1.56.1 / Microsoft-signed Edge 156.0.4314.50 / Node 22.23.4 are LOCAL test
tooling, NOT production Node.js 24 validation. No install, download, foreground
lease or unsafe flag is used. The helper has known unattended context/page/
cleanup lifecycle limitations; its inactive recovery prototype is unqualified.

BYTE INTEGRITY
evidence\source-hashes.json separates observed RAW byte SHA256, canonical LF
SHA256 and canonical Git blob identity. Working CRLF and canonical Git LF are
not interchangeable raw-byte claims. .gitattributes was established early:
only evidence\raw\** and evidence\red-stub\** are -text -diff.
Those historical proof bytes remain EXACT; ordinary text follows canonical LF.

HONEST REMAINDER / AUTHORITY
The original B-S132 Kano unit remains To Do, readiness=false, not admitted.
Refinement: ONE separately authorized native interactive sign-in crossing one
cutover, original budget and correct intended identity/state/issued-final
session/page; no forced restart; retain native negative and unknown outcomes.
Blocker: CORE, DATA, HOST, approved native target, authorized real sign-in
fixture and actual identity/session/state/route/completion-time observations
are absent. No cloud/IaC/scaffold/identity/credentials/deployment/spend approval.
D-S132 and its D-S035 dependency remain source-parent incomplete.
Parent alone accepts A-S132 once; zero extra test/repair/proof/refinement credits.
C005-C008, local-harness, shared/root/README/ledger integration are parent-owned
and untouched by the lesson. Stop after this one mission.
