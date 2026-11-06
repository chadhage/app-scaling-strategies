# U009: the shared coverage gate

One command checks the kanban *Coverage bar* for a namespace: every production file reaches at least 85 percent lines, 85 percent branches and 85 percent
functions, measured by Node's own coverage over an **enumerated** file set (a file that no test loads counts as 0/0/0, never as a pass).

```powershell
node testing\coverage\gate.cjs --root capability\C031 --json c031-coverage.json
```

- stdout is one JSON document; a readable summary and progress lines go to stderr.
- Exit code `0` only on pass, `1` on any miss (also an unclassified file, a failed, hung or empty test run), `2` on a usage error.
- Zero-credit tooling item U009 (kind unblock, entry gate U003). Local and synthetic: Node built-ins only, no browser, no network, no packages.
  Written and measured on Node v22.23.4 (its lcov and TAP reporters; other majors print other reports).
- It passes its own gate and reproduces the reviewer figures for `capability\C031` (see [Evidence](#evidence)).

## Commands

Run everything from the repository root in PowerShell. PowerShell does not expand `*` for native programs: quote globs, the gate and Node expand them.

| Purpose | Command |
| --- | --- |
| Measure a namespace | `node testing\coverage\gate.cjs --root <dir> [--tests <files or globs...>] [--min 85] [--json <out>] [--include <glob...>] [--exclude <glob...>] [--timeout <seconds>] [--jobs <n>] [--scratch <dir>] [--manifest <file>]` |
| Help | `node testing\coverage\gate.cjs --help` |
| The gate passes itself (about 4 minutes: the whole suite runs once per production file; take a heavy slot) | `node testing\coverage\gate.cjs --root testing\coverage --scratch <dir>` |
| Per-file L-0004 by hand, one command per file (see below) | `node --test --test-concurrency=1 --experimental-test-coverage --test-reporter=tap --test-coverage-include=testing/coverage/gate.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 "testing/coverage/tests/*.test.cjs"` |
| GREEN: the whole suite (93 tests, about 55 s) | `node --test --test-concurrency=1 "testing/coverage/tests/*.test.cjs"` |
| RED replay against the naive stub (exit 1, 7 of 7 fail by assertion) | `node --test --test-concurrency=1 testing\coverage\evidence\red\gate.red.test.cjs` |
| Mutation check (23 mutants must all be killed, about 3 minutes) | `node testing\coverage\evidence\mutation\mutants.cjs --scratch <dir>` |
| Whitespace of the published files | `git -c "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol" diff --check -- testing/coverage` (after the files are staged or committed) |
| Real isolated headless Edge observation | not applicable: this tool has no page and no browser code |

Per-file L-0004 for every production file of this namespace (8 commands, each prints one table row of at least 85/85/85 and exits 0):

```powershell
foreach ($file in 'command', 'enumerate', 'errors', 'evaluate', 'gate', 'glob', 'report', 'runner') {
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

   plus the `tap` and `lcov` reporters, which change no measurement. The child starts in the repository root with `NODE_TEST_CONTEXT` and `NODE_V8_COVERAGE` removed from
   its environment (L-0002: otherwise a nested `node --test` prints no summary and exits 0 although a test fails), `TEMP`/`TMP`/`TMPDIR` pointing into the per-run scratch directory,
   and a hard timeout (`--timeout`, default 900 s) that ends only the process tree this gate started (`taskkill /PID <pid> /T /F` on Windows, the process group elsewhere), never a process by name.
4. **Reads exact counts from lcov** (covered and total per metric are integers) and cross-checks them with the table that Node prints in the same run: a difference of more than
   the table's two-decimal rounding fails the file. A file that no test loaded has no lcov record: Node prints no row and still exits 0 (L-0003, L-0043), the gate reports it
   `loaded: false` with `0/0/0`.
5. **Evaluates strictly with integers**: `covered * 100 >= min * total` for lines, branches and functions. Nothing is rounded up: 861 of 1013 lines is 84.9951 percent, which Node's table prints as
   `85.00` but which fails. A file at exactly the minimum passes. A run that failed, timed out, was killed, printed no test summary, ran 0 tests or passed none fails every file it covers even at 100 percent.
   Node exiting non-zero while the exact counts meet the minimum is reported as a disagreement, never as a pass.

### Enumeration rules

`.js`, `.cjs` and `.mjs` files below `--root` are the candidates. Directories named `node_modules` or starting with `.` are never entered and are listed under `skippedDirectories`; links are never followed.

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

`{ schema: "U009-coverage-gate/1", root, node, min, files: [{ file, lines, branches, functions, loaded, ok, reason, counts, table, command, nodeExit, tests, failedTests }], unclassified: [{ file, reason }], excluded: [{ file, by, reason }], skippedDirectories, tests, filters, timeoutMs, warnings, errors, pass }`

- `lines`, `branches`, `functions` are percentages with their exact decimals; `counts` holds `[covered, total]` per metric; `reason` is `null` for a file that passes.
- `pass` is true only when every file is `ok`, nothing is unclassified and at least one production file was measured (a gate over nothing is not a pass).
- With `--json <out>` the same document is also written to `<out>` (relative to the current directory).

## Limits (read before trusting a number)

- **Browser-only scripts are measured only when a Node test loads them**: with a DOM stub or `vm.Script(source, { filename })` (L-0044, L-0053). Real browser V8 coverage is U010.
  A page script that no Node test loads is an unloaded file: 0 percent, a failure, never an exclusion.
- **Node's semantics apply**: Node counts no branches inside a function that is never called, a metric with nothing to count (no functions, no branches) is 100, and only files that a test loads
  are reported (hence the enumeration). Coverage of a file loaded only by a child process that a test spawns is merged by Node (inherited `NODE_V8_COVERAGE`).
- **PowerShell, TypeScript and shell scripts are not measured**: they fail as `unclassified` until a manifest entry excludes them with a reason (L-0060 asks for PowerShell coverage as a later item).
- **Cost**: the whole test set runs once per production file (the price of one L-0004 command per file); `--jobs <n>` runs files in parallel, `--tests` narrows the suite. Take a heavy slot for a whole namespace.
- Tests are an input: the gate trusts the namespace's tests and its own enumeration rules; a namespace whose tests are not hermetic gets the figures of the tests it has.
- `--min` is an integer from 0 to 100 because Node's threshold flags are integers.
- The default scratch folder is `testing\coverage\.scratch` (hidden, never enumerated); the gate removes its per-run directory and leaves the empty parent. Pass `--scratch` to use another place.
- Very long test lists can exceed the Windows command-line limit; the run then fails with the spawn error, never silently.

## Extending it (U010, U013, U014)

The tooling-scope publisher accepts only **new** files under `testing\coverage`, so later items add files that `require` these modules; nothing here has to be edited.

| Module | Pure functions (all exported) |
| --- | --- |
| `enumerate.cjs` | `enumerateRoot(root, { include, exclude })`, `enumerate(listing, manifest, filters)`, `classifyFile`, `parseManifest`, `loadManifest`, `walkTree`, `resolveTests`, `defaultTests`, `expandGlob` |
| `command.cjs` | `buildCommand({ cwd, file, tests, min, lcov })`, `buildEnvironment(env, overrides)`, `includePattern`, `argumentPath` |
| `report.cjs` | `parseLcov`, `parseTapSummary`, `parseTapTable`, `parseTapFailures`, `selectRecord`, `percentOf`, `meetsMinimum` |
| `evaluate.cjs` | `evaluateFile`, `unrunFile`, `judgeRun`, `buildReport`, `formatSummary` |
| `runner.cjs` | `runProcess` (resolves, never rejects), `killTree` |
| `gate.cjs` | `parseArgs`, `runGate(options, deps)`, `main(argv, io)`; `deps.run` and `deps.nodeExecutable` are injectable |

- U010 (browser V8 coverage): wrap `deps.run` to add a preload or `NODE_OPTIONS` and merge line data with its own parser; `parseLcov` returns integer totals only, so a union merge needs a new parser for the `DA`, `FNDA` and `BRDA` records.
- U013 (`state.ps1` Accept): run `node testing\coverage\gate.cjs --root <ns> --json <path> 2>$null | Out-Null`, then read `<path>`: `pass`, `files[].counts`, `unclassified`. The run takes minutes, so do it before taking the State mutex, never inside its 8 s wait.
- U014 (board lint): `enumerateRoot(root)` lists production files, exclusions and unclassified candidates without running a test, in milliseconds.
  A read-only survey with it over the 190 namespaces of this checkout (586 production files) shows 52 namespaces with unclassified candidates: 57 tooling-named files in 41 namespaces and 18 PowerShell files in 11 namespaces.
  Each needs a manifest entry (or `--manifest`) before the gate can pass it; no namespace lacks default tests (the 43 older ones keep their tests at the root).

## Evidence

All archived with the shared recorder (`RUN\scripts\archive-run.cjs`): one manifest JSON per run (command, exit code, SHA-256 of every input) plus gzip transcripts under `raw\`; `evidence\.gitattributes` keeps every byte as written.

**RED** (before any implementation): `evidence\red\red-01-behavior.json` archives `node --test --test-concurrency=1 testing\coverage\evidence\red\gate.red.test.cjs`
against the naive loadable stub `evidence\red\gate.stub.cjs` (it runs the L-0004 command per script with the inherited environment and trusts Node's exit code): 7 tests, 7 failures, exit 1.
Every failure is an assertion about the specified behavior (an unloaded file must fail, 84.9 percent must fail with its exact decimals, a failing nested test under an inherited `NODE_TEST_CONTEXT`
must fail, a missing test file must be named, an unclassified file must be listed, no tests must fail, the JSON shape), none is a missing module or a syntax error. Inputs are hashed in the manifest.

**GREEN**: `evidence\green\green-01-suite.json`: the whole suite, 93 tests, 93 pass, exit 0.

**The gate passes its own gate**: `evidence\coverage\self-gate-run-1.json` (the recorder manifest) and `evidence\coverage\self-gate-report.json` (the gate's own JSON): `pass: true`, 8 production files, nothing unclassified.

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

Every input hash in these manifests equals the bytes published here; the C031 manifests also hash the C031 files that the run reads, which stay untouched.

**Mutation check** (`evidence\mutation\mutants.cjs`, archived run `evidence\mutation\mutation-01.json`): 23 one-expression mutants of the production files (rounded comparison, vacuous metric as 0,
unloaded file passes, no summary passes, zero tests pass, unclassified ignored, empty gate passes, inherited `NODE_TEST_CONTEXT`, usage error exits 1, links followed, glob `*` across segments, ...), each applied to a scratch copy of the
namespace: baseline 93 of 93 pass, **23 of 23 mutants killed** by named tests. Replay: `node testing\coverage\evidence\mutation\mutants.cjs --scratch <dir>` (about 3 minutes, exit 0 when every mutant is killed).

**Refinements after the first GREEN** (each has its tests in the final suite; they were not part of the RED): `--manifest <file>`, root-level `*.test.*` files in the default test discovery,
`*.d.ts` excluded by rule (the `.d.ts` files that sit next to production scripts in many namespaces hold no executable code), and progress lines on stderr.

## Files

| File | Role |
| --- | --- |
| `gate.cjs` | command line, orchestration, exit codes |
| `enumerate.cjs` | enumeration rules, manifest, test resolution |
| `command.cjs` | the L-0004 command and the sanitized child environment |
| `runner.cjs` | child process with a hard timeout that ends its own tree |
| `report.cjs` | lcov, TAP summary and TAP table parsers, exact percentages |
| `evaluate.cjs` | per-file verdict, JSON report, summary |
| `glob.cjs`, `errors.cjs` | the small glob dialect, the usage error |
| `coverage.manifest.json` | classifies the fixtures and the evidence for the self-gate |
| `U009.feature` | the specification the RED and GREEN tests implement |
| `tests\` | 8 test files (unit tests with injected runners, end-to-end runs of the real CLI) and `support.cjs` |
| `fixtures\` | static fixture roots, to be run only through the gate with `--root` (never by a recursive `node --test`: `failing` holds a deliberately failing test): `pass`, `unloaded`, `below` (84.9057 percent), `failing`, `unclassified`, `manifested`, `notests` |
| `evidence\` | RED (naive stub, behavioral test, archived run), GREEN, coverage, C031 and mutation runs |
