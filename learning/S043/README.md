# S043 - Resume a multipart upload

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a standard browser. A-S043 is one frozen S unit,
parent D-S043, packet SC-S043. It does not complete the source parent or B-S043.

## Conduct the worked exercise

1. Keep **Shared**, **Reconcile**, **Listing available**, **Intact**, 400 ms
   continuation and a 1000 ms original budget. Start accepts parts 1 and 2.
2. Pause, transfer ownership, optionally probe the stale v1 writer, then resume.
   The v2 epoch rejects stale writes and uploads only missing parts 3 and 4.
3. Verify final content: two prior parts preserved, four total uploads, 48 bytes,
   matching actual Web Crypto SHA-256 and original completion at 700/1000 ms.
4. Choose a prediction and check it separately from the synthetic user outcome.
   A correct prediction of failure never turns the failed upload into success.
5. Reset to defaults. Expand history to inspect each run's captured configuration,
   counts, original budget and ordered trace. Reset retains even unfinished runs.

Try **Restart**: six uploads / 72 transmitted bytes and two duplicates fail even
though final bytes/hash are correct. **Instance-local** loses both accepted parts;
reuploading correct bytes does not hide that failure. **Corrupt** changes one byte
without changing length; SHA-256 detects it. A 700 ms continuation meets the
1000 ms deadline exactly; 701 ms fails at 1001 ms. The original clock never resets.

An unavailable candidate listing causes no speculative candidate upload: final
bytes/hash remain unobserved and the result is unknown. A known part loss or
deadline breach still fails when other proof is unavailable. Reset before
verification records an unknown attempt, or a failure if already over budget.

## Guards, keyboard and limits

- Four ordered 12-byte ASCII parts: `S043-part-1\n` through `S043-part-4\n`.
  The original 48-byte SHA-256 is
  `43a0f160cf05a5f0be77de503bc019c24f94a325b0ed84e4b7e60d788fd189e0`.
- Exactly six supported controls; integer continuation 0-10000 ms and original
  budget 100-10000 ms. Invalid choices, extra fields and out-of-order actions are
  non-destructive. Active configuration is captured, locked and not reread.
- Twelve runs / ninety-six actions per page lifetime, four stale probes per run
  and twenty trace entries per run. Reset remains usable at the action cap and
  does not replenish limits. History is memory-only; reload clears it.
- Tab / Shift+Tab traverse controls; arrows select options; Enter / Space activate
  buttons and history summaries. Errors receive focus; reset focuses storage.
  No element shadows the native `form.reset` method.
- Strict CSP denies connections, inline execution/handlers, frames, workers,
  objects and form navigation. Dynamic results are rendered as text.

## Focused verification and provenance

From the repository root, with the existing Node 22.23.4 tooling:

```powershell
node learning\S043\verify.cjs
```

This runs the focused model/surface suite, syntax, integrity and actual isolated
browser checks. It asserts the evidence tree and summary remain byte-identical.
Tests do not rewrite proof. For a deliberate **additional** browser observation:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node learning\S043\tests\browser.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture creates a new numbered observation, never overwriting an old one.
`capture.cjs` separately requires `CAPTURE_TEST_EVIDENCE=1` for producer operations;
do not set it during ordinary verification. Raw stdout/stderr are retained with
byte lengths, SHA-256 and base64. Readable logs normalize only CRLF and trailing
spaces/tabs; `.gitattributes` preserves artifact bytes at checkout.
The first publisher attempt rejected preserved CRLF as trailing whitespace.
The scoped reproduction and original attributes are retained. Owned attributes
now recognize CRLF while keeping blank-at-EOL/EOF and space-before-tab checks
enabled. The explicit producer reseal preserves the original seal as
`evidence\content-hashes-pre-publication.json`; normal verification never reseals.

The BDD preceded a loadable stub, then a real `unknown` versus `success`
`ERR_ASSERTION`, then explicit IaC N/A, then implementation. Exact BDD/stub/test
snapshots use `.snapshot` outside automatic test discovery. Explicit historical
replay is `node --test learning\S043\tests\replay-red.cjs`; exit 1 is expected,
not part of the GREEN suite. `evidence.json` binds all recorded results and limits.
The first failed browser attempt exposed a Playwright fieldset-oracle limitation;
the second found a genuine reset-focus bug. Both observations are preserved.
Exact pre-fix app/assertion snapshots accompany the reset RED; focus is restored
only after controls are re-enabled.

Browser checks use only published `testing\browser\isolated.cjs`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
(`53c0c0d`), `openIsolatedLesson` and awaited `close()` in `finally`. Existing
offline Playwright 1.56.1 and installed Microsoft-signed Edge 156 are explicit.
No packages, browser downloads, unsafe flags, foreground leases or abandoned
lifecycle prototypes are used. The shared helper's documented unattended
lifecycle limitations remain unqualified; a successful run is not CI certification.

## Remaining To Do and evidence boundary

Retain B-S043 / D-S043 as genuinely gated native work: approved CORE, DATA, HOST,
OBJECT and C024, a qualified real multipart fixture/host and explicit execution
approval. Original D-S039 and D-S042 acceptance is not inferred. Do not manufacture
extra test, plumbing or refinement credits for this one lesson.

The shared-store and long-work prerequisites here are declared synthetic
assumptions. No HTTP, real durable storage, Azure, authentication, identity
registration, IaC/scaffold, deployment, expenditure, production Node.js 24 or
five-nines guarantee is claimed. Synthetic owner epochs are not real credentials.
Only the parent independently accepts the published lesson.

Authority: [README S043](../../README.md#e-in-flight-requests-and-long-lived-work),
[D-S043](../../.docs/wiki/backlog.md#e-in-flight-requests-and-long-lived-work),
[portable card contract](../../.docs/wiki/kanban.md#portable-a-card-lesson-contract).
Provided AS IS for education without warranties; no Microsoft endorsement,
certification, support or SLA. See the [repository disclaimer](../../README.md#microsoft-open-source-disclaimer).
