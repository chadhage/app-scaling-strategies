# A-S083 — controller restart rehearsal

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No build, server, framework, package, subscription, identity or credential is required.

## One bounded exercise

1. Choose **Reconcile durable receipt** or **Unsafe checkpoint replay**, and one of four evidence fixtures.
2. **Stage crash in trace**. One DATA ONLY retirement effect has already happened, but its checkpoint still points to that step. Three user journeys have already started. This does not stop any process.
3. **Restart controller trace**. Inspect the same effect identity, recovered checkpoint, receipt, full trace, and all user outcomes.
4. Choose SUCCESS, FAILURE or UNKNOWN and check your interpretation. Prediction correctness is separate from the measured result.
5. **New attempt** keeps full checked records. At six records the lesson stops rather than evicting evidence. **Reset all** or reload explicitly clears memory. Reset restores both forms, errors, measurements, history and keyboard focus.

All controls support Tab, arrows, Enter and Space. Results use text, not color alone. Feedback is live-announced; error feedback has an alert role. Retained details are keyboard-expandable. Nothing is persisted or sent to a service.

| Policy / fixture | Measured result |
| --- | --- |
| Reconcile / complete | SUCCESS: one effect, zero duplicate actions, three successful users |
| Reconcile / missing effect receipt | UNKNOWN: do not replay, unresolved progress and journey-C |
| Reconcile / missing user outcome | UNKNOWN: checkpoint complete, but journey-B remains unknown in three attempted journeys |
| Reconcile / recorded user failure | FAILURE: the earlier interruption remains counted |
| Unsafe replay / any fixture | FAILURE: two executions of `retire-v1@7`, one duplicate; missing/failed user outcomes remain visible |

The observer's teaching trace can show the first effect even when the simulated controller lacks its durable receipt. That is not permission for the controller to guess or replay. The model assumes retirement was eligible before the trace begins; it does not reimplement lifecycle-gate validation.

## Exact source and scope

- README **S083**: “Controller restart: Resume from durable state without repeating a destructive transition.”
- Backlog **D-S083**, prerequisite **D-S081**: restart the run worker/controller while the console remains available; durable state restores progress without duplicate destructive actions or lost user outcomes.
- **A-S083**, frozen Kano **S**, packet **SC-S083**: restart a controller trace and identify duplicate destructive work after unsafe resumption. One unit only.
- The portable A-card contract requires a standalone interactive, keyboard-operable synthetic lesson, explicit inputs/assertions/limits, the exact banner, and no management access.

`evidence/source-contract.json` binds those exact rows and the portable/default-packet rules to immutable source Git blobs. `evidence/raw/source` preserves both original working CRLF bytes and canonical Git-source bytes. The local `.gitattributes` exempts only owned raw provenance paths from newline conversion and text diff processing (`-text -diff`). Raw bytes are verified by hash, not reformatted to satisfy text whitespace checks. `evidence/content-index.json` distinguishes byte-exact raw evidence from canonical LF Git text.

Every destructive action is **a data record**, never a shell, resource, or file operation. The browser only calculates and renders the fixed model. No real controller restart, durable storage/resumption, idempotency, destructive side effect or platform recovery is certified. Console availability is simulated; the actual evidence is this page's operability. B-S083, D-S083 and D-S081 remain incomplete. No native Azure, production Node.js 24, five-nines, deployment or source-parent claim is made. IaC is explicitly **N/A**. Tests, plumbing and refinement earn no additional Kano credit. Parent empirical acceptance is separate from worker publication.

## Read-only verification

From the repository root in PowerShell, using the existing Node.js 22 tooling:

```powershell
node --test .\learning\S083\tests\behavior.test.cjs .\learning\S083\tests\surface.test.cjs .\learning\S083\tests\provenance.test.cjs .\learning\S083\tests\integrity.test.cjs .\learning\S083\tests\browser.test.cjs
```

Normal tests do not rewrite source or evidence. The browser test hashes the owned tree before and after verification. Syntax can be checked without capturing anything:

```powershell
Get-ChildItem .\learning\S083\model.js, .\learning\S083\app.js, .\learning\S083\tests\*.cjs, .\learning\S083\tests\*.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { throw "Syntax failed: $_" } }
```

Browser prerequisites are the existing offline **Playwright 1.56.1**, valid Microsoft-signed **Edge 156**, and `testing\browser\isolated.cjs` from `53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`. The test uses `openIsolatedLesson` and always awaits `close()` in `finally`. No fallback, download, unsafe flag or abandoned lifecycle prototype is used. This observed run is not unattended runner lifecycle qualification.

## Preserved development evidence

The sequence was BDD → loadable naive stub → actual behavioral assertion RED → IaC N/A → implementation/refactoring → focused/source-integrity green and syntax → actual DOM/keyboard/error/reset/failure/UNKNOWN/CSP checks → sealed, read-only verification and scoped publication.

- `evidence/red.json`: original command, timestamps, input hashes, raw stdout/stderr. The safe-restart assertion reported **2 !== 1**; 12 of 13 assertions failed, not missing code/tools.
- `evidence/raw/red/*.snapshot`: exact executed BDD, test and stub; deliberately not auto-discovered runnable test files.
- `evidence/focused-green-002.json`, `evidence/syntax-003.json`, `evidence/tooling.json`: focused commands, immutable raw output, final syntax, source checks and signed installed-tooling provenance. Earlier focused/syntax captures are also retained.
- `evidence/browser-acceptance.json`, `evidence/browser-green-002.json`: passing actual browser observations plus raw test output, cleanup, no-network and read-only checks.
- `evidence/browser-green.json` is the **failed first browser attempt**, not a pass. Fifteen checks passed; the expected CSP inline-block event made Playwright's script-loader reject the final probe check. Its raw output and exact CRLF test snapshot are preserved. Loading the same local probe through an ordinary DOM script element avoids the loader's console-error interception without weakening CSP.
- `evidence/publisher-check.json` preserves the reproduced scoped publication preflight failure: raw CRLF snapshots were incorrectly treated as text whitespace. The prior seal and all subsequently changed inputs were archived byte-for-byte before adding the narrow raw-only `-diff` attributes. No raw bytes were normalized, no whitespace check was bypassed for application source, and no shared/unowned state was cleaned up.

`tests\capture.cjs` is an explicit, one-shot evidence authoring utility, not normal verification. It refuses to overwrite a capture. Source/RED/focused/tooling/syntax/seal commands write only this owned lesson. Browser evidence authoring additionally requires **deliberate** `CAPTURE_BROWSER_EVIDENCE=1`; normal runs must leave it unset:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node .\learning\S083\tests\capture.cjs browser-green-002 }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

Do not rerun capture against preserved evidence or treat a failed tooling/runner attempt as a behavioral RED. Publication is owned-scope only; only the parent controller can accept the single S unit.
