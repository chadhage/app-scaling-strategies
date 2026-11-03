# S035 — Login callback during cutover

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, package, framework, cloud
account, identity provider, token, credential or registration is needed.

## Exact source and single-unit contract

- Root `README.md`, **S035**: **Login callback during cutover:** Complete an
  OAuth/OIDC flow started before migration without redirect loops or forced
  reauthentication.
- Backlog **D-S035**: start login on v1 and finish after cutover, with
  callback-path tracing; complete within budget without loops, lost state or
  forced restart. Source-parent dependencies: none.
- Portable **A-S035**: start login before cutover, finish its callback afterward,
  detect loops or lost state. Gate **SOURCE**, packet **SC-S035**, owner
  **worker-A-S035**, one frozen Kano **S** unit **A-S035**.

Exact source rows, the atomic/portable contract, packet rule, admitted claim,
historical source hashes and source commit are retained in
`evidence\source-contract-001.json`. No title-derived alternate strategy is used.

## Model, preconditions and operator controls

One synthetic learner starts on **v1 at 0 ms**. Routing changes to **v2 at
40 ms**. Its callback arrives after the selected **0–1000 ms** delay following
cutover. A compatible callback completes another **20 ms** later with the
original `/training/home` return path. The original login budget is an integer
**100–2000 ms**, starting at **0**, never at cutover or retry. Budget equality
passes; exceeding it fails even if the login completes.

Choose shared versus v1-only correlation/return state, compatible versus
redirect-loop callback, matching versus mismatched synthetic state marker,
complete versus missing callback observations, the budget/delay, and a
SUCCESS/FAILURE/UNKNOWN prediction. Conditions lock while a login is pending.
Use **Start login → Cut over → Deliver callback and check** in that order.

Complete observations first detect v1-only state loss, then reject a mismatched
marker, then evaluate the selected callback path. State loss identifies a
forced restart as needed but **does not execute one**. A loop takes at most
**three 20 ms hops**, then stops without a completed login. These are explicit
fixture rules, not platform or OAuth/OIDC implementation claims.

**SUCCESS** requires original correlation and return path, callback completion
on v2, no loop or forced restart, and elapsed time within the original budget.
An observed state loss, mismatch, loop or budget breach is **FAILURE**.
Missing terminal observations are **UNKNOWN**: callback destination, elapsed
time, completion, matching, return path, redirects and restart requirement are
not fabricated. Known start/cutover events remain in the trace.

There are no timers, redirects, random values, authentication calls, cookies,
real tokens, keys or credentials. All paths, markers, identities and timings
are synthetic. This is a strategy rehearsal, not a secure login implementation.

## Worked exercise and measurable assertions

1. Defaults: shared state, compatible callback, matching marker, complete
   observations, **500 ms budget / 100 ms delay**, predict SUCCESS. The trace
   is **v1 login 0 → v2 cutover 40 → callback 140 → complete 160 ms**.
   One success, no failures or unknowns, no redirect, no forced restart.
2. Select **v1-only** with the same SUCCESS prediction: the result is
   **FAILURE / STATE_LOST**, verifier **FAIL**, restart needed but not executed.
   Predict FAILURE on the next run: verifier **PASS**; both interrupted
   synthetic journeys remain retained.
3. Select shared state and **redirect loop**: exactly three hops, **200 ms**
   elapsed, **FAILURE / REDIRECT_LOOP**. No retry silently restarts the budget.
4. Select a mismatched marker: **FAILURE / STATE_MISMATCH**, with no bypass.
5. Compatible path, matching marker: budget **160** succeeds, **159** fails at
   the same 160 ms even though login completes.
6. Missing observations, predict UNKNOWN: **0 success / 0 failure / 1 unknown**,
   terminal metrics unobserved, verifier PASS. This does not prove continuity.

Verifier PASS/FAIL checks the operator's prediction independently of the
synthetic journey result. **Real user impact remains UNMEASURED**.

## Guards, retained evidence, keyboard and reset

The model rejects coercions, fractional/nonfinite/out-of-range numbers,
negative zero, unknown enums, missing/extra fields, getters, symbols, hidden
fields and nonplain records. State validation rejects malformed identities,
stages, sparse/decorated/oversized arrays and history/configuration/trace/count
forgery by deterministic recomputation. This checks consistency, not signatures
or resistance to an operator rewriting all synthetic history.

Every transition returns deeply frozen independent snapshots. Six runs fit;
a seventh is explicitly rejected without evicting earlier failures. Editing
controls invalidates only the current result. History keeps each configuration,
prediction, outcome and trace until reload or explicit reset.

Use the skip link, Tab, native select arrow keys and Enter. Ordered actions
advance focus. History summaries open with Enter/Space; trace regions are
keyboard-scrollable. Invalid input focuses a visible alert and preserves
history. Reset works during pending or completed login, restores defaults,
clears this lesson's memory and focuses the first control. It calls
`HTMLFormElement.prototype.reset.call(form)`; no control shadows `form.reset`.

CSP allows only local external scripts/styles and blocks inline scripts,
handlers and styles, connections, images, frames, objects, workers, form
submission and base changes. Actual browser probes observe enforcement before
an additional request-abort guard. This is not an OS-level network sandbox.

## Focused verification and raw provenance

From the repository root in PowerShell, with capture unset:

```powershell
node .\learning\S035\tests\verify.cjs
```

This runs **20 model checks** (including a **48-configuration** deterministic
matrix), **3 syntax/surface checks**, **6 integrity checks**, and **14 actual
browser leaves in one parent group**. The parent group is not an extra feature.
The wrapper explicitly removes capture from its child environment and proves
all historical proof files and `evidence.json` unchanged. The direct suite is:

```powershell
node --test --test-concurrency=1 --test-reporter=tap .\learning\S035\tests\callback.test.cjs .\learning\S035\tests\syntax.test.cjs .\learning\S035\tests\integrity.test.cjs .\learning\S035\tests\browser.test.cjs
```

Only a deliberate append-only browser evidence capture uses:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S035\tests\capture.cjs browser --test --test-reporter=tap .\learning\S035\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
node .\learning\S035\tests\capture.cjs seal
```

Sequence: BDD → loadable stub → **20 genuine ERR_ASSERTION failures**, not
missing code/tools → explicit resource-free IaC **N/A** → implementation and
refactoring → **20 green model checks** → syntax, integrity and actual browser
checks. Original BDD, stub and assertions remain non-auto-discovered
`.snapshot.txt` files. Raw stdout/stderr bytes, commands, timestamps, exit
codes, runtime/source hashes, browser observations and awaited cleanup remain
in `evidence\`. The explicit seal inventories current source and historical
proof without modifying any prior proof.

The first browser capture preserves nine passing and five failed leaves, not
a green result. Two harness assumptions were incorrect: file resources need
not appear in Resource Timing, and this Playwright version's fieldset
`isDisabled()` does not measure descendant disabled controls. The corrected
checks inspect loaded script/style DOM, the fieldset's native property and
an actually disabled select. Narrow-viewport and CSP checks now establish
their own journey instead of cascading from a preceding failed check.
Historical failure bytes and their original source hashes are retained.
The second capture retains thirteen passing leaves and one failed stylesheet
inspection: the file origin correctly denies direct `cssRules` access.
The final check measures the applied banner color instead, without weakening
origin or browser security. This prior capture is not reported as green.

The first publication stopped at its scoped whitespace preflight, before any
commit, tag or push. `publication-preflight-001` preserves the reproduced raw
failure. Scoped attributes now preserve every source/proof byte without line
ending conversion; source whitespace checks recognize CRLF, and raw evidence
uses binary diffs so TAP whitespace and original snapshots are not rewritten.
No shared Git configuration or unrelated staging was changed.

Only existing **Node 22.23.4** tooling, offline **Playwright 1.56.1** and
installed Microsoft-signed **Edge 156.0.4314.50** are qualified. Tests use
published `testing\browser\isolated.cjs` at **53c0c0d**, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, and awaited `close()` in `finally`. Its known unattended
lifecycle limitation remains; no abandoned recovery prototype, downloaded
browser, foreground lease, unsafe flag or weakened browser security is used.

## Remaining work, ownership and acceptance

No separate testing, plumbing or refinement unit is created. The relevant
remaining **B-S035** native-proof work is **not ready**: it needs separate
CORE/DATA/HOST gates, an approved qualified host and safe real fixture login,
target access and explicit execution approvals. No cloud/IaC/scaffold/identity/
deployment/spending authorization is inferred. Unrelated To Do is untouched.

Publication is scoped to `learning\S035` via the authorized publisher with an
`[A-S035][S]` evidence label, Copilot coauthor, annotated tag and atomically
verified remote publication. The parent alone independently accepts once.
A-only delivery does not complete D-S035, establish native Azure behavior,
certify production Node.js 24 or demonstrate five-nines reliability.
