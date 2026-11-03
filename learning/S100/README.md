# S100 — Forced active work accounting

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, framework or Azure account is needed.

Source: S100 in the repository README; D-S100; A-S100; packet SC-S100; one frozen S unit. The source requires lost work to be detected and counted, never misclassified as a successful transition. The backlog additionally requires loss/retry/duplicate/unresolved accounting.

## Worked exercise

“Kill active work; the educational test may pass while user impact is interrupted” is the inventory objective. **Termination and active work are fixed teaching DATA ONLY. No action kills a process or operates on a shell, file, network or resource.**

Preconditions are four synthetic attempted old-v1 → new-v2 journeys (two requests, two jobs) and an original 1000 ms budget. These are fixture choices, not measured host limits.

1. Leave **Forced termination DATA** and prediction **Interrupted** selected.
2. Start synthetic work, apply the fixed trace, then check the ledger.
3. Inspect the independent educational verifier, synthetic user impact and cleanup labels.

| Fixed work | Observation | User outcome |
| --- | --- | --- |
| request-1 | No completion, zero effects, 1001 ms | Lost and interrupted |
| request-2 | Two attempts, one effect, 1300 ms | Retried but beyond the original budget; interrupted |
| job-1 | Two attempts, two effects, 600 ms | Duplicate business effect; interrupted despite completion |
| job-2 | No usable completion/effect/latency evidence | Unresolved, unknown, retained in the denominator |

The educational verifier **passes** the correctly predicted negative exercise, but users have **3 interrupted + 1 unknown + 0 uninterrupted = 4 attempted** journeys. Successful migration is **not established**. Cleanup is **not applicable — data only**.

Retry counts include both the second request and duplicated job. Loss, retries, duplicates and lateness overlap; do not sum them into unique affected users. A retry is seamless only if correctness and the original journey budget remain intact. Missing evidence is not zero effects.

## Comparisons, history and errors

- Reset, choose **Orderly handoff DATA** and predict **Uninterrupted**: four correct, timely single-effect completions on new-v2. This is a positive synthetic comparison, not native proof.
- Reset, choose **Observation gap DATA**: four unknown outcomes and an unknown verifier, regardless of prediction. Unknown attempts are never removed from the denominator.
- Predict **Uninterrupted** for forced DATA: the educational assertion fails, while all measured losses and interruptions remain.
- Reset restores defaults and focus to the trace selector. It preserves every started rehearsal and the four-start page-session allowance. Reset before checking records a cancelled/unverified attempt and retains any existing observations. It does not erase loss or replenish the allowance. Reload begins a new, explicitly in-memory synthetic session.
- Tab through labeled native controls; Enter activates the ordered actions. Invalid input produces a focused alert without changing state. Disabled phase controls prevent skipped/repeated actions; strict runtime guards also reject forged state, accessors, coercion and unexpected fields.

## Validation and evidence

Run from the repository root in PowerShell:

```powershell
node --test --test-concurrency=1 .\learning\S100\tests\model.test.cjs .\learning\S100\tests\surface.test.cjs .\learning\S100\tests\integrity.test.cjs .\learning\S100\tests\browser.test.cjs
```

Normal verification is read-only: it does not update evidence, screenshots or integrity indexes. Producer-only capture is deliberate:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S100\tests\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Do not recapture historical BDD/RED/source evidence. Preserved raw RED stub/test/BDD snapshots have `.snapshot` extensions outside automatic discovery. Compressed stdout/stderr retain the actual assertion failure (`0 !== 4`), not a tooling or import failure. IaC was recorded N/A after RED and before implementation.

The byte index excludes only itself. Raw snapshots, compressed archives and screenshots are byte-exact under narrow `-text -diff` attributes; they never normalize. Ordinary UTF-8 bundle text is checked as canonical Git LF bytes and against the actual Git clean-filter blob ID. Captured working-raw hashes are separately recorded: CRLF preservation is not portable Git-source certification. Raw working-tree source and immutable source Git blobs are archived separately; administrative working-tree prose may differ from Git.

The first scoped publication attempt stopped before commit because the preserved CRLF snapshots were treated as text whitespace. Its actual gate diagnostics are retained; no RED snapshot was altered. The byte-qualification repair and repeated proof earn zero additional original credits. Initial green remains preserved; `qualification-green.json` records the tighter canonical checks.

Actual browser checks use only published `testing\browser\isolated.cjs` (53c0c0d; SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `finally` cleanup. Existing offline Playwright 1.56.1 and Microsoft-signed Edge 156.0.4314.50 run on Node 22.23.4 test tooling. There are no downloads or installs. The helper's overall lifecycle deadline limitation remains; its abandoned recovery prototype is unqualified and unused.

The actual browser observes keyboard, error, reset, negative/pass, positive, wrong-prediction/fail and unknown DOM results, plus CSP blocking inline script and connections. Browser evidence capture is opt-in; rerunning tests does not overwrite published proof.

## Limits and unfinished obligations

No cloud, IaC, scaffold, identity, credential, deployment, expenditure, production Node.js 24 or native/source-parent certification. B-S100 still needs its approved owned native forced-termination workflow, supported host, accounting, cleanup, CORE/DATA/AKS/C078 gates and separate authorization. D-S100 also retains D-S042, D-S049 and BASE prerequisites. None becomes ready or complete because this A lesson passes.

Only the parent controller can empirically Accept A-S100 once. Tests, repairs, extra proof and refinement earn zero extra original credits. No Microsoft endorsement, support, license grant or service-level agreement is implied.
