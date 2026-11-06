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
- Resource bounds (`contract.js` `limits`): body 4096 B, audit log 200 entries, token lifetime 10 min (max 15), 5 s idle socket,
  256 connections, 4 requests in flight per socket (a client that pipelines further is cut off), 1000 state entries (409 `STATE_FULL`),
  5 s header and request timeouts, Node's 16 KB header limit (431), a body stream cut after 64 KB. `app.close()` ends every accepted socket.

Files: `contract.js` (identities, command x role table, input rules), `authz.cjs` (tokens, decision), `commands.cjs` (mutation pipeline),
`handlers.cjs`, `ledger.cjs`, `queue.cjs`, `codes.cjs`, `http-io.cjs`, `server.cjs`, `cli.cjs` (CLI, rechecks the current C001 consent
and fails closed), `index.html` + `page.js` + `style.css` (inspection page, strict CSP, no inline script), `imports.json` (pinned accepted C001 bytes).

## Commands (repository root, PowerShell 7; run test files one at a time under a timeout when in doubt)

GREEN, every non-browser test (about 25 s idle, about 90 s on a loaded machine):

    node --test --test-timeout=60000 --test-concurrency=1 "capability/C009/tests/*.test.cjs"

Per-file coverage, 85 lines / 85 branches / 85 functions for each of the 11 production files, unloaded counts as 0%
(one L-0004 command per file, 3 at a time, about 3.5 minutes: take a heavy slot):

    node capability\C009\tests\coverage.cjs

The command it runs for one file (here `server.cjs`):

    node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=**/C009/server.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability/C009/tests/*.test.cjs

Real isolated headless Edge (heavy slot, about 45 s, writes nothing; leave CAPTURE_BROWSER_EVIDENCE unset). It opens the page through
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

## Decisions and limits

- The CLI prints the four synthetic tokens on one JSON line so a person can paste them into the page; they live only in that process
  and end with the listener (10 minutes at most or SIGINT/SIGTERM). The CLI reads the live ledger once to recheck the C001 consent;
  tests inject the committed approval instead.
- `tests\coverage.cjs` is test tooling and not counted as production code; `page.js` is measured under the DOM stub built from the ids
  of the real `index.html`.
- This fixture proves server-side enforcement against hostile local clients. It makes no claim about Express, Entra tokens,
  TLS, rate limiting by identity, or any native Azure behavior.
