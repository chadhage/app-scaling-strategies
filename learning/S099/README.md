# S099 — Rollback command fails

**Training rehearsal - synthetic data - not a live Azure result**

One portable **A-S099 / D-S099 / SC-S099 / Kano S** lesson. Exact inventory
objective: **Fail rollback itself; reject a blindly repeated reversal with
unknown effective routing.** README S099 requires inspecting effective state
and preserving known-good routing. D-S099 requires reconciled routing, retained
known-good service, and no completion claim for an uncertain reversal.
`evidence\source-contract.json` retains the exact source rows, immutable Git blob
provenance, portable contract, packet rule and claimed local-only authorization.

## Conduct the bounded exercise

Open `index.html` directly in a modern browser with JavaScript enabled.
No server, account, framework, package installation or setup is needed.

**Every rollback, fault, routing, reconciliation and preservation action is DATA
ONLY teaching data.** No lesson action performs a resource, shell, process, file
or network operation. A healthy compatible retained known-good deployment is a
fixed precondition, not an actual health or continuity measurement.

1. Keep **Failure before target applied** and record the synthetic rollback
   failure. Requested routing is 100% known-good / 0% candidate, but observed
   routing remains **unknown**. Choose **Repeat reversal blindly**: it is
   rejected, no second rollback is issued, and the rejection stays in history.
2. **Inspect effective routing**: the snapshot is 75% known-good / 25% candidate,
   not the requested target. **Reconcile / preserve known-good routing** records
   one observation-grounded synthetic change and invalidates the old snapshot.
   Checking recovery now is rejected as unknown. Inspect again, then check:
   the fresh 100% / 0% snapshot permits synthetic recovery **success**.
   The original rollback command remains **failure**.
3. Reset the current rehearsal. Choose **Failure after target applied**. Inspect
   the unacknowledged 100% / 0% snapshot and check recovery. Preserve this
   known-good routing unchanged; no second rollback or reconciliation is needed.
4. Reset and choose **Reconciliation also fails**. Inspect 50% / 50%, reconcile,
   inspect again, and check. Reconciliation also fails, routing remains 50% / 50%,
   and recovery is **failure**, not complete. Another reconciliation is blocked.
5. Reset and choose **Routing snapshot unavailable**. Inspect, attempt grounded
   reconciliation, and check. No routing snapshot is invented: reconciliation is
   blocked and recovery is **unknown**, not complete.

Tab between labelled controls, use arrow keys for selections, and Enter/Space
for buttons. Input errors are announced and focused. **Reset current rehearsal**
uses native form reset methods without a control named `reset`, restores the
defaults, clears the current result/error and focuses the trace selector.

## State, history and honest results

One failed rollback is issued per independent rehearsal; at most one grounded
reconciliation can follow a fresh usable observation. A reconciliation makes
that observation stale. Only a fresh 100% known-good / 0% candidate snapshot can
complete synthetic recovery. Verification is terminal; explicit reset is
required before starting another rehearsal.

The session permits **four rehearsals, eight choices each, at most 36 retained
history entries**. Invalid inputs, malformed state, duplicate terminal actions
and excess choices cannot append a result. Rejected educational choices do stay
in history, but never issue the rejected command. Reset preserves every run,
original rollback failure, reconciliation failure, unknown result, snapshot and
the fixed allowance. Full history is never silently pruned.

`recovery success + failure + unknown = started rehearsals`; unchecked runs count
as unknown. An empty sample proves nothing. Recovery success does not erase
command failure or certify real service health. Reload starts a separate
in-memory session, not live recovery, acceptance or additional Kano credit.

## Focused verification

Run from the repository root in PowerShell using existing Node 22 tooling:

```powershell
node --test learning\S099\tests\model.test.cjs learning\S099\tests\bundle.test.cjs
node --check learning\S099\model.js
node --check learning\S099\app.js
node --test learning\S099\tests\browser.test.cjs
```

Normal verification is read-only: it never updates source, evidence or integrity
baselines. Actual browser checks use only published
`testing\browser\isolated.cjs` (`53c0c0d`), SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
offline Playwright **1.56.1**, and installed Microsoft-signed Edge **156**.
The test calls `openIsolatedLesson` and awaits `close()` in `finally`. No browser
download, unsafe flag, foreground lease or abandoned lifecycle prototype is used.
The helper's documented overall context-creation/shutdown limitation remains;
this is not unattended CI qualification or arbitrary-browser certification.

Only deliberate producer capture sets:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
try { node --test learning\S099\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

That opt-in writes browser evidence and actual DOM/observation serialization.
It does not refresh the separately qualified content index. The owned
`.gitattributes` keeps `evidence\raw\**` byte-for-byte with `-text -diff`, including
Windows CRLF invocation/provenance records. Canonical LF Git-source hashes are
qualified separately in `evidence\content-index.json`; normal assertions also
compare any published Git blobs without writing Git objects.

RED snapshots end in `.txt` and are not auto-discovered tests. The retained
requested-target-only stub was loadable; its real assertion failed because it
reported command success instead of failure. This was not missing code/tools.
Raw stdout/stderr and snapshots precede the explicit **IaC N/A** decision and
implementation. Focused GREEN, syntax and canonical/raw integrity checks precede
actual DOM, keyboard, guard-error, reset, failure, unknown and CSP checks.

## Completion and limits

No actual rollback failure, reversal, routing reconciliation, fault injection,
known-good preservation or user continuity is certified. No Azure management
calls, identity, credentials, resources, deployment, expenditure or production
Node 24 validation. B-S099, source D-S099 and its D-S098 prerequisite remain
separate and incomplete. No five-nines or native platform claim.

This is one frozen S unit only. Tests, plumbing, evidence, repeated runs and
refinement earn no extra credit. No extra board card or new dependency is needed:
the admitted local lesson consumes SOURCE. The worker publishes only its owned
scope and reports the actual result; the parent alone empirically Accepts once.
Scoped commit, annotated tag and verified remote refs are recorded by the
authorized publisher/controller, not invented in this bundle.
