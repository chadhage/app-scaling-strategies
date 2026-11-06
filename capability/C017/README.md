# C017: reconcile cancellation during an in-flight action, and never fabricate an undo

**Synthetic, local, offline.** One fictional lease (`lease-synthetic-001`, run `synthetic-run-001`, user `user-synthetic-001`) runs ONE action, "stage synthetic capacity": 4 ordered steps of 5 synthetic integer units. A client may cancel it while it is in flight. The server owns the truth and answers every cancel with exactly one of five outcomes, each derived from an append-only journal and never from a claim. This is not the approved Node 24 + Express + Entra service, not a real service, and there is no Azure, cloud, real data or spend; those targets stay unvalidated and unregistered.

## The model in six rules

1. **The journal is the truth.** `journal.cjs` appends hash-chained, versioned lines (C015's canonical digest, flushed on every append). Each step writes an `step-intent` BEFORE it acts and a `step-effect` after. `reconcile.cjs` derives every status, fact and outcome from those entries alone, and `derive()` also checks the journal grammar: a forged decision (for example `COMPENSATED` without compensating entries) makes the whole journal unreadable, which is UNKNOWN, never "cancelled".
2. **Cancel is cooperative.** A cancel received during step *k* waits for that step's boundary (an in-flight step is never reported as cancelled), then the action stops.
3. **Five outcomes, closed.** `CANCELLED_BEFORE_EFFECT` (200, no step had begun), `CANCELLED_PARTIAL` (200, steps 1..k STAND and remain, steps k+1.. were NOT run, nothing was undone), `CANCEL_TOO_LATE` (**409**, the action had completed, all effects stand, the cancel was not effective), `COMPENSATED` (200, only when journaled compensating steps ran in reverse order as their own entries with their own negative effects and 0 units stand; a failed compensation is `CANCELLED_PARTIAL` with `compensation: FAILED` and the failing step named), `CANCEL_UNKNOWN` (**503**, a crash or an unreadable journal; facts are `null` rather than empty lists).
4. **Idempotent and single-decision.** A command key is bound to one canonical command; the same key and command replays the journaled answer (also after a restart and a newer epoch), a different command under it is `IDEMPOTENCY_CONFLICT`. Only one cancel is decided per action (`CANCEL_IN_PROGRESS`, `ALREADY_TERMINAL`).
5. **Attribution.** Every command names lease, run, user, epoch and action; answers carry the server's own. Another lease, run, user or action, and a stale or future epoch, are typed failures (`UNKNOWN_*`, `STALE_EPOCH`, `FUTURE_EPOCH`) with allowed recovery actions (`reinspect`, `correct-closed-command`, `confirm-operator-review`, `stop`, `retry-identical`), `effectClaimed: false` and no journal write.
6. **A restart tells the truth.** Opening a journal appends a `boot`. An action that was live at a crash is `INTERRUPTED` (never cancelled, never completed); an intent without an effect is an UNKNOWN step; a cancel that raced the crash replays as `CANCEL_UNKNOWN`. Reconciliation is an explicit `reconcile` command that settles the facts (`INTERRUPTED_KNOWN`, `INTERRUPTED_UNKNOWN`, `CANCEL_UNKNOWN`) and still never claims cancelled or completed.

## Run it locally

```powershell
node capability\C017\cli.cjs                      # steps paced 1500 ms, journal in capability\C017\state
node capability\C017\cli.cjs --step-delay-ms=300 --hold-in-step=3   # rehearse a crash: step 3 never finishes; kill the process, start again, open the page
```

The CLI rechecks C001 consent (the pattern of C020), binds **only `127.0.0.1` on an automatic port**, prints the exact URL and PID, and accepts no host, port, identity or outcome override (`--dir` must stay inside `capability\C017`). Stop with Ctrl+C, SIGTERM, the exact word `stop` on stdin, or the TTL (`--ttl-ms`, default 10 minutes). The page has Start, Cancel (with an optional compensation checkbox), Reconcile and Refresh: native buttons, so Tab, Enter and Space operate them.

## Verify (the independent reviewer's commands)

```powershell
# RED: the archived tests fail with 16 ERR_ASSERTION against the archived naive engine (cancel always "succeeds"); exit 0 = reproduced
node capability\C017\tests\red-run.cjs replay red-01-naive-cancel-always-succeeds
# L-0121: the same archived RED tests pass UNCHANGED against the final production engine
node capability\C017\tests\red-run.cjs verify-green red-01-naive-cancel-always-succeeds
# RED-02, a defect found after the first GREEN (a legitimate cancel in the crash window between the last effect and the decision made the engine poison its own journal): replays on the retained pre-fix engine, fixed in the final engine
node capability\C017\tests\red-run.cjs replay-fix red-02-completed-undecided-cancel-window
# GREEN: the whole non-browser suite (no heavy slot needed; it binds only loopback port 0 and spawns its own children)
node --test --test-concurrency=1 (Get-ChildItem capability\C017\tests\*.test.cjs).FullName
# Per-file 85/85/85 coverage over the 7 enumerated production files, one L-0004 command per file (heavy run: take a slot)
node capability\C017\tests\coverage.cjs
node --test --experimental-test-coverage --test-coverage-include=capability/C017/engine.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 (Get-ChildItem capability\C017\tests\*.test.cjs).FullName
# Real isolated headless Edge (heavy run: take a slot; leaves evidence untouched without CAPTURE_BROWSER_EVIDENCE)
node capability\C017\tests\browser.cjs
# Import pins recomputed against git at the accepted commits (L-0116; calls git, so not part of the hermetic suite)
node capability\C017\tests\anchor.cjs
```

The RED replay builds a scratch workspace from the byte-identical snapshots in `evidence\red\red-01-naive-cancel-always-succeeds\` (inputs and outputs are SHA-256 pinned in its `manifest.json`); the retained RED is immutable, and any corrected RED needs a NEW directory. `tests\surface.test.cjs` proves the live initial tests are still byte-identical to the RED snapshots.

## Browser observation and its limit

The shared isolated helper (`openIsolatedLoopback`) forwards only same-origin GET/HEAD and **blocks every write**, so the browser can never deliver a POST. `tests\browser.cjs` therefore (a) presses Tab and Enter on the page's own Cancel control and observes that a blocked request is reported as "not delivered … UNKNOWN: nothing is claimed as cancelled, stopped, started or undone", that the server journal holds no cancel, and that the retry would reuse the same key; (b) lets a Node client POST the cancel, compensation, too-late and reconcile commands and observes the page showing exactly the server's statement through GET (the DOM text equals the journal-proven statement); (c) observes a restarted interrupted action and a tampered journal. Five fresh Edge sessions run: in-flight, compensated, too late, interrupted, unreadable. After each, the rendered element ids are unique and the journal numbering is the exact delivered sequence (L-0118). `evidence\browser-observation.json` records the DOM text, Edge's actual version, SHA-256 and Microsoft signature (the suite asserts signature and major 156, never an equality pin on the build). The key of an undelivered cancel is held in page memory so a retry reuses it; a reload loses it, which is safe because the server decides once per action and the reloaded page shows the journal-derived outcome.

## Resource and shutdown bounds (L-0111 to L-0113, L-0120)

One request per connection (`Connection: close`), 2 KB body, 8 KB headers, a 64-connection cap, 5 s request and 30 s idle timeouts, a state view capped at the last 48 journal entries, a 256 KB journal that refuses new actions (`JOURNAL_FULL`, 48 KB reserved so a live action can always be cancelled) instead of becoming unreadable, and every accepted socket tracked so shutdown cannot hang. `resources.test.cjs` and `chunked.test.cjs` attack half-open, partial, never-reading, upgrade and CONNECT sockets, slow headers and bodies, oversize headers, pipelining and endless chunked bodies; `child.test.cjs` runs the real CLI in a child with `--max-old-space-size=48` under floods (heap growth bounded, still responsive, stops on `stop` with stuck sockets open) and kills it mid-action for the restart proof. An abusive client that streams a refused body forever sees its connection reset; a normal refused request receives its typed answer.

## Hostile probes (all covered by tests)

Cancel after completion; double cancel (pending and decided); cancel racing the final step (parallel clients, controllable gates); wrong key, lease, run, user, action, stale and future epoch; replay after a restart; forged outcome, facts, `status` and extra fields; `__proto__` and `constructor` keys; duplicate keys; fractions and `-0`; string booleans; deep nesting; wrong media type; huge, chunked and lying-length bodies; foreign Origin, forged Host and cross-site fetches; tampered, torn, reordered, duplicated and unknown-field journals; a forged decision under a recomputed digest chain; write and flush failures; a second writer; kill during a step and during compensation; 40 seeded random sequences of 60 operations on the engine and 20 seeded sequences of 40 operations on the page (lost request, typed failure, forged answer, server crash and restart over the same journal, retry, refresh, poll, reconcile, a second client), each with a global invariant checked after EVERY operation (append-only journal, raw-journal oracle, one decision per action, INTERRUPTED after a crash, unique contiguous rendered numbering that is a prefix of the server journal, no claim the journal does not prove); and an alphabet-coverage test proving the random sequences reach every state.

## Evidence

`evidence\red\red-01-naive-cancel-always-succeeds\` (the retained RED: 16 of 16 `ERR_ASSERTION`, exit 1, raw stdout, stderr, exit code and input SHA-256 pinned; immutable), `evidence\red\red-02-completed-undecided-cancel-window\` (a second retained RED for a defect the extra hostile review found after the first GREEN: after a crash between the last effect and the decision, a cancel with a NEW key made the engine append an inconsistent second request and poison its own journal; the retained pre-fix engine fails the new test with `JOURNAL_INCONSISTENT`, the final engine passes it), `evidence\green-01\` (216 of 216 pass, exit 0, gzip transcript and the SHA-256 of every input), `evidence\coverage-01\` (one L-0004 run per production file, each over the whole suite: contract.js 100/100/100, reconcile.cjs 99.63/98.73/100, journal.cjs 100/100/100, engine.cjs 100/97.71/100, server.cjs 97.62/95.52/100, cli.cjs 98.25/100/90, page.js 100/97.8/96.67 as lines/branches/functions) and `evidence\browser-observation.json` (real Edge 156.0.4314.58 signed by Microsoft). Raw transcripts are gzip because Node's TAP output carries trailing spaces.

## What this does not claim

No power-loss durability (a regular file is flushed; the directory is not), no tamper-proofing (the chain and grammar detect inconsistency; a consistent rewrite of a whole valid journal is undetectable), no authentication or authorization (the fictional identity is a closed constant), no multi-process or multi-lease operation, no production Node 24 / Express / Entra validation. Journal rotation is an operator action. `--hold-before-step` and `--hold-in-step` are rehearsal flags for crash drills, not features of a service.

## Files

`contract.js` (closed commands, typed failures, wording, claim check; also loaded by the page), `reconcile.cjs` (pure derivation), `journal.cjs`, `engine.cjs`, `server.cjs`, `cli.cjs`, `index.html`, `page.js`, `style.css`, `imports.json` (pins of the accepted C001, C002 and C015 files by commit, tag and SHA-256; C016, C019, C035 and C036 are reimplemented, with the reason), `C017.feature`, `tests\` and `evidence\`.
