# U018: Edge qualification (signed by Microsoft, inside the qualified major, fail closed)

Zero-credit tooling item U018 (kind unblock, entry gate U003 Done). It replaces the equality pins on Edge
`156.0.4314.50` that 57 namespaces carry (the installed Edge is `156.0.4314.58`) by one reusable check:

`qualifyEdge()` proves that the binary Playwright launches for the `msedge` channel exists, carries a valid Authenticode
signature whose certificate subject names **Microsoft Corporation** as the organization, and has a four-part file version
whose **major** is listed in `qualified.json`. It records the actual path, version and SHA-256 and never compares a build
number or a hash with a historical value. Every fact it cannot prove is a failure (fail closed).

Location: the card text says `testing/browser/qualify.cjs`. The publisher authorizes exactly one new directory, so the
module is `testing\browser\qualify\qualify.cjs`. Nothing outside `testing\browser\qualify` changed; `isolated.cjs` and every
other file of `testing\browser` are untouched. Node built-ins and Windows PowerShell only, no packages, no network.

## Commands (repository root, PowerShell 7, Node 22)

```powershell
# qualify the installed Edge: real Windows PowerShell, no browser launch, about 6 to 15 s here (Authenticode is slow)
node testing\browser\qualify\qualify.cjs
node testing\browser\qualify\qualify.cjs --json testing\browser\qualify\evidence\qualification\<name>.json   # never overwrites
# requalify: runs isolated.test.cjs and loopback.test.cjs on real headless Edge, one node --test process each
node testing\browser\qualify\qualify.cjs --requalify --json <out> [--slot-script <heavy-slot.ps1> --slot-owner <name>]
```

stdout is the JSON report, stderr one verdict line. Exit codes: **0** qualified (with `--requalify`: and the suites passed),
**1** fails closed, **2** usage error or an existing `--json` target. `--slot-script` and `--slot-owner` take a heavy-run
slot through any PowerShell script that supports `-Action Acquire|Release -Owner <name>` (the run folder's
`heavy-slot.ps1`); they are only valid with `--requalify`. Without them, wrap the command in your own slot: it launches
real Edge twice.

### Reproduce RED, GREEN, coverage and the machine test

```powershell
# RED (archived: evidence\red\red-01-legacy-equality-pin.json, 19 tests, 0 pass, 19 fail). Replay in a SHORT scratch folder:
$s = '<RUN>\scratch\u18'; New-Item -ItemType Directory -Force $s | Out-Null; Copy-Item testing\browser\qualify $s\q -Recurse
Copy-Item $s\q\evidence\red\qualify.stub.cjs.txt $s\q\qualify.cjs -Force
Push-Location $s\q; node --test --test-concurrency=1 tests\qualify.test.cjs tests\fail-closed.test.cjs; Pop-Location   # exit 1
# GREEN: the whole hermetic suite (76 tests; fake shells, fixture suites, injected adapters; no browser)
$h = 'qualify','fail-closed','subject','version','adapters','shell','requalify','requalify-flow','cli' | % { "testing\browser\qualify\tests\$_.test.cjs" }
node --test --test-concurrency=1 @h
# Per-file 85/85/85 (L-0004, ONE command per production file; repeat for subject, version, adapters, requalify, cli, qualify)
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=testing/browser/qualify/adapters.cjs `
  --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 @h
# The one machine test (real installed Edge through the real PowerShell; not part of the coverage run; no browser launch)
node --test --test-concurrency=1 testing\browser\qualify\tests\qualify.machine.test.cjs
# When U009 is published, its gate measures the same files: node testing\coverage\gate.cjs --root testing\browser\qualify
```

`tests\fixtures\*` are suites for the requalification runner (pass, fail, hang); they are fixtures, not tests of their own.
Tests create scratch only under `tests\scratch-*` and remove it; no test reads the live git index, a publisher or a clock.

## What is checked, and the reason codes (`report.reasonCodes`, `report.reasons` = `CODE: detail`)

| Code | Fails closed when |
|---|---|
| `EDGE_NOT_FOUND` | no candidate exists: `LOCALAPPDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `%HOMEDRIVE%\Program Files`, `%HOMEDRIVE%\Program Files (x86)` + `\Microsoft\Edge\Application\msedge.exe`, the order Playwright uses for the `msedge` channel that `isolated.cjs` selects. The first existing one is qualified, the rest are only listed in `candidates` |
| `EDGE_NOT_A_FILE` | the first existing candidate is not a regular file |
| `SHA256_UNAVAILABLE` / `SHA256_TIMEOUT` | the digest cannot be computed (it is part of the record) |
| `SIGNATURE_UNAVAILABLE` / `SIGNATURE_TIMEOUT` | PowerShell is missing, fails, answers garbage or hangs (60 s per start, 90 s outer bound per query) |
| `SIGNATURE_NOT_VALID` | the Authenticode status is anything but exactly `Valid` (NotSigned, HashMismatch, NotTrusted, UnknownError, `valid`, `Valid `) |
| `PUBLISHER_NOT_MICROSOFT` | the subject cannot be parsed, has no or several `O`, or `O` is not exactly `Microsoft Corporation` (case-sensitive). A `Valid` signature of another publisher, `Not Microsoft Corp`, `O="Evil, O=Microsoft Corporation"`, `CN=Evil\, O=Microsoft Corporation, O=Evil` all fail |
| `VERSION_UNAVAILABLE` / `VERSION_TIMEOUT` | the file version resource has no value |
| `VERSION_UNPARSABLE` | not exactly `major.minor.build.patch`: four plain decimals, no leading zeros, each at most 65535, no spaces, suffix or `v` |
| `MAJOR_NOT_QUALIFIED` | the major is not in `qualified.json` (155 and 157 fail while 156 passes; there is no "newer is fine" and no wildcard) |
| `QUALIFIED_MAJORS_INVALID` | `qualified.json` is missing, not JSON, empty, a wildcard, strings, fractions, duplicates or out of 1..65535 |
| `EDGE_CHANGED_DURING_CHECK` | size or modification time of the binary differ between the first and the last look |
| `REQUALIFICATION_FAILED` | (`--requalify`) a suite failed, was cancelled, timed out, printed no summary or ran no test |
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
  `--requalify` on it and archived the passing report (the report of a new major fails with `MAJOR_NOT_QUALIFIED` and still
  records the suite counts, which is the evidence that card needs). Nothing else edits the list, no test pins its content.
* SHA-256 is recorded (lower-case hex), never compared with an earlier value.

### `--requalify`

`requalify.cjs` first qualifies Edge and refuses to launch anything unless the only failure is `MAJOR_NOT_QUALIFIED`
(an unsigned, foreign-signed, missing or unreadable binary never runs). It then starts `node --test --test-concurrency=1
--test-reporter=tap isolated.test.cjs` and the same for `loopback.test.cjs`, one process each, from `testing\browser`, with
`NODE_TEST_CONTEXT` and `NODE_V8_COVERAGE` removed from the child environment (L-0002), a 600 s timeout per suite and the
whole process tree ended with `taskkill /T /F` on our own child at the timeout. It records per suite the exit code, the
counts (tests, pass, fail, cancelled, skipped), the duration, the SHA-256 of the output and the browser versions the suites
print (`Real Chromium <version>`), qualifies Edge again afterwards and fails closed when path, version or SHA-256 changed or
when a suite ran another Chromium than the qualified `msedge.exe` (`BROWSER_VERSION_MISMATCH`). `--slot-script` and
`--slot-owner` wrap the run in a heavy-run slot (run under `pwsh`: Windows PowerShell 5.1 refuses local scripts under its
default execution policy, see `evidence\requalify\cli-02-*`).

## ADOPTION RECIPE for the browser-pin K cards (five lines)

1. `const { qualifyEdge } = require('../../../testing/browser/qualify/qualify.cjs');` (path from your test file; no other import, no package).
2. Once per file, in `before()` (about 6 to 15 s because Authenticode verification is slow): `const edge = await qualifyEdge(); assert.equal(edge.ok, true, edge.reasons.join(' | '));` This replaces `assert.equal(version, '156.0.4314.50')`, every binary-hash pin and every "Edge is installed" check; a failing result is a failure, never a skip.
3. Compare live with live, never with history: `assert.equal(session.browserVersion, edge.version);` (Playwright reports exactly the file version here: `156.0.4314.58`; if it ever prints another form, compare `edge.major` with the major of `browserVersion`).
4. Put the ACTUAL values in your diagnostics and evidence (`edge.version`, `edge.sha256`, `edge.signature.publisher`, `edge.path`); an older evidence file that names `.50` is history, not a pin.
5. Never edit `testing\browser\qualify\qualified.json` from a suite: a new major arrives through a card that ran `node testing\browser\qualify\qualify.cjs --requalify` (heavy slot) and archived the passing report. Unit tests that must not touch the machine pass `adapters` (see `tests\support.cjs`).

## Limits: what a signature check does not prove

* A `Valid` Authenticode signature says the certificate chains to a root that this machine trusts and the file is unchanged since
  signing. It does not prove the file is the Edge you tested, that the machine is not compromised, or that a locally trusted
  root is honest: a certificate with `O=Microsoft Corporation` under a rogue trusted root would pass.
* Only the launcher `msedge.exe` is verified. The versioned `msedge.dll` next to it and the rest of the install are not.
* Revocation is whatever `Get-AuthenticodeSignature` does by default (it takes 6 to 15 s here); an offline machine cannot be
  assured that a certificate was not revoked.
* The check is not atomic with the launch: Edge can update between `qualifyEdge()` and a later `chromium.launch`. The
  size and modification time re-check catches a change during the check, the `--requalify` second look and the
  `BROWSER_VERSION_MISMATCH` comparison catch a change during the suites. Call `qualifyEdge()` in the suite that launches.
* A qualified major means the isolated helper suites passed on one build of it; behavior changes inside a major are not
  detected, and nothing here says every lesson or capability suite passes.
* Windows PowerShell 5.1 and Windows are required. A hung PowerShell is ended, its own children would not be.
* The SHA-256 is an audit record for the human, not a gate.

## Layout and evidence (archived with the shared recorder, `* -text -diff` in `evidence\`)

`qualify.cjs` (API and entry), `cli.cjs`, `requalify.cjs`, `adapters.cjs`, `subject.cjs`, `version.cjs`, `qualified.json`,
`U018.feature` (written first), `U018-addendum.feature`, `tests\` (hermetic suites, `fixtures\`, `qualify.machine.test.cjs`),
`evidence\red` (stub snapshot, 19 behavioral failures), `evidence\green` (hermetic suite, RED replay on the final code,
machine test), `evidence\coverage` (one L-0004 manifest per production file), `evidence\qualification` and
`evidence\requalify` (the first reports of the current Edge; `cli-02-*` is the retained failed attempt).

## Results on this machine (5 Nov 2026, Windows, Node v22.23.4, Playwright 1.56.1 cached)

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
