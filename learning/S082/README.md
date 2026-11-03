# S082 — Stale epoch update

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, subscription, package install or credentials are needed.

## Source and acceptance

- README S082: **Reject an old deployment epoch attempting to change current routing or readiness.**
- D-S082: **Stale updates cannot change current routing or readiness; rejected commands are surfaced with evidence.**
- A-S082: Deliver a stale epoch update; it must not alter current routing/readiness.
- One frozen **S** unit, `A-S082`, packet `SC-S082`, owner `worker-A-S082`; technical entry gate `SOURCE`.
- Exact raw source excerpts, original immutable Git blob identities and byte hashes are in `evidence\source-contract.json`. The portable A-card contract and packet/parent rules were read before behavior design.

## Worked exercise

Every attempt starts independently at **epoch 12**, deployment **green-e12**, blue **25%** / green **75%**, both endpoints ready. The one fixed command requests blue 100% / green 0% and/or green not ready. Command epochs are 11 (stale), 12 (matching comparison), or 13 (unowned future comparison).

1. Keep stale epoch 11, both fields, enforced guard and complete after evidence. Deliver the update.
2. Inspect **REJECTED / STALE_EPOCH**, command/current identities and the before/after snapshots. Both protected fields are unchanged; measured changes are **0/2**, verifier **PASS**.
3. Choose PASS and check your interpretation, then start a new independent attempt.
4. Choose the **UNSAFE teaching bypass**. Deliver the stale update: both protected fields change (**2/2**), so the verifier is **FAIL**. Correctly choosing FAIL does not undo the failure.
5. In another attempt choose missing after evidence. The rejection is visible, but unchanged service is not measured: **UNKNOWN**, never a zero-change claim.
6. Compare routing-only/readiness-only commands and matching/future epochs. A matching command may apply its selected change; this is epoch-rule conformance, not a promotion or safe-migration result.

Tab, Shift+Tab, arrows, Enter and Space operate native controls. Result/error announcements are accessible. Controls lock after delivery until interpretation and a new attempt. Six immutable histories are retained without eviction. **Reset lesson and history** explicitly clears all tab memory, restores controls and focuses the epoch selector. Reload also loses the in-memory history. No persistence or actual service is involved.

## BDD → RED → IaC N/A → implementation → verification

`stale-epoch.feature` precedes a loadable model stub. The original six acceptance tests produced **two passes and four actual assertion failures**: stale routing, stale readiness, stale combined changes, and acceptance of a future epoch. The raw output and stub/test/feature snapshots remain in `evidence\red`; `.snapshot` names are not test-discovered. Missing tools/code did not cause RED.

`evidence\iac-decision.json` records **N/A** after RED and before implementation. No infrastructure was generated.

Run focused, read-only checks from the repository root in PowerShell:

```powershell
node --test .\learning\S082\tests\acceptance.test.cjs .\learning\S082\tests\model.test.cjs .\learning\S082\tests\surface.test.cjs .\learning\S082\tests\integrity.test.cjs
node --test .\learning\S082\tests\browser.test.cjs
```

The first command covers all 36 configurations, immutable history, exact guards, source provenance, retained proof and content integrity. The browser command uses the existing offline **Playwright 1.56.1 / signed Edge 156 / Node 22** pair. It uses only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and an awaited `finally` close. No extension foreground browser or shared lease is used.

Normal verification does **not** rewrite evidence. `CAPTURE_BROWSER_EVIDENCE` must be unset. A deliberate initial browser capture used `CAPTURE_BROWSER_EVIDENCE=1`; exclusive writes refuse overwriting retained JSON/screenshots. `tests\capture.cjs` and `tests\seal.cjs --capture` are deliberate producer actions, **not normal verification**. Raw source/RED/output bytes are preserved by narrow owned binary attributes; lesson source integrity is canonical LF and checked against actual published Git blobs after publication. The content index excludes only itself.

The actual browser checks inspect DOM, keyboard delivery, locked controls, errors without state loss, retained PASS/FAIL/UNKNOWN, wrong answers, bounded history, reset, reload and CSP. Deliberate CSP probes use only reserved synthetic `s082.invalid` targets and a defensive abort route; no remote response is accepted. Inline/eval, external script, connect, image, frame, base and form-action restrictions are checked in the real browser. Other declared restrictions, including worker-src, are not independently certified.

The first browser run correctly observed enforced frame-src but failed a test that expected the full frame URL; Edge reports only the cross-origin **origin**. Its raw failure, JSON, screenshot and exact test snapshot remain intact. The corrected exact-origin assertion is qualified by `evidence\browser-acceptance-v2.json` and `evidence\browser-green-v2`; no lesson behavior or CSP was weakened. A separate failed child-PowerShell signature observation is also retained; the existing active PowerShell module subsequently verified the installed Microsoft signature.

## Limits and publication

There are only 36 fixed configurations, one command per attempt, two measured protected fields and six retained attempts. No arbitrary epoch, payload, endpoint, timer, load, cloud call, framework or storage is provided. The issued/frozen state guard rejects cloned/forged API states; it is not a security boundary against arbitrary JavaScript execution.

This does **not** certify actual controller/coordinator epochs, routing/readiness, leases, durable state, concurrency, native Azure behavior, production Node24, real migration or five-nines reliability. B-S082, D-S082 and the original D-S081 prerequisite remain incomplete. The published browser helper has a known unqualified unattended lifecycle; the abandoned recovery prototype is not used.

Publication is restricted to `learning\S082\**` through the authorized publisher: `[A-S082][S]` evidence label, Copilot coauthor, annotated `kanban/A-S082/<12sha>`, atomic main/tag push and remote check. The publisher records the exact implementation commit/tag. The worker reports actual evidence; the parent alone can accept the single S unit. Tests, plumbing and refinement earn no additional credit.
