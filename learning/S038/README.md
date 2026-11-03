# S038 — Tenant authorization continuity

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, subscription, credentials,
package installation, application framework or identity registration is needed.

## Exact source and frozen scope

- Root `README.md`, **S038**: **Tenant authorization continuity:** Preserve
  permissions and isolation after routing changes.
- Backlog **D-S038**, P0: add multi-tenant authorization probes before/after
  routing changes. Tenant permissions and isolation hold on every reachable
  version; forbidden access is explicitly rejected.
- Portable **A-S038**: change destinations for two tenants; select assertions
  that expose cross-tenant access. Gate **SOURCE**, packet **SC-S038**, owner
  **worker-A-S038**, one frozen Kano **S** unit **A-S038**.

Exact source/backlog/A/B rows, the atomic and portable contract, packet rule,
source hashes and claimed card are retained in `evidence\source-contract.json`.
Behavior is derived from these inputs, not the scenario title alone.

## Preconditions, controls and deterministic fixture

Alba and Birch each have one synthetic member and one synthetic record.
Members may read only their own tenant's record. v1 and v2 remain directly
reachable throughout the exercise. Before the change both versions are
isolated and both tenants route to v1. After the change v1 stays isolated.

Choose **v1 or v2 independently for each tenant**, v2's after-change policy,
and which assertions to apply:

1. **Own-read permission:** own reads return synthetic 200.
2. **Foreign-read rejection:** foreign reads return synthetic 403 with no data.
3. **Data tenant:** successful own reads return the requested tenant's data.

v2 policies are **isolated**, **allow-foreign** (missing tenant scope),
**wrong-data** (own-read 200 contains the other tenant's record), **deny-own**
(authorized reads lose permission), and **unobserved** (no response observed).
These are fixed fixture modes, not user-supplied code or actual service faults.
There are no tokens or keys: real authentication is outside this lesson.

Each run probes **2 phases × 2 reachable versions × 2 members × 2 intents =
16 probes**. A trace attributes the phase, version, routed/direct path,
synthetic member, requested tenant, expected status, observed status/data,
applicable assertions and result. Before-change checks include both versions,
not only the current route. An unselected but reachable endpoint still matters.

All applicable selected assertions must pass for a probe to succeed. Omitted
required assertions or missing observations make that probe **unknown**;
an observed selected failure takes precedence. An expected foreign-read 403
is a **successful isolation assertion**, not lost authorized permission.
Counts always sum to 16. Overall **FAILURE** outranks **UNKNOWN**; otherwise
the result is **SUCCESS**, with verifier FAIL / UNVERIFIED / PASS respectively.

Observed authorized v2 route reads count only after-change routed own reads
whose applicable assertions passed. That count is not proof of isolation,
uninterrupted migration or retirement. With both routes on v1, all direct
authorization checks can pass while zero tenants have moved to v2.
User impact is synthetic only; real users are **UNMEASURED**. Cleanup is
**N/A — no resources**.

## Worked exercise

| Action, with all assertions unless noted | Success / failure / unknown | Outcome |
| --- | --- | --- |
| Default: both routes v2, isolated | 16 / 0 / 0 | SUCCESS |
| Allow foreign reads | 14 / 2 / 0 | FAILURE |
| Keep that fault, omit foreign rejection | 8 / 0 / 8 | UNKNOWN |
| Own read returns foreign data | 14 / 2 / 0 | FAILURE |
| Deny authorized own reads | 14 / 2 / 0 | FAILURE |
| v2 responses unobserved | 12 / 0 / 4 | UNKNOWN |

Reset, leave Alba on v1, move Birch to v2, and allow foreign reads. Alba's v2
failure is a **direct** probe; Birch's is **routed**. Both still fail. Correct
the policy and run again: the earlier failure and its full trace remain.

## Guards, history, keyboard and reset

Inputs are exact plain records with fixed enums and boolean assertions; at
least one assertion is required. No coercions, unexpected keys, symbols,
getters, non-enumerable fields or non-plain records are accepted. State guards
recompute every retained trace and reject altered identities, configurations,
results, counts, sparse/oversized arrays and unexpected array properties.
This is consistency checking, not evidence signing.

Inputs and returned history are independent immutable snapshots. **Six runs**
fit; a seventh is rejected without eviction. History is memory-only. Changing
controls hides a stale current result without changing any retained trace.
Reload or explicit reset clears history.

Use the skip link, Tab, native select arrow keys, checkbox Space, and button
Enter. Retained details expand with Enter/Space; the trace scrolls by keyboard.
Errors are announced and focused. Reset restores defaults, clears history,
results and errors, and focuses Alba's destination. Its button is not named
`reset`; the handler uses `HTMLFormElement.prototype.reset.call(form)`.

The page has no inline scripts, handlers or styles. CSP permits local scripts
and styles only and blocks connections, images, frames, objects, workers,
base changes and form submission. Browser tests observe enforcement before
an additional network guard; no external request reaches that guard.

## BDD, TDD and evidence

Sequence: BDD → importable stub → **one real failed count assertion**
(expected 16 successful probes, actual 0) → explicit resource-free IaC
**N/A** → implementation/refactoring → **14 model checks**, including
**140** exhaustive route/policy/nonempty-assertion combinations → syntax,
integrity and **13 actual browser leaf checks** in one parent group.
Repeated checks and groups are not extra acceptance units.

Original BDD, stub and assertion are retained as non-auto-discovered
`.snapshot` files. They can be replayed read-only:

```powershell
node .\learning\S038\tests\replay-red.cjs
```

The replay succeeds only when the archived stub again produces the expected
behavioral assertion failure, not a missing module, tool or syntax failure.
Raw captures retain stdout/stderr bytes, hashes, executable/arguments,
timestamps, exit code and source hashes. `evidence.json` maps the proof.
Owned Git attributes preserve every proof byte, including original line
endings and whitespace in raw command streams. The final deliberate browser
capture qualifies the exact sealed source; earlier observations are retained.
The first publisher check rejected original CRLF proof as trailing whitespace
before any commit or push. Its raw scoped Git failure is retained. The owned
attributes now preserve source bytes as well, recognize CRLF in source diffs,
and exclude raw proof from text diff checks; no root/shared Git setting changed.
The original baseline and seal remain historical; the active manifest names
the append-only `source-hashes-002.json` and `integrity-002.json`.

Normal verification, from the repository root, is **read-only to proof**:

```powershell
node .\learning\S038\verify.cjs
```

It checks the sealed source/proof inventory, runs model/syntax/integrity and
actual browser tests, strips capture from the child, then proves every proof
byte and the integrity inventory stayed unchanged. Tests do not refresh proof.

Only a deliberate append-only browser capture sets the flag:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S038\capture.cjs browser-refresh-004 --test --test-reporter=tap .\learning\S038\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

A refresh adds evidence and therefore intentionally invalidates the historical
seal; it is not ordinary verification or an automatic re-certification.
Do not overwrite historical captures or silently reseal changed proof.

Tests use only existing Node **22.23.4**, offline Playwright **1.56.1** and
Microsoft-signed installed Edge **156.0.4314.50**. The sole qualified browser
helper is published `testing\browser\isolated.cjs` at **53c0c0d**, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
Tests use `openIsolatedLesson` and awaited `close()` in `finally`; no abandoned
lifecycle prototype, integrated foreground lease or unsafe browser flags are
used. The shared helper's documented lifecycle limits still apply.

## Completion boundary

This bundle can demonstrate only the bounded synthetic policy fixture.
No cloud, infrastructure, production24 runtime, real authentication,
registration, credentials, deployments, expenditure, native strategy,
source-parent completion or five-nines reliability is certified.

The authorized publisher supplies the commit and annotated tag externally.
An ignored local `worker-result.json` is operational state, not published
proof. Parent empirical review and acceptance remain pending; this worker
does not award Done credit.

Relevant remaining work is **B-S038**: authorized/forbidden probes against an
approved native target, real identity/data isolation and original D-S038
acceptance gates. It remains genuinely gated on CORE, DATA, HOST and separate
authorization, not a new test/plumbing/refinement unit.

The lesson displays the exact
[Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer)
captured with its source contract. This educational fixture is not a Microsoft
SLA, endorsement or guarantee.
