# S101 — Stable getProfile endpoint

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a JavaScript-enabled browser. This is a standalone
synthetic teaching exercise, not a real gateway, backend, DNS or authentication
deployment. No server, account, credentials, management calls, framework or
packages are needed by the learner.

## Worked exercise

1. Choose **Compatible green release**, switch to green, and measure both callers.
   The actual release changes from `release-blue-17` to `release-green-42`;
   the caller endpoint remains `https://profiles.training.invalid/api/getProfile`.
   Both still use the **API contract** `profile.v1`. An optional added field is
   compatible; a new deployment release does not imply a new API contract.
2. Choose the positive prediction and check it. Both signed-in profile journeys
   retain identity, navigation and valid typed data within the synthetic 100 ms
   budget (20 ms before + 35 ms after = 55 ms).
3. Reset, choose **HTTP 200, incompatible profile.v2 payload**, and repeat.
   A green backend and HTTP 200 are observed, but the existing display-name
   contract fails. A matched negative explanation does **not** make either
   interrupted caller a successful migration.
4. Restore blue and reset. The controls return to their defaults; the earlier
   failures and raw synthetic observations remain in the history and denominator.
5. Try unexpected logout, broken navigation, hostname drift or 140 ms latency:
   each fails a required complete-journey clause despite HTTP 200.
6. Try **Configured green, actually still blue**: healthy old-only callers do not
   prove migration. Try **Service caller completion not observed**: one success
   and one unknown remain in two attempted caller transitions.

Buttons use Enter or Space; selects use normal keyboard controls. Tab reaches the
controls. Switching focuses measurement, measuring focuses the result, errors
focus an announced alert, and reset focuses the condition. Invalid conditions,
predictions, illegal phases and forged typed state are rejected without mutation.
Reset invokes the native form reset without an `id`/`name="reset"` shadow.

## Bounds and evidence meaning

There are eight deterministic conditions, two existing callers per run, one
measurement per run, at most eight run IDs and forty accepted operator actions.
Limits reject further actions rather than silently evicting evidence.
Reset preserves in-memory action and outcome history; reload starts a new session
and discards that in-memory history. Committed evidence is independent.

Verifier (`pass`, `fail`, `unverified`), user impact and synthetic cleanup/routing
are displayed separately. Measured outcomes are positive, negative, unknown or
not-transitioned. Timings are fixed synthetic trace values, not a benchmark or
network measurement. No synthetic result establishes a reliability SLA.

Source mapping is exact, not paraphrased:

- README S101: stable user-facing hostname while backend destinations change.
- D-S101: existing caller endpoint and valid contract, observed backend changes,
  no broken navigation or authentication.
- A-S101: one portable satisfier, frozen Kano `S`, original unit `A-S101`, packet
  `SC-S101`. [Exact source snapshots](evidence/source-contract.json) retain the
  authoritative rows and portable contract.

BDD was written first; a syntactically loadable stub then produced **13 genuine
assertion failures out of 14 tests**, before the explicit [IaC N/A](evidence/iac-decision.json)
and implementation. [RED snapshots](evidence/red/snapshots.json) end in `.snapshot`
outside automatic discovery. Raw process streams are preserved byte-for-byte.
Normal verification does not replay RED or rewrite any committed proof.

## Focused verification

From the repository root in PowerShell, using the existing Node 22 tooling:

```powershell
node --test .\learning\S101\tests\model.test.cjs .\learning\S101\tests\surface.test.cjs .\learning\S101\tests\integrity.test.cjs .\learning\S101\tests\browser.test.cjs
node .\learning\S101\tests\syntax.cjs
```

Normal verification is read-only for lesson source and evidence. Browser tests
require the **already installed offline Playwright 1.56.1** and **Microsoft-signed
Edge 156**. They use only the published `testing\browser\isolated.cjs` helper,
SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
publication `53c0c0d`, call `openIsolatedLesson`, and await `close()` in `finally`.
Missing tooling fails; no install, download, fallback or security weakening occurs.
Private helper-owned browser profiles are cleaned up, not unrelated processes.

The helper has a known **unqualified lifecycle limitation**. This observed browser
run does not qualify its inactive recovery prototype or unattended lifecycle.
Node 22 is tooling only, not production Node.js 24 validation.

Evidence capture is a separate, deliberate operation. Do not set this variable
for normal tests. Existing receipts are append-only; a new deliberate run needs
a new safe evidence label:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
$env:BROWSER_EVIDENCE_LABEL = 'browser-review'
node .\learning\S101\tests\capture.cjs browser-review-run --test tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
Remove-Item Env:\BROWSER_EVIDENCE_LABEL
```

An additional deliberate capture changes the proof inventory and requires an
explicit integrity/publication update; it is never a normal verification step.

`evidence/raw/**` and `evidence/red/**` have narrow `-text` attributes established
before capture. Raw source **working CRLF bytes** and canonical committed
**Git-source bytes** are different hashes and snapshots. Integrity verifies both
against their original immutable Git source commit; it never calls LF
normalization raw-byte preservation. Ordinary text integrity uses canonical LF
source hashes so a normal Git CRLF checkout is not confused with damaged raw proof.
The initial tooling qualification incorrectly compared the helper's canonical LF
Git hash to its raw CRLF working hash. Its failure and driver snapshot are retained;
the repaired qualification verifies those distinct hashes explicitly without
changing the published helper or implying lifecycle qualification.
An additional Windows PowerShell signing-module autoload failure is retained.
The final check uses the already-installed PowerShell 7 host, which verifies the
installed Edge signature; no dependency or security configuration was changed.
The first scoped publisher then rejected raw CRLF snapshots as trailing
whitespace, before making an S101 commit or tag. Its losslessly compressed
diagnostic, original attribute policy and original integrity index are retained.
Only these raw evidence paths gained `-diff` binary classification; no byte was
normalized and no shared Git or security policy was weakened. Repaired green
receipts use the new index; original receipts retain their original index hash.
Index identity uses canonical LF text; read-only before/after inventories use
the actual current bytes. A normal CRLF Git checkout is not raw-evidence damage.

## Acceptance boundary

The parent alone may accept A-S101 after empirical review. B-S101 and D-S101 are
not complete: actual gateway/backend switching, real authentication/navigation,
target configuration and original native acceptance remain unverified and need
separate readiness, ownership and approvals. No IaC, cloud, identity, deployment
or spend is authorized here. Tests, repairs and additional proof earn zero extra
original credits. This lesson does not change shared registries or capabilities.

See [evidence.json](evidence.json), [manifest.json](manifest.json), the
[original source](../../README.md#k-networking-configuration-and-edge-routing),
[D-S101 backlog](../../.docs/wiki/backlog.md) and
[Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).
No Microsoft endorsement, support or SLA is implied.
