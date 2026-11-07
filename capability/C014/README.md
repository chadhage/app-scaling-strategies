# C014: management secrets stay on the server, public evidence is redacted, seeded canaries never reach a browser

A **synthetic, local, offline** fixture on `127.0.0.1` (automatic port, Node built-ins only, no persistence, no cloud, no package). A service HOLDS fictional canary
secrets and fictional personal data (four management tokens, a signing key, a connection string, a service credential, four contacts with name, e-mail and phone)
and SERVES public evidence (trace, runs, audit, log, a signed export bundle, typed error answers, an inspection page). Nothing in it is real. It is built on the
accepted **C009** authorization fixture (identities, token registry, permission table, command pipeline, ledger, and the refusal path of `http-io.cjs`),
imported read-only and pinned in `imports.json` [C78][C79].

**How this file is checked.** A paragraph of this file that says "pinned", "every", "whole", "never" or "always" cites at least one row of the claims table (the number of the row, with a C in front of it, in square brackets): the row names a
test file and the first words of the title of the test that states the claim, and `tests\readme.test.cjs` checks that the test exists and that no such paragraph is left without a citation [C94][C95]. A figure about the evidence (a count of
tests, files, runs or mutants, a number of seconds, "N of M", a coverage triple) is followed by an invisible marker and the same file recomputes it from the stored evidence [C92][C93]. The third review found a claim that no test pinned and that was
false ("masking a non-raw form masks the WHOLE value") and prose figures that no test recomputed; both are what these two checks are for. What is NOT claimed is under "Honest limits".

## The design in five sentences

1. `vault.cjs` (management side) holds every secret and uses it only there: the registry draws the configured tokens from it, `sign()` is an HMAC over the public
   bundle, the fictional store fails with the connection string in its message and the password in its cause, the fictional upstream call carries the credential in
   its `Authorization` header and the contact in its text. Nothing it holds is returned: `GET /v1/manage/config` (operator only) shows booleans and counts [C08][C36][C37].
2. `evidence.cjs` keeps everything RAW on the management side (request headers and URLs, error messages, causes and stacks, the upstream call, the contacts): no route serves a raw record [C12][C20][C21].
3. `redact.cjs` is THE redaction function, `publish(kind, value)`: an **allow-list** of fields with closed vocabularies (a field no rule names is never read, so it cannot be
   copied), plus masking **by value** (every registered secret in every covered encoding) and **by shape** (a closed list) in the few free-text fields. Its result is a
   frozen `PublicBody` that only `publish` can mint [C13][C15][C16].
4. `server.cjs` sends JSON only as a `PublicBody` (`createOut` throws before anything is written for anything else) and static assets from three fixed files; refusals,
   pipelining lanes and the answers Node would give itself use the C009 refusal path (answer once, `Connection: close`, stop reading, end the connection, nothing runs behind it) [C14][C22][C75].
5. `page.js` validates every document against a closed shape and prints only values it checked itself (ids, integers, closed words); it never prints a string the server sent [C28][C29].

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

Every GET verifies a presented credential: a forged, expired or malformed token is a typed 401 and is never read as anonymous (C009 behaviour) [C09]. Every answer is
`Cache-Control: no-store`; none sets a cookie, a `Location` or an `Access-Control-*` header [C10]. The assets are served byte for byte from `index.html`, `page.js` and `style.css` [C75]; a command request is recorded with the role of its caller [C76].

## Protected configuration fields (the length of each; `tests\boundary.test.cjs` reads this table)

The vault validator REFUSES, with a typed `ConfigError` that names the field and never carries a value, every protected value shorter than the secret minimum of 6 characters
(`canon.MIN_SECRET`; it is not lowered, because a shorter value would mask ordinary text). Whatever the validator ACCEPTS is held BY VALUE (`vault.secrets()` lists it and a redactor registers it) and
shows in no public byte after a normal flow. The sweep tests every row at min-1, min, min+1, max and max+1; a row whose limit disagrees with the validator fails there by name [C46][C47]. The review of the first publication
found a contact name of 5 characters that the validator accepted and no redactor could hold: it reached the anonymous trace, runs and bundle (reproduced and refused in [C48]).

<!-- fields:begin -->
| Field | Minimum | Maximum |
|---|---|---|
| tokens | 48 | 48 |
| signingKey | 32 | 128 |
| connectionString | 44 | 512 |
| connectionHost | 6 | - |
| connectionUser | 6 | - |
| connectionPassword | 6 | - |
| connectionDatabase | 6 | - |
| serviceId | 6 | 128 |
| serviceSecret | 6 | 128 |
| contactName | 6 | 61 |
| contactEmail | 7 | 193 |
| contactPhone | 8 | 26 |
<!-- fields:end -->

A token is `c009_` and 43 characters. The connection string is printable ASCII; its minimum of 44 comes from its parts (a server, a user and a password of 6 characters each with their keys), `connectionHost` is the server name
without the protocol prefix and the port, and `connectionDatabase` is optional (when present it is at least 6) [C49]. The credential id and secret are letters, digits, `_` and `-`. A name is letters, spaces, apostrophes and hyphens;
an e-mail has a local part of 3 to 64 and a domain of 3 to 128 characters [C51]; a phone is digits, spaces, parentheses and hyphens (26 characters, 27 with a leading plus) [C49]. A line break before or after any of them is refused [C50]. A PART of a value that is shorter than 6 characters (a given
name of five letters, a short local part, the digits of a short phone) is not a secret by value and is not listed by `vault.secrets()`; the whole value always is [C47].

## What the redaction covers (closed lists; everything else is stated under "Honest limits")

* **Allow-list** (`redact.cjs` `SCHEMAS`): `trace` (seq, kind, method, route class, status, role, code, steps), `runs` (id, units, owner, revision, status, artifacts as a COUNT, steps),
  `audit` (seq, outcome, code, command, subject, role), `logs` (seq, level, event, route class, status, code, role: the raw message is never published), `list`, `bundle`,
  `signedBundle`, `answer`, `error`, `scope`, `config`. Enum, id, integer, boolean and hex fields outside their vocabulary become `null`; an object whose REQUIRED field is invalid is dropped whole.
  A client-supplied string (header, URL, query, body, command name) is never a field of any schema, so it can never be published [C15]. Only OWN properties of a document are read, and an array is read at most as often as its limit allows, whatever length it claims [C71][C72][C73][C74].
* **Free text** (`steps[].detail` and the error `message`) is masked in this order: (1) if ANY non-raw form of ANY registered secret stands anywhere in the ORIGINAL text (in any of its views: as written, URL-decoded once or twice, HTML-decoded, unescaped, form-decoded with the plus signs turned into spaces, each also folded),
  the WHOLE text is replaced by `[redacted]`: the check fails closed and can hide more than the secret, and it looks at the original text BEFORE anything is replaced, so that a registered part of a secret that stands verbatim inside an encoded form of the whole (a surname inside a URL-encoded e-mail address) cannot
  consume the evidence and leave a fragment [C53][C54][C55][C57][C59][C60][C61]; (2) otherwise every verbatim occurrence of every registered secret is replaced in place by `[redacted]`, the longest secret first, and nothing else of the sentence changes [C56][C58]; (3) the closed list of shapes is replaced, in this order: management token `c009_` + 43,
  `Bearer` credential, `Password|Pwd|AccountKey|SharedAccessKey|SharedAccessSignature|ApiKey|Secret = value`, e-mail address, JSON web token, a 40+ character base64 blob, a 32+ character hex run, and LAST the phone number, which would otherwise chew the digits of a hex run or a blob and leave its letters visible [C17][C62][C63][C64][C65][C66][C67][C68][C69][C70];
  (4) the text is cut at 4,096 characters only AFTER masking, and a text over 65,536 characters or that is not a string is masked unread [C18].
* **Covered encodings** (the views and needles are in `canon.cjs`; the sweep's scanner re-derives them independently in `tests\scanner.cjs`) [C05][C16][C59]: raw; upper and lower case; URL-encoded (component, every byte, lower-case hex), double URL-encoded, form-encoded (plus for a space); base64 and base64url at all three alignments inside a longer base64 text; hex (either case);
  JSON `\uXXXX`, `\u{...}` and `\xHH` escapes; HTML decimal and hexadecimal entities (with or without the semicolon) and the five common named ones; NFKC/NFKD variants (full-width letters, ligatures, exotic spaces), dash look-alikes, combining marks;
  zero-width, soft-hyphen, BOM and bidi format characters between the characters; a mixture of the above (partly percent-encoded); and a secret split across chunks of a stream (the sweep reads every answer whole and in one-byte chunks) [C01][C06].
* **What is registered by value** (`vault.secrets()`): every token, the signing key, the connection string and its server, host, database, user and password, the credential id and secret, every contact name, each part of a name,
  e-mail, its local part, phone and its digits only (each at least six characters, the shortest value a redactor can hold). A token issued later (`service.issueToken`) is registered before anyone holds it [C36].

## The canary sweep (`tests\sweep.cjs`, `tests\sweep.test.cjs`, `tests\process-sweep.test.cjs`)

Fictional canaries: `tests\canaries.cjs` derives the held values (tokens, key, connection string with its parts, credential, contacts) and the client values from fixed phrases; failing assertions print canary ids and form names, never a value [C07].
The sweep (1) plants every held canary in every encoder of `tests\scanner.cjs` in every place the system can touch: `plant('run' | 'trace' | 'log' | 'audit' | 'error', text)` writes the text into free text, unknown fields, an `authorization` header, PII, nested arrays and objects, a file name, an object KEY, an error message, its cause and its stack text [C03];
(2) drives real management traffic (the service uses its secrets and fails with them in an exception); (3) plants client canaries in a header, the cookie, the user agent, a `Referer`, the URL, the query, a command name and the body (valid, unknown field, malformed, wrong media type);
(4) calls the routes and further methods (including a CORS-style `OPTIONS`) as anonymous, visitor, conductor-a, conductor-b, operator, a forged, a malformed and an expired token; (5) scans every byte that came back (status line, headers, body), once whole and once in one-byte chunks, and the console of the service [C01].
It runs in the test process, against a server in a separate process (its stdout and stderr are scanned too) and against the NAIVE stub of the RED (it must find canaries there: it is not vacuous) [C02][C04].
To plant your own canaries: `startLocal({ config })` of `server.cjs` takes the management configuration (see `tests\canaries.cjs` `seedConfig()` for the shape), `service.plant(place, text)` is the in-process management seam, and `runSweep({ start, config })` runs the sweep.

A property test (`tests\property.test.cjs`, fixed seeds) draws from plant, plant a freshly issued token, get, post, export (signature and counts verified), restart, cancel a half-written request, refuse-and-pipeline, overflow the ring and repeat a plant;
after EVERY operation the bytes served and the console hold no canary, every list reconciles shown of total, and the revision never goes backwards within one lifetime [C77].

## The refusal path, pipelining and the third hole (inherited from C009, proved again here)

C009's `http-io.cjs` is imported read-only (`createLanes`, `createResponder`, `localGuard`, `hasBody`, `canStopReading`, `clientErrorCode`). An early version of its README said `admit.refuse(socket, code, { immediate })`, which was **false**
(`admit.refuse = (socket, code)`, `immediate` occurs nowhere; the accepted README no longer says it): the code was read and trusted. `server.cjs` wires the same listeners as C009 (`request`, `checkContinue`, `checkExpectation`, `clientError`, `connect`), every request through the lanes,
`requireHostHeader: false` (a request without Host reaches `localGuard` and gets the typed 421), `connectionsCheckingInterval` with the header and request timeouts, `maxConnections`, and the fail-closed check that this Node can stop reading a refused socket [C34].

* `tests\matrix.cjs` (table-driven, ONE TCP write per cell, two writes 8 ms apart for one position): the refusal rows (401, 403, 404, 405, 400, 413, 414, 415, 417, 421, 431, and the answers Node gives itself: `Expect: nonsense`, an oversized header, `CONNECT`, a malformed request line)
  in eight positions (`[R]`, `[R][M]`, `[G][R][M]`, `[G][G][R][M]`, `[G][G][G][R]`, **`[G][G][R][G]`**, the two-write case, `[M][R]`), refusal and mutation each in HTTP/1.1 or HTTP/1.0 (Node honours `Expect` only in 1.1, so those rows are 1.1 only):
  the client gets exactly the answers of the requests BEFORE the refusal, in order, then the typed refusal, the server ends the connection, and the number of runs afterwards proves that nothing ran behind it [C22].
  It runs in the test process (`tests\refusal.test.cjs`, coverage counts it) and against a server in a separate process (`tests\process-matrix.test.cjs`: refusal in 1.1; `tests\process-matrix-10.test.cjs`: refusal in 1.0) [C23][C24].
  An asynchronous refusal (the owner quota full after the body was read) and `Expect: 100-continue` (a refused request is never invited to send its body) have their own tests [C22].
* The **third hole** of `orders\_PIPELINING.md` (a Node-own answer decided at parse time behind two legitimate requests): `[G][G][X]`, `[G][G][G][X]` and `[G][G][X][G]` are rows of the matrix for every Node-own refusal in both framings, AND `tests\process-flood.test.cjs` sends `[G][G][X]` on 128 sockets to a child with a 128-connection cap:
  every socket gets two answers and the 417, every socket is ended by the server, the connection count returns to 0 and a legitimate GET is answered; a bare Node control server keeps all its sockets open (the test can fail) [C26]. They pass on C009's lanes: no production file of C009 was touched.
* The refusal flood: attacker in a separate process (`tests\flood-attacker.cjs`), server in a 64 MB child (`tests\child-server.cjs`), a naive control in the same test under the same load. Assertions are counts and ratios, never seconds: the server ended every attacker socket,
  read less than three quarters of the control's average per socket (its largest read against that average), spent less than half the CPU per attacker socket, a legitimate keep-alive client kept getting 200 during the flood, no attacker connection is left and the child is nowhere near its heap [C25]. 50,000 requests pipelined behind a pending first request leave the server alive with a bounded heap [C27].

## The page and the real browser

`page.js` is loaded under Node with a DOM stub built from the real `index.html` ids and run through `vm` under its file URL (`tests\dom-stub.cjs`, `tests\page.test.cjs`): valid documents, forged shapes that each reject the whole section with a fixed sentence [C29], forged steps, a non-200 answer, text that is not JSON, a failed and a stalled request, a canary in every free text (never shown: only the NUMBER of steps is) [C28],
the reload button, and the markup (no inline script or style, one polite live region, native controls) [C30].

`tests\browser.cjs` drives a real isolated headless Edge through `testing\browser\isolated.cjs` (`openIsolatedLoopback`: GET and HEAD only, so the POSTs of the service are proved by the Node suites over real sockets and by the server-produced transcript, never by the page) against the real service and against a FORGING server serving the real assets
and forged evidence, and scans everything the browser holds for every canary: the rendered DOM and its text, localStorage, sessionStorage, cookies, IndexedDB and CacheStorage names, the console and page errors, every request URL and header (no secret in a URL, no `Referer`) and every response (status line, headers, body); it checks keyboard operation (Tab reaches the reload button then the download link, a visible focus ring, Enter reloads) and verifies the downloadable bundle against the signing key held server-side.
It asserts that the installed Edge is Microsoft-signed with a qualified major (no equality pin on a build or hash; the actual version and SHA-256 are recorded) [C86][C87].

## Claims and the tests that back them

Each row names a test file and the first words of the title of the test that states the claim; `tests\readme.test.cjs` checks that the file holds a test with that title and that every paragraph of this file that says "pinned", "every", "whole", "never" or "always" cites a row [C94][C95]. That the test EXISTS is checked there; that it FAILS when the claim is false is what the mutation campaign (see the evidence layout) measures [C82].

<!-- claims:begin -->
| ID | Claim | Test file | Title starts with |
|---|---|---|---|
| C01 | Zero canary hits in any byte the real server sent (whole, one byte at a time, console), over every route, identity and planting place. | sweep.test.cjs | THE SWEEP, real server: zero canary hits |
| C02 | The sweep is not vacuous: over the naive stub of the RED it finds canaries in raw, encoded and streamed form. | sweep.test.cjs | the sweep is not vacuous |
| C03 | A held canary planted in the raw store in ONE covered encoding never shows in a list or in the bundle, place by place and encoding by encoding. | sweep.test.cjs | place by place, encoding by encoding |
| C04 | The same sweep over a server in ANOTHER process also covers everything that process printed. | process-sweep.test.cjs | the sweep over a server in another process |
| C05 | The scanner finds every encoder's output with the right canary id and a different canary is not reported. | scanner.test.cjs | every encoder is found by the scanner |
| C06 | The scanner finds a canary split across one-byte chunks; the per-chunk control does not. | scanner.test.cjs | the stream scanner finds a canary split across one-byte chunks |
| C07 | The scanner reports ids and form names, never a value. | scanner.test.cjs | the scanner reports ids and form names only |
| C08 | The management route answers only the operator and shows booleans and counts. | server.test.cjs | the management route is for the operator |
| C09 | A bad credential is never read as anonymous; every public route answers every valid identity the same. | server.test.cjs | every public route answers every valid identity the same |
| C10 | Every answer carries the fixed headers: no-store, nosniff, no referrer, the CSP, no cookie, no CORS header, no redirect, no source map. | server.test.cjs | every answer: no-store, nosniff |
| C11 | The operator's bundle download is signed with a key that stays on the server and the signature verifies. | server.test.cjs | an operator reads the bundle as a download |
| C12 | The bundle carries every kind through the item path, counts equal to the item counts, and a signature over exactly the unsigned JSON text. | evidence.test.cjs | the bundle: every kind through the item path |
| C13 | Only the redactor mints a public body, and the server writes JSON only as a public body. | redact.test.cjs | a PublicBody is minted by publish alone |
| C14 | The server refuses to write anything but a public body: a plain object, a string or a buffer is a TypeError before a byte is written. | server.test.cjs | createOut sends JSON only as a PublicBody |
| C15 | A field no rule names is never copied: unknown fields, nested unknown subtrees and canary keys. | redact.test.cjs | allow-list: a field no rule names is never copied |
| C16 | Every covered encoding of a registered secret masks the whole text. | redact.test.cjs | text masking by value: every covered encoding |
| C17 | Secret shapes are masked although the service never held them. | redact.test.cjs | secret shapes are masked although the service never held them |
| C18 | The masking work is bounded and a secret across a cut is not left half. | redact.test.cjs | the work is bounded: a text past the cap |
| C19 | Hostile values never throw: getters, proxies, sparse and huge arrays, cycles, prototype keys. | redact.test.cjs | hostile values never throw |
| C20 | A published item is reused until the redactor learns a new secret, then published again and masked. | evidence.test.cjs | a published item is reused until the redactor learns |
| C21 | A raw error becomes failure steps and its stack is never read. | evidence.test.cjs | a raw error becomes failure steps next to the raw steps |
| C22 | Every refusal is typed, ends the connection, and nothing runs behind it (every row and position, HTTP/1.1 and HTTP/1.0). | refusal.test.cjs | the matrix: every refusal row, every position |
| C23 | The same matrix against a server in another process, refusal in HTTP/1.1. | process-matrix.test.cjs | the matrix against a server in another process, refusal in HTTP/1.1 |
| C24 | The same matrix against a server in another process, refusal in HTTP/1.0. | process-matrix-10.test.cjs | the matrix against a server in another process, refusal in HTTP/1.0 |
| C25 | A flood of refused requests with endless one-byte chunks from another process: the server ends every socket, reads little, spends little CPU and still serves; the naive control does none of that. | process-flood.test.cjs | flood of refused requests with endless one-byte chunks |
| C26 | The third pipelining hole: [GET][GET][Expect: nonsense] on 128 sockets, the typed 417 and every socket ended. | process-flood.test.cjs | [GET][GET][Expect: nonsense] on 128 sockets |
| C27 | F24: 50,000 requests pipelined behind a pending first request leave the server alive with a bounded heap and a legitimate GET still answered. | pending-flood.test.cjs | F24: 50,000 requests pipelined behind a pending first request |
| C28 | The page never prints a string the server sent: canaries in every free text and field of a forged document are nowhere in the DOM. | page.test.cjs | the page never prints a string the server sent |
| C29 | A forged document is rejected whole with a fixed sentence and the other sections still load. | page.test.cjs | forged documents are rejected whole with a fixed sentence |
| C30 | The page markup has no inline script, no inline style and no event attribute. | page.test.cjs | the markup: no inline script or style |
| C31 | No public return of the namespace is a shared mutable object, apart from the stated module vocabularies. | returns.test.cjs | no public return is a shared mutable object |
| C32 | An injected failure in a test that owns a child process still closes the child. | cleanup.test.cjs | an injected failure in a test that owns a child process |
| C33 | Two live servers in one process keep separate secrets and state and close in any order. | health.test.cjs | two live servers in one process: separate secrets |
| C34 | The server fails closed where this Node cannot stop reading a refused connection. | health.test.cjs | fail closed at startup |
| C35 | The permission table is deny by default and frozen. | service.test.cjs | the permission table is deny by default and frozen |
| C36 | The vault knows every leaf and every part a driver message or a log line would reveal, each at least six characters. | vault.test.cjs | secrets(): every leaf and the parts a driver message |
| C37 | The fictional store failure puts the connection string in its message and the password in its cause: the raw material the redaction must clean. | vault.test.cjs | the fictional store: ok names the server |
| C38 | Over a seeded fuzz of hostile documents (every kind, three seeds) the redactor always returns a frozen public body of exactly the allow-listed shape, without a canary in any covered encoding, the same answer twice, and a hostile proxy is read at most as often as the schema can visit. | fuzz.test.cjs | publish over a seeded fuzz of hostile documents |
| C39 | The oracles of that fuzz are not vacuous: an extra key, a value out of range, a missing required value, an over-long list and a canary in each covered encoding are each caught. | fuzz.test.cjs | the oracles of the fuzz are not vacuous |
| C40 | A proxied array that claims a hundred thousand entries is read at most as often as the list limit allows. | fuzz.test.cjs | a hostile container costs at most the reads its limit allows |
| C41 | Masking seeded hostile text always returns a string of bounded length without a canary in any covered encoding. | fuzz.test.cjs | maskText over seeded hostile text |
| C42 | Seeded hostile configurations are built or refused with a typed ConfigError that names no secret. | fuzz.test.cjs | createVault over seeded hostile configurations |
| C43 | Seeded hostile bodies get a typed answer from validateInput and only known fields come out. | fuzz.test.cjs | validateInput over seeded hostile bodies |
| C44 | Seeded hostile raw records: a record that cannot be read is published as nothing, lists and the signed bundle are public bodies without a canary, shown reconciles with total. | fuzz.test.cjs | the evidence over seeded hostile raw records |
| C45 | The limits of that totality are stated and pinned by name (a Proxy or a throwing accessor into createVault, a Proxy into validateInput, a Proxy or a throwing getter into errorSteps). | fuzz.test.cjs | stated limits, pinned |
| C46 | The README table lists exactly the protected configuration fields of the sweep, each with a minimum at or above the secret minimum. | boundary.test.cjs | the README table lists exactly the protected configuration fields |
| C47 | At min-1, min, min+1, max and max+1 of every protected field a refusal is a typed ConfigError on the field, and whatever is accepted is held by value and shows in no public byte after a normal flow. | boundary.test.cjs | the boundary sweep: at min-1, min, min+1, max and max+1 |
| C48 | The review reproduction: a name of 5 characters is refused at the door; the same configuration with 6 characters is accepted and shows nowhere. | boundary.test.cjs | the review reproduction: a name of 5 characters is refused |
| C49 | A leading plus extends a phone to 27 characters and no more, and the connection string keeps its parts: a short host, user, password or database is refused. | boundary.test.cjs | a leading plus extends a phone to 27 characters |
| C50 | A line break before or after an otherwise valid value is refused for every protected field that has a pattern of its own. | boundary.test.cjs | the anchors: a line break before or after |
| C51 | An e-mail address needs a local part of 3 to 64 characters and a domain of 3 to 128: each end of each part, on its own. | boundary.test.cjs | an e-mail address needs a local part of 3 to 64 characters |
| C52 | The vault of the fragment tests lists the parts that used to hide a whole secret (a ten-character surname, a seven-character local part). | fragments.test.cjs | the vault of this test lists the parts that used to hide a whole secret |
| C53 | The cases of the review (URL-encoded name and e-mail, double URL-encoded e-mail, an entity and a JSON escape for the at sign, plus for space) mask the whole text and leave no fragment. | fragments.test.cjs | the cases of the review: the URL-encoded name and e-mail |
| C54 | Every covered encoding of every secret the vault lists (nine characters or more) masks the WHOLE text; a verbatim occurrence is replaced in place. | fragments.test.cjs | every covered encoding of every secret the vault lists |
| C55 | One character of a secret written in another form while the rest stands verbatim masks the whole text. | fragments.test.cjs | one character of a secret written in another form |
| C56 | An e-mail address that holds a name in lower case is replaced in place like any verbatim secret. | fragments.test.cjs | an e-mail address that holds a name in lower case |
| C57 | A secret that stands verbatim next to an encoded form of itself, or of another secret, still masks the whole text. | fragments.test.cjs | a secret that stands verbatim next to an encoded form of itself |
| C58 | Verbatim occurrences are replaced in place, longest secret first, and nothing else of the sentence changes. | fragments.test.cjs | verbatim occurrences are replaced in place, longest secret first |
| C59 | canon.encodedIn: a secret set aside where it stands verbatim; every other covered form counts, in any view of the text. | fragments.test.cjs | canon.encodedIn: a secret set aside where it stands verbatim |
| C60 | encodedIn sets aside a verbatim secret that CONTAINS the one it looks for and a verbatim part never explains an encoded form. | canon.test.cjs | encodedIn sets aside a verbatim secret that CONTAINS the one it looks for |
| C61 | The plus-for-space view: a form-encoded text is decoded like a URL with the plus signs turned into spaces first. | fragments.test.cjs | the plus-for-space view |
| C62 | The closed list of shapes and its ORDER: the phone number comes last. | patterns.test.cjs | the closed list of shapes and its ORDER |
| C63 | Shape management token: the quantifier 43, every class member, the g flag and the exact number of characters it consumes. | patterns.test.cjs | shape management token |
| C64 | Shape bearer credential: the word boundary, the case flag, the whitespace run, the quantifier 1 to 512, every class member, the padding, the g flag. | patterns.test.cjs | shape bearer credential |
| C65 | Shape connection string secret: each of the seven keys, the case flag, the word boundary, the spaces, the terminators, the quantifier 1 to 256, the g flag. | patterns.test.cjs | shape connection string secret |
| C66 | Shape e-mail address: the local-part class and its quantifier, the domain label class and its quantifier twice, the number of labels, the g flag. | patterns.test.cjs | shape e-mail address |
| C67 | Shape JSON web token: the prefix, the two segments of 8 to 512, the third of 0 to 512, every class member, the g flag. | patterns.test.cjs | shape json web token |
| C68 | Shape long blob: the quantifier 40 or more, every class member, the padding 0 to 2, the g flag. | patterns.test.cjs | shape long blob |
| C69 | Shape long hex: the quantifier 32 or more, both word boundaries, every class member, the g flag. | patterns.test.cjs | shape long hex |
| C70 | Shape phone number: the optional plus, the first and last digit, the quantifier 7 to 18, every class member, the g flag. | patterns.test.cjs | shape phone number |
| C71 | The limit of every array of the schemas is checked BEFORE the loop: an array that claims a million entries is read at most as often as its limit allows (counted reads, no clock). | hostile.test.cjs | R15: the limit of every array of the schemas is checked BEFORE the loop |
| C72 | A list with exactly its limit of entries is read once per entry, and one entry more is cut and counted. | hostile.test.cjs | R15: a list with exactly its limit of entries |
| C73 | Only OWN properties are read: a document whose fields all stand on its prototype is the same as an empty document, in every kind. | hostile.test.cjs | R29: only OWN properties are read |
| C74 | A polluted Object.prototype adds no field to any document. | hostile.test.cjs | R29: a polluted Object.prototype adds no field |
| C75 | The three assets are served byte for byte, with their content types. | server.test.cjs | the three assets are served BYTE FOR BYTE |
| C76 | A command request is recorded with the role of its caller: a conductor, a refused visitor, an anonymous caller and a forged token. | server.test.cjs | a COMMAND request is recorded with the role of its caller |
| C77 | After every operation of the seeded property test no canary has been served in any covered encoding. | property.test.cjs | property, seed |
| C78 | imports.json pins the eight C009 production files: the working bytes (raw or LF) equal the pin and git at the pinned commit agrees. | integrity.test.cjs | imports.json pins the C009 production files |
| C79 | C014 imports nothing from another namespace that imports.json does not list. | integrity.test.cjs | C014 imports only what imports.json lists |
| C80 | Every capture manifest recomputes: transcripts, sizes, inputs and exit codes (a retained failed attempt only with its stated failure). | integrity.test.cjs | every capture manifest of the evidence recomputes |
| C81 | Tampering with a capture is detected by name: a transcript byte, a missing transcript, an input byte, a missing input, an exit code. | integrity.test.cjs | tampering is detected BY NAME: a transcript byte |
| C82 | Every mutant the generator lists for the current production bytes was run and decided; every survivor is a written equivalence; nothing is undecided. | integrity.test.cjs | the systematic mutation campaign: every mutant the generator lists |
| C83 | Tampering with the mutation evidence is detected by name. | integrity.test.cjs | tampering with the mutation evidence is detected BY NAME |
| C84 | The REDs of the third fix ran on the bytes of the first publication, and the fix changed three production files and no other. | integrity.test.cjs | the REDs of the third fix ran on the bytes of the FIRST publication |
| C85 | The load loop capture: 20 runs, 4 at a time, under 4 burners stopped by PID; every run of every process-spawning test file passed. | integrity.test.cjs | the load loop capture: 20 runs, 4 at a time |
| C86 | The final real Edge observation: Microsoft-signed, a qualified major, every check printed, the browser run ended OK. | integrity.test.cjs | the final real Edge observation |
| C87 | An injected failure failed the browser run and its finally block still closed the real session. | integrity.test.cjs | the cleanup proof of the real browser |
| C88 | The final per-file coverage capture: ONE command per production file, every file at or above 85/85/85, nothing unlisted or missing. | integrity.test.cjs | the final per-file coverage capture |
| C89 | The final whole-suite capture: every test file ran, one per child process, every file passed and finished under the 60 s cap. | integrity.test.cjs | the final whole-suite capture |
| C90 | The whole suite, the integrity and README tests included, is green in a tree of git-archive blobs in LF and in CRLF. | integrity.test.cjs | the fresh-checkout captures |
| C91 | The seal pins the final bytes: every file of the namespace, the README included, equals its pin and nothing is unsealed. | integrity.test.cjs | the seal pins the final bytes |
| C92 | Every figure of the README prose carries a marker and the value behind it is the one derived from the stored evidence. | readme.test.cjs | the figures of the README prose are the figures of the stored evidence |
| C93 | A drifting figure is caught by name: a changed number, a removed marker, an unknown key, a new untagged figure. | readme.test.cjs | a drifting figure is caught BY NAME |
| C94 | Every claim of the claims table is backed by a test that exists. | readme.test.cjs | every claim of the README claims table is backed by a test that exists |
| C95 | Every README paragraph that says pinned, every, whole, never or always cites a claim that exists. | readme.test.cjs | every README paragraph that says pinned |
| C96 | A paragraph without its citation, and a citation of a row that does not exist, are caught by name. | readme.test.cjs | a README paragraph without its citation |
| C97 | The fresh-checkout lines of the README state the figures of the stored fresh-checkout captures. | readme.test.cjs | the fresh-checkout lines of the README |
| C98 | A value the service was never told about shows only in free text, in no other position of the raw record of any place. | service.test.cjs | plant puts a value in every position of the raw record of each place |
<!-- claims:end -->

## Commands (repository root, PowerShell 7; `RUN` is the run folder; take a heavy slot with `RUN\scripts\heavy-slot.ps1` before the browser and coverage runs, the loop slot before the loop, a mutation slot before a mutation campaign)

```powershell
# RED of the first build: the initial specification tests against the NAIVE stub (field-name blocklist per route, raw records served, refusals on a kept-alive connection): exit 1, 5 of 5 fail on behavioral assertions
$env:C014_SUBJECT = (Resolve-Path capability\C014\evidence\red\stubs).Path
node --require .\capability\C014\tests\scratch-cwd.cjs --test --test-concurrency=1 capability\C014\evidence\red\initial-a-r2.snapshot.cjs capability\C014\evidence\red\initial-b.snapshot.cjs
Remove-Item Env:\C014_SUBJECT
# GREEN replay: the same snapshot bytes against the real files: exit 0
node --require .\capability\C014\tests\scratch-cwd.cjs --test --test-concurrency=1 capability\C014\evidence\red\initial-a-r2.snapshot.cjs capability\C014\evidence\red\initial-b.snapshot.cjs
# RED of the third fix (run on the working tree while it still held the bytes of the first publication): F1 and F2 (exit 1 there, exit 0 on the final bytes), then F3 (the driver applies the two reviewer mutants to every in-process suite: exit 1 when one survives)
node capability\C014\tests\sanitized-run.cjs -- --require .\capability\C014\tests\scratch-cwd.cjs --test --test-concurrency=1 capability\C014\evidence\red\fix3\f1.snapshot.cjs capability\C014\evidence\red\fix3\f2.snapshot.cjs
node capability\C014\evidence\red\fix3\f3-survivors.snapshot.cjs
# GREEN: the whole suite except the integrity and README tests, one test file per child process, with the time of every file (exit 1 when a file takes 60 s or more)
node capability\C014\tests\suite.cjs
# the integrity and README tests (they read the captures), and the seal that is written LAST
node --test capability\C014\tests\integrity.test.cjs capability\C014\tests\readme.test.cjs
node capability\C014\tests\seal.cjs
# Per-file coverage, ONE command per production file (7 files, 85/85/85): heavy slot, about 2 to 4 minutes when the machine is quiet (the default mode measures every file over all in-process suites and takes 5 to 10)
node capability\C014\tests\coverage.cjs --focused --parallel=1
# one file by hand
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=capability/C014/redact.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability\C014\tests\redact.test.cjs capability\C014\tests\patterns.test.cjs capability\C014\tests\fragments.test.cjs capability\C014\tests\hostile.test.cjs capability\C014\tests\canon.test.cjs capability\C014\tests\evidence.test.cjs capability\C014\tests\service.test.cjs
# Mutants (mutation slot, at most 2 workers, normal priority): the named guard mutants (a failing test NAME per kill), then the SYSTEMATIC generator over every condition and statement of the production files and over the regular-expression literals of redact.cjs and vault.cjs
# (--list prints the counts, --control runs each suite unmutated first, --only=<file>:<index>,<index> re-runs chosen mutants (the numbers are the #N of the report), --kind=regex runs only the regular-expression mutants, --all-suites uses every in-process suite).
# A mutant is killed by the first failing assertion; a run that only timed out, or that this script had to end, is UNDECIDED and never a kill.
node capability\C014\tests\mutants.cjs --named --workers=2 --out=<new report.json>
node capability\C014\tests\mutants.cjs --files=redact.cjs --workers=2 --control --seconds=300 --out=<new report.json>
# The load loop of the process-spawning files: 20 runs, 4 at a time, under 4 CPU burners that the script starts (PIDs printed, stopped by PID in finally). Take the loop slot of the run folder first.
node capability\C014\tests\loop.cjs --runs=20 --parallel=4 --burners=4
# The fresh-checkout run: a scratch tree of git archive blobs (LF) and of the same tree converted to CRLF, the whole suite in each
node capability\C014\tests\fresh.cjs --mode=lf
node capability\C014\tests\fresh.cjs --mode=crlf
# Real Edge (heavy slot; CAPTURE_BROWSER_EVIDENCE unset writes nothing), and the proof that a failing check still closes the real session (an injected failure, exit 0 of the proof script)
node capability\C014\tests\browser.cjs
node capability\C014\tests\browser-cleanup.cjs
```

## Evidence layout (`evidence\`, `.gitattributes` `* -text -diff`; every capture by the shared recorder `RUN\scripts\archive-run.cjs`: raw stdout and stderr, exit code, input SHA-256 raw and LF; the seal is written last) [C80][C91]

| Folder | What |
|---|---|
| `red\red-01`, `red\red-02` | the REDs of the first build against the naive stub: 5 of 5<!--f:red.initial--> fail on behavioral assertions (the first one before any production file existed; the second after two flaws of the TEST were corrected: the sweep labelled transcript parts with request targets and scanned the stream per byte). |
| `red\red-03`, `red\fix3\` | the RED of F1 and F2 of the third review on the bytes of the FIRST publication (`c7ec58a79f0d`): 10 of 10<!--f:red.f1f2--> tests fail on behavioral assertions (a 5-character name reaches the anonymous trace, runs and bundle; fragments of an encoded e-mail survive). The snapshots are written with a wrapper (`tests\sanitized-run.cjs`) that prints the repository path as `<REPO>`. [C84] |
| `red\red-04` | the RED of F3: the two reviewer mutants of `redact.cjs` (the e-mail local-part cap, the long-hex 32+) both SURVIVED every in-process suite of the first publication (exit 1, the expected code). [C84] |
| `green\replay-03`, `replay-04`, `replay-05` | the snapshot bytes of `red-02`, of `red-03` and the F3 driver of `red-04`, replayed UNCHANGED against the FINAL files: every test passes and both reviewer mutants are killed [C80]. `replay-01` and `replay-02` are the replays of the first publication, superseded. |
| `green\suite-03` | the final whole suite: one test file per child process with the time of each file, exit 0 [C89]. `suite-01` is the retained FAILED attempt of the first build (a defect of the TEST: its legitimate client waited on a socket that the server had reaped); `suite-02` is the whole suite of the first publication, superseded. |
| `coverage\run-05` | the final per-file capture (focused mode, ONE command per production file) [C88]. `run-01` to `run-04` are earlier captures of the first build and of the first publication, superseded. |
| `browser\run-06`, `browser\cleanup-03` | the final real Edge observation (`browser\browser-*\browser-observation.json` holds the version, signature and the scanned counts) and the proof that an injected failure still closes the real session [C86][C87]. `run-01` and `run-02` are retained FAILED attempts of the first build (two assertion bugs of the TEST); `run-03` to `run-05` and `cleanup-01`, `cleanup-02` are superseded. |
| `loop\run-05` | the final load loop on the final bytes [C85]. `run-01` and `run-04` are retained FAILED attempts: `run-01` failed because of two defects of the TEST that only load exposes; `run-04` of the third fix failed in a single test (`process-flood`, in the first run, while the named-mutant campaign was running) and its report did not say which assertion failed, so `tests\loop.cjs` now records it and the loop was taken again on the same bytes; `run-02` and `run-03` are superseded. |
| `fresh\lf-03`, `fresh\crlf-03` | the whole suite, the integrity and README tests included, in a scratch tree of `git archive` blobs (LF) and in the same tree converted to CRLF [C90]. `lf-01`, `lf-02` and `crlf-02` passed and are superseded; `crlf-01` is a retained FAILED attempt of the first build (a check of the integrity test that cannot hold in a fresh copy). |
| `mutants\` | the third fix: `named-mutants-03.json` (the named guard mutants), `systematic-03-*.json` (`canon.cjs`, `vault.cjs` and `redact.cjs` after their change, the regular-expression mutants included) and `systematic-04-*.json` (`evidence.cjs`, `service.cjs`, `server.cjs` and `page.js`, whose source bytes did not change, run again with the final tests); `equivalents.json` holds every survivor that is equivalent, each with its written proof [C82][C83]. `named-mutants-01/02.json`, `systematic-01.json`, `systematic-02.json` and `rerun-01..03.json` are the first build and the first publication: their entries for the files that changed are history and are ignored, the entries of the four unchanged files still agree. |
| `specs\` | the recorder specs of every capture (repository-relative paths; in `spec-red-01` and `spec-red-02` the absolute path of the stub directory is shown as `<REPO>`, the only edit made to a spec after its capture) [C80]. |
| `red\stubs\server.cjs` | the NAIVE stub: ad hoc field-name blocklist per route, raw records served, refusals on a kept-alive connection. It is also the control of the sweep. |
| `seal.json` | the SHA-256 (raw and LF) of every file of the namespace except the raw transcripts (which their manifests pin) and the seal itself: the README, the production files, the tests and the rest of the evidence; written last; `tests\integrity.test.cjs` recomputes it [C91]. |

`tests\integrity.test.cjs` recomputes `imports.json` against git and the working files, every capture manifest (both transcripts, their sizes, every input and the exit code), and proves by tampering in a scratch copy (a flipped transcript byte, a deleted transcript, an edited input, a deleted input, a changed exit code) that each kind of tampering fails BY NAME [C78][C80][C81].

## Honest limits (what is NOT claimed)

* **Transformations that are not covered.** The reviewer's sweep of the first publication found these passing into public free text, and each stays a limit of this card: quoted-printable `=XX` escapes, separators between the characters of a secret (spaces, dots, dashes), base64 of UTF-16LE text, base64 of a hex string, reversed text, ROT13, base32,
  base64 of a URL-encoded value (only URL(URL(x)) is covered) and homoglyphs that NFKD does not fold (Cyrillic look-alikes). Not covered either, and not probed: base85, compression, XOR, and a secret split across two fields or two records. Base64 is matched case-sensitively and only at the three alignments. Punycode and non-ASCII canaries were not probed. Nothing here claims to find a secret that has been transformed beyond the covered list.
* **Parts of a secret.** The registry holds WHOLE values (and the parts of a contact that are listed in "What is registered by value") [C36][C47], so a prefix, a suffix or a middle part of a token, of the signing key, of the password or of the credential (the reviewer tried 8 to 16 characters of each) is not recognised by value, in no encoding; and a part of a contact value that is shorter than six characters
  (a given name of five letters, a short local part, the digits of a short phone) is not a secret by value. A secret of 6 or 7 characters has fewer base64 alignments, because a base64 needle needs at least 8 characters.
* **A secret the service was never told** (not in its configuration, not issued by it) is recognised by SHAPE only (the eight shapes above) [C17]. The only places a value could show are the free-text fields (`steps[].detail`, the error message), all generated by the server and never from client text; `tests\service.test.cjs` shows that an unregistered plain value planted in free text IS visible and shows nowhere else [C98]. Everything else is a closed vocabulary.
* **Masking more than the secret.** A non-raw form masks the WHOLE text (fail closed) [C54], so it can hide more than the secret; the e-mail, phone, blob and hex shapes can mask harmless digits and ids that look like them. An e-mail local part of more than 64 characters keeps its first character, and a domain label of 64 or more characters is masked by the blob shape instead (the address around it stays): the shapes are bounded [C66].
* **The answers Node writes itself** (`clientError`, `CONNECT`) are the fixed typed bodies of C009's `refuseSocket` (code and fixed message from the closed `CODES` table, no input), not produced by this redactor.
* **Inherited from C009**: tokens live at most 15 minutes (`maxTtlMs`); plain HTTP/1.1 on loopback (no TLS, h2c not probed); a client that keeps writing after a refusal can lose the typed answer to a reset on Windows (the two-write matrix cell accepts "no answer", never a different one) [C22] and `fetch` may see ECONNRESET instead of the answer for a very large unread body (C009 findings F12 and F16);
  HTTP/1.0 is covered by the matrix, `Upgrade` is not listened for (an upgrade request is an ordinary request), real signals and a redirected Desktop are not involved.
* The timeouts (`headerMs`, `requestTimeout`, `keepAliveTimeout`) are configured and the idle limit and the connection cap are proved by tests; the header and request timeouts and the keep-alive timeout have no killing test of their own.
* No persistence: a restart in the property test is a new service, so there is no journal to flip bytes in and no file name that could be user-supplied.
* **What the mutation campaign generates and what it does not** (`tests\mutants.cjs`; the figures are those of the stored reports): 831<!--f:mutants.generated--> mutants of the seven production files, 813<!--f:mutants.killed--> killed by a named failing test, 0<!--f:mutants.crash--> killed only by a crash, 18<!--f:mutants.equivalent--> equivalent with a written proof each in `evidence\mutants\equivalents.json`, none undecided, and 37<!--f:named.total--> named guard mutants of which 37<!--f:named.killed--> are killed [C82].
  The generator mutates every `if` condition and every operand of a compound condition (forced true and false), `===` and `!==`, `&&` and `||`, relational operators, a unary `!`, `true` and `false`, an integer literal, every whole single-line statement (removed) and, since the third review, the regular-expression literals of the shape table of `redact.cjs` (every quantifier bound, quantifier character, class item and range, alternative, `\b` `\s` `\d` `\.` escape, anchor and flag) and the quantifiers and anchors of the validator patterns of `vault.cjs`.
  It does NOT generate arithmetic operators, changed string literals, the conditions of `?:`, `while` and `for` (only the operators inside them), statements over several lines, removed `return` values or default parameter values, the other regular expressions of the namespace (those of `canon.cjs`, `evidence.cjs`, `service.cjs`, `server.cjs` and `page.js`), or the character classes of the vault validator (a different alphabet cannot make a value unprotected: whatever the validator accepts is held by value, [C47]),
  so a suite that kills every mutant may still miss a defect of those kinds. The equivalence proofs were written and checked by the author alone: a reviewer should attack them. The campaign of `evidence.cjs`, `service.cjs`, `server.cjs` and `page.js` was run again with the final tests (their source bytes are unchanged since the first publication) and each report entry records the SHA-256 of the source it ran against.
* **The load loop** (`evidence\loop\run-05`: each of the six process-spawning files 20 runs<!--f:loop.runs-->, 4 at a time<!--f:loop.parallel-->, under 4 CPU burners<!--f:loop.burners--> that the script starts and stops by PID; 120 of 120<!--f:loop.passed--> runs passed, the slowest run of any file took 32.7 s<!--f:loop.slowest--> against the 60 s<!--f:suite.cap--> cap of the shared runner, LOOP-OVER-CAP: 0) was measured on one Windows machine that other agents and the mutation campaign of this card were also using. Its size is the controller's decision for this card, smaller than the loop of the standing self-review [C85].
  The first loop of the third fix (`loop\run-04`) failed in a single test of `process-flood` and its report did not name the assertion; the loop on the same bytes then passed, and that failure is not explained: a flake of that test under load is possible. A slower machine or more burners may expose defects of the tests that this load did not (the first loop of the first build, `loop\run-01`, failed in `process-flood` in all of its runs because of two defects of the TEST, which were fixed).
* **The fresh-checkout runs** build their tree from `git archive` of the eight imported C009 blobs at `HEAD` and from the C014 working files (C014 is not committed when they run): its text files are LF-normalized, or converted to CRLF, the way git stores them and a Windows checkout shows them. A clone of the published commit was not run by the author; the commands are in the Commands block [C90].
* **Totality on hostile input** (`tests\fuzz.test.cjs`, three fixed seeds): the redactor over every kind of document, its text masking, `createVault` over configurations without a throwing accessor or Proxy, `validateInput` without a Proxy, and the evidence over raw records are total, and the reads of a hostile proxy are bounded by what the schema can visit, not by a clock [C38][C40][C41][C42][C43][C44]. NOT total, and pinned by name so that a change shows: `createVault` and `validateInput` on an object whose accessor or key enumeration throws (a Proxy), and `errorSteps` on a Proxy or on a getter that throws [C45].
  Their callers are the configuration of the process owner, the result of `JSON.parse`, and a record the evidence reads inside a try block (the record is then published as nothing), none of which can be such an object. There is no seeded fuzz of the HTTP wire: the wire is covered by the fixed refusal matrix and the flood tests.
* **Public returns** (`tests\returns.test.cjs`): what `canon`, `vault` and `evidence` export is frozen all the way down or a copy. The module-level vocabularies of `redact` (the kind, claim-header, route-class, code, command, subject, schema and pattern tables), `service` (scope and modes) and `server` (kinds and assets) are plain shared arrays and objects (a `RegExp` cannot be frozen); the test names them, so that a new one fails there [C31].
* **Guards that end a hang**: a few tests carry time limits whose only job is to end a hang (the per-test timeouts, an eight-second race in the close test, a ten-second settle in the matrix, polls of thirty to forty-five seconds in the flood tests). No assertion decides pass or fail by a duration, but a machine that is orders of magnitude slower could trip a guard.
* **One real browser**: Microsoft Edge 156.0.4314.58<!--f:edge.version-->, headless, isolated profile, GET and HEAD only; no other browser and no assistive technology was run.
* **Local identifiers in archived transcripts**: no file added by the third fix carries the session id or the Windows user name. Five archived transcripts of the first build and the first publication do, because node:test prints the absolute path of a failing test (`C:\Users\<name>\...`) and a transcript cannot be edited without breaking its recorded hash: the two RED captures (`red\red-01`, `red\red-02`) and the retained failed attempts `browser\run-01`, `browser\run-02` and `green\suite-01`. They are immutable history, sealed with the rest, and their raw bytes still carry the name; the captures that replace them are clean.
* The RED snapshots keep the first harness's 400 ms silence limit for the legacy `call()`; the final suite uses thirty seconds. A replay on a machine that is far slower than a loaded Windows laptop could flake in the snapshot harness: that is the cost of keeping archived RED bytes immutable.
* **This file's own checks** cover the five words above and the figures of the evidence. A claim phrased with another word ("all", "no X can", "nothing") has no mechanical citation check; it was read once, sentence by sentence, for the third fix, and each such sentence was either tied to a row or weakened. The seal proves that the bytes did not change after the last capture, not that nobody rewrote the seal together with the files: the published commit and its tag are the anchor.

## Decisions

* C014 started speculatively on the PRODUCTION bytes of C009 `f95cc52a29cf`; C009 was accepted afterwards on its third fix `0da3ff6eea40` with every production file byte-identical, so the pins did not change (`imports.json` names both commits and `tests\integrity.test.cjs` compares the eight blobs at both) [C78]. Only production files are imported, none of C009's tests or evidence.
* Public evidence has NO free text copied from a request: that removes the class of attacker-chosen canaries by construction; free text is limited to two server-generated fields and masked [C15].
* The validator REFUSES a protected value of fewer than six characters and the minimum is not lowered: a shorter secret would mask ordinary words (decision of the controller after the review of the first publication) [C47].
* The check for non-raw forms looks at the ORIGINAL text and sets aside, for each secret it looks for, the verbatim occurrences of every registered secret that CONTAINS it (an e-mail address that holds a name in lower case): without that, a raw address would be taken for an encoded name, and with a check after the in-place replacement a fragment of an encoded form survived (the second major of the review) [C59][C60].
* A mutation tool must never count a run it had to end as a kill: the first campaign ran at BelowNormal priority, starved and timed out, and its timeouts looked like kills; the runner now reports `timedOut` separately [C82].
* The array limit and the own-property check of the redactor are decided by counted reads and by prototype fields, never by a hang that a timeout ends [C71][C73].

## Status of this build

Complete and green on the final bytes: every capture below was taken after the last edit of the files it pins, and `tests\integrity.test.cjs` recomputes that from the manifests [C80]. The README and this status are written after the captures and are pinned by the seal [C91].

* RED of the third fix: 10 of 10<!--f:red.f1f2--> tests fail on behavior on the bytes of the first publication (F1, F2) and both reviewer mutants survive (F3); the same snapshot bytes pass on the final files (`green\replay-04`, `replay-05`) [C84].
* GREEN `green\suite-03`: 155 of 155<!--f:suite.tests--> tests in 24<!--f:suite.files--> test files, one file per child process, exit 0; the slowest file took 26.0 s<!--f:suite.slowest--> against the 60 s<!--f:suite.cap--> cap [C89].
* Fresh checkout, the same suite and the integrity and README tests in a tree of `git archive` blobs, in LF and in CRLF (`fresh\lf-03`, `fresh\crlf-03`; the two runs may overlap in time). The tree that is copied for these runs is the tree that is published, without the two figure lines below and without the seal, which are written after them:

  * FRESH-CHECKOUT-LF: 175 of 175<!--f:fresh.lf--> tests passed (exit 0)
  * FRESH-CHECKOUT-CRLF: 175 of 175<!--f:fresh.crlf--> tests passed (exit 0)

* Per-file coverage (`coverage\run-05`, one command per production file, 85/85/85 required; lines/branches/functions): canon 100/100/100<!--f:coverage.canon.cjs-->, redact 100/100/100<!--f:coverage.redact.cjs-->, vault 100/98.04/100<!--f:coverage.vault.cjs-->, evidence 100/100/100<!--f:coverage.evidence.cjs-->, service 100/100/100<!--f:coverage.service.cjs-->, server 100/100/100<!--f:coverage.server.cjs-->, page.js 100/98.57/100<!--f:coverage.page.js--> [C88].
* Systematic mutation and the named guard mutants: the figures under "Honest limits" [C82].
* Load loop `loop\run-05` and real Edge `browser\run-06` with its cleanup proof `browser\cleanup-03`: see "Honest limits" and the evidence layout [C85][C86][C87].
* Found and fixed while finishing the third fix: the phone shape (nine or more digits) chewed the digits of a hex run or a blob and left their letters visible, so it now runs last [C62]; the e-mail shape had no test of its local-part cap and the hex shape none of its 32 [C66][C69]; `tests\integrity.test.cjs` spent two minutes on 45 `git` processes and now asks git once [C78].
* Not claimed: everything under "Honest limits".
