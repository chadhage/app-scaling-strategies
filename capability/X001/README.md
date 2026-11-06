# X001: scrub a saved run timeline backward and forward without re-execution

> **Status.** This is the FIX commit of X001 on top of the rejected first publication. The figures block at the end is machine-checked against the captures in `evidence\fix`; what is NOT recorded (page.js and most of timeline.js in the
> mutation campaign) is stated under "Honest limits", not hidden. The work state of the run is in `results\X001.json` of the run folder.

**Training rehearsal - synthetic data - not a live Azure result**

Original **X001 / L (the Delighter of packet LP-REPLAY)**, parents H007 and H008, gates C034 and C044 (Done), companions C018, C034,
C037, C038, C040 and C044. This is one local, synthetic, offline fixture. It does not validate production **Node 24 / Express / Entra**,
registers no identity, uses no cloud service, no real data and no spend. Nothing is run again: no producer, server, timer or network is
started while scrubbing. IaC is **N/A**. Parent acceptance alone awards the credit; tests and evidence earn nothing extra.

This README describes the FIX commit on top of the first publication (`368332e2a881`, tag `kanban/X001/368332e2a881`), which an independent
review rejected on three majors (F1 to F3) and six minors (F4 to F9). The first publication's archive is untouched and still verified
(`tests\evidence.test.cjs`); everything new lives in `evidence\fix`, `X001-fix.feature` and the files named below.

## The review findings and what answers each one

| finding | fix | test that fails on the old bytes | RED archive (old bytes fail) |
| --- | --- | --- | --- |
| F1 fresh checkout: 2 of 70 tests failed because five other-namespace pins were raw CRLF bytes | `tests\pins-check.cjs`: a foreign file is accepted in its raw or its LF-normalized form and the raw pin must be the LF or CRLF form of the same text; `tests\evidence-check.cjs` compares foreign inputs by LF hash | `tests\pins-form.test.cjs`, `tests\fresh-tree.cjs` (ten suites in an LF scratch tree and in a CRLF one) | `evidence\fix\red\run-1`: the first-publication suites in an LF tree, 70 tests, 2 fail |
| F2 returned objects were mutable and aliased the caller | `timeline.js`: `own()` copies entries, source and producer into private frozen data, flags, marks and every answer are frozen, `verify` compares flags and marks | `tests\aliasing.test.cjs` (a generic walker over every reachable object of every public return value, frozen and unfrozen runs, strict mode) | `evidence\fix\red\run-2` (7 tests, 7 fail) |
| F3 the display oracle compared 8 of 16 state lines | `tests\oracle.cjs` (independent fold) and `tests\invariants.cjs` compare all 16 console lines or all 7 trace lines, the announcement, the producing entry, every row, every button, the scrub bar, the limits panel and the provenance; the rendered ids are enumerated | `tests\page.test.cjs` (every position of every valid run; every element id classified and perturbed), `evidence\fix\red\display.red.test.cjs` | `evidence\fix\red\run-3`: the reviewer mutants D1, D2, D6, D7, P12 on the first-publication bytes, 5 named tests fail |
| F4 `limits.gaps[].position` never read | tested against the 1-based entry position | `tests\totality.test.cjs` F4 | run-2 (reviewer mutant B12) |
| F5 `VERIFICATION FAILED` branch untested and called equivalent | injected failing verify in the DOM stub | `tests\page.test.cjs` F5 | run-3 (reviewer mutant P12) |
| F6 `build` not total for sparse arrays | `build` and `verify` are total: typed refusal, never a throw | `tests\totality.test.cjs` (typed code per hostile kind, seeded fuzz, capped heap) | run-2 |
| F7 producer total not cross-checked | `PRODUCER_INCONSISTENT` | `tests\totality.test.cjs` F7 | run-2 |
| F8 integrity tests did not recompute figures | `tests\evidence-figures.cjs` recomputes suite, coverage, mutation and browser figures from the stored transcripts and the DOM snapshot and compares the figures block at the end of this README (a figure without a capture, or a capture whose figure differs, fails); the README is an input of the final capture | `tests\evidence-figures.test.cjs` (one tamper test per figure, failing by name) and `tests\evidence.test.cjs` (a changed input byte, README included once a capture pins it) | no archived RED: the old verifier has no such check to replay (see limits) |
| F9 README wording and browser summary | the README states what the page does with a refused fragment; the browser summary pins `tests\invariants.cjs` and `tests\oracle.cjs` | `tests\claims.test.cjs` checks both claims on the git blobs of the first publication (it reports the omitted source and the false sentence there) and on the final files (it reports nothing); the behaviour is `tests\page.test.cjs` F9 | no archived RED: a differential test in the suite, not a recorded run (see limits) |

## What it is

A page (`index.html`, `page.js`, `style.css`, strict CSP with `connect-src 'none'`) and a pure model (`timeline.js`, `describe.js`) that
let you scrub a SAVED run timeline backward and forward and check that every displayed state is what the recorded entries say:

- `timeline.js` `build(saved)` gives the ordered, position-addressable timeline with its LIMITS. `stateAt(i)` is the **C044 `reducer.js`
  (the reducer the live console uses; imported read-only and pinned) folded over recorded entries 0..i**: never a second formula. A
  position is an entry of the recording (a delivery, a typed failure or a session action), so duplicates, drops and refusals are positions too.
- Scrubbing is **path independent**: states are one immutable forward scan, so any walk of forward, backward and jump moves shows the
  same state object for the same position (`tests\exhaustive.test.cjs`). `verify(saved)` recomputes every position in an independent forward
  pass and compares state, mark, tallies, flags and marks; the page shows "Verified: N of N positions" and `VERIFICATION FAILED at N positions` otherwise.
- **Nothing it returns can be changed and nothing the caller holds is aliased.** `build` copies the entries, the source and the producer into private,
  deeply frozen objects (iteratively, within a budget of 200,000 nodes), never freezes or touches the caller's objects, and every answer, flag set, mark list,
  limit and hit list is frozen (`tests\aliasing.test.cjs`). Data that is not plain (a function, a Date, a Map), a cycle, a hole in an array or an oversized
  structure is a typed refusal (`SAVED_RUN_NOT_DATA`, `SAVED_RUN_CYCLIC`, `SAVED_RUN_SPARSE`, `SAVED_RUN_TOO_LARGE`), anything else that throws while the data is read is
  `SAVED_RUN_UNREADABLE`, and producer metadata that the recording exceeds is `PRODUCER_INCONSISTENT` (`tests\totality.test.cjs`).
- A position outside the recording (`-1`, the length, `NaN`, `1.5`, a string, `null`) is a typed `{ ok: false, code: 'NOT_RECORDED' }`
  with no state. A run sequence number is looked up with `locate(epoch, seq)`: recorded ones give their position, a sequence inside a gap, before
  the first or after the last recorded one is `NOT_RECORDED` with its exact range. The page never shows the nearest state instead.
- LIMITS are shown, never interpolated: the recorded window per epoch, what is NOT recorded (exact ranges), epoch changes, dropped duplicates and
  out-of-order deliveries (counted and marked, never shown as new events), failed entries (FAILED), unknown events, entry types and failure codes
  (UNKNOWN), a truncated recording (INCOMPLETE with the known total) and, for a C034 trace, each attempt's decoder classification.

## The ten saved runs (inputs, read-only; `saved.js` is generated by `tests\build-saved.cjs` and unchanged)

| id | kind | what it shows |
| --- | --- | --- |
| `c044-restart-gap` | console | 44 entries: an expired window (typed `CURSOR_EXPIRED`, resync, a true gap of sequences 10 to 12), three replayed duplicates, a restart (epoch 1 to 2, typed `CURSOR_EPOCH_MISMATCH`), recording ends at 8 of 22 (INCOMPLETE) |
| `c044-complete` | console | one complete run of 22 events, COMPLETE |
| `c044-truncated` | console | cut off at 15 of 22 events: INCOMPLETE with the known total visible |
| `c044-hostile-mix` | console | fictional hostile set: tampered data, unknown event type, out-of-order and reordered deliveries, a duplicate, a malformed id, a foreign run, an unknown entry type and an unrecognised failure code |
| `c034-closed-history` | trace | the accepted C034 saved trace: six attempts, 3 observed, 1 failed (HTTP 404), 2 unknown (stop, reset) |
| `c034-held-snapshot` | trace | the accepted C034 held attempt that never finished (INCOMPLETE) |
| `c034-reordered`, `c034-truncated`, `c034-tampered`, `c034-unknown-code` | trace | fictional hostile copies the accepted C034 decoder REFUSES: the page shows the typed code and no timeline |

## The page

Choose a saved run (no default success) and Load, or open `index.html#run=<id>&pos=<n>`. `#status` (`aria-live`) announces every move, for
example `Position 18 of 44: step 12 of 20 completed; 1 failed event so far`.

| control | effect |
| --- | --- |
| slider (`role="slider"`, labelled, `aria-valuetext`) | Left or Down -1, Right or Up +1, Page Down -10, Page Up +10, Home first, End last (Alt, Ctrl and Meta combinations are left to the browser); a move that would leave the recording is a typed `NOT_RECORDED` and nothing changes |
| Previous event, Next event | one position |
| Previous or Next gap, failure, unknown, epoch change | the exact previous or next position of that kind, or a message that there is none |
| Epoch, Sequence, Find sequence | a recorded sequence moves there; any other is `NOT_RECORDED` with its exact range |
| state panel, producing entry | the reducer state at this position (16 lines for a console run, 7 for a trace) and the entry that produced it, with a text label (APPLIED, DUPLICATE, FAILED, UNKNOWN...) |
| limits panel, entry list | every limit of the recording; every entry is listed once from the model's marks, failed and unknown ones carry a text label (not colour alone) and can never disappear |

Every malformed, unknown, repeated, oversized or script-like fragment the tests try (`tests\page.test.cjs`, `properties.test.cjs`, eight more in real Edge) shows a typed refusal (`FRAGMENT_*`, `RUN_UNKNOWN`, `POSITION_INVALID`), is not echoed by the page
and does not throw; that is a tested set, not a proof for every possible string. While a position is displayed the address is restored to it (`history.replaceState`); with nothing displayed (a fresh load of a hostile fragment)
there is nothing to restore it to, so the fragment stays in the address, still never echoed (`tests\page.test.cjs` F9). A position outside a recording is `NOT_RECORDED`;
a refused run unloads the display (`assertUnloaded`). `prefers-reduced-motion` removes the bar transition. Recorded text is clipped to printable ASCII and shown with `textContent` only.
## Commands (repository root, PowerShell 7, Node 22; give every command a hard timeout; every `<scratch>` is a directory that does not exist yet, outside the repository, with a short path)

```powershell
# F1 RED: the FIRST publication's ten suites in a scratch tree whose other-namespace files are the accepted LF blobs (exit 1: 70 tests, 2 fail)
node capability\X001\tests\fresh-tree.cjs <scratch> lf --own-from 368332e2a881b54db780404d86635539317450bd
# F1 GREEN: the working tree in the LF tree and in the CRLF (owner tree) form; every test passes in both
node capability\X001\tests\fresh-tree.cjs <scratch> lf
node capability\X001\tests\fresh-tree.cjs <scratch> crlf
# F2, F4, F6, F7 RED: the frozen model RED on the first-publication bytes with the reviewer mutant B12 (exit 1: 7 tests, 7 fail), from a scratch working directory
$env:X001_BASE_MUTANTS = 'B12'
node capability\X001\tests\run-in-scratch.cjs <scratch> --require .\capability\X001\tests\base-shim.cjs --test --test-concurrency=1 capability\X001\evidence\fix\red\model.red.test.cjs
# F3, F5 RED: the frozen display RED with the reviewer mutants D1 D2 D6 D7 P12 (exit 1: 26 tests, 5 fail)
$env:X001_BASE_MUTANTS = 'D1,D2,D6,D7,P12'
node capability\X001\tests\run-in-scratch.cjs <scratch> --require .\capability\X001\tests\base-shim.cjs --test --test-concurrency=1 capability\X001\evidence\fix\red\display.red.test.cjs
Remove-Item Env:X001_BASE_MUTANTS
# the same two RED files unchanged against the final code (exit 0, 33 of 33; also replayed by tests\red-replay-fix.test.cjs)
node --test --test-concurrency=1 capability\X001\evidence\fix\red\model.red.test.cjs capability\X001\evidence\fix\red\display.red.test.cjs
# the first-publication RED and its replay through the shim (unchanged: exit 1 with 14 tests of which 13 fail, then exit 0 with 14 of 14; L-0121)
node --test --test-concurrency=1 capability\X001\evidence\red\timeline.red.test.cjs
node --require .\capability\X001\tests\green-shim.cjs --test --test-concurrency=1 capability\X001\evidence\red\timeline.red.test.cjs
# GREEN: the whole non-browser suite (the figures block below states the number of tests)
$f = Get-ChildItem capability\X001\tests -Filter *.test.cjs | ForEach-Object { "capability\X001\tests\$($_.Name)" }
node --test --test-concurrency=1 @f
# per-file 85/85/85: ONE L-0004 command per production file (heavy slot); run it directly, never under node --test
node capability\X001\tests\coverage.cjs
# systematic mutation self-check, one run per file (see the limits for the scope): the recorded capture mutants-1 used exactly the first command with 4 workers
# (and --live <file> to follow survivors while the recorder was still running); needs the acorn of the Node binary, the tool restarts itself with --expose-internals
node capability\X001\tests\mutants.cjs <scratch> --workers 4 --timeout 900 --files describe.js --skip string,template,initializer,arrow,not,number --lines describe.js:1-9999 --literal-lines describe.js:40-87
# the same for page.js (the UNRECORDED exploratory run: 265 mutants, 18 alive, exit 1)
node capability\X001\tests\mutants.cjs <scratch> --workers 4 --timeout 900 --files page.js --skip string,template,initializer,arrow,not,number --lines page.js:1-9999
# the baseline alone (the ten suites unmutated, under the same minimal runner; zero mutants): every suite must say passed (mutants-1 does this first)
node capability\X001\tests\mutants.cjs <scratch> --workers 3 --files describe.js --skip string,template,initializer,arrow,not,number --limit 0
# every mutant the generator knows (2,584 for the three files without a scope), without running anything
node capability\X001\tests\mutants.cjs --list
# real isolated headless Edge (heavy slot); CAPTURE_BROWSER_EVIDENCE=1 appends one evidence directory
node capability\X001\tests\browser.cjs
```

## What the tests prove

- `evidence\red\timeline.red.test.cjs` (first publication, 14 tests, 13 fail against the naive stub) and `evidence\fix\red\model.red.test.cjs` and `display.red.test.cjs` are the specifications as executables; the fix REDs are
  replayed both ways by `tests\red-replay-fix.test.cjs` (they fail on the frozen first-publication bytes served by `tests\base-shim.cjs`, byte-identical to commit `368332e2a881`, and pass unchanged on the final code).
  The display RED passes on the unmutated first publication (its display was right, the oracle was weak), so it is a mutation RED and says so.
- `tests\timeline.test.cjs`, `describe.test.cjs`, `guards.test.cjs`: every refusal, mark, limit and wording; the decoder cross-check; injected reducers and decoders; the caps and bounds.
- `tests\aliasing.test.cjs` (F2), `tests\totality.test.cjs` (F4, F6, F7 and counters: the work is linear and counted, never timed; a 64 MB heap is enough for every hostile size).
- `tests\exhaustive.test.cjs`: every saved run x every position x every move at the model and in the rendered DOM; `tests\properties.test.cjs`: 2,800 random steps (4 seeds) with the recovery operations and the global invariants after every step.
- `tests\page.test.cjs`, `surface.test.cjs`: the real `index.html` ids and script list under a DOM stub in a vm context (network and timer stubs throw), strict CSP, no inline script, every element id classified and perturbed
  (the oracle notices a change of each compared one), the F5 injected failing verify, the F9 fresh hostile fragment, `X001-fix.feature` with one scenario per finding.
- `tests\imports.test.cjs`, `pins-form.test.cjs`: `imports.json` pins of the 16 accepted files recomputed against git, accepted raw or LF-normalized; one changed byte, mixed endings and a forged pin are refused.
- `tests\browser-cleanup.test.cjs`: the REAL `tests\browser.cjs` runs in a child node whose two collaborators (`qualifyEdge`, `openIsolatedLesson`) are fakes; a rejected page call and a failing assertion after the session opened each close the session
  exactly once and still fail the run, a failing qualification closes nothing (no session exists), and a copy of the harness without its `finally` cleanup leaves the session open (the negative control that makes the check discriminate). No browser starts in this test.
- `tests\claims.test.cjs` (F9): the browser summary pins every source the harness loads and the README says what the page does with a refused fragment, each checked on the git blobs of the first publication (where it reports the defect) and on the final files.
- `tests\evidence.test.cjs`, `evidence-figures.test.cjs`: see Evidence.
- `tests\mutants.cjs` (see the limits for its scope): every statement and every single condition mutated, one source range at a time, in a worker thread with its own module graph; `tests\killers.test.cjs` names the 7 describe.js mutants the campaign found alive (wording tables frozen, limit lines only when such deliveries exist, step and of both needed) and `tests\mutant-list.cjs` proves 4 equivalent.

## Real Edge observation

`tests\browser.cjs` calls `testing\browser\qualify` `qualifyEdge()` once (valid Microsoft signature, qualified major; the actual version, path and SHA-256 are recorded, nothing is pinned by equality), opens `index.html` through the unchanged helper
`openIsolatedLesson` (fresh headless Edge, closed in `finally`) and reads the REAL DOM after every action through `tests\browser-dom.cjs`: `assertShown` runs unchanged on it, so all 16 or 7 state lines, the rows, the buttons, the scrub bar, the limits
panel and the provenance are compared with the independent fold in Edge too. The checks (their number, the positions and key actions are in the figures block): every position of every valid run forward and backward by keyboard and every jump target, a keyboard-only jump and sequence lookup, eight hostile fragments
(nothing executed, no dialog, no page error), a refused run that survives a reload, zero fetch/XHR/EventSource/WebSocket calls with only `file:` requests, CSP probes and the reduced-motion media query.
The capture is `evidence\fix\browser` (a summary that pins the ten sources the harness loads, a DOM snapshot and the run's transcript, which prints the digests of both). `tests\browser-cleanup.test.cjs` proves that the session is closed in `finally` when an assertion or a page call fails.

## Evidence and integrity

- `evidence\red`, `evidence\green`, `evidence\coverage`, `evidence\mutants`, `evidence\browser` are the first publication's archive: never rewritten (`tests\evidence.test.cjs` compares every one of its 23 files with the git blob of `368332e2a881`) and
  its manifests are checked against the blobs of that commit, not against the working tree that the fix changed.
- `evidence\fix` holds the new archive: `base` (the three first-publication production files, frozen), `red\run-1` to `run-3` with the frozen RED files, then the captures of the final bytes made by the shared recorder
  (`archive-run.cjs`: command, exit code, input SHA-256, raw gzip transcripts), one manifest each: `mutants\mutants-1` (see the limits for its scope; the baseline of the unmutated suites is part of it), `coverage\coverage-1`, `browser\browser-run-1` (with its evidence
  directory), `green\green-suite-1` to `-3`, `green-suite-load`, `fresh-tree-lf`, `fresh-tree-crlf` and, made LAST, `green\green-suite-final`. Each manifest pins what its run loads: the mutation, coverage and browser captures pin the production files, the suites
  and helpers they load and the accepted files (a narrower list, so that later work on the evidence checks and the README does not invalidate them); the green and fresh-tree captures pin every non-evidence file of the namespace except this README; `green-suite-final`
  pins every non-evidence file including this README. Files of other namespaces are pinned by their LF-normalized hash, own files by raw bytes; a foreign file that a scratch tree does not hold is checked against the blob of the commit its namespace was accepted at (`acceptedBlob`).
- `tests\evidence-figures.test.cjs` RECOMPUTES every figure from the stored transcripts and the DOM snapshot (test counts from the TAP footer, coverage from the Node rows, mutation counts from the list of mutants, `positionsChecked`, actions and
  `edge.version` from the printed line and the summary, the 44 rows and 16 state lines of the snapshot) and compares the README block below; a tamper test per figure fails by name.
- A CONSISTENT rewrite of a verifier together with its manifests and pins is detected only by the published commit and tag (L-0096); no test in this namespace can detect it.

## Honest limits

- MUTATION SCOPE (recorded). The generator knows 2,584 mutants for describe.js, page.js and timeline.js (`--list`). The one recorded campaign is `mutants-1`: describe.js, every statement and every single condition of the whole file plus every string, template, initializer, arrow-body, negation
  and number mutant of the displayed-state code (lines 40 to 87): 351 mutants, 347 killed by a named test (298 by `describe.test.cjs`, 42 by `page.test.cjs`, 7 by `killers.test.cjs`), 4 equivalent with a one-line proof in `tests\mutant-list.cjs`, 0 survived, 0 timed out, with the nine
  suites checked unmutated first (the baseline). The reviewer mutants D1, D2, D6 and D7 are in it and killed. A run that exceeds `--timeout` (900 s here) is reported as TIMEOUT, which is undecided and fails the campaign.
- MUTATION NOT RECORDED. page.js: an UNRECORDED exploratory run of the same tool (265 statement and condition mutants, 505 s) killed 247 and left 18 alive, none fixed in this commit: lines 11 (freeze of the key table), 95, 107, 110, 121, 123, 127, 134 (two operands of `|| {}`, probably equivalent
  like describe.js line 34), 152, 154 (three operands and the whole condition), 156 and 192 (`<` to `<=`); the reviewer mutant P12 is killed by `tests\page.test.cjs` F5 and by the archived RED run-3, but page.js has no recorded systematic campaign. timeline.js (1,008 statement and condition mutants and 438 others)
  has none either: `own()` and `verify()` were run once, unrecorded, before the final tests (456 mutants of describe.js 63 to 87, page.js 42 to 87 and timeline.js 54 to 93 and 336 to 364, 35 survivors, all killed or proven equivalent then) and the reviewer mutant B12 is killed by `tests\totality.test.cjs` F4 on the
  first-publication bytes (RED run-2). Also not run: the string, template, initializer, arrow-body, negation and number mutants outside describe.js 40 to 87 (about 1,180) and saved.js (generated data, protected byte for byte by the provenance test). The first publication's chosen list (85 mutants) stays archived.
- HOW THE CAMPAIGN WAS RUN. A first run of `mutants-1` at BelowNormal priority (the run's rule for background CPU use) was starved to 2 to 4 percent of a core on the saturated machine (8 mutants per minute, 62 minutes) and its old rule "a run that exceeds 120 s is killed" counted 28 UNDECIDED mutants as killed;
  a recheck at normal priority showed 11 of them alive. That run was discarded (not evidence), the 11 are killed by `tests\killers.test.cjs` or proven equivalent, the tool reports TIMEOUT as undecided, and the recorded `mutants-1` ran at normal priority with 4 workers (389 s) inside this agent's own heavy-slot window.
- The campaign needs the acorn inside the Node binary (`node --expose-internals`, 8.16 here) and replaces `node:test` by a minimal runner (`test(name, fn)` and `t.diagnostic`, which is all the suites use); suites that need git
  (`evidence`, `imports`, `red-replay`, `red-replay-fix`, `pins-form`-style tamper checks) are not in the campaign.
- FRESH TREES are built from the accepted blobs of the pinned commits. `git archive HEAD` on a machine with `core.autocrlf=true` gives CRLF for the files without a text attribute and LF for the five `eol=lf` files (checked once: 8 of
  the 16 differ from the LF blobs); that mixed tree is covered by accepting either form per file (`pins-form.test.cjs`) but was not run as a third tree.
- The first publication's `Honest limits` that still hold: synthetic recordings scripted at build time, a counting fold for C034 traces cross-checked against the accepted decoder (a trace position is not "the decoder at position i"), at most 500 entries
  per run, the page loads the accepted scripts of C020, C033, C034 and C044 by relative paths (the pins detect changed bytes, not a moved file), `history.replaceState` keeps one history entry, one machine and one headless Edge (qualified major only,
  no screen reader, no other browser), the hostile sets are fictional constructions and not a complete fuzz of the C044 reducer.
- F8 and F9 have no archived RED: the first publication had no figure check to run a tamper test through (F8: `evidence-figures.test.cjs` and the README-byte case of `evidence.test.cjs` are the proof), and F9 is a differential test in the suite (`tests\claims.test.cjs` reports both defects on the first-publication blobs), not a recorded run.
- Not run: three consecutive runs in a 64-run, 8-way loop of the resource tests (the totality suite with its 64 MB heap ran in every green capture and in two more unrecorded whole-suite runs), the mixed `git archive` tree, and the reviewer's real-Edge probe p10 and tamper battery p9 against the final tree.
- `own()` accepts plain data only (objects with the standard or no prototype, arrays, primitives); a saved run that carries a Date or a Map is refused, not converted.

## Decisions (recorded as hints)

A position is an entry of the recording, so drops and refusals are visible positions. A move that leaves the recording is a typed refusal rather than a clamp. The URL fragment is `#run=<id>&pos=<n>` with `pos` 1-based as shown; `stateAt(i)` is 0-based.
The returned `entries` are private frozen copies, so `timeline.entries[i]` is deep-equal to, never the same object as, the caller's entry. Shared structure in a saved run is copied per occurrence, so a structure that expands exponentially is refused by the node budget.

<!-- figures:begin -->
status: figures are recomputed by tests\evidence-figures.test.cjs from the captures of evidence\fix; a figure without its capture, or a capture whose figure differs, fails that test
suite.tests: 124
fresh-tree-lf.tests: 124
fresh-tree-crlf.tests: 124
coverage.describe.js: 100 / 99.07 / 100
coverage.page.js: 100 / 99.06 / 100
coverage.saved.js: 100 / 100 / 100
coverage.timeline.js: 99.74 / 100 / 98.88
mutants-1.files: describe.js
mutants-1.generated: 351
mutants-1.killed: 347
mutants-1.equivalent: 4
browser.checks: 12
browser.positionsChecked: 351
browser.actions: 334
browser.edge: 156.0.4314.58
<!-- figures:end -->
