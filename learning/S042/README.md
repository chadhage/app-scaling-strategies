# S042 — Long operation: drain or continue

**Training rehearsal - synthetic data - not a live Azure result**

A-S042 · D-S042 · SC-S042 · frozen satisfier S · owner `worker-A-S042`.

Open `index.html` directly. No server, account, subscription, network or package
installation is needed. `manifest.json` is the portable A-card contract and
`long-work.feature` is the BDD specification. S041 is not modified.

## Worked exercise

One read-only synthetic operation starts at **0 ms** and needs **12 work units /
12000 ms**. Cutover is **4000 ms**. Every event retains the same synthetic
operation ID and **original absolute user deadline**.

| Approach / condition | Observation with the default 18000 ms user budget |
| --- | --- |
| Drain, normal; HTTP limit 16000 ms, drain 8000 ms | Same old HTTP request finishes at 12000 ms: completed. |
| Drain, HTTP limit 10000 ms | Host stops unfinished work at 10000 ms: interrupted. Retaining a slot does not extend limits or prevent recycling. |
| Durable, HTTP limit 10000 ms | At 4000 ms persist 4 units, operation ID and original deadline; HTTP 202 only acknowledges acceptance. Old host retires at 5000 ms, successor resumes 8 remaining units at 6000 ms and finishes at 14000 ms: completed. |
| Force-stop active work | Old HTTP stops at 6000 ms, or the active successor stops at 8000 ms: interrupted. A surviving checkpoint alone is not completed work. |
| Drain, delayed retry | Forced old-request loss stays interrupted even if the retry from 8000–20000 ms later returns correct output. |
| Durable, delayed retry | Resume checkpoint at 14000 ms, finish at 22000 ms. Retry-only time is 8000 ms, but original elapsed time is 22000 ms: interrupted. An original 22000 ms budget would pass inclusively. |
| Missing final proof | Envelope timestamp is observed, but result identity/units are missing: unknown unless another known violation already interrupts. |

1. Compare both approaches with the same HTTP limit.
2. Try forced termination, delayed retry and missing result proof.
3. Inspect the independent assertions, original elapsed/deadline and trace.
4. Predict the result and check it. A correct prediction of interruption is a
   **passing verifier**, not a successful user transition.
5. Change controls or enter invalid values. The previous current result clears;
   earlier runs remain in history.
6. Use **Reset rehearsal and history**, including by keyboard, to restore the
   exact defaults, prediction, empty history and focus on Approach.

## Deterministic guards

- Only two approaches and four named conditions are accepted. Input must have
  exactly the five declared fields. No silent type coercion, fractional/nonfinite
  clock, missing field, extra key or invented host support.
- Original budget: integer **1–60000 ms**; drain: **0–12000 ms**; per-request
  HTTP limit: **1–30000 ms**. Completion at an exact boundary is allowed.
- Drain needs both 12000 ms HTTP support and 8000 ms remaining drain time.
  Durable handoff needs HTTP support through 4000 ms; after that, the continuing
  operation is not an extended HTTP request and does not use HTTP drain.
- Every retry carries the original deadline. Known active-work loss, host/drain
  breach or original-budget breach outranks uncertainty; missing result proof
  stays visibly unknown rather than being rewritten as a pass.
- Frozen, recognized sessions enforce run/edit/check/reset transitions. Check
  requires a current observed run and is one-time. Editing, invalid input or a
  guard rejection clears current success but does not erase previous records.
- History holds **six runs**, with no silent trimming. A seventh run is rejected;
  explicit reset is required. Invalid controls are not operation attempts.
  History is memory-only and also clears on reload.
- No effects, credentials, authentication, real durable store or network request
  are simulated as native proof. All identities and receipts are synthetic.

## Focused verification and provenance

Existing Node.js **22.23.4**, offline Playwright **1.56.1** and the installed
Microsoft-signed Edge **156.0.4314.50** are test tooling only:

```powershell
node .\learning\S042\verify.cjs
```

Verification reruns the owned core/model, surface, syntax, integrity and actual
browser checks. It is **read-only to retained proof**. Browser observations cover
real DOM results, keyboard run/check/reset, forced and budget failures, unknown
proof, malformed controls, retained history/cap, reset focus, narrow layout and
actual CSP enforcement. It uses only the published `openIsolatedLesson` helper,
SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
at `53c0c0d`, and awaits `close()` in `finally`.

Deliberate initial browser capture, not normal verification:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S042\capture.cjs browser-capture
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

The capture refuses to overwrite proof. The helper's documented unattended
lifecycle limitation remains; its abandoned prototype is not used or qualified.

`evidence/stub-load.raw.json` is the successful loadable stub check.
`evidence/red.raw.json` records **four actual behavioral assertion failures and
one pass**, not missing code/tools. BDD, exact stub and original assertions are
preserved under `evidence/red/*.snapshot`, outside automatic test discovery.
`tests/replay-red.cjs` deliberately replays that RED (expected exit 1), while the
unchanged core assertions pass against the implementation. IaC N/A was recorded
after RED and before implementation. Raw command provenance retains exact
stdout/stderr bytes as base64, SHA-256 and a lossless UTF-8 view; no log whitespace
was silently normalized. Scoped byte-preserving Git attributes keep captured
source/snapshot hashes stable without converting their original CRLF/LF bytes.

## Scope and remaining work

CSP allows only local scripts/styles and blocks connections, forms, images,
frames, objects and workers; untrusted input is rendered as text. No unsafe
browser flags, shared profile, foreground lease, download, framework, package,
cloud/IaC/scaffold/identity/deployment action or spend occurs. Reset is an
explicit handler; no form control is named or identified `reset`.

The single A-S042 lesson unit has no split test/plumbing/refinement credit.
Parent empirical acceptance remains required. B-S042 and original D-S042 native
acceptance are **not ready**: a separate safe harness, qualified host/envelope,
approved lease and explicit execution approval are missing. Those are not
silently left as ready A-card work. Native Azure results, actual durability,
exactly-once effects, production Node.js 24 and source-parent certification all
remain unverified.
