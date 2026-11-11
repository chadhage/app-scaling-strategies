# U045 current opt-in qualification — source epoch 2

Use `node testing\browser\qualify\u045\current.cjs --help`, or require
`testing\browser\qualify\u045\current.cjs`. This current entry supersedes the
legacy direct entry only for callers that explicitly opt in. The 272 accepted
predecessor files, original README, help, comments, 156 seal, 157 addendum, tests,
imports, and historical evidence are unchanged. No old-version result is renamed
as current evidence.

## What is checked

Report checks establish **consistency** and **agreement with the installed Edge**:
report structure, suite counts, version and digest agreement, and the installed
Microsoft signature. They establish **not authenticity**. They cannot establish
that a report is genuine, newly captured, or impossible to forge or replay.

A security-adapter timeout fails qualification. The **clock exception** permits
`checkedAtUtc` to be null while all security facts qualify. The current help and
source comment state this exception. A timestamp is not an authenticity proof.

An adapter call has the existing common timeout bound (default 240,000 ms); the
shell gets at most 75 percent (180,000 ms), or a smaller explicit shell bound.
The option overrides the case-insensitive `QUALIFY_TIMEOUT_MS` environment value.
Current timeout tests record the actual factory configuration and advance a
virtual scheduler. Real OS process startup and elapsed time cannot decide them.
The immutable old timeout tests remain old-version tests, not rewritten tests.

## Wait bounds

The conservative worst-path upper bound is **11 waits**: clock, qualified list,
candidate discovery, up to five candidate stats, one concurrent three-way read,
one second digest, and one final stat. At the default this is at most 44 minutes,
not the observed duration of a normal qualification. Common **2..6 bounds** refer
to the non-discovery stages: two preliminary clock/list bounds through six
explicit-path success bounds; discovery and each candidate stat must be added
when applicable. A discovered one-candidate success has seven sequential bounds.
Invalid timeout input performs no adapter waits. An early refusal stops the
remaining stages. These are structural budget counts, not load-sensitive timing
assertions and not an end-to-end deadline guarantee.

| Non-discovery stage reached | Cumulative bounds |
|---|---:|
| Clock and qualified list | 2 |
| Explicit-path initial stat | 3 |
| Concurrent hash/signature/version | 4 |
| Second digest | 5 |
| Final stat | 6 |

Discovery adds one bound and replaces the single initial stat with one per
candidate: `6 + candidate count`, hence seven for one and eleven for five.

## Bounded append

`appendFromReport(options)` retains the existing complete report, installed-Edge,
lock, canonical-line, whole-chain, and atomic replacement checks. Only the atomic
rename is retried, at most **three actual attempts**, only for `EPERM` or `EBUSY`.
The verified content, predecessor, timestamp, and lock do not change between
attempts. Exhaustion returns `U045_APPEND_RETRY_EXHAUSTED`, its `causeCode`, and
the actual attempt count. Other refusals return `U045_APPEND_REFUSED`; unrelated
I/O errors are not retried. There is no sleep, process burner, or unbounded loop.
The injected-filesystem tests exercise this actual public API.

The accepted 157 addendum is read-only. Appending requires an explicit private
amendment destination; this API does not authorize editing accepted policy.
The U045 source amendment is a separate new `amendment.jsonl`, chained to the
unchanged 157 head, not a new qualified major.

The bounded append is the public JavaScript API, not a rewrite of the old
`addendum.cjs --report` CLI:

```js
const current = require('.\\testing\\browser\\qualify\\u045\\current.cjs');
const result = await current.appendFromReport({
  reportPath: 'private-report.json',
  qualifiedFile: 'private-copy\\qualified.json',
  addendumFile: 'private-copy\\qualified.addendum.jsonl',
  dryRun: true,
});
```

The paths and any injected filesystem are caller-owned, trusted inputs, not an
authorization boundary. This worker never writes an accepted file.

## Current source authority

`--check-head <externally-trusted-sha256>` is the opt-in current bootstrap.
Its digest must come from the parent-reviewed result, not from untrusted input.
Before executing the bootstrap, independently compare `current.cjs` with the
production SHA-256 in that reviewed result; an untrusted checker cannot
authenticate its own implementation.
`head.json` anchors the exact original parent-baseline bytes, all 272 original
files, explicit accepted source forms, every current addition, the new amendment,
and the complete actual footprint. Its own exact bytes are checked by the
external digest, avoiding a self-hashing cycle. There is no namespace-wide
hash exception. Historical raw records have only their original form; they are
never line-ending-normalized or labelled source. LF/CRLF forms are declared only
for source files and are generated from observed original bytes.

The old evidence authority is still executed unchanged and its current-footprint
refusal, if any, is retained as natural RED. It is not silently skipped,
rewritten, or made to accept this head. An external consumer requiring that old
authority needs its own separately authorized scope; U045 cannot edit its pins
or imports.

## Measured evidence and limits

The measured current deterministic routine is **9 files / 53 tests**, all passing
in the epoch-2 literal current-production coverage run. The prior source epoch
was **8 files / 51 tests**; it remains unchanged and is not relabelled epoch 2.
The separate unchanged legacy
non-native routine is **34 files / 250 tests**; source-exact capture
`whole-immutable-legacy-04` passed **248**, failed **2**, with no skipped, todo,
or cancelled test.
Those are actual outcomes, not a claim that the old “29 files / 225 tests” now
describes the current routine. Legacy timing-sensitive failures remain visible;
the immutable legacy tests are not silently replaced or declared GREEN.

Literal per-file coverage commands positively loaded every listed production
file. Their actual line / branch / function percentages were:

| File | Lines | Branches | Functions |
|---|---:|---:|---:|
| `adapters.cjs` (unchanged) | 100 | 97.01 | 100 |
| `addendum.cjs` (unchanged) | 98.14 | **95.38** | 91.67 |
| `cli.cjs` (unchanged) | 98.36 | 96.19 | 91.67 |
| `qualify.cjs` (unchanged) | 91.70 | 92.68 | 91.67 |
| `requalify.cjs` (unchanged) | 100 | 96.91 | 100 |
| `subject.cjs` (unchanged) | 100 | 100 | 100 |
| `version.cjs` (unchanged) | 100 | 100 | 100 |
| `u045\current.cjs` | 100 | 98.48 | 100 |

The current addendum branch measurement is **95.38**, not a repeated historical
96.22 or 96.62 figure. All displayed percentages exceed 85, but the adapters
coverage command also had one failed old timing test: **that command is RED,
not a passing gate**. The other seven file commands passed. The private handoff
retains the exact commands, source hashes, positive raw V8 load records, and
every failed attempt. No zero-loaded wildcard result is treated as coverage.

The independently enumerated AST domain covers statements, declarations,
conditions, initializers, module loading, and exports. Mutation evidence
distinguishes actual named assertion kills from specific executed scoped pairs;
neither module/permission/syntax/timeout faults nor survivors become kills or
default equivalences. VM probe scripts use distinct source URLs and cannot
inflate the literal production-file coverage result.

The genuine five-assertion RED was captured and retained before `current.cjs`
existed, then replayed unchanged GREEN. `evidence\red` contains exact later
archive copies; `origin.json` states both the original chronology and the later
copy time without backdating. Earlier noncausal preload/fixture attempts remain.

Fresh LF/CRLF, 64-total-at-eight resource, and the single final-source native
campaign are separate handoff gates, not achievements inferred from this table.
The handoff also retains unexpected real signature-adapter queries during early
mutation attempts; they are not final-source native proof or permission to
extend scope. The hardened test boundary now refuses such an escape explicitly.
All extra failures and unchanged external-consumer refusals remain blocking.
No Azure, Entra, deployment, expenditure, publication, Done, credit, report
authenticity, or original-parent acceptance claim follows from these local facts.

## Append-only source epoch lineage

The first frozen corpus is preserved byte-for-byte, including its exact head.
Its first LF run exposed one test-only, overly specific error-code expectation:
forged LF metadata can legitimately yield either `U045_SOURCE_FORM` or
`U045_SOURCE_BYTES`, depending on which actual source form matches first.
The new physical epoch changes only that assertion to require a typed refusal
in either case; the production program is byte-identical.

`evidence\epochs` retains the exact prior head and amendment.
`evidence\source-epoch2.json` links their digests, the unchanged production
digest, original admission, and the same fixed deadline. The two lineage tests
verify that link and explicit source forms. No prior pinned file or failed
capture was edited, no scope was added, and no budget was reset.

A separate new capture-controller version also validates the slot actually
returned by the PowerShell lease helper. It does not interpret a stale native
`LASTEXITCODE` left by an earlier failed test as the helper's outcome. The failed
capture and exact owned-lease release remain in the private handoff.
