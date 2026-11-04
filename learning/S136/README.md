# S136 — Offline sample-client synchronization

**Training rehearsal - synthetic data - not a live Azure result**

A-S136 / D-S136 / SC-S136, frozen S, one original Kano unit. Open `index.html`
directly in a browser. This is a standalone, deterministic lesson, not native
mobile synchronization or a cloud demonstration.

## Conduct the bounded rehearsal

1. Choose a fixed fictional v2 receipt fixture and synthetic elapsed-time trace.
2. Take **only the sample client** offline. Inspect the operator console while
   offline: its controls and the two other fictional workers remain available.
3. Queue the two fixed changes, reconnect the sample, then synchronize with v2.
4. Inspect each effect, acknowledgment, pending ID, measured verdict and user impact.
5. For missing acknowledgment only, retry the same pending ID once. Its observed
   effect count stays one; the original unknown result remains in the journal.
6. Use Tab/Enter/Space or the buttons. Reset restores fixtures, active counts and
   errors, retaining recent results. The latest 32 actions remain in memory;
   omitted older entries are explicitly counted. Reload clears this journal.

| Fixed condition | Observed result |
| --- | --- |
| Clean, 4000 ms offline / 120 ms recovery | Positive: two owned, correct v2 effects and acknowledgments; no pending IDs. |
| Revision conflict | Negative/interrupted: second ID retained; no automatic merge or successful retry. |
| Missing acknowledgment | Unknown/unresolved: two observed effects are not two client confirmations. Same-ID receipt retry can confirm without duplicating. |
| Missing or duplicate effect | Negative/interrupted despite accepted receipts; inconsistent ID remains pending. |
| Rejected identity | Negative/interrupted; second change is unconfirmed. |
| 6000 ms offline or 250 ms recovery | Negative/interrupted even if both changes were confirmed. |

The fictional offline budget is **≤ 5000 ms**, recovery **≤ 200 ms**. Times are
fixed fixture measurements, not wall-clock timings. The two separate fictional
registers (accent/blue, layout/compact) start at revision 7 for fictional-user-136.
The stated protocol requires stable operation IDs, authenticated ownership,
revision checking, deduplicated effects and matching accepted v2 receipts at
revision 8. Missing evidence stays unknown; known conflicts are never merged.

All sample-client/connectivity/identity/pending/sync/conflict/ack/effect/time data
are **fixed fictional teaching DATA ONLY**. Runtime state is in memory. The lesson
does not use actual network-offline APIs, management calls, service workers,
persistent storage, user data, credentials, identities, cloud services or effects.
CSP denies connections, inline code, workers and form submission; scripts/styles
are local external files. IaC is **N/A**, recorded after genuine behavioral RED.

## Focused, read-only verification

From the repository root, in PowerShell:

```powershell
node --test .\learning\S136\model.test.cjs .\learning\S136\integrity.test.cjs .\learning\S136\browser.test.cjs
node --check .\learning\S136\model.js
node --check .\learning\S136\lesson.js
git --no-pager diff --check -- learning\S136
```

Normal verification does not replace committed evidence. Only an intentional
browser capture uses the **exact** value below; values such as `true` do not capture.
An intentional new capture makes the byte-integrity index historical, so preserve
the resulting proof separately or deliberately regenerate this owned index.

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node --test .\learning\S136\browser.test.cjs
Remove-Item Env:CAPTURE_BROWSER_EVIDENCE
```

`evidence\raw\red` contains the loadable no-op stub, original BDD/test snapshots,
raw failing TAP and exit metadata, outside normal test autodiscovery. The failing
assertion was `sampleClientOnline: true !== false`, not an import/tooling failure.
`evidence\source.json` identifies exact S136/README, D-S136/backlog, portable A/card
and packet inputs. Full gzip snapshots preserve **working bytes (including CRLF)**
separately from **canonical Git bytes**; selected excerpts are normalized only for
reading and are never used as substitutes for raw-byte hashes. Lesson-scoped
`.gitattributes` prevents newline rewriting of byte-addressed assets and raw proof;
immutable raw TAP/snapshots are binary-diff data rather than format-repaired code.
The lesson-scoped CR-at-EOL rule recognizes preserved CRLF while retaining the
other default whitespace checks. These narrow attributes do not alter parent
sources or shared Git configuration.

Actual DOM/keyboard/error/reset/failure/CSP observations are in `evidence\browser.json`.
They use the published `openIsolatedLesson` helper at SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
and await `close()` in `finally`. Existing offline Playwright 1.56.1, signed Edge
156 and Node 22.23.4 are test tooling only. No packages, downloads, unsafe flags,
foreground leases or inactive recovery prototype were used; the helper's broader
unattended-lifecycle qualification remains incomplete.

## Honest remainder

Native B-S136 remains blocked on CORE, DATA, HOST, C032, a qualified and explicitly
approved target, network assumptions, durable authenticated queuing, measured
budgets and native reconciliation evidence. D-S136 also retains D-S040/D-S077 and
both children. No native/source-parent completion, production Node 24 validation,
live Azure result or five-nines claim is made. The parent alone accepts A-S136 once.
Tests, repairs, proof and this refinement earn **zero additional credits**.
