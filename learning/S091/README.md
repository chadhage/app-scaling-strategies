# S091 · Candidate crashes during warm-up

**Training rehearsal - synthetic data - not a live Azure result**

Card **A-S091**, parent **D-S091**, packet **SC-S091**, frozen Kano **S**.
Objective: **Crash a warming candidate; distinguish safe abort from completed migration.**

## Conduct the bounded exercise

Open `index.html` directly in a modern browser. No server, subscription, account, tools, installation or framework is needed.

1. Keep **Crash + honor admission gate** and **Safe abort before exposure**, then **Rehearse and check**. The fictional candidate moves WARMING → CRASHED → blocked admission → ABORTED. Peak exposure and started transitions are zero; three observed old-v1 production journeys stay valid. Safety acceptance and your conclusion pass, but completed migrations remain **zero** and the transition metric says **No transition evidence**.
2. Keep that fixture but claim **Completed migration**. Your conclusion fails; the observed safe abort, routing and earlier ledger are not rewritten.
3. Choose **Crash + ignore gate** and **Interrupted transition / continuity failure**. This unsafe teaching trace exposes three journeys to a crashed candidate. Later synthetic recovery restores old-v1 routing, but the three synthetic 503 interruptions and peak exposure remain counted. The source safety acceptance fails even though your negative-test conclusion passes.
4. Choose **Crash + abort, but production returns a slow 200** and the interruption conclusion. Abort is acknowledged at zero exposure, but a 400 ms old-v1 response exceeds the original 250 ms budget. This is not a successful safe-abort/continuity result. The old-only interruption is counted separately, not manufactured into a candidate migration trial.
5. Choose **Crash + missing routing / journey observations** and **Unknown**. Three commanded transitions are started, but their destinations and outcomes are unknown. Current routing, abort acknowledgement and production continuity are explicitly unverified, never inferred from last-known baseline routing. Unknown started journeys stay in the denominator with no success credit.
6. Choose **No crash + fully ready migration comparison** and **Completed migration**. Only this fixed comparison records all readiness gates before exposure and three successful candidate-v2 epoch-2 journeys. Old-v1 is retained standby, not retired.

Every click independently replays the same fictional baseline: old-v1 epoch 1 at 100%, candidate-v2 epoch 2 at 0% and WARMING, three production journeys, two required candidate instances, session/saved-state preservation, one business effect and a **250 ms original end-to-end budget**. No real clock or lifecycle is being controlled. Gate-bypass instructions, process crashes, readiness, aborts, routing and recovery are **trace data only**.

The finite five-fixture/four-conclusion input contract rejects unknown values, coercion, extra fields and malformed/forged state. All nested results and history are immutable. Six attempts are retained; a seventh is rejected without pruning failures or unknowns. Your conclusion never controls the observed outcome. Counters report attempt outcomes, production journeys and started transitions separately.

Use Tab, select arrow keys, and Enter/Space. **Reset rehearsal** restores defaults, clears errors/history/counters/results and returns focus to the fixture selector. It does not shadow native `form.reset`. History is memory-only; explicit reset or reload clears it. Changing controls retains earlier observations. Errors are visible, announced and focused without optimistic results.

## Exact source acceptance and boundary

The exact README S091 row requires: **“Abort before exposure while production continues serving.”** D-S091 requires visible safe abort before exposure and usable existing production journeys, with original prerequisite **D-S028**. Its source S028 requires explicit timeout abort with intact existing production routing. The portable A-card contract and default SC-S091 A/B packet rule were read before behavior design and preserved with exact committed and raw working snapshots in [source-contract.json](evidence/source-contract.json).

Shared source acceptance still applies: a safe abort is separate from completed migration; old-only successful requests do not demonstrate migration. Actual candidate-version movement and complete client-observed latency, session/state and effect assertions are needed for synthetic success. Failed and unknown started transitions remain counted. An empty sample is no transition evidence; these few correlated synthetic fixtures are not five-nines proof.

This asset has no management calls, process/resource fault actions, credentials, identity, storage, backend, framework, cloud infrastructure, deployment or spend. Enforced CSP denies connections, inline execution, form navigation, objects and frames. The [IaC N/A decision](evidence/iac-decision.json) follows genuine loadable-stub assertion [RED](evidence/red.json), not a missing module, missing tool or failed installation.

## Focused verification and raw provenance

From the repository root in PowerShell, using the existing Node 22 tooling:

```powershell
node --test .\learning\S091\tests\behavior.test.cjs .\learning\S091\tests\surface.test.cjs .\learning\S091\tests\provenance.test.cjs .\learning\S091\tests\integrity.test.cjs
node --test .\learning\S091\tests\browser.test.cjs
```

For the explicit published-source Git check, set `S091_GIT_REV` to the full A-S091 publication SHA before the integrity suite. Without that explicit pin, only that post-publication test is skipped; canonical Git-clean-filter and all raw/source working integrity checks still run. Ordinary verification, including RED snapshot replay and browser reruns, is **read-only**.

The browser test uses only published `testing\browser\isolated.cjs`, source commit `53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`, `openIsolatedLesson`, and awaited `close()` in `finally`. Only the approved offline **Playwright 1.56.1 / installed signed Edge 156 / Node 22** pairing is exercised. No downloads, new packages, unsafe flags, shared foreground browser leases or abandoned lifecycle prototype are used. The helper's documented unattended lifecycle limitation remains; this lesson does not qualify that runner or certify production Node 24.

Author capture is explicit through `tests\capture.cjs`. Only deliberate `CAPTURE_BROWSER_EVIDENCE=1` enables browser evidence writes. Historical snapshots/transcripts under `evidence\raw\` are byte-preserved by narrow owned `.gitattributes`, including original CRLF. RED files end in `.snapshot`, so normal test discovery cannot import the abandoned stub. The content index qualifies other text as **canonical Git LF**, not byte identity with working CRLF; historical raw-working hashes retain capture-time bytes. BDD checks compare current source canonically against the original raw feature and its published LF Git object, so an LF checkout remains verifiable without rewriting CRLF history. The content index excludes only itself and its own integrity transcript to avoid self-reference. Actual command status, stdout/stderr, capture times, pins and snapshots are retained.

Final records: `evidence\bdd.json`, `red.json`, `iac-decision.json`, `focused-003.json`, `syntax-002.json`, `browser.json`, `browser-acceptance.json`, `content-index.json`, `integrity-002.json` and `verification-summary-002.json`. Earlier records and sources are retained: one RED-replay check inherited Node's private V8 reporter instead of TAP; a later actual Git-source assertion exposed an invalid raw-current BDD comparison across CRLF/LF. The corrected child environment and canonical-source relation preserve both genuine failures and all original raw bytes. The first tagged publication remains referenced by `canonical-source-red.json`; both changesets belong to the same single A-S091 S unit. Parent-owned empirical review is independent of worker evidence and publication.

## Relevant To Do refinement — one unit, no extra credit

- **A-S091:** the source-only asset is one S unit; parent empirical review/acceptance remains pending after scoped tagged publication. Additional tests, repeated runs, plumbing and refinement earn **no extra completion credit**.
- **B-S091 is not ready:** native CORE, DATA and HOST gates, an approved target/configuration, safe bounded owned fault/lease and observation/recovery contract, and separate cloud/IaC/scaffold/identity/deploy/spend approvals remain genuine blockers. This synthetic asset proves no real candidate crash, readiness, abort or production continuity.
- **D-S091 remains incomplete:** both required A/B children, original **D-S028**, target evidence and original source/shared acceptance are still required. No new ready card, extra split, native proof or source-parent completion is inferred.

The repository's Microsoft Open Source Disclaimer remains authoritative: educational examples are provided AS IS without warranties, endorsement, certification, support or a service-level guarantee; product names identify the subject only.
