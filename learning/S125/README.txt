S125 - SINGLE ACA REVISION READINESS AND CONTINUITY
A-S125 / D-S125 / SC-S125 / frozen S / one original kanoUnit A-S125

Training rehearsal - synthetic data - not a live Azure result

Open learning\S125\index.html directly in a browser. No server or account.
All container app, revision, image, replica, readiness, traffic, lifecycle,
session, state and effect values are fixed fictional teaching DATA ONLY.
Buttons record or inspect those observations. They do not operate ACA, a
registry, resource, configuration, promotion, deployment or application state.

EXACT SOURCE CONTRACT READ BEFORE DESIGN
- README.md S125: Container Apps, single revision: Verify readiness-gated
  replacement and user continuity beyond the routing switch itself.
- backlog.md D-S125: Add a Container Apps single-revision preset with
  failed/successful candidate readiness.
  Acceptance: Old revision routing persists until native readiness permits
  replacement; active-work/state outcomes are independently verified.
- Portable A-S125: Update a single ACA revision; the old revision remains
  until candidate readiness.
- SC-S125 groups this A slice with separate B-S125: Conduct one single-
  revision update; verify actual readiness gating and active-work outcomes.
  B requires CORE, DATA, ACA, C069. This lesson does not fulfill B or D-S125.
- Supplied platform qualification: Container Apps uses revisions, not App
  Service slots. Readiness-gated replacement does not validate state/work.

DOCUMENTED ACA CONSTRAINTS, NOT OBSERVED NATIVE RESULTS
https://learn.microsoft.com/en-us/azure/container-apps/revisions
In single-revision mode, the old active revision is not deactivated until
the new revision is ready. With ingress enabled, old receives 100% until then.
Ready requires successful provisioning, the previous revision's replica count
within the new min/max, and ALL replicas' startup AND readiness probes passing.
An image change creates a new immutable revision rather than editing old.
Software revision replacement is not compute-capacity scaling. This fixture
leaves per-revision target/min/max at 2. Old/new overlap during preparation is
temporary, not a sustained capacity increase. No scale rule is changed.
Single-mode lifecycle/routing is platform-managed, not a manual canary or
retirement control. Inspecting DATA here is not a platform action.

WORKED EXERCISE
1. Choose ready and type exactly v2. Enter records lesson-api--r2 with
   fictional-image-v2, while old lesson-api--r1 / fictional-image-v1 remains
   active at 100%. A nominal update leaves readiness and traffic UNOBSERVED.
2. Try Inspect traffic before readiness: NEGATIVE safe hold, old 100%,
   zero attempted user transitions, and a retained history entry.
3. Inspect readiness DATA. Provisioning succeeds, count 2 matches target 2,
   and both replicas pass both startup and readiness. Result POSITIVE,
   but old still has the only observed 100% route. Readiness permits
   replacement; it does not itself observe the routing transition.
4. Inspect traffic DATA: intended and measured old 0% / candidate 100%,
   old inactive and candidate active. Sessions/state and old work are
   still UNOBSERVED. A routing switch alone is not user continuity.
5. Inspect sessions and old work DATA. Two measured candidate journeys
   preserve user identity, session and cart:3 at 140/180 ms <= 400 ms.
   Separately, work-17 started on old completes with preserved state,
   one effect-17 and 220 ms <= 400 ms. Only now is synthetic continuity
   completed. Native ACA and D-S125 remain UNVERIFIED.
6. Reset and try provision-failed, replicas-short, startup-failed and
   probe-failed. Each readiness result is NEGATIVE. One healthy replica
   or one passing probe is not enough. Old stays active at 100%.
7. readiness-unknown has missing provisioning/count/probe observations:
   UNKNOWN, not ready. traffic-unknown has ready DATA but current traffic
   and lifecycle UNKNOWN. Its last known old 100% is labeled separately,
   not invented as a current observation. traffic-mismatch shows old 100%
   despite intended candidate 100%: NEGATIVE, no verified replacement.
8. session-lost produces one failed state/session journey out of two, while
   old work passes. work-interrupted preserves both sessions but old work
   fails with no committed effect. work-unknown preserves both sessions
   but old-work/effect evidence is UNKNOWN. journey-unknown retains one
   unknown journey in the two-attempt denominator. latency-breach retains
   one failed journey at 610 ms. None becomes successful continuity, and
   repeat actions cannot erase the original observations or counts.

INPUT, HISTORY, KEYBOARD AND RESET
The only software input is literal text v2 and an allowlisted fixed fixture.
No arbitrary image, revision, configuration, percent or resource is accepted.
Wrong types, whitespace, unknown names, missing/extra fields and forged
state/evidence/history produce explicit errors without mutating state/history.
Deterministic replay validates every retained action and all current facts.
Premature/repeated well-typed actions are NEGATIVE safe holds with zero new
exposure. Up to 12 actions remain; the 13th raises an error, without pruning.
Native labels, Tab/Enter/selector keys, 3px focus outline, role=status and
role=alert are observable. Invalid token focus returns to its field; history
limit focus goes to reset. Reset clears only this in-memory lesson and focuses
the fixture selector. HTMLFormElement.prototype.reset.call avoids shadowing
by a control named reset. No local/session storage, cookies or uploads.
Missing model data fails visibly, retains the banner and disables controls.
CSP forbids inline script/event/style, eval, connections, images, frames,
objects, workers, base changes and form navigation. The test-only local
evidence\csp-probe.js deliberately attempts prohibited local operations to
observe real policy violations; it is never loaded by the lesson.

BDD -> LOADABLE STUB -> GENUINE RED -> IAC N/A -> IMPLEMENT/REFACTOR -> GREEN
single-revision.feature preceded the loadable no-op model/HTML/app/CSS stub.
Actual isolated Edge loaded that stub; keyboard update left phase baseline.
The focused Node assertion genuinely failed ERR_ASSERTION, exit 1:
expected awaiting-readiness; actual baseline. It was not a missing tool,
module, browser or dependency error. Exact stub bytes and assertions.cjs are
archived under evidence\red-stub; raw stdout/stderr and actual stub DOM
observation are under evidence\raw. Archive assertion remains deliberately
RED, outside normal *.test.cjs autodiscovery. Explicit replay:
  node --test learning\S125\evidence\red-stub\assertions.cjs
The archived observe.cjs records the original pre-implementation invocation
against the then-stub entry, not a green/current-entry replay script.
After this actual RED, IaC was classified N/A: no resource, configuration
or deployment exists and no IaC was generated. Implementation/refactoring
separates immutable fixed DATA, measured outcomes and replay/command guards.

FOCUSED NORMAL VERIFICATION: READ-ONLY
  node --test learning\S125\model.test.cjs learning\S125\integrity.test.cjs learning\S125\browser.test.cjs
  node --check learning\S125\model.js
  node --check learning\S125\app.js
These tests do not rewrite source, RED, hashes or existing browser evidence.
Raw byte SHA-256, canonical LF SHA-256 and canonical Git blob identity are
separate entries in evidence\source-hashes.json. Local .gitattributes was
added before raw capture: raw and archived stub bytes are -text; normal
Git lesson text is canonical LF. Working-tree CRLF is measured separately,
not confused with canonical Git bytes. Text checks allow either the captured
working-tree bytes or their published LF bytes; -text proof must remain raw
byte-exact. Neither accepts content changes. Normal checks never regenerate hashes.
Raw/archive paths also use -diff so Git's text whitespace checks cannot alter
or reject authentic CRLF/TAP output. The raw files remain directly readable.
The first scoped publisher attempt stopped at that whitespace check before
any commit/tag; its diagnostics are retained. No raw proof bytes were rewritten.

DELIBERATE NEW RAW BROWSER CAPTURE ONLY
  $env:CAPTURE_BROWSER_EVIDENCE='1'
  node --test learning\S125\browser.test.cjs
  Remove-Item Env:CAPTURE_BROWSER_EVIDENCE
Only exact value 1 enables a new unique evidence\raw\browser-*.json file.
Other values, including true, are read-only. Existing captures are never
overwritten. Raw evidence records actual DOM/keyboard/input/guard/reset,
positive/negative/unknown readings, graceful missing-model failure, CSP
violations and awaited close; captured DATA remains fictional, not native.

TOOLING AND REMAINDER
Published testing\browser\isolated.cjs at 53c0c0d, SHA-256:
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055
Use openIsolatedLesson with awaited session.close() in finally. Existing
offline Playwright 1.56.1, Microsoft-signed Edge 156.0.4314.50 and Node
22.23.4 are test tooling, not production Node 24 validation. No packages,
downloads, foreground leases, unsafe flags or inactive recovery prototype.
The published helper's known context/page/cleanup lifecycle limitations
remain; a completed focused run is not unattended harness qualification.

No native ACA target, configuration, readiness, actual traffic, session,
old-work/effect or lifecycle proof exists here. B-S125/D-S125 remain blocked
on separately approved native capabilities/target and independent client
observations. No cloud/IaC/scaffold/identity/credentials/deploy/spend.
Parent alone accepts A-S125 once: frozen S, one original unit; zero extra
test, repair, proof or refinement credits. Catalog C005-C008/local-harness
integration remains parent-owned and untouched. No additional mission.
