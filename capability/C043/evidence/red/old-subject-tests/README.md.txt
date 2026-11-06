# C043: execute a bounded preset automatically through the same validated steps as manual operation

A **synthetic, local-only, offline** H008 fixture on `127.0.0.1` (automatic port, Node built-ins only). A *preset* is a declared, versioned, closed-contract sequence of N inputs of the accepted C042 step (`reserve-capacity`, synthetic integer units, two fictional leases) with explicit bounds: maximum steps, maximum duration on an **injected clock** and maximum synthetic units. It is **not the approved Node.js 24 LTS / Express / App Service Linux control API**: it validates no production runtime, verifies no identity, registers no real service and makes no cloud call, no spend and no Azure call. Node `v22` here is test tooling. C017 (reconciliation) is **not implemented**: cancellation is explicit and never an undo; effects of completed steps stand.

Gate C042 (one validated step, typed envelope, journal, recovery controls) is accepted and imported **read-only and pinned** (`imports.json`: raw, LF and git-blob SHA-256 plus commit and tag, recomputed against git by `tests\surface.test.cjs`). C043 adds no step logic: `runner.cjs` calls the same step service (`engine.submit`, and for recovery `inspect`, `resume`, `cancel`) that the C042 server calls for a manual request.

## Run it

```powershell
node capability\C043\server.cjs --data-dir=demo --settle-ms=20000
```

The CLI rechecks current C001 local-probe consent (`approvals.C001`, read-only), binds only `127.0.0.1` on an automatically assigned port, prints one JSON line with the origin and process ID and accepts **only** `--data-dir=<name>` (two journals under `capability\C043\data\<name>\steps` and `\runs`, git-ignored; without it both are in memory) and `--settle-ms=<0 to 60000>` (how long the fictional work of each step takes, so a step stays in flight long enough to cancel, and so that the duration bound can be seen with the real monotonic clock). Directory names are closed: Windows device names (`nul`, `con`, `prn`, `aux`, `com1` to `com9`, `lpt1` to `lpt9`, also with an extension), trailing dots and trailing spaces are refused before anything is created (C042 F5). No host, port, identity or deployment override exists.

| Route | Meaning |
| --- | --- |
| `GET /v1/presets` | the declared presets (a closed, versioned catalog the page validates) |
| `POST /v1/presets` | run a preset (`application/json`, at most 2048 bytes; the body IS the preset) |
| `GET /v1/presets/{key}` | inspect (read-only; 202 while it runs) |
| `POST /v1/presets/{key}/cancel` | cancel explicitly (also the step in flight, through the step service) |
| `POST /v1/presets/{key}/resume` | continue an interrupted preset at its first unacknowledged step |
| `POST /v1/presets/{key}/{anything else}` | typed refusal `UNSUPPORTED_ACTION` (no undo, rollback or release) |
| `GET /v1/leases`, `GET /v1/journal` | the step ledger; journal health including every discarded tail |
| `GET /`, `/page.js`, `/contract.js`, `/validate.js`, `/envelope.js`, `/verify.js`, `/c042-contract.js`, `/styles.css`, `/scope.json`, `/transcript.json` | page, the accepted C042 contract file the page validates with, scope record, server-produced transcript |

## The preset contract `C043-preset/1`

Closed: exactly `schemaVersion` (1), `preset` (a name), `idempotencyKey` (the run key, 8 to 64 characters), `bounds` (`maxSteps` 1 to 8, `maxDurationMs` 1 to 60000, `maxUnits` 1 to 80) and `steps` (1 to 8 inputs of the C042 contract, each with its own idempotency key). The reader is the C042 strict reader (duplicate fields also through escapes, `__proto__`, `constructor`, `prototype`, unsafe numbers, depth, string length, BOM, invalid UTF-8) and **every step is validated by the accepted C042 validator; the frozen output of that validator is what the step service receives** (an object source is serialised and read again, so accessors and later mutation cannot matter). An invalid preset (unknown version, unknown key, too many steps, an invalid step in ANY position, a duplicated step key, a forbidden key) is a typed failure with C042's recovery action `correct-and-resubmit` and **no call of any step function, no journal entry and an unused key**. `maxSteps` and `maxUnits` are decidable from the declaration, so exceeding them is `PRESET_BOUND_EXCEEDED` before the first effect (all steps listed as not run). The duration is measured by the injected clock **between steps and after the last one**; a step in flight is never preempted (a limit, see below).

## The same steps, proved

- **Spy at the shared boundary** (`tests\same-steps.test.cjs`, `evidence\red\initial-a.snapshot.cjs`): a spy wraps the real C042 engine and records every call with arguments and result. A manual run (parse with `input.parseBody`, `engine.submit`) and the preset run produce identical call sequences, arguments, results, step-journal bytes and ledgers.
- **Differential property test**: 80 seeded random presets (LCG, no library) with random leases, units, pre-applied steps and failing executors; the preset run equals the manual run call for call and fact for fact (failures, interruptions, replays and completions all occur).
- **Mutants** (`tests\mutants.test.cjs`, test names start with `MUTANTS:`): a `--require` preload rewrites one production file in memory; 38 mutants (private copy of the step service, bypassed validation, ignored `maxSteps`/`maxUnits`/`maxDurationMs`, off by one, no stop after a failure, no conflict check, resume that starts again or does not ask the step service, a cancel recorded as success, journal self-check/chain/tail report removed, reserved names accepted, and every server guard: `maxConnections`, the destroy after the flush, pipeline depth, first-request timer, `connectionsCheckingInterval`, `requestTimeout`, `headersTimeout`, `keepAliveTimeout`, header size, streamed and declared body limits, close on every refusal, halting on shutdown) must each be killed by a test whose name is asserted, and the control runs of the same focused tests must pass (a `--test-name-pattern` that names only a subtest runs nothing, so a mutant that carries a different pattern names the parent test). The first full run had 6 survivors (an off-by-one at equality between steps, a flood test that ran no subtest, the engine halt on shutdown and others); each got a discriminating test before this README was final. One **equivalent mutant** is disclosed, not hidden: removing the loop in `closeServer` that destroys tracked sockets changes nothing on Node 22, because `server.closeAllConnections()` already ends every connection.

## Honest behaviour

A run ends in exactly one state and the answer (`C043-preset-result/1`, validated by `envelope.js`, the same file the page loads) lists, from facts, `steps` (per step: `succeeded`, `replayed` (applied earlier, one effect), `failed`, `unknown`, `interrupted`, `cancelled`, `running` or `not-run`), `ran`, `notRun`, `effects` that stand (with units and reserved-after) and `usage`.

| run state | outcome (C035 class) | meaning |
| --- | --- | --- |
| `completed` | `succeeded` (COMPLETED) | every step succeeded within the bounds |
| `stopped` | `failed` (FAILED) | the first refused step stopped it (`PRESET_STEP_FAILED`, details name the step and its C042 code); later steps never called |
| `bounded` | `bound-exceeded` (FAILED) | the duration bound passed (`PRESET_BOUND_EXCEEDED`, `bound` shows limit and observed) |
| `cancelled` | `cancelled` (CANCELLED) | explicit; the step in flight was cancelled through the step service; never a success |
| `interrupted` | `interrupted` or `unknown` | begun, no terminal record (a restart, an interrupted step, an unconfirmed write); never resumed automatically |
| `running` | `unknown` | in flight |

Nothing is undone: effects of completed steps stand and the answer says so. HTTP 2xx means `accepted` (201 only when this request applied an effect, 202 while running); every other answer is non-2xx.

- **Idempotency**: the run key plus the SHA-256 of the validated preset identify the run. The same preset again (also in parallel) joins the run in flight or returns the recorded result (`replayed: true`, no step called again, one set of effects); another preset under the key is `IDEMPOTENCY_KEY_CONFLICT` and the answer shows the preset that owns the key.
- **Restart**: the preset journal replays; a run with no terminal record is `interrupted` until an explicit resume. Resume first asks the step service what it already knows (`inspect`): a step it already committed is acknowledged without a call, an interrupted one is resumed through the step service, one never begun is submitted; **an acknowledged step is never called again**. The crash window (the effect landed, its acknowledgement did not) is reported as an unconfirmed `interrupted` step until resume reconciles it.
- **Recovery controls**: exactly the actions that work in the state (`retry`, `correct-and-resubmit`, `cancel`, `resume`, `inspect`); an interrupted run whose steps all succeeded does not offer `cancel`; any other action is `ACTION_NOT_ALLOWED` or `UNSUPPORTED_ACTION`, repeating what is allowed.

## Typed codes

`contract.js` is the closed catalog; the input, transport, conflict and unsupported codes are the accepted C042 entries unchanged (a test compares them). New: `UNSUPPORTED_PRESET_VERSION` (422), `TOO_MANY_STEPS`, `DUPLICATE_STEP_KEY` (400), `PRESET_BOUND_EXCEEDED`, `PRESET_STEP_FAILED`, `PRESET_CANCELLED`, `PRESET_INTERRUPTED`, `PRESET_IN_FLIGHT` (409), `PRESET_UNCONFIRMED`, `RUN_LIMIT_REACHED`, `RUN_JOURNAL_UNCERTAIN`, `RUN_JOURNAL_UNAVAILABLE` (503), `RUN_NOT_FOUND` (404).

## Persistence and what it can and cannot detect

Two append-only, hash-chained JSON Lines journals: the C042 step journal (the truth about effects) and the preset journal (`runlog.cjs`: `begin`, `start`, `step` acknowledgement, `resume`, `cancel`, `end`). Each preset-journal line carries the SHA-256 of the previous line **and a check of its own content**, so even an edit of the last line is detected. `tests\journal.test.cjs` flips **every byte** of a persisted journal four ways (about 10,000 flips): each is a typed `JOURNAL_CORRUPT` except a flip of the final newline, which turns the last record into an unterminated tail; that tail is discarded, truncated **and reported** (`GET /v1/journal` `discardedTailBytes`; C042 F2 asked for exactly this) and never silent. Replay cannot detect a journal cut at a record boundary or a forgery that re-chains every line: those are tamper-evident only with an **external anchor** (a test shows the truncated journal replays as a shorter valid one). The step journal inherits C042's F2 behaviour unchanged (its final-newline flip drops the last record; the count is `stepJournalDiscardedTailBytes`), but the preset layer cross-checks: an acknowledged step is never trusted without the step service.

## Verify

Every command runs from the repository root in PowerShell. Nothing needs a package install, a network, a credential or a fixed port; scratch lives under `capability\C043\tests\scratch` (git-ignored, removed by each test).

RED replay (the archived run is `evidence\red\red-01`: raw stdout, stderr, exit code and input SHA-256; recorded before any production file existed; behaviorless stubs answer 501; 31 of 31 tests fail with assertions such as `expected: 201 actual: 501`; never rewritten):

```powershell
$env:C043_RED_SUBJECT = 'capability\C043\evidence\red\stubs'
try { node --test --test-concurrency=1 capability\C043\evidence\red\initial-a.snapshot.cjs capability\C043\evidence\red\initial-b.snapshot.cjs } finally { Remove-Item Env:\C043_RED_SUBJECT }
node --test --test-concurrency=1 capability\C043\evidence\red\initial-a.snapshot.cjs capability\C043\evidence\red\initial-b.snapshot.cjs
```

The second command (no variable) passes the same files unchanged against the final code. GREEN (every suite except the mutants; real sockets, raw peers, a cross-process refusal flood, journal flips, seeded properties, the page under a DOM stub):

```powershell
node --test --test-concurrency=1 capability\C043\tests\units.test.cjs capability\C043\tests\journal.test.cjs capability\C043\tests\runner.test.cjs capability\C043\tests\same-steps.test.cjs capability\C043\tests\property.test.cjs capability\C043\tests\server.test.cjs capability\C043\tests\resources.test.cjs capability\C043\tests\page.test.cjs capability\C043\tests\surface.test.cjs capability\C043\evidence\red\initial-a.snapshot.cjs capability\C043\evidence\red\initial-b.snapshot.cjs
node --test --test-concurrency=1 capability\C043\tests\mutants.test.cjs
```

Per-file coverage, 85 lines / 85 branches / 85 functions for each of the 11 enumerated production files (`contract.js`, `envelope.js`, `page.js`, `preset.cjs`, `result.cjs`, `runlog.cjs`, `runner.cjs`, `server.cjs`, `transcript.cjs`, `validate.js`, `verify.js`), one L-0004 command per file, an unloaded file counts as 0% (`index.html` and `styles.css` are not measurable by Node and are disclosed, never counted). `page.js` and the browser-side contract files are loaded under Node in a `vm` context with a DOM stub built from the ids of the real `index.html`. Take a heavy-run slot first when other agents are active:

```powershell
node capability\C043\tests\coverage.cjs
```

The real isolated headless Edge observation (heavy-run slot; asserts the Microsoft signature and the qualified major version, no equality pin; no evidence file is written unless `CAPTURE_BROWSER_EVIDENCE=1`):

```powershell
node capability\C043\tests\browser.cjs
```

`tests\evidence.cjs` recomputes every hash a capture recorded (inputs, gzip and plain transcripts) and `tests\surface.test.cjs` shows it fail for a changed input, a flipped byte, a rewritten transcript and a missing file. Captures were made last, with the shared recorder, so no pinned input differs from its pin; failed or earlier runs are retained next to the passing ones.

## Browser limit (read this)

The isolated browser helper allows **only GET** and aborts every other method (`testing\browser\isolated.cjs`), so the real browser **cannot POST** a preset. Submitting the form there fails at the network layer and the page reports **UNKNOWN**: no valid response, nothing shown as success, only Retry and Inspect offered. What the real browser observes instead: the declared presets (GET), the read-only inspection of a preset that the test completed from Node and of one still running (progress, effects, controls), and the server-produced transcript, which the server drives over real loopback sockets against private instances (valid run, replay, conflict, every hostile input, a refused step, a duration bound on a manual clock, a cancel while a step is in flight, a restart with an explicit resume) and which the page verifies again. The POST actions themselves are proved by the node:test suites against real sockets and by the page tests against the real service.

The page prints **no server prose**: every answer is validated against the closed envelope (shape, status honesty, listing derived from the steps, wording only from closed catalogs), the HTTP status must be the honest one, and the preset an answer shows must be the one that was sent (unless the key belongs to another preset); the headline, the listings and the controls are derived from the facts by the page. A tampered state, result or failure is rejected and shown as such.

## Resource bounds and the C042 review findings

- **F1** (a guard whose removal passes every test is unproven): the mutants above remove every limit and destroy rule; the refusal flood runs the attacker in a separate process against a server in a small-heap child with its event-loop lag measured inside (`tests\resources.test.cjs`, `tests\attacker.cjs`, `tests\child-server.cjs`): without the destroy after the flush, 0 of 8 attacker sockets were ever closed (20 s of event-loop lag); with it, all are closed in about two seconds.
- **F2**: see persistence; every discarded tail is reported. **F3**: C043's own admission counts only open and completed runs and keeps the preset journal under 768 KiB (`RUN_LIMIT_REACHED` has no recovery control; a new data directory is the only way out); **inherited, unchanged**: the C042 engine counts every admitted step toward its 256-step bound for ever, cancelled ones included. **F4 inherited**: no multi-process exclusion; two services on one `--data-dir` fail closed with `JOURNAL_CORRUPT` on the next start. **F5**: reserved Windows names and trailing dots or spaces are refused. **F6**: the result file counts every test file and lists every failed or earlier run. **F7**: the CSP allows `img-src data:`, and the browser run asserts the console holds no CSP violation.
- Every refusal (any non-2xx answer) goes through ONE central send path that sends `Connection: close` and destroys the socket once the answer is flushed; a table-driven test (`tests\server.test.cjs`) covers every refusal the server can emit and the flood test covers ten of them against a real child. Bodies: at most 2048 bytes (declared larger is refused before reading, streamed larger is cut off at the limit); headers at most 8192 bytes; at most 4 pipelined requests per connection; at most 128 connections; a socket that sends no request is closed after 5 s; `connectionsCheckingInterval` is set to 1 s together with the header and request timeouts so the configured bound is the real bound (tested with relaxed timers and a trickling client); idle keep-alive after 1 s.
- Limits that remain: the duration bound is checked between steps, so a step that takes longer than the whole bound is only noticed afterwards; the preset journal and the step journal are two files, so a crash between them is reconciled by resume, never repaired automatically; no authentication, role boundary, TLS, rate limit or multi-process locking; the transcript is built once and shared.

## Files

`C043.feature` (specification, written first), `contract.js`, `validate.js`, `envelope.js`, `verify.js` (browser-loadable, shared by the server tests and the page), `preset.cjs` (strict reader, bounds, digest, declared presets), `runlog.cjs` (preset journal), `result.cjs` (envelope builder), `runner.cjs` (the automatic runner), `server.cjs`, `transcript.cjs`, `index.html`, `page.js`, `styles.css`, `imports.json`, `.gitattributes` (`* -text`: byte-exact files), `.gitignore`, `tests\` (suites, `support.cjs`, `dom-stub.cjs`, `child-server.cjs`, `attacker.cjs`, `mutate-preload.cjs`, `coverage*.cjs`, `evidence.cjs`, `build-imports.cjs`, `browser.cjs`), `evidence\red\` (stubs, retained initial tests, the archived RED), `evidence\raw\` (archived GREEN, mutant, coverage and syntax runs), `evidence\browser\` (the browser observation, only when captured).
