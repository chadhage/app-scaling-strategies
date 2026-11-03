# S016 — Autoscale oscillation

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, installation,
credentials, live load generator, management API or cloud resources are needed.

## Contract and worked exercise

A-S016 / D-S016 / canonical README S016 / SC-S016. One original frozen **S**
unit, `kanoUnit: A-S016`; SOURCE entry gate. The precise source strategy is:
**Apply suitable stabilization so repeated scale-out/scale-in does not repeatedly
interrupt users.** This is an oscillation comparison, not a native autoscale
configuration or evidence that arbitrary waiting guarantees safe scale-in.

Both lanes initially have two ready instances, each serving 100 synthetic
requests/second. Target = ceiling(demand / 100), bounded to 1–4. A scale-out
request takes one further observed window to become ready. Four fixed clients
per lane/window are sampled; offered demand is not the sample count.

1. Keep high 180, low 60, down-stabilization 2, cooldown 2 and budget 250 ms.
   Advance a shared window or run the remaining ten-window trace.
2. The immediate lane follows H,L,H,L,H,L,H,L,H,L without stabilization.
   It makes nine scale requests, nine effective changes, eight direction
   reversals and five unsafe removals. Twenty-one of forty sampled journeys
   are interrupted by lost continuations or warm-up queuing.
3. The stabilized lane retains two ready instances. All forty sampled journeys
   succeed at 80 ms. A completed exercise PASS describes that comparison,
   **not** uninterrupted users in the intentionally failing immediate lane.
4. Archive/reset. Choose the rebound trace H,L,H,L,L,L,H,H,H,H and cooldown 4.
   A settled scale-in is safe, but cooldown delays needed replacement capacity:
   twelve stabilized samples exceed the original budget. The final window
   recovers; the cumulative verifier still FAILs. Fewer changes do not excuse
   interrupted users.
5. Reset and use rebound with stabilization 4. The short trough no longer
   removes capacity, demonstrating a suitable policy for this declared trace.
6. Try high demand 360 to observe requested-versus-ready capacity and warm-up
   overload. Inject failed readiness while a pending request is due. Try a
   missing client, unknown capacity, or HTTP 200 with incorrect business state.
   Earlier failures and unknowns remain after later complete observations.

Each window is one synthetic time unit, not an Azure timer. Down-stabilization
requires consecutive low windows. Cooldown starts at the last scale request and
holds changes in either direction until the interval elapses. No new request
supersedes a pending scale-out. A removed instance carries one unfinished
continuation when the previous demand exceeds the remaining capacity; a sustained
low window lets that teaching continuation finish.

Queue = max(0, demand − ready × 100). Latency = 80 +
ceiling(queue / (ready × 100) × 1000) ms. Equality with the original budget passes.
Missing clients or effective capacity produce null/UNKNOWN, never zero or
success. HTTP 200 is not business correctness. PASS needs all ten windows,
strictly fewer scale requests and unsafe removals, no stabilized interruption or
readiness failure, and complete observations in both lanes. Known stabilized
failure takes precedence without deleting unknown counts. Healthy clients with
no demonstrated improvement are `NOT_DEMONSTRATED`.

Inputs are strict bounded whole numbers. Unknown commands, extra fields,
unsupported observations and configuration changes after the first window are
rejected and retained. State is validated against deterministic event replay
before every command/summary; forged history or capacity cannot create a result.

Use Tab, Enter and Space. Reset calls native `form.reset()` with no shadowing
control, restores defaults and archives the complete previous state, including
failures, unknowns, rejected commands and caught UI errors. Storage is **page
memory only**; copy the selectable JSON before reload/close. At forty commands
per run or six archived runs, the application fails closed rather than deleting
evidence. Reset recovers a caught application failure; archive exhaustion requires
copying retained evidence and reloading. The strict local CSP disallows inline
execution, external connections, forms, frames, objects and workers.

## Verification and provenance

From the repository root using the existing **Node.js 22.23.4 test tooling**:

```powershell
node learning\S016\verify.cjs all
```

Individual stages are `green`, `syntax`, `browser` and `integrity`. Ordinary
verification checks that saved evidence and publication metadata are
byte-identical afterward. An intentional refresh explicitly appends numbered
records without overwriting earlier proof:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S016\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a loadable no-op stub and **42 actual assertion failures / one pass
in 43 tests**. Before implementation, an inconsistent excessive-cooldown example
was corrected: five windows cannot both interrupt sixteen samples and recover
inside ten windows; four windows interrupts twelve samples and permits final
readiness. Both genuine RED runs are preserved, including the original mistaken
expectation. The refined suite is unchanged for GREEN. Saved stub/tests/raw TAP
use `.txt` snapshots, which `node --test` does not auto-discover.
`evidence\iac-2-na.json` reconfirms resource-free IaC N/A after the refined RED and
before implementation.

The unchanged **43 behavioral tests**, **13 integrity tests** and **six executable
syntax checks** pass. Actual Edge **156.0.4314.50** passes **18 browser leaf
scenarios** (19 Node test results including their wrapper). The first complete
focused capture passed every stage; the earlier genuine RED remains intact.

Real browser checks use only the published
`testing\browser\isolated.cjs` (`53c0c0d`), SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
calling `openIsolatedLesson` with awaited `close()` in `finally`. They require
the already-installed offline Playwright **1.56.1** and Authenticode-valid
Microsoft-signed **Edge 156**. No downloads, installs, unsafe browser flags,
TLS weakening, shared foreground lease or abandoned lifecycle prototype is used.
The suite asserts actual DOM, keyboard, strict input/state, client/capacity
failure, unknown-data, reset/archive, error recovery, narrow layout and enforced
CSP behavior. Deliberately injected errors and blocked CSP attempts are identified
as test actions, not live incidents. See `evidence.json` and numbered raw records.
Every browser close was awaited, with no page errors or completed external
requests. `result.json` is ignored local publication/report metadata because
the containing commit cannot embed its own final hash; the authorized state
helper persists the actual report for parent review.

## To Do refinement — no extra completion credit

- Parent empirical review and acceptance of the single original A-S016 unit
  remain required. The worker does not self-Accept.
- **B-S016** remains unadmitted native inventory, gated by **CORE, DATA, ASANY,
  C065, C066**, a qualified host/SKU/region and separate native authorization.
  Observe actual stabilization/rule behavior, effective capacity, reversals and
  cumulative client impact within the original budgets.
- **D-S016** retains **D-S011, D-S015** and its original shared/source-parent
  acceptance gates. This lesson does not fulfill the real native comparison.
- Production Node.js 24 validation, native reliability/statistical proof and
  source-parent completion remain unclaimed. No follow-on card is admitted.
  Tests, evidence, tooling and refinement earn no additional units.

## Microsoft Open Source Disclaimer

Educational examples and guidance are provided “AS IS”, without warranties or
guarantees except where required by applicable law or binding terms. Validate
security, reliability, compatibility and cost before production use. Microsoft
and Azure references imply no endorsement, sponsorship, certification or support.
Project goals are not Microsoft SLAs. Microsoft and Azure are trademarks of the
Microsoft group of companies. This disclaimer grants no license or redistribution
rights and changes no applicable license, product term, support agreement or
published SLA. See the repository README's full disclaimer.
