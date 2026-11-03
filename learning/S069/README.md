# S069 — Fenced writer epoch handoff

**Training rehearsal - synthetic data - not a live Azure result**

A-S069 · D-S069 · frozen S · SC-S069 · `worker-A-S069`.
Open `index.html` directly in a modern browser. No server, account, database,
cloud connection, credentials, framework or installation is required.
`manifest.json` declares the portable A-card contract.

## Exact source and worked exercise

README S069 requires: **Writer handoff: Fence the previous writer before accepting
writes through the replacement.** D-S069 requires: **Only the authorized epoch
writes; stale writers are rejected and acknowledged data is retained.**
The inventory objective is **Transfer writer epochs; stale writers must not
regain authority.** This is the portable exercise only, not B-S069's real fenced
handoff or D-S069/source-parent completion.

1. Keep **Confirmed fence, then replacement grant** and **Both original effects
   retained unchanged**. **Begin handoff** captures fixed acknowledged effects
   SYN-691 (payload 10) and SYN-692 (payload 20), originally written by
   `writer-old@41`.
2. **Transfer epoch** supplies a synthetic authoritative receipt that atomically
   revokes the old grant before granting `writer-new@42`. The transfer is not
   itself a write. This atomic authority is an **assumed fixture**, not an
   implemented or certified database/lease/fencing protocol.
3. **Probe competing writers** attempts SYN-693 through `writer-new@42`,
   SYN-694 through delayed `writer-old@41`, and SYN-695 through the replacement
   identity with a stale epoch-41 token. Only SYN-693 is accepted. Checking just
   writer identity is insufficient.
4. **Replay stale grant** attempts to restore `writer-old@41`, then attempts
   SYN-696 with that old token. Both old-authority reacquisition and its write
   are rejected; confirmed authority remains at epoch 42.
5. **Verify retained effects** measures fencing order, exact writer/epoch
   authorization, no regained authority and retained original acknowledgements.
   The gate is **PASS**: **3 accepted / 3 rejected / 0 held / 0 unknown**, six
   observations including the two original acknowledgements, **2/2** originals
   retained, and three known effects. The three rejections are deliberate
   negative probes, not failed production journeys or uninterrupted migration.
6. Predict **FAIL**, then **Check prediction** to see an incorrect learning
   answer without changing the PASS gate. **Inspect attempt 1** opens its full
   configuration, original acknowledgements, write/effect ledger, ordered trace,
   assertions, counts and prediction.
7. **New attempt · retain history**. Choose **Unsafe: replacement grant without
   fencing**. Conduct the same steps. Two grants remain active, delayed old
   writes are accepted, and stale-grant replay regresses the observed authority
   to epoch 41 despite the recorded high-water epoch 42. The gate is **FAIL**:
   five accepted observations and one rejected mismatched writer/epoch token.
   A correct FAIL prediction does not convert this into a safe handoff.
8. Compare **Unknown: authority receipt unavailable**. Replacement admission is
   held; three stale-token observations are **unknown**, never proven rejected
   or zero-effect outcomes. The gate is **UNKNOWN** when data is retained.
9. Choose the **missing SYN-692** data fault with any authority setting. Original
   acknowledgement evidence remains, but readback lacks that effect. Retention
   is **1/2** and the gate is **FAIL**, even when authority is UNKNOWN.
10. Six completed attempts fill a hard history cap. Nothing is silently evicted.
    Explicit **Reset rehearsal and history** clears all local proof, settings,
    errors, predictions, locks and history and focuses Begin. Reload also clears
    in-memory history; there is no persistence claim.

### Complete bounded matrix

Write counts include the two pre-transfer acknowledgements. Unknown observations
are evidence gaps, not claims about whether an actual effect occurred.

| Authority fixture | Data readback | Accepted / rejected / held / unknown | Originals | Gate |
| --- | --- | --- | --- | --- |
| Confirmed | Complete | 3 / 3 / 0 / 0 | 2/2 | PASS |
| Confirmed | Missing SYN-692 | 3 / 3 / 0 / 0 | 1/2 | FAIL |
| Bypassed | Complete | 5 / 1 / 0 / 0 | 2/2 | FAIL |
| Bypassed | Missing SYN-692 | 5 / 1 / 0 / 0 | 1/2 | FAIL |
| Unavailable | Complete | 2 / 0 / 1 / 3 | 2/2 | UNKNOWN |
| Unavailable | Missing SYN-692 | 2 / 0 / 1 / 3 | 1/2 | FAIL |

Known-effect ledger counts are respectively 3/2, 5/4 and 2/1 for complete/missing
readback. They **do not** establish total effects when outcomes are unknown.
Safety gate, learning prediction, user-transition outcome and cleanup are
separately visible. No actual user transition is measured.

## Guards and limits

- Only idle → begun → transferred → probed → replayed → complete is valid.
  Settings lock at Begin. Skips, repeats, extra arguments, invalid or duplicate
  predictions and history overflow reject without changing model state.
- Configuration requires exactly two own enumerable **data** properties on a
  plain/null-prototype object and exact primitive string enums. Extra,
  inherited, symbol, accessor, non-enumerable and coercible inputs are rejected
  without invoking getters. Snapshots and retained proof are detached and deeply
  frozen. No arbitrary writer IDs, epochs, payloads, endpoints or clocks.
- Two original effects, six fixed observations, six configurations and six
  retained attempts; no randomness, timers, background work, storage, actual
  concurrency or external effects in the lesson.
- Native labels/selects/buttons, skip link, focus progression, visible keyboard
  focus, accessible error alerts/associations, scrollable tables and all-phase
  reset. No control is named/id `reset`; native `form.reset` remains callable on
  both forms.
- Text-node rendering and enforced CSP block inline scripts, connections,
  frames, workers, objects and form submissions. Only owned local scripts/styles
  are loaded.
- No actual DB epochs, lease, fencing, concurrent-writer or acknowledged-data
  durability certification; no Azure management, identity, credentials, IaC,
  scaffold, deployment, expenditure, new package or framework.
- Existing Node22 is test tooling only, not production Node24 validation. No
  native platform, five-nines, source-parent or unattended-runner certification.
  The abandoned browser lifecycle prototype remains unqualified. B-S069 and the
  original D-S069 native gates remain separate and unfulfilled.
- One frozen S unit, pending independent parent acceptance. Tests, evidence,
  plumbing, refactoring and refinement do not earn additional credit.

## Verification and provenance

Use the existing Node.js **22.23.4** tooling:

```powershell
node --test --test-reporter=tap .\learning\S069\tests\model.test.cjs .\learning\S069\tests\surface.test.cjs .\learning\S069\tests\integrity.test.cjs .\learning\S069\tests\browser.test.cjs
node --check .\learning\S069\model.js
node --check .\learning\S069\app.js
node --check .\learning\S069\tests\capture.cjs
```

Normal verification is **read-only to historical proof**. It checks all six
configurations, strict inputs/lifecycle, retained immutable history, exact source
acceptance, genuine RED provenance, canonical Git-source integrity, actual DOM,
keyboard, error, reset, failed/unknown/safe paths, narrow viewport and enforced
CSP. The browser test fingerprints evidence before/after an ordinary rerun.

Deliberate capture only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\learning\S069\tests\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture refuses to overwrite a published `evidence\browser.json`. Failed captures
remain distinctly labeled. `tests\capture.cjs` is explicitly invoked, not an
auto-discovered test; source/RED/decision/first-green captures are write-once.

The browser test uses **only** published `testing\browser\isolated.cjs`
(`53c0c0d`), SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
with `openIsolatedLesson` and awaited `close()` in `finally`. It uses existing
offline Playwright **1.56.1** and Microsoft-signed installed Edge **156**. No
download, unsafe flag, TLS weakening, shared foreground lease or prototype
lifecycle helper.

- `evidence\source-contract.json` binds exact S069, D-S069, A/B-card, atomic,
  portable and source-evidence clauses to the recorded Git baseline. Raw working
  snapshots preserve CRLF; canonical Git snapshots remain separately hashed.
- `evidence\red\run.json` retains **13 tests: 1 pass, 12 assertion failures** from
  a syntactically loadable stub, with no missing module/tool/syntax failure.
  The original BDD, stub and model test snapshots end in `.snapshot`, so normal
  test discovery cannot run RED artifacts.
- `evidence\iac-decision.json` records resource-free **N/A** after RED and before
  implementation. `evidence\verification\model-green.json` records all original
  13 model assertions passing before later refactoring.
- `evidence\browser.json`, its screenshots, `evidence\tooling.json` and deliberate
  raw runner records qualify browser observations. Normal reruns do not refresh
  them. Browser source hashes use canonical LF so a CRLF working tree cannot
  masquerade as changed canonical Git source.
- Narrow owned `.gitattributes` mark only raw evidence, RED snapshots and PNGs
  binary/non-normalized. Integrity verifies their raw hashes and Git filtering,
  and compares tracked lesson source against committed canonical blobs after
  publication. Prepublication filtering is not represented as a published blob.

See the repository's [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).
Educational only; no Microsoft endorsement, guarantee or SLA.
