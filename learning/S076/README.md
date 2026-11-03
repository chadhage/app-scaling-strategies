# S076 — Consumer scale-in

**Training rehearsal - synthetic data - not a live Azure result**

A-S076 · parent D-S076 · sibling B-S076 · frozen S / Kano unit A-S076 ·
packet SC-S076 · owner worker-A-S076. Open `index.html` directly in a modern
browser. No server, account, packages, framework or connection is required.

## Exact source acceptance and one worked exercise

The exact README S076 source is **Consumer scale-in:** “Finish, renew, or
safely relinquish claimed work before shutdown.” D-S076 requires
“Claimed jobs finish or safely relinquish ownership/checkpoints; retirement
does not lose work.” Its row lists **none beyond BASE** as prerequisites. The A contract
asks to remove a consumer holding work and select valid finish, renew or release.
The exact rows, atomic/portable contract and raw source snapshots were read and
captured before behavior design; this is not a lesson inferred from its title.

This deterministic fixture has two consumers and one four-unit claimed job.
Consumer-A owns epoch 1. Consumer-B is ready but cannot steal that claim.
An authorized owner processes one unit per explicit logical tick; exactly one
business effect is intended. Defaults: lease 5 ticks, shutdown grace 6 ticks
after admission closes, original job deadline tick 8. These are teaching
assumptions, not observed broker semantics, native limits or universal guarantees.

1. **Finish:** use defaults; Start, Close admission to A, advance four ticks,
   Retire consumer-A safely, Verify. One original job succeeds with one effect
   and one remaining consumer.
2. **Renew:** choose Renew and lease 2; Start, Close. Tick then Renew at ticks
   1, 2 and 3. Tick to 4, Retire, Verify. Try early retirement: renewing keeps
   A's authority alive but does **not** make stopping its active claim safe.
   Renewal never moves the original deadline or shutdown grace.
3. **Release:** choose Release, lease 5; Start, Close, tick once, Save current
   checkpoint, Release A ownership, Retire A, Claim released job on B, advance
   three ticks, Verify. Checkpoint 1 resumes under B at epoch 2 with the same
   original deadline. After removal but before B completion, the result stays
   UNKNOWN/pending: safe relinquishment is not fabricated eventual success.
4. **Known negatives:** miss renewal (or deny it), use work budget 3, use grace
   3, or explicitly consent to the abrupt-stop fault. FAIL remains visible
   even when another check is unknown or the job eventually succeeded.
5. **Unknowns:** select missing checkpoint acknowledgement, unobserved release,
   unobserved completion or unobserved consumer removal. Missing proof cannot
   fabricate a checkpoint, B authority, an effect count or reduced capacity.
   Conditions affect only their named operation; ordinary observed finish can
   still succeed when a checkpoint is unnecessary.

Lease validity is **tick < leaseUntil**; expiry is checked before work at the
new tick. Completion at the original deadline and removal exactly at grace are
allowed. Valid release requires an acknowledged checkpoint equal to current
progress, including an explicitly acknowledged zero. A stale checkpoint blocks
release. Successor claims and renewals do not create new jobs or denominators.

## Results, bounds, keyboard and reset

Verifier (PASS/FAIL/UNKNOWN/NOT_RUN), original job outcome, actual consumer
removal and resource-free cleanup are shown separately. The one attempted job
is counted as succeeded, failed, unknown or pending; effects can be unknown.
A lease/deadline/abrupt-stop FAIL describes the declared **synthetic attempt**,
not proof that an actual broker permanently lost a message. The failed job
record remains visible. No migration fraction or reliability guarantee is claimed.

Inputs are exact records, supported enums and bounded integers: lease 1–6,
grace 1–8, original budget 1–12. There are four job units, at most 12 logical
ticks, four observed renewals, 40 actions per attempt and four archived attempts
plus the current attempt. Unsupported actions, forged/cloned states, extra
fields, coercible strings, booleans, fractions and non-finite numbers are rejected.
Snapshots are deeply immutable. Invalid sequencing visibly blocks without
changing authority; rejected input cannot leave a prior PASS current.

Native labels, visible focus, Enter, Space, Tab and Shift+Tab operate the UI.
**Reset working attempt · retain history** archives the complete previous
attempt, restores defaults, clears fault consent and focuses the behavior
selector. Fault consent is consumed on every fault attempt. The native
`form.reset()` method is not shadowed. Full archives refuse reset rather than
discard failures. History is memory-only: inspect/copy the complete JSON before
an explicit page reload clears the session. No background timer runs.

## Verification and retained provenance

Use the existing Node.js **22.23.4 test-tooling runtime only**:

```powershell
node --test --test-reporter=tap .\learning\S076\model.test.cjs .\learning\S076\guards.test.cjs .\learning\S076\integrity.test.cjs
node --test --test-reporter=tap .\learning\S076\browser.test.cjs
node --check .\learning\S076\model.js
node --check .\learning\S076\lesson.js
```

Ordinary verification is read-only: it neither rewrites proof nor captures
browser evidence. Deliberate capture only, using a fresh append-only label:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\learning\S076\capture.cjs browser browser-new-observation
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

`evidence.json` indexes exact source/BDD/stub/test snapshots, raw TAP, the
ordered IaC decision, green/syntax checks and actual browser observations.
The loadable stub produced **79 actual assertion failures**, one passed API
check, and one parent subtest-group failure: 81 reported checks, 80 failed.
The first capture guard incorrectly rejected Node's normal parent-group
`ERR_TEST_FAILURE`; its raw output and original capture source remain intact.
The corrected guard accepts the parent wrapper only when every underlying
failure is an actual assertion; the unchanged tests/stub were rerun as
`red-qualified`. No module, syntax, tool or runtime failure qualifies as RED.

Narrow owned `.gitattributes` preserves raw CRLF snapshots and TAP bytes.
Source snapshots are hashed as bytes, while canonical Git blobs are qualified
separately. Whole mutable source files need not equal a later working tree.
RED snapshot names end in `.source.txt`, not auto-discovered test filenames.
Only raw logs and verbatim source-document snapshots relax whitespace lint;
runtime source retains whitespace checks. Historical captures are append-only.

IaC: **N/A**, explicitly recorded after qualified RED and before implementation.
No cloud, IaC, scaffold, identity, credentials, deployment or expenditure.

The runner pins published `testing\browser\isolated.cjs` from `53c0c0d`,
SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
uses `openIsolatedLesson` and awaited `close()` in `finally`, and uses only the
existing offline Playwright **1.56.1** with installed Microsoft-signed **Edge 156**.
There are no downloads, dependency changes, unsafe flags or foreground leases.
These actual per-feature DOM/keyboard/error/reset/failure/CSP checks do not
qualify overall browser lifecycle recovery; the abandoned prototype is not used.
The first browser run is retained (15 passed checks, two failed feature groups
and their failed parent). It exposed select labels that included option text,
and an invalid file-worker CSP probe stopped by the browser's opaque-file origin
before policy evaluation. Labels now stand separately; an origin-valid Blob
worker receives an actual `worker-src` denial. No CSP restriction was relaxed.

## Refined/pruned relevant To Do — no extra credits

- **A-S076:** one frozen implementation unit; parent-owned independent review
  and acceptance remain. Tests, evidence, tooling and refinement earn no units.
- **B-S076:** incomplete, not ready. Requires **CORE, DATA, AKS, C078**, a
  qualified target/envelope, actual broker/claim/checkpoint/finish/renew/release
  behavior and separately approved execution/lease authorization. SOURCE
  readiness does not satisfy those native gates; A does not block B's coding.
- **D-S076:** incomplete. Both required A/B slices, original acceptance and
  **BASE = H011 + P005 + applicable HOST** remain. The native AKS slice selects
  the applicable P003 host; the original extra-prerequisite list is empty.
  Do not invent a dependency on unrelated cache or consumer-out lessons.
- **Production/statistics:** production Node.js 24, native Azure results,
  source-parent completion and five-nines/statistical proof remain unclaimed.

No root/shared/closed lesson files are changed. This resource-free page can be
mounted later without adding a framework. CSP allows local external script and
style only; it denies inline script, connections, forms, frames, workers, base
changes, objects and other content. Rendering uses text nodes, not HTML injection.
