# S057 · Keep assets referenced by old HTML

**Training rehearsal - synthetic data - not a live Azure result**

Open [index.html](index.html) directly in a modern browser. No service, account,
subscription, authentication or package installation is needed for the lesson.

## Exact source and acceptance

- README S057: **Static-asset versioning:** Keep assets referenced by old HTML
  available after deployment.
- D-S057: cached old HTML, immutable old/new assets and deploy/retire controls.
  Acceptance: **Existing pages resolve required assets correctly; early asset
  removal produces a visible failing result.**
- A-S057: **Load old HTML after deployment; detect asset retirement that breaks
  an existing page.** SC-S057, worker-A-S057, one frozen S unit.
- Exact source excerpts, canonical Git-source identities and the A/B pair are in
  `evidence\source-contract.json` and the raw source snapshots.

## Worked exercise

1. Leave observations complete and retirement target **Old script only**.
2. **Cache HTML v1**, then **Deploy v2**. The cached HTML keeps references to
   `/assets/app.a17c.js` and `/assets/site.a17c.css`; new HTML uses distinct
   `/assets/app.b28d.js` and `/assets/site.b28d.css`.
3. Keep old assets: load cached v1, then current v2. Both pages succeed, with
   four synthetic 200 observations.
4. Retain and compare another attempt. Deploy v2, **Retire old assets**, then
   load cached v1. Its required script produces a synthetic 404 and the result
   immediately becomes **failure**, even before loading current v2.
5. Load current v2: it succeeds, but cannot repair or conceal the old-page
   failure. Selecting **Both old required assets** produces two old-page 404s.
6. Compare another attempt with **Withhold the old script observation**. That
   required observation stays unknown, even when retirement was commanded.
   With the old stylesheet retained, the overall result is **unknown**; with
   both old assets removed, the stylesheet's known 404 makes it **failure**.

Each attempt has exactly two page loads and four required asset observations.
Unknown includes pending assets; an empty or partial sample is never success.
Every required observed success is needed for aggregate success. No retries,
real users, latency budgets or reliability inference are modeled.

The inventory and statuses are model data: no real HTML cache, asset request,
CDN, native deployment or file deletion occurs. Fixed identifiers represent
immutable names; they do not certify actual content hashes or cache headers.

## Controls and reset

Tab, Enter and Space work with native controls. Configuration locks after
caching; out-of-order and invalid inputs produce a handled alert without
changing state. Focus follows the next action. Prediction PASS/RETRY is separate
from the measured success/failure/unknown result.

Completed attempts remain in the visible history, including failures and
unknowns. Six is a hard limit; nothing is silently pruned. **Reset all attempts
& defaults** explicitly clears active work, history, errors and predictions,
restores defaults and focuses the observation selector. Reloading also clears
this intentionally in-memory exercise. No control shadows `form.reset`.

## Verification and provenance

From the repository root, using the existing Node 22 test tooling:

```powershell
node --test .\learning\S057\tests\model.test.cjs .\learning\S057\tests\surface.test.cjs .\learning\S057\tests\integrity.test.cjs
node --test .\learning\S057\tests\browser.test.cjs
```

Normal verification is read-only to `evidence`. Browser checks use only the
published `testing\browser\isolated.cjs` (`53c0c0d`), SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, and awaited `finally` close. Existing offline Playwright
1.56.1 and signed Edge 156 are the selected test pair; no downloads, packages,
unsafe browser flags or prototype helpers are used. The helper's documented
unattended lifecycle limitation remains, not a fully qualified CI claim.

Only a deliberate capture writes a new, non-overwriting proof:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S057\tests\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a callable-stub RED (1 pass, 13 genuine assertion failures), then
explicit IaC N/A, implementation and green checks. `evidence\red` preserves
non-auto-discovered `.snapshot` files, raw compressed stdout/stderr and the
original TAP. Raw CRLF bytes are preserved with `-text`; canonical LF hashes
qualify Git-source identity separately. `integrity.json` seals implementation,
raw evidence and original source provenance without a self-referential hash.
Failed capture attempts, if any, remain identifiable and are not green proof.
`browser-run-001` is a preserved failed capture: Playwright's script loader
treated the probe's intentionally blocked inline script as a load failure.
Loading the approved external probe via its own load event fixed collection;
the lesson's restrictive CSP was not relaxed.
`focused-run-001` preserves a path-quoting assertion failure; the actual Git
attributes were already correct. NUL-delimited attribute collection corrected
that test. Its original test source, syntax report and integrity seal are kept.

## Scope and unfulfilled remainder

No Azure, infrastructure, scaffold, identity registration, real credentials,
deployment, resource lease or spending is authorized. Node 22 tests do not
certify production Node 24. This portable lesson does not complete **B-S057**
or **D-S057** and cannot prove real CDN/cache/native asset-retirement behavior.

Relevant To Do refinement: keep B-S057 unready until CORE, DATA, HOST and OBJECT
provide an approved native host, owned immutable assets and observable real
old-page rendering. Native acceptance must still observe old HTML after actual
deployment and a genuine required-asset retirement failure. No generic cache
eviction, new lesson, test/plumbing card or extra Kano unit is introduced here.
Parent empirical review alone may Accept A-S057.
