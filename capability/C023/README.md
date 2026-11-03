# C023 — checkpointed synthetic job/effect ledger

One frozen **S / C023** unit, with original parents **H005, P005** and accepted **C020** entry gate. The exact card acceptance is: “Deliver a checkpointed job/effect ledger fixture; verify resume and effect counts are inspectable.”

## Conduct without a server

Open `index.html` directly in a modern browser. No installation, backend, framework, cloud connection, credentials or subscription is needed.

1. Select an explicit synthetic job ID, `profile-effects/1`, C020 profile, and C020 source implementation. Create the job; inspect its three planned effect keys, business profile and immutable version stamps.
2. Select an effect and interrupt before commit, after commit, before checkpoint, after checkpoint, or with an unknown acknowledgment. Run. Compare **known committed applications** with **checkpoint records / next effect index**.
3. Select **None** and **Resume from checkpoint**. If an effect was committed after the last checkpoint, its known ledger entry suppresses another application. Original interrupted attempts, events and effect records stay intact.
4. An **unknown acknowledgment** blocks resume. “Still unknown” keeps it blocked. The other reconciliation choices are **hypothetical synthetic observations**, not external queries or receipts. An observed-committed choice records one synthetic reconciliation pair; an observed-absent choice records no commit and permits a modeled retry. The original unknown attempt never becomes a successful attempt.
5. Copy/inspect a snapshot, or copy the complete session evidence JSON. Inspection is **read-only**, never adoption of an older state. Malformed/tampered input rejects explicitly without changing the active job.
6. **Archive and reset** retains the full job and rejected operations in the current page. It suggests a new job ID and rejects reusing a retained work identity. It is not resume. Reload/close clears this memory-only session: copy the JSON first.

Controls have explicit labels, native keyboard behavior, visible focus and live status/error announcements. Unknown counts are separate from known committed counts. A rejected operation replaces any stale success announcement. The CSP forbids inline scripts, connections, frames, objects and workers.
Editing candidate JSON also invalidates its previous inspection result without deleting the original observation. The actual browser regression RED and its original page/runner source snapshots are retained in `evidence\refinement-red.json`.

## Exactly what is modeled

The fixture **assumes an atomic pair of one local synthetic effect application record and its deduplication ledger entry**. Checkpoints are separate, later events. A deterministic cut after the pair but before a checkpoint leaves a known ledger entry; resume replays from the checkpoint and suppresses that known effect. The after-commit cut is before acknowledgment; the before-checkpoint cut is after acknowledgment. Both retain the same known local commit.

This is a **pure event-log model**, not an actual process crash, transactional storage implementation, queue consumer, or external business operation. One returned frozen snapshot represents the chosen cut. There is no Storage, Queue, DB, durable flush, external effect implementation, crash-safe transport, native proof, or exactly-once cloud guarantee. An external effect outside an atomic boundary could be ambiguous or duplicated; this model does not solve that problem. Unknown effects are **not counted as known committed**; known counts are a lower bound while ambiguity remains. Reconciliation assumptions remain explicitly visible in the journal and application provenance.

Deduplication belongs to **one retained job state**, not multiple browsers, newly created states, or a global database. Work keys include job ID, work version, profile ID and effect kind; compatible C020 implementation labels do not invent new business effect identities. There are exactly three effects and at most 64 commands. Hitting a bound rejects rather than truncating history.

## Reuse and immutable isolation

`ledger.js` imports `..\C020\contract.js` in Node, and the HTML loads that same unchanged file before the model. There is **no second profile catalog**. Tests compare model lineage to the actual `getProfileV1` and `getProfileV2` functions in `..\C020\profiles.cjs`, for both source profiles.

The source authority is C020 commit `2dc471daab3ffa202d83aba2df443e280cad3656`, tag `kanban/C020/2dc471daab3f`; `manifest.json` pins the unchanged source hashes. Its stamps remain **local fixture labels**, not cloud deployments. Browser use is the bundled immutable catalog, **not a new getProfile HTTP observation**.

`create(config)`, `apply(state, command)`, `inspect(state)` and `restore(snapshotJSON)` return detached, recursively frozen data. State inspection reconstructs every command/event, ledger entry, application, outcome and checkpoint from the immutable plan; an inconsistent projection cannot silently lose or duplicate a known committed effect on resume. The original snapshot is never modified. Strict own-data-field, finite JSON, dense-array, identity/version, lifecycle and resource-bound validation rejects invalid input without caller getters or coercive defaults.

Replay validation is **not authentication**: a coherently rewritten or wholly truncated history cannot be distinguished from an independently created synthetic history. There is no signature, trusted external receipt, identity service, or authorization boundary. For that reason the browser's snapshot inspector never replaces the live state with an imported snapshot.

Example Node test-tooling use:

```javascript
const fixture = require('.\\capability\\C023\\ledger.js');
let job = fixture.create({
  jobId: 'job-001', workVersion: 'profile-effects/1',
  profileId: 'synthetic-001', implementation: 'v1'
});
job = fixture.apply(job, { type: 'run', interruption: 'after-commit', effectIndex: 0 });
// One known effect, no checkpoint.
job = fixture.apply(job, { type: 'resume', interruption: 'none', effectIndex: null });
// Three modeled applications, one duplicate suppression; first attempt is still interrupted.
```

## Verification and retained proof

From the repository root:

```powershell
node --test capability\C023\tests\ledger.test.cjs capability\C023\tests\surface.test.cjs capability\C023\tests\integrity.test.cjs
node capability\C023\tests\syntax.cjs
node capability\C023\tests\browser.cjs
```

Ordinary commands do not overwrite/delete evidence. `tests\browser.cjs` uses only the existing `testing\browser\isolated.cjs` **`openIsolatedLesson`** API and awaits `close()` in `finally`. It uses the installed offline Playwright **1.56.1**, signed-installed Edge **156** pairing, sandbox enabled, no unsafe flags or foreground lease. Actual DOM, keyboard, reset, invalid-state, interruption/resume, unknown reconciliation and CSP checks are recorded, not simulated DOM assertions.
Final scoped discovery passed **113 tests** (103 model/surface + 10 artifact integrity); all **12 scripts** passed syntax and **23 actual browser checks** passed. Repeated verification earns no additional value.

Only deliberate **`CAPTURE_BROWSER_EVIDENCE=1`** writes the browser JSON/screenshots, with exclusive creation. Existing proof is never replaced. A later intentional refresh must use separately named evidence, not delete the original.

**Final browser authority:** `evidence\browser-acceptance-published-helper.json`, using the exact published helper commit `53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`. The runner checks that hash before importing the helper. Earlier browser files are retained **historical prototype-helper observations, not the final qualification**; no abandoned lifecycle/recovery prototype is shipped or claimed.

`evidence.json` links the ordered BDD → loadable stub → genuine behavioral RED → IaC N/A → implementation/refactor → focused GREEN/syntax/integrity → actual headless browser evidence. Historical RED snapshots end in `.snapshot.cjs`, outside automatic test discovery. Reproduce the original four **AssertionError** failures against the original loadable stub without changing current code:

```powershell
$env:C023_TEST_SUBJECT = '.\ledger.stub.cjs'
try { node --test capability\C023\evidence\red\ledger.behavior.snapshot.cjs }
finally { Remove-Item Env:\C023_TEST_SUBJECT }
```

Expected exit: **1**, four behavioral failures, no import/syntax failure. `tests\capture.cjs` is an explicit, exclusive-write capture utility, not an automatic test hook. Original stdout/stderr and source hashes are retained. Historical `stub-load` intentionally verified production/stub byte identity **before implementation**; it is not a current green-suite command.

The publisher correctly rejected assertion-renderer trailing spaces in two raw RED stdout files. Those original bytes are preserved losslessly as `.txt.gz`, with `evidence\raw-archive-map.json` mapping their unchanged historical record paths to verified compressed archives. No assertion whitespace or original execution record was edited. Owned `.gitattributes` preserves exact source/evidence bytes across checkout; it does not disable whitespace checks or the publisher. Final green/integrity/discovery records follow this packaging-only refinement; the actual browser's production sources are unchanged.

All observations use installed **Node 22.23.4 test tooling**. The approved production design is Node 24/Express on App Service Linux, but **Node 24 remains unvalidated**. IaC is **N/A**. No scaffold, Azure calls, registration, deployment or spending is included.

## Relevant To Do refinement — no additional credits

| Original scope | Usable contract / remaining readiness |
| --- | --- |
| C023, H005/P005 | This single local checkpoint/effect fixture is ready for independent review after its recorded tests/publication. No split or helper earns extra value. |
| C029/C030 | May consume this immutable local plan/journal to distinguish retries, committed applications, unknowns and original interrupted attempts. Their original entry gates and acceptance remain unchanged; this fixture does not implement their correctness oracle. |
| C048 | May inspect work/source versions and explicit incompatibility/reconciliation evidence; no live release admission policy is implemented here. |
| P005, C083, C088/C089 | Real data ownership, native message claim/renew/release/redelivery, fencing and durable effect/checkpoint association remain **To Do / not ready** without SAFE, native data adapters and separate operator approvals. This local model supplies no credentials, lease authority or native qualification. |
| H005 remaining tiers | Auth/session, database, cache, queue and worker deployment are not implemented by this unit. Original lineage and dependencies are preserved. |

AS IS educational demonstration; no Microsoft endorsement/support, SLA or native continuity certification is implied. See the project disclaimer.
