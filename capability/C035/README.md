# C035 — honest local result classifier

**Training rehearsal - synthetic data - not a live Azure result**

One ORIGINAL **C035 / D / P0 / H001**, parents **H001/H007/H012**.
The exact kanban entry and independently accepted **C015 + C029 Done** gates
are checked read-only. Only parent acceptance awards this one original credit.
Tests, repairs and repeated observations earn zero extra credits.

## Use it

Open `index.html`. Choose an explicit source, Tab to **Inspect originals**, and
press Enter. Space also activates buttons. Inspect each original's classification,
immutable budget, terminal evidence and six required dimensions: **context,
schema, timing, state, terminal, provenance**. Compare retry or cancellation
controls without repairing originals. Reset returns focus to the source selector.
CSP blocks connections, inline scripts, forms, workers, objects and frames.

The browser uses the unchanged **bundled HISTORICAL** C015 public-restore
observations and accepted C029/C034 source. It does not read current disk, start
work, cancel anything or claim authenticated current association.

```powershell
node capability\C035\cli.cjs context
node capability\C035\cli.cjs inspect closed-history
node capability\C035\cli.cjs inspect held-snapshot
node capability\C035\cli.cjs inspect modeled-unsupported
node capability\C035\cli.cjs inspect modeled-cancel-request
node capability\C035\cli.cjs inspect modeled-cancelled
node capability\C035\cli.cjs compare retry
node capability\C035\cli.cjs compare cancellation
node capability\C035\cli.cjs copy closed-history | node capability\C035\cli.cjs inspect-copy closed-history
```

The CLI actually rereads the fixed known C015 fixture using its unchanged
public `restore`, closed-record validator and original C002 envelope. Current
literal consent and accepted gates are reread under **State**; handles close
before release. The receipt includes its PID and read timestamps, zero writes,
and the real current run/epoch/record. This is a separate **as-of Node read**,
not attribution of historical clients or fictional controls to that run.
There is no caller-supplied context, approval, identity, path, budget or authority.

Exit codes: **0** scoped PASS (or a successful context/copy inspection operation,
not work mutation), **1** FAIL, **2** UNKNOWN/HOLD, **3** rejected/unavailable
input, source or context. Only closed operations and identifiers are accepted.

For retained CLI history, use a single bounded NDJSON session:

```powershell
@'
{"type":"inspect","id":"modeled-cancel-request"}
{"type":"inspect","id":"closed-history"}
{"type":"reset"}
{"type":"inspect","id":"modeled-complete"}
'@ | node capability\C035\cli.cjs session
```

The latest fictional positive cannot erase the retained **FAIL** or earlier
UNKNOWN. History is memory-only within this CLI process or loaded page, bounded
at **16 classification/error entries**. Overflow refuses rather than dropping
entries. Reset clears presentation only; it cannot free history or mutate work.
A standalone `reset` starts a fresh CLI presentation, not a stored-history reset.
No new application storage or history-import authority exists.

## What the results mean

- **FAIL has precedence.** A known original timing/state violation remains FAIL
  even with unknown dimensions, unsupported labels, cancellation evidence, a new
  attempt or hypothetical recovery. Missing required dimensions remain explicit
  UNKNOWN and prevent completion. Deadline equality fails, not just exceeding it.
- **UNSUPPORTED**, **UNKNOWN**, **INTERRUPTED**, and **CANCELLED** are distinct.
  Their verifier/classifier outcomes are not user mutation success. PASS is only
  complete evidence within the named local segment or fictional control; every
  result separately denies full-journey, native, reliability and live eligibility.
- Actual C015 stores only **prepared/running/completed** closed records. It has
  **no cancellation record, command or cancel terminal acknowledgment**. C017 is
  **NOT DONE**; no native/auth/lease/worker-queue authority is inherited.
- A cancellation **REQUEST** without a matching required terminal acknowledgment
  is **UNKNOWN/HOLD**. HTTP 200, process absence, retry, cleanup or a new attempt
  never substitutes for that acknowledgment.
- Positive cancellation controls use **MODELED fictional terminal receipts** and
  IDs starting `MODELED-`, not actual C015 stored/native cancellation. They show
  cancelled work, not completed work. No effects remain **UNKNOWN** unless a
  separate explicitly fictional zero-effect receipt is present. Neither proves
  actual no-effects, external undo or cleanup; those claims always remain denied.
- Unchanged C029 closed historical evidence retains **7 originals = 2 bounded
  local-segment PASS + 2 FAIL + 3 HOLD**. Originals 3/4 retain their original
  deadline/state failures; 5/6 are explicitly interrupted; summary-only 7 stays
  unknown. Earlier held evidence has only its two observed originals, not later
  replacement details. These are historical client/local segments, not full
  journeys or correlated C015 current work.
- C029's C023 event-log results remain a **mathematical MODEL**, assuming its
  atomic application/deduplication pair. No actual queue, durable/external effect
  or client association is invented. Model state completion without latency
  remains HOLD; original interrupted failures and unknowns survive recovery.

**Exact JSON copy inspection** accepts only agreement with the internally
selected immutable source. Duplicate/escaped duplicate fields, unsafe/nonfinite
numbers, malformed/oversized/deep data, non-own fields, unknown enums, altered
history, and forged eligibility/context/authority reject visibly. Submitted data
is never adopted. Rejection retains the selected known originals and their
FAIL/UNKNOWN dimensions rather than laundering them into a replacement unknown.
Counts are originals and required dimensions, never healthy response counts.

## Verification and retained evidence

```powershell
node --test --test-concurrency=1 capability\C035\tests\initial-red.test.cjs capability\C035\tests\classifier.test.cjs capability\C035\tests\input.test.cjs capability\C035\tests\session.test.cjs capability\C035\tests\source.test.cjs capability\C035\tests\surface.test.cjs capability\C035\tests\authority.test.cjs capability\C035\tests\transport.test.cjs
node capability\C035\tests\syntax.cjs
node capability\C035\tests\browser.cjs
node --test capability\C035\tests\integrity.test.cjs
node capability\C035\tests\verify.cjs
```

Focused GREEN: **77 tests**, including real process-only transport restoration.
Actual signed **Edge 156 / offline Playwright 1.56.1 / Node 22** verification has
**18 DOM checks**: unknown/error, original failures, partial, unsupported,
interrupted, cancellation scope, retry, copy tampering, reset/history/focus,
CSP and exact awaited cleanup. Only the unchanged published
`testing\browser\isolated.cjs`, SHA
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
opens the sandboxed browser. Existing accepted C033/C036 signature and exact
caller-owned process/profile inspectors are reused unchanged and pinned.

BDD preceded the loadable stub and genuine **two-assertion RED**: incomplete
and cancellation-request evidence incorrectly passed. Its exact source and
original raw failure remain reproducible:

```powershell
node capability\C035\evidence\red\replay.cjs
```

The first real Edge run failed its diagnostic assumption that the browser
profile was inside the helper session. It completed **zero DOM checks**.
Browser/profile/owned-process closure was observed, but helper-session removal
was **unverified** in that failed run. Those false/unverified fields remain
unchanged. The corrected runner separately passed 18 checks and verified all
four cleanup observations; it does not retroactively repair the failure.

Normal verification changes no owned source/evidence/dependency bytes or
listings. It only uses the approved helper's unique scratch, awaited in finally.
No C015 test writes/setup are needed. `imports.json` independently pins working
raw, CRLF-to-LF, and accepted Git bytes and reuses C029's original source pins.
`evidence-index.json` retains all original raw captures, RED and failures.

Only exact deliberate capture appends uniquely owned raw proof, never refreshes
or replaces history:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C035\tests\record.cjs browser }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

Raw stdout/stderr and DOM bytes are gzip-preserved without line-ending cleanup.
The immutable index is created once by guarded `tests\finalize.cjs`; normal
integrity checks only read it and validate later unique capture additions.
Early raw recorder metadata's `sourceAndDependencyWrites: 0` refers to unchanged
imported sources, not zero owned capture writes: pin/tool capture deliberately
created the owned pin artifacts. Those original records are preserved; the
recorder now names that boundary explicitly.

## Publication boundary

Publication rereads **top-level current** `localPublisherAuthorization` under
State, closes before Publisher, and checks its separate
`classificationAndInspectionRevision`: exact four new classes, **61 guards**
and exact four-token stripping to the historical `60ae…` predecessor. The
recognized actual `2caba…` bytes are rechecked **under Publisher** immediately
before standard delegation. An unknown new hash/revision fails closed; neither
an old digest nor a nested older revision is treated as current authority.
Normal source verification never promotes historical publication hashes.

The unchanged standard publisher requires actual HEAD equal actual remote
**before stage**, commits only `capability\C035`, includes the Copilot trailer,
creates annotated `kanban/C035/<12sha>`, atomically pushes main/tag and verifies
peel/ancestry. No ahead carry, reset, amend, force or unowned index cleanup occurs.
The ordinary foreign staged **C048 M** keeps its exact content entry **and flags**.
Actual own raw and Git-canonical proof, full SHAs and counts go to State Report;
only the parent accepts the original.

The approved process-local HTTP/1.1 Git setting is **appended** after existing
count/slots. The actual publishing caller asserts exact **Presence+Value**
restoration in finally, removes formerly absent keys through the Env provider
(never null assignment), and performs a working Git read after restoration.
No global, TLS, proxy or authentication setting is changed.

**IaC N/A.** H001/H007/H012, native cancellation/auth/leases/queues and production
Node 24 remain incomplete. No packages/downloads, cloud, infrastructure, Entra,
credentials, real-user data, deployment, new application storage or spending.
