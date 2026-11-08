# U009: the shared coverage gate

One command checks the kanban *Coverage bar* for a namespace: every production file reaches at least 85 percent lines, 85 percent branches and 85 percent
functions, measured by Node's own coverage over an **enumerated** file set (a file that no test loads counts as 0/0/0, never as a pass).

```powershell
node testing\coverage\gate.cjs --root capability\C031 --json "c031-coverage-$([guid]::NewGuid().ToString('N')).json"
```

- stdout is one JSON document; a readable summary and progress lines go to stderr.
- Exit code `0` only on pass, `1` on any miss (also an unclassified file, a failed, hung or empty test run, **and an internal error of the gate itself**), `2` on a usage error.
  Every error becomes a typed failure report on stdout (`{ schema, pass: false, error: { code, type: "usage" | "internal", message } }`) whatever `NODE_OPTIONS` says about unhandled rejections.
- **`pass` is relative to the options.** `--min` below 85, `--include` and `--exclude` give `pass: true` for a lower bar or a subset. The report therefore carries `fullBar`:
  `true` only for the full 85 bar (a `--min` of 85 or more) over the full namespace (no `--include`, no `--exclude`); `fullBarReasons` says why not. A consumer that accepts a card reads `pass` **and** `fullBar` (see U013 below).
- Zero-credit tooling item U009 (kind unblock, entry gate U003). Local and synthetic: Node built-ins only, no browser, no network, no packages.
  Written and measured on Node v22.23.4 (its lcov and TAP reporters; other majors print other reports).
- It passes its own gate and reproduces the reviewer figures for `capability\C031` (see [Evidence](#evidence)).
- Fixed after the independent review of the first publication (commit `8cfdce17f62c`): five majors F1 to F5 and eight minors m1 to m8, see [Fix run R2-U009](#fix-run-r2-u009-after-the-independent-review).
- Fixed again after the second independent review (the first fix, commit `85ee70a3d4c9`, was rejected on two hermeticity majors N1 and N2 and nine smaller findings N3 to N11): see [Fix run R3-U009](#fix-run-r3-u009-after-the-second-independent-review).
- U041 repairs the existing merged U041/U042/U043 residuals through an append-only authority chain; it earns no new credit. See [U041 current authority](#u041-current-authority-and-verification).

## Commands

Run everything from the repository root in PowerShell. PowerShell does not expand `*` for native programs: quote globs, the gate and Node expand them.

| Purpose | Command |
| --- | --- |
| Measure a namespace | `node testing\coverage\gate.cjs --root <dir> [--tests <files or globs...>] [--min 85] [--json <out>] [--include <glob...>] [--exclude <glob...>] [--timeout <seconds>] [--jobs <n>] [--scratch <dir>] [--manifest <file>]` |
| Help | `node testing\coverage\gate.cjs --help` |
| The full self-gate runs the strict suite nine times and enables the expensive hermetic checks in every child; `--jobs 3` overlaps those runs (take a heavy slot) | `node testing\coverage\gate.cjs --root testing\coverage --scratch <dir> --jobs 3` |
| Per-file L-0004 by hand, one command per file (see below) | `node --test --test-concurrency=1 --experimental-test-coverage --test-reporter=tap --test-coverage-include=testing/coverage/gate.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 "testing/coverage/tests/*.test.cjs"` |
| GREEN: the default suite explicitly skips six opt-in hermetic copies. The pre-U041 reviewer scope was 183 tests in 19 files, 224 to 441 s with other agents running; current before/after figures are recorded separately below | `node --test --test-concurrency=1 "testing/coverage/tests/*.test.cjs"` |
| Full strict suite, including all six expensive copy/tamper checks | `$env:U009_HEAVY_HERMETIC = '1'; node --test --test-concurrency=1 "testing/coverage/tests/*.test.cjs"` (unset it afterwards) |
| Historical capture switch: relaxes archive completeness and, when heavy checks are enabled, skips five tamper cases. U041 does not use it for reported GREEN | `U009_EVIDENCE_CAPTURE=1` is never a reported-GREEN setting |
| Strict evidence: enables all eight `fix2-hermetic` checks, validates current amendment authority, and compares historical inputs with immutable accepted git blobs (needs those local commits; no network) | `node testing\coverage\tests\strict-evidence.cjs` (stdout is JSON, exit 0 only when every check passes) |
| RED replay of the first publication against the naive stub (exit 1, 7 of 7 fail by assertion) | `node --test --test-concurrency=1 testing\coverage\evidence\red\gate.red.test.cjs` |
| RED replay of the first fix run (R2-U009): each of the 6 archived REDs now passes, the same unchanged test file | `node --test --test-concurrency=1 testing\coverage\tests\fix-f1-env.test.cjs` (and `fix-f2-exit`, `fix-f3-stale`, `fix-f5-json`, `fix-minors`; `fix-f4-glob` was rewritten by R3-U009, see below) |
| R3-U009 retained RED versions stay immutable. U041 supersedes two current test files through exact digests, without rewriting those historical versions | Current checks: `node --test --test-concurrency=1 testing\coverage\tests\fix-f4-glob.test.cjs testing\coverage\tests\glob.test.cjs testing\coverage\tests\fix2-json.test.cjs`; add `U009_HEAVY_HERMETIC=1` for `fix2-hermetic` |
| Mutation check (78 mutants, each must be killed by a named assertion, about 25 minutes) | `node testing\coverage\evidence\fix2\mutation\mutants.cjs --scratch <dir>` (`--check` only verifies that the mutants apply, `--only id,id` runs some) |
| Whitespace of the published files | `git -c "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol" diff --check -- testing/coverage` (after the files are staged or committed) |
| Real isolated headless Edge observation | not applicable: this tool has no page and no browser code |

Per-file L-0004 for every production file of this namespace (9 commands, each prints one table row of at least 85/85/85 and exits 0):

```powershell
foreach ($file in 'command', 'enumerate', 'errors', 'evaluate', 'gate', 'glob', 'output', 'report', 'runner') {
  node --test --test-concurrency=1 --experimental-test-coverage --test-reporter=tap `
    "--test-coverage-include=testing/coverage/$file.cjs" --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 `
    "testing/coverage/tests/*.test.cjs"
}
```

Reproduce the reviewer figures for `capability\C031` with C031's own selection of tests (every `tests\*.test.cjs` except `integrity.test.cjs` and
`evidence.test.cjs`, exactly as its `tests\coverage.cjs`); the gate only reads C031:

```powershell
$tests = Get-ChildItem capability\C031\tests -Filter '*.test.cjs' | Where-Object { $_.Name -notin 'integrity.test.cjs', 'evidence.test.cjs' } | ForEach-Object { "capability\C031\tests\$($_.Name)" }
node testing\coverage\gate.cjs --root capability\C031 --tests $tests --scratch <dir> --json <out.json>
```

Without `--tests` the default discovery also runs C031's `integrity.test.cjs` and `evidence.test.cjs` (12 test files, 211 tests) and gives the same figures:
`node testing\coverage\gate.cjs --root capability\C031 --scratch <dir>`.

## What it measures

1. **Enumerates** the production files under `--root` (rules below) and prints the list, so a reviewer can compare it with their own.
2. **Resolves the tests**: `--tests` (files or globs, relative to the current directory) or the namespace's non-browser `*.test.{cjs,js,mjs}` files directly inside
   `tests\`, `test\` or the root (a file name with `browser` in it is skipped). A missing test file, a glob that matches nothing or no test at all fails **every** file.
3. **Runs one L-0004 command per production file**, never one command with several includes (that would check only the aggregate row and hide a weak file, L-0100):

   `node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=<file> --test-coverage-lines=<min> --test-coverage-branches=<min> --test-coverage-functions=<min> <tests>`

   plus the `tap` and `lcov` reporters, which change no measurement. The child starts in the repository root with `NODE_TEST_CONTEXT` removed in every letter case
   (L-0002: otherwise a nested `node --test` prints no summary and exits 0 although a test fails) and `NODE_V8_COVERAGE` set as an **own property whose value is `undefined`**,
   `TEMP`/`TMP`/`TMPDIR` pointing into the per-run scratch directory, and a hard timeout (`--timeout`, default 900 s) that ends only the process tree this gate started
   (`taskkill /PID <pid> /T /F` on Windows, the process group elsewhere), never a process by name.
   *Why an own `undefined` and not a deleted key (F1 of the review of the first publication, whose README and code comment claimed the key was removed):* `child_process.spawn` copies the
   parent's `NODE_V8_COVERAGE` into every env object that has no OWN property of that name, so a deleted key still reached the child, and the `node --test` runner then moved the raw V8 coverage of the
   measured namespace into the CALLER's coverage directory (an outer coverage run that wraps the gate, such as U010 or U013, got its directory polluted and inflated). An own property set to `undefined`
   is skipped when the child's environment block is built. `tests\fix-f1-env.test.cjs` proves it with real processes: under an outer `NODE_V8_COVERAGE=<dir>` the only V8 coverage file in `<dir>` is the one of the gate process itself.
   An override passed to `buildEnvironment` (`{ NODE_V8_COVERAGE: '<dir>' }`) replaces the marker, so a later item can still give a child a coverage directory of its own choosing.
4. **Reads exact counts from lcov** (covered and total per metric are integers) and cross-checks them with the table that Node prints in the same run: a difference of more than
   the table's two-decimal rounding fails the file. A file that no test loaded has no lcov record: Node prints no row and still exits 0 (L-0003, L-0043), the gate reports it
   `loaded: false` with `0/0/0`.
5. **Evaluates strictly with integers**: `covered * 100 >= min * total` for lines, branches and functions. Nothing is rounded up: 861 of 1013 lines is 84.9951 percent, which Node's table prints as
   `85.00` but which fails. A file at exactly the minimum passes. A run that failed, timed out, was killed, printed no test summary, ran 0 tests or passed none fails every file it covers even at 100 percent.
   Node exiting non-zero while the exact counts meet the minimum is reported as a disagreement, never as a pass.

### Enumeration rules

`.js`, `.cjs` and `.mjs` files below `--root` are the candidates. Directories named `node_modules` (in any letter case) or starting with `.` are never entered and are listed under `skippedDirectories`; links are never followed.

| Verdict | Rule |
| --- | --- |
| excluded by rule (listed with its reason) | a `tests`, `test` or `__tests__` directory; `*.test.*`, `*.spec.*`, `*-test.*`, `test-*`, `test.*` (the names Node itself leaves out of coverage); an `evidence` or `fixtures` directory; `*.d.ts`; generated pins `*.pin.*`, `*.pins.*`, `*.snapshot.*`, `*.generated.*` |
| **unclassified, the gate fails** | verification tooling by name (`verify`, `capture`, `seal`, `evidence-tool`, `*.check.*`: kanban says the card's manifest names those files); a script type that Node coverage cannot measure (`.ts .tsx .mts .cts .jsx .ps1 .psm1 .py .sh .bat .cmd`); a link |
| production | every other candidate |

Only an explicit decision classifies an unclassified candidate: an entry of `coverage.manifest.json` in the root, or `--exclude <glob>` on the command line (recorded in the report as `by: cli`).

### `coverage.manifest.json`

```json
{
  "schema": "U009-coverage-manifest/1",
  "production": ["verify.cjs"],
  "exclude": [ { "file": "tools/**", "reason": "Why this is not production code." } ]
}
```

Paths and globs are relative to the root (`*` inside a segment, `**` across segments, `?` one character; nothing else). The manifest wins over the built-in rules; a file listed as production and as excluded, an exclude
without a reason, an unknown key, a path with `..` or an unsupported glob character is a usage error (exit 2). An entry that matches no file is reported under `warnings`. `testing\coverage\coverage.manifest.json` is the working example (it classifies the fixtures and the evidence).
`--manifest <file>` reads the manifest from another place, for a namespace that cannot take a new file (some accepted namespaces hash every file below them, L-0024, L-0067).

## Report

`{ schema: "U009-coverage-gate/1", root, node, min, files: [{ file, lines, branches, functions, loaded, ok, reason, counts, table, command, nodeExit, tests, failedTests }], unclassified: [{ file, reason }], excluded: [{ file, by, reason }], skippedDirectories, notConsidered: [{ extension, count, files, scriptLike }], tests, filters, timeoutMs, warnings, errors, fullBar, fullBarReasons, pass }`

- `lines`, `branches`, `functions` are percentages with their exact decimals; `counts` holds `[covered, total]` per metric; `reason` is `null` for a file that passes.
- `pass` is true only when every file is `ok`, nothing is unclassified and at least one production file was measured (a gate over nothing is not a pass).
- `fullBar` is true only for the full 85 bar (`--min` 85 or more) over the full namespace (no `--include`, no `--exclude`); `fullBarReasons` lists what narrowed the run (m6). A repeated scalar flag (`--min 0 --min 85`) is a usage error, never "the last value".
- `notConsidered` lists, by extension, every file the walk saw that is no candidate (`.json`, `.md`, `.html`, `.vbs`, ...) with a count, up to five examples and `scriptLike` (script types that no rule reads, an HTML page with inline scripts included): the report shows what was **not** looked at (m2).
- **`--json <out>` or `--json=<out>`: the same document is written to `<out>` (relative to the current directory), under a rule (F3, F5, N3, N4).** Only a new file or a previous gate report (JSON that carries this schema) is ever replaced.
  Refused with exit 2, before anything is written or started: an existing file that is not a gate report (a source file, a text file, any other JSON), a directory, a link, a file with more than one hard link, a device name (`NUL`, `CON`, `nul.json`, `\\.\...`), an alternate data stream
  (`x.json:s`), a trailing dot or space, and a script name (`.js .cjs .mjs .ts .ps1 ...`, which would be enumerated as production code). A repository confinement is not the rule: reviewers keep their scratch outside the repository.
  Both spellings use one scalar parsing rule; both empty values are usage errors, and mixed repeated spellings are refused. A `{ pass: false, status: "started" }` marker is written first, and the final report replaces it. Usage and internal errors replace a writable report path except `REPORT_CHANGED`,
  which reports the displaced writer's failure only on stdout and leaves the other writer's marker or final report untouched. A usage error in `--min` still reaches the named paths because both spellings are scanned first. `--help` next to `--json` writes a `{ pass: false, status: "not-run" }` report there and still exits 0.
  **Every run should use its own unique `--json` path.** Two concurrent passing gates sharing one path can produce one displaced writer (exit 1, `REPORT_CHANGED`) and one winner (exit 0); the loser must not replace the winner. The two-real-gate tests cover both completion orders after explicit started-marker barriers.
  A read-only previous report is removed and replaced. A crash that kills the process leaves the started marker, which is a failure, never the previous pass.
  **What this cannot cover** (N3, N6b): a path whose folder the gate cannot write to, or a file that it can neither replace nor remove, keeps its bytes (the exit code and the typed report on stdout still say so); another spelling (`--JSON`, `-json`) is an unknown argument that names no path; a file name that starts with two dashes can only be named as `--json=<path>`; a crash before the marker is written leaves the earlier file. Read `$LASTEXITCODE` first, always.
  **Replacement is by name, never through a link** (N4): every write goes to `<out>.<pid>-<random>.tmp` (exclusive create) and replaces `<out>` by rename, and the final write first checks the target again: a regular file, one link, a gate report and the very file (volume and file id) that the gate wrote at the start.
  A hard link or another file put at the name during the run is refused at the final write, never written through; `REPORT_CHANGED` (exit 1) does not replace that file. A process with write access to the folder can still swap the name between that check and the rename: that cannot be made atomic, but the swap can no longer redirect the write into another file. A killed run can leave a `<out>.<pid>-<random>.tmp` beside the target.
- A failure report is `{ schema, pass: false, error: { code, type, message } }`: `type` is `usage` (exit 2) or `internal` (exit 1, for example `EEXIST` when `--scratch` names a file).

## Limits (read before trusting a number)

- **Browser-only scripts are measured only when a Node test loads them**: with a DOM stub or `vm.Script(source, { filename })` (L-0044, L-0053). Real browser V8 coverage is U010.
  A page script that no Node test loads is an unloaded file: 0 percent, a failure, never an exclusion.
- **Node's semantics apply**: Node counts no branches inside a function that is never called, a metric with nothing to count (no functions, no branches) is 100, and only files that a test loads
  are reported (hence the enumeration). Coverage of a file loaded only by a child process that a test spawns is merged by Node, because the nested `node --test` run sets its own `NODE_V8_COVERAGE` for the test processes it starts (never the caller's, see item 3).
- **PowerShell, TypeScript and shell scripts are not measured**: they fail as `unclassified` until a manifest entry excludes them with a reason (L-0060 asks for PowerShell coverage as a later item).
- **Cost**: the whole test set runs once per production file (the price of one L-0004 command per file); `--jobs <n>` runs files in parallel, `--tests` narrows the suite. Take a heavy slot for a whole namespace.
  Before U041, the independent reviewer measured 224 to 441 s for the 183-test, 19-file suite with other agents running. The nine-file self-gate repeats that selected suite nine times; this is a work multiplier, not a wall-clock bound. The earlier 886 s self-gate and 25-minute hand-run figures are historical captures, not current predictions.
  U041's default omits six expensive hermetic copies; the full self-gate and strict evidence still enable them. Current measured runtime and exact before/after scope are recorded in the U041 section, without a time-based test threshold.
- Tests are an input: the gate trusts the namespace's tests and its own enumeration rules; a namespace whose tests are not hermetic gets the figures of the tests it has.
- `--min` is an integer from 0 to 100 because Node's threshold flags are integers.
- The default scratch folder is `testing\coverage\.scratch` (hidden, never enumerated). The gate removes its per-run `u009-*` directory and, when it created the scratch parent (and the folders above it) itself, those too, so an
  empty `.scratch` is no longer left behind (m4); a parent that already existed or holds anything else stays. A run that is killed leaves its `u009-*` directory, which is harmless and untracked: delete it by hand, and
  never pass the whole `testing\coverage` folder to a publisher while one exists. The test suite removes its own `.scratch\work` the same way. Pass `--scratch` to use another place. Two gate runs that share the default parent can still leave an EMPTY `.scratch` behind (N10: the run that
  found the folder existing does not remove it); it is untracked and harmless, delete it by hand.
- **Glob scan/closure work is linear and bounded (F4, N1, U041).** `*`, `**` and `?` are matched by an automaton, not a RegExp: the scan/closure counter increments inside the actual token iterations and costs at most `tokens x (1 + 2 x characters)` steps (`compileGlob(pattern).measure(path)` returns the answer with its steps, tokens and the characters it read;
  `tests\fix-f4-glob.test.cjs` bounds the steps of the reviewer's hostile patterns and compares them with a naive backtracking matcher that counts its calls, with no clock anywhere), a pattern may have at most 1024 characters, and a name that leaves no live state stops the match at once.
  The work of the enumeration is therefore linear in entries x files x pattern length x path length, and there is **no cap on the number of manifest entries** or of command-line patterns: the reviewer measured 200 manifest entries of 1002 characters against 300 files of 63 characters at 3.7 s,
  so a hostile manifest can make the enumeration slow, never exponential. Differences from the old translation: none for ordinary patterns (a seeded differential test of 6000 cases), except that `**` also matches a line break in a name.
  The counter does not claim to count arbitrary inserted work. `u041-real-work.test.cjs` observes actual native scan-buffer-clear calls and kills both exact reviewer hidden-rescan mutants A08/A09 by name; `u041-work.test.cjs` independently compares actual CPU usage with a naive control on the same 1024-character input, never elapsed time.
- **`fullBar` ignores `--manifest`** (N6d): an external manifest that excludes a file still gives `fullBar: true` (the exclusion is listed under `excluded` with `by: manifest`); only `--min`, `--include` and `--exclude` narrow it. A consumer that needs the namespace's own classification must not pass `--manifest`.
- **The gate does not sanitize `NODE_OPTIONS` on purpose** (N9): a `--require` preload runs in the gate, in the test runner and in every test process, and a hostile preload that sets `process.exitCode = 0` at exit makes a failing namespace exit 0. The caller chooses its own environment, so this is outside the guard: U013 and every caller must not run the gate under a foreign `NODE_OPTIONS`.
- **What `pass` means:** the full 85 bar over the full namespace only when `fullBar` is true. `--exclude` also silences UNCLASSIFIED for the files it names (documented, recorded as `by: cli`).
- A zero-byte file that a test loads has no lcov record (Node writes none), so it fails with its own reason ("empty file (0 bytes)") instead of "not loaded by any test" (m3). A comment-only or whitespace-only file is measured 100/100/100.
- Left as it was, on purpose: PowerShell coverage (L-0060, a later item), a hand-crafted junction or link inside a namespace is reported as an unclassified link and never followed, `--manifest` for sealed namespaces.
- Very long test lists can exceed the Windows command-line limit; the run then fails with the spawn error, never silently.

## Extending it (U010, U013, U014)

Ordinary extensions add files that `require` these modules. Replacing an accepted file additionally requires a reviewed, consecutive append-only authority amendment; historical seals are never rewritten. Publication remains controller-owned.

| Module | Pure functions (all exported) |
| --- | --- |
| `enumerate.cjs` | `enumerateRoot(root, { include, exclude })`, `enumerate(listing, manifest, filters)` (also returns `notConsidered`), `classifyFile`, `parseManifest`, `loadManifest`, `walkTree`, `resolveTests`, `defaultTests`, `expandGlob` |
| `glob.cjs` | `compileGlob(pattern)` (a linear matcher with `.test(path)` and `.measure(path)`, which returns `{ matched, steps, tokens, consumed }`; `globToRegExp` is the old name for the same function and no longer returns a RegExp), `matchesGlob`, `hasMagic`, `normalizePattern` |
| `command.cjs` | `buildCommand({ cwd, file, tests, min, lcov })`, `buildEnvironment(env, overrides)` (the object carries an OWN `NODE_V8_COVERAGE: undefined`: hand it to `child_process` only), `visibleEnvironment(env)` (what a child really receives), `includePattern`, `argumentPath` |
| `output.cjs` | `checkReportTarget(path)`, `writeReportFile(target, document, { expected })` (temporary file plus rename; returns the identity of the file written, which `expected` verifies before the next write), `startedReport`, `notRunReport(message)`, `failureReport(error)`, `scanJsonTargets(argv)` (both spellings), `specialNameProblem` |
| `report.cjs` | `parseLcov`, `parseTapSummary`, `parseTapTable`, `parseTapFailures`, `selectRecord`, `percentOf`, `meetsMinimum` |
| `evaluate.cjs` | `evaluateFile`, `unrunFile`, `judgeRun`, `buildReport`, `formatSummary` |
| `runner.cjs` | `runProcess` (resolves, never rejects), `killTree` |
| `gate.cjs` | `parseArgs`, `runGate(options, deps)`, `main(argv, io)` (never rejects: every error is a typed report and an exit code), `entry(argv, hooks)`; `deps.run` and `deps.nodeExecutable` are injectable |

- U010 (browser V8 coverage): wrap `deps.run` to add a preload or `NODE_OPTIONS` and merge line data with its own parser; `parseLcov` returns integer totals only, so a union merge needs a new parser for the `DA`, `FNDA` and `BRDA` records.
  To give a child a V8 coverage directory of your own, pass `{ NODE_V8_COVERAGE: '<dir>' }` as an override of `buildEnvironment`; never rely on a deleted key (see item 3 above).
- U013 (`state.ps1` Accept): run `node testing\coverage\gate.cjs --root <ns> --json <path> 2>$null | Out-Null`, then **check `$LASTEXITCODE` first** (0 pass, 1 miss or internal error, 2 usage error), then read `<path>`:
  use a unique report path for every run; on `REPORT_CHANGED` the other writer's report remains intact, and is not evidence for this displaced run.
  accept only when `pass` is true **and `fullBar` is true** (`--min`, `--include`, `--exclude` make `pass` relative to the options), then `files[].counts` and `unclassified`. The path does not keep an older result (a started marker, the final report,
  a failure report or a not-run report replace it; see the limits of `--json`), but the exit code stays the first signal. Never run the gate under a foreign `NODE_OPTIONS` (see the limits). The run takes minutes, so do it before taking the State mutex, never inside its 8 s wait.
- U014 (board lint): `enumerateRoot(root)` lists production files, exclusions and unclassified candidates without running a test, in milliseconds.
  A read-only survey with it over the 190 namespaces of this checkout (586 production files) shows 52 namespaces with unclassified candidates: 57 tooling-named files in 41 namespaces and 18 PowerShell files in 11 namespaces.
  Each needs a manifest entry (or `--manifest`) before the gate can pass it; no namespace lacks default tests (the 43 older ones keep their tests at the root).

## Evidence

All archived with the shared recorder (`RUN\scripts\archive-run.cjs`): one manifest JSON per run (command, exit code, SHA-256 of every input) plus gzip transcripts under `raw\`; `evidence\.gitattributes` keeps every byte as written.
**Three generations**, each pinning the bytes of its own accepted commit and each kept unchanged once recorded:

| Generation | Where | Accepted commit and tag | Pins |
| --- | --- | --- | --- |
| first publication | `evidence\red\red-01-behavior.json`, `evidence\green`, `evidence\coverage`, `evidence\c031`, `evidence\mutation` (14 recorder manifests) | `8cfdce17f62c`, tag `kanban/U009/8cfdce17f62c` | the bytes of that commit |
| first fix | `evidence\red\fix-*` (6 REDs) and `evidence\fix\` (20 manifests) | `85ee70a3d4c9`, tag `kanban/U009/85ee70a3d4c9` | the bytes of that commit, except the 6 REDs, which pin first-publication bytes for the 6 files the fix changed |
| second fix (R3-U009) | `evidence\red\fix2-*` (3 REDs and the superseded first RED of N3 and N4) and `evidence\fix2\` (17 pinned manifests, the green run, the gate's own reports, the mutation tool, the loop summaries) | this fix's own commit (it cannot name itself; see the limits below) | the bytes of this checkout, for every input inside `testing\coverage` |

The accepted commit that every C031 run measured is `09297317f706518687b6c672a542c8f46f32483e` (tag `kanban/C031/09297317f706`); `git status --porcelain -- capability/C031` stays empty during every run.
**A pilot run of C031 was discarded**: it was made on the code before the last four refinements of the first publication and was thrown away unpublished because its gate hashes no longer matched; that is why the published C031 runs of the first generation are numbered 2 and 3.
The first fix numbers its C031 runs 4 and 5, the second fix 6 and 7; neither has a discarded run. One honest gap of the first fix: its default-discovery run `c031-run-5` ran 12 test files of C031 but lists only 10 of them among its inputs (`tests\evidence.test.cjs` and `tests\integrity.test.cjs` of C031 are missing from its hash list); the second fix's `c031-run-7` lists all 12.

**How the evidence is checked (N2, N5).** `tests\evidence.test.cjs` is hermetic: it reads only files **inside** `testing\coverage` (its own manifests, transcripts, README, `.gitattributes`, sources) and never a file of another namespace, so it passes in a copy of the namespace that has no `capability\C031` and no `.git`
(`tests\fix2-hermetic.test.cjs` proves it by running the real test file in such a copy). For the external inputs of the C031 manifests it verifies the **recorded identity**: exactly the pinned list of 20 (default discovery: 22) C031 files with well-formed digests, the gzip transcript of the gate's report, whose root, test files, production files and exact counts must agree with that list and with the reviewer figures,
and this README naming the accepted C031 commit. It pins the expected archives **by name and count** (`tests\evidence-pins.cjs`: 14 + 26 first-generation and first-fix manifests, and for this fix 3 replays, 9 L-0004 runs, 1 self-gate run, 2 C031 runs, 1 mutation run, 1 strict run and 3 REDs): a missing or an unexpected archive fails the suite, it never skips.
The **strict mode** (`node testing\coverage\tests\strict-evidence.cjs`, never part of the suite because its name does not end in `.test.cjs`) re-verifies against `git cat-file blob <commit>:<path>`, not the working tree, the C031 inputs of every manifest and the inputs inside `testing\coverage` of the retained generations (any accepted U009 commit); the archived run is `evidence\fix2\strict\strict-run-01.json`.
**Capture switch (`U009_EVIDENCE_CAPTURE=1`):** while the final archives are being recorded the newest generation is incomplete by design, so this variable skips ONLY the requirement that it is complete (and the 5 tamper cases, which need the complete set); everything that exists is still verified. The default is strict, the archives of the L-0004, self-gate, C031, mutation and replay runs were recorded with the switch set (their manifests list it under `environmentAdded` where the recorder sees it), and the final GREEN suite and the busy-machine loops were run without it.
**Honest limits.** A consistent rewrite of the README, the tests and the pins is not detectable by any test in the repository: only git history against the accepted commits shows it. The tests compare line-ending-normalized hashes (a CRLF to LF change of a pinned file is invisible; the raw hash is in each manifest and `.gitattributes` keeps the bytes). The recorder manifests are self-attested by a script that lives outside the repository.
The archives of the second fix cannot pin the commit that contains them; the evidence test of a later checkout therefore compares them with that checkout and the strict mode compares the older generations with git.

That last sentence describes the original R3 authority. U041 preserves those manifests and resolves their exact historical inputs through retained originals; a separately pinned checker verifies every current accepted/amended source before those originals can be used. Strict evidence additionally checks the 37-file original surface against the exact accepted R3 commit, not HEAD.

**RED** (before any implementation): `evidence\red\red-01-behavior.json` archives `node --test --test-concurrency=1 testing\coverage\evidence\red\gate.red.test.cjs`
against the naive loadable stub `evidence\red\gate.stub.cjs` (it runs the L-0004 command per script with the inherited environment and trusts Node's exit code): 7 tests, 7 failures, exit 1.
Every failure is an assertion about the specified behavior (an unloaded file must fail, 84.9 percent must fail with its exact decimals, a failing nested test under an inherited `NODE_TEST_CONTEXT`
must fail, a missing test file must be named, an unclassified file must be listed, no tests must fail, the JSON shape), none is a missing module or a syntax error. Inputs are hashed in the manifest.

**GREEN** (first publication): `evidence\green\green-01-suite.json`: the whole suite, 93 tests, 93 pass, exit 0.

**The gate passes its own gate** (first publication, 8 production files): `evidence\coverage\self-gate-run-1.json` (the recorder manifest) and `evidence\coverage\self-gate-report.json` (the gate's own JSON): `pass: true`, nothing unclassified.

| File | Lines | Branches | Functions | Hand-run L-0004 |
| --- | --- | --- | --- | --- |
| `command.cjs` | 100 | 100 | 100 | `evidence\coverage\l0004-command.json` |
| `enumerate.cjs` | 100 | 99.40 | 97.22 | `evidence\coverage\l0004-enumerate.json` |
| `errors.cjs` | 100 | 100 | 100 | `evidence\coverage\l0004-errors.json` |
| `evaluate.cjs` | 100 | 100 | 100 | `evidence\coverage\l0004-evaluate.json` |
| `gate.cjs` | 100 | 100 | 100 | `evidence\coverage\l0004-gate.json` |
| `glob.cjs` | 100 | 100 | 100 | `evidence\coverage\l0004-glob.json` |
| `report.cjs` | 100 | 97.73 | 100 | `evidence\coverage\l0004-report.json` |
| `runner.cjs` | 100 | 100 | 100 | `evidence\coverage\l0004-runner.json` |

The gate and the hand-run L-0004 commands read the same exact counts (for example `enumerate.cjs` branches 165 of 166, functions 35 of 36).

**The reviewer figures for `capability\C031` are reproduced**, read-only (`git status --porcelain -- capability/C031` stays empty). `evidence\c031\c031-run-2.json` (C031's own 10 test files, 199 tests) and
`evidence\c031\c031-run-3.json` (no `--tests`: the default discovery runs all 12 non-browser test files, 211 tests) give the same figures; the gate's JSON is next to each manifest (`*-report.json`):

| File | Lines | Branches | Functions | Counts (lines, branches, functions) |
| --- | --- | --- | --- | --- |
| `cli.cjs` | 100 | 100 | 100 | 33/33, 18/18, 3/3 |
| `evaluator.js` | 100 | 99.76 | 100 | 490/490, 416/417, 78/78 |
| `page.js` (DOM stub in `tests\page.test.cjs`) | 100 | 97.10 | 100 | 122/122, 67/69, 15/15 |
| `saved.js` | 100 | 100 | 100 | 161/161, 5/5, 2/2 |
| `source.cjs` | 100 | 100 | 100 | 69/69, 41/41, 13/13 |

Every input hash in the first-generation manifests equalled the bytes of commit `8cfdce17f62c`; the C031 manifests also hash the C031 files that the run reads, which stay untouched.

**Mutation check** (first publication; `evidence\mutation\mutants.cjs`, archived run `evidence\mutation\mutation-01.json`): 23 one-expression mutants of the production files (rounded comparison, vacuous metric as 0,
unloaded file passes, no summary passes, zero tests pass, unclassified ignored, empty gate passes, inherited `NODE_TEST_CONTEXT`, usage error exits 1, links followed, glob `*` across segments, ...), each applied to a scratch copy of the
namespace: baseline 93 of 93 pass, **23 of 23 mutants killed** by named tests (a kill was any non-zero exit: the review found that one of them, N16, only cancelled subtests, which the fix run's tool no longer counts). Replay: `node testing\coverage\evidence\mutation\mutants.cjs --scratch <dir>` against the first publication's bytes only (about 3 minutes); on the current files use the tool in `evidence\fix\mutation\`.

**Refinements after the first GREEN** (each has its tests in the final suite; they were not part of the RED): `--manifest <file>`, root-level `*.test.*` files in the default test discovery,
`*.d.ts` excluded by rule (the `.d.ts` files that sit next to production scripts in many namespaces hold no executable code), and progress lines on stderr.

## Fix run R2-U009 (after the independent review)

The independent review of the first publication found no false pass, but five majors in the guard itself and eight minors. Each major has a NEW archived behavioral RED (written and archived before any fix, against the unfixed gate), a root-cause fix, and a
GREEN replay of the same unchanged test file on the final code. REDs (`evidence\red\`, one folder each, a recorder manifest `red-01-*.json` and its gzip transcripts):

| Finding | Behavioral RED (fails by assertion on the unfixed gate) | Root-cause fix | Tests |
| --- | --- | --- | --- |
| **F1** the `node --test` child inherits the caller's `NODE_V8_COVERAGE` (README and code comment claimed otherwise) | `fix-f1-env-00c94491-c97f-4fb9-bde8-88b9f54f3c88`: a real child sees the variable; under an outer `NODE_V8_COVERAGE=<dir>` the runner of the gate writes coverage into `<dir>` | `buildEnvironment` sets an own `NODE_V8_COVERAGE: undefined` (item 3 above) | `fix-f1-env`, `command` |
| **F2** exit 0 after an internal error under `NODE_OPTIONS=--unhandled-rejections=warn\|none` | `fix-f2-exit-807ad2c8-e754-4a3c-a02f-31629901e3aa`: exit 0 with empty stdout (4 modes) | `main` catches everything: typed failure report, exit 1 (2 for usage); `entry` catches a rejection of `main` | `fix-f2-exit`, `gate`, `gate-fixes` |
| **F3** a stale `pass: true` survives a usage error or a crash at the same `--json` path | `fix-f3-stale-fce42585-dca9-4e36-bb27-2d02605f9a35`: one path reused across pass, usage error, crash | started marker first, failure report on every error path, every `--json` value scanned before parsing | `fix-f3-stale`, `gate-fixes`, `output` |
| **F4** the glob matcher is a backtracking RegExp (hours for a 60 character name) | `fix-f4-glob-8810ad5d-ee35-41ed-975c-9b67390b1a96`: the reviewer's patterns do not finish in 6 s, the CLI is killed after 30 s through `--exclude` and through `coverage.manifest.json` | a linear automaton (`glob.cjs`), 1024 character pattern limit, seeded differential test against the old semantics | `fix-f4-glob`, `glob` |
| **F5** `--json` is unconfined and overwrote a production source file | `fix-f5-json-7117c5ca-a098-4eff-8bc3-3739225c28ed`: a source file, a text file, other JSON, a directory, `NUL`, a script name | `output.cjs checkReportTarget`: only a new file or a previous gate report is replaced | `fix-f5-json`, `output`, `gate-fixes` |
| m2 m3 m4 m6 m8 | `fix-minors-e24b5ec1-835f-4656-a181-3d39df71bdbe` (7 tests, 7 failures) | `notConsidered` list, empty-file reason, scratch folders removed, repeated scalar flags refused and `fullBar`, `Node_Modules` case folded | `fix-minors`, `gate-fixes`, `evaluate` |

The other minors: **m1** (mutant N06, `TABLE_TOLERANCE` 0.0051 to 0.5 survived) has a boundary test of the lcov-versus-table cross-check in `tests\evaluate.test.cjs`. **m5** README and `evidence\.gitattributes` are pinned by the final archives
and the discarded pilot run is disclosed above. **m7** the mutation tool counts a kill only when a named assertion fails (a mutant that only cancels subtests or times out is reported as such), and the grace-timer guard test of the runner (the old mutant N16) now races the call
against a timer and asserts, with explicit per-test timeouts on the process tests. Left as it was: the gate does not open an HTML file to look for inline scripts (it lists the file type under `notConsidered`, browser coverage is U010).

Final archives (all under `evidence\fix\`, captured last on the published bytes; every input is hashed, README included):

- **GREEN replay of each RED, the same unchanged test file on the final code**: `evidence\fix\replay\replay-01-f1-env.json`, `replay-01-f2-exit`, `replay-01-f3-stale`, `replay-01-f4-glob`, `replay-01-f5-json`, `replay-01-minors`, each exit 0.
- **GREEN, the whole suite**: `evidence\fix\green\green-02-suite.json` (151 tests, none skipped, exit 0; captured last, so the sealed evidence check of `tests\evidence.test.cjs` runs in it).
- **Per-file L-0004, one command per file** (`evidence\fix\coverage\l0004-<file>.json`, lines/branches/functions as Node prints them; the gate reads the exact counts from lcov): `command.cjs` 100/100/100, `enumerate.cjs` 100/99.42/97.37, `errors.cjs` 100/100/100,
  `evaluate.cjs` 100/97.96/100, `gate.cjs` 100/98.37/95, `glob.cjs` 100/100/100, `output.cjs` 100/98.25/100, `report.cjs` 100/97.73/100, `runner.cjs` 100/100/100.
- **The gate passes its own gate**: `evidence\fix\coverage\self-gate-run-2.json` and `self-gate-report-2.json` (`pass: true`, `fullBar: true`, 9 production files, nothing unclassified).
- **C031 reproduced again** with the fixed gate, read-only: `evidence\fix\c031\c031-run-4.json` (C031's own 10 test files) and `c031-run-5.json` (default discovery), the same figures as the table above; `git status --porcelain -- capability/C031` stays empty.
- **Mutation check**: `evidence\fix\mutation\mutation-02.json`, 53 mutants (the first 22 of the first publication, adapted where the code moved, plus 31 for the fixes and the minors), each killed by a named assertion.
  The tool and its two data files are in `evidence\fix\mutation\`; the first publication's tool stays in `evidence\mutation\`.

## Fix run R3-U009 (after the second independent review)

The second review could not reopen F1 to F5 (47 of its 48 own guard mutants were killed, 1.5 million random and 5.97 million exhaustive differential cases of the glob matcher agreed) but rejected the first fix on two hermeticity majors in the NEW tests and nine smaller findings. Only tests, evidence, the documentation and three small production files (`glob.cjs`, `output.cjs`, `gate.cjs`) changed.
Test first, as before: every finding has an archived behavioral RED (a NEW folder under `evidence\red\`, recorded against the unfixed bytes), a root-cause fix and a GREEN replay of the same unchanged test files. The REDs of this round were started with the working directory in a scratch folder outside the repository
(a `--require` wrapper around the shared recorder, because the RED of F5 in the first fix left the files `NUL` and `nul.json` in the repository root: N7, removed by the controller); the recorder manifests therefore still say `cwd: "repository root"`, which is not true for these runs. The RED of N3 and N4 was recorded twice: the first run (`fix2-n3-json-0d050a7f-3200-496f-ac58-62c63293ad45`)
used a test that passed `--help` together with `--json=<path>`, which is a usage error, and the test was corrected before its first GREEN; it stays archived as history and the corrected file is the RED `fix2-n3-json-b-1c9403ea-2a3b-46f6-96d9-9e987e546308`, recorded against the first fix's `glob.cjs`, `output.cjs` and `gate.cjs` (swapped into the working tree for the run and restored byte for byte afterwards).

| Finding | Behavioral RED (fails by assertion on the unfixed bytes) | Root-cause fix | Tests |
| --- | --- | --- | --- |
| **N1** (major) the glob tests measured wall-clock seconds in a freshly started node (flaky by design under load) | `fix2-n1-glob-27ada9f1-0c4c-4ef0-a48d-fe76784a2a3e`: 11 of 21 fail, the matcher does not report its steps | `compileGlob(p).measure(path)` returns `{ matched, steps, tokens, consumed }`; the tests bound the steps (tokens x (1 + 2 x characters)) and run a naive backtracking control that counts its calls in the same test (it exhausts a budget of one million calls where the matcher needs a few thousand steps); no timing bound and no `spawnSync` timeout remain, the one child (the CLI) has a 300 s hang detector; the surviving mutant B8 (the early exit) is now killed because the step count shows it | `fix-f4-glob`, `glob`, `naive-glob.cjs` (helper) |
| **N2** (major) the evidence test read 20 files of `capability\C031` from the checkout | `fix2-n2-hermetic-d1e9327b-c409-4b3d-a2f7-3c33e3ac024e`: the first fix's evidence test run in a copy of the namespace without `capability\C031` fails | the evidence test reads only inside `testing\coverage` and verifies the recorded identity of external inputs; the strict mode compares them with git blobs (see Evidence) | `evidence`, `fix2-hermetic`, `evidence-lib.cjs`, `evidence-pins.cjs`, `strict-evidence.cjs` |
| **N3** `--json=<path>`, `--help` next to `--json` and a read-only target left a stale `pass: true` | `fix2-n3-json-b-1c9403ea-2a3b-46f6-96d9-9e987e546308`: 14 of 14 fail (the first attempt `fix2-n3-json-0d050a7f-3200-496f-ac58-62c63293ad45` is kept as history) | `scanJsonTargets` knows both spellings, `--help` writes a not-run report, a read-only previous report is removed and replaced; exit codes unchanged | `fix2-json`, `output` |
| **N4** the started marker could be replaced by a hard link during the run and the final write followed it | `fix2-n3-json-b-...` (same file) | temporary file plus rename, identity (volume and file id) and one-link check right before the final write, a target with more than one link is refused, typed `REPORT_CHANGED` | `fix2-json`, `output` |
| **N5** deleting the self-gate archive turned the evidence checks into a skip; an empty evidence folder passed | `fix2-n2-hermetic-...` (tamper cases: the old test passes or skips on deleted evidence) | archives pinned by name and count, skipped only by the explicit `U009_EVIDENCE_CAPTURE=1`; the limit is stated | `evidence`, `fix2-hermetic` |
| **N6** README accuracy (stale skip line, "never keeps an older result", the enumeration "cannot hang", `--manifest` and `fullBar`) | `fix2-n2-hermetic-...` (the README claims fail on the first fix's README) | the README states the cost (linear in entries x files x pattern length x path length, no cap on the number of manifest entries), the spellings and what `--json` cannot cover, `fullBar` and `--manifest` | `fix2-hermetic` |
| **N7** `NUL` and `nul.json` in the repository root | removed by the controller; this round's REDs ran in a scratch working directory and the root listing was compared before and after | none needed | none |
| **N8** `support.cjs runCli` ended only the gate pid after a timer | `fix2-n2-hermetic-...` | `runCli` is gone; `e2e.test.cjs` uses the tree-killing `runGateCli` (default deadline 240 s, a hang detector) | `fix2-hermetic`, `e2e` |
| **N9** `NODE_OPTIONS` is not sanitized on purpose | `fix2-n2-hermetic-...` | stated in the limits: U013 and every caller must not run the gate under a foreign `NODE_OPTIONS` | `fix2-hermetic` |
| **N10** an empty `.scratch` can remain, mutant B8 survived | B8 is killed by `fix-f4-glob` (see N1) | the README states the residual and the tree is cleaned before publication | `fix-f4-glob` |
| **N11** timing hint | none (documentation) | 72 to 172 s for the suite, 886 s for the self-gate, about 25 minutes for the nine L-0004 runs | `fix2-hermetic` |

Final archives of this round (all under `evidence\fix2\`, captured last on the final bytes; every input inside `testing\coverage` is hashed, and the self-gate run also pins `README.md` and `evidence\.gitattributes`):

- **GREEN replay of each RED, the same unchanged test files on the final code** (started in a scratch folder like the REDs): `evidence\fix2\replay\replay-01-n1-glob.json` (21 of 21), `replay-01-n3-json` (14 of 14) and `replay-01-n2-hermetic` (3 pass, the 5 tamper cases skipped by the capture switch; the strict run of the whole suite below runs them), each exit 0.
- **Per-file L-0004, one command per file** (`evidence\fix2\coverage\l0004-<file>.json`, lines/branches/functions as Node prints them, recorded while the capture switch was set: 183 tests, 178 pass, 5 skipped by the switch, 0 fail; the gate reads the same exact counts from lcov):
  `command.cjs` 100/100/100, `enumerate.cjs` 100/99.42/97.37, `errors.cjs` 100/100/100, `evaluate.cjs` 100/97.96/100, `gate.cjs` 100/99.21/95.24, `glob.cjs` 100/100/100, `output.cjs` 100/98.8/100, `report.cjs` 100/97.73/100, `runner.cjs` 100/100/100.
- **The gate passes its own gate**: `evidence\fix2\coverage\self-gate-run-3.json` (the recorder manifest; the gate ran with `--jobs 3` and `--json` pointing outside the repository) and `self-gate-report-3.json` (the gate's JSON report, copied into the evidence folder afterwards: it is byte-identical to the stdout transcript of the manifest; `pass: true`, `fullBar: true`, 9 production files, nothing unclassified).
- **C031 reproduced again** with the second fix, read-only: `evidence\fix2\c031\c031-run-6.json` (C031's own 10 test files) and `c031-run-7.json` (default discovery, 12 test files), the same exact counts as the table above (every `capability\C031` input is listed in the manifest and verified by the strict mode against the blobs of the accepted commit); `git status --porcelain -- capability/C031` stays empty.
- **Mutation check**: `evidence\fix2\mutation\mutation-03.json`: **78 of 78 mutants killed by a named assertion** (baseline 137 tests, no failure, first attempt; the 53 mutants of the first fix with N08 adapted where the code moved, plus 25 new ones for the guards of this round, `mutants.round3.cjs`); the tool and its three data files are in `evidence\fix2\mutation\`.
  The evidence checks themselves are not in this tool (its scratch copies carry no evidence folder): their guards are killed by the tamper cases of `tests\fix2-hermetic.test.cjs`, which run in the strict suite.
- **Strict mode**: `evidence\fix2\strict\strict-run-01.json`: the 1416 inputs of the two retained generations and the C031 files against `git cat-file blob` of the accepted commits, 0 problems.
- **GREEN, the whole suite, strict** (no capture switch, every archive above present): `evidence\fix2\green\green-03-suite.json`.
- **Busy-machine loops** (historical N1; `evidence\fix2\loops\`): the 64-run, 8-way loop covered exactly `fix-f4-glob.test.cjs`, `glob.test.cjs`, `fix2-json.test.cjs`, `output.test.cjs` and `evidence.test.cjs`, with 8 owned CPU burners;
  and whole-suite runs under the load of parallel suites, burners and the other jobs of this shared machine. A loop counts as passed only when every run exits 0 with no failed, cancelled or unexpectedly skipped test.
- **Discarded attempts of this round**: one. The first self-gate run (`self-gate-run-3`, exit 1: every file failed with 2 failed tests) wrote its report with `--json` into `evidence\fix2\coverage`, where the evidence test of the nested suite runs read the half-finished `started` marker and failed (its check of the report files, and through the copy the N2 test): a self-gate run cannot be verified by the suite it runs.
  Its archive was moved out of the repository (nothing in the tests changed), and the run was repeated with `--json` pointing outside the repository, the report being copied in afterwards. Every other archive in `evidence\fix2` is the first and only run of its spec (the first start of the mutation capture ended at once on an error in the scratch driver script, before the recorder ran, and wrote nothing, and two runs
  that were started while the README was still being edited were stopped by hand before they wrote anything, and neither did the strict green run that had started right after the failed self-gate and was stopped when that failure was understood); the `red-01-n3-json` archive is not discarded but superseded, as explained above. Early scratch loops over the changed test files (64 runs each, before the final archives existed) are not archived.

## Files

| File | Role |
| --- | --- |
| `gate.cjs` | command line, orchestration, exit codes |
| `enumerate.cjs` | enumeration rules, manifest, test resolution |
| `command.cjs` | the L-0004 command and the sanitized child environment |
| `runner.cjs` | child process with a hard timeout that ends its own tree |
| `report.cjs` | lcov, TAP summary and TAP table parsers, exact percentages |
| `evaluate.cjs` | per-file verdict, JSON report (`fullBar`, `notConsidered`), summary |
| `output.cjs` | the `--json` rule, temporary file plus rename, started, not-run and failure reports, typed errors |
| `glob.cjs`, `errors.cjs` | the small glob dialect (a linear matcher that reports its steps), the usage error |
| `coverage.manifest.json` | classifies the fixtures and the evidence for the self-gate |
| `U009.feature` | the specification the RED and GREEN tests implement |
| `tests\` | 19 test files (unit tests with injected runners, end-to-end runs of the real CLI, the fix-run tests `fix-*.test.cjs` and `fix2-*.test.cjs`, `output`, `gate-fixes`, `evidence`) and the helpers `support.cjs`, `clisupport.cjs`, `naive-glob.cjs` (the naive control of the glob tests), `evidence-lib.cjs`, `evidence-pins.cjs` and `strict-evidence.cjs` (the strict mode, not matched by `*.test.cjs`) |
| `fixtures\` | static fixture roots, to be run only through the gate with `--root` (never by a recursive `node --test`: `failing` holds a deliberately failing test): `pass`, `unloaded`, `below` (84.9057 percent), `failing`, `unclassified`, `manifested`, `notests` |
| `evidence\` | first publication: RED (naive stub, behavioral test, archived run), GREEN, coverage, C031 and mutation runs; first fix: `red\fix-*` and `fix\`; second fix: `red\fix2-*` and `fix2\` (replays, per-file L-0004, self-gate, C031, mutation tool and run, strict run, busy-machine loops) |

## U041 current authority and verification

This is the existing merged U041/U042/U043 card, not three new cards or credits. Only `gate.cjs` and `glob.cjs` are changed production files. The complete production set remains **command, enumerate, errors, evaluate, gate, glob, output, report and runner**, nine files; each must independently meet 85/85/85, with an unloaded file counted as zero. The new `tests\u041-*.cjs` files drive this card's verification and are test tooling, not additional production.

The accepted R3 commit is `5ca751aec0df0aa48d892c1b2b9be066eb2661f3`. `evidence\u041\accepted-surface.json` was derived from its exact 37 owned source/test/document blobs and the retained working bytes, not an invented pin. `evidence-index-addendum-N.json` links consecutively with LF-normalized digests. Each replacement names its exact prior digests and an immutable original witness. The helper checks all 37 original paths plus indexed additions, not only amended files. The evidence test pins the helper before trusting it. No historical seal, transcript, RED or old pin file is rewritten.

Current checks are hermetic. The strict evidence command alone reads immutable accepted git blobs. A consistent rewrite of the verifier, its embedded trust pin, and the amendment chain is still not detectable inside this repository; independent review against accepted history is required. LF/CRLF representations are accepted through explicit normalized digests, never described as raw-byte identical.

### Commands and separate evidence scopes

```powershell
# Same unchanged behavioral RED tests on the current candidate:
node --test --test-concurrency=1 testing\coverage\tests\u041-json.test.cjs testing\coverage\tests\u041-policy.test.cjs testing\coverage\tests\u041-amendment-behavior.test.cjs

# Actual matcher observations and exact A08/A09 named structural regression:
node --test --test-concurrency=1 testing\coverage\tests\u041-real-work.test.cjs testing\coverage\tests\u041-work.test.cjs

# Current default; six expensive N2/N5 copies are explicitly opt-in:
node --test --test-concurrency=1 "testing/coverage/tests/*.test.cjs"

# Full strict evidence includes all eight fix2-hermetic checks, without the capture bypass:
node testing\coverage\tests\strict-evidence.cjs

# Full self-gate forces U009_HEAVY_HERMETIC=1 and removes the capture bypass in all nine children:
node testing\coverage\gate.cjs --root testing\coverage --scratch <owned-scratch> --json <unique-owned-report.json> --jobs 3
```

The original default suite in this run measured **28.961 s, 183/183 tests, 19 files, no skips** on retained unchanged subjects. This is a different measurement scope from the earlier review's **224 to 441 s** under shared-machine load. No elapsed time decides a test result. The cheaper default changes the structural cost from six expensive N2/N5 copies to zero; all eight hermetic checks still execute in full/strict verification. Current after-run counts and measured scope are recorded separately, never substituted for historical figures.

Recorded comparisons: the same original 19-file selection after the fix measured **27.179 s, 178 passed plus 6 explicit skips (184 total)**. The enlarged amendment-1 default pilot measured **29.535 s, 214 passed plus 6 skips (220 total, 28 files)**; it is not claimed to be a latency improvement over the smaller original suite. Amendment 2's full strict suite measured **82.706 s, 223/223 with zero skips**. Strict evidence ran all **8/8** hermetic checks and verified **1495** immutable historical inputs/surface blobs across **62** original recorder manifests. These are distinct scopes; later final replays and counts live in the private result bundle.

The systematic tool covers **247 gate statements and 71 single conditions, plus 128 glob statements and 26 single conditions**: 472 valid generated mutants, with no syntax exclusions, plus seven named mutants. `node testing\coverage\tests\u041-mutations.cjs --scratch <owned-dir> --source <retained-candidate> --workers 2` records every subject, raw output, named assertion, survivor and undecided outcome. Per-function harness-only iteration guards (500 for gate, 5,000,000 for glob) are first qualified on unmutated baselines. Named A08/A09 run without those guards. A timeout, signal or non-assertion crash is not a kill; equivalence requires a recorded runnable proof.

Fresh-candidate replay: `node testing\coverage\tests\u041-fresh.cjs <owned-dir>` starts with the immutable accepted git archive, overlays the unpublished candidate, and runs the full suite in LF and CRLF source representations, without `.git` or C031. Evidence/witness bytes are never converted. This is explicitly a candidate overlay, not a claim that unpublished files exist at HEAD. `node testing\coverage\tests\u041-loops.cjs <owned-dir>` repeats exactly `u041-json.test.cjs`, `u041-fast-json.test.cjs` and `u041-real-work.test.cjs` 64 times, 8-way, with `--test-concurrency=1`, no burners and no clock-based decision.

New raw recorder manifests and transcripts are retained in the coordinator's private U041 result/scratch bundle: the existing recorder necessarily records its resolved local executable, and raw process diagnostics can contain local paths. Originals and raw captures containing those identifiers remain private and unchanged. Public documentation uses relative paths or placeholders. The result names every raw RED, unchanged final replay, coverage command, mutation outcome and measurement; publication and the Done decision belong only to the coordinator after independent review.
