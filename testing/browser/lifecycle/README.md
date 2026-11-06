# U004: end only the process tree the browser helper owns

Local test tooling for Windows (no Azure, no network, no packages, Edge is not involved). It lets the bounded browser startup and
close (U005, U006) stop what the helper started and nothing else.

Files (all new, namespace `testing\browser\lifecycle`):

| File | Role |
| --- | --- |
| `U004.feature` | the specification, written first |
| `tree.cjs` | production core: `snapshotTree`, `refreshTree`, `terminateOwned`, `LifecycleError`; pure, every OS access is an injected adapter |
| `windows.cjs` | production Windows adapters: `createWindowsAdapters()` returns `{ list, kill, now, sleep, selfPid }` |
| `tests\*.test.cjs`, `tests\support\`, `tests\fixtures\` | hermetic fake-OS tests, adapter tests, real-process tests, the Node fixture tree, the repeat runner |
| `evidence\red\` | the archived RED runs and the naive specimen `naive-impl.cjs.txt`; `evidence\green\` the GREEN, coverage, repeat and mutation runs |

## Design in five lines

1. **Ownership is an identity, never a name.** An owned process is a `(pid, creation time)` pair (FILETIME, 100 ns, a digit string) recorded while the process
   was alive. A bare pid, an image name or a marker in a command line proves nothing and is never used to find or end a process.
2. **Descendants** are found by parent id AND a creation time not earlier than the parent's (a reused parent pid cannot adopt an older stranger). Orphans whose
   parent already died stay in the recorded snapshot; `refreshTree` adds new children of entries that are alive with their recorded identity and never of dead ones.
3. **`terminateOwned(snapshot, { timeoutMs, adapters })`** returns `{ terminated, alreadyGone, survivors, refused, errors }`. Each round lists the table, compares every recorded
   identity with the live process (mismatch, unreadable creation time, the caller and its ancestors: `refused`, never killed), adopts late children of verified owned
   processes, and ends the rest parent first. It repeats while time remains and never throws for a process that is already gone. Everything is bounded by one deadline.
4. **Windows mechanism (`windows.cjs`):** one hidden Windows PowerShell 5.1 helper per call (`powershell.exe` under `SystemRoot`, `-EncodedCommand`, pids and creation
   times only on standard input, no shell string, no `taskkill`, no `Stop-Process`, no WMI/CIM, no command lines). It compiles a small P/Invoke class (`Add-Type`) and
   reads a Toolhelp snapshot. `kill` opens the process, reads the creation time of THAT handle, compares it, and calls `TerminateProcess` on the SAME handle, so a pid that
   was reused in between cannot be ended (`mismatch`). A process that is already exiting (access denied on terminate) is waited for and reported `gone`.
5. **Fail closed:** no PowerShell, Constrained Language Mode, a denied handle or a timeout produce `errors` and `survivors`, never a guess.

Test tooling (never production) reads process tables read-only: `tests\support\process-table.cjs` (pid, parent, image name; the independent oracle of the real test) and
`tests\support\leftovers.cjs` (looks for fixture command lines after each repeat run). Neither ever ends a process; fixtures end only by closing their loopback connection or by the
documented `ChildProcess.kill()` of the four direct children the test itself spawned.

## What was different in the archived prototype (not reused)

`evidence\lifecycle-blocked.json` of the parent namespace records a marked-tree recovery probe that failed while a watchdog-only probe passed. The prototype found its roots by a
marker substring in command lines, listed every process with `Get-CimInstance Win32_Process` including `CommandLine`, compared a .NET `StartTime` with a WMI `CreationDate` after
string formatting, and ended processes with `Stop-Process -Id` after a separate check; the failing probe ended with SIGTERM after 15 to 19 s, an `execFile` timeout. Here: identity is recorded, not searched
(no command line is ever read in production), the table comes from one Toolhelp snapshot (about 35 ms inside the helper; CIM took 1 to 4 s under load), creation times come from one source
(`GetProcessTimes`, 100 ns; WMI truncates to 1 microsecond, observed 0 to 9 ticks lower on 288 processes, so comparing across the two sources fails for about nine processes in ten),
verification and termination share one handle, and every branch of the core is covered by hermetic tests.

## Exact commands (repository root, PowerShell, Node 22, no network)

Hermetic suite (fake OS, fake spawn, seeded chaos; about 20 s):

    node --test --test-concurrency=1 testing\browser\lifecycle\tests\tree-snapshot.test.cjs testing\browser\lifecycle\tests\tree-terminate.test.cjs testing\browser\lifecycle\tests\tree-fuzz.test.cjs testing\browser\lifecycle\tests\windows.test.cjs

Real processes (real PowerShell helper, a marked Node fixture tree plus look-alikes; one to two minutes, take a heavy slot first):

    node --test --test-concurrency=1 testing\browser\lifecycle\tests\windows-real.test.cjs testing\browser\lifecycle\tests\real-tree.test.cjs

Per-file 85/85/85 (L-0004, one command per production file):

    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/tree.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 testing\browser\lifecycle\tests\tree-snapshot.test.cjs testing\browser\lifecycle\tests\tree-terminate.test.cjs testing\browser\lifecycle\tests\tree-fuzz.test.cjs
    node --test --experimental-test-coverage --test-coverage-include=testing/browser/lifecycle/windows.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 testing\browser\lifecycle\tests\windows.test.cjs

Twenty repeated real runs with a read-only leftover scan after each (about 15 minutes, heavy slot; exit 0 only when all 20 are clean):

    node testing\browser\lifecycle\tests\repeat-real.cjs --runs=20

RED reproduction: the same tests run against the archived naive implementation, selected by environment variables (`U004_NAIVE_MODE` is `marker`, `tree` or `name`). The
naive module can only end a process through `adapters.kill`, which the tests wrap in a guard that refuses every pid the test did not create, and the naive kill refuses to run
outside that guard, so the naive run can never reach a process of anyone else:

    $env:U004_RED_IMPL = 'testing\browser\lifecycle\evidence\red\naive-impl.cjs.txt'; $env:U004_NAIVE_MODE = 'marker'
    node --test --test-concurrency=1 testing\browser\lifecycle\tests\tree-snapshot.test.cjs testing\browser\lifecycle\tests\tree-terminate.test.cjs testing\browser\lifecycle\tests\tree-fuzz.test.cjs testing\browser\lifecycle\tests\windows.test.cjs testing\browser\lifecycle\tests\windows-real.test.cjs testing\browser\lifecycle\tests\real-tree.test.cjs
    Remove-Item Env:\U004_RED_IMPL, Env:\U004_NAIVE_MODE

Whitespace: `git -c "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol" diff --check -- testing\browser\lifecycle` (new files: after staging, `diff --cached --check`).

## API quick reference (for U005 to U008)

    const { snapshotTree, refreshTree, terminateOwned } = require('./tree.cjs');
    const { createWindowsAdapters } = require('./windows.cjs');
    const adapters = createWindowsAdapters();
    const child = spawn(...);                                            // the helper starts its process itself
    let snapshot = await snapshotTree(child.pid, adapters, { ownerPid: process.pid });   // right after the spawn: the root must be a verified child of the caller
    snapshot = await refreshTree(snapshot, adapters);                    // at checkpoints; orphans stay recorded only if recorded while their parent lived
    const result = await terminateOwned(snapshot, { timeoutMs: 30000, adapters });
    // result: { terminated, alreadyGone, survivors, refused, errors }; items are { pid, createdAt } plus reason (refused) or code and message (errors)

Errors carry `code`: `ERR_INVALID_ARG`, `ERR_ADAPTER`, `ERR_PROTECTED_ROOT` (the caller and its ancestors can never be a root), `ERR_UNVERIFIABLE_ROOT`, `ERR_NOT_CHILD`,
`ERR_TREE_TOO_LARGE` (default 512 processes), `ERR_PLATFORM`, `ERR_HELPER`, `ERR_TIMEOUT`, `ERR_OUTPUT`; `terminateOwned` reports `ERR_LIST`, `ERR_KILL`, `ERR_DEADLINE` inside `errors` instead of throwing.

## Specification to test map (`U004.feature`)

| Scenario | Tests |
| --- | --- |
| recorded tree holds exactly the live descendants | `tree-snapshot`: snapshot holds the root and every live descendant; real: the snapshot is exactly the owned tree |
| creation time not earlier than the parent | `tree-snapshot`: reused pid, exactly the creation time, cycle; `tree-fuzz` elders |
| orphans stay owned | `tree-terminate`: an orphan recorded while its parent lived; `tree-snapshot`: refresh; real: the orphan whose parent exited first |
| marked tree terminated, nothing else | real: every owned process is gone, same marker survives, same image survives, no kill outside the snapshot |
| stale identity refused | `tree-terminate`: live pid with another creation time, pid reused between verification and kill; real: refused and survives |
| one handle for verify and kill | `windows-real`: the real kill verifies the identity on the handle it terminates; a child that dies with its parent |
| already gone is not an error | `tree-terminate`: already exited, exits between verification and kill |
| bounded by a deadline | `tree-terminate`: survives every kill, slow list, failing adapters; `windows`: hung helper; `windows-real`: real deadline |
| caller and ancestors never ended | `tree-snapshot` and `tree-terminate`: protected |
| unverifiable refused | `tree-snapshot`, `tree-terminate`: unreadable creation time |
| mechanism bounded, no interpolation | `windows`: command line, standard input, script has no taskkill, Stop-Process, CIM or command line |
| twenty real runs | `tests\repeat-real.cjs` (evidence `green-04-repeat-20`) |

## Limits (what this does not prove)

- **Identity proves "the same instance", not "who made it".** (pid, creation FILETIME) read from one handle cannot match a different process. Ownership itself comes from how the snapshot was
  taken: the root pid from the caller's own `spawn` (pass `ownerPid`), descendants by parent id plus the creation-time rule. A process that forges its parent id, or is started through another
  broker (COM/DCOM activation, Task Scheduler, WMI, `start`, breakaway) is not a descendant and is never owned.
- **Discovery needs a live parent.** A process orphaned before the first snapshot cannot be found; snapshot right after the spawn and `refreshTree` at checkpoints. At termination only children of
  verified live owned processes are adopted; a child whose parent died after the last record and before the list is lost. A forged snapshot can only name identities that match live processes,
  but it is trusted: it is the caller's responsibility to build it with `snapshotTree`.
- **No job object.** Node cannot create one without native code, so there is no kernel guarantee that a tree cannot escape; a kill-on-close job would be the stronger mechanism if a native helper is ever
  allowed. libuv itself puts a non-detached Node child in a kill-on-close job of its Node parent, so ending a Node parent ends its direct children at once (reported `gone` when the child is already
  exiting); every hidden-console process also has a `conhost.exe` child, which is a descendant and owned. The fixtures spawn detached to build real orphans.
- **No path logic, so no junction logic.** Nothing compares an image path, directory or command line; a junction can neither make a process look owned nor hide one. Removing scratch directories is not part of this item (U006).
- **Handles.** `OpenProcess` for terminate can be denied (protected, elevated, other user or session): reported `error:open:5`, the process stays a survivor. A process whose creation time cannot be read
  has `createdAt: null` and is refused as unverifiable. `TerminateProcess` is a hard kill (no graceful exit, no cleanup of temp files).
- **Windows only.** Tested on Windows 11 Enterprise build 26300 with Windows PowerShell 5.1 and Node 22.23. `createWindowsAdapters` throws `ERR_PLATFORM` elsewhere. Constrained Language Mode or
  application control that blocks `Add-Type` makes every call fail closed (`ERR_HELPER`), never kill by another route. Endpoint protection may also treat a PowerShell P/Invoke of
  `TerminateProcess` as suspicious; the symptom is the same fail-closed error. The core is portable code but is only claimed for these adapters.
- **Cost.** One helper call is a PowerShell start plus an `Add-Type` compile: about 2 s on a quiet machine, 2 to 6 s with the machine at 100% CPU. A termination needs three calls (list, kill, confirming list),
  so give `timeoutMs` at least 30000. Identities are per boot and per run; never persist them.

## Evidence (all archived with `RUN\scripts\archive-run.cjs`: raw stdout/stderr, exit code and input hashes)

- `evidence\red\red-01` to `red-03`: the first RED, before any implementation existed (first test revision). GREEN then showed two facts the first fixture ignored: libuv's kill-on-close job and the `conhost.exe`
  children. The fixture and the real test were corrected (detached children, independent process table); `red-01` to `red-03` stay unchanged as history.
- `evidence\red\red-04` to `red-06`: the RED on the FINAL tests against `naive-impl.cjs.txt`: marker mode (47 tests, 39 failures: a same-marker look-alike dies, the stale identity is not refused, no
  alreadyGone/refused/deadline, no identity checks), tree mode (the orphan is missed) and image-name mode (the naive code tries to end the test runner and unrelated node processes; the guard stops it).
- `evidence\green\green-01-full-suite`, `green-02-coverage-tree`, `green-03-coverage-windows`, `green-04-repeat-20`, `green-05-full-suite-default-concurrency`; `evidence\green\mutation-1` to `mutation-4`: tree.cjs with one
  safety rule removed (`evidence\green\mutants\`); the hermetic tests fail every time.

## Results recorded in that evidence

| Check | Result |
| --- | --- |
| RED on the final tests (`red-04`, marker mode) | exit 1, 47 tests, 8 pass, 39 fail: 33 failed assertions plus 5 wrong-behavior exceptions thrown by the naive code where the specification wants a result or a coded rejection; no missing module, no syntax error |
| RED `red-05` (tree mode), `red-06` (image-name mode) | exit 1, real scenario: 4 and 6 of 9 fail (orphan missed, same marker killed, stale identity not refused, kills requested outside the snapshot) |
| GREEN whole suite (`green-01`, `green-05` at default concurrency) | exit 0, 47 of 47 |
| `tree.cjs` per file (`green-02`) | lines 100, branches 95.81, functions 100 |
| `windows.cjs` per file (`green-03`) | lines 100, branches 94.74, functions 95.83 |
| 20 repeated real runs (`green-04`, 776 s) | 20 of 20 exit 0, 9 of 9 tests each, 0 fixture processes left after any run (read-only scan), no flake |
| Mutation checks (`mutation-1` to `mutation-4`) | the hermetic tests fail against all four mutants (1 to 4 failing tests each) |

The embedded PowerShell and C# text of `windows.cjs` is exercised by the real adapter tests and the real scenario; Node coverage measures only the JavaScript around it.
