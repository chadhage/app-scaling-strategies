# S036 — Existing form submission

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly. No server, install, framework, cloud access,
registration, credentials or expenditure.

## Exact source and scope

- Root `README.md`, **S036**: **Existing form submission:** Accept valid
  anti-forgery tokens generated before migration without weakening validation.
- **D-S036**: add old-page anti-forgery submission across deployments. Valid
  prior tokens succeed under compatible configuration; forged tokens stay rejected.
- **A-S036**: submit an old form after cutover; distinguish valid prior tokens
  from forged ones. **SOURCE**, **SC-S036**, owner **worker-A-S036**, one frozen
  Kano **S** unit. Exact rows, source hashes and atomic/portable contract are
  retained in `evidence\source-contract.json`; design did not infer a title.

## Fixture, controls and worked exercise

One synthetic client receives an old v1 form with request/cookie pair A,
fixture key OLD and application A. These are labels, not real tokens or keys.
v2 always requires four checks: old-key readability, unchanged application
boundary, request integrity and cookie binding. There is no validation bypass.

Choose the v2 configuration, submission condition and observation, then
**Load old form → Cut over → Submit old form**. Choices lock at load; the
original form stays v1-issued while the destination becomes v2.

1. Defaults: compatible configuration, valid prior pair, observed response.
   All four checks pass: synthetic HTTP **200**, **ACCEPTED**, continuity
   **preserved**, one acceptance and **one synthetic effect**. Assertion SUCCESS.
2. Reset current. Retire the old key too early, keeping the valid pair.
   The key check fails: synthetic HTTP **400**, **REJECTED**, continuity
   **interrupted**, zero effects. Assertion FAILURE. A changed application
   boundary independently produces FAILURE despite retaining the old key.
3. Reset current. Keep compatible configuration but choose **Forged request
   token**. Integrity fails: **REJECTED**, zero effects. Safety assertion
   SUCCESS means rejection worked; valid-client continuity is **NOT TESTED**.
   Missing cookie and another client's pairing also reject.
4. Reset current. Choose **Missing observation**. Result, HTTP status and
   every check are **UNKNOWN**. Acceptance, rejection and effects are unknown,
   not zero. The unknown count is one. Knowing the chosen inputs is not
   observing a response.
5. Inspect retained details: earlier interruptions and unknowns remain after
   later successful rehearsals. Exactly one submission is allowed per run;
   even a DOM-enabled duplicate button is rejected by the model.

The fixture exhaustively tests all **24** configuration/condition/observation
combinations. These are synthetic acceptance rules, not an anti-forgery library,
cryptographic implementation, real authentication or security certification.

## Bounds, state, keyboard and reset

At most **six completed rehearsals**, without eviction. Reset restores defaults
and focus to the configuration field, retaining complete configurations,
results, measurements and traces. Reset before submission discards only
unsubmitted setup; it invents no result. Reload explicitly clears page-memory
history. No browser storage, cookies, randomness, timers or network calls.

Strict guards reject coercions, invalid enums, missing/extra/accessor/symbol/
non-enumerable fields, non-plain records, sparse/oversized arrays, impossible
identities/phases, altered current traces, forged results and inconsistent
history. Completed records are recomputed against the deterministic oracle.
All returned snapshots are recursively immutable and independent of caller
inputs. These are consistency guards, not signed or tamper-proof evidence.

Use the skip link, Tab, native select arrows and Enter. History details support
Enter/Space; the trace is keyboard-focusable and scrollable, errors are focused
alerts, phase updates are live, and focus/controls remain visible at 360 px.
The reset control is not named `reset`; the handler calls
`HTMLFormElement.prototype.reset.call(form)` to avoid method shadowing.

CSP allows only local scripts/styles. It blocks inline scripts/handlers/styles,
connections, images, fonts, objects, frames, workers, base changes and form
navigation. Actual browser probes require CSP violation events and zero
requests reaching an additional HTTP route guard, not merely a static policy.

## Verification and provenance

From the repository root in PowerShell, with capture **unset**:

```powershell
node .\learning\S036\tests\capture.cjs all
```

This runs focused model, syntax, actual isolated DOM/keyboard/error/reset/
failure/CSP and integrity tests. It checks every retained proof filename and
byte hash before/after. Tests do not write proof. Direct focused selection:

```powershell
node .\learning\S036\tests\capture.cjs green
node .\learning\S036\tests\capture.cjs browser
```

Only a deliberate append-only evidence refresh uses:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S036\tests\capture.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Sequence: BDD → loadable stub → **six genuine assertion failures and one
passing unknown case** → explicit IaC **N/A** → implementation/refactoring →
focused green/syntax/integrity and actual browser checks. Original BDD, stub
and assertions remain non-auto-discovered `.snapshot.txt` files. Raw streams,
command, times, base commit, source hashes, exit code and byte hashes remain
in append-only per-run metadata. Working-tree base commits identify provenance,
not a claim that then-uncommitted lesson files were already published.

The first browser capture failed before launch: legacy Windows PowerShell could
not load its signature module. The existing `pwsh.exe` host successfully checks
the signature, with terminating errors and captured raw output. That failed
preflight remains preserved; it is not behavioral RED or a browser pass.

The initial publication exposed **13** raw-byte source-hash discrepancies:
Git's declared `eol=lf` normalized the editor's CRLF. All LF-canonical bytes
matched, as retained in `evidence\publication-portability-001.json`. Latest
captures now declare `utf8-lf-canonical-v1`, retain both raw working-tree
hashes and LF-canonical text hashes, and verify canonical hashes on any
checkout. Raw output streams, old captures and RED snapshot bytes remain
unchanged. This correction belongs to the same card, not another Kano unit.

Only existing Node **22.23.4** test tooling, offline Playwright **1.56.1** and
installed, verified Microsoft-signed Edge **156.0.4314.50** are used. Browser
tests assert the published `testing\browser\isolated.cjs` SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
at **53c0c0d**, use `openIsolatedLesson`, and await `close()` in `finally`.
Cleanup records page closure and browser disconnection. The shared helper's
known lifecycle limitations remain; its abandoned prototype is not used.
No browser download, foreground lease, unsafe flag or global package install.

## Honest remainder

**B-S036** still requires **CORE, DATA, HOST**, a real qualified target, real
old-form continuity and forged-token rejection under compatible validation.
This card does not finish D-S036/S036, certify production Node 24, or prove
native Azure behavior. Real user impact is **UNMEASURED**. No additional testing,
plumbing or refinement unit is created. Parent/controller alone empirically
accepts A-S036; worker publication and Report do not award Done credit.
