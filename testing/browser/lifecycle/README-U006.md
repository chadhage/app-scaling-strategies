# U006: make close() unable to hang (bounded graceful close, owned-tree termination always, one shared cleanup)

Local test tooling for Windows (no Azure, no network, no packages, zero credit). The sealed session close (`testing\browser\isolated.cjs`) awaits `context.close()`, then
`browser.close()`, then removes the scratch directory, as ONE promise: a stuck context blocks shutdown for ever and nothing ends the browser. U006 wraps the session that the bounded
startup (U005, `startup.cjs`) returns: the graceful close is bounded by an injected deadline, then the owned process tree is ALWAYS ended by identity-verified termination and confirmed by a
fresh process table, repeated and concurrent calls share one cleanup, and survivors or a failed scratch removal reject with a typed error that lists them.

New files only (namespace `testing\browser\lifecycle`; no existing file was edited; the U005 and U004 files are consumed read-only and pinned in `imports.json`):

| File | Role |
| --- | --- |
| `U006.feature` | the specification, written first |
| `close.cjs` | production: `wrapSession`, `CloseError`, `durationsOf`, `settleWithin` |
| `session.cjs` | production: `startSession` (`{ ready, close }`, close during an unfinished startup), `openLessonSession`, `openLoopbackSession` |
| `imports.json` | the U005 and U004 files that U006 consumes, pinned by raw, LF and git-blob SHA-256 with the accepted commit and tag |
| `tests\u006-*.test.cjs`, `tests\u006-support-*.cjs`, `tests\u006-mutate.cjs`, `tests\u006-mutants.cjs` | hermetic tests, the imports and evidence integrity tests, the fake sealed close, the mutation tool and its 30 mutants, the real-Edge test |
| `evidence\u006\` | one NEW directory per archived run (immutable): the final runs `red-7..9`, `green-4..8`, `mutation-2`, `real-1`, the history runs `red-1..6`, `green-1..3`, `mutation-1`, `specimen\naive-close.cjs.txt` |

## How a close runs

    const { openLessonSession } = require('./session.cjs');
    const session = await openLessonSession('testing\\browser\\fixtures\\counter.html', { deadlineMs: 60000, gracefulMs: 15000 });
    try { /* use session.page */ } finally { await session.close(); }      // never hangs; resolves with the outcome only when the end state is clean

1. `close()` starts the graceful close (default: the sealed `session.close()`, injectable as `options.graceful`) and gives it `gracefulMs` (default 15000) to settle.
2. Whatever happened (closed, failed, timed out), the owned tree is then ended: `session.owned.terminate({ timeoutMs: terminateMs, listMs })` reads a fresh table, ends the recorded identities
   through the U004 core (identity verified on the handle that is terminated), and confirms with a fresh table. Never by image name or marker; the identity-verified pass is repeated a bounded number
   of times (U005 `OwnedTree`, at most 4 passes) while a recorded process stays listed.
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

Options: `gracefulMs`, `terminateMs` (60000), `listMs` (30000), `settleMs`, `graceful` (seam), `clock`; every duration is validated before anything runs (`ERR_INVALID_ARG`, timers capped at
2147483647 ms). `wrapSession` and the openers validate BEFORE launching a browser.

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

## Exact commands (repository root, PowerShell, Node 22, no network)

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
  into the tree is adopted, orphans recorded without a live parent are lost, unverifiable processes are reported and never killed, `OpenProcess(TERMINATE)` can be denied: `failed` and `survivors`).
- **Close during an unfinished startup** needs the session handle of `startSession`; a caller that only holds the promise of `openLessonBounded` has no `close()` to call before the session exists (use `signal`).
- **The forced stuck close of the real test** replaces `context.close()` of the REAL context by a call that settles only when the browser disconnects (a hung graceful close with the real tree alive); the sealed
  cleanup then runs for real. A seam that never settles at all (`options.graceful`) leaves the scratch `unconfirmed` by design.
- **Wall clock:** the real tests use it (they have to), the hermetic tests never do. Windows only. The imports pins are as strong as their anchor: the commit and tag in git history (L-0116).

## Evidence (all archived with `RUN\scripts\archive-run.cjs`: raw stdout and stderr, exit code, input hashes; never edited afterwards)

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

## Results

| Check | Result |
| --- | --- |
| RED on the final tests (naive close, three modes) | 16, 19 and 13 of 19 fail on assertions about the specified behavior (`red-7..9`) |
| GREEN | 19 of 19 (`green-4-suite`) |
| Per-file coverage (L-0004, one command per file) | `close.cjs` 100 / 98.25 / 94.44, `session.cjs` 100 / 96.67 / 100 (lines / branches / functions, each at least 85) |
| Mutants | 30 of 30 killed by a named failing test, control green (`mutation-2`) |
| Real isolated headless Edge 156.0.4314.58 | 2 of 2 (`real-1`): normal close with 8 recorded processes, forced stuck close ended by owned-tree termination with the sealed scratch removal confirmed, look-alike and foreign Edge untouched |
| Imports | 10 U005 and U004 files pinned and recomputed (`green-7-imports`, 3 of 3) |

Credit: zero (local synthetic, no Azure, no network, no packages).
