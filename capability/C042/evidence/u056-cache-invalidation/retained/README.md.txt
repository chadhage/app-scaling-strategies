# C042: conduct one validated workflow step

A **synthetic, local-only, offline** H008 fixture on `127.0.0.1` (automatic port, Node built-ins only). It conducts **one step of a fictional lease**, `reserve-capacity`, in synthetic integer units. It is **not the approved Node.js 24 LTS / Express / App Service Linux control API**: it validates no production runtime, verifies no identity, registers no real service and makes no cloud call, no spend and no Azure call. Node `v22` here is test tooling. C017 (reconciliation) is **not implemented**: cancellation here is explicit and never an undo.

Gates C016 (idempotent, conditional commands), C019 (typed errors and allowed recovery), C035 (honest classification) and C002 (typed, versioned envelope and validator) are accepted. C042 follows their patterns in its own files (see `imports.json`, which also records why no C015/C016 persistence is imported).

## Run it

```powershell
node capability\C042\server.cjs --data-dir=demo --settle-ms=20000
```

The CLI rechecks current C001 local-probe consent (`approvals.C001`, read-only), binds only `127.0.0.1` on an automatically assigned port, prints one JSON line with the exact origin and process ID and accepts **only** `--data-dir=<name>` (a journal under `capability\C042\data\<name>`, git-ignored; without it the journal is in memory) and `--settle-ms=<0 to 60000>` (how long the fictional work takes, so a step stays in flight long enough to cancel). No host, port, identity or deployment override exists. Open the origin in a browser. Stop it with Ctrl+C.

Routes (all answers carry the strict headers: CSP `default-src 'none'`, `nosniff`, `no-store`; foreign Host or Origin, queries and unexpected bodies are typed refusals):

| Route | Meaning |
| --- | --- |
| `POST /v1/steps` | submit the step (`application/json`, at most 2048 bytes) |
| `GET /v1/steps/{key}` | inspect (read-only) |
| `POST /v1/steps/{key}/cancel` | cancel a step whose effect is not recorded |
| `POST /v1/steps/{key}/resume` | run an interrupted step from its persisted input |
| `POST /v1/steps/{key}/{anything else}` | typed refusal `UNSUPPORTED_ACTION` (there is no undo, rollback or release) |
| `GET /v1/leases` | ledger snapshot: capacity, committed, held, available per lease |
| `GET /`, `/page.js`, `/contract.js`, `/styles.css`, `/scope.json`, `/transcript.json` | page, scope record, server-produced transcript |

## Contract

Input `C042-reserve-capacity-input/1` is **closed**: exactly `schemaVersion` (integer 1), `step` (`reserve-capacity`), `idempotencyKey` (8 to 64 of `A-Za-z0-9._-`, starting with a letter or digit), `leaseId` (`synthetic-lease-001` holds 100 units, `synthetic-lease-002` holds 10) and `units` (integer 1 to 10). Missing, extra, wrongly typed, out-of-range, oversized, duplicated (also through escapes) and `__proto__`, `constructor`, `prototype` fields are typed rejections with **no effect and no journal entry**; numbers must be plain safe integers (no fraction, exponent, negative zero or overflow). A well-formed request for another step or schema version is `unsupported`.

Every answer is one result envelope `C042-step-result/1` (validated by `contract.js`, the same file the page loads): `action`, `accepted`, `replayed`, `outcome`, `classification`, `terminal`, `idempotencyKey`, `inputSha256`, `validatedInput`, `step.state`, `effect` (`applied` true, false or **null = unconfirmed**, `appliedByThisRequest`, lease, units, `reservedAfter`, capacity), `didNot` (what did NOT happen, from a closed catalog), `error` (typed `code`, `group`, fixed `message`, field `details`), `recovery` (`allowed` actions and the reason), `trail` (the journal records of the key), `attempts`, `scope`.

| outcome | C035 classification | meaning |
| --- | --- | --- |
| `succeeded` | `COMPLETED` | the single effect is journaled (and nothing else is ever called success) |
| `rejected` | `FAILED` | refused with no effect |
| `unsupported` | `UNSUPPORTED` | a step, version or action that does not exist; nothing changes |
| `unknown` | `UNKNOWN` | in flight, or a write that could not be confirmed |
| `cancelled` | `CANCELLED` | cancelled explicitly before any effect; no undo claimed |
| `interrupted` | `INTERRUPTED` | began, no terminal record (restart); never resumed automatically |

HTTP honesty: a 2xx answer means `accepted` (for submit and resume that means `succeeded`; for cancel the step is now cancelled; for inspect the key is known, with 202 while in flight). Every other outcome is a non-2xx answer.

Idempotency: the key plus the SHA-256 of the validated input identify the step. The same key and input returns the recorded result with exactly one effect (`replayed: true`, `appliedByThisRequest: false`), also for parallel duplicates, which join the step in flight. The same key with other inputs is `IDEMPOTENCY_KEY_CONFLICT`. In-flight units are held: parallel steps cannot oversubscribe a lease (`CAPACITY_EXHAUSTED`). At most 256 steps are admitted (`STEP_LIMIT_REACHED`).

Persistence: an append-only, hash-chained JSON Lines journal (`begin`, `resume`, `commit`, `cancel`), written and flushed before success is reported. Replay detects any edit, gap or reordering and fails closed (`JOURNAL_CORRUPT`); a torn final line is discarded and truncated without an effect. A write whose result cannot be confirmed is `unknown` (`JOURNAL_UNCERTAIN`, effect `null`); the next request re-reads the journal to decide (a landed commit becomes the one recorded success, a lost one becomes `interrupted`).

## Recovery controls

The envelope offers exactly the actions that work in the step's state, and the server executes only those:

| action | works when | what it does |
| --- | --- | --- |
| `retry` | success, in flight, uncertain | resend the identical request: the recorded result or the one in flight; never a second effect |
| `correct-and-resubmit` | rejected, unsupported, conflict, capacity, cancelled | edit and submit again (a rejected key was never used; a cancelled step needs a new key) |
| `cancel` | in flight, interrupted | explicit cancellation; nothing is undone because nothing was applied |
| `resume` | interrupted | run the persisted step to exactly one effect (checks capacity again) |
| `inspect` | any known key | read-only state |

A refused control is `ACTION_NOT_ALLOWED` (409) and repeats what is allowed. A resubmitted cancelled or interrupted key is reported, never silently resumed.

## Typed codes

`contract.js` is the closed catalog (code, group, HTTP status, outcome, offered actions, fixed message). Input group (400 unless noted, recovery `correct-and-resubmit`): `INVALID_JSON`, `REQUIRED_JSON`, `INVALID_ENCODING`, `INVALID_SHAPE`, `REQUIRED_FIELD`, `UNKNOWN_FIELD`, `DUPLICATE_FIELD`, `FORBIDDEN_FIELD`, `WRONG_TYPE`, `UNSAFE_NUMBER`, `FIELD_OUT_OF_RANGE`, `INVALID_FORMAT`, `NESTING_TOO_DEEP`, `STRING_TOO_LONG`, `BODY_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415). Transport group (no recovery): `UNEXPECTED_BODY`, `INVALID_QUERY`, `INVALID_URL`, `URL_TOO_LONG` (414), `LOCAL_HOST_REQUIRED` (421), `CROSS_ORIGIN_DENIED` (403), `NOT_FOUND`, `METHOD_NOT_ALLOWED` (405), `TRANSCRIPT_UNAVAILABLE` (500). Conflict and state: `IDEMPOTENCY_KEY_CONFLICT`, `CAPACITY_EXHAUSTED`, `STEP_LIMIT_REACHED` (503), `STEP_NOT_FOUND` (404), `ACTION_NOT_ALLOWED`. Unsupported (422): `UNSUPPORTED_STEP`, `UNSUPPORTED_SCHEMA_VERSION`, `UNSUPPORTED_ACTION`. Lifecycle: `STEP_IN_FLIGHT`, `STEP_CANCELLED`, `STEP_INTERRUPTED`. Persistence (unknown): `JOURNAL_UNCERTAIN`, `JOURNAL_UNAVAILABLE`, `INTERNAL_ERROR`.

## Verify

Every command runs from the repository root in PowerShell. Nothing needs a package install, a network, a credential or a fixed port; scratch lives under `capability\C042\tests\scratch` (git-ignored, removed by each test).

RED replay (the original behavioral failure against behaviorless stubs that answer every request 501; expect 12 failing tests, each an `AssertionError` such as `expected: 201 actual: 501`, and exit code 1):

```powershell
$env:C042_RED_SUBJECT = 'capability\C042\evidence\red\stubs'
try { node --test --test-concurrency=1 capability\C042\evidence\red\initial-a.snapshot.cjs capability\C042\evidence\red\initial-b.snapshot.cjs } finally { Remove-Item Env:\C042_RED_SUBJECT }
```

The same initial tests pass against the implementation (12 of 12):

```powershell
node --test --test-concurrency=1 capability\C042\evidence\red\initial-a.snapshot.cjs capability\C042\evidence\red\initial-b.snapshot.cjs
```

The archived RED run is `evidence\red\red-<uuid>\` (`stdout.txt`, `stderr.txt`, `run.json` with the exit code and the SHA-256 of every input). It was recorded before any production file existed and is never rewritten; `tests\surface.test.cjs` proves that, and replays both commands above.

GREEN (all focused suites; real sockets, raw `node:net` peers, hostile bodies and framing, parallel clients, racing duplicates, abrupt close, restart over the file journal, every recovery control, the page under a DOM stub):

```powershell
node --test --test-concurrency=1 capability\C042\tests\contract.test.cjs capability\C042\tests\input.test.cjs capability\C042\tests\journal.test.cjs capability\C042\tests\engine.test.cjs capability\C042\tests\server-http.test.cjs capability\C042\tests\server-flows.test.cjs capability\C042\tests\recovery.test.cjs capability\C042\tests\cli.test.cjs capability\C042\tests\resources.test.cjs capability\C042\tests\property.test.cjs capability\C042\tests\page.test.cjs capability\C042\tests\transcript.test.cjs capability\C042\tests\surface.test.cjs
```

Per-file coverage, 85 lines / 85 branches / 85 functions for each enumerated production file (`contract.js`, `engine.cjs`, `input.cjs`, `journal.cjs`, `page.js`, `result.cjs`, `server.cjs`, `transcript.cjs`), one L-0004 command per file, an unloaded file counts as 0% (`index.html` and `styles.css` are not measurable by Node and are disclosed, never counted). `page.js` is loaded under Node in a `vm` context with a DOM stub built from the ids and values of the real `index.html`. Take a heavy-run slot first when other agents are active:

```powershell
node capability\C042\tests\coverage.cjs
```

Syntax, then the real isolated headless Edge observation (heavy-run slot; no evidence file is written unless `CAPTURE_BROWSER_EVIDENCE=1`):

```powershell
node capability\C042\tests\syntax.cjs
node capability\C042\tests\browser.cjs
```

`tests\record.cjs <red|initial|green|coverage|syntax|browser>` archives raw stdout, stderr, exit code and input SHA-256 (RED in a new `evidence\red\red-<uuid>`, other stages in `evidence\raw\<stage>-<uuid>`; files are created with flag `wx`, never rewritten). Runs are never deleted: the earlier `coverage-81bc6651…` run failed (one resource test flaked while its child process inherited the coverage instrumentation of the parent; the child now starts without `NODE_V8_COVERAGE`) and is kept next to the passing runs recorded after the last source edit; each `run.json` lists the SHA-256 of every input it ran against.

## Browser limit (read this)

The isolated browser helper allows only GET: it aborts every other method (`testing\browser\isolated.cjs`, see C020). The real browser therefore **cannot POST** to the service. Submitting the form in that browser fails at the network layer, and the page then reports the outcome as **UNKNOWN** (no valid response, so not known whether anything was applied), shows no success and offers only Retry and Inspect. The page was not given a way around the helper. What the browser observes instead:

- `GET /transcript.json`: the server drives the real service over real loopback sockets against private instances (valid step, replay, conflict, hostile and unsupported requests, an in-flight step cancelled, a client that disappears, a restart with an explicit resume, an unconfirmed journal write, held capacity) and returns the recorded transcript. The page verifies it itself (closed envelopes, 2xx only when accepted, one effect per key, ledger totals, required outcomes and typed failures) and shows `VERIFIED SERVER TRANSCRIPT` or `REJECTED`; a missing, altered or unavailable transcript clears the display.
- `GET /v1/steps/{key}` and the keyboard-operable form: the browser run inspects a step the test submitted from Node, so the validated inputs, the explicit result and the offered recovery controls of a real server-side state are shown by the real page.

The POST actions themselves (submit, retry, cancel, resume, unsupported action) are proved by the node:test suites against real sockets and by the page tests, which drive the real page script against the real service.

## Resource bounds

Resource use is capped by the connection and per-request bounds, not guaranteed to fit a 48 MB heap. The retained reviewer measurement (`evidence\u056-residuals\review-observations.snapshot.json`, probe h8 of the U039 review, not a fresh U056 measurement) found about 2 MB per pending socket for one 64 KB read of 1310 requests behind a held first submit, bounded by the 128-connection cap: a 48 MB child survives 12 held sockets and dies at 24 (exit 134), the same on the accepted parent. This is a measured case, not a general memory estimate or reliability claim. The existing bounded-resource checks use a child process with `--max-old-space-size=48` and a hard external timeout (`tests\resources.test.cjs` with `tests\child-server.cjs`):

- Bodies: at most 2048 bytes. A declared larger `Content-Length` is refused (413, `Connection: close`) before any byte is read; an undeclared or chunked body is cut off the moment it passes the limit and nothing of it is kept (an endless stream of one-byte chunks costs no memory). Headers: at most 8192 bytes and 64 fields, a URL at most 2048 characters, strings 128 characters, JSON nesting 6.
- Responses: at most 4 requests may be pipelined on one connection; the fifth destroys the connection, so a client that pipelines and never reads can queue at most 4 small responses. No response is larger than the transcript. The requests of one connection run strictly in order: a pipelined request starts only after the answer before it was sent. EVERY refusal (every answer with a status of 300 or above, and every request whose body the server did not read: a refused GET or action with a body, a wrong method, route or media type, a foreign Host, an invalid body, a key conflict, a full lease) is answered with `Connection: close`. The connection is marked at the moment of the decision, also when it is decided after an await, and its socket is destroyed once the answer is flushed, so an endless chunked body behind a refusal is cut off at once and **a request pipelined behind a refusal never runs**: the client receives the answers of the earlier requests and the refusal, nothing else. The answers Node would give itself go through the same rule with a typed body: an unknown `Expect` header (417), a request without `Host` (421), a parse error or an oversized header (400, 431), `CONNECT` (405) and a request that stops before it is complete (a body cut by the request timeout: 408; a bad chunk size, or a client that closes its side in the middle of a body: 400). The request that Node was still receiving when it gave up (`request.complete` is false) is the one that failed: its handler waits for a body that can never end, so it is never run and never answered, and its typed refusal is written at once after the answers of the requests BEFORE it, then the connection is closed (the refusal never waits for that request's own turn: see the list of waits below); a request whose message IS complete is still answered before a refusal that follows it. A pipeline of successful requests is still served in order, as long as none of its requests carries an `Upgrade` header: Node drops everything pipelined after an `Upgrade`-flagged request without any answer (the accepted bytes do the same). The requests of one connection run strictly one after the other, so a pipelined `cancel` waits behind a slow submit on the same connection: use a second connection for anything that must not wait. Two limits of the close are inherited and unchanged: a typed refusal can be lost to the reset that follows the close when the client keeps writing after the refusal (2 of 516 quick trials, also on the accepted bytes), and the fifth pipelined request destroys the connection before the earlier queued answers are flushed (also on the accepted bytes). `U039.md` states the commands, the evidence and the limits of this rule (HTTP/1.0 framing, `Connection: keep-alive` negotiation and h2c upgrade included).
- Upgrade-flagged incomplete bodies (U056 narrowing of the Responses and Connections claims): an Upgrade-flagged request is outside the incomplete-body rule. With `Connection: Upgrade` and `Upgrade: websocket`, a bad chunk size gets the typed 408 at the request timeout; a client FIN gets a silent close. The exact rows in `tests\u039-body-rows.cjs` send `POST /v1/steps`, those headers, then either `Transfer-Encoding: chunked` and `zz` CRLF, or `Content-Length: 100` and ten body bytes followed by silence and FIN. `tests\u056-upgrade.test.cjs` checks answers, closure, no effect and released connection slots. Node reports no immediate chunk error or client-FIN error for these requests; no WebSocket listener or production behavior is added.
- Connections (subject to the Upgrade exception above): at most 128 open sockets (more are dropped); every accepted socket is tracked, a socket that never completes a request (or a header that stops on a first request) is closed after 5 s without an answer (measured at 5.02 s with the default bounds), a body that stops gets the typed 408 and a closed connection at the request timeout (5 s, checked every second: measured at 5.06 s), a bad chunk size or a client that closes its side in the middle of a body gets the typed 400 and a closed connection at once (measured at 40 ms) and the connection count returns to zero, so 128 such sockets do not pin the cap; an idle keep-alive socket is closed after about 2 s (a header that stops on a later request is cut by that timer, silently) and any other idle socket after 90 s (a client that never reads its answers is bounded by the same 90 s). The default timers are measured by hand and not asserted by a test (the tests shorten them or use none). `closeServer` stops listening first, halts the engine (timers of in-flight steps are cleared), then destroys every tracked socket, so shutdown never waits for a half-open or never-reading peer (a refused client that keeps its half of the connection open, partial request lines, headers and bodies, an upgrade attempt, an unread in-flight response).
- Every wait on the request path (U039, fourth fix: a refusal that waits for a lane entry must prove that entry can finish). Each line says what it waits for, what finishes it, and why it can never wait for the request being refused. `tests\u039-body.test.cjs`, `tests\u039-body-order.test.cjs` and `tests\u039-body-fuzz.test.cjs` prove them; the named mutants M29 to M34 and the systematic generator mutate them.
  - `handle`, `await earlier`: waits for the lane entry of the request before it on the same connection, released when that request's response has closed or when it was dropped. It is never the request's own entry (read before the request's own entry is stored), and the request before it is a complete message, so its handler can finish without the parser. A client that never reads its answers keeps it waiting at most until the 90 s idle timeout.
  - `handle`, the check right after it: a request of a marked connection, and a request that Node never finished receiving once a client error has ended the connection (`unparsed` and `request.complete` false), is dropped. It releases its own entry, writes nothing and never runs, so nothing waits for it and it cannot answer a second time.
  - `handle`, `await readBody`: waits for the end of that request's own body (`end`, the request's `close` when its socket is destroyed, or the 2048-byte bound). A body that cannot end is a client error that Node reports (`clientError`); `refuseUnparsed` answers it at once, without waiting for this request, and destroys the socket, which wakes this wait.
  - `handle`, `await engine.submit`, `await engine.resume` and the transcript build: wait for the local engine (a step settles by its executor, `closeServer` halts it). They read nothing from the socket, so they cannot wait for a refusal.
  - `refuseUnparsed`, the `.then` on `behind`: waits for the answers that must go out before the refusal. For the request Node was still receiving (`request.complete` false) that is only the lane entry of the request BEFORE it, never its own entry; for any other error (a request line, a header, a connection that ends between requests) it is the entry of the latest request, a complete message whose handler can still answer. What finishes it is the `close` of those responses. It cannot wait for the request being refused: that request is excluded when it is incomplete and can answer when it is complete.
  - `refuseUnparsed`, `socket.end(answer, callback)`: waits for the flush of the typed answer and then destroys the socket (a peer that never reads: the 90 s idle timeout).
  - `clientError`: calls `refuseUnparsed` once per connection (a `WeakSet` ignores a second report, such as the timer that reports a stalled connection at every check, and a connection already marked `closing`); it waits for nothing itself.
  - `connect`: the same call for `CONNECT`, a request Node never hands to `handle`; the latest request is complete, so the refusal waits for that request's answer.
  - `checkContinue` and `checkExpectation`: call `handle`, so they have exactly the waits above. `100 Continue` is written only after the first wait and before the body wait, for a request that will be read; an unknown `Expect` is answered 417 after the first wait.
- Work: the server-produced transcript is built once and shared (concurrent requests share one build; a failure is retried), at most 256 steps are admitted, and the journal is bounded.

## Recovery invariants

Duplicate and idempotency state survives every recovery path: the only state is the journal, which is re-read after a failed write, after a restart and by every retry. `tests\property.test.cjs` is a seeded stateful property test (40 seeds of 70 operations) whose operation alphabet includes the recovery operations next to the plain ones: submit, a conflicting resubmit, release, cancel, resume, inspect, an unsupported action, a journal write that landed, was lost or tore the file, an executor failure and a restart. After EVERY operation a global invariant derived from the journal (not from the engine) is checked: the record grammar per key (`begin`, any `resume`, at most one of `commit` or `cancel`), the ledger and every running total, agreement of the engine with the journal, every answer a valid envelope with 2xx only when accepted, success only for a journaled commit, at most one request that claims to have applied a key, and `applied + replayed + refused` equal to the answers delivered. A mutant that forgets its steps on a degraded reload is caught by it and by two unit tests.

The rendered page is held to the same standard: after EVERY user action the page tests (`tests\dom-stub.cjs`, `renderedInvariants`) and the real-browser run assert that no id repeats (elements, journal trail, what-did-not codes, controls, event numbers), that a trail holds at most one commit, that the event table has no gap and that the submit exchanges shown partition into applied (201), replayed (200) and refused; the browser run also compares those counts with the transcript it fetched, and archives the DOM snapshot it checked.

The retained RED fails for the missing behavior (every assertion fails with `expected 201 actual 501` or the like), and every one of its assertions passes unchanged against the final code (`tests\surface.test.cjs` replays both).

## Operating envelope

C001's design remains Node.js 24 LTS / Express / App Service Linux; this fixture's `scope.json` and the evidence record the test runtime separately. The fixture bounds the body (2048 bytes), strings, nesting, steps (256) and request time (5 s) but has no authentication, role boundary, TLS, rate limit or multi-process locking: one service owns one journal directory. Native OS, SKU, region, tenant, subscription and resource group remain unapproved; IaC is N/A. `imports.json` pins the two accepted C001 files used (`contract-guard.js` for the consent recheck, `approved-contract.js` in tests) by commit, tag and SHA-256.

## Files

`C042.feature` (specification, written first), `contract.js` (closed catalogs, envelope validator; also loaded by the page), `input.cjs` (strict JSON reader and closed validator), `result.cjs` (envelope builder), `journal.cjs` (hash-chained journal over file or memory io), `engine.cjs` (the step conductor), `server.cjs` (loopback service and CLI), `transcript.cjs` (server-produced transcript), `index.html`, `page.js`, `styles.css`, `imports.json`, `.gitattributes` (`* -text`: byte-exact files; raw evidence is exempt from whitespace checks), `.gitignore`, `tests\` (suites, `support.cjs`, `dom-stub.cjs`, `child-server.cjs`, `coverage*.cjs`, `browser.cjs`, `record.cjs`, `syntax.cjs`), `evidence\red\` (stubs, retained initial tests, the archived RED), `evidence\raw\` (archived GREEN, coverage, syntax and browser runs). U039 (a defect fix after acceptance in four rounds; `server.cjs`, the Responses and Connections bullets and the list of waits above amended) adds `U039.md` (addendum: what changed, the exact commands, evidence, limits), `U039.feature` and `U039-incomplete.feature`, `evidence-addendum-N.json` (chained, append-only supersession of the replaced bytes by name), `evidence\u039-pipelining\` and `evidence\u039-incomplete-bodies\` (the bytes it replaced, its RED, GREEN, coverage and mutation runs) and the `tests\u039-*` suites and tools.

## U056 residual amendment (zero credit)

`U056.feature` and `evidence-addendum-4.json` continue the append-only chain: addendum 3 and every historical capture remain byte-exact, and the five superseded documentation/verification files have exact retained copies. All eight production files, assets and imports are unchanged (`evidence\u056-residuals\production-unchanged.json`); new executable files are verification-only tools under `tests\`. Coverage is **not-applicable**, not a fresh 85/85/85 measurement or a waiver.

The **plain evidence run is strict by default**, including unpinned files under indexed `evidence/u039-*` directories, required historical capture kinds and quoted figures. `U039_ALLOW_UNPINNED_EVIDENCE=1` is an explicit pre-seal collection convenience only: it tolerates unpinned U039 evidence and relaxes capture-kind/quoted-figure completeness. It is not acceptance. Neither mode can authenticate a consistent rewrite of the namespace, its manifests, all addenda and this verifier together, inspect files outside the namespace, or create evidence for an unobserved run; the accepted commit/tag and external review pins remain the anchors.

The tamper tests use one immutable snapshot and cache digests/decompressions by immutable buffer identity; each mutation gets a separate map and changed buffers are rechecked. The actual operation counts below use the **same 362-file accepted fixture and 30 registered checks**, not estimated loop bounds or an elapsed-time assertion (`evidence\u056-residuals\structural-operations.json`):

| Actual operation | Before | After |
| --- | ---: | ---: |
| directory reads | 775 | 25 |
| file reads | 11944 | 362 |
| SHA-256 operations | 59787 | 1327 |
| gzip decompressions | 4617 | 154 |
| maximum reads of one file | 57 | 1 |
| selected nested RED tests | 16 | 6 |

Both nested replays actually ran: before, 11 assertion failures plus five passing unchanged controls; after, one deciding assertion failure plus those same five controls. The reviewer's previous **309.6 s** evidence-suite and **57.1 s** nested-test captures are retained history, not universal thresholds (`review-observations.snapshot.json`). No absolute elapsed-time test was added.

The systematic **all-four-fixes generator is absent**. U056 does not claim that missing campaign, the missing 64-run loop, new browser qualification, HTTP/2, TLS, a proxy, or fresh memory observations. Reviewer mutant J is separately archived and executed: deleting the dropped request's `release()` is killed by the named test `mutant J: dropping a request releases its lane entry before the event-loop barrier`. The real handler passes; the mutant fails an assertion after the first response-close microtasks and one event-loop barrier, not after a timer. The mutation command exits zero only after verifying that contrast; its child mutant test intentionally exits one.

Replays, from the repository root (Node built-ins, owned loopback fixtures, no real browser):

```powershell
node --test --test-concurrency=1 capability\C042\tests\u056-residuals.test.cjs capability\C042\tests\u056-upgrade.test.cjs capability\C042\tests\u056-lane.test.cjs capability\C042\tests\u056-evidence.test.cjs
$env:U056_REPLAY = 'before'
try { node --test --test-concurrency=1 capability\C042\tests\u056-residuals.test.cjs } finally { Remove-Item Env:U056_REPLAY }
node capability\C042\tests\u056-cost.cjs before
node capability\C042\tests\u056-cost.cjs
node capability\C042\tests\u056-mutant-j.cjs
node --test --test-concurrency=1 capability\C042\tests\u039-evidence.test.cjs capability\C042\tests\u039-incomplete-evidence.test.cjs
```

The `before` replay expects the same five assertion failures as the retained RED; the unchanged test file passes on the amended files. `tests\u056-command.cjs` emits portable repository-relative placeholders before the shared recorder archives its raw output; original unnormalized child streams are retained privately. Its path formatting does not change assertions, counts or exit codes. The first fixture-start attempt failed because the two pinned C001 modules had not yet been copied; it is retained privately as a harness fault, not behavioral RED. All candidate evidence, application and publication remain subject to independent review; no live application or qualification is implied.
