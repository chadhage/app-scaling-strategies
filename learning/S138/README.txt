S138 — Pagination across migration
A-S138 / D-S138 / SC-S138 / worker-A-S138 / one frozen original S unit

Training rehearsal - synthetic data - not a live Azure result

OPEN
Open learning\S138\index.html directly in a browser. No server, database,
package installation, credentials, Azure account or network access is needed.
All cursor/dataset/order/schema/token/state/version/request/result observations
are fixed fictional teaching DATA ONLY. No actual migration or HTTP request occurs.

OBJECTIVE AND DECLARED CONTRACT
Reuse a pagination cursor after migration; identify unintended missing/duplicate
results. The fixed snapshot contains profile-01 through profile-06, ordered by
ordinal ASC, id ASC. The old client requires profile-v1 labels. Its opaque teaching
cursor pins that snapshot and query across fictional v1 to v2. Each request allows
at most four rows; a short nonterminal first page is not completion.

CONDUCT
1. Open the v1 first page: observe profiles 01–03 and its saved teaching cursor.
2. Select one of eight fixed migration conditions, then migrate the fictional
   target to v2. This changes no real data, endpoint or service.
3. Reuse the exact saved teaching cursor. Altered/padded tokens or unknown
   conditions announce an error without changing observations or history.
4. Check the combined result and both retained request/response receipts:
   - Preserved: all six exactly once, ordered and schema/snapshot compatible.
   - Accepted 200/missing: profile-05 absent at an explicitly observed end.
   - Accepted 200/duplicate: profile-03 returned twice, seven rows total.
   - Accepted 200/reorder: profile-05 precedes profile-04 despite six unique IDs.
   - Changed schema: profile-v2 names fail the old profile-v1 label contract.
   - Changed snapshot: an unexpected profile-07 and live-v2 snapshot mismatch.
   - Unknown completion: four observed rows; 05/06 are unobserved, not certified
     missing. Missing remains unknown; 200 and absent next token do not pass.
   - Rejected cursor: fictional 410, interrupted journey, unknown completeness.
5. Reset all explicitly clears this in-memory attempt and history. No persistence
   or recovery is invented. Errors do not clear the retained four-step history.

All controls have keyboard labels and visible focus. Tab follows enabled steps;
Enter activates buttons. Error and outcome announcements are separate. Local
script failure leaves an unavailable message, not a success-shaped fallback.
CSP denies outbound connections, inline scripts, workers, frames and form actions.
No control is named reset; the lesson does not shadow or invoke form.reset.

VERIFICATION (existing Node 22 test tooling; not production Node 24)
node --test learning\S138\model.test.cjs learning\S138\integrity.test.cjs learning\S138\browser.test.cjs
node --check learning\S138\model.js
node --check learning\S138\app.js

Verification is READ-ONLY. Historical source/RED/browser evidence is not rewritten.
Only deliberate, exact CAPTURE_BROWSER_EVIDENCE=1 enables browser report capture.
For an explicitly intended recapture in PowerShell, in the same process:
  $env:CAPTURE_BROWSER_EVIDENCE='1'; node --test learning\S138\browser.test.cjs
Do not use that variable for ordinary verification. No dependencies are added.
The browser suite uses only testing\browser\isolated.cjs, hash
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055
(published 53c0c0d82cc1db6780a87ac2b1085734af6d5c60), openIsolatedLesson and
awaited finally close. Existing offline Playwright 1.56.1 and signed Edge 156 are
test tooling. The inactive recovery prototype and foreground leases are not used.
The CSP connection probe uses a data: URL only, so no network request can occur.

EVIDENCE AND LIMITS
manifest.json declares the objective, contract, controls, assertions and limits.
evidence\source.json records exact README S138, backlog D-S138 and portable
A-card/packet observations read before design. Narrow raw CRLF snapshots and
canonical Git snapshots have distinct hashes and byte-preserving attributes.
pagination.feature preceded a loadable model stub. evidence\raw\red-stub.cjs.txt,
red-suite.cjs.txt and red.log retain the genuine positive-vs-unknown assertion RED
outside test autodiscovery. evidence\sequence.json records the post-RED IaC N/A
step. No infrastructure was generated. Browser and green observations are local.
The first actual-browser attempt is retained in evidence\raw\browser-attempt-01.log:
its fieldset isDisabled predicate was unsuitable. The corrected check observes
the real disabled property and all inherited disabled controls; the second raw
attempt and browser-acceptance.json preserve the completed observations.
Active files are canonical LF; raw source, original RED and prior browser proof
retain their original bytes. evidence\canonicalization.json and
evidence\byte-integrity.json distinguish the archived pre-canonical observations
from the final browser capture and exact published Git blobs.

One attempt is bounded to two pages and four history entries. These fixtures
teach one declared contract, not universal continuation-token guarantees. Real
dataset mutation, database/SDK behavior, latency, native cursor/version semantics,
production Node 24, source-parent completion and five-nines remain unverified.
B-S138 needs separately approved CORE/DATA/HOST and native evidence. That is an
honest blocked remainder, not another credit. Tests, repairs, evidence and
refinement earn zero additional units. The parent alone may accept A-S138 once.
C005–C008/local-harness integration is parent-owned and untouched.
