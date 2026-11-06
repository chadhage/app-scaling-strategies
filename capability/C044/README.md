# C044: reconnect a live console stream without cancelling work

**Training rehearsal - synthetic data - not a live Azure result**

Original **C044 / S / P0 / LP-REPLAY**, parents H004 and H008, entry gates C015, C019 and C036 (all Done).
It is the companion of the Delighter X001 together with C018, C034, C037, C038 and the later C040. This is one
local, synthetic, offline fixture. It does not validate production **Node 24 / Express / Entra**, registers no identity,
uses no cloud service, no real data and no spend. Parent acceptance alone awards the single S credit; tests, repairs and
evidence earn nothing extra. IaC is **N/A**.

## What it is

A loopback-only server (Node built-ins, `127.0.0.1`, port 0, GET only) serves **one synthetic run** as Server-Sent Events
over HTTP/1.1 (`text/event-stream`). The run's work is a synthetic ordered event producer owned by the server
(`run-started`, numbered `step-completed`, `run-completed`). Every event has

- a server-owned `id` that carries run, epoch and sequence: `synthetic-run-001:3:42`,
- a typed `event` name and a JSON `data` carrying `runId`, `epoch`, `seq`, `step`, `of`, `note`,
- and heartbeats are SSE **comments** (`: heartbeat`), never events.

A client that is lost for any reason (abrupt socket close in mid-event, a slow reader that never drains, a proxy-style
idle drop, a bounded stream lifetime) **never cancels, pauses or restarts the work**: the run's own counters keep advancing
and the producer timer is untouched. A reconnect with `Last-Event-ID` (header) or `?lastEventId=` resumes at the **next**
event, with no gap, no duplicate and strict order. The header wins over a stale query cursor because a browser re-sends
its original URL when it reconnects on its own.

### Typed failures (C019 shape) and allowed recovery actions

A cursor that cannot be honoured is an explicit failure with a closed code, HTTP status, group, a fixed reason and a
closed list of allowed recovery actions, and no stream is opened (never a silently empty or restarted stream):

| code | status | cursor | allowed actions |
| --- | --- | --- | --- |
| `CURSOR_EXPIRED` | 410 | older than the bounded replay window | resync-from-snapshot, reinspect, stop |
| `CURSOR_FROM_FUTURE` | 409 | beyond the head of the run | confirm-operator-review, reinspect, stop |
| `CURSOR_RUN_MISMATCH` | 409 | attributed to another run | confirm-operator-review, reinspect, stop |
| `CURSOR_EPOCH_MISMATCH` | 409 | attributed to another epoch (C036 attribution) | resync-from-snapshot, reinspect, stop |
| `CURSOR_MALFORMED` | 400 | not a canonical id, empty, duplicated or ambiguous | resync-from-snapshot, reinspect, stop |

Also typed: `STREAM_CAPACITY` (503), `LOCAL_HOST_REQUIRED` (421), `CROSS_ORIGIN_DENIED` (403), `METHOD_NOT_ALLOWED` (405),
`UNEXPECTED_BODY`, `INVALID_URL`, `INVALID_QUERY` (400), `URL_TOO_LONG` (414), `NOT_FOUND` (404), `SERVER_UNAVAILABLE` (500).
Checks run in this order: format, run, epoch, future, expired. A foreign cursor is never called merely "old".
`GET /cursor?lastEventId=` runs the same check without opening a stream (the page uses it to learn why `EventSource` was
refused, because `EventSource` cannot read an error body). A cursor equal to the head of a **completed** run answers
`204 No Content` with `X-C044-Run-Status: completed`, which stops `EventSource` reconnecting. C019's and C036's modules are
**not imported**: C019's error-table shape and C036's run/epoch attribution are reimplemented in `cursor.js` (see `imports.json`).

### Duplicate handling has two sides

- **Server:** it keeps no per-client state; a correct cursor `N` yields only events `N + 1 ...`, so an acknowledged event is
  never re-sent. A client that deliberately asks again from an older cursor gets those events again (that is the cursor's meaning).
- **Client:** `reducer.js` is a small pure module the page uses. Each delivery is judged by its id: a duplicate or an
  out-of-order delivery is **dropped, counted and shown as "dropped duplicate" / "dropped out-of-order"**, never as a new event;
  a foreign run/epoch, a malformed id, unknown event name or mismatched data is **rejected** and counted. The view and the dropped list
  are bounded and the overflow is counted, never silent.

### Persisted run/epoch state (C015 discipline) and restart

`store.cjs` persists the run as **versioned, hash-chained, fsynced files** and restores them on start, using C015's
`contract.cjs` primitives unchanged (`canonical`, `digest`, `closed`, `parseStored`, typed `FixtureError`):

```
<state>\synthetic-run-001\epoch-003\header.json    formatVersion 1, kind, run, epoch, C015 state digest, own digest (written once)
<state>\synthetic-run-001\epoch-003\events.jsonl   one canonical record per line: seq, event, data, prevSha256, sha256
```

The **attribution context** is the run and epoch that C015's public read-only `restore('synthetic-restart-v1',
'synthetic-run-001')` reads back (`context.cjs`; `C015 restore` verifies the immutable files and rereads consent). An event is
published to clients only after its complete record is fsynced, so "acknowledged" has one meaning: durable first, visible second.

- After a kill and restart the run, its epoch and the **whole** log are restored and production continues at the next sequence;
  an acknowledged event never disappears (a real killed process is tested).
- An unterminated final record was never acknowledged; it is discarded, reported in `/run.json` and the file is truncated back.
- A corrupt line, broken chain or digest, gap, wrong identity, bad UTF-8, oversize, unknown or unpublished (`pending`) entry, symlink,
  junction, hard link or a **regressed epoch** fails closed with a typed code (`CORRUPT_JSON`, `HISTORY_CHAIN`, `STATE_DIGEST`,
  `HISTORY_GAP`, `EPOCH_IDENTITY`, `INVALID_UTF8`, `STATE_OVERSIZE`, `UNEXPECTED_FILE`, `HOLD_UNOBSERVED`, `UNSAFE_PATH`, `UNSAFE_FILE`,
  `STALE_EPOCH`). There is no repair, no fallback to a shorter log, and a `pending` epoch directory is never reclaimed automatically.
- A new epoch gets its own directory; earlier epochs stay immutable and their cursors become `CURSOR_EPOCH_MISMATCH`.
- Limits as in C015: one cooperative writer per directory on a local Windows filesystem, regular-file `fsync` is real, directory-entry
  durability and power loss are not guaranteed, and nothing here is a production store (Azure Tables/Queues/Blob are not used).

## Conduct locally

```powershell
node capability\C044\server.cjs
```

The CLI rereads current **C001** local consent (`guardOperation('local.probe', approvals.C001)`, the C020 pattern) and the C015 context before
it listens, binds only `127.0.0.1` on an ephemeral port and prints the exact URL and PID. There are no host, port, identity, cursor, run or
state options. Open the URL. Tab to **Disconnect** and press Enter: the page closes only its own stream, shows the server's run counter at that
moment and focuses **Reconnect**. Wait, then press Enter on **Reconnect**: the marker reads `reconnected from id ...`, "Produced while detached"
shows how many events the run made in the gap, and they appear exactly once. Set **re-request N** before reconnecting to see N applied events
re-sent and shown as dropped duplicates. Stay disconnected for more than 16 s (32-event window at 2 events/s) to get a typed `CURSOR_EXPIRED` with its
allowed actions; **Resync from snapshot** is the only way back. Type `stop` and Enter or press Ctrl+C to close; the listener closes itself after 10 minutes.
The run's persisted state lives in `capability\C044\state\` (ignored by Git); delete that folder to start a fresh run, or restart the CLI to watch the run restored.

Read-only routes: `/` `/page.js` `/reducer.js` `/cursor.js` `/style.css` (closed allowlist), `/run.json` (snapshot, counters, restore report,
explicit nonqualification flags), `/cursor`, `/stream`. Foreign Host or Origin, writes, bodies, unknown paths and queries are denied.

## Verify (the reviewer's commands, from the repository root)

```powershell
# RED replay: the original behavioral RED against the retained naive stubs (expected exit 1, 9 assertion failures)
node --test capability\C044\evidence\red\stream.initial.cjs

# GREEN: the focused suite (112 tests, real sockets, real files, a really killed process; about 12 s)
node --test --test-concurrency=1 capability\C044\tests\cursor.test.cjs capability\C044\tests\reducer.test.cjs capability\C044\tests\run.test.cjs capability\C044\tests\store.test.cjs capability\C044\tests\context.test.cjs capability\C044\tests\stream.test.cjs capability\C044\tests\server.test.cjs capability\C044\tests\page.test.cjs capability\C044\tests\surface.test.cjs capability\C044\tests\imports.test.cjs capability\C044\tests\restart.test.cjs
node capability\C044\tests\syntax.cjs

# per-file coverage 85/85/85 over every production file, unloaded counts as 0% (take a heavy slot when other agents are active)
node capability\C044\tests\coverage.cjs

# real isolated headless Edge observation (real C001 consent and real C015 restore; CAPTURE_BROWSER_EVIDENCE unset writes nothing)
node capability\C044\tests\browser.cjs
node capability\C044\tests\helper-limits.cjs
```

`tests\coverage.cjs` enumerates the seven root production files (`context.cjs cursor.js page.js reducer.js run.cjs server.cjs store.cjs`),
runs the focused suite once with `--experimental-test-coverage` and one `--test-coverage-include` per file, parses **every file row** and counts an unloaded file as 0%
(Node otherwise prints no row and exits 0). `page.js` is measured under a vm DOM stub built from the real `index.html` ids (`tests\dom-stub.cjs`). Recorded floors are 85 lines, 85 branches, 85 functions per file;
the measured values are in `evidence\raw\coverage-*` and in the result record.

### Requirement to proof map

| Requirement | Where it is proven |
| --- | --- |
| Resume at the next event by header or `?lastEventId=`, no gap, no duplicate, strict order; header wins | `stream.test.cjs` (resume, query, cursor at head, parallel clients, same cursor twice, storm), `cursor.test.cjs` `resolve()` |
| A loss never cancels, pauses or restarts the work (abrupt close mid-event, slow reader, proxy-style idle drop, lifetime end) | `stream.test.cjs` (three loss tests, hard memory bound, healthy large frame), `run.test.cjs` (attach/detach leave the producer job untouched), browser Disconnect |
| Bounded replay window; stale, future, foreign run, foreign epoch and malformed cursors are typed failures with allowed actions | `cursor.test.cjs`, `stream.test.cjs` failure table over header, query and `/cursor`, `restart.test.cjs` (old-epoch cursor), browser `CURSOR_EXPIRED` |
| Duplicate handling on the client: drop, count, show; foreign or malformed deliveries rejected | `reducer.test.cjs`, `stream.test.cjs` (real reducer over real sockets with a racing second connection), `page.test.cjs`, browser duplicate drill |
| Persisted versioned run/epoch state, restart restores run and log, acknowledged events never disappear, corruption fails closed | `store.test.cjs`, `run.test.cjs` (restore, fault), `restart.test.cjs` (a really killed process, new and regressed epochs), `context.test.cjs` |
| Loopback only, consent-gated CLI, read-only closed routes | `server.test.cjs` (assets, Host/Origin/method/body/URL, `startLocal` with the real C001 guard, real CLI child process) |
| Page: strict CSP, no inline script, keyboard Disconnect/Reconnect, marker, duplicate counter | `surface.test.cjs`, `page.test.cjs`, `browser.cjs` |
| Imports of accepted producer files pinned | `imports.json`, `imports.test.cjs` |

### How the tests stay hermetic

No wall-clock sleeps decide an outcome: a **manual virtual-clock scheduler** drives the producer, heartbeats, lifetimes and the slow-reader
timer, and every wait on a socket is event-driven with a hard failsafe. Ports are loopback port 0. Scratch is `tests\scratch\<uuid>` under this namespace
and is removed afterwards. Nested processes get `NODE_TEST_CONTEXT` removed. The live ledger, git index, HEAD, the publisher and an installed browser binary are never read or pinned by a focused
test; the consent path uses the C001 **approved snapshot** with the real guard, and C015's restore is replaced by a receipt built with C015's own pure `makeState`/`makePersisted`.
`tests\imports.test.cjs` checks `imports.json` against the working tree and the accepted Git blobs of `kanban/C015/78341b3370d7` (immutable objects).

## What the real browser shows and its limits

`tests\browser.cjs` starts the real consent-gated `startLocal()` (C001 consent read, C015 restore read: both live), opens `index.html` through
`openIsolatedLoopback(...)` in a fresh isolated headless Edge, and uses only keyboard presses: it observes the connection state, live events, **Disconnect**
(server producer keeps going, counter measured, nothing applied while detached), **Reconnect** (`reconnected from id N`, the gap events once, strictly contiguous, 0 duplicates),
the **duplicate drill** (re-request 3: exactly 3 dropped duplicates, none shown as new), a typed **CURSOR_EXPIRED** with only its allowed actions and no silent restart, the explicit
**Resync**, strict CSP (an injected inline script is blocked), only GET requests to the owned origin and no page errors. Browser, server and scratch are closed in `finally`.

**Stated limits.** The approved helper forwards each request with `route.fetch`, which **buffers the whole response**, so an endless stream cannot reach the page. The page is therefore served
*bounded* stream responses (`streamLifetimeMs`, 600 ms in the observation) and it reconnects on its own. The helper also **does not forward the `Last-Event-ID` header** that a browser adds on its own
automatic reconnect (`tests\helper-limits.cjs` reproduces both facts), so the page owns its cursor: on any loss it closes the `EventSource` and opens a new one with `?lastEventId=<last applied id>`.
Header-based resume, endless streaming, abrupt/mid-event loss, slow readers and proxy drops are proven with **real Node sockets**, not in the browser. This is **not native Chromium TCP, proxy,
Node 24, Express, Entra or Azure qualification**, and says nothing about Edge outside the helper. A server-produced transcript is not needed because the page is observed receiving real events.

## Evidence layout

`evidence\red\` keeps the retained loadable naive stubs and the original RED test (`stream.initial.cjs`, `server.initial.cjs`, `reducer.initial.js`). `evidence\raw\<stage>-<uuid>\` holds, per recorded run, lossless
`stdout.raw.gz`, `stderr.raw.gz` and `run.json` (command, runtime, exit code, SHA-256 of stdout/stderr and of **every owned input**); the browser stage also keeps `summary.json`, DOM snapshots and a screenshot.
Recorded stages: `red` (exit 1), `focused` (112 pass), `syntax`, `coverage` (7/7 files at or above 85/85/85), `limits`, and two `browser` runs. The first `browser` run (`browser-851bc839-...`) is a **retained failed run**:
its duplicate-drill assertion read the "reconnected from id" marker after the page's own automatic reconnect had already replaced it (a race in the test, not in the page). The test was rewritten to take every page
observation atomically inside one `waitForFunction` evaluation and re-recorded green (`browser-b40a0d89-...`); the failed run is kept, never deleted or relabelled. `evidence\raw\.gitattributes` keeps every raw capture
byte-exact (`-text`) and tolerates the trailing whitespace that DOM snapshots legitimately contain (`whitespace=cr-at-eol,-blank-at-eol,-blank-at-eof`), so Git's normal whitespace check passes without rewriting evidence.
Record a stage only deliberately and only with the exact variable; it always writes a **new** unique directory and never rewrites one:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C044\tests\record.cjs focused }   # also: red, syntax, coverage, browser, limits
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

The RED was recorded **before any production file existed** (exit 1, 9 of 9 assertion failures: duplicates on resume, producer cancelled on disconnect, a stale/foreign/future/malformed cursor answered `200`,
the reducer appending duplicates, nothing restored after restart). Its inputs (`C044.feature`, `.gitattributes`, `.gitignore`, the three files in `evidence\red\`) are byte-identical to the hashes in
`evidence\raw\red-*\run.json`; only the recorder `tests\record.cjs` was extended afterwards (focused list and the `limits` stage). Production code was then written, refactored with the suite green, and the final tests are a superset of the RED's assertions against the real API.

## Honest envelope

Approved production design stays **Node.js 24 LTS / Express / App Service Linux**; the tests ran on Node 22. `EventSource` behaviour is observed only through the approved isolated helper. Server-Sent Events over a real proxy,
Front Door or App Service idle timeouts are simulated only by a local TCP proxy that drops sockets. The synthetic run, its names and counters are fictional. There is no Entra verification, lease authority, Azure Storage, deployment, slot,
registration or spend, and nothing here is a Microsoft SLA or endorsement. H004 and H008 remain incomplete; X001 and C040 are separate.
