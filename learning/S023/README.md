# A-S023 — Representative journey warm-up

**Training rehearsal - synthetic data - not a live Azure result**

Open [index.html](index.html) directly in a browser. No server, subscription, credentials, framework or package installation is needed.

## Exact source and scope

- **S023**, [root README](../../README.md): “Exercise safe login, read, and transaction paths using isolated test fixtures.”
- **D-S023**, [backlog](../../.docs/wiki/backlog.md): warm representative journeys using isolated login/read/transaction fixtures. Real safe business-path evidence and isolated external effects remain native parent acceptance requirements.
- **A-S023**, [portable card contract](../../.docs/wiki/kanban.md#portable-a-card-lesson-contract): warm a representative business path; detect a shallow probe that missed a failing transaction.
- Packet **SC-S023**, one frozen **S** Kano unit, owned only under `learning\S023`. No additional test/plumbing/refinement unit. Exact input excerpts, hashes, claim and implicit packet semantics are in [source-inputs.json](evidence/source-inputs.json).

This checkout defines S023 as a row in the root README, not a separate source directory. The source rows and portable contract were read before behavior design; the captured input record preserves their exact text.

## Conduct the lesson

Preconditions: local browser, **fixture-v1**, synthetic identity `fixture-user`, owned profile `fixture-profile`, and a fixture-only receipt/ledger marker. Nothing contacts a real service or stores credentials.

1. Keep the default **shallow** check and **transaction rejected** fixture; choose **Warm and assess**. Synthetic HTTP 200 does not measure any of the three business assertions, so readiness is **unknown**.
2. Select the **representative** check, keeping the same fixture. Login and read pass, but the transaction returns synthetic 409. Readiness **fails** despite the healthy endpoint.
3. Choose **healthy business path**. The fixture identity, profile owner and matching transaction receipt must all pass, with a 100 ms journey within budget, for **synthetic success**.
4. Choose **receipt unobserved**: receipt, total latency and fixture commit count remain **unknown**, never zero or successful.
5. Set the healthy journey budget to **99 ms**: business assertions pass but readiness fails its latency budget. A fixture commit can exist even when readiness fails.
6. Uncheck **Require isolated fixtures**: the guard blocks the endpoint and all business steps before execution.

Login-denied and wrong-owner fixtures demonstrate that later steps do not run after an earlier required assertion fails. A 200 read with the wrong owner fails the business assertion.

The endpoint takes **10 synthetic ms separately**. Login, read and transaction take **15 + 25 + 60 = 100 synthetic ms**, not measured wall-clock performance. Budgets are whole numbers **50–500 ms**, inclusive. Failed or missing evidence never approves readiness. External writes are always zero because no external operations exist.

## State and keyboard behavior

Native labels, selects, checkbox and buttons support Tab, arrow keys and Enter/Space. Errors are announced and focused. Correcting a request does not erase the last valid result. Six immutable observations retain successes, failures, unknowns, exact configurations and traces; a seventh is rejected without eviction. No automatic runs, timers, storage or background work.

**Reset lesson** restores the original shallow/rejected-transaction/150 ms/isolated controls, clears error/result/history, announces reset and returns focus to the check selector. It can be repeated. The button is not named `reset`, so it does not shadow `form.reset()`. History lasts only until explicit reset or page reload.

## Verification and provenance

The [BDD specification](journey.feature) preceded the loadable stub and genuine assertion RED. [RED output](evidence/behavioral-red.stdout.txt) records expected `failure` versus actual `unknown` behind an already passing HTTP 200 assertion—not an import, syntax or missing-tool failure. Raw stdout/stderr, timestamps, commands and input hashes accompany each capture. Original stub, test and BDD snapshots in `evidence\red\*.txt` are **not auto-discovered runnable tests**. [IaC is explicitly N/A](evidence/iac-na.json), recorded after RED and before implementation.

Source text is UTF-8 with LF line endings. Raw `evidence\**` is marked binary to preserve original CRLF bytes and TAP assertion whitespace rather than editing historical observations to satisfy formatting checks. The first publication attempt stopped at that check before any S023 commit; [line-ending recovery](evidence/line-ending-recovery.json) records the source-only normalization and unchanged raw evidence.

Run focused, read-only verification from the repository root in PowerShell:

```powershell
node --test --test-concurrency=1 .\learning\S023\tests\lesson.test.cjs .\learning\S023\tests\surface.test.cjs .\learning\S023\tests\browser.test.cjs
node --check .\learning\S023\lesson.js
node --check .\learning\S023\app.js
git --no-pager diff --check -- .\learning\S023
```

The actual browser check uses **only** published `testing\browser\isolated.cjs` at `53c0c0d`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`, via `openIsolatedLesson` and awaited `close()` in `finally`. The explicit existing offline pair is Playwright **1.56.1**, signed installed Edge **156.0.4314.50**, and Node **22.23.4** test tooling. [Tooling provenance](evidence/tooling-preflight.json) preserves signature status and hashes. No downloads, unsafe flags, shared foreground session or lifecycle prototype.

Browser verification exercises real DOM results, Tab/Enter run, input errors and focus, failed/unknown/success paths, retained history, the history cap, repeat keyboard reset, and actual CSP denial of inline script, connection and form submission. An additional request-abort guard prevents external traffic if CSP regresses; the test also requires **zero requests reaching that guard**, so it cannot substitute for CSP.

Final byte-aligned proof: [focused GREEN](evidence/focused-lf-green.json), [syntax](evidence/syntax-lf-green.json), [actual browser observations](evidence/browser-lf-acceptance.json), [raw DOM](evidence/browser-lf-acceptance.dom.html.txt), and [evidence index](evidence.json). Earlier green captures remain historical observations; their pre-normalization input hashes are not substituted for the final LF source hashes.

Ordinary tests **never rewrite proof**. For an intentional new capture only (never overwrite a historical label):

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
$env:BROWSER_EVIDENCE_LABEL = 'browser-new-proof'
try {
  node .\learning\S023\capture.cjs focused focused-new-proof
} finally {
  Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
  Remove-Item Env:\BROWSER_EVIDENCE_LABEL
}
```

The capture writes new raw logs, a command/hash record, browser observations and a non-executable actual DOM snapshot; existing proof is write-protected by exclusive creation. Use fresh labels for a deliberate later capture. Normal independent reruns remain separate from historical published proof and earn no additional credit.

## Limits and incomplete remainder

This is one portable A-card learning exercise, not real HTTP, authentication, payment or database execution. There is no actual candidate warm-up, routing change, user exposure, migration, load test, reliability sample or five-nines claim. Native **B-S023**, real fixture isolation and the original **D-S023** acceptance remain separate, unqualified work; their hosting/safety/data and execution approvals are not inferred.

IaC N/A. No cloud, scaffold, identity registration, deployment, expenditure, new dependencies or framework. Node 22 validates only local tooling, **not production Node 24**. The published browser helper retains its documented overall lifecycle deadline limitation; an abandoned recovery prototype is not qualified or used. Parent empirical acceptance is required before this card can be Done.

Microsoft open-source demonstration, provided as-is without warranties. Synthetic thresholds and results are not Microsoft SLAs or platform-support guarantees.
