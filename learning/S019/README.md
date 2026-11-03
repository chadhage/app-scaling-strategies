# S019 — Cell-based expansion

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, account, installation or network service is required.

## Exact source and scope

- README S019: **Cell-based expansion:** Add an isolated application cell and migrate selected tenants through controlled state and routing handoff.
- D-S019: **Create cell and move tenant**, using isolated capacity and synchronized/fenced state handoff. Routing and ownership must transfer without missing writes; existing cells remain usable; additional capacity must be real in the eventual native demonstration.
- A-S019: Add a cell and move a tenant; reject routing before synchronized exclusive ownership. One frozen **S** unit, packet **SC-S019**, gate **SOURCE**.

This lesson works through that precise strategy with deterministic synthetic capacity and actual in-memory write journals. It does **not** make real cloud capacity. B-S019 remains unimplemented and gated by CORE, DATA, HOST and FENCE. Original parent prerequisites D-S005 and D-S064, native qualification, parent acceptance and five-nines reliability remain unfulfilled. Node 22.23.4 is test tooling only; production Node 24 is not certified.

## Exercise

1. Select alpha or beta before the first action. A initially owns both at epoch 1. Alpha has acknowledged writes `[1, 2]`, beta `[1]`.
2. Try routing early. The guard blocks it without changing either tenant's route or data.
3. Create isolated B: workers B-1/B-2 and an empty per-tenant store add 100 synthetic rps to A's 100. Copying state or changing a route adds no capacity.
4. Synchronize the selected tenant. Commit a source write, then attempt ownership transfer. The stale snapshot blocks transfer; resynchronize.
5. Fence A and assign exclusive B epoch-2 ownership, then route only the selected tenant. These controls are deliberately separate: running a journey in the gap returns HTTP 409 instead of pretending continuity.
6. Exercise the old epoch-1 writer. Its attempted write is rejected, with no acknowledged write added. Run both tenant journeys: the selected tenant reads/appends in B, while the unaffected tenant remains usable in A. Inspect the contiguous write journals.
7. After routing, choose B's wrong-state/HTTP-200, unready/HTTP-503, or unknown observation and run journeys again. Recovery cannot erase the earlier failure or unknown.
8. Archive and reset. The fresh run is unknown; inspect prior full traces and journey ledgers. Everything is page-memory-only.

All controls are labeled and keyboard-operable. Blocked operational gates appear in the action trace; malformed inputs and exhausted bounds produce a focused alert without mutating state. Reset uses a separate button that does not shadow native `form.reset()`.

## Outcome and bounds

Success needs a current healthy, synchronized exclusive handoff, both tenant journeys succeeding after routing, an observed old-writer rejection, and no earlier failure or unknown. Before that, including zero samples or source-only success, the result is **unknown**. A measured user failure dominates later recovery; missing observations remain unknown. Guard rejection itself is not a user interruption.

The state machine is immutable and has no clocks, randomness, I/O or persistence. It allows two cells, two tenants, 48 actions, eight two-tenant journey batches and 14 acknowledged writes per tenant per run. At most four complete archived runs are retained, with explicit eviction counts. Run IDs are bounded to 1–9999. Reload clears history. Copy/ownership fencing is a single deterministic local model, not a distributed-consensus implementation or native platform guarantee.

## Verification and provenance

From the repository root, using the existing approved Node 22 tooling:

```powershell
node learning\S019\verify.cjs all
```

The runner covers focused model tests, executable syntax, actual isolated DOM/keyboard/error/reset/failure/CSP checks, and evidence integrity. **Normal verification is read-only to historical proof**, even when a check fails. For a deliberate append-only capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S019\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Existing offline Playwright **1.56.1**, signed installed **Edge 156**, and published `testing\browser\isolated.cjs` SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`) are the only browser lane. The test uses `openIsolatedLesson` and awaited `finally` close. No integrated-browser foreground lease, download, unsafe flag or abandoned lifecycle prototype is used. The shared helper's documented unattended lifecycle limitation remains; this lesson does not qualify the helper as a general CI runner.

`evidence\source-contract.json` preserves exact source rows and provenance. The BDD and loadable stub preceded a genuine `ERR_ASSERTION` RED (`false !== true`), not a missing module/tool. Raw RED and non-auto-discovered `.txt` snapshots are retained unchanged; subsequent resource-free IaC N/A is explicit. Numbered capture records retain exact source and raw-log hashes, including unsuccessful runs. Browser observation records preserve actual DOM, outcomes, tooling, CSP violations and awaited cleanup.

The first authorized publication stopped before commit because Git treated Windows CRLF as trailing whitespace in exact-byte (`-text`) files. `evidence\publication-preflight-1.json` and its raw scoped-check replay retain that failure. The owned `.gitattributes` now recognizes CR at EOL while explicitly retaining the normal source whitespace checks. Only raw TAP/diagnostic output is exempt, because its original formatting is evidence. No source/snapshot bytes are normalized and no shared Git configuration is changed. Earlier evidence remains unchanged.

No Azure calls, IaC, identity, deployments, expenditure, new dependencies or framework work is included. Parent acceptance is separate from worker verification; repeated runs earn no additional units.

## Relevant remainder

No extra A-S019 test/plumbing/refinement unit is proposed. Only parent-owned empirical acceptance remains for this submitted lesson. The native B-S019/source-parent remainder is genuinely unready: approved target and SAFE/CORE/DATA/HOST/FENCE qualification, original prerequisites and separate cloud/IaC/identity/deployment/spend approvals are still required.

Microsoft Open Source Disclaimer: provided as-is without warranties; synthetic outcomes are not service guarantees. The repository's source acceptance policy and disclaimer remain authoritative.
