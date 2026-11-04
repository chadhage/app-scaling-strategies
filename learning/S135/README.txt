A-S135 / S135 / D-S135 / SC-S135 / one original frozen Kano S unit

Training rehearsal - synthetic data - not a live Azure result

OPEN AND CONDUCT
Open learning\S135\index.html directly in a browser; no server is needed.
All event, webhook, acknowledgement, retry, deduplication, key, state, effect,
version, elapsed-time and budget values are fixed fictional teaching DATA ONLY.
The operator loads fixed observations, not an actual webhook or business action.
No URL, payload, secret, identity or user identifier is accepted.

Choose stable-key; leave the exact token fictional-event-135 and budget 1000.
Load first delivery DATA -> Record cutover DATA -> Redeliver delayed attempt
DATA -> Measure original event DATA. The v1 and delayed v2 attempts concern
ONE event. The same effect snapshot shown twice is NOT two new effects.
Cutover is neither a delivery attempt nor an effect.

FIXED MEASUREMENTS
Preset              Attempts  Latest effect rows  Event outcome / verification
stable-key          2         1                   positive / verified-positive
versioned-key       2         2                   negative / verified-negative
lost-ack            2         1                   unknown / unverified
unknown-completion  2         1 (earlier unknown)  unknown / unverified
budget-exceeded     2         1                   negative / verified-negative
wrong-effect        2         1 (incorrect)        negative / verified-negative

Stable-key records exactly ONE verified correct business result, not two
delivery successes. Version-scoped key DATA produces a duplicate effect,
even though both attempts receive acknowledgements. Wrong-effect illustrates
that one row and an acknowledgement do not prove correct effect state/result.
Budget-exceeded acknowledges the retry at 1250 ms, beyond the ORIGINAL
1000 ms budget starting at 0 ms. Redelivery cannot restart that budget.
These are fictional timing observations, not real waits, SLAs or spend limits.

LOST ACKNOWLEDGEMENT AND UNKNOWN COMPLETION
Lost-ack has one observed effect but the original acknowledgement is lost.
The later deduplicated retry is acknowledged; the original attempt nevertheless
remains unverified. Unknown-completion has unobserved original completion,
acknowledgement, dedup state and effect snapshot (null, NOT zero). A later v2
one-effect snapshot is distinct from the earlier unknown; it cannot establish
the original completion. Both runs remain UNKNOWN / UNVERIFIED with zero
verified correct business results. Recovery cannot erase an original unknown.

Measure versioned-key, lost-ack and stable-key consecutively WITHOUT resetting:
six attempts, three measured events, one positive, one negative and one unknown
remain in the denominator. Prior duplicate and lost-ack observations remain in
the delivery, result and operator-history tables. Teaching-run totals are not
real events, users or newly produced effects.

GUARDS, KEYBOARD, ERROR AND RESET
Only exact load/type/presetId/eventId/budgetMs and one-field typed cutover,
redeliver and measure records are accepted. The model accepts the numeric
safe integer 1000 only. The UI also rejects whitespace, exponential, padded
or decimal text such as "1e3", "01000" and "1000.0", and untrimmed event tokens.
No implicit coercion is used. Missing/extra fields, getters, symbols, hidden
properties, custom prototypes, sparse/extra-key arrays, cyclic/aliased DATA,
forged results and incomplete/reordered history are rejected without mutation.
Serialized ordinary JSON state is validated by deterministic history replay;
object identity is not an assertion.

Maximum four rehearsals / eight attempts / sixteen actions retain everything.
The seventeenth action is a safe hold requiring explicit reset; history is
never pruned to make room. Out-of-order controls are disabled, and forced
out-of-order actions fail visibly with no changed observations or success.

Use Tab and Enter with labeled native controls and visible 3 px focus.
Visible role=alert errors receive focus and indicate malformed fields.
The role=status region reports progress and retained positive/negative/unknown
event outcomes separately. Reset invokes HTMLFormElement.prototype.reset.call
so a control named reset cannot shadow the native method. It restores preset
focus and clears only this page's in-memory DATA, not files or captured proof.
Refresh starts a new page-local rehearsal. Missing local model fails closed
with a visible error, disabled actions and zero measured/verified results.

EXACT SOURCE AND COMPLETION LIMITS
S135 / README:
  External webhook: Process repeated or delayed delivery without duplicate
  business effects.
D-S135 / backlog:
  Add sandbox webhook retries/delays during deployment changes.
  Repeated deliveries preserve one business effect and correct observable
  processing status.
  Original prerequisite: D-S077; original BASE: H011 + P005 + HOST.
A-S135 / portable card:
  Redeliver a delayed webhook; distinguish event attempts from business effects.
  SOURCE gate; default packet SC-S135, shared only as evidence grouping with
  B-S135, not execution, batching or duplicate credits.

This A-only resource-free learning asset does NOT perform a sandbox/native
webhook transition, complete D-S135/source-parent acceptance or certify Azure.
It is not Node.js 24 production validation or five-nines/reliability evidence.
Parent alone accepts A-S135 once; zero extra credits for tests, repair, proof,
refinement, repeated observations or publication.

RELEVANT To Do REFINEMENT (NO NEW CARD OR CREDIT)
The separate original B-S135 Kano unit remains unfinished, readiness=false.
Concrete blocker: no approved native sandbox target/lease, resource ownership,
identity, permission, spend envelope or CORE, DATA, HOST qualification/evidence.
Its original dependency D-S077 plus H011/P005/target HOST must retain verified
target-configuration acceptance. Do not infer native approval from this lesson.
Bound the future native run to one sandbox event across deployment changes;
retain each attempted delivery, stable event key, state/effect identity and
original retry budget, measure exactly one correct effect and observable
processing status, and preserve lost acknowledgement/unknown completion after
recovery. Satisfy the original B-S135 gates and D-S135 acceptance with real
evidence; parent alone may admit/accept it. No cloud or native work is done here.
C005-C008/local-harness catalog integration is parent-owned and untouched.

BDD / TDD / IaC / EMPIRICAL EVIDENCE
webhook-redelivery.feature preceded the loadable no-op stub. Genuine assertion
RED expected loaded and observed ready (ERR_ASSERTION, child exit 1), not a
missing module or tool failure. Exact stub, assertions and raw stdout/stderr
are preserved in evidence\red-stub and evidence\raw, outside normal test
autodiscovery. Actual Edge Tab/Enter load observed ready and 0 / 16 before
implementation. IaC N/A was evaluated AFTER genuine RED: this is resource-free
fixed DATA, so no template, scaffold, infrastructure or deployment was created.

Focused READ-ONLY verification from the repository root:
  node --test learning\S135\model.test.cjs learning\S135\integrity.test.cjs learning\S135\browser.test.cjs
Syntax:
  node --check learning\S135\model.js
  node --check learning\S135\app.js
  node --check learning\S135\browser.test.cjs
  node --check learning\S135\evidence\fixtures\csp-probe.js
Normal verification NEVER rewrites sources, RED or previous browser proof.
Only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately creates a NEW uniquely named
raw browser JSON with exclusive-create flag wx; other values do not capture.
Raw logs, stub and browser observations stay outside test autodiscovery.
The owned .gitattributes byte policy was present BEFORE capture; raw proof and
archived stub use -text -diff to preserve verbatim whitespace/CRLF/LF bytes.
evidence\source-hashes.json separates raw measured line endings/SHA-256,
canonical LF SHA-256 and canonical Git blob identity. Canonical identities are
not substituted for raw observations. Active-source integrity checks canonical
LF so a correctly normalized Git checkout does not invalidate the historical
raw CRLF measurement. Archived proof/stub bytes still require exact raw hashes.
Verification receipts do not hash themselves or rewrite historical indexed proof.

Actual browser checks cover all fixed presets, Tab/Enter/focus, malformed
input, order/limit holds, retained history, real form.reset shadowing, reset,
missing-model failure/reload and enforced CSP. Early narrow CSP allows only
local scripts/style and denies inline scripts/events, eval, inline styles,
connections, images, frames, workers, objects, base changes and form actions.
Evidence-only csp-probe.js tries DATA URLs and local form navigation; it is
NEVER imported by the lesson. CSP blocks them without a live network request.
No network API, storage, cookie, timer, randomness, credential or management
operation exists in the lesson runtime.

All browser observations use published testing\browser\isolated.cjs at
53c0c0d, SHA-256
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055,
openIsolatedLesson and awaited finally close. Existing offline Playwright
1.56.1 / Microsoft-signed Edge 156.0.4314.50 / Node 22.23.4 are test tooling
only, not production Node 24, native-platform or source-parent validation.
The published helper has known unattended context/page/cleanup lifecycle
limitations. The inactive recovery prototype remains unqualified and unused.
No package install, download, unsafe flag, foreground lease, cloud, identity,
credentials, IaC, deployment, business/user-data operation or spending occurs.

Educational material is AS IS without warranties, Microsoft endorsement or
SLA claim. The source README's Microsoft disclaimer and rights restrictions
continue to apply; no new license or reliability guarantee is asserted.
