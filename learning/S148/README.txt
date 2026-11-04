S148 - Actual migration evidence

Training rehearsal - synthetic data - not a live Azure result.

Open index.html directly in a browser. No server, package installation, account,
cloud resource, identity, telemetry, live tracing or network operation is needed.

Exact source:
  README S148: Actual-migration evidence: Trace deployment/version identity across
  tiers to prove users moved rather than remaining entirely on blue.
  D-S148 acceptance: Successful migration requires observed intended version
  movement; users remaining entirely on v1 do not inflate migration success.
  A-S148: Read tier/version traces; unchanged users must not count as successful
  migration. Original S satisfier, P0, LP-EXPORT, SOURCE gate.

Conduct:
1. Select the entire fixed cohort or one fixed trace packet.
2. Inspect the original user/journey/attempt/correlation/transition identities,
   declared tier movements, timed origin/target stamps and stateful records.
3. Confirm inspection and measure. The inspection is scoped and one-use.
4. Compare movement with completion, whole original outcome and original budget.
5. Repeat with unchanged, missing, foreign, wrong-target and recovery fixtures.
6. Reset the current run. The last eight measurements remain until page reload.

DATA ONLY:
Every user, journey, attempt, tier, version, correlation ID, transition time,
observation, completion, request and trace is a fixed fictional teaching record.
Fixture times do not use the wall clock. Original start is 0 ms; budget 2000 ms;
transition 1000-1100 ms. Frontend and API must move blue v1 to green v2.
Shared data remains v1 and is explicitly not required to move.

Exact all-cohort result:
  Transition events: 1; original journeys: 12; HTTP 200 request records: 24.
  Intended movement: 5 observed / 1 unchanged / 1 contrary / 5 unknown.
  Terminal completion: 10 successful / 1 failed / 1 unknown.
  Whole original outcome: 7 uninterrupted / 1 failed / 1 interrupted /
                          1 over-budget / 2 unknown.
  Successful intended migrations: 1.
  Unchanged successful journeys, not migrated: 1.

Successful migration requires observed intended movement at every DECLARED
required tier of the SAME original journey and an uninterrupted correct stateful
outcome within its ORIGINAL budget. Requests, HTTP 200, healthy tiers, new-version-
only traces or a successful new attempt cannot establish that movement. Missing
required origin, target, tier, identity, correlation or typed timing stays unknown.
Known wrong targets and partial required movement are contrary evidence.
Movement is still displayed independently when state is lost, interruption occurs,
an original budget is exceeded, or earlier unknown evidence survives recovery.

Guards and bounds:
Registered original declarations are immutable. Strict typed evidence, unique
trace IDs, unambiguous origin/target records, original timing and scoped one-use
inspection reject coercion, foreign/stale/replayed commands and repeated records.
Limits are 12 originals, 48 inspections, 24 measurements and 8 history entries.
Reset cannot bypass those limits or erase retained measurements. Re-measuring
does not add original journeys or transition events. Reload starts a new local
bounded rehearsal; this is not durable hosted storage or an authorization service.

Focused verification from the repository root (normal verification is read-only):
  node --test learning\S148\model.test.cjs learning\S148\integrity.test.cjs
  node --test learning\S148\browser.test.cjs

Deliberate raw browser capture, with a unique directory and no overwrite:
  $env:CAPTURE_BROWSER_EVIDENCE = '1'
  node --test learning\S148\browser.test.cjs
  Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE

Only the exact string 1 enables capture. Missing, true, 01 and 1-with-whitespace
do not write lesson/evidence files. Captures preserve actual DOM, keyboard,
guard/error, negative/unknown/recovery, reset/history, asset-load failure and CSP
observations. CSP probes use inline code, data: URLs and an owned-file form target,
never a real network target.
Normal verification may use the approved helper's private owned browser scratch
lifecycle, but does not modify lesson files or historical proof.

BDD -> loadable stub -> two real ERR_ASSERTION RED failures -> IaC N/A ->
implementation/refactor -> focused GREEN -> actual isolated browser checks.
RED snapshots and raw failures stay in evidence\raw, outside autodiscovery.
Narrow .gitattributes preserve raw bytes and keep captures out of text diff checks.
Source working CRLF rows and independent
canonical Git rows are separately archived and hashed; tests do not read live
flow-state or live kanban. State reads during source capture held
Local\AppScalingStrategies_KanbanState_v1 and closed handles before release.

Browser tooling is the published testing\browser\isolated.cjs, SHA-256
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055,
openIsolatedLesson with awaited finally close, approved offline Playwright 1.56.1,
Microsoft-signed Edge 156 and Node 22. This is not production Node 24 certification.
The inactive lifecycle recovery prototype is unqualified and was not used.

Native remainder:
B-S148 remains blocked at CORE, DATA, HOST: one approved actual-versus-false native
transition comparison with same-original tier evidence and an unchanged successful
control. Native prerequisites, target OS/SKU/region/subscription/resource group,
identity, quota, cost and execution approvals are unresolved. No adapter,
infrastructure, deployment, native observation or source-parent completion is
delivered. See evidence\resource-scope.json. Parent alone accepts this original
A-S148 once; tests, repairs, proof captures and refinement earn no extra credits.
C005-C008 and the local harness/catalog were not changed.

Educational AS-IS material; no Microsoft endorsement, platform SLA, five-nines
certification, capacity-scaling proof or live Azure result. See the original
repository README disclaimer.
