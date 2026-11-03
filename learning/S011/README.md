# A-S011 — manual horizontal scale-out

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, framework,
dependency installation, management access, or network connection is needed.
The portable entry point may later be mounted through C041; this bundle does not
implement or certify that capability.

## Source and exercise

README.md S011 requires adding instances and verifying effective capacity before
increasing traffic share. `.docs\wiki\backlog.md` D-S011 adds requested/effective
counts, readiness, load, connections, and complete client-budget observations;
adding slots alone is not compute scaling. D-S021 remains an original parent
prerequisite. A-S011 is one frozen S unit in SC-S011, not native B-S011.

Use the default request: four instances, 160 requests/second, 100 aggregate
connections, healthy fixture. Request, observe twice, verify, then increase new
share to 50%. Counts progress:

| Action | Requested | Deployed | Ready | Traffic-eligible |
| --- | --- | --- | --- | --- |
| Baseline | 2 | 2 | 2 | 2 |
| Request scale out | 4 | 2 | 2 | 2 |
| Observe deployment | 4 | 4 | 2 | 2 |
| Observe readiness | 4 | 4 | 4 | 2 |
| Verify effective capacity | 4 | 4 | 4 | 2 |
| Increase admission | 4 | 4 | 4 | 4 |

Inspect per-instance readiness, connection totals, measured assertions, individual
client instance IDs, and the complete JSON record. Try premature admission,
one-unready-instance, missing telemetry, provisioning failure, dependency limit
60, demand 161, and a 75% new-instance share. The guarded cases do not manufacture
transition journeys. Ready-but-slow, broken-connection, and unknown-client fixtures
produce separate interrupted and unknown outcomes after actual synthetic admission.

All teaching thresholds are explicit fixture choices: 50 requests/s per instance,
80% per-pool and total utilization ceiling, 20 connections per deployed instance,
800 ms complete-journey budget, and readiness age at most 30 logical seconds.
Actions advance 10 seconds; age advances 31. These are not Azure limits or clocks.
The 20-client sample rounds new shares down to a 5-point resolution. Both desired
and sampled load distributions must fit. Old-only clients never count as
successful transitions. Unknown affected journeys stay in the denominator.

Recovery starts fresh healthy capacity observations and stops new-instance
admission in this fixture, without rewriting the original request, previous
snapshots, interruptions, unknowns, or client records. It is not a native rollback
or a claim that interrupted users recovered. Cumulative failure takes precedence
over unknown; no attempted transitions means no measured success rate.

Use Tab, Shift+Tab, Enter, and Space for the labeled native controls. Reset uses
`form.reset()` with non-shadowing control IDs/names and clears only memory. Reload
also starts fresh. Results and invalid inputs have live announcements; tabular
observations have captions and headers. Scripts/styles are local; restrictive CSP
prohibits connections, inline execution, forms, frames, workers, and other content.

## Verification

From the repository root, using existing Node 22.23.4 test tooling:

```powershell
node --test --test-reporter=tap .\learning\S011\scale-out.test.cjs .\learning\S011\capacity-invariants.test.cjs .\learning\S011\integrity.test.cjs
node --test --test-reporter=tap .\learning\S011\browser.test.cjs
node --check .\learning\S011\scale-out.js
node --check .\learning\S011\lesson.js
```

The browser check uses only the existing `testing\browser\isolated.cjs`
`openIsolatedLesson(relativeRepoPath)` helper and awaits `close()` in `finally`.
The explicit offline pair is Playwright 1.56.1 and installed Microsoft-signed
Edge 156. There is no integrated foreground browser, installation, download,
TLS change, sandbox disable, or added application dependency.

`evidence.json` indexes BDD, original source rows/hashes, saved loadable RED
source, raw RED output, focused GREEN, syntax/integrity, and real-browser evidence.
Saved RED source ends in `.source.txt`, not a Node test-discovery filename.
The initial RED log is also retained: one test needed a positive snapshot-count
assertion before checking nested immutability. The corrected stub run contains
35 actual assertion failures, no missing-module or test-loader fake RED.
An additional genuine one-assertion RED caught a latency-only budget assertion
passing despite a known broken connection and no completion. The corrected
complete-journey assertion fails and records incomplete/over-budget counts;
the already-failed client outcome and historical observations are unchanged.
The first browser run's unsupported fieldset `isDisabled()` check is retained;
the corrected check inspects the actual disabled inputs and select.
The bundle-local `.gitattributes` preserves byte-hashed sources and raw logs
across Windows checkouts. Only archived TAP output is exempt from whitespace
linting: Node's original assertion diffs contain intentional whitespace-only
lines. Runtime source retains normal whitespace checks, with CRLF recognized.

IaC: **N/A**, established after RED and before implementation; this is a
resource-free lesson.

## Refined remaining To Do — no invented completion

- **A-S011 acceptance:** published evidence still requires the parent controller's
  independent empirical review. No worker-assigned Done or extra Kano credit.
- **B-S011:** remains unimplemented and not ready without CORE, DATA, ASANY, C065,
  qualified target/envelope, and separately approved native execution.
- **D-S011 roll-up:** remains incomplete; both children, D-S021 prerequisite,
  actual ready capacity, complete client/dependency budgets, no slot-as-compute
  inference, target evidence, and all original source acceptance remain required.
- **Production and statistics:** approved production Node 24 remains unvalidated;
  no production, Azure, cross-platform, five-nines, or completed-parent proof.

No root/shared files, real credentials, login, registrations, deployments,
resources, infrastructure, spending, or original source lineage are changed.
