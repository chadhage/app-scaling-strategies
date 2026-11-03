# S075 — Consumer scale-out

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, packages or management access are needed.

## Exact source and scope

- README **S075**: “Consumer scale-out: Coordinate partitions, locks, and deduplication as additional workers begin consuming.”
- Backlog **D-S075**: “New capacity processes work without missing events, incorrect ownership, or duplicate business effects.” Source dependency: none.
- **A-S075**, frozen **S**, packet **SC-S075**, worker **worker-A-S075**: “Add consumers; detect duplicate owners and duplicate business effects.”
- Exact S075/D-S075/A/B rows, atomic/portable contract, packet rule and outcome policy were read before behavior design and retained in `evidence\source-contract.json`. Compressed source snapshots preserve original working CRLF and original committed Git bytes separately. Concurrent board counts/links are not frozen; exact acceptance slices must still agree.

## Worked exercise

**Preconditions:** JavaScript enabled; six fixed events E01–E06 across P0–P2; consumer-0 initially owns all partitions at epoch 1. Adding one or two consumers declares one exclusive held epoch-2 lock per partition.

1. Choose **Redelivery: repeat E03**, keeping exclusive locks and the effect-key ledger. **Add consumers → Process fixed batch → Verify result**. Expect PASS: seven deliveries, six effects, one suppressed delivery, no missing event and observed work on the new consumer.
2. Predict PASS, then **Check prediction and retain**. Start a **New attempt**, repeat redelivery with **Ledger off**. Expect FAIL: E03 has two effects. A wrong prediction fails only the learning check, not the measured result.
3. Use **Overlapping old and new owners** with the ledger on. All six effects can exist exactly once, but duplicate partition owners and stale claims still fail. Adding two consumers exposes two overlapping partitions.
4. Try an expired P1 lock or omitted E04: each fails even if other work succeeds. Ownership or delivery evidence unavailable yields UNKNOWN without a known fault. Known duplicate ownership plus unavailable delivery remains FAIL with six unknown event observations.

All **64** input combinations are deterministic. Strict exact-record/enum validation and ordered phases reject malformed, repeated or out-of-order actions without state mutation. No free-text broker, consumer, event, endpoint or lock injection is supported.

The result separates ownership, deliveries/repeats, effects/duplicates/suppression, missing events, new-consumer event coverage, six-event success/failure/unknown attribution, learning verdict and cumulative attempt outcomes. A fixed once-only batch can pass with the ledger off; that is **not** evidence of safety under redelivery. Broken ownership fixtures deliberately permit unsafe synthetic attempts for detection, not real execution controls.

## Keyboard, history and reset

Tab to controls, use arrows for selects, and Enter/Space for buttons. Focus advances to the next valid action. Errors are announced and focus the invalid field or alert. A skip link, visible focus, scrollable tables and narrow-width layout are provided.

Checking retains exact inputs, partition claims, delivery attempts, effect keys, result, prediction and trace. **New attempt** restores input defaults but keeps every prior failure and unknown. Six retained attempts is the limit; nothing is evicted. **Reset all local data** clears inputs, errors, traces, outcomes, predictions, expanded details, history and totals, returning focus to Add consumers. Reload also clears memory. Neither form shadows its native `reset()` method.

## Verification and provenance

From the repository root, ordinary verification is read-only and does **not** update proof:

```powershell
node --test --test-concurrency=1 .\learning\S075\tests\model.test.cjs .\learning\S075\tests\surface.test.cjs .\learning\S075\tests\integrity.test.cjs .\learning\S075\tests\browser.test.cjs
```

Sequence: exact source → BDD → loadable stub → actual RED → explicit IaC N/A → implementation/refactoring → model GREEN → isolated DOM/keyboard/error/reset/failure/CSP checks → focused syntax/integrity GREEN. Original RED had **18 tests: 1 pass, 17 failures, including 6 actual assertion failures**; remaining dependent checks encountered the stub's absent result shape. The decisive assertion was `'idle' !== 'expanded'`, not missing code, tools or a syntax error. Raw outputs and non-auto-discovered `.snapshot` inputs are preserved.

`tests\capture.cjs` deliberately records append-only provenance; it is not normal verification. Browser proof/screenshots write only when explicitly setting **`CAPTURE_BROWSER_EVIDENCE=1`**. Ordinary browser checks write no lesson/proof files; the approved helper's isolated disposable browser session is always closed with an awaited `finally`.

The only browser helper is published `testing\browser\isolated.cjs`, SHA256 **86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055** (`53c0c0d`). Existing offline Playwright **1.56.1**, Microsoft-signed Edge **156**, and Node **22.23.4** are test tooling only. No packages, downloads, unsafe flags, foreground lease or abandoned lifecycle prototype are used. The shared helper's documented unattended lifecycle limitation remains.

`evidence\content-index.json` seals canonical LF hashes for Git text and exact bytes for narrowly attributed raw proof, including original CRLF. Deliberate verification captures are excluded to avoid self-reference. Integrity tests also qualify actual Git clean-filter bytes through read-only `git hash-object --path`, without staging.

## Limits

IaC **N/A**: resource-free synthetic browser lesson. No actual broker, lock, consumer ownership, delivery, deduplication or business-effect certification; no concurrent production consumers, real latency, ordering or durable-checkpoint proof. No cloud/IaC/scaffold/identity/credentials/deployment/spend. No native Azure, production Node24, source-parent completion or five-nines claim. **B-S075 and D-S075 remain incomplete**. One frozen S unit; tests, plumbing and refinement add no credit. Publication remains review-pending; parent alone accepts once.
