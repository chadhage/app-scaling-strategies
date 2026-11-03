# S045 — WebSocket migration rehearsal

**Training rehearsal - synthetic data - not a live Azure result**

A-S045 · D-S045 · frozen satisfier S · packet SC-S045 · owner `worker-A-S045`.
Open `index.html` directly in a modern browser. No server, dependency installation,
account, credentials, framework or cloud connection is needed. The standalone
bundle remains portable for later mounting; `manifest.json` declares its contract.

## Worked exercise

1. Keep the defaults: last acknowledged cursor **3**, replay protection, readable
   v1/v2 frames, retained state, complete observation, synthetic recovery gap
   **80 ms**, original UX budget **100 ms**.
2. **Start v1 session** acknowledges sequences 1, 2, 3, each adding 10, for state
   **30**. Configuration and the original budget lock at this point.
3. **Cut over to v2** disconnects v1 and offers sequences 4, 5, 6 using a different
   frame format. The existing transport is not preserved and no success is claimed.
4. **Reconnect and verify** resumes after cursor 3. Complete ordered visible
   sequences 1–6, final ACK **6**, state **60**, no duplicate effects and an
   on-budget recovery produce **uninterrupted synthetic impact**.
5. Predict the impact, then **Check prediction**. A correct prediction of an
   interruption passes the learning verifier while impact remains **interrupted**.
6. **New attempt (retain history)** unlocks assumptions without erasing any of the
   previous completed results. Eight attempts are retained; further work is
   blocked, not silently evicted. **Reset rehearsal** explicitly restores exact
   defaults, idle phase, prediction, trace, focus and empty in-memory history.

All controls are keyboard-operable. Start → cutover → reconnect moves focus to
the next control. Reset returns focus to Start. Errors are announced in an alert;
invalid inputs do not reuse an old successful current result. The ordinary button
handler does not call or shadow `form.reset`.

## Compare these synthetic cases

| Assumptions changed from default | Observable result |
| --- | --- |
| Rewind to 0; suppress replays | 3 wire replays, **0 duplicate effects**, state 60; uninterrupted |
| Rewind to 0; apply all frames | 3 duplicate effects, state **90**; interrupted |
| Repeat sequence 4; suppress replays | 1 wire replay, 0 duplicate effects; uninterrupted |
| Repeat sequence 4; apply all frames | 1 duplicate effect, state **70**; interrupted |
| Drop sequence 5 | Sequence 6 rejected at the gap; final ACK 4; visible 5, 6 missing; interrupted |
| Sequence 6 before 5 | 6 rejected, later 5 acknowledged; final ACK 5, visible 6 missing; interrupted |
| Skip cursor to 4 | Required sequence 4 absent; later 5, 6 cannot advance ACK; interrupted |
| Lose acknowledged state | Ordered replay can reach ACK 6 while final state is only **30**; interrupted |
| Read v1 only | 3 v2 schema rejections; ACK remains 3; interrupted |
| Gap 101 ms, original budget 100 ms | Original budget breached; interrupted |
| Missing cursor or post-reconnect observation | Sequence/state/duplicate proof unknown; otherwise unknown impact |
| Missing observation plus gap 101 ms | Known time failure still interrupts; other checks remain unknown |

v1 uses `{version:1, seq, delta}`; v2 uses
`{version:2, sequence, increment}`. The receiver normalizes both declared formats.
It rejects out-of-order frames instead of buffering them. Wire replay is not
itself a duplicate business effect: replay protection suppresses acknowledged
sequences. No claim of exactly-once delivery or a universal recovery protocol is
made.

The configured gap represents **disconnect to final replay observation**, not
just handshake time. Exactly on the original budget passes that check. A new
connection cannot restart the original clock or waive state/sequence checks.
Equal synthetic timestamps are ordered by trace step; no real timer runs.

Unknown proof is never substituted with zero, a new cursor, or successful
continuity. Known state loss and known budget breaches dominate partial
uncertainty, but the unobserved checks stay explicitly unknown.

## Bounds and guards

- Fixed six-message fixture; at most seven replay frames and eight completed
  attempts. No arbitrary JSON, scripts, endpoints, payloads, identities or keys.
- Gap **0–2000 ms**, original budget **1–2000 ms**, whole integers only.
  Model inputs reject missing/extra/accessor fields, inherited configurations,
  numeric strings, booleans, null, non-finite numbers and coercion.
- Only idle → connected-v1 → disconnected → complete is valid. New attempt is
  allowed only after completion; reset is the explicit way to abandon work.
  Internal state is private; returned snapshots are deeply frozen copies.
- Current results are cleared on New attempt. Completed history retains its
  assumptions, measurements, impact and separate prediction verifier. It is
  in-memory, not durable, and resets on page reload.
- Untrusted data is rendered as text. Local external assets only; CSP forbids
  connections, inline execution, forms, frames, objects and workers.

## Verification and provenance

Use the existing Node.js **22.23.4 test tooling only**:

```powershell
node --test --test-reporter=tap .\learning\S045\tests\model.test.cjs .\learning\S045\tests\surface.test.cjs .\learning\S045\tests\integrity.test.cjs .\learning\S045\tests\browser.test.cjs
node --check .\learning\S045\fixtures.js
node --check .\learning\S045\model.js
node --check .\learning\S045\app.js
```

Ordinary verification reads committed proof; it does not refresh it. The browser
test always performs actual DOM/keyboard/error/reset/failure/CSP checks using
`openIsolatedLesson` and awaited `close()` in `finally`. It uses only published
`testing\browser\isolated.cjs` (publication `53c0c0d`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`),
the existing offline Playwright **1.56.1**, and installed signed Edge **156**.
No browser download, foreground lease, unsafe flag or lifecycle prototype.
The helper's documented unattended shutdown limitation is not certified away.

Only a deliberate capture overwrites `evidence\browser.json`:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node --test --test-reporter=tap .\learning\S045\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

After an intentional source/capture change, content hashes must be deliberately
refreshed before read-only integrity verification. The content-hash document
declares its finite file inventory and excludes itself and generated run logs
to avoid self-reference. Normal tests do not update it.

- `websocket.feature` was written before behavior implementation.
- `evidence\source-contract.json` preserves the exact S045/README, D-S045,
  portable contract, card, packet rule and source-read baseline.
- `evidence\red\run.json` records genuine RED: **24 tests, 1 pass, 23 assertion
  failures**, exit 1, with no missing imports, code or tools.
- `evidence\red\*.snapshot` preserves that loadable stub, fixtures, feature and
  tests; snapshots are not automatically discovered as executable tests and
  retain their original bytes through binary attributes rather than undergoing
  Git newline conversion or textual diff reinterpretation.
- Raw stdout/stderr are gzip-preserved with SHA-256 provenance. Readable TAP
  copies remove trailing spaces/tabs only; no assertion or result is altered.
- `evidence\green\`, `evidence\syntax.json`, `evidence\browser.json` and
  `evidence\content-hashes.json` hold actual focused check results and bindings.
  The focused suite passed **41 tests**, with no failures or skips, and all
  **seven** runtime/test scripts passed syntax checks. The recorded normal run
  left the entire owned tree byte-for-byte unchanged.
- `browser-run-001.*` preserves an initial browser-check failure: Playwright's
  fieldset `isDisabled()` inspection returned false. The corrected check reads
  native `fieldset.disabled` and verifies that the actual select/input children
  are disabled. `browser-run-002.*` is the successful capture; no runtime
  behavior was changed to conceal that failed check.
- `publication-preflight-001.*` preserves a scoped diagnostic rerun after the
  first publisher stopped before commit/tag/push: raw CRLF snapshots were
  interpreted as textual whitespace. Only raw snapshots are now marked binary
  (`-text -diff -merge`); their original bytes remain unchanged. Runtime files
  and readable evidence still pass the ordinary text whitespace check.
- `evidence.json` identifies engineering verification, synthetic user impact,
  cleanup, publication authority and pending parent review separately.

## Refined boundary and remaining gates

This single card covers only its bounded portable rehearsal. No extra testing,
plumbing or refinement unit was admitted. No native work is made ready by this
lesson. B-S045 remains a separate unfulfilled slice needing its existing
CORE/DATA/CONTAINER/C026 gates, approved target and genuine stream-handoff
evidence. D-S045 remains incomplete until both slices and its original
acceptance clauses pass. The parent alone may accept A-S045.

IaC is **N/A**, explicitly recorded after genuine RED and before implementation.
No cloud, IaC, scaffolding, identity registration, deployment, expenditure,
package/framework/root/shared-file changes or real authentication occurred.
Actual WebSocket continuity/latency, Azure behavior, production Node.js 24 and
five-nines reliability remain **unknown/unverified**, not certified by this
resource-free synthetic lesson. Cleanup only clears owned in-memory rehearsal
state and awaits closure of the owned isolated browser.
