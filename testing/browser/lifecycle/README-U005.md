# U005: bound the browser startup (one deadline, owned-tree cleanup, typed error)

Local test tooling for Windows (no Azure, no network, no packages, zero credit). The sealed helper `testing\browser\isolated.cjs` bounds only the launch and the first
navigation (15000 ms each); `newContext()`, `newPage()` and the whole open have no deadline, and a session that resolves after anybody gave up is never closed. U005 wraps
`openIsolatedLesson` and `openIsolatedLoopback` in ONE injected deadline. On expiry it ends only the process tree the open itself started, by recorded identity (pid plus
creation time), never by image name or marker, and rejects with a typed error. U006 builds the bounded `close()` on the `session.owned` handle that this item returns.

New files only (namespace `testing\browser\lifecycle`; no existing file was edited; `tree.cjs` and `windows.cjs` of U004 are consumed unchanged):

| File | Role |
| --- | --- |
| `U005.feature` | the specification, written first |
| `owned.cjs` | production: the hardened composition of `tree.cjs` and `windows.cjs` (guarded adapters, `snapshotOwned`, `OwnedTree`) that enforces the U004 findings |
| `startup.cjs` | production: `startBounded`, `openLessonBounded`, `openLoopbackBounded`, `StartupError`, the per-process lock |
| `tests\u005-*.test.cjs` | hermetic tests (virtual clock, fake operating system and fake opener, no wall clock), the evidence integrity test, the real-Edge test |
| `tests\u005-support-*.cjs`, `tests\u005-real-watch.cjs`, `tests\u005-mutate.cjs`, `tests\u005-mutants-*.cjs` | test tooling: fake world, impl loader, evidence verifier, independent watcher, mutation tool and its 76 mutants |
| `evidence\u005\` | one NEW directory per archived run (immutable): the final runs `red-7..9`, `green-4..7`, `mutation-3`, `real-4`, the history runs `red-1..6`, `green-1..3`, `mutation-1..2`, `real-1..3`, `specimen\naive-impl.cjs.txt` |

## How a startup runs

1. `startBounded(run, options)` validates every duration (`ERR_INVALID_ARG`, timers capped at 2147483647 ms), then takes the **per-process lock** (a promise chain stored under a
   `Symbol.for` key on `globalThis`): two startups in one process never overlap, so "a new direct child of the caller" is never ambiguous. A queued caller waits for the holder
   (success or failure: at once; after an expiry: until the watch below ended, at most `graceMs` plus the sweeps). The deadline starts when the lock is taken.
2. **Baseline:** one fresh process table; the direct children of the caller that already exist (and the table helper itself) are never new roots. An unreadable table fails the call
   with `ERR_STARTUP_BASELINE` before anything is launched.
3. `run()` (the sealed opener) starts. The call races the open against the deadline timer (an injected clock), an optional `AbortSignal` and the open itself.
4. **Open resolved:** a fresh table, every new direct child of the caller is recorded with its descendants (`snapshotOwned`, identity = pid + creation time), the session is returned as
   `{ ...session, owned }`. No new child, or an unreadable table: the session is closed and the call rejects with `ERR_STARTUP_UNOWNED` (never an unowned session).
5. **Open rejected:** the same sweep; a clean sweep rethrows the original error unchanged, leftovers or an unverifiable table give `ERR_STARTUP_FAILED` (cause = the original).
6. **Expired or aborted** (`ERR_STARTUP_DEADLINE`, `ERR_STARTUP_ABORTED`): the owned tree is ended now (`OwnedTree.terminate`: fresh table, identity-verified kill through the U004 core, repeated at
   most four times while a recorded process stays listed, confirming fresh table) and the call rejects **with that report**. The sealed promise keeps running, so the module keeps **watching** it for at most `graceMs`: every `pollMs`
   it sweeps again (a child that appears late is found by identity and ended), and when the open settles a late session is closed (bounded) and a final sweep runs. The outcome
   of the watch is `error.settled` (a promise that never rejects, resolves to the final report with `innerSettled`, `graceExpired`, `lateSession`, `lateCloseError`); the lock is
   released when it settles. After `graceMs` an open that never settled is abandoned: its late session is still closed (its own browser only) and the final report is not clean.

## API quick reference

    const { openLessonBounded, openLoopbackBounded, StartupError } = require('./startup.cjs');
    const session = await openLessonBounded('testing\\browser\\fixtures\\counter.html', { deadlineMs: 60000 });   // opener defaults to the sealed helper
    // session: { page, browserVersion, close (the sealed close, U006 bounds it), owned }  owned: OwnedTree
    //   owned.roots, owned.recorded(), owned.unverifiable, await owned.observe(), await owned.terminate({ timeoutMs, listMs }) -> report

Options: `deadlineMs` (required), `graceMs` (60000), `pollMs` (250), `terminateMs` (60000, also bounds the late session close), `listMs` (30000), `signal` (AbortSignal),
`clock` (`{ now, setTimeout, clearTimeout, sleep }`), `adapters` (guarded adapters, default `createOwnedAdapters()` over the Windows helper), `adapterOptions`, `lock`, `getPhase`
(the sealed opener reports no phase, so `phase` is `'unknown'` unless a probe is given), `opener`, `loadSealed`.

`StartupError` (`name 'StartupError'`, stable `code`): `deadlineMs`, `phase`, `watching`, `clean`, `settled`, and the report lists `confirmed`, `terminated`, `alreadyGone`, `refused`
(`{pid, createdAt, reason}`), `survivors`, `failed` (`ERR_KILL` per identity), `unverifiable` (`{pid, ppid, createdAt, reason, stillListed}`), `unconfirmed`, `errors`.
`clean` is true only when the confirming table shows nothing owned or unverifiable is left AND the open is settled (`watching` false). It is never success-shaped.

## The U004 findings, enforced at the composition level (`owned.cjs`; named test and mutant)

| Finding | Rule | Test | Mutants |
| --- | --- | --- | --- |
| F1 | an empty or truncated table fails closed (`ERR_TABLE_INCOMPLETE`) unless it holds the caller's own pid; the helper's own row is dropped | `F1: ...`, `helper rows` | O07 O08 O09 O31 O35 |
| F2 | a descendant with an unreadable creation time (and everything below it) is reported `unverifiable`, counted against `clean` while listed | `F2: ...`, `F2 at startup` | O13 O14 O19 O20 O23 |
| F3 | every adapter await is raced by a timer the core owns (list, kill, sleep, and the whole `terminateOwned`); never-settling adapters cannot hang | `F3: ...`, `F3 at startup` | O03 O04 O27 |
| F4 | `terminated` only after a confirming fresh table; a kill landing on the deadline is still unconfirmed | `F4: ...` | O21 O22 O25 O33 |
| F5 | `ownerPid` required and equal to the caller, system pids and the caller refused as roots, never forwarded as kill targets | `F5: ...` | O10 O11 O12 O15 O16 O17 O30 |
| F8 | the Windows adapters get `process.env` itself; a plain copy gets `SystemRoot` and `windir` added case-insensitively | `F8: ...` | O05 O06 |
| F9 | every timer is capped at 2147483647 ms, invalid values are `ERR_INVALID_ARG` | `F9: ...`, `F9 at startup` | O01 O02 O29 S01 S02 |
| F10 | limits stated below, children of a refused entry are never adopted | `F10 limit: ...`, `the children of a refused entry...` | O26 O34 |

`startup.cjs` guards (S03 to S38): the lock (taken, chained, released after success and after the watch), expiry, watch, late session, grace limit, unowned and failed opens,
baseline, abort, option wiring.

## Specification to test map (`U005.feature`)

| Scenario | Tests (file) |
| --- | --- |
| a startup inside the deadline returns the session and the owned tree | `a startup inside the deadline...` (flow) |
| expiry in launch, new context, new page, navigation | `expiry during <phase>...` (expiry, four tests) |
| expiry before any child, late child, late session | `expiry before any child exists...`, `a session that resolves late...`, `...close fails`, `...close never settles`, `...abandoned after the grace period` (expiry, more) |
| look-alike and owner's browser survive | the four phase tests (same image outside the tree and a same-image child that existed before the open) |
| survivors never success-shaped | `a browser that cannot be ended...`, `an access-denied...` (expiry) |
| kill confirmed by a fresh table | `F4: ...` (owned, owned-more, expiry) |
| adapter that never settles | `F3: ...` (owned, owned-more, expiry) |
| empty or truncated table, unreadable descendant, foreign roots and system pids, pid reuse | `F1...`, `F2...`, `F5...`, `pid reuse...` (owned, expiry) |
| timers capped, deadlines validated | `F9...` (owned, flow) |
| `process.env` and a plain copy | `F8...` (owned) |
| two concurrent startups, a call after a timeout | `two concurrent startups...`, `the default lock...` (flow) |
| abort signal | `an abort signal...`, `a signal that is already aborted...`, `an abort after the session...` (more) |
| failed or unowned opens, unreadable baseline | flow tests |
| a real headless Edge ended by a forced expiry | `u005-real.test.cjs` (real) |

## Exact commands (repository root, PowerShell, Node 22, no network)

Hermetic suite (72 tests, about 8 s):

    node --test --test-concurrency=1 --test-timeout=20000 testing\browser\lifecycle\tests\u005-owned.test.cjs testing\browser\lifecycle\tests\u005-owned-more.test.cjs testing\browser\lifecycle\tests\u005-startup-expiry.test.cjs testing\browser\lifecycle\tests\u005-startup-flow.test.cjs testing\browser\lifecycle\tests\u005-startup-more.test.cjs

Per-file 85/85/85 (L-0004, one command per production file; the same five test files):

    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/owned.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=20000 <the five test files>
    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/startup.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=20000 <the five test files>

RED replay (the same tests against the archived naive specimen; mode `race` only races the sealed open and leaves the tree and a late session, `name` ends browsers by image name,
`late` ends the tree once but never watches; the specimen can only reach the fake adapters of the tests, so no real process is ever involved):

    $env:U005_RED_IMPL = 'testing\browser\lifecycle\evidence\u005\specimen\naive-impl.cjs.txt'; $env:U005_NAIVE_MODE = 'race'   # or name, late
    node --test --test-concurrency=1 --test-timeout=20000 <the five test files>
    Remove-Item Env:\U005_RED_IMPL, Env:\U005_NAIVE_MODE

Mutation tool (76 mutants of `owned.cjs` and `startup.cjs` in a work directory, one change each, the production files are never touched; about 20 minutes, take a heavy slot):

    node testing\browser\lifecycle\tests\u005-mutate.cjs --work <new empty directory> --timeout-ms 60000

Evidence integrity (recomputes every archived run, pins the final runs to their input bytes, tamper tests):

    node --test --test-concurrency=1 testing\browser\lifecycle\tests\u005-evidence.test.cjs

Real isolated headless Edge (heavy slot first: `RUN\scripts\heavy-slot.ps1 -Action Acquire -Owner <ITEM>`, release in `finally`; about 6 minutes; needs a scratch directory):

    $env:U005_REAL_EDGE = '1'; $env:U005_SCRATCH = '<existing scratch directory>'
    node --test --test-concurrency=1 --test-timeout=2000000 testing\browser\lifecycle\tests\u005-real.test.cjs
    Remove-Item Env:\U005_REAL_EDGE, Env:\U005_SCRATCH

Whitespace: `git -c "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol" diff --check -- testing\browser\lifecycle` (new files: after staging, `diff --cached --check`).

## Limits (what this does not prove)

- **Ownership of a new root is a difference, not a proof of origin.** The browser root is "a direct child of the caller that was not there before the open". Any OTHER direct child
  the caller process itself starts while an open runs (or while the watch of an expired open runs) cannot be told apart and is recorded and ended (test `F10 limit: a process the
  caller itself starts...`). Start look-alikes BEFORE the open or from another process, and do not spawn children of the caller concurrently with a bounded startup. The test helper
  tooling follows this rule: the real test starts its look-alike before the open and watches from a separate process.
- **F10 (ppid is not authenticated):** a process whose parent id points INTO an owned tree and whose creation time is not earlier than that parent's IS adopted and ended (test `F10
  limit: a younger stranger...`); an older one, and one whose parent id points elsewhere, is never owned. The children of a REFUSED entry (a recorded pid that now belongs to a
  stranger) are never adopted (test `the children of a refused entry...`). Identity (pid plus creation time, verified on the handle that is terminated) proves "the same instance", not who made it.
- **Unverifiable descendants** (creation time cannot be read) are listed and make `clean` false while they are still listed; they are never killed. A slow-to-exit one can make a first
  report unclean: `owned.terminate()` is idempotent and may be called again. In the real runs none occurred (all 8 processes of a real Edge tree were readable).
- **A slow-exiting process answers "access denied" to a second kill.** Under heavy load a Chromium root can still be exiting when the confirming table is read (U004's `terminateOwned` never
  retries an identity whose kill failed once). `OwnedTree` therefore repeats the identity-verified pass at most `MAX_KILL_PASSES` (4) times, `KILL_RETRY_MS` (1000 ms) apart, while a recorded
  process is still listed and the deadline allows (tests `a kill that failed once...`, `a kill that keeps failing is retried a bounded number of times...`, mutants O36 to O38). `failed` still
  lists every attempt that failed (once per identity) even when a later pass ended the process; `survivors` is decided only by the confirming table.
- **Orphans:** discovery needs a live parent (U004). A process orphaned before it was ever recorded is not found. Chromium children exit with the browser; the real observation shows none left.
- **Deadline scope:** the deadline covers the open only. The baseline read, the adoption read and the sweeps are bounded by `listMs` and `terminateMs` each; the wait for the lock
  is not counted (it is bounded by the holder: at once, or `graceMs` plus its sweeps). The rejection arrives after the deadline plus the first sweep (about five helper calls for a real tree).
- **Abandoned opens:** after `graceMs` an open that never settled is abandoned and reported not clean (`graceExpired`, `innerSettled` false). Its late session is still closed (the sealed
  close only touches its own browser) but its tree is NOT swept again: after the lock was released a sweep could adopt another startup's browser.
- **No phase from the sealed opener:** `phase` is `'unknown'` unless a probe (`getPhase`) is given; the fake opener of the tests reports launch, new context, new page, navigation.
- **Cost:** every table read is one hidden PowerShell 5.1 start plus an `Add-Type` compile (about 2 s quiet, 2 to 6 s loaded). A startup reads twice; an expiry about five times plus one per poll.
- **Windows only**, real helper through `createWindowsAdapters` (fails closed with `ERR_PLATFORM` elsewhere). `OpenProcess(TERMINATE)` can be denied for protected or elevated children: reported as
  `failed` and `survivors`, never retried by name or marker. The embedded C# of `windows.cjs` is U004's and unchanged; its helper-text mutants (U004 review F7) are not repeated here, but the
  real runs exercised its kill path on a real Edge tree (11 verified kill requests, every one naming a recorded identity).
- **The real tests use the wall clock** (they have to); the hermetic tests never do. The independent oracle treats a CIM row as alive only when `process.kill(pid, 0)` agrees, because
  `Get-CimInstance` keeps listing an exited process for as long as any handle to it is open. A Windows PowerShell 5.1 started from PowerShell 7 inherits `PSModulePath` and cannot load
  `Microsoft.PowerShell.Security`: the real test strips that variable for its signature check.

## Evidence (all archived with `RUN\scripts\archive-run.cjs`: raw stdout and stderr, exit code, input hashes; never edited afterwards)

- `evidence\u005\specimen\naive-impl.cjs.txt`: the naive specimen (modes `race`, `name`, `late`), archived BEFORE the production files existed (they were kept out of the namespace until the RED was archived).
- `red-1-race`, `red-2-name`, `red-3-late`: the first RED, on the draft tests (52 tests): 46, 45 and 41 failures. `red-4-final-race`, `red-5-final-name`, `red-6-final-late`: the RED replayed on the
  first "final" tests (70 tests): 61, 60 and 56 failures. `red-7-final-race`, `red-8-final-name`, `red-9-final-late`: the RED replayed on the FINAL tests (72 tests): 63, 62 and 58 failures.
  Breakdown for `red-7`: 42 assertion failures about the specified behavior, 5 hang detections (the naive code sets no timer, so a never-settling adapter is a hang), 13 TypeErrors in test
  code that dereferenced a result the naive code does not provide (`error.settled`, `session.owned`, `report.unverifiable`). No missing module, no syntax error in any RED.
- `green-4-suite`: 72 of 72. `green-5-coverage-owned`: owned.cjs lines 99.69, branches 97.5, functions 100. `green-6-coverage-startup`: startup.cjs lines 100, branches 93.64, functions 94.59.
  (`green-1` to `green-3` are the same three runs on the first "final" bytes, 70 tests, before the retry passes; history.)
- `mutation-3`: the full run of the mutation tool on the FINAL bytes (76 mutants, 38 of `owned.cjs` and 38 of `startup.cjs`, one per guard): the control passes and every mutant is killed by a failing
  test whose name contains the declared expectation (76 of 76 killed, exit 0, 10.7 minutes on a loaded machine). History: `mutation-1` is the first full run (73 mutants, 19 minutes, 72 of 73 killed; S32 reported `bad-pattern`
  because its target line had been renamed by the abort refactor, so that run exits 1 and is retained unchanged), `mutation-2-s32` its complement for S32 (`--only S32`, killed).
- `real-4`: the FINAL real run (exit 0, 2 of 2 tests, about 6 minutes, heavy slot, file timeout 2000000, deadlines `graceMs` 240000, `terminateMs` 300000, `listMs` 120000). Test 1, the forced expiry
  (the test owns the deadline: an independent watcher process reports the first owned child and the test fires the deadline; the real sealed open is held back after it finished, so it can never
  complete before the deadline fires): the final report is clean (`finalClean` true, `survivors` 0, `finalErrors` empty), the late session was closed, 14 processes terminated and 1 already gone, 11 kill
  requests that all name a recorded identity, the look-alike Edge started by the test before the open survived, none of the 22 foreign Edge processes present before vanished (31 afterwards: other agents
  started more). Test 2, a normal open with the sealed close: 8 recorded processes, all 8 alive before the close, 1 root, all 8 gone after it, zero kill requests, zero unverifiable. Signature Valid
  (Microsoft Corporation), version 156.0.4314.58 within the qualified major 156 (recorded, never pinned).
  History: `real-1`, `real-2`, `real-3` are retained failed attempts on a machine at 100 percent CPU with three reviewer runs holding every heavy slot (every table read took tens of seconds): `real-1`
  printed the forced-expiry observation, then the FILE-level `--test-timeout=470000` expired before the second test finished (exit 1); `real-2` printed it with `survivors: 1` in the final report and
  then hit the 480 s test timeout; `real-3` (generous deadlines) failed on the strict assertion that no survivor is listed: the Playwright Edge root was still exiting, so a second kill answered
  access denied (`ERR_KILL`) and the final table still listed it. That is the finding the retry passes of `OwnedTree` fix (see Limits); `real-4` ran on those bytes.
- `green-7-integrity`: `tests\u005-evidence.test.cjs` (recomputes every run above, pins the FINAL runs to their input bytes, behavioral RED, numbers, mutants, the real observation, and tamper tests): 10 of 10.

## Results

| Check | Result |
| --- | --- |
| RED on the final tests (naive specimen, three modes) | 63, 62 and 58 of 72 fail on assertions about the specified behavior (`red-7..9`) |
| GREEN | 72 of 72 (`green-4-suite`) |
| Per-file coverage (L-0004, one command per file) | `owned.cjs` 99.69 / 97.5 / 100, `startup.cjs` 100 / 93.64 / 94.59 (lines / branches / functions, each at least 85) |
| Mutants | 76 of 76 killed by a named failing test, control green (`mutation-3`) |
| Real isolated headless Edge 156.0.4314.58 | 2 of 2 (`real-4`): forced expiry with a clean final report, 0 survivors, look-alike and foreign Edge untouched; normal open with 8 recorded processes |
| U004 consumers (`tree`, `windows` suites) | 34 of 34, unchanged files |

Credit: zero (local synthetic, no Azure, no network, no packages).
