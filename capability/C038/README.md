# C038 — instance, dependency and freshness inspector

**Training rehearsal - synthetic data - not a live Azure result**

Original **S / P0 / LP-REPLAY / H007**, entry independently accepted **C036
`df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e`**. Only the parent may accept this
one original S; tests, repairs and evidence add zero credit.

## Use locally

Open `index.html` directly. Select **single probe**, **Load JSON copy**, then
**Inspect observations**: one HTTP 200 has coverage **1 / 6**, **UNKNOWN / HOLD**.
Choose **failed node**, **stale node**, **partial**, or edit the JSON to inspect
errors. **Select JSON for copy** selects text for Ctrl+C without clipboard
permissions. After two inspections, **Compare last two inspections** shows
distinct originals. Reset clears presentation and returns focus to the picker,
not history or replay protection. All controls support keyboard operation.

```powershell
node capability\C038\cli.cjs list
node capability\C038\cli.cjs context
node capability\C038\cli.cjs inspect single-probe
node capability\C038\cli.cjs inspect complete
node capability\C038\cli.cjs compare failed-node later-fresh
node capability\C038\cli.cjs inspect saved-closed-unlinked
```

Commands accept closed fixture IDs only: no URL, path, user data, credentials,
caller expected context, eligible verdict, status adoption or override.

## Exact local contract — not actual pool health

`model.js` explicitly declares **two fictional nodes**, three required probes
(service, catalog, cache) per node, and the complete dependency inventory with
required-by coverage. Its IDs are not discovered servers. C020 version labels
are imported unchanged; neither these labels nor C036's three fictional tiers
manufacture actual instances, lease ownership or capacity.

Every current node/probe needs its own complete request/response, exact ID,
source, context, C015 namespace/run/epoch/schema/digest, tier, version, dependency
and compatible state. Duplicate probes never fill another node. Incomplete
inventory, omitted dependency/node/probe/request/epoch/source/observation/time
means **UNKNOWN / HOLD**, never a healthy default. Any known failed or stale
required observation blocks readiness even if all others pass. Wrong tier,
version, old epoch, context, replay and caller fields cannot count as current.
The only positive is **CLOSED_SYNTHETIC_READY** for this declared model.
**Actual pool readiness, native freshness, authenticated identity, lease
authority, actual capacity and scaling flags are always false.**

The declared **fictional clock is now 100, TTL 10 ticks**:
`0 <= nowTick - observedTick < ttlTicks`. Age **9** is fresh; age **10** (the exact
boundary) and **11** are stale. A future timestamp, unknown clock, required
missing time or distributed-clock uncertainty holds. The clock cannot be
overridden; no wall-clock/native freshness attestation is made.

Each inspection is a separate original observation round, not an accumulator.
A later fresh round may change the current fictional decision but never repairs
an earlier failure, unknown, stale record or original client journey. The ten-entry
bounded immutable history refuses new work instead of dropping originals.
Reset does not create a new model or clear that limit. Reload starts another
fictional in-memory presentation, not an authority, lease or capacity reset.

## Unchanged inputs and honest source context

Node rereads **C015's known public read-only restore** for `synthetic-restart-v1` /
`synthetic-run-001` through the **unchanged C036 guard** before inspection.
It never calls persist, writes a fixture, scans health or discovers resources.
Current literal local consent and six exact independent acceptance gates are
read under State with closed handles before release. Missing current reads have
no previous-ready fallback.

The browser imports C036's **bundled historical actual C015 observation**, not
current disk, consent or authority. C036's positive lease/user/context association
is closed **fictional** scope. C034's source-pinned actual historical DOM records
remain **UNLINKED**, without authenticated run/user/lease correlation, current
instance inventory or native freshness. Their actual saved timestamps/source
and original failed, interrupted unknown and budget-exceeded history are shown
honestly; they are not joined to the current lease or counted toward coverage.
Accepted C020/C021 compatibility and C024 complete-coverage/immutable-receipt
patterns are read-only prior art, not pool observations. `sources.cjs` independently
checks raw working bytes, normalized LF and actual accepted Git blobs, then
unchanged C036/C034 underlying pins.

## Verify without refreshing proof

```powershell
node capability\C038\tests\verify.cjs
node capability\C038\tests\coverage.cjs
node capability\C038\tests\syntax.cjs
node capability\C038\tests\publisher.cjs
node capability\C038\tests\browser.cjs
node capability\C038\tests\index-proof.cjs probe
node capability\C038\tests\audit.cjs
```

Ordinary checks are **source/evidence/retained-fixture read-only**. Unit tests
use a test-only loader of unchanged C036 with its actual captured receipt; reader
denial/epoch fault simulations are labeled tests, not actual current-disk proof.
No accepted files or shared retained fixtures are changed. Coverage is enforced
**per production file** (next section), without writing a V8 coverage directory.

`C038.feature` precedes the loadable stub and genuine **AssertionError RED**:
`evidence\red\one-probe.initial.cjs` demonstrates `true !== false` because the
retained original stub turns one HTTP 200 into pool readiness. It remains
intentionally failing. IaC is **N/A**. All original RED and later failure bytes,
stdout/stderr whitespace, source hashes and observed timings remain immutable
in unique raw captures. Git canonical bytes and raw working bytes are separate.

Only exact `CAPTURE_BROWSER_EVIDENCE=1` deliberately appends a unique own raw
capture; it never replaces previous proof:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C038\tests\record.cjs browser }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

Actual browser verification uses **Node 22 / offline Playwright 1.56.1 /
Microsoft-signed Edge 156**, unchanged `testing\browser\isolated.cjs` SHA
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson` and awaited `close()` in `finally`. Actual DOM, single-probe
HOLD, failed/stale/partial/unknown/unlinked/complete, copy/compare/reset/keyboard,
replay, errors, history limit, enforced CSP and exact owned process/profile/helper
cleanup are observed. No foreground lease, unsafe flag, download, private helper
edit or inactive lifecycle recovery exists. Broader helper lifecycle and native
transport remain unqualified. CSP denies connections, inline scripts, forms,
frames, objects and workers; there is no server or persistence endpoint.

## Coverage gate: every production file, per file

Specification: `C038-coverage.feature`. `tests\coverage.cjs` (library
`tests\coverage-gate.cjs`) no longer trusts Node's report of loaded files. It
enumerates the production scripts from the namespace (`boundary.cjs`, `cli.cjs`,
`model.js`, `page.js`, `readiness.js`, `sources.cjs`; `tests\` and `evidence\` are test
tooling and evidence), runs the focused tests listed in `TESTS` under
`node --test --experimental-test-coverage` with one `--test-coverage-include` per
enumerated file and `NODE_TEST_CONTEXT`, `NODE_V8_COVERAGE`,
`CAPTURE_BROWSER_EVIDENCE` and `C038_CAPTURE_DIR` removed from the nested
environment, and judges **each file**: at least **85% lines, 85% branches and 85%
functions** (`readiness.js` and `model.js` keep their earlier 90% lines and
functions floors, so no threshold is lowered). A file with no report row counts as
**0%** and fails, a measured file outside the enumeration fails, and the Node
aggregate cannot hide a low file. Exit 0 only when all six pass.

| File | Lines % | Branches % | Functions % |
| --- | ---: | ---: | ---: |
| `boundary.cjs` | 100.00 | 100.00 | 100.00 |
| `cli.cjs` | 100.00 | 100.00 | 100.00 |
| `model.js` | 99.28 | 96.36 | 100.00 |
| `page.js` | 100.00 | 100.00 | 100.00 |
| `readiness.js` | 97.92 | 97.03 | 96.77 |
| `sources.cjs` | 100.00 | 100.00 | 100.00 |

The committed gate before this one measured only `readiness.js` and `model.js`
against aggregate 90/80/90 thresholds. Over the loaded files the aggregate was
96.39 / 94.31 / 96.77 while `page.js` was unloaded (0%), `cli.cjs` had 69.23 lines
and 42.86 branches and `boundary.cjs` 75.00 functions.

`page.js` is browser-only: `tests\dom-stub.cjs` builds a DOM from the ids of the real
`index.html` and runs the unchanged `page.js` in a `vm` context named by its file
URL, so Node coverage measures the real file (`tests\page.test.cjs`). `cli.cjs` runs
in process with an injected fixture session and captured console
(`tests\cli.test.cjs`). `boundary.cjs` `currentDiagnostic` and the fail-closed
`sources.cjs` branches use the archived 2CABA publisher and archived State authority or
tampered private module copies (`tests\boundary-current.test.cjs`,
`tests\sources-closed.test.cjs`); none reads the live private publisher.

Not measured by Node, therefore disclosed in the gate output and never counted or
excluded: `index.html` and `style.css` (observed in real headless Edge by
`tests\browser.cjs`) and `read-gates.ps1` (PowerShell: it is exercised through
`sources.readGates()` by the State-reading tests, but no coverage tool exists for it).

### Reproduce RED, GREEN, coverage and browser

```powershell
# RED, retained and intentionally failing: the aggregate-only gate subject certifies an unloaded page.js (9 of 12 AssertionErrors, exit 1)
node --test capability\C038\evidence\red\aggregate-gate.initial.cjs
# original product RED, unchanged: one HTTP 200 becomes pool readiness (true !== false)
node --test capability\C038\evidence\red\one-probe.initial.cjs
# GREEN: the gate library, then the whole per-file gate (exit 0, six ok rows)
node --test capability\C038\tests\coverage-gate.test.cjs
node capability\C038\tests\coverage.cjs
# one file at a time (L-0004 form), for example the browser page under Node
node --test --test-concurrency=1 --experimental-test-coverage "--test-coverage-include=**/C038/page.js" --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability\C038\tests\page.test.cjs
# real isolated headless Edge (Microsoft-signed, offline Playwright 1.56.1), read-only
node capability\C038\tests\browser.cjs
# whole ordinary suite: syntax, per-file coverage, publisher guards, index probe and browser
node capability\C038\tests\verify.cjs
```

Archived raw runs (stdout and stderr gzip, exit code, input hashes) under
`evidence\raw`: `gate-red-5a033e71-47f3-4c8b-8aa2-ed79372805c0` (RED of the gate
library, exit 1), `coverage-red-c10c6d02-6f31-4f8d-b121-6cff1485b882` (first
per-file run on the pre-existing tests: `boundary.cjs`, `cli.cjs` and the unloaded
`page.js` fail, exit 1), then `focused-7dcd76c2-cc2a-444b-b4de-b8170f35b6c6` and
`coverage-4a79432b-b992-4999-a2f8-6cece822ba60` (GREEN; the earlier
`focused-1654e5aa-...` and `coverage-6af16cdf-...` runs predate the nested-environment helper and
stay as immutable history). Only exact
`CAPTURE_BROWSER_EVIDENCE=1` with `tests\record.cjs <stage>` appends a new unique
directory; `evidence-index.json` points at the sealed qualification and
`node capability\C038\tests\audit.cjs` rechecks it.

## Publication boundary

The immutable archived **2CABA** publisher fixture has **61 guard groups**;
removing only the four approved C030/C035/C037/C038 class tokens exactly
reproduces historical **60AE** bytes. Normal historical fixtures do **not** read
a forever-pinned live private publisher, and nested old revision hashes are not
current authority. Current top
`flow-state.json.localPublisherAuthorization`, own frozen class/scope/owner and
accepted prerequisites are reread under **State**, released before **Publisher**.
The exact actual currently approved private bytes are rechecked under Publisher
immediately before standard delegation. No State acquisition occurs under it.

Process-local Git transport appends only `http.version=HTTP/1.1` after the validated
existing count. Every previous slot's presence **and** value is preserved and
restored in `finally`; initially absent variables use **Remove-Item Env:**, not
null assignment. A subsequent actual safe Git read is asserted. TLS, proxy,
authentication and global configuration are not changed.

Actual HEAD must equal remote main under Publisher **before any stage**.
Every foreign index entry and flag is captured and preserved, including C048's
ordinary staged M; it is not an unmerged-entry cleanup target. Only the unchanged
standard publisher stages owned C038, creates a `[C038][S]` commit with the Copilot
trailer, a real annotated `kanban/C038/<12sha>` tag, atomically pushes main/tag,
and verifies remote peel/ancestry. Full actual-SHA, raw-working-versus-actual-Git
canonical proof and State Report counts are separate from parent acceptance.
No reset, amend, force, ahead carry, unowned stage or cleanup is permitted.

**Incomplete:** H007, native execution, actual pool inventory/freshness,
authentication/lease ownership, source parents and production Node 24. No Azure
calls, health scans, Entra, credentials, real user data, framework, cloud storage,
scaffold, IaC, deployment or spending is authorized. Educational AS-IS use is not
a Microsoft SLA or endorsement.
