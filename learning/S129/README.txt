A-S129 — Functions slot swaps and bounded execution replay
S129 / D-S129 / SC-S129 / one original frozen S unit

Training rehearsal - synthetic data - not a live Azure result

OPEN
Open learning\S129\index.html in a browser. No server, framework, packages,
credentials or subscription is required. All hosting, Functions, slots, triggers,
executions, termination, replay, checkpoints, acknowledgments, effects, ticks and
journeys are fixed fictional teaching DATA ONLY. No actual Function, resource,
process, network, configuration, deployment or IaC operation is performed.

SOURCE ACCEPTANCE
README S129: Functions, supported-plan slots: Test interrupted execution and
replay; slot swaps alone do not guarantee zero downtime.
D-S129: Add supporting-plan Functions slot swaps during active executions and
replay. Native execution termination and bounded recovery are measured;
duplicate effects are prevented; slot swaps alone cannot certify zero downtime.
Source prerequisites: P004, D-S049, D-S077, plus the source's BASE requirements.
A-S129: Swap active Functions executions; distinguish termination/replay from
guaranteed zero downtime. This resource-free portable slice does not complete
D-S129 or its B-S129 native sibling (CORE, DATA, FN, C080).

DOCUMENTED FUNCTIONS CONSTRAINTS — reviewed before design
Microsoft Learn: https://learn.microsoft.com/en-us/azure/azure-functions/functions-deployment-slots
Consumption, Premium and eligible Dedicated plans support slots subject to plan
limits; Flex Consumption has no slots. Functions on Container Apps uses
revisions. New trigger invocations route to the swapped slot during the switch,
but currently executing functions can terminate and scaled-app availability can
degrade. Slot swaps do not guarantee zero downtime. Event-source/binding settings
need deliberate slot-specific handling before native swaps. This lesson changes
no settings, configures no retry policy and invents no native recovery guarantee.
The supported-slot preset is fictional, not an inspected Premium resource.

WORKED EXERCISE
1. Choose supporting-slots, checkpoint + stable effect key, and exactly 6 ticks.
   Confirm DATA ONLY and begin. Inputs are locked for that run.
2. Record the fictional slot swap. Two old-v1 executions were active. The queue
   execution terminates; its original client timeout is an interruption.
   The old HTTP execution has no completion or effect receipt and stays unknown.
   One declared transition client arrives at candidate-v2 and completes.
3. Observe the candidate HTTP 200. It proves only this fixed probe receipt:
   not recovery, complete readiness, migrated users, added compute or continuity.
4. Replay queue work from checkpoint 2 of 3. invoice-42 was committed before its
   acknowledgment was lost. With the stable effect key, checkpoint 3, an
   acknowledgment on the replay execution, and ONE known queue effect are seen.
5. Check the result. Educational verification passes for this expected negative
   transition and safe recovery. User impact still contains 1 interruption and
   1 unknown among 3 started journeys. Uninterrupted success is only 1 / 3.
   The original terminated execution is not rewritten as the completed replay.
   Queue recovery does not reconcile the original unknown HTTP execution/effect.
   A completed replay inside its recovery window cannot undo the original
   timeout or give the original journey a fresh latency budget.

Reset retains every input, original observation and ordered event. Repeat with
blind-replay and budget 6: replay/acknowledgment succeed but TWO known queue
effects expose a duplicate; the verifier fails. Repeat with budget 5: the bounded
window has no completion receipt, checkpoint stays 2 and replay acknowledgment
is unobserved. Try Flex or Functions on Container Apps: slot swapping is
unsupported before exposure, and an empty sample is not 100% success.

BOUNDS, INPUTS AND UX
Only fixed host/policy allowlists, exact integer text 1-10, a typed numeric budget,
literal true consent and exact command fields are accepted. Whitespace, signs,
decimals, exponent notation, leading zeroes, string booleans, extra fields,
accessors, forged states, repeated and out-of-order actions are rejected.
Issued states and all nested observations are immutable. Six runs, at most six
events each, are retained without pruning. Reset only this page's in-memory
rehearsal; reload deliberately starts a fresh session. No durable persistence,
native checkpoint or unattended-harness qualification is claimed.

Controls have labels, keyboard operation, visible focus, ordered disabled states,
status and focused error summaries. Invalid input does not change results/history.
Reset uses HTMLFormElement.prototype.reset.call(form), not a shadowable named
form control. Missing required model data fails visibly with disabled operations
and no inferred success. These targeted checks are not a complete WCAG audit.

VERIFY (from repository root, PowerShell)
node --test learning\S129\model.test.cjs learning\S129\integrity.test.cjs learning\S129\browser.test.cjs
Normal verification is READ-ONLY to source and historical proof. Browser tests
hash the owned bundle before/after. Only exact CAPTURE_BROWSER_EVIDENCE=1
deliberately appends unique browser JSON/screenshots; failures are also retained,
and previous observations are never deleted or overwritten.

The actual browser uses published testing\browser\isolated.cjs at 53c0c0d,
SHA256 86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055,
openIsolatedLesson and awaited finally close. Existing offline Playwright 1.56.1,
Microsoft-signed Edge 156.0.4314.50 and Node 22.23.4 are LOCAL TEST TOOLING ONLY,
not production Node.js 24 or native Azure validation. The helper has known
context/page/cleanup lifecycle limitations. Its inactive recovery prototype is
unqualified and is not used. No foreground lease, security bypass or download.

CSP is declared before local assets. The actual browser observes denial of
inline script, dynamic evaluation, a data: fetch (no network), and a valid Blob
worker. csp-probe.js is a test-only local negative fixture, never a lesson
dependency. Missing-model and stub fixtures also stay inside this owned bundle.
The first browser capture is retained as a failure: Playwright addScriptTag
mistook the probe's intended inline-script CSP denial for a load failure.
Native DOM loading of the same owned probe then passed all 12 browser checks.
The failed assertions, raw run, observation and screenshots were not erased.

BDD -> loadable stub -> genuine ERR_ASSERTION RED -> IaC N/A -> implementation /
refactoring -> focused green / syntax / integrity -> actual browser observations.
The preserved RED stub and assertions use non-discovered filenames. Raw proof
is marked -text/-diff/-merge early. evidence\source-hashes.json distinguishes
raw bytes (including any CRLF) from canonical UTF-8 LF text and Git blob IDs.
After publication, the separate read-only verify-publication.cjs accepts an
exact 40-character implementation commit and verifies only this namespace.

REMAINING WORK — honest blocked native remainder, no additional credit
B-S129 remains To Do/not ready until approved owned native target, authorization,
CORE/DATA/FN/C080, capacity/envelope and source prerequisites are available.
It must actually measure supported-plan execution termination, trigger-specific
checkpoint/retry/acknowledgment recovery, one intended effect without duplicates,
and every original started journey including interruption and unknown results.
HTTP retry cannot be assumed from queue replay. Current OS/SKU/region and limits
must be verified natively; a successful swap, probe or later recovery cannot
erase original failures or missing receipts. This lesson grants no cloud,
scaffold, identity, credentials, deployment, IaC or spending authority.

Parent alone accepts A-S129 once. Tests, repairs, proofs and refinements earn
zero extra credits. C005-C008/local-harness remain active catalog-worker owned
and untouched; catalog inclusion is not inferred by this publication.
Educational AS-IS material; the repository's Microsoft disclaimer applies.
No Microsoft endorsement, support, warranty, SLA or five-nines guarantee.
