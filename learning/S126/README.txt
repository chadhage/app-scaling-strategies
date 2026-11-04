A-S126 — MULTIPLE REVISION CANARY, AUTHORIZED PREVIEW AND RETIREMENT

Training rehearsal - synthetic data - not a live Azure result

Open learning\S126\index.html directly in a standard browser. No server,
subscription, cloud account, CLI setup, framework or dependency installation is
needed to conduct this lesson. All displayed revisions, versions, allocations,
identities, readiness, routing, requests, work, state and retirement values are
fixed fictional teaching DATA ONLY. No actual ACA/registry/resource/identity/
configuration/deployment/IaC operation exists.

EXACT SOURCE AND ORIGINAL UNIT
S126: Container Apps, multiple revisions: Demonstrate weighted canaries,
controlled retirement, and compatible rollback.
D-S126 acceptance: Native revisions and actual traffic are observed; preview
routes stay authorized; old revision retirement follows verified gates.
A-S126 objective: Split multiple revisions and retire one; preview access and
old-work gates remain necessary.
Packet SC-S126; frozen original Kano unit A-S126; class S.
The portable lesson does not satisfy the native acceptance sentence.
B-S126 remains gated by CORE, DATA, ACA, C070; D-S126 is not complete.
Parent alone accepts A-S126 once; tests, repair, proof and refinement have zero
extra credits. C005-C008/local-harness catalog work is separately owned.

DOCUMENTED ACA CONSTRAINTS — READ BEFORE DESIGN
https://learn.microsoft.com/en-us/azure/container-apps/revisions
https://learn.microsoft.com/en-us/azure/container-apps/traffic-splitting
Reviewed 2026-11-04 via Microsoft Learn documentation tools.

Revisions are immutable snapshots, not App Service slots. Multiple revision
mode permits several active revisions, ordinary traffic splitting, and manual
activation/deactivation. Traffic split rule weights must sum to 100.
A label targets only one revision at a time and can move without changing its
URL. Labels work independently of ordinary application-URL weighted traffic;
zero weight does not block direct label access and a label is not authorization.
With latestRevision=true, documented traffic switching waits for readiness.
That conditional platform statement is not a universal application-readiness,
authorization, state-continuity or completed-migration guarantee.
These fictional application gates inspect provisioning, ALL replica startup/
readiness observations, dependency/state compatibility, freshness and overlap
capacity. Two available replicas is a fixed teaching assumption, not an ACA
size recommendation. A software update or routing change is not evidence of
sustained compute-capacity scaling.
Manual deactivation does not independently prove sessions/work drained.
Although the platform can reactivate an inactive revision, this bounded
teaching model never resurrects retired DATA; compatible retained old capacity
is checked before a permitted rollback. No native deactivation/activation is
performed or claimed.

WORKED OPERATOR EXERCISE
1. Choose Healthy measured gates and submit exactly v2. This records identity
   DATA ONLY; software-version selection alone certifies nothing.
2. Inspect readiness, then measure preview path DATA. Seven fixed rows check
   selected login/callback, normal production navigation and visitor/non-
   selected direct-label/callback denial. Preview weight stays zero throughout.
3. Select 80/20/0 and record desired split. Current routing is now unobserved,
   not the old last-known route. Separately measure request and journey DATA:
   8 old request successes are NOT 8 migrated users; only 2 declared canary
   transition journeys were attempted and observed. Every split invalidates
   the prior preview result; measurements independently recheck current preview
   authorization and production navigation, not just request/journey outcomes.
4. After a positive canary, select 0/100/0 and measure promotion. Three declared
   synthetic users must move to r2 with identity/cart:3, one effect each and
   latency within their original 400 ms budget. This is no all-real-users proof.
   The preview-after-promotion fixture leaks to a non-selected user even while
   routing and all sampled journeys succeed; that fresh authorization failure
   blocks retirement. Successful pre-split preview checks cannot certify it.
5. Independently audit old ordinary/direct/label admissions, sessions, requests,
   streams, jobs, ownership, checkpoints, state, exactly-one old effect,
   artifact references and elapsed rollback retention. Only then request
   teaching retirement. Exactly old r1 retires; canary r2 and authorized
   preview r3 remain active.
   Recheck preview paths after retirement: callbacks still reach r3, production
   navigation reaches r2 (not retired r1), and non-selected users remain denied.
6. Compare negative/unknown fixtures. Probes-pass/dependency-fail is not READY.
   A preview leak or broken callback is not authorized access. Zero old weight
   can coexist with a pinned old request/user or old active work. Missing route
   or drain observations remain unknown; retirement remains held.
7. Use candidate-fault to observe an interrupted canary and compatible rollback.
   Old fresh readiness/capacity, artifacts and state compatibility are checked
   separately; successful recovery adds its own journeys without erasing the
   earlier interruption. Incompatible/unknown rollback stays held.

RESULTS AND BOUNDS
Latest action verifier, user-transition outcome and retirement are separate.
Successful, interrupted and unknown attempted transitions remain in the
denominator and retained history. Old-only success is not completed migration.
The preview/request/journey tables and expandable typed raw DATA make these
outcomes inspectable. Measured here means computed from fixed fictional
observations and observed in the real browser DOM, NOT live Azure telemetry.
Up to 20 actions per run and 20 prior reset runs remain in memory without
pruning. Typed errors cannot alter state/history. Valid premature actions are
recorded as safe holds. Reset archives the current run before restoring only
this in-memory baseline; reload explicitly clears memory. No storage,
resource, credential, registry or file mutation occurs through learner controls.
Tab, Enter and normal select keys work; focus is visible and alert/status
messages distinguish input error, safe hold and missing-model failure.
HTMLFormElement.prototype.reset.call(form) avoids reset-name shadowing.
CSP is enforced without unsafe-inline, unsafe-eval or security bypasses.

BDD / TDD / IAC / GREEN EVIDENCE
multiple-revisions.feature was written before the loadable no-op stub.
evidence\red-stub contains the exact raw archived stub and assertions.cjs,
outside normal test autodiscovery. The actual isolated browser stub loaded and
accepted keyboard submission but remained baseline. The original assertion
expected prepared and genuinely failed ERR_ASSERTION (exit 1), not a load/
syntax/dependency error. Raw stdout, stderr and byte hashes are preserved in
evidence\raw. evidence\iac-na.txt records the subsequent explicit IaC N/A step.
Implementation/refactoring then adds focused typed model, integrity and actual
DOM/keyboard/error/reset/failure/CSP browser checks. No additional Kano unit.

NORMAL VERIFICATION — READ-ONLY
From the repository root, use the already available tooling:
  node --test --test-concurrency=1 learning\S126\model.test.cjs learning\S126\integrity.test.cjs learning\S126\browser.test.cjs
Normal tests never rewrite source or previous proof. The browser test checks
owned file hashes before/after, including all existing raw captures. Empty,
truthy or other capture values (including true) cannot write evidence.

DELIBERATE BROWSER CAPTURE ONLY
  $env:CAPTURE_BROWSER_EVIDENCE='1'
  node --test learning\S126\browser.test.cjs
  Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
Only exact CAPTURE_BROWSER_EVIDENCE=1 creates one uniquely named raw browser
observation using exclusive-create (wx); it cannot overwrite any prior file.
The source-seal writer is also deliberate: node learning\S126\seal.cjs --capture.
It is not a normal test and refuses an existing seal. Raw CRLF byte hashes and
canonical LF/Git blob hashes are deliberately separate. .gitattributes was
created before raw RED/browser proof, which stays -text.
Only raw proof and archived stub paths are also -diff: binary diff treatment
protects original TAP indentation and CRLF from whitespace-cleaning pressure.
Runtime code remains text/eol=lf and subject to the scoped publisher's normal
whitespace check; no global Git rule or raw proof bytes were changed.

VERIFICATION LIMITS
The helper is published testing\browser\isolated.cjs at 53c0c0d, SHA-256:
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055
Tests use openIsolatedLesson and awaited close() in finally, with fresh
headless contexts, browser security enabled and no foreground/shared lease.
Existing Node 22.23.4, offline Playwright 1.56.1 and Microsoft-signed
Edge 156.0.4314.50 are local test tooling only, not Node 24 production proof.
The published helper has known context/page/cleanup lifecycle limitations.
Its inactive recovery prototype remains unqualified and unused; this focused
successful run does not qualify unattended CI or erase those limitations.
No packages, browser downloads, unsafe flags, cloud calls, resources, IaC,
scaffold, identity/credentials, deployment or spending were performed.
No native/source-parent acceptance, actual all-user migration, Microsoft SLA
or five-nines reliability is established. The source Microsoft Open Source
Disclaimer applies; this rehearsal creates no Microsoft service guarantees.
