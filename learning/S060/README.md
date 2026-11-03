# A-S060 — Rollback after schema evolution

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, database, packages or credentials are required.

## Conduct the exercise

1. Choose a schema mode, then **Evolve schema + commit v2 write**. The fixed v1 reader requires `totalCents` and assumes USD.
2. With **Compatible**, application rollback leaves the expanded schema and optional notes in place. All three committed orders, including the new USD 500 write, must read as USD 4000.
3. Reset, choose **Irreversible for v1**, evolve, then request rollback. The model rejects the unsafe reversal: v2 remains active and no data is deleted. This is a safe abort, not recovery success.
4. Choose **Explicit forward recovery to v2.1**. The currency-aware contract must retain all three effects as USD 3500 and EUR 700; it cannot relabel them USD or claim that v1 was restored.
5. Try **Failure** and **Unknown** observations on new rehearsals. A missing committed read is failure even though the stored fixture remains intact. An unavailable observation is unknown, not success.

Enter and Space operate standard controls. Focus advances to recovery after evolution and to reset after an attempted recovery. Errors are announced and focused. Reset restores the default controls, baseline data and selector focus, but **retains all history and denominators**. At 12 decisions, including safe aborts, the workbook stops. Reload deliberately discards all in-memory history; there is no persistence.

The measured event is one recovery action and its fixed three-order read journey. Success needs all expected IDs, per-currency totals and the synthetic latency budget. Available observations take a fixed 7 ms against a 10 ms budget; these are model values, not real measurements. Safe aborts are separate from attempted recoveries. Failed and unknown attempts cannot disappear from the denominator after reset.

## Exact source and scope

- S060: **Rollback after schema evolution:** Preserve old-version compatibility or use explicit forward recovery when reversal is unsafe.
- D-S060 acceptance: **Compatible rollback preserves data; irreversible changes invoke explicit forward recovery, not a fake successful reversal.**
- A-S060: **Roll back after schema evolution; distinguish compatible reversal from required forward recovery.**
- Gate `SOURCE`; packet `SC-S060`; owner `worker-A-S060`; frozen Kano unit `A-S060`, class `S`. Only `learning\S060\**` is owned.

The source-parent dependency is D-S054. A portable lesson may begin from the supplied source contract; this does not fulfill native B-S060 or either source parent's real database/host gates.

“Irreversible” is relative to the old v1 contract: the new fixture removes its field and adds a EUR write it cannot interpret. No real down migration, backup restore, data conversion, transaction, schema engine, Azure operation or authentication is implemented. A model success is **not** actual database migration/rollback proof, native Azure evidence, source-parent completion, production Node.js 24 certification or five-nines reliability.

## Verification

From the repository root in PowerShell:

```powershell
node --test .\learning\S060\tests\model.test.cjs .\learning\S060\tests\surface.test.cjs .\learning\S060\tests\integrity.test.cjs .\learning\S060\tests\browser.test.cjs
```

Normal verification is read-only to all published proof. The actual browser check uses only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `close()` in `finally`. The existing offline Playwright 1.56.1 / signed installed Edge 156 / Node 22.23.4 pairing is test tooling only. Its known unattended lifecycle limitation remains unqualified; the abandoned prototype is not used.

An intentional first browser capture requires `CAPTURE_BROWSER_EVIDENCE=1`; the browser test refuses to overwrite an existing capture. It records actual DOM, keyboard, stale/input errors, both recovery paths, interrupted and unknown reads, retained history, capacity/reset and enforced CSP observations. CSP probes use only reserved `.invalid` addresses and must be blocked before any response. No listener, foreground lease, download or unsafe browser flag is needed.

The initial DevTools-injected evaluation probe was unqualified: DevTools allowed its `eval`, so the check timed out rather than passing. Its failed capture and exact driver snapshot remain in `evidence\csp-probe-qualification\`. The final probe runs from an owned external page-loaded test script, under the page's actual CSP; no policy was weakened. This correction earns no extra unit.

## Evidence order and integrity

1. `schema-recovery.feature` specifies acceptance before implementation.
2. `evidence\source-contract.json` binds exact source rows, portable/atomic contract and packet rule to raw selected snapshots and canonical Git blobs. Raw CRLF bytes are preserved by narrow owned `.gitattributes`; Git object paths explicitly use Git slash syntax.
3. `evidence\red\` preserves non-auto-discovered `.snapshot` copies of the loadable stub, fixtures, feature and test. The actual assertion failed with **v2 instead of v1**; no missing code/tool failure is counted as RED. Raw stdout/stderr and their SHA-256 values are retained.
4. `evidence\iac-decision.json` records resource-free **N/A** after assertion RED and before implementation.
5. Initial/final model-surface green, syntax, real browser, and full focused acceptance have separate run references in `evidence.json`. The content index excludes only itself; the final read-only rerun verifies the completed index including raw acceptance output.

`tests\capture.cjs --capture <stage>` is a deliberate evidence-writing utility, not ordinary verification. Original source, RED, IaC and run records are write-once. Index generation is explicit. No evidence capture, repeated test, refinement or plumbing earns another Kano unit. The authorized publication record supplies the commit/tag and remote checks; the parent independently reviews and alone accepts once.
