# S088 · Permission failure

**Training rehearsal - synthetic data - not a live Azure result**

Card **A-S088**, parent **D-S088**, packet **SC-S088**, frozen Kano **S**.
Objective: **Deny an operation; identify an invalid success-shaped error response.**

## Conduct the exercise

Open `index.html` directly in a modern browser. No server, account, installation, or Azure access is needed.

1. Keep **Denied** and **Explicit result**, then **Rehearse promotion**. The operation fails with a synthetic 403 `PermissionDenied`; the verifier passes only the honest safe abort. Existing routing and required state stay observed and unchanged. No migration is claimed.
2. Select **Invalid success-shaped error**, then rehearse. The response fixture says 200 / `ok: true` / `succeeded` alongside `PermissionDenied`. The operation still fails and the verifier fails this invalid success fallback.
3. Choose **Allowed** (which restores Explicit result) and rehearse. Only this fixed positive fixture observes candidate routing at 100% with required state preserved.
4. Choose **Unknown** and rehearse. Missing decision and observation are unknown, not success. The displayed baseline is **last known only**.
5. Inspect the retained ledger and separate operation/verifier outcomes. All attempts, including failures and unknowns, remain counted. After six, further work is rejected until **Reset rehearsal**.

Every attempt is an **independent** replay of the same baseline: fictional `rehearsal-088/promote-candidate`, old-v1 100%, candidate-v2 0%, revision 7 / `saved-draft-088`. These permission, operation, scope, error and response labels are fixed teaching data, never real authorization or resource operations.

Tab to controls, use select arrow keys, and activate buttons with Enter/Space. Reset restores defaults, counters, baseline, and focus to the decision selector. A changed decision cannot carry a denial-only invalid response into another case. Invalid input/state is reported without recording a result. History is memory-only; explicit reset or page reload clears it.

## Source acceptance and boundary

The exact source README S088 row requires surfacing permission failure and preserving existing traffic rather than reporting success. D-S088 requires visible operation failure, honest production routing/state, and no broad success fallback. The A card rehearses those assertions with synthetic observations; it **does not** satisfy native B-S088 or complete D-S088. [Exact committed and working snapshots](evidence/source-contract.json) preserve the source bytes and their line-ending differences.

This bundle has no network calls, credentials, authentication, registration, permission edits, resource operations, backend, framework, or cloud dependency. CSP forbids connections, inline execution, form navigation, objects and frames. No IaC is needed; the [N/A decision](evidence/iac-decision.json) follows the genuine [assertion RED](evidence/red.json).

## Verification

From the repository root in PowerShell, using the existing Node 22 tooling:

```powershell
node --test .\learning\S088\tests\behavior.test.cjs .\learning\S088\tests\surface.test.cjs .\learning\S088\tests\provenance.test.cjs .\learning\S088\tests\integrity.test.cjs
node --test .\learning\S088\tests\browser.test.cjs
```

Ordinary verification is **read-only**, including browser checks. The browser test uses only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `close()` in `finally`. Its approved offline Playwright 1.56.1 / installed signed Edge 156 pairing is tooling, not production Node 24 or native certification. The helper's documented unattended lifecycle limitation remains; no recovery prototype or unsafe browser flags are used.

Only a deliberate author capture sets `CAPTURE_BROWSER_EVIDENCE=1`. Do not refresh historical proof during normal reruns. `tests\capture.cjs` captures actual stdout/stderr and source/stub snapshots under `evidence\raw\`; RED snapshots end in `.snapshot` and are not auto-discovered tests. `.gitattributes` treats only raw evidence as byte-preserved/non-diffable, including raw CRLF; it does not suppress checks on lesson source. Other text hashes qualify canonical Git LF, **not** byte identity between working CRLF and Git sources. The integrity index intentionally excludes itself and its own verification transcript to avoid self-reference.

Recorded proof is in `evidence\focused-green.json`, `evidence\browser-acceptance.json`, `evidence\syntax-002.json`, `evidence\integrity-002.json`, and `evidence\verification-summary.json`. The first integrity run is retained: its verifier incorrectly used filesystem paths for Git attribute matching. The corrected verifier uses Git logical paths and preserves raw CRLF unchanged. Parent-owned review/acceptance is separate. Tests, plumbing and repeated runs earn no additional Kano credit.
