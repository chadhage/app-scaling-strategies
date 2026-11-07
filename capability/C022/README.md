# C022: isolated synthetic tenant, authentication and session state

Local, synthetic, offline fixture. It is NOT the approved Node 24 + Express + Entra control API and NOT an identity service. Three fictional
tenants (`tenant-alder`, `tenant-birch`, `tenant-cedar`) share ONE loopback HTTP server (127.0.0.1, automatic port, Node built-ins only), each
with its own users, roles, sessions, projects, profiles and audit trail. No Entra, no cloud, no registration, no IaC, no spend
(`liveAzureRuns` 0, `authorizedCloudSpend` 0). Tested runtime: Node v22.23.4. Specification: `C022.feature`.

## The world and the rules

- Users: `ada` (admin), `alf` (member), `ana` (viewer) in alder; `bea`, `ben`, `bo` in birch; `cai`, `cy` in cedar; `dana` belongs to alder (member)
  AND birch (viewer); `nomad` belongs to no tenant. Roles `viewer < member < admin` do not inherit: every operation lists its roles (`contract.js`).
- Authentication is a ONE-TIME TICKET minted by an in-process stand-in for the identity provider (`app.issueTicket({ user, tenant })`; nothing
  over HTTP mints one). `POST /v1/session/login {ticket}` spends it and creates a session; a session is bound to ONE tenant for life.
- The tenant of a request comes ONLY from the verified session. A tenant named in ANY header (a name containing tenant, organisation, org,
  account or workspace), query field or body field is refused `400 TENANT_CLAIM_REJECTED` whatever its value (own, foreign or nonsense: one
  answer, so there is no oracle), and a tenant in the path is just an unknown route. Cookies are never read and never set.
- Every read, list, search, mutation, cursor and ETag is scoped by tenant: the store hands out a handle per tenant (`store.scope(tenant)`),
  ids are per tenant (`proj-0001` exists in two tenants and means two objects), and the answer to someone else's id is BYTE FOR BYTE the
  answer to an id that exists nowhere (status line, every header but `Date`, body; the id is never echoed). Cursors and ETags are keyed MACs over
  the tenant (and the query): a value of one tenant verifies in no other. `If-None-Match` of another tenant gives 200, never 304; there is no
  `Last-Modified` (and `If-Modified-Since` is ignored), so there is nothing else to validate with.
- The audit trail is a ring of 200 per USER of a tenant plus a separate ring of 50 for anonymous refusals; a probe or denial is recorded in the
  caller's own tenant only; one user's flood cannot evict another user's records or another tenant's. `GET /v1/admin/audit` is admin only.
- Quotas are per tenant (12 projects, 8 active sessions, 32 session records); one tenant at its bound refuses with 409 and starves nobody.

### The session lifecycle (a closed state machine, every transition decided on the server)

| From | Event | To | Illegal variants (typed refusal, NO effect) |
| --- | --- | --- | --- |
| none or anonymous | login with a valid ticket (`POST /v1/session/login`) | `active`, a NEW token and a NEW session id; the anonymous one becomes `superseded` | replayed, expired, unknown or malformed ticket `401 TICKET_INVALID`; `403 NOT_A_MEMBER` (nomad, a user of another tenant); an active token presented `409 ALREADY_AUTHENTICATED`; a dead anonymous token (its own code); `409 SESSION_QUOTA_FULL`; a body naming a session id `400 INPUT_UNKNOWN_FIELD` |
| active | logout | `logged_out` | a dead token: `SESSION_LOGGED_OUT`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `SESSION_SUPERSEDED` (401), a forged one `TOKEN_UNKNOWN`, an odd one `TOKEN_MALFORMED` |
| active | admin revoke by session id or by user (own tenant only) | `revoked` | an ended session `409 SESSION_NOT_ACTIVE`; another tenant's session or user: `404 RESOURCE_NOT_FOUND`, like one that never existed |
| active | the injected clock reaches `expiresAtMs` | `expired` (DERIVED from the clock, never written by a request) | nothing revives a session |
| active | role change by an admin | same session, new authority AT ONCE | the last admin cannot be demoted `409 LAST_ADMIN`; a user of another tenant `404` |
| active | tenant switch (`POST /v1/session/switch`), a header, a query, the old token | NOTHING | always `403 TENANT_SWITCH_REQUIRES_LOGIN` or `400 TENANT_CLAIM_REJECTED`; a second login for the other tenant is a separate session |

Decision D1 (role changes): a session carries no role. Its authority is ALWAYS the current role of its user in its tenant, read where the
effect is committed. A downgrade therefore applies to every existing token at once; an upgrade applies at once too; after a downgrade
followed by a re-upgrade the SAME token acts by the current role only (it never "keeps" an old privilege, and it never loses one it is entitled
to). Decision D2 (tickets): a ticket is spent only when a session is created, so a refusal (membership, quota, a dead anonymous token, a bad
body) spends nothing. Decision D3 (claims): refused for any value, never "ignored", so a client learns nothing about its own or another tenant.

## Routes

`GET /` (the inspection page), `/page.js`, `/contract.js`, `/style.css`, `/scope.json`. `POST /v1/session/anonymous`, `POST /v1/session/login`,
`GET /v1/session`, `POST /v1/session/logout`, `POST /v1/session/switch`. `GET|POST /v1/projects` (list with `limit` 1-10, `cursor`, `q`),
`GET|PUT|DELETE /v1/projects/<id>` (`If-Match`, `If-None-Match`). `GET /v1/profiles`, `GET /v1/profiles/<id>` (the synthetic profiles of the
accepted C020 `getProfileV2`, only those of the caller's tenant). `GET /v1/admin/sessions`, `GET /v1/admin/audit`, `POST /v1/admin/revoke`,
`POST /v1/admin/role`. Every mutation is linearized and the whole decision is repeated in the same synchronous step as the write
(`service.execute`), so a session that expires, is revoked, logs out or is demoted while its request waits for its body or for the commit queue
has no effect (`races.test.cjs` builds each race with a request whose body is withheld, no sleep).

## Files

`contract.js` (world, permission table, typed codes, input rules; also loaded by the page), `identity.cjs` (tickets, sessions, memberships),
`store.cjs` (tenant-scoped resources, cursors, ETags, audit), `service.cjs` (decision and effect), `server.cjs` (HTTP), `index.html` +
`page.js` + `style.css` (the inspection page: no inline script, strict CSP, real GETs as users of two tenants, verdicts derived from facts),
`imports.json` (pins), `tests\` (suites and tooling), `evidence\` (archived runs).

### What is imported (read-only, pinned in `imports.json`)

`capability\C009\http-io.cjs`, `codes.cjs`, `queue.cjs` at commit `f95cc52a29cf` and `capability\C020\profiles.cjs`, `contract.js` at
`2dc471daab3f`, nothing else (`imports.test.cjs` loads the production code in a fresh process and requires exactly that set of foreign files;
`tests\anchor.cjs` recomputes every pin against git). C009 was NOT accepted when C022 started: only its PRODUCTION bytes are used (never its
tests or evidence). Its third fix (`0da3ff6eea40`, tag `kanban/C009/0da3ff6eea40`) was accepted afterwards and changed only README, tests and
evidence: every production file is byte-identical to `f95cc52a29cf`, so the pins stay valid and `anchor.cjs` still passes. The C009 README line
`admit.refuse(socket, code, { immediate })` was FALSE (review F14, fixed in the accepted README): the function takes two arguments and `immediate`
occurs nowhere; C022 uses `admit.refuse(socket, code)` and `imports.test.cjs` tests the arity against the real export. The imported responder adds the header
`X-C009-Scope: synthetic-loopback-only` to every answer, and the answers Node gives itself (417, a parse error, 431, 408, CONNECT) are written
by the imported code and carry `Cache-Control: no-store` but no `Vary: Authorization`. Under the SHIPPED limits (`headerMs` 5000, `checkMs` 1000, `idleMs` 8000) the
typed `408 REQUEST_TIMEOUT` (with `Connection: close`, after the answers to every earlier request) arrives about 5 to 6 seconds after the stall for a body that stops short of its
`Content-Length`, for a chunked body that stops, and for headers that stop in the FIRST request of a connection. Headers that stop BEHIND a complete request get no answer
at all: Node's own keep-alive timeout (1 s) ends the connection after the earlier answers (a plain `node:http` server probed by hand does the same, which is not part of the suite, so this is the platform's behavior and not a lane's);
`default-timeouts.test.cjs` pins every one of these shapes behind 0, 1 and 2 complete requests. Before the review fix `idleMs` (5000) equalled `headerMs`, so the socket idle timeout
cut a stalled request at about 5.1 s with no bytes and the typed 408 never arrived: this paragraph then said otherwise (rev-C022 minor m1).

## Commands (repository root, PowerShell 7; take a heavy slot with `RUN\scripts\heavy-slot.ps1` for coverage, loops and the browser)

GREEN, every non-browser test (657 tests in 42 files, the evidence test excluded: it verifies the whole archive and runs alone, 20 seconds to 2 minutes depending on the load; the whole GREEN takes 1 to 7 minutes depending on the load; every
process-spawning or raw-socket file is cheap on purpose, see "Cost of the test files" below; no file is meant to run over the 60 s per-file cap, the archived run used a 600 s timeout so that a starved machine cannot cancel it):

    node --test --test-concurrency=1 --test-timeout=60000 (Get-ChildItem capability\C022\tests\*.test.cjs -Exclude evidence.test.cjs).FullName
    node --test --test-concurrency=1 --test-timeout=600000 capability\C022\tests\evidence.test.cjs

RED replay against the retained naive stub (fourteen HTTP-level files, 382 of 400 tests fail, 381 of them with assertion errors about the specified
behavior; the same files replayed on the final code pass, `evidence\red\replay-3`; the two earlier cycles are retained exactly as archived, see `evidence\red\superseded.json` and `evidence\superseded.json`; the archived cycle ran with `--test-timeout=150000`, see "Evidence and figures"):

    $env:C022_SUBJECT_DIR = 'capability\C022\evidence\red\stub'
    node --test --test-concurrency=1 --test-timeout=150000 capability\C022\tests\server.test.cjs capability\C022\tests\isolation.test.cjs capability\C022\tests\isolation-more.test.cjs capability\C022\tests\lifecycle.test.cjs capability\C022\tests\races.test.cjs capability\C022\tests\refusal-close.test.cjs capability\C022\tests\pipeline-one-write.test.cjs capability\C022\tests\pipeline-earlier.test.cjs capability\C022\tests\pipeline-two-writes.test.cjs capability\C022\tests\pipeline-http10.test.cjs capability\C022\tests\pipeline-third-hole.test.cjs capability\C022\tests\pipeline-process-rows.test.cjs capability\C022\tests\pipeline-process-third-hole.test.cjs capability\C022\tests\pending-flood.test.cjs
    Remove-Item Env:C022_SUBJECT_DIR

Per-file coverage (85 lines, 85 branches, 85 functions for each of the 6 production files, one L-0004 command per file, unloaded counts as 0%):

    node capability\C022\tests\coverage.cjs

    node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=**/C022/server.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability/C022/tests/*.test.cjs

A test child never inherits `NODE_V8_COVERAGE`: the review of the first publication got `Could not report code coverage. SyntaxError: Unexpected end of JSON input` and no rows once, because a spawned test child (killed by its own test) left a truncated V8 file in the directory of the coverage run. Deleting the variable from the child's environment does NOT help (Node's `child_process` puts the parent's value back unless `options.env` has its own property of that name), so every spawner (`proc.cjs` `childEnv`, `pending-flood`, `refusal-flood`, `imports`, `loop.cjs`, `fresh.cjs`, `mutate-run.cjs`) sets it to an EMPTY string, which V8 ignores; `child-env.test.cjs` pins this on the real `child_process` and structurally over every file that spawns a process. `coverage.cjs` additionally retries once when the report could not be written.

Real isolated headless Edge (heavy slot, quiet machine: `qualifyEdge()` asks PowerShell for the signature and the version; a typed timeout is
retried once). It requires a Microsoft-signed Edge of a qualified major (no equality pin), opens the page through `openIsolatedLoopback`, pastes
two sessions of two tenants, compares every row, drives the page by keyboard (Tab to the button, a visible focus ring, Enter), and prints
`C022 BROWSER OK`. The helper permits only GET and HEAD: every POST, PUT and DELETE is proven with `node:test` sockets, not in the browser.

    node capability\C022\tests\browser.cjs

Other commands: `node capability\C022\tests\anchor.cjs` (import pins against git), `node capability\C022\tests\mutate-run.cjs --scratch <dir> --out <json> --workers 2 --until HH:MM [--base <earlier manifest>]`
(the systematic mutant campaign, run under a mutation slot of the machine: a baseline of every file on the unmutated tree first, a timeout is UNDECIDED and never a kill; `--base` keeps the kills of an earlier pass whose killing test file and production file are byte-identical and re-runs the rest; `--hand capability\C022\tests\hand-mutants.cjs` runs the hand list instead of the generated mutants, each entry alone, and counts a kill only when a NAMED test fails), `node capability\C022\tests\loop.cjs --out <json> --files ... --rounds 20 --parallel 4 --burners 4 --low 0`
(flake loop under four CPU burners the loop starts, PIDs recorded, stopped by PID, normal priority; with `--rounds 1 --parallel 1 --burners 0` over every test file it is the per-file timing), `node capability\C022\tests\fresh.cjs --mode lf|crlf --tree <dir> --out <json>`
(every test file but the evidence test in a scratch tree of this namespace's working bytes converted to LF or to CRLF, the pinned imports taken from git blobs; both tools record the hashes of the files they run and `evidence.test.cjs` compares them with the bytes that ship), `node capability\C022\tests\seal.cjs` (writes `evidence\seal.json` last),
`node --test capability\C022\tests\evidence.test.cjs` (recomputes every manifest, the seal and these figures).

## Evidence and figures (every number here is recomputed from `evidence\` by `evidence.test.cjs`)

- RED: 382 of 400 tests fail on the naive stub (classic mistakes: tenant from a header, one global table, shared ETags, fixation, no logout, stale roles,
  replayable tickets, ids echoed, mass assignment, no close after a refusal, a plain server that never cuts a connection under a pending first request); replay on the
  final code (`evidence\red\replay-3`): all 400 pass. 381 of the 382 failures are assertion errors about the specified behavior; the last is the harness reading the typed body of the stub's plain 400, which has none. The per-test timeout of this cycle is 150 s: the 20 table tests at the end of `refusal-close` each wait for a close that the stub never does, and a first attempt with the 60 s of the earlier cycles was cut by the runner after 380 tests on a busy machine (it is not kept).
  Two earlier cycles stay in the tree exactly as archived and are listed as retained: `evidence\red\run-1` (303 tests, 292 fail) and `replay-1` (396 pass), made before the cost split of the pipelining files, and `run-2` (400 tests, 381 fail) and `replay-2` (400 pass) of the first publication;
  the bytes of every input that changed since are retained in `evidence\red\snapshot-1\*.snap` and `evidence\superseded\snapshot-2\*.snap` (taken from the first publication), and `evidence.test.cjs` checks all of it. The captures of the first publication (GREEN, coverage, browser, its own `verify-1`) are retained the same way (`evidence\superseded.json`); the captures of this fix carry the next serial.
- GREEN: 657 tests in 42 files, nothing skipped, cancelled or todo (`evidence\green\green-2`, one runner, a 600 s per-test timeout so that a starved machine cannot cancel it); every file also ran alone, one after the other, and none took 60 s (`evidence\loops\files-1`, the per-file timing on a quiet machine: slowest `default-timeouts.test.cjs` 5834 ms, the one file that waits for the shipped 5 s limits to fire; the loaded figures are the loop's below).
- Coverage per file (lines/branches/functions): contract.js 98.84/98.55/100, identity.cjs 100/100/100, store.cjs 100/100/100, service.cjs 100/100/100, server.cjs 100/100/100, page.js 100/100/100.
- Mutation (systematic generator, every condition, comparison, logical operator, negation, simple statement and `return value;` of a production file, numbers in contract.js only; strings, comments and regexes masked): 766 of 768 mutants are killed by a named test in the final one of 3 mutation passes that are archived (`evidence\mutants\mutation-1.json`, `mutation-2.json`, `mutation-3.json`: server.cjs 176 mutants, service.cjs 92, identity.cjs 155, store.cjs 38, contract.js 131, page.js 176; 2 workers at normal priority under a mutation slot of the machine; every test file passed on the unmutated tree first; every mutant ran; the 2 that survive are proven equivalent).
  Pass 1 (the first publication) killed 724 and left 43 survivors and 1 undecided mutant (the removal of `server.close(...)` makes `close()` never resolve, so every test file hangs in its after hook and no test can be named: a hang is never a kill). Pass 2 (`--base mutation-1.json`) kept the 442 kills of pass 1 whose production file and killing test file are byte-identical and ran the other 326 again (the survivors and the undecided mutant of pass 1, every mutant of `contract.js`, which the review fix changed, and every mutant that an edited test file had killed): it killed 766, among them the 42 survivors of pass 1 that four test files written after that pass answer (`credential-first`, `close-resolves`, `contract-bounds`, `page-gaps`; page.js 38 of them by `page-gaps`), and only the 2 equivalent mutants of `server.cjs` survive. Pass 3 (`--base mutation-2.json`) ran those 2 again after the last edit of a test file (the scratch directory of `child-env.test.cjs`). `evidence\mutants\equivalents.json` lists them: 2 equivalent (a one-line proof each), 0 answered, 0 open; `evidence.test.cjs` checks that every survivor of the final pass is listed and that an earlier survivor that a later pass kills is killed by a test file that did not exist, or changed, since that pass.
- The hand list of argument and iteration mutants (what the generator cannot make: an iteration source, a call argument, a scoped accessor replaced by its unscoped sibling, the anchor of a regular expression): 70 of 70 hand mutants were killed by a named test (`evidence\mutants\hand-1.json`; `tests\hand-mutants.cjs`: identity.cjs 22, store.cjs 14, service.cjs 11, server.cjs 13, contract.js 10; each entry replaces ONE text of ONE production file and runs alone in a private copy against the whole suite, after a baseline of every file on the unmutated tree; a timeout would be UNDECIDED and no entry is). The reviewer's mutant (`revokeUser` iterating every tenant's sessions) is killed by the `dual-tenant` tests, 25 of the 70 are killed by that file, the rest by older files: the review found ONE hole, the other guards were already tested. The hand run found ONE more gap, the start of a token's shape (`identity.cjs`: a regular expression without its start anchor accepted a live token with something before it), which `guard-gaps.test.cjs` now closes; and ONE entry is a proven equivalent, listed as `EQUIVALENT` in the same file with its proof and not run (a ticket shape without its end anchor changes nothing observable: the shape only filters a lookup by digest). A hand list is chosen by a person: a mutant of that class that is not on it was not tried.
- The review fix is RED-proven (`evidence\fix-red`, recipes in `recipes.json`, each mutant a private tree of the shipped files with ONE text replaced and the pinned imports): 5 of 21 tests of `dual-tenant.test.cjs` fail on the reviewer's mutant (the same file passes on the shipped code in GREEN), and 7 of 10 tests of `default-timeouts.test.cjs` fail on the old `idleMs` (5000); every failure is an assertion error.
- Flake loops under four CPU burners started by the loop (every raw-socket and process-spawning file run 20 times, 4 at a time, normal priority, PIDs recorded, stopped by PID): 280 runs of 14 files, 280 passed, 0 over the 60 s cap, slowest 15521 ms (refusal-flood.test.cjs); `evidence\loops\loop-2.json`, 4 burners with their PIDs recorded, run inside the single loop slot of the machine. The loop ran the files as split for cost plus `child-env` and `default-timeouts`; every one of them finished under 16 s in every run.
- Fresh checkout: every test file but the evidence test green in a scratch tree of this namespace's working bytes converted to LF (the pinned imports taken from git blobs) and in the same tree converted to CRLF: LF 657 of 657 (42 files) and CRLF 657 of 657 (42 files), both on the bytes that ship (each run records the hashes of the files it copies and `evidence.test.cjs` compares them with the live files). The evidence test is excluded because it asserts these manifests; it runs alone as `verify-2`, and once more, together with the whole archive, in complete scratch trees converted to LF and to CRLF (20 of 20 tests in each; that run is not archived, because the archive is sealed by then). The trees are built from the working tree, because no commit of these bytes existed yet; a `git archive` of the published commit was not run.
- Browser: one real isolated headless Edge session through `testing\browser\isolated.cjs` (`openIsolatedLoopback`, the installed Edge is Microsoft-signed and of the qualified major, no equality pin on a build or a hash; the version and the hash are printed in `evidence\browser\browser-2` stdout): two users of two tenants, 19 of 19 probes as specified, keyboard operation with a visible focus ring, one polite live region, a same-tenant pair and a malformed token refused without a request, no page error, no CSP violation, only same-origin GET requests, no cookie (the browser context also lists HttpOnly ones) and no local or session storage entry after the whole run, and the 20 refused probes logged by the browser as 400/404 console lines (expected, counted, anything else would fail). The capture ran with the shared recorder at the real repository path: the helper `testing\browser\isolated.cjs` refuses a page outside its approved roots when the repository is reached through a substituted drive letter (every other capture of this fix ran from one, see the honest limits). The helper permits only GET, so POST, PUT and DELETE are proven with `node:test` sockets, not in the browser.

## The review fix (independent review of the first publication, rev-C022)

The first publication (`803bc72e6f01`) was rejected on one major and four minors; its code behaved correctly under about 2,600 hostile requests, but its suite could not see a sabotaged guard. Everything below was fixed in the tests, the tooling and ONE constant (`idleMs`, with its comment in `contract.js`); no other production byte changed.

- M1 (major). Replacing `for (const record of live(tenant))` by `for (const record of sessions.values())` in `identity.cjs` `revokeUser` let an alder admin end dana's session in birch (2 revoked instead of 1), and no test noticed: no fixture had a user with active sessions in two tenants, the property seeds never produced one, and the generator cannot mutate an iteration source or a call argument.
  Fixed by `dual-tenant.test.cjs` (every operation that selects by a name that exists in two tenants, in both directions, in process and over HTTP), by property seeds that start with dana live in alder AND birch and force dual revokes (see `property` below), and by the HAND LIST of argument and iteration mutants (`tests\hand-mutants.cjs`, see "Evidence and figures").
  RED proof (`evidence\fix-red\fix-red-m1`): the dual-tenant tests fail on that mutant, built in a private tree from `evidence\fix-red\recipes.json` (the shipped file with that one text replaced; `evidence.test.cjs` rebuilds it and compares its hash) and pass on the shipped code.
- m1 (minor). Under the shipped limits the idle timeout of the socket (`idleMs` 5000) equalled `headerMs` (5000), so a stalled request was cut at about 5.1 s with no answer and the typed `408 REQUEST_TIMEOUT` never arrived, which this README claimed. The one-constant fix is `idleMs` 8000 in `contract.js` (it stays above `headerMs + checkMs`; `contract-pins.test.cjs` pins the invariant); `default-timeouts.test.cjs` runs the SHIPPED limits against three shapes of stalled request behind 0, 1 and 2 complete requests. RED proof (`evidence\fix-red\fix-red-m1-minor`): the same file against the old limit. What remains is stated in "What is imported" and in the honest limits: half-sent headers behind a complete request get no answer (Node's keep-alive timeout, platform behavior).
  The change touches `contract.js`, so every mutant of that file is run again by pass 2 (the base manifest keeps only kills whose production file is byte-identical).
- m2 (minor). The coverage capture was flaky: spawned test children inherited `NODE_V8_COVERAGE`. The suggested fix (deleting the variable from the child's environment) does not work, see "Commands"; every spawner sets it to an empty string, `child-env.test.cjs` pins that, and `coverage.cjs` retries once.
- m3 (minor). The survivors-only mutation pass is archived (`evidence\mutants\mutation-2.json`, base `mutation-1.json`; `mutation-3.json` ran its 2 survivors again after the last edit of a test file).
- m4 (minor). `identity.test.cjs` asserted a 5 s wall-clock window around `Date.now()`; it now stubs `Date.now` for one synchronous step and compares the session expiry with that value plus the TTL.
- Browser (discrepancy). `tests\browser.cjs` also asserts that the page left no cookie (the context sees HttpOnly ones too) and no local or session storage entry.
- Hygiene (found by the controller). The first version of `child-env.test.cjs` gave its control children a RELATIVE `NODE_V8_COVERAGE`, so every run left about 95 KB `coverage-*.json` files in the repository root. The control children now get an ABSOLUTE scratch directory below this namespace's own gitignored `tests\scratch` (not a system temporary directory) as `NODE_V8_COVERAGE` and as their working directory, removed in `finally`, and the test asserts that the listing of the working directory, of the repository root and of this namespace is the same before and after (a listing, never a duration). Because that edit changed a test file, every capture that hashes the test files was made again afterwards.

## Tests (what proves what)

`server`, `isolation`, `isolation-more` (cross-tenant IDOR on every kind and verb, claims in every header/query/body, same id in two tenants, lists, search, cursors, conditional
requests, cookies, audit, quotas, mass assignment, every single-character token tamper, a user without a tenant), `lifecycle` (every transition and every illegal one with no effect on the
world), `races` (role changes, in-flight requests of revoked, logged-out, downgraded and expired sessions, concurrent logins), `refusal-close` (EVERY refusal status as the first request, after a
kept-alive success, decided after an await, and the timer), `pipeline-one-write`, `pipeline-earlier`, `pipeline-two-writes`, `pipeline-http10`, `pipeline-third-hole` (this process) and
`pipeline-process-rows`, `pipeline-process-third-hole` (a separate server process; `matrix-kit.cjs` holds the shared set-up) (nothing runs behind any refusal: six shapes, HTTP/1.1 and HTTP/1.0;
the third hole of rev-C059: two or three legitimate requests BEFORE every Node-own refusal, with and without a body; 128 sockets each sending [G][G][X] leave nothing open),
`refusal-flood` (attacker in its own process, server in a 64 MB child, a naive control in the same file, 512 KB offered per socket; structural facts only, no clock), `pending-flood` (rev-C017 F24, the
opposite failure of the lane design: one valid mutation held open on each of 3 sockets and up to 50,000 tiny requests pipelined behind it, in HTTP/1.1 and HTTP/1.0, against a child with a 48 MB heap: the
server cuts every socket, Node parsed at most two 64 KB reads of each, the heap grew by a bounded amount, the process is alive and a legitimate GET is answered; a naive control that holds the first request and
drops the rest unanswered parses everything and cuts nothing), `property` (an independent model, 8 seeds x 500
operations in process and 2 x 120 over sockets, four invariants after EVERY operation, the last one meaning that every OTHER tenant's memberships, projects and sessions are compared with their state before it; it covers login (a fresh, replayed or
forged ticket, with or without an anonymous or an active token), anonymous start, logout, revoke by session id and by user, role change, a tenant switch attempt, create, read, list, update and delete of projects, profile reads, the admin session list and the admin audit,
the clock and the replay of any stale token, as every user of every tenant; EVERY sequence starts with dana signed in to alder AND to birch, about 2% of the steps force a revoke of "dana" by a live admin of one of the two tenants while she is live in both, and the model compares the
answer and the data of reads, lists and the admin session list (of the audit trail only the outcome: its per-tenant content is `dual-tenant`'s); the property run does NOT cover claims in headers or in the query, cursors and ETags, invalid bodies and bytes on the wire (those are `isolation`,
`isolation-more`, `fuzz` and the raw-socket files)), `dual-tenant` (one user name, two tenants: dana is a member of alder AND of birch and `proj-0001` exists in both; every operation that selects sessions, users, roles, records, counters or resources by such a name runs
in BOTH directions and asserts that the other tenant's state is unchanged afterwards, in process and over HTTP: revoke by user and by session id, logout, role change and the last admin counted per tenant, the session list, the audit trail, the session quota and the record
bound, update and delete of the shared project id, a revoke by a tenant that has no such member; written for the one hole that the independent review of the first publication found, see "The review fix"), `identity`, `store`, `service`, `contract` (units, the tripwire that no operation opens another
tenant's scope, a walker that mutates every reachable object of every read answer), `guards` (assets, depth of the lanes, fail-closed read stop, two live apps closed in both orders),
`page` (the page under a DOM stub with fetch bridged to the real server, and tampered answers), `imports` (pins, the exact foreign file set, the importer contract against the real exports),
`evidence` (every manifest, the seal, the figures, a tamper test per kind), `rows-complete` (the refusal table covers every typed code), `fuzz` (a SEEDED fuzz of hostile bodies, queries and whole requests: the
validators are total, every answer is a typed outcome of the closed table, none is `INTERNAL_ERROR`, the server stays healthy), and fourteen small files that were each written because a
mutant survived the suite (a systematic one on the first mutation pass or on a private re-run of it, or, for `guard-gaps`, one of the hand list): `static-tables` (the declared scope, every field; every route that
takes no body refuses one), `auth-header` (the `WWW-Authenticate` challenge on every 401 and on no other answer), `credentials` (a malformed credential on every route that reads one, the ticket not
spent), `continue` (`Expect: 100-continue`: invited only after authentication, role and media type), `finished-socket` (a request whose connection was ended while it read its body or waited in the commit
queue has no effect), `wiring` (the timeouts, keep-alive and connection cap come from the limits; one warning; tracked sockets), `identity-room` (an evicted record is dropped completely; a ticket is never
coerced; the answer of a logout), `store-gaps` (the stored entry that `record` returns), `contract-pins` (the declared limits, seeds, members and profiles, and what each tenant serves), `contract-bounds` (every input field accepted
at its bound and refused one past it, the exact fields of every operation, the list query), `credential-first` (on the login route a malformed credential is judged before the claims, the query, the media type and
the body), `close-resolves` (close() resolves, ends an idle connection and stops the listener, awaited for a bounded number of event-loop turns, never a clock), `page-gaps` (the closed validation of every answer the page reads, the classification of an answer, every precondition of the cross probes, forged answers, fallbacks, the exact requests, the state of the
page while a run is in flight; after the first run of each request it replays the REAL answer from memory, so a forged scenario opens no socket) and `guard-gaps` (a token is judged by its WHOLE shape: a live token with something before or after it is malformed, never merely unknown; found by the hand list of mutants). Every one is a NEW file: no existing test was edited after the mutation pass that found its gap.
Three existing test files WERE edited by the review fix and are named in "The review fix" (`identity.test.cjs`, `property.test.cjs`, `contract-pins.test.cjs`; `pending-flood` and `refusal-flood` only changed how they start children; `imports` too, and how it computes a relative path: it cut one character off when the repository root is a drive root, which a capture from a substituted drive letter found): the kills that pass 1 recorded for a file that changed are run again by pass 2.
Two more files are the review fix itself: `child-env` (a spawned test child never inherits `NODE_V8_COVERAGE`: the behavior of the real `child_process` with a control that shows that deleting the variable is handed back, a structural test over every file that spawns a process, the retry of `coverage.cjs`) and
`default-timeouts` (the SHIPPED limits, nothing tuned: three shapes of stalled request behind 0, 1 and 2 complete requests, the earlier answers, then the typed 408 where Node allows it, then the end of the connection).

## Cost of the test files

The runner stops a test file at 60 s, so every process-spawning or raw-socket-heavy file is cheap on purpose. The first version of this card had ONE pipelining file with every shape for every
refusal row; under eight CPU burners it ran over that cap, which is why the matrix (one table of every refusal, `rows.cjs`) is split by the SHAPE of bytes sent behind each refusal and by the place of
the server: `pipeline-one-write`, `pipeline-earlier`, `pipeline-two-writes`, `pipeline-http10`, `pipeline-third-hole` (this process) and `pipeline-process-rows`, `pipeline-process-third-hole` (a
separate server process). Each file starts ONE app or ONE server child and prepares the world once (`matrix-kit.cjs`); `refusal-flood` and `pending-flood` share one real child and one naive control per
file (512 KB offered per socket, or at most 50,000 tiny requests). Every check COUNTS facts (answers, closed sockets, parsed requests, bytes read, the CPU ratio against the naive control, the heap after a
forced GC) and no test asserts an absolute wall-clock bound; the only deadlines (15 s, and 40 s in `default-timeouts`, which waits for the SHIPPED 5 s limits to fire, all its shapes at the same time against one app, about 12 s in all) end a wait that cannot succeed. The loop figures above measure each of these files 20 times, 4 at a time, under four
burners that the loop started; a run over the 60 s cap under that load would be a finding stated there, and a failing run is a defect.

## Honest limits

- NOT probed: HTTP/2 and h2c, TLS, keep-alive negotiation beyond what Node does, real signals, a redirected Desktop, persistence (state is in memory: a restart forgets every session, ticket and
  resource), a real clock (every test injects one), a real identity provider (the ticket stand-in is in process), concurrency beyond one event loop, memory growth over days.
- Anonymous sessions are a small global pool (16 active, 32 records): a flood can fill it and refuse new anonymous sessions (login needs none, so authentication is never starved by it).
- The tenant claim rule refuses names that contain tenant, organi[sz]ation, workspace, account or org; a client that smuggles a tenant under another name has nothing to claim, because nothing reads one.
- Importer inheritance: the lane and refusal code of C009 is used as published (`f95cc52a29cf`); it adds `X-C009-Scope`, writes the Node-own answers itself (no `Vary`), and C009 itself was
  not accepted when this card started. A Windows reset can discard an answer that the client has not read yet; the two-writes shape therefore accepts "no answer" but never a wrong or an extra one.
- A consistent rewrite of a manifest, its inputs and the seal is not detectable by `evidence.test.cjs`: the published commit and tag are the anchor.
- Pending first request (rev-C017 F24, `pending-flood.test.cjs`): Node parses the WHOLE read (up to 64 KB, about 3,450 tiny HTTP/1.1 requests) before any lane can cut the socket, so a connection whose first
  request is still pending costs about 6 MB of request and response objects until that request ends (the test prints what it measured: 18 MB for 3 HTTP/1.1 sockets and 7 MB for 3 HTTP/1.0 sockets in a
  child with a 48 MB heap). Memory is bounded PER SOCKET and by the 256-connection cap, not by the heap and not by the number of requests after the first read (50,000 are offered per socket, at most two reads
  are parsed). By extrapolation, not measurement, 256 sockets that each hold a pending first request would cost on the order of 1.5 GB; nothing above 3 pending sockets was probed (a 48 MB child is known to
  die at about 8, L-0213) and only a held `project.create` was tried as the pending request.
- The transcripts of the two earlier RED cycles (`red-1`, `red-2`) contain absolute paths of the machine that produced them (the recorder keeps the stack traces of failing tests, including the local Windows user
  name); they were not scrubbed because the manifests pin them by hash. Every recorder capture of the fix round except the browser run was made with the code of the shared recorder from a substituted drive letter that maps to the same working tree (only the root constant of the recorder was changed), so that the stack traces of the new RED cycle and of the fix RED carry no local identifier; a scan of every added or modified file and of every decompressed transcript found none. The browser run needs the real path: `testing\browser\isolated.cjs` refuses a page outside its approved roots when the repository is reached through the substituted drive.
- The generator mutates conditions, comparisons, logical operators, negations, simple statements and `return value;` (numbers in contract.js only); it does not mutate method calls, property names, the content of strings, templates and regular expressions, object-literal values, call arguments, iteration sources or the order of statements. The HAND list (70 mutants of `tests\hand-mutants.cjs`) covers argument, iteration, scope and anchor mutants of the isolation guards, but it is a list chosen by a person: a mutant of those classes that is not on it was not tried. page.js mutants run against `page` and `page-gaps` only (no other file loads it). The 2 surviving mutants of the generated pass are equivalent by a data-flow argument (a one-line proof each), not by a test.
- Stalled requests: the typed `408` arrives after about 5 to 6 seconds for a stalled body and for headers that stop in the first request of a connection; half-sent headers behind a complete request are cut by Node's keep-alive timeout without an answer (see "What is imported"). `default-timeouts.test.cjs` waits for the real timers and asserts what arrives, never how long it took.
- Machine facts: a CPU burner at BelowNormal got 0.05 s of CPU in 6 minutes on this machine (88 node processes), so the campaign and the loops run at normal priority with 2 workers at most per campaign, and the campaign waits for a mutation slot of the machine.
