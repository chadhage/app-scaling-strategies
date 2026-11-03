# S067 — Replica lag during migration

**Training rehearsal - synthetic data - not a live Azure result**

A-S067 · D-S067 · SC-S067 · frozen S · `worker-A-S067`.
Open `index.html` directly in a modern browser. No server, account, database,
authentication, credentials, subscription or framework is needed.

## Worked exercise

The exact S067 source requires: **Route consistency-sensitive reads appropriately
rather than silently returning unacceptable stale data.** D-S067 additionally
requires **actual lag and selected reader** observations. This local A lesson
is a deterministic rehearsal, not that native proof and not S061 replica expansion.
One primary and one reader remain fixed throughout.

1. Keep the defaults: five ticks of lag, zero-tick freshness budget, reader-only
   routing, complete returned-read observation. **Introduce lag** freezes them.
   Primary version **12** is assumed committed at tick **12**; reader-1 has
   watermark **7** at tick **7**, five synthetic ticks behind.
2. **Read once** selects **reader-1**, returning version **7** against required
   minimum **12**. The result is **FAIL / INTERRUPTED**: one failed read, not
   uninterrupted correctness.
3. Predict **FAIL**, then **Check prediction**. The learning check matches,
   but the actual failure and interrupted impact remain in retained history.
4. **New attempt (retain history)** clears current proof and restores input
   defaults without changing previous outcomes. Choose **Reader watermark or
   primary fallback**. Lag is still five, but the selected reader is now
   **primary**, returning **12**: **PASS / CONTRACT_MET** within this fixture.
   Reader-1 remains version **7**; fallback did not repair replication.
5. Try lag **2** with budget **2** and direct routing. Version **10** exactly
   meets minimum **10**. The same reader with budget **0** fails. The declared
   contract—not the route's name—determines success.
6. With an **Unknown** watermark, direct reader-1 results are **UNKNOWN /
   UNVERIFIED**. Gated routing can use the assumed-current primary. With
   **Missing returned-read evidence**, even that selected primary route remains
   **UNKNOWN**: routing intent does not prove a returned value.
7. Check a deliberately wrong prediction. It cannot change the actual result.
   Keep at most six checked attempts; a seventh is blocked. **Reset rehearsal
   (clear history)** explicitly clears all inputs, errors, traces and history.
   Reload also clears this in-memory-only model.

The fixture has one version per synthetic tick and **32 configurations**:
four lag observations × two budgets × two routing policies × two receipt
coverage modes. These ticks are not elapsed time or real database measurements.
There is exactly one synthetic read per attempt.

## Guards and keyboard

- Only exact listed inputs are accepted. Unknown keys, blank values, prototype
  tricks, non-string values, accessor inputs and untrusted model states fail
  without progress or history mutation.
- The lifecycle is configure → introduce lag → read once → check prediction →
  new attempt. Configuration locks after introduction; changing a disabled
  input cannot silently reinterpret an observation.
- Tab reaches labelled controls; arrows select; Enter/Space activate buttons.
  Focus advances to the next action. Error feedback is an alert and marks the
  offending input. New attempt and reset focus **Introduce lag**.
- Reset buttons are not named `reset`, so native `form.reset()` is not shadowed.
  New attempt retains immutable history; reset clears it deliberately.
- CSP blocks connections, forms, frames, objects, workers, base changes,
  inline scripts/styles and dynamic evaluation. The lesson makes no requests
  beyond its own local static files, uses no storage and has no HTML sinks.

## Verification (existing offline tooling only)

From the repository root in PowerShell, normal verification is **read-only**
with respect to all retained proof:

```powershell
Remove-Item Env:CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue
$tests = (Get-ChildItem .\learning\S067\tests\*.test.cjs).FullName
node --test --test-concurrency=1 @tests
Get-ChildItem .\learning\S067 -Recurse -File |
  Where-Object { $_.Extension -in '.js', '.cjs' } |
  ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { throw 'Syntax failure' } }
```

The original nine tests ran against a loadable stub: **one passed, eight genuine
assertion failures**. Raw stdout/stderr and the BDD, fixture, test and stub byte
snapshots are retained under `evidence\red`. Snapshot suffixes are intentionally
not auto-discovered as runnable tests. IaC N/A was recorded after RED and before
implementation. Model tests cover every finite configuration and state/input
guards. Actual browser tests exercise DOM, keyboard, errors, stale failure,
unknown results, prediction mismatch, history, reset and enforced CSP.

Browser proof is written **only** on a deliberate capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try {
  node .\learning\S067\tests\capture.cjs browser-green tests\browser.test.cjs
} finally {
  Remove-Item Env:CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue
}
```

Capture refuses to overwrite proof; the retained capture is already present
after delivery. Normal reruns do not use that opt-in or rewrite evidence.
Node **22.23.4**, existing offline Playwright **1.56.1**, and existing signed
Microsoft Edge **156** are tooling, not production Node.js 24 certification.
The only browser helper used is published `testing\browser\isolated.cjs`
(`53c0c0d`), SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
The session is opened by `openIsolatedLesson` and closed with `await` in
`finally`. No downloads, packages, unsafe flags, foreground leases or shared
changes are needed. The abandoned lifecycle prototype is unqualified.

## Provenance and completion boundary

`evidence\source-contract.json` binds exact S067/README, D-S067/backlog, A/B
rows, the portable/atomic card contract and default SC-S067 packet rule to raw
working-tree byte snapshots and immutable canonical Git blobs. Owned
`.gitattributes` preserves only named raw-evidence classes as binary while
source integrity uses canonical LF. CRLF snapshots remain exact, even where
live shared Kanban totals differ from the captured committed version.

`evidence.json` links RED, N/A, green, syntax, browser, tooling and the content
index. Publication uses the authorized scoped publisher, a frozen `[A-S067][S]`
evidence label, Copilot coauthor and annotated `kanban/A-S067/<12sha>` tag with
atomic main/tag push and remote verification. Publication identifiers live in
the orchestration record to avoid self-referential source hashes.

**B-S067 and D-S067 remain incomplete.** Actual database lag, routing and
freshness need a separately qualified native experiment with CORE, DATA, HOST
and REPLICA gates. No actual replication, read-your-writes, elapsed-time
freshness, authentication, deployment, five-nines, production24 or source-parent
certification is implied. Local reset is not cloud cleanup. The parent alone
empirically accepts this one frozen S unit; tests, plumbing and refinement earn
no additional units.
