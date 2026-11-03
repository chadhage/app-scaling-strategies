# A-S018 — Independent tier scaling

Open `index.html` directly in a modern browser. No server, subscription, sign-in or installation is required.

**Training rehearsal - synthetic data - not a live Azure result**

## Exact source and scope

- S018: **Independent tier scaling:** Scale the constrained tier while preserving contracts and capacity limits in remaining tiers.
- D-S018: per-tier bottleneck selection and independent frontend/API/worker scaling; only intended tiers scale, downstream limits and end-to-end journey budgets remain satisfied. Original prerequisite: **D-S062**, connection-pool multiplication.
- A-S018 / SC-S018: select a bottleneck tier; identify downstream pressure caused by indiscriminate scaling. SOURCE is sufficient for this portable exercise. One original frozen **S** Kano unit; tests, evidence and publication earn no extra credit.

## Conduct a worked exercise

1. Keep the default API bottleneck, or choose frontend/worker before the first command.
2. Apply **2** instances only to that bottleneck. Other counts remain one; all instances are assumed ready.
3. Observe one complete, compatible window. Expect **10 successful journeys at 100 ms**, no failed or unknown journeys, and at most **12 occupied database connections**.
4. Archive/reset. With API constrained, scale only frontend: expect **6 successes, 4 deadline failures**, maximum 250 ms, FAIL.
5. Archive/reset and choose **Compare: scale all to 2**. All tiers can admit ten journeys, but occupied API/worker connections rise from 8 to **16**, exceeding 12: **4 acquisition failures, 6 successes**, FAIL.
6. Try an incompatible contract: ten failures even at 100 ms. Try missing downstream evidence with correct scaling: ten UNKNOWN, no observed connection count or maximum latency.
7. Correct a condition and observe again. Latest PASS does not erase an earlier cumulative FAIL or UNKNOWN. Archive/reset preserves the six newest nonempty runs, including their original commands and individual journey records.

All controls support ordinary keyboard interaction, Enter/Space buttons, visible focus, labeled inputs, focused error alerts and reset. No input/control is named or identified `reset`; native `form.reset()` remains callable.

## Fixed model, not an infrastructure prediction

Ten sequential frontend → API → worker journeys are offered per observation window. The selected constrained tier has capacity 6 per instance; others have 12. Path admission is the minimum tier capacity, capped at ten. Healthy admitted journeys take 100 ms. Unadmitted journeys miss the original 150 ms deadline at `150 + 25 × position beyond admitted capacity`.

The frontend server has no DB pool. API and worker instances each fill four connections in the declared fixture. Connection demand is `4 × (API instances + worker instances)`; each connection beyond twelve causes one admitted journey to fail acquisition at 200 ms, capped by admitted journeys. This intentionally simple, deterministic saturation proxy is **not** a claim that configured pool ceilings equal occupied connections in real systems. With missing downstream evidence, the configured estimate remains visible but the occupied count and unverified completions are not invented. Contract failures and known deadline failures still take precedence over uncertainty.

Bounds: 1–3 instances/tier, 24 commands/run, 8 observation windows/run, six newest nonempty archives, page memory only. Reload clears this session. Oldest-first archive eviction is explicit. Configuration locks once commands begin. Invalid lexical/numeric inputs, unknown/extra fields, hostile properties, forged results, malformed history and exhausted bounds reject without changing previous evidence. Full canonical replay checks derived state; it is not cryptographic attestation.

## Focused validation and evidence

Use the **already installed** Node.js 22.23.4, offline Playwright 1.56.1 and installed Microsoft-signed Edge 156 tooling:

```powershell
node .\learning\S018\verify.cjs all
node .\learning\S018\verify.cjs green
node .\learning\S018\verify.cjs browser
```

Ordinary verification is read-only to historical proof and publication metadata. Intentional capture **appends** numbered raw stdout/stderr, SHA-256 provenance and browser observations; it never replaces earlier records:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\learning\S018\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a loadable no-op model. Refined `evidence\red-2.json` records **31 genuine assertion failures and one passing loadability/zero-sample check**, followed by explicit `evidence\iac-na.json`, implementation and the unchanged refined specification for GREEN (**32/32 passed**). The original RED mixed 27 assertion failures with four test-fixture errors; it is retained unmodified, not presented as the qualified assertion-only run. Saved RED model/test/BDD snapshots end in `.txt` and are not auto-discovered tests. `evidence.json` indexes the observed final results.

The qualified actual-browser rerun passed **18 leaf cases (19 Node test results including its wrapper)**. An initial run timed out because hidden-alert diagnostic text used a visible-only role locator; its raw failure and cleanup-evidence limitation remain in `evidence\browser-first-attempt-caveat.json`. The corrected diagnostic did not remove a behavior assertion. The qualified rerun's complete raw DOM observations are `evidence\browser-1-observations.json`, linked to runner record `evidence\browser-2.json` (the two append-only counters are independent).

Owned `.gitattributes` preserves exact bytes (`-text`) so publication/checkout cannot silently normalize source or raw RED snapshots and invalidate their SHA-256 provenance. CR at line endings is recognized without discarding other whitespace checks. The first publisher stopped before committing on CRLF snapshot whitespace; the actual read-only reproduction is retained in `evidence\publication-1-indexcheck.json`. No raw history was rewritten to recover publication.

Actual browser checks use only published `testing\browser\isolated.cjs`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (53c0c0d), `openIsolatedLesson`, and awaited `close()` in `finally`. Its documented overall-lifecycle limitations remain; the abandoned recovery prototype is not used or qualified. No browser download, foreground lease, unsafe flag or security bypass is allowed. CSP checks deliberately inject an inline script and a reserved-invalid-domain connection attempt and assert that the browser blocks both.

## Refinement and remaining To Do

The portable card remains one small exercise; no extra refinement/test/plumbing units are created. No additional feature is needed to demonstrate this particular A-card contract.

- Parent-owned empirical acceptance and Done credit remain pending after scoped publication; the worker does not call Accept.
- **B-S018 remains To Do**, not ready without CORE, DATA, AKS, C076, an approved target and separate native authorization.
- **D-S018 remains incomplete** until its native slice, original D-S062 prerequisite and source/shared acceptance gates are satisfied. This lesson does not certify D-S062.
- Production Node.js 24, native platform behavior, readiness, real connection occupancy, throughput, reliability and comprehensive WCAG certification are not demonstrated.

IaC is N/A: no cloud resources, identity, scaffolding, deployment, expenditure, packages or framework. Only `learning\S018\**` is owned by this mission. Ignored `result.json` is the machine-local publication/report receipt, written only after remote publication; ordinary verification preserves it.
