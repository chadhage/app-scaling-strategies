# S012 — CPU/memory-driven scale-out

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, dependency installation,
credentials, real load generator, management API, cloud resources, identity, or
spend is involved.

## Contract and worked exercise

A-S012 / D-S012 / canonical README S012 / SC-S012. One frozen **S** unit,
`kanoUnit: A-S012`; SOURCE entry gate. The source strategy is **CPU/memory-driven
scale-out: scale before resource saturation causes queuing or latency-budget
violations**. This is not manual scale-out, HTTP automatic scaling, or a slot swap.

The fixture starts with two ready instances. Each represents 100 CPU and memory
units and 100 requests/second. CPU ≥70% **or** memory ≥75% for two consecutive
10-second windows requests one additional instance. Two further windows are
required for observed readiness; maximum four instances. These are explicit
teaching constants, not universal Azure rules or performance measurements.

1. Keep CPU 140, memory 100, offered load 120 and budget 250 ms. Observe ten
   baseline journeys.
2. Advance two windows. Requested instances becomes three; effective ready
   remains two. Observe ten journeys during warm-up.
3. Advance two further windows. Effective ready becomes three and CPU falls to
   46.67%. Observe ten post-scale journeys, including added-instance use.
4. Inspect the separate rule, capacity, user, transition and exercise outcomes.
   The verifier needs a pre/warming sample and added-instance post-scale samples;
   a rule trigger alone cannot pass the exercise.
5. Reset and try CPU 40 / memory 150 to trigger on memory alone.
6. Try CPU 260 / offered load 260, observe before readiness, then restore healthy
   input and scale. The earlier interruptions stay in cumulative evidence.

Metrics are aggregate resource units divided by observed ready instances, capped
at 100% in the display; raw pressure is retained. Queue = max(0, offered rps −
ready ×100). Synthetic latency = 80 ms + ceil(queue/service rps ×1000), plus
300 ms + ceil(max(raw resource %) −100) during saturation. Each explicit client
observation records ten fixed clients, session/cart identifiers, instance,
completion, HTTP status, latency/budget, auth/state correctness and effect count.
HTTP 200 does not override incorrect state or duplicate effects.

Controls deliberately expose missing metrics, unknown effective capacity,
provisioning failure, missing client evidence, incorrect business state, and
unsupported/unverified rule profiles. Missing observations are never zero or
success. Unsupported profiles execute nothing; actual native SKU, metric and
slot eligibility remain unverified. Applying valid input restarts the rule
streak, retains history, and does not cancel a warming target. Inputs are strict,
bounded whole numbers; malformed or unknown operations are rejected.

Use Tab, Enter and Space. Reset uses native `form.reset()` without a control named
or identified `reset`. It archives the prior run, including failed/unknown
observations and UI errors, and restores defaults. Evidence is page-memory only;
copy the selectable JSON before reload/close. At 80 commands/run or eight archived
runs/page, existing evidence is retained rather than silently deleted. Reset
recovers a caught unexpected application failure. Strict CSP is enforced.

## Verification

From the repository root with the approved **Node.js 22.23.4 test tooling**:

```powershell
node learning\S012\verify.cjs all
```

Individual stages are `green`, `syntax`, `browser`, and `integrity`. Ordinary
verification is read-only to historical proof and checks its byte hashes.
Intentional refresh is explicit and appends numbered records without deleting
or overwriting earlier failures:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S012\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a loadable no-op stub and **44 actual assertion failures / one pass
in 45 tests**. The unchanged behavioral suite is retained beside the stub and
raw RED TAP as `.txt` snapshots, so Node cannot auto-discover them as tests.
`evidence\iac-na.json` records resource-free IaC N/A after RED and before
implementation. The unchanged **45 behavioral tests**, **13 integrity checks**
and **six executable syntax checks** pass. Actual Edge 156.0.4314.50 passes
**18 browser leaf scenarios** (19 Node test results including their wrapper).
See `evidence.json` and the numbered records for raw results and observations.

The first signature precheck failed before launching a browser because Windows
PowerShell 5 could not autoload its security module from the inherited PowerShell
7 module environment. The actual failed assertion/log is retained in
`evidence\browser-1.*`. Using the already-installed `pwsh.exe` makes the ordinary
`Get-AuthenticodeSignature` check work; no security setting or application
behavior was changed. The first actual browser pass and the final pass are both
retained, not silently replaced.

The initial scoped publication preflight rejected blank lines at EOF in two
otherwise successful, empty syntax-output logs. No commit, tag or push occurred.
`evidence\publication-precheck-1.*` preserves the exact read-only reproduction.
The historical logs remain byte-identical; only archived `.txt` output receives
local blank-line whitespace exemptions. Source whitespace checks remain active.
New syntax logs list each checked file, command and actual exit status.
`integrity-3.*` also retains a one-test failure caused by requiring LF rather
than Windows CRLF in the new attribute-semantics assertion. Only that assertion's
configuration comparison was corrected; archived proof bytes remain unchanged.

Browser tests exclusively use
`testing\browser\isolated.cjs` → `openIsolatedLesson(relativeRepoPath)`,
awaiting `close()` in `finally`. They verify the already-installed offline
Playwright **1.56.1** and Authenticode-valid Microsoft-signed **Edge 156**,
with no installs, downloads, TLS weakening, sandbox disable, or shared foreground
browser lease. Actual DOM, keyboard, reset/archive, bad input, capacity/user
failure, unknown-data, responsive layout and CSP enforcement are asserted.
Both deliberately injected errors and blocked CSP attempts are identified as
test actions, not live incidents. Bundle-local attributes preserve evidence bytes.

## To Do refinement — no extra completion credit

- Parent empirical review/acceptance of the single A-S012 unit remains required.
- **B-S012** remains gated by **CORE, DATA, ASANY, C066**, a qualified
  host/SKU/region/metric/slot envelope and separately approved native execution.
  Correlate actual native rules, effective capacity and complete client budgets;
  preserve unsupported combinations, saturation, failures and uncertainty.
- **D-S012** retains **P001** and its original shared/source-parent acceptance
  gates. This portable lesson does not fulfill the native configuration/result.
- Production Node.js 24 validation, source-parent completion, native reliability
  and statistical evidence remain unclaimed. No follow-on card is admitted and
  no extra credit is earned for tests, evidence, tooling or refinement.

## Microsoft Open Source Disclaimer

Educational examples and guidance are provided “AS IS”, without warranties or
guarantees except where required by applicable law or binding terms. Validate
security, reliability, compatibility and cost before production use. Microsoft
and Azure references imply no endorsement, sponsorship, certification or support.
Project goals are not Microsoft SLAs. Microsoft and Azure are trademarks of the
Microsoft group of companies. This disclaimer grants no license or redistribution
rights and changes no applicable license, product term, support agreement or
published SLA. See the repository README's full disclaimer.
