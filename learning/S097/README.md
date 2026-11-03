# S097 — Warm and cold rollback standby

**Training rehearsal - synthetic data - not a live Azure result**

One portable **A-S097 / D-S097 / LP-COMPARE / Kano S** unit. The exact inventory
objective is **Compare warm/cold rollback standby; detect a violated recovery
promise.** README source row S097 requires keeping rollback capacity ready
throughout its promised retention window. D-S097 requires ready retained
capacity to meet the promised recovery budget and explicit cold recovery delays.
Exact rows, the portable contract, fixed packet and immutable Git source blobs
are preserved in `evidence\source-contract.json` and `evidence\raw\`.

## Conduct the lesson

Open `index.html` directly in a modern browser with local JavaScript enabled.
No server, account, framework or setup is needed. A complete fixed teaching
trace covers retention seconds **0–300 inclusive**, with a rollback request at
**240 s** and demand of **10 capacity units**. All times are synthetic values,
not elapsed waits or measured recovery.

1. Keep **Cold rollback standby**, **6 s**, and **Promise met**. Activate
   **Check recovery promise**. Warm reference recovery is **4 s**; cold is
   **20 s**, including **4 s reactivation + 12 s warm-up + 2 s validation +
   2 s routing**. The cold standby becomes unready at 180 s and is validated
   again at 258 s. Its readiness gap and over-budget recovery fail acceptance;
   the unsafe answer fails the decision verifier.
2. **Reset current rehearsal**, choose **Promise violated**, and check.
   The answer verifier passes, but the promise acceptance still fails. The
   earlier failed check and its original 6 s budget stay recorded.
3. Reset, select **24 s**, and identify the cold promise violation. Recovery
   timing now passes at 20 s, but a larger budget cannot repair the retention
   gap or rewrite an earlier run's promise.
4. Reset, choose **Warm retained standby / 6 s / Promise met**. Its 12 fresh,
   compatible ready units throughout retention and 4 s recovery pass the
   synthetic promise. The earlier cold failures remain counted.
5. Try **Fresh probes, insufficient capacity**: 6 units cannot meet demand of
   10 even though the synthetic timing is 4 s. Try **Unobserved readiness and
   recovery / Unverified**: missing coverage, compatibility and warm-up time
   produce **unknown**, never a success borrowed from the warm reference.

Tab through labelled selects and buttons; use arrow keys to change choices,
Enter to check, and Space to reset. Errors are announced and focused. Reset
restores cold/6/met controls and focuses the standby selector. The reset button
does not shadow `form.reset`; the native prototype method is called explicitly.

## Guards, outcomes and retained history

Only four fixture IDs, two exact numeric budgets and three answer IDs are
accepted. A decision locks its current controls until explicit reset. State is
deeply immutable and privately issued: forged/serialized state, malformed
inputs, duplicate submission and excess checks cannot create a result.

History retains at most **six** independent checks, including each original
budget, answer, trace and failure/unknown. Reset never clears history or renews
the allowance. `success + failure + unknown = attempted synthetic promise
checks`; an empty history is no evidence. These are not actual attempted user
migrations. A correct answer is a separate decision verdict, not certification
that a failed or unobserved recovery promise was met. Reload starts a separate
in-memory session, not durable recovery.

The warm/cold comparison uses two fixed reference fixtures under the current
declared budget. It is not X002's comparison of accepted native runs and earns
no delighter, packet closure or extra test/plumbing credit.

## Focused verification

From the repository root in PowerShell, with existing Node 22 tooling:

```powershell
node --test learning\S097\tests\model.test.cjs learning\S097\tests\bundle.test.cjs
node --check learning\S097\model.js
node --check learning\S097\app.js
node --test learning\S097\tests\browser.test.cjs
```

Normal verification is **read-only**. Actual browser checks use only the
published `testing\browser\isolated.cjs` at `53c0c0d` with SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
existing offline Playwright **1.56.1**, and installed signed Edge **156**.
They call `openIsolatedLesson` and await `close()` in `finally`. The documented
helper lifecycle limitation is not waived; the abandoned prototype is not used.
No package installation, browser download, unsafe flags or foreground lease.

Only deliberate producer capture sets:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
try { node --test learning\S097\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

This writes only owned browser evidence after successful checks and awaited
cleanup. Normal reruns never update evidence or integrity baselines.
`evidence\content-index.json` qualifies canonical LF Git text separately from
raw evidence bytes. The narrow owned `.gitattributes` preserves
`evidence\raw\**` as `-text -diff`, including original PowerShell CRLF
transcripts and immutable source blobs. Archived RED filenames are not
auto-discovered tests. `evidence\red.json` records a real `ERR_ASSERTION`
(`success` versus required `failure`) against a loadable eventual-recovery stub,
not missing code/tools. Its archived replay deliberately still exits 1.
**IaC N/A** was recorded after that genuine RED and before implementation.

## Scope and completion

All readiness, capacity, compatibility, retention, phase and routing values are
bounded deterministic synthetic teaching data. No actual standby, rollback,
recovery-budget, user-journey, native Azure, reliability or Azure cost
certification. No management calls, credentials, identity, cloud resources,
IaC, deployment or spend. No production Node 24 validation.

B-S097, D-S097 and original prerequisite D-S001 remain separate and incomplete.
This is exactly one frozen S unit in LP-COMPARE. No relevant admitted To Do
needed pruning and no split was necessary. Tests, evidence, repeated runs and
local tooling earn no additional credit. The worker reports verification and
scoped tagged publication; only the parent controller empirically accepts once.
