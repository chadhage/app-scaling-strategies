# testing\quality: validator for native-run approval packets (U001)

Zero-credit tooling item U001. It turns the checks of the independent review of the U001 packet (rev-U001, 2026-11-06) into a
durable, hermetic validator that any native-run approval packet (this one, and later ones for other configurations) can be run
through before an owner is asked to answer it. Node built-ins only, CommonJS, no packages, no network, no clock inside the pure functions.

## Files

| File | Role |
| --- | --- |
| `packet-validator.cjs` | `validatePacket(packet, { nowUtc, markdown })` returns `{ ok, findings: [{ code, path, message }] }`; `RULE_CODES` lists every code |
| `rules-prices.cjs`, `rules-options.cjs`, `rules-plan.cjs`, `rules-decisions.cjs`, `rules-hygiene.cjs`, `util.cjs` | the rules (pure, no I/O) |
| `validate-packet.cjs` | CLI; the only file that reads files, stdin and the clock |
| `U001.feature` | the specification the tests were written from |
| `fixtures\packet-accepted.json` | the accepted fixture: a trimmed copy of the U001 revision 2 packet JSON (placeholders only, meter IDs replaced by `fixture-meter-N`, hash recomputed) |
| `tests\*.test.cjs`, `tests\support.cjs` | one negative test per rule code (each mutates a copy of the fixture), edge cases, CLI tests |
| `evidence\red`, `evidence\green`, `evidence\coverage`, `evidence\old-packet` | archived runs (see below); raw transcripts are gzip files, `.gitattributes` keeps them byte-exact |

## Commands (run from the repository root, PowerShell)

Tests (about 5 s):

```powershell
node --test --test-concurrency=1 testing\quality\tests\util.test.cjs testing\quality\tests\prices.test.cjs testing\quality\tests\options.test.cjs testing\quality\tests\plan.test.cjs testing\quality\tests\decisions.test.cjs testing\quality\tests\catalog.test.cjs testing\quality\tests\cli.test.cjs testing\quality\tests\edge.test.cjs
```

Validate a packet (exit 0 ok, 1 findings, 2 usage or unreadable input; a U001 result file with `packet` and `packetMarkdown` is unwrapped and its markdown is checked too; `-` reads stdin):

```powershell
node testing\quality\validate-packet.cjs testing\quality\fixtures\packet-accepted.json --now 2026-11-07T12:00:00Z
node testing\quality\validate-packet.cjs <RUN>\results\U001.json
node testing\quality\validate-packet.cjs <packet.json> --markdown <packet.md> --now <ISO date> --json
```

The default clock is the real one, so the 7-day price rule (`PRICE_STALE_NOW`) makes a packet fail once its prices are older than 7 calendar days: re-run the price queries, rebuild the packet, validate again.

Per-file coverage, one L-0004 command per production file (85/85/85; Node prints no row for an unloaded file and still exits 0, so check that a row exists; the archived manifests record `coverageRows`):

```powershell
$tests = 'util','prices','options','plan','decisions','catalog','cli','edge' | ForEach-Object { "testing\quality\tests\$_.test.cjs" }
foreach ($f in 'util','rules-prices','rules-options','rules-plan','rules-decisions','rules-hygiene','packet-validator','validate-packet') {
  node --test --test-concurrency=1 --experimental-test-coverage "--test-coverage-include=testing/quality/$f.cjs" --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 @tests
}
```

Take a heavy slot first when other agents run (`RUN\scripts\heavy-slot.ps1 -Action Acquire -Owner <item>`, release in `finally`).

## RED, GREEN, old packet (archived with `RUN\scripts\archive-run.cjs`)

* RED: `evidence\red\red-01-stub-accepts-everything.json` (command, input SHA-256, exit 1, 147 of 155 tests failing by assertion). The stubs are kept in `evidence\red\stubs\` (an accept-everything validator and a CLI that exits 0). To replay: copy `testing\quality` to a scratch folder, copy the two stubs over `packet-validator.cjs` and `validate-packet.cjs` there, run the six test files of the manifest (`prices`, `options`, `plan`, `decisions`, `catalog`, `cli`) and expect exit 1 with 147 failures. The files `util.test.cjs` and `edge.test.cjs` were added after GREEN to reach the coverage bar and are not part of the RED run.
* GREEN: `evidence\green\green-01-all-tests.json`; coverage: `evidence\coverage\coverage-<file>.json`.
* The revision 1 packet of U001 (rejected by the independent review, 82 KB, SHA-256 `DD6A0C674FF3D8A9976AED85388C9DF5C6E393BD3A0935A80CDE178A65A50257` for its result file `results\prev\U001.v1.json`) is not committed. `evidence\old-packet\` holds the output of the CLI on it (exit 1): it is rejected for the unguarded destructive steps (`DELETE_UNGUARDED`, `AZ_NO_SUBSCRIPTION`), the missing teardown-latency hour (`OPTION_LATENCY_MISSING`), the "no charge expected" zero (`ZERO_COST_UNSOURCED`) and the missing quota status (`QUOTA_STATUS_MISSING`), among others.

## Rules

| Group | Codes (examples) | What fails |
| --- | --- | --- |
| 1 Prices | `PRICE_NOT_POSITIVE`, `PRICE_NO_CURRENCY`, `PRICE_NO_UNIT`, `PRICE_NO_EFFECTIVE_DATE`, `PRICE_UNAVAILABLE_COSTED`, `UNPRICED_IN_TOTAL`, `RESOURCE_UNAVAILABLE_IN_TOTAL`, `ZERO_COST_UNSOURCED` | a returned price that is not positive, a price without currency, unit or date, an unavailable price costed as 0 or counted in a total, a zero or free claim without the documented wording and a source |
| 2 Options | `OPTIONS_COUNT`, `OPTION_*`, `QUOTA_*` | not exactly three options; OS other than Linux; any recomputed figure that differs (per hour, 730 h month, expected plan cost with the scale step, per-region and aggregate worst case with the teardown-latency hour, usage lines, ceiling = ceil(worst x 1.25 / 5) x 5, cents); a ceiling not labelled "planning bound, not enforced by Azure"; list and create-container operations not priced like writes; a missing or failed quota status on the default region |
| 3 Plan | `GUARD_G1..G4_MISSING`, `ARMING_*`, `AZ_NO_SUBSCRIPTION`, `DELETE_UNGUARDED`, `SCRIPT_*`, `BACKSTOP_NOT_DELETE_FIRST`, `VERIFY_*`, `ROLLBACK_*` | a delete step without the subscription pin (G2) and the ownership tag check (G3); no pre-creation `az group exists` gate (G1) before creation; an az command without `--subscription`; a job registered after the group is created; a script that exports before it deletes; a rollback without the exact swap and the `--action preview` and `--action reset` forms |
| 4 Decisions | `DECISION_*`, `ANSWER_*`, `APPROVAL_*`, `PLACEHOLDER_REQUIRED`, `STATUS_NOT_PROPOSAL`, `UNIT_NOT_PROPOSAL`, `CONSISTENCY_NO_C002_PINS` | a default that is not no, an approval flag true, a subscription or tenant that is not an owner-supplied placeholder, a cents unit stated as fact |
| 5 Secrets | `GUID_FOUND`, `EMAIL_FOUND`, `SECRET_SHAPED` | a GUID anywhere except `pricing.lines[].meterId`, an e-mail address, a secret-shaped string (the packet hashes are allowed) |
| 6 State and dates | `REPO_STATE_*`, `PRICE_DATE_*`, `PRICE_STALE_NOW` | no "State of the repository at HEAD", no quota status, HEAD artifacts presented as approvals, prices older than 7 days |
| 7 Integrity | `INTEGRITY_*`, `MARKDOWN_*`, `HARD_WITHOUT_PHRASE`, `UNRESOLVED_WORDING` | the SHA-256 (of the packet without `integrity` and `validation`, keys in construction order) does not recompute; a markdown copy without the hash, a ceiling or the HEAD section; the word hard without the phrase; "to be confirmed" |

`az account show` (the pin itself, it reads the session default on purpose) and `az extension add` (a local install) are the only az commands allowed without `--subscription`; `az graph query` takes `--subscriptions`.

## What a validator cannot prove

* That a price is the real price, or that a Learn page says what the packet quotes: the validator recomputes arithmetic from the packet's own inputs and checks the register against the options, but prices and documented facts need an independent lookup (the Retail Prices API and learn.microsoft.com), exactly as the independent review did with 19 lookups.
* That a command works: commands are checked as text (regular expressions on statements, quotes stripped), not parsed or run; the PowerShell listings of revision 2 were parse-checked when the packet was built, outside this namespace.
* That the hash protects anything: it sits in the same file as the content, so a consistent rewrite of packet and hash is undetectable; it identifies a version. Only the commit history anchors a version.
* That the owner artifacts at HEAD are what the state section says: `REPO_STATE_ARTIFACTS` checks that demo/, infra, the azure-demo workflows, `.azure/deployment-plan.md` and `demo/cleanup.cjs` are named, not that they exist or match; re-check them with `git log` when HEAD moves (lesson L-0122).
* That a quota status is true: `untested` and `failed-<date>` are statements; only a non-deploying validation and what-if in the owner subscription prove a combination.
* The markdown check is partial (hash, ceilings, section, identifiers, wording); it does not diff the whole markdown against the JSON.

## Hostile inputs tried (each has a test)

A `--subscription` that only appears inside a quoted string or has no value; a delete hidden in a rollback or verification step; a delete whose ownership check comes after it; a script whose ownership function is empty; an exists gate that does not demand `false`; a quota gate without a STOP; a zero, negative, text or missing price; an unavailable price costed as 0 or counted in a total; the word hard without the phrase; GUIDs, e-mail addresses, GitHub tokens, SAS-style query secrets and long base64-like strings in any field or in the markdown; a changed field without a new hash; junk of every shape in every section (the validator reports, it never throws). Not caught by design: a consistent rewrite of packet and hash, a command that only looks right as text, and any fact that needs a lookup (see above).

## Hermetic by construction

No network, no packages, no temporary files: the CLI tests pass the packet on stdin, nested `node` children run with `NODE_TEST_CONTEXT` and `NODE_V8_COVERAGE` removed (L-0002), the tests inject the date, and the fixture is the only data file. Nothing reads the ledger, git or the run folder.
