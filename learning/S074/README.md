# S074 — Session/cache eviction pressure

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, packages, real authentication or credentials are required.

## Exact source and scope

- README **S074**: “Session/cache eviction pressure: Prevent capacity changes from unexpectedly losing required user state.”
- Backlog **D-S074**: “Add controlled eviction/TTL pressure against session and required-state fixtures.” Exact acceptance: “Eviction effects are visible; required state survives through the approved durable contract or fails explicitly.” D-S031 is its source dependency; this independent lesson supplies fixed externalized state, not completion of that dependency.
- **A-S074**, frozen **S**, packet **SC-S074**, worker **worker-A-S074**: apply session eviction pressure; distinguish acceptable cache misses from lost required state.
- Exact S074, D-S074, A/B rows, atomic/portable contract, packet rule and outcome policy were read before behavior design and retained in `evidence\source-contract.json`. Full raw working CRLF and committed Git-source snapshots are separate. Concurrent board changes do not replace exact acceptance.

## Worked exercise

**Preconditions:** JavaScript enabled; two fixed cache entries. Required synthetic session `synthetic-session-074` must retain revision **3**, cart **synthetic-bolt:2** and step **review**. The optional synthetic catalog tile is recomputable and is never required session state.

1. Keep **Capacity: shrink two slots to zero**, **Approved current record**, and **Recover exact state or fail explicitly**.
2. **Apply pressure**: both cache entries are evicted with visible capacity causes. **Check continuity**: required misses **1**, optional misses **1**, durable recoveries **1**, optional recomputations **1**; every required field matches, so the synthetic outcome is **SUCCESS**.
3. Predict SUCCESS and retain the attempt. A wrong prediction affects only the learning verdict, never the measured journey.
4. Start a new attempt. Choose **TTL: tick 2** and unavailable durable evidence. Only the optional tile expires: required state remains a cache hit, so **SUCCESS** does not certify the unused durable path.
5. At **TTL: tick 4**, equality expires required state too. Current durable state recovers it; missing or stale durable records yield **FAILURE**, an explicit synthetic error and an interrupted journey. Safe rejection is not uninterrupted service.
6. With a required miss, choose **Unsafe comparison: return empty synthetic status 200**. The exact state oracle reports **FAILURE** and lost required state despite the success-shaped status.
7. With recovery and unavailable durable evidence, expect **UNKNOWN**: no complete state is served; neither continuity nor certain loss is invented.

Four pressure presets × four durable fixtures × two policies produce **32 deterministic cases**. TTL is logical, not wall-clock. Capacity uses a fixed least-recently-used order; there is no real cache, eviction policy, load, storage, session service or identity provider.

Strict exact-record enums reject malformed input, unknown fields, accessors and injected choices. Ordered actions reject repeated/out-of-order operations without model mutation. Detached snapshots and nested evidence are frozen. Results separate required/optional misses, optional recomputations, exact durable recoveries, preserved/lost/unverified state, synthetic response status and interruptions.

## Keyboard, history and reset

Use Tab, arrow keys and Enter/Space. Focus advances to the next valid action; validation errors are announced and focus the invalid field or alert. The skip link, visible focus and narrow-layout controls work without a mouse.

A retained attempt includes inputs, eviction causes, inventory, exact required-field comparison, outcome and trace. **New attempt** restores defaults without deleting proof. Six completed attempts are the limit; nothing is silently evicted. **Reset all local data** clears settings, result, errors, traces, predictions, history and totals and focuses Apply pressure. Reload also clears memory. Neither form shadows its native `reset()` method.

## Verification and provenance

From the repository root, ordinary verification is read-only and does **not** refresh historical proof:

```powershell
node --test --test-concurrency=1 .\learning\S074\tests\model.test.cjs .\learning\S074\tests\surface.test.cjs .\learning\S074\tests\integrity.test.cjs .\learning\S074\tests\browser.test.cjs
```

Sequence: BDD → loadable stub → **17 tests: 1 pass, 16 genuine assertion failures** → explicit IaC N/A → implementation/refactoring → model GREEN → actual isolated DOM/keyboard/error/reset/failure/unknown/CSP checks → focused syntax/integrity GREEN. Raw outputs and non-auto-discovered `.snapshot` RED inputs are preserved. The stub failed `idle` versus `pressured`, not because of missing code or tooling.

`tests\capture.cjs` is deliberate append-only evidence capture, not normal verification. Set `CAPTURE_BROWSER_EVIDENCE=1` **only** for intentional browser proof capture; existing observations cannot be overwritten. Normal tests verify owned file bytes remain unchanged. Every opened browser session closes in an awaited `finally`.

The only browser helper is published `testing\browser\isolated.cjs`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`). Existing offline Playwright **1.56.1**, Microsoft-signed Edge **156**, and Node **22.23.4** are test tooling only. No packages, downloads, unsafe flags, foreground lease or abandoned lifecycle prototype are used. The shared helper's documented unattended lifecycle limitation remains.

`evidence\content-index.json` qualifies canonical LF hashes for Git text and exact bytes for narrowly attributed raw evidence, including original CRLF. Deliberate verification captures are excluded to avoid self-referential hashes. Integrity tests also compare actual `git hash-object --path` clean-filter bytes without staging or writes.

## Limits

IaC **N/A**: resource-free synthetic lesson. No actual session eviction/cache/durability, authentication, user-journey, latency, recovery or five-nines certification. No cloud/IaC/scaffold/identity/credentials/deploy/spend; no production Node24 or native Azure proof. **B-S074 and D-S074 remain incomplete**, including their source prerequisites. One frozen S unit; tests, plumbing and refinement add no credit. Publication is review-pending; parent alone accepts once.
