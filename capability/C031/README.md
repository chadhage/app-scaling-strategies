# C031 - distinguish an actual version transition from unchanged-version traffic

**Training rehearsal - synthetic data - not a live Azure result**

Original **C031 / D**, packet H006, parents H006 and H012. The independently accepted gates are C029 and C034.
This is one original unit; only the parent accepts it. Everything here is local, offline and fictional: a fictional
profile service moves from **v1 (1.0.0)** to **v2 (2.0.0)** of the unchanged C020 `getProfile/1` contract, and fictional
clients leave saved traces. Production Node 24, Express, Entra and any real service are neither validated nor registered;
nothing here is a live Azure, native or user-journey result. IaC is N/A. No packages, cloud, identity, credentials,
real users, deployment or spend.

## The rule

`evaluator.js` is a pure, dependency-free module. It reads **saved per-client traces** and classifies every client as
exactly one of four classes, recomputed from its ordered actions (a claimed verdict, eligibility or source in the data
is a schema violation, never authority):

| Class | Meaning |
| --- | --- |
| `ACTUAL_TRANSITION` | Request at the old version, then a valid **server acknowledgment of the new version**, then a request or state at the new version, with no ordering defect. |
| `UNCHANGED` | All traffic stayed at the new version from the start (users who started on v2). Not eligible. |
| `NOT_TRANSITIONED_YET` | Still on the old version at the end, or the new version was acknowledged but never used afterwards. Eligible. |
| `FAILED_OR_UNKNOWN` | A failed reply (`failed`) or an interrupted, unacknowledged, reordered, duplicated, stale or contradictory sequence (`unknown`). Both counts stay visible. |

**Migration success rate = ACTUAL_TRANSITION clients / eligible clients**, with both numbers spelled out.

* Eligible means the client started on the old version. A client whose start version cannot be proven (empty or malformed
  trace, only an interruption, a summary without actions, conflicting copies) is **counted as eligible**, never excluded.
  So is a client whose trace shows ANY old-version traffic even when a new-version event comes first
  (`CONTRADICTORY_START_COUNTED_ELIGIBLE`): a replayed new-version request or state placed first cannot take a stuck old-version
  client out of the denominator. A hostile probe found that hole (three stuck clients with a leading replay turned 3 of 8 into
  3 of 5); it is fixed and archived as the RED run-3 below.
* UNCHANGED clients, and defective traces whose every versioned event is at the new version, are not eligible. They add nothing
  to the numerator and are not in the denominator, but they stay visible in the counts next to the rate, so they can
  neither inflate success nor silently dilute a failure share. The `eligibility` label of a row says which case applied:
  `STARTED_ON_OLD_VERSION`, `START_VERSION_UNPROVEN_COUNTED_ELIGIBLE`, `CONTRADICTORY_START_COUNTED_ELIGIBLE` (all in the
  denominator) or `STARTED_ON_NEW_VERSION_NOT_ELIGIBLE` (the only one outside it).
* An empty denominator has no rate (`0/0`, never 100 percent).
* A client whose traffic is all at the old version is `NOT_TRANSITIONED_YET`: it is eligible and stays in the denominator, so
  it can never hide as "unchanged". `UNCHANGED` is only a clean trace that started and stayed on the new version.
* A trace that shows the acknowledged new version and its later use but **no request at the old version** is not a complete
  transition (`OLD_VERSION_REQUEST_MISSING`, unknown). A terminal failure or interruption after complete evidence keeps the
  transition and adds the note `TERMINAL_AFTER_TRANSITION_EVIDENCE`.

Required evidence order of a transition (`evidence` in each row): `REQUEST` at 1.0.0, then an `ACK` of a request at
2.0.0 carrying the 2.0.0 stamp (`C020-loopback-v2-r1`), then a later `REQUEST` or `STATE` at 2.0.0. The first violated
rule is reported with its code and position, for example `ACK_BEFORE_REQUEST`, `NON_MONOTONIC_TIME`,
`OUT_OF_ORDER_SEQUENCE`, `SEQUENCE_GAP`, `DUPLICATE_EVENT`, `DUPLICATE_REQUEST_ID`, `DUPLICATE_ACK`,
`STALE_ACKNOWLEDGMENT` (issued before its request), `ACK_ISSUED_AFTER_RECEIPT`, `STAMP_MISMATCH`, `ACK_VERSION_MISMATCH`,
`VERSION_REGRESSION`, `STATE_BEFORE_ACKNOWLEDGMENT`, `UNACKNOWLEDGED_NEW_VERSION_REQUEST`, `OLD_VERSION_REQUEST_MISSING`,
`CONFLICTING_DUPLICATE_TRACES`.
The closed catalog with a meaning per code is `evaluator.reasonCodes`.

## Saved sets and the exact numbers

| Saved set id | Numerator / denominator | Rate | Unchanged | Failed | Unknown | Not yet |
| --- | --- | --- | --- | --- | --- | --- |
| `c034-closed-history` (exact C034 bundle, adapted read-only) | **3 of 7** | 42.86% | 0 | 1 | 3 | 0 |
| `c034-held-snapshot` (exact C034 bundle, adapted read-only) | **1 of 2** | 50.00% | 0 | 0 | 0 | 1 |
| `fleet-baseline` (fictional, 10 clients) | **3 of 8** | 37.50% | 2 | 1 | 1 | 3 |
| `negative-unchanged-flood` (+40 unchanged v2 clients) | **3 of 8** | 37.50% | 42 | 1 | 1 | 3 |
| `negative-replayed-v2-request` (+2 v1 clients replaying v2 without acknowledgment) | 3 of 10 | 30.00% | 2 | 1 | 3 | 3 |
| `negative-duplicated-trace` (exact copy, conflicting copy, duplicated ack) | 3 of 9 | 33.33% | 2 | 1 | 3 | 2 |
| `negative-stale-cached-ack` (v2 ack issued long before its request) | 3 of 9 | 33.33% | 2 | 1 | 2 | 3 |
| `negative-out-of-order` (ack first, time backwards, reordered sequence) | 3 of 11 | 27.27% | 2 | 1 | 4 | 3 |

A naive count that treats any version-2 traffic as migrated would report over 90 percent for the flood set. The comparison
(`compare <negative id>`) measures instead: numerator never increases and the rate is never raised.

| Negative | Reason codes (client: code) |
| --- | --- |
| flood | `flood-001..040: UNCHANGED_NEW_VERSION_ONLY` (not eligible) |
| replay | `replayed-001: UNACKNOWLEDGED_NEW_VERSION_REQUEST`, `replayed-002: STATE_BEFORE_ACKNOWLEDGMENT` |
| duplicates | `client-001` exact copy collapsed (`DUPLICATE_TRACE_COLLAPSED`, counted once); `client-004: CONFLICTING_DUPLICATE_TRACES`; `duplicate-001: DUPLICATE_ACK` |
| stale | `stale-001: STALE_ACKNOWLEDGMENT` |
| out of order | `order-001: ACK_BEFORE_REQUEST`, `order-002: NON_MONOTONIC_TIME`, `order-003: OUT_OF_ORDER_SEQUENCE` |

## What was saved, and what was not invented

* `imports.json` pins the unchanged accepted **C034** saved bundle (`evidence/raw/trace-7d3b0b84-.../bundle.json` and
  `bundle.js`), the C034 decoder files and the C020 and C033 files they load, each by raw bytes, CRLF-to-LF bytes and the
  accepted Git blob of the accepted commit (C020 `2dc471da`, C033 `dd087098`, C034 `01cc2dce`). They are read-only.
  `source.cjs` verifies the pins; nothing outside `capability\C031` is edited.
* `evaluator.fromC034Trace` maps each saved original attempt (one saved client) onto the closed client-trace shape: reads
  become `REQUEST`/`ACK` with the version from the saved reply stamp, holds and resumes stay, `TWO_READ_LOCAL_SEGMENT_OBSERVED`
  becomes the later `STATE` at the last acknowledged version, a failed reply and interruptions stay terminal. C034 saved **no**
  request token, per-response header or server issue time: they are not invented (`issuedAt` is `null`, the rows say
  `ISSUE_TIME_NOT_SAVED`, and staleness cannot be assessed for historical traces). Original 3 stays a transition and carries
  `ORIGINAL_BUDGET_EXCEEDED_SEPARATE_VERDICT` (the C029 latency verdict is separate). Attempts 5 and 6 stay unknown; the
  replacement summary (attempt 7) has no actions and stays `SUMMARY_ONLY_NO_TRACE`.
* `saved.js` is this namespace's own synthetic saved bundle (one baseline fleet and five negatives). It is generated by the
  deterministic `tests\build-saved.cjs` from `tests\fixtures.cjs`, and its bytes are pinned in `imports.json`.

## Use it

```powershell
# keyboard page (open the file; no server, no network): choose a saved set, Tab, Enter or Space
capability\C031\index.html
node capability\C031\cli.cjs list
node capability\C031\cli.cjs evaluate c034-closed-history
node capability\C031\cli.cjs evaluate negative-unchanged-flood
node capability\C031\cli.cjs compare negative-unchanged-flood
```

The CLI accepts only the saved ids (no path, URL, verdict or provenance) and prints JSON; exit 0 valid, 1 rejected, 2 usage.
The page lets a keyboard user choose a saved set, evaluate it or evaluate and compare with the baseline, read the
classification table, the numerator and denominator spelled out and the unchanged, failed and unknown counts next to the rate,
and reset the display only (focus returns to the picker, the 16-operation history is retained, never evicted). CSP blocks
inline script and connections. PASS of the page check means UI verification, not user journey success.

## Verify (the independent reviewer re-runs exactly these)

```powershell
# 1. RED replay: the archived behavioral RED fails (exit 1, 3 assertion failures) against the original naive stub
node --test capability\C031\evidence\red\evaluator.red.test.cjs
# 1b. RED run-3 fails (exit 1, 2 assertion failures) against its archived pre-fix evaluator; with C031_GREEN_REPLAY=1 the same assertions pass
node --test capability\C031\evidence\red\leading-new-version.red.test.cjs
$env:C031_GREEN_REPLAY = '1'; try { node --test capability\C031\evidence\red\leading-new-version.red.test.cjs } finally { Remove-Item Env:C031_GREEN_REPLAY }
# 2. GREEN: the whole non-browser suite (evidence.test.cjs is step 5, it needs the recorded runs)
node --test --test-concurrency=1 capability\C031\tests\evaluator.test.cjs capability\C031\tests\catalog.test.cjs capability\C031\tests\source.test.cjs capability\C031\tests\saved.test.cjs capability\C031\tests\cli.test.cjs capability\C031\tests\page.test.cjs capability\C031\tests\surface.test.cjs capability\C031\tests\properties.test.cjs capability\C031\tests\denominator.test.cjs capability\C031\tests\hostile.test.cjs capability\C031\tests\integrity.test.cjs
# 3. per-file 85/85/85 coverage over the enumerated production files (about 1 minute; take a heavy slot)
node capability\C031\tests\coverage.cjs
# 4. real isolated headless Edge observation of the page (heavy slot; no evidence is written unless CAPTURE_BROWSER_EVIDENCE=1)
node capability\C031\tests\browser.cjs
# 5. the newest recorded GREEN, coverage and browser evidence passed and still describes the current files
node --test capability\C031\tests\evidence.test.cjs
# 6. mutation check: 41 textual mutants of evaluator.js plus the unchanged identity are compiled in memory; every mutant must be killed (about 3.5 minutes; heavy slot)
node capability\C031\tests\mutants.cjs
```

Fresh evidence is append-only (new unique directories, never overwritten):

```powershell
node capability\C031\tests\record-run.cjs green run-1
node capability\C031\tests\record-run.cjs coverage run-1     # takes a heavy slot in the shared run
# a later record uses the next number (run-2, ...); evidence.test.cjs reads the newest one
$env:CAPTURE_BROWSER_EVIDENCE = '1'; try { node capability\C031\tests\browser.cjs } finally { Remove-Item Env:CAPTURE_BROWSER_EVIDENCE }
```

Raw captures are stored as byte-exact gzip (authentic trailing whitespace stays untouched and out of whitespace checks):
the SHA-256 of each decompressed capture is recorded next to it. The two RED runs were captured as plain text by
`tests\record-red.cjs` and packed with `tests\pack-raw.cjs`; the integrity test pins the decompressed SHA-256 taken before packing.

* The RED lives in `evidence\red`: `evaluator.red.test.cjs` and the loadable naive stub `evaluator.stub.cjs`, plus `run-1`
  (raw stdout and stderr as gzip, exit code `1`, manifest with the SHA-256 of every input). `tests\integrity.test.cjs` pins every
  archived byte, replays the RED, and replays the **same archived RED assertions** unchanged against the real evaluator
  (`tests\green-shim.cjs`, exit 0, 3 passes). The RED was archived before `evaluator.js` existed. `run-2`
  (`old-request-missing.red.test.cjs`) is a second, later RED for one increment found while testing (a state at the old
  version without any old-version request counted as a transition); it failed with an assertion before its fix and passes now.
  Its pre-fix `evaluator.js` bytes were not archived, so run-2 is a retained failure transcript, not a replayable failure.
  `run-3` (`leading-new-version.red.test.cjs`) is a third RED for the denominator hole above and IS replayable: it loads the
  byte-exact pre-fix evaluator `evaluator.before-run3.js` (2 assertion failures, exit 1) and, with `C031_GREEN_REPLAY=1`, the
  same unchanged assertions pass against the real evaluator (3 passes). `tests\integrity.test.cjs` pins and replays both.
* `tests\coverage.cjs` enumerates every production script (`cli.cjs`, `evaluator.js`, `page.js`, `saved.js`, `source.cjs`),
  runs the Node coverage command once per file with `--test-coverage-lines=85 --test-coverage-branches=85
  --test-coverage-functions=85`, requires a coverage row per file (an unloaded file would count as 0 percent) and exits 1
  below any threshold. `page.js` is measured under Node through `tests\dom-stub.cjs`, built from the ids of the real
  `index.html`. The per-file numbers of the recorded run are archived in `evidence\coverage`.
* `tests\browser.cjs` opens `capability\C031\index.html` through `testing\browser\isolated.cjs` (`openIsolatedLesson`):
  a fresh isolated headless Microsoft-signed Edge, closed in `finally`. It drives the page by keyboard (ArrowDown to choose,
  Tab, Enter, Space), reads the rate, numerator, denominator and counts from the DOM, resets, checks the CSP by real
  violation events and checks that every request is a local `file:` GET. The browser version is recorded, not pinned
  (signature plus major 156 are asserted).
* Tests are hermetic: no live git index or HEAD (only `git cat-file` of immutable accepted commits), no publisher bytes, no
  installed-browser hash, no wall clock. A nested `node --test` always runs with `NODE_TEST_CONTEXT` and
  `NODE_V8_COVERAGE` removed (`tests\nested-runner.cjs`).
* `.gitattributes` (`* -text`) keeps the pinned and archived bytes exact.

## Hostile probes and test strength

* `tests\denominator.test.cjs`: six edits that put a new-version request, state or acknowledgment first, last by sequence number
  or in the middle of a stuck old-version client's trace never lower the denominator or raise 3 of 8; defective traces with only
  new-version traffic stay outside the denominator but visible in the failed and unknown counts.
* `tests\hostile.test.cjs`: `__proto__` and `constructor` keys at every depth, prototype-named identifiers, NaN and Infinity,
  19 odd version spellings in three places, mixed version, stamp and acknowledgment pairings, the 512-trace and node-count bounds,
  and duplicate client identifiers (512 identical copies, key order, conflicting and malformed copies).
* `tests\properties.test.cjs`: 4000 deterministic generated traces against an independent oracle for class and eligibility, plus
  metamorphic rate properties (clean unchanged clients, exact duplicates and client order never change the rate).
* `tests\mutants.cjs`: 41 mutants of `evaluator.js` (each flips one rule: stale check, duplicate acknowledgment, eligibility,
  first versus latest evidence, adapter issue time, comparison decision and so on) are compiled in memory and run against the
  evaluator, catalog, property, denominator and hostile suites; the unchanged identity must pass and every mutant must fail.

## Limits, stated plainly

* Traces are per client. Without request tokens (C034 saved none), a complete request-plus-acknowledgment pair copied from
  another client into a v1 client's trace cannot be told apart from a genuine one. The card's case, a replayed new-version
  request **without** an acknowledged version, is detected (`UNACKNOWLEDGED_NEW_VERSION_REQUEST`, `STATE_BEFORE_ACKNOWLEDGMENT`).
* Historical C034 traces carry no server issue time, so a stale cached acknowledgment can only be shown on the fictional sets,
  where every acknowledgment has an `issuedAt`. Caller data may not set `issuedAt` to `null` to dodge the check.
* Success here means an acknowledged version change in saved local data. It is not latency (C029 owns budgets), not effects,
  not user-journey success and not an availability claim.

## Publication

One new-ID card, published once through the additive publisher `publish-ext.ps1` after the controller's GO file, with explicit
plain relative paths inside `capability\C031` only. This README is not evidence of acceptance: the independent reviewer and the
parent decide.
