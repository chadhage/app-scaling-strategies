# C026: sequenced WebSocket fixture

A **synthetic, local-only, offline** H005 fixture on `127.0.0.1` (automatic port). It is **not the approved Node.js 24 LTS / Express / App Service Linux control API**: it uses Node built-ins only (`node:http` upgrade plus its own RFC 6455 framing, no `ws` package, nothing installed), validates no production runtime, verifies no identity, stores nothing durable and makes **no Azure call**, no cloud call, no spend and no registration. All business data is synthetic. Node `v22` here is test tooling.

The server **owns every sequence number**. A client may only say `hello`, `resume` with a cursor, or `ack` the next message the server already sent.

## Run it

```powershell
node capability\C026\server.cjs
```

The CLI rechecks current C001 local-probe consent (`approvals.C001`, read-only), binds only `127.0.0.1` on an automatically assigned port, prints one JSON line with the exact origin and process ID, and accepts no host, port, stream size, identity or deployment override. Open the origin in a browser and press **Load server-produced transcript**. Stop it with Ctrl+C. Automation must close its exact returned server handle (`closeServer(server)`).

Routes: `/` (page), `/page.js`, `/styles.css`, `/scope.json` (observed tooling plus explicit non-qualification flags), `/transcript.json` (see the browser limit), `/stream` (WebSocket only; a plain GET is 426). Foreign Host or Origin headers, queries, writes and bodies fail explicitly.

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
- Framing: client frames must be masked, reserved bits zero, control frames final and at most 125 bytes, lengths minimal, text valid UTF-8, messages at most 4096 bytes. Violations close with 1002, 1007, 1003 (binary) or 1009; pings are answered with pongs; a client close is echoed.

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

The isolated browser helper blocks WebSockets, writes and foreign origins (`testing\browser\isolated.cjs`, see C020). The browser therefore **does not open a WebSocket here**. `GET /transcript.json` makes the server run a real WebSocket conversation against a private fixture instance (hello, acknowledgements, an abrupt disconnect, a resume with redelivery, completion, and forged probes) over real loopback sockets, and returns the recorded transcript with session ids aliased. The page fetches that transcript, **verifies it itself** (order, no gaps or duplicates, redelivery only of unacknowledged messages, acknowledgements only of sent messages, completion only after every acknowledgement, plus the required evidence and typed failures) and shows `VERIFIED` or `REJECTED`. A missing, altered or unavailable transcript is REJECTED and clears the display. The real-browser observation is of the transcript page, **not a browser WebSocket**; the WebSocket behavior itself is proved by the node:test suites against real sockets.

## Operating envelope

C001's design remains Node.js 24 LTS / Express / App Service Linux; this fixture's evidence records the test runtime separately. The fixture bounds sessions (32), the window (3) and client message size (4096 bytes) but sets no idle timeout on WebSocket connections. No identity verification, server-enforced role or lease boundary, durable store, slot or container qualification, deployment, registration or spending exists here. Native OS, SKU, region, tenant, subscription and resource group remain unapproved. IaC is N/A. `imports.json` pins the two accepted C001 files used (`contract-guard.js` for the consent recheck, `approved-contract.js` in tests) by commit, tag and SHA-256.

## Files

`C026.feature` (specification, written first), `evidence.json` (index of every archived run with its command, exit code and SHA-256 values), `framing.cjs`, `stream.cjs`, `server.cjs`, `conversation.cjs`, `index.html`, `page.js`, `styles.css`, `imports.json`, `.gitattributes` (`* -text`: byte-exact files; raw captured evidence under `evidence\red\*.txt` and `evidence\raw\` is exempt from whitespace checks because raw tool output keeps its own trailing spaces), `tests\` (suites, `support.cjs`, `dom-stub.cjs`, `coverage*.cjs`, `browser.cjs`, `record.cjs`, `syntax.cjs`), `evidence\red\` (retained stubs, initial tests, the supplement and the archived raw RED), `evidence\raw\` (archived GREEN, coverage, syntax and browser runs).
