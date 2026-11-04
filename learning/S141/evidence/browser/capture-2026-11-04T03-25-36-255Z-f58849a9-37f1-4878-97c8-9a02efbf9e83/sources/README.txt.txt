S141 — steady-load trace rehearsal

Open learning\S141\index.html directly in a browser. No server or package install
is needed for the lesson. Conduct selects fixed fictional teaching DATA ONLY;
there is no traffic generator, cloud/API call, storage, user data or live workload.

1. Choose Positive, Negative/interrupted, or Unknown.
2. Conduct trace, Inspect records, then Measure originals.
3. Inspect attempt IDs, original IDs, simulated timestamps, original deadlines,
   routing/version records, errors and correlation groups. The expandable record
   view includes all fixed data. Retained history keeps each measured outcome.
4. Conduct another trace without erasing prior failures. Six runs is the limit.
   Reset lesson explicitly clears the rehearsal and returns focus to the preset.
   Buttons and the select work with Tab, arrows, Enter and Space; errors are
   announced and focused. No form control is named "reset".

Exact synthetic teaching thresholds
- Four one-second windows each offer 250 request records: 1000 / 4 = 250 requests
  per simulated second. All 1000 requests have HTTP 200 in all three traces.
- Four STARTED affected original journeys are the original denominator. Two
  STARTED affected transitions are the transition denominator. Unknown starts
  stay counted; new attempts and unaffected requests do not inflate continuity.
  Each original is one affected user-transition journey; the two shared events
  are a separate grouping denominator, not independent user exposures or requests.
- Original latency is completion minus ORIGINAL start; unresolved originals show
  open age at 4000 ms. The original 1200 ms budget is inclusive, never restarted.
- Require 4/4 continuous originals and 2/2 continuous affected transitions,
  with zero failed/unknown originals or transitions. A successful original must
  complete, stay uninterrupted and within budget, and observe v1 before the
  transition and v2 at that ORIGINAL attempt's completion.
- Positive: originals 4 successful, 0 failed, 0 unknown; transitions 2/2; PASS.
- Negative: J2 is interrupted at 1120 ms, recovers at 1800 ms, finishes at
  1900 ms (1400 ms from its 500 ms start), still on v1. The interruption remains.
  A-J2-new starts at 2100 ms and completes on v2 at 2300 ms; it is NOT the
  original. Originals 3 successful, 1 failed, 0 unknown; transitions 1/2; FAIL.
- Unknown: J4 started at 2500 ms but original terminal/target-version evidence
  is missing. Its open age is 1500 ms, exceeding 1200 ms. A-J4-new succeeds,
  but originals remain 3 successful, 0 failed, 1 unknown; transitions 1/2 with
  one unknown; UNKNOWN. The denominator remains four originals and two transitions.
- Request records are explicit affected-request rows plus fixed counted
  unaffected rows. Positive has 988 unaffected + 12 original requests.
  Negative has 986 unaffected + 12 original + 2 new-attempt requests.
  Unknown has 987 unaffected + 11 original + 2 new-attempt requests.
- Two correlation groups share transitions. 100% routing intent, HTTP 200 and
  high total throughput alone cannot prove original continuity. No independent
  trial inference, five-nines certification, native result or production
  equivalence is claimed.

Source and scope
Frozen A-S141 is original Kano S, priority P0, LP-EXPORT, SOURCE gate. Exact
README S141, D-S141 backlog, A/B card/packet lines and frozen inventory are in
evidence\source-acceptance.json. Raw source CRLF bytes and independently hashed
canonical LF Git identities are retained. Only learning\S141 is owned.

B-S141 (CORE, DATA, HOST) remains blocked: approve a supported native target,
bounded workload and client driver, decision owner, execution and cost/quota
envelope; obtain actual client original outcomes, budgets, version movement and
correlation evidence. D-S141/source acceptance remains incomplete. IaC is N/A.
Node 22.23.4 is local tooling, NOT production Node 24 validation. The inactive
browser lifecycle prototype is not qualified. No scaffold/framework/cloud work.
C005-C008/local-harness and separately assigned OP150 are untouched; immutable
source150 exposing 135 practices is not live acceptance.

Focused read-only verification (repository-root PowerShell)
  node --test learning\S141\model.test.cjs learning\S141\integrity.test.cjs
  node --check learning\S141\model.js
  node --check learning\S141\app.js
  node --check learning\S141\browser.test.cjs
  node --test learning\S141\browser.test.cjs

The approved preinstalled Playwright 1.56.1 + signed Edge 156.0.4314.50 pair uses
the published testing\browser\isolated.cjs helper, exact SHA-256
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055.
Every browser session awaits close in finally. Missing tooling fails explicitly;
no install, download, security weakening, native validation or fallback.
Broader unattended lifecycle recovery remains unqualified.

Normal verification, including CAPTURE_BROWSER_EVIDENCE=true, 01, or 0, is
read-only. ONLY exact CAPTURE_BROWSER_EVIDENCE=1 deliberately captures uniquely
named raw browser observations, failures and exact source bytes:
  $env:CAPTURE_BROWSER_EVIDENCE='1'
  node --test learning\S141\browser.test.cjs
  Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
Snapshots cover only the listed lesson/test/acceptance sources, not proof itself.
Historical proof references its exact snapshot hashes, not future mutable bytes.
No screenshots are necessary: actual DOM, keyboard, error/reset, failures and
CSP violations are observed in the real isolated browser.

BDD preceded a loadable stub and genuine behavioral ERR_ASSERTION RED (0 !== 4).
evidence\red-stub\*.txt and uniquely named evidence\raw\*.tap retain that failure
outside test autodiscovery. They are not current-green tests. IaC N/A followed
RED, then implementation/refactoring and focused GREEN/syntax/integrity/browser
observations. Original-unit acceptance belongs to the parent alone; tests,
repairs, refinements and proof add zero credits.

The first publication stopped at diff-check because the genuine RED TAP contains
literal whitespace-only assertion lines. Its reproduced raw gate failure is
retained. A narrow evidence/raw/*.stdout.tap whitespace attribute allows those
exact stdout bytes; no RED output is trimmed and no code/shared rule is weakened.
