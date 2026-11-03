# A-S098 — Recovery after new writes

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. JavaScript and local file access are the only prerequisites; no server, account or packages are needed for the lesson.

## Conduct the fixed-data exercise

1. **Apply fixed v2 writes**: baseline L001 reserves 6; v2 L002 reserves 3 and L003 releases 1. The correct committed state is all three effects totaling **8 units**.
2. Choose **Compatible rollback** and **Complete**, then **Rehearse selected recovery**. The fixed v1 compatibility adapter must interpret every signed effect, not just report a plausible total. SUCCESS selects teaching version `v1-compatible`, retaining all records.
3. Reset and try the **baseline-only reader** or **old snapshot** plan. Both are REJECTED before changing the effective v2 destination or deleting writes. The obsolete 6-unit snapshot is not a correct recovery. Rejection is a safe abort, not completed rollback.
4. Reset and choose **Explicit forward recovery**, **Complete**. SUCCESS selects `v2.1`, not v1; all committed effects still read as 8.
5. Try **Missing**, **Corrupt** and **Unknown** reads with either supported plan. Missing L003 yields 9; corrupting its sign yields 10. Both are FAILURE. Absent read evidence is UNKNOWN, not success. The stored ledger remains intact and unverified destinations are not exposed.
6. Predict the recovery outcome and **Check interpretation**. Learner PASS can correctly explain failed recovery without turning FAILURE into SUCCESS.

The measured teaching event is one recovery decision and its fixed three-effect read. Available observations take **7 synthetic ms** against an illustrative **10 ms** budget; these are not real measurements. History shows individual IDs, signed effects, correct/read totals and effective version. Safe rejections are separate from attempted recoveries; failures and unknowns remain in their attempted denominator.

Tab, Enter and Space operate standard controls. A skip link and visible focus are available. Commands use strict enum, phase and current-run guards; invalid or stale inputs produce a focused, announced error without changing data or totals. Reset uses the native, non-shadowed `form.reset()`, restores the baseline and default controls, clears the current trace/error, and **retains every previous decision and denominator**. After 12 decisions, including rejections, no further decision can begin. Reload deliberately clears in-memory history. No persistence is used.

## Exact source and owned scope

- S098: **Rollback after new writes:** Preserve and interpret data created by the new version.
- D-S098 acceptance: **New committed state remains interpretable and correct; rollback cannot silently discard or corrupt writes.**
- A-S098: **Roll back after new writes; choose compatible recovery rather than discarding committed state.**
- Gate `SOURCE`; fixed packet `LP-COMPARE`; owner `worker-A-S098`; frozen Kano class `S`, unit `A-S098`; only `learning\S098\**` is owned.

The original prerequisite is D-S060. This lesson does not replace S060’s schema-evolution exercise: its payload contracts are predetermined, it performs no schema change, and the focus is committed **post-v2-write effects** versus obsolete state. All writes, compatibility readers, rollback and recovery are fixed teaching data, **not actual committed-write, compatibility, rollback or recovery certification**. No resource/data operation, Azure call, identity, credential, IaC, scaffold, deployment, spending, native B-S098 proof, completed source parent, Node.js 24 production validation or five-nines claim is made.

## Focused verification

From the repository root in PowerShell:

```powershell
node --test --test-concurrency=1 .\learning\S098\tests\model.test.cjs .\learning\S098\tests\surface.test.cjs .\learning\S098\tests\integrity.test.cjs .\learning\S098\tests\browser.test.cjs
```

Normal verification is **read-only** to all lesson source and published evidence. The integrity test replays the original RED snapshots entirely in memory, never restores source, and verifies exact protected raw bytes plus canonical Git LF source. The browser test hashes all owned files before and after normal verification.

Only published `testing\browser\isolated.cjs` (`53c0c0d`, raw SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`) is authorized. Tests call `openIsolatedLesson` and await `close()` in `finally`, using the existing offline Playwright 1.56.1 / Microsoft-signed installed Edge 156.0.4314.50 / Node 22.23.4 pairing. No download, package installation, insecure flag, foreground lease or abandoned lifecycle prototype is used. The published helper’s known unattended context/shutdown deadline limitation remains unqualified.

An intentional first capture requires **`CAPTURE_BROWSER_EVIDENCE=1`**. It refuses to overwrite existing browser evidence. Real DOM, keyboard, bad/stale input, success, safe rejection, failed/unknown reads, retained history, bounded reset, page errors and enforced CSP checks are recorded. An owned page-loaded external probe exercises actual policy against inline script, evaluation, image, connection and form actions; reserved `.invalid` addresses must be blocked without responses.

## Evidence and chronology

1. `evidence\source-contract.json` binds exact source/parent/A/B/portable/atomic/LP-COMPARE contracts to immutable raw CRLF working snapshots and recorded canonical Git source.
2. `write-aware-recovery.feature` and `evidence\bdd.json` precede the loadable stub’s genuine assertion RED. `evidence\red\*.snapshot` is non-auto-discovered; raw output proves **17 assertion failures**, not missing code or tools.
3. `evidence\iac-decision.json` records resource-free **N/A** after RED and before implementation.
4. A tooling qualification mistake compared the approved raw CRLF helper hash to canonical LF Git bytes. Its actual unqualified assertion, raw streams and original driver remain preserved; the owned correction separately qualifies raw helper identity and canonical Git equality. It is not behavioral RED or another Kano unit.
5. The first in-memory RED replay inherited Node’s test-child context and emitted binary IPC rather than standalone TAP. That actual qualification failure and original driver are preserved; removing only the child’s `NODE_TEST_CONTEXT` corrects the read-only replay without restoring any source.
6. The first authorized publication stopped before commit at its scoped whitespace check: preserved CRLF snapshots were being treated as text diffs. Its actual failed preflight and original raw attributes/index/driver remain intact. Adding **`-diff` only to owned raw/red evidence** preserves every byte while keeping data snapshots out of text whitespace linting. No shared setting, safety flag or source snapshot was changed. The initial index is archived separately.
7. Separate green, original/final/post-preflight syntax, browser and focused captured runs preserve raw output and source digests. After the bounded publication-preflight repair, only the changed verifier/capture scripts need additional syntax checks; the browser lesson code is unchanged. A publication-focused run and new final index are explicitly recorded, preserving their predecessors. The final index excludes only itself and is then verified by a full read-only run. Preliminary pre-index checks explicitly report their index check as skipped, not passed.

`tests\capture.cjs <stage>` is a deliberate, append-only evidence writer, never an ordinary test. Narrow owned `.gitattributes` protects only raw and RED evidence with `-text -diff`, preserving raw CRLF while qualifying canonical Git-source integrity. The archived initial index remains an original-run record; the final index covers the repaired publication scope. No proof is regenerated by normal tests.

The authorized publisher records the scoped commit, annotated tag and atomic remote checks. The parent independently reviews and **alone accepts once**. Tests, refinement, plumbing and repeated runs earn no additional credit; LP-COMPARE companions, X002 and all native/source-parent work remain separate.

See the [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer); illustrative teaching values are not Microsoft guarantees.
