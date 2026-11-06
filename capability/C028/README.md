# C028: native gRPC stream fixture and driver port

A **synthetic, local-only, offline** H005/H006 fixture on `127.0.0.1` (automatic ports). It is **not the approved Node.js 24 LTS / Express / App Service Linux control API**: it uses Node built-ins only (`node:http2`, its own protobuf codec and its own gRPC message framing; no `@grpc/grpc-js`, no protobuf package, nothing installed), validates no production runtime, verifies no identity, stores nothing durable and makes **no Azure call**, no cloud call, no spend and no registration. All business data is synthetic. Node `v22` here is test tooling.

It proves **real protocol results**, not an HTTP substitute: HTTP/2 with `content-type: application/grpc`, the 5-byte message prefix (flag byte plus big-endian length), `:path` `/acme.ticker.v1.Ticker/<Method>`, request metadata, response HEADERS then DATA then TRAILERS with `grpc-status` and `grpc-message` (the Trailers-Only form for immediate errors), `grpc-timeout` deadlines, server streaming and bidirectional streaming, and honest status codes. A plain HTTP/1.1 request or a non-gRPC content type is refused and never answered as gRPC.

## The fictional service (all data synthetic)

```text
package acme.ticker.v1;
service Ticker {
  rpc Watch (WatchRequest) returns (stream Tick);   // server streaming
  rpc Chat  (stream Note)  returns (stream Echo);   // bidirectional
}
message WatchRequest { string topic = 1; uint32 count = 2; uint32 interval_ms = 3; uint32 payload_bytes = 4; }
message Tick  { string topic = 1; uint64 seq = 2; string body = 3; }
message Note  { string text = 1; }
message Echo  { string text = 1; uint64 seq = 2; uint32 received = 3; }
```

The **server owns every sequence number**: a request can never name the `seq` of a `Tick` or an `Echo`. `Watch` needs a topic `[a-z][a-z0-9-]{0,31}`, `count` 1 to 10000, `interval_ms` at most 10000 and `payload_bytes` at most 131072; `Chat` echoes `echo: <text>` with `seq` and `received` counters.

## Run it

```powershell
node capability\C028\server.cjs
node capability\C028\driver-cli.cjs http://127.0.0.1:<grpc-port> watch alpha 5
node capability\C028\driver-cli.cjs http://127.0.0.1:<grpc-port> watch alpha 10000 --cancel-after 3
node capability\C028\driver-cli.cjs http://127.0.0.1:<grpc-port> chat hello world
```

`server.cjs` rechecks the current C001 local-probe consent (`approvals.C001`, read-only, SHA-pinned), binds **only `127.0.0.1` on two automatic ports** (an HTTP/1.1 listener for the transcript page and the gRPC listener), prints one JSON line with both origins and the process ID, and accepts no host, port, limit, identity or deployment override. Stop it with Ctrl+C; automation closes its exact returned handles. `driver-cli.cjs` rechecks the same consent before it opens any connection, accepts only `http://127.0.0.1:<port>`, prints one JSON report line and exits **0 only when the report is ok**, 1 for any other outcome (a refused call, a cancel, a deadline, a violation) and 2 for usage, consent or connection failures.

## Protocol rules proved by the tests

| Area | Rule |
| --- | --- |
| Transport | cleartext HTTP/2 with prior knowledge. Anything that does not start with the HTTP/2 preface (a plain HTTP/1.1 request, garbage, `PRI * HTTP/1.1`) gets an HTTP/1.1 `505` and no gRPC bytes; a silent connection is cut after `firstByteTimeoutMs`. |
| Refusals | method other than POST: HTTP `405` with `allow: POST`; content type other than `application/grpc` or `application/grpc+proto` (`application/json`, `application/grpc+json`, `grpc-web`, none): HTTP `415`. Neither carries `grpc-status`. |
| Trailers-Only | one HEADERS frame with `:status 200`, `content-type`, `grpc-status`, a percent-encoded `grpc-message` and END_STREAM, no DATA: unknown method `UNIMPLEMENTED`(12), unsupported `grpc-encoding` `UNIMPLEMENTED` with `grpc-accept-encoding: identity`, malformed protobuf, bad prefix flag, compressed flag, truncated message, invalid field values, malformed `grpc-timeout`, missing request message and bad `x-client-tag` `INVALID_ARGUMENT`(3), an oversized length prefix `RESOURCE_EXHAUSTED`(8) before any payload is buffered, too many concurrent calls `RESOURCE_EXHAUSTED`, a draining server `UNAVAILABLE`(14). |
| Streams | HEADERS (with the server-owned `x-fixture-scope` stamp), ordered DATA frames behind 5-byte prefixes, TRAILERS with `grpc-status`. A second request message on a server-streaming call fails after the headers with `INVALID_ARGUMENT` trailers. |
| Deadlines | `grpc-timeout` is 1 to 8 digits plus `H M S m u n`; the server arms a timer, stops producing and sends `DEADLINE_EXCEEDED`(4) trailers. The driver adds its own deadline (`DEADLINE_EXCEEDED`, origin `client-deadline`) and resets the stream. |
| Cancel | a client `RST_STREAM` ends the call as `CANCELLED`(1) on the server (`finishedBy: client-reset`); the producer is woken, its timer is cleared and nothing is written afterwards (`writesAfterFinish` stays 0). |
| Flow control | `write()` returning false makes the server wait for `drain` (`backpressureWaits`, `backpressure` event); a slow consumer stalls the stream and every message still arrives once and in order. Chat applies the same to the request side. |
| Limits | `maxActiveCalls` (64), `maxConnections` (128, extra connections are dropped), `maxRequestBytes` (16384), `maxResponseBytes` (1 MiB), `maxConcurrentStreams` (32, the surplus is refused with `REFUSED_STREAM`, which the driver reports `UNAVAILABLE`), `requestTimeoutMs` (a stream that never sends its request ends `DEADLINE_EXCEEDED`), `maxCallRecords`. A valid but enormous `grpc-timeout` (up to `99999999H`) is clamped to the largest Node timer delay instead of wrapping to 1 ms. The driver CLI sends a 30 second deadline unless `--timeout-ms` says otherwise. |
| Lifecycle | `drain()` refuses new calls and waits for calls in flight; `abort()` ends calls with `UNAVAILABLE` trailers and closes sessions gracefully; `close()` cuts whatever is still silent after `closeGraceMs`. |

Status choice, stated plainly: a malformed **client** message (bad protobuf, bad prefix flag, truncated frame, compressed flag without negotiation) is `INVALID_ARGUMENT` here, as the work order asks; many real servers answer `INTERNAL` for framing violations. Handler failures are `INTERNAL` with a generic message (never the exception text); a handler can end a call with any status through `GrpcError`. The request header `te: trailers` is not required (grpc-go does not require it either).

## The driver never reports success without the evidence

`connect(origin, { timers, maxMessageBytes, maxMessages })` returns a client; `client.call(path, request, { timeoutMs, metadata })` returns `{ result, messages(), cancel(), write(), end() }`. `call.result` always resolves with a report (it never rejects for a gRPC or transport failure) holding `ok`, `outcome`, `status { code, name, message, origin }`, `violations`, `httpStatus`, `trailersOnly`, `headers`, `trailers`, `messages` in arrival order, `messageCount`, `rstCode` and an ordered wire `events` log. **`ok` is true only when** the status came from server TRAILERS (or a Trailers-Only HEADERS frame), is OK and there is no violation. Violations it detects: `TRAILERS_MISSING`, `TRUNCATED_MESSAGE`, `MESSAGE_MALFORMED`, `BAD_PREFIX`, `COMPRESSED_MESSAGE`, `MESSAGE_TOO_LARGE`, `TOO_MANY_MESSAGES`, `HTTP_STATUS`, `CONTENT_TYPE`, `STATUS_IN_HEADERS_WITH_BODY`, `STATUS_MISSING`, `STATUS_INVALID`, `STREAM_RESET`, `TRANSPORT_CLOSED`. HTTP and HTTP/2 failures map to gRPC statuses by the protocol table (400 `INTERNAL`, 401 `UNAUTHENTICATED`, 403 `PERMISSION_DENIED`, 404 `UNIMPLEMENTED`, 429/502/503/504 `UNAVAILABLE`, other `UNKNOWN`; `REFUSED_STREAM` `UNAVAILABLE`, `CANCEL` `CANCELLED`, `ENHANCE_YOUR_CALM` `RESOURCE_EXHAUSTED`, other resets `INTERNAL`). `status.origin` says who concluded what: `server-trailers`, `client-cancel`, `client-deadline`, `client-validation`, `protocol-violation`, `http-status`, `server-reset` or `transport`. The driver connects only to `http://127.0.0.1:<port>`; messages whole before a violation are still delivered in order.

Hostile servers are raw `node:http2` servers built inside the tests; the fixture itself has no misbehaviour switch.

## Verify

Every command runs from the repository root in PowerShell. Nothing needs a package install, a network, a credential or a fixed port. Quote the skip patterns (`$` belongs to the regex).

**RED replay** (the original behavioral failure; no implementation involved; the subject is an ordinary HTTP/2 substitute that answers every stream `200 application/json` without trailers, plus a driver that says ok when a stream closes). Expect 36 failing tests, every one an `AssertionError`, and exit code 1:

```powershell
$env:C028_RED_SUBJECT = 'capability\C028\evidence\red\stubs'
try { node --test --test-concurrency=1 capability\C028\evidence\red\primitives.initial.snapshot.cjs capability\C028\evidence\red\wire.initial.snapshot.cjs capability\C028\evidence\red\lifecycle.initial.snapshot.cjs capability\C028\evidence\red\driver.initial.snapshot.cjs capability\C028\evidence\red\faults.initial.snapshot.cjs } finally { Remove-Item Env:\C028_RED_SUBJECT }
```

The raw RED is archived under `evidence\red\red-0af99cd2-d204-417c-b34e-bc9c1ed37c2a` (`stdout.txt.gz`, `stderr.txt.gz`, exit code, parsed counts and the SHA-256 of every input in `run.json`). It is immutable: `tests\record.cjs` writes a new directory per run with flag `wx`.

**Honest note on that RED.** When the implementation first ran against the retained initial tests, 33 of 36 passed and three failed. Two of the three tests were mis-specified: `... sends a prefix that promises too much` declared 100 bytes while the same test configured a 64-byte limit (the correct finding is `MESSAGE_TOO_LARGE`), and `... resets the stream` closed the stream one event-loop turn after writing, which Node ends gracefully, so the client really saw a clean END_STREAM. They are **kept unchanged and skipped by exact name** in the replays below, and `evidence\red\faults.supplement.snapshot.cjs` restates them (and two more reset cases) correctly. The supplement was replayed against the unchanged stubs after the implementation (`evidence\red\supplement-red-ef22ace5-4d5c-487f-957d-f0b797deec20`: four `AssertionError`s, exit 1):

```powershell
$env:C028_RED_SUBJECT = 'capability\C028\evidence\red\stubs'
try { node --test --test-concurrency=1 capability\C028\evidence\red\faults.supplement.snapshot.cjs } finally { Remove-Item Env:\C028_RED_SUBJECT }
```

The third failure (`promises too little`) was a real implementation gap: the reader threw on the bad prefix that follows a short message instead of delivering that message first. It was fixed in `grpc.cjs` (whole messages that precede a violation are delivered, then the failure is sticky) and the original test passes unchanged.

**GREEN** (retained initial tests plus every suite; real sockets, raw `node:http2` clients and hostile servers, manual time for deadlines and pacing, event-driven waits):

```powershell
node --test --test-concurrency=1 '--test-skip-pattern=sends.a.prefix.that.promises.too.much$' '--test-skip-pattern=when.the.server.resets.the.stream$' capability\C028\evidence\red\*.snapshot.cjs capability\C028\tests\*.test.cjs
```

**Per-file coverage**, 85 lines / 85 branches / 85 functions for each of the 14 enumerated production files (`call.cjs`, `driver-call.cjs`, `driver-cli.cjs`, `driver.cjs`, `front.cjs`, `grpc-server.cjs`, `grpc.cjs`, `page.js`, `protobuf.cjs`, `report.cjs`, `server.cjs`, `service.cjs`, `timers.cjs`, `transcript.cjs`; an unloaded file counts as 0%; `index.html` and `styles.css` are not measurable by Node and are disclosed, never counted). It runs the L-0004 command **once per file** (four at a time, about one minute); `page.js` is loaded in a `vm` context with a DOM stub built from the ids of the real `index.html`:

```powershell
node capability\C028\tests\coverage.cjs
```

**Syntax**, then the **real isolated headless Edge observation** (take a heavy-run slot first when other agents are active; no file is written unless `CAPTURE_BROWSER_EVIDENCE=1`):

```powershell
node capability\C028\tests\syntax.cjs
node capability\C028\tests\browser.cjs
```

`tests\record.cjs <red|supplement-red|initial|green|coverage|syntax|browser>` archives raw stdout and stderr (gzip), the exit code, parsed counts and input SHA-256 under `evidence\red\<stage>-<uuid>` or `evidence\raw\<stage>-<uuid>`. `evidence.json` indexes every archived run; `node capability\C028\tests\verify-evidence.cjs` cross-checks that index against the archives (exit codes, stdout SHA-256, counts, the 14 coverage rows and their raw per-file transcripts). Reviewer probes worth trying against the live fixture: an HTTP/1.1 request or `Upgrade: h2c` to the gRPC port, a non-gRPC content type, a stream that never sends its request, an oversized prefix, a `grpc-timeout` of `0m`, `5s` or `99999999H`, `RST_STREAM` mid-stream, a client that stops reading, 80 streams on one connection.

## Browser limit (read this)

Browsers cannot speak native gRPC (no HTTP/2 trailers, no request streaming control), and the isolated browser helper allows only same-origin read-only GET. The page therefore **does not call gRPC**. `GET /transcript.json` makes the server run a real gRPC conversation against a private fixture instance, with the real driver, over real loopback HTTP/2 sockets, paced by manual time so the transcript is reproducible: five ordered ticks and OK trailers, a bidirectional chat, a call the client cancels after three ticks (the server record shows `CANCELLED`, `client-reset`, 3 produced, nothing written afterwards), a call whose `grpc-timeout` expires after three ticks (`DEADLINE_EXCEEDED` trailers), an unknown method (Trailers-Only `UNIMPLEMENTED`), an invalid argument, an oversized message the driver refuses, and three requests that must be refused (plain HTTP/1.1, HTTP/2 with `application/json`, HTTP/2 GET). The page fetches that transcript, **verifies it itself** (event order, server-owned sequence numbers 1, 2, 3, ok only with OK trailers, the final status against the trailers, a cancel the server confirmed, a deadline the server record confirms, refused probes) and shows `VERIFIED` or `REJECTED`; a missing, altered or unavailable transcript is REJECTED and clears the display. The real-browser observation is of **a transcript page, not native gRPC**; the gRPC behavior itself is proved by the node:test suites against real sockets. The browser test also shows that a native gRPC `fetch` from the page is blocked and that the strict CSP (`script-src 'self'`, no inline script) blocks an injected script.

## Operating envelope

C001's design remains Node.js 24 LTS / Express / App Service Linux; this fixture's evidence records the test runtime separately. The fixture bounds calls, message sizes, concurrent streams and idle connections, and has no authentication: it is a loopback test double, not a service. No identity verification, server-enforced role or lease boundary, durable store, slot or container qualification, deployment, registration or spending exists here. Native OS, SKU, region, tenant, subscription and resource group remain unapproved. IaC is N/A. `imports.json` pins the two accepted C001 files used (`contract-guard.js` for the consent recheck, `approved-contract.js` in tests) by commit, tag and SHA-256.

## Files

`C028.feature` (specification, written first), `evidence.json`, production: `protobuf.cjs`, `grpc.cjs`, `service.cjs`, `front.cjs`, `call.cjs`, `grpc-server.cjs`, `report.cjs`, `driver-call.cjs`, `driver.cjs`, `driver-cli.cjs`, `timers.cjs`, `transcript.cjs`, `server.cjs`, `index.html`, `page.js`, `styles.css`; `imports.json`; `.gitattributes` (`* -text`: byte-exact files; `evidence/**` is exempt from whitespace checks); `tests\` (suites, `support.cjs`, `dom-stub.cjs`, `fixtures\ledger-preload.cjs`, `coverage*.cjs`, `browser.cjs`, `record.cjs`, `syntax.cjs`, `verify-evidence.cjs`); `evidence\red\` (retained stubs, initial snapshots, the supplement and the archived RED runs); `evidence\raw\` (archived GREEN, coverage, syntax and browser runs).
