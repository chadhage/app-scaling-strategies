# S041 — Short request at admission cutover

**Training rehearsal - synthetic data - not a live Azure result**

A-S041 · parent D-S041 · satisfier S · packet SC-S041 · owner `worker-A-S041`.

Open `index.html` directly in a modern browser. No server, dependency installation,
account or cloud connection is needed. The bundle can also be mounted unchanged
under a later harness. `manifest.json` declares the portable lesson contract;
`cutover.feature` is the BDD specification.

## Worked exercise

The read-only receipt fixture has one synthetic user, one journey starting at
**0 ms**, an **original 180 ms journey budget**, and cart revision **7** / total
**4200 cents**. Its two requests intentionally overlap:

| Synthetic request | Original admission | Owner | Response at | Original request deadline |
| --- | ---: | --- | ---: | ---: |
| `r-before` | 10 ms | v1 | 100 ms | 130 ms |
| `r-after` | 60 ms | v2 | 140 ms | 180 ms |

Cutover is **40 ms** and v1 retirement is **110 ms**. Both original request
budgets are **120 ms**; both responses must also meet the original journey
deadline of **180 ms**. Correct status/body and unchanged cart state are required.

1. Inspect the safe result and ordered trace. The old request **stays on v1**
   and completes there after cutover. This is legitimate, not a failed migration.
2. Select **Premature retirement**. v1 stops at 70 ms, interrupting its active
   request; a claimed response at 100 ms is not accepted as a completion.
3. Predict **INTERRUPTED** and check it. A passing prediction does not change
   the interrupted impact.
4. Try **Retry clock reset**, **State lost**, and invalid/missing evidence.
   The reported 25 ms retry clock cannot replace 155 ms elapsed from the original
   admission or its 130 ms deadline.
5. Edit bounded timing controls or expand the JSON editor. A forged owner,
   impossible timestamp, missing completion or malformed input must not retain
   the previous successful result.
6. Activate **Reset rehearsal**, including by keyboard. It restores the exact
   safe fixture, budgets, editor, prediction and trace using a normal button
   handler, not a native form reset.

A new v2 admission demonstrates only **synthetic request-level exposure**.
Neither it nor an old v1 completion proves a user moved. Actual user migration is
always **unknown**, proven moved users is **0**, and no migration-success
percentage is calculated.

## Deterministic rules

- Admission before cutover belongs to v1; admission **at** cutover belongs to v2.
- Completion exactly at an original deadline is on budget. At equal completion
  and retirement timestamps, completion is processed first.
- Incorrect response, changed state, original-budget breach or known termination
  is **interrupted**. Missing/invalid proof is **unknown**. Both remain in the
  attempted-request denominator. Partial missing proof cannot erase a known
  violation: an evidenced budget breach still interrupts even if state is
  unknown; the missing check remains explicitly unknown.
- The retirement result is a **conservative continuity gate for the declared
  v1 requests**, not a claim about a real host's drain mechanism. Interrupted
  old work blocks; unknown old work holds; correctly completed old work allows.
  An uncertain v2 response does not itself prevent retiring an already-drained v1.
- Edited fixtures are assumptions, not measured evidence. Work schedule,
  response identity, original admission and observed timestamps must agree.
  Controls regenerate synthetic fixtures; applying them replaces JSON edits.
- Inputs are bounded to 8 requests, integer clocks from 0 to 10,000 ms and
  original budgets/work from 1 to 2,000 ms. Strings, booleans, null, fractional
  and non-finite times are not silently converted.

## Engineering checks

Using the existing **Node.js 22.23.4 test tool only**:

```powershell
node --test --test-reporter=tap .\learning\S041\tests\cutover.test.cjs .\learning\S041\tests\surface.test.cjs
node --check .\learning\S041\cutover.js
node --check .\learning\S041\fixtures.js
node --check .\learning\S041\app.js
```

`evidence/red.txt` records the real pre-implementation run: a loadable stub,
9 behavioral assertion failures, 1 passing fixture/purity check, exit 1.
`evidence/red-stub.js.txt` preserves that exact stub; it is not loaded by the UI.
`evidence/green.txt` and `evidence/syntax.txt` hold actual focused check output.
`evidence/partial-proof-red.txt` records three additional genuine regression
assertions before fixing known-failure/partial-uncertainty precedence.
The red logs' readable copies remove only trailing spaces from Node assertion
diffs for Git whitespace checks. Matching `*.raw.txt.gz` files retain verbatim
output; `evidence/log-normalization.json` records both hashes and the exact rule.
`evidence/content-hashes.json` binds the scope using LF-normalized text hashes
and unchanged binary hashes, with working-copy hashes recorded separately.
`evidence/browser.json` records actual browser observations on the worker's own
isolated page, not a Node DOM simulation. `evidence.json` binds those references,
limits and review/publication ownership.

## Safety and scope

All traffic, clocks, responses, state and users are synthetic. Actual HTTP
correctness, routing, latency, state preservation and migration remain unknown.
This fixture does not test writes, duplicate effects, retries on a real host,
Azure drain guarantees or production reliability.

Scripts and styles are local; CSP forbids connections, forms, images, frames,
objects and workers. Untrusted evidence is rendered as text. No network API,
credentials, persistent storage, resources, real-time clock or management call is
used. Cleanup is in-memory only.

IaC is **N/A**, explicitly recorded after genuine red and before implementation.
No package/global-runtime changes, cloud/IaC generation, deployment, expenditure
or production runtime approval occurred. B-S041 and D-S041 native acceptance
remain separate. Parent-owned empirical acceptance, not this worker, awards the
single A-S041 Kano credit.
