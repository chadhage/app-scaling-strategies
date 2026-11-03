# S020 - Quota or maximum-capacity exhaustion

**Training rehearsal - synthetic data - not a live Azure result**

Open [index.html](index.html) directly in a browser. No server, account, framework,
package installation, Azure access, or resource creation is needed.

## Exact scope and source

- Source: [README.md, S020](../../README.md#b-actual-capacity-scaling-strategies):
  “Preserve existing service using reserved capacity, block unsafe transitions,
  and report unsupported demand explicitly.”
- Parent: [D-S020](../../.docs/wiki/backlog.md#b-capacity-scaling), including its
  **Request unsafe expansion** control and harness-limit versus native-quota distinction.
- Card: A-S020, frozen Kano **S**, original unit A-S020, packet **SC-S020**, SOURCE gate,
  owner `worker-A-S020`, authorization `local-synthetic-only`.
- This checkout has no separate source `S020\README.md`; the exact authoritative
  S020 entry is the root README catalog row. No behavior was inferred from a title.
- The portable A-card contract applies. B-S020 and the complete source-demo parent
  remain unimplemented/unverified by this lesson.

## Worked exercise

Preconditions are declared synthetic fixtures: two protected reserved units, two
journeys per unit per window, and existing routing on `reserved-v1`.
Allocation does **not** establish sandbox readiness.

1. Use the default envelope: four total units including the reserve, one unsafe
   extra unit, and a 250 ms existing-journey budget. Apply configuration.
2. **Exhaust sandbox allowance**: four units are allocated, including two sandbox
   units. The two-unit reserve is unchanged.
3. **Request unsafe expansion**: five units are requested; allocation remains four.
   The rejection source is **Harness admission limit**, not a native Azure quota.
   One unsupported unit represents two unsupported new journeys per window.
4. **Request promotion**: the target is unallocated, so promotion is blocked.
   Four journeys/window corresponding to admitted sandbox capacity are also held
   off-route. Neither category is counted as successfully migrated demand.
5. **Probe reserved service**: four existing journeys at 100 synthetic ms each
   succeed. The safety verifier is PASS, user impact is reserved service preserved
   with expansion aborted before exposure, and cleanup is N/A/no resources.
   Native Azure quota remains **UNTESTED**.

Try **Over budget**: one of four HTTP-200 journeys takes budget + 1 ms and fails.
A later healthy probe cannot erase that failure. Try **Missing observations**:
two successes and two unknown outcomes produce UNKNOWN, not success. Later healthy
probes cannot replace earlier missing evidence. Known failure takes precedence over
unknown. Before the first probe, the verdict is UNKNOWN with zero observed journeys.

## Guards, keyboard, reset, and limits

- Whole integers only: allowance 3–6 total units, unsafe extra request 1–3 units,
  latency budget 100–500 ms. No strings, fractions, nonfinite values, extra fields,
  accessor configurations, forged run objects, or invalid observation conditions.
- Configuration locks after the first action. Enforced order: exhaust → unsafe
  expansion → promotion attempt → probes. Failed input/action validation does not
  mutate the run. Model states, samples, and traces are immutable.
- One exhaustion, one rejection, one blocked promotion, and at most three probes
  (12 existing-journey observations) per run. No timers or open-ended workloads.
- Use Tab/Shift+Tab, Enter/Space, and the native select arrow keys. The next valid
  control receives focus after each guided action. Errors are text-only live alerts
  with focus; archive/reset returns focus to the allowance input.
- **Archive and reset** retains the old result, trace, and samples, then starts a
  default UNKNOWN run. Maximum four archived runs; older pruning is counted.
  Empty resets do not archive. History is page-memory only and clears on refresh.
  The reset button never shadows `HTMLFormElement.reset`.
- CSP permits the two external local scripts and local CSS only; connections,
  inline script, eval, forms, images, frames, objects, workers, and base changes are
  blocked. There are no management calls, credentials, external assets, or storage.

## Focused verification and provenance

From the repository root, using the existing Node.js 22.23.4 test-tooling lane:

```powershell
node learning\S020\verify.cjs all
```

Stages can also be run individually: `green`, `syntax`, `browser`, `integrity`.
Ordinary verification hashes historical proof before/after and must not rewrite it.
Intentional new, append-only evidence capture requires:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S020\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

The browser suite uses only published `testing\browser\isolated.cjs`,
`openIsolatedLesson`, and awaited `finally` cleanup. Its required SHA256 is
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
(published at `53c0c0d`). It uses the already-installed offline Playwright 1.56.1
and Microsoft-signed Edge 156, with no downloads, unsafe flags, foreground lease,
or lifecycle prototype.

[evidence.json](evidence.json) indexes raw provenance. `evidence\red.json` records
the loaded stub's genuine numeric assertion failure (expected 4, actual 2).
The original stub/spec are preserved as `.txt`, not auto-discovered runnable tests.
The resource-free IaC N/A record follows RED. Green TAP, syntax results, browser
observations, cleanup, source hashes, and integrity checks are separately retained.
Owned Git attributes preserve exact source/proof bytes rather than normalizing
captured hashes at publication. Raw evidence is binary to Git's diff checker;
source whitespace is still checked, with CRLF recognized as a line ending.
Earlier failed browser probes and the pre-commit publication-gate failure remain
in the evidence index as historical diagnostics, not passing proof.

This proves only a deterministic local lesson on Node22 test tooling/Edge156.
It does not certify production Node24, native Azure quotas, candidate readiness,
source-parent completion, or five-nines reliability. Publication and parent-owned
empirical acceptance are separate gates; the worker cannot award Done credit.
No independent test, refinement, plumbing, or additional Kano unit is created.
