# S070 — Restored replica promotion

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, packages or management access are needed.

## Exact source and scope

- README **S070**: “Replica restoration and promotion: Verify synchronization through required committed data before promoting restored capacity.”
- Backlog **D-S070**: “Promotion requires the declared committed-data boundary and valid ownership; incomplete restoration cannot appear successful.” Its source dependency is D-S069; this independent portable lesson supplies fixed ownership evidence rather than consuming or completing that native sibling.
- **A-S070**, frozen **S**, packet **SC-S070**, worker **worker-A-S070**: promote a restored replica; reject missing committed boundaries or invalid ownership.
- The exact README, backlog, A/B rows, atomic/portable contract, packet rule and outcome policy were read before behavior design and retained in `evidence\source-contract.json`. Full raw working CRLF and committed Git-source snapshots are preserved separately. The board may change concurrently; its exact acceptance slices must still agree.

## Worked exercise

**Preconditions:** JavaScript enabled; six fixed committed effects at authoritative boundary 6; candidate `restored-s070` needs an epoch-8 grant, with previous epoch-7 writer `original-s070` fenced. All authority, receipts and fences are supplied synthetic fixtures.

1. Keep **Current declaration: 6**, **Complete: receipts 1–6**, and the exclusive candidate grant.
2. **Stage**, **Verify**, then **Promote restored capacity**. Expect synchronization PASS, ownership PASS, one effective synthetic writer and six preserved effects.
3. Predict **PASS**, then check and retain the attempt. A wrong prediction fails only the learning check, not the measured promotion result.
4. Start a new attempt. Choose **Interior gap**. Maximum receipt is 6, but contiguous receipt boundary is 3 and receipt 4 is missing: promotion must **FAIL** with no restored writer activated.
5. Try missing/stale declarations, a still-active previous writer, stale grant or wrong-target grant: each rejects. Choose unavailable receipt/grant evidence with no known failing check: **UNKNOWN**, not success. Known failure takes precedence over unavailable evidence.

All 60 fixed input combinations are deterministic. Strict enum/record validation and ordered state transitions reject malformed, repeated or out-of-order actions without state mutation. No free-text endpoint, epoch or receipt injection is supported.

Results separate data synchronization, ownership, promotion outcome, preserved effects, potential/effective writers, learning verdict and cumulative success/failure/unknown decisions. A safe rejection or an original reference journal retaining data is **not** completed promotion or proof of uninterrupted service.

## Keyboard, history and reset

Tab to controls; select with arrows and activate buttons with Enter/Space. Focus advances to the next valid action. Errors are announced and focus the invalid field or alert. The skip link and visible focus work at narrow widths.

A checked attempt retains its inputs, exact receipts, verification, decision and trace. **New attempt** restores input defaults without deleting history. Six completed attempts are the limit; no silent eviction. **Reset all local data** clears inputs, errors, traces, results, predictions and history, restoring focus to Stage. Reload also clears memory. Forms retain their native `reset()` method.

## Verification and provenance

From the repository root, ordinary verification is read-only and does **not** update proof:

```powershell
node --test --test-concurrency=1 .\learning\S070\tests\model.test.cjs .\learning\S070\tests\surface.test.cjs .\learning\S070\tests\integrity.test.cjs .\learning\S070\tests\browser.test.cjs
```

The sequence was BDD → loadable stub → **16 tests: 1 pass, 15 actual assertion failures** → explicit IaC N/A → implementation → model GREEN → actual isolated DOM checks → syntax/integrity and focused GREEN. Raw outputs and non-auto-discovered `.snapshot` RED inputs are retained; the stub failed `'idle' !== 'staged'`, not missing code or tools.

`tests\capture.cjs` is deliberate append-only evidence capture, not normal verification. Browser proof writes only with an explicitly set `CAPTURE_BROWSER_EVIDENCE=1`; existing proof cannot be overwritten. Normal browser tests create only the approved helper's owned disposable session, always `await session.close()` in `finally`.

The only browser helper is published `testing\browser\isolated.cjs`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`). Existing offline Playwright **1.56.1**, Microsoft-signed Edge **156**, and Node **22.23.4** are test tooling only. No packages, browser downloads, unsafe flags, foreground lease or abandoned lifecycle prototype are used. The shared helper's documented unattended lifecycle limitation remains.

`evidence\content-index.json` qualifies canonical LF hashes for Git text and exact bytes for narrowly attributed raw evidence, including original CRLF. Deliberate verification captures are excluded to avoid self-referential hashes. Integrity checks also use `git hash-object --path` to verify actual clean-filter/Git-source bytes without staging or writes.

## Limits

IaC **N/A**: resource-free synthetic lesson. No actual database restoration, synchronization, replication, promotion, durable ownership, fencing, concurrent writers, real users, latency or recovery certification. No cloud calls, IaC/scaffold/identity/credentials/deployment/spend. No native Azure, production Node24, source-parent completion or five-nines claim. **B-S070 and D-S070 remain incomplete**. One frozen S unit; testing, plumbing and refinement add no credit. Publication is review-pending; parent alone accepts once.
