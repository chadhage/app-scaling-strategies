S116 - TWO SERVING REGIONS, ONE SUPPORTED WRITER

Training rehearsal - synthetic data - not a live Azure result

Open index.html directly in a modern browser. No server, build, framework,
account or subscription is required. Every region, writer, replication value,
epoch, state, route, read/write and user journey is fixed fictional teaching
DATA ONLY. Measurements are synthetic values, not real resource observations.

WORKED EXERCISE
1. Record "Inspect serving only". Both origins serve (18/24 synthetic ms),
   but writer, mutation and post-commit consistency proof is unknown.
2. Verify "Serving succeeds, region-two reader is stale". The one writer
   commits revision 11; region-two reads 10 with 40 synthetic ms replication
   lag. Serving succeeds but the session minimum 11 fails: NEGATIVE.
3. Verify the missing-writer trace. Null writer, epoch, effect, read and
   duration observations remain UNKNOWN, never successful or zero.
4. Verify the supported trace. Both regions serve; region-two forwards writes
   to the single writer region-one. Epoch 7 and expected revision 10 allow
   one effect at revision 11. Both readers meet the client minimum: POSITIVE.
5. Try stale epoch, revision conflict and unsupported local writer. Protective
   rejection may pass its verifier, but the requested user mutation does not
   commit. Zero effects is not a successful mutation or multi-writer support.
6. Reset by mouse or keyboard. Defaults/current output reset and focus returns
   to the first control. All history and the 12-observation allowance remain.
   Reload starts a new in-memory session. A thirteenth observation is rejected.

Tab, arrow keys and Enter work with native controls. Invalid input focuses the
error without adding a record. Expand retained history to inspect old traces.
Results explicitly distinguish positive, negative and unknown checks. The model
strictly validates typed tokens and replays historical state before transitions.

SOURCE AND BOUNDARIES
S116: preserve declared consistency and conflict-resolution semantics while
either region serves a user.
D-S116: both regions serve under the declared data contract; show actual writer
topology and do not invent multi-writer capability. Original P006/D-S069 gates
remain. A-S116: "Serve both regions; identify the real writer/consistency model
instead of assuming multi-writer support." SOURCE; SC-S116; one frozen S unit.

Exact source rows, portable contract, source-pair packet and owned claim were
read before behavior design. Separate byte-pinned working CRLF excerpts and
canonical Git LF excerpts are in evidence/raw; neither is silently normalized.
SC-S116 is a source-pair namespace, not a delighter packet allocation.

The declared single-writer model is deliberately fictional. This does NOT say
all Azure services are single-writer or establish any real product's writer,
replication, conflict-resolution or consistency capabilities. It makes no
network, resource, data, configuration, identity or credential operations.
B-S116 and D-S116 remain unqualified. IaC is explicitly N/A after assertion RED.
Catalog C005-C008 and local-harness integration are parent-owned and untouched.

FOCUSED READ-ONLY VERIFICATION (repository-root PowerShell)
  node --test .\learning\S116\tests\model.test.cjs .\learning\S116\tests\bundle.test.cjs
  node --test .\learning\S116\tests\browser.test.cjs
  node --check .\learning\S116\model.js
  node --check .\learning\S116\app.js
  node --check .\learning\S116\scripts\evidence.cjs
  node --check .\learning\S116\tests\csp-probe.js

Normal verification never rewrites owned evidence or source. The actual browser
test checks the before/after owned byte map. It uses only published
testing\browser\isolated.cjs (53c0c0d; raw SHA256
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055),
openIsolatedLesson and an awaited finally close. Existing offline Playwright
1.56.1, Microsoft-signed Edge 156 and Node 22 are test tooling only: no production
Node 24, native Azure or source-parent validation. The inactive lifecycle
prototype remains unqualified; no foreground lease or unsafe browser flags.

BDD -> loadable model/browser stub -> actual unknown != positive assertion RED
-> IaC N/A -> implementation -> focused GREEN/syntax/integrity -> actual browser
observations. The pre-implementation BDD, stub, assertion and raw runner bytes
are preserved as .snapshot/.tap files under evidence/red, outside discovery.
One Windows PowerShell 5 signature-module autoload failure is preserved in
evidence/attempt-limits.json with raw bytes; the same read-only check succeeded
using existing PowerShell 7. It is a tooling limit, not behavioral RED.
The first full bundle run also exposed a CRLF/LF packaging assertion (16/17
passed, not a green suite). Only owned implementation text was normalized to its
declared LF checkout format; original CRLF source/RED and raw runner bytes remain
unchanged. Final focused, syntax, integrity and browser checks were rerun.
Raw TAP and the preserved failure stderr retain their machine whitespace with
narrow diff-disabled attributes; source/RED byte hashes are checked separately.

DELIBERATE PRODUCER CAPTURE ONLY
  $env:CAPTURE_BROWSER_EVIDENCE='1'
  node .\learning\S116\scripts\evidence.cjs browser
  Remove-Item Env:CAPTURE_BROWSER_EVIDENCE

Other explicitly selected producer stages are source, red, iac, tooling, index,
green and syntax; they write only this owned lesson's evidence. Do not rerun
source/red/iac on an implemented bundle: the original evidence describes the
real chronological run. The content index pins implementation, specification,
tests, documentation and immutable source/RED proof; mutable capture bookkeeping
and the index itself are deliberately excluded to avoid circular hashes.

CSP observations come from an external local, page-owned TEST-ONLY probe, not
DevTools evaluation as an enforcement oracle. It attempts blocked inline code,
eval and a data: fetch (no network even without CSP); no remote URL is used.
The normal lesson does not load the probe. Raw browser runner output and actual
DOM/keyboard/error/reset/failure/CSP observations are retained.

evidence/refinement.json describes the honest native remainder and required
actual data-contract evidence; it neither admits nor completes another card.
The worker reports verification/publication only. The parent alone accepts
once. No test, repair, proof, refinement or catalog credit is claimed.
