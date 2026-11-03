# A-S085 — Two sessions, one destination

Open `index.html` directly in a browser. No server, installation or account is needed.

**Training rehearsal - synthetic data - not a live Azure result**

## Exact source and acceptance

- README **S085**: “Concurrent deployment pipelines: Serialize or conditionally coordinate changes to the same production destination.”
- **D-S085**: two competing promotion sessions against one leased destination. Acceptance: **Locks/conditional epochs serialize or reject conflict; unrelated leases remain unaffected.** Source dependency: D-S081.
- **A-S085**: **Submit competing promotions; only the valid lock/epoch owner may act.** Worker `worker-A-S085`, frozen **S**, single unit `A-S085`, packet `SC-S085`, entry gate `SOURCE`.
- Exact original rows, atomic/portable contract and registry projection are preserved in `evidence\source-contract.json`. Read before behavior design. The A card needs supplied source, not a native lease or completed D-S081.
- Parent-only empirical acceptance remains pending. B-S085 and D-S085 remain incomplete; tests, plumbing and refinement earn no additional credit.

## Worked exercise

Preconditions: JavaScript enabled. Fixed teaching sessions alpha → green-v2 and bravo → amber-v3 share `training-destination`, initially blue-v1 at destination epoch 7. A separate `training-other` lease stays observer / epoch 40 / purple-v4 / zero effects. **Promotions and commands are fixed teaching data, never real deployment operations.**

1. Choose the first lock owner and a contender condition; Start captures immutable inputs.
2. **Submit first promotion**: current owner plus expected epoch 7 applies one effect and advances destination epoch to 8. Its lock remains held.
3. **Submit contender**: inspect both lock ownership and expected destination epoch, plus the independent-lease check.
4. Predict the **contender command outcome**, then **Check prediction and retain**. A correct prediction of FAILURE is a learning success, not a successful promotion.
5. **New attempt** restores defaults and keeps complete history. Six attempts are retained without eviction. **Reset all local data**, or reload, clears inputs, errors, traces, predictions, history and counters.

| Fixed condition | Competing submission | Expected command outcome |
| --- | --- | --- |
| Busy lock | First owner keeps lock; contender presents current epoch 8 | **FAILURE**, `LOCK_CONFLICT`; second effect blocked |
| Stale epoch | Lock transfers to contender; its captured epoch is still 7, current is 8 | **FAILURE**, `STALE_EPOCH`; second effect blocked |
| Serialized | Lock transfers; new owner presents current epoch 8 | **SUCCESS**; exactly one additional effect, epoch 9 |
| Missing owner | Fixed lock transfer occurs, but owner observation is withheld from the contender | **UNKNOWN**, no second effect, never successful promotion or verified conflict rejection |

Both orders work. There are exactly eight combinations, two submissions and at most five trace entries per attempt. Lock acquisition/transfer is an explicit ordered fixture, **not an implementation of concurrent locking**. A separate conditional destination epoch detects a stale promotion even after ownership transfer. No clock, randomness, external service, user-supplied command or actual parallel controller is involved.

The safety verifier is PASS for evidenced valid actions and explicit conflict rejection; missing permission evidence is UNVERIFIED. It never labels UNKNOWN a success. The destination table is the model's fixed state, not permission evidence available to the contender. Every trace checks that the unrelated lease is unchanged. Applied + rejected + unknown equals all submitted commands. Retained totals include every checked attempt and wrong prediction; active, unchecked commands have a separate visible denominator. No user-transition/five-nines metric is claimed.

## Guards, keyboard and limits

Exact plain input records, own data fields, allowlisted values, action arity/order, single submissions/checks and a six-attempt bound are enforced in the model as well as the UI. Extra, inherited, accessor and malformed inputs fail atomically. Snapshot mutation cannot alter internal or retained state.

Use Tab, Enter and Space. A skip link, visible focus, labels, live status and focused validation/errors support keyboard operation. New attempt/reset focuses Start; the sixth retained attempt focuses Reset. No control is named `reset`; the app explicitly calls the native `HTMLFormElement.prototype.reset`.

Restrictive file-based CSP permits only local scripts/styles and blocks inline execution, connections, forms, frames and workers. Rendering uses text, not HTML injection. History is memory-only, **not durable controller state**.

No actual concurrent-controller lock/epoch/promotion certification, native Azure result, production Node.js 24 validation, source-parent completion or five-nines claim. No cloud, IaC, scaffold, identity registration, credentials, deployment, expenditure, package/framework changes, downloads, unsafe flags or foreground browser leases.

## BDD → actual RED → IaC N/A → GREEN

`promotion.feature` preceded the loadable model stub and a genuine behavioral RED: **13 tests, 1 pass, 12 ERR_ASSERTION failures**, no missing code or tools. Original feature, stub and model tests remain non-auto-discovered `.snapshot` files; compressed stdout/stderr preserve raw bytes. The explicit resource-free IaC N/A decision follows RED and precedes implementation.

Read-only focused verification from the repository root:

```powershell
node --test --test-concurrency=1 .\learning\S085\tests\model.test.cjs .\learning\S085\tests\surface.test.cjs .\learning\S085\tests\integrity.test.cjs .\learning\S085\tests\browser.test.cjs
Get-ChildItem .\learning\S085 -Recurse -File | Where-Object Extension -in '.js','.cjs' | ForEach-Object { node --check $_.FullName; if($LASTEXITCODE){throw "Syntax failed: $($_.FullName)"} }
```

Normal verification never rewrites committed proof or screenshots. `CAPTURE_BROWSER_EVIDENCE=1` is deliberately used only for initial capture; capture is append-only and refuses replacement. `tests\capture.cjs` is an explicit provenance utility, not an auto-discovered test.

The actual browser checks use only published `testing\browser\isolated.cjs`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (`53c0c0d`), `openIsolatedLesson`, and awaited `finally` close. Existing offline Playwright **1.56.1**, signed installed Edge **156.0.4314.50** and Node **22.23.4** are tooling, not production24 proof. The abandoned lifecycle prototype is unqualified; the published helper retains documented shutdown limitations.

### Evidence

- `evidence\raw\source`: byte-exact compressed working **CRLF** and canonical Git-source observations, independently hashed. Current relevant acceptance slices are compared with the declared baseline; unrelated board changes do not rewrite provenance.
- `evidence\red`, `evidence\iac-decision.json`, `evidence\tooling.json`: preserved sequence and offline prerequisites.
- `evidence\browser.json`, screenshots: actual DOM/keyboard/error/negative/unknown/history/reset/reload/narrow viewport/CSP observations and awaited cleanup.
- `evidence\content-index.json`: canonical LF Git-text hashes and byte-exact raw evidence, qualified through Git clean filters without writing objects. Narrow owned `.gitattributes` preserves raw snapshots, gzip and images.
- `evidence\verification`: append-only, byte-exact compressed command output and run records, checked separately from the index to avoid self-reference. No normal test enables capture.

Only this one portable lesson is delivered. Native concurrency, real lease isolation and the original source-parent acceptance need their separately approved B-S085 work.
