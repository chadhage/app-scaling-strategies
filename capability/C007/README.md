# C007 — host, risk and readiness filters

H002 · frozen **S** · one original unit **C007** · packet **LP-LEARN**.
Entry gates: **accepted C003 + accepted C005**. Open `index.html` directly.
No install, server, framework, cloud access or production runtime is needed.

The page consumes the **same 152 immutable C005 v1 entries**: S001–S150,
W001/W002. It neither extracts source documents nor copies catalog data.
C003's matrix/validator and C005's validator/API are imported unchanged.
Only C005's generated snapshot is refreshed by zero-credit
`OP-CATALOG-SNAPSHOT-REFRESH-76`. `tests\integrity.test.cjs` retains all original
accepted-commit/hash checks, reading the byte-preserved old artifact for its
original data baseline, and separately checks the new fixed-generation hash.
Source authenticity is
checked by invoking C005's existing read-only `catalog-source.cjs` exports
`buildCatalog()` and `verifyLearningTargets()`, not by a second extractor.

## What filtering means

All three filters combine with **AND**, irrespective of selection order.
Native selects support Tab, Home/Arrow keys and Enter; the Reset filters button
supports Enter/Space, restores all defaults and focuses the host select.
Counts are live, errors are alerts, and no-match is distinct from invalid data.

### Host: exclude explicit conflicts, preserve unknowns

The host select means **source host under test**, not the browser on which a
portable lesson can be opened. It interprets only the shared catalog's direct
prerequisite vocabulary: P001 App Service, P002 Container Apps, P003 AKS,
P004 Functions, and the canonical HOST/CONTAINER/IMAGEHOST/HOSTJAVA OR aliases.
These are source-prerequisite exclusions, **not platform support or approval
rules**. Commas remain AND; alternatives remain OR. No transitive scenario
dependency, BASE completion, concrete configuration or prerequisite evidence is
inferred. The exact raw expression and pinned source references stay visible.

- A definite direct conflict is excluded into a **separate, ordered list with
  its original ID, objective, source links and explicit reason**. For example,
  W002's CONTAINER means **P002 OR P003**, not App Service custom containers.
  Excluded cards still show original portable availability, native denial and
  source-parent incompleteness. A native-host conflict does not revoke access
  to a historical portable lesson.
- A non-conflicting entry remains **unknown**, never compatible/qualified.
  Generic scenarios are not assigned fabricated compatible-host lists.
- IMAGEHOST retains App Service's unresolved **container-mode** requirement;
  passing the host filter does not select a format.
- All/default and unselected/unknown host selections preserve unknown entries.
- C003's existing `filterRows` supplies the selected host's configuration rows,
  original unsupported/unknown reasons, constraints and documentation links.
  Those rows are not per-scenario support claims or target approvals.

Exclusions apply **after the same risk/readiness predicates** as the matching
list. Thus an assessed-risk no-match does not leak unrelated host exclusions.
Both lists retain canonical ordering and original entry references in the
reusable API. No source entry is removed from the shared catalog.

### Risk: UNCLASSIFIED is the only source value

All 152 canonical records have `risk: 'unclassified'`; the browser displays
**UNCLASSIFIED**. P0/P1/P2 are priorities, never risk scores.
All/unclassified returns all eligible entries. Assessed, low, medium and high
have **honest empty results**. A classified-risk filter does not manufacture
example rows or imply that unclassified means safe.

### Readiness: three independent evidence boundaries

| Selection, with all hosts/risks | Entries | Meaning |
| --- | ---: | --- |
| All | 152 | Proposed source scenarios/workflows. |
| Portable lesson accepted | 61 | Historical accepted snapshot only. |
| Portable lesson unavailable | 91 | Original explicit unavailable reasons retained. |
| Native unavailable / unverified | 152 | Not runnable; no target-specific native proof. |
| Native runnable | 0 | No execution is enabled. |
| Native qualified | 0 | Documentation/portable learning is not qualification. |
| Source parent complete | 0 | Portable A-card acceptance does not complete D-S/W parents. |

Historical acceptance/source pin:
**`01675ac8d4230c51dad027b67a1971d8d3490d74`**, annotated source tag
`kanban/flow-admin/01675ac8d423`.
Accepted portable IDs are exactly S001–S061. S062 and other
unaccepted or later work remain unavailable in this fixed snapshot.
The commit/time/ledger update and pinned source links are displayed, not live
worktree state. Original lesson destinations are preserved.

## Pure reusable consumer

```js
const catalog = require('.\\capability\\C005\\catalog-data.js');
const matrix = require('.\\capability\\C003\\matrix-data.js');
const { filterCatalog } = require('.\\capability\\C007\\catalog-filters.js');
const result = filterCatalog(catalog, matrix, {
  host: 'aks', risk: 'unclassified', readiness: 'portable-available'
});
// result.items: fifty-three original C005 objects wrapped with unknown host reasons.
// result.incompatible: S002/S012/S014/S017/S024/S032/S033/S058, with source conflicts.
// result.matrixRows / result.permissions: unchanged validated C003 objects.
```

`catalog-filters.d.ts` declares the readonly result and selection vocabulary.
Omitted, all and empty-string selections normalize to all. Invalid data,
matrix, versions, filter values and attempted native/permission promotions
return `valid: false` with empty results and no provenance/permission claims.
The renderer clears stale matches, exclusions, source links and matrix/authority
displays. Even invalid replacement data is retained as the latest mount, so
subsequent control changes/reset cannot revive an earlier valid catalog.
Reset does not repair bad data; a valid later mount can recover.

This is structural validation, **not authentication of arbitrary metadata** or
a server authorization service. There is no arbitrary-import UI. Source text is
rendered with text nodes, not HTML. No search or preparation workflow is added.

## Verification and preserved evidence

The one-shot refresh has separate `snapshot-refresh-76.feature` and evidence under
`capability\C005\evidence\op-catalog-snapshot-refresh-76-01675ac8d423`.
All three earlier catalogs and all 147 pre-existing proof files remain byte-for-byte
historical. Current browser
captures require exactly `CAPTURE_BROWSER_EVIDENCE=1` and append uniquely named
`evidence\browser-op-catalog-snapshot-refresh-76-01675ac8d423-*.json` files only after
successful checks and awaited cleanup. No earlier browser result is relabeled.
The published `53c0c0d` helper hash/source is enforced before import.

```powershell
node --test --test-reporter=spec .\capability\C007\tests\filters.test.cjs .\capability\C007\tests\surface.test.cjs .\capability\C007\tests\integrity.test.cjs
node --test --test-reporter=spec .\capability\C007\tests\browser.test.cjs
```

BDD in `C007.feature` preceded a loadable stub and genuine assertion RED
(`0 !== 152`), then IaC N/A, implementation/refactor and focused GREEN.
RED source snapshots end in `.txt`, not auto-discovered test names.
The first integrity-test failure is preserved: its git-blob byte comparison
initially overlooked Windows CRLF checkout conversion. The corrected test
checks normalized blob equality **and unchanged exact worktree fingerprints**;
no provider file was rewritten.
During the original implementation, an independent documentation publication
changed the live README.
The attempted full C005 `--check` failure is also retained: that command requires
live-document parity with its pin. This historical consumer instead uses C005's
unchanged pinned-source builder and verifies exact catalog reproduction without
requiring the evolving README to equal an old commit. A later, separately recorded
operational refresh changes the pin, not this checker or a root document.
Current-checkout drift may still truthfully fail the
strict CLI; immutable historical reproduction is a different check.
A subsequent actual-browser refinement RED (`0 !== 1`) caught omitted readiness
reasons on excluded cards. A shared card-rendering path now preserves those
reasons and any historical lesson link in both lists. The failed ordinary
verification preserved the existing proof hash; its initial observation record
is also retained separately before the explicit refreshed capture.
The publisher's whitespace preflight also rejected assertion-log blank lines
containing spaces. Only those trailing spaces were removed; no records or
assertions were deleted. Namespace-local `.gitattributes` preserves LF text
evidence on checkout without changing root settings.

Browser tests use only `testing\browser\isolated.cjs`'s `openIsolatedLesson`,
existing offline Playwright **1.56.1** and installed Microsoft-signed **Edge 156**.
They await `close()` in `finally`. Actual DOM/keyboard checks cover the full
catalog, combinations, unknowns, empty/error/reset recovery, source/lesson
links, focus/live states, 320-pixel reflow, literal markup and enforced CSP.
No mocked browser, package install, unsafe flag or foreground lease is used.
The recorded browser pair is not general portability, WCAG or assistive-
technology certification. No TypeScript compiler pass is claimed.

**Normal verification never overwrites or deletes historical browser proof.**
Only a deliberate successful refresh may use:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
try { node --test --test-reporter=spec .\capability\C007\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

Capture writes only after all assertions and awaited browser cleanup succeed.
Failed or ordinary verification leaves the previous observation file alone.

## Bounded To Do refinement — no additional credit

- **C006:** original S unit; accepted C003+C005 gates. Remaining owned behavior
  is exact/partial/empty/no-result title/objective search of the shared entries.
  This page implements none of it; do not rebuild extraction or catalog data.
- **C008:** original S unit; accepted C003+C005 gates. Remaining owned behavior
  is understandable per-entry preparation/limits using C005's shared source
  excerpts and raw AND/OR/BASE distinctions. The host explanation here is not
  that preparation workflow.
- **Assessed risk:** blocked on a separately reviewed canonical classification,
  not priority inference. Until then retain unknowns and honest empty results;
  no extra card/unit or fabricated assessment is claimed.
- **Native/production remainder:** blocked on original target, safety, adapter,
  evidence and explicit execution/IaC/scaffold/identity/deploy/spend gates.
  All C003 flags remain false; live runs/spend remain zero. Node **22.23.4**
  is tooling only; production Node **24** remains unvalidated.

C007 does not finish H002, a source-demo parent, native proof or a delighter.
Parent/controller review alone may accept its one stable S unit.
[Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer).
