# C011: fictional lease capacity and spend reservations

Local, synthetic, offline Node built-ins only. One IPv4 loopback listener uses port
zero, two conductor subjects share one capacity pool and one cost ceiling, and
the server selects prices. No cloud, real spend, Entra registration, deployment,
package installation or Node 24/Express production qualification is involved.

The original worker's implementation, tests and retained early RED are preserved.
This continuation adds cancellation-audit and closed configuration-error guards
and verification tooling; it
does not claim the original author's work or a second credit unit.

## Contract and atomic decision

- `visitor`: identity read only. Each conductor: its own reserve, read, list,
  allowance, release, batch and audit. `operator`: audited read-only pool and
  audit views, never reservation mutation. Anonymous clients see public assets
  and scope only. Identity comes from a verified C009 token, not client claims.
- `POST /v1/reservations` takes `{key,tier,units}`. The closed `p1` price table
  defaults to standard 4 and burst 8 synthetic cost units per capacity unit.
  `POST /v1/reservations/<id>/release` returns exactly the held figures once.
  `/v1/batch` is all-or-nothing. The other routes are enumerated in `contract.js`.
- The store checks and commits a private draft synchronously, with no await
  between admission and allocation. It checks active count, own capacity, own
  spend, shared capacity, then shared spend. A refusal names its bound and
  changes no post-expiry books. Expiry is an independent injected-clock fact,
  settled before store operations, including refused operations.
- Pool totals equal reserved plus free. Lease figures reconcile after every
  operation in the seeded store/HTTP property tests, including retries, conflicts,
  foreign operations, release, expiry and batches.
- Foreign and absent ids receive the same typed bytes. A conductor sees only its
  own records and allowance; only the operator sees shared headroom. The fixed
  configured pool totals are disclosed in each own allowance.

One route and one refusal function use the unchanged C009 lanes/responder.
Refusals mark the request socket, close it and stop reading; later pipelined
effects do not run. The matrix includes Node-own answers, incomplete messages,
HTTP/1.0, bodyless release and batch effects observed from another connection.
Cancellation is checked after body reading and before token revalidation at the
commit. A subsequent non-auth failure produces no new refusal audit or response;
the established AuthError precedence and live typed INTERNAL_ERROR are retained.

## Bounds and honest limits

Defaults are pool 100/600, own caps 60/400, 20 active and 50 retained records per
lease, five operations per batch, 4096 body bytes, four in-flight requests per
socket, 256 connections, header/request 5000 ms, checking interval 1000 ms, idle
8000 ms. Configuration is closed and validated before a listener is created.
Throwing configuration getters, revoked proxies and failed inspection are typed
CONFIG_INVALID refusals without caller-provided exception text.
Real default stalled-header/body tests check typed 408 and audit, not latency.

**Retained-history replay limit:** the inherited API deliberately forgets an
evicted ended row and its key. A same-key retry replays while that row is retained;
after eviction it may create a new reservation. This is explicitly asserted in
`tests/store-more.test.cjs` and is not an unlimited-lifetime deduplication
guarantee. The original card's unqualified same-key wording therefore remains an
exact-contract decision for the parent, not a silently waived acceptance check.

There is no persistence or restart recovery. Ownership work is counted over the
caller's own bounded records; no wall-clock timing-oracle claim is made. The
three-pending-socket, 48-MiB child probe covers the specified F24 shape. A single
64-KiB parser read can transiently retain roughly 6 MiB of request/response
objects per pending socket in the inherited Node lane design; cost scales with
pending sockets up to the connection cap. This is not a constant global-memory
or arbitrary-concurrency qualification.

The inspection page performs GET only. Its existing 21 visible rows, every cell,
all ten book figures, unique ids, status and visible keyboard focus are compared
in real Edge. POST outcomes come from real Node HTTP/socket operations before and
between observations, not a browser write proxy. The sealed helper's guarded
forwarding is disclosed; it does not certify Chromium native TCP transport.

## Read-only dependencies

`imports.json` is unchanged: five frozen C009 production imports and C010's audit
ring retain their original raw/LF/Git-object pins. `dependency-context.json`
separately compares them with current accepted C009 and C010 commits. The amended
C010 contract/server are inspected, not imported or repinned; their actual idle
default is 10000 with header 5000 and checking 1000.

The browser uses exact copies of the currently accepted isolated helper, opt-in
owned lifecycle and owning qualifier API, with the existing cached Playwright.
The installed Microsoft-signed qualified major is checked, not a historical build
or binary-hash equality. Unknown major 158 remains denied. Each observed native
PID has its creation identity; profile authority comes from this invocation's
exclusive creation and authenticated root binding. Cleanup is owned-only, also
after an injected assertion. No global runtime cleanliness is claimed.

## Reproduction from a private checkout-shaped tree

Use the owning Git repository for fixed accepted object reads, not its index or
HEAD. Every output directory below must be fresh and caller-owned.

```powershell
$env:C011_GIT_REPOSITORY = '<OWNING-REPOSITORY>'
$env:C011_ASSERTION_DIR = "$PWD\private\assertions-green"
node capability\C011\tests\suite.cjs core

$env:C011_ASSERTION_DIR = "$PWD\private\assertions-original-replay"
node capability\C011\tests\suite.cjs red-replay

$env:C011_COVERAGE_OUT = "$PWD\private\coverage-originals"
$env:C011_COVERAGE_REPORT = "$PWD\private\coverage.json"
node capability\C011\tests\coverage.cjs

node capability\C011\tests\mutate-gen.cjs --list
node capability\C011\tests\mutate-gen.cjs --scratch "$PWD\private\mutation-work" --out "$PWD\private\mutation.json" --workers 1
node capability\C011\tests\mutate-gen.cjs --out "$PWD\private\mutation.json" --finalize --workers 1

$env:C011_LOOP_OUTPUT = "$PWD\private\loop.json"
node capability\C011\tests\loop.cjs

$env:NODE_PATH = '<EXISTING-CACHED-BROWSER-PACKAGE>\node_modules'
$env:C011_BROWSER_OUTPUT = "$PWD\private\browser.json"
node --test --test-concurrency=1 --test-timeout=900000 capability\C011\tests\browser.cjs

# Repeat for lf and crlf, using fresh paths each time.
$env:C011_FRESH_WORK = "$PWD\private\fresh-work"
$env:C011_FRESH_OUTPUT = "$PWD\private\fresh.json"
node capability\C011\tests\fresh.cjs lf
```

The existing shared recorder supplies immutable original streams and input
hashes. The coordinator's three-heavy/four-mutation lanes remain mandatory; this
worker runs one capture and one normal-priority mutation worker at a time.

After the final source freeze, `evidence/final/catalog.json` records actual
captures and results, not promises. Missing, surviving, undecided, unloaded or
uncaptured checks are not passes. Per-file coverage uses one literal whole-file
85/85/85 command for each of all seven production files, unloaded counting zero.
Mutation syntax/module failures, signals and timeouts are not named behavioral
kills. Every executed test has its actual assertion count observed.

The final seal covers the exact public file set. `evidence-final.cjs` recomputes
every old/current manifest, stream and input, with named tamper controls. Public
portable projections are distinctly labelled derivatives with private original
hashes; neither the original raw streams nor their manifests are rewritten.
This is a consistency tripwire, not authentication against a coordinated rewrite:
the parent independently compares retained private originals and accepted Git
objects before any application, publication, Done or original D-credit award.
