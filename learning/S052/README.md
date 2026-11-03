# S052 — New frontend to old API

**Training rehearsal - synthetic data - not a live Azure result**

A-S052 · D-S052 · SC-S052 · frozen Kano S · `worker-A-S052`.
The exact [S052 source](../../README.md#f-n-tier-and-version-compatibility)
requires compatibility while routing propagation still leaves requests on the old
backend. [D-S052](../../.docs/wiki/backlog.md#f-n-tier-and-version-compatibility)
requires new clients to tolerate supported old contracts without silently reporting
success for required unsupported features. This lesson does both, rather than
equating HTTP 200 or a new-only sample with old-contract compatibility.

## Conduct the exercise

Open `index.html` directly in a modern browser. No server, installation, account,
authentication, credentials or Azure subscription is required.

1. Keep the defaults; **Start attempt**, then **Send next request** four times.
   The loaded `frontend-v2` reaches old, new, old, new APIs. The base profile
   (`profileId`, `displayName`) renders on both: **success**, four successful requests.
2. Select **Another attempt**, then optional timeZone. Old responses show it as
   explicitly unavailable; no default is invented. The declared base journey succeeds.
3. Require timeZone. Old `profile.v1` responses still return HTTP 200, but cannot
   satisfy this required journey: **failure**, two successes and two failures.
   Contract-aware handling reports explicit incompatibility. Unsafe status-only
   handling claims success, but the independent verifier rejects both silent claims.
4. Try malformed old responses (missing `displayName`) or observed timeouts:
   required journeys fail. Withheld old observations instead leave two
   **unknown** results and an **unknown** aggregate, not a proven timeout or success.
5. Try all-new routing. It can succeed with timeZone, but old-API coverage is zero;
   this does not demonstrate old-contract compatibility.
6. Check a prediction: its PASS/FAIL is separate from the unchanged user outcome.
   Another attempt retains all completed successes, failures and unknowns.

All four fixed requests finish before aggregate success is established. Failures
take precedence over unknowns, which take precedence over success. Routing is an
explicit effective fixture, not a desired traffic weight or a real propagation test.
There are no retries, latency claims or transport calls.

Configuration locks during an attempt. Exact allowlisted inputs and model-minted,
deep-frozen states reject invalid values and out-of-order actions without advancing.
Eight completed attempts are retained; the ninth is blocked, never silently pruned.
Tab, Enter and Space operate the controls, with announced errors and predictable
focus. **Reset rehearsal — clear history** explicitly restores exact defaults and
clears trace, history, errors and predictions. Page reload also clears memory.
The reset button does not shadow the form's native `reset()` method.

## Focused verification

From the repository root in PowerShell:

```powershell
node --test .\learning\S052\tests\model.test.cjs .\learning\S052\tests\surface.test.cjs .\learning\S052\tests\integrity.test.cjs
node --check .\learning\S052\model.js
node --check .\learning\S052\app.js
node --test .\learning\S052\tests\browser.test.cjs
```

Ordinary verification is **read-only to retained proof**. Browser observations are
written only during deliberate `CAPTURE_BROWSER_EVIDENCE=1` capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S052\tests\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

The capture utility refuses to replace raw records. Each deliberate run retains
its command, timestamps, exact source snapshot, raw compressed stdout/stderr and
DOM observations, including failures. Only a successful browser capture updates
the qualified `evidence\browser.json`.

The BDD feature preceded a loadable conservative stub and **14 genuine
ERR_ASSERTION failures**, with two passing baseline checks. The first RED is
`unknown` versus expected `success`, not missing code, dependencies or tools.
`evidence\red\` retains raw CRLF snapshots with `.snapshot` names, never discovered
as tests. Raw byte hashes preserve CRLF; canonical source comparisons normalize
LF, as Git does. Exact source/contract sections and SC-S052 packet provenance are
retained in `source-contract.json`. Resource-free **IaC N/A** was recorded after
RED and before implementation. Integrity checks qualify the sealed sources,
raw evidence, stage order and original assertion.

Two unsuccessful browser captures remain unqualified and intact: the first tried
dynamic-code evaluation inside CDP, which bypassed that CSP check; the second
encountered Edge's automation wait after a CSP-blocked form submission. The
qualified run checks dynamic code through a real button click in an owned local
test script and probes form submission last. Neither earlier attempt is a pass
or an application failure; their real assertions, observations and cleanup remain
visible. The test-only CSP script is not part of the learner's runtime.

Actual browser checks use only published `testing\browser\isolated.cjs`
(`53c0c0d`), SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, and awaited `finally` close. Existing offline Playwright
1.56.1, installed Microsoft-signed Edge 156 and Node 22.23.4 are test tooling only.
The helper's known unattended-lifecycle limitation remains. No downloads, unsafe
flags, foreground browser leases, abandoned lifecycle prototype, Node 24 production
certification or real protocol proof are claimed.

## Scope and refinement

Only `learning\S052\**` is owned. This fixed four-request lesson is one frozen S
unit with no additional test, plumbing or refinement credit. No useful extra
owned To Do remains; the native B-S052 sibling and D-S052 source parent remain
separate and incomplete, with their original shared/native acceptance gates.
No cloud, IaC, scaffold, identity registration, deployment, packages, framework,
shared/root changes or spending are authorized.

The [Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer)
applies: educational examples are provided “AS IS”; no warranty, Microsoft
endorsement, certification or SLA is implied.
