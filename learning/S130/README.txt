A-S130 / S130 / D-S130 / SC-S130 / frozen Kano S

Training rehearsal - synthetic data - not a live Azure result

OPEN AND CONDUCT
Open learning\S130\index.html directly in a browser; no server is needed.
All plans, instances, executions, restarts, grace windows, state, effects,
latency and outcomes are fixed fictional teaching DATA ONLY.

Choose single-compatible, leave the exact software token v2, and activate
Load trace DATA -> Inspect executions and grace DATA -> Measure attempted
journeys. Repeat with multi-compatible without resetting. The first run has
2 uninterrupted and 1 interrupted journey; all three existing asynchronous
executions nevertheless complete. The second has a positive sample of 3/3.
Both remain retained. Neither proves every user/execution or fleet completion.

The polling journeys preserve identity/state and one business effect, observe
the intended v1 -> v2 movement and stay within their ORIGINAL 900 ms budget.
Long-running execution durations describe fictional asynchronous work, not
HTTP responses held open for minutes. The platform-restart fixture records
a platform event during the fictional version-transition window; it does not
mean that a platform update deploys new application code.

Other fixed presets:
  multi-incompatible: 1 uninterrupted, 2 interrupted (state loss / duplicate effect).
  multi-starved: 1 uninterrupted, 2 interrupted (ready capacity / latency).
  multi-grace-expired: 2 uninterrupted, 1 interrupted (3700 s work / 3600 s grace).
  multi-grace-unknown: 2 uninterrupted, 1 unknown (observed grace / work / effect / version).
  multi-platform-restart: 2 uninterrupted, 1 interrupted (780 s work / 600 s grace).
  multi-recreate: 0 uninterrupted, 3 interrupted (recorded termination and downtime).
All three attempted journeys remain in each denominator. Fleet update
completion is UNKNOWN in EVERY preset, including the positive sample.
No result certifies continuity, native Azure behavior or five-nines.

Preconditions, actions, fixed inputs, assertions and exact source acceptance
are declared in manifest.json. This is the portable exercise only:
  S130: Test rolling site updates, mixed-version compatibility, execution grace
        limits, and sufficient multi-instance capacity.
  D-S130: Real grace/version/capacity behavior is measured; single-instance
          downtime and unobservable completion are disclosed rather than
          reported as guaranteed continuity.
  A-S130: Compare single/multi-instance Flex traces; unknown completion or
          grace limits cannot be certified away.
The synthetic exercise does not fulfill D-S130's requirement for REAL behavior.

GUARDS AND UX
The command schema accepts only exact load/presetId/version, inspect/type and
measure/type records. The token is the string v2, not trimmed/coerced input.
Descriptors, symbols, arrays, custom prototypes and serialized state are
checked. State is validated by deterministic history replay; successes and
unknowns cannot be forged. Out-of-order operations preserve state/history.
Twelve actions / four runs are retained without pruning. A thirteenth action
requires explicit reset. A later successful run never erases an interruption.

Use Tab and Enter with labeled native controls and visible 3 px focus.
Invalid inputs and safe holds appear in a role=alert; status reports retained
outcomes. Reset calls HTMLFormElement.prototype.reset, so controls cannot
shadow native form.reset, then returns focus to the preset. It clears only
this page's in-memory rehearsal, not files or earlier captured evidence.
Missing local model DATA fails visibly and does not produce measured success.
No storage, cookies, timers, randomness, network API or management operation
exists in the lesson runtime. Official documentation URLs are reference text,
not runtime requests or interactive lesson actions.

DOCUMENTED FUNCTIONS FLEX CONSTRAINTS (read 2026-11-04)
https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-site-updates
https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale#timeout

Flex has no deployment slots. Rolling site updates drain and replace
platform-selected batches; old/new versions coexist and must remain backward
compatible. Replacement scale-out is asynchronous and is not guaranteed to
arrive before the next drain interval. Single-instance applications can have
brief downtime even when in-progress executions complete.

Rolling scale-in grace is documented as 60 minutes (3600 s); platform updates
have a SEPARATE 10-minute (600 s) grace reference. HTTP responses are limited
to 230 s regardless of execution timeout. An unbounded maximum execution
timeout is not unbounded termination grace. A documented reference is NOT
an observed execution outcome or measured grace. Unknown grace stays unknown.
Recreate forcefully restarts instances and terminates running executions;
do not borrow rolling grace to claim recreate completion.

No built-in site-update completion signal or real-time batch/progress view is
available. Instance-log turnover gives only a best-effort estimate, not a
completion certificate or reliable production automation gate. Increased
instances, a documented grace window and a small positive sample cannot prove
every user/execution completed. Regional availability and target behavior
remain unverified. Documentation is not native proof.

BDD / TDD / IaC / EMPIRICAL VERIFICATION
flex-traces.feature preceded the loadable no-op stub. Genuine assertion RED
expected loaded and observed empty (ERR_ASSERTION, child exit 1), not a missing
import or tooling failure. Exact stub bytes and its real Edge keyboard load
are preserved in evidence\red-stub and evidence\raw. assertions.cjs is outside
normal test autodiscovery. An early focused test expected reference identity;
deterministic replay correctly preserves VALUES, so the assertion was corrected
to deep equality. That test correction is not additional product credit.
The first browser capture retained a failed overly broad status-role count:
native HTML outputs also have implicit status roles. The check now targets
the explicit status region; the raw failed capture was not overwritten.
IaC N/A was evaluated AFTER genuine RED: no resource, template or deployment.

Focused READ-ONLY verification from the repository root:
  node --test learning\S130\model.test.cjs learning\S130\integrity.test.cjs learning\S130\browser.test.cjs
Syntax:
  node --check learning\S130\model.js
  node --check learning\S130\app.js
Normal verification NEVER rewrites sources, RED or previous browser proof.
Only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately creates a new unique raw
browser capture, using exclusive creation. It does not overwrite old captures.
Raw stdout, stderr, stub, browser and read-only hash observations are retained
outside autodiscovery; .gitattributes was created BEFORE their capture.
evidence\source-hashes.json separates raw CRLF/LF measurements from canonical
LF and canonical Git blob identities; raw proof/stub bytes are never normalized.
Raw proof and the archived stub use -diff as well as -text: genuine TAP
whitespace and original stub CRLF must remain verbatim, not be "cleaned" to
pass publication. The first scoped cached whitespace check flagged archived
CRLF; its raw failure is retained. Only the owned byte-policy was corrected.

Actual DOM checks exercise all presets, keyboard operation, guard errors,
history exhaustion, reset and missing-model failure, and observe CSP rejection
of inline script/event, eval, inline style, data connections, images, frames
and local form navigation. CSP probes are evidence fixtures, never imported
by the lesson. No unsafe flags or live network request is used.

The published testing\browser\isolated.cjs (53c0c0d) is SHA-256 pinned to
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055.
Use openIsolatedLesson and await session.close() in finally. Existing Node
22.23.4 / offline Playwright 1.56.1 / Microsoft-signed Edge 156.0.4314.50 are
test tooling, NOT production Node.js 24/native validation. The helper retains
known unattended context/page/cleanup lifecycle limitations; its inactive
recovery prototype remains unqualified. No foreground lease is used.

HONEST RELATED TO DO / NATIVE REMAINDER
B-S130 remains To Do, readiness=false; original B-S130 Kano unit is unchanged
and no admission, credit or ledger mutation is implied by this refinement.
Blocker: no approved native Functions Flex target/current region qualification,
CORE/DATA/FN/C081 entry gates, real grace/version/capacity observations,
client state/effects/latency evidence or authorized cloud spend/deployment.
Once separately authorized, bound the original native unit to ONE available
Flex preset and a declared single/multi-instance comparison window. Observe
version coexistence, ready capacity, execution termination/completion and
client outcomes; retain single-instance downtime and unknown fleet completion.
Do not automate retirement using an estimated log-completion flag.
D-S130 remains incomplete until its native sibling and source acceptance pass.

No actual Functions/resource/process/config/network/deploy/IaC, cloud,
scaffold, identity, credentials, packages, framework, downloads, unsafe flags
or spending. C005-C008 and local-harness belong to the active catalog worker
and are untouched. Parent alone accepts A-S130 once. Testing, repair, proof
and refinement earn zero extra credits. This mission stops after A-S130.
