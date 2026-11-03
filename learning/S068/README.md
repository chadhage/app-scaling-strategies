# S068 — Index creation under load

**Training rehearsal - synthetic data - not a live Azure result**

A-S068 · D-S068 · SC-S068 · frozen S · `worker-A-S068`.
Open `index.html` directly in a modern browser. No server, account, database,
credentials, subscription, framework or installation is required.

## Exact source and worked exercise

S068 requires: **Use supported online operations or reject changes whose locking
behavior violates user budgets.** D-S068 additionally requires observing locking,
latency and native capability, and rejecting or labeling unsupported online
operations. This A-card lesson rehearses those decisions with invented data.
It does **not** satisfy the native observation requirement.

One hypothetical index build overlaps four fixed synthetic requests. Each
request takes 2 synthetic ms of service plus its lock wait. These are arithmetic
fixture values, not real time, database measurements or a platform's guarantees.

1. Keep the defaults: **Blocking build**, **Permitted** hypothetical online
   capability, **5** synthetic ms, **Observe only**, complete receipts.
   **Assess index build** predicts a peak of **14**; this is not an observation.
2. **Run four requests** simulates the build's blocking schedule. Lock waits
   are **12, 8, 4, 0**, yielding latencies **14, 10, 6, 2**. Three of four
   requests exceed the budget: **FAIL / INTERRUPTED**.
3. Predict **FAIL**, then **Check prediction**. A correct learning check does
   not erase interrupted users. A deliberately wrong prediction likewise
   cannot change the actual result.
4. **New attempt (retain history)** restores defaults, clears current proof,
   and retains the checked result. Choose **Online build** and repeat.
   This invented capability card permits waits **1, 0, 0, 1**, giving latencies
   **3, 2, 2, 3**: **PASS / BUDGET_MET**. The nonzero boundary locks matter:
   “online” is not a claim of lock-free operation.
5. Try blocking with **Enforce budget** and budget **5**. The predicted
   violation is **REJECTED / NOT_EXERCISED** before any requests. Zero observed
   requests never count as a successful load run.
6. With blocking, **Enforce budget**, and budget **15**, the four receipts
   meet that looser contract. The **12**-ms lock remains visible. A blocking
   operation is not automatically a failure independent of the declared budget.
7. An **Unsupported** online card produces **REJECTED**, without a silent
   blocking fallback. An **Unknown** online card produces **UNKNOWN /
   UNVERIFIED**, with no load. These capability choices are hypothetical,
   not native product/SKU support. The card concerns online operation only;
   it does not prevent the explicit blocking comparison.
8. With **Missing request-4 receipt**, permitted online has **3/4** receipts
   and one unknown outcome: **UNKNOWN**, not PASS. Blocking at budget **5**
   remains **FAIL**, with **3** known failures **and 1 unknown**. Known failure
   takes precedence without hiding missing data.
9. Keep at most six checked attempts; a seventh assessment is blocked.
   **Reset rehearsal (clear history)** deliberately clears inputs, errors,
   receipts, traces, predictions and history. Reload also clears this
   in-memory-only model.

The five finite controls yield exactly **48 configurations**:
2 operations × 3 capability cards × 2 budgets × 2 guards × 2 receipt modes.
Exhaustive tests independently derive **10 PASS, 6 FAIL, 18 UNKNOWN and
14 REJECTED** results. None is a real index/lock/load certification.

## Guards, keyboard and browser restrictions

- Inputs must be exact listed strings with exactly five own data fields.
  Blank/extra/inherited/accessor/non-string inputs and forged states are
  rejected without progress or history mutation.
- Configuration locks after assessment. Changing a disabled control is an
  explicit error, not a way to reinterpret earlier evidence. Replayed actions
  cannot double-run load or double-count history.
- Tab reaches labelled controls; arrows select; Enter/Space activate buttons.
  Focus advances to load, prediction and the next attempt. An alert announces
  errors and focuses the invalid editable control, or reset for locked inputs.
- New attempt and reset focus **Assess index build**. Reset buttons are not
  named or identified `reset`; native `form.reset()` is not shadowed.
- History is immutable and bounded. No cookies, storage, network APIs,
  management calls or HTML sinks are used.
- CSP restricts scripts/styles to local files and denies connections, inline
  code/styles, string evaluation, forms, frames, objects, workers and base
  changes. Browser tests actually exercise the first six denials.

## Verification — existing offline tooling only

From the repository root in PowerShell, normal verification is **read-only**
with respect to all retained proof:

```powershell
Remove-Item Env:CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue
$tests = (Get-ChildItem .\learning\S068\tests\*.test.cjs).FullName
node --test --test-concurrency=1 @tests
Get-ChildItem .\learning\S068 -Recurse -File |
  Where-Object { $_.Extension -in '.js', '.cjs' } |
  ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { throw 'Syntax failure' } }
```

BDD preceded a loadable stub and **11 original tests: one passed, ten genuine
assertion failures**. Raw stdout/stderr, BDD, fixture, original tests and stub
snapshots remain in `evidence\red`; snapshot suffixes prevent accidental test
discovery. IaC N/A was recorded after RED and before implementation.
Those same assertions subsequently passed all finite configurations and guards.

Browser proof is written **only** on deliberate opt-in:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try {
  node .\learning\S068\tests\capture.cjs browser-green tests\browser.test.cjs
} finally {
  Remove-Item Env:CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue
}
```

Capture refuses to overwrite proof; the retained capture is already present
after delivery. Browser checks cover eight actual DOM/keyboard/error/outcome/
reset/CSP checks, plus their parent test group. File resource timing is not
treated as a request audit: resolved local URLs, live script behavior and
computed CSS are checked. String-evaluation CSP is tested by the owned external
`tests\csp-eval-probe.js`, not DevTools evaluation that can bypass that policy.
The probe is never loaded by normal lesson operation.

Tooling is existing Node **22.23.4**, offline Playwright **1.56.1**, and existing
valid Microsoft-signed Edge **156.0.4314.50**. Only the published
`testing\browser\isolated.cjs` (`53c0c0d`), SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
is used: `openIsolatedLesson`, with `await session.close()` in `finally`.
No download, package, unsafe flag or foreground lease is needed. The abandoned
lifecycle prototype is unqualified; the published helper is not a general
unattended-runner certification.

## Provenance and completion boundary

`evidence\source-contract.json` binds the exact README S068 row, D-S068/backlog,
A/B inventory, atomic/portable contract and default SC-S068 packet rule to raw
working-tree bytes and immutable canonical Git blobs. The owned
`.gitattributes` preserves only named raw snapshot/output classes without
newline conversion. Raw CRLF remains exact; canonical source qualification
uses LF and checks the exact acceptance slices independently of unrelated
shared-board totals.

`evidence.json` links source, RED, IaC N/A, model/focused green, syntax, actual
browser observations, tooling and the sealed content index. Normal tests read
these files; they never regenerate proof. The final index covers raw bytes and
canonical text separately and excludes only itself.

Publication uses the authorized scoped publisher on `main`, an `[A-S068][S]`
evidence label, Copilot coauthor, annotated `kanban/A-S068/<12sha>` tag, atomic
main/tag push and remote verification. Publication identifiers live in the
orchestration record, avoiding a self-referential content hash.

**B-S068 and D-S068 remain incomplete.** Actual database index creation,
locking, latency, load and online capability require a separately qualified
native experiment with CORE, DATA and HOST gates. No SQL platform guarantee,
production Node.js 24, source-parent, deployment, identity, reliability or
five-nines certification is implied. Local reset is not cloud cleanup. The
parent alone empirically accepts this one frozen S unit. Tests, plumbing,
refinement and repeated checks earn no additional units.
