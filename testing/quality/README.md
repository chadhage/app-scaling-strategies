# testing\quality: validator for native-run approval packets (U001, second version)

Zero-credit tooling item U001. It turns the checks of the independent reviews of the U001 packet into a hermetic validator that a native-run approval
packet (this one and later ones for other configurations) goes through before an owner is asked to answer it. Node built-ins only, CommonJS, no packages,
no network, no clock inside the pure functions. This second version answers the second review (findings V1 to V14): the first version accepted wrong packets.

## Files

| File | Role |
| --- | --- |
| `packet-validator.cjs` | `validatePacket(packet, { nowUtc, markdown })` returns `{ ok, findings: [{ code, path, message }] }`; never throws; `RULE_CODES` lists every code |
| `validate-packet.cjs` | CLI; the only file that reads files, stdin and the clock; catches everything, one line and a non-zero exit, never a stack trace |
| `limits.cjs`, `text.cjs`, `dates.cjs`, `ident.cjs`, `meters.cjs` | bounds and an iterative walker (V6, V7), normalisation, strict ISO dates (V1), linear GUID, e-mail, secret and wording scanners (V2, V9), the public meter catalog as SHA-256 hashes (V2) |
| `shell.cjs`, `rules-commands.cjs` | a quote-aware shell parser and the command analysis: closed list of az commands, own `--subscription`, delete target, own preceding guards (V4, V10) |
| `rules-prices.cjs`, `rules-options.cjs`, `rules-plan.cjs`, `rules-script.cjs`, `rules-decisions.cjs`, `rules-hygiene.cjs`, `rules-markdown.cjs`, `util.cjs` | the rules (pure) |
| `U001.feature` | the specification the tests were written from |
| `fixtures\packet-accepted.json` | the accepted fixture: a trimmed copy of the revision 3 packet JSON (placeholders only, meter IDs replaced by `fixture-meter-N`, 101 of 107 register lines, hash recomputed) |
| `tests\` | `*.test.cjs` (old tests adapted, `hostile-*` hostile packets, unit tests), `support.cjs`, `hostile.cjs`, `md.cjs` (a markdown copy that is faithful to the JSON) |
| `mutate.cjs`, `mutants.cjs`, `replay-red.cjs` | tooling (not production code): the mutation run, its 38 mutants, the RED replay against a naive subject |
| `evidence\r3\` | the archived runs of this version (below); `evidence\red`, `green`, `coverage`, `old-packet` are the sealed archives of the first version and stay untouched |

## Commands (repository root, PowerShell)

Whole suite (559 tests; 276 s on a quiet machine in the archived run, up to about 8 minutes on a busy one; `--test-concurrency=1`):

```powershell
$t = Get-ChildItem testing\quality\tests\*.test.cjs | ForEach-Object { $_.FullName }
node --test --test-concurrency=1 $t
```

Validate a packet (exit 0 ok, 1 findings, 2 usage or unreadable input). `--now` is an ISO instant or a date (`2026-11-06T12:00:00Z`, `2026-11-06`); anything else exits 2. A U001 result file with `packet` and `packetMarkdown` is unwrapped; `-` reads stdin. The default clock is the real one, so a packet fails once its prices are older than 7 calendar days:

```powershell
node testing\quality\validate-packet.cjs <RUN>\results\U001-packet.json --markdown <RUN>\results\U001-packet.md --now 2026-11-06T12:00:00Z
```

Per-file coverage, ONE L-0004 command per production file, 85/85/85 (Node prints no row for an unloaded file and still exits 0: look for the row; the manifests record `coverageRows`). The test files of each command are listed in `evidence\r3\coverage\cov-<file>*.json` (`command`); for example:

```powershell
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=testing/quality/rules-plan.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 testing/quality/tests/plan.test.cjs testing/quality/tests/hostile-plan.test.cjs testing/quality/tests/shell.test.cjs
```

Mutation run (38 mutants, each in a private copy outside the repository; exit 0 only if every mutant is killed) and the RED replay against a naive subject (expected exit 1):

```powershell
node testing\quality\mutate.cjs --scratch <empty folder outside the repository>
node testing\quality\replay-red.cjs --scratch <empty folder outside the repository>
```

Take a heavy slot first when other agents run (`RUN\scripts\heavy-slot.ps1 -Action Acquire -Owner <item>`, release in `finally`).

## Evidence (`evidence\r3`, written with `RUN\scripts\archive-run.cjs`, raw transcripts are gzip files)

| Folder | What |
| --- | --- |
| `red-01` | the HISTORICAL RED: the four hostile test files of the time against the validator as published in `d8dce7cf` (production files untouched): 307 tests, 226 failing (199 "accepted although it must be rejected", the others a wrong code, two RangeErrors on deeply nested JSON and four timeouts on 200 KB and 5 MB tokens). Its inputs are the tests of that moment; five expectations of my own were corrected afterwards (an upper-case verb, `az.cmd` and `az.exe` with guards in front are guarded deletes; a pipe is a statement boundary; a catch-block regex; a "never returned" price line), so only its transcripts are checked, not its inputs |
| `final-red` | RED on the FINAL tests against a naive subject (`stubs\`: an accept-everything validator and a CLI that exits 0): 556 tests, 67 pass, 489 fail, exit 1. Replay: `node testing\quality\replay-red.cjs --scratch <folder>`; the counts are in the manifest summary (`tests`, `pass`, `fail`). The helper modules stay real in that replay: their RED is `red-01`. Attempt 1 is superseded by attempt 2 (same counts, after the test fix below) |
| `coverage` | one manifest per production file (17), thresholds 85/85/85, exit 0 and a printed row for the file; `cov-text`, `cov-ident`, `cov-dates` and `cov-meters` have an attempt 2 after the test fix below, attempt 1 is superseded |
| `mutants` | the mutation run, 38 mutants: the 18 of the second review rewritten for the new code (M01 to M33), M10b and 19 of the new guards (W01 to W19). Attempt 1 killed 36 and stays as a record: M08 survived because the upper-case GUID test used a GUID of digits only (`.toUpperCase()` changed nothing), W01 survived because the day-of-month comparison alone is redundant (an overflowing day always moves the month). The test was fixed, W01 now removes the whole calendar round trip, attempt 2 kills all 38 |
| `packets` | the CLI on the revision 1 packet (rejected), the revision 2 packet and markdown (rejected for the revision 3 rules) and the revision 3 packet and markdown (accepted) |
| `teardown` | the unattended teardown script of the packet run by `pwsh` against a FAKE az in seven scenarios, and the arming time statements under en-US, fi-FI, da-DK, th-TH and ar-SA |
| `green` | the last archived runs: every test file (`green-all-tests`), including `evidence.test.cjs` which recomputes every manifest of the folders above against the committed files and fails on a tampered manifest, input or transcript; then `final-evidence-check` runs that test alone, so that the manifest of the whole-suite run is verified as well |

Attempts: every run is archived under a new number and never overwritten. `evidence.test.cjs` checks the inputs of the LATEST attempt of each run against the committed files and only the transcripts of superseded attempts (their inputs were the files before a later fix). Do not edit a file that is an input of the latest attempt of a run: the recompute test would fail. The README and `U001.feature` are not inputs.

## Rules (codes in `RULE_CODES`)

| Finding | Where | What fails |
| --- | --- | --- |
| V1 dates | `dates.cjs`, `rules-decisions.cjs` | one strict form each (`YYYY-MM-DD`; `YYYY-MM-DDTHH:MM:SS[.fff]` plus `Z` or an offset), real calendar dates (leap years, 2026-02-30, month 13), a price date after the packet date or after the clock, a packet date more than 5 minutes after the clock, prices older than 7 calendar days at the packet date and at the clock; a clock that is not ISO |
| V2, V9 identifiers | `ident.cjs`, `rules-hygiene.cjs` | keys and values (and adjacent array elements joined) after NFKC, removal of format characters, dash and space folding, markdown and layout squashing; the only GUID-shaped values are catalog meter IDs at `pricing.lines[].meterId` (`METER_ID_UNKNOWN`) |
| V3 priced rows | `rules-prices.cjs` | a priced resource needs price keys that resolve to returned positive register lines and a query id; every zero-shaped wording fails unless it is a labelled estimate or a documented claim that exists; exclusions state why they have no price; required resources must be present |
| V4, V10 commands | `shell.cjs`, `rules-commands.cjs`, `rules-plan.cjs`, `rules-script.cjs` | every command of every container is parsed; az commands come from a closed list; each has its own `--subscription <subscription-id>` (never empty); every delete names `<rg>` or `$Group` and has its own preceding pin and ownership check in the same or an enclosing block (not after, not behind `\|\|`); any other destructive command, a dynamic verb, `Remove-Az*`, REST deletes, complete-mode deployments, unknown fields and destructive text outside the command containers (prose, risks, the markdown) fail |
| A1 to A5 | `rules-plan.cjs`, `rules-script.cjs` | the quota gate sets region AND SKU parameters; time formats and parses use InvariantCulture; the job check compares the registered trigger with the deadline; the unattended script wraps every delete, always ends with the guarded group delete, records failures, exits 1, writes an alarm file and states its limits |
| V5 worst case | `rules-options.cjs` | recomputed from the declared caps and the register unit prices (highest over the candidate regions): usage lines are exactly one per cap with the implied quantity, every option price needs its register line, the ceiling rule and the headroom hold on the recomputed worst case |
| V6, V7 bounds | `limits.cjs`, `validate-packet.cjs` | depth 64, 100000 values, 20000 characters per string or key, 2 MB of JSON, 1 MB of markdown: `INPUT_TOO_DEEP` or `INPUT_TOO_LARGE` in well under a second; scanners are linear; the CLI catches everything |
| V8 markdown | `rules-markdown.cjs` | headings, each ceiling next to its option name, default option and region, every quota status, the price expiry, the allowance and approvals sentences, decision defaults, the hash; dollar amounts must be numbers of the JSON (or group sums of its usage lines); every code line is a command line of the JSON and the other way round; identifiers and wording are scanned |
| V13 cross-checks | `rules-options.cjs`, `rules-decisions.cjs` | a quota status contradicting the owner record, duplicate decisions, extra approval flags, a status that says approved, an approval claim in prose, hollow artifact names, a placeholder that carries a value, a default choice that is not an option |

## Limits: what is covered and what is not

* GUIDs, covered: 32 hex digits, dashed, braces, `urn:uuid:`, any case, separated by line breaks, spaces, dots, underscores, markdown emphasis or backticks, zero-width and non-breaking characters, full-width digits, glued to letters, a `0x` prefix, a longer last group, ellipses, adjacent array elements, JSON keys, owner placeholders. NOT covered: base64 or other encodings of the 16 bytes, byte-swapped order, other punctuation between the groups (`:` `/` `,`), a GUID split over two non-adjacent fields, a GUID spelled in words.
* E-mail, covered: plain, `[at]` `(at)` `{at}` with `[dot]`, "x at y dot z", full-width at, `%40`, `&#64;`, `&#x40;`, spaces around or after the at sign, quoted local part, IDN, domain literal, no top-level domain, `#EXT#` UPN. NOT covered: a space before the at sign only (`owner @example.com`: indistinguishable from a splat such as `@params.json`), words without "dot", other languages, an address split over fields.
* Secrets, covered: known prefixes (AKIA, `ghp_`, `github_pat_`, `xox`, `sk-`), JWT, Entra client secret shape, `NAME_SECRET=value`, `name: value`, "password is value", secret URL parameters, private key blocks, long mixed-case or hex runs. NOT covered: a short or low-entropy secret without a telling name, a secret split over non-adjacent fields, an encoded secret.
* Wording covered: hard, enforced, guaranteed, to be confirmed or decided or agreed, TBC, TBD, TODO, FIXME, XXX, `???`, spelling variants (hyphens, spaces, non-breaking spaces, zero-width and Cyrillic look-alikes).
* Shapes fail closed: the plan sections accept only the documented shapes (`commands` an array of strings, the teardown script an array of lines, lower-case az options such as `--subscription` because az is case-sensitive). A script written as one string, a command in an undocumented field or an unknown step key is rejected (`PLAN_SHAPE`, `SCRIPT_MISSING`, `AZ_NO_SUBSCRIPTION`) even where a human could read it; a packet that uses another shape needs a validator change first.
* The meter catalog is a snapshot: a refreshed packet with a new meter needs its hash added to `meters.cjs` (SHA-256 of the lower-case meter ID, `require('node:crypto').createHash('sha256').update(id.toLowerCase()).digest('hex')`; the generator that the comment at the top of `meters.cjs` names was a scratch script of the worker and is not part of this folder). `describesHead` can only be checked for form, not against the real HEAD.
* The validator proves nothing about reality: prices and Learn facts need an independent lookup (Retail Prices API, learn.microsoft.com). It does not run anything and cannot prove that the owner machine is on at the deadline.
* Timing tests compare against the validation of the plain fixture so that a loaded machine does not make them flaky; a regular expression that backtracks quadratically would still fail them.
