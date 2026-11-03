# C006 — search the shared catalog

H002 · frozen **S** · one original unit `C006` · packet `LP-LEARN`.

Open `index.html` directly in a browser. Search the titles and objectives of
**S001–S150 and W001/W002** without a server, installation or framework.
The labeled search box updates on input; Search/Enter also submits locally.
Reset clears the query, restores all entries and returns focus to the box.

## Search contract

`search.js` is a small dependency-free UMD consumer, not another catalog:

```js
const catalog = require('.\\capability\\C005\\catalog-data.js');
const matrix = require('.\\capability\\C003\\matrix-data.js');
const { searchCatalog } = require('.\\capability\\C006\\search.js');
const matches = searchCatalog(catalog, matrix, '  BLUE-GREEN  ');
// Original S001, S124 and S128 entry references, in that source order.
```

- Match a **literal contiguous substring** in title **or** objective.
- Ignore case with locale-independent `toLowerCase()` and trim query ends.
  Internal whitespace, punctuation and markup remain literal; no regex,
  tokenization, ranking, fuzzy matching or implicit ID search.
- Empty/whitespace returns all 152 entries. No match returns a frozen empty array.
- Every result array is frozen; entries and all metadata are the **original
  references**, never reconstructed, reclassified, sorted or mutated.
- Non-primitive-string queries throw `TypeError` with `ERR_SEARCH_QUERY`.
  Absent, malformed or incompatible shared data throws `TypeError` with
  `ERR_CATALOG_DATA`, even for empty/no-match queries. C005's unchanged validator
  delegates C003 capability validation. An additional structural array-density
  check prevents sparse arrays from silently losing entries or source rows.
- `search.d.ts` imports C005's readonly entry/catalog types and C003's matrix
  type; it does not duplicate their declarations. In a browser load C003
  matrix-contract/data, C005 catalog-contract/data, then `search.js`;
  use `globalThis.C006Search.searchCatalog(catalog, matrix, query)`.

The renderer exposes `C006Page.mountSearch(catalog, matrix, document)` for
deterministic mounting and failure tests. Its controller has `search(query)`,
`reset()` and `dispose()`; remounting removes previous event handlers.
Rendering errors clear results, counts and snapshot claims, show an alert and
remain distinct from a successful zero-result search. Text nodes render query,
title, objective and shared metadata literally. There is no arbitrary import UI.
Structural validation is not source authentication or execution approval.

## One unchanged catalog and honest availability

C005 **1.0.0**, published at
`219a2c0c20e095a1b8d5a8e66f19d8a3299b4329`, remains the only source-derived
catalog. C006 imports its `catalog-data.js`, `catalog-contract.js` and readonly
declaration, with no extraction, copied catalog or worktree-ledger discovery.
The UI uses its original pinned source links and acceptance snapshot:

- Commit: `1583da90c1013ba95fdf268d6901f8a14bdf900a`.
- Commit time: `2026-11-03T14:23:19.000Z`.
- Ledger update: `2026-11-03T14:19:43.9325356Z`.
- Eleven accepted portable lesson links **in that historical snapshot**, not
  live availability. Later accepted files, including S009/S010, do not change it.
- Native runnable/qualified: **false for every entry**. Target support remains
  unknown with original reasons and the unchanged C003 capability authority.
- Every source parent remains planned/incomplete. Risk is **unclassified**, with
  the shared source reason; priority is not risk or permission.

Portable lessons are **Training rehearsal — synthetic data — not a live Azure
result**. Search neither enables native execution nor completes H002 or any
source-demo parent. C001 approvals and the original parent gates are unchanged.

## Bounded To Do refinement

| Original card / class / unit | Remaining behavior and actual gate |
| --- | --- |
| C006 / S / C006 | Only title/objective search; accepted C003 and C005 consumed. Publication still needs parent empirical acceptance. |
| C007 / S / C007 | Host/risk/readiness filtering remains To Do; consume the same C005/C003 metadata, retaining unknown support and unclassified risk. No new extraction or C006 completion gate is invented. |
| C008 / S / C008 | Per-entry prerequisites/limits preparation remains To Do; consume original prerequisite expressions, BASE/OR distinctions and source excerpts. |
| H002 | Search alone leaves filtering, preparation and full manifest/harness acceptance gaps. Original units/classes and parent prerequisites remain intact. |

No C007 filtering or C008 preparation controls, new framework/dependencies,
shared-file edits, cloud/IaC/scaffold/identity/deploy/spend actions or extra credits.
Node.js **22.23.4** is test tooling only; production Node.js **24** is unvalidated.

## Verification and deliberate evidence

```powershell
node --test --test-reporter=tap .\capability\C006\tests\search.test.cjs .\capability\C006\tests\surface.test.cjs
node .\capability\C005\catalog-source.cjs --check
node --test --test-reporter=tap .\capability\C006\tests\browser.test.cjs
```

Ordinary commands do **not** rewrite or delete committed evidence. Only an
intentional browser-observation refresh enables capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node --test --test-reporter=tap .\capability\C006\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

Any other value, including `true`, `0` or an unset variable, does not capture.
The actual browser tests use only the existing
`testing\browser\isolated.cjs` / `openIsolatedLesson(relativeRepoPath)` and
**await `close()` in `finally`**. Existing offline Playwright **1.56.1** and
signed Microsoft Edge **156** are used without installs, downloads, TLS
weakening, sandbox-disable flags or integrated foreground leases.

`evidence.json` maps BDD → loadable stub → genuine behavior assertion RED →
IaC N/A → implementation → focused GREEN/syntax/shared integrity → actual DOM,
keyboard, error/empty/reset, literal and CSP checks. Captured command outputs
are preserved verbatim as JSON strings, including assertion diagnostics.
Saved RED source ends in `.txt` and is not auto-discovered by `node --test`.
Keyboard, focus, labels, live/error states and 320px reflow are checked; a full
WCAG/assistive-technology certification is not claimed.

Recorded results: **67 focused tests**, **44 unchanged C005 regression tests**,
five syntax checks, source integrity, and **16 actual browser acceptance groups**
(17 Node tests including the parent). A separate ordinary rerun passed and
proved every pre-existing owned file/evidence byte unchanged. The first browser
attempt passed all behavioral groups but failed the shared helper's cleanup
deadline; its genuine failure is retained. The bounded retry and ordinary rerun
both completed awaited cleanup. No shared helper was changed by C006.

[Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).
