# C024 · Bounded synthetic multipart fixture

Open `index.html` directly in a browser. No server, package installation or build is needed. Use **Start synthetic upload**, select a part, and use Tab/Enter to accept, pause/resume and complete. Accepting an identical part again demonstrates duplicate suppression; **Probe conflicting bytes** and the unknown-ID choice show explicit failures.

Exactly 256 synthetic bytes follow `(index * 37 + 11) % 256`, split into four named 64-byte parts. Arrival order is inspectable and may vary. Completion requires all four accepted IDs **once, in manifest order**. Actual Web Crypto SHA-256 over the actual assembled bytes must match both the pinned fixture hash and the explicitly entered expected hash. The displayed plan hash is **not** an observed content hash. No missing or failed digest defaults to success.

This is **one frozen-S C024 unit under H005**: an in-memory local multipart/chunk *fixture*, not HTTP multipart, Azure Blob, a database, durable storage, real-user file upload or native platform proof. There is no network, server, framework, storage API or hidden persistence. Pause/resume observes the same retained JavaScript object only. New fixtures are isolated; reload/reset discards memory. A reset during asynchronous hashing cannot publish the discarded fixture's result.

## Reused entry and version lineage

`manifest.json` pins accepted C020 commit `2dc471daab3ffa202d83aba2df443e280cad3656`, its annotated tag and exact source hashes. The page and Node module **import the unchanged C020 `contract.js`**, including `synthetic-001`, `getProfile/1`, synthetic catalog revision and the local v2 version/deployment labels. Integration tests call the actual unchanged `getProfileV1`/`getProfileV2` APIs. No C020 implementation is copied or modified.

`C024-r1`, fixture version `1.0.0` and `C024-memory-r1` are immutable **local source labels**, not cloud deployment observations, signed receipts or authenticated identities. Returned observations/receipts are frozen; accepted bytes and completed reads are independent copies. Unknown/cloned handles, caller stamp overrides, unknown IDs, wrong bytes, conflicting duplicates, incomplete/duplicate/wrong completion order and invalid hashes fail explicitly.

## Verify without changing proof

From the repository root, using the existing **Node 22** test tooling:

```powershell
node --test capability\C024\tests\upload.test.cjs capability\C024\tests\guards.test.cjs capability\C024\tests\surface.test.cjs capability\C024\tests\integrity.test.cjs
node capability\C024\tests\syntax.cjs
node capability\C024\tests\browser.cjs
node capability\C024\tests\integrity.cjs
```

The browser check uses **only** published `testing\browser\isolated.cjs` SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`), `openIsolatedLesson`, existing offline Playwright **1.56.1**, and the installed signed Edge **156**. It always awaits `close()` in `finally`. There is no foreground lease, download, unsafe browser flag, lifecycle prototype, helper edit or alternate launcher.

Ordinary browser verification writes **nothing** to committed evidence, including screenshots. Intentional capture requires `CAPTURE_BROWSER_EVIDENCE=1`; existing records are not deleted or overwritten. A later refresh must also set a distinct `C024_BROWSER_EVIDENCE_LABEL` (letters/digits/hyphens). The first capture uses `browser-acceptance.json`; refresh records retain their own names.

`evidence.json` links the actual BDD → loadable stub → five behavioral assertion failures → IaC N/A → implementation → focused green/syntax/integrity → actual DOM/keyboard/error/reset/hash/completion-failure/CSP sequence. Explicit `tests\record.cjs <stage> <Node arguments...>` preserves real exit codes, runtime, commands, timestamps, source hashes and lossless raw gzip output without whitespace rewriting.

Reproduce the original RED without editing production:

```powershell
$env:C024_TEST_SUBJECT = (Resolve-Path .\capability\C024\tests\retained-stub.cjs).Path
try { node --test capability\C024\evidence\red\upload.behavior.snapshot.cjs }
finally { Remove-Item Env:\C024_TEST_SUBJECT }
```

Expect five `AssertionError` failures, not load/syntax errors. The test-only loader evaluates the byte-identical retained stub with Node's public `createRequire` at its original module-relative import base; neither the stub, C020, nor production is rewritten. Only the historical test honors that variable. Retained RED sources use non-discovered `.snapshot.cjs` / `.stub.cjs` names, outside `tests`; ordinary `node --test` does not run them.

The exact owned-file inventory includes sources, retained RED, every execution record and screenshot, omitting only its own `evidence\integrity.json` to avoid a self-hash. `tests\integrity.cjs` is read-only by default; `--capture` explicitly refreshes that inventory after intentional proof additions. It never deletes historical records.

## Remaining original gates (no extra credit)

- **H005 remains incomplete**: its broader tier/auth/session/database/cache/queue/worker work stays with the original cards; C024 is not a replacement parent.
- **B-S043 stays To Do** behind CORE, DATA, HOST, OBJECT and a qualified/authorized native target. This bounded fixture cannot satisfy real accepted network parts, durable handoff, bytes/completion budgets or native object storage.
- IaC is **N/A**. No scaffold, Azure provisioning, identity registration, deployment or spending is authorized. Approved production design remains Node 24 / Express / App Service Linux; **production Node 24 is unvalidated**. Current evidence records Node 22.23.4 as local tooling only.
- Publication is scoped to `capability\C024\**`, with parent-only independent acceptance. No shared namespace or source inventory is edited.
