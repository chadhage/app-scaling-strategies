# C010 - lease ownership on every resource target

A local, synthetic H003 fixture (class D): every route that names a target of any kind decides **ownership on the server**, deny by default,
and decides it **again where the effect is committed**. Another conductor's lease, runs, scratch resources and exports stay inaccessible, and a
foreign target is indistinguishable from an absent one. It is **not** the approved Node 24 / Express / Entra control API and not an identity service:
no Entra, no cloud, no registration, no spend; all data is synthetic and the server listens on `127.0.0.1` only.

## Built on C009 (read-only import, speculative pin)

The four fake identities (`visitor`, `conductor-a`, `conductor-b`, `operator`), the opaque bearer tokens, the deny-by-default role table, the
request lanes and the refusal path (`authz.cjs`, `codes.cjs`, `contract.js`, `http-io.cjs`, `queue.cjs`) are imported **unchanged** from `capability\C009`
and pinned in `imports.json` by commit `f95cc52a29cf643fd443b80e5c0b112556feb548` and tag `kanban/C009/f95cc52a29cf` (raw, git and LF SHA-256 of each file,
git object id). **C009 was not accepted when C010 was built** (its third fix was in progress with the production files frozen), so this pin is speculative:
if C009 changes a production byte, `tests\imports.test.cjs` fails by name and `imports.json` must be re-pinned to the accepted commit.
The C009 README states that `admit.refuse` takes an option that the code does not have; C010 follows the code (`http-io.cjs`, `authz.cjs`), never that line.

## Where ownership is decided

- `store.cjs` is the **only** place that decides who owns what (`pick`: a constant-work full pass, so a foreign and an absent target cost the same, counted by `visited`).
- `server.cjs` is wiring: ONE `route()` (guard, URL, route, credential, role, query, body, targets) and ONE `refuse()`. A mutation is decided before its body is read and again
  inside the linearized commit together with its token (`hooks.beforeCommit` lets a test change the world while a request waits).
- `contract.js` holds the closed route table, the role table, the id/name shapes, the query vocabulary (`limit` 1..50, `offset` <= 10000, `sort` created|name, `q`) and the body schemas.
- Foreign, absent, ended, expired and malformed-id targets all answer the byte-identical `404 TARGET_NOT_FOUND`; there is no ETag and no global counter; lists, counts, pages,
  searches and sorts show only the caller's items; a body, query or header that names an owner, lease, subject, role or server field is refused or reported by name in `ignoredClaims`.
- The operator reads only lease metadata (id, owner, expiry, counts) and the audit view, and each read is itself audited. There is no public state route.
- `page.js` / `index.html` / `style.css`: an inspection page. It learns the ids by listing as each conductor, then issues 30 GET probes and derives
  `allowed | forbidden | violation | no answer` from status, typed code and body shape (never from prose); the absent-control body must be byte-equal for foreign probes.

Start one by hand: `node -e "require('./capability/C010/server.cjs').startLocal().then((l) => console.log(l.origin, JSON.stringify(l.tokens)))"` (tokens are fresh each start).

## Commands (repository root `C:\Users\chhage\repos\app-scaling-strategies`, Node v22.23.4)

| What | Command |
| --- | --- |
| Whole suite (GREEN) | `node --test --test-concurrency=3 --test-timeout=170000 capability\C010\tests\*.test.cjs` |
| RED replay against the naive stub (exit 1) | the arguments of `evidence\red\red-01-ownership-behavior.json` with `C010_SUBJECT_DIR=capability\C010\evidence\red\stub` |
| The same command on the real code (exit 0) | the same arguments without `C010_SUBJECT_DIR` (`evidence\green\green-01-ownership-behavior.json`) |
| Per-file coverage gate 85/85/85 | `node capability\C010\tests\coverage.cjs` (one `--experimental-test-coverage` command per production file) |
| Mutation run | `node capability\C010\tests\mutate-gen.cjs --scratch <dir outside the repository> --out <new report.json> [--workers N] [--only <file>]`; `--finalize` builds the report of a run stopped on purpose |
| Edge observation (heavy slot first) | `node capability\C010\tests\browser.cjs` |
| Imports verification | `node --test capability\C010\tests\imports.test.cjs` |
| Evidence integrity | `node --test capability\C010\tests\evidence.test.cjs` |

Evidence is recorded with the run folder's `archive-run.cjs` from the repository root (raw stdout/stderr as gzip, SHA-256 of every transcript and input, exit code, Node version);
`evidence\.gitattributes` keeps the transcripts byte-exact.

## Evidence

| Run | Result | Manifest |
| --- | --- | --- |
| RED, ten behavioral files against the naive stub | exit 1, 83 tests, 18 pass, 65 fail on assertions (a foreign read answers 200 instead of the uniform 404, lists show every lease, ...) | `evidence\red\red-01-ownership-behavior.json` |
| GREEN, the same command on the real code | exit 0, 83 tests, 83 pass | `evidence\green\green-01-ownership-behavior.json` |
| GREEN, the whole suite (26 files, before the pending-first flood file existed) | exit 0, 148 tests, 148 pass | `evidence\green\green-02-whole-suite.json` |
| GREEN, the pending-first-request flood (rev-C017 F24), a child server with a 48 MB heap, one held mutation per socket, up to 50 000 pipelined requests on 3 sockets | exit 0, 1 test: child alive, heap bounded, every socket closed by the server, no connection left, a legitimate GET answered | `evidence\green\green-03-pending-first-flood.json` |
| Per-file coverage gate (one command per production file, floors 85/85/85) | exit 0; lines/branches/functions: `audit.cjs` 100/100/100, `codes.cjs` 100/100/100, `contract.js` 100/100/100, `page.js` 100/97.94/100, `server.cjs` 100/97.42/100, `store.cjs` 100/100/100 | `evidence\coverage\coverage-01-per-file.json` |
| Real isolated Edge (heavy slot held) | exit 0: Edge 156.0.4314.58 (Microsoft-signed), 30 probe rows derived from status, code and shape, no foreign resource reachable, two conductors with the same token and a forged visitor token shown as violations, keyboard operation, no page error, GET only | `evidence\browser\browser-01-edge.json` |
| Mutation (a run that was stopped on purpose, NOT complete) | 178 of 807 generated mutants executed (`store` 35, `server` 51, `contract` 41, `audit` 1, `codes` 8, `page` 42), 153 killed by a named failing test, 25 survived, 629 not executed. The unmutated control passed the `unit`, `core`, `rest` and `page` stages and FAILED the `late` stage (the quick matrix filter selected no cell for the quota, timeout and closed configs; fixed in `tests\matrix-suite.cjs` afterwards, not rerun), so the 12 kills made only in that stage are discarded and counted as survivors; the other 13 survivors are `page.js` conditions of the id-learning step. No survivor is claimed equivalent. | `evidence\mutation\mutation-01.report.json`, `mutation-01.results.jsonl` |

## What the tests prove (scenario to file)

`C010.feature` is the specification; the files map to it: `idor`, `uniform`, `lists`, `anonymous`, `hostile-paths`, `hostile-fields`, `batch`, `operator`, `commit`, `quota` (behavior over real
loopback sockets, every verb and kind, both directions), `store`, `contract`, `audit`, `server-units` (units), `property` (seeded random operation sequences at the store and over HTTP, the global
invariant checked after every step), `oracle` (counted work plus a cross-process timing ratio against a naive control: a foreign target costs what an absent one costs), `page` (DOM stub replaying
real transcripts), `imports` (pins, tamper cases), `flood` (a refusal flood from another process: every socket closed, a neighbour on a kept-alive connection still served, a naive keep-alive control
fails by name), `pipeline-inproc-a/b/c` and `pipeline-process-a/b/c` (the refusal matrix below) and `evidence` (recomputes every archive).

**Refusal matrix.** One row per typed code (32 codes) plus variants (a POST with a body and `Expect: nonsense`, CONNECT); every row runs in the test process and in a separate server process, HTTP/1.1 and
the HTTP/1.0 framings, in the shapes `R M7`, `M6 R M7`, `G G R M7`, `G G G R`, `G G R G`, `M6 G R`, `R | M7`, `G R | M7` (`R` refusal, `M` a valid mutation, `G` a legitimate GET): the earlier requests are answered in order,
the typed refusal follows, the connection is closed and destroyed, and nothing behind the refusal runs (state compared before and after). This includes the third pipelining hole of rev-C059: two and three
legitimate requests before a refusal that Node itself decides at parse time (`Expect: nonsense`, 417). I also probed C009's real server with the same shapes (`[G][X]`, `[G G][X]`, `[G G G][X]`, `[G G X G]`, an `Expect: nonsense` POST with a body, 128 sockets of `[G G X]`):
all answered in order with the typed 417 and closed, so no C009 reproduction is needed.

## Honest limits

- **In memory only**: no persistence, no restart story; ids, leases and tokens are per process.
- **Speculative C009 pin** (above): re-pin if C009 changes.
- **Lane depth**: C009's lanes cut a client with more than 4 requests in flight, so the shapes hold at most 4 requests; a deeper pipeline is cut by C009's lane and is not a C010 behavior.
- **HTTP/1.0** framings run only for the subset of rows where `Expect`/framing is meaningful (`V10` rows); `Expect` is ignored by HTTP/1.0 clients.
- **Windows resets**: for shapes the lane cuts, `HEADERS_TOO_LARGE` and `REQUEST_TIMEOUT` a reset may discard answers that were already written, so those cells use a subsequence rule (the answers that arrive are in order, the connection ends) instead of an exact list.
- **Browser**: the shared helper allows only GET and HEAD, so Edge observes allowed/forbidden through GET; every POST, PATCH and DELETE outcome is proved over sockets in Node.
- **Timing depends on load**: the suite was built and measured on a machine shared with about nine CPU-bound processes of another agent (a 6-15x slowdown); the tests assert structure and counted work, not seconds, except the 2 s window that shows a naive keep-alive server never closing.
- **Coverage** is measured for the in-process suites; the process-spawning suites (`pipeline-process`, `flood`, `imports`) cannot report coverage of the child and are covered by their in-process twins.
- **Mutation** is a partial sample (178 of 807 generated mutants, table above): the 25 survivors and the 629 not executed are reported, nothing is claimed for them; the `late` stage control failed in that run, so its kills were discarded.
- **A mutation that is already running when the lane cuts its connection still commits** (its answer is lost; the requests queued behind it or sent later are dropped and the socket is destroyed at the first request beyond the depth of 4,
  so a pending first request cannot make the parser queue requests without backpressure: `tests\flood-pending.test.cjs`). `isFinished` (C009) marks refused sockets only; if a destroyed socket must also stop a running mutation,
  add `|| request.socket.destroyed` at the two `isFinished` checks of `server.cjs` (a decision for the reviewer; not done here).
- C009's `X-C009-Scope` response header appears on C010 answers because the responder is C009's.

## Layout

`contract.js codes.cjs audit.cjs store.cjs server.cjs page.js index.html style.css` (production), `imports.json` (pins), `C010.feature` (spec), `tests\` (suites and helpers: `helpers rows matrix matrix-suite
targets child-server attacker raw-http dom-stub imports-check coverage mutate-gen browser`), `evidence\` (red with its stub, green, coverage, mutation, browser).
