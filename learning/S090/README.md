# A-S090 · Retirement waits for every dependency

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, package installation, account,
framework or network connection is required. This is one frozen S unit in
SC-S090, implementing the portable A-S090 objective:
**Attempt early retirement; unresolved users/work/retention must reject it.**

## Exact source and worked exercise

The exact [S090 source](..\..\README.md#i-state-machine-and-orchestration-correctness)
requires rejection while traffic, work, state ownership or rollback requirements
depend on the deployment. D-S090 requires guarded rejection while users, work
or ownership remain; rejection is not a completed migration. D-S007 is the source
dependency, not a native prerequisite for this standalone lesson.

1. Start **All dependencies remain**. The fixed synthetic-old-v1 inventory has
   one old-admission dependency, two pinned users, two pending work items, one
   state owner and a rollback deadline at synthetic tick 2.
2. **Attempt retirement** immediately. Outcome **FAILURE**, decision
   **REJECTED**, safety verifier **PASS**: all five blockers are visible, and
   old capacity remains available in the teaching trace. No user interruption
   was injected, and no completed migration is claimed.
3. Stop new admissions; complete pinned users; complete work; transfer
   ownership. Attempt again: rollback retention still blocks retirement.
4. Advance one tick and attempt again: the deadline still blocks. Advance the
   second tick and attempt: **SUCCESS / SIMULATED_RETIRED**. Only teaching-trace
   data changes. Earlier failed attempts still count.
5. Predict the latest measured result. A wrong prediction is visible and does
   not change the denominator. Archive the rehearsal and choose **Inventory
   observations missing**: retirement is **UNKNOWN / HELD_UNVERIFIED**, never
   success. The named synthetic observation clears only unknown fields.
6. **Known work plus missing observations** demonstrates that a known failure
   dominates uncertainty without concealing the unknown fields. The five
   dependency-only fixtures independently exercise every gate.

The seven action tokens and nine fixtures are strict allowlists. Stop admission
before draining users; finish observed work before ownership transfer. Unknown
counts are not coerced to zero. Repeated, idle, retired, malformed and
out-of-order commands reject without altering state, counters or trace.

## Bounds, retained evidence and keyboard UX

At most four rehearsals, six retirement attempts per rehearsal, fourteen trace
events per rehearsal and two ticks are allowed. Bounds reject rather than
silently evicting observations. Full current and archived traces are inspectable
through the details controls. Totals count **retirement attempts**, not
successfully migrated users, native cleanup or independent reliability trials.

Use Tab, Enter and Space. Every control has a label; focus is visible. Invalid
submissions show and focus an alert while marking invalid inputs. Explicit reset
clears current data, history, counters, predictions, errors and expanded details,
restores select defaults and focuses the fixture. No form control shadows native
`form.reset()`. Reload intentionally starts a new memory-only lesson.

CSP permits local scripts/styles only and denies inline execution, connections,
frames, workers, objects, base changes and form navigation. The theme script runs
before lesson code; CSS uses the Clawpilot light/dark tokens.

## Verification and provenance

From the repository root, normal verification is **read-only**:

```powershell
node --test --test-concurrency=1 .\learning\S090\tests\model.test.cjs .\learning\S090\tests\surface.test.cjs .\learning\S090\tests\integrity.test.cjs .\learning\S090\tests\browser.test.cjs
node --check .\learning\S090\model.js
node --check .\learning\S090\app.js
```

The real-browser test asserts the owned bytes are unchanged. It uses only the
published `testing\browser\isolated.cjs` SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
from `53c0c0d`, `openIsolatedLesson`, and an awaited `finally` close. Existing
offline Playwright 1.56.1, Microsoft-signed headless Edge 156.0.4314.50 and
Node 22.23.4 are test tooling only. The abandoned lifecycle prototype is not
qualified; these bounded checks do not qualify the helper as unattended CI.

Evidence capture is deliberately separate and append-only. Only an explicitly
chosen `CAPTURE_BROWSER_EVIDENCE=1` invocation writes browser observations and
screenshots; do not set it for routine verification. `tests\capture.cjs` is an
explicit stage recorder, never an auto-discovered test. Existing evidence cannot
be overwritten. RED code ends in `.snapshot` and is not auto-discovered.

`evidence\source-contract.json` binds exact S090, D-S090, D-S007, A/B-card,
portable, atomic, packet, lifecycle and outcome acceptance to an immutable Git
baseline. Compressed snapshots preserve original working CRLF and Git-source LF
bytes separately. Current exact acceptance slices must still agree, while
concurrent board counts and links may change. `evidence\content-index.json`
qualifies canonical Git-source text and exact raw proof through narrow owned
`.gitattributes`, including read-only clean-filter checks.

The evidence sequence is BDD → loadable stub → actual assertion RED → IaC N/A →
implementation/refactor → focused model/syntax/integrity/browser green. The
original RED assertions and raw stdout/stderr remain preserved. The worker
publishes one scoped annotated-tagged unit and reports it; only the parent can
accept it once. Tests, provenance, plumbing and refinements earn no extra credit.

## Limits and incomplete native remainder

All clients, identities, inventory and results are synthetic. Retirement,
draining, ownership transfer and retention are teaching-trace data, **never real
resource/file/shell operations**. No cloud calls, credentials, infrastructure,
scaffolding, packages, deployment, spend or foreground browser leases are used.
B-S090, D-S007, D-S090 and original source-demo acceptance remain incomplete:
they need separately approved native target, controlled observations and actual
drain/retention/retirement evidence. No native, production Node.js 24, framework,
retirement, source-parent or five-nines certification is claimed.
