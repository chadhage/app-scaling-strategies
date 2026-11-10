# C059 — keyboard and programmatic accessibility journey

Local, synthetic and offline only: choose an accepted mounted lesson, conduct one
C042 reserve-capacity step, inspect its explicit result and use the offered
recovery controls. The five production files, HTML, CSS and original import pins
are unchanged from `ea81f6ec59c3a9356827724a6b35ca45b1353d46`. That rejected
publication is **not acceptance**. This private continuation of `worker-C059`
does not apply live files, publish, award credit or accept itself.

## What is checked

- Named controls, logical keyboard order, visible focus, headings and landmarks,
  form-error descriptions, deterministic focus and one polite status region.
  DOM-stub journeys and actual isolated Edge check ARIA semantics, Tab traversal,
  accessibility snapshots, reduced motion and reflow. **No NVDA, JAWS or Narrator
  run is claimed.** The checker is page-specific, not a general accessibility
  auditor; its accessible-name computation is simplified.
- Every answer is validated, bound to its request and re-derived from facts.
  Success is not inferred from transport completion. The real browser helper
  allows GET/HEAD only: Node sockets and the server-produced transcript prove
  POST/recovery effects. Browser POST failures are deliberate, not native
  browser write-transport validation.
- The service binds only IPv4 loopback on port 0. Read-only imports retain their
  original raw, LF-normalized and accepted Git-blob pins. C041 and C042 are not
  edited or silently repinned.
- One per-connection lane serializes requests. A refusal drops waiting work;
  its answer closes the connection. Parser errors answer immediately and may
  discard an earlier response that was not written. A reset during a flood can
  also discard a flushed answer: flood checks use structure, not a client-side
  count of surviving answers or an absolute latency.

The shared refusal table is imported, not copied: **20 rows** (400 x7, 405 x5,
404 x3, and one each of 421, 403, 414, 415, 413). Node-own 417, missing Host,
parser errors and asynchronous refusals add separate cases.

## Review closure

**D1.** `tests\queued-cancel.test.cjs` has 142 individually named assertions:
18 parser-error rows and 29 lane-refusal rows, each in a same-write completed-GET
shape, a same-write gated-step shape and a later-write gated-step shape, plus
the table-inventory assertion. The later write waits until both earlier requests
were observably parsed. Connection A holds a step through an executor gate;
B queues a **bodyless cancellation of A's step**. After B closes, a third
connection and event-loop turns form an absence barrier. A must still answer
201 and succeed; lease commitment and journal count equal only the deliberately
completed steps. Framing rows that cannot parse a following cancel are named,
asserted controls, not early-return passes. The original 52-test victim family,
including its request-timeout row and no-refusal controls, is preserved.

The exact mutant deletes only `decide(socket);` at the top of
`refuseMalformed()`. Node caches `remoteAddress`, so destroy alone cannot stop a
queued cancel. The new family produced a genuine **142-test RED: 54 named
ERR_ASSERTION failures, 88 controls/lane passes**, with no timeout or module
failure, before its mutation declaration was corrected. The same test bytes
pass on real unchanged production. The old false equivalence is removed.
The `handle()` defence-in-depth check stays removed.

**D2/D3.** All 246 original mutants plus the retained R5 extension are retained:
247 total. A causal kill requires a named assertion/thrown test error with
complete TAP counters; a timeout, crash or whole-file failure alone is
undecided. The per-test cap is **900000 ms**, with two workers at normal priority.
Each file run now retains separate raw stdout/stderr gzip streams and counters.
Every mutant records equal pristine/restored tree digests, with restoration in
`finally`. Identity controls must replace identical bytes. Current runnable
demonstrations execute on the real server/checker in GREEN and on the corresponding
mutated tree in the campaign:

- S5: `tests\node-close.test.cjs`, Node closes a response carrying
  `Connection: close` without an explicit destroy callback.
- `checkContinue`: `tests\node-equivalence.test.cjs`, three gate-controlled
  cases show Node buffering a queued interim answer behind the earlier response.
- `closeServer`: the same file closes idle, partial and active connections with
  two owners, FIFO/LIFO, repeated close and an unrelated live neighbour.
- Empty composite: `tests\empty-widget-equivalence.test.cjs`, zero tab stops
  still refuses the empty group; the populated control remains clean.

Two identity controls need no platform claim. Final **actual** killed,
demonstrated-equivalent, identity, survivor and undecided counts are derived from
`evidence\raw\mutgen-report-10.json`, never inferred from load or an exit alone.
`tests\mutation-policy.test.cjs` reclassifies the stored raw TAP. Its genuine
pre-correction RED was four named assertion failures on an actual old-generator
run; that generator/report and all failed attempts are preserved.

**D4: actual F24 figures, with provenance.** The original worker's immutable
`f24-1` measurement consumed the same current production/tool bytes: 32 accepted
pending sockets, 3,450 parsed requests each, **193.3 MB live heap, 5.9 MB per
socket, 266 MB RSS**, all sockets closed, a legitimate GET 200, and 6.0 MB heap
after release. These are retained observations, **not observations made by this
continuation**. The reviewer independently measured 193.3 MB heap and 280 MB RSS.
The current source-frozen run is `f24-2`; its actual values are derived in the
final audit and [current measurement report](evidence/final/README-F24.md).
Reproduce the measurement (a tool, never part of the test suite):

```powershell
node capability\C059\tests\f24-measure.cjs 256 32 50000 hold
```

Node consumes a whole approximately 64 KB read before JavaScript can cut it.
Pending requests therefore retain about 6 MB **per socket**, bounded here by the
32-connection cap, not by the flood test's 48 MB child. It was not measured at
128 sockets. A smaller cap or a larger process heap is the available knob; no
JavaScript pre-parser mitigation is claimed.

**D5.** `tests\identifier-inventory.test.cjs` scans **every namespace file**,
including unchanged production, unchanged historical evidence and decoded gzip
transcripts. Historical findings remain explicitly reported and are allowed only
when their entire bytes equal the named retained Git blob. A changed historical
file receives no exemption. Planted text and gzip findings are found by name.
This closes the earlier changed-files-only scope.

**D6/D10/D11.** `green-7`'s immutable purpose text incorrectly says its flat TAP
contains per-file times: **it does not; only the total is known**. This is the
append-only correction, not an edit of that raw history. New GREEN purposes
describe only their actual contents. Server branch coverage is not a constant:
the same production bytes previously measured **93.37–94.02%**; final actual
coverage is read from `coverage-10`, with 85/85/85 required separately for every
one of the five loaded production files. The refusal-table count above is 20.

## One final source phase, then evidence

`evidence\final\source-freeze.json` enumerates namespace source, immutable old
evidence, read-only producers, browser helpers and private execution machinery.
No subsequent source edit can be hidden by a stale success. Captures pin their
executed inputs. The existing shared recorder is invoked **unchanged**; an
append-only private transport amendment changes only physical input prefixes to
logical paths. The original recorder manifest and raw streams remain available;
tests reject an altered original, observation or input hash.

The complete gate is:

```powershell
node capability\C059\tests\final-evidence.cjs --complete
```

This requires actual current REDs, five per-file coverage rows, all causal
mutants, the 20 x4 loop under four owned burners, F24, real signed/qualified Edge
157, injected-failure cleanup, whole GREEN and both fresh-tree forms. Until that
command exits 0 this is not a complete private delivery. It is not independent
acceptance even when it passes.

Run the whole non-browser suite, with no mutable index or HEAD dependency:

```powershell
$tests = Get-ChildItem capability\C059\tests -Filter *.test.cjs |
    ForEach-Object { $_.FullName }
node --test --test-concurrency=1 --test-timeout=900000 @tests
node capability\C059\tests\coverage.cjs
node capability\C059\tests\mutate-gen.cjs --scratch mutation-work\full --out capability\C059\evidence\raw\mutgen-report-10.json --workers 2
node capability\C059\tests\flood-loop.cjs 20 4 4
```

Coverage is one command per enumerated production file, not one aggregate
threshold. Source helpers under `tests\` are test-only. Take one shared heavy
slot for heavy runs and one normal mutation slot for the campaign; do not overlap
this worker's captures. Refresh only owned locks and never reclaim a foreign
stale lock.

Only **after private GREEN**, through the unchanged sealed isolated helper and
current append-only qualification data:

```powershell
node capability\C059\tests\browser.cjs
node capability\C059\tests\browser-cleanup.cjs
```

The installed version/hash are observations, not equality pins. Sessions,
listener and owned opaque profiles close in `finally`; an injected assertion
demonstrates cleanup. No qualification edit, browser install or real profile is
authorized.

Fresh trees use an explicit recorded Git reference, read-only `GIT_DIR` for
accepted blobs, and owned new `fresh-work` folders:

```powershell
node capability\C059\tests\fresh-tree.cjs fresh-work\lf lf --ref bda60d34fe62e9176594519f18cca6051495e64b
node capability\C059\tests\fresh-tree.cjs fresh-work\crlf crlf --ref bda60d34fe62e9176594519f18cca6051495e64b
```

Run the whole suite in CRLF. In LF run the service-free checker, journey, page,
flow, tamper, page-bind, page-kill, bind-null, keyboard, property, pins, node-close,
classification, identity/declaration and inventory suites, plus the two import-pin
assertions of `integrity.test.cjs`. **Inherited C041 Q9 remains:** lesson-asset
pins require raw CRLF assets, so service-starting suites are not claimed green
with LF foreign assets. Original import pins are preserved, not forged.

## Retained observations, not current gate claims

The following block is intentionally historical and recomputed from fixed
retained captures. Current figures are derived by the final audit instead of
editing this source after a measurement.

<!-- figures:begin -->
| Stage | Archive | Figures |
| --- | --- | --- |
| Historical per-file coverage, lines / branches / functions; not a new continuation observation | `coverage-9` | `a11y-check.js` 100 / 99.34 / 99.19; `journey.js` 100 / 100 / 100; `page.js` 100 / 96.75 / 100; `server.cjs` 96.32 / 94.02 / 93.48; `transcript.cjs` 100 / 100 / 100 |
| Historical schema-1 mutation accounting, rejected and superseded; NOT current causal kills or proven equivalence | `mutgen-9` | 246 mutants: 241 reported killed, 5 reported equivalent, 0 other reported survivors, 0 errors; D1 and D2 invalidate those classifications |
| Refusal table of tests\server.test.cjs (read from tests\refusal-table.cjs) | `tests\refusal-table.cjs` | 20 rows: 400 x7, 403, 404 x3, 405 x5, 413, 414, 415, 421 |
| Historical load loop, not a new continuation observation | `loop-4` | 20 runs, 4 at a time, 4 CPU burners: 20 passed; seconds per run (min / median / max): 41 / 52 / 66 |
| Historical isolated Edge, not current installed-runtime acceptance | `browser-13` | 21 PASS |
| Retained RED of the third fix: M2: the pins accept either form | `evidence\red\run-13` | 6 tests, 4 fail against the old subject, 2 pass |
| Retained RED of the third fix: Q3 and Q7: frozen tables, `expected` required | `evidence\red\run-14` | 9 tests, 4 fail against the old subject, 5 pass |
| Retained RED of the third fix: Q1: the refused request itself (mutant S1) | `evidence\red\run-15` | 16 tests, 5 fail against the old subject, 11 pass |
| Retained RED of the third fix: Q2: the connection cap | `evidence\red\run-16` | 6 tests, 3 fail against the old subject, 3 pass |
| Retained RED of this fix: D1: a request queued behind a parse error never runs (mutant: decide() deleted from refuseMalformed) | `evidence\red\run-17` | 52 tests, 20 fail against the old subject, 32 pass |
<!-- figures:end -->

Held evidence remains held with its original limits: K1's 668/668 per-file and
CRLF runs, both executed integrity gates; M2's LF-safe import pins; Q1's named S1
kill; Q2's read-back cap and actual memory observation; Q3–Q6/Q9 and their exact
source bindings. No old capture is relabelled as a new run.

The full original partial README is retained verbatim at
`evidence\final\original-worker-README.md`; its unfinished fifth-worker claims
are historical prose, superseded here, not evidence that a capture exists.
Failed immutable capture attempts remain named:
`browser-1`, `browser-2`, `browser-3`, `coverage-1`,
`coverage-5`, `green-2`, `green-3`, `green-4`, `green-5`,
`mutation-1`, `mutation-2`, `mutgen-1`, `mutgen-2`,
`mutgen-3`, `syntax-2`. Each basename denotes its `.json` manifest and raw
streams. RED run-7, run-8 and run-11 are retained
attempts with the flaws documented by their original integrity suites.

The first private source phase is also retained immutably, outside this current
phase: its `private-green-01` genuinely ran 906 tests, 905 passed and one
ERR_ASSERTION found the `.json`-suffix citation mismatch corrected above.
Its successful mutation, coverage and load observations are **not** counted as
this phase's evidence: the complete phase is rerun after the correction.

The second private phase passed 906/906, then its `browser-14` was refused by the
unchanged helper before launch: a substituted-drive path did not equal its
canonical realpath. That refusal is retained privately and is not browser
acceptance. Browser commands now use the canonical physical candidate working
directory; helper guards, source bytes, qualification and opaque-profile
ownership are unchanged. This complete phase is recaptured after that correction.

The third phase passed all actual behavioral gates, including Edge 157's 21
checks, injected cleanup, 906/906 whole runs, 302+2 LF checks and 906/906 CRLF.
Its final audit then falsely expected an unprinted `major` field. That assertion
and its raw evidence remain immutable in the rejected private phase. The audit
now reads the actual `summary.browserVersion`, with positive and refusal tests
and no historical-build equality pin. All current evidence is recaptured again.

## Not done

- Parser-based mutation over every statement and condition: the campaign is a
  retained list, not exhaustive generation; D1 demonstrates that limit.
- The separate 64 x8 flood/resource campaign: only the required 20 x4 flood loop
  under four owned burners is claimed.
- An oracle comparing every rendered ID, and seeded hostile `validateForm` /
  `present` fuzz with holes, cycles and throwing getters remain follow-ups.
- The inherited C041 LF-asset-pin repair is not authorized in this namespace.
- No production Node 24/Express/Entra/cloud runtime, spend, identity registration,
  real screen reader, native browser POST, h2c, real signal or redirected-folder
  qualification is claimed.
- Consistent malicious rewriting of source, verifiers and their entire metadata
  together is not prevented by self-contained hashes; independent review and
  publication history remain the authority.
