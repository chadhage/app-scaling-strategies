# C037 — requested versus observed routing

**Training rehearsal - synthetic data - not a live Azure result**

Original **S / P0 / LP-REPLAY / H007**, gated by independently accepted C036
`df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e`. Only the parent accepts one original
S unit. Tests, proof and repairs add zero credit. H007 remains incomplete.

## Conduct the comparison

Open `index.html`; choose a sample, **Load JSON copy**, **Inspect only** or
**Compare routing**, and **Show result JSON**. All controls are keyboard-operable.
Edit only the bounded local JSON copy to explore thresholds, unknowns or errors.
Reset clears presentation and restores picker focus; it does not clear failures,
HOLDs, metrics, originals or replay protection. At 16 operations the model refuses
instead of evicting failures. Reload starts another explicitly fictional exercise,
not another lease, retry of a real original, or evidence of recovery.

```powershell
node capability\C037\cli.cjs list
node capability\C037\cli.cjs context
node capability\C037\cli.cjs inspect historical-closed
node capability\C037\cli.cjs compare fictional-match
node capability\C037\cli.cjs compare fictional-unknown
node capability\C037\cli.cjs fixture fictional-skew
```

CLI inputs are fixed operation/sample IDs, never paths, URLs, credentials, user
data, caller context or verdicts. Exit codes: match control 0, rejected 1, HOLD 2,
share mismatch 3. No new HTTP probe is needed or performed.

## What is actually observed?

* **Historical actual local HTTP destinations:** unchanged pinned C034/C033/C020
  saved request/response observations. Count only acknowledged response stamps,
  not addressed endpoints, requested weights, profile labels, readiness or HTTP
  200. Closed history has **8 started requests, 7 known destinations (v1 4, v2 3),
  1 missing-destination 404**. Shares are **4/8 and 3/8**, not 4/7 and 3/7.
  Its no-request interrupted original remains a separate original attempt; the
  summary-only replacement is not a measured repair. Held history has 3 known
  requests but an incomplete original. Neither source has an observed requested
  routing policy or authenticated run/user/lease/cohort correlation. Both HOLD,
  with **zero current attributed actual requests**. No invented 50/50 policy.
* **Declared modeled policy versus fictional measured-control observations:**
  explicit closed examples separately list starts and responses; measurements
  are fictional records, never substituted from weights. The 50/50 policy exists
  only in these labeled controls. Matching routing shares can coexist with HTTP
  503 failures. No control establishes business, migration or journey success.
* **Owner context:** Node uses unchanged C036 attribution/current readers and
  C015's actual read-only public restore. The static browser imports unchanged
  C036's **bundled historical** actual C015 observation, not current disk consent
  or identity. C036 lease/user/context/tiers are explicitly FICTIONAL controls.
  C037 route association with them is declared, not actual lease proof.

The unchanged C036 `inspectText` guard rereads its owner context before every
operation's metric decision. C037 does not attach or mutate C036 tier records.
Every C037 event additionally matches the guard-owned complete fictional context,
epoch/version/digest/request, finite destination stamp, order and fictional clock.
Missing correlation/observations/policy HOLD; known mismatches reject. Only the
guarded fictional comparison commits C037's private original-request ledger.
Current-epoch metrics never include another epoch or unlinked historical source.
Unparseable input cannot validate a current context or expose a stale metric as
newly checked. Every operation's context is a last read, not a live lease.

Weights are integer basis points, finite targets exactly v1/v2 in order, and
sum **exactly 10000**. Inclusive thresholds compare exact integer ratios, not
rounded displayed percentages. The denominator is all distinct started originals:
unknown, in-flight and missing destinations stay separate and stay in it.
Zero denominator or insufficient sample size HOLD. Duplicate deliveries never add
originals; conflicting deliveries/replayed originals reject. Unknowns and known
mismatches cannot be repaired by reset, retry or a healthier aggregate. The session
retains negative classifications even when a later isolated sample matches.

## Verification and append-only evidence

```powershell
node --test --test-concurrency=1 capability\C037\tests\routing.test.cjs capability\C037\tests\surface.test.cjs capability\C037\tests\authority.test.cjs capability\C037\tests\page.test.cjs capability\C037\tests\cli.test.cjs capability\C037\tests\pins.test.cjs
node capability\C037\tests\syntax.cjs
node capability\C037\tests\browser.cjs
node capability\C037\tests\verify.cjs
```

Normal checks are read-only for source, retained evidence, C015 and dependencies.
Source pins distinguish actual working bytes from Git-canonical bytes, including
CRLF differences. BDD precedes the loadable stub, genuine assertion RED (nominal
weights falsely counted as measurements), IaC N/A and implementation. The archived
initial RED remains intentionally failing. A recorder bootstrap failure before BDD
is retained separately and explicitly labeled manual tool-output retention, not
raw assertion proof. All subsequent captured stdout/stderr and failures are raw,
immutable gzip in unique directories. Only exact `CAPTURE_BROWSER_EVIDENCE=1`
permits append; no refresh or overwrite:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C037\tests\record.cjs browser }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

Browser proof uses existing offline Node 22 / Playwright 1.56.1 / Microsoft-signed
Edge 156, sandbox enabled, unchanged `testing\browser\isolated.cjs` SHA
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson` and awaited `finally` close. No native transport, helper
lifecycle, foreground lease, unsafe flags, downloads or transport certification.
CSP denies connections, inline scripts, forms, frames, objects and workers.

## Per-file 85/85/85 coverage proof

`C037.coverage.feature` specifies it; production code, sealed evidence and retained
RED are unchanged. The file set is **enumerated, never discovered**; an unloaded file
counts as 0% whatever Node's exit status says: `routing.js`, `cli.cjs`, `page.js`,
`authority.cjs`, `pins.cjs`. `read-state.ps1` is PowerShell, which the Node command
cannot measure; every State reader test runs it end to end. `tests\coverage.cjs`
refuses a root JavaScript file that is not enumerated.

| file | RED: line / branch / function | GREEN: line / branch / function |
| --- | --- | --- |
| `routing.js` | 99.24 / 95.50 / 97.92 | 99.24 / 95.53 / 97.92 |
| `cli.cjs` | 44.74 / 50.00 / 66.67 | 100 / 100 / 100 |
| `page.js` | unloaded = 0 / 0 / 0 (Node exit 0) | 100 / 100 / 100 |
| `authority.cjs` | 100 / 94.12 / 100 | 100 / 94.12 / 100 |
| `pins.cjs` | 96.30 / 48.00 / 90.00 | 100 / 100 / 100 |

New suites (no production edit): `tests\page.test.cjs` runs the unchanged `page.js` in
the browser script order against DOM stubs built from the ids in `index.html`;
`tests\cli.test.cjs` stubs the pin/State reader and the model for every exit code and
argument branch and also runs the actual process (list, match 0, mismatch 3);
`tests\pins.test.cjs` drives every fail-closed guard of the pinned reader with stubbed
`git`/`pwsh` output and patched filesystem results, using the archived State snapshot.

Reproduce, from the repository root (a heavy-run slot is advisable: the gate runs five
suites at once):

```powershell
# RED: archived before any new test; exits 1 (cli.cjs, page.js and pins.cjs are below the bar)
node --test capability\C037\evidence\red\coverage-bar.initial.test.cjs
# GREEN and coverage: the six non-browser suites, then the per-file gate (exits 0)
node capability\C037\tests\coverage.cjs
# One file by hand: the unchanged shared command over that file alone; replace <file>
node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=**/C037/<file> --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability\C037\tests\routing.test.cjs capability\C037\tests\surface.test.cjs capability\C037\tests\authority.test.cjs capability\C037\tests\page.test.cjs capability\C037\tests\cli.test.cjs capability\C037\tests\pins.test.cjs
# Real isolated headless Edge observation of the unchanged page (32 groups; read-only)
node capability\C037\tests\browser.cjs
```

Append-only proof: new raw runs `coverbdd`, `coverred`, `coverage`, `focused`, `syntax`,
`browser` and `addendum` are unique directories under `evidence\raw`. The sealed
`evidence-index.json` is never rewritten; `evidence-index.addendum-1.json` chains to it
by LF-canonical hash (so a CRLF checkout verifies the same) and lists only the newer
files. `verify.cjs` re-derives the per-file figures from the archived GREEN, checks the
RED text and its input hash, and fails on any unindexed evidence file. After another
capture, run `node capability\C037\tests\record.cjs addendum` (with
`CAPTURE_BROWSER_EVIDENCE=1`). The recorded Edge was 156.0.4314.58, Microsoft-signed,
with Playwright 1.56.1 and the unchanged helper.

## Publication boundary and remaining work

Read CURRENT top canonical own approval under State and release it before
Publisher. Actual private publisher bytes must match that approval under Publisher
immediately before the unchanged standard call. Initial authorization is
`2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811`;
its explicit `classificationAndInspectionRevision` admits C037 S with 61 guards.
Removing only its four newly admitted tokens reproduces historical 60AE, not a
forever-current authority. Unknown or unapproved private changes fail before staging.
Require main == actual remote main before staging; preserve all foreign index
entries and flags, including ordinary staged C048 changes. Only standard owned
`[C037][S]` publication with Copilot trailer, annotated `kanban/C037/<12sha>`,
atomic main/tag and remote/current raw-canonical qualification is allowed.
Process-local HTTP/1.1 Git config must restore each original environment slot's
presence and value in finally; no TLS/global/proxy/auth changes.

The coverage addendum above is published once as a `[C037][S]` delta of new tests,
tooling and evidence through this same boundary, with explicit owned paths:
`tests\publish-delta.ps1 -Paths <paths> -Message '[C037][S] ...'`; `-DryRun` runs every
pre-check and stops before the publisher. It writes nothing into the repository,
because a half-written raw proof directory in a published tree fails the evidence scan.
`tests\publish-owned.ps1` is the whole-namespace original boundary and is not used for
this delta.

This is local-only inspection, not Azure routing/traffic/authentication/cost or
deployment. IaC N/A. No new packages, frameworks, storage engines, cloud resources,
credentials or user data. Native/authenticated/full-journey/production Node 24
validation and H007 completion remain blocked outside this original local scope.
