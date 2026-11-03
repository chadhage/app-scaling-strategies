# S046 — Server-sent events: resume the cursor

**Training rehearsal - synthetic data - not a live Azure result**

A-S046 · D-S046 · packet SC-S046 · frozen Kano S · owner `worker-A-S046`.
The [source S046](../../README.md#e-in-flight-requests-and-long-lived-work)
requires cursor resumption without missing or duplicating user-visible events.
The [backlog](../../.docs/wiki/backlog.md#e-in-flight-requests-and-long-lived-work)
also requires ordering and reconnection-gap measurement against the original budget.
The portable card specifically asks learners to expose a gap hidden by a newly established stream.

## Run and learn

Open `index.html` directly in a modern browser. No server, dependency installation,
account, credentials, subscription or real EventSource is needed.

1. Keep the defaults; start the old stream, cut over, and resume the SSE cursor.
   `evt-cedar` is the saved `Last-Event-ID`; the new stream returns `evt-delta`,
   `evt-elm`, `evt-fir`. All six opaque IDs appear once in the declared order.
   The first new visible event is at synthetic 60 ms and recovery at 100 ms,
   exactly the original 100 ms budget: **success**.
2. Select **Another attempt**, then **Expired replay window**. The stream opens,
   but only `evt-elm` and `evt-fir` remain. Missing `evt-delta` is **failure**,
   even though stream establishment and timing pass.
3. Try no cursor/live tail (two missing IDs), reordered events (complete but
   unordered), or a rejected new stream. These are explicit interrupted outcomes.
4. With an older cursor, use budget 120 ms: deduplication suppresses the replayed
   `evt-cedar` and succeeds; rendering it again fails. A duplicate wire event is
   similarly different from a duplicate visible effect.
5. With final observation unavailable, an otherwise good observed prefix is
   **unknown**, never success. A known duplicate or budget violation still fails.
6. Raise reconnect delay to 41 ms with the default 100 ms budget. Opening at
   41 ms cannot restart the clock: final recovery at 101 ms fails.

Time zero is the last old visible event. Every received wire event, including
suppressed replays, adds 20 synthetic ms after stream-open. First visible silence
and complete recovery must both fit the original budget. These are fixture
calculations, not measured browser/network latency or universal platform thresholds.
IDs are opaque; their order is supplied by the fixed fixture, not inferred numerically.

All controls support keyboard operation. Focus advances through the three actions,
then to the prediction. Errors are announced and do not advance state. Configuration
locks during attempts. A prediction verifier is separate from the user outcome.
Another attempt preserves every completed success, failure and unknown; the ninth
attempt is blocked rather than pruning any of the eight retained results.
**Reset rehearsal** explicitly restores exact defaults and clears history, trace,
prediction and errors. Page reload also clears this in-memory-only history.

## Verification and provenance

Run from the repository root in PowerShell:

```powershell
node --test .\learning\S046\tests\model.test.cjs .\learning\S046\tests\surface.test.cjs
node --check .\learning\S046\model.js
node --check .\learning\S046\app.js
node --test .\learning\S046\tests\browser.test.cjs
```

The browser test uses only published `testing\browser\isolated.cjs`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
(`53c0c0d`), `openIsolatedLesson`, and awaited `finally` cleanup. Its known
unattended-lifecycle limitation is not claimed solved. Existing offline
Playwright 1.56.1, signed installed Edge 156 and Node 22.23.4 are test tooling only.
No downloads, dependency changes, foreground browser lease, unsafe flags,
unqualified lifecycle prototype or production Node 24 certification are involved.

Ordinary verification is **read-only to retained proof**. Only a deliberate capture
writes `evidence\browser.json`:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node --test .\learning\S046\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD in `sse.feature` preceded the loadable conservative stub and genuine
`ERR_ASSERTION` RED (`unknown` versus expected `success`). `evidence\red\`
retains raw stdout/stderr compressed without transformation, TAP, command/timestamps,
hashes and exact `.snapshot` source/test/BDD files. Snapshots are intentionally
not auto-discovered tests. Raw snapshot hashes preserve original line endings;
logical source comparisons use LF so published Git-normalized files remain valid.
A real post-publication LF/raw-snapshot assertion RED is retained separately with
its corrected regression check. The original failing assertion is retained in the green
model suite. `evidence\iac.json` records resource-free **N/A** after RED and before
implementation. Source/contract and exact tool provenance are retained separately.
Browser proof records actual DOM, keyboard, input/phase guards, locked configuration,
failure/unknown attribution, history bound, reset, CSP probes and cleanup. Raw
capture-run records preserve failures as well as successful runs.

## Scope and limits

`manifest.json` declares the portable contract and bounds. Only `learning\S046\**`
is owned. This single S unit includes its own tests and evidence; no extra
test/plumbing/refinement unit is created. The precise synthetic slice needs no
additional research, shared dependency or native implementation. No further To Do
subtask is useful here; B-S046 and D-S046 remain separate, uncompleted native work.

This is not a real SSE client/server, transport/retention guarantee, deployment,
identity implementation, live Azure result, five-nines proof or source-parent
certification. No cloud, IaC generation, scaffold, registration, deployment or
spend is authorized. The [Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer)
applies: educational examples are provided “AS IS”; no Microsoft endorsement,
warranty, certification or SLA is implied.
