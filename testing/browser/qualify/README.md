# U018: Edge qualification (signed by Microsoft, inside the qualified major, fail closed)

Zero-credit tooling item U018 (kind unblock, entry gate U003 Done). It replaces the equality pins on Edge
`156.0.4314.50` that 57 namespaces carry (the installed Edge is `156.0.4314.58`) by one reusable check:

`qualifyEdge()` proves that the binary Playwright launches for the `msedge` channel exists, carries a valid Authenticode
signature whose certificate subject names **Microsoft Corporation** as the organization, and has a four-part file version
whose **major** is listed in the sealed `qualified.json` or in its append-only addendum `qualified.addendum.jsonl`
(a hash chain of one line per added major, see "Adding a major"). It records the actual path, version and SHA-256 and never
compares a build number or a hash with a historical value. Every fact it cannot prove is a failure (fail closed).

Location: the card text says `testing/browser/qualify.cjs`. The publisher authorizes exactly one new directory, so the
module is `testing\browser\qualify\qualify.cjs`. Nothing outside `testing\browser\qualify` changed; `isolated.cjs` and every
other file of `testing\browser` are untouched. Node built-ins and Windows PowerShell only, no packages and no network of the
tool's own (`Get-AuthenticodeSignature` may consult the OS certificate stack for revocation data, see Limits).

## Commands (repository root, PowerShell 7, Node 22)

```powershell
# qualify the installed Edge: real Windows PowerShell, no browser launch; 4 to 7 s on a healthy machine, 12 to 15 s with 1.3 GB free,
# about 33 s alone as one reviewer measured it (Authenticode is slow); the bounds are 240 s per call and 180 s for the one PowerShell start
node testing\browser\qualify\qualify.cjs [--timeout-ms <n>]    # or $env:QUALIFY_TIMEOUT_MS = '<n>' (1 to 1800000; the flag wins)
node testing\browser\qualify\qualify.cjs --json testing\browser\qualify\evidence\qualification\<name>.json   # never overwrites
# requalify: runs isolated.test.cjs and loopback.test.cjs on real headless Edge, one node --test process each
# (measured on the installed Edge 156, 8 and 5 tests: 115.4 s isolated and 47.3 s loopback in the second fix, 137.6 s and 30.3 s in the review)
node testing\browser\qualify\qualify.cjs --requalify --json <out> [--slot-script <heavy-slot.ps1> --slot-owner <name>]
# add a newly qualified major WITHOUT editing any sealed file (see "Adding a major")
node testing\browser\qualify\addendum.cjs --check
node testing\browser\qualify\addendum.cjs --report <out> [--dry-run]
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
# GREEN: the whole hermetic suite (fake shells, fixture suites, injected adapters; no browser): every test file except the three
# that make scratch copies of the namespace and the machine test
$h = Get-ChildItem testing\browser\qualify\tests -Filter *.test.cjs | ? { $_.Name -notmatch '^(evidence|amend-proof|qualify\.machine)' } | % { "testing\browser\qualify\tests\$($_.Name)" }
node --test --test-concurrency=1 @h                                        # 27 files
# Per-file 85/85/85 (L-0004, ONE command per production file; repeat for subject, version, adapters, addendum, requalify, cli, qualify)
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=testing/browser/qualify/adapters.cjs `
  --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 @h   # without the evidence tests
# The one machine test (real installed Edge through the real PowerShell; not part of the coverage run; no browser launch)
node --test --test-concurrency=1 testing\browser\qualify\tests\qualify.machine.test.cjs
# The evidence tests (last: they recompute every archive; the second one runs the first on scratch copies with a valid and tampered addendum)
node --test --test-concurrency=1 testing\browser\qualify\tests\evidence.test.cjs testing\browser\qualify\tests\evidence-amend.test.cjs
node --test --test-concurrency=1 testing\browser\qualify\tests\amend-proof.test.cjs     # every hermetic test + evidence test after fake addendum lines
# Review fix R2: the four NEW REDs fail on the first-publication code and pass unchanged on the final code
node --test --test-concurrency=1 testing\browser\qualify\tests\subject-lookalike.test.cjs                         # F1
node --test --test-concurrency=1 testing\browser\qualify\tests\requalify-verdict.test.cjs                         # F2
node --test --test-concurrency=1 testing\browser\qualify\tests\cli-line.test.cjs testing\browser\qualify\tests\cli-target.test.cjs   # F3 F6 (cli-write.test.cjs: M27, new)
node --test --test-concurrency=1 testing\browser\qualify\tests\qualify-recheck.test.cjs                           # F4
# Review fix R3: the NEW REDs (they failed on the code of df64e7fe, N1 helper tests against a stub) and pass unchanged on the final code
node --test --test-concurrency=1 testing\browser\qualify\tests\addendum.test.cjs testing\browser\qualify\tests\addendum-cli.test.cjs      # N1 helper
node --test --test-concurrency=1 testing\browser\qualify\tests\qualify-addendum.test.cjs testing\browser\qualify\tests\addendum-anomalies.test.cjs   # N1 integration
node --test --test-concurrency=1 testing\browser\qualify\tests\timeouts.test.cjs                                  # N3
node --test --test-concurrency=1 testing\browser\qualify\tests\cli-catch.test.cjs                                 # N5
# Mutation (127 textual mutants, one at a time on a private copy under a SHORT scratch folder; the real tree is never edited)
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
| `SIGNATURE_UNAVAILABLE` / `SIGNATURE_TIMEOUT` | PowerShell is missing, fails, answers garbage or hangs (180 s per start, 240 s outer bound per query, one override for both: `--timeout-ms`, `QUALIFY_TIMEOUT_MS` or `options.timeoutMs`) |
| `SIGNATURE_NOT_VALID` | the Authenticode status is anything but exactly `Valid` (NotSigned, HashMismatch, NotTrusted, UnknownError, `valid`, `Valid `) |
| `PUBLISHER_NOT_MICROSOFT` | the subject cannot be parsed, has no or several `O`, or `O` is not exactly `Microsoft Corporation` (case-sensitive, code point for code point: a BOM, a zero-width or format character, a joiner, a no-break space, a variation selector or a look-alike letter anywhere in the name makes it a different name, nothing is stripped or normalized). A `Valid` signature of another publisher, `Not Microsoft Corp`, `O="Evil, O=Microsoft Corporation"`, `CN=Evil\, O=Microsoft Corporation, O=Evil`, `O=\uFEFFMicrosoft Corporation` all fail |
| `VERSION_UNAVAILABLE` / `VERSION_TIMEOUT` | the file version resource has no value |
| `VERSION_UNPARSABLE` | not exactly `major.minor.build.patch`: four plain decimals, no leading zeros, each at most 65535, no spaces, suffix or `v` |
| `MAJOR_NOT_QUALIFIED` | the major is neither in the sealed `qualified.json` nor in the addendum (155 and 157 fail while 156 passes; there is no "newer is fine" and no wildcard) |
| `QUALIFIED_MAJORS_INVALID` | `qualified.json` is missing, not JSON, empty, a wildcard, strings, fractions, duplicates or out of 1..65535 |
| `QUALIFIED_ADDENDUM_INVALID` | `qualified.addendum.jsonl` exists and is not exactly a valid hash chain (see "Adding a major"): the reason names the line and the rule. It fails the sealed major too, and `--requalify` launches nothing while it is broken. An absent file is no addendum; an empty file is invalid |
| `QUALIFY_TIMEOUT_INVALID` | `options.timeoutMs`, `options.shell.timeoutMs` or `QUALIFY_TIMEOUT_MS` is not an integer number of milliseconds from 1 to 1800000; nothing is asked or started |
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
//   signature: { status, publisher, subject, issuer, thumbprint }, sha256, qualifiedMajors[], qualifiedVia, candidates: [{ path, exists }] }
// qualifiedVia: 'sealed' (the major is in qualified.json), 'addendum' (it was appended) or null (not qualified)
```

All I/O goes through injectable adapters (`options.adapters`): `candidates(env)`, `statFile(path)`, `sha256(path)`,
`signature(path)`, `fileVersion(path)`, `readQualified(path)`, `now()`. Each answer is bounded by `options.timeoutMs`
(default 240 s; the one PowerShell start behind `signature` and `fileVersion` is ended at 75 percent of it, so the outer bound
never fires first; `QUALIFY_TIMEOUT_MS` and `--timeout-ms` set the same value, an explicit `shell.timeoutMs` may only be
smaller) and a throwing, hanging or malformed adapter is a named failure, never a crash. A timeout of the list, candidate, stat,
digest, signature or version adapter fails the check (`outer-timeout.test.cjs`, one test per adapter, each in a child process with
a hard limit); a hung CLOCK only leaves `checkedAtUtc` null, because the time is not a security fact (the same test pins it).
The waits are sequential, so the bound is per wait and not per check: clock, list, candidates, one stat per candidate (at most 5),
the three-way read, the second digest and the last look are at most 11 bounded waits (counted, not timed, by `checklist.test.cjs`),
and a total hang of everything can cost up to 11 times the bound (44 minutes at the default): pass a smaller `--timeout-ms` to
bound the total. No cache keyed by path, size and modification time exists: such a cache would trust a replaced binary.
`options.path` qualifies one explicit file instead of the discovered Edge (the machine test uses it on look-alikes).

* Signature: Windows PowerShell 5.1 (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`) runs
  `Get-AuthenticodeSignature -LiteralPath $env:QUALIFY_TARGET` and `FileVersionInfo.GetVersionInfo`. The path travels in the
  environment variable `QUALIFY_TARGET`, the script as one `-EncodedCommand` argument, so no part of a path can become code.
  The answer is base64 of UTF-8 JSON (a console code page cannot rewrite a publisher name). One start answers both
  questions. The inherited `PSModulePath` is dropped: a PowerShell 7 parent leaves its own module path there and Windows
  PowerShell then fails with `CouldNotAutoloadMatchingModule`. A shell that does not answer within 180 s (75 percent of the outer bound) is killed.
* Publisher: `subject.cjs` parses the distinguished name (quotes, backslash and hex escapes, `,` and `;` separators, the
  OID `2.5.4.10` for `O`) and requires exactly one `O` equal to `Microsoft Corporation`. Multi-valued (`+`) components and
  every malformed name are refused. No substring match is used anywhere.
* Version: the file version string of the binary, parsed strictly by `version.cjs`.
* `qualified.json` is SEALED: `{"qualifiedMajors": [156]}` plus a note, byte-identical since the first publication, pinned by
  the archives of this tool and by `tests\evidence.test.cjs`. It is never edited. A newly qualified major is APPENDED to
  `qualified.addendum.jsonl` by `addendum.cjs` from a passing `--requalify` report (see "Adding a major"); `readQualified`
  reads the sealed file and then the addendum, so `report.qualifiedMajors` is the union. Editing `qualified.json` instead turns
  `tests\evidence.test.cjs` red by name (126 of 128 tests in the review's reproduction); the supported way breaks no test: the
  hermetic tests and the evidence test accept any valid chain (the proof is `tests\amend-proof.test.cjs`, which appends two fake
  majors to a scratch copy and runs everything). The machine test asserts that the installed major is qualified through
  either file, which is the point of it.
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
adopting suite fail closed with `MAJOR_NOT_QUALIFIED` until it is requalified. A major is added in ONE way only, by APPENDING
one line to `qualified.addendum.jsonl` with `addendum.cjs`; `qualified.json` is sealed and stays `[156]`. No test, no archive
and no pin has to change. Procedure (repository root, PowerShell 7; every step was run for real on a scratch copy whose
sealed list said `[155]`, with the installed Edge 156 as the "new" major, see "Results of the second fix"):

1. `node testing\browser\qualify\qualify.cjs` must fail with `MAJOR_NOT_QUALIFIED` only (the installed major is not listed yet).
2. Requalify under a heavy slot and KEEP the report (`--json`):
   `node testing\browser\qualify\qualify.cjs --requalify --slot-script <RUN>\scripts\heavy-slot.ps1 --slot-owner <card> --json <report>.json`.
   Expect exit 1 with only `MAJOR_NOT_QUALIFIED`, `requalification.passed: true` and every suite `passed: true` with all its tests
   run and `Real Chromium <the new version>` printed. Any other outcome means: do not add it.
3. `node testing\browser\qualify\addendum.cjs --report <report>.json --dry-run` checks everything and prints the line it would write.
4. `node testing\browser\qualify\addendum.cjs --report <report>.json` writes it. The helper re-checks the REPORT (schema, a
   passing requalification of exactly `isolated.test.cjs` and `loopback.test.cjs`, signature Valid by Microsoft Corporation,
   version and SHA-256 well formed, the major above the sealed ones and not listed, the Edge unchanged during the run), then
   re-checks the INSTALLED Edge for that major (one PowerShell start: same version, same SHA-256, signature Valid by Microsoft
   Corporation), then takes `qualified.addendum.jsonl.lock` (`wx`; a stale lock refuses), re-reads and re-verifies the file under
   the lock, parses the complete new content once more and replaces the file atomically (temporary file, rename). One line is
   added, nothing else is touched. A failed or forged report, a broken chain or a duplicate is refused: one `FAIL closed` line, exit 1.
5. `node testing\browser\qualify\addendum.cjs --check` (the chain and every rule) and `node testing\browser\qualify\qualify.cjs`
   (exit 0, `qualifiedVia: "addendum"`). Commit `qualified.addendum.jsonl` and keep the report with the card's evidence.

The file is canonical JSON, one line per major, LF only, ASCII only, at most 65536 bytes and 200 lines, a regular file (a
directory, symbolic link or junction is refused), with exactly the keys `major, version, binarySha256, reportSha256, previous,
atUtc` in this order: `major` an integer above the sealed majors and at most 65535 (no wildcard, no range, no string, no
duplicate; nothing can remove a sealed major), `version` four plain decimals of that major, the two digests and `previous` 64
lowercase hex digits, `atUtc` a real UTC time like `2026-11-07T09:00:00.000Z`. `reportSha256` is the SHA-256 of the raw bytes of
the passing report. `previous` is the SHA-256 of the previous line without its line feed; for the first line it is the SHA-256 of
`qualified.json` with CRLF turned into LF (the repository stores LF and `core.autocrlf` checks out CRLF on Windows, so the anchor
is the LF form; `.gitattributes` marks the addendum `-text` so that git never rewrites it, and CRLF in it is refused). Absent means
no addendum; an empty file is invalid. The parser accepts exactly this shape and refuses everything else with
`QUALIFIED_ADDENDUM_INVALID` and the line and rule, also for the sealed major (38 anomalies each with its own reason are pinned in
`addendum-anomalies.test.cjs`, a seeded fuzz of 2500 bytes-mutated files and 2500 mutated reports in `checklist.test.cjs`), and
`--requalify` launches nothing while it is broken.

What the chain protects: an edited, deleted, reordered or duplicated EARLIER line, a wrong anchor and an edited sealed file break
the chain. What it does not: a rewrite of the LAST line, or a consistent rewrite of the whole file by someone who can write this
folder (a hash chain is tamper-evident, not authenticated): git history, review of the commit and the archived report whose digest
each line carries are the anchors. `tests\evidence.test.cjs` pins `qualified.json`, `addendum.cjs` and `version.cjs` by hash inside
the test (L-0103) and verifies the live addendum through that pinned verifier, never by bytes. Never add a wildcard, a range or an
unrequalified major, and never edit the list from a suite.

Limits of the second fix that were found by its own pre-publication self-review and left (each is a named gap, not a claim):
`addendum.cjs` is total for JSON-carried input (the report file, the bytes of the addendum: the fuzz) but `checkReport()` called
directly with an in-memory object that has a null prototype or a throwing getter can throw a `TypeError` (the command line turns
it into one `FAIL closed` line, exit 1); the exported `KEYS` array is not frozen; the append does not retry an `EBUSY` or `EPERM`
of the rename (it refuses with a typed message and the old file stays intact); the `--help` text of `qualify.cjs` and a comment in
`qualify.cjs` say that a timeout never passes a check, which holds for every adapter except the clock (see above); the mutants are a
chosen list of 127, not a
generator over every statement and condition; the timing-sensitive tests (the 15 s limit of `outer-timeout.test.cjs`, the shell
hang tests) were not run 64 times in an 8-way loop; and the suite was run on the working tree (CRLF), not on a `git archive` tree
in LF and in CRLF.

## ADOPTION RECIPE for the browser-pin K cards (five lines)

1. `const { qualifyEdge } = require('../../../testing/browser/qualify/qualify.cjs');` (path from your test file; no other import, no package).
2. Once per file, in `before()` (4 to 7 s on a healthy machine, 12 to 15 s with 1.3 GB free, because Authenticode verification is slow; each wait is bounded to 240 s, a total hang costs up to 11 waits, `QUALIFY_TIMEOUT_MS` changes the bound): `const edge = await qualifyEdge(); assert.equal(edge.ok, true, edge.reasons.join(' | '));` This replaces `assert.equal(version, '156.0.4314.50')`, every binary-hash pin and every "Edge is installed" check; a failing result is a failure, never a skip. Assertions about an ARCHIVED capture (an integrity test that checks the `.50` recorded in sealed evidence) are historical-record checks, not pins of the installed browser: they stay.
3. Compare live with live, never with history: `assert.equal(session.browserVersion, edge.version);` (Playwright reports exactly the file version here: `156.0.4314.58`; if it ever prints another form, compare `edge.major` with the major of `browserVersion`).
4. Put the ACTUAL values in your diagnostics and evidence (`edge.version`, `edge.sha256`, `edge.signature.publisher`, `edge.path`); an older evidence file that names `.50` is history, not a pin.
5. Never edit `testing\browser\qualify\qualified.json` (sealed) or `qualified.addendum.jsonl` from a suite: a new major arrives through a card that ran `node testing\browser\qualify\qualify.cjs --requalify` (heavy slot), kept the passing report and appended the line with `node testing\browser\qualify\addendum.cjs --report <report>` (see "Adding a major"). Unit tests that must not touch the machine pass `adapters` (see `tests\support.cjs`).

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

## Review fix R3 (6 Nov 2026): what the second independent review found and what changed

| Finding | Fix (test that names it) | Left, and why |
|---|---|---|
| N1 major: no append-only way to add a qualified major; the documented way (edit `qualified.json`) turned this tool's own evidence test red (126 of 128), while Edge 157.0.4341.42 is staged and every `qualifyEdge()` adopter fails `MAJOR_NOT_QUALIFIED` after the next restart | `qualified.json` stays sealed (`[156]`, byte-identical); the NEW append-only `qualified.addendum.jsonl` (hash chain, anchor = SHA-256 of the sealed file with CRLF as LF) is read by `readQualified` after it; `addendum.cjs` appends the next line from a passing `--requalify` report; `evidence.test.cjs` pins `qualified.json`, `addendum.cjs` and `version.cjs` by hash inside the test and verifies the chain, never the bytes (`addendum.test.cjs`, `addendum-cli.test.cjs`, `addendum-anomalies.test.cjs`: 38 anomalies each with its own reason, plus a directory, a junction and a symbolic link, `qualify-addendum.test.cjs`, `evidence-amend.test.cjs`, `amend-proof.test.cjs`, machine test (d)) | the chain does not protect the last line against a rewrite by someone who can write the folder (see "Adding a major"); the 201st line is refused (limit 200) |
| N2 minor: the README mutation paragraph contradicted its archive (63 of 70 killed; M20 F4c F6a F6b F6c F6f F6g not killed; M10 killed only by a harness hang) | `survivors.test.cjs` and the new test files are part of the harness order; the numbers below are those of the archive; M10 fails the named assertion `OUTER BOUND ... (<adapter>)` of `outer-timeout.test.cjs` (every never-answering adapter runs in a child process with a hard limit, all children at once) | the entry `.catch` in `qualify.cjs` is defense in depth behind the catch in `main` and cannot be reached by a test, so it has no mutant |
| N3 minor: limits too tight (shell 60 s, outer 90 s), no override, cost figure not robust | defaults 240 s per wait and 180 s for the PowerShell start (75 percent of the outer bound, so the outer bound never fires first); ONE override (`--timeout-ms`, `QUALIFY_TIMEOUT_MS`, `options.timeoutMs`) sets both; invalid values are refused by name (`timeouts.test.cjs`); measured costs are in "Commands"; the sum of the sequential waits (11) is stated and counted (`checklist.test.cjs`) | no cache keyed by path, size and modification time: such a cache would trust a replaced binary; the total is not capped by one budget (11 waits) |
| N4 minor: two guard mutants survived (A6 NFKC at the verdict, B10 version-line anchor) | `n4-guards.test.cjs`: look-alikes at the verdict of `qualifyEdge()` give `PUBLISHER_NOT_MICROSOFT` with a populated reason, a test TITLE with `# Real Chromium` is no sighting, an indented nested diagnostic is | none |
| N5 minor: L-0141, no catch at the top of `main`, no entry `.catch` | everything in `main` (verdict, `out.write`, `err.write`) is inside one try/catch: ONE typed `FAIL closed` line and exit 1 whatever `NODE_OPTIONS=--unhandled-rejections` says (`cli-catch.test.cjs` with the fault-injection preload `tests\fixtures\stdout-thrower.cjs`, default, `warn` and `none`, and both streams broken) | when stderr is broken as well the exit code is the only signal |

## Layout and evidence (archived with the shared recorder, `* -text -diff` in `evidence\`)

`qualify.cjs` (API and entry), `cli.cjs`, `requalify.cjs`, `adapters.cjs`, `addendum.cjs` (helper and verifier of the addendum),
`subject.cjs`, `version.cjs`, `qualified.json` (sealed), `qualified.addendum.jsonl` (append-only, absent until a major is added),
`.gitattributes` (the addendum is `-text`), `U018.feature` (written first), `U018-addendum.feature`, `U018-fix-R2.feature`,
`U018-fix-R3.feature` (the two review fixes), `tests\` (hermetic suites,
`fixtures\`, `mutation\` tooling, `qualify.machine.test.cjs`). Evidence of the FIRST publication (immutable): `evidence\red`
(stub snapshot, 19 behavioral failures), `evidence\green`, `evidence\coverage`, `evidence\qualification`, `evidence\requalify`
(`cli-02-*` is the retained failed attempt). Evidence of the review fix (new folders, captured last on the final bytes):
`evidence\red\fix-f1-subject-<uuid>`, `fix-f2-requalify-<uuid>`, `fix-f3-f6-cli-<uuid>`, `fix-f4-recheck-<uuid>` (the four NEW
REDs, run on the first-publication code) and `evidence\fix-1\{green,coverage,qualification,requalify,mutation}` (hermetic
suite, the four REDs replayed unchanged on the final code, machine test, one coverage manifest per production file, the real
qualification and requalification, the mutation run). `tests\evidence.test.cjs` recomputes every hash of the archives of both
fixes (transcripts, exit codes, the pinned inputs) and fails on any change; it shows its own tamper cases on a scratch copy.
Evidence of the second fix (R3, again NEW folders, captured last on the final bytes): the NEW REDs `evidence\red\fix2-n1-addendum-<uuid>`
(the helper against a stub; `addendum.stub.cjs.txt` is the stub; the first archive pinned a test file with one test bug and is
retained, the retry `red-fix2-n1-addendum-module-retry` pins the corrected bytes), `fix2-n1-qualify-<uuid>`, `fix2-n1-evidence-<uuid>`,
`fix2-n3-timeouts-<uuid>`, `fix2-n5-cli-catch-<uuid>`, and `evidence\fix-2\{green,coverage,qualification,requalify,mutation}`.
`tests\evidence.test.cjs` pins `qualified.json`, `addendum.cjs` and `version.cjs` by hash inside the test, verifies the live
`qualified.addendum.jsonl` through the pinned verifier (the chain, never the bytes), and lists the few files whose first-fix pins
the second fix had to supersede (each must really differ from an old pin and be pinned again by an archive of the second fix);
`tests\evidence-amend.test.cjs` runs the REAL evidence test on a scratch copy (a valid chain stays green; an edited, deleted,
swapped, unanchored, junk, CRLF or empty addendum, an edited sealed list and an edited verifier each fail by name) and
`tests\amend-proof.test.cjs` runs every hermetic test and the evidence test on a scratch copy that got two fake majors.

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
  copy: the 28 of the review (adapted to the fixed code) and 42 for the fixes. CORRECTED by the second fix (the review of this
  fix found the paragraph false): the archived run killed 63 of 70; M20, F4c, F6a, F6b, F6c, F6f and F6g were not killed because
  the harness did not run `survivors.test.cjs`, and M10 was killed only by the harness's external timeout (a hang). The real
  figures of the final code, with the survivors file in the order and a named killer for M10, are under "Results of the second fix".
  M20 is near-equivalent: dropping the base64 regex in `decodeInspection` changes nothing unless the answer has embedded
  whitespace that still decodes to valid JSON.

## Results of the second fix (6 Nov 2026, Windows, Node v22.23.4; archives in `evidence\red\fix2-*` and `evidence\fix-2`)

* **RED (five NEW archives plus one retry, raw transcripts, input hashes).** Each runs against the unchanged code of `df64e7fe`
  (the helper against a stub that accepts everything, `addendum.stub.cjs.txt`) and fails on assertions about the behavior:
  * N1 helper (`addendum.test.cjs`, `addendum-cli.test.cjs`): `red-fix2-n1-addendum-module-retry` 17 tests, 17 fail (the retry pins
    a test file in which one crash scenario reused a refused report; the first archive `red-fix2-n1-addendum-module` is retained);
  * N1 integration (the real `readQualified` ignores the file): `red-fix2-n1-qualify-addendum` 46 tests, 45 fail;
  * N1 evidence (the evidence test of `df64e7fe` does not turn red for an edited, deleted, swapped, unanchored, junk, CRLF or empty
    addendum, nor for an edited verifier): `red-fix2-n1-evidence-amend` 12 tests, 9 fail;
  * N3: `red-fix2-n3-timeouts` 9 tests, 9 fail;
  * N5 (a stack trace in the default mode, a silent exit 0 under `--unhandled-rejections=warn` and `none`): `red-fix2-n5-cli-catch` 5 tests, 4 fail.

  The N2 and N4 tests pass on the old code by design: the old code is correct, the weakness was in the tests, so their proof is that
  they kill the mutants M10, A6 and B10 (see Mutation).
* **GREEN (`evidence\fix-2\green`)**: the whole hermetic suite `green-fix2-01-hermetic-suite` 225 of 225 (29 files, no browser); the NEW
  REDs replayed unchanged on the final code: `green-fix2-02-replay-n1-addendum` 17 of 17, `green-fix2-02-replay-n1-qualify` 46 of 46,
  `green-fix2-02-replay-n3-timeouts` 9 of 9, `green-fix2-02-replay-n5-cli-catch` 5 of 5; the guards of N2 and N4, the test that kills
  M20 and the tests of the pre-publication self-review `green-fix2-02-guards-n2-n4` 26 of 26; the machine test on the real PowerShell
  and Edge, including a major that qualifies only through the addendum, `green-fix2-03-machine-test` 6 of 6; the evidence tests
  (`green-fix2-04-evidence-tests`) and `green-fix2-05-amend-proof` (every hermetic test and the evidence test after two fake majors were
  appended) are captured last and pass with no failed, skipped or todo test.
* **Per-file coverage** (one L-0004 command per production file, thresholds 85/85/85, all exit 0, manifests in `evidence\fix-2\coverage`;
  each command runs the hermetic files that load the file, listed in its manifest):

  | File | Lines | Branches | Functions |
  |---|---|---|---|
  | `adapters.cjs` | 100 | 100 | 100 |
  | `addendum.cjs` | 98.14 | 96.62 | 94.44 |
  | `cli.cjs` | 100 | 97.37 | 100 |
  | `qualify.cjs` | 94.47 | 99.29 | 94.44 |
  | `requalify.cjs` | 100 | 96.91 | 100 |
  | `subject.cjs` | 100 | 100 | 100 |
  | `version.cjs` | 100 | 100 | 100 |

  The uncovered lines of `qualify.cjs` are the command-line entry (`require.main === module`, 240-253), which only a child process
  reaches (`cli-catch.test.cjs` and the other command-line tests run it for real, outside the coverage of this process).
* **Procedure of "Adding a major", run for real** (`evidence\fix-2\requalify\procedure-transcript.txt` and
  `requalification-report.json`): on a scratch copy whose sealed list says `[155]` the installed Edge `156.0.4314.58` is the
  "new" major. `qualify.cjs` fails with `MAJOR_NOT_QUALIFIED` only; `--requalify` through the tool's own heavy-slot hook runs both
  isolated suites on real headless Edge (8/8 and 5/5, `Real Chromium 156.0.4314.58`, the Edge unchanged); `addendum.cjs --report
  --dry-run` prints the line; the real append writes it; a second append of the same major is refused; `--check` says
  `OK qualified list: sealed [155] and addendum [156] (1 line)`; `qualify.cjs` passes with `qualifiedVia: "addendum"`; changing
  one digit of the anchor makes `--check` and `qualify.cjs` fail closed with `QUALIFIED_ADDENDUM_INVALID`. The sealed list was not
  touched. The report's SHA-256 is the `reportSha256` of the appended line (checked by `evidence.test.cjs`).
* **Mutation (`evidence\fix-2\mutation`, tool and mutants in `tests\mutation`)**: 126 of 127 mutants were killed by a named assertion
  (`mutation-result.json` lists the killer test of every mutant; none was killed by the harness timeout): the 70 of the first fix
  (M03 follows the changed code), `survivors.test.cjs` is part of the order now, and 57 new ones for N1 (the 21 rules of the parser, the
  16 checks of the report and of the installed Edge, the lock, the dry run, the chain), N3, N4 and N5. The seven mutants that the first
  run did not kill: F4c, F6a, F6b, F6c, F6f and F6g are killed by `survivors.test.cjs`; M10 is killed by `outer-timeout.test.cjs` with
  the named assertion `OUTER BOUND: an adapter that never answers (<adapter>) ends the check within its bound and fails closed`
  (every never-answering adapter runs in a child process with a hard limit, all children at once, so a missing bound fails within one
  limit); A6 and B10 are killed by `n4-guards.test.cjs`. M20 (the base64 guard of the shell answer dropped) is the one mutant that
  the archived run did not kill (`M20-base64-check-dropped`, SURVIVED). It is NOT equivalent: without the guard Node's lenient base64
  decoder skips a stray character or embedded whitespace, so the answer is decoded around it. `decode-base64.test.cjs` (added after
  the run) refuses six such answers as "not base64"; it passes on the real code and fails on a scratch copy of the M20 mutant
  (checked by hand, not re-run by the harness, whose order and tool are pinned by the archive). The harness itself is unchanged
  in method: it applies one textual mutant at a time to a private copy; it is a chosen list, see the limits above.
