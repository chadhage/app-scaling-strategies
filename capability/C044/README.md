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
A request that carries a body (`Content-Length` above 0 or `Transfer-Encoding`) is answered `400 UNEXPECTED_BODY` once with `Connection: close`
and the socket is destroyed after the response, so an endless chunked body is never parsed (review fix F2).
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
- **The watermark never moves backwards (review fix F1).** An event id (`run:epoch:sequence`) is displayed as applied **at most once per page
  session**, across disconnect, rewound re-request, typed failure, **Resync** and reconnect. The reducer's watermark (epoch, last applied
  sequence) is kept across a same-epoch **Resync**: the cursorless stream replays the retained window, the part that was already applied
  is counted as dropped duplicates, and only newer events are applied. The first delivery after a Resync settles it and the marker says
  which case happened: `nothing was skipped` (overlap or continued), `skipped sequences A to B (N events are no longer retained)` (a true
  gap: the first delivered sequence of the same epoch is greater than the last applied one + 1; recorded in `state.gaps` with epoch and exact range),
  or `epoch E started, its events count from its own beginning` (a later epoch: the **only** case that resets the watermark, recorded in
  `state.epochChanges`; an older epoch is always rejected). While a Resync has delivered nothing yet the page stays cursorless on automatic retries.
  `delivered = applied + duplicates + out-of-order + rejected` always holds, and applied events plus named gaps cover each epoch contiguously.

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
  an acknowledged event never disappears (a real killed process is tested). Frames replayed after a restart are **byte-identical** to
  the frames sent before it (review fix F5: frames always use the producer's field order although the log stores canonical key-sorted JSON;
  the persisted records and the hash chain are unchanged).
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
allowed actions; **Resync from snapshot** is the only way back: it replays the retained window, events you already applied are counted as dropped duplicates
(never shown again) and the marker names a skipped range only if the server really no longer retains it. Type `stop` and Enter or press Ctrl+C to close; the listener closes itself after 10 minutes.
The run's persisted state lives in `capability\C044\state\` (ignored by Git); delete that folder to start a fresh run, or restart the CLI to watch the run restored.

Read-only routes: `/` `/page.js` `/reducer.js` `/cursor.js` `/style.css` (closed allowlist), `/run.json` (snapshot, counters, restore report,
explicit nonqualification flags), `/cursor`, `/stream`. Foreign Host or Origin, writes, bodies, unknown paths and queries are denied.

## Verify (the reviewer's commands, from the repository root)

```powershell
# RED replay of the ORIGINAL work: the behavioral RED against the retained naive stubs (expected exit 1, 9 assertion failures)
node --test capability\C044\evidence\red\stream.initial.cjs

# GREEN: the whole non-browser suite, 16 test files (real sockets, real files, a really killed process)
node --test --test-concurrency=1 capability\C044\tests\*.test.cjs
node capability\C044\tests\syntax.cjs

# per-file coverage 85/85/85: ONE command per production file (L-0004; unloaded counts as 0%; take a heavy slot when other agents are active)
$tests = (Get-ChildItem capability\C044\tests\*.test.cjs).FullName
foreach ($file in 'context.cjs','cursor.js','page.js','reducer.js','run.cjs','server.cjs','store.cjs') {
  node --test --test-concurrency=1 --experimental-test-coverage "--test-coverage-include=**/C044/$file" --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 $tests
}
node capability\C044\tests\coverage.cjs    # the same files in one run with every file row parsed and enforced

# real isolated headless Edge observation (real C001 consent and real C015 restore; CAPTURE_BROWSER_EVIDENCE unset writes nothing)
node capability\C044\tests\browser.cjs
node capability\C044\tests\helper-limits.cjs
```

**RED replay of the review fix (F1, F2, F5).** The new tests (`resync`, `resync-page`, `resync-server`, `recovery-property`, `hardening`) and
`tests\browser.cjs` fail against the pre-fix production bytes, which are the published commit `7dbaaedb8458` (the manifests pin their SHA-256;
the files `reducer.js page.js cursor.js server.cjs run.cjs index.html` are the ones the fix changed). Replay in a scratch folder of your own (never %TEMP%), then run the new tests there:

```powershell
$d = 'C:\path\to\your\scratch\red'; New-Item -ItemType Directory -Force $d | Out-Null
git archive --output="$d\prefix.tar" 7dbaaedb8458 capability/C044 capability/C001 capability/C002 capability/C015   # pre-fix tree plus the modules it imports
tar -xf "$d\prefix.tar" -C $d
Copy-Item capability\C044\tests\resync*.test.cjs, capability\C044\tests\recovery-property.test.cjs, capability\C044\tests\hardening.test.cjs "$d\capability\C044\tests"
node --test --test-concurrency=1 (Get-ChildItem "$d\capability\C044\tests\resync*.test.cjs","$d\capability\C044\tests\recovery-property.test.cjs","$d\capability\C044\tests\hardening.test.cjs").FullName
# expected: exit 1, tests 20, pass 0, fail 20 (observed this way and archived: evidence\red\fix-resync-a626b62d-77f8-4ae2-a8fc-91c3c90a7041)
```

The browser half of the RED (`tests\browser.cjs` against the pre-fix bytes in real isolated Edge) is archived as `red-browser` in the same folder: the run failed at
the new assertion `after Resync no id appears twice among the applied entries` (82 unique ids among 114 entries, the defect of finding F1 observed in a real browser).

The same five files, byte-unchanged since that RED, pass against the final code in the GREEN run above (20 of 20): the RED fails only for the missing behavior.

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
| An applied id is displayed at most once across disconnect, rewound re-request, typed failure, **Resync** and reconnect (review fix F1); a gap is named only when something was really skipped; only a later epoch resets the watermark | `resync.test.cjs` (reducer sequences), `resync-page.test.cjs` (page under the DOM stub), `resync-server.test.cjs` (real server and sockets, real reducer), `recovery-property.test.cjs` (240 seeded walks over the recovery operations), `tests\browser.cjs` (unique applied ids and `#count-duplicates` equal to the overlap after Resync in real Edge) |
| A refused request body does not keep the connection (review fix F2); replayed frames are byte-identical after a restart (review fix F5) | `hardening.test.cjs` |
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
**Resync** (review fix F1: after it the applied entries have **unique ids**, the replayed overlap is exactly the growth of `#count-duplicates` and is listed as dropped, the new events follow the last
applied one contiguously, and the marker says `nothing was skipped` or names the exact skipped range), strict CSP (an injected inline script is blocked), only GET requests to the owned origin and no page errors. Browser, server and scratch are closed in `finally`.

**Stated limits.** The approved helper forwards each request with `route.fetch`, which **buffers the whole response**, so an endless stream cannot reach the page. The page is therefore served
*bounded* stream responses (`streamLifetimeMs`, 600 ms in the observation) and it reconnects on its own. The helper also **does not forward the `Last-Event-ID` header** that a browser adds on its own
automatic reconnect (`tests\helper-limits.cjs` reproduces both facts), so the page owns its cursor: on any loss it closes the `EventSource` and opens a new one with `?lastEventId=<last applied id>`.
Header-based resume, endless streaming, abrupt/mid-event loss, slow readers and proxy drops are proven with **real Node sockets**, not in the browser. This is **not native Chromium TCP, proxy,
Node 24, Express, Entra or Azure qualification**, and says nothing about Edge outside the helper. A server-produced transcript is not needed because the page is observed receiving real events.

## Evidence layout

`evidence\red\` keeps the retained loadable naive stubs and the original RED test (`stream.initial.cjs`, `server.initial.cjs`, `reducer.initial.js`). `evidence\raw\<stage>-<uuid>\` holds, per recorded run, lossless
`stdout.raw.gz`, `stderr.raw.gz` and `run.json` (command, runtime, exit code, SHA-256 of stdout/stderr and of **every owned input**); the browser stage also keeps `summary.json`, DOM snapshots and a screenshot.
Recorded stages of the first publication: `red` (exit 1), `focused` (112 pass), `syntax`, `coverage` (7/7 files at or above 85/85/85), `limits`, and two `browser` runs. After the review fix the new RED lives in `evidence\red\fix-resync-<uuid>\`
(manifests `red-resync.json` and `red-browser.json` with their `raw\*.raw.gz` transcripts and a `* -text -diff` attribute file) and the new green captures are `focused`, `syntax`, the seven `cov-<file>` stages (one L-0004 command per production file) and `browser`, recorded by `tests\record.cjs`
as new `evidence\raw\<stage>-<uuid>\` directories. The first `browser` run (`browser-851bc839-...`) is a **retained failed run**:
its duplicate-drill assertion read the "reconnected from id" marker after the page's own automatic reconnect had already replaced it (a race in the test, not in the page). The test was rewritten to take every page
observation atomically inside one `waitForFunction` evaluation and re-recorded green (`browser-b40a0d89-...`); the failed run is kept, never deleted or relabelled. `evidence\raw\.gitattributes` keeps every raw capture
byte-exact (`-text`) and tolerates the trailing whitespace that DOM snapshots legitimately contain (`whitespace=cr-at-eol,-blank-at-eol,-blank-at-eof`), so Git's normal whitespace check passes without rewriting evidence.
Record a stage only deliberately and only with the exact variable; it always writes a **new** unique directory and never rewrites one:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C044\tests\record.cjs focused }   # also: red, syntax, coverage, browser, limits, cov-context, cov-cursor, cov-page, cov-reducer, cov-run, cov-server, cov-store
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

The first RED was recorded **before any production file existed** (exit 1, 9 of 9 assertion failures: duplicates on resume, producer cancelled on disconnect, a stale/foreign/future/malformed cursor answered `200`,
the reducer appending duplicates, nothing restored after restart). Its inputs (`C044.feature`, `.gitattributes`, `.gitignore`, the three files in `evidence\red\`) are byte-identical to the hashes in
`evidence\raw\red-*\run.json`; only the recorder `tests\record.cjs` was extended afterwards (focused list and the `limits` stage). Production code was then written, refactored with the suite green, and the final tests are a superset of the RED's assertions against the real API.

## Review fix after the independent REJECT of `7dbaaedb8458` (finding F1 major, others minor)

`C044-resync.feature` specifies the corrected behavior (`C044.feature` is unchanged, so the first RED's pins still match it). Order of events, stated plainly: the new tests were written first and run
against the pre-fix code; the fix was then written and the new tests were run against it (that is how the non-vacuity thresholds of the property test were checked); the pre-fix production bytes were then **restored**
(`git status` showed them equal to the published blobs) so that the archived RED is a run of the **final** test bytes against the **pre-fix** bytes (`evidence\red\fix-resync-a626b62d-77f8-4ae2-a8fc-91c3c90a7041`: `red-resync`
20 of 20 assertion failures, `red-browser` exit 1 at the new Resync assertion in real Edge), and the fixed files were copied back byte-identically (SHA-256 compared). The five new test files and `tests\browser.cjs` have not changed since.

| finding | outcome |
| --- | --- |
| F1 major: Resync re-showed applied events as new | **Fixed at the root.** `reducer.resync()` no longer resets `epoch`/`lastSeq`/`lastId`; a pending-resync marker is settled by the first valid delivery (overlap, continued, fresh, gap with the exact range, new epoch). `page.js`: marker text per outcome, a pending resync stays cursorless. Wording corrected in `cursor.js` (action description), `reducer.js` (notice), `index.html` (hint) and this README: Resync no longer "records the gap". Siblings tested: restart under a new epoch, resync twice in a row, empty window, window ending before `lastSeq`, a completed earlier epoch, an older epoch while pending. |
| F2 minor: endless body after UNEXPECTED_BODY | **Fixed.** `server.cjs` answers once with `Connection: close` and destroys the socket after the response (`hardening.test.cjs`, bounded: closed within 2 s, server-side socket destroyed). |
| F3 minor: retained RED test 1 asks for cursor 5 outside a 4-event window | **Left on purpose.** The original RED and its evidence are immutable (`surface.test.cjs` pins them); it fails with 410 for an input reason against a correct server (8 of 9 original assertions pass unchanged against the real code, and the final `stream.test.cjs` covers the intended case with window 8, cursor 6, head 10). The NEW RED fails only for the missing behavior: the same five files pass unchanged against the final code. |
| F4 minor: evidence precision | The new captures (`focused`, `syntax`, the seven `cov-*` stages, `browser`) were recorded **last**, after the final bytes of every pinned file including this README and `tests\browser.cjs`; the `run.json` manifests pin them. No later edit is known; see the result record for the exact directory names. The old manifests of the first publication are untouched and keep their (older) pins. |
| F5 minor: restored frames not byte-identical | **Fixed** (cheap): frames use the producer's field order; the persisted canonical records and the hash chain are unchanged (`hardening.test.cjs`). |
| F6 minor: raw CRLF pins fail on an `autocrlf=false` clone | **Left**: `imports.json`/`pins.cjs` pin the working-tree bytes of accepted C015/C001/C002 files and of the browser helper (same pattern as exemplar C034); the LF and accepted-blob pins hold. Changing it would rewrite pins other items rely on. |
| I1 | Documented: 64 never-reading clients with small frames hold every stream slot until the kernel buffers fill (hours at the CLI default of 2 events/s and about 190-byte frames; estimated by the reviewer, not measured). New streams then get the typed `503 STREAM_CAPACITY` while every other route stays responsive; memory per reader is bounded by `maxBufferedBytes` (1 MiB) and the 10 s drain timer. |
| I2 | Documented: `headersTimeout` and `requestTimeout` (5000 ms) are enforced only by Node's connection check (every 30 s), so a half-open header connection is closed at about 30 s with HTTP 408, like a plain Node server. |
| I3 | Documented: on Windows the store's path guard is stricter than needed: a `persistDir` that differs from the real path only in letter case is rejected `UNSAFE_PATH` (fail closed, nothing written). |

Existing files changed by the fix: `reducer.js page.js cursor.js server.cjs run.cjs index.html` (production) and, in the tests, the assertions that pinned the defect (`reducer.test.cjs` resync test, `page.test.cjs` marker text) plus two added tests,
`browser.cjs` (new assertions and applied ids in the snapshot), `focused.cjs` (16 files) and `record.cjs` (one L-0004 coverage stage per file).

## Honest envelope

Approved production design stays **Node.js 24 LTS / Express / App Service Linux**; the tests ran on Node 22. `EventSource` behaviour is observed only through the approved isolated helper. Server-Sent Events over a real proxy,
Front Door or App Service idle timeouts are simulated only by a local TCP proxy that drops sockets. The synthetic run, its names and counters are fictional. There is no Entra verification, lease authority, Azure Storage, deployment, slot,
registration or spend, and nothing here is a Microsoft SLA or endorsement. H004 and H008 remain incomplete; X001 and C040 are separate.
