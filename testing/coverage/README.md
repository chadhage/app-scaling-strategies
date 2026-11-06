# U009: the shared coverage gate

One command checks the kanban *Coverage bar* for a namespace: every production file reaches at least 85 percent lines, 85 percent branches and 85 percent
functions, measured by Node's own coverage over an **enumerated** file set (a file that no test loads counts as 0/0/0, never as a pass).

```powershell
node testing\coverage\gate.cjs --root capability\C031 --json c031-coverage.json
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

## Commands

Run everything from the repository root in PowerShell. PowerShell does not expand `*` for native programs: quote globs, the gate and Node expand them.

| Purpose | Command |
| --- | --- |
| Measure a namespace | `node testing\coverage\gate.cjs --root <dir> [--tests <files or globs...>] [--min 85] [--json <out>] [--include <glob...>] [--exclude <glob...>] [--timeout <seconds>] [--jobs <n>] [--scratch <dir>] [--manifest <file>]` |
| Help | `node testing\coverage\gate.cjs --help` |
| The gate passes itself (about 10 minutes: the whole suite runs once per production file; take a heavy slot) | `node testing\coverage\gate.cjs --root testing\coverage --scratch <dir>` |
| Per-file L-0004 by hand, one command per file (see below) | `node --test --test-concurrency=1 --experimental-test-coverage --test-reporter=tap --test-coverage-include=testing/coverage/gate.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 "testing/coverage/tests/*.test.cjs"` |
| GREEN: the whole suite (151 tests in 17 files, about 90 s; one test is skipped until the final runs are archived) | `node --test --test-concurrency=1 "testing/coverage/tests/*.test.cjs"` |
| RED replay of the first publication against the naive stub (exit 1, 7 of 7 fail by assertion) | `node --test --test-concurrency=1 testing\coverage\evidence\red\gate.red.test.cjs` |
| RED replay of the fix run (R2-U009): each of the 6 archived REDs now passes, the same unchanged test file | `node --test --test-concurrency=1 testing\coverage\tests\fix-f1-env.test.cjs` (and `fix-f2-exit`, `fix-f3-stale`, `fix-f4-glob`, `fix-f5-json`, `fix-minors`) |
| Mutation check (53 mutants, each must be killed by a named assertion, about 20 minutes) | `node testing\coverage\evidence\fix\mutation\mutants.cjs --scratch <dir>` (`--check` only verifies that the mutants apply, `--only id,id` runs some) |
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
- **`--json <out>`: the same document is written to `<out>` (relative to the current directory), under a rule (F3, F5 of the review).** Only a new file or a previous gate report (JSON that carries this schema) is ever replaced.
  Refused with exit 2, before anything is written or started: an existing file that is not a gate report (a source file, a text file, any other JSON), a directory, a link, a device name (`NUL`, `CON`, `nul.json`, `\\.\...`), an alternate data stream
  (`x.json:s`), a trailing dot or space, and a script name (`.js .cjs .mjs .ts .ps1 ...`, which would be enumerated as production code). A repository confinement is not the rule: reviewers keep their scratch outside the repository.
  The path never keeps an older result: a `{ pass: false, status: "started" }` marker is written first, the final report replaces it, and every usage or internal error writes a typed failure report there, in whichever order the flags came
  (a usage error in `--min` is still found because every value after `--json` is scanned first). `--help` writes nothing. A crash that kills the process leaves the started marker, which is a failure, never the previous pass.
- A failure report is `{ schema, pass: false, error: { code, type, message } }`: `type` is `usage` (exit 2) or `internal` (exit 1, for example `EEXIST` when `--scratch` names a file).

## Limits (read before trusting a number)

- **Browser-only scripts are measured only when a Node test loads them**: with a DOM stub or `vm.Script(source, { filename })` (L-0044, L-0053). Real browser V8 coverage is U010.
  A page script that no Node test loads is an unloaded file: 0 percent, a failure, never an exclusion.
- **Node's semantics apply**: Node counts no branches inside a function that is never called, a metric with nothing to count (no functions, no branches) is 100, and only files that a test loads
  are reported (hence the enumeration). Coverage of a file loaded only by a child process that a test spawns is merged by Node, because the nested `node --test` run sets its own `NODE_V8_COVERAGE` for the test processes it starts (never the caller's, see item 3).
- **PowerShell, TypeScript and shell scripts are not measured**: they fail as `unclassified` until a manifest entry excludes them with a reason (L-0060 asks for PowerShell coverage as a later item).
- **Cost**: the whole test set runs once per production file (the price of one L-0004 command per file); `--jobs <n>` runs files in parallel, `--tests` narrows the suite. Take a heavy slot for a whole namespace.
- Tests are an input: the gate trusts the namespace's tests and its own enumeration rules; a namespace whose tests are not hermetic gets the figures of the tests it has.
- `--min` is an integer from 0 to 100 because Node's threshold flags are integers.
- The default scratch folder is `testing\coverage\.scratch` (hidden, never enumerated). The gate removes its per-run `u009-*` directory and, when it created the scratch parent (and the folders above it) itself, those too, so an
  empty `.scratch` is no longer left behind (m4); a parent that already existed or holds anything else stays. A run that is killed leaves its `u009-*` directory, which is harmless and untracked: delete it by hand, and
  never pass the whole `testing\coverage` folder to a publisher while one exists. The test suite removes its own `.scratch\work` the same way. Pass `--scratch` to use another place.
- **Glob matching is linear and bounded (F4 of the review).** `*`, `**` and `?` are matched by an automaton, not a RegExp: time is at most the pattern length times the path length, a pattern may have at most 1024 characters (more is a usage error),
  and no pattern, manifest entry or file name can make the enumeration hang. Differences from the old translation: none for ordinary patterns (a seeded differential test of 6000 cases), except that `**` also matches a line break in a name.
- **What `pass` means:** the full 85 bar over the full namespace only when `fullBar` is true. `--exclude` also silences UNCLASSIFIED for the files it names (documented, recorded as `by: cli`).
- A zero-byte file that a test loads has no lcov record (Node writes none), so it fails with its own reason ("empty file (0 bytes)") instead of "not loaded by any test" (m3). A comment-only or whitespace-only file is measured 100/100/100.
- Left as it was, on purpose: PowerShell coverage (L-0060, a later item), a hand-crafted junction or link inside a namespace is reported as an unclassified link and never followed, `--manifest` for sealed namespaces.
- Very long test lists can exceed the Windows command-line limit; the run then fails with the spawn error, never silently.

## Extending it (U010, U013, U014)

The tooling-scope publisher accepts only **new** files under `testing\coverage`, so later items add files that `require` these modules; nothing here has to be edited.

| Module | Pure functions (all exported) |
| --- | --- |
| `enumerate.cjs` | `enumerateRoot(root, { include, exclude })`, `enumerate(listing, manifest, filters)` (also returns `notConsidered`), `classifyFile`, `parseManifest`, `loadManifest`, `walkTree`, `resolveTests`, `defaultTests`, `expandGlob` |
| `glob.cjs` | `compileGlob(pattern)` (a linear matcher with `.test(path)`; `globToRegExp` is the old name for the same function and no longer returns a RegExp), `matchesGlob`, `hasMagic`, `normalizePattern` |
| `command.cjs` | `buildCommand({ cwd, file, tests, min, lcov })`, `buildEnvironment(env, overrides)` (the object carries an OWN `NODE_V8_COVERAGE: undefined`: hand it to `child_process` only), `visibleEnvironment(env)` (what a child really receives), `includePattern`, `argumentPath` |
| `output.cjs` | `checkReportTarget(path)`, `writeReportFile`, `startedReport`, `failureReport(error)`, `scanJsonTargets(argv)`, `specialNameProblem` |
| `report.cjs` | `parseLcov`, `parseTapSummary`, `parseTapTable`, `parseTapFailures`, `selectRecord`, `percentOf`, `meetsMinimum` |
| `evaluate.cjs` | `evaluateFile`, `unrunFile`, `judgeRun`, `buildReport`, `formatSummary` |
| `runner.cjs` | `runProcess` (resolves, never rejects), `killTree` |
| `gate.cjs` | `parseArgs`, `runGate(options, deps)`, `main(argv, io)` (never rejects: every error is a typed report and an exit code), `entry(argv, hooks)`; `deps.run` and `deps.nodeExecutable` are injectable |

- U010 (browser V8 coverage): wrap `deps.run` to add a preload or `NODE_OPTIONS` and merge line data with its own parser; `parseLcov` returns integer totals only, so a union merge needs a new parser for the `DA`, `FNDA` and `BRDA` records.
  To give a child a V8 coverage directory of your own, pass `{ NODE_V8_COVERAGE: '<dir>' }` as an override of `buildEnvironment`; never rely on a deleted key (see item 3 above).
- U013 (`state.ps1` Accept): run `node testing\coverage\gate.cjs --root <ns> --json <path> 2>$null | Out-Null`, then **check `$LASTEXITCODE` first** (0 pass, 1 miss or internal error, 2 usage error), then read `<path>`:
  accept only when `pass` is true **and `fullBar` is true** (`--min`, `--include`, `--exclude` make `pass` relative to the options), then `files[].counts` and `unclassified`. The path never holds an older result any more (a started marker, the final report
  or a failure report), but the exit code stays the first signal. The run takes minutes, so do it before taking the State mutex, never inside its 8 s wait.
- U014 (board lint): `enumerateRoot(root)` lists production files, exclusions and unclassified candidates without running a test, in milliseconds.
  A read-only survey with it over the 190 namespaces of this checkout (586 production files) shows 52 namespaces with unclassified candidates: 57 tooling-named files in 41 namespaces and 18 PowerShell files in 11 namespaces.
  Each needs a manifest entry (or `--manifest`) before the gate can pass it; no namespace lacks default tests (the 43 older ones keep their tests at the root).

## Evidence

All archived with the shared recorder (`RUN\scripts\archive-run.cjs`): one manifest JSON per run (command, exit code, SHA-256 of every input) plus gzip transcripts under `raw\`; `evidence\.gitattributes` keeps every byte as written.
**Two generations.** Everything under `evidence\red\red-01-behavior.json`, `evidence\green`, `evidence\coverage`, `evidence\c031` and `evidence\mutation` is the **first publication** (commit `8cfdce17f62c`) and is kept unchanged as history:
its manifests pin the bytes of that commit (`git show 8cfdce17f62c:<path>`), so they no longer match the files that the fix changed. Everything under `evidence\red\fix-*` and `evidence\fix\` belongs to the
[fix run](#fix-run-r2-u009-after-the-independent-review) and pins the bytes published with it, README and `evidence\.gitattributes` included; `tests\evidence.test.cjs` recomputes those hashes (and proves by tampering that a changed byte is found).
**A pilot run of C031 was discarded**: it was made on the code before the last four refinements of the first publication and was thrown away unpublished because its gate hashes no longer matched; that is why the published C031 runs of the first generation are numbered 2 and 3.
The fix run numbers its C031 runs 4 and 5 and has no discarded run.

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

## Files

| File | Role |
| --- | --- |
| `gate.cjs` | command line, orchestration, exit codes |
| `enumerate.cjs` | enumeration rules, manifest, test resolution |
| `command.cjs` | the L-0004 command and the sanitized child environment |
| `runner.cjs` | child process with a hard timeout that ends its own tree |
| `report.cjs` | lcov, TAP summary and TAP table parsers, exact percentages |
| `evaluate.cjs` | per-file verdict, JSON report (`fullBar`, `notConsidered`), summary |
| `output.cjs` | the `--json` rule, started and failure reports, typed errors |
| `glob.cjs`, `errors.cjs` | the small glob dialect (a linear matcher), the usage error |
| `coverage.manifest.json` | classifies the fixtures and the evidence for the self-gate |
| `U009.feature` | the specification the RED and GREEN tests implement |
| `tests\` | 17 test files (unit tests with injected runners, end-to-end runs of the real CLI, the fix-run tests `fix-*.test.cjs`, `output`, `gate-fixes`, `evidence`) and the helpers `support.cjs`, `clisupport.cjs` |
| `fixtures\` | static fixture roots, to be run only through the gate with `--root` (never by a recursive `node --test`: `failing` holds a deliberately failing test): `pass`, `unloaded`, `below` (84.9057 percent), `failing`, `unclassified`, `manifested`, `notests` |
| `evidence\` | first publication: RED (naive stub, behavioral test, archived run), GREEN, coverage, C031 and mutation runs; fix run: `red\fix-*` and `fix\` |
