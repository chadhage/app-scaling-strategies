# S063 — Database resize or parallel capacity?

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, database, account,
authentication, credentials or Azure resource is used.

## Exact source and scope

- Source: root `README.md`, exact **S063 / Database vertical scaling** row:
  “Validate reconnects and transaction recovery; use parallel capacity if the
  operation exceeds interruption budgets.”
- D-S063 acceptance: “Reconnects and transaction outcomes meet budgets where
  supported; disruptive native operations remain failed/unsupported, not assumed online.”
- A-S063: compare data-tier resize/failover paths; identify operations that are
  not online. Owner `worker-A-S063`, packet `SC-S063`, frozen Kano unit `A-S063 / S`.
- Exact raw source rows, portable/atomic contract and packet/parent rules are
  retained under `evidence\raw\source`, referenced by `evidence\source-contract.json`.
  The supplied tree has no separate source `S063\README` directory.
- One bounded comparison behavior; no additional test, tooling or refinement
  credit. No unrelated To Do change was needed.

## Worked exercise

1. Keep the bounded-resize fixture, synchronized readiness, recovered transaction
   and complete timing observations. Compare both paths with budgets **600/800 ms**.
   In-place **420/560 ms** and parallel **180/320 ms** both pass the synthetic checks.
2. Select **restart-required resize**. In-place is **FAILED / NOT ONLINE**;
   the supported, ready parallel fixture passes. Even **5000/5000 ms** cannot
   make the disruptive resize online. Eventual transaction recovery is not
   uninterrupted service.
3. Use **parallel path unsupported**, or set readiness to **not synchronized**.
   Handoff fails before transition: no invented timings, **0 started / 3 not run**.
   Extra capacity alone is not permission or readiness to fail over.
4. Choose **outcome unresolved** or **timing observations missing**: the affected
   path is **UNKNOWN**, not passed. The unresolved transaction remains in the
   **3 started** denominator. A known transaction failure or exceeded measured
   budget still makes the result **FAILED** even when other evidence is unknown.
5. Compare exact boundaries **420/560 ms**, then lower either budget by 1 ms.
   Inspect the selected trace, transaction effects and retained comparisons.
6. Tab through native controls; arrows select options; Enter submits.
   Blank, fractional, exponent, negative or out-of-range budgets focus an error.
   Six runs are retained, including negative/unknown ones. A seventh is blocked.
   **Reset rehearsal** restores defaults, clears only this in-memory history and
   focuses the inspected-path control. Reload also clears history.

Timings are fixed synthetic elapsed times from transition start, not additive
latencies or measured Azure values. Budget equality passes. Complete fixture
transactions are before/in-flight/after: one effect each after successful
recovery; the failed in-flight fixture has zero effects; its unresolved fixture
has an unknown effect count. No reconciliation, database engine or actual effects
run. A passed model is not a zero-delay or native online-operation guarantee.

## Verification and retained provenance

Existing Node **22.23.4**, offline Playwright **1.56.1**, signed Microsoft Edge
**156** are test tooling only. No packages, frameworks or downloads are needed.
From the repository root in PowerShell, normal verification is **read-only to proof**:

```powershell
node --test .\learning\S063\tests\model.test.cjs .\learning\S063\tests\surface.test.cjs .\learning\S063\tests\integrity.test.cjs
node .\learning\S063\tests\syntax.cjs
node --test .\learning\S063\tests\browser.test.cjs
```

BDD preceded a loadable model stub and a genuine `UNKNOWN` versus `PASSED`
assertion RED, not a missing module/tool failure. Non-auto-discovered `.snapshot`
stub/test/BDD bytes and unmodified process streams live in
`evidence\raw\red-001`. Explicit IaC **N/A** followed RED before implementation.
Focused green, syntax and actual browser receipts retain commands, timestamps,
runtime, Git HEAD at execution, exit codes and raw stream hashes.

Browser verification uses only published `testing\browser\isolated.cjs`
(`53c0c0d`, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`),
`openIsolatedLesson` and awaited `close()` in `finally`. The abandoned lifecycle
prototype is unqualified. Every default rerun leaves evidence unchanged.
Only a deliberate capture sets `CAPTURE_BROWSER_EVIDENCE=1` and a fresh
`BROWSER_EVIDENCE_ID=browser-NNN`; the owned capture script refuses overwritten
receipts. `.gitattributes` preserves **raw proof bytes**, including CRLF source
snapshots; integrity separately qualifies **canonical LF Git-source bytes**.
Only `evidence\raw\**` is non-textual for Git diffs: byte evidence must not be
rewritten to satisfy source whitespace checks. Its complete lengths and hashes
remain checked. The initial publication preflight diagnostic is retained under
`evidence\raw\publication-check-001`; no raw proof was normalized or discarded.
Git-filter probes use each file's basename from its parent working directory:
Windows backslashes inside `hash-object --path` otherwise miss nested attributes.
The discovered qualifier failure and actual staged/raw/LF blob comparison remain
in `evidence\raw\integrity-003`. Earlier integrity indexes are historical, not the
final qualifier; the active index and default tests check the corrected filters
against the actual unchanged indexed blobs.

## Limits

No actual DB resize/failover, native platform support, production Node.js 24,
completed source parent, or five-nines evidence is established. **B-S063 and
D-S063 remain incomplete**. Native work needs separately approved target/SKU/
region, operation support, real reconnect/transaction observations and budgets.
There are no cloud/IaC/scaffold/identity/deploy/spend actions, real authentication
or registration, credentials, external calls, unsafe flags or foreground leases.
Publication and parent-owned acceptance are separate from synthetic verdicts;
the worker cannot award Done credit.
