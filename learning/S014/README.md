# A-S014 — scheduled scaling before known demand

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, framework,
dependency installation, management access, or network connection is needed.
The portable HTML/JS bundle may later be mounted through C041; it does not
implement or qualify that host.

## Exact source and scope

- README.md **S014:** scheduled or predictive scaling; provision and warm
  capacity before a known demand spike.
- Backlog **D-S014:** “Schedule demand spike” and pre-provision/warm through
  supported schedule-based scaling; observe native schedule and client outcomes
  instead of inferring them from the calendar. Original prerequisite: **P001**.
- Portable **A-S014:** schedule demand and prewarm capacity; identify late
  provisioning despite a correct calendar entry. Technical gate: **SOURCE**.

This lesson chooses the **scheduled** alternative, using a declared deterministic
synthetic schedule fixture, not a purported native host. It is one frozen
**S** satisfier, original `kanoUnit=A-S014`, packet `SC-S014`. It adds no forecast
service and borrows no native proof. B-S014 and the original source parent remain
separate and incomplete.

## Conduct and measure

Defaults: known demand of 120 requests/s starts at logical second 30 and lasts
20 seconds. Two units are already ready. Each ready, traffic-eligible unit has
declared effective capacity of **40 requests/s**. Request four units with
20 seconds of lead, 8 seconds of provisioning, and 7 seconds of warming.

1. **Schedule demand spike.** The calendar requests four units, but only two
   deployed/ready units are observed. A calendar is not a capacity measurement.
2. **Advance 5 logical seconds** repeatedly. Events between button presses are
   recorded at their exact logical timestamp, including the deployment at 18.
3. Before the full window ends, **Check outcome** records an incomplete
   assessment, not an empty-sample success.
4. Observe through second 50, then check again. Earlier assessments remain.

| Logical time | Observed event | Deployed | Ready / eligible |
| --- | --- | --- | --- |
| 0 | Calendar accepted, no added capacity | 2 | 2 |
| 10 | Scheduler fires and provisioning begins | 2 | 2 |
| 18 | Additional units deployed, not yet warm | 4 | 2 |
| 25 | Warm readiness is actually observed | 4 | 4 |
| 30, 35, 40, 45 | Four cohorts of ten synthetic journeys | 4 | 4 |
| 50 | Declared demand window ends | 4 | 4 |

A passing synthetic assessment requires an observed scheduler trigger, target
readiness **strictly before** demand, enough effective capacity at demand start,
and the complete 40-client window. Each journey must complete with correct
payload and intact state within **800 ms**. Timely capacity is necessary but
does not imply client success. There is no wall-clock waiting or randomness.

The deterministic client fixture allows
`min(10, floor(10 * effectiveCapacity / demand))` timely clients per cohort.
Those known successful clients complete in 600 ms. Capacity-shortfall clients
time out at 1100 ms; their completion/correct payload is not fabricated.
The slow-client fixture completes at 1000 ms, still outside budget. Missing
client or readiness observations produce unknown completion/latency values,
not zero latency or invented success. These formulas, capacities, and durations
are teaching choices, **not platform limits or a workload forecast**.

## Failure, unknown, and input exercises

| Choice | Measurable result with other defaults |
| --- | --- |
| Lead 5 | Trigger 25, deployed 33, ready 40: correct calendar, late capacity, 8 interrupted of 40; fail |
| Lead 15 | Ready exactly at 30; 40 client samples succeed, but strictly-before readiness fails |
| Target 3, demand 121 | Ready on time but only 120 effective requests/s; 4 interrupted of 40; fail |
| Missed trigger | Correct accepted calendar, no observed trigger, 16 interrupted; fail |
| Provisioning failure | Two deployed/ready units remain, 16 interrupted; fail |
| Warm-up failure | Four deployed but only two ready, 16 interrupted; fail |
| Missing readiness | No observed target-ready timestamp; 40 unknown clients; unknown |
| Missing clients | Ready at 25, but 40 unknown client outcomes; unknown |
| Ready but slow | All 40 finish in 1000 ms, over the 800 ms budget; fail |
| Unqualified schedule | No supported execution, no clients, null success fraction; unsupported |

Known failures take precedence over unknowns within an assessment. Unknowns
remain in the all-sampled denominator. The displayed fraction counts **known
successful / all sampled**; it is not an estimate of native reliability.
An empty sample has a null fraction, never 100%.

Numeric controls require whole numbers within their visible bounds. Blank,
fractional, negative, nonfinite, unsupported-fixture, and impossible-before-zero
plans are rejected. An unfinished attempt cannot be replaced. Invalid actions
are announced and retained without changing its configuration, clock, trace,
client observations, or assessments.

After completing an attempt, configure another and schedule it. Old attempts,
including failed/unknown/unsupported and unchecked attempts, remain verbatim in
the record. A later pass does not erase their user impact. The JSON details
contain every configuration, trace snapshot, client, assessment, and action.

**Reset rehearsal** calls the native `form.reset()` and clears this lesson's
in-memory history. No control is named or identified `reset`, so that method is
not shadowed. Reset restores defaults and focus; reload also starts fresh.
Nothing is persisted to browser storage. Reset is explicit destructive rehearsal
cleanup, not a recovery of earlier interrupted users.

Tab, Shift+Tab, Enter, and Space operate labeled native controls. Status/error
announcements, visible keyboard focus, captioned tables, and keyboard-scrollable
regions support inspection on narrow screens. Local external scripts/styles
run under restrictive CSP; inline code/handlers, network connections, forms,
frames, workers, objects, and other resources are disallowed.

## Verification and immutable evidence

Run from the repository root with existing Node **22.23.4 test tooling only**:

```powershell
node --test --test-reporter=tap .\learning\S014\schedule.test.cjs .\learning\S014\invariants.test.cjs .\learning\S014\integrity.test.cjs
node .\learning\S014\tools\syntax.cjs
node --test --test-reporter=tap .\learning\S014\browser.test.cjs
```

`evidence.json` indexes the BDD, original importable stub/test/BDD snapshots,
actual one-assertion RED, post-RED **IaC N/A**, implementation checks, source
integrity, and real-browser observations. Snapshots end in `.source.txt`, not
test-discovery names. The integrity suite replays the original RED and checks
its assertion, provenance, source hashes and stage ordering. The earlier failed
root-level Playwright lookup is disclosed separately as a tooling probe, not
behavioral RED. No dependency was installed to repair that lookup.
The first browser attempt also stopped at signature preflight: legacy Windows
PowerShell could not load its security module from the inherited PowerShell 7
module environment. Its raw failure, no-session report, and exact test source are
retained. The test now uses the already-installed PowerShell 7 executable;
no dependency, execution policy, signature rule, or browser setting was changed.
The first combined integrity run passed 48/49 checks: its RED-replay child
inherited Node's private test-worker context and emitted a serialized reporter,
so a TAP-summary assertion failed. Its original output and integrity-test source
remain intact. The replay now removes only that private child environment key;
the original stub still genuinely fails its original behavior assertion.

The actual browser test uses only the published
`testing\browser\isolated.cjs` `openIsolatedLesson` API and **awaits `close()` in
`finally`**. It checks DOM controls, native keyboard interaction, complete
observations, late/failed/unknown/unsupported cases, immutable history, invalid
input, reset, narrow viewport and actual CSP enforcement. The explicitly approved
offline pairing is Playwright **1.56.1** with installed, Microsoft-signed Edge
**156.0.4314.50**, helper commit `53c0c0d82cc1db6780a87ac2b1085734af6d5c60`,
SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
There is no integrated foreground browser, download, unsafe flag, or new server.
The helper's inactive lifecycle recovery prototype is **unqualified**; a
successful lesson run does not qualify an unattended CI runner.

Ordinary browser checks write **no files**. Deliberate evidence capture requires
`CAPTURE_BROWSER_EVIDENCE=1`; an existing observation/screenshot is never replaced.
Use a new `S014_BROWSER_EVIDENCE_LABEL` for a deliberate new capture. The
bundle-local capture tool also refuses to overwrite an existing stage. Keep all
initial failures and separate reruns. Local `.gitattributes` preserves archived
and source bytes, including Windows CRLF, and original TAP assertion-diff
whitespace without weakening source checks. A pre-publication LF-only assumption
failed on the actual Windows-authored files; the failed assertion and earlier
attributes are preserved. The scoped attributes now preserve exact bytes across
checkouts with CRLF-aware whitespace checks. No runtime source, prior snapshot,
raw output, or observed browser result was normalized or replaced.

IaC is **N/A**: resource-free synthetic code, recorded after genuine RED and
before implementation. No infrastructure was generated, approved, or deployed.
The immutable implementation cannot contain its own commit hash: the remote-
verified annotated publication tag and private `state Report` bind the actual
commit to this evidence. Parent empirical review, not this worker, awards Done.

## Refined remaining To Do — original lineage, no extra credit

- **A-S014 empirical acceptance:** readiness is published evidence plus the
  parent's independently rerun focused/browser review and verified remote tag.
  Until then, no self-acceptance and no additional credit.
- **B-S014 native proof — not ready:** actual prerequisites remain **CORE, DATA,
  ASANY, C066**, the original **P001** adapter acceptance, and an explicitly
  qualified schedule-capable host/format, SKU/region, operating envelope, and
  separate execution/spend authorization. ASANY means one approved C061, C062,
  or C063 configuration, not all three. C066 must first establish supported
  metric/schedule profile configuration and reject unsupported combinations.
  Do not add a dependency on this portable A lesson.
- **D-S014/P001 roll-up — incomplete:** preserve the original P001 dependencies
  H003/H004/H005/H007/H010 and the original acceptance gates. A native short
  scheduled event must observe its actual schedule and prove readiness precedes
  demand alongside complete client-budget observations; a correct calendar or
  this synthetic trace cannot discharge it.
- **Qualification limits:** Node.js 24 production behavior, native resource/host
  support, cross-platform behavior, and statistical five-nines evidence are
  unverified. No source parent, native child, or runtime is declared complete.

Only `learning\S014\**` belongs to this mission. No root, shared helper, framework,
package, registration, cloud resource, scaffold, deployment, or spend is changed.
