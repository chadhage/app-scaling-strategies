# S080 — Partition reassignment and checkpoint transfer

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, framework, package installation or management access is needed.

## Exact source and scope

- README **S080**: “Partition reassignment: Transfer checkpoints and ownership without missing events.”
- Backlog **D-S080**: “Add partition rebalance with checkpoint transfer and concurrent consumer probes.” Acceptance: “Event/checkpoint ownership transfers without missing effects; tolerated delivery duplicates are distinguished from duplicate business effects.” Source dependency: **D-S075**.
- **A-S080**, frozen **S**, packet **SC-S080**, worker **worker-A-S080**: “Reassign a partition; detect missing checkpoint transfer despite successful new ownership.”
- **B-S080** separately requires a native consumer rebalance with checkpoint, event coverage and effect evidence. Neither B-S080 nor D-S080 is completed here.

The exact S080/D-S080/A/B rows, atomic/portable contract, packet rule and outcome policies were read before behavior design and preserved in `evidence\source-contract.json`. Compressed snapshots retain original working bytes (including CRLF) separately from the declared committed Git baseline. Concurrent board counts/links are not frozen; exact acceptance slices must still agree.

## Worked bounded exercise

**Preconditions:** JavaScript enabled; P0 contains E01–E06, effect keys P0:E01–P0:E06. Effects E01–E03 already exist once. Consumer-a epoch 7 hands off to consumer-b epoch 8; the required checkpoint is 3.

1. Keep **Transfer required checkpoint 3**, **Reject old epoch**, **Complete batch**, **Ledger on**. **Reassign → Consume → Verify** yields PASS: consumer-b resumes at E04, three deliveries and six final effects, no missing/duplicate effects.
2. Predict PASS, **Check prediction and retain**, then **New attempt**. Select **Missing checkpoint; replay from 0**. Acquisition still succeeds and the ledger leaves all six effects correct, suppressing three replays. Nevertheless the independent checkpoint gate is FAIL. A good owner stamp or complete effect count does not prove checkpoint transfer.
3. Use **Repeat E04**. Ledger on tolerates one repeated delivery with six effects; ledger off produces a duplicate E04 business effect and FAIL. Repeat applies only if E04 is in the resumed batch.
4. Choose **Checkpoint 5** to skip E04–E05, or **Omit E05** after a correct transfer. Missing events remain failures in the fixed six-event denominator.
5. **Accept old epoch too** injects a concurrent consumer-a E04 attempt. Ownership is FAIL even if the ledger preserves all six effects. Both old and new consumer/epoch observations remain visible.
6. Unavailable checkpoint, delivery or old-probe evidence yields UNKNOWN when no fault is known. Missing checkpoint or accepted old epoch plus unavailable delivery remains FAIL with six unknown effect outcomes. Unknowns never become success.

Missing-checkpoint replay from 0 and ahead-checkpoint skipping are deliberate **synthetic fixture choices**, not claimed broker defaults. All 96 input combinations are deterministic: one partition, six events, at most eight observed deliveries. Counts include three pre-handoff effects; they are not user-journey success rates. Learning prediction correctness is separate from the measured synthetic result and impact.

## Guards, keyboard, history and reset

Only exact four-field enum records and ordered phases are accepted: `idle → reassigned → consumed → verified → checked`. Malformed, repeated and out-of-order actions cannot mutate evidence. No arbitrary broker, partition, consumer, checkpoint, endpoint or script input exists.

Tab, arrows, Enter and Space operate the controls. Focus advances through valid actions; invalid fields or the live alert receive focus. A skip link, visible keyboard focus and scrollable tables support narrow screens.

Checking retains exact inputs, ownership/checkpoint/probe observations, deliveries, effect keys/counts, verdict, prediction and trace. **New attempt** restores input defaults while retaining every failure and unknown. Six retained attempts block more work without eviction. **Reset all local data** clears settings, trace, prediction, errors/invalid markers, history, totals and expanded details, returning focus to Reassign. Reload clears memory. Neither form shadows native `reset()`.

## Verification and provenance

Ordinary focused verification is read-only and does not refresh historical proof:

```powershell
node --test --test-concurrency=1 .\learning\S080\tests\model.test.cjs .\learning\S080\tests\surface.test.cjs .\learning\S080\tests\integrity.test.cjs .\learning\S080\tests\browser.test.cjs
```

Sequence: exact source → BDD → loadable stub → actual assertion RED → IaC N/A → implementation/refactoring → model GREEN → actual isolated DOM/keyboard/error/reset/failure/unknown/CSP checks → focused syntax/integrity GREEN. Original RED: **18 tests, 1 pass, 17 genuine assertion failures**, including `idle` instead of `reassigned`; no missing code, tools or syntax error. Raw output and `.snapshot` inputs are retained outside automatic test discovery.

`tests\capture.cjs` is deliberate append-only provenance capture, not normal verification. Browser proof/screenshots write only with explicitly set **`CAPTURE_BROWSER_EVIDENCE=1`**. Ordinary browser checks write no lesson/proof files; their isolated disposable session is closed with awaited `finally`.

Only published `testing\browser\isolated.cjs`, SHA256 **86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055** (`53c0c0d`), is used. Existing offline Playwright **1.56.1**, Microsoft-signed Edge **156** and Node **22.23.4** are test tooling only. No packages, downloads, unsafe flags, foreground lease or abandoned lifecycle prototype. The shared helper's documented unattended lifecycle limitation remains.

`evidence\content-index.json` seals canonical LF Git text and exact narrowly attributed raw proof bytes. Verification captures are excluded to avoid self-reference. Integrity checks also qualify actual read-only Git clean-filter output via `git hash-object --path`, without staging.

## Limits

IaC **N/A**: resource-free synthetic browser lesson. No actual broker partition/checkpoint/ownership certification, concurrent production consumer test, native Azure result, production Node24 validation, source-parent completion or five-nines claim. No cloud/IaC/scaffold/identity/credentials/deploy/spend. Local reset creates no cleanup obligations.

One frozen S unit only. Tests, browser plumbing, repeated runs and refinement earn no additional credit. Publication is review-pending; parent alone accepts once.
