# C040 - inspect cohort, effect and latency result tables; failed and unknown attempts stay visible

**Training rehearsal - synthetic data - not a live Azure result**

Original **C040 / S**, packet H007. The independently accepted gates are C029, C030 and C031 (with C039 it unlocks the delighter
compare-two-runs). Everything here is local, offline and fictional: saved outputs of three accepted evaluators about a fictional
profile service and fictional clients. Production Node 24, Express, Entra and any real service are neither validated nor registered;
nothing here is a live Azure, native or user-journey result. IaC is N/A. No packages, cloud, identity, credentials, real users,
deployment or spend.

## The rule this card proves

**A FAILED or UNKNOWN row can never disappear**: not by sort, filter, search, paging or truncation, not by an empty state, not by a
summary or an aggregate. `tables.js` is a pure, dependency-free module (CommonJS plus the browser global `C040Tables`) that builds
three tables from the SAVED outputs of the accepted producers and renders one `view()` of each:

| Table | Producer output | One row per | Closed status vocabulary (kind) |
| --- | --- | --- | --- |
| Cohort | C031 `C031-evaluation/1` | client | `ACTUAL_TRANSITION` (success), `UNCHANGED` (neutral), `NOT_TRANSITIONED_YET` (neutral), `FAILED` (failed), `UNKNOWN` (unknown) |
| Effect | C030 `C030-detection/1` | intended effect of each original | `ONE_INTENDED_EFFECT` (success), `DUPLICATE` (failed), `MISSING` = confirmed absence (failed), `MISSING_OBSERVATION` (unknown), `UNKNOWN` (unknown) |
| Latency | C029 `C029-evaluation/1` | journey (original) | `WITHIN` (success), `EXCEEDED` (failed), `FAILED` (failed), `UNKNOWN` (unknown) |

* Every row carries an explicit `status`, its `kind`, the producer's own status text (`producerStatus`) and flags. Failed and unknown
  rows are `attention` rows: they are pinned.
* **A status the inspector does not recognise renders as `UNKNOWN`** with the flag `UNRECOGNISED_STATUS` and the producer's own text. A
  contradiction (for example `ACTUAL_TRANSITION` that does not count in the numerator, or `ONE_APPLICATION` whose lower bound is not 1) is
  `UNKNOWN` with `CONTRADICTORY_PRODUCER_STATUS`. One application with an open upper bound is `UNKNOWN` with `UPPER_BOUND_NOT_EXACT`, because
  C030 itself requires an exact bound for PASS. UNSUPPORTED and an unknown acknowledgment are `UNKNOWN` with the producer status kept. A row
  that is not an object, or a hole in a sparse list, is a malformed `UNKNOWN` row (`MALFORMED_ROW`), never skipped.
* **Counts are derived from the rows, never from a second counter.** `view().statusCounts` lists every status including the zero counts and
  `NOT_SAVED`; they always add up to `total`, and `checkView()` asserts it (a tampered total is reported as `INCONSISTENT VIEW`). The page
  re-reads what it rendered and raises an alert when the rendered counts, the rendered rows or the rendered identifiers disagree.
* **Summary**: `showing N of TOTAL rows, STATE. Status counts: ...; together TOTAL of TOTAL rows.` plus the producer's own numbers
  (`producerLine`), for example `Producer C031 says: 3 of 7 eligible clients = 42.86%; eligible 7, actual transitions 3, clients 7.`
* **States**: `COMPLETE`; `EMPTY` ("no attempts recorded", never "all passed", never a percentage, never a success rate); `INCOMPLETE`
  (fewer rows than the producer's own total: the total shown is the producer's total and the missing rows are counted as `NOT_SAVED`, an
  unknown status, so the counts still add up); `INCONSISTENT` (more rows than the producer counted, or numbers that disagree with the
  producer: a duplicated row is kept and flagged `DUPLICATE_ROW`, both copies counted); `REJECTED` (the producer rejected its input or the
  report is unusable or unreadable: the code is shown, any rows are kept, nothing looks like a success).
* **Numbers equal the producers' own numbers**: the model cross-checks the counts derived from the rows against the producer's counts
  (actual transitions, eligible, rate numerator and denominator, failed, unknown, unchanged, not yet; confirmed applications and delivery
  attempts per original; within, failed or exceeded and unknown journeys) and says `INCONSISTENT` when they differ. `tests\source.test.cjs`
  asserts equality against the producers' evaluator output for every saved set (never a second formula) and builds a `COMPLETE` table from
  every output of the accepted producers: 8 C031 saved sets, 21 C030 sources, 2 C029 saved sets, 7 controls and 4 models.

### Filters, search and paging only hide success and neutral rows, and say so

`view(table, { sort, filter, search, pageSize, page })`: the filter is `all` (the default), `attention` (failed and unknown only),
`success`, or one status. Failed and unknown rows are always kept. A view that hides rows says how many and which statuses
(`The filter "success" hides 7 rows: UNCHANGED 3, NOT_TRANSITIONED_YET 4.`) and, when the choice alone would have hidden failed or unknown rows,
says so (`It would also have hidden 2 FAILED and 1 UNKNOWN rows: failed and unknown rows are never hidden, so they stay visible. Choose "All
statuses", clear the search and use all pages to show every row.`). "Success only" is neither the default nor the only view. Sorting never
removes a row (stable, producer order breaks ties, missing values sort last). The page renders every row: it has no paging and no collapse
(the per-row status label is never inside a collapsible part); paging exists in the model so that the rule is proven for it.

## Saved sets and the exact numbers

`saved.js` holds eight saved sets. Each of the three reports of a set names its origin. It is generated by `tests\build-saved.cjs` and its
bytes are pinned in `imports.json`; `tests\source.test.cjs` replays the generator over the pinned producers and compares byte for byte.

| Saved set | Cohort | Effect | Latency | Origin |
| --- | --- | --- | --- | --- |
| `closed-history` | 7 clients: 3 transitions, 1 failed, 3 unknown (3 of 7 = 42.86%) | 7 originals, one UNKNOWN row each (no effect receipts were ever observed) | 7 journeys: 2 within, 1 exceeded (1118.9 ms against 1000 ms), 1 failed, 3 unknown | exact saved C031, C030, C029 outputs |
| `held-snapshot` | 2 clients: 1 transition, 1 not yet (1 of 2) | 2 originals, UNKNOWN | 2 journeys: 1 within, 1 unknown | exact saved outputs |
| `fiction-failed-then-retry` | `fleet-baseline`: 10 clients, 3 transitions, 3 not yet, 2 unchanged, 1 failed, 1 unknown | `control-absence-retry`: 6 rows, the first original's `MISSING` row stays | `control-retry`: `EXCEEDED` then `WITHIN`, both counted | producer outputs on the producers' fictional ids |
| `negative-3-failed-2-unknown-of-40` | **45 rows: 40 + 3 failed + 2 unknown** | **45 rows: 40 `ONE_INTENDED_EFFECT`, 3 `DUPLICATE`, 2 `UNKNOWN`** | **45 rows: 40 `WITHIN`, 2 `EXCEEDED`, 1 `FAILED`, 2 `UNKNOWN`** | real C031 `evaluateFleet` and C030 `inspectFiction` on fictional input; C029 cannot take 45 journeys, so that report is fictional and producer-shaped |
| `negative-unrecognised-status` | one row with `PARTIALLY_MIGRATED` | one with `MOSTLY_ONE_APPLICATION` | one with `HEALTHY_ISH` | explicit edit of the retry set |
| `negative-empty` | 0 rows | 0 rows | 0 rows | explicit edit: "no attempts recorded" |
| `negative-truncated` | 4 of 10 rows (6 `NOT_SAVED`) | 3 of 6 | 1 of 2 | explicit edit: `INCOMPLETE`, producer total kept |
| `negative-duplicated-row` | 12 rows (two clients twice) | 7 rows | 3 rows | explicit edit: `DUPLICATE_ROW`, `INCONSISTENT` |

The 40/3/2 effect set is built honestly from C030's cumulative originals: 15 originals of three effects each; from original 13 on, effect 0 has
a second application (3 `DUPLICATE` rows) and from original 14 on effect 1 has an unknown acknowledgment (2 `UNKNOWN` rows): 36 + 2 + 1 + 1 = 40
`ONE_INTENDED_EFFECT` rows. With the filter "success" all 5 stay visible in every table under every sort, search and page
(`tests\tables.test.cjs`, `tests\browser.cjs`).

## What was imported read-only

`imports.json` pins 19 unchanged accepted files (C020 contract, inspector and profiles; C023 ledger; C029 evaluator and one browser tool; C030
detector; C031 source, imports, evaluator and saved bundle; C033 journey and one browser tool; C034 trace, saved, pins, imports, bundle) by raw
bytes, CRLF-to-LF bytes and the accepted Git blob of the accepted commit (C020 `2dc471da`, C023 `68be1c61`, C029 `257f44fa`, C030 `3e63bff1`,
C031 `09297317`, C033 `dd087098`, C034 `01cc2dce`). The anchor is Git history: `source.checkImports()` recomputes every pin against the
accepted blob, and `tests\build-imports.cjs` refuses a file that agrees with neither the blob nor its LF form. `source.producers()` loads the
accepted producers only after every pin read back byte-identical. Nothing outside `capability\C040` is edited.

## Use it

```powershell
# keyboard page (open the file; no server, no network): choose a saved set, Tab, Enter or Space, arrow keys on the tabs
capability\C040\index.html
node capability\C040\cli.cjs list
node capability\C040\cli.cjs table closed-history latency
node capability\C040\cli.cjs table negative-3-failed-2-unknown-of-40 cohort success
node capability\C040\cli.cjs table negative-empty effect
```

The CLI accepts only saved ids, a table and a filter (no path, URL, verdict or provenance) and prints JSON. Exit 0 only for a `COMPLETE`
table, 3 for any other state (so an empty, incomplete, inconsistent or rejected table is never reported as success), 1 unavailable, 2 usage.
The page lets a keyboard user choose a saved set, switch tables in a tablist (ArrowLeft, ArrowRight, Home, End; one tab stop), sort a column and
direction, pick a status filter and type a search. After every action the summary line and an `aria-live="polite"` status announce the result.
Failed and unknown rows keep text labels (`FAILED (needs attention)`), with colour and a border only as an extra cue. "Reset display only"
clears the display and returns focus to the picker. CSP blocks inline script, connections and forms.

## Verify (the independent reviewer re-runs exactly these)

```powershell
# 1. RED replay: the archived behavioral RED fails (exit 1, 9 of 9 assertion failures) against the loadable naive stub
node --test capability\C040\evidence\red\tables.red.test.cjs
# 1b. the SAME archived RED file, unchanged, passes 9 of 9 against the final tables.js (the shim hands it the real module)
node --require .\capability\C040\tests\green-shim.cjs --test capability\C040\evidence\red\tables.red.test.cjs
# 2. GREEN: the whole non-browser suite (evidence.test.cjs is step 5, it needs the recorded runs)
node --test --test-concurrency=1 capability\C040\tests\cli.test.cjs capability\C040\tests\integrity.test.cjs capability\C040\tests\page.test.cjs capability\C040\tests\source.test.cjs capability\C040\tests\tables.test.cjs capability\C040\tests\umd.test.cjs
# 3. per-file 85/85/85 coverage over the enumerated production files (about 2 minutes; take a heavy slot in the shared run)
node capability\C040\tests\coverage.cjs
# 4. real isolated headless Edge observation of the page (heavy slot; no evidence is written unless CAPTURE_BROWSER_EVIDENCE=1)
node capability\C040\tests\browser.cjs
# 5. the newest recorded GREEN, replay, coverage and browser evidence passed and still describes the current files
node --test capability\C040\tests\evidence.test.cjs
# regenerate and compare the saved bundle and the pins (read-only): both exit 0
node capability\C040\tests\build-saved.cjs --check
```

Fresh evidence is append-only: `node RUN\scripts\archive-run.cjs <spec.json>` (new numbered directory, flag `wx`) for the GREEN, replay and
coverage runs, and `$env:CAPTURE_BROWSER_EVIDENCE = '1'; node capability\C040\tests\browser.cjs` for a browser run; `evidence.test.cjs` reads the newest.

### Evidence layout

* `evidence\red\`: `tables.red.test.cjs` (9 behavioral assertions, run against the loadable naive stub `tables.stub.cjs`), and `run-1` with raw
  stdout and stderr (gzip, SHA-256 of the decompressed bytes in the manifest), exit code `1` and the SHA-256 of every input. The RED was
  recorded before `tables.js` existed. Its failures are assertions about the specified behavior (a status filter that hides failed rows, an
  empty set that says "All passed: 100%", an unrecognised status that is skipped, a de-duplicating table, a shorter total and so on), never a
  missing module. `tests\integrity.test.cjs` pins the archived bytes, replays the RED (9 `ERR_ASSERTION`, no module or syntax error) and replays the
  same file against the real code. Per L-0121 every RED input is a valid producer-shaped report, so all 9 assertions pass unchanged after GREEN and no
  second RED was needed.
* `evidence\green\suite-run-1`: the whole non-browser suite, 77 tests, 77 pass. `red-replay-run-2`: the archived RED against the final code,
  9 of 9 pass. `red-replay-run-1` is retained as a failed recording: its `--require` path lacked the `.\` prefix (L-0063) and node could not start;
  nothing was edited and run 2 repeats it correctly.
* `evidence\coverage\run-1`: `tests\coverage.cjs` enumerates every production script, runs the L-0004 command once per file with
  `--test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85`, requires a row per file (an unloaded file would count as
  0 percent) and exits 1 below any threshold. `page.js` is measured under Node through `tests\dom-stub.cjs` (built from the ids of the real
  `index.html`); the browser-global branches of the UMD files run through `vm.Script` in `tests\umd.test.cjs`.

| Production file | Lines % | Branches % | Functions % |
| --- | ---: | ---: | ---: |
| `cli.cjs` | 100.00 | 100.00 | 100.00 |
| `page.js` | 100.00 | 99.01 | 100.00 |
| `saved.js` | 100.00 | 100.00 | 100.00 |
| `source.cjs` | 100.00 | 100.00 | 100.00 |
| `tables.js` | 100.00 | 98.78 | 100.00 |

* `evidence\browser\browser-<uuid>`: `tests\browser.cjs` opens `capability\C040\index.html` through `testing\browser\isolated.cjs`
  (`openIsolatedLesson`): a fresh isolated headless Microsoft-signed Edge, closed in `finally`, under a heavy slot. It drives the page by keyboard
  only (ArrowDown on the picker, Tab, Enter, Space, arrow keys on the select controls and on the tablist, typing a search), observes the live
  region with a `MutationObserver`, and after EVERY action reads the DOM back (L-0118): unique ids, rendered counts add up to the total, every
  failed and unknown row of the table is on screen with its text label. The archived DOM snapshots are scanned for repeated ids by
  `tests\evidence.test.cjs`. The browser version is recorded, not pinned (signature plus major 156 are asserted; no installed-browser hash).
  The recorded run: Edge 156.0.4314.58, 14 checks, 32 DOM invariant scans, four archived DOM snapshots, exact cleanup of the session, profile and
  browser process.

## Test strength

* `tests\tables.test.cjs` (24 tests): the vocabularies, every status mapping and contradiction, hostile rows (not an object, holes in a sparse
  list, a throwing proxy), every state, the exact messages, the 5 failed and unknown rows under every column and direction, every filter option, searches
  and pages in all three tables, a tampered view, and **a seeded random walk of 800 operations over every saved set, table, sort, filter, search and page,
  including the recovery operations (reload, back to the defaults, an invalid query), with the global invariant checked after EVERY operation**.
* `tests\page.test.cjs` (21 tests): the page under the DOM stub, and **a seeded random walk of 600 operations over every user operation, including the
  recovery operations (reset, reload of the same or another set, a refused load, a table switch by key), reading the invariant back from the DOM after
  EVERY step**: unique row identifiers, counts add up, every failed and unknown row rendered, no alert.
* `tests\source.test.cjs` (14), `tests\cli.test.cjs` (10), `tests\umd.test.cjs` (3), `tests\integrity.test.cjs` (5): the pins and the producer equality, the CLI, the
  browser-global load path and the RED archive. `tests\evidence.test.cjs` (4) checks the recorded evidence: 77 + 4 = 81 tests.
* Tests are hermetic: no live git index or HEAD (only `git cat-file` of immutable accepted commits), no publisher bytes, no installed-browser hash,
  no wall clock. A nested `node --test` always runs with `NODE_TEST_CONTEXT` and `NODE_V8_COVERAGE` removed (`tests\nested-runner.cjs`).
* `.gitattributes` (`* -text`) keeps the pinned bytes exact; `evidence\.gitattributes` (`* -text -diff`) keeps the raw transcripts exact.

## Limits, stated plainly

* The tables show what the SAVED producer outputs say. A saved set is not a live run: `fiction-failed-then-retry` joins three fictional producers that
  were never one run, and the C030 and C029 historical outputs are separate evidence (C030 observed no effect receipts for the C033 clients, so its
  seven originals are UNKNOWN rows, never zero failures).
* C030 rows are cumulative per original (a duplicate application seen in original 13 is still there in originals 14 and 15), so the 3 `DUPLICATE`
  rows of the 40/3/2 effect set are one defect seen three times. The saved `negative-3-failed-2-unknown-of-40` latency report is fictional and
  producer-shaped, because the real C029 evaluator cannot be fed 45 journeys.
* "Success" in a table row means a producer status, not user-journey success, not latency over a live network, not an availability or SLA claim.
* The page has no paging and no collapse by design; the model's paging is there so that the pinning is proven for it.

## Publication

One new-ID card, published once through the additive publisher `publish-ext.ps1` after the controller's GO file, with the plain relative path
`capability\C040`. This README is not evidence of acceptance: the independent reviewer and the parent decide.
