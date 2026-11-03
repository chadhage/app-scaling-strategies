# S048 — Batch job retirement rehearsal

**Training rehearsal - synthetic data - not a live Azure result**

A-S048 · D-S048 · frozen satisfier S · packet SC-S048 · owner `worker-A-S048`.
Open `index.html` directly in a modern browser. No server, installation, account,
credentials, framework or cloud connection is needed. `manifest.json` declares
the portable lesson contract; no central registry or shared file is changed.

## Worked exercise

1. Keep the defaults: **checkpoint then retire**, durable cursor **3**, idempotent
   effects, complete observation, **20 ms** resume delay, original **100 ms** budget.
2. **Start job** commits items 1–3 on the old worker at t=30 ms. Six fixed items
   each require one effect of 10; each processing attempt takes 10 synthetic ms.
   The business-effect ledger is separate from the checkpoint and retains those
   first three effects in every case. Assumptions lock at Start.
3. **Retire active worker** retains a durable cursor and shows
   **resumable-not-complete**, with three items remaining. This checkpoint is
   neither final success nor a completed history entry.
4. **Continue / verify job** uses the retained cursor to process items 4–6.
   Six unique items, one effect per item, total **60**, elapsed **80 ms**, and
   the original **100 ms** budget produce **PASSED / completed-correctly**.
5. Choose the expected verdict and **Check prediction**. Predicting a failure
   correctly passes the learning verifier while job impact remains interrupted.
6. **New attempt (retain history)** clears only current output and unlocks the
   assumptions. Eight completed attempts are retained, including failures and
   unknowns; a ninth is blocked, not evicted. **Reset rehearsal** explicitly
   restores exact defaults, idle state, empty history, trace, prediction and focus.

Every action supports the keyboard. Start → Retire → Continue moves focus forward;
prediction can be checked using Tab and Space. Reset returns focus to Start.
Errors are announced as alerts and focus the invalid field or error. The reset
button never shadows or calls `form.reset`.

## Compare the finite cases

| Change from defaults | Synthetic observation |
| --- | --- |
| Finish work, then retire | Old worker finishes at 60 ms; no checkpoint or replacement is required |
| Durable stale cursor 1, idempotent effects | Replays items 2–3, suppresses duplicate effects; total 60, elapsed 100 ms; passed |
| Durable stale cursor 1, apply every replay | Two duplicate effects, counts `[1,2,2,1,1,1]`, total 80; failed despite six unique items |
| Local-only checkpoint | Checkpoint disappears with retired host; items 4–6 missing, total 30; failed |
| Force retire without checkpoint | No continuation; items 4–6 missing; failed |
| Bug: declare incomplete job complete | False completion detected with three missing items; failed, not trusted as a terminal success |
| Checkpoint evidence unobserved | No invented cursor; final coverage, totals and duplicates unknown |
| Final effect observation unavailable | Effect counts and totals unknown, not zero or successful |
| Default job with budget 80 ms / 79 ms | Inclusive boundary passes at 80; 79 fails; replacement never restarts the original clock |
| Unobserved effects, 100 ms delay, 100 ms budget | Known elapsed 160 ms fails, while effect checks remain unknown |

Checkpoint/replay/delay assumptions are unused when finishing before retirement.
Forced retirement and false completion do not invoke a replacement. A stale
checkpoint replays up to five processing attempts, not an unbounded retry loop.
Each item is checked independently; a total or terminal status alone is not proof
of correct completion.

Unknown proof is never converted into successful work. Known local-checkpoint
loss, false completion or over-budget elapsed time still fails when other proof
is missing. Displayed time is deterministic arithmetic, not browser or Azure
latency. In an unobserved result, it is a known lower bound, not completion proof.

## Bounds and guards

- Fixed six-item synthetic ledger, at most five successor attempts, eight results.
- Resume delay **0–1000 ms**; original job budget **1–2000 ms**. Whole integers
  only. UI rejects blanks, leading zeroes, spaces, exponents and fractional input.
- Model rejects missing/extra/accessor/symbol fields, inherited configurations,
  numeric strings, booleans, null and non-finite/out-of-range values without
  coercion. Returned snapshots are deeply frozen copies of private state.
- Only idle → active → retired → complete is valid. Invalid transitions and
  predictions cannot mutate job state or erase prior outcomes. New attempt is
  allowed only after completion; reset is the explicit way to abandon work.
- Retained records contain assumptions, checks, measurements, trace and the
  separate prediction verifier. Browser history rows retain assumption/result
  summaries. This memory is **not durable** and disappears on page reload.
- Text-only DOM output and local external scripts/styles. Enforced CSP denies
  connections, inline execution, forms, frames, objects and workers.

## Verification and provenance

Use the existing Node.js **22.23.4 test tooling only**:

```powershell
node --test --test-reporter=tap .\learning\S048\tests\model.test.cjs .\learning\S048\tests\surface.test.cjs .\learning\S048\tests\integrity.test.cjs .\learning\S048\tests\browser.test.cjs
node --check .\learning\S048\model.js
node --check .\learning\S048\app.js
node --check .\learning\S048\tests\model.test.cjs
node --check .\learning\S048\tests\surface.test.cjs
node --check .\learning\S048\tests\integrity.test.cjs
node --check .\learning\S048\tests\browser.test.cjs
```

Ordinary verification is **read-only to committed proof**. The browser test
always exercises the real DOM, keyboard, error, reset, failure, unknown, history,
small viewport and enforced CSP paths. It writes observations only when
`CAPTURE_BROWSER_EVIDENCE=1` is deliberately set:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node --test --test-reporter=tap .\learning\S048\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Use only published `testing\browser\isolated.cjs`, publication **53c0c0d**, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
with `openIsolatedLesson` and awaited `close()` in `finally`. Qualification is
limited to existing offline Playwright **1.56.1** and Microsoft-signed Edge
**156.0.4314.50**. No downloads, unsafe flags, foreground lease, prototype,
listener or shared browser. The helper's documented unattended shutdown
limitation remains; this lesson does not certify the abandoned lifecycle work.

- `batch-retirement.feature` preceded the loadable model stub and tests.
- `evidence\source-contract.json` preserves the exact S048/README and D-S048
  rows, A/B cards, atomic/portable contract, packet rule and source-read baseline.
- `evidence\red\run.json`: **24 tests, 1 pass, 23 assertion failures**, exit 1.
  No missing imports, code or tools. Non-auto-discovered `.snapshot` files
  retain original feature, stub and test bytes under binary Git attributes.
- IaC was recorded **N/A after RED and before implementation**: no resources,
  scaffold, identity registration, deployment or spending is authorized.
- `evidence\green\model-001.*` preserves the first **24/24** model green.
  `evidence\browser-run-001.*` preserves actual **8/8** browser/surface checks,
  raw process bytes and a byte-exact browser-test snapshot.
- `evidence\browser.json`, `tooling.json` and `syntax.json` bind actual
  observations, signed-tool qualification and syntax checks. Final focused
  validation and before/after owned-tree digests are recorded in
  `evidence\green\focused-001.json`, not synthesized by ordinary tests.
- Raw stdout/stderr remain verbatim inside gzip with SHA-256 digests. Readable
  TAP strips trailing horizontal whitespace only.
- `evidence\content-hashes.json` has an explicit finite inventory. Text hashes
  normalize CRLF to LF; binary proof is byte-hashed. It excludes itself and
  generated validation receipts to avoid self-reference. Refresh it deliberately
  after an intentional source/capture change; normal tests never refresh proof.

## Scope and remaining work

Only `learning\S048\**` is delivered. Parent empirical acceptance is pending and
earns the single frozen S unit only once. There is no native worker retirement,
durable store, real protocol proof, production Node.js 24 certification,
five-nines claim, authentication, token or key behavior. B-S048 and D-S048 remain
unfulfilled by this portable model and need separately authorized native work.
No cloud, IaC, packages, framework, root or shared changes are included.
