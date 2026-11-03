# S029 — Flapping readiness

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. This standalone HTML/JavaScript
lesson needs no server, framework, packages, subscription or credentials.

## Exact source and scope

- Root `README.md`, **S029**: “Flapping readiness: Require a suitable stable
  readiness window rather than promoting after one successful response.”
- `.docs\wiki\backlog.md`, **D-S029**: flapping probes and a stable-window
  comparison; fresh consecutive evidence gates promotion, not intermittent success.
- `.docs\wiki\kanban.md`, **A-S029**: replay flapping probes and require a stable
  fresh window rather than a single green sample.
- Portable A-card contract; packet **SC-S029**; entry gate **SOURCE**;
  owner **worker-A-S029**; one frozen Kano **S** unit **A-S029**.

`evidence\source-contract-001.json` retains the exact rows, atomic/portable
contract, admitted card, source hashes and existing-tool provenance. No
title-derived substitute, native evidence or source-parent completion is implied.
IaC is explicitly **N/A** for this resource-free rehearsal.

## Exercise and measurable results

Healthy `ga-v1` and a compatible `candidate-v2` are fixture assumptions.
Six probes occur at ticks **1–6**, one tick apart; none arrive after tick 6.
Select a sequence, **2–4** required consecutive probes, maximum age **2–4**
ticks (inclusive), inspection tick **1–9**, and predicted **HOLD/ALLOW**.
Choose **Check readiness window** to record one checked run.

The guard examines the last N scheduled probes available by the inspection
tick. Every selected probe must succeed and be within the age bound.
Missing or not-yet-observed slots and stale observations are **UNKNOWN**;
fresh failed probes are **FAILURE**. A fresh failure takes precedence over
unknown checks. Counts always sum to N. An overly narrow freshness bound
may therefore hold even an all-green sequence.

| Worked configuration | Required checks: success / failure / unknown | Readiness / guard |
| --- | --- | --- |
| Default flapping `S F S F S S`, N=3, max age=2, tick=6 | 2 / 1 / 0 | FAILURE / HOLD |
| Recovered `F S F S S S`, same bounds, predict ALLOW | 3 / 0 / 0 | SUCCESS / ALLOW |
| Recovered, N=4, max age=3, tick=6 | 3 / 1 / 0 | FAILURE / HOLD |
| Missing `S S S S ? S`, default bounds | 2 / 0 / 1 | UNKNOWN / HOLD |
| Steady `S S S S S S`, N=3, max age=2, tick=9 | 0 / 0 / 3 | UNKNOWN / HOLD |
| Steady, N=3, max age=2, tick=1 | 1 / 0 / 2 | UNKNOWN / HOLD |

The unsafe comparison uses only the last received response, ignoring its age
and previous probes. It is visibly labelled and **never drives admission**.
The default's last green would allow under that comparison but cannot advance
the guarded candidate. Recovery can pass without erasing earlier failures.

Each trace records tick, raw probe, last-observation age, fresh streak, check
counts, readiness and both decisions. Trace decisions are counterfactual at
each tick, not earlier handoffs. At the final selected tick, **ALLOW** permits
exactly **one synthetic admission**; **HOLD** permits zero and retains GA.
There is no timer, randomness, live probing or inferred GA outage.

Answer **PASS/FAIL** reports whether the operator predicted the guard correctly.
A wrong ALLOW answer is FAIL without forcing traffic. Probe checks are not user
journeys; real user impact remains **UNMEASURED**. Neither synthetic admission
nor a passing answer proves a native or uninterrupted migration. These thresholds
are bounded lesson parameters, not universal Azure recommendations.

## State guards, history and keyboard/reset UX

Exact plain-record schemas, integer ranges and listed choices are enforced
without coercion. Extra/missing fields, symbols, accessors, inherited records,
sparse/decorated or oversized history, incompatible versions, invalid run IDs
and corrupted retained configurations are rejected. History stores copied
configurations; all results are deterministically recomputed rather than
trusting injected result fields. This is a consistency guard, not authenticity.

State/results are immutable. Eight runs retain configurations, traces, unknown
results and failed answers; a ninth is rejected **without eviction**. Changing
controls invalidates only the current result. Reset explicitly clears history
and errors, restores defaults and focuses the sequence control. Reload also
clears the in-memory session. Nothing is persisted outside deliberate evidence.

Tab, arrow keys and Enter operate labelled native controls, check/reset buttons
and expandable history. Errors are focused alerts, readiness is live status,
and the skip link and narrow-screen layout are checked in the actual browser.
No control is named/id `reset`; the handler explicitly uses
`HTMLFormElement.prototype.reset.call(form)` to avoid method shadowing.

CSP allows only owned scripts/styles. It denies inline code/handlers, network
connections, frames, objects, workers, forms and base changes. Browser checks
observe each denial through real CSP violation events: **zero external requests**
reach the additional test route guard. No browser security settings are weakened.

## Focused verification and retained proof

From the repository root in PowerShell, with capture **unset**:

```powershell
node .\learning\S029\tests\verify.cjs
```

This runs the model, syntax, integrity and actual isolated browser suites.
It removes capture from the child environment and asserts unchanged bytes
and inventory for `evidence\**` and `evidence.json`. Ordinary verification
is read-only to historical proof.

For a deliberate append-only browser-evidence refresh only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S029\tests\capture.cjs browser --test --test-reporter=tap .\learning\S029\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Sequence: BDD → loadable stub → **18 genuine ERR_ASSERTION failures**, with
2 checks already passing → IaC **N/A** → implementation → **20 green model
checks**, including an independent oracle over all **648 finite configurations**
→ syntax/integrity and actual browser checks. Original BDD, stub and model
tests are retained as non-auto-discovered `.snapshot.txt` files. No missing
module, tool or syntax failure is counted as behavioral RED.

Browser proof has **13 leaf checks plus one parent group**, not 14 separate
features. Raw unmodified stdout/stderr, commands, timestamps, runtime, source
hashes, exit codes, actual observations and cleanup results are retained in
`evidence\`; `evidence.json` identifies the principal records. Scoped attributes
preserve raw proof bytes and recognize Windows CRLF without rewriting them.

The first browser attempt is preserved as **failed**, not overwritten or
reported as a pass. After the deliberate CSP form-denial probe, Playwright
waited for a navigation that Chromium had blocked. The test now explicitly
reloads the same owned local lesson after collecting/asserting CSP denials;
this also verifies reload clears history before checking ordinary operation.
The successful principal browser capture is `browser-002`.

Only existing Node **22.23.4** test tooling, offline Playwright **1.56.1** and
installed Microsoft-signed Edge **156.0.4314.50** are qualified. Browser tests
use published `testing\browser\isolated.cjs` at **53c0c0d**, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
with `openIsolatedLesson` and awaited `close()` in `finally`. Its documented
unattended lifecycle limitation remains; no abandoned prototype is used.

## Relevant To Do and limits

No local lesson To Do remains; tests, refinements and repeated checks earn
no additional Kano unit. The parent alone independently accepts **A-S029**, once.
Native **B-S029** remains unready here: **CORE, DATA, HOST**, qualified target,
safe probe/admission fixtures, access and separate native execution authority
are outstanding. No new card or shared backlog edit is needed for this lesson.

No cloud, IaC, scaffold, identity, deployment, expenditure, package/framework
change or download occurred. This is not native Azure evidence, production
Node.js 24 qualification, B-S029 completion, D-S029/source-parent certification
or a five-nines claim. Session cleanup awaits the isolated browser close;
the explicit reset clears local lesson history.
