A-S133 / S133 — one preserved old multi-step form

Open learning\S133\index.html directly in a browser.
Training rehearsal - synthetic data - not a live Azure result

Every form, answer, validation, token, permission, identity, session, state,
version, submission, business effect and HTTP response is fixed fictional
teaching DATA ONLY. There are no actual user inputs, authentication operations,
network requests, storage operations, form submissions or business effects.
The only input is an exact fixed preset and an ordered operator action.

EXACT SOURCE CONTRACT (read before design)
S133: Multi-step form: Preserve answers, validation state, and submission across
deployments.
D-S133: Add a multi-step form with prior validation/token/session state and
cutover between steps.
Acceptance: Answers, validation, permissions, and one final submission survive
the transition.
Source dependencies: D-S036, D-S037; native BASE remains H011 + P005 + HOST.
A-S133: Continue an old multi-step form; detect lost answers, invalid prior
tokens, or duplicate submission. SOURCE gate, SC-S133 packet, frozen Kano S,
one original kanoUnit A-S133.
B-S133: Conduct one form journey across versions; verify state, validation,
permissions, and one final effect. CORE, DATA, HOST gates.
The source's valid-old-token requirement does not permit weakened validation;
the session payload must remain compatible. Neither is actually implemented
against a token validator, identity system or session store here.

CONDUCT THE LESSON
1. Choose a fixed trace; Start old form seeds fictional-form-01 on teaching-v1.
   Old answers paper-star/violet, prior v1 validation/token/session bindings,
   and continue/submit permissions already exist as DATA.
2. Cut over between steps to teaching-v2. Inspect the fixed candidate snapshot.
3. Continue final step with fictional-pickup. The fixture may reject it.
4. Submit final form. Optionally Retry same submission once.
5. Measure original journey, not version or HTTP status. Ten checks independently
   inspect the old answers, old validation/token bindings, identity/session,
   permissions, final answer/validation, one intended effect and client result.
6. Reset controls / retain history before another trace. Reset clears the current
   UI error and resets native controls with focus on the preset, but preserves
   accepted/rejected actions, snapshots, submission attempts and archived outcomes.
   Resetting an unfinished journey archives unknown unless a known failure was
   already observed; it never creates a completed successful journey.

PRESETS AND MEASURED RESULTS
preserved: same old form finishes; first attempt and one retry still have exactly
one intended effect and the correct confirmed receipt (preserved).
lost-answers: candidate loses the violet answer despite HTTP 200 (interrupted).
invalid-prior-token: fixed invalid-token DATA is rejected, not bypassed
(interrupted).
lost-validation: prior validation is missing; a new final-step status cannot
replace it (interrupted).
permission-denied: candidate submit permission is false (interrupted).
changed-identity-session: a different fictional identity/session is not the old
journey's continuity (interrupted).
duplicate-submission: two effects with the same intended key and HTTP 200
cannot pass merely because both receipts look correct (interrupted).
receipt-unknown: HTTP 200 with unobserved authoritative effects and receipt
stays UNKNOWN through retry; unknown is not zero, one or success.
replacement-http200: a fully answered replacement form receives HTTP 200 and
one effect, but the original form was not completed (interrupted).

An expected negative fixture can match the preset verifier while its journey
is interrupted. Native result is separately unverified/not performed. A later
positive run does not erase earlier failures or unknowns.

FINITE AND STRICT
10 journeys, 90 accepted actions, one retry per journey, 12 retained rejected
actions per page. All are teaching bounds, not production guarantees.
The pure CommonJS/browser API exports createState(), execute(state, command),
inspect(state), closed PRESETS/EXPECTATIONS, and frozen original fixture DATA.
Commands are exact records: {type:'start',presetId:<fixed string>} or {type:
<cutover|continue|submit|retry|measure|reset>}. No coercion, extra fields,
accessors, symbols, sparse arrays, nonplain prototypes or arbitrary DATA are
accepted. Snapshots must exactly match a bounded replay of the fixed action
history; altered answers, tokens, identity/session, validation, permissions,
versions, receipt/effects and history fail with typed safe-hold errors.
State and observations are recursively immutable. Invalid commands do not
mutate prior state. The actual UI uses textContent, semantic labels, native
keyboard controls, visible focus, role=status/alert and bounded error history.
HTMLFormElement.prototype.reset.call(form) avoids form.reset shadowing.
Reload deliberately discards this nonpersistent in-memory teaching DATA.

BDD / RED / IaC / GREEN / ACTUAL BROWSER
form-continuity.feature precedes a loadable stub. evidence\red-stub\ preserves
exact stub/spec/test bytes with non-autodiscovered .txt suffixes. Actual Edge
keyboard Start kept the stub idle without page exceptions. The original test
genuinely failed with ERR_ASSERTION, idle != old-step, exit 1; stdout/stderr,
hashes and stub browser observation are retained in evidence\raw\.
evidence\iac-na.json records the explicit resource-free IaC N/A decision AFTER
genuine RED and BEFORE implementation. No infrastructure, deployment, package,
framework, identity, credentials, spend or cloud work followed.

From the repository root:
  node --test learning\S133\model.test.cjs learning\S133\integrity.test.cjs learning\S133\browser.test.cjs
  node --check learning\S133\model.js
  node --check learning\S133\app.js

Normal verification is READ-ONLY: it does not overwrite or append source or
evidence. Only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately writes a unique
raw browser record and raw stdout/stderr/source hashes using exclusive create.
Unset, 0, true, 01 or any other value is not capture authorization.
The raw byte .gitattributes rules were established before capture. Raw CRLF
bytes and canonical Git text/blob identities are separate integrity claims.

Actual observations use published testing\browser\isolated.cjs, commit 53c0c0d,
SHA-256 86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055,
openIsolatedLesson with awaited finally close. Existing offline Playwright
1.56.1 and Microsoft-signed Edge 156.0.4314.50 on Node 22.23.4 are the tested
pair; no download, install, unsafe flag, shared browser profile or foreground
lease is used. The helper has known unattended context/page/cleanup lifecycle
limitations; its inactive recovery prototype is unqualified and is not used.
Browser proof covers real DOM, keyboard, wrong-order/malformed-preset errors,
failure/unknown retention, reset and property shadowing, missing-model failure
and actual CSP denials. CSP probes are test-only local-document/data-URL probes,
not actual network, authentication or form-data operations. No live requests
or page exceptions is a bounded observation, not a universal network sandbox.
No complete WCAG audit, reliability/SLA, native behavior or Node 24 validation
is claimed.

RELEVANT TO DO / HONEST REMAINDER
Parent alone accepts A-S133 once after independent focused/browser/remote review;
worker publication does not award Done or Kano credit. Zero extra credits for
tests, proof, repairs or refinement; no additional cards are admitted.
B-S133 retains its original B-S133 Kano unit and readiness=false until CORE,
DATA, HOST and concrete approved native target, identity/session/validation
fixture, operating envelope, ownership/safety and effect oracle are available.
Its remainder is to measure a real preserved old form across a real transition,
including valid prior tokens without weakened validation, existing session
payloads, permissions, old answers, final validation/submission and one correct
client-visible effect. D-S036/D-S037, native BASE and D-S133 shared acceptance
remain required, not silently satisfied by this DATA model.
D-S133 remains incomplete until its separately gated native sibling and all
original acceptance criteria are fulfilled. Catalog C005-C008 and local-harness
integration are parent-owned; this mission does not edit them.
This artifact grants no Microsoft license, endorsement, native qualification or
reliability promise. The source README.md Microsoft Open Source Disclaimer applies.
