# S061 — Add a read replica without losing your write

**Training rehearsal - synthetic data - not a live Azure result**

A-S061 · D-S061 · frozen S · SC-S061 · `worker-A-S061`.
Open `index.html` directly in a modern browser. No server, subscription, database,
account, authentication, credentials or framework. `manifest.json` declares the
standalone portable contract.

## Worked exercise

The exact S061 source requires offloading eligible reads while preserving
read-your-writes and freshness. D-S061 requires **actual** replica reads and
consistency evidence; this A lesson supplies only a deterministic training model.
Reader expansion does **not** establish write scalability.

1. Keep the defaults. **Acknowledge fixture write** fixes primary and session
   version **11** for `SYN-RECORD-061`. The fixture separately supplies reader-1
   as current at version 11. That is an explicit assumption, **not** replication
   implied by write acknowledgement.
2. **Add reader-2** changes reader count **1 → 2**, not writer count (always **1**).
   Its supplied version is **10** by default. Adding it does not synchronize it.
3. **Observe four reads**: browse-existing, own-write-existing, browse-added,
   own-write-added. Browse permits a one-version delay (minimum 10); both
   session reads require their acknowledged write (minimum 11). Unchecked
   routing yields **3 correct, 1 failed, 0 unknown; FAIL / INTERRUPTED**.
   The last read actually returns synthetic version 10 while requiring 11.
4. Predict **FAIL**, then **Check prediction**. The learning verifier passes,
   but the read interruption stays in the trace and retained history.
5. **New attempt (retain history)** restores input defaults and clears current
   proof, not previous outcomes. Choose **Primary for session reads**:
   both session reads use primary and both eligible browse reads use replicas,
   yielding **4 correct**. Requiring **Current only** browse freshness instead
   fails the added browse read: session protection is not a blanket freshness fix.
6. With **Verified watermark or primary**, an unknown/insufficient supplied
   replica version routes that read to the known-current synthetic primary.
   Strict freshness now passes with **2 replica / 2 primary reads**. Reader-2
   remains version 10; the lesson never pretends that fallback synchronized it.
7. Try an **Unknown** added version, partial or absent observations. Unknown
   versions and missing results cannot count as success. A known stale read
   still makes the gate FAIL even while other results remain unknown.
8. **Reset rehearsal and history** explicitly clears everything and returns
   keyboard focus to the write control. Reload also clears this in-memory model.

| Reader / routing / freshness / coverage | Correct / failed / unknown | Gate |
| --- | --- | --- |
| Behind / unchecked / one-version / complete | 3 / 1 / 0 | FAIL |
| Behind / primary-for-session / one-version / complete | 4 / 0 / 0 | PASS |
| Behind / primary-for-session / current-only / complete | 3 / 1 / 0 | FAIL |
| Behind / verified-or-primary / current-only / complete | 4 / 0 / 0 | PASS |
| Unknown / unchecked / either / complete | 2 / 0 / 2 | UNKNOWN |
| Unknown / verified-or-primary / either / complete | 4 / 0 / 0 | PASS |
| Behind / unchecked / one-version / partial | 3 / 0 / 1 | UNKNOWN |
| Behind / unchecked / current-only / partial | 2 / 1 / 1 | FAIL |
| Any / any / either / absent | 0 / 0 / 4 | UNKNOWN |
| Current / unchecked / current-only / complete | 4 / 0 / 0 | PASS |

These are synthetic read outcomes, not uninterrupted user-transition measurements.
Read contract gate, synthetic impact, learning verifier and local-only cleanup
are separate. The observed-read count includes observed destinations whose
version is unknown; only observed destinations count toward offload metrics.

## Bounds, state and accessibility

- **54 configurations**: three added-version fixtures × three routing policies ×
  two browse floors × three coverage settings. Four reads, one fixed record,
  one acknowledged write, no retries or clock. At most **six completed attempts**,
  with no silent history eviction. Inspect each retained attempt's full proof.
- Freshness is a **version floor**, not elapsed milliseconds. Read-your-writes
  always requires 11 even when browse allows version 10. This models neither
  real replication nor transaction isolation, races or monotonic session history.
- Configuration requires exactly four own enumerable data properties, exact
  primitive string enums, and a plain/null-prototype object. Extra, inherited,
  symbol, accessor and coercible inputs fail without invoking a getter or
  mutating state. No arbitrary payloads, endpoints, credentials or identities.
- Only idle → written → expanded → complete is valid. Assumptions lock at write.
  Skipped/repeated actions, duplicate/invalid predictions, arguments on
  argument-free actions and history overflow fail explicitly.
- Private state is not exported. Deeply frozen detached snapshots protect
  nested routing, results, configuration, traces and retained history.
- Native selects and buttons support keyboard operation. Focus follows write →
  add → reads → prediction → next/reset. Errors use `role=alert`, invalid fields
  receive `aria-invalid` and `aria-errormessage`, and reset restores exact
  defaults, enabled states and focus. No button shadows native `form.reset`.
- Text-node rendering, visible keyboard focus and bounded scrollable tables.
  Enforced CSP denies inline script, connections, objects, frames, workers and
  form submissions. Only owned local external scripts/styles are loaded.

## Verification and provenance

Use the existing **Node.js 22.23.4** tooling only:

```powershell
node --test --test-reporter=tap .\learning\S061\tests\model.test.cjs .\learning\S061\tests\surface.test.cjs .\learning\S061\tests\integrity.test.cjs .\learning\S061\tests\browser.test.cjs
node --check .\learning\S061\fixtures.js
node --check .\learning\S061\model.js
node --check .\learning\S061\app.js
```

Normal verification is **read-only to proof**. The browser test exercises current
DOM, keyboard focus, input/state errors, measured failure and unknown paths,
freshness routing, history cap, reset from multiple phases, narrow viewport and
enforced CSP. It does not update proof files. Deliberate capture alone enables:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node --test --test-reporter=tap .\learning\S061\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture refuses to replace earlier successful proof; preserve any previous
capture explicitly before a deliberate recapture. Failed captures are retained
separately. `tests\capture.cjs` is an explicit evidence recorder, not a test:
normal test commands never invoke its writing stages.

Only the published `testing\browser\isolated.cjs` helper (`53c0c0d`) is used,
SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
with `openIsolatedLesson` and awaited `close()` in `finally`. Existing offline
Playwright **1.56.1** and Microsoft-signed Edge **156** only: no downloads,
packages, unsafe flags, foreground lease, shared browser/profile or abandoned
lifecycle prototype. No unattended-runner certification is claimed.

- Exact README S061, D-S061, A/B rows, atomic/portable contract and default
  SC-S061 packet rule were read before behavior design. Raw source snapshots
  preserve their **CRLF bytes**; committed Git blobs are separately retained.
  Exact acceptance slices match the declared baseline; full-file equality is
  recorded explicitly because accepted-count/link edits can occur concurrently.
  An initial full-kanban preflight saw such board-only changes, not a RED test.
- `read-replica.feature` → loadable stub → genuine behavioral RED:
  **18 tests, 1 pass, 17 assertion failures**, exit 1, no missing code/tools.
  Original feature, fixtures, stub and tests remain non-auto-discovered
  `.snapshot` files with narrow binary Git attributes.
- `evidence\iac-decision.json` records **IaC N/A after RED, before implementation**.
- Gzip-preserved raw stdout/stderr and SHA-256 metadata retain provenance.
  Readable TAP removes trailing whitespace only. Canonical LF source hashes,
  syntax, focused green and actual browser proof bind checks to this bundle;
  raw snapshots/gzip are never normalized. The finite content index excludes
  itself and final verification logs to avoid self-reference. Git filter checks
  use the actual Windows directory and basename.

## Native remainder and refinement

No actual DB replication/read-consistency, write scalability, native Azure,
authentication, production Node.js 24, five-nines, source-parent or unattended
lifecycle proof is established. B-S061 still needs **CORE, DATA, HOST, REPLICA**
and approved real routing/freshness observations; original D-S061 is incomplete.
These are genuine unready native gates, not a ready synthetic follow-up.

Only `learning\S061\**` is owned. One frozen S unit; tests, evidence, syntax,
documentation and refinement do not create extra cards or completion credit.
No shared To Do inventory edits are authorized. Parent alone empirically Accepts.
