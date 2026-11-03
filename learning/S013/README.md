# S013 — Concurrency/queue-driven scale-out

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, packages, framework,
credentials, real queue, management calls, resources, identity, deployment, or
expenditure are involved.

## Exact source and portable contract

A-S013 / D-S013 / canonical README S013 / SC-S013. One frozen **S** unit,
`kanoUnit: A-S013`; SOURCE entry gate. The source strategy is:
**Concurrency/queue-driven scale-out: use supported workload metrics to increase
capacity before excessive request accumulation.** D-S013 requires backlog/
concurrency to cause observed capacity changes, original completion deadlines
within a declared envelope, and rejection of unsupported metrics. Its original
prerequisite is **none**. This A lesson does not fulfill the native experiment.

The bundle reuses S012's portable UMD reducer, native DOM, retained-history,
keyboard/reset, strict-CSP, and append-only evidence patterns, without modifying
that closed namespace. Workload-driven scaling and FIFO/deadline behavior are
implemented here, not copied CPU/memory behavior. There are no shared-file edits
or automatic C041 catalog additions; later mounting still needs independent
acceptance and reviewed asset pins.

## Worked exercise and explicit envelope

1. Keep queue depth, batch **12**, concurrency **12**, budget **20 seconds**.
   Enqueue one batch.
2. Advance one five-second window. Queue 12 meets threshold 8: requested workers
   **3**, observed ready workers **2**. Four items complete at 5s; eight remain.
3. Advance again. One further warm-up window has elapsed, so the third worker is
   observed ready. Six items complete at 10s; two remain.
4. Advance again. All **12** complete by **15s**, inside their original 20s budget.
   PASS additionally requires an observed added-worker completion, not just
   increased requested capacity.
5. Archive/reset. Choose concurrency, apply and repeat: **12 / 2 = 6**
   concurrent requests per ready worker triggers that supported teaching metric.
6. Archive/reset. Apply batch **40**, budget **5**; enqueue and advance twice.
   Capacity grows, but six known completions are late and 30 pending items are
   overdue. The verifier is FAIL, not successful scale-out for users.

Each ready worker completes up to **two FIFO items/window**, maximum **four**
workers, with no automatic scale-in or retries. The selected rule uses inclusive
**queue depth ≥8** or **concurrency per observed-ready worker ≥6**. Only the
selected metric drives the rule; requested workers never enter its denominator.
Concurrency is a fixed independent pressure observation, not an additional job
count. It is not decremented by queue service.

Each explicit advance adds five synthetic seconds, observes readiness, samples
pre-service pressure, evaluates the selected rule, then records bounded
completions at that boundary. These discrete steps, thresholds, and rates are
teaching constants, not measured performance, Azure defaults, or metric/adapter
qualification. No wall clock, randomness, background workload, or network runs.

Each batch stores `submittedAt` and immutable
`deadlineAt = submittedAt + deadlineSeconds`. Completion **at** the deadline is
ON_TIME; later completion is LATE. Pending work **past** its deadline is already
overdue. Changing input cannot rewrite earlier deadlines or cancel warm-up.

## Output shapes, failures, and limits

Selectable page-memory JSON has `schemaVersion: 1`, card/packet/mode identifiers,
`state`, `summary`, `archives`, `uiError`, and `effectiveVerdict`.

| Shape | Meaning |
| --- | --- |
| `state.input` | Batch size, concurrent requests, original budget, selected metric, observation condition. |
| `state.capacity` | Requested workers, last-confirmed ready workers, optional warming request. Last-confirmed values are historical during an observation gap. |
| `state.batches` / `state.jobs` | Original input/budget, submission/deadline, FIFO ID, observed completion time/worker, outcome and reason. |
| `state.windows` | Pre-service metric/value/threshold, requested versus observed-ready capacity, rule decision, independent service outcomes, queue after. |
| `state.transitions` / `state.events` | Trigger attribution, request/readiness/failure times, every admitted or refused command and retained input errors. |
| `summary.verification` | NOT_RUN, INCOMPLETE, PASS, FAIL, UNKNOWN, UNSUPPORTED, INVALID or LIMIT, with an explanation. |
| `summary.rule` / `summary.capacity` | Support fixture, selected decision, unknown windows, observed/failed transitions; no user success inferred. |
| `summary.work` / `summary.history` | Submitted, modeled queued, known completed, on-time, late, failed, unknown, overdue, added-worker counts; retained event/window/batch/error totals. |

Item outcomes are QUEUED, ON_TIME, LATE, FAILED or UNKNOWN. Missing completion
has null completion time and worker, not a counted success. Missing workload
metrics do not trigger scaling; independent known service can continue.
Missing effective capacity pauses modeled service and warm-up and leaves current
capacity/queue observations null. Missing data is not zero. Historical unknown
windows and items prevent a clean PASS after recovery.

Provisioning failure preserves requested intent without adding ready capacity.
Worker failure is attributed separately from a deadline miss. All failures and
misses survive healthy recovery. The verifier requires completed bounded work,
observed metric-triggered readiness, added-worker completion, no outstanding
work, no failed transition/worker/deadline, and no unknown observation. Known
failure takes precedence over uncertainty; support/input refusals are separate
from the retained work-impact verdict.

CPU percent is **unsupported by this S013 workload fixture**, not universally
unsupported by Azure. Native metric/adapter/host eligibility is **unqualified**.
Those selections execute no enqueue, clock, service, or capacity changes.
Unknown fields/actions/conditions and malformed values are rejected. Numeric
inputs must be whole numbers: batch 1–40, concurrency 0–120, deadline 5–60s.
Blank, fractional, exponent-string, non-finite, and out-of-range values are invalid.

Use Tab, Enter and Space. Native `form.reset()` is callable: no control is named
or identified `reset`. Reset restores defaults and archives failed/unknown/input
error history. A caught unexpected application failure replaces stale PASS with
ERROR, disables conducting controls, and remains in evidence after archive/reset.
Bounds are 80 commands/run, 120 queued items, 240 retained items/run and eight
archives/page. Refusal never silently prunes earlier proof. Copy selectable JSON
before reload/close: the page does not persist data or claim a durable live run.

## Verification and provenance

With the already-approved **Node.js 22.23.4 test tooling**, from the repository root:

```powershell
node learning\S013\verify.cjs all
```

Individual stages: `green`, `syntax`, `browser`, `integrity`. Normal verification
is read-only to the entire lesson/evidence bundle and asserts byte hashes before
and after. An intentional capture must be explicit and appends numbered records
with exclusive creation; earlier results are not overwritten or deleted:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S013\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

BDD preceded a verified loadable no-op stub and **50 actual ERR_ASSERTION
failures / one pass in 51 tests**. The unchanged 51 behavioral assertions
subsequently pass. Raw stdout/stderr and source hashes are retained separately.
Saved RED source/specification snapshots end in `.txt` and are not automatically
discovered as tests. IaC N/A was recorded after RED and before implementation.
Six executable files pass syntax; 14 focused integrity checks validate lineage,
chronology, raw hashes, browser proof, portable exports, and read-only capture.

Actual headless Edge **156.0.4314.50** with offline Playwright **1.56.1** passes
**23 browser leaf scenarios** (24 Node results including the wrapper).
This is actual DOM, keyboard, deadline, unknown, failure, error, archive/reset,
bounded admission, narrow-layout and enforced-CSP testing of a **synthetic**
lesson, not native Azure evidence. See `evidence.json` and numbered raw records.

The first actual browser attempt passed 21 leaf scenarios and failed two.
Nested select labels included option text, so exact label selection failed;
selects now have separate explicit labels. CSP blocked all tested operations,
but Chromium's blocked form-navigation state made a subsequent Playwright
focus action time out. Form submission is now the last CSP assertion, after
verifying keyboard operation following blocked script/connection attempts.
The failed observations and unmodified raw streams remain in `browser-1.*`;
the passing attempt is separate. Neither failure is mislabeled as behavioral
TDD RED, missing-tool RED, or successful browser proof.

Browser tests exclusively call the published
`testing\browser\isolated.cjs` → `openIsolatedLesson`, awaiting `close()` in
`finally`. Its approved checkout SHA-256 is
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
The helper is verified against **53c0c0d**, not a lifecycle prototype; the Git
blob has LF while the approved Windows checkout has CRLF. No helper is changed.
Each run verifies Authenticode-valid Microsoft-signed installed Edge 156.
There are no installs, downloads, TLS weakening, sandbox disable, or shared
foreground leases. Deliberate error injection and CSP attempts are identified
test actions. Isolated cleanup is awaited; no external request completes.

## Relevant To Do refinement — no extra completion credit

- Parent-owned empirical acceptance of the single A-S013 unit remains pending.
- **B-S013:** readiness false until **CORE, DATA, AKS, C076**, a qualified native
  workload metric/rule/target envelope and separate execution approval exist.
  Then observe actual backlog/concurrency-driven capacity and original completion
  deadlines, retaining unsupported configurations, misses, failures and gaps.
- **D-S013:** original prerequisite **none** does not waive its shared/source
  acceptance gates or native result. The source parent remains incomplete.
- Production Node.js 24 validation, native reliability/statistical evidence and
  cross-host qualification remain unclaimed. No follow-on card is admitted.
  Tests, reruns, documentation, tooling and refinement earn no additional credit.

## Microsoft Open Source Disclaimer

Educational examples and guidance are provided “AS IS”, without warranties or
guarantees except where required by applicable law or binding terms. Validate
security, reliability, compatibility and cost before production use. Microsoft
and Azure references imply no endorsement, sponsorship, certification or support.
Project goals are not Microsoft SLAs. Microsoft and Azure are trademarks of the
Microsoft group of companies. This disclaimer grants no license or redistribution
rights and changes no applicable license, product term, support agreement or
published SLA. See the repository README's full disclaimer.
