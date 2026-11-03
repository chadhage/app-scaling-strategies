# S054 — Database expand-migrate-contract

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No installation, server, account,
authentication, credentials or subscription is needed.

## Exact source and scope

- [README S054](../../README.md#f-n-tier-and-version-compatibility):
  “Add compatible structures, migrate safely, and remove old structures only after
  old consumers disappear.”
- [D-S054](../../.docs/wiki/backlog.md#f-n-tier-and-version-compatibility):
  “Old/new consumers remain valid during overlap; contraction is blocked until
  dependent consumers/work disappear.”
- [A-S054 and portable contract](../../.docs/wiki/kanban.md):
  sequence expand, migrate, contract; reject contraction with old consumers.
- Frozen **S**, one `A-S054` Kano unit, packet `SC-S054`, owner `worker-A-S054`.
  Exact raw source excerpts, default packet rule, claim and canonical baseline
  hashes are retained in `evidence/source-contract.json`.

This is the resource-free portable slice only. **B-S054, D-S054, real database
migration and original native acceptance remain unfulfilled.** Tests, evidence,
plumbing and refinement earn no additional units. No additional To Do work is
admitted; native/IaC work is intentionally excluded.

## Conduct the worked exercise

Four fixed read-only records have `legacyLabel`. Old readers require it. Two new
bridge readers prefer `modernLabel`, with a legacy fallback during expansion.
No concurrent writes, transactions, locks, SQL or database exist in this model.

1. Keep the defaults: faithful copy, complete observations, two old consumers and
   one independent old work item. **Start** locks these assumptions.
2. **Expand** adds a nullable field without removing the old one. All eight
   old/new record reads pass through their declared contracts.
3. **Migrate** copies four values. Eight correct overlap reads are evidence in
   this synthetic model, not a completed migration.
4. **Request contraction**. It is blocked; the old structure stays available.
5. **Upgrade old consumers**, request contraction again, and observe that the
   old work item still blocks removal.
6. **Finish old work**, then contract. Only now is the old structure removed,
   with all four surviving new-reader reads correct.

Try zero old consumers with two old work items to isolate the work gate. Contract
before migration to see a sequencing abort. A safe abort retains usable old data
but is **not** reported as completed migration.

In another retained attempt, choose **corrupt first new value**. Copying all four
rows still produces seven passes and one failed new-reader journey; user impact
is `INTERRUPTED`. A later blocked action cannot erase that failure.

With **first record only**, faithful data has two observed passes and six unknown
reads. With **none**, even a configured corrupt fixture has zero observed failures:
all eight reads are unknown. Missing evidence cannot pass contraction. A known
failure dominates partial uncertainty.

## Guards, keyboard and reset

Only listed fixture choices and whole-number counts in the displayed ranges are
accepted. Empty numeric fields are not zero. Choices lock at start; later DOM
control edits cannot alter the issued immutable model. Unsafe contraction is a
recorded blocked decision; invalid lifecycle operations are errors without
state mutation.

Use Tab, Enter and Space. Controls have labels, visible keyboard focus, a live
result region and focused actionable errors. Each retained history row has a
keyboard-operable **inspect retained trace** disclosure.

Six attempts and twelve events per attempt are hard limits; nothing is evicted.
**New attempt** clears only current measurements and restores defaults while
retaining prior assumptions, events and outcomes. **Reset everything** restores
defaults, clears all history, limits, results, errors and invalid markers, and
focuses the migration selector. Reload also clears memory. No control shadows
the native form `reset` method.

Enforced CSP allows only local scripts/styles and blocks inline scripts, outbound
connections, frames, objects, workers and form submissions. No storage, telemetry,
network calls, real authentication or registration is used.

## Verification

From the repository root in PowerShell, ordinary verification is **read-only to
saved evidence**:

```powershell
node --test .\learning\S054\tests\model.test.cjs .\learning\S054\tests\surface.test.cjs .\learning\S054\tests\integrity.test.cjs
node --test .\learning\S054\tests\browser.test.cjs
node --check .\learning\S054\model.js
node --check .\learning\S054\lesson.js
```

The browser test uses only published `testing\browser\isolated.cjs` at
`53c0c0d`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, and awaited `close()` in `finally`. Existing offline
Playwright 1.56.1, signed Edge 156 and Node 22.23.4 are test tooling, not production
Node.js 24, native Azure or unattended browser lifecycle certification. The
abandoned lifecycle prototype is not used. No installs/downloads or unsafe flags.

Browser proof is written **only** by a deliberate capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
$env:BROWSER_EVIDENCE_RUN = '001'
node .\learning\S054\tests\capture.cjs browser browser-001
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
Remove-Item Env:\BROWSER_EVIDENCE_RUN
```

Capture files are append-only; use a new three-digit run identifier for a new
deliberate observation. `tests\capture.cjs` is an explicit evidence-generation
utility, not a test or a normal verification entry point.

## Provenance and acceptance boundary

Order: exact source read/capture → BDD → loadable no-op stub → qualified
behavioral RED → explicit IaC N/A → implementation/refactoring → focused green,
syntax/integrity and actual DOM/keyboard/error/failure/reset/CSP checks.

- `evidence/red-002/` is the qualified **25 assertion failures, one API-load pass**
  against the loadable stub, before implementation. Raw stdout/stderr are gzip
  containers of exact bytes; `.snapshot` files are binary, non-auto-discovered
  original BDD, fixture, stub and test sources.
- `evidence/red/` preserves the earlier diagnostic: 24 assertion failures and one
  missing test-precondition TypeError. It is **not** the qualified RED. Source
  capture heading/PowerShell preflight corrections are not behavioral RED.
- `evidence/iac-decision.json` records resource-free **N/A** after qualified RED
  and before behavior implementation.
- `evidence/browser-001.json` records actual isolated browser observations and
  awaited cleanup; `evidence/verification/` retains raw focused run streams.
- `evidence/source-integrity.json` binds active sources using canonical LF Git
  bytes, not an assumption that all Windows working copies use identical EOLs.
  Raw CRLF source excerpts and RED snapshots remain byte-for-byte binary.

The precise source acceptance is exercised through additive old/new overlap
reads and independent consumer/work contraction gates. This proves only the
bounded portable model, not a real database, data-migration safety, concurrent
write correctness, native/source-parent completion, availability or five-nines.
Publication and parent-owned empirical acceptance are separate; the worker does
not award its own Done credit.
