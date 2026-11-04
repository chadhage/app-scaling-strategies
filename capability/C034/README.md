# C034 — inspect an actually saved client trace

**Training rehearsal - synthetic data - not a live Azure result**

Original **C034 / S / P0 / LP-REPLAY**, under incomplete H006/H007. C020 and
C015 are independently accepted prerequisites; accepted C033 supplies actual
historical browser observations. This is one original unit, with zero extra
credits for tests, proof, repair or refinement. Only the parent accepts it.

## Inspect, without execution or adoption

Open `index.html` directly. Choose **Saved closed history** or **Saved held
partial**, then Tab/Enter **Inspect saved trace**. **Load saved JSON copy**
loads the actual saved data into an editable inspection-only textarea.
**Inspect JSON copy** rejects malformed/duplicate JSON, missing fields, stale
context, altered source stamps, business data, order, times and claimed verdicts.
Errors clear stale results. Buttons also support Space. **Reset display only**
clears presentation and returns focus to the picker, not saved originals or
inspection errors. The view refuses further inspections after 16, retaining
history instead of silently dropping it.

```powershell
node capability\C034\cli.cjs inspect closed-history
node capability\C034\cli.cjs inspect held-snapshot
node --test --test-concurrency=1 capability\C034\tests\trace.test.cjs capability\C034\tests\guards.test.cjs capability\C034\tests\surface.test.cjs
node capability\C034\tests\syntax.cjs
node capability\C034\tests\browser.cjs
node --test capability\C034\tests\integrity.test.cjs
node capability\C034\tests\verify.cjs
```

The CLI accepts only those two literal saved IDs, not caller paths, URLs,
headers, approvals, identities, run IDs or arbitrary provenance. It rereads
the exact pinned historical source and actual C015 known context; the browser
uses bundled historical/local data and makes **no disk, process or network
read**. Importing a copy never creates, restores, adopts or approves a run.

## What was actually saved

`evidence\raw\trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\bundle.json`
is a closed versioned trace decoded from **exact, unchanged C033 saved DOM**:

- `reset-history.html`: 43 actual saved actions and six original attempts.
- `between-reads.html`: 13 saved actions, one closed original and original
  attempt 2 still held with only its v1 reply acknowledged.
- C033's exact saved `summary.json` supplies historical source/PID/version
  stamps and a later replacement summary, not missing replacement steps.

These files are pinned to accepted C033
`dd0870986cfcdd6b5069e5b1da9ff74e9ad3819c`, not reconstructed event labels.
`imports.json` separately pins raw working bytes, CRLF-to-LF bytes and accepted
Git blobs. C020's unchanged catalog-scan and indexed providers/inspector verify
exact business values and immutable stamps. Implementations **1.0.0 / 2.0.0**
preserve **getProfile/1**; local deployment labels are not cloud attestation.

The decoder verifies request-before-response, v1-before-v2, holds/resumes,
terminal/outcome order, deduplication, exact original identity, monotonic
elapsed/held time and the original deadline. Original attempt 3 remains
**budget exceeded** even though its local two-read segment was observed.
Attempts 5 and 6 remain interrupted **unknown**. The partial snapshot has
no invented end time, second reply or observed v2 stamp.

The historical report mentions replacement attempt 7, but its complete
actions/start/deadline/end and per-reply versions were not saved in the chosen
DOM. It stays a **summary-only, ordering/outcome-unverified remainder** and
does not repair interrupted original 6. Source event action/outcome labels
are preserved; derived inspection classifications are always recomputed,
never accepted from caller verdicts.

Request tokens and per-response headers were not saved in these DOM traces.
No such observations are invented. Canonical ordering is established only
within that saved original client's known source observations, not as an
authenticated transport or cross-tier correlation claim.

## Actual C015 context, not fabricated correlation

During deliberate capture, C015's unchanged public
`restore('synthetic-restart-v1', 'synthetic-run-001')` read and validated actual
immutable epoch **3**, existing `record`, envelope, acknowledgment and history.
The exact receipt, actual reader PID and measured read timestamps are saved
separately. Its state schema is unchanged. C015 supplies no C033 client, lease
or user correlation, so this is explicitly a **declared fixture association**,
not evidence those historical browser attempts belonged to that run/epoch.

Current gate reads hold `Local\AppScalingStrategies_KanbanState_v1`;
`ReadAllText` handles close before release/disposal. Actual public C015 restore
rereads literal current C001 local consent and scoped C015 fixture approval.
No tests initialize, persist, reset or rewrite C015, its retained demo, scratch
UUIDs or any other capability.

## Distinct empirical proof and immutable capture

`evidence-index.json` links BDD → original loadable stub → **genuine
AssertionError RED for wrong order** → IaC **N/A** → implementation/refactor →
focused GREEN, Node syntax, actual signed Edge DOM/keyboard/CSP and cleanup.
Historical source proof, Node assertions and newly observed browser inspection
behavior are different evidence, not interchangeable “actual telemetry.”

The original RED still intentionally fails without changing implementation:

```powershell
node --test capability\C034\evidence\red\trace.initial.snapshot.cjs
```

Normal checks are read-only for source and evidence. The verifier snapshots
owned bytes/listings and pinned dependencies before/after. Only deliberate
exact capture appends a **new unique C034 evidence directory**, never refreshes
an existing file:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C034\tests\record.cjs browser }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

Other closed capture stages in `record.cjs` are deliberate evidence operations
under the same exact guard. Trace capture writes **only own evidence**. Captured
raw gzip preserves original stdout/stderr including authentic assertion
whitespace. Scoped `-text` preserves original bytes; real source whitespace
checks remain enabled. The final integrity index is deliberately finalized
once and refuses overwrite.

Actual browser checks use installed **Node 22 / offline Playwright 1.56.1 /
valid Microsoft-signed Edge 156** and unchanged published
`testing\browser\isolated.cjs`, SHA
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
through `openIsolatedLesson`. They observe actual DOM keyboard inspection,
order/error/partial/reset/history states, enforced inline-script/connection
CSP, exact owned browser closure and helper runtime cleanup. No helper patch,
prototype patch, foreground lease, unsafe flags or native-launcher bypass
is used. No native TCP, CORS, WebSocket or broader lifecycle qualification
is asserted.

## Publication and remaining scope

Only the exact parent-approved standard publisher is used:
SHA `f6df80bdafc028538813330fe810bd81a69a50822a4a862e0bf42f59b2b0b2a4`.
`publisher-boundary.json` records frozen C034/S and owned-only paths. Main must
equal remote before staging, an annotated `kanban/C034/<12sha>` tag and main
are pushed atomically, and full publication/remote evidence is reported for
parent-only acceptance. No shared guard, index lock or unrelated work is edited.

H006/H007, full journeys, business effects, authenticated correlation, live
routing/migration, telemetry ingestion, native/source parents and production
**Node 24 / Express / App Service Linux** remain incomplete. IaC is **N/A**.
No packages/downloads, scaffold, framework, Azure, user data, credentials,
identity registration, deployment or spend. No reliability guarantee or
Microsoft SLA/endorsement is implied.
