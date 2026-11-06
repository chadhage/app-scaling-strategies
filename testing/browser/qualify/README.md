# U018: Edge qualification (signed by Microsoft, inside the qualified major, fail closed)

Zero-credit tooling item U018 (kind unblock, entry gate U003 Done). It replaces the equality pins on Edge
`156.0.4314.50` that 57 namespaces carry (the installed Edge is `156.0.4314.58`) by one reusable check:

`qualifyEdge()` proves that the binary Playwright launches for the `msedge` channel exists, carries a valid Authenticode
signature whose certificate subject names **Microsoft Corporation** as the organization, and has a four-part file version
whose **major** is listed in `qualified.json`. It records the actual path, version and SHA-256 and never compares a build
number or a hash with a historical value. Every fact it cannot prove is a failure (fail closed).

Location: the card text says `testing/browser/qualify.cjs`. The publisher authorizes exactly one new directory, so the
module is `testing\browser\qualify\qualify.cjs`. Nothing outside `testing\browser\qualify` changed; `isolated.cjs` and every
other file of `testing\browser` are untouched. Node built-ins and Windows PowerShell only, no packages and no network of the
tool's own (`Get-AuthenticodeSignature` may consult the OS certificate stack for revocation data, see Limits).

## Commands (repository root, PowerShell 7, Node 22)

```powershell
# qualify the installed Edge: real Windows PowerShell, no browser launch, about 1 to 25 s depending on load (Authenticode is slow)
node testing\browser\qualify\qualify.cjs
node testing\browser\qualify\qualify.cjs --json testing\browser\qualify\evidence\qualification\<name>.json   # never overwrites
# requalify: runs isolated.test.cjs and loopback.test.cjs on real headless Edge, one node --test process each
node testing\browser\qualify\qualify.cjs --requalify --json <out> [--slot-script <heavy-slot.ps1> --slot-owner <name>]
```

stdout is the JSON report (the full reason texts), stderr is **one** verdict line: whitespace is collapsed and reasons with
the same text are listed once under all their codes (`FAIL closed: SIGNATURE_UNAVAILABLE, VERSION_UNAVAILABLE: <text>`).
Exit codes: **0** qualified (with `--requalify`: and the suites passed), **1** fails closed, **2** usage error, a refused
`--json` target or a report that could not be written. `--json` is checked BEFORE anything runs (a `--requalify` costs
minutes): the file must not exist, the folder must exist, and the name must not be a Windows reserved device name (`nul`,
`con`, `prn`, `aux`, `com1`..`com9`, `lpt1`..`lpt9`, `conin$`, `conout$`, also with an extension or a superscript digit), end in
a dot or a space, contain a colon after the drive letter (`tracked.json:evil` would attach an NTFS alternate data stream to an
existing file), be a UNC or device path, or contain a control or wildcard character; each refusal is one stderr line, exit 2,
nothing started. `--slot-script` and `--slot-owner` take a heavy-run slot through any PowerShell script that supports
`-Action Acquire|Release -Owner <name>` (the run folder's `heavy-slot.ps1`); they are only valid with `--requalify`. Without
them, wrap the command in your own slot: it launches real Edge twice.

### Reproduce RED, GREEN, coverage, mutation and the machine test

```powershell
# RED of the first publication (evidence\red\red-01-legacy-equality-pin.json, immutable): replay in a SHORT scratch folder
$s = '<RUN>\scratch\u18'; New-Item -ItemType Directory -Force $s | Out-Null; Copy-Item testing\browser\qualify $s\q -Recurse
Copy-Item $s\q\evidence\red\qualify.stub.cjs.txt $s\q\qualify.cjs -Force
Push-Location $s\q; node --test --test-concurrency=1 tests\qualify.test.cjs tests\fail-closed.test.cjs; Pop-Location   # exit 1
# GREEN: the whole hermetic suite (fake shells, fixture suites, injected adapters; no browser; evidence.test.cjs last)
$h = 'qualify','fail-closed','subject','version','adapters','shell','requalify','requalify-flow','cli','subject-lookalike',
  'requalify-verdict','requalify-counts','requalify-tree','cli-line','cli-target','cli-write','qualify-recheck','evidence' | % { "testing\browser\qualify\tests\$_.test.cjs" }
node --test --test-concurrency=1 @h
# Per-file 85/85/85 (L-0004, ONE command per production file; repeat for subject, version, adapters, requalify, cli, qualify)
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=testing/browser/qualify/adapters.cjs `
  --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 @h   # without evidence.test.cjs
# The one machine test (real installed Edge through the real PowerShell; not part of the coverage run; no browser launch)
node --test --test-concurrency=1 testing\browser\qualify\tests\qualify.machine.test.cjs
# Review fix R2: the four NEW REDs fail on the first-publication code and pass unchanged on the final code
node --test --test-concurrency=1 testing\browser\qualify\tests\subject-lookalike.test.cjs                         # F1
node --test --test-concurrency=1 testing\browser\qualify\tests\requalify-verdict.test.cjs                         # F2
node --test --test-concurrency=1 testing\browser\qualify\tests\cli-line.test.cjs testing\browser\qualify\tests\cli-target.test.cjs   # F3 F6 (cli-write.test.cjs: M27, new)
node --test --test-concurrency=1 testing\browser\qualify\tests\qualify-recheck.test.cjs                           # F4
# Mutation (70 textual mutants, one at a time on a private copy under a SHORT scratch folder; the real tree is never edited)
node testing\browser\qualify\tests\mutation\mutate.cjs --scratch <RUN>\scratch\mu --out <RUN>\scratch\mutation.json --workers 3
# When U009 is published, its gate measures the same files: node testing\coverage\gate.cjs --root testing\browser\qualify
```

`tests\fixtures\*` are suites for the requalification runner (pass, fail, hang, skipped, todo, empty, forged summary and so
on); they are fixtures, not tests of their own. Tests create scratch only under `tests\scratch-*` and remove it; no test
reads the live git index, a publisher or a clock. `tests\mutation\` is test tooling (not production code).

## What is checked, and the reason codes (`report.reasonCodes`, `report.reasons` = `CODE: detail`)

| Code | Fails closed when |
|---|---|
| `EDGE_NOT_FOUND` | no candidate exists: `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `%HOMEDRIVE%\Program Files`, `%HOMEDRIVE%\Program Files (x86)` + `\Microsoft\Edge\Application\msedge.exe`, the order Playwright uses for the `msedge` channel that `isolated.cjs` selects. The first existing one is qualified, the rest are only listed in `candidates` |
| `EDGE_NOT_A_FILE` | the first existing candidate is not a regular file |
| `SHA256_UNAVAILABLE` / `SHA256_TIMEOUT` | the digest cannot be computed (it is part of the record) |
| `SIGNATURE_UNAVAILABLE` / `SIGNATURE_TIMEOUT` | PowerShell is missing, fails, answers garbage or hangs (60 s per start, 90 s outer bound per query) |
| `SIGNATURE_NOT_VALID` | the Authenticode status is anything but exactly `Valid` (NotSigned, HashMismatch, NotTrusted, UnknownError, `valid`, `Valid `) |
| `PUBLISHER_NOT_MICROSOFT` | the subject cannot be parsed, has no or several `O`, or `O` is not exactly `Microsoft Corporation` (case-sensitive, code point for code point: a BOM, a zero-width or format character, a joiner, a no-break space, a variation selector or a look-alike letter anywhere in the name makes it a different name, nothing is stripped or normalized). A `Valid` signature of another publisher, `Not Microsoft Corp`, `O="Evil, O=Microsoft Corporation"`, `CN=Evil\, O=Microsoft Corporation, O=Evil`, `O=\uFEFFMicrosoft Corporation` all fail |
| `VERSION_UNAVAILABLE` / `VERSION_TIMEOUT` | the file version resource has no value |
| `VERSION_UNPARSABLE` | not exactly `major.minor.build.patch`: four plain decimals, no leading zeros, each at most 65535, no spaces, suffix or `v` |
| `MAJOR_NOT_QUALIFIED` | the major is not in `qualified.json` (155 and 157 fail while 156 passes; there is no "newer is fine" and no wildcard) |
| `QUALIFIED_MAJORS_INVALID` | `qualified.json` is missing, not JSON, empty, a wildcard, strings, fractions, duplicates or out of 1..65535 |
| `EDGE_CHANGED_DURING_CHECK` | size or modification time of the binary differ between the first and the last look, or the SHA-256 read after the signature check differs from the first read (the digest is read twice; on a mismatch no digest is recorded) |
| `REQUALIFICATION_FAILED` | (`--requalify`) a suite did not pass every one of its tests: failed, cancelled, **skipped**, **todo**, timed out, printed no TAP summary, ran no test, or no suite was run. The reason names each suite and its counts: `skip-one-suite.cjs passed 1 of 2 tests (1 skipped)`. Node exits 0 for skipped and todo tests, so the exit code is never the verdict |
| `BROWSER_VERSION_MISSING` | (`--requalify`) a suite printed no `Real Chromium <version>` line (the diagnostic the isolated helper suites print): it did not show that a browser ran, so it cannot qualify anything. Every suite needs its own line; an empty file (node counts it as one passing test) lands here |
| `EDGE_CHANGED_DURING_REQUALIFICATION` | (`--requalify`) path, version or SHA-256 differ before and after the suites |
| `BROWSER_VERSION_MISMATCH` | (`--requalify`) a suite printed `Real Chromium <version>` that differs from the qualified `msedge.exe` version |

`ok` is true only when there is no reason **and** the report itself shows status `Valid`, publisher `Microsoft Corporation`,
a SHA-256 and a major that is in the qualified list.

## The report and the API

```js
const { qualifyEdge } = require('./testing/browser/qualify/qualify.cjs');   // async; loads only subject, version and adapters
const edge = await qualifyEdge();   // options: path, env, timeoutMs, qualifiedPath, shell {shell, buildArgs, timeoutMs, env}, adapters {...}
// { schemaVersion, checkedAtUtc, ok, reasons[], reasonCodes[], path, version, major,
//   signature: { status, publisher, subject, issuer, thumbprint }, sha256, qualifiedMajors[], candidates: [{ path, exists }] }
```

All I/O goes through injectable adapters (`options.adapters`): `candidates(env)`, `statFile(path)`, `sha256(path)`,
`signature(path)`, `fileVersion(path)`, `readQualified(path)`, `now()`. Each answer is bounded by `options.timeoutMs`
(default 90 s) and a throwing, hanging or malformed adapter is a named failure, never a crash and never a pass.
`options.path` qualifies one explicit file instead of the discovered Edge (the machine test uses it on look-alikes).

* Signature: Windows PowerShell 5.1 (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`) runs
  `Get-AuthenticodeSignature -LiteralPath $env:QUALIFY_TARGET` and `FileVersionInfo.GetVersionInfo`. The path travels in the
  environment variable `QUALIFY_TARGET`, the script as one `-EncodedCommand` argument, so no part of a path can become code.
  The answer is base64 of UTF-8 JSON (a console code page cannot rewrite a publisher name). One start answers both
  questions. The inherited `PSModulePath` is dropped: a PowerShell 7 parent leaves its own module path there and Windows
  PowerShell then fails with `CouldNotAutoloadMatchingModule`. A shell that does not answer within 60 s is killed.
* Publisher: `subject.cjs` parses the distinguished name (quotes, backslash and hex escapes, `,` and `;` separators, the
  OID `2.5.4.10` for `O`) and requires exactly one `O` equal to `Microsoft Corporation`. Multi-valued (`+`) components and
  every malformed name are refused. No substring match is used anywhere.
* Version: the file version string of the binary, parsed strictly by `version.cjs`.
* `qualified.json`: `{"qualifiedMajors": [156]}` plus a note. A new major is added **only** by a card that ran
  `--requalify` on it and archived the passing report (see "Adding a major"; the report of a new major fails with
  `MAJOR_NOT_QUALIFIED` and still records the suite counts, which is the evidence that card needs). Nothing else edits the
  list. The tests assert only that the shipped file is valid, lists 156 and carries the explaining note (never the exact
  list), so adding a major breaks no test; the machine test asserts that the installed major is in the list, which is the
  point of it.
* SHA-256 is recorded (lower-case hex), never compared with an earlier value. It is read twice: once next to the PowerShell
  start and once after the shell answered; both reads must give the same digest (`EDGE_CHANGED_DURING_CHECK` otherwise, and no
  digest is recorded). See Limits for what this does and does not close.

### `--requalify`

`requalify.cjs` first qualifies Edge. **What it launches (decided, not an oversight):** it starts the two isolated helper
suites (a real headless Edge) when the ONLY failure is `MAJOR_NOT_QUALIFIED`, because that is what a requalification is for and
the only way `qualified.json` can ever receive a new major; the report of such a run is exit 1 anyway and is the evidence for the
card that adds the major. An unsigned, foreign-signed, missing, unparsable or changed binary (any other reason code) never
launches anything: no slot is taken and no suite starts (the hermetic tests `an unsigned, foreign or missing binary is never
launched` and `a new major that is signed still gets its suites run` pin both halves). It then starts `node --test
--test-concurrency=1 --test-reporter=tap isolated.test.cjs` and the same for `loopback.test.cjs`, one process each, from
`testing\browser`, with `NODE_TEST_CONTEXT` removed and `NODE_V8_COVERAGE` emptied in the child environment (L-0002; the key
stays as an own, empty entry because `spawn` copies the caller's value into any environment that has none, L-0140), a 600 s
timeout per suite and the whole process tree (also a detached grandchild) ended with `taskkill /T /F` on our own child at the
timeout. A suite passes only when `pass === tests`, `pass > 0`, nothing is skipped, todo, cancelled or failed, node exited 0,
a complete TAP summary was found, **and** it printed `Real Chromium <version>` (every suite its own line, equal to the qualified
`msedge.exe` version). The report records per suite the exit code, all counters (tests, pass, fail, cancelled, skipped, todo),
the duration, the SHA-256 of the output and the browser versions printed; the stderr line shows the tests that ran per suite
(`isolated.test.cjs 8/8, loopback.test.cjs 5/5`). Edge is qualified again afterwards and the run fails closed when path,
version or SHA-256 changed or a suite ran another Chromium (`BROWSER_VERSION_MISMATCH`). `--slot-script` and `--slot-owner`
wrap the run in a heavy-run slot (run under `pwsh`: Windows PowerShell 5.1 refuses local scripts under its default execution
policy, see `evidence\requalify\cli-02-*`).

## Adding a major (for the card that follows a new Edge major)

Edge updates itself: after the next full Edge restart a new `msedge.exe` major (157 was already staged on 5 Nov) makes every
adopting suite fail closed with `MAJOR_NOT_QUALIFIED` until it is requalified. This tool never adds a major by itself:

1. On the machine that has the new Edge, run (heavy slot, `pwsh`, repository root):
   `node testing\browser\qualify\qualify.cjs --requalify --slot-script <RUN>\scripts\heavy-slot.ps1 --slot-owner <card> --json <new report>.json`.
   Expect exit 1 with only `MAJOR_NOT_QUALIFIED` among the reasons, `requalification.passed: true`, every suite `passed: true`
   with all its tests run, and `Real Chromium <the new version>` printed by both suites. Any other outcome means: do not add it.
2. Archive that report and its transcripts (`archive-run.cjs`), with the new version and SHA-256, in the card's own evidence.
3. In the same card, add the major to `qualified.json` (`"qualifiedMajors": [156, 157]`; the note says why) and run
   `node testing\browser\qualify\qualify.cjs`: it must now exit 0 with the new major. The hermetic tests keep passing (they
   only require 156 to stay listed and the file to be valid).
4. Never add a wildcard, a range or an unrequalified major, and never edit the list from a suite.

## ADOPTION RECIPE for the browser-pin K cards (five lines)

1. `const { qualifyEdge } = require('../../../testing/browser/qualify/qualify.cjs');` (path from your test file; no other import, no package).
2. Once per file, in `before()` (about 1 to 25 s depending on machine load, because Authenticode verification is slow; the call is bounded to about 90 s even when everything hangs): `const edge = await qualifyEdge(); assert.equal(edge.ok, true, edge.reasons.join(' | '));` This replaces `assert.equal(version, '156.0.4314.50')`, every binary-hash pin and every "Edge is installed" check; a failing result is a failure, never a skip. Assertions about an ARCHIVED capture (an integrity test that checks the `.50` recorded in sealed evidence) are historical-record checks, not pins of the installed browser: they stay.
3. Compare live with live, never with history: `assert.equal(session.browserVersion, edge.version);` (Playwright reports exactly the file version here: `156.0.4314.58`; if it ever prints another form, compare `edge.major` with the major of `browserVersion`).
4. Put the ACTUAL values in your diagnostics and evidence (`edge.version`, `edge.sha256`, `edge.signature.publisher`, `edge.path`); an older evidence file that names `.50` is history, not a pin.
5. Never edit `testing\browser\qualify\qualified.json` from a suite: a new major arrives through a card that ran `node testing\browser\qualify\qualify.cjs --requalify` (heavy slot) and archived the passing report. Unit tests that must not touch the machine pass `adapters` (see `tests\support.cjs`).

## Limits: what a signature check does not prove

* A `Valid` Authenticode signature says the certificate chains to a root that this machine trusts and that the signed
  parts of the image still hash as signed. It does **not** say the whole file is unchanged: the certificate table itself is
  not covered by the Authenticode hash (a byte flipped inside the certificate blob keeps `Valid` with another SHA-256, which
  is why the SHA-256 is recorded and read twice). It does not prove the file is the Edge you tested, that the machine is
  not compromised, or that a locally trusted root is honest: a certificate with `O=Microsoft Corporation` under a rogue
  trusted root would pass.
* Only the launcher `msedge.exe` is verified. The versioned `msedge.dll` next to it and the rest of the install are not.
* Revocation is whatever `Get-AuthenticodeSignature` does by default (the OS crypto stack may fetch revocation data; the tool
  itself opens no socket); an offline machine cannot be assured that a certificate was not revoked.
* The check is not atomic, and the three facts do not come from the same open of the file. The signature and the version
  come from one PowerShell start (its own open), the SHA-256 from two separate Node reads (one next to the PowerShell start,
  one after it answered, and both must be equal), and the size and modification time are looked at before and after. The
  size and modification time re-check catches only accidental updates (the modification time is settable); the second digest
  also catches a swap that restores both, but a swap that is restored before the next read, or an attacker who can write
  the Edge directory and time the swap exactly, is not excluded. Edge can also update between `qualifyEdge()` and a later
  `chromium.launch`: the `--requalify` second look and the `BROWSER_VERSION_MISMATCH` comparison catch a change during the
  suites. Call `qualifyEdge()` in the suite that launches. The SHA-256 is an audit record for the human, not a gate.
* The environment is trusted. `%SystemRoot%` picks the Windows PowerShell that answers, and `LOCALAPPDATA`, `PROGRAMFILES`,
  `PROGRAMFILES(X86)` and `HOMEDRIVE` pick the Edge that is qualified (Playwright resolves the same variables, so the tool and
  the launcher agree). Whoever controls these variables or the folders they name controls what is qualified. The tool does
  not defend against a hostile environment; use `options.path` / `options.env` deliberately.
* A qualified major means the isolated helper suites passed on one build of it; behavior changes inside a major are not
  detected, and nothing here says every lesson or capability suite passes.
* Windows PowerShell 5.1 and Windows are required. A hung PowerShell is ended (only the process the tool started, with
  `kill`; its own children would not be).
* The `--json` checks are lexical plus a look at the file system before the run. They do not make the target safe against
  a race (the final write still uses the exclusive-create flag, so an existing file is never overwritten), and they do not
  police where the file goes beyond the name rules.

## Review fix R2 (6 Nov 2026): what the independent review of 4bbf849e found and what changed

| Finding | Fix (test that names it) | Left, and why |
|---|---|---|
| F1 major: a leading U+FEFF was stripped (`TextDecoder` `ignoreBOM`), so a BOM look-alike parsed as `Microsoft Corporation` | `subject.cjs` decodes with `ignoreBOM: true`; the attribute TYPE is trimmed of ASCII space and tab only (it used `trim()`, which strips Unicode whitespace and the BOM); nothing is normalized (`subject-lookalike.test.cjs`: plain, hex-escaped and quoted BOM, a sweep of every format character, joiner, zero-width character and variation selector at the start, middle and end of the organization, through the parser and through `qualifyEdge`) | ASCII space and tab around an unquoted value stay insignificant, as before (documented, pinned) |
| F2 major: `--requalify` could pass with nothing run | the suite verdict is `countsPassed()` plus the per-suite `Real Chromium` line; new codes and messages; per-suite counts in the stderr line (`requalify-verdict.test.cjs`, `requalify-counts.test.cjs`) | each guard of `countsPassed` is pinned by a row that violates only that guard; mutants of single guards of the redundant set are killed through the synthetic rows, not through node output |
| F3 minor: stderr was several lines | one line, whitespace collapsed, same text listed once under all its codes; the write error joins the same line (`cli-line.test.cjs`) | usage errors still print the usage text (that is their purpose) |
| F4 minor: three facts from separate opens, size and mtime only | the digest is read again after the shell answered and both must be equal; README limits corrected (`qualify-recheck.test.cjs`) | the window is narrowed, not closed: see Limits |
| F5 minor: hanging mutants, M24 | explicit per-test timeouts on every never-answering test; a hung suite with a DETACHED grandchild (`requalify-tree.test.cjs`) | M20 (the base64 regex in `decodeInspection`) is near-equivalent: `JSON.parse` after `Buffer.from(text, 'base64')` rejects whatever the regex rejects except input with embedded whitespace that still decodes to valid JSON; it is left and marked as such |
| F6 minor: environment trusted; odd `--json` names | environment listed in Limits; the `--json` target is checked first (`cli-target.test.cjs`) | the environment is not defended against, by design |
| F7 design question (decided by the controller) | `--requalify` starts the suites when the only failure is `MAJOR_NOT_QUALIFIED`; one paragraph above; both halves pinned in `requalify-flow.test.cjs` | none |

Also fixed from the reviewer's list of prose discrepancies: the "file is unchanged since signing" sentence, "no test pins
`qualified.json`", "6 to 15 s per call" (measured 1 to 25 s depending on load), the Node-only/no-network sentence, the
adoption recipe note on archived captures. Sibling found while fixing: `spawn()` re-injects the caller's `NODE_V8_COVERAGE`
into a child environment that lacks the key (L-0140), so nested suites wrote coverage into the caller's directory; the key now
stays as an own, empty entry (`requalify-tree.test.cjs`, real process). A test title that merely mentions `Real Chromium` is no
longer counted as a browser sighting (only the diagnostic line `# Real Chromium <version>` is).

## Layout and evidence (archived with the shared recorder, `* -text -diff` in `evidence\`)

`qualify.cjs` (API and entry), `cli.cjs`, `requalify.cjs`, `adapters.cjs`, `subject.cjs`, `version.cjs`, `qualified.json`,
`U018.feature` (written first), `U018-addendum.feature`, `U018-fix-R2.feature` (the review fix), `tests\` (hermetic suites,
`fixtures\`, `mutation\` tooling, `qualify.machine.test.cjs`). Evidence of the FIRST publication (immutable): `evidence\red`
(stub snapshot, 19 behavioral failures), `evidence\green`, `evidence\coverage`, `evidence\qualification`, `evidence\requalify`
(`cli-02-*` is the retained failed attempt). Evidence of the review fix (new folders, captured last on the final bytes):
`evidence\red\fix-f1-subject-<uuid>`, `fix-f2-requalify-<uuid>`, `fix-f3-f6-cli-<uuid>`, `fix-f4-recheck-<uuid>` (the four NEW
REDs, run on the first-publication code) and `evidence\fix-1\{green,coverage,qualification,requalify,mutation}` (hermetic
suite, the four REDs replayed unchanged on the final code, machine test, one coverage manifest per production file, the real
qualification and requalification, the mutation run). `tests\evidence.test.cjs` recomputes every hash of the new archives
(transcripts, exit codes, the pinned inputs including this README and `qualified.json`) and fails on any change; it shows its
own tamper cases on a scratch copy.

## Results of the first publication (5 Nov 2026, commit 4bbf849e, Windows, Node v22.23.4, Playwright 1.56.1 cached)

These are the figures of the code as first published, kept as the historical record; the review fix below supersedes the
verdict logic and the coverage figures.
* **Qualification of the installed Edge: `ok: true`** (`evidence\qualification\qualification-report.json`): `156.0.4314.58`
  at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, Authenticode status `Valid`, publisher
  `Microsoft Corporation` (`CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US`, issuer
  `CN=Microsoft Code Signing PCA 2024`), major 156 qualified, SHA-256
  `d35d48b11f0439eeeddbbff0bf54856e922f5e1506a2f3098b5a808fcec4068b`. The old pin `156.0.4314.50` fails on it; the
  qualification does not care which build of 156 it is.
* **Requalification: 13 of 13 passed** (`evidence\requalify\requalification-report.json`, exit 0, run through the tool's own
  heavy-slot hook): `isolated.test.cjs` 8/8 in 23.7 s and `loopback.test.cjs` 5/5 in 19.6 s on real headless Edge, the suites
  printed `Real Chromium 156.0.4314.58` (equal to the qualified file version), and path, version and SHA-256 were unchanged
  after the run. The two helper suites never pinned `.50`; the debt is in the 57 namespaces the K cards repair.
  `cli-02-*` is the retained first attempt: it failed closed (exit 1) because Windows PowerShell 5.1 refused the unsigned slot
  script (execution policy); the hook now runs under `pwsh`.
* **RED** `evidence\red\red-01-legacy-equality-pin.json`: the two behavioral test files against a stub that does what the 57
  suites do today (equality with `156.0.4314.50`, no signature, publisher, major, hash or timeout): 19 tests, 0 pass, 19 fail,
  exit 1. **GREEN** `evidence\green\green-01-hermetic-suite.json`: 76 of 76 (fake shells, fixture suites, injected
  adapters, no browser); `green-02-*` replays the 19 RED tests unchanged on the final code: 19 of 19.
* **Per-file coverage** (one L-0004 command per file, thresholds 85/85/85, all exit 0, manifests in `evidence\coverage`):

  | File | Lines | Branches | Functions |
  |---|---|---|---|
  | `adapters.cjs` | 100 | 100 | 100 |
  | `cli.cjs` | 100 | 98.08 | 100 |
  | `qualify.cjs` | 100 | 97.85 | 100 |
  | `requalify.cjs` | 100 | 95.83 | 100 |
  | `subject.cjs` | 100 | 100 | 100 |
  | `version.cjs` | 100 | 100 | 100 |

* **Machine test** `evidence\green\green-03-machine-test.json`: 5 of 5 on the real PowerShell. The real Edge passes; a text
  file named `msedge.exe` fails as `SIGNATURE_NOT_VALID` (status `UnknownError`); the real `node.exe` of this machine has a
  `Valid` signature by `OpenJS Foundation` and fails as `PUBLISHER_NOT_MICROSOFT`; a missing path is `EDGE_NOT_FOUND`;
  the qualified candidate is the very binary Playwright launches for the `msedge` channel.

## Results of the review fix (6 Nov 2026, Windows, Node v22.23.4; archives in `evidence\red\fix-*` and `evidence\fix-1`)

* **RED (four NEW archives, raw transcripts, input hashes; the first-publication RED is untouched).** Each runs on the
  unchanged first-publication code and fails on assertions about the behavior: F1 `subject-lookalike.test.cjs` 8 tests, 5
  fail (leading BOM in three forms, the sweep, `qualifyEdge`, Unicode whitespace around types); F2 `requalify-verdict.test.cjs`
  10 tests, 8 fail (all skipped, all todo, one skip, empty file, no browser line, per-suite line, forged summary, message and
  empty run); F3 + F6 `cli-line.test.cjs` and `cli-target.test.cjs` 10 tests, 9 fail; F4 `qualify-recheck.test.cjs` 6 tests, 3
  fail. The tests that pass on the old code pin behavior that held (the good path, the mismatch code, accepted names).
* **GREEN (`evidence\fix-1\green`)**: the whole hermetic suite and, unchanged, the same four RED commands on the final code
  (`green-fix-02-replay-*`); the machine test on the real PowerShell and Edge; `green-fix-04-evidence-test` recomputes every
  hash of every other new archive. All exit 0 with zero failed, skipped or todo tests.
* **Per-file coverage** (one L-0004 command per production file over the hermetic files, thresholds 85/85/85, all exit 0,
  manifests in `evidence\fix-1\coverage`):

  | File | Lines | Branches | Functions |
  |---|---|---|---|
  | `adapters.cjs` | 100 | 100 | 100 |
  | `cli.cjs` | 100 | 97.09 | 100 |
  | `qualify.cjs` | 100 | 98.15 | 100 |
  | `requalify.cjs` | 100 | 96.91 | 100 |
  | `subject.cjs` | 100 | 100 | 100 |
  | `version.cjs` | 100 | 100 | 100 |

  `coverage-adapters` is a retained failed attempt (one test, the 15 s wall bound of the shell hang test, broke while three
  coverage runs and a mutation run shared a heavily loaded machine; its coverage row was already 100/100/100) and
  `coverage-adapters-2` is the retry on an unchanged tree.

* **Real runs on this machine** (`evidence\fix-1\qualification` and `evidence\fix-1\requalify`): the installed Edge
  qualifies (`ok: true`); `--requalify` through the tool's own heavy-slot hook passes with every test of both isolated suites
  run, both suites printing `Real Chromium <the qualified version>`, and path, version and SHA-256 unchanged.
* **Mutation (`evidence\fix-1\mutation`, tool and mutants in `tests\mutation`):** 70 textual mutants, one at a time on a private
  copy: the 28 of the review (adapted to the fixed code) and 42 for the fixes (every guard of the suite verdict, the BOM and
  normalization, the one-line verdict, the second digest, every `--json` name rule). Each is killed by a named assertion
  (`mutation-result.json` lists the killer test of every mutant) except M20, which is near-equivalent: dropping the base64
  regex in `decodeInspection` changes nothing unless the answer has embedded whitespace that still decodes to valid JSON;
  it is left and said so. The mutants M10, M18 and M19, which hung the old suite, now fail through explicit per-test timeouts.
