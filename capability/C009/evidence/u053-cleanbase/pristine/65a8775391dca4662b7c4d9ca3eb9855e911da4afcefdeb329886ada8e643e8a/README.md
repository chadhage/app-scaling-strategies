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
- Every error answer is final (one place: `http-io.cjs`, the reference implementation for importers, see below): `Connection: close`, the
  SOCKET of the request is marked and reading stops in the very tick that decides the refusal (also when the refusal is decided after
  an await, and also when the response is queued behind an unfinished pipelined one), Node ends the connection once the answer is
  flushed, and NOTHING behind the refusal ever runs: the requests of one connection are served one at a time, in order (per-connection
  lanes), a refusal drops everything queued behind it and everything that arrives later on that socket, and the requests before it are
  still answered. This holds in the same TCP write and in a later one, for HTTP/1.1 and for HTTP/1.0 (the guard is the mark of the
  socket, never `maxRequestsPerSocket`: Node does not apply it to HTTP/1.0 and its own no-Host 400 does not advance it). Before this, a
  refused request left its connection open and its body unread, so one client without any credential streaming an endless
  `Transfer-Encoding: chunked` body of 1-byte chunks (one parser callback each) blocked the server for 8 to 10 s (review finding F1,
  L-0120), and a refusal queued behind ONE pipelined GET kept the connection open and let the mutation pipelined behind it run (F1b).
  A request body is cut at the 4096-byte limit.
- What Node answers by ITSELF goes through the same path (rev-C017 F11): an unknown `Expect` (`checkExpectation`, 417), a request without
  `Host` (`requireHostHeader: false`, so `localGuard` answers the typed 421 instead of Node's bare 400, also for HTTP/1.0), a parse
  error, an oversized header and a timeout (`clientError`: typed 400 `REQUEST_MALFORMED`, 431 `HEADERS_TOO_LARGE`, 408 `REQUEST_TIMEOUT`,
  after the answers of the requests before it, except a timeout, which cuts at once), `CONNECT` (405) and `Expect: 100-continue`
  (`checkContinue`: the 100 is written only when the body is about to be read, so a refused request is never invited to send it).
- The reading stop is `socket._handle.readStop()`, a Node internal. The server checks it on the FIRST connection and at startup and
  FAILS CLOSED (the socket is destroyed, nothing is served, `app.health()` says why, the listener emits an error at startup) when it is
  missing, instead of silently degrading to `Connection: close` alone (review F10).
- Resource bounds (`contract.js` `limits`): body 4096 B, audit log one ring of 200 records PER identified subject (at most four rings:
  one identity can no longer evict another identity's records, review F11) plus a separate ring of 50 anonymous refusals,
  token lifetime 10 min (max 15), 5 s idle socket, 256 connections, 4 requests running or queued per socket, 1000 state entries
  (409 `STATE_FULL`) of which one identity may hold 400 (409 `OWNER_QUOTA_FULL`; two conductors plus the operator's three approvals
  always fit, 2 x 400 + 3 = 803: a THIRD owner identity would make `STATE_FULL` reachable by two others, so `ownerEntries` must be
  lowered when identities are added), 5 s header and request timeouts checked every second (`connectionsCheckingInterval`: Node checks
  them only every 30 s by default, so a client trickling one byte every 2 s was cut after about 30 s), Node's 16 KB header limit (431).
  `app.close()` ends every accepted socket.
- The depth guard of the lanes cuts a client past 4 requests running or queued on one socket (with or without a body: the lanes serve
  them one at a time, so only the first runs and the others wait their turn, holding a request and a response object each).

Files: `contract.js` (identities, command x role table, input rules), `authz.cjs` (tokens, decision), `commands.cjs` (mutation pipeline),
`handlers.cjs`, `ledger.cjs`, `queue.cjs`, `codes.cjs`, `http-io.cjs` (the refusal path, lanes and read stop: reference implementation
for importers), `server.cjs`, `cli.cjs` (CLI, rechecks the current C001 consent
and fails closed), `index.html` + `page.js` + `style.css` (inspection page, strict CSP, no inline script), `imports.json` (pinned accepted C001 bytes).

### `http-io.cjs` for importers (C010, C014 and C022 import it read-only)

The file opens with the four rules (a comment of about 30 lines); the API, all frozen on the module:

- `createResponder(response)` gives `json(status, value, headers)`, `file(buffer, type)`, `fail(code, body, headers)` and `proceed()`. Any
  status of 400 or more is a refusal: it marks `response.req.socket` BEFORE the answer is written (never `response.socket`: it is null for a
  response queued behind an unfinished pipelined one), sends `Connection: close` and stops reading after the answer. `proceed()` writes the
  100 Continue of an HTTP/1.1 request that asked for it, call it right before the body is read.
- `createLanes({ depth })` returns `admit(request, response, task)`: the tasks of one connection run one at a time, in order; a marked
  socket admits nothing and drops its queue; more than `depth` running or queued cuts the connection. `admit.refuse(socket, code)` is
  the same ending for what Node decides itself (typed answer written on the socket, behind the requests before it).
- `isFinished(socket)` (test it after EVERY await and right before an effect), `endConnection(socket)` (a refusal decided outside a
  responder), `canStopReading(owner)` (the fail-closed self-check), `clientErrorCode(error)`, `localGuard`, `hasBody`, `readBody`.
- A server wires it exactly like `server.cjs`: `http.createServer({ requireHostHeader: false, ... }, (q, r) => admit(q, r, route))`,
  listeners for `checkContinue`, `checkExpectation`, `clientError` and `connect` routed through `admit`/`admit.refuse`, a `connection`
  listener that destroys every socket when `canStopReading` is false (first connection) and a startup check on `listening`. Never rely on
  `maxRequestsPerSocket` for ordering. A refusal that Node decides at PARSE time (an unknown Expect, `checkExpectation`) belongs in the
  SAME lane as every request, behind the requests before it: answering it at once, outside the lane, drops the queued requests before it
  and leaves the connection open after two legitimate requests and the refusal (the third pipelining hole, rev-C059 N1);
  `pipeline-node-own.test.cjs` fails a server that does. Copy the proof too: `tests\pipeline-rows.cjs` and `tests\pipeline-matrix.cjs`
  (shapes, framings and the cell checker), `pipeline-refusal.test.cjs`, `pipeline-refusal-http10.test.cjs` and
  `pipeline-refusal-mixed.test.cjs` (every refusal row in six shapes, one file per framing, in process), `pipeline-process.test.cjs`
  (against a server process), `pipeline-node-own.test.cjs` (two or three legitimate requests before every refusal Node decides itself),
  `lanes.test.cjs`, `guards.test.cjs`, `node-own.test.cjs`, `refusal-flood.test.cjs` and the mutants of `tests\mutants.cjs`.
  `readme-contract.test.cjs` checks this very section against the module: a name, parameter, option, listener or file that is documented
  and does not exist fails the suite.

## Commands (repository root, PowerShell 7; run test files one at a time under a timeout when in doubt)

GREEN, every non-browser test (the file and test counts are in the suite manifest of `evidence\green-fix3`; 1 to 6 minutes depending on
the load of the machine, every file fits the 60 s of the runner under load, see the cycle of order R11):

    node --test --test-timeout=60000 --test-concurrency=1 "capability/C009/tests/*.test.cjs"

Per-file coverage, 85 lines / 85 branches / 85 functions for each of the 11 production files, unloaded counts as 0%
(one L-0004 command per file, 3 at a time, about 10 minutes: take a heavy slot):

    node capability\C009\tests\coverage.cjs

The command it runs for one file (here `server.cjs`):

    node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=**/C009/server.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability/C009/tests/*.test.cjs

Real isolated headless Edge (heavy slot, about 60 s on a quiet machine, writes nothing; leave CAPTURE_BROWSER_EVIDENCE unset; it needs a QUIET
slot: the shared `qualifyEdge()` asks PowerShell for the signature and the version, and on a loaded machine those queries time out; the
test retries once after a typed timeout and prints the load, review F13). It first calls `qualifyEdge()` of
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

### Fix cycle after the second independent review (order R9)

The second review (of commit 244f771b) reproduced the pins, the REDs and the coverage and found NO authorization bypass in more than
6,900 hostile requests, but three majors, four minors, and the controller added two holes found in a sibling card (rev-C017 F11, F12).
The fix is test first; the RED archives are `evidence\red\fix2-*` (two earlier generations of them are retained and marked
superseded: the first when the controller's addition arrived and the test bytes changed, the second when load-dependent waits and
resets that discard answers were removed from the new tests), the captures of the final bytes are
`evidence\green-fix2\*`, the first-fix bytes of every file this cycle changed are retained in `evidence\red\snapshot-fix1` (every R8
pin is recomputed against them by `fix-evidence.test.cjs`) and `fix2-evidence.test.cjs` recomputes every hash of this cycle.

- F1b (a refusal that is not the first request of its connection, and refusals decided after an await): `send()` took the socket from
  `response.socket`, which is null for a response queued behind an unfinished pipelined one, so nothing was marked, reading never stopped
  and the pipelined mutation behind the refusal ran (67 of the reviewer's 124 matrix cells). Now the mark is made from
  `response.req.socket` synchronously inside the one central refusal, the requests of one connection run one at a time (`createLanes`,
  `http-io.cjs`), a marked socket admits nothing and drops its queue, and `commands.cjs` tests the mark after its one await and right before
  `ledger.commit`. Proof: the three files `pipeline-refusal.test.cjs`, `pipeline-refusal-http10.test.cjs` and `pipeline-refusal-mixed.test.cjs`
  (one per framing since order R11) send EVERY row of `refusal-rows.cjs` (34 rows) in six shapes (`R M7`, `G R M7`,
  `M6 R M7`, `G G R M7`, and two shapes cut into two TCP writes) and three framings (HTTP/1.1, HTTP/1.0 keep-alive, an HTTP/1.0 mutation
  behind an HTTP/1.1 refusal) with a permitted `pool.resize` behind the refusal and assert the answers, the revision, the pool size and
  the audit log; `pipeline-process.test.cjs` does the same against a server in a SEPARATE process (state read back from it; since order R11
  the cells that differ in what the server process sees, not all 600);
  `refusal-flood.test.cjs` floods a refusal queued behind a GET; `lanes.test.cjs` and `guards.test.cjs` test the lanes and the two guards
  without a socket. A reset can discard answers
  the client has not read yet (Windows closes with a reset a connection that still has unread data in flight): for the two-write shapes,
  for the 20 KB header of HEADERS_TOO_LARGE and for REQUEST_TIMEOUT (a timer ends a request whose body is still arriving) the answers are
  only required to be a subsequence of the expected ones (nothing extra, nothing out of order); the state, the revision and
  the audit log decide (they are read from the server). A timer cuts a stalled request at once, so for the REQUEST_TIMEOUT row the
  number of earlier mutations a loaded server commits before its 300 ms timer fires is not asserted (at most the earlier ones, the audit log
  must match, nothing behind the refusal runs). Cost (review F9c, fixed by order R11): this matrix was one 605-cell file with an app and a
  subtest per cell (24 s) and 8 copies at once did not fit the 60 s of the runner under load; it is now three files, one app per row with
  the six shapes in turn, the cells unchanged, and all three are in the 8-way flake loops under 8 burners (see the cycle of order R11).
- Node answers some requests by itself (rev-C017 F11): see "What the server enforces". Rows REQUEST_MALFORMED, HEADERS_TOO_LARGE and
  REQUEST_TIMEOUT joined the refusal table (`refusal-close.test.cjs` and both matrices pick them up); `node-own.test.cjs` covers a request
  without Host (HTTP/1.1 and HTTP/1.0), `Expect: 100-continue` (never invited when refused, answered 100 then 200 when permitted, no 100
  for HTTP/1.0), CONNECT, a parse error behind a slow request (answered in order), a malformed chunk in a running request (answered at once).
  The HTTP/1.0 framing skips two rows (Node ignores `Expect` in HTTP/1.0 and rejects a chunked body there as a parse error, which has its own
  row). `maxRequestsPerSocket` is not used.
- Added for the controller's pre-publication checklist (no review finding behind them, so no RED): `two-instances.test.cjs` runs two live apps
  in one process (tokens, ledger and refusals stay per app; closed first-in-first-out and last-in-first-out, each closed twice; an app that
  failed closed does not fail its neighbour; a plain HTTP server with a connected client stays untouched) and `upgrade.test.cjs` pins that
  the server has no `upgrade` listener, so a request that asks for an upgrade goes through the same refusal path (and Node drops what
  follows such a request in the same read, which is not asserted).
- F2b (`resources.test.cjs` failed about 6 of 96 runs at 8 in parallel): the header flood is refused by the clientError path, which now
  writes the typed 431 and ends the connection after the flush; the client may still see an empty answer when Windows resets a connection
  that has unread data, so the test accepts the 431 or nothing and asserts what is structural, read from the SERVER child: it closed that
  connection and read 256 KB at most of the 1 MB offered. The retained-heap reading of R8 is unchanged.
- F9 (`refusal-flood.test.cjs` failed 7 of 16 runs at 4 in parallel): no wall-clock bound is left. The attacker (own process, IPC) offers
  1 MB per socket and stays connected; the server child reports its own account: every attacking socket closed by the server, at most
  256 KB READ from each (a refused connection costs one read; the offered flood is four times that), its CPU time (`process.cpuUsage`)
  against a NAIVE control server run in the same test (no close, no read stop: it reads everything, the assertions must reject it), and a
  normal client served after the attack. Waiting is event driven (the server's close, the control's reads), with deadlines that only end a
  wait that cannot succeed (150 s in the R9 test, 30 s since order R11: the runner stops a file at 60 s).
- Mutation (`tests\mutants.cjs`, 42 one-line mutants on scratch copies, each needs a NAMED failing test; 40 in order R9, the two of the
  third pipelining hole joined in order R11): the mark, the Connection: close header,
  the read stop and its fail-closed branch, the lanes (serialization, drop after a mark, depth, release on finish and on close, release
  once), the answer at once for the request that was still being received, the destroy after the flush, every listener for what Node
  answers itself, `requireHostHeader`, the two guards of `commands.cjs`, the first-connection and startup self-checks, the per-subject
  audit ring and the quotas: 41 are killed and ONE is a documented equivalent (M10: `admit()`'s early return for a marked socket is
  redundant with `pump()`, which drops the request before any effect; a reachability argument, not a proof: it is not observable on a
  loopback client, review F17). A mutant whose run hits the hard timer is UNDECIDED and fails the run, never counted as killed. M04 (the socket from `response.socket`) is killed only by the
  unit test of a queued response: under the lanes a task starts after the earlier response has finished, so its response has a socket,
  which is why the reviewer's one-line remedy alone is not enough for the asynchronous refusals.
- F10: `canStopReading()` is checked on the FIRST connection and at startup (`app.health()`, `READ_STOP_UNAVAILABLE`, the socket is
  destroyed, nothing is served); `read-stop.test.cjs` uses a stub socket, a real socket whose handle lost `readStop`, and a listener that
  never listened. F11: the audit log has a ring per subject (`audit-ring.test.cjs`) and the owner-count note above. F12 (a client that
  streams a large body at a refused request, fetch/undici gets ECONNRESET instead of the answer for 1 of 8 at 1 MB): left as documented, no
  bounded drain was added (it would reopen F1). F13: `tests\browser-retry.cjs` retries `qualifyEdge()` ONCE after a typed timeout and
  reports the load (`browser-retry.test.cjs`); C009 browser verification needs a quiet slot.

Commands of this cycle (repository root; take a heavy slot for the loops, the coverage and the browser; the test files below are the
R9 files, three of which order R11 replaced: the R9 archives pin the bytes of that cycle, retained in `evidence\red\snapshot-fix2`):

    git archive --format=tar -o <scratch>\p.tar 244f771ba72d5bb2fd36e044ba465ff5d2c5ad0e capability/C009 capability/C001
    tar -xf <scratch>\p.tar -C <scratch>\pristine
    $env:C009_SUBJECT_DIR = '<scratch>\pristine\capability\C009'    # the first-fix bytes: every new RED below exits 1
    node --test --test-concurrency=1 capability\C009\tests\pipeline-refusal.test.cjs
    node --test --test-concurrency=1 capability\C009\tests\pipeline-process.test.cjs
    node --test --test-concurrency=1 capability\C009\tests\read-stop.test.cjs capability\C009\tests\audit-ring.test.cjs
    node --test --test-concurrency=1 capability\C009\tests\refusal-flood.test.cjs
    node --test --test-concurrency=1 capability\C009\tests\node-own.test.cjs capability\C009\tests\refusal-close.test.cjs
    Remove-Item Env:C009_SUBJECT_DIR                                 # on the final code the same files exit 0
    node capability\C009\tests\flake-loop.cjs . resources.test.cjs 8 8     # also refusal-flood, pipeline-process, timeouts, connections, node-own
    node capability\C009\tests\mutants.cjs <scratch directory outside the repository>   # every guard line of the refusal path, one mutant at a time

### Fix cycle after the third independent review (order R11)

The third review (of commit f95cc52a) verified F1b with a raw-socket matrix of its own (2,285 cells in process and against a server process)
and rejected on ONE major, F9c, plus minors F14 to F18. This cycle changes tests, the README and evidence only: the 11 production files
are byte-identical to the second fix (three other cards import them and pin them by commit), which `fix3-evidence.test.cjs` recomputes
against the pins of `evidence\green-fix2\suite.json`.

- F9c (the suite was not green under load: under 8 CPU burners `refusal-flood.test.cjs` was cancelled at the 60 s the runner gives a FILE,
  8 copies of it and of `pipeline-process.test.cjs` timed out in every run, `resources.test.cjs` 8 x 8 failed 32 of 64 on a busy machine).
  On the saturated machine of this cycle a bare `node -e 0` took 2 to 4 seconds: what a file costs is its number of PROCESS STARTS and of
  sequential steps, not its assertions. Every assertion and every named guard test stays; each file starts fewer processes and waits for
  fewer things one after the other. `refusal-flood.test.cjs`: ONE server child (`flood-servers.cjs`: the real server and the naive
  control on two ports) and ONE persistent attacker (`flood-attacks.cjs`) serve every attack of the file instead of a server and an
  attacker per attack, one attack per refusal code path (every kind first on its connection, the 401 and the Node-own 417 also queued
  behind a GET), no wait longer than 30 s. The 605-cell matrix is three files by framing, one app per row with the six shapes in turn,
  the cells unchanged (`pipeline-matrix.cjs` checks them). `pipeline-process.test.cjs` runs the cells that differ in what the server
  process sees. `resources.test.cjs` runs ONE child for every attack at once and then ONE settled reading, the state check, the negative
  control and the shutdown with the attackers still connected. `cli.test.cjs` starts its four override runs together, and the evidence
  tests read each pinned file once. The cost of the heavy files before (the second-fix bytes) and after, one run each without burners of mine,
  is recorded as EVIDENCE (`evidence\green-fix3\cost-before.json`, `cost-quiet.json`), and their cost under load is the `max` of every round of
  the loops: evidence, not an assertion (a time bound on a shared machine is not a test). The criterion is the LOOP
  under load: `load-loop.cjs` starts 8 CPU burners (normal priority, PIDs printed, stopped by PID) and runs `flake-loop.cjs`, 8 runs at
  once for 8 rounds of each of seven files, and the whole suite once, under them (`evidence\green-fix3\loop-*.json`, `suite-under-load.json`).
- F14 and F15: the false option `{ immediate }` is gone from the importer section (it was not implemented and is not now), and
  `readme-contract.test.cjs` checks every function, parameter, option, listener, Node property and file that section names against the
  real module and tree (positive: a documented name that does not exist fails; the check has teeth against seven spoiled variants). The
  test file and test counts of the README are recomputed from the suite manifest it names and the tests directory.
- The third pipelining hole (controller note of 6 Nov, rev-C059 N1): a refusal that Node decides at PARSE time and a design answers
  outside the lane drops the queued requests before it and leaves the connection open after two legitimate requests and the refusal.
  `pipeline-node-own.test.cjs` sends `[G][G][X]`, `[G][G][G][X]`, `[G][G][X][G]` and `[POST][G][X]` for every refusal Node decides itself (an
  unknown Expect on a GET and on a permitted POST with a body, a parse error, an oversized header, a request without Host, CONNECT, a
  request timeout; HTTP/1.1, HTTP/1.0 keep-alive and the mixed framing), in this process and against a server process, and sends 128 sockets
  `[G][G][X]` at a 128-connection cap (every socket closed by the server, no connection held, a legitimate GET answered; counts, no time
  bound, the idle timeout set to ten minutes so that the server's own idle drop cannot hide an open connection). C009 passes all of it with
  no production change (its `checkExpectation` goes through the lane); the RED is a specimen with the hole (`fix3-node-own-hole-*`), and the
  mutants S13 and M24 join the 40 of order R9.
- Mutation: `mutants.cjs` marks a mutant whose run hits the hard timer UNDECIDED and fails the run (it was never to count as killed).
- Not done here (listed as follow-ups, not claimed): a mutation generator over every statement and condition of `http-io.cjs`, `server.cjs` and
  `commands.cjs` (self-review line 4, review F17), a walker test over the returns of `ledger.cjs`, a seeded fuzz of the validators.

Commands of this cycle (repository root; take a heavy slot for everything that loads the machine; ONE heavy window at a time):

    # the whole suite, the 60 s of the runner per file:
    node --test --test-timeout=60000 --test-concurrency=1 "capability/C009/tests/*.test.cjs"
    # under 8 CPU burners (the burners are started and stopped by PID by the script; they run at normal priority):
    node capability\C009\tests\load-loop.cjs 8 --test --test-timeout=60000 --test-concurrency=1 "capability/C009/tests/*.test.cjs"
    # the 8-way loop of ONE file under 8 burners, 8 rounds (prints FLAKE HUNT <file>: <bad> bad of 64):
    node capability\C009\tests\load-loop.cjs 8 capability\C009\tests\flake-loop.cjs . refusal-flood.test.cjs 8 8
    # the cost of the heavy files, one run each (prints COST <file> <seconds> ...; evidence, not an assertion):
    node capability\C009\tests\file-costs.cjs .
    node capability\C009\tests\file-costs.cjs <scratch>\pristine     # the second-fix bytes
    # the RED sets against the second-fix bytes (a pristine git archive of f95cc52a): each exits 1 by assertion
    $env:C009_SUBJECT_DIR = '<scratch>\pristine\capability\C009'
    node --test --test-concurrency=1 capability\C009\tests\readme-contract.test.cjs
    Remove-Item Env:C009_SUBJECT_DIR                    # on the final tree the same file exits 0
    # the third-hole matrix against the specimen (evidence\red\specimen-fix3\server.cjs in place of server.cjs of that archive):
    $env:C009_SUBJECT_DIR = '<scratch>\hole\capability\C009'
    node --test --test-concurrency=1 --test-timeout=170000 capability\C009\tests\pipeline-node-own.test.cjs
    Remove-Item Env:C009_SUBJECT_DIR
    node capability\C009\tests\mutants.cjs <scratch directory outside the repository>   # 42 mutants, one at a time

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
  in its OWN process against a small-heap server child: one client streaming endless 1-byte chunks at a refusal (401, 403, GET with a body
  400, unknown `Expect` 417) must be cut off (the first test of order R8 also bounded the event-loop lag of the child at 1.2 s, which a
  loaded machine broke, and a stalled server measured 3 to 10 s in the review: since order R9 only structural facts are asserted, see the
  second fix cycle), and the authorized control (413) must be cut off too;
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
The first publication had 16 `*.test.cjs` files and 139 tests (the result file said 17); the final namespace has 37 test files and 423 tests (suite manifest `evidence\green-fix3\suite.json`, recomputed by `readme-contract.test.cjs` and `fix3-evidence.test.cjs`).

Fix cycle (order R8): `evidence\red\fix-refusal-close-*` (33 of 35 fail), `fix-refusal-flood-dfe818f3-*` (the final test bytes against the
first-publication production files, 6 of 6 fail: the event loop is blocked 2.7 to 3.2 s), `fix-quota-ring-*` (6 of 6),
`fix-timeouts-28631ef6-*` (3 of 3) and `fix-resource-heap-*` (the F2 flake, 2 of 40). `fix-refusal-flood-720df817-*` and `-24ff8e0e-*`
are earlier attempts of the flood test (more classes, a longer attack, a control bound that did not hold under load) and
`fix-timeouts-9e787b44-*` is the first timeouts run (it asserted the 408 answer, which a reset can discard): retained and superseded.
`evidence\green-fix` holds the captures of the FINAL bytes: the whole suite, one coverage run per production file, the replay of every new RED on the final code,
and the real-Edge transcript with the signature and qualified-major assertion. Captures were taken last; nothing differs from its pin.

Second fix cycle (order R9): `evidence\red\fix2-pipeline-refusal-*` and `fix2-pipeline-process-*` (every refusal row in six shapes and
three framings, in process and against a server process), `fix2-read-stop-audit-ring-*` (F10, F11), `fix2-refusal-flood-*` (a refusal queued
behind a GET, the naive control), `fix2-node-own-*` (what Node answers by itself, and the three new table rows), all run against a
pristine `git archive` of the first-fix commit 244f771b through `C009_SUBJECT_DIR`; the archives with the ids `6d73afb4`, `870a592a`,
`388bb2b3` and `3ddb221d` are the first attempts on earlier test bytes, and `a1c0f6d2`, `b52e7a19`, `c63f8b2a`, `d74a9c3b` and `e85b0d4c`
the second (before the tests stopped depending on wall-clock waits), `f5a1d9c3` and `0a7b3e68` a third (before the REQUEST_TIMEOUT cells of
the two matrices stopped asserting how many earlier mutations a loaded server commits before its timer fires), all retained and marked superseded; `evidence\red\snapshot-fix1`
holds the first-fix bytes of every file this cycle changed. `evidence\green-fix2` holds the captures of the FINAL bytes: the whole suite, one
coverage run per production file, the replay of every new RED on the final code, the 8-way flake loops (64 runs each of the resource,
flood, process, timeouts, connections and Node-own files), the mutation check of every guard line of the refusal path, and the real-Edge
transcript. `fix2-evidence.test.cjs` recomputes all of it; captures were taken last.

Third fix cycle (order R11): `evidence\red\fix3-readme-contract-*` (F14 and F15: `readme-contract.test.cjs` against the second-fix bytes) and
`fix3-node-own-hole-*` (the third pipelining hole: `pipeline-node-own.test.cjs` against a specimen whose `checkExpectation` answers outside the
lane, the one changed line retained as `evidence\red\specimen-fix3\server.cjs`); `evidence\red\snapshot-fix2` holds the second-fix bytes of
every file this cycle changed (the R8 and R9 pins are recomputed against them); `evidence\green-fix3` holds the captures of the FINAL
bytes: three whole-suite runs (one under 8 CPU burners), one coverage run per production file (one L-0004 command each over the 24 non-browser
test files that add coverage: the matrix, process, flood, resource, evidence and import files are left out, so every figure is a lower bound),
the replay of seven RED sets on the final code (the five of order R9 as their R11 successors, and the two of this cycle), the 8-way flake
loops under 8 burners of the seven heavy files (the `max` of every round is their cost under load), the cost of the heavy files before (the
second-fix bytes) and after, the 42 mutants, and the real-Edge transcript. `fix3-evidence.test.cjs` recomputes all of it once the capture
is sealed (`COMPLETE.json`, written last, lists every manifest with its SHA-256); captures were taken last.

## Decisions and limits

- Limits of the load proof (order R11): the loops and the suite under load ran with the 8 burners the script started AND with whatever else
  the shared machine ran (it was at 100% CPU before they started, and a bare `node -e 0` took 2 to 4 s): the load is at least the order's and
  cannot be reproduced exactly; a faster or quieter machine was not tried, and `cost-*.json` is what this machine did at that moment. The
  loops show no failure in 64 runs of each file; that does not exclude a rarer one.
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
  per connection (about 0.5 to 2 s on a loaded machine in the review's measurements; no test asserts a time, `refusal-flood` asserts the
  bytes read and the CPU ratio against a naive control). A client that streams a large body
  at a refused request may see a reset instead of the answer; a small request whose bytes were all read before the close usually gets the
  answer, but a later TCP write into a connection the server has already ended can still produce a reset that discards an answer the
  client has not read: the matrices accept that for the cells it concerns (`resetMayDiscard` in `pipeline-rows.cjs`) and decide on the
  server-side facts (state, revision, audit log).
  `socket._handle.readStop()` is a Node internal, used because every public way to stop reading (`socket.pause()`, a `Connection: close`
  alone, destroying on the flush callback) left the loop blocked for 3 to 10 s in the review's experiments; the cross-process test fails
  if a Node update stops it from working, and the server fails closed (serves nothing, `app.health()`) when it is missing (review F10).
- Limits added by the second fix (order R9): (1) a client that sends more than 4 requests in ONE write is cut off (the depth of the
  lanes), with or without bodies; (2) the answers Node would write by itself are typed raw writes (`HTTP/1.1` status line, the security
  headers, `Content-Length`, `Connection: close`, no `Date`), the socket is destroyed once they are flushed, so a client that has unread data in
  flight can still see a reset instead of the answer (Windows; the structural facts are read from the server, review F2b, F12); (3) a request
  without Host reaches `localGuard` because `requireHostHeader` is false (Node 18.6 or later; Node 22 tested); (4) the HTTP/1.0 framing of
  the matrix skips the unknown-Expect and the chunked-body rows (Node ignores `Expect` in HTTP/1.0 and rejects chunked there as a parse error);
  (5) `timeouts.test.cjs` still bounds the cut of a trickling client at 2.5 s for a 0.4 s limit (a bound against Node's 30 s default,
  unchanged from R8); (6) the audit log holds at most four rings of 200 plus 50 anonymous records because subjects come from the closed
  identity table; (7) the owner-count note above (`ownerEntries` must be lowered when identities are added).
