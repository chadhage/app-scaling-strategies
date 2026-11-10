# C010 - lease ownership on every resource target

A local, synthetic H003 fixture (class D): every route that names a target of any kind decides **ownership on the server**, deny by default,
and decides it **again where the effect is committed**. Another conductor's lease, runs, scratch resources and exports stay inaccessible, and a
foreign target is indistinguishable from an absent one. It is **not** the approved Node 24 / Express / Entra control API and not an identity service:
no Entra, no cloud, no registration, no spend; all data is synthetic and the server listens on `127.0.0.1` only.

This **U057 maintenance amendment** retains the accepted C010 fix, commit `e22b94da118bfe7f62fc8849b783adf14c36ae9d`, tag `kanban/C010/e22b94da118b`.
That fix followed the rejected first publication (`3f219a81af4f`, tag `kanban/C010/3f219a81af4f`). Every earlier capture and seal remains immutable.
The historical figures below describe their original subjects; the separate U057 block describes the measured maintenance campaign. This earns no additional Kano credit.

## Built on C009 (read-only import, pinned)

The four fake identities (`visitor`, `conductor-a`, `conductor-b`, `operator`), the opaque bearer tokens, the deny-by-default role table, the
request lanes and the refusal path (`authz.cjs`, `codes.cjs`, `contract.js`, `http-io.cjs`, `queue.cjs`) are imported **unchanged** from `capability\C009`
and pinned in `imports.json` by commit `f95cc52a29cf643fd443b80e5c0b112556feb548` and tag `kanban/C009/f95cc52a29cf` (raw, git and LF SHA-256 of each file, git object id;
`tests\imports.test.cjs` recomputes them against git objects). C009 has since been **accepted** at commit `0da3ff6eea40`; its five production files there have the same
git object ids as the pinned ones, so no pin changed (check: `git rev-parse 0da3ff6eea40:capability/C009/http-io.cjs` equals the `oid` of that file in `imports.json`, for each of the five files;
a test would have to read repository history, so this is a command and not a test). The C009 README states that `admit.refuse` takes an option that the code does not have; C010 follows the code
(`http-io.cjs`, `authz.cjs`), never that line. A scratch tree without `.git` needs `C010_GIT_REPOSITORY=<repository>` to run `imports.test.cjs` (git objects are read from there).

## Where ownership is decided

- `store.cjs` is the **only** place that decides who owns what (`pick`: a constant-work full pass, so a foreign and an absent target cost the same, counted by `visited`).
- `server.cjs` is wiring: ONE `route()` (guard, URL, route, credential, role, query, body, targets) and ONE `refuse()`. A mutation is decided before its body is read (the owner of every
  target of the URL, and of every operation of a batch, before the queue) and again inside the linearized commit: the token is verified again, every target is resolved again inside the store,
  and a connection that was refused or ended while the request waited ends it with **no effect, no audit record and no answer** (`hooks.beforeCommit` lets a test change the world while a request waits).
  The role is decided once: it belongs to the token entry, which never changes after issue (a second decision at the commit could not differ and was removed).
- `contract.js` holds the closed route table, the role table, the id/name shapes, the query vocabulary (`limit`, `offset`, `sort`, `q`) and the body schemas.
- Foreign, absent, ended, expired and malformed-id targets all answer the byte-identical `404 TARGET_NOT_FOUND`; there is no ETag and no global counter; lists, counts, pages,
  searches and sorts show only the caller's items; a body, query or header that names an owner, lease, subject, role or server field is refused or reported by name in `ignoredClaims`.
- The operator reads only lease metadata (id, owner, expiry, counts) and the audit view, and each read is itself audited. There is no public state route.
- `page.js` / `index.html` / `style.css`: an inspection page. It learns the ids by listing as each conductor, then issues GET probes and derives
  `allowed | forbidden | violation | no answer` from status, typed code and body shape (never from prose); the absent-control body must be byte-equal for foreign probes.

Start one by hand: `node -e "require('./capability/C010/server.cjs').startLocal().then((l) => console.log(l.origin, JSON.stringify(l.tokens)))"` (tokens are fresh each start).

## The fix of the review, finding by finding

| Finding | What was wrong | Test that fails on the old bytes (and the mutant it kills) |
| --- | --- | --- |
| M1 | the batch ownership decision before the queue (`server.cjs`) could be deleted and every test stayed green | `tests\commit.test.cjs` "a batch that names a foreign target ...": a counter in `hooks.beforeCommit` proves a foreign batch never reaches the commit gate and an own batch reaches it once (`batch-first-decision-dropped`) |
| M2 | `tests\flood.test.cjs` read its final observation right after the neighbour's last request and failed under load | the final reading of the child is the one in which a bounded poll shows no connection (`tests\flood.test.cjs`, `tests\flood-pending.test.cjs`); the load loop of the evidence (`tests\loop.cjs`: `flood`, `flood-pending`, `oracle` and `pipeline-process-a/b/c`, 20 rounds, 4 at a time, under 4 CPU burners) is the figure `loop` of the block below |
| m1, m5 | the two `isFinished` guards had no test; a mutation whose connection the lane cut still committed | `server.cjs` `cancelled()` = refused (C009 mark) OR `socket.destroyed`; `tests\commit.test.cjs` four cases (marked at the commit gate, client gone while held, cut by the lane in one write, marked while the body arrives) plus a control; `flood-pending` asserts that no held mutation of a cut connection committed |
| m2 | deleting a run could delete the exports of other runs; a patch could rewrite the lease | `tests\store.test.cjs` two tests (`delete-run-cascade-all-exports`, `delete-no-cascade-owner-scope`, `update-applies-patch-to-lease`) |
| m3 | the local user name in this README | `<REPO>` placeholders; `tests\evidence.test.cjs` scans every file of the namespace for a user-profile path and a session folder (the sealed transcript of the first RED is the one known exception) |
| m4 | a false README figure, a changed test and a changed manifest field passed the evidence test | `tests\seal.cjs` + `tests\evidence-verify.cjs` + `tests\evidence-figures.cjs` + `tests\evidence.test.cjs`: see "Evidence mechanism" |
| m6 | the commit repeated the role decision and re-read the subject from the token, which cannot differ | removed; the real commit-time protections (the token verification and the store's owner check) stay and are killed by `commit.test.cjs` |
| m7 | the accepted fix left a declared mutation gap | U057 decides every original position and the explicitly enumerated extension; see the measured U057 block. The 66 targeted guard mutants remain historical evidence on their original subjects, not a new run. |
| m8 | the timing oracle is inconclusive by measurement | excluded by construction: the store does identical counted work for a foreign, an expired and an absent target (`oracle.test.cjs`, `store.test.cjs`); no new ratio test with a band was added |

## Commands (repository root `<REPO>`, Node v22.23.4)

| What | Command |
| --- | --- |
| Whole suite (GREEN) | `node --test --test-concurrency=3 --test-timeout=170000 capability\C010\tests\*.test.cjs` |
| RED replay against the naive stub (exit 1) | the arguments of `evidence\red\red-03-ownership-behavior.json` (the test files are named through a drive `K:` that is `subst`-mapped to `<REPO>`, so that failure traces carry no profile path; the same files by their repository-relative paths give the same result) with `C010_SUBJECT_DIR=K:\capability\C010\evidence\red\stub` (or `capability\C010\evidence\red\stub` from the root) |
| The same command on the real code (exit 0) | the same arguments without `C010_SUBJECT_DIR` (`evidence\green\green-04-ownership-behavior.json`) |
| Per-file coverage gate 85/85/85 | `node capability\C010\tests\coverage.cjs` (one `--experimental-test-coverage` command per production file) |
| Systematic mutation campaign | `node capability\C010\tests\mutate-gen.cjs --scratch <dir outside the repository> --out <report.json> [--workers 2] [--only <file>] [--first <file>]`; `--retest --extra-tests a,b` re-runs the survivors against test files added since; `--finalize` builds the report from the incremental files; `C010_MUTATION_PRIORITY=normal` keeps normal priority |
| The 66 guard mutants | `node capability\C010\tests\guard-mutants.cjs --scratch <dir outside the repository> --out <new report.json>` (`--check` verifies every pattern, `--list` names them) |
| Load loop | `node capability\C010\tests\loop.cjs --out <new json> --files <a.test.cjs,b.test.cjs> --rounds 20 --parallel 4 --burners 4` (the burners are started and stopped by recorded PID) |
| Fresh checkout (LF and CRLF) | `node capability\C010\tests\fresh.cjs --mode lf --tree <dir outside the repository> --out <new json> --without-evidence` (and `--mode crlf`; `--only evidence.test.cjs` on the sealed tree) |
| Edge observation (heavy slot first) | `node capability\C010\tests\browser.cjs` |
| Seal (last, once) | `node capability\C010\tests\seal.cjs` |
| Imports verification | `node --test capability\C010\tests\imports.test.cjs` |
| Evidence integrity | `node --test capability\C010\tests\evidence.test.cjs` |

Evidence is recorded with the run folder's `archive-run.cjs` from the repository root (raw stdout/stderr as gzip, SHA-256 of every transcript and input, exit code, Node version);
`evidence\.gitattributes` keeps the transcripts byte-exact. Scratch folders for the campaigns and the fresh trees are short neutral paths outside the repository.

## Historical accepted-fix evidence

This block is retained history, not the current U057 result. The original verifier recomputes it against the exact original subjects archived under
`evidence\u057\original\capability\C010`; the current checker also verifies the append-only amendment and its separate current evidence.

<!-- figures:begin -->
```json
{
 "red": {
  "tests": 89,
  "pass": 19,
  "fail": 70
 },
 "replay": {
  "tests": 89,
  "pass": 89,
  "fail": 0
 },
 "suite": {
  "files": 35,
  "tests": 187,
  "pass": 187,
  "fail": 0
 },
 "coverage": {
  "audit.cjs": [
   100,
   100,
   100
  ],
  "codes.cjs": [
   100,
   100,
   100
  ],
  "contract.js": [
   100,
   100,
   100
  ],
  "page.js": [
   100,
   100,
   100
  ],
  "server.cjs": [
   100,
   99.39,
   100
  ],
  "store.cjs": [
   100,
   100,
   100
  ]
 },
 "edge": "156.0.4314.58",
 "mutation": {
  "status": "UNCAPTURED",
  "reason": "The systematic campaign was stopped on the time budget of the fix; the mutants at the end of its queue were never executed. Every executed mutant is killed by a named test or listed as equivalent with its proof, none is undecided.",
  "generated": 806,
  "executed": 722,
  "killed": 705,
  "killedByRetest": 39,
  "equivalent": 17,
  "survived": 0,
  "undecided": 0,
  "notExecuted": 84,
  "perFile": {
   "store.cjs": 159,
   "server.cjs": 227,
   "contract.js": 186,
   "audit.cjs": 8,
   "codes.cjs": 36,
   "page.js": 190
  }
 },
 "guardMutants": {
  "total": 66,
  "killed": 66
 },
 "perFile": {
  "files": 35,
  "passed": 35,
  "slowestFile": "page-learning.test.cjs",
  "slowestMs": 13711
 },
 "loop": {
  "files": 6,
  "runsPerFile": 20,
  "burners": 4,
  "parallel": 4,
  "passed": 120,
  "runs": 120,
  "slowestFile": "oracle.test.cjs",
  "slowestMs": 30987,
  "overCap": 0
 },
 "fresh": {
  "lf": {
   "files": 35,
   "tests": 187,
   "pass": 187
  },
  "crlf": {
   "files": 35,
   "tests": 187,
   "pass": 187
  }
 }
}
```
<!-- figures:end -->

| Capture | Manifest or report |
| --- | --- |
| RED, the ten behavioral files against the retained naive stub (assertions about the specified behavior fail); taken through a neutral drive so that no stack-trace path names the machine's profile | `evidence\red\red-03-ownership-behavior.json` |
| GREEN, the same command on the real code (the RED replayed unchanged) | `evidence\green\green-04-ownership-behavior.json` |
| GREEN, the whole suite but the evidence test (which verifies this archive) | `evidence\green\green-05-whole-suite.json` |
| Per-file coverage gate, one command per production file | `evidence\coverage\coverage-02-per-file.json` |
| Real isolated Edge | `evidence\browser\browser-02-edge.json` |
| Systematic mutation campaign (raw results, start record, controls, retests next to the report; stopped on the time budget, see "Honest limits" and the `UNCAPTURED` line of the block) | `evidence\mutation\mutation-02.report.json` |
| The guard mutants of the review | `evidence\mutation\guard-01.report.json` |
| Every test file alone, one after another (per-file times against the 60 s cap) | `evidence\loop\perfile-01.json` |
| The load loop: the process-spawning files under CPU burners that the loop started | `evidence\loop\loop-01.json` |
| Fresh trees built from the bytes of the namespace and git blobs of the imports, in LF and in CRLF | `evidence\fresh\fresh-lf-01.json`, `evidence\fresh\fresh-crlf-01.json` |
| The original declared gap (retained byte-exact; superseded only after the actual campaign completed) | `evidence\u057\original\capability\C010\evidence\uncaptured.json` |
| The seal over the final bytes (written last) | `evidence\seal.json` |

**Retained captures of the first publication** (not re-pinned, kept exactly as archived; they pin the bytes of that time and are no evidence for this tree): `red\red-01-ownership-behavior.json`,
`green\green-01-ownership-behavior.json`, `green\green-02-whole-suite.json`, `green\green-03-pending-first-flood.json`, `coverage\coverage-01-per-file.json`, `browser\browser-01-edge.json`,
`mutation\mutation-01.report.json` (a partial run) and `red\stub\server.cjs` (the naive stub both REDs ran against).

### Evidence mechanism

- Original manifests and `seal.json` are checked against their exact archived subjects, never repinned to new source bytes. Their raw streams, reports and seal are not rewritten.
- `evidence\u057\amendment-1.json` names every exact predecessor and replacement, pins every added file, and is anchored by `evidence\u057\head.sha256`.
  The original `imports.json` remains the unchanged C009 authority. Current captures pin their actual execution subjects; raw final subjects and LF digests are both retained.
- The checker reads the meaning as well as hashes: genuine named assertion REDs and unchanged GREEN commands, the actual default timeout/audit observations, the entire generator-owned position set,
  named kills with green controls, unchanged equivalence proofs, individual loaded-file coverage floors, and LF/CRLF results. Tamper controls reject false counts, sources, inputs, streams and authority.
- Not detectable here: a consistent rewrite of a capture together with its inputs and the seal. The published commit and tag are the anchor.

## What the tests prove (scenario to file)

`C010.feature` is the specification; the files map to it: `idor`, `uniform`, `lists`, `anonymous`, `hostile-paths`, `hostile-fields`, `batch`, `operator`, `commit` (the second decision, the batch before the queue,
the connection that ended while its mutation waited), `quota` (behavior over real loopback sockets, every verb and kind, both directions), `store`, `contract`, `audit`, `server-units` (units), `property` (seeded random
operation sequences at the store and over HTTP, the global invariant checked after every step), `oracle` (counted work plus a cross-process timing ratio against a naive control: a foreign target costs what an absent one costs),
`page` and `page-learning` (DOM stub replaying real transcripts and forged answers: every check of the learning step and of a row), `imports` (pins, tamper cases), `flood` (a refusal flood from another process: every socket closed,
a neighbour on a kept-alive connection still served, a naive keep-alive control fails by name), `flood-pending` (a pending first request with pipelined blocks behind it in a small-heap child),
`pipeline-inproc-a/b/c` and `pipeline-process-a/b/c` (the refusal matrix below), `two-instances` (two live instances in one process closed first-opened-first and last-opened-first, a repeated close, an untouched neighbour that keeps its
connection, state, audit log and tokens) and `evidence` (recomputes every archive). The files `guard-host`, `guard-requests`, `guard-boundaries`, `guard-server`, `guard-close`, `store-order`
and `store-revisions` were written after the first pass of the mutation campaign, one per group of survivors it listed (the Host guard, the shape of the request target, public routes, batch verbs, expiry at the exact
millisecond, the limits wired into Node, the fail-closed read stop, the audit of what Node refuses by itself, the revision counters, the order of equal names); the campaign re-ran every survivor against them (`--retest`).

**Refusal matrix.** One row per typed code plus variants (a POST with a body and `Expect: nonsense`, CONNECT); every row runs in the test process and in a separate server process, HTTP/1.1 and
the HTTP/1.0 framings, in the shapes `R M7`, `M6 R M7`, `G G R M7`, `G G G R`, `G G R G`, `M6 G R`, `R | M7`, `G R | M7` (`R` refusal, `M` a valid mutation, `G` a legitimate GET): the earlier requests are answered in order,
the typed refusal follows, the connection is closed and destroyed, and nothing behind the refusal runs (state compared before and after). This includes the third pipelining hole of rev-C059: two and three
legitimate requests before a refusal that Node itself decides at parse time (`Expect: nonsense`, 417). C009's real server was probed with the same shapes (`[G][X]`, `[G G][X]`, `[G G G][X]`, `[G G X G]`, an `Expect: nonsense` POST with a body, 128 sockets of `[G G X]`):
all answered in order with the typed 417 and closed, so no C009 reproduction is needed.

## Honest limits

- **In memory only**: no persistence, no restart story; ids, leases and tokens are per process.
- **Lane depth**: C009's lanes cut a client with more than four requests in flight, so the shapes hold at most four requests; a deeper pipeline is cut by C009's lane and is not a C010 behavior.
- **A cut or departed client loses its mutation** (the safe semantic, tested): an authorized mutation whose client left, or whose connection the lane cut, is not committed and not answered, so a retry cannot create a duplicate of an
  own resource; a legitimate client that pipelines more than the depth loses the mutation that was running when it was cut.
- **HTTP/1.0** framings run only for the subset of rows where `Expect`/framing is meaningful; `Expect` is ignored by HTTP/1.0 clients. h2c, keep-alive negotiation beyond what the matrix sends and real signals were not probed.
- **Windows resets**: for shapes the lane cuts, `HEADERS_TOO_LARGE` and `REQUEST_TIMEOUT` a reset may discard answers that were already written, so those cells use a subsequence rule (the answers that arrive are in order, the connection ends) instead of an exact list.
- **Browser**: the shared helper allows only GET and HEAD, so Edge observes allowed/forbidden through GET; every POST, PATCH and DELETE outcome is proved over sockets in Node.
- **Timing depends on load**: the tests assert structure, counts and ratios against a control measured in the same run, never seconds; the cross-process oracle test compares medians against a naive control with wide bands, and its result under load is in the loop figures.
  A foreign-versus-absent timing difference was measured as inconclusive by the reviewer and is excluded by construction (identical counted store work), not by a timing band.
- **Coverage** is measured for the in-process suites; the process-spawning suites (`pipeline-process`, `flood`, `flood-pending`, `oracle`, `imports`) cannot report coverage of the child and are covered by their in-process twins.
- **Mutation** covers the six production files by a generator over every condition, operand, comparison, negation, call statement, return, code string, compared literal and number; HTML and CSS are not mutated, and the mutants of `page.js` display wording are decided by the DOM-stub tests, not by a real browser.
- **Historical mutation gap:** the accepted fix stopped with unexecuted positions. Its original declaration, partial report, inputs and raw evidence remain preserved.
  U057 separately completes the original set and its explicit extension; only the current declaration's mutation entry is removed, after actual completion. Earlier partial, uncaught, timed-out and mistaken-fixture attempts remain unqualified history.
- **Default timeouts:** actual server readback is idle 10000, header/request 5000 and checking interval 1000 ms. One real stalled-header and one 100-byte-declared/13-byte-sent body probe each require typed 408 `REQUEST_TIMEOUT` and one `OTHER/refused/REQUEST_TIMEOUT` audit.
  Polling is bounded; no assertion claims an exact duration. Inconsistent caller overrides can still preempt a typed timeout and are not qualified by the default-limit tests.
- **Browser and load scope:** no new browser or load-loop qualification is claimed here. The page and imported production bytes are unchanged; earlier Edge and timing captures retain only their historical scope.
- **C009:** the separate owned-loopback diagnostic uses C009's own accepted defaults and records its actual response, audit and cleanup. It does not change C009 or repin its authority; any C009 follow-up is parent-owned.
- **Local identifiers**: the sealed transcript of the first publication's RED (`evidence\red\raw\red-01-ownership-behavior.stdout.raw.gz`) carries stack-trace paths with the user name of the machine it ran on; sealed evidence cannot be scrubbed without breaking its pins.
  Every file added or changed by the fix uses `<REPO>`-style placeholders and neutral scratch paths (a test scans for the rest).
- C009's `X-C009-Scope` response header appears on C010 answers because the responder is C009's.
- A consistent rewrite of a capture together with its pinned inputs and the seal is not detectable by the tests; the anchor is the published commit and tag.

## U057 measured maintenance result

The **806 original positions** are all decided: 789 named kills and **17 equivalents**, with the original proof bytes retained.
The actual generator owns **810 generated positions**: four additional positions are the idle multiplier's two numeric mutations and the cancelled-read guard's two conditions.
`tests\evidence.test.cjs` executes the generator's own `--list` and compares its total, rather than trusting a copied count. Every kill has a named behavioral failure and a green control; none is a timeout or file-level failure.

<!-- u057:begin -->
```json
{
 "originalPositions": 806,
 "generated": 810,
 "executed": 810,
 "killed": 793,
 "equivalents": 17,
 "survived": 0,
 "undecided": 0,
 "notExecuted": 0,
 "limits": {
  "idleMs": 10000,
  "headerMs": 5000,
  "requestMs": 5000,
  "checkMs": 1000
 },
 "kanoCredit": 0
}
```
<!-- u057:end -->

`U057.feature` is the behavior specification. `u057-boundaries` proves actual default owner entries 100/101, target characters 2048/2049, both run schemas at 100/101,
actual visited counts, header names versus values, and automatic local ports. `commit` holds a genuinely authorized mutation at its real commit gate, observes its cut socket,
expires its token with the injected clock, then releases the gate and requires no effect, answer or audit. `u057-defaults` supplies the two real default-limit probes.

An idle-only correction exposed a duplicate `INTERNAL_ERROR` audit after a typed body timeout. The cancelled-read guard removes it without changing AuthError handling:
the guard is in the AuthError handler's ELSE branch. A controlled token-clock cancellation first broke, then re-proved, the original inner/outer AuthError equivalence.
Startup events, synchronous listener/close-call counts and a real-socket CONNECT handler assertion decide formerly uncaught or waiting fixtures by named assertions, not by accepting a timeout.

Current evidence is selected by the amendment's `finalPhase`: the complete report is `evidence\u057\campaign-04\mutation-03.report.json`, with original incremental records,
raw per-run streams, controls, retests and the full position-extension proof. Final captures include the actual `--list`, `--retest`, `--finalize`, full non-evidence suite,
unchanged default/commit replays, individual coverage commands, the C009 diagnostic, LF/CRLF runs, a final-source cancellation-order re-kill and paired original-equivalence witnesses.
Read-only post-seal full-suite and LF/CRLF checks, including this evidence checker, are retained in the private worker result; they never append files to a sealed public namespace.

Verification is read-only: `node --test --test-concurrency=3 --test-timeout=170000 capability\C010\tests\*.test.cjs`.
For a new campaign use a NEW owned scratch/report/raw directory and one worker:
`node capability\C010\tests\mutate-gen.cjs --scratch <OWNED_SCRATCH> --out <NEW_REPORT> --raw-dir <NEW_RAW> --workers 1`,
then `--retest --extra-tests u057-connect,u057-start-local,u057-startup,u057-shutdown,guard-boundaries,guard-host,guard-requests,guard-server,store-order,store-revisions,two-instances,guard-close,u057-boundaries,u057-defaults,u057-limits,u057-auth-error`,
and `--finalize`. Never record over retained reports, streams or seals. Coverage remains EACH-file 85/85/85 with unloaded files counted as zero; this is synthetic Node 22 tooling, not production Node 24, Entra, Azure or spending qualification.

## Layout

`contract.js codes.cjs audit.cjs store.cjs server.cjs page.js index.html style.css` (production), `imports.json` (pins), `C010.feature` (spec), `tests\` (suites and helpers: `helpers rows matrix matrix-suite
targets child-server attacker raw-http dom-stub imports-check coverage mutate-gen guard-mutants mutants-equivalent loop fresh seal evidence-pins evidence-io evidence-verify evidence-figures browser`), `evidence\` (red with its stub, green, coverage, mutation, loop, fresh, browser, the seal).
