# S147 — Client-side correctness oracle

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a standard JavaScript-enabled browser. No framework,
installation or subscription is needed to use the lesson.

## Frozen source and objective

- Source **S147**, README: “Detect empty-success responses, silent logout, lost
  state, duplicate effects, and broken UI, not just HTTP status.”
- **D-S147**, P0: “The client-side oracle flags every injected acceptance failure
  and does not rely solely on HTTP/health status.”
- Original **A-S147**, **S**, **P0**, **SC-S147**, **SOURCE**:
  inspect misleading 200/state-loss/duplicate fixtures and choose the correct
  client-side failure verdicts.
- The portable contract requires a standalone worked exercise, source ID,
  objective, preconditions, actions, synthetic trace, assertions, limits and
  keyboard support. Both native and original parent gates remain separate.

Raw source excerpts, selected inventory and claimed-card evidence are in
`evidence\raw\source`. Live state reads used
`Local\AppScalingStrategies_KanbanState_v1`; every read handle closed before
release. Normal tests read frozen snapshots, never the live ledger.
Raw CRLF and canonical Git bytes were independently captured and hash-pinned.
Only raw evidence paths disable text conversion and whitespace diffing; byte
integrity is checked independently instead of editing failed-output whitespace.
The complete README snapshots differ outside S147; the exact S147 row matches.
Canonical README source is `a1411c1fd7b081e7772db0ac96eb61d697452c86`; frozen
backlog/portable inventory is `8e7fb3cbcc61d3aa85116204735f10687f608b1c`.

## Preconditions and safety boundary

Every client, request, response, HTTP status, readiness value, state, identity,
version, effect, business outcome, assertion, journey and metric is **fixed
fictional teaching DATA ONLY**. A recorded POST is a string, not a submitted
request. The reported 240 requests/second is not a measured benchmark.
There are no API/network, account/user-data, business, storage, cloud, identity
configuration, credentials, deployment or spending operations. Only local files
and in-memory exercise state are used. The real operator console is not the
fictional broken UI.

## Worked exercise

1. Choose a fixture and **Conduct** its fixed trace.
2. **Inspect** the expected versus observed client evidence.
3. Choose **CLIENT-SIDE FAILURE**, **CLIENT-SIDE CORRECT** or **UNKNOWN**.
4. **Check** the learner selection. Inspect the separate assertion,
   expected-negative conformance, learner and original-impact outputs.

| Fixture | Correct selection | Client assertion result | Original impact |
| --- | --- | --- | --- |
| `positive-control` | CLIENT-SIDE CORRECT | 10 PASS / 10 | 2 completed / 2 |
| `empty-success` | CLIENT-SIDE FAILURE | 1 FAIL, 4 PASS / 5 | 1 interrupted / 1 |
| `silent-logout` | CLIENT-SIDE FAILURE | 1 FAIL, 4 PASS / 5 | 1 interrupted / 1 |
| `lost-state` | CLIENT-SIDE FAILURE | 1 FAIL, 4 PASS / 5 | 1 interrupted / 1 |
| `duplicate-effect` | CLIENT-SIDE FAILURE | 1 FAIL, 4 PASS / 5 | 1 interrupted / 1 |
| `broken-ui` | CLIENT-SIDE FAILURE | 1 FAIL, 4 PASS / 5 | 1 interrupted / 1 |
| `missing-observation` | UNKNOWN | 5 UNKNOWN / 5 | 1 unknown / 1 |
| `later-recovery` | CLIENT-SIDE FAILURE | 14 PASS, 1 FAIL, 5 UNKNOWN / 20 | 1 interrupted, 1 unknown / 2; 2 later recoveries / 2 |

All fictional attempt records show HTTP 200 and readiness. Those signals cannot
override empty content, observed logout, wrong state/version, two effects for one
key/identity, or an unusable/incompatible UI. Required observations with
`available: false` are unknown, not invented negative observations. A known
failure dominates the overall verdict; unknowns remain separately counted.

## Exact output shapes and denominators

`assertions-output` is an array of records with exactly these eight fields. For
example, the lost-state fixture contains:

```json
{
  "assertionId": "F-state:original:preserved-state",
  "journeyId": "F-state",
  "attemptId": "F-state:original",
  "requirement": "preserved-state",
  "verdict": "FAIL",
  "expected": { "version": 7, "items": ["sample-book"] },
  "observed": { "available": true, "version": 6, "items": [] },
  "explanation": "Observed preserved-state violates the exact fictional requirement; health status cannot override it."
}
```

The five requirements are `nonempty-response`, `authentication`,
`preserved-state`, `exactly-one-effect`, and `usable-compatible-ui`.
Authentication asserts signed-in state, intended identity and session. Effects
assert the exact key, intended identity and count **one**. UI assertions include
view and supported client/API versions. Missing observations retain explicit
null data and verdict `UNKNOWN`. An observed signed-out identity is a `FAIL`,
not a missing observation.

`impact-output` has exactly this shape; for `later-recovery`:

```json
{
  "denominator": 2,
  "completed": 0,
  "interrupted": 1,
  "unknown": 1,
  "laterRecoveryObserved": 2
}
```

- **Original-impact denominator:** original journeys. Completed + interrupted +
  unknown equals it. Classification uses the original attempt, permanently
  retaining its interruption or unknown within the rehearsal.
- **Later recovery:** a separate overlapping count using that same original
  denominator. Later completed observations do not rewrite original impact.
- **Assertion denominator:** five requirements × attempt records, including
  unobserved and later attempts. PASS + FAIL + UNKNOWN equals it.
- **Transport denominator:** attempt records, not users. Recovery has four
  HTTP-200/ready records but only two original journeys.
- **Learner/check counts:** exercise attempts only, never extra journeys,
  business effects, success observations or Kano credits.

`journeys-output` retains each original attempt/outcome and its separate later
attempts. `conformance-output` exposes `detectedAcceptanceFailure` separately
from `{ applies, verdict, scope }` expected-negative conformance. A conformance
PASS means the supplied failure was detected, not that a user succeeded.
`check-output` exposes check number, selected/expected client verdict, learner
`verifierVerdict`, detection, conformance, unchanged original impact and
explanation. Learner PASS/FAIL never mutates the business observations.

## History, guards, keyboard, reset and errors

Eight runs with three checks each are retained, without eviction or silently
replacing an unfinished run. A wrong answer and its correction both stay in
history. Repeating a fixed fixture is another exercise, **not new measured user
data**; impacts are never summed across replays.

Commands have exact fields/types and current integer `epoch`/`revision`:
conduct adds `fixtureId`; inspect adds `runId`; check adds `runId` and `verdict`.
Reports and checks must exactly replay the journal. Frozen model-issued state
handles are single-use; stale commands, spent handles, display snapshots,
forged outcomes, cross-run commands, getters, extra fields and coercions fail
closed. This is an in-memory lesson guard, not an authentication system.
The bound is forty commands per rehearsal. Explicit reset clears its memory,
increments the epoch and invalidates earlier commands.

Use Tab, Shift+Tab, arrow keys and Enter with labeled native controls. Conduct
focuses Inspect; Inspect focuses the verdict; errors focus the alert. Reset
clears only rehearsal memory and returns focus to the fixture picker. Its ID is
`lesson-reset`, never `reset`; native `form.reset` is not shadowed. Invalid
choices retain history. A missing oracle module disables controls and reports
that no outcome can be inferred. No result is fabricated when JavaScript fails.

CSP permits only local scripts/styles and denies connections, workers, objects,
frames, base changes and form actions. Actual browser checks observe blocked
inline script/style, not merely the presence of a CSP string.

## Verification and evidence

From the repository root, normal verification does **not** rewrite the lesson
or its evidence:

```powershell
node --check learning\S147\fixtures.js
node --check learning\S147\model.js
node --check learning\S147\app.js
node --test learning\S147\tests\oracle.test.cjs learning\S147\tests\integrity.test.cjs
node --test learning\S147\tests\browser.test.cjs
```

Only the exact deliberate flag below writes a unique raw browser JSON using
exclusive creation. Unset, `0`, `true`, whitespace and other truthy values do
not capture or overwrite anything:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node --test learning\S147\tests\browser.test.cjs }
finally { Remove-Item Env:CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

BDD preceded a loadable health-only stub. It produced three failing unit
assertions; an actual DOM assertion failed `PASS !== FAIL` after proving title/banner
and interaction loaded. Both REDs and stub bytes remain under
`evidence\raw\red`, outside autodiscovery. IaC was explicitly **N/A** after
RED, not an infrastructure PASS. Implementation/refactoring followed.
An additional raw failed focused run preserves the CRLF-sensitive attribute
test mistake; its repair normalizes only the configuration comparison, never
raw evidence. All subsequent attempts are retained under raw verification.

Browser evidence uses the published `testing\browser\isolated.cjs` SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, and awaited `finally` close. The helper creates/cleans its
prescribed owned private scratch; it is unchanged. Approved preflight evidence
records offline Playwright **1.56.1**, Microsoft-signed Edge
**156.0.4314.50**, Node **22.23.4**, no downloads/installs and no unsafe flags.
This does not qualify production Node 24, native Azure, the source parent, or
the inactive lifecycle recovery prototype.

Each deliberate browser capture retains the exact served asset bytes under
`evidence\raw\served-assets`. Raw CRLF evidence is never normalized. Published
Git assets use canonical LF; publication independently checks Git blobs against
the preserved served bytes allowing only that declared line-ending conversion.

`evidence\verification-summary.json` indexes the actual stages and distinguishes
35 runner checks from 34 leaf checks (one browser parent group).
`evidence\evidence-integrity.json` pins every raw artifact. The post-publication
local report is the single ignored `evidence\local\publication-report.json`;
the authorized State Report records its exact commit/tag for parent review.

## Honest blocked native remainder

`evidence\native-remainder.json` refines **B-S147**, still blocked on **CORE,
DATA, HOST**, an authorized native isolated conformance experiment, actual
injected failures, independent client evidence and original parent acceptance.
This lesson detects every supplied observed injection only, not every possible
real failure or a reliability guarantee.

Only the parent can accept this original A unit once. Tests, repairs, proof and
refinement earn **zero** extra credits. C005-C008/local-harness and their OP150
retry are untouched. Frozen source150/`ebd7433ac143` includes 135 practices only;
no later live accepted lessons are promoted into it.
