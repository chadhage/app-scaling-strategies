# S078 — Two schedulers, one valid executor

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server, account, package installation or cloud access is needed.

## Exact source and scope

- Source `README.md`, S078: **Duplicate schedulers across deployments:** Use suitable ownership leases and fencing to prevent duplicate scheduled work.
- D-S078: Add simultaneous v1/v2 schedulers and ownership-lease/fencing comparison.
- Parent acceptance: **Only the valid owner performs each scheduled effect; duplicate scheduling is detected.**
- A-S078 objective: **Start two schedulers; use lease/fencing evidence to identify the valid executor.**
- Owner `worker-A-S078`; packet `SC-S078`; one frozen S unit; owned namespace `learning\S078\**`.
- The atomic/portable contract, exact source rows and shared outcome rules were read before behavior design. Immutable Git blobs and byte-preserved working snapshots are recorded in `evidence\source-contract.json`.

This is one bounded scheduler occurrence, not consumer scale-out/retirement, message redelivery or generic command retry. No implementation edits are made to shared/root files, dependencies or To Do inventory; authorized orchestration scripts alone maintain workflow metadata. All four configurations serve the same original Kano unit; tests, plumbing and refinement earn no extra credit.

## Operating envelope and actions

Preconditions: two synthetic schedulers, one `JOB-078@6` occurrence, one intended effect and an in-memory lease authority.

1. Choose **Current lease + enforced fencing** or the deliberately unsafe **Cached lease check only**, and an observed/missing v2 receipt.
2. **Start both schedulers.** Both propose the same occurrence. Duplicate scheduling is detected immediately: two proposals, one unique occurrence, one duplicate proposal. v1 checks epoch 7 at tick 4, before expiry at 5, and pauses before applying the effect; v2 waits for ownership.
3. **Expire v1 lease; grant v2 epoch 8.** Tick advances explicitly to 6. The current lease is v2/8, valid until exclusive expiry at 10. v1 still holds stale token 7. A real lease expiry does not magically cancel a paused callback.
4. **Attempt the due effect from both.** Inspect the lease, scheduler and receipt ledgers, not merely which callback ran.
5. Identify **v2** as the valid executor and classify the observed outcome. Wrong answers do not change the result or retained evidence.
6. **New attempt** retains the full lease/proposal/effect/trace record, including failed and uncertain runs. Six completed attempts are allowed. **Reset all state and history** is always available, clears configuration/answers/errors/counters and returns focus to Start. Reload also discards in-memory state.

Tab navigates controls; Enter submits choices; Space activates buttons. Advancing moves focus to the next action. No control is named or identified `reset`, so native `form.reset()` remains callable.

## Measurable assertions

| Protection | v2 receipt | Known effects | Known duplicates | Invalid executor effects | Unresolved effects | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Enforced fencing | Observed | 1 | 0 | 0 | 0 | PASS |
| Cached lease only | Observed | 2 | 1 | 1 | 0 | FAIL |
| Enforced fencing | Missing | 0 | 0 | 0 | 1 | UNKNOWN |
| Cached lease only | Missing | 1 | 0 | 1 | 1 | FAIL, with unresolved work retained |

Every configuration retains two scheduling proposals and one duplicate proposal. The enforced effect boundary checks **current owner, current epoch, fence and the current lease interval**, rejecting stale v1. The unsafe comparison deliberately trusts a previously valid cached lease check, permitting incorrect old work. It is not a recommended implementation.

An unacknowledged effect is not invented as either applied or absent. Known duplicate counts are lower bounds when receipts are missing. A known invalid-owner effect proves failure even when another effect is unresolved. A missing receipt does not erase the observed v2 lease owner.

## BDD, RED and verification

Order: `scheduler-fencing.feature` → loadable `model.js` stub → actual assertion RED (2 pass, 11 assertion failures, no missing code/tools) → `evidence\iac-decision.json` (**N/A**) → implementation/refactoring → focused green/syntax → actual isolated browser checks → integrity/publication.

The original stub, BDD, tests and raw RED output are retained beneath `evidence\raw\red`. Snapshot filenames end in `.snapshot`; normal test discovery cannot execute them. Raw source CRLF and captured process output are protected by this bundle's narrow `.gitattributes`; ordinary source is qualified as canonical Git LF.

From the repository root, normal verification is read-only:

```powershell
node --test --test-concurrency=1 .\learning\S078\tests\behavior.test.cjs .\learning\S078\tests\surface.test.cjs .\learning\S078\tests\provenance.test.cjs .\learning\S078\tests\browser.test.cjs .\learning\S078\tests\integrity.test.cjs
```

Tests use only Node 22.23.4, existing offline Playwright 1.56.1 and installed, previously qualified Microsoft-signed Edge 156.0.4314.50. The browser test checks the published `testing\browser\isolated.cjs` SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`), calls `openIsolatedLesson`, and awaits `close()` in `finally`. It never uses the unqualified lifecycle prototype or the foreground integrated browser.

Historical captures are write-once. `tests\capture.cjs` is deliberate capture tooling, not a discovered test. `CAPTURE_BROWSER_EVIDENCE=1` is permitted only for an intentional first capture; routine reruns leave it unset and never rewrite proof. A refresh needs a separately named evidence destination rather than overwriting this run. Integrity checks cover raw hashes, canonical source, clean-filter identities, and owned committed blobs after publication.

The actual browser checks cover all four outcomes, keyboard/focus, disabled transitions, malformed input alerts, wrong answers, all-phase reset, retained history, six-attempt limit, narrow viewport and enforced CSP probes. The worker-src declaration is present, but file-origin worker restrictions are not claimed as independent CSP proof.

## Limits

No actual scheduler, ownership-lease issuance/renewal, monotonic fencing-token service, atomic effect store, durable receipts, clock skew, failures across processes or execution semantics are certified. The lease service and effect boundary here are deterministic teaching rules. No timers, arbitrary input/load, persistent storage, outbound management calls or credentials.

B-S078 and D-S078 remain incomplete. No native Azure, source-parent, production Node.js 24, unattended browser-lifecycle or five-nines certification. No cloud, IaC, scaffold, identity, deployment, downloads, packages or spending. Cleanup consists of awaited isolated-browser shutdown and explicit in-memory reset; no Azure resources exist. Parent alone performs empirical acceptance and awards at most one S credit.
