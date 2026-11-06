# C014: management secrets stay on the server, public evidence is redacted, seeded canaries never reach a browser

A **synthetic, local, offline** fixture on `127.0.0.1` (automatic port, Node built-ins only, no persistence, no cloud, no package). A service HOLDS fictional canary
secrets and fictional personal data (four management tokens, a signing key, a connection string, a service credential, four contacts with name, e-mail and phone)
and SERVES public evidence (trace, runs, audit, log, a signed export bundle, typed error answers, an inspection page). Nothing in it is real. It is built on the
accepted **C009** authorization fixture (identities, token registry, permission table, command pipeline, ledger, and the refusal path of `http-io.cjs`),
imported read-only and pinned in `imports.json`.

## The design in five sentences

1. `vault.cjs` (management side) holds every secret and uses it only there: the registry draws the configured tokens from it, `sign()` is an HMAC over the public
   bundle, the fictional store fails with the connection string in its message and the password in its cause, the fictional upstream call carries the credential in
   its `Authorization` header and the contact in its text. Nothing it holds is ever returned, only booleans and counts (`GET /v1/manage/config`, operator only).
2. `evidence.cjs` keeps everything RAW on the management side (request headers and URLs, error messages, causes and stacks, the upstream call, the contacts): no route serves a raw record.
3. `redact.cjs` is THE redaction function, `publish(kind, value)`: an **allow-list** of fields with closed vocabularies (a field no rule names is never read, so it cannot be
   copied), plus masking **by value** (every registered secret in every covered encoding) and **by shape** (a closed list) in the few free-text fields. Its result is a
   frozen `PublicBody` that only `publish` can mint.
4. `server.cjs` sends JSON only as a `PublicBody` (`createOut` throws before anything is written for anything else) and static assets from three fixed files; refusals,
   pipelining lanes and the answers Node would give itself use the C009 refusal path (answer once, `Connection: close`, stop reading, end the connection, nothing runs behind it).
5. `page.js` validates every document against a closed shape and prints only values it checked itself (ids, integers, closed words); it never prints a string the server sent.

## Routes

| Route | Who | Answer |
|---|---|---|
| `GET /`, `/page.js`, `/style.css` | any valid or no token | the page (no inline script, CSP `script-src 'self'`) |
| `GET /scope.json` | any | facts only (synthetic, no persistence, no cloud) |
| `GET /v1/evidence/trace`, `runs`, `audit`, `logs` `?limit=1..200` (default 50) | any | `{ outcome, kind, revision, total, shown, limit, items }`, `shown <= total`, items typed |
| `GET /v1/evidence/bundle` | any | the signed export, `Content-Disposition: attachment; filename="c014-evidence-bundle.json"`; `signature.value` is HMAC-SHA256 of the JSON text of the bundle without `signature`, key held server-side |
| `GET /v1/manage/config` | operator (401 without a token, 403 for others) | `{ configured: { tokens, signingKey, connectionString, serviceCredential, contacts } }`: counts and booleans |
| `POST /v1/commands/run.create` | conductor | creates a run (uses the credential and the contact server-side) |
| `POST /v1/commands/config.check` | operator | `{ mode: "ok" \| "fail" }`; `fail` raises the store exception whose message, cause and stack carry the secrets |

Every GET verifies a presented credential: a forged, expired or malformed token is a typed 401 and is never read as anonymous (C009 behaviour). Every answer is
`Cache-Control: no-store`; none sets a cookie, a `Location` or an `Access-Control-*` header.

## What the redaction covers (closed lists; everything else is stated under "Honest limits")

* **Allow-list** (`redact.cjs` `SCHEMAS`): `trace` (seq, kind, method, route class, status, role, code, steps), `runs` (id, units, owner, revision, status, artifacts as a COUNT, steps),
  `audit` (seq, outcome, code, command, subject, role), `logs` (seq, level, event, route class, status, code, role: the raw message is never published), `list`, `bundle`,
  `signedBundle`, `answer`, `error`, `scope`, `config`. Enum, id, integer, boolean and hex fields outside their vocabulary become `null`; an object whose REQUIRED field is invalid is dropped whole.
  A client-supplied string (header, URL, query, body, command name) is never a field of any schema, so it can never be published.
* **Free text** (`steps[].detail` and the error `message`) is masked: (1) exact occurrences of every registered secret are replaced by `[redacted]`; (2) if ANY view of the text still
  holds a form of a secret, the whole value is masked; (3) the closed list of shapes is replaced: management token `c009_` + 43, `Bearer` credential, `Password|Pwd|AccountKey|SharedAccessKey|SharedAccessSignature|ApiKey|Secret = value`, e-mail address, phone number, JSON web token, a 40+ character base64 blob, a 32+ character hex run; (4) the text is cut at 4,096 characters only AFTER masking, and a text over 65,536 characters is masked unread.
  The check in (2) runs BEFORE the shapes are replaced, so a shape can never chew part of a secret and hide it from the by-value check (a mutant found by the first unit tests).
* **Covered encodings** (the views and needles are in `canon.cjs`; the sweep's scanner re-derives them independently in `tests\scanner.cjs`): raw; upper and lower case; URL-encoded (component, every byte, lower-case hex), double URL-encoded; base64 and base64url at all three alignments inside a longer base64 text; hex (either case);
  JSON `\uXXXX`, `\u{...}` and `\xHH` escapes; HTML decimal and hexadecimal entities (with or without the semicolon) and the five common named ones; NFKC/NFKD variants (full-width letters, ligatures, exotic spaces), dash look-alikes, combining marks;
  zero-width, soft-hyphen, BOM and bidi format characters between the characters; a mixture of the above (partly percent-encoded); and a secret split across chunks of a stream (the sweep reads every answer whole and in one-byte chunks).
* **What is registered by value** (`vault.secrets()`): every token, the signing key, the connection string and its server, host, database, user and password, the credential id and secret, every contact name, each part of a name,
  e-mail, its local part, phone and its digits only (each at least six characters). A token issued later (`service.issueToken`) is registered before anyone holds it.

## The canary sweep (`tests\sweep.cjs`, `tests\sweep.test.cjs`, `tests\process-sweep.test.cjs`)

Fictional canaries: `tests\canaries.cjs` derives 27 held values (tokens, key, connection string with its parts, credential, contacts) and 6 client values from fixed phrases; failing assertions print canary ids and form names, never a value.
The sweep (1) plants every held canary in every one of the 25 encodings in every place the system can touch: `plant('run' | 'trace' | 'log' | 'audit' | 'error', text)` writes the text into free text, unknown fields, an `authorization` header, PII, nested arrays and objects, a file name, an object KEY, an error message, its cause and its stack text;
(2) drives real management traffic (the service uses its secrets and fails with them in an exception); (3) plants client canaries in a header, the cookie, the user agent, a `Referer`, the URL, the query, a command name and the body (valid, unknown field, malformed, wrong media type);
(4) calls 12 routes and 6 more methods (including a CORS-style `OPTIONS`) as anonymous, visitor, conductor-a, conductor-b, operator, a forged, a malformed and an expired token; (5) scans every byte that came back (status line, headers, body), once whole and once in one-byte chunks, and the console of the service.
It runs in the test process, against a server in a separate process (its stdout and stderr are scanned too) and against the NAIVE stub of the RED (it must find canaries there: it is not vacuous).
To plant your own canaries: `startLocal({ config })` of `server.cjs` takes the management configuration (see `tests\canaries.cjs` `seedConfig()` for the shape), `service.plant(place, text)` is the in-process management seam, and `runSweep({ start, config })` runs the sweep.

A property test (`tests\property.test.cjs`, four fixed seeds, 28 operations each) draws from plant, plant a freshly issued token, get, post, export (signature and counts verified), restart, cancel a half-written request, refuse-and-pipeline, overflow the ring and repeat a plant;
after EVERY operation the bytes served and the console hold no canary, every list reconciles shown of total, and the revision never goes backwards within one lifetime.

## The refusal path, pipelining and the third hole (inherited from C009, proved again here)

C009's `http-io.cjs` is imported read-only (`createLanes`, `createResponder`, `localGuard`, `hasBody`, `canStopReading`, `clientErrorCode`). An early version of its README said `admit.refuse(socket, code, { immediate })`, which was **false**
(`admit.refuse = (socket, code)`, `immediate` occurs nowhere; the accepted README no longer says it): the code was read and trusted. `server.cjs` wires the same listeners as C009 (`request`, `checkContinue`, `checkExpectation`, `clientError`, `connect`), every request through the lanes,
`requireHostHeader: false` (a request without Host reaches `localGuard` and gets the typed 421), `connectionsCheckingInterval` with the header and request timeouts, `maxConnections`, and the fail-closed check that this Node can stop reading a refused socket.

* `tests\matrix.cjs` (table-driven, ONE TCP write per cell, two writes 8 ms apart for one position): 27 refusal rows (401 x3, 403 x3, 404 x2, 405 x3, 400 x8, 413, 414, 415, 417 x2, 421 x2, 431, and the answers Node gives itself: `Expect: nonsense`, an oversized header, `CONNECT`, a malformed request line)
  in 8 positions (`[R]`, `[R][M]`, `[G][R][M]`, `[G][G][R][M]`, `[G][G][G][R]`, **`[G][G][R][G]`**, the two-write case, `[M][R]`), refusal and mutation each in HTTP/1.1 or HTTP/1.0 (Node honours `Expect` only in 1.1, so those two rows are 1.1 only):
  the client gets exactly the answers of the requests BEFORE the refusal, in order, then the typed refusal, the server ends the connection, and the number of runs afterwards proves that nothing ran behind it.
  It runs in the test process (`tests\refusal.test.cjs`, coverage counts it) and against a server in a separate process (`tests\process-matrix.test.cjs`: refusal in 1.1; `tests\process-matrix-10.test.cjs`: refusal in 1.0).
  An asynchronous refusal (the owner quota full after the body was read) and `Expect: 100-continue` (a refused request is never invited to send its body) have their own tests.
* The **third hole** of `orders\_PIPELINING.md` (a Node-own answer decided at parse time behind two legitimate requests): `[G][G][X]`, `[G][G][G][X]` and `[G][G][X][G]` are rows of the matrix for every Node-own refusal in both framings, AND `tests\process-flood.test.cjs` sends `[G][G][X]` on 128 sockets to a child with a 128-connection cap:
  every socket gets two answers and the 417, every socket is ended by the server, the connection count returns to 0 and a legitimate GET is answered; a bare Node control server keeps all its sockets open (the test can fail). They pass on C009's lanes: no production file of C009 was touched.
* The refusal flood: attacker in a separate process (`tests\flood-attacker.cjs`), server in a 64 MB child (`tests\child-server.cjs`), a naive control in the same test under the same load. Assertions are counts and ratios, never seconds: the server ended every attacker socket,
  read at most half of what the control read from any socket, spent at most half the CPU per attacker socket, a legitimate keep-alive client kept getting 200 during the flood, no attacker connection is left and the child is nowhere near its heap.

## The page and the real browser

`page.js` is loaded under Node with a DOM stub built from the real `index.html` ids and run through `vm` under its file URL (`tests\dom-stub.cjs`, `tests\page.test.cjs`): valid documents, 13 forged shapes that each reject the whole section with a fixed sentence, forged steps, a non-200 answer, text that is not JSON, a failed and a stalled request, a canary in every free text (never shown: only the NUMBER of steps is),
the reload button, the markup (no inline script or style, one polite live region, native controls), and the page vocabularies compared field by field with the server's.
`tests\browser.cjs` drives a real isolated headless Edge through `testing\browser\isolated.cjs` (`openIsolatedLoopback`: GET and HEAD only, so the POSTs of the service are proved by the Node suites over real sockets and by the server-produced transcript, never by the page) against the real service and against a FORGING server serving the real assets
and forged evidence, and scans everything the browser holds for all 34 canaries: the rendered DOM and its text, localStorage, sessionStorage, cookies, IndexedDB and CacheStorage names, the console and page errors, every request URL and header (no secret in a URL, no `Referer`) and every response (status line, headers, body); it checks keyboard operation (Tab reaches the reload button then the download link, a visible focus ring, Enter reloads) and verifies the downloadable bundle against the signing key held server-side.
It asserts that the installed Edge is Microsoft-signed with a qualified major (no equality pin on a build or hash; the actual version and SHA-256 are recorded).

## Claims and the tests that back them

Each row names a test file and the first words of the title of the test that states the claim; `tests\integrity.test.cjs` checks that the file holds a test with that title. That the test EXISTS is checked there; that it FAILS when the claim is false is what the mutation campaign (see the evidence layout) measures.

<!-- claims:begin -->
| Claim | Test file | Title starts with |
|---|---|---|
| Zero canary hits in any byte the real server sent (whole, one byte at a time, console), over every route, identity and planting place. | sweep.test.cjs | THE SWEEP, real server: zero canary hits |
| The sweep is not vacuous: over the naive stub of the RED it finds canaries in raw, encoded and streamed form. | sweep.test.cjs | the sweep is not vacuous |
| A held canary planted in the raw store in ONE covered encoding never shows in a list or in the bundle, place by place and encoding by encoding. | sweep.test.cjs | place by place, encoding by encoding |
| The same sweep over a server in ANOTHER process also covers everything that process printed. | process-sweep.test.cjs | the sweep over a server in another process |
| The scanner finds every encoder's output with the right canary id and a different canary is not reported. | scanner.test.cjs | every encoder is found by the scanner |
| The scanner finds a canary split across one-byte chunks; the per-chunk control does not. | scanner.test.cjs | the stream scanner finds a canary split across one-byte chunks |
| The scanner reports ids and form names, never a value. | scanner.test.cjs | the scanner reports ids and form names only |
| The management route answers only the operator and shows booleans and counts. | server.test.cjs | the management route is for the operator |
| A bad credential is never read as anonymous; every public route answers every valid identity the same. | server.test.cjs | every public route answers every valid identity the same |
| Every answer carries the fixed headers: no-store, nosniff, no referrer, the CSP, no cookie, no CORS header, no redirect, no source map. | server.test.cjs | every answer: no-store, nosniff |
| The operator's bundle download is signed with a key that stays on the server and the signature verifies. | server.test.cjs | an operator reads the bundle as a download |
| The bundle carries every kind through the item path, counts equal to the item counts, and a signature over exactly the unsigned JSON text. | evidence.test.cjs | the bundle: every kind through the item path |
| Only the redactor mints a public body, and the server writes JSON only as a public body. | redact.test.cjs | a PublicBody is minted by publish alone |
| The server refuses to write anything but a public body: a plain object, a string or a buffer is a TypeError before a byte is written. | server.test.cjs | createOut sends JSON only as a PublicBody |
| A field no rule names is never copied: unknown fields, nested unknown subtrees and canary keys. | redact.test.cjs | allow-list: a field no rule names is never copied |
| Every covered encoding of a registered secret masks the whole value. | redact.test.cjs | text masking by value: every covered encoding |
| Secret shapes are masked although the service never held them. | redact.test.cjs | secret shapes are masked although the service never held them |
| The masking work is bounded and a secret across a cut is not left half. | redact.test.cjs | the work is bounded: a text past the cap |
| Hostile values never throw: getters, proxies, sparse and huge arrays, cycles, prototype keys. | redact.test.cjs | hostile values never throw |
| A published item is reused until the redactor learns a new secret, then published again and masked. | evidence.test.cjs | a published item is reused until the redactor learns |
| A raw error becomes failure steps and its stack is never read. | evidence.test.cjs | a raw error becomes failure steps next to the raw steps |
| Every refusal is typed, ends the connection, and nothing runs behind it (every row and position, HTTP/1.1 and HTTP/1.0). | refusal.test.cjs | the matrix: every refusal row, every position |
| The same matrix against a server in another process, refusal in HTTP/1.1. | process-matrix.test.cjs | the matrix against a server in another process, refusal in HTTP/1.1 |
| The same matrix against a server in another process, refusal in HTTP/1.0. | process-matrix-10.test.cjs | the matrix against a server in another process, refusal in HTTP/1.0 |
| A flood of refused requests with endless one-byte chunks from another process: the server ends every socket, reads little, spends little CPU and still serves; the naive control does none of that. | process-flood.test.cjs | flood of refused requests with endless one-byte chunks |
| The third pipelining hole: [GET][GET][Expect: nonsense] on 128 sockets, the typed 417 and every socket ended. | process-flood.test.cjs | [GET][GET][Expect: nonsense] on 128 sockets |
| F24: 50,000 requests pipelined behind a pending first request leave the server alive with a bounded heap and a legitimate GET still answered. | pending-flood.test.cjs | F24: 50,000 requests pipelined behind a pending first request |
| The page never prints a string the server sent: canaries in every free text and field of a forged document are nowhere in the DOM. | page.test.cjs | the page never prints a string the server sent |
| A forged document is rejected whole with a fixed sentence and the other sections still load. | page.test.cjs | forged documents are rejected whole with a fixed sentence |
| The page markup has no inline script, no inline style and no event attribute. | page.test.cjs | the markup: no inline script or style |
| No public return of the namespace is a shared mutable object, apart from the stated module vocabularies. | returns.test.cjs | no public return is a shared mutable object |
| An injected failure in a test that owns a child process still closes the child. | cleanup.test.cjs | an injected failure in a test that owns a child process |
| Two live servers in one process keep separate secrets and state and close in any order. | health.test.cjs | two live servers in one process: separate secrets |
| The server fails closed where this Node cannot stop reading a refused connection. | health.test.cjs | fail closed at startup |
| The permission table is deny by default and frozen. | service.test.cjs | the permission table is deny by default and frozen |
| The vault knows every leaf and every part a driver message or a log line would reveal. | vault.test.cjs | secrets(): every leaf and the parts a driver message |
| The fictional store failure puts the connection string in its message and the password in its cause: the raw material the redaction must clean. | vault.test.cjs | the fictional store: ok names the server |
| Over a seeded fuzz of hostile documents (every kind, three seeds) the redactor always returns a frozen public body of exactly the allow-listed shape, without a canary in any covered encoding, the same answer twice, and a hostile proxy is read at most as often as the schema can visit. | fuzz.test.cjs | publish over a seeded fuzz of hostile documents |
| The oracles of that fuzz are not vacuous: an extra key, a value out of range, a missing required value, an over-long list and a canary in each covered encoding are each caught. | fuzz.test.cjs | the oracles of the fuzz are not vacuous |
| A proxied array that claims four billion entries is read at most as often as the list limit allows. | fuzz.test.cjs | a hostile container costs at most the reads its limit allows |
| Masking seeded hostile text always returns a string of bounded length without a canary in any covered encoding. | fuzz.test.cjs | maskText over seeded hostile text |
| Seeded hostile configurations are built or refused with a typed ConfigError that names no secret. | fuzz.test.cjs | createVault over seeded hostile configurations |
| Seeded hostile bodies get a typed answer from validateInput and only known fields come out. | fuzz.test.cjs | validateInput over seeded hostile bodies |
| Seeded hostile raw records: a record that cannot be read is published as nothing, lists and the signed bundle are public bodies without a canary, shown reconciles with total. | fuzz.test.cjs | the evidence over seeded hostile raw records |
| The limits of that totality are stated and pinned by name (a Proxy or a throwing accessor into createVault, a Proxy into validateInput, a Proxy or a throwing getter into errorSteps). | fuzz.test.cjs | stated limits, pinned |
<!-- claims:end -->

## Commands (repository root, PowerShell 7; `RUN` is the run folder; take a heavy slot with `RUN\scripts\heavy-slot.ps1` before the browser and coverage runs)

```powershell
# RED: the initial specification tests against the NAIVE stub (field-name blocklist per route, raw records served, refusals on a kept-alive connection): exit 1, 5 of 5 fail on behavioral assertions
$env:C014_SUBJECT = (Resolve-Path capability\C014\evidence\red\stubs).Path
node --require .\capability\C014\tests\scratch-cwd.cjs --test --test-concurrency=1 capability\C014\evidence\red\initial-a-r2.snapshot.cjs capability\C014\evidence\red\initial-b.snapshot.cjs
Remove-Item Env:\C014_SUBJECT
# GREEN replay: the same snapshot bytes against the real files: exit 0, 5 of 5 pass
node --require .\capability\C014\tests\scratch-cwd.cjs --test --test-concurrency=1 capability\C014\evidence\red\initial-a-r2.snapshot.cjs capability\C014\evidence\red\initial-b.snapshot.cjs
# GREEN: the whole non-browser suite (the command of evidence\green\suite-02), then the evidence and imports integrity
node --require .\capability\C014\tests\scratch-cwd.cjs --test --test-concurrency=1 capability\C014\tests\canon.test.cjs capability\C014\tests\scanner.test.cjs capability\C014\tests\redact.test.cjs capability\C014\tests\vault.test.cjs capability\C014\tests\evidence.test.cjs capability\C014\tests\service.test.cjs capability\C014\tests\server.test.cjs capability\C014\tests\health.test.cjs capability\C014\tests\returns.test.cjs capability\C014\tests\fuzz.test.cjs capability\C014\tests\refusal.test.cjs capability\C014\tests\sweep.test.cjs capability\C014\tests\property.test.cjs capability\C014\tests\page.test.cjs capability\C014\tests\process-sweep.test.cjs capability\C014\tests\process-matrix.test.cjs capability\C014\tests\process-matrix-10.test.cjs capability\C014\tests\process-flood.test.cjs capability\C014\tests\pending-flood.test.cjs capability\C014\tests\cleanup.test.cjs
node --test capability\C014\tests\integrity.test.cjs
# Per-file coverage, ONE L-0004 command per production file (7 files, 85/85/85): heavy slot, about 2 to 4 minutes (the default mode measures every file over all in-process suites and takes 5 to 10)
node capability\C014\tests\coverage.cjs --focused --parallel=1
# one file by hand
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=capability/C014/redact.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability\C014\tests\redact.test.cjs capability\C014\tests\canon.test.cjs capability\C014\tests\evidence.test.cjs capability\C014\tests\service.test.cjs
# Mutants: the named guard mutants (a failing test NAME per kill), then the SYSTEMATIC generator over every condition and statement of the seven production files (--list prints the counts,
# --control runs each suite unmutated first, --only=<file>:<index>,<index> re-runs chosen mutants, --all-suites uses every in-process suite). A mutant is killed by the first failing assertion;
# a run that only timed out, or that this script had to end, is UNDECIDED and never a kill. Workers run at normal priority.
node capability\C014\tests\mutants.cjs --named --workers=2 --out=<new report.json>
node capability\C014\tests\mutants.cjs --workers=2 --control --out=<new report.json>
# The load loop of the process-spawning files: 20 runs, 4 at a time, under 4 CPU burners that the script starts (PIDs printed, stopped by PID in finally). Take the loop slot of the run folder first.
node capability\C014\tests\loop.cjs --runs=20 --parallel=4 --burners=4
# The fresh-checkout run: a scratch tree of git archive blobs (LF) and of the same tree converted to CRLF, the whole suite in each
node capability\C014\tests\fresh.cjs --mode=lf
node capability\C014\tests\fresh.cjs --mode=crlf
# Real Edge (heavy slot; CAPTURE_BROWSER_EVIDENCE unset writes nothing), and the proof that a failing check still closes the real session (an injected failure, exit 0 of the proof script)
node capability\C014\tests\browser.cjs
node capability\C014\tests\browser-cleanup.cjs
```

## Evidence layout (`evidence\`, `.gitattributes` `* -text -diff`; every capture by the shared recorder `RUN\scripts\archive-run.cjs`: raw stdout and stderr, exit code, input SHA-256 raw and LF)

| Folder | What |
|---|---|
| `red\red-01` | the FIRST RED, written before any production file existed (`initial-a.snapshot.cjs`, `initial-b.snapshot.cjs` against `stubs\server.cjs`): 5 of 5 fail on behavioral assertions. Its replay against the real files showed two flaws of the TEST, kept as they are: the sweep labelled transcript parts with request targets (so the canaries planted in a URL and a query were scanned as bookkeeping text) and scanned the stream per byte (hours on a megabyte). A first capture that did not even start (a relative `--require` path) was discarded before any commit. |
| `red\red-02` | the corrected snapshots (`initial-a-r2`, `scanner-r2`, `initial-b`) against the same stub: 5 of 5 fail (a canary found in an answer, a field outside the allow-list, no `Connection: close`, a mutation that ran behind a refusal). Captured after the production files existed, because the flaw was found by the replay (the sanctioned procedure). |
| `green\replay-01`, `green\replay-02` | the red-02 snapshot bytes replayed UNCHANGED against the final production files: 5 of 5 pass. `replay-01` was taken before `vault.cjs` was hardened (see below) and is superseded by `replay-02`. |
| `green\suite-01` | the first whole-suite capture, a retained FAILED attempt: 89 of 90 passed and the cross-process flood test was cancelled by its own 120 s timeout. The cause was a defect of the TEST: its legitimate client kept one connection alive and waited for an answer on a socket that the server had already reaped (keep-alive timeout of one second), so it waited until the test timeout; the client now reconnects and every wait is bounded. |
| `green\suite-02` | the final whole non-browser suite: one runner, 20 test files, 124 tests, exit 0 (the integrity test is not in it: it runs on its own and inside the fresh trees). |
| `coverage\run-01`, `run-02-focused`, `run-03` | earlier per-file coverage captures (exit 0), SUPERSEDED: the test files they pin were edited later (the tests that kill the survivors of the mutation campaign). Their transcripts and exit codes are still recomputed. |
| `coverage\run-04` | the final per-file capture (focused mode, ONE command per production file, 7 files). |
| `browser\run-01`, `run-02` | retained FAILED attempts: two assertion bugs of the TEST (the bundle URL counted among the evidence URLs; the forging server's own responses scanned as browser state). `run-03` and `run-04` passed and are superseded (inputs edited later). |
| `browser\run-05`, `browser\cleanup-02` | the final real Edge observation (`browser\browser-*\browser-observation.json` holds the version, signature and the scanned counts) and the proof that an injected failure still closes the real session. `cleanup-01` is superseded. |
| `loop\run-01` | the first 20-run loop, a retained FAILED attempt: `process-flood` failed in 20 of 20 runs because of two defects of the TEST that only load exposes (a fixed 800 ms grace after the attacker's last byte decided "the server ended the socket"; the harness polled for the attacker's report every 20 ms while the attacker exits at once after sending it). |
| `loop\run-02` | the second loop after both fixes: 120 of 120 passed; superseded because `vault.cjs` changed afterwards. `loop\run-03` is the final loop on the final bytes. |
| `fresh\lf-01`, `fresh\crlf-01`, `fresh\lf-02`, `fresh\crlf-02` | the whole suite, the integrity test included (137 tests), in a scratch tree of `git archive` blobs (LF) and in the same tree converted to CRLF. `lf-02` and `crlf-02` are the final captures. `lf-01` passed and is superseded: `tests\integrity.test.cjs` was edited afterwards. `crlf-01` is a retained FAILED attempt, 136 of 137: the one failure was a check of the integrity test that asked a fresh copy to hold no fresh capture, which cannot hold once the LF capture exists (and would fail for any reader who runs the two commands in a row); the check now skips a copy made by `tests\fresh.cjs`. |
| `mutants\` | `named-mutants-01/02.json` (the 28 named guard mutants), `systematic-01.json` (all seven files, 595 mutants), `systematic-02.json` (`vault.cjs` again after it was hardened), `rerun-01..03.json` (the survivors of the first pass, run again after the tests that kill them were added), `equivalents.json` (the 14 survivors that are equivalent, each with its written proof). |
| `specs\` | the recorder specs of every capture (repository-relative paths; in `spec-red-01` and `spec-red-02` the absolute path of the stub directory that the recorder was given is shown as `<REPO>`, which is the only edit made to a spec after its capture). |
| `red\stubs\server.cjs` | the NAIVE stub: ad hoc field-name blocklist per route, raw records served, refusals on a kept-alive connection. It is also the control of the sweep. |

`tests\integrity.test.cjs` recomputes `imports.json` against git and the working files, every capture manifest (both transcripts, their sizes, every input and the exit code) and the figures below, and proves by tampering in a scratch copy (a flipped transcript byte, a deleted transcript, an edited input, a deleted input, a changed exit code) that each kind of tampering fails BY NAME.

## Honest limits (what is NOT claimed)

* **Encodings that are not covered**: reversed text, ROT13, base32 and base85, compression, XOR, a composition other than URL(URL(x)) (for example base64 of a URL-encoded secret), a secret split across two fields or two records, a part of a secret shorter than six characters,
  homoglyphs that NFKD does not fold (Cyrillic look-alikes), and base64 is matched case-sensitively and only at the three alignments. Nothing here claims to find a secret that has been transformed beyond the covered list.
* **A secret the service was never told** (not in its configuration, not issued by it) is recognised by SHAPE only (the eight shapes above). The only places a value could show are the free-text fields (`steps[].detail`, the error message), all generated by the server and never from client text; `tests\service.test.cjs` shows that an unregistered plain value planted in free text IS visible. Everything else is a closed vocabulary.
* Masking a non-raw form masks the WHOLE value (fail closed), so it can hide more than the secret; the e-mail, phone, blob and hex shapes can mask harmless digits and ids that look like them.
* **The answers Node writes itself** (`clientError`, `CONNECT`) are the fixed typed bodies of C009's `refuseSocket` (code and fixed message from the closed `CODES` table, no input), not produced by this redactor.
* **Inherited from C009**: tokens live at most 15 minutes (`maxTtlMs`); plain HTTP/1.1 on loopback (no TLS, h2c not probed); a client that keeps writing after a refusal can lose the typed answer to a reset on Windows (the two-write matrix cell accepts "no answer", never a different one) and `fetch` may see ECONNRESET instead of the answer for a very large unread body (C009 findings F12 and F16);
  HTTP/1.0 is covered by the matrix, `Upgrade` is not listened for (an upgrade request is an ordinary request), real signals and a redirected Desktop are not involved.
* The timeouts (`headerMs`, `requestTimeout`, `keepAliveTimeout`) are configured and the idle limit and the connection cap are proved by tests; the header and request timeouts and the keep-alive timeout have no killing test of their own.
* No persistence: a restart in the property test is a new service, so there is no journal to flip bytes in and no file name that could be user-supplied.
* **What the mutation campaign generates and what it does not** (`tests\mutants.cjs`: 595 mutants of the seven production files, every one decided: 581 killed by a named failing test, 0 killed only by a crash, 14 equivalent with a written proof each in `evidence\mutants\equivalents.json`): every `if` condition and every operand of a compound condition forced true and false, `===` and `!==`, `&&` and `||`, relational operators, a unary `!`, `true` and `false`, an integer literal, and every whole single-line statement removed.
  It does NOT generate arithmetic operators, changed string or regular-expression literals, the conditions of `?:`, `while` and `for` (only the operators inside them), statements over several lines, removed `return` values or default parameter values, so a suite that kills every mutant may still miss a defect of those kinds (the literal limits and ranges of `redact.cjs` are pinned by tests that name every one of them, not by mutants). The 14 equivalence proofs were written and checked by the author alone: a reviewer should attack them.
* **The load loop** (`evidence\loop\run-03`: each of the six process-spawning files 20 times, 4 runs at a time, under 4 CPU burners that the script starts and stops by PID; 120 of 120 passed, the slowest run of any file took 30.6 s against the 60 s cap: `LOOP-OVER-CAP: 0`) was measured on one Windows machine that other agents were also using. Its size is the controller's decision for this card (20 runs, 4 at a time, 4 burners), smaller than the 64 runs in an 8-way loop of the standing self-review. Under that load the first loop (`loop\run-01`) failed in `process-flood` in 20 of 20 runs because of two defects of the TEST, which were fixed; a slower machine or more burners may expose others.
* **The fresh-checkout runs** build their tree from `git archive` of the eight imported C009 blobs at `HEAD` and from the C014 working files (C014 is not committed when they run): its text files are LF-normalized, or converted to CRLF, the way git stores them and a Windows checkout shows them. A clone of the published commit was not run; the commands are in the Commands block.
* **Totality on hostile input** (`tests\fuzz.test.cjs`, three fixed seeds): the redactor over every kind of document, its text masking, `createVault` over configurations without a throwing accessor or Proxy, `validateInput` without a Proxy, and the evidence over raw records are total, and the reads of a hostile proxy are bounded by what the schema can visit, not by a clock. NOT total, and pinned by name so that a change shows: `createVault` and `validateInput` on an object whose accessor or key enumeration throws (a Proxy), and `errorSteps` on a Proxy or on a getter that throws.
  Their callers are the configuration of the process owner, the result of `JSON.parse`, and a record the evidence reads inside a try block (the record is then published as nothing), none of which can be such an object. There is no seeded fuzz of the HTTP wire: the wire is covered by the fixed refusal matrix and the flood tests.
* **Public returns** (`tests\returns.test.cjs`): what `canon`, `vault` and `evidence` export is frozen all the way down or a copy. The module-level vocabularies of `redact` (the kind, claim-header, route-class, code, command, subject, schema and pattern tables), `service` (scope and modes) and `server` (kinds and assets) are plain shared arrays and objects (a `RegExp` cannot be frozen); the test names them, so that a new one fails there. The walker found a real defect while this card was built (the identities of the vault were a shared array and a dispatch result aliased the private contact), fixed in `vault.cjs`.
* **Guards that end a hang**: a few tests carry time limits whose only job is to end a hang (the per-test timeouts, an 8 s race in the close test, a 10 s settle in the matrix, 30 to 45 s polls in the flood tests). No assertion decides pass or fail by a duration, but a machine that is orders of magnitude slower could trip a guard.
* **One real browser**: Microsoft Edge 156.0.4314.58, headless, isolated profile, GET and HEAD only; no other browser and no assistive technology was run.
* **Local identifiers in archived transcripts**: no file of this card carries the session id, and none of the current captures or sources carries the Windows user name. Five archived transcripts do, because node:test prints the absolute path of a failing test (`C:\Users\<name>\...`) and a transcript cannot be edited without breaking its recorded hash: the two RED captures (`red\red-01`, `red\red-02`, 16 lines each) and the retained failed attempts `browser\run-01`, `browser\run-02` and `green\suite-01` (one line each). They are immutable history; the captures that replace them are clean. The recorder specs `spec-red-01` and `spec-red-02` show the path as `<REPO>`.
* The RED snapshots keep the first harness's 400 ms silence limit for the legacy `call()`; the final suite uses 30 s. A replay on a machine that is far slower than a loaded Windows laptop could flake in the snapshot harness: that is the cost of keeping archived RED bytes immutable.

## Decisions

* C014 started speculatively on the PRODUCTION bytes of C009 `f95cc52a29cf`; C009 was accepted afterwards on its third fix `0da3ff6eea40` with every production file byte-identical, so the pins did not change (`imports.json` names both commits and `tests\integrity.test.cjs` compares the eight blobs at both). Only production files are imported, none of C009's tests or evidence.
* Public evidence has NO free text copied from a request: that removes the class of attacker-chosen canaries by construction; free text is limited to two server-generated fields and masked.
* A mutation tool must never count a run it had to end as a kill: the first campaign ran at BelowNormal priority, starved and timed out, and its timeouts looked like kills; the runner now reports `timedOut` separately.

<!-- figures:begin -->
```json
{ "captures": {
  "red-initial": { "tests": 5, "pass": 0, "fail": 5 },
  "red-initial-r2": { "tests": 5, "pass": 0, "fail": 5 },
  "green-replay-red-r2-02": { "tests": 5, "pass": 5, "fail": 0 },
  "green-suite": { "tests": 90, "pass": 89, "fail": 0, "cancelled": 1 },
  "green-suite-02": { "tests": 124, "pass": 124, "fail": 0, "cancelled": 0, "skipped": 0 },
  "loop-load-01": { "tests": 120, "pass": 100, "fail": 20 },
  "loop-load-03": { "tests": 120, "pass": 120, "fail": 0 }
},
"coverage": { "capture": "coverage-focused-04", "files": {
  "canon.cjs": [100, 100, 100], "redact.cjs": [100, 100, 100], "vault.cjs": [100, 97.87, 100], "evidence.cjs": [100, 100, 100],
  "service.cjs": [100, 100, 100], "server.cjs": [100, 100, 100], "page.js": [100, 98.57, 100]
} },
"mutants": { "generated": 595, "killed": 581, "crash": 0, "equivalent": 14 } }
```
<!-- figures:end -->

## Status of this build

Complete and green on the final bytes: every capture below was taken after the last edit of the files it pins (`tests\integrity.test.cjs` recomputes that from the manifests).

* RED `evidence\red\red-01` and `red-02`: 5 of 5 fail on behavior against the naive stub; the `red-02` snapshot bytes replay unchanged against the final files (`green\replay-02`): 5 of 5 pass.
* GREEN `green\suite-02`: the whole non-browser suite, 124 of 124 in one runner (20 test files), exit 0.
* Fresh checkout, the same suite and the integrity test in a tree of `git archive` blobs, in LF and in CRLF (`fresh\lf-02`, `fresh\crlf-02`; the two runs may overlap in time):

  * FRESH-CHECKOUT-LF: 137 of 137 tests passed (exit 0)
  * FRESH-CHECKOUT-CRLF: 137 of 137 tests passed (exit 0)

* Per-file coverage (`coverage\run-04`, one command per production file, 85/85/85 required): canon 100/100/100, redact 100/100/100, vault 100/97.87/100, evidence 100/100/100, service 100/100/100, server 100/100/100, page.js 100/98.57/100.
* Systematic mutation: 595 mutants of the seven production files, 581 killed by a named failing test, 14 equivalent with a written proof, none undecided (`evidence\mutants`; the 28 named guard mutants of the first build are kept in `named-mutants-01/02.json`).
* Load loop `loop\run-03`: 120 of 120, the burners stopped by PID, `LOOP-OVER-CAP: 0`.
* Real Edge 156.0.4314.58 Microsoft-signed (`browser\run-05`, exit 0; the real service and a forging server, zero canary hits in everything the browser holds) and the proof that a failing check still closes the real session (`browser\cleanup-02`). The retained failed attempts `browser\run-01` and `run-02` were assertions of the TEST (the bundle URL was counted among the evidence URLs, the forging server's own responses were scanned as browser state).
* Found and fixed while finishing: `vault.cjs` shared its identities array and a dispatch result aliased the vault's private contact (found by `returns.test.cjs`, which failed on the old bytes); the cross-process flood test judged by a fixed 800 ms grace and raced the attacker's report (found by the first loop; `loop\run-01` is kept as the failed attempt); `tests\fuzz.test.cjs` found no defect in what a request can reach and pinned the stated totality limits above.
* Not claimed: everything under "Honest limits".
