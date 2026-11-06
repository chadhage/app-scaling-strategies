# testing\quality: validator for native-run approval packets (U001, third version)

Zero-credit tooling item U001. It turns the checks of the independent reviews of the U001 packet into a hermetic validator that a native-run approval
packet (this one and later ones for other configurations) goes through before an owner is asked to answer it. Node built-ins only, CommonJS, no packages,
no network, no clock inside the pure functions.

**What it is: a tripwire for accidental edits and for the shapes listed below, not a proof.** It cannot prove that a price or a Learn fact is true, that the
owner machine is on at the deadline, or that a spelling or phrasing it does not list is harmless. This third version answers the third review (findings
N1 to N16): three rounds of deny-list patching lost against new bypasses, so the guarded code of the plan is now a CLOSED list of statement shapes, the work
is bounded by typed caps, and the markdown copy is compared with the JSON in order. A correct statement that is not one of the reviewed shapes is refused too
(by design: the plan needs a reviewed new shape first).

## Files

| File | Role |
| --- | --- |
| `packet-validator.cjs` | `validatePacket(packet, { nowUtc, markdown })` returns `{ ok, findings: [{ code, path, message }] }`; never throws; `RULE_CODES` lists every code |
| `validate-packet.cjs` | CLI; the only file that reads files, stdin and the clock; typed one-line answers, exit 0 ok, 1 findings, 2 usage or unreadable input |
| `limits.cjs`, `text.cjs`, `dates.cjs`, `ident.cjs`, `meters.cjs` | the caps and the iterative inventory (nesting, nodes, string length, a total character budget, runs of combining marks), the memoised normalisation with its counters, strict ISO dates, the GUID, e-mail, secret and wording scanners, the public meter catalog as SHA-256 hashes |
| `shapes.cjs` | the closed list of 66 statement shapes (literal text with slots that have closed vocabularies) and the reviewed sequence of shapes of every container: guards, arming, guard functions, deletion block, verification, rollback, unattended script; the disarm and the alarm-path rules |
| `shell.cjs`, `rules-commands.cjs` | a quote-aware shell parser with a parent pointer per block and hard caps, and the command analysis: closed az command list, one occurrence of every option, own `--subscription`, delete target, own preceding guards, one definition per guard, lease variables assigned once, indirection refused by name |
| `rules-prices.cjs`, `rules-options.cjs`, `rules-plan.cjs`, `rules-script.cjs`, `rules-decisions.cjs`, `rules-hygiene.cjs`, `util.cjs` | the rules (pure) |
| `rules-markdown.cjs`, `markdown-structure.cjs` | the markdown copy: required facts, amounts, command sets, and the ordered comparison of the structured parts with the JSON, plus the claim wording rules |
| `U001.feature` | the specification the tests were written from |
| `fixtures\packet-accepted.json` | the accepted fixture: a trimmed copy of the revision 4 packet JSON (placeholders only, meter IDs replaced by `fixture-meter-N`, 101 of 107 register lines, hash recomputed) |
| `fixtures\packet-revision-3.json` | the trimmed revision 3 packet (the rejected one): a test shows that this version refuses it for N1 and N2 |
| `tests\` | `*.test.cjs`; `r4-*.test.cjs` are the hostile tests of the third review (the RED), `shapes.test.cjs` the generator of hostile variants, `teardown.test.cjs` runs the packet's PowerShell against a fake az with `pwsh`; `support.cjs`, `hostile.cjs`, `md.cjs` (a markdown copy that is faithful to the JSON) are helpers |
| `mutate.cjs`, `mutants.cjs`, `replay-red.cjs` | tooling (not production code): the mutation run (chosen mutants plus mutants generated from the caps), the RED replay against a naive subject |
| `evidence\r4\` | the archived runs of this version (below); `evidence\r3`, `red`, `green`, `coverage`, `old-packet` are the archives of the earlier versions and stay untouched |

## Commands (repository root, PowerShell)

Whole suite (`--test-concurrency=1`; it starts `pwsh` for the teardown scenarios, so `pwsh` 7 must be on the PATH):

```powershell
$t = Get-ChildItem testing\quality\tests\*.test.cjs | ForEach-Object { $_.FullName }
node --test --test-concurrency=1 $t
```

Validate a packet (exit 0 ok, 1 findings, 2 usage or unreadable input). `--now` is an ISO instant or a date (`2026-11-06T12:00:00Z`, `2026-11-06`); anything else exits 2. A U001 result file with `packet` and `packetMarkdown` is unwrapped; `-` reads stdin. The default clock is the real one, so a packet fails once its prices are older than 7 calendar days:

```powershell
node testing\quality\validate-packet.cjs <RUN>\results\U001-packet.json --markdown <RUN>\results\U001-packet.md --now 2026-11-06T12:00:00Z
```

Per-file coverage, ONE L-0004 command per production file, 85/85/85 (Node prints no row for an unloaded file and still exits 0: look for the row; the manifests record `coverageRows`). The test files of each command are in `evidence\r4\coverage\cov-<file>-N.json` (`command`); for example:

```powershell
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=testing/quality/shapes.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 testing/quality/tests/shapes.test.cjs testing/quality/tests/r4-shapes.test.cjs
```

Mutation run (each mutant in a private copy outside the repository; exit 0 only if every mutant is killed) and the RED replay against a naive subject (expected exit 1):

```powershell
node testing\quality\mutate.cjs --scratch <empty folder outside the repository>
node testing\quality\replay-red.cjs --scratch <empty folder outside the repository>
```

Replay of the historical RED (`evidence\r4\red-01`: the four hostile test files against the validator as published in commit `194e165f`; expected exit 1 with 151 tests, 40 pass, 111 fail). It needs `tar` (Windows 10 and later have it); run it from the scratch folder, never from the repository root:

```powershell
$s = '<empty folder outside the repository>'
git archive --format=tar -o "$s\old.tar" 194e165f testing/quality
tar -xf "$s\old.tar" -C $s
foreach ($n in 'r4-shapes.test.cjs', 'r4-bounds.test.cjs', 'r4-markdown.test.cjs', 'r4-minor.test.cjs', 'md.cjs', 'support.cjs') { Copy-Item "testing\quality\tests\$n" "$s\testing\quality\tests\$n" -Force }
Copy-Item testing\quality\fixtures\packet-revision-3.json "$s\testing\quality\fixtures\packet-accepted.json" -Force
Copy-Item testing\quality\fixtures\packet-revision-3.json "$s\testing\quality\fixtures\packet-revision-3.json" -Force
Set-Location $s; $env:NODE_OPTIONS = '--stack-trace-limit=0'
node --test --test-concurrency=1 testing\quality\tests\r4-shapes.test.cjs testing\quality\tests\r4-bounds.test.cjs testing\quality\tests\r4-markdown.test.cjs testing\quality\tests\r4-minor.test.cjs
```

Take a heavy slot first when other agents run (`RUN\scripts\heavy-slot.ps1 -Action Acquire -Owner <item>`, release in `finally`). Run experiments against an unfixed tool from a scratch working directory, never from the repository root.

## Evidence (`evidence\r4`, written with `RUN\scripts\archive-run.cjs`, raw transcripts are gzip files)

| Folder | What |
| --- | --- |
| `red-01` | the HISTORICAL RED of this fix: the four hostile test files (`r4-shapes`, `r4-bounds`, `r4-markdown`, `r4-minor`) against the validator as published in `194e165f` with the revision 3 fixture: 111 of 151 tests fail ("accepted although it must be refused": duplicate options, redefined guards, reassigned variables, indirection, the disarm, the alarm path, the nested script in a 300 MB child, the combining marks and the budget, the markdown lines of the reviewer, the residual spellings). Its inputs are the files of that moment (the fixture was replaced by revision 4 afterwards), so only its transcripts are checked |
| `final-red` | RED on the FINAL tests against a naive subject (`stubs\`: an accept-everything validator and a CLI that exits 0; every test file except `evidence.test.cjs`). Replay: `node testing\quality\replay-red.cjs --scratch <folder outside the repository>` (expected exit 1). Archived result: 747 tests, 94 pass, 653 fail (651 are assertion failures such as "missing DELETE_UNGUARDED", two are test errors caused by the empty answer of the naive subject; the 94 that pass test the helper modules that stay real, the PowerShell with a fake az, or expect an accepted packet). The transcript names the scratch copy by its absolute path |
| `coverage` | one manifest per production file, thresholds 85/85/85, exit 0 and a printed row for the file. A failed or superseded attempt stays under its number: `cov-markdown-structure-1` (three test files, 82.95 percent of the branches, exit 1) and `cov-markdown-structure-2` (adds the older markdown tests); the second attempts of `limits`, `packet-validator`, `validate-packet` and `shapes` replace runs whose inputs changed afterwards |
| `mutants` | the mutation runs of `mutants.cjs` (the chosen mutants and the mutants generated from the caps): `mutants-1` on earlier bytes (3 survivors that later edits closed and a stop of the runner on a busy folder, exit 1: kept as the record) and `mutants-2` on the final bytes (every mutant of the list, exit 0 only because every mutant was killed); the shape list is mutated in process by `tests\shapes.test.cjs` |
| `packets` | the CLI on the packets of revisions 1, 2 and 3 (rejected) and of revision 4 with its markdown (accepted) |
| `teardown` | the packet's PowerShell run by `pwsh` against a FAKE az function (`tests\teardown.test.cjs`, 8 scenarios): the happy run, a failed delete with a normal, a missing (redirected) and no usable Desktop folder (the alarm file EXISTS; the dialog names it), a file that cannot be written, wrong guards (nothing deleted, alarm), and the guarded disarm (unregisters only when `az group exists` answers false). No scheduled task is registered and no az command is run |
| `green` | the last archived runs: every test file, then `final-evidence-check` |
| `historical-files.json` | the SHA-256 of every file of the earlier archives (`evidence\r3`, `red`, `green`, `coverage`, `old-packet`): they are historical, their inputs describe the files of their own commit, so `tests\evidence.test.cjs` checks that these files never change and recomputes only the ACTIVE manifests (`evidence\r4`, except `red-01`) against the working files |

Attempts: every run is archived under a new number and never overwritten. Do not edit a file that is an input of an active manifest: the recompute test would fail. The README and `U001.feature` are inputs of the last `green` run (`green-all-tests`) only: do not edit them after that run.

## What the validator does with the plan

* Every line of every command container (guards, arming sequence, guard functions, deletion block, verification, rollback and the unattended script) must match one of the shapes of `shapes.cjs` and the sequence of shapes of the container must be the reviewed one (`UNKNOWN_STATEMENT_SHAPE`, `SECTION_SHAPE_SEQUENCE`). The text is compared as written (a zero-width character, a non-breaking space, a look-alike letter or a carriage return makes a line unknown). A repeated option, a second definition of a guard, an assignment to a lease variable, `[System.Diagnostics.Process]::Start`, `[ScriptBlock]::Create`, `InvokeScript`, `Invoke-Expression`, dot-sourcing, `Set-Content` of a script, a here-string, a second disarm and any other statement match no shape and are refused by construction.
* The rules of the second version remain as a second line of defence and name the finding: `DUPLICATE_OPTION` (az keeps the LAST of a repeated option; long and short forms, `=` or space, any case), `GUARD_REDEFINED`, `LEASE_VARIABLE_REASSIGNED`, `INDIRECTION`, `AZ_NO_SUBSCRIPTION`, `DELETE_TARGET`, `DELETE_UNGUARDED`, `COMMAND_FORBIDDEN` and the others of `RULE_CODES`.
* The disarm of the scheduled teardown job (`Unregister-ScheduledTask`, and any `Disable-` or `Stop-ScheduledTask` or `schtasks`) must be the one guarded line of verification check 6 (`if ((az group exists ...) -eq 'false') { Unregister-ScheduledTask ... } else { throw ... }`): `DISARM_UNGUARDED`, `DISARM_MISPLACED`, `DISARM_DUPLICATE`, `DISARM_MISSING`.
* The alarm folder of the unattended script comes from `[Environment]::GetFolderPath('Desktop')` and falls back to the temp folder and the script folder (`SCRIPT_ALARM_PATH`). `tests\teardown.test.cjs` runs the script text with `pwsh` against a fake az function and asserts that the file EXISTS after a failure with a normal folder, a missing (redirected) Desktop and no usable folder, and that the dialog names the file or says that it could not be written. The WPF dialog itself is replaced by `Write-Output` in the test copy.

## Caps (the work is bounded before anything expensive happens)

| Cap | Value | Typed answer |
| --- | --- | --- |
| nesting of JSON | 64 levels | `INPUT_TOO_DEEP` |
| values in the JSON | 100,000 | `INPUT_TOO_LARGE` |
| one string or key | 20,000 characters | `INPUT_TOO_LARGE` |
| JSON text (CLI) | 2,000,000 characters | `INPUT_TOO_LARGE` |
| all strings and keys plus the markdown | 1,000,000 characters | `INPUT_TOO_LARGE` |
| markdown | 1,000,000 characters | `INPUT_TOO_LARGE` |
| a run of combining marks | 32 | `INPUT_COMBINING_RUN` |
| nesting of blocks in a container | 32 | `INPUT_TOO_DEEP` |
| statements or blocks in a container | 2,000 | `INPUT_TOO_LARGE` |

Every string is normalised once per validation (`text.fold` memoises, `foldStats()` counts the normalize calls and the characters). The tests prove the bounds structurally, not with a time: `tests\r4-bounds.test.cjs` runs the CLI in a child with `--max-old-space-size=300` on the reviewer's nested-script shapes (20,000 and 38,000 nested openers: exit 1 with `INPUT_TOO_DEEP`, never an out-of-memory crash), counts `String.prototype.normalize` calls and characters while the fixture and its markdown are validated, and checks every cap at its boundary. What is NOT claimed: a time bound (a loaded machine decides), a bound for shapes the reviews did not try, or that the scanners are fast on every input; an input inside every cap is processed, at a cost that grows with its size. The CLI reads the whole packet file, the whole markdown file or all of stdin into memory BEFORE any cap applies: a very large file is read completely and only then refused (`INPUT_TOO_LARGE`), so the caps bound the validator's work, not the read.

## Markdown

Compared with the JSON IN ORDER (`markdown-structure.cjs`): the status paragraph (exactly once, unchanged, and no other line that states a status), the revision line (revision, date, author, superseded revision and hash, price date, expiry, HEAD, packet hash), the at-a-glance rows (plan size, per hour, month, expected run, expected cost, deadline, worst case, ceiling), every option block (plan SKU, instances, region candidates, expected hours, deadline and latency, ceiling, the region price rows and quota statuses, the worst-case component rows and the total), the quota table rows, the decision order and defaults, the single recommendation line, every expiry date, and the code blocks line by line in the order of sections 4.1 to 4.6. Money cells are compared as numbers.

Scanned with wording rules only (a tripwire for the reviewed phrasings): every prose line for approval, authorisation, status, "no approval is needed", a free or zero-cost run, the hard and unresolved wording, GUIDs, e-mails, secrets and destructive commands outside code blocks; every dollar amount must be a number of the JSON.

NOT compared with the JSON: the free-form prose of the sections 0a, 1, 3 and 6 and of the appendices, the revision narrative and the text of the headings after their numbers. A contradiction written there passes unless it uses one of the scanned phrasings. Measured with a scratch probe that is NOT a test (first run on earlier bytes, run again on the final bytes with the same answer): appending a suffix to the end of each of the 238 non-empty lines of the faithful copy went unnoticed on 118 lines (the title, headings, descriptive prose and the ends of table rows). A second scratch probe on the final bytes tried hostile additions to the faithful copy: an extra code fence (also one without a language, one with tildes, one with four backticks, one inside section 6), an indented block, inline code, a blockquote, a list item, a table cell and an HTML pre block that carry an `az group delete` are all REFUSED; sentences in prose are ACCEPTED when they use none of the scanned phrasings, for example "To finish quickly delete the resource group with --yes and no checks", "The verification of section 4.5 can be skipped when the run was short", "Run Unregister-ScheduledTask first, then delete" and "The whole run costs about 1 cent". A test that pins the set of compared lines, so that a new rendered line fails until it is compared, is open work.

## Rules (codes in `RULE_CODES`)

| Finding | Where | What fails |
| --- | --- | --- |
| N1 alarm path, N2 disarm | `shapes.cjs`, `tests\teardown.test.cjs` | an alarm folder built by hand; the disarm outside verification check 6, unguarded or twice |
| N4 to N6, N10 shapes | `shapes.cjs`, `shell.cjs`, `rules-commands.cjs`, `rules-script.cjs` | everything that is not a reviewed statement shape; the named second-line findings above |
| N7, N8 bounds | `limits.cjs`, `text.cjs`, `shell.cjs` | see the caps |
| N9 markdown | `markdown-structure.cjs`, `rules-markdown.cjs` | see the markdown section |
| N11 spellings | `ident.cjs`, `rules-prices.cjs`, `rules-hygiene.cjs` | the spellings and phrasings listed below |
| N13 keys | `rules-hygiene.cjs` | a key that is not documented in the authority, an option or a decision; an own `__proto__`, `constructor` or `prototype` key; an `<OWNER-SUPPLIED ...>` placeholder with anything but words, digits and brackets |
| V1 dates, V2 identifiers, V3 priced rows, V5 worst case, V13 cross-checks | `dates.cjs`, `ident.cjs`, `rules-prices.cjs`, `rules-options.cjs`, `rules-decisions.cjs` | as in the second version: strict ISO dates bounded on both sides, no GUID, e-mail or secret, a priced row needs positive register lines, the worst case and the ceilings are recomputed from the caps and the unit prices, quota statuses, defaults and approval flags |

## Limits: what is covered and what is not

* GUIDs, covered: 32 hex digits, dashed, braces, `urn:uuid:`, any case, separated by line breaks, spaces, dots, underscores, markdown emphasis or backticks, up to three of `- . : / , + ' "` between the groups, `<br>` tags, dash entities (`&#45;`, `&ndash;`) and `%2d`, zero-width and non-breaking characters, combining marks, Cyrillic and Greek look-alike letters, full-width digits, glued to letters, a `0x` prefix, a longer last group, ellipses, adjacent array elements, JSON keys, owner placeholders. NOT covered: base64 or other encodings of the 16 bytes, byte-swapped order, a reversed string, a word between the groups, other punctuation, a GUID split over two non-adjacent fields, a GUID spelled in words. A full 40-hex commit id (and any run of 24 or more hex digits with letters and digits) is refused as GUID or secret shaped: quote 12 hex digits (`git rev-parse --short=12`); a full commit id is not allowed in a packet.
* E-mail, covered: plain, `@@`, `[at]` `(at)` `{at}` with `[dot]`, "x at y dot z", "x at y com" (a short list of top-level domains), full-width at, `%40`, `&#64;`, `&#x40;`, spaces around or after the at sign, quoted local part, IDN, domain literal, no top-level domain, `#EXT#` UPN. NOT covered: a space or a line break before the at sign only (`owner @example.com` is indistinguishable from a splat such as `@params.json`), words without "dot" for other top-level domains, other languages, an address split over fields.
* Secrets, covered: known prefixes (AKIA, `ghp_`, `github_pat_`, `xox`, `sk-`), JWT, Entra client secret shape, `NAME_SECRET=value`, `name: value`, "password is value", secret URL parameters, private key blocks, long mixed-case or hex runs. NOT covered: a short or low-entropy secret without a telling name, a random token of 20 to 36 characters, a secret split over elements or fields, an encoded secret.
* Wording covered: hard, enforced, guaranteed, "Azure enforces", "cannot be exceeded", "Azure will stop", "firm cap", "capped by Azure", to be confirmed or decided or agreed, pending confirmation, "set later", TBC, TBD, TODO, FIXME, XXX, `???`, "Option A approved", "go ahead", "deploy now", and in a priced row free, gratis, complimentary, "no additional charge", "covered by the plan", `$0` and "USD 0"; spelling variants (hyphens, spaces, non-breaking spaces, zero-width characters, Cyrillic look-alikes). NOT covered: any other phrasing of the same claims, in any language.
* Placeholders: an `<OWNER-SUPPLIED ...>` placeholder may not carry `=`, a quote, a slash or an underscore; a value written as plain words inside the brackets is indistinguishable from the description.
* Shapes fail closed: the plan accepts only the reviewed shapes in the reviewed order, including their exact texts (also the messages of the `throw` lines and the dialog text). A correct command written another way (`&&` chains, another option order, a comment line, an extra check) is refused until a reviewed shape is added; a packet for another configuration (another resource, another script) needs a new shape list first.
* The meter catalog is a snapshot: a refreshed packet with a new meter needs its hash added to `meters.cjs` (SHA-256 of the lower-case meter ID, `require('node:crypto').createHash('sha256').update(id.toLowerCase()).digest('hex')`). `describesHead` can only be checked for form, not against the real HEAD.
* The validator proves nothing about reality: prices and Learn facts need an independent lookup (Retail Prices API, learn.microsoft.com). It does not run anything of the plan except in the fake-az tests, it cannot prove that the owner machine is on at the deadline, and the State Ready of a real scheduled-task registration was never exercised (no task was registered).
* The tests contain no wall-clock bound. `teardown.test.cjs` needs `pwsh` and uses a scratch folder under `tests\` that it removes at the end.
