A-S108 — Valid traffic and mismatched WAF policy
S108 / D-S108 / SC-S108 / frozen Kano S / worker-A-S108

Open learning\S108\index.html directly. No server, packages, framework,
Azure account, credentials or infrastructure are required.

Training rehearsal - synthetic data - not a live Azure result

Objective and exercise
Apply a mismatched WAF policy to valid traffic; detect blocked journeys/assets.
The profile journey on one fixed fictional route requires three benign request
labels: page, profile API and script asset. None is fetched or sent anywhere.

1. Choose fixed policy and recovery observation fixtures. Apply the fictional
   policy. A policy label change is not a measured result: outcome stays unknown.
2. Inspect the authored three-request observations. An API 403 interrupts the
   valid journey; a required script 403 also interrupts it despite page/API 200s.
   Complete matched observations are positive. Missing observations are unknown
   and never counted as successful. Requests, rules and session/route attribution
   are visible as fixed teaching data.
3. Restore the baseline label. Recovery stays unknown until explicitly measured.
4. Measure the chosen recovery fixture: complete observations are positive,
   a still-blocked script is negative, and missing script evidence is unknown.
   All earlier comparison failures remain counted and visible in history.
5. Repeat at most four comparisons/sixteen action records. Explicit reset clears
   history, selections, errors and results and restores focus. Reload also clears
   this in-memory history; no browser-storage/durable-run guarantee is claimed.
   Labelled controls support Tab, arrows and Enter with visible keyboard focus.

Source acceptance and boundaries
README S108 requires valid candidate requests/assets not to be unexpectedly
blocked. D-S108 specifically requires detection of unexpected valid-journey/asset
blocks, verified policy recovery, and rules affecting only leased routes.
The REAL approved-sandbox acceptance is NOT fulfilled by this A card.

All policy/rule/traffic/asset/routing/authentication observations are fixed
fictional teaching DATA ONLY. This is not a WAF engine or a live policy probe.
No WAF, network, resource, auth or routing change, actual traffic, denial bypass,
management call, identity registration, IaC, scaffold, deployment or spend occurs.
B-S108 still requires its own qualified owned lease/host and real observations;
D-S108, P006 and BASE remain incomplete. There is no native, five-nines,
production Node 24 or source-parent validation. This is one original S unit:
tests, repairs, proofs and remainder refinement add zero credits.

Read-only verification from the repository root in PowerShell
  node --test .\learning\S108\tests\model.test.cjs .\learning\S108\tests\integrity.test.cjs
  node .\learning\S108\tools\syntax.cjs
  node .\learning\S108\tools\canonical.cjs
  node .\learning\S108\tools\browser.cjs
Or run all four with owned source/proof tree hash checks:
  node .\learning\S108\tools\read-only.cjs

The browser runner checks the exact published testing\browser\isolated.cjs:
working SHA-256 86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055,
canonical Git SHA-256 2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0,
commit 53c0c0d. It calls openIsolatedLesson and awaits session.close() in finally.
Only the approved existing offline Playwright 1.56.1 / Microsoft-signed Edge 156
pair is used. Node 22.23.4 is test tooling, not production Node 24 validation.
No download, installation, unsafe flag or foreground browser lease is used.
The published helper retains its known overall context/shutdown deadline limitation.
The inactive recovery prototype remains unqualified and is not imported.

Deliberate append-only browser proof capture (not normal verification)
  $env:CAPTURE_BROWSER_EVIDENCE='1'
  try { node .\learning\S108\tools\browser.cjs } finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
Only the exact value 1 enables capture. Normal browser verification hashes the
entire owned tree and cannot rewrite source or previous proofs.

Evidence chronology
- evidence\source.json records exact source/card/packet/portable A contract and
  separate raw working CRLF and immutable canonical Git snapshots/hashes.
- evidence\red-001.json preserves the original genuinely loadable no-op stub and
  assertion RED, with raw stdout/stderr and source snapshots outside test discovery.
- evidence\iac-na.json records resource-free N/A after RED with the stub unchanged.
- green/syntax/canonical records retain actual focused commands, raw outputs and
  source snapshots. Canonical LF qualification is an in-memory source projection;
  historical raw evidence is never normalized. Actual Git blobs are checked
  separately after scoped publication.
- readonly records retain all four normal commands with both capture flags
  disabled, exact raw child stdout/stderr bytes, and unchanged owned-tree hashes.
- browser records retain actual DOM/keyboard/input-error/reset/failure/CSP
  observations, signed Edge preflight, raw source/output/transcript provenance,
  awaited owned-session closure and exact tree-integrity observations.
  browser-001 preserves a failed eval assertion: the original probe ran inside
  privileged DevTools evaluation, which did not test ordinary page CSP eval.
  The corrected probe is tools\csp-probe.js, loaded as an ordinary self script.
  This test-only script is not loaded by the lesson during normal use.
- remainder.json refines the existing B-S108 native scope and honest blockers
  without admitting new work, changing the shared board or adding Kano credit.

Historical stage producers require explicit source/red/iac-na arguments.
Test-proof capture also requires exact deliberate CAPTURE_TEST_EVIDENCE=1:
  node .\learning\S108\tools\capture-run.cjs green|syntax|canonical|readonly
Normal verification never invokes a producer or overwrites any historical RED.
Scoped tagged publication and parent-owned empirical acceptance remain separate;
the worker never self-Accepts or declares a native sibling/source parent Done.
