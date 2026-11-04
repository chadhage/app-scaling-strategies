# A-S142 — Burst during initialization

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, account, credentials, package installation or framework is required. Original **S** unit A-S142, **P1**, **SC-S142**, **SOURCE**, parent D-S142. The exact source rows and independent raw/Git source hashes are frozen in `source.json`.

All load, demand, initialization, tier, resource, contention, queue, latency, health, throughput, version and journey records are **fixed fictional teaching DATA ONLY**. Controls read bounded rows in memory; they do not conduct any actual load generator, benchmark, network, cloud or user-data operation.

## Conduct and inspect

1. Choose one of the three fixed traces, then **Record initialization**.
2. **Conduct coupled burst** and inspect the four passing separate tier samples alongside the shared window.
3. **Inspect shared window**, then **Measure original journeys**. Inspect the actual JSON, every budget check and unique started-journey denominator.
4. **Record later recovery**, inspect again, and measure again. Earlier peak records, interruptions and the first measurement remain.
5. **Reset to next retained run**. The selector returns to its initial value; previous journeys, commands and measurements remain visible. At most three runs / 23 commands; further resets are rejected, not silently truncated. Reload starts a new in-memory teaching session.

All controls use native keyboard focus, Tab/Enter/Space and the select's arrow keys. Rejected commands show a focused alert without changing retained records. If scripts are unavailable, the page reports no measured result. No element is named or identified `reset`, so the form's reset method is not shadowed.

## Frozen thresholds and actual output

Demand ≤ **120 fictional requests/s**; combined initialization + production connections ≤ **100**; combined shared CPU allocation ≤ **85%**; queue depth ≤ **20**; queue wait ≤ **300 ms**; initialization ≤ **1000 ms**; each original complete journey ≤ **1500 ms**. Limits are inclusive, invented teaching choices, not platform recommendations. The fictional observation window is 0–2000 ms, with overlapping shared samples at 800 ms and later recovery at 1700 ms.

| Fixed trace | Shared burst | Original journey counts | Synthetic verdict |
| --- | --- | --- | --- |
| `within-envelope` | 30 + 70 = 100 connections; 30 + 55 = 85% CPU; queue 20/300 ms | 4 attempted, 4 successful, 0 interrupted, 0 unknown; 4/4 | PASS |
| `contention` | 45 + 70 = 115 connections; 35 + 55 = 90% CPU; queue 28/480 ms; initialization 1200 ms | 4 attempted, 1 successful, 2 interrupted, 1 unknown; 1/4 | FAIL |
| `unobserved-peak` | Missing original shared connections, queue wait and initialization completion | 4 attempted, 2 successful, 0 interrupted, 2 unknown; 2/4 | UNKNOWN |

`latestMeasurement` includes `verdict`, `counts`, `successFraction`, `failedChecks`, `unknownChecks`, `journeys`, `latency.completedDenominator`, `latency.meanMs`, `latency.maxMs`, `observationRefs`, `recoveryRecorded`, `nativeProof:false` and `fiveNinesCertified:false`. The browser displays this actual model result, not a hard-coded verdict badge.

Every separate tier sample passes in all three fixtures. Even the negative peak has ready=true, HTTP 200 and average throughput=118 requests/s. Those diagnostics cannot override observed shared-resource/budget failures. Unique started journeys—not requests, tier samples or recovery snapshots—form the denominator. A completed old-version-only journey remains unverified for migration. Unknown started journeys stay in the denominator. Recovered J1 completes at 1800 ms with its original 600 ms interruption retained; J3's earlier broken connection remains a failure even when a later snapshot omits it. Known failures take precedence over unknown evidence.

The state is immutable and strictly typed. Every supplied state, inspection and measurement is replayed against the fixed trace and its exact ordered commands before use. Missing/extra fields, accessor records, sparse arrays, stale/forged projections, unknown trace IDs and out-of-order or repeated actions are rejected. Reset preserves earlier records; no success-shaped backfill or destructive history trim occurs.

## Focused local verification

From the repository root in PowerShell:

```powershell
node --test learning\S142\model.test.cjs learning\S142\integrity.test.cjs
node --check learning\S142\model.js
node --check learning\S142\lesson.js
node --check learning\S142\browser.test.cjs
node --test learning\S142\browser.test.cjs
```

Normal verification is **read-only**. Browser tests snapshot all lesson bytes before/after and do not create evidence unless the environment value is exactly `1`. Deliberate capture writes a new exclusive, unique CRLF raw file; it never overwrites historical evidence:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node --test learning\S142\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

The published `testing\browser\isolated.cjs` SHA-256 is `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`. Tests call `openIsolatedLesson` and **await close in finally**. Approved cached Playwright 1.56.1 / installed signed Edge 156 / Node 22 are local tooling, not production Node 24 validation. No download, unsafe flag, foreground lease or live load driver is used. The helper's inactive lifecycle prototype is unqualified; a successful caller run is not general unattended-runner qualification.

BDD precedes the genuinely loadable stub and assertion RED. `evidence\raw\red.*.txt` preserves the stub, failing assertion and untouched runner output outside test autodiscovery. `iac.json` records the subsequent IaC **N/A** step. Raw evidence is `-text -diff`; canonical code hashes and raw CRLF hashes are checked independently, including Git storage after publication. Producer code working bytes may use CRLF; portable code verification uses canonical LF while literal raw evidence must stay byte-identical. Browser proof binds both producer observations and canonical code. Native Git attributes are parsed as NUL records rather than quoted path text. The genuine two-assertion Windows integrity failure reproduction and pre-refactor bytes remain in `evidence\raw\verification-integrity-failure-*` and `pre-refactor-*`, not test discovery. Direct CSP blocks inline scripts/styles, connections, objects, bases and form actions; browser checks observe real inline script/style violations without issuing network requests.

`remainder.json` retains the blocked B-S142/native and D-S142/source-parent requirements. Parent alone accepts this original unit once. Tests, repairs, evidence and refinement earn zero extra credits. Separately assigned C005-C008/local-harness OP150 is untouched; its source150/135-practice snapshot does not include later live acceptance.
