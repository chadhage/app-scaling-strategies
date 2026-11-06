# C009: server-side visitor, conductor and operator mutation permissions

Local, synthetic, offline fixture. It is NOT the approved Node 24 + Express + Entra control API and NOT an identity service.
Four fake in-memory identities (`visitor`, `conductor-a`, `conductor-b`, `operator`) present opaque bearer tokens to a loopback
HTTP server (127.0.0.1, automatic port, Node built-ins only). No Entra, no cloud, no registration, no IaC, no spend
(`liveAzureRuns` 0, `authorizedCloudSpend` 0). Tested runtime: Node v22.23.4. Specification: `C009.feature`.

## What the server enforces

- Mutations are POST commands (`/v1/commands/<name>`); reads and the authorization preview (`/v1/authorization/preview?command=<name>`) are GET.
- Identity comes only from the verified token. Role, subject or owner claims in headers or the query are ignored and reported by header name;
  a body that names one is refused (400 `IDENTITY_CLAIM_REJECTED`).
- A presented credential is always verified, never read as anonymous: none 401 `AUTHENTICATION_REQUIRED`, malformed or duplicated
  401 `TOKEN_MALFORMED`, never issued here 401 `TOKEN_UNKNOWN`, ended 401 `TOKEN_EXPIRED`. None of them degrades to a visitor.
- The command x role table is deny by default and consulted before any input is read: unlisted command 404 `COMMAND_UNKNOWN`,
  an entry without roles 403 for everyone, wrong role 403 `ROLE_FORBIDDEN`. Roles do not inherit.
- The decision is repeated where the effect is committed (a token that expires while queued has no effect); commands are linearized.
- A refused command changes nothing (state and revision are identical) and is audited with the server-derived subject and role.
- Every error answer is final (one place: `http-io.cjs`): `Connection: close`, reading stops in the same tick that decides the refusal,
  Node ends the connection once the answer is flushed, and a request pipelined behind it never runs. Before this, a refused request
  left its connection open and its body unread, so one client without any credential streaming an endless `Transfer-Encoding: chunked`
  body of 1-byte chunks (one parser callback each) blocked the server for 8 to 10 s (review finding F1, L-0120). The unsupported
  `Expect` that Node answers with a bare 417 goes through the same path (`EXPECTATION_FAILED`). A request body is cut at the 4096-byte limit.
- Resource bounds (`contract.js` `limits`): body 4096 B, audit log 200 identified records plus a separate ring of 50 anonymous refusals,
  token lifetime 10 min (max 15), 5 s idle socket, 256 connections, 4 requests in flight per socket, 1000 state entries (409 `STATE_FULL`)
  of which one identity may hold 400 (409 `OWNER_QUOTA_FULL`; two conductors plus the operator's three approvals always fit),
  5 s header and request timeouts checked every second (`connectionsCheckingInterval`: Node checks them only every 30 s by default, so
  a client trickling one byte every 2 s was cut after about 30 s), Node's 16 KB header limit (431). `app.close()` ends every accepted socket.
- The pipelining guard cuts a client past 4 requests in flight for body-less requests only. Node dispatches pipelined requests that carry
  a body one at a time, so the guard is never exercised there (50 pipelined authorized POSTs are 50 answers and 50 applied commands).

Files: `contract.js` (identities, command x role table, input rules), `authz.cjs` (tokens, decision), `commands.cjs` (mutation pipeline),
`handlers.cjs`, `ledger.cjs`, `queue.cjs`, `codes.cjs`, `http-io.cjs`, `server.cjs`, `cli.cjs` (CLI, rechecks the current C001 consent
and fails closed), `index.html` + `page.js` + `style.css` (inspection page, strict CSP, no inline script), `imports.json` (pinned accepted C001 bytes).

## Commands (repository root, PowerShell 7; run test files one at a time under a timeout when in doubt)

GREEN, every non-browser test (21 files; 1 to 3 minutes depending on the load of the machine):

    node --test --test-timeout=60000 --test-concurrency=1 "capability/C009/tests/*.test.cjs"

Per-file coverage, 85 lines / 85 branches / 85 functions for each of the 11 production files, unloaded counts as 0%
(one L-0004 command per file, 3 at a time, about 3.5 minutes: take a heavy slot):

    node capability\C009\tests\coverage.cjs

The command it runs for one file (here `server.cjs`):

    node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=**/C009/server.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability/C009/tests/*.test.cjs

Real isolated headless Edge (heavy slot, about 60 s, writes nothing; leave CAPTURE_BROWSER_EVIDENCE unset). It first calls `qualifyEdge()` of
`testing\browser\qualify` (no equality pin): the installed Edge must carry a valid Microsoft Corporation Authenticode signature and a
major listed in `testing\browser\qualify\qualified.json`, and the launched browser must have that major. It then opens the page through
`openIsolatedLoopback`, pastes each identity, a forged, an expired and a malformed token, selects claimed roles, and compares every row the
page shows with the server's decision; it prints PASS lines and `C009 BROWSER OK`:

    node capability\C009\tests\browser.cjs

RED replay against the retained naive stubs (each exits 1 with assertion failures about the specified behavior):

    $env:C009_SUBJECT_DIR = 'capability\C009\evidence\red\stub'
    node --test --test-concurrency=1 capability\C009\tests\authz.test.cjs capability\C009\tests\server.test.cjs capability\C009\tests\page.test.cjs
    node --test --test-concurrency=1 capability\C009\tests\cli.test.cjs
    Remove-Item Env:C009_SUBJECT_DIR

Archive integrity of every retained RED run (hashes of the raw streams and of the stubs):

    node --test capability\C009\tests\red-archive.test.cjs

The RED replay counts of the first publication are timing dependent: the stub page test polls 400 timers of 5 ms per open (about 6 s
each on Windows) and meets the 60 s file timeout, so the independent review saw 75 of 81 and 78 of 84 failing, not the 73 of 79 the
first result file states. Exit code 1 and the behavioral reasons are stable.

### Fix cycle after the independent review (order R8)

The independent review found no authorization bypass and two majors (F1, F2) plus five minors (F3 to F7). The fix is test first.
The NEW RED archives are `evidence\red\fix-*`; the run-01 to run-08 archives, the stubs and every first-publication archive are
immutable. Replay a new RED against the first-publication bytes (it fails) and on the final code (it passes unchanged):

    git archive --format=tar -o <scratch>\p.tar 7a2a920cff9ccb76d288779b55d240883881025c capability/C009 capability/C001
    tar -xf <scratch>\p.tar -C <scratch>
    $env:C009_SUBJECT_DIR = '<scratch>\capability\C009'
    node --test --test-concurrency=1 capability\C009\tests\refusal-close.test.cjs    # also quota, timeouts, refusal-flood: exit 1
    Remove-Item Env:C009_SUBJECT_DIR
    node --test --test-concurrency=1 capability\C009\tests\refusal-close.test.cjs    # final code: exit 0

The F2 RED is not deterministic (about 5 percent of the loaded runs): `evidence\red\fix-resource-heap-*` holds 2 failures in 40 runs of the
unchanged first-publication test (8 in parallel, 5 rounds, retained heap 28.5 MB against the 24 MB limit). Flake loops (take a heavy
slot; each prints every failing run and a `FLAKE HUNT` line):

    node capability\C009\tests\flake-loop.cjs . resources.test.cjs 8 8
    node capability\C009\tests\flake-loop.cjs . refusal-flood.test.cjs 8 4

`node --test capability\C009\tests\fix-evidence.test.cjs` recomputes every hash of the new archives (raw streams, manifests, the bytes of
the pinned inputs) and proves by tampering in memory that a flipped byte, a truncated stream, a forged manifest hash and an edited test
are detected; once `evidence\green-fix` exists it also demands every coverage row at 85/85/85, the suite and the browser transcript.

The browser helper permits only GET and HEAD to the exact origin. The page therefore observes every server decision live through the GET
preview, and the POST behind "Send" is observed as blocked ("not sent", revision still 0). Real POST outcomes are proven over real
loopback sockets by the Node suites (`server`, `hostile-*`, `cli`, `findings`, `connections`, `resources`).

## Hostile probes (own, extending the specification)

- `hostile-credentials`: forged, truncated, huge (10 KB), unicode look-alike (Cyrillic, NBSP, hyphen variants), duplicated or wrong-scheme
  Authorization; tokens in the query, body, cookie or other headers; claimed roles in headers, query and body for every identity.
- `hostile-requests`: method override headers and query switches, command names (`__proto__`, `constructor`, prefixes, case, encodings),
  parallel clients of every role, conflicting framing, header floods, forged Host and Origin.
- `hostile-extra`: prototype-pollution bodies, 20 concurrent approvals (exactly one wins), preview parity for hostile names,
  request targets (fragment, absolute form, protocol-relative, dot segments, trailing slash, matrix parameter, lowercase and unknown
  methods), a token replayed on another server.
- `connections` and `resources` (resource attacks, bounded): `resources` runs the real CLI shutdown in a child process with
  `--max-old-space-size=48 --expose-gc` under a hard timer (killed by PID) and attacks it with 16 never-reading pipelined floods (1.1 MB each),
  220 silent, partial-line, partial-header, half-written-body and half-closed sockets, a 1 MB header flood and an endless chunked upload.
  After each attack the retained heap must stay under 24 MB (baseline about 5 MB), a normal client and an authorized command must still work,
  state must be unchanged, `close` must resolve with the attackers still connected and the process must exit by itself with code 0.
  `connections` checks the idle drop, the connection cap, the pipelining cut and `app.close()` with silent, partial, upgrade-asking,
  `CONNECT`, half-closed and never-read sockets (the sibling attacks of the C026 review findings F1 and F2).
- `limits`: the entry bound; `findings`, `branches-*`, `page`, `cli*`, `imports` cover the remaining branches and the consent recheck.
- After the independent review (F1 to F5): `refusal-close` sends one request per typed refusal code (the keys of `codes.cjs`; a code
  without a row fails the table) with a follow-up request pipelined behind it and demands one answer, `Connection: close`, a connection
  the server ends, no state change, and that a permitted command pipelined behind a refusal never runs; `refusal-flood` runs the attacker
  in its OWN process against a small-heap server child that measures its own event-loop delay (`perf_hooks`): one client streaming endless
  1-byte chunks at a refusal (401, 403, GET with a body 400, unknown `Expect` 417) must neither stall the loop (limit 1.2 s; a stalled
  server measured 3 to 10 s) nor starve a concurrent GET nor stay connected, and the authorized control (413) must be cut off;
  `quota` covers the per-owner quota and the anonymous audit ring; `timeouts` trickles a header and a body one byte at a time;
  `resources` now measures the retained heap by polling forced-GC readings until the whole attack was accepted and one is below the limit
  (L-0144) and keeps a negative control that retained memory is still seen; `fix-evidence` recomputes the new archives.

## Evidence

`evidence\red\run-01` to `run-08` (record.json, raw gzip streams, SHA-256 of every input; immutable). run-01 and run-02 ran the specification
tests against the stubs in `evidence\red\stub` (78 and 6 assertion failures); run-03 to run-08 are findings against the then-current
production code and are not replayable after their fixes: run-03 (a forged or expired token must not ride along on a public GET; a thrown
non-Error must fail closed with a typed 500), run-04 (first attempt at the
connection tests: its pipelining counter used an unanchored multiline regex and passed vacuously) and run-05 (corrected: pipelined flood
kills a 48 MB server process, no idle drop, no cap, no `app.close`), run-06 (a request target with a fragment was executed),
run-07 (first attempt at the entry bound failed by a TypeError instead of an assertion) and run-08 (corrected: no `STATE_FULL`).
`evidence\green` holds the archived GREEN run, one coverage run per production file and the real-Edge transcript
(`node RUN\scripts\archive-run.cjs` manifests plus raw gzip streams). `evidence\.gitattributes` keeps every evidence byte exact (`* -text -diff`).
The first publication had 16 `*.test.cjs` files and 139 tests (the result file said 17); the fixed namespace has 21 files and 195 tests.

Fix cycle (order R8): `evidence\red\fix-refusal-close-*` (33 of 35 fail), `fix-refusal-flood-dfe818f3-*` (the final test bytes against the
first-publication production files, 6 of 6 fail: the event loop is blocked 2.7 to 3.2 s), `fix-quota-ring-*` (6 of 6),
`fix-timeouts-28631ef6-*` (3 of 3) and `fix-resource-heap-*` (the F2 flake, 2 of 40). `fix-refusal-flood-720df817-*` and `-24ff8e0e-*`
are earlier attempts of the flood test (more classes, a longer attack, a control bound that did not hold under load) and
`fix-timeouts-9e787b44-*` is the first timeouts run (it asserted the 408 answer, which a reset can discard): retained and superseded.
`evidence\green-fix` holds the captures of the FINAL bytes: the whole suite, one coverage run per production file, the replay of every new RED on the final code,
and the real-Edge transcript with the signature and qualified-major assertion. Captures were taken last; nothing differs from its pin.

## Decisions and limits

- The CLI prints the four synthetic tokens on one JSON line so a person can paste them into the page; they live only in that process
  and end with the listener (10 minutes at most or SIGINT/SIGTERM). The CLI reads the live ledger once to recheck the C001 consent;
  tests inject the committed approval instead.
- `tests\coverage.cjs` is test tooling and not counted as production code; `page.js` is measured under the DOM stub built from the ids
  of the real `index.html`.
- This fixture proves server-side enforcement against hostile local clients. It makes no claim about Express, Entra tokens,
  TLS, rate limiting by identity, or any native Azure behavior.
- READS ARE PUBLIC BY DESIGN (note for C010, review F7): `GET /v1/state` and `/scope.json` need no token, so every owner subject and
  every run, scratch and approval of every conductor is readable by anyone, including anonymous clients. Per-owner read isolation is
  NOT provided here and must not be assumed; the preview returns only the caller's own role and subject.
- The state bound is global (1000 entries) and also per identity (400): a conductor that fills its share gets 409 `OWNER_QUOTA_FULL` and
  cannot starve the other conductor or the operator's approvals (review F4). Anonymous refusals have their own audit ring (50 records),
  so they cannot evict the denial of an identified subject; the log is only readable in process, no route serves it (review F5).
- Honest limits of the connection close: an unread body is still parsed up to one read of at most 64 KB before the refusal takes effect (a
  1-byte chunk costs a JS callback each, about 50 ms per refused connection), so a client that RECONNECTS in a loop can still keep the
  event loop busy: the fixture has no per-client rate limit (every client is 127.0.0.1), and a production service needs one in front.
  An AUTHORIZED command reads its body up to the 4096-byte limit, so one authorized client can cost the server up to about one 64 KB parse
  per connection (0.5 to 2 s on a loaded machine, bounded and cut off, the control of `refusal-flood`). A client that streams a large body
  at a refused request may see a reset instead of the answer; small requests, whose bytes were all read, always get the answer.
  `socket._handle.readStop()` is a Node internal, used because every public way to stop reading (`socket.pause()`, a `Connection: close`
  alone, destroying on the flush callback) left the loop blocked for 3 to 10 s in the review's experiments; the cross-process test fails
  if a Node update stops it from working.
