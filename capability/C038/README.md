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
No accepted files or shared retained fixtures are changed. Coverage measures
production model/core with explicit **90% lines / 80% branches / 90% functions**
thresholds, without writing a V8 coverage directory.

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
