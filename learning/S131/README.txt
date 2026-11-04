S131 — Complete anonymous pages across cutover
A-S131 / D-S131 / packet SC-S131 / frozen S / worker-A-S131

Training rehearsal - synthetic data - not a live Azure result

OPEN AND CONDUCT
Open index.html directly in a browser. No server, Azure account, CLI, framework,
package installation, external URL or deployment is needed for the exercise.

1. Select a fixed condition, declare the original 100–5000 ms integer budget and
   confirm DATA ONLY. Start the rehearsal.
2. Capture old HTML before fictional cutover. Verify now to observe UNVERIFIED:
   HTML 200 alone supplies no required-asset or rendered-page proof.
3. Check readiness. Known true admits nominal cutover; false/unknown denies it.
4. Load the old v1 references AFTER cutover, then load and render a new v2 page.
5. Verify all 32 fixed-data checks. Read the separate user impact, attempted/
   successful/failed/unknown/not-exposed journey counts and local illustration.
6. Reset controls, choose a negative or unknown condition and compare.
   Reset archives rather than deletes history. A later PASS cannot erase a FAIL.

Tab/Shift+Tab traverse native labeled controls; Enter/Space conduct buttons and
the confirmation. Successful steps focus the next admitted action. Visible
role=alert errors focus the invalid input or error. Reset calls
HTMLFormElement.prototype.reset, so no control shadows form.reset.
The session admits at most six runs, five ordered steps and three verifications
at advancing evidence points. It never prunes history. Deliberately reload for a
fresh session; no durable backend state is promised.

EXACT SOURCE CONTRACT READ BEFORE DESIGN
README S131: Anonymous browsing — Render a complete page while deployments
change, including assets referenced before cutover.
D-S131: Add a browsing journey that loads old/new pages and assets during
migration. Complete rendered-page correctness is verified, not merely
successful HTML status. Parent dependency: D-S057 static-asset retention.
A-S131: Load old/new page assets during cutover; successful HTML alone must not
pass rendering. SOURCE entry gate, SC-S131 packet, one original satisfier unit.
evidence\source-contract.json retains the exact lines, registered A/B card
mapping, read commit and raw-source/Git-blob read receipts. Controller changes
to unrelated Done counts do not change those frozen source rows.

FIXED TEACHING DATA AND INDEPENDENT RESULTS
All version/status/asset/cache/route/render/readiness/anonymous-context/timing/
journey observations are fixed fictional teaching DATA ONLY, not measurements
of SWA, Azure or a real user session. Synthetic HTTP 200/404 are labels on data;
direct local file loads have no HTTP status. No management or registry call,
credential, resource, deployment, identity, expenditure or IaC is involved.

Old v1 HTML pins CSS, script and image references before cutover. At step 4 these
references are inspected after cutover; the new v2 page is inspected at step 5.
Required asset status, content version and cached payload version must all
match the page. Complete semantic rendering, fictional anonymous navigation
context, journey correctness, readiness and observed routing are independent
gates. Known failure dominates missing evidence. Unknown never means success.

At the default original 2000 ms budget:
  retained-assets       PASS, 2/2 successful, uninterrupted synthetic transition
  missing-old-script    FAIL, old required script missing despite HTML 200
  missing-new-image     FAIL, new required image missing despite HTML 200
  wrong-cache-version   FAIL, old CSS/cache contains v2 even with asset 200
  render-defect         FAIL, all new assets 200 but rendered content is wrong
  lost-browse-context   FAIL, correct local render cannot preserve lost context
  slow-html-200         FAIL, correct new page takes fictional 2400 ms
  unknown-page-receipts UNVERIFIED, old asset/version/cache/render/context/
                        journey/duration evidence unknown; 1/2 unknown
  unknown-routing      UNVERIFIED, nominal cutover and local rendering pass,
                        but 2/2 transition journeys remain unknown
  unknown-readiness    UNVERIFIED, cutover denied; no exposure or success
  candidate-not-ready  FAIL readiness, safe abort before exposure; not an
                        interrupted exposed transition or a successful sample

Each exposed negative has 2 attempted, 1 successful and 1 failed journey.
The worked durations 420/360 ms and slow 2400 ms are invented teaching values.
Changing the budget before start declares a DIFFERENT original envelope, not
a retry extending the original deadline. Exact inclusive boundaries are tested.
"Exercise assertion matched" means the expected failure/unknown was detected;
it never changes the separate verification/user-impact classification to success.

ACTUAL OWNED LOCAL RENDERING
The page really loads fixtures\v1.css/v1.js/v1.svg and v2 equivalents at the
ordered rendering steps. Scripts produce version-specific visible shelf text;
CSS sets different scoped grid backgrounds; SVG images have actual 80/88 pixel
natural widths. This illustrates why both versions must remain usable.
Missing-asset conditions deliberately use nonexistent OWNED filenames
unavailable-v1.js and unavailable-v2.svg; wrong-cache uses v2 CSS against the v1
page; render-defect uses the deliberately incorrect v2-broken.js.
Unknown receipts load no assets and show UNKNOWN, not a manufactured render.

The local result separately checks actual load events, computed CSS, visible
script output and image dimensions. No local render proves a native cutover.
A local positive does not hide lost fictional context, latency or routing proof.
Reset while loading preserves UNKNOWN local proof; generation-guarded scripts
and callbacks cannot apply stale success after reset.
Missing model/app scripts fail closed with visible no-result errors.
The actual browser enforces CSP: owned scripts/styles/images only; no inline
script, eval, connections, frames, forms, objects or external assets.

BDD -> LOADABLE STUB -> GENUINE RED -> IaC N/A -> IMPLEMENT -> GREEN -> BROWSER
browsing-cutover.feature records the behavior first.
evidence\red-stub preserves the loadable unsafe baseline and assertions, outside
automatic test discovery. evidence\raw\stub-browser.json records its actual
banner, button and unsafe HTML-only result BEFORE behavioral RED.
evidence\raw\red.stdout.tap/red.stderr.txt/red-summary.json preserve exit 1:
one passing loadable baseline, two genuine ERR_ASSERTION failures. These were
neither missing-module nor syntax failures. evidence\iac-na.txt follows RED.

From the repository root, NORMAL verification is READ-ONLY:
  node --test learning\S131\model.test.cjs learning\S131\integrity.test.cjs learning\S131\browser.test.cjs

Use existing Node 22.23.4, offline Playwright 1.56.1 and Microsoft-signed Edge
156.0.4314.50 only. Tests bind testing\browser\isolated.cjs at 53c0c0d to SHA-256
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055.
They use openIsolatedLesson and await close in finally. The inactive recovery
prototype is unqualified; the published helper's lifecycle limits still apply.
No browser install, unsafe flags, shared profile, foreground lease or unowned
cleanup is used. This tooling is not production Node 24 or native validation.

Only a DELIBERATE append-only browser capture may write proof:
  $env:CAPTURE_BROWSER_EVIDENCE='1'
  node --test learning\S131\browser.test.cjs
  Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
Only exact '1' captures; unset, 0 or 'true' performs no evidence writes.
Unique raw JSON files are exclusively created, never overwritten/deleted.
Normal reruns preserve every source/evidence byte. Raw test/syntax/browser proof
is in evidence\raw. evidence\source-hashes.json separately records raw SHA-256,
raw CRLF counts, LF-canonical source bytes and canonical Git blob SHA-1.
Scoped .gitattributes fixes LF canonical Git source text and marks evidence/**
-text BEFORE proof capture. Original Windows CRLF worktree bytes and canonical
Git LF bytes are measured separately. Integrity accepts either the exact
original source bytes or their exact canonical Git checkout, never arbitrary
changes; historical raw evidence must always retain its exact CRLF bytes.
Evidence formatting checks permit only CR at line endings; captured raw TAP
has its own narrow -whitespace attribute because genuine assertion diagnostics
contain indented empty lines. Those emitted bytes are hash-verified, not edited
to disguise RED. Source-code formatting checks remain enabled.
Post-publication READ-ONLY verification:
  node learning\S131\verify-publication.cjs <exact-40-character-commit>

HONEST REMAINDER / ZERO EXTRA CREDITS
B-S131 remains To Do with readiness false: separately approve CORE, DATA, HOST,
OBJECT, an isolated real host/asset-retention envelope and original journey
observations. Verify complete old/new rendered pages and required assets across
a real browsing transition; do not infer success from health/HTML or routing.
D-S131 remains incomplete, including its D-S057 dependency and native slice.
See evidence\refinement.json. No root/shared/source/ledger/catalog implementation
edits were made. C005-C008/local-harness remain with the active catalog worker.
Only the parent may independently Accept this one original frozen S unit once.
Testing, repairs, proofs, refinement, IaC N/A and helper tooling earn no credits.
No Azure proof, source-parent completion, five-nines result or SLA is claimed.
