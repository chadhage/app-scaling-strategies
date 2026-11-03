# S089 — Control-plane outage rehearsal

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a JavaScript-enabled browser. No server, account, credentials or command-line setup is needed to conduct the lesson.

## Exact source and acceptance

- `README.md` S089: **Control-plane outage:** keep established data-plane routes serving without requiring the controller for every request.
- `D-S089`: lose the **per-run** management/control path while independent data-plane journeys continue; established traffic does not depend on management availability, and the shared harness remains able to report/recover the bounded fault.
- `A-S089`: lose management connectivity; separate control-plane availability from data-plane service. Frozen **S**, packet **SC-S089**, gate **SOURCE**.
- [Exact source contract](evidence/source-contract.json) preserves the complete row text, portable/atomic contract, default packet rule, immutable Git baseline and compressed original working/Git bytes. Working CRLF is not rewritten. Full board snapshots may differ from Git due concurrent board updates; exact acceptance must agree.

This one worked lesson models those clauses. It does not implement B-S089, the native target, or complete D-S089.

## Conduct the bounded exercise

1. Choose a fixed condition and recovery observation; prepare.
2. Lose only per-run management. Inspect the visibly rejected **synthetic** command; blue-v1 and epoch 7 do not change.
3. Sample three established-user journeys while control is unavailable.
4. Report the fault through the **separate independent harness**, which remains available.
5. Observe recovery evidence. Confirmed acknowledgement restores synthetic control; missing acknowledgement leaves it unknown.
6. Predict **PASS**, **FAIL** or **UNKNOWN**, check and retain. Prediction correctness never changes measured service outcomes.
7. Start a new attempt without erasing history. **Reset all local data** explicitly clears active state, checked history and metrics; restores defaults and keyboard focus. Page reload also clears memory.

Native buttons, selects, Tab, Enter and Space operate the exercise. Each step focuses the next control. Invalid input/order fails visibly without changing state. Reset is outside the form and does not shadow `form.reset`.

| Fixed fixture | Observations during management loss | Confirmed recovery verdict |
| --- | --- | --- |
| Independent routes | 3 success, 0 failure, 0 unknown | PASS; established service continuing |
| Controller on every request | 0 success, 3 failure, 0 unknown | FAIL; interrupted |
| Independent service error | 2 success, 1 failure, 0 unknown | FAIL; interrupted |
| Missing completion observation | 2 success, 0 failure, 1 unknown | UNKNOWN; data unverified |

Missing recovery evidence makes complete independent service **UNKNOWN overall**, while its three observed successes and data-service result remain intact. Any observed failure remains **FAIL** even when recovery is unknown.

Bounds: four conditions × two recovery observations, three fixed journeys, 100 **synthetic** millisecond budget, six logically ordered events and six retained attempts. All timestamps are deterministic ordering data, not wall-clock measurements. The seventh attempt is blocked; history is never automatically evicted. Attempted = success + failure + unknown. Current and retained metric rows overlap once checked; do not add them.

## Evidence and focused verification

BDD preceded the loadable stub. The original run had **19 tests, 1 pass and 18 genuine `ERR_ASSERTION` failures**, not missing modules or tools. Raw stdout/stderr and `.snapshot` files under `evidence\red` remain intact and outside normal test discovery. Explicit IaC **N/A** followed RED and preceded implementation.

From the repository root in PowerShell, ordinary verification is **read-only**:

```powershell
node --test .\learning\S089\tests\model.test.cjs .\learning\S089\tests\surface.test.cjs .\learning\S089\tests\integrity.test.cjs .\learning\S089\tests\browser.test.cjs
```

Existing Node **22.23.4**, offline Playwright **1.56.1** and Microsoft-signed Edge **156.0.4314.50** are test tooling only. Browser tests use only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `finally` cleanup. The abandoned lifecycle prototype is unqualified. No install, browser download, foreground lease or unsafe flags.

Only a **deliberate** capture may replace browser proof:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S089\tests\capture.cjs browser-green
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Normal tests do not write screenshots, reports or proof. Recorded browser checks cover actual DOM controls, keyboard progression, independent service, expected failures, unknowns, retained history/capacity, input/state errors, explicit reset, narrow layout and enforced CSP. Intentional CSP inline/connection probes are isolated diagnostic failures, not exercise errors or actual network operations.

The content index distinguishes immutable **raw** evidence from canonical LF text/Git blob integrity. Owned raw evidence uses `-text -diff`: preserved CRLF and assertion-output whitespace are not normalized or presented as source-code whitespace fixes. The first pre-commit publication check rejected those CRLF snapshots; [raw blocker diagnostics](evidence/raw/publication-blocker.json) remain intact. Publication rechecks have separate records, preserving earlier runs. This plumbing is not additional behavioral RED or completion credit.

## Limits and cleanup

Connectivity, management commands, data journeys and recovery are **synthetic trace data**. No actual network or resource operation, management/data-plane service certification, cloud, IaC, scaffold, identity, credentials, deployment, spending, packages, frameworks, root/shared edits or downloads. No telemetry or persistent browser storage. Reset/reload clears memory; the browser test closes its own isolated session.

Established users remaining on blue-v1 do not establish migrated-user success. No native Azure result, production Node24 validation, source-parent completion, unattended browser-runner qualification or five-nines guarantee. Parent alone reviews and Accepts once; this mission is one frozen satisfier, with no extra test/plumbing/refinement credit.

The source examples are provided “AS IS” for education and demonstration, without warranties or guarantees. Microsoft/Azure references do not imply endorsement, sponsorship, certification or support. The project target is not a Microsoft SLA; validate production security, reliability, compatibility and costs separately.
