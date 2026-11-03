# S066 — Reconcile a lost commit acknowledgement

**Training rehearsal - synthetic data - not a live Azure result**

A-S066 · D-S066 · frozen S · SC-S066 · `worker-A-S066`.
Open `index.html` directly in a modern browser. No server, account, database,
authentication, registration, credentials, framework or subscription.
`manifest.json` declares the portable lesson contract.

## Exact source and worked exercise

README S066 requires: **Database failover during commit: Reconcile uncertain
outcomes without applying a transaction twice.** D-S066 requires: **Retries do
not duplicate effects; committed, failed, and unresolved outcomes are attributed
honestly.** This A card supplies a deterministic synthetic rehearsal, not the
actual transaction/failover/effect-count proof required by B-S066.

Three fixed operations, SYN-661, SYN-662 and SYN-663, each intend one effect.
They have fixed original operation keys and fixed payloads.

1. Keep the defaults: **Lookup unavailable**, **Reconcile then same-key retry**.
   **Begin three commits**, then **Fail over during commit**. All three commit
   acknowledgements are lost. Original outcomes are now **0 committed,
   0 failed, 3 unresolved**. A timeout does not prove a transaction aborted.
2. **Reconcile receipts**. SYN-661 has an authoritative durable commit receipt
   (one original effect); SYN-662 has a terminal abort receipt (zero original
   effects); SYN-663 has unavailable evidence (zero **or** one original effect).
   Original attribution is **1 committed / 1 failed / 1 unresolved**.
   Missing or unavailable lookup evidence is **not** a terminal abort.
3. **Apply recovery and measure**. The safe policy reuses SYN-661's receipt,
   retries only confirmed-aborted SYN-662 once under its original operation key
   and unchanged payload, and holds unresolved SYN-663. Recovered outcomes are
   **2 committed / 0 failed / 1 unresolved**, effect bounds **2..3**, duplicate
   count **0**, and gate **UNKNOWN**. No duplicate is not enough to prove that
   every intended effect happened.
4. Predict **UNKNOWN**, then **Check prediction**. The learning verifier passes,
   but the original failure, unresolved outcome, and **three interrupted commit
   responses** remain. Recovery success is not uninterrupted user migration.
5. **New attempt · retain history**. Choose the unsafe fresh-key policy.
   It adds an effect for every operation: SYN-661 now has two known effects;
   SYN-663 has one or two. Effects are **4..5**, duplicates **1..2**, recovered
   attribution **1 / 1 / 1**, gate **FAIL**. A known failure dominates uncertainty.
6. On another attempt, supply authoritative committed or terminal-abort evidence
   for SYN-663 and use the safe policy. All three recovered effects are known
   exactly once: **3 / 0 / 0**, effects **3**, duplicates **0**, gate **PASS**.
   The original aborts and all three interrupted responses are still retained.
7. **Inspect attempt N** opens its complete original evidence, recovery rows,
   trace, configuration and learning prediction. Six completed attempts are a
   hard cap, not a silently evicting queue. **Reset rehearsal and history**
   explicitly clears all local proof and restores defaults and keyboard focus.

### Complete bounded result matrix

Each cell's C/F/U describes **recovered effect outcomes**, not the original
commit attempt and not uninterrupted user journeys.

| Later SYN-663 evidence | Policy | Recovered C/F/U | Effects | Duplicates | Gate |
| --- | --- | --- | --- | --- | --- |
| Unavailable | Same key, hold unresolved | 2/0/1 | 2..3 | 0 | UNKNOWN |
| Committed | Same key | 3/0/0 | 3 | 0 | PASS |
| Terminal abort | Same key | 3/0/0 | 3 | 0 | PASS |
| Unavailable | Hold all | 1/1/1 | 1..2 | 0 | FAIL |
| Committed | Hold all | 2/1/0 | 2 | 0 | FAIL |
| Terminal abort | Hold all | 1/2/0 | 1 | 0 | FAIL |
| Unavailable | Blind fresh keys | 1/1/1 | 4..5 | 1..2 | FAIL |
| Committed | Blind fresh keys | 1/2/0 | 5 | 2 | FAIL |
| Terminal abort | Blind fresh keys | 2/1/0 | 4 | 1 | FAIL |

Original attribution is respectively **1/1/1**, **2/1/0**, or **1/2/0** for
unavailable, committed, or terminal-abort evidence. It is never rewritten by
recovery. Recovered “committed” means one known effect; “failed” means a known
missing or duplicated intended effect; “unresolved” means the count is uncertain.
The inventory always includes all three attempted operations.

## Assumptions and limits

- An authoritative receipt covers the original commit attempt. A terminal abort
  guarantees that attempt cannot later commit. A confirmed-abort retry with the
  same original operation key and unchanged payload produces exactly one effect
  and a receipt in an **assumed synthetic durable deduplication ledger**.
  Authority, durability, atomicity and retry completion are supplied fixtures,
  **not** an implementation, protocol recommendation for every database, or
  measured database guarantees. No absence-of-record inference is used.
- Nine configurations: three later-evidence choices × three policies. Three
  operations per attempt, at most one retry per operation, six retained attempts.
  No arbitrary keys, payloads, endpoints, clocks, randomness, persistence,
  concurrency, background work or external effects.
- Only idle → committing → uncertain → reconciled → complete is valid.
  Assumptions lock at begin. Skips, repeats, extra arguments, invalid/duplicate
  predictions and history overflow reject without model mutation.
- Configuration accepts exactly two own enumerable **data** properties on a
  plain/null-prototype object with exact primitive string enums. Extra,
  inherited, symbol, accessor and coercible inputs are rejected without invoking
  getters. Snapshots are detached and deeply frozen, including retained proof.
- Native selects/buttons, skip link, focus progression, visible keyboard focus,
  accessible error alerts, invalid-field associations and scrollable tables.
  Reset from every phase clears errors, proof, predictions, locks and history.
  No control is named/id `reset`; both native `form.reset` methods remain usable.
- Text-node rendering and enforced CSP deny inline scripts, connections, frames,
  workers, objects and form submissions. Only owned external scripts/styles.
- No actual database commit, transaction, deduplication, replication or failover
  proof; no Azure management access or calls, identity work, IaC, deployment,
  spending, production Node.js 24 certification, platform guarantee, five-nines
  or completed D-S066/source-parent claim. B-S066 remains separate and unfulfilled.
  Reset/reload clears this in-memory model, not an external resource.

## Verification

Use the existing Node.js **22.23.4** test tooling:

```powershell
node --test --test-reporter=tap .\learning\S066\tests\model.test.cjs .\learning\S066\tests\surface.test.cjs .\learning\S066\tests\integrity.test.cjs .\learning\S066\tests\browser.test.cjs
node --check .\learning\S066\fixtures.js
node --check .\learning\S066\model.js
node --check .\learning\S066\app.js
```

Normal verification is **read-only to proof**. It runs the current model, exact
source/integrity checks, actual DOM and keyboard interaction, invalid input and
state errors, unknown/failed/successful recovery, retained proof and capacity,
all-phase reset, narrow viewport and real CSP probes. It never refreshes proof.
Deliberate browser capture alone uses:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node --test --test-reporter=tap .\learning\S066\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture refuses to overwrite earlier proof. Preserve prior evidence explicitly
before an intentional recapture. Failed captures remain separately labeled.
`tests\capture.cjs` is an explicitly invoked provenance recorder, not an
auto-discovered test or part of normal verification.

The browser test uses **only** published `testing\browser\isolated.cjs`
(`53c0c0d`), SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
with `openIsolatedLesson` and awaited `close()` in `finally`. Existing offline
Playwright **1.56.1** and Microsoft-signed Edge **156** only: no downloads,
packages, unsafe flags, foreground lease, shared profile/browser, or abandoned
lifecycle prototype. No unattended-runner certification is claimed.

## Provenance and one-unit handoff

- Exact README S066, D-S066, A/B rows, atomic/portable contract, default SC-S066
  packet rule and evidence policy were read before behavior design.
  `evidence\source-contract.json` binds those slices to a declared Git baseline.
  Raw working-source snapshots preserve **CRLF bytes**; committed Git blobs are
  retained separately. Exact acceptance must still match; concurrent board-only
  accepted-count/link edits need not match a whole-file historical snapshot.
- `commit-outcomes.feature` → loadable stub → genuine behavioral RED:
  **15 tests, 1 pass, 14 assertion failures**, exit 1, no missing code/tools.
  Original BDD, fixtures, stub and tests remain non-auto-discovered `.snapshot`
  files. Raw stdout/stderr are retained as gzip with hashes.
- `evidence\iac-decision.json` records resource-free **N/A after RED and before
  behavior implementation**. Focused model green, actual browser capture,
  syntax, sealed canonical-source integrity and normal read-only verification
  have separate evidence records.
- Narrow owned `.gitattributes` use `-text -diff` for raw CRLF snapshots, gzip and
  screenshots. An initial publication guard stopped before commit/tag/push
  because `-text` alone left preserved CRLF snapshots subject to text whitespace
  checks. The actual scoped diagnostic and prior seal are retained under
  `evidence\raw\publication`. Only raw-diff metadata was corrected; no source or
  raw evidence was normalized. The resealed source passes canonical Git-filter,
  binary-diff, syntax and read-only focused checks. This was not behavioral RED
  and earns no extra unit.
- One frozen S unit only. No extra test, plumbing or refinement credit.
  Publication is limited to `learning\S066` via authorized `publish.ps1`,
  `[A-S066][S]` evidence labeling, Copilot coauthor, an annotated
  `kanban/A-S066/<12sha>` tag, atomic main/tag push and remote verification.
  Parent alone reviews and Accepts once; this worker never claims Done.
- The native remainder requires B-S066's CORE, DATA, HOST and REPLICA gates and
  actual commit/failover reconciliation and effect-count evidence. None is made
  ready by this model; there is no new scaffold/test unit to pull.

The [source Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer)
applies. This is training, not a Microsoft SLA, product endorsement or support
commitment.
