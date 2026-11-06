# U006: make close() unable to hang (bounded graceful close, owned-tree termination always, one shared cleanup)

Local test tooling for Windows (no Azure, no network, no packages, zero credit). The sealed session close (`testing\browser\isolated.cjs`) awaits `context.close()`, then
`browser.close()`, then removes the scratch directory, as ONE promise: a stuck context blocks shutdown for ever and nothing ends the browser. U006 wraps the session that the bounded
startup (U005, `startup.cjs`) returns: the graceful close is bounded by an injected deadline, then the owned process tree is ALWAYS ended by identity-verified termination and confirmed by a
fresh process table, repeated and concurrent calls share one cleanup, and survivors or a failed scratch removal reject with a typed error that lists them.

New files only in the first publication (namespace `testing\browser\lifecycle`; no existing file was edited; the U005, U004 and U018 files are consumed read-only and pinned in `imports.json`); the fix after the independent review (rev-U005 on U006, see the last section) is ONE new commit that modifies `close.cjs`, `session.cjs`, `imports.json`, `U006.feature`, this README and the real-test tooling of U006 and adds the fix tests and evidence:

| File | Role |
| --- | --- |
| `U006.feature` | the specification, written first |
| `close.cjs` | production: `wrapSession`, `CloseError`, `durationsOf`, `budgetsOf`, `settleWithin`, `frozenCopy`, `readOption`, `invalidArg` (the fix added the single re-read of a process that is still exiting, the budget formula, the frozen outcome and the typed option refusals) |
| `session.cjs` | production: `startSession` (`{ ready, close }`, close during an unfinished startup), `openLessonSession`, `openLoopbackSession` (the fix: the caller's signal is checked, the outcome of a failed startup is a frozen copy) |
| `imports.json` | the 14 files that U006 consumes (5 of U004, 6 of U005, 3 of U018), pinned by raw, LF and git-blob SHA-256 with the accepted commit and tag (re-pinned at the U005 FIX commit `72853ed7c8e0` and extended by `qualify\adapters.cjs`, `addendum.cjs`, `version.cjs` of U018 at `91ca6c9e97e1`) |
| `tests\u006-*.test.cjs`, `tests\u006-support-*.cjs` | hermetic tests, the imports and evidence integrity tests, the fake sealed close, the real-Edge tests (every real session ends in a `finally`), the object walker `u006-support-walk.cjs` |
| `tests\u006-fix-*.test.cjs` | the tests of the fix after rev-U005 on U006: two live sessions, close during the baseline read or while queued, the real tests' cleanup discipline and their tolerance (`guardedSessions`, `closeRecording`, `openRetrying`), the close budgets, the single re-read of an exiting process, frozen outcomes, typed refusals, test strength (the survivors of the systematic mutation run); and the integrity test of the fix evidence |
| `tests\mutation-equivalents-u006.json` | the equivalent mutants of the systematic run, each with a one-line proof (empty when every mutant is killed) |
| `tests\u006-mutate.cjs`, `tests\u006-mutants.cjs` | history: the first publication's chosen list of 30 mutants (its evidence stays); the current mutation tool is the systematic generator `tests\mutate-run.cjs --target u006` (`mutate-lex.cjs`, `mutate-run.cjs`, both published with U005) |
| `evidence\u006\` | the FIRST publication, one NEW directory per archived run (immutable): `red-7..9`, `green-4..8`, `mutation-2`, `real-1`, the history runs `red-1..6`, `green-1..3`, `mutation-1`, `specimen\naive-close.cjs.txt` |
| `evidence\u006-fix\` | the FIX: `first-publication\` (the unfixed bytes of `close.cjs`, `session.cjs` and the real test, replayed by the RED), `red-1-first-publication` (history), `red-2-final`, `green-1-suite`, `green-2-coverage-close`, `green-3-coverage-session`, `green-4-imports`, `mutation-1`, `real-1` (history), `real-2` (kept failed attempt), `real-3`, `green-5-integrity` |

## How a close runs

    const { openLessonSession } = require('./session.cjs');
    const session = await openLessonSession('testing\\browser\\fixtures\\counter.html', { deadlineMs: 60000, gracefulMs: 15000 });
    try { /* use session.page */ } finally { await session.close(); }      // never hangs; resolves with the outcome only when the end state is clean

1. `close()` starts the graceful close (default: the sealed `session.close()`, injectable as `options.graceful`) and gives it `gracefulMs` (default 15000) to settle.
2. Whatever happened (closed, failed, timed out), the owned tree is then ended: `session.owned.terminate({ timeoutMs: terminateMs, listMs })` reads a fresh table, ends the recorded identities
   through the U004 core (identity verified on the handle that is terminated), and confirms with a fresh table. Never by image name or marker; the identity-verified pass is repeated a bounded number
   of times (U005 `OwnedTree`, at most 4 passes) while a recorded process stays listed. **The tree is the one the startup sealed** (U005 fix): `close()` can only ever end the identities recorded during
   its own startup window and their descendants, so closing one of two live sessions in the same process (in either order, or twice) never ends the other session's browser.
2a. **A process that is still exiting** when the confirming table is read (a Chromium root can take seconds to leave the table under load) is not reported as a survivor at once: after `exitSettleMs` (default 2000)
   the table is read ONCE more, read-only (no further kill, never by name or marker). A survivor that left meanwhile is reported in `exiting` and counted as `terminated`; one that is still listed stays a survivor;
   a re-read that fails keeps the first report and records the failure (never claims clean). The re-read happens only after a readable confirming table that listed a survivor.
3. If the graceful close did not settle, it is given `settleMs` (default 15000) AFTER the tree is gone: Playwright rejects every pending call when the browser process dies, so the sealed chain
   (`context.close()` rejects, `browser.close()` finishes, then the scratch removal runs) settles on its own and the removal is still attempted. A rejection of the sealed chain that is a filesystem
   error (`syscall` rm, rmdir, unlink, lstat, stat, opendir, scandir, rename or open, or code EBUSY, EPERM, EACCES, ENOTEMPTY) is the scratch failure; any other rejection after a forced
   termination (`Target closed`) is the expected consequence and only reported in `sealedError`.
4. **Outcome** (`graceful`: closed, failed or timeout; `gracefulError`; `sealed`: settled or unsettled; `sealedError`; `scratch`: removed, failed or unconfirmed; `scratchError`; `clean`; and the
   termination report `terminated`, `alreadyGone`, `refused`, `survivors`, `failed`, `unverifiable`, `unconfirmed`, `errors`, `confirmed`). `clean` is true only when the confirming table shows nothing
   owned or unverifiable is left AND the scratch removal is `removed`. A clean outcome resolves; anything else rejects with `CloseError` (`code ERR_CLOSE_FAILED`, the same fields). A graceful failure
   that left nothing behind resolves (it is reported in the outcome, never hidden).
5. **One promise:** every call returns the very same promise (a rejection is shared too); the graceful close and the termination run once.
6. **Close during an unfinished startup:** `startSession(run, options)` returns `{ ready, close }`; `close()` before the session exists aborts the startup (U005 `signal`: its owned tree is ended
   exactly as on expiry, the lock is released), waits for that cleanup and returns an outcome with `startup` (`ERR_STARTUP_ABORTED`, `ERR_STARTUP_DEADLINE`, `failed`, ...); it rejects with `CloseError`
   when that cleanup was not clean. After the session exists it is the session's own bounded close.

7. **The outcome is one frozen value** (self-review 5): every caller of the one shared `close()` receives the same outcome, so the outcome and the `CloseError` are deep-frozen COPIES of what the tree reported: a caller can change nothing that another
   caller (or a later outcome) sees, and no module constant is ever returned (before the fix a close during a failed startup handed out the arrays of a module constant). `REPORT_KEYS` is frozen too.

Options: `gracefulMs`, `terminateMs` (60000), `listMs` (30000), `settleMs`, `exitSettleMs`, `graceful` (seam), `clock` (must provide `setTimeout` and `clearTimeout`); every duration is validated before anything runs (`ERR_INVALID_ARG`, timers capped at
2147483647 ms). `wrapSession` and the openers validate BEFORE launching a browser. **Typed refusals** (self-review 7): options that are not an object (null, a number, a string, an array), an option whose getter throws (the message names the option) and a
`signal` that is not an `AbortSignal` are `ERR_INVALID_ARG`, never a `TypeError`; every close option is read exactly ONCE (a getter cannot pass the check and then deliver another value). Unknown option names are ignored; the options of the startup
(U005: `deadlineMs`, `graceMs`, `adapters`, ...) are validated by U005.

**Budgets (one formula, proven on the virtual clock):** `budgetsOf(options)` returns every duration plus `sweepBoundMs = listMs + terminateMs + listMs` and `closeBoundMs = gracefulMs + sweepBoundMs + exitSettleMs + listMs +
settleMs`, the worst case of one `close()`. A table adapter that never answers ends the close at exactly `sweepBoundMs` after a graceful close that settled at once, and at `gracefulMs + sweepBoundMs + settleMs`
when the graceful close hangs too (150 s and 120 s with the defaults: the sweep budgets are independent constants, not derived from `gracefulMs`; test `F5: ...`). The re-read of step 2a happens only after a readable
confirming table, so it never adds to those two cases.

## Contract table (`U006.feature`; tests in `u006-close.test.cjs` and `u006-session.test.cjs`)

| Situation | Outcome | Test |
| --- | --- | --- |
| normal close | resolves, `graceful closed`, tree already gone, no kill, scratch removed once | `a normal close leaves nothing...` |
| graceful close succeeds but a recorded process stays | resolves, that process is `terminated` by identity | `a graceful close that succeeds but leaves an owned process behind...` |
| stuck `context.close()` or stuck `browser.close()` | `graceful timeout`, tree ended by identity, sealed cleanup settles, scratch removed, resolves | `a stuck context.close() is bounded...`, `a stuck browser.close()...` |
| scratch removal fails (after success or after a stuck close) | rejects, `scratch failed`, `scratchError`, tree still reported gone | `a failed scratch removal is reported...` |
| sealed cleanup never settles, or the graceful seam never settles | rejects after `settleMs`, `scratch unconfirmed`, tree still ended | `a sealed cleanup that never settles...`, `a never-settling graceful seam...` |
| survivor, access-denied kill, lying kill adapter | rejects, lists `survivors`, `failed`, never `terminated` | `survivors, an access-denied kill and a lying kill adapter...` |
| browser died before close | resolves, `alreadyGone`, scratch removal ran, `gracefulError` reported | `a close after the browser died...` |
| second and concurrent closes | the very same promise, one graceful close, one termination, a rejection shared | `a second close and concurrent closes share one promise...` |
| list or kill adapter that never settles | rejects in bounded time, nothing claimed | `hostile adapters cannot hang the close...` |
| invalid deadlines, foreign sessions | `ERR_INVALID_ARG` before anything runs, timers capped | `F9: invalid deadlines and sessions...`, `invalid options are refused...` |
| close during an unfinished startup | startup aborted, tree ended, lock released, outcome `startup ERR_STARTUP_ABORTED` | `close() during an unfinished startup...` |
| close after a failed or expired startup | nothing to close / the watch outcome of the expired startup | `close() on a startup that failed by itself...`, `...that expired...` |

Guards of both files are mutated (30 mutants, `tests\u006-mutants.cjs`): graceful seam and deadline validation, session validation, the graceful bound, timer clearing, always-terminate (also after a successful
graceful close), the bounded wait for the sealed cleanup, the timeout and unconfirmed classifications, scratch failure recognition (syscall, code), clean and reject, the shared promise, the default seam,
and in `session.cjs` the abort, the watch outcome, the unclean rejection, the plain failure, option validation and wiring.

## Exact commands of the first publication (history: the commands of the fix, with the five hermetic test files, are in the last section)

Hermetic suite (19 tests, about 6 s):

    node --test --test-concurrency=1 --test-timeout=20000 testing\browser\lifecycle\tests\u006-close.test.cjs testing\browser\lifecycle\tests\u006-session.test.cjs

Per-file 85/85/85 (L-0004, one command per production file, the same two test files):

    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/close.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=20000 <the two test files>
    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/session.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=20000 <the two test files>

RED replay (the same tests against the archived naive close; mode `await` awaits the graceful close first so a stuck context hangs it, `name` bounds it but ends browsers by image name, `ignore` ends the
owned tree but ignores survivors and the scratch result and shares nothing; it can only reach the fake adapters of the tests):

    $env:U006_RED_IMPL = 'testing\browser\lifecycle\evidence\u006\specimen\naive-close.cjs.txt'; $env:U006_NAIVE_MODE = 'await'   # or name, ignore
    node --test --test-concurrency=1 --test-timeout=20000 <the two test files>
    Remove-Item Env:\U006_RED_IMPL, Env:\U006_NAIVE_MODE

Mutation tool (30 mutants in a work directory, one change each, the production files are never touched; about 30 seconds on a quiet machine, up to 6 minutes under load; take a heavy slot):

    node testing\browser\lifecycle\tests\u006-mutate.cjs --work <new empty directory> --timeout-ms 60000

Imports and evidence integrity (the imports are recomputed against the files AND against git objects of the accepted commits and tags; the evidence is recomputed and tampered with):

    node --test --test-concurrency=1 --test-timeout=60000 testing\browser\lifecycle\tests\u006-imports.test.cjs
    node --test --test-concurrency=1 --test-timeout=120000 testing\browser\lifecycle\tests\u006-evidence.test.cjs

Real isolated headless Edge (heavy slot first: `RUN\scripts\heavy-slot.ps1 -Action Acquire -Owner <ITEM>`, release in `finally`; several minutes; needs a scratch directory):

    $env:U006_REAL_EDGE = '1'; $env:U006_SCRATCH = '<existing scratch directory>'
    node --test --test-concurrency=1 --test-timeout=2000000 testing\browser\lifecycle\tests\u006-real.test.cjs
    Remove-Item Env:\U006_REAL_EDGE, Env:\U006_SCRATCH

Whitespace: `git -c "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol" diff --check -- testing\browser\lifecycle` (new files: after staging, `diff --cached --check`).

## Limits (what this does not prove)

- **The scratch directory is the sealed close's.** The sealed session exposes neither the scratch path nor the Playwright browser, so U006 never removes a path itself: it lets the sealed chain run after the tree is
  gone and reports how it ended. If that chain never settles within `settleMs` the scratch is `unconfirmed` and `close()` rejects; nothing is retried (the transient-lock retry, for example an Edge BITS temp file that
  makes the removal fail with EBUSY, is U007). The filesystem-error classification is by `syscall` and `code`, not by message.
- **A graceful failure that leaves nothing behind resolves.** `close()` rejects on the END STATE (survivors, unconfirmed or unverifiable-and-listed processes, scratch failed or unconfirmed). A rejection of the
  graceful close itself (`gracefulError`) or of the sealed chain after a forced termination (`sealedError`, usually `Target closed`) is reported in the outcome, not turned into a failure.
- **Identity, not origin.** Termination is the U005/U004 one: only identities recorded while alive, verified on the handle that is terminated. The U005 limits apply unchanged (a younger process whose parent id points
  into the tree is adopted, orphans recorded without a live parent are lost, unverifiable processes are reported and never killed, `OpenProcess(TERMINATE)` can be denied: `failed` and `survivors`). Since the U005 fix the tree is sealed
  after the startup window, so a session never ends the browser of another live session; a child that the caller itself starts INSIDE the startup window of THIS session is still adopted (U005 limit).
- **A leftover `playwright_chromiumdev_profile-*` directory (rev-U005 F9) is a documented limit, not removed.** The sealed helper exposes neither the browser profile path nor a command line that names it, so no profile directory can be proven to be
  THIS session's; the runtime folder is shared with every agent's real runs, so a listing is never a proof of ownership. The real tests only COUNT new profile directories (`profileDirsLeft` in the observation: other agents' concurrent runs appear there too) and never remove one.
  The scratch directory that the sealed close removes is the session's own; a failed removal (EBUSY) is reported by `close()` and the real tests remove only the directory that the error text itself names.
- **A process that is still exiting** (Chromium root under load) is re-read ONCE after `exitSettleMs`; on a saturated machine a terminated root can stay in the table for tens of seconds, so the real tests pass `exitSettleMs: 45000`. A survivor that is still
  listed after the re-read stays a survivor and `close()` rejects (honest, never success-shaped). No test asserts an absolute time: the settle is proven on the virtual clock.
- **The real tests tolerate exactly one environmental failure each, and record it:** the sealed close answering `EBUSY`, `EPERM` or `ENOTEMPTY` while it removes its scratch directory with every owned process gone and confirmed (`closeBusy` in the observation, the leftover
  directory named by the error is removed; any other close error fails the test), and ONE retry of the open after a typed `browserType.launch: Timeout 15000ms exceeded` of the sealed helper (`openRetries`; a second timeout fails). The hermetic tests of that tolerance are in `u006-fix-session.test.cjs`.
- **Qualified Edge majors come from the owning API** (`readQualified()` of `testing\browser\qualify`: the sealed list plus its append-only addendum); no lifecycle file names the sealed file outside a comment (test `no lifecycle source or test names the sealed qualified-majors file outside a comment`).
- **Not probed:** a seeded fuzz over the options of the startup (U005's validators), HTTP-level behavior (none here), real signals, a redirected Desktop, hostile `session` shapes beyond the closed-shape check (`close()` and `owned.terminate()` must be functions).
- **Close during an unfinished startup** needs the session handle of `startSession`; a caller that only holds the promise of `openLessonBounded` has no `close()` to call before the session exists (use `signal`).
- **The forced stuck close of the real test** replaces `context.close()` of the REAL context by a call that settles only when the browser disconnects (a hung graceful close with the real tree alive); the sealed
  cleanup then runs for real. A seam that never settles at all (`options.graceful`) leaves the scratch `unconfirmed` by design.
- **Wall clock:** the real tests use it (they have to), the hermetic tests never do. Windows only. The imports pins are as strong as their anchor: the commit and tag in git history (L-0116).

## Evidence of the FIRST publication (history, `evidence\u006\`; all archived with `RUN\scripts\archive-run.cjs`: raw stdout and stderr, exit code, input hashes; never edited afterwards)

- `evidence\u006\specimen\naive-close.cjs.txt`: the naive specimen (modes `await`, `name`, `ignore`), archived BEFORE the production files existed (`close.cjs` and `session.cjs` were kept out of the namespace until the RED was archived).
- `red-1-await`, `red-2-name`, `red-3-ignore`: the first RED, on the draft tests (16 tests): 15, 16 and 12 failures. `red-4-final-*`: the RED on the first "final" tests (19 tests): 16, 19 and 13 failures.
  `red-7-final-await`, `red-8-final-name`, `red-9-final-ignore`: the RED replayed on the FINAL tests (19 tests): 16, 19 and 13 failures. Breakdown of `red-7` (the naive close awaits the graceful close first):
  9 assertion failures about the specified behavior and 6 hang detections ("stuck: no timer is pending": a stuck `context.close()` hangs it); `red-8`: 17 assertion failures and 2 TypeErrors; `red-9`: 11 assertion failures
  and 1 TypeError. No missing module, no syntax error in any RED.
- `green-4-suite`: 19 of 19. `green-5-coverage-close`: close.cjs lines 100, branches 98.25, functions 94.44. `green-6-coverage-session`: session.cjs lines 100, branches 96.67, functions 100.
  (`green-1` to `green-3` are the same three runs before the retry passes of the U005 `owned.cjs`; history, verified but not pinned.)
- `green-7-imports`: 3 of 3: the 10 consumed files (5 of U004, accepted commit `f1a84bd04570`, tag `kanban/U004/f1a84bd04570`; 5 of U005, commit `3b3f5eda01ed`, tag `kanban/U005/3b3f5eda01ed`) match `imports.json`
  byte for byte (raw, LF-normalised and git blob SHA-256), the blobs exist in the accepted commits and the tags resolve to them.
- `mutation-2`: the mutation tool on the FINAL bytes: the control passes and all 30 mutants are killed by a failing test whose name contains the declared expectation (26 seconds on a quiet machine). History:
  `mutation-1` is the same run before the retry passes of `owned.cjs` (30 of 30), verified but not pinned.
- `real-1`: real isolated headless Edge 156.0.4314.58 (Microsoft Corporation, signature Valid, qualified major 156, recorded never pinned), exit 0, 2 of 2, heavy slot. Test 1, a normal open and close: 8 recorded processes, `graceful closed`,
  all 8 already gone, zero kill requests, `scratch removed`, the sealed scratch directory of the session is gone. Test 2, a forced stuck close (the REAL `context.close()` replaced by a call that settles only when the browser
  disconnects; `gracefulMs` 4000): `graceful timeout`, 7 processes terminated and 1 already gone, 11 kill requests that all name a recorded identity, `sealed settled` (`sealedError` "Target closed"), `scratch removed` (the sealed
  removal really ran: the new session directory is gone), the same-image look-alike started before the open survived, none of the 21 foreign Edge processes present before vanished (31 afterwards: other agents started more).
- `green-8-integrity`: `tests\u006-evidence.test.cjs` (recomputes every run above, pins the FINAL runs to their input bytes, behavioral RED, numbers, mutants, the real observation, and tamper tests): 8 of 8.

## Results of the FIRST publication (history; the independent review rejected it on F1, see the last section)

| Check | Result |
| --- | --- |
| RED on the final tests (naive close, three modes) | 16, 19 and 13 of 19 fail on assertions about the specified behavior (`red-7..9`) |
| GREEN | 19 of 19 (`green-4-suite`) |
| Per-file coverage (L-0004, one command per file) | `close.cjs` 100 / 98.25 / 94.44, `session.cjs` 100 / 96.67 / 100 (lines / branches / functions, each at least 85) |
| Mutants | 30 of 30 killed by a named failing test, control green (`mutation-2`) |
| Real isolated headless Edge 156.0.4314.58 | 2 of 2 (`real-1`): normal close with 8 recorded processes, forced stuck close ended by owned-tree termination with the sealed scratch removal confirmed, look-alike and foreign Edge untouched |
| Imports | 10 U005 and U004 files pinned and recomputed (`green-7-imports`, 3 of 3) |

Credit: zero (local synthetic, no Azure, no network, no packages).

## The fix after the independent review (rev-U005 on U006): what was found, which test fails on the old bytes

The first publication (`a52f05e23feb`) was rejected on one inherited major and several minors. The fix is ONE new commit on top (U005 was fixed and published first as `72853ed7c8e0`; `imports.json` is re-pinned at it). The first-publication evidence stays as it was;
the new evidence is in `evidence\u006-fix\`. The unfixed bytes of `close.cjs`, `session.cjs` and the real test are archived in `evidence\u006-fix\first-publication\` and the RED replays the new tests against them TOGETHER WITH the archived unfixed U005 `owned.cjs`
and `startup.cjs` (`evidence\u005-fix\first-publication\`): the whole first-publication stack, so the inherited defect itself is reproduced by the failing tests (`U006_FIRST_PUBLICATION`, `U005_FIRST_PUBLICATION`, `U006_REAL_TEST_SOURCE`, see Exact commands of the fix).

| Finding | What was wrong | Fix | Test that fails on the old bytes (`red-2-final`) |
| --- | --- | --- | --- |
| F1 (major, inherited from U005 F1) | `close()` always called `owned.terminate()`, which adopted every new direct child of the caller: closing session A ended session B's browser (real Edge via `openLessonSession` twice: B 0 of 8 alive, `B.page.title()` rejected) | cured in U005 (the tree is sealed after the startup window; observe and terminate refresh descendants of the recorded identities only); U006 adds the two-live-sessions tests through `openLessonSession`, FIFO and LIFO, a graceful close that leaves its tree behind, a repeated close, and the real run | `F1: two live sessions ... closed first then second`, `F1: a graceful close that leaves its own tree behind ...` (`u006-fix-session.test.cjs`); real: case `two-live-sessions-fifo` of `real-3` (the LIFO order is safe on the old bytes too, as the reviewer said) |
| F2 | `close()` during an unfinished startup waited for the whole open when the abort fired during the baseline read (74 s and 109 s) or while queued behind the lock | cured in U005 (listener before the first await, every wait raced); U006 tests it through `startSession` | `F2: close() during the baseline read ...`, `F2: close() while the startup is queued ...` |
| F3 | the real test asserted that EVERY recorded process is alive (flaky: utility processes exit) and had no `finally`, so a failure leaked a live Edge tree and a scratch directory | every real session is opened and ended through `guardedSessions` (try/finally), only the roots and a lower bound are asserted alive; a test injects a failing assertion and proves the cleanup ran | `F3: every real test closes the sessions it opens in a finally block ...` (static, against the first-publication real test source), `F3: a failing assertion inside a guarded real test still closes the sessions it opened` |
| F4 | 4 of the reviewer's 34 mutants survived (K18 kill and table deadlines swapped, K23 clock option ignored, L05 unobserved failed startup, K20 message text) | named tests; the chosen list was replaced by the SYSTEMATIC generator over every statement and condition of `close.cjs` and `session.cjs` | `K18`, `K23`, `L05` (`u006-fix-close.test.cjs`; they pass on the old bytes: they kill reviewer mutants of the OLD code, not a defect of it); the survivors of the systematic run in `u006-fix-strength.test.cjs` |
| F5 | with the defaults a close that cannot read the table rejected after 120 s although `gracefulMs` is 15 s | one formula (`budgetsOf`: `sweepBoundMs`, `closeBoundMs`), the worst case is stated and proven on the virtual clock | `F5: the close budgets are one formula ...` |
| F6 | README and specification were not pinned by any test | both are inputs of the final red, green and coverage captures; a test recomputes every README figure and tamper tests fail by name | `u006-fix-evidence.test.cjs` |
| F7 | after the browser root died `close()` rejected after 123 s although 0 of 9 recorded processes were alive (one was still exiting when the confirming table was read) | after a readable confirming table that lists a survivor the table is read ONCE more after `exitSettleMs`: a survivor that left is `exiting` (counted terminated), no further kill is sent, an unreadable re-read keeps the first report | four `F7` tests of `u006-fix-close.test.cjs` and the strength tests |
| F8 | verified claims (denied handle reported, never gone; stuck close bounded; scratch failure reported; one shared promise; hostile adapters bounded) | unchanged | the first-publication tests, still green |
| F9 | a `playwright_chromiumdev_profile-*` directory outside the scratch directory stayed behind after the root died | cannot be proven this session's (see Limits): documented, counted by the real tests, never removed | `profileDirsLeft` in the observation lines of `real-3` |
| SR5, SR7 (self-review, same commit) | the outcome of a close during a failed startup handed out the arrays of a module constant (one caller changing them changed every later outcome); options that are not an object, a getter that throws and a signal that is not an `AbortSignal` crashed with a `TypeError` | the outcome and the `CloseError` are deep-frozen copies; every option is read once and validated, typed refusals | `SR5 ...`, `SR7 ...` (`u006-fix-close.test.cjs`, `u006-fix-session.test.cjs`) |
| controller note (U018 addendum) | three lifecycle files read the sealed `qualified.json` directly, which breaks the moment an addendum adds Edge 157 | `readQualified()` of `testing\browser\qualify` everywhere (pinned in `imports.json`); the real run was REDONE (`real-3`; `real-1` ran before the change and `real-2` failed for the unrelated reason below) because its inputs changed | `no lifecycle source or test names the sealed qualified-majors file outside a comment` (`u006-fix-evidence.test.cjs`) |

Equivalent mutants are listed with a one-line proof in `tests\mutation-equivalents-u006.json` (empty when every mutant is killed) and in `evidence\u006-fix\mutation-1`.

Figures of the fix (every row is recomputed from the stored evidence by `u006-fix-evidence.test.cjs`; the captures are `green-1-suite`, `green-2-coverage-close`, `green-3-coverage-session`, `green-4-imports`, `red-1-first-publication`, `red-2-final`, `mutation-1`, `real-1`, `real-2` and `real-3`):

| Figure | Value |
| --- | --- |
| hermetic tests of the whole U006 suite | 58 of 58 |
| coverage close.cjs lines / branches / functions | 100 / 100 / 100 |
| coverage session.cjs lines / branches / functions | 100 / 100 / 100 |
| imports and pins test (green-4-imports) | 3 of 3 |
| fix RED on the draft of the fix tests (red-1-first-publication) | 6 of 15 fail |
| fix RED on the final tests against the first-publication bytes (red-2-final) | 18 of 26 fail |
| systematic mutants of close.cjs and session.cjs | 251 generated, 251 killed, 0 equivalent with a proof, 0 survived |
| first real run of the fix, kept as history (real-1) | 3 of 3 pass |
| second real run of the fix, kept as a failed attempt (real-2) | 2 of 3 pass |
| final real run of the fix (real-3) | 3 of 3 pass |

The numbers of the real Edge observations (recorded processes, terminated and already gone, kill requests) depend on timing (a utility process may or may not exist yet when it is read, a root may still be exiting) and are therefore NOT figures: they are the `# U006-REAL-OBSERVATION` lines of `real-3`
(normal close, forced stuck close, two live sessions) and are asserted structurally by the evidence test (roots alive before the close, graceful `closed` or `timeout`, the look-alike alive, no foreign Edge vanished, no kill request for the second session, every close error either none or the recorded scratch EBUSY).
`real-1` (kept as history) passed 3 of 3 on test bytes that read the sealed qualified-majors file themselves and had no tolerance for the sealed close's scratch EBUSY and no retry of a launch timeout: the controller note after the U018 review changed those inputs, so the run was redone as `real-2`.
`real-2` (kept as a FAILED attempt, exit 1, 2 of 3 tests) ran on the new bytes at 100 percent CPU: its forced stuck close and its two live sessions passed (the second browser alive and answering after the first close, no kill request for the second session), but the normal-close test failed its strict
`graceful closed` assertion: the sealed close of a HEALTHY browser took longer than the 60 s graceful bound, so the bounded close ended the tree by termination (`graceful timeout`, an honest and clean outcome that the test did not expect). The test now gives the graceful close of that one test a bound of 300 s (the bound exists
for hangs, which test 2 forces); `real-3` is the run on those bytes.
`mutation-1` ran the generator once on the final bytes (the control passes, no mutant timed out; a timeout would be undecided and fails the run).

### Exact commands of the fix (repository root, PowerShell, Node 22, no network; hard external timeouts; `<five tests>` = `u006-close`, `u006-session`, `u006-fix-session`, `u006-fix-close`, `u006-fix-strength`, each `testing\browser\lifecycle\tests\<name>.test.cjs`)

Hermetic suite (58 tests):

    node --test --test-concurrency=1 --test-timeout=120000 <five tests>

Per-file 85/85/85 (L-0004, one command per production file, the same five tests):

    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/close.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=120000 <five tests>
    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/session.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=120000 <five tests>

RED replay of the FIX against the whole first-publication stack (the working directory is a scratch directory OUTSIDE the repository, L-0182; the same two files pass unchanged inside the hermetic suite above):

    $env:U006_FIRST_PUBLICATION = 'testing\browser\lifecycle\evidence\u006-fix\first-publication'
    $env:U005_FIRST_PUBLICATION = 'testing\browser\lifecycle\evidence\u005-fix\first-publication'
    $env:U006_REAL_TEST_SOURCE = 'testing\browser\lifecycle\evidence\u006-fix\first-publication\u006-real.test.cjs.txt'
    node testing\browser\lifecycle\tests\u005-scratch-run.cjs <scratch directory outside the repository> --test --test-concurrency=1 --test-timeout=120000 testing\browser\lifecycle\tests\u006-fix-session.test.cjs testing\browser\lifecycle\tests\u006-fix-close.test.cjs
    Remove-Item Env:\U006_FIRST_PUBLICATION, Env:\U005_FIRST_PUBLICATION, Env:\U006_REAL_TEST_SOURCE

Systematic mutation (every statement and every single condition of `close.cjs` and `session.cjs`, one change each in a private LF copy; the suite runs in one process and a mutant is ended at its first failing test; normal priority, at most 4 jobs, alone on the machine; about 10 minutes):

    node testing\browser\lifecycle\tests\mutate-run.cjs --target u006 --work <new empty directory> --jobs 4 --timeout-ms 400000 --equivalents testing\browser\lifecycle\tests\mutation-equivalents-u006.json

Imports and evidence integrity (the imports are recomputed against the files AND against git objects; the evidence of both folders is recomputed, pinned and tampered with; no lifecycle file may name the sealed qualified-majors file):

    node --test --test-concurrency=1 --test-timeout=900000 testing\browser\lifecycle\tests\u006-imports.test.cjs
    node --test --test-concurrency=1 --test-timeout=900000 testing\browser\lifecycle\tests\u006-evidence.test.cjs testing\browser\lifecycle\tests\u006-fix-evidence.test.cjs

Real isolated headless Edge (heavy slot first: `RUN\scripts\heavy-slot.ps1 -Action Acquire -Owner <ITEM>`, release in `finally`; three tests, about 10 to 25 minutes on a saturated machine; needs a scratch directory; the test timeouts are 15 minutes each):

    $env:U006_REAL_EDGE = '1'; $env:U006_SCRATCH = '<existing scratch directory>'
    node --test --test-concurrency=1 --test-timeout=3000000 testing\browser\lifecycle\tests\u006-real.test.cjs
    Remove-Item Env:\U006_REAL_EDGE, Env:\U006_SCRATCH

Whitespace: `git -c "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol" diff --check -- testing\browser\lifecycle` (new files: after staging, `diff --cached --check`).
