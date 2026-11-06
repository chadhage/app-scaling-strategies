# C026: sequenced WebSocket fixture

A **synthetic, local-only, offline** H005 fixture on `127.0.0.1` (automatic port). It is **not the approved Node.js 24 LTS / Express / App Service Linux control API**: it uses Node built-ins only (`node:http` upgrade plus its own RFC 6455 framing, no `ws` package, nothing installed), validates no production runtime, verifies no identity, stores nothing durable and makes **no Azure call**, no cloud call, no spend and no registration. All business data is synthetic. Node `v22` here is test tooling.

The server **owns every sequence number**. A client may only say `hello`, `resume` with a cursor, or `ack` the next message the server already sent.

## Run it

```powershell
node capability\C026\server.cjs
```

The CLI rechecks current C001 local-probe consent (`approvals.C001`, read-only), binds only `127.0.0.1` on an automatically assigned port, prints one JSON line with the exact origin and process ID, and accepts no host, port, stream size, identity or deployment override. Open the origin in a browser and press **Load server-produced transcript**. Stop it with Ctrl+C. Automation must close its exact returned server handle (`closeServer(server)`).

Routes: `/` (page), `/page.js`, `/styles.css`, `/scope.json` (observed tooling plus explicit non-qualification flags), `/transcript.json` (see the browser limit), `/stream` (WebSocket only; a plain GET is 426 with `Upgrade: websocket`). Foreign Host or Origin headers, queries, writes and bodies fail explicitly, on the plain routes and on the upgrade path alike (an upgrade that carries a body is 400 `UNEXPECTED_BODY`; an upgrade target of another authority is 400 `INVALID_URL`; an empty query `/stream?` is 400 `INVALID_QUERY`). Every refusal says `Connection: close` and the server closes the socket once the answer is flushed, so a client that keeps streaming a body cannot keep the server parsing it. Since U040 a refusal also marks its connection at decision time: nothing the peer pipelined behind it runs, an upgrade included (see the last section).

## Protocol

Frames are JSON text. A fixture stream has `total` 12 messages and a `window` of 3 unacknowledged messages.

| Direction | Frame | Meaning |
| --- | --- | --- |
| client | `{"type":"hello"}` | new session |
| client | `{"type":"resume","session":S,"cursor":C}` | continue session S after cursor C |
| client | `{"type":"ack","seq":n}` | acknowledge the oldest unacknowledged message, and only that |
| server | `welcome` / `resumed` | session, cursor (`c1.<session>.<seq>`), total, window; `resumed` adds `ackedThrough`, `lastSent`, `cursorBehind` |
| server | `message` | `seq` (server numbered), `body`, `redelivered`, `deliveries` |
| server | `acked` | confirmation with the new cursor |
| server | `complete` | everything acknowledged; close 1000 `COMPLETE` |
| server | `error` | typed `code`, then close 1008 with the code as reason |

Rules proved by the tests:

- Strict order, no gaps, no duplicates: sequences count up from 1 and the next message is sent only when the window has room.
- An acknowledgement must be exactly `ackedThrough + 1`. Never sent: `ACK_UNSENT` (and nothing is recorded). Repeated: `ACK_DUPLICATE`. Skipping: `ACK_OUT_OF_ORDER`. Not a positive integer: `ACK_MALFORMED`.
- A client cannot name a message sequence: a `message` frame or a `seq` outside `ack` is `CLIENT_SEQUENCE_FORBIDDEN`. Other typed failures: `MALFORMED_JSON`, `MALFORMED_MESSAGE`, `UNSUPPORTED_MESSAGE`, `UNEXPECTED_FIELD`, `HELLO_REQUIRED`, `ALREADY_ESTABLISHED`, `SESSION_LIMIT`.
- Resume checks the session (`SESSION_UNKNOWN`), the cursor format (`CURSOR_MALFORMED`), the owner (`CURSOR_FOREIGN_SESSION`), the future (`CURSOR_FROM_FUTURE`) and a claim beyond the recorded acknowledgement (`CURSOR_AHEAD_OF_ACK`). A cursor **behind** the server record continues after the **server** record (`cursorBehind: true`); an acknowledged message is never sent again.
- After an abrupt close (socket destroyed, no close frame) a resume redelivers every unacknowledged message **once per resume**, flagged `redelivered: true` with a rising `deliveries` count, before any new message. A resumed completed stream answers `resumed`, `complete`, close 1000 and sends no message.
- A second connection that resumes a session takes it over; the first receives `SESSION_TAKEN_OVER` and is closed.
- Framing: client frames must be masked, reserved bits zero, control frames final and at most 125 bytes (also in the 64-bit length form: 1002), lengths minimal, text valid UTF-8, messages at most 4096 bytes in at most 64 frames (every frame counts, empty continuation frames too: 1009 `TOO_MANY_FRAGMENTS`). Violations close with 1002, 1007, 1003 (binary) or 1009; pings are answered with pongs; a client close is echoed. A violation closes the connection and discards messages parsed from the same TCP chunk before it: nothing unvalidated is ever recorded and a resume redelivers.

## Verify

Every command runs from the repository root in PowerShell. Nothing needs a package install, a network, a credential or a fixed port.

RED replay (the original behavioral failure, no implementation involved; expect 14 failing tests, nine `AssertionError` and five `TypeError` from reading a frame the stub never sent, see the note below, and exit code 1):

```powershell
$env:C026_RED_SUBJECT = 'capability\C026\evidence\red\stubs'
try { node --test capability\C026\evidence\red\behavior.initial.snapshot.cjs } finally { Remove-Item Env:\C026_RED_SUBJECT }
```

The retained initial tests use the `.snapshot.cjs` name so ordinary discovery skips them. The same file passes against the implementation (14 of 14):

```powershell
node --test capability\C026\evidence\red\behavior.initial.snapshot.cjs
```

Honest note on that RED: it was archived before any production file existed (`evidence\red\initial-red.*`, with the SHA-256 of every input). Nine of its 14 failures are `AssertionError`s about the specified behavior; five are `TypeError`s because the stub sends nothing and the initial tests read the last frame directly. `evidence\red\behavior.assertions.snapshot.cjs` restates exactly those five tests with explicit presence assertions. It was replayed against the **unchanged stubs after the implementation** (`evidence\red\supplement-red.*`: five `AssertionError`s, no `TypeError`), is labelled as a supplement and never replaces the original:

```powershell
$env:C026_RED_SUBJECT = 'capability\C026\evidence\red\stubs'
try { node --test capability\C026\evidence\red\behavior.assertions.snapshot.cjs } finally { Remove-Item Env:\C026_RED_SUBJECT }
node --test capability\C026\evidence\red\behavior.assertions.snapshot.cjs
```

GREEN (all focused suites; real sockets, an independent global `WebSocket` client, raw `node:net` peers, RFC 6455 vectors):

```powershell
node --test capability\C026\tests\framing.test.cjs capability\C026\tests\stream.test.cjs capability\C026\tests\server.test.cjs capability\C026\tests\conversation.test.cjs capability\C026\tests\page.test.cjs capability\C026\tests\surface.test.cjs
```

The fix publication (after the independent review, last section) adds seven suites. The glob runs all thirteen, 97 tests of which 25 are new (real sockets, two child processes with a 96 MB heap, about 45 s). `evidence-final.test.cjs` verifies the archived final runs, so it runs after they are indexed in `evidence.json`; the archived whole-suite GREEN is the other twelve files, 96 tests:

```powershell
node --test --test-concurrency=1 "capability\C026\tests\*.test.cjs"
```

RED replay of the fix. Two retained REDs (`evidence\red\fix-resource-limits-*`, `evidence\red\fix-refusal-close-*`, manifests and gzip transcripts written by the shared recorder with the SHA-256 of every input) ran against the production bytes of the first publication, commit `a878495a3528`. To replay them yourself, extract those bytes into an empty scratch folder outside the repository, copy the current tests over them and run the four RED suites there; expect 18 failing tests, every one an `AssertionError` (the second RED was archived after `framing.cjs` was fixed, disclosed in its manifest; the replay below is against fully unfixed bytes). Against the current files the same four suites pass unchanged (18 of 18, the `replay` run in `evidence.json`):

```powershell
git archive a878495a3528 capability/C026 capability/C001 | tar -x -C <scratch>
Copy-Item capability\C026\tests\*.cjs <scratch>\capability\C026\tests\ -Force
node --test --test-concurrency=1 <scratch>\capability\C026\tests\limits.test.cjs <scratch>\capability\C026\tests\hardening.test.cjs <scratch>\capability\C026\tests\heap-limit.test.cjs <scratch>\capability\C026\tests\refusal-close.test.cjs
```

Per-file coverage with the L-0004 command, one command per production file over every suite (85/85/85 for each; the table row of that file is the one to read). The archived runs use the same command over the twelve suites without `evidence-final.test.cjs`, which loads no production file:

```powershell
$suites = Get-ChildItem capability\C026\tests\*.test.cjs | ForEach-Object { "capability\C026\tests\$($_.Name)" }
foreach ($file in 'framing.cjs', 'stream.cjs', 'server.cjs', 'conversation.cjs', 'page.js') {
  node --test --test-concurrency=1 --experimental-test-coverage "--test-coverage-include=capability/C026/$file" --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 $suites
}
```

Per-file coverage, 85 lines / 85 branches / 85 functions for each enumerated production file (`framing.cjs`, `stream.cjs`, `server.cjs`, `conversation.cjs`, `page.js`; an unloaded file counts as 0%; `index.html` and `styles.css` are not measurable by Node and are disclosed, never counted). `page.js` is loaded under Node in a `vm` context with a DOM stub built from the ids of the real `index.html`:

```powershell
node capability\C026\tests\coverage.cjs
```

Syntax, then the real isolated headless Edge observation (take a heavy-run slot first when other agents are active):

```powershell
node capability\C026\tests\syntax.cjs
node capability\C026\tests\browser.cjs
```

`tests\record.cjs <red|green|initial|coverage|syntax|browser>` archives raw stdout, stderr, exit code and input SHA-256 (`red` writes immutable files under `evidence\red`, other stages under `evidence\raw\<stage>-<uuid>`). `CAPTURE_BROWSER_EVIDENCE=1 node capability\C026\tests\browser.cjs` writes the browser record and screenshot under `evidence\raw`; without it the browser run changes no file.

## Browser limit (read this)

The isolated browser helper blocks WebSockets, writes and foreign origins (`testing\browser\isolated.cjs`, see C020). The browser therefore **does not open a WebSocket here**. `GET /transcript.json` makes the server run a real WebSocket conversation against a private fixture instance (hello, acknowledgements, an abrupt disconnect, a resume with redelivery, completion, and forged probes) over real loopback sockets, and returns the recorded transcript with session ids aliased. The page fetches that transcript, **verifies it itself** (order, no gaps or duplicates, redelivery only of unacknowledged messages, acknowledgements only of sent messages, completion only after every acknowledgement, plus the required evidence and typed failures) and shows `VERIFIED` or `REJECTED`. A missing or unavailable transcript, and any alteration of what the page checks, is REJECTED and clears the display. The page checks: event numbering, first deliveries exactly 1, 2, 3, ... per session, redeliveries only of unacknowledged messages and never twice on one connection, acknowledgements only of sent messages in order with a matching cursor, resume and completion positions, no session welcomed twice, and the presence of an abrupt disconnect, a resume, a redelivery, a completion and the five required typed failures. It does **not** check message bodies, delivery counts above two, the frames the client sent, close codes, the `total`, `window` and `kind` labels, or whether a transcript came from a real conversation: a hand-written transcript with the right shape is shown as `VERIFIED`. The page is a display aid for a server-produced transcript, not a proof; the proof is the node:test suites over real sockets. After every load, recovery and retry the browser test scans the rendered table for repeated event ids and reconciles the message rows with the verified counts (`DOM_EVENT_IDS` lines in the archived browser run). The real-browser observation is of the transcript page, **not a browser WebSocket**; the WebSocket behavior itself is proved by the node:test suites against real sockets.

## Operating envelope

C001's design remains Node.js 24 LTS / Express / App Service Linux; this fixture's evidence records the test runtime separately. Every resource a client can make the fixture hold is bounded, and the numbers are in `limits` (exported by `server.cjs`): messages of at most 4096 bytes in at most 64 frames, at most 64 KiB of output a client has not read (past it the connection is dropped, its session stays resumable and the server emits a `limit` event `{ code: 'OUTBOUND_BACKLOG', limit }`; a close frame could not reach a client that does not read), at most 128 TCP connections (more are dropped at accept), a window of 3 and 32 sessions. Sessions are never released: after 32 `hello` frames in total a fixture instance answers `SESSION_LIMIT` until the process restarts (a restart also forgets every session: a resume then fails `SESSION_UNKNOWN`). There is no idle timeout on WebSocket connections: an idle connection stays until its peer closes it, `closeServer(server)` destroys it (it destroys every accepted socket, refused upgrades included) or the connection cap applies. The 426 answers carry `Upgrade: websocket` but not the `upgrade` connection option, because every refusal says `Connection: close`. No identity verification, server-enforced role or lease boundary, durable store, slot or container qualification, deployment, registration or spending exists here. Native OS, SKU, region, tenant, subscription and resource group remain unapproved. IaC is N/A. `imports.json` pins the two accepted C001 files used (`contract-guard.js` for the consent recheck, `approved-contract.js` in tests) by commit, tag and SHA-256.

## Files

`C026.feature` (specification, written first), `evidence.json` (index of every archived run with its command, exit code and SHA-256 values), `framing.cjs`, `stream.cjs`, `server.cjs`, `conversation.cjs`, `index.html`, `page.js`, `styles.css`, `imports.json`, `.gitattributes` (`* -text`: byte-exact files; raw captured evidence under `evidence\red\*.txt` and `evidence\raw\` is exempt from whitespace checks because raw tool output keeps its own trailing spaces), `tests\` (suites, `support.cjs`, `dom-stub.cjs`, `coverage*.cjs`, `browser.cjs`, `record.cjs`, `syntax.cjs`; the fix adds `limits-support.cjs`, `fixture-child.cjs`, `evidence-support.cjs` and the suites `limits`, `heap-limit`, `hardening`, `refusal-close`, `recovery`, `evidence`, `evidence-final`), `evidence\red\` (retained stubs, initial tests, the supplement and the archived raw RED; the fix adds the `fix-*` directories with the two retained fix REDs), `evidence\raw\` (archived GREEN, coverage, syntax and browser runs; the fix adds `fix-final-*`). `evidence.json` indexes all of them and `tests\evidence.test.cjs` recomputes every indexed hash. `tests\evidence-final.test.cjs` had one line corrected (the coverage row lookup) after the final runs; it is not one of them, so the input hash those manifests record for it is the earlier one.

## Independent review (rev-C026) and the fix

The independent reviewer found no way to forge, skip or repeat a sequence and rejected the first publication for two resource defects. Both are fixed at their root cause, each with a retained behavioral RED archived before the fix.

| Finding | Fix | Tests |
| --- | --- | --- |
| F1 memory: zero-length continuation frames were never counted | `framing.cjs`: at most 64 frames per message (`maxFragments`, empty frames count), 1009 `TOO_MANY_FRAGMENTS` | `limits` (parser and socket), `heap-limit` (reviewer's 1.8 million frame flood against a 96 MB fixture) |
| F1 memory: replies queued without bound for a client that never reads | `server.cjs`: 64 KiB output bound, drop plus `limit` event | `limits` (socket, session stays resumable), `heap-limit` (1.2 million pings, 96 MB) |
| F2: `closeServer` hung on a half-open refused upgrade | every accepted socket is tracked from `connection`; refusals end with `destroySoon` | `limits` (two tests) |
| m1 426 without `Upgrade` | both 426 answers carry `Upgrade: websocket` | `hardening` |
| m2 upgrade with a body accepted | 400 `UNEXPECTED_BODY` | `hardening`, `refusal-close` (endless chunked body) |
| m3 upgrade target authority and empty query | 400 `INVALID_URL`, 400 `INVALID_QUERY` | `hardening` |
| m4 long control frame in the 64-bit form was 1009 | 1002 `INVALID_CONTROL_FRAME` | `hardening` |
| m5 messages parsed before a violation in one chunk are discarded | left: safe (nothing unvalidated is recorded, the resume redelivers) and documented; fixing it changes the parser's return contract | none |
| m6 duplicate `welcome` accepted; README overclaim | page rejects `WELCOME_DUPLICATE`; the claim above is narrowed to what is checked | `hardening` |
| m7 sessions never freed, no connection cap | cap of 128 connections added; sessions stay bounded (32) and unreleased by design (resume needs them), documented | `limits` |
| m8 `evidence.json` and `evidence\raw` not test-verified | `tests\evidence.test.cjs` | itself |
| m9 coverage gate ignored `.mjs` | `[cm]?js` in the gate and the syntax check | none (no `.mjs` exists) |
| m10 archived RED input hashes stale for files edited after archiving | left: the first publication's evidence is immutable; the surface test pins the RED-relevant inputs, which match | `surface` |
| m11 wrong consumer path in the result record | corrected in the fix result record | none |

Controller lessons L-0117 to L-0121 applied: the duplicate and idempotency state survives every recovery path (`recovery` runs 40 seeded sequences of 160 operations that include abrupt disconnects, takeovers, typed failures, stale and forged cursors and server restarts, with a global invariant after every operation and a self-check that the invariant can fail); the rendered ids are unique and reconcile after every recovery click (DOM stub and real Edge, `DOM_EVENT_IDS` in the archived browser run); every refusal closes the connection (`refusal-close`); and the retained REDs were replayed against the final code, every assertion unchanged.

## U040: nothing pipelined behind a refusal (defect fix after audit U038; amends the accepted card)

The audit found that a valid `Upgrade` `GET /stream` plus a masked `{"type":"hello"}` frame pipelined in ONE TCP write behind any refused plain request created a hub session (`hub.sessionCount()` +1; 10 of the audit's 15 refusal variants, and the client saw `[404,101]` or `[200,101]`, so it could not read the refusal as an answer): Node emits `upgrade` for such a request although the refusal was just decided. No HTTP route changes anything, so the effect was a hub session. Now `server.cjs` marks the connection at decision time, synchronously: `closing`, a `WeakSet` filled inside `fail` with `request.socket` (never `response.socket`, which is null for an answer queued behind another one). The request handler and the `upgrade` listener drop everything on a marked connection without effect and WITHOUT destroying the socket: destroying cut off a refusal queued behind an earlier answer (`[G][R][M]` gave the client only the 200); the refusal says `Connection: close`, so Node ends the connection once it is flushed, and the client receives the earlier answers and the refusal, then a closed connection. Node's own answers go through the same path: `checkExpectation` (typed 417 `EXPECTATION_FAILED`), `checkContinue` (the handler decides: a refused request gets no `100 Continue`, a read without content is answered without one, which RFC 9110 allows), `requireHostHeader: false` (a request without Host is the typed 421 `LOCAL_HOST_REQUIRED`) and `clientError` (typed 400 `MALFORMED_REQUEST`, 408 `REQUEST_TIMEOUT`, 431 `HEADERS_TOO_LARGE`, ended after the flush; a socket that already carried an answer gets none). The one route that answers after an await, `/transcript.json`, marks its connection at dispatch and answers `Connection: close` on success and on failure: a request pipelined behind it cannot be ordered against it, so it is dropped, and a legitimate pipeline behind a transcript request loses its later answers (a valid GET followed by a valid upgrade is still served).

Proved by `tests\u040-pipelining.test.cjs` and `tests\u040-node-own.test.cjs` over 13 refusals (404, 405, 421, 403, 426, three 400 kinds, an invalid URL, a failing transcript, an unknown `Expect`, `Expect: 100-continue` and no `Host`) in six forms each, in both framings, in this process and in a separate node process, plus two live instances in one process (a refusal on one never touches the other; closed first-in-first-out, last-in-first-out and twice); 20 hand-chosen mutants of the added guard lines were all killed by named tests (a 21st is in `tests\u040-mutants.cjs`, not archived). The exact commands, the evidence under `evidence\u040`, the addendum mechanism and its limits are in `U040.md`. `server.cjs`, `README.md`, `tests\evidence-final.test.cjs` and `tests\coverage-gate.cjs` are superseded by `evidence-index-addendum-1.json`, which names the replaced bytes of each; `evidence.json` and every archive of the first and fix publications are unchanged.

What was and was not probed. Probed (raw sockets, the fixture in this process and in a separate node process): the refused request framed HTTP/1.1 and HTTP/1.0 with `Connection: keep-alive`, the upgrade framed HTTP/1.1 and HTTP/1.0, the pipelines `[R][M]`, `[G][R][M]`, `[R][T]` and `[G][R][T]` in one write (M a valid upgrade with a masked hello frame, G a valid read, T a read of `/transcript.json`), two writes (the second after the answer, and 5 ms later), `Content-Length` and chunked bodies, unknown and `100-continue` `Expect`, no `Host`, unparsable bytes, an h2c upgrade attempt (refused, never accepted), a refusal decided after an await (a failing transcript), a successful transcript, and 50 reads behind one refusal. Not probed: HTTP/2 (the HTTP/2 prior-knowledge preface; the listener is HTTP/1 `node:http`), TLS, proxies, `Keep-Alive` header parameters and any keep-alive negotiation beyond `Connection: keep-alive`, a real header flood and a real request timeout (the 431 and 408 answers are only exercised by emitting the parse error on the server with a stub socket, not by 16 KB of headers or a 5 s stall), and `[M][R]` (an upgrade followed by plain HTTP bytes: those bytes are WebSocket frames, a framing error, not a pipelined request). Unchanged and noticed: Node and this fixture accept a WebSocket upgrade in an HTTP/1.0 request (RFC 9110 says a server ignores `Upgrade` there); it is not behind a refusal and was left alone. Two timing facts: the 5 ms two-write variant of the audit is a race (the archived RED runs show 11 of 15 variants creating a session in this process and 10 of 15 in the separate process for `red-01`, and 10 and 10 for `red-02`: the one extra case is the 5 ms write arriving before the server closed the connection, which the fix also drops), and a client that writes after the server closed can make the OS reset the connection before it read the refusal, so that one form requires only that the answers received are a prefix of the expected ones.
