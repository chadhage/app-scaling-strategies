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
node --test --test-concurrency=1 capability\C037\tests\routing.test.cjs capability\C037\tests\surface.test.cjs capability\C037\tests\authority.test.cjs
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

This is local-only inspection, not Azure routing/traffic/authentication/cost or
deployment. IaC N/A. No new packages, frameworks, storage engines, cloud resources,
credentials or user data. Native/authenticated/full-journey/production Node 24
validation and H007 completion remain blocked outside this original local scope.
